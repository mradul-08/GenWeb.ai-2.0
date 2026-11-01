// Shared test setup: in-memory MongoDB replica set (transactions need one),
// test secrets, a local Firebase signing key and a fake Razorpay client.
// Nothing here touches real services or the .env file.
import crypto from "crypto"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.JWT_SECRET              = "test-jwt-secret"
process.env.RAZORPAY_KEY_ID         = "rzp_test_key"
process.env.RAZORPAY_KEY_SECRET     = "rzp_test_secret"
process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret"
process.env.FIREBASE_PROJECT_ID     = "genweb-test"
process.env.SERVER_URL              = "http://localhost:3002"
process.env.APP_ENV                 = "test"
delete process.env.ALLOW_REMOTE_DB

const { default: app }          = await import("../app.js")
const { ensureIndexes }         = await import("../config/db.js")
const { assertSafeDatabaseTarget } = await import("../config/dbGuard.js")
const { setCertsForTests }      = await import("../utils/verifyFirebaseToken.js")
const { setRazorpayClient }     = await import("../config/razorpay.js")
const { resetRateLimits }       = await import("../middlewares/rateLimit.js")
const { default: User }         = await import("../models/user.model.js")

export { app, resetRateLimits }

let replSet

export async function startDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } })
  // Tests must only ever reach the in-memory server (APP_ENV=test → local hosts only).
  assertSafeDatabaseTarget(replSet.getUri())
  await mongoose.connect(replSet.getUri())
  await ensureIndexes()
}

export async function stopDb() {
  await mongoose.disconnect()
  await replSet?.stop()
}

export async function clearDb() {
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({})
  resetRateLimits()
}

// ── Firebase ──────────────────────────────────────────────────────────────────
const firebaseKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const otherKey    = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const KID = "test-kid"
setCertsForTests({ [KID]: firebaseKey.publicKey.export({ type: "spki", format: "pem" }) })

export function firebaseToken(claims = {}, { key = firebaseKey.privateKey, audience = "genweb-test", expiresIn = "1h" } = {}) {
  const { sub = "uid-1", ...rest } = claims
  return jwt.sign(
    { email: "user@example.com", email_verified: true, name: "Test User", ...rest },
    key,
    { algorithm: "RS256", keyid: KID, audience, issuer: `https://securetoken.google.com/${audience}`, subject: sub, expiresIn }
  )
}
export const wrongFirebaseKey = otherKey.privateKey

// ── Sessions ──────────────────────────────────────────────────────────────────
export function sessionCookie(user, { version = user.tokenVersion ?? 0, omitVersion = false } = {}) {
  const payload = omitVersion ? { id: user._id } : { id: user._id, v: version }
  return `token=${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" })}`
}

// A user as v1 would have created it: no ledger rows, no firebaseUid.
export async function legacyUser(fields = {}) {
  return User.create({ name: "Legacy", email: `legacy-${crypto.randomUUID()}@example.com`, credits: 100, ...fields })
}

// ── Razorpay ──────────────────────────────────────────────────────────────────
export function fakeRazorpay() {
  const orders = new Map()
  let n = 0
  const client = {
    orders: {
      async create({ amount, currency, notes }) {
        const order = { id: `order_${++n}`, amount, currency, notes, status: "created" }
        orders.set(order.id, order)
        return { ...order }
      },
      async fetch(id) {
        const o = orders.get(id)
        if (!o) throw new Error("not found")
        return structuredClone(o)
      },
    },
  }
  setRazorpayClient(client)
  return {
    orders,
    markPaid: (id) => { orders.get(id).status = "paid" },
  }
}

export const checkoutSignature = (orderId, paymentId) =>
  crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex")

export const webhookSignature = (body, secret = process.env.RAZORPAY_WEBHOOK_SECRET) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex")

// ── AI providers ──────────────────────────────────────────────────────────────
// Replaces global fetch for AI provider hosts only. handler receives
// { provider, model, body } and returns { status, json } (or throws to simulate
// a network error). Returns a restore function and the list of calls made.
const PROVIDER_HOSTS = {
  "api.groq.com": "groq", "api.mistral.ai": "mistral", "open.bigmodel.cn": "zhipu",
  "api.cerebras.ai": "cerebras", "api.sambanova.ai": "sambanova", "openrouter.ai": "openrouter",
  "api.cloudflare.com": "cloudflare",
}
export function stubAiFetch(handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url))
    const provider = PROVIDER_HOSTS[u.host]
    if (!provider) return original(url, init)
    const body = init.body ? JSON.parse(init.body) : {}
    const model = provider === "cloudflare" ? u.pathname.split("/ai/run/")[1] : body.model
    const credential = (init.headers?.Authorization || "").replace("Bearer ", "")
    const account = provider === "cloudflare" ? u.pathname.split("/accounts/")[1]?.split("/")[0] : undefined
    calls.push({ provider, model, credential, account })
    const r = await handler({ provider, model, body, credential, account })
    return new Response(typeof r.text === "string" ? r.text : JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers || {}) } })
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

export const chatOk = (content, usage = { prompt_tokens: 1200, completion_tokens: 3400 }) =>
  ({ status: 200, json: { choices: [{ message: { content } }], usage } })
// Cloudflare Workers AI wraps the OpenAI-style body in "result".
export const cfOk = (content, usage = { prompt_tokens: 1200, completion_tokens: 3400 }) =>
  ({ status: 200, json: { success: true, result: { choices: [{ message: { content } }], usage } } })

// setAiKeys(["groq", "zhipu"]) → one key each; setAiKeys({ groq: 2, cloudflare: 2 }) → several.
export function setAiKeys(providers) {
  for (const k of Object.keys(process.env)) if (/^(GROQ|MISTRAL|ZHIPU|CEREBRAS|SAMBANOVA|OPENROUTER)_API_KEY_|^CLOUDFLARE_(API_KEY|ACCOUNT_ID)_/.test(k)) delete process.env[k]
  const counts = Array.isArray(providers) ? Object.fromEntries(providers.map(p => [p, 1])) : providers
  for (const [p, n] of Object.entries(counts)) {
    for (let i = 1; i <= n; i++) {
      if (p === "cloudflare") { process.env[`CLOUDFLARE_API_KEY_${i}`] = `cf-test-token-${i}`; process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`] = `acct${i}` }
      else process.env[`${p.toUpperCase()}_API_KEY_${i}`] = `${p}-test-key-00000${i}`
    }
  }
}

// A complete page that passes generation validation.
export const VALID_PAGE = `<!DOCTYPE html><html><head><title>Crumb &amp; Co</title><style>:root{--primary:#b5651d;--bg:#fffaf0}body{font-family:Lato;background:var(--bg)}${".x{margin:0}".repeat(150)}</style></head><body>
<nav class="navbar"><a href="#hero">Home</a></nav><section id="hero"><h1>Crumb &amp; Co</h1><p>Fresh bread daily.</p></section>
<section id="menu"><h2>Menu</h2></section><footer><p>© Crumb &amp; Co</p></footer><script>console.log('ok')</script></body></html>`
