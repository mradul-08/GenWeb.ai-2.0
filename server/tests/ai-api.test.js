// AI pipeline through the HTTP API with stubbed providers: strategies,
// caching, repair, capacity exhaustion, edit modes, quotas and admin.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys, VALID_PAGE } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache, updateAiConfig } from "../ai/config.js"
import { AiCall, AiRequest } from "../models/ai.models.js"
import { AiCounter } from "../ai/quota.js"
import Website from "../models/website.model.js"
import User from "../models/user.model.js"

before(startDb)
after(stopDb)

const BRIEF = JSON.stringify({
  siteType: "bakery", audience: "families", tone: "warm", colorMode: "light",
  palette: { primary: "#b5651d", secondary: "#f3e5ab", accent: "#6b8e23", background: "#fffaf0", surface: "#ffffff", text: "#3b2f2f" },
  typography: { heading: "Playfair Display", body: "Lato" }, layoutStyle: "airy", sections: ["hero", "menu"], imagery: "", motion: "subtle",
})
const wrap = (html) => `{"title":"Crumb & Co","message":"Built a bakery site"}\n\`\`\`html\n${html}\n\`\`\``
const GENERATED = wrap(VALID_PAGE)

let stub
const prompts = []
beforeEach(async () => {
  await clearDb()
  stub?.restore()
  prompts.length = 0
  setAiKeys(["groq"])
  resetPools()
  resetAiConfigCache()
})

const isBrief = (p) => p.includes("senior web designer")
const isGenerate = (p) => p.includes("Build a complete, production-quality")
function stubPipeline({ generation = () => GENERATED, edit } = {}) {
  return stubAiFetch(({ body }) => {
    const p = body.messages[0].content
    prompts.push(p)
    if (isBrief(p)) return chatOk(BRIEF, { prompt_tokens: 400, completion_tokens: 300 })
    if (isGenerate(p)) return chatOk(generation(p))
    if (edit) return chatOk(edit(p))
    return { status: 500 }
  })
}
const generate = (user, prompt = "A bakery called Crumb & Co") =>
  request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt })
const edit = (user, site, prompt) =>
  request(app).put(`/api/website/${site._id}`).set("Cookie", sessionCookie(user)).send({ prompt })

// ── Generation strategies ─────────────────────────────────────────────────────
test("brief strategy: the brief drives the prompt; totals include every call", async () => {
  await updateAiConfig({ designStrategy: "brief" })
  const user = await legacyUser({ credits: 100 })
  stub = stubPipeline()
  const res = await generate(user)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  const gen = prompts.find(isGenerate)
  assert.ok(gen.includes("#b5651d") && gen.includes("Playfair Display"))
  const row = await AiRequest.findOne({ task: "generate" })
  assert.deepEqual([row.outcome, row.strategy, row.designBrief, row.attempts], ["success", "brief", "ok", 2])
  assert.equal(row.inputTokens, 400 + 1200)
  assert.equal(row.outputTokens, 300 + 3400)
})

test("single strategy: one call, the model plans the design itself", async () => {
  await updateAiConfig({ designStrategy: "single" })
  const user = await legacyUser({ credits: 100 })
  stub = stubPipeline()
  const res = await generate(user)
  assert.equal(res.status, 201)
  assert.equal(prompts.length, 1)
  assert.ok(prompts[0].includes("first decide a direction"))
  assert.equal((await AiRequest.findOne({})).designBrief, "skipped")
})

test("retrying the same prompt reuses the cached design brief", async () => {
  await updateAiConfig({ designStrategy: "brief" })
  const user = await legacyUser({ credits: 200 })
  stub = stubPipeline()
  await generate(user, "A bakery in Kochi")
  await generate(user, "  a bakery in KOCHI ")
  assert.equal(prompts.filter(isBrief).length, 1)
  assert.equal((await AiRequest.find({}).sort({ createdAt: 1 }))[1].designBrief, "cached")
})

// ── Validation and repair ─────────────────────────────────────────────────────
test("a truncated page missing only its closing tags is repaired without another AI call", async () => {
  await updateAiConfig({ designStrategy: "single" })
  const user = await legacyUser({ credits: 100 })
  stub = stubPipeline({ generation: () => "```html\n" + VALID_PAGE.replace("</body></html>", "") })
  const res = await generate(user)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.ok(res.body.code.trimEnd().endsWith("</html>"))
  assert.equal(prompts.length, 1)
})

