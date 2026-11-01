// Provider adapters. Each call returns a uniform result:
//   { ok, content, usage: { input, output, cached, estimated }, status, errorKind, retryAfterMs }
//
// errorKind (drives recovery in ai/router.js):
//   auth              key rejected (401/403, invalid key)            → that key is dead
//   restricted        account has no free access (limit 0)           → provider off for hours
//   billing           payment / balance required (402, Zhipu 1113)   → provider off for a day
//   quota_exhausted   daily free allocation used up                  → off until next UTC day
//   rate_limit        short-term limit (429)                         → cool down per headers
//   model_unavailable model ID unknown/retired (404, Zhipu 1211)     → that model off for a day
//   http | timeout | network | empty                                 → transient failure
// Credentials never appear in results or logs.

export class PaidRequestBlocked extends Error {}

const estimateTokens = (text = "") => Math.ceil(text.length / 4)

// "1m26.4s", "622ms", "2s", "30" (seconds) → milliseconds
export function parseDuration(v) {
  if (v == null || v === "") return null
  const s = String(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000)
  let ms = 0, matched = false
  for (const [, n, unit] of s.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true
    ms += parseFloat(n) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[unit]
  }
  return matched ? Math.round(ms) : null
}

function retryAfterMs(headers) {
  const candidates = ["retry-after", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens", "x-ratelimit-reset"]
    .map(h => parseDuration(headers.get(h))).filter(v => v != null && v >= 0)
  return candidates.length ? Math.max(...candidates) : null
}

// Classifies a non-2xx response using status, provider error codes and headers.
export function classifyError(status, bodyText, headers) {
  let body = {}
  try { body = JSON.parse(bodyText) } catch { /* plain text */ }
  const err  = body.error || body.errors?.[0] || body
  const code = String(err.code ?? body.code ?? "")
  const msg  = String(err.message ?? body.message ?? bodyText ?? "").toLowerCase()

  if (status === 401 || status === 403 || /invalid_api_key|incorrect api key|user not found/.test(msg + code)) return "auth"
  if (status === 402 || code === "1113" || /payment required|insufficient balance|billing|余额不足|充值/.test(msg)) return "billing"
  if (status === 404 || code === "1211" || code === "model_not_found" || /model .*(not found|does not exist|decommissioned)|模型不存在/.test(msg)) return "model_unavailable"
  if (status === 429 || status === 413 || code === "1302" || code === "1303" || code === "4006") {
    if (headers.get("x-ratelimit-limit-req-minute") === "0" || headers.get("x-ratelimit-limit-requests") === "0") return "restricted"
    if (code === "4006" || /daily|per day|free allocation|neurons|quota (exceeded|exhausted)/.test(msg)) return "quota_exhausted"
    return "rate_limit"
  }
  return "http"
}

async function postJson(url, headers, body, timeoutMs) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    return { res }
  } catch (e) {
    return { error: e.name === "AbortError" ? "timeout" : "network" }
  } finally {
    clearTimeout(timer)
  }
}

function extractContent(kind, data) {
  const r = kind === "cloudflare" ? data?.result : data
  if (typeof r?.response === "string") return r.response
  if (Array.isArray(r?.response)) return r.response.map(x => x.response || x.text || "").join("")
  return r?.choices?.[0]?.message?.content || r?.response?.content || ""
}

function extractUsage(kind, data, prompt, content) {
  const u = kind === "cloudflare" ? (data?.result?.usage || data?.usage) : data?.usage
  if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
    return {
      input:     u.prompt_tokens ?? estimateTokens(prompt),
      output:    u.completion_tokens ?? estimateTokens(content),
      cached:    u.prompt_tokens_details?.cached_tokens ?? 0,
      estimated: u.prompt_tokens == null || u.completion_tokens == null,
    }
  }
  return { input: estimateTokens(prompt), output: estimateTokens(content), cached: 0, estimated: true }
}

// Defence in depth for the free-only rule: refuse anything that could bill.
export function assertFree(provider, entry) {
  if (entry.tier !== "free") throw new PaidRequestBlocked(`Refusing non-free model ${entry.id}`)
  if (provider.requireFreeSuffix && !entry.model.endsWith(":free")) throw new PaidRequestBlocked(`Refusing non-free model ${entry.id}`)
}

const NO_USAGE = { input: 0, output: 0, cached: 0, estimated: true }

export async function callModel(provider, entry, credential, prompt, { timeoutMs, maxTokens, minChars = 20 }) {
  assertFree(provider, entry)
  const messages = [{ role: "user", content: prompt }]
  let url, headers, body
  if (provider.kind === "cloudflare") {
    url     = `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/ai/run/${entry.model}`
    headers = { Authorization: `Bearer ${credential.key}` }
    body    = { messages, max_tokens: maxTokens }
  } else {
    url     = provider.url
    headers = { Authorization: `Bearer ${credential.key}`, ...(provider.headers?.() || {}) }
    body    = { model: entry.model, messages, temperature: 0.7, max_tokens: maxTokens, ...(entry.extraBody || {}) }
  }

  const { res, error } = await postJson(url, headers, body, timeoutMs)
  if (error) return { ok: false, errorKind: error, status: null, usage: { ...NO_USAGE, input: estimateTokens(prompt) } }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    return { ok: false, errorKind: classifyError(res.status, text, res.headers), status: res.status, retryAfterMs: retryAfterMs(res.headers), usage: NO_USAGE }
  }

  let data
  try { data = await res.json() } catch { return { ok: false, errorKind: "http", status: res.status, usage: NO_USAGE } }
  const content = extractContent(provider.kind, data)
  const usage   = extractUsage(provider.kind, data, prompt, content)
  if (!content || content.length < minChars) return { ok: false, errorKind: "empty", status: res.status, usage }
  return { ok: true, content, usage, status: res.status }
}
