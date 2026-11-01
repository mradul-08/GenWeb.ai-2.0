// Free-only routing: ordering, fallback, account-level quotas, error
// classification, daily caps, request size limits and tracking.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { startDb, stopDb, clearDb, stubAiFetch, chatOk, cfOk, setAiKeys } from "./helpers.js"
import { runTask, resetPools, candidateOrder, getProviderStatus } from "../ai/router.js"
import { resetAiConfigCache, getAiConfig, validateConfigPatch, setModelOverrides } from "../ai/config.js"
import { assertFree, PaidRequestBlocked, classifyError, parseDuration } from "../ai/providers.js"
import { PROVIDERS, DEFAULT_MODELS } from "../ai/catalog.js"
import { AiCall, AiConfig } from "../models/ai.models.js"
import { AiCounter, providerCounterId } from "../ai/quota.js"

before(startDb)
after(stopDb)

const BASE = {
  "groq/gpt-oss-120b": { priority: 1 }, "zhipu/glm-4.5-flash": { priority: 2 }, "cloudflare/llama-3.3-70b": { priority: 3 },
  "groq/qwen3.8-27b": { enabled: false },
}
let stub
beforeEach(async () => {
  await clearDb()
  stub?.restore()
  setAiKeys({ groq: 2, zhipu: 1, cloudflare: 2 })
  resetPools()
  resetAiConfigCache()
  // Deterministic order: groq → zhipu → cloudflare.
  await setModelOverrides(BASE)
})

const page = "<html>".padEnd(300, "x")
const run = (extra = {}) => runTask({ task: "generate", prompt: "build a site", maxTokens: 5000, ctx: { requestId: "r1" }, ...extra })

// ── Free-only guarantees ──────────────────────────────────────────────────────
test("the catalog contains only free models and no paid provider", () => {
  assert.ok(DEFAULT_MODELS.every(m => m.tier === "free"))
  assert.ok(!("cerebras" in PROVIDERS))
  assert.ok(DEFAULT_MODELS.filter(m => m.provider === "openrouter").every(m => m.model.endsWith(":free")))
})

test("non-free models are refused before any request is made", () => {
  assert.throws(() => assertFree(PROVIDERS.groq, { id: "x", model: "m", tier: "paid" }), PaidRequestBlocked)
  assert.throws(() => assertFree(PROVIDERS.openrouter, { id: "x", model: "deepseek/deepseek-chat", tier: "free" }), PaidRequestBlocked)
  assert.doesNotThrow(() => assertFree(PROVIDERS.openrouter, { id: "x", model: "google/gemma-4-31b-it:free", tier: "free" }))
})

test("admin config cannot enable paid usage, set prices or add models", () => {
  for (const patch of [{ paidEnabled: true }, { monthlyBudgetUsd: 5 }, { paidFirstTasks: ["generate"] },
    { models: { "groq/gpt-oss-120b": { priceIn: 1 } } }, { models: { "groq/gpt-oss-120b": { tier: "paid" } } },
    { models: { "openrouter/deepseek-v3": { enabled: true } } }]) {
    assert.ok(validateConfigPatch(patch).error, JSON.stringify(patch))
  }
  assert.match(validateConfigPatch({ paidEnabled: true }).error, /free-only/)
})

// ── Routing and tracking ──────────────────────────────────────────────────────
test("uses the highest-priority model and records provider-reported tokens", async () => {
  stub = stubAiFetch(() => chatOk(page))
  const r = await run()
  assert.equal(r.model.id, "groq/gpt-oss-120b")
  const row = await AiCall.findOne({})
  assert.deepEqual([row.outcome, row.inputTokens, row.outputTokens, row.tokensEstimated, row.tier], ["success", 1200, 3400, false, "free"])
})

test("sends the model's extra fields (short reasoning) and caps max_tokens to the account's per-request budget", async () => {
  let sent
  stub = stubAiFetch(({ body }) => { sent = body; return chatOk(page) })
  await run({ maxTokens: 12000 })
  assert.equal(sent.reasoning_effort, "low")
  assert.ok(sent.max_tokens <= 8000 - 3, `max_tokens ${sent.max_tokens} must fit Groq's 8000-token request budget`)
})