test("a JavaScript syntax error is fixed with a script-only repair call, not a regeneration", async () => {
  await updateAiConfig({ designStrategy: "single" })
  const user = await legacyUser({ credits: 100 })
  const broken = VALID_PAGE.replace("console.log('ok')", "console.log('ok'")
  stub = stubPipeline({ generation: () => wrap(broken), edit: (p) => {
    assert.ok(p.includes("fails to parse") && !p.includes("<nav"), "repair prompt must contain only the broken script")
    return "<script>console.log('ok')</script>"
  } })
  const res = await generate(user)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.ok(res.body.code.includes("console.log('ok')</script>"))
  assert.equal(prompts.filter(isGenerate).length, 1)
})

test("output that stays invalid is retried once, then refunded and recorded", async () => {
  await updateAiConfig({ designStrategy: "single" })
  const user = await legacyUser({ credits: 100 })
  stub = stubPipeline({ generation: () => wrap(`<!DOCTYPE html><html><body>${"tiny ".repeat(150)}</body></html>`) })
  const res = await generate(user)
  assert.equal(res.status, 503)
  assert.equal(prompts.filter(isGenerate).length, 2)
  assert.equal((await User.findById(user._id)).credits, 100)
  const row = await AiRequest.findOne({})
  assert.equal(row.failureReason, "validation_failed")
  assert.ok(row.validation.reasons.includes("missing_style"))
})

// ── Free capacity exhausted ───────────────────────────────────────────────────
test("when every free provider is out of capacity: clear 503, Retry-After, no charge, quota slot returned", async () => {
  await updateAiConfig({ designStrategy: "single", perUserDailyRequests: 1 })
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => ({ status: 429, headers: { "retry-after": "120" } }))
  const res = await generate(user)
  assert.equal(res.status, 503)
  assert.equal(res.body.code, "AI_QUOTA_EXHAUSTED")
  assert.match(res.body.message, /Free AI capacity is used up/)
  assert.ok(Number(res.headers["retry-after"]) > 0)
  assert.equal((await User.findById(user._id)).credits, 100)
  // The failed attempt did not use up the user's only daily slot.
  stub.restore(); resetPools()
  stub = stubPipeline()
  assert.equal((await generate(user)).status, 201)
})

// ── Daily quota (atomic) ──────────────────────────────────────────────────────
test("simultaneous requests cannot exceed the daily quota", async () => {
  await updateAiConfig({ designStrategy: "single", perUserDailyRequests: 2 })
  const user = await legacyUser({ credits: 1000 })
  stub = stubPipeline()
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => generate(user, `Bakery number ${i}`)))
  const statuses = results.map(r => r.status).sort()
  assert.deepEqual(statuses, [201, 201, 429, 429, 429, 429])
  assert.equal((await User.findById(user._id)).credits, 900)
  assert.equal((await AiCounter.findOne({ _id: /^user:/ })).count, 2)
})

// ── Edits ─────────────────────────────────────────────────────────────────────
const siteFor = (user, code = VALID_PAGE) => Website.create({ user: user._id, title: "Crumb", latestCode: code, slug: `crumb-${Math.random().toString(36).slice(2, 8)}` })

test("edit: a dark-mode toggle request is a full-document edit", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  const updated = VALID_PAGE.replace('<nav class="navbar">', '<nav class="navbar"><button id="theme">🌙</button>')
  stub = stubPipeline({ edit: () => wrap(updated) })
  const res = await edit(user, site, "Add a dark mode toggle to the navbar")
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual([res.body.mode, res.body.editType], ["full", "FULL"])
})

test("edit: style changes return only override rules, appended to the page", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  stub = stubPipeline({ edit: (p) => {
    assert.ok(!p.includes("<nav"), "style edits must not send the page body")
    return "<style>:root{--primary:#0057b8}</style>"
  } })
  const res = await edit(user, site, "change the primary colour to blue")
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.mode, "style_append")
  const code = (await Website.findById(site._id)).latestCode
  assert.ok(code.includes("<style data-gw-edit>") && code.includes("--primary:#0057b8") && code.includes("--primary:#b5651d"))
  const call = await AiCall.findOne({ task: "edit" })
  assert.ok(call.outputTokens <= 3400)
  // The response reports the measured totals (shown in the editor), not an estimate.
  assert.deepEqual(res.body.usage, { inputTokens: 1200, outputTokens: 3400, aiCalls: 1 })
})

