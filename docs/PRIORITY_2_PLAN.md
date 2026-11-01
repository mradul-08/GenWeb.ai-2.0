# Priority 2 — Implementation Plan: AI architecture

Scope (approved):
1. Remove hardcoded design assumptions.
2. Requirement-driven design.
3. Correct edit classification.
4. Provider-independent routing with fallbacks.
5. Token, cost and quality tracking, plus per-user quotas, spending limits and admin-configurable models.

Out of scope: multi-file projects (Priority 3), UI redesign, deployment.

## 1. Current problems (from the audit and the verification run)

| Issue | Evidence |
| --- | --- |
| Fixed visual brief: dark `#0a0a0f`, 5 accents, Inter, glassmorphism, fixed sections | `MASTER_PROMPT` in `website.controller.js` |
| Keyword classifier misroutes edits: "add a dark mode toggle" → style-only, so no button or JS can be added | `classifyEdit` |
| Providers are hardcoded: 7 copy-pasted callers, fixed order, mislabelled models ("DeepSeek" is really `llama-3.1-8b:free`) | `config/openRouter.js` |
| No token, cost or outcome data | — |
| Real run: Cerebras 402, OpenRouter and SambaNova keys dead, ZhipuAI 429; only Cloudflare worked | verification log |

## 2. Design

### 2.1 Module layout (`server/ai/`)

| File | Responsibility |
| --- | --- |
| `catalog.js` | Providers (endpoint type, key env vars, cooldown rules) and the model catalog: id, provider, model name, tier `free`/`paid`, price per 1M tokens in/out, tasks, priority, default enabled |
| `keyPool.js` | Key rotation, cooldowns and dead-key tracking (moved from `openRouter.js`, one class for keys and Cloudflare accounts) |
| `providers.js` | One adapter for OpenAI-compatible APIs (Groq, Mistral, ZhipuAI, Cerebras, SambaNova, OpenRouter, any future one) and one for Cloudflare Workers AI. Returns content + token usage + a classified error |
| `router.js` | `runTask({ task, prompt, maxTokens, deadline, ctx })`. Picks candidates for the task (enabled, keys available, budget allows), tries them in priority order (rotating within equal priority), falls back, and records every attempt |
| `config.js` | Defaults plus admin overrides stored in MongoDB (`ai_config`), cached 30 s, validated on update |
| `usage.js` | Writes `ai_calls` (one row per provider attempt) and `ai_requests` (one row per user action: outcome, attempts, totals, validation result); spend queries for budgets |
| `intent.js` | Edit-intent analyser that replaces `classifyEdit` |
| `prompts.js` | Design-brief prompt + parser, generation prompt, edit prompts, enhance prompt |

`config/openRouter.js` is removed; the controller calls the router.

### 2.2 Requirement-driven design

**Before generation:**
- A cheap `design_brief` task (free fast model, ≤ 700 output tokens) returns JSON:
  `{ siteType, audience, tone, colorMode, palette{primary,secondary,accent,background,surface,text}, typography{heading,body}, layoutStyle, sections[], imagery, motion }`.
- The brief must honour the user's explicit choices (the style preset, palette and sections the Generate page already appends to the prompt).
- It is validated: hex colours, short strings, at most 12 sections.

**Generation prompt:**
- Keeps the output contract (JSON header + one complete HTML document).
- Keeps engineering rules: semantic HTML, responsive, accessible contrast, no external CSS frameworks, real content and no lorem ipsum.
- Takes **all visual decisions from the brief**.

**If the brief fails:** the generation prompt tells the model to derive the design from the requirements, with an explicit instruction **not** to default to a dark/glassmorphism template.

### 2.3 Edit-intent analysis

The analyser detects what each request needs:
- **markup:** add, insert, button, toggle, form, link, image, new section…
- **style:** colour, font, spacing, layout, responsive…
- **script:** toggle, click, interactive, validation, counter, carousel, dark-mode switch, scroll behaviour…

It also detects a target section and pure text changes. The mode is chosen from those needs:

| Needs | Mode |
| --- | --- |
| style only | `style_only` (`<style>` block) |
| text only, known section | `section_patch` |
| new self-contained section, no script | `section_add` |
| animation CSS/JS only | `style_script_patch` |
| markup **and** script, or several areas, or unclear | `full` |

Every routing decision is covered by unit tests, including the known misroutes (dark-mode toggle, back-to-top button, form validation).

### 2.4 Routing, fallback and budgets

**Free models by default.** Paid models are only considered when **all** of these hold:
- `paidEnabled = true`;
- the model is enabled;
- it has prices configured;
- the estimated cost fits the remaining **monthly budget** and the user's **daily paid limit**.

**Paid use policy:**
- Default: only as a **fallback** after free models fail.
- An admin can list tasks where paid goes first (e.g. `repair`, later `generate`).

**Error handling:**

