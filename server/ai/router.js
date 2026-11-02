// Free-only model routing with fallback, account-level quotas and tracking.
// Paid models do not exist in the catalog, are filtered out here, and are
// refused again in ai/providers.js — no code path can make a paid request.
import crypto from "crypto"
import { PROVIDERS } from "./catalog.js"
import { KeyPool } from "./keyPool.js"
import { callModel } from "./providers.js"
import { getAiConfig, effectiveModels, peekAiConfig } from "./config.js"
import { recordCall } from "./usage.js"
import { reserve, providerCounterId, msUntilNextUtcDay } from "./quota.js"

const TASK_TIMEOUT_MS   = { generate: 90000, edit: 90000, design_brief: 30000, enhance: 30000, plan: 30000, content: 75000 }
const MIN_CALL_MS       = 15000   // not worth starting a call with less time left
// Smallest useful output per task; a provider whose per-request token budget
// cannot fit this (input + output) is skipped rather than truncating the page.
const MIN_OUTPUT_TOKENS = { generate: 3000, edit: 1200, design_brief: 300, enhance: 300, plan: 400, content: 1500 }

const HOUR = 3600000
const COOLDOWN_MS = {
  restricted:      () => 6 * HOUR,
  billing:         () => 24 * HOUR,
  quota_exhausted: () => msUntilNextUtcDay(),
  rate_limit:      (provider, r) => r.retryAfterMs ?? provider.rateLimitCooldownHours * HOUR,
}
// How each attempt outcome / skip reason counts when deciding whether ALL free
// capacity is used up (→ 503 AI_QUOTA_EXHAUSTED with a retry time):
//   capacity  – a free-tier limit was hit: the answer is "try again later"
//   neutral   – configuration or size (bad keys, retired model, too large):
//               says nothing about capacity either way
//   transient – anything else (HTTP errors, timeouts, repeated errors,
//               deadline): the answer is "something went wrong, retry"
// Exhausted = at least one capacity reason and no transient failure.
export const CAPACITY_REASONS = new Set(["rate_limit", "quota_exhausted", "daily_request_cap", "restricted", "billing"])
export const NEUTRAL_REASONS  = new Set(["auth", "invalid_credentials", "no_credentials", "model_unavailable", "request_too_large"])
export function isCapacityExhausted(attempts) {
  const reasons = attempts.map(a => a.skipped ?? a.outcome)
  return reasons.some(r => CAPACITY_REASONS.has(r)) && reasons.every(r => CAPACITY_REASONS.has(r) || NEUTRAL_REASONS.has(r))
}

// ── State (per process) ───────────────────────────────────────────────────────
const pools = new Map()
const modelCooldowns = new Map()   // modelId → epoch ms until usable again
export function resetPools() { pools.clear(); modelCooldowns.clear() }
function pool(providerId) {
  if (!pools.has(providerId)) {
    const def = PROVIDERS[providerId]
    pools.set(providerId, new KeyPool(providerId, def.credentials()))
  }
  return pools.get(providerId)
}

const VERIFIED_WINDOW_MS = HOUR

// Health is evidence-based: a provider is "verified" only after a successful
// real call within the last hour; otherwise it is "unverified" (never assumed
// healthy), "paused", "invalid_credentials", "no_credentials" or "disabled".
export function getProviderStatus() {
  const now = Date.now()
  const enabledProviders = new Set(effectiveModels(peekAiConfig()).filter(m => m.enabled).map(m => m.provider))
  const providers = Object.keys(PROVIDERS).map(id => {
    const s = pool(id).status()
    const enabled = enabledProviders.has(id)
    const health =
      !enabled                    ? "disabled"
      : s.total === 0             ? "no_credentials"
      : s.dead === s.total        ? "invalid_credentials"
      : s.available === 0         ? "paused"
      : s.lastSuccessAt && now - Date.parse(s.lastSuccessAt) < VERIFIED_WINDOW_MS ? "verified"
      : "unverified"
    return { ...s, enabled, health }
  })
  const usable = providers.filter(p => p.enabled && p.available > 0)
  const resets = providers.filter(p => p.enabled).map(p => p.nextResetMs).filter(v => v !== null)
  return {
    timestamp:     new Date().toISOString(),
    providers,
    unavailableModels: [...modelCooldowns].filter(([, t]) => t > now).map(([id, t]) => ({ id, retryInMs: t - now })),
    anyAvailable:  usable.length > 0,
    anyVerified:   providers.some(p => p.health === "verified"),
    earliestReset: resets.length ? Math.min(...resets) : null,
  }
}

export const newRequestId = () => crypto.randomUUID()
export const estimateTokens = (text) => Math.ceil(text.length / 4)