test("transient server error falls back to the next model; both attempts recorded", async () => {
  stub = stubAiFetch(({ provider }) => provider === "groq" ? { status: 500 } : chatOk(page))
  const r = await run()
  assert.equal(r.model.id, "zhipu/glm-4.5-flash")
  assert.deepEqual((await AiCall.find({}).sort({ createdAt: 1 })).map(c => c.outcome), ["http", "success"])
  assert.equal(r.exhausted, false)
})

// ── Account-level quotas ──────────────────────────────────────────────────────
test("a rate limit on one key pauses the whole provider account (other keys are not tried)", async () => {
  stub = stubAiFetch(({ provider }) => provider === "groq" ? { status: 429, headers: { "retry-after": "20" } } : chatOk(page))
  await run()
  await run()
  assert.equal(stub.calls.filter(c => c.provider === "groq").length, 1, "second groq key must not be used to bypass the account limit")
  const groq = getProviderStatus().providers.find(p => p.provider === "groq")
  assert.equal(groq.pausedReason, "rate_limit")
  assert.ok(groq.nextResetMs > 15000 && groq.nextResetMs <= 20000, `Retry-After honoured (${groq.nextResetMs}ms)`)
})

const CF_ONLY = { ...BASE, "groq/gpt-oss-120b": { enabled: false }, "zhipu/glm-4.5-flash": { enabled: false } }
const CF_DAILY_LIMIT = { status: 429, json: { errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] } }

test("every provider aggregates its credentials into one quota scope", () => {
  for (const [id, def] of Object.entries(PROVIDERS)) assert.equal(def.quotaScope, "provider", id)
})

test("Cloudflare accounts share one quota: the daily allocation on the first pauses all; the second account is never called", async () => {
  await setModelOverrides(CF_ONLY)
  stub = stubAiFetch(({ account }) => account === "acct1" ? CF_DAILY_LIMIT : cfOk(page))
  const r1 = await run()
  const r2 = await run()
  assert.equal(r1.model, null)
  assert.equal(r2.model, null)
  assert.deepEqual(stub.calls.map(c => c.account), ["acct1"], "acct2 must not be used to get a second free allocation")
  const cf = getProviderStatus().providers.find(p => p.provider === "cloudflare")
  assert.equal(cf.pausedReason, "quota_exhausted")
  assert.equal(cf.available, 0)
  assert.equal(r1.exhausted, true, "classified as capacity, not as a transient error")
  assert.equal(r2.exhausted, true)
})

test("Cloudflare rate limit on one account pauses every account", async () => {
  await setModelOverrides(CF_ONLY)
  stub = stubAiFetch(({ account }) => account === "acct1" ? { status: 429, headers: { "retry-after": "30" } } : cfOk(page))
  await run()
  await run()
  assert.deepEqual(stub.calls.map(c => c.account), ["acct1"])
  assert.equal(getProviderStatus().providers.find(p => p.provider === "cloudflare").pausedReason, "rate_limit")
})

test("with several keys only the first usable credential is called (no round-robin across accounts)", async () => {
  stub = stubAiFetch(() => chatOk(page))
  for (let i = 0; i < 4; i++) await run()
  assert.deepEqual([...new Set(stub.calls.filter(c => c.provider === "groq").map(c => c.credential))], ["groq-test-key-000001"])
  await setModelOverrides(CF_ONLY)
  stub.restore(); stub = stubAiFetch(() => cfOk(page))
  for (let i = 0; i < 3; i++) await run()
  assert.deepEqual([...new Set(stub.calls.map(c => c.account))], ["acct1"])
})

test("a Cloudflare account with an invalid token is dropped and the next account takes over (not a quota bypass)", async () => {
  await setModelOverrides(CF_ONLY)
  stub = stubAiFetch(({ account }) => account === "acct1" ? { status: 401, json: { errors: [{ message: "Authentication error" }] } } : cfOk(page))
  await run()
  const r = await run()
  assert.equal(r.model.id, "cloudflare/llama-3.3-70b")
  const cf = getProviderStatus().providers.find(p => p.provider === "cloudflare")
  assert.equal(cf.dead, 1)
})

test("repeated transient errors rest only that credential and stay classified as transient", async () => {
  await setModelOverrides(CF_ONLY)
  stub = stubAiFetch(({ account }) => account === "acct1" ? { status: 500 } : cfOk(page))
  const results = []
  for (let i = 0; i < 4; i++) results.push(await run())
  assert.deepEqual(stub.calls.map(c => c.account), ["acct1", "acct1", "acct1", "acct2"])
  for (const r of results.slice(0, 3)) { assert.equal(r.model, null); assert.equal(r.exhausted, false, "HTTP 500 is not capacity") }
  assert.equal(results[3].model.id, "cloudflare/llama-3.3-70b")
})