test("edit: text changes are applied as exact find/replace pairs", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  stub = stubPipeline({ edit: () => '[{"find":"Fresh bread daily.","replace":"Baked every morning."}]' })
  const res = await edit(user, site, 'change the text "Fresh bread daily." so it says "Baked every morning."')
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.mode, "text_replace")
  assert.ok((await Website.findById(site._id)).latestCode.includes("Baked every morning."))
})

test("edit: an unusable text replacement falls back to a full edit", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  let n = 0
  stub = stubPipeline({ edit: () => (++n === 1 ? '[{"find":"text that is not on the page","replace":"x"}]' : wrap(VALID_PAGE.replace("Fresh bread daily.", "Baked daily."))) })
  const res = await edit(user, site, 'change the text "Fresh bread daily." so it says "Baked daily."')
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.mode, "full")
  const row = await AiRequest.findOne({ task: "edit" })
  assert.equal(row.fellBackToFull, true)
})

test("edit: a destructive section patch is rejected and falls back to a full edit", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  let n = 0
  stub = stubPipeline({ edit: () => (++n === 1
    ? '<section id="hero"><h1>New</h1><div class="cta">'                                 // unclosed tags: breaks the page structure
    : wrap(VALID_PAGE.replace("<h1>Crumb &amp; Co</h1>", "<h1>Crumb &amp; Co</h1><a href=\"#menu\">Menu</a>"))) })
  const res = await edit(user, site, "add a button to the hero that links to the menu")
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.mode, "full")
  assert.ok((await AiRequest.findOne({ task: "edit" })).fellBackToFull)
})

test("edit: a full rewrite that silently drops the page's scripts is refused and refunded", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await siteFor(user)
  stub = stubPipeline({ edit: () => wrap(VALID_PAGE.replace("<script>console.log('ok')</script>", "")) })
  const res = await edit(user, site, "Add a dark mode toggle to the navbar")
  assert.equal(res.status, 503)
  assert.equal((await Website.findById(site._id)).latestCode, VALID_PAGE)
  assert.equal((await User.findById(user._id)).credits, 100)
})

// ── Admin (free-only) ─────────────────────────────────────────────────────────
test("admin endpoints require an admin role set server-side", async () => {
  const user = await legacyUser()
  assert.equal((await request(app).get("/api/admin/ai/config")).status, 401)
  assert.equal((await request(app).get("/api/admin/ai/config").set("Cookie", sessionCookie(user))).status, 403)
})

test("admin config is free-only: paid settings are rejected, strategy and models are configurable", async () => {
  const admin = await legacyUser({ role: "admin" })
  const cookie = sessionCookie(admin)
  const get = await request(app).get("/api/admin/ai/config").set("Cookie", cookie)
  assert.equal(get.status, 200)
  assert.equal(get.body.freeOnly, true)
  assert.ok(get.body.models.every(m => m.tier === "free"))
  assert.ok(!JSON.stringify(get.body).includes("test-key"), "credentials never returned")

  const paid = await request(app).put("/api/admin/ai/config").set("Cookie", cookie).send({ paidEnabled: true, monthlyBudgetUsd: 5 })
  assert.equal(paid.status, 400)
  assert.match(paid.body.message, /free-only/)

  const put = await request(app).put("/api/admin/ai/config").set("Cookie", cookie)
    .send({ designStrategy: "single", models: { "zhipu/glm-4.5-flash": { enabled: false } } })
  assert.equal(put.status, 200, JSON.stringify(put.body))
  assert.equal(put.body.config.designStrategy, "single")
  assert.equal(put.body.models.find(m => m.id === "zhipu/glm-4.5-flash").enabled, false)
})