// ── Ordering ──────────────────────────────────────────────────────────────────
const rotation = {}
function ordered(models, task) {
  const groups = new Map()
  for (const m of models) {
    const p = m.priority?.[task] ?? 100
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(m)
  }
  const turn = (rotation[task] = (rotation[task] ?? -1) + 1)
  return [...groups.keys()].sort((a, b) => a - b).flatMap(p => {
    const g = groups.get(p)
    const s = turn % g.length
    return [...g.slice(s), ...g.slice(0, s)]
  })
}

export function candidateOrder(config, task) {
  return ordered(
    effectiveModels(config).filter(m => m.tier === "free" && m.enabled && m.tasks.includes(task) && PROVIDERS[m.provider]),
    task
  )
}

// Runs one AI task with fallback across free models. Every provider attempt is
// recorded in ai_calls. Returns { content, model, attempts, exhausted, retryAfterMs }:
// content is null on failure; exhausted=true means every candidate was out of
// free capacity (as opposed to transient errors).
export async function runTask({ task, prompt, maxTokens, deadline = Infinity, ctx = {}, minChars }) {
  const config   = await getAiConfig()
  const attempts = []
  const inputTokens = estimateTokens(prompt)

  for (const model of candidateOrder(config, task)) {
    const provider = PROVIDERS[model.provider]
    const p = pool(model.provider)

    if ((modelCooldowns.get(model.id) ?? 0) > Date.now()) { attempts.push({ model: model.id, skipped: "model_unavailable" }); continue }
    if (p.isEmpty()) { attempts.push({ model: model.id, skipped: p.status().pausedReason || (p.items.length ? "invalid_credentials" : "no_credentials") }); continue }

    const timeLeft = Math.min(TASK_TIMEOUT_MS[task] ?? 60000, deadline - Date.now())
    if (timeLeft < MIN_CALL_MS) { attempts.push({ model: model.id, skipped: "deadline" }); break }

    // Per-request token budget (e.g. Groq: input + max_tokens ≤ tokens/minute).
    let outTokens = maxTokens
    if (provider.limits?.maxRequestTokens) {
      outTokens = Math.min(maxTokens, provider.limits.maxRequestTokens - inputTokens)
      if (outTokens < Math.min(MIN_OUTPUT_TOKENS[task] ?? 300, maxTokens)) { attempts.push({ model: model.id, skipped: "request_too_large" }); continue }
    }

    const credential = p.next()
    if (!credential) { attempts.push({ model: model.id, skipped: "no_credentials" }); continue }

    // Account-level daily request cap, reserved atomically before the call.
    if (provider.limits?.requestsPerDay) {
      // One counter per provider: all credentials share the provider's free quota.
      const slot = await reserve(providerCounterId(model.provider, "account"), provider.limits.requestsPerDay)
      if (!slot.ok) {
        p.coolDown(credential, msUntilNextUtcDay(), "daily_request_cap")
        attempts.push({ model: model.id, skipped: "daily_request_cap" })
        continue
      }
    }

    const started = Date.now()
    const r = await callModel(provider, model, credential, prompt, { timeoutMs: timeLeft, maxTokens: outTokens, minChars })
    const latencyMs = Date.now() - started

    if (r.ok) p.noteSuccess(); else if (r.errorKind !== "empty") p.noteError(r.errorKind)
    if (r.ok)                                  p.recordSuccess(credential)
    else if (r.errorKind === "auth")           p.markDead(credential)
    else if (COOLDOWN_MS[r.errorKind])         p.coolDown(credential, COOLDOWN_MS[r.errorKind](provider, r), r.errorKind)
    else if (r.errorKind === "model_unavailable") modelCooldowns.set(model.id, Date.now() + 24 * HOUR)
    else if (r.errorKind !== "empty")          p.recordFailure(credential)

    const outcome = r.ok ? "success" : r.errorKind
    await recordCall({
      requestId: ctx.requestId || "untracked", user: ctx.userId, task,
      modelId: model.id, provider: model.provider, tier: "free",
      outcome, httpStatus: r.status ?? undefined, latencyMs,
      inputTokens: r.usage.input, outputTokens: r.usage.output, cachedTokens: r.usage.cached,
      tokensEstimated: r.usage.estimated,
    })
    attempts.push({ model: model.id, outcome, latencyMs, inputTokens: r.usage.input, outputTokens: r.usage.output })
    console.log(`[AI] ${task} → ${model.id}: ${outcome}${r.status ? ` (HTTP ${r.status})` : ""} ${latencyMs}ms`)

    if (r.ok) return { content: r.content, model, attempts, exhausted: false }
  }

  const exhausted = isCapacityExhausted(attempts)
  const status = getProviderStatus()
  console.error(`[AI] ${task} failed on all candidates${exhausted ? " (free capacity exhausted)" : ""}`)
  return { content: null, model: null, attempts, exhausted, retryAfterMs: status.earliestReset }
}