test("provider status warns when several credentials are configured, and not for one", () => {
  const st = Object.fromEntries(getProviderStatus().providers.map(p => [p.provider, p]))
  assert.equal(st.groq.warning, "multiple_credentials_share_one_quota")
  assert.equal(st.cloudflare.warning, "multiple_credentials_share_one_quota")
  assert.equal(st.zhipu.warning, null)
  assert.equal(st.cloudflare.quotaScope, "provider")
})

test("an invalid key is dropped individually; the account's other key still works", async () => {
  stub = stubAiFetch(({ provider, credential }) => provider === "groq" && credential.endsWith("1") ? { status: 401 } : chatOk(page))
  await run()
  const r = await run()
  assert.equal(r.model.id, "groq/gpt-oss-120b")
  assert.equal(getProviderStatus().providers.find(p => p.provider === "groq").dead, 1)
})

test("error classification matches the real provider responses seen on 2026-11-01", () => {
  const h = (o = {}) => new Headers(o)
  assert.equal(classifyError(429, '{"code":"1113","message":"余额不足或无可用资源包,请充值。"}', h()), "billing")        // ZhipuAI glm-4.5-air
  assert.equal(classifyError(402, '{"message":"Payment required to access this resource."}', h()), "billing")      // Cerebras
  assert.equal(classifyError(429, '{"message":"Rate limit exceeded","code":"1300"}', h({ "x-ratelimit-limit-req-minute": "0" })), "restricted") // Mistral
  assert.equal(classifyError(401, '{"code":"invalid_api_key"}', h()), "auth")                                      // SambaNova
  assert.equal(classifyError(401, '{"message":"User not found.","code":401}', h()), "auth")                         // OpenRouter
  assert.equal(classifyError(404, '{"error":{"code":"model_not_found"}}', h()), "model_unavailable")              // Groq retired model
  assert.equal(classifyError(400, '{"code":"1211","message":"模型不存在"}', h()), "model_unavailable")             // ZhipuAI unknown model
  assert.equal(classifyError(429, '{"errors":[{"code":4006,"message":"you have used up your daily free allocation of 10,000 neurons"}]}', h()), "quota_exhausted") // Cloudflare
  assert.equal(classifyError(429, '{"message":"slow down"}', h()), "rate_limit")
  assert.equal(classifyError(503, "upstream error", h()), "http")
  assert.equal(parseDuration("1m26.4s"), 86400)
  assert.equal(parseDuration("622ms"), 622)
})

test("billing response pauses the provider for a day; a daily-quota response until the next UTC day", async () => {
  stub = stubAiFetch(({ provider }) =>
    provider === "groq" ? { status: 402, json: { message: "Payment required" } }
    : provider === "zhipu" ? { status: 429, json: { errors: [{ code: 4006, message: "daily free allocation" }] } }
    : chatOk(page))
  await run()
  const st = Object.fromEntries(getProviderStatus().providers.map(p => [p.provider, p]))
  assert.equal(st.groq.pausedReason, "billing")
  assert.ok(st.groq.nextResetMs > 23 * 3600000)
  assert.equal(st.zhipu.pausedReason, "quota_exhausted")
})

test("a retired model is skipped without pausing the rest of its provider", async () => {
  await setModelOverrides({ ...BASE, "groq/qwen3.8-27b": { enabled: true, priority: 0 } })
  stub = stubAiFetch(({ model }) => model === "qwen/qwen3.8-27b" ? { status: 404, json: { error: { code: "model_not_found" } } } : chatOk(page))
  const r = await run()
  assert.equal(r.model.id, "groq/gpt-oss-120b")
  const second = await run()
  assert.ok(second.attempts.some(a => a.model === "groq/qwen3.8-27b" && a.skipped === "model_unavailable"))
})

test("the account's daily request cap is enforced atomically before calling", async () => {
  await AiCounter.create({ _id: providerCounterId("groq", "account"), count: 1000, expiresAt: new Date(Date.now() + 86400000) })
  stub = stubAiFetch(() => chatOk(page))
  const r = await run()
  assert.equal(r.model.id, "zhipu/glm-4.5-flash")
  assert.ok(!stub.calls.some(c => c.provider === "groq"))
  assert.ok(r.attempts.some(a => a.skipped === "daily_request_cap"))
})