test("admin usage reports per-strategy token totals including every attempt", async () => {
  const admin = await legacyUser({ role: "admin", credits: 500 })
  await updateAiConfig({ designStrategy: "brief" })
  stub = stubPipeline()
  await generate(admin)
  const usage = await request(app).get("/api/admin/ai/usage?days=7").set("Cookie", sessionCookie(admin))
  assert.equal(usage.status, 200)
  const gen = usage.body.byTask.find(t => t.task === "generate")
  assert.deepEqual([gen.strategy, gen.requests, gen.successRate], ["brief", 1, 1])
  assert.equal(gen.tokensPerSuccess, 400 + 300 + 1200 + 3400)
})

// ── Correction pass: user quota vs provider quota; release exactly once ──────
import { providerCounterId, userCounterId, msUntilNextUtcDay } from "../ai/quota.js"
const counter = async (id) => (await AiCounter.findById(id))?.count ?? 0

test("provider quota exhausted (daily cap) → 503 AI_QUOTA_EXHAUSTED with retry at the next UTC day; user slot returned", async () => {
  await updateAiConfig({ designStrategy: "single" })
  const user = await legacyUser({ credits: 100 })
  await AiCounter.create({ _id: providerCounterId("groq", "account"), count: 1000, expiresAt: new Date(Date.now() + 86400000) })
  stub = stubPipeline()
  const res = await generate(user)
  assert.equal(res.status, 503)
  assert.equal(res.body.code, "AI_QUOTA_EXHAUSTED")
  assert.equal(prompts.length, 0, "no provider call once its daily cap is reached")
  assert.ok(Math.abs(Number(res.headers["retry-after"]) - msUntilNextUtcDay() / 1000) < 10)
  assert.equal(await counter(userCounterId(user._id)), 0)
  assert.equal((await User.findById(user._id)).credits, 100)
})

test("user quota exhausted → 429 DAILY_LIMIT while providers are healthy; no provider call, no charge", async () => {
  await updateAiConfig({ designStrategy: "single", perUserDailyRequests: 3 })
  const user = await legacyUser({ credits: 100 })
  await AiCounter.create({ _id: userCounterId(user._id), count: 3, expiresAt: new Date(Date.now() + 86400000) })
  stub = stubPipeline()
  const res = await generate(user)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, "DAILY_LIMIT")
  assert.equal(prompts.length, 0)
  assert.equal(await counter(providerCounterId("groq", "account")), 0)
  assert.equal((await User.findById(user._id)).credits, 100)
})

test("a failed request releases its user slot exactly once (AI failure, server error, edit failure)", async () => {
  await updateAiConfig({ designStrategy: "single", perUserDailyRequests: 5 })
  const user = await legacyUser({ credits: 1000 })
  const id = userCounterId(user._id)
  await AiCounter.create({ _id: id, count: 1, expiresAt: new Date(Date.now() + 86400000) })

  stub = stubPipeline({ generation: () => wrap("<html><body>tiny</body></html>") })          // validation failure
  assert.equal((await generate(user)).status, 503)
  assert.equal(await counter(id), 1)

  stub.restore(); stub = stubPipeline()
  const original = Website.create
  Website.create = async () => { throw new Error("simulated DB failure") }                    // server error after AI success
  try { assert.equal((await generate(user)).status, 500) } finally { Website.create = original }
  assert.equal(await counter(id), 1)

  const site = await siteFor(user)
  stub.restore(); stub = stubAiFetch(() => ({ status: 500 }))                                  // edit failure
  assert.equal((await edit(user, site, "make the background cream")).status, 503)
  assert.equal(await counter(id), 1)

  stub.restore(); stub = stubPipeline()
  assert.equal((await generate(user)).status, 201)                                            // success consumes one
  assert.equal(await counter(id), 2)
})

test("concurrent failing requests release each slot once (never below the starting count)", async () => {
  await updateAiConfig({ designStrategy: "single", perUserDailyRequests: 10 })
  const user = await legacyUser({ credits: 1000 })
  const id = userCounterId(user._id)
  await AiCounter.create({ _id: id, count: 2, expiresAt: new Date(Date.now() + 86400000) })
  stub = stubAiFetch(() => ({ status: 429 }))
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => generate(user, `Bakery ${i}`)))
  assert.ok(results.every(r => r.status === 503))
  assert.equal(await counter(id), 2)
})
