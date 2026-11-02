// Provider definitions and the FREE-ONLY model catalog.
//
// Business rule: GenWeb.ai never makes a paid API request. Only models that are
// free on the provider's free plan are listed; there is no paid tier, no price
// field and no way to add models at runtime (admins can only enable/disable or
// reprioritise these). Never attach a payment method to these provider accounts.
//
// Model IDs and limits below were verified with real API calls on 2026-11-01
// (see GENWEB_AI_2_IMPLEMENTATION_STATUS.md, section 12). Excluded on purpose:
// Cerebras (every key/model now returns 402 "Payment required") and ZhipuAI
// glm-4.5-air (error 1113: requires a paid balance; glm-4.5-flash is free).
//
// quotaScope: always "provider" — every key/account configured for a provider
// shares ONE free quota (see ai/keyPool.js). Several keys or accounts never
// multiply a free-tier limit; configure one account per provider. (Provider
// terms, e.g. Groq's Acceptable Use Policy, forbid using extra accounts to
// exceed limits.)

const keysFromEnv = (prefix) =>
  [1, 2, 3, 4, 5].map(i => process.env[`${prefix}_${i}`]).filter(Boolean).map(key => ({ key }))

export const TASKS = ["generate", "edit", "design_brief", "enhance", "plan", "content"]

export const PROVIDERS = {
  groq: {
    kind: "openai", url: "https://api.groq.com/openai/v1/chat/completions",
    credentials: () => keysFromEnv("GROQ_API_KEY"), quotaScope: "provider",
    // Observed response headers: 1000 requests/day, 8000 tokens/minute; a single
    // request's input + max_tokens must fit inside the per-minute token budget.
    limits: { requestsPerDay: 1000, maxRequestTokens: 8000 },
    rateLimitCooldownHours: 0.02,
  },
  zhipu: {
    kind: "openai", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    credentials: () => keysFromEnv("ZHIPU_API_KEY"), quotaScope: "provider",
    limits: {}, rateLimitCooldownHours: 0.1,
  },
  cloudflare: {
    kind: "cloudflare",
    credentials: () => [1, 2, 3, 4, 5]
      .map(i => ({ key: process.env[`CLOUDFLARE_API_KEY_${i}`], accountId: process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`] }))
      .filter(c => c.key && c.accountId),
    quotaScope: "provider",
    limits: {}, rateLimitCooldownHours: 0.1,
  },
  mistral: {
    kind: "openai", url: "https://api.mistral.ai/v1/chat/completions",
    credentials: () => keysFromEnv("MISTRAL_API_KEY"), quotaScope: "provider",
    limits: {}, rateLimitCooldownHours: 0.05,
  },
  sambanova: {
    kind: "openai", url: "https://api.sambanova.ai/v1/chat/completions",
    credentials: () => keysFromEnv("SAMBANOVA_API_KEY"), quotaScope: "provider",
    limits: {}, rateLimitCooldownHours: 1,
  },
  openrouter: {
    kind: "openai", url: "https://openrouter.ai/api/v1/chat/completions",
    credentials: () => keysFromEnv("OPENROUTER_API_KEY"), quotaScope: "provider",
    limits: {}, rateLimitCooldownHours: 1,
    headers: () => ({ "HTTP-Referer": process.env.SITE_URL || "https://genweb.ai", "X-Title": "GenWeb.ai" }),
    // OpenRouter bills non-":free" models against account credit; only free IDs are callable.
    requireFreeSuffix: true,
  },
}

const LONG  = ["generate", "edit", "content"]
const SHORT = ["design_brief", "enhance", "plan"]

// lockedReason: the model is unusable with the current accounts. Locked models
// stay disabled regardless of admin overrides; unlocking requires editing this
// file after a real successful call (see the status document, section 12.1).
// extraBody: provider-specific request fields (e.g. keep reasoning short so
// tokens go to the page, not to hidden thinking).
export const DEFAULT_MODELS = [
  // ── Verified working (real calls, 2026-11-01) ──
  { id: "groq/gpt-oss-120b",        provider: "groq",       model: "openai/gpt-oss-120b",  tasks: [...LONG, ...SHORT], priority: { generate: 10, edit: 10, design_brief: 20, enhance: 20 }, enabled: true,  extraBody: { reasoning_effort: "low" } },
  { id: "groq/gpt-oss-20b",         provider: "groq",       model: "openai/gpt-oss-20b",   tasks: [...SHORT],          priority: { design_brief: 10, enhance: 10 }, enabled: true, extraBody: { reasoning_effort: "low" } },
  { id: "groq/qwen3.8-27b",         provider: "groq",       model: "qwen/qwen3.8-27b",     tasks: [...LONG, ...SHORT], priority: { generate: 30, edit: 30, design_brief: 30, enhance: 30 }, enabled: true },
  { id: "zhipu/glm-4.5-flash",      provider: "zhipu",      model: "glm-4.5-flash",        tasks: [...LONG, ...SHORT], priority: { generate: 10, edit: 10, design_brief: 20, enhance: 20 }, enabled: true, extraBody: { thinking: { type: "disabled" } } },
  { id: "cloudflare/llama-3.3-70b", provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", tasks: [...LONG, ...SHORT], priority: { generate: 10, edit: 10, design_brief: 20, enhance: 30 }, enabled: true },

  // ── Free on paper but unusable with the current accounts (kept disabled) ──
  // Mistral: every key reports a limit of 0 requests/minute (account not enabled for the free plan).
  { id: "mistral/mistral-small",    provider: "mistral",    model: "mistral-small-latest", tasks: [...LONG, ...SHORT], priority: { generate: 20, edit: 20, design_brief: 10, enhance: 10 }, enabled: false, lockedReason: "All keys report a limit of 0 requests/minute (no free API access) — 2026-11-01" },
  // SambaNova: every key is rejected as invalid (401).
  { id: "sambanova/llama-3.3-70b",  provider: "sambanova",  model: "Meta-Llama-3.3-70B-Instruct", tasks: [...LONG], priority: { generate: 10, edit: 10 }, enabled: false, lockedReason: "All keys rejected as invalid (401) — 2026-11-01" },
  // OpenRouter: every key returns "User not found"; IDs are current :free models.
  { id: "openrouter/gemma-4-31b-free", provider: "openrouter", model: "google/gemma-4-31b-it:free", tasks: [...LONG, ...SHORT], priority: { generate: 30, edit: 30, design_brief: 30, enhance: 30 }, enabled: false, lockedReason: "All keys return \"User not found\" (accounts deleted) — 2026-11-01" },
].map(m => ({
  ...m, tier: "free",
  // Planning is a short structured task like the design brief: same model preference.
  priority: {
    ...(m.tasks.includes("plan") ? { plan: m.priority.design_brief ?? m.priority.enhance } : {}),
    // Hybrid content writing needs the same strong models as generation.
    ...(m.tasks.includes("content") ? { content: m.priority.generate } : {}),
    ...m.priority,
  },
}))