test("a request too large for an account's per-request token budget skips that provider", async () => {
  stub = stubAiFetch(() => chatOk(page))
  const r = await run({ prompt: "x".repeat(24000) })   // ≈6000 input tokens + 3000 minimum output > 8000
  assert.equal(r.model.id, "zhipu/glm-4.5-flash")
  assert.ok(r.attempts.some(a => a.model === "groq/gpt-oss-120b" && a.skipped === "request_too_large"))
})

test("when every free provider is out of capacity the result is flagged exhausted with a retry time", async () => {
  stub = stubAiFetch(() => ({ status: 429, headers: { "retry-after": "60" } }))
  const r = await run()
  assert.equal(r.content, null)
  assert.equal(r.exhausted, true)
  assert.ok(r.retryAfterMs > 0)
  assert.equal(stub.calls.length, 3, "one call per provider; a second key/account is not tried after a limit")
  const again = await run()
  assert.equal(again.exhausted, true)
  assert.equal(stub.calls.length, 3, "paused providers are not called again")
})

test("an expired deadline makes no provider calls", async () => {
  stub = stubAiFetch(() => chatOk(page))
  const r = await run({ deadline: Date.now() + 1000 })
  assert.equal(r.content, null)
  assert.equal(stub.calls.length, 0)
  assert.equal(r.exhausted, false)
})

test("too-short output counts as a failure and the next model is tried", async () => {
  stub = stubAiFetch(({ provider }) => provider === "groq" ? chatOk("ok") : chatOk(page))
  const r = await run({ minChars: 100 })
  assert.equal(r.model.id, "zhipu/glm-4.5-flash")
})

test("Cloudflare's OpenAI-style result shape is parsed", async () => {
  await setModelOverrides({ ...BASE, "groq/gpt-oss-120b": { enabled: false }, "zhipu/glm-4.5-flash": { enabled: false } })
  stub = stubAiFetch(() => ({ status: 200, json: { success: true, result: { choices: [{ message: { content: page } }], usage: { prompt_tokens: 50, completion_tokens: 90 } } } }))
  const r = await run()
  assert.equal(r.content, page)
  const row = await AiCall.findOne({})
  assert.deepEqual([row.inputTokens, row.outputTokens], [50, 90])
})

test("disabled models are never called", async () => {
  const config = await getAiConfig()
  assert.ok(!candidateOrder(config, "generate").some(m => !m.enabled))
})

test("a request too large for every provider is not reported as exhausted capacity", async () => {
  await setModelOverrides({ ...BASE, "zhipu/glm-4.5-flash": { enabled: false }, "cloudflare/llama-3.3-70b": { enabled: false } })
  stub = stubAiFetch(() => chatOk(page))
  const r = await run({ prompt: "x".repeat(24000) })
  assert.equal(r.content, null)
  assert.equal(r.exhausted, false)
})

test("small outputs (e.g. text edits) are not blocked by the generation-sized minimum", async () => {
  stub = stubAiFetch(() => chatOk('[{"find":"a","replace":"b"}]'))
  const r = await runTask({ task: "edit", prompt: "x".repeat(4000), maxTokens: 800, ctx: { requestId: "t" }, minChars: 2 })
  assert.equal(r.model.id, "groq/gpt-oss-120b")
})

test("provider health is evidence-based: never 'verified' without a real successful call", async () => {
  await getAiConfig()
  const before = Object.fromEntries(getProviderStatus().providers.map(p => [p.provider, p.health]))
  assert.equal(before.groq, "unverified")
  assert.equal(before.mistral, "disabled")
  assert.equal(before.openrouter, "disabled")
  stub = stubAiFetch(({ provider }) => provider === "groq" ? chatOk(page) : { status: 500 })
  await run()
  const after = Object.fromEntries(getProviderStatus().providers.map(p => [p.provider, p]))
  assert.equal(after.groq.health, "verified")
  assert.ok(after.groq.lastSuccessAt)
  assert.equal(after.zhipu.health, "unverified")
})

test("a provider whose keys are all invalid reports invalid_credentials", async () => {
  await getAiConfig()
  stub = stubAiFetch(({ provider }) => provider === "groq" ? { status: 401 } : chatOk(page))
  await run(); await run()
  assert.equal(getProviderStatus().providers.find(p => p.provider === "groq").health, "invalid_credentials")
})