| Response | Action |
| --- | --- |
| 401 / 403 | Key dead |
| 402 | Key exhausted for 24 h (billing required) |
| 429 / 413 | Provider-specific cooldown |
| Other errors, timeouts | Counted; 3 in a row → 3-minute cooldown |

**Per-user quota:** a daily AI request limit (`perUserDailyRequests`, default 60) → 429. This is on top of credits.

### 2.5 Tracking

**`ai_calls` (one row per provider attempt):**
- user, task, requestId, provider, model, tier, outcome;
- HTTP status, latency;
- input/output/cached tokens (from the provider's `usage`; estimated from length if missing, flagged `estimated`);
- cost in USD.

**`ai_requests` (one row per generate/edit/enhance):**
- outcome, edit mode, whether it fell back to a full rewrite, validation pass/fail reasons;
- attempts, total tokens, total cost, duration.

**Metrics derived from these:** success rate per model/task, p50/p95 latency, tokens and **cost per successful request**.

### 2.6 Admin (API only)

- New field `users.role` (`user` default, `admin`).
- Admin can only be granted with `scripts/set-admin.js --uri … --email …` (server-side), never from the client.
- Endpoints, all behind `requireAdmin`:

| Method | Endpoint |
| --- | --- |
| GET / PUT | `/api/admin/ai/config` |
| GET | `/api/admin/ai/usage?days=` |
| GET | `/api/admin/ai/providers` |
| GET | `/api/admin/ai/estimate` |

## 3. Paid-model cost estimates (none enabled by default)

Prices are third-party snapshots from Nov 2026 and must be checked on the provider pricing pages before enabling:
- Cerebras `gpt-oss-120b`: $0.35 in / $0.75 out per 1M ([usagepricing.com](https://usagepricing.com/blueprint/cerebras), [vorplabs.com](https://vorplabs.com/workflows/platform/cerebras-inference-evaluation)).
- OpenRouter `deepseek/deepseek-chat` (DeepSeek V3): ~$0.23 in / ~$0.91 out per 1M ([openrouter.ai](https://openrouter.ai/deepseek/deepseek-chat/pricing)).

**Token assumptions** (to be replaced by measured `ai_calls` data):
- generation ≈ 2.5k in / 10k out;
- section edit ≈ 3k in / 2k out;
- full edit ≈ 15k in / 12k out;
- design brief ≈ 0.6k in / 0.5k out.

| Model | Generation | Section edit | Full edit | 1,000 generations + 3,000 edits / month |
| --- | --- | --- | --- | --- |
| Cerebras gpt-oss-120b (paid tier) | ≈ $0.0084 | ≈ $0.0026 | ≈ $0.0143 | ≈ $8.4 + $7.8–$43 ≈ **$16–$51** |
| DeepSeek V3 via OpenRouter | ≈ $0.0097 | ≈ $0.0025 | ≈ $0.0144 | ≈ $9.7 + $7.5–$43 ≈ **$17–$53** |

**Revenue comparison:** the Starter pack sells 100 credits for ₹499, i.e. two generations. At ≈ $0.01 per paid generation, AI cost stays well under 1 % of revenue per generation.

**Defaults shipped:** `paidEnabled: false`, `monthlyBudgetUsd: 0`, `perUserDailyPaidUsd: 0.10`. Enabling paid models is an explicit admin change after you review these numbers.

Note: the Cerebras key currently returns **402**. That account's free allowance appears exhausted, so turning on its paid tier is mostly a billing decision in the Cerebras console.

## 4. API / DB changes

**New collections:** `ai_calls`, `ai_requests`, `ai_config`.

**`users`:** + `role` (default `user`).

**API:**
- New: `/api/admin/ai/*`.
- Unchanged contracts: `/api/website/generate`, `PUT /api/website/:id`, `/api/website/enhance-prompt`, `/api/website/status`. These may now also return `429` (daily quota).

**Migration:** none. All additions are additive and old documents read `role` as `user`.

## 5. Tests

- **Intent:** a routing table for 20+ phrasings, including the known misroutes.
- **Router (fetch stubbed):**
  - priority order and fallback;
  - dead, 402 and 429 key handling;
  - paid models skipped when disabled, over the monthly budget or over the user's daily limit;
  - paid used as fallback when allowed;
  - usage rows with tokens and cost;
  - deadline respected.
- **Prompts:**
  - the generation prompt contains none of the old hardcoded values;
  - the brief parser rejects invalid colours;
  - the brief is honoured in the prompt.
- **API:**
  - generate with a stubbed provider records `ai_requests` + `ai_calls` and validation;
  - quota 429;
  - admin endpoints: 401 / 403 for non-admins, config validation, usage aggregation.
- **Regression:** all existing tests stay green.

## 6. Rollback

- Code-only: redeploy the previous build.
- The new collections can be left or dropped; nothing existing is modified.