// ── Correction pass: exhaustion classification ───────────────────────────────
test("classification: capacity vs neutral vs transient reasons", async () => {
  const { isCapacityExhausted } = await import("../ai/router.js")
  const A = (...r) => r.map(x => x.startsWith("skip:") ? { skipped: x.slice(5) } : { outcome: x })
  assert.equal(isCapacityExhausted(A("skip:daily_request_cap")), true)
  assert.equal(isCapacityExhausted(A("rate_limit", "skip:daily_request_cap", "skip:invalid_credentials")), true)
  assert.equal(isCapacityExhausted(A("quota_exhausted", "billing", "restricted")), true)
  assert.equal(isCapacityExhausted(A("skip:repeated_errors")), false, "transient pause is not capacity")
  assert.equal(isCapacityExhausted(A("rate_limit", "http")), false, "a transient failure means 'retry', not 'exhausted'")
  assert.equal(isCapacityExhausted(A("skip:invalid_credentials", "skip:request_too_large")), false, "config/size only says nothing about capacity")
  assert.equal(isCapacityExhausted(A("skip:deadline")), false)
  assert.equal(isCapacityExhausted([]), false)
})

test("provider daily cap reached on the only usable provider → exhausted, retry at the next UTC day", async () => {
  await setModelOverrides({ ...BASE, "zhipu/glm-4.5-flash": { enabled: false }, "cloudflare/llama-3.3-70b": { enabled: false } })
  await AiCounter.create({ _id: providerCounterId("groq", "account"), count: 1000, expiresAt: new Date(Date.now() + 86400000) })
  stub = stubAiFetch(() => chatOk(page))
  const r = await run()
  assert.equal(stub.calls.length, 0)
  assert.equal(r.exhausted, true)
  const { msUntilNextUtcDay } = await import("../ai/quota.js")
  assert.ok(Math.abs(r.retryAfterMs - msUntilNextUtcDay()) < 5000, `retry ${r.retryAfterMs} ≈ next UTC day`)
})

test("a provider paused only for repeated transient errors is not reported as exhausted", async () => {
  await setModelOverrides({ ...BASE, "zhipu/glm-4.5-flash": { enabled: false }, "cloudflare/llama-3.3-70b": { enabled: false } })
  setAiKeys({ groq: 1 }); resetPools()
  stub = stubAiFetch(() => ({ status: 500 }))
  for (let i = 0; i < 3; i++) await run()            // 3 failures → the key rests (repeated_errors)
  const r = await run()
  assert.ok(r.attempts.some(a => a.skipped === "repeated_errors"))
  assert.equal(r.exhausted, false)
})

// ── Correction pass: locked models and paid-request property ────────────────
test("locked (unusable) models cannot be enabled by admin config, and a stored override is ignored", async () => {
  for (const id of ["mistral/mistral-small", "sambanova/llama-3.3-70b", "openrouter/gemma-4-31b-free"]) {
    assert.match(validateConfigPatch({ models: { [id]: { enabled: true } } }).error, /locked/)
  }
  await setModelOverrides({ ...BASE, "mistral/mistral-small": { enabled: true, priority: 0 } })   // bypassing validation
  const order = candidateOrder(await getAiConfig(), "generate")
  assert.ok(!order.some(m => m.id === "mistral/mistral-small"))
  assert.equal(getProviderStatus().providers.find(p => p.provider === "mistral").health, "disabled")
})

test("no fallback path ever calls a model outside the free catalog", async () => {
  setAiKeys({ groq: 2, zhipu: 1, cloudflare: 2, mistral: 1, sambanova: 1, openrouter: 1 }); resetPools()
  await setModelOverrides({})                                       // defaults only
  const allowed = new Set(DEFAULT_MODELS.filter(m => m.enabled && !m.lockedReason).map(m => m.model))
  stub = stubAiFetch(() => ({ status: 503 }))
  for (const task of ["generate", "edit", "design_brief", "enhance"]) {
    for (let i = 0; i < 4; i++) await runTask({ task, prompt: "x", maxTokens: 1000, ctx: { requestId: "p" } })
  }
  assert.ok(stub.calls.length > 0)
  for (const c of stub.calls) {
    assert.ok(allowed.has(c.model), `unexpected model called: ${c.model}`)
    assert.ok(!["mistral", "sambanova", "openrouter"].includes(c.provider), `locked provider called: ${c.provider}`)
  }
})
