# GenWeb.ai v2 — changes from v1

## Security
- **Sign-in is verified on the server.** The client signs in with Firebase (Google or email/password) and sends a Firebase ID token. The server checks the token against Google's signing keys and only trusts the email inside it. Email/password accounts must verify their email first. "Forgot password" now sends a reset link.
- **Payments are credited from the server-side order.** The credit pack comes from the Razorpay order notes, and the order's amount and owner are checked. Each order and payment can be credited only once (`Payment` collection with unique indexes). The signature is compared in constant time.
- **CSRF guard.** POST/PUT/PATCH/DELETE requests to `/api/*` from unknown origins are rejected (`middlewares/checkOrigin.js`).
- **Deployed sites are sandboxed.** `/s/:slug` is served with a CSP `sandbox` header, so a published page can no longer call the API with a visitor's session. A small in-memory `localStorage` replacement keeps theme toggles working.
- Removed `server/test.mjs`, which contained a hardcoded API key.

## Bug fixes
- Direct code edits, undo and redo are saved to the server (`PATCH /api/website/:id/code`), and deploy publishes the code shown in the editor.
- Ctrl+Z / Ctrl+Y undo and redo more than one step, and no longer take over typing in text boxes.
- Credits are reserved atomically before AI work and refunded if it fails, so parallel requests can't overspend.
- Generation and edits stop at about 200 s, before the client's 240 s timeout, so a user is never charged for a result they never received.
- AI keys that hit a rate limit come back after their cooldown instead of at the next UTC midnight.
- HTML patching:
  - Nested elements are matched correctly.
  - Class names are matched as whole words.
  - `$` sequences in AI output are inserted literally.
  - Text edits keep the page's scripts.
  - New sections go before the footer.
- Logout works in production (it previously called `localhost`) and also signs out of Firebase.
- `isAuth` returns 401 (not 500) for bad sessions; invalid website ids return 404.
- The dashboard list no longer downloads each site's full HTML.
- `MONGODB_URI` (the documented name) works; `MONGODB_URL` still works too.

## Cleanup
- Removed unused `utils/classifier.js`, `utils/templateLoader.js`, the empty `templates/` files, the unused `stripe` dependency and the unused `components/DeployModal.jsx`.
- `.gitinore` renamed to `.gitignore`.

## Setup needed before running v2
1. Firebase console → Authentication: Google and **Email/Password** providers must be enabled (Email/Password verified enabled by a real sign-up on 2026-11-01; Google not re-verified here).
2. Optional: set `FIREBASE_PROJECT_ID` in `server/.env` (defaults to `genwebai-dca16`).
3. Existing users: Google users sign in as before. Users who signed up with email in v1 never had a password, so they choose "Create Account" once with the same email, verify it, and their old account and projects are linked automatically.

---

# Priority 1 — security and financial correctness (2026-11-01)

See `docs/PRIORITY_1_PLAN.md` for the design and `GENWEB_AI_2_IMPLEMENTATION_STATUS.md` for test results.

## Payments and credits
- **Razorpay webhook** `POST /api/payment/webhook` (`order.paid`, `payment.captured`). The signature is checked over the raw body with `RAZORPAY_WEBHOOK_SECRET`. Paid orders are now credited even if the browser never calls `/verify`.
- **Credit ledger** (`credit_transactions`). Every balance change is written in the same MongoDB transaction as a ledger row with a unique idempotency key: signup bonus, purchase, spend, refund, opening balance.
- `/verify` and the webhook share one crediting function. Repeats and concurrent deliveries grant credits exactly once (tested).
- Generation and edit charges are reserved through the ledger. Refunds are idempotent.
- `scripts/migrate-credit-ledger.js` (dry-run / apply / rollback) and `scripts/reconcile-credits.js`.

## Auth and access
- Email matching on sign-in is case-insensitive, so v1 accounts with mixed-case emails are linked, not duplicated.
- Concurrent first sign-ins create exactly one account.
- Session revocation: `tokenVersion` in the JWT, plus `POST /api/auth/logout-all`. Existing sessions stay valid.
- Rate limits: global per-IP limit; per-user limits for sign-in, AI, enhance, save and payments; `429` with `Retry-After`.
- Editor and Generate previews run in an opaque-origin sandbox (`srcDoc`, no `allow-same-origin`). Verified in headless Edge: the generated site cannot read the parent DOM or cookies.

## Reliability and hygiene
- The server connects to the DB and creates indexes **before** it starts listening (unique indexes required for payment idempotency). New indexes:
  - `websites {user, createdAt}`
  - `payments {user, createdAt}`
  - `credit_transactions {idempotencyKey unique}` and `{user, createdAt}`
- `GET /health`. Graceful shutdown on SIGTERM.
- 5xx responses no longer include internal error messages. A JSON error handler covers malformed or oversized bodies.
- AI keys: 3 consecutive failed responses put a key on a 3-minute cooldown.
- `app.js` / `index.js` split, so the API can be tested with supertest. `.env` is loaded once at startup.
- 42 automated server tests (`npm test`). `server/.env.example` and `client/.env.example` added.

---

# Priority 2 — AI architecture (2026-11-01)

See `docs/PRIORITY_2_PLAN.md` for the design and cost estimates.

## Design driven by the request
- Removed `MASTER_PROMPT`'s fixed design: dark `#0a0a0f`, five accents, Inter, glassmorphism and mandatory sections.
- Every generation now starts with a **design brief**: a short task on a cheap model returning colour mode, palette, fonts, layout, sections and motion. It is validated (hex colours, font names, WCAG AA contrast is auto-fixed) and handed to the generator. If the brief fails, the generator is told to derive the design from the request and not fall back to a generic dark template.
- The user's text is delimited, and `"""` inside it is neutralised.

## Edit routing
- `ai/intent.js` replaces the first-keyword classifier. It detects whether a request needs markup, style or script, and picks the smallest safe mode.
- "Add a dark mode toggle", back-to-top buttons and form validation now get a full-document edit instead of a style-only one.
- "Add X to the hero" patches that section. "Add a newsletter section" inserts a new one before the footer.
- A patch is only accepted if it adds no structural problems to the page and does not lose most of it. Otherwise the edit falls back to a full rewrite, and that fallback is recorded.

## Routing, fallback, budgets
- `ai/` modules: model catalog, one OpenAI-compatible adapter plus a Cloudflare adapter, key pools, and a router with fallback by priority (load is rotated within equal priority).
- **Error handling:**
  - 401/403 → key dead;
  - 402 → 24 h billing cooldown;
  - 429 → provider-specific cooldown;
  - repeated errors → 3-minute cooldown.
- **Paid models** are in the catalog but **disabled**. They are used only when an admin enables them, prices are set, and the monthly budget and per-user daily paid limit allow the estimated cost. By default they are a fallback; admins can make them first for specific tasks.
- **Per-user daily AI request quota** (default 60) → `429`.

## Tracking and admin
- `ai_calls` stores each provider attempt: tokens (provider-reported or flagged as estimated), cost, latency, outcome, HTTP status.
- `ai_requests` stores each user action: outcome, failure reason, validation reasons, edit mode, full-rewrite fallback, design brief status, totals.
- **Admin API** (`users.role = admin`, granted only via `scripts/set-admin.js`):
  - `GET/PUT /api/admin/ai/config` (validated);
  - `/usage`, `/estimate` (measured token averages × paid prices), `/providers`.
- `config/openRouter.js` removed. HTML patch helpers moved to `ai/htmlPatch.js`.

## Tests
- 105 server tests pass (57 new: intent 27, prompts 8, router 12, AI API 10; the old classifier test was removed and patch tests moved).
- Live smoke test against the real free-tier providers: fallback chain, real token usage, and brief → generation with the brief's colours.

---

# Hardening — free-only AI, quotas, efficiency (2026-11-01)

Business rule: **₹0 budget**. GenWeb.ai never makes a paid API request.

## Free-only enforcement
- **Paid models removed from the catalog.**
  - Cerebras is removed entirely: every key and model now returns 402 "Payment required".
  - ZhipuAI `glm-4.5-air` is removed (error 1113: needs a paid balance) and replaced by the free `glm-4.5-flash`.
- **No paid configuration.** The router only considers `tier: "free"` models. Budget, price and paid-fallback code is deleted.
- **Defence in depth:**
  - `assertFree()` refuses any non-free model before the HTTP call;
  - OpenRouter models must end in `:free`;
  - admin config rejects any paid field (`paidEnabled`, budgets, prices, tier) with a "free-only" error, and only catalog models can be configured.
- When every free provider is out of capacity, generate, edit and enhance return **503 `AI_QUOTA_EXHAUSTED`** with `Retry-After` and a clear message. No credits are charged and the daily request slot is returned.

## Quotas
- **Per-user daily AI requests:** atomic reservation (`ai_counters`, conditional upsert) instead of count-then-check. 50 parallel reservations against a limit of 5 grant exactly 5 (tested). The slot is released when a request fails for system reasons.
- **Account-level provider quotas.** Several keys for one provider share ONE quota: a rate limit, billing, restriction or daily-quota response from any key pauses the whole provider. Rotating keys is never used to get around a limit. Cloudflare credentials are per account (token + account ID).
- **Provider limits from real response headers:** Groq 1000 requests/day (atomic daily counter) and an 8000-token per-request budget (`max_tokens` capped; oversized requests skip Groq).
- **Error classification from real responses:**

| Response | Classified as | Action |
| --- | --- | --- |
| 401 / invalid key / "User not found" | `auth` | that key is dead |
| 402 / Zhipu 1113 / "insufficient balance" | `billing` | provider off 24 h |
| 429 with `limit = 0` (Mistral) | `restricted` | provider off 6 h |
| Cloudflare 4006 / "daily allocation" | `quota_exhausted` | off until next UTC day |
| 429 otherwise | `rate_limit` | `Retry-After` / `x-ratelimit-reset-*` honoured |
| 404 / Zhipu 1211 | `model_unavailable` | that model off 24 h |

## Providers (verified with real calls)
- Groq model IDs updated: `llama-3.1-8b-instant` is retired. `openai/gpt-oss-120b`, `openai/gpt-oss-20b` and `qwen/qwen3.8-27b` are used, with `reasoning_effort: low`.
- ZhipuAI uses `glm-4.5-flash` with thinking disabled.
- Cloudflare adapter handles the new `result.choices` response shape.
- Disabled (unusable with the current accounts): Mistral (0 requests/minute), SambaNova (invalid keys), OpenRouter (accounts not found; IDs updated to current `:free` models).

## Efficiency
- **Compact prompts:** each rule stated once; the generation template is 270 tokens, down from 371 for v1's `MASTER_PROMPT`.
- **Generation strategy** is configurable (`designStrategy`: `auto` / `single` / `brief`); see the benchmark in the status document.
- **Style edits:** the model returns only override rules, appended as `<style data-gw-edit>`.
- **Text edits:** the model returns exact `find`/`replace` pairs. They must be unique, outside scripts and contain no tags; otherwise the edit falls back to a full rewrite.
- **Deterministic validation before AI repair** (`ai/validate.js`):
  - JavaScript is compiled with `vm.Script`, never run;
  - checks for duplicate IDs, unbalanced tags, lost scripts or sections, lost content, missing closing tags;
  - safe repairs (doctype, closing tags of a truncated page) need no AI call;
  - broken scripts get a script-only repair call instead of a regeneration.
- **Cache:** identical prompts reuse the design brief for 30 minutes; prompt enhancements are cached for 24 hours. Whole sites are never cached.
- **Totals:** every request's tokens include all attempts — failures, planning and repairs. Edits return their measured tokens. The editor shows them instead of the previous hardcoded "% tokens saved" estimate.

### Hardening — measured results and fixes found in verification
- **`designStrategy: "auto"` = single call**, from the benchmark (`benchmarks/2026-11-01/`):
  - single: 3,026 tokens, 1 call, 39/39 requirements;
  - brief + generation: 3,440 tokens, 2 calls, 37/39.
- **Text edits in small sections** (< 1,500 chars) use a section patch. For those, measured find/replace was not cheaper. Large sections and body-level edits use find/replace (−92% output tokens measured).
- **Provider health is evidence-based:** `verified` only after a real successful call in the last hour; otherwise `unverified` / `paused` / `invalid_credentials` / `no_credentials` / `disabled`. Before this, untested and disabled providers showed as "available".
- **Fixed:** admin model overrides were stored as dotted MongoDB keys (`glm-4.5-flash`), so they silently failed to apply. They are now stored as an array.
- **Fixed (E2E):** the editor reloaded after every AI edit, because the load effect depended on the whole user object, which changes when credits refresh. This wiped the undo history and the per-edit badges. It now depends on the user ID only. The bug also exists in v1.
- **Fixed:** the router's generation-sized minimum output wrongly skipped small edits as "request too large" and reported them as exhausted capacity.
- 145 server tests pass.

---

# Correction pass after the hardening review (2026-11-01)

## Quotas and capacity
- **Fixed:** a provider paused for repeated *transient* errors was reported as "free capacity exhausted".
  - Classification is now explicit: capacity (`rate_limit`, `quota_exhausted`, `daily_request_cap`, `restricted`, `billing`) / neutral (keys, retired model, size) / transient.
  - "Exhausted" requires a capacity reason and no transient failure.
- **Tests added:**
  - provider daily cap → 503 `AI_QUOTA_EXHAUSTED` with `Retry-After` at the next UTC day;
  - user cap → 429 `DAILY_LIMIT` independently of providers;
  - the user slot is released exactly once (AI failure, server error after AI success, edit failure, concurrent failures).

## Providers
- **Locked models.** Mistral, SambaNova and OpenRouter have a `lockedReason`:
  - admin config rejects enabling them;
  - stored overrides are ignored;
  - health shows `disabled`.
- **Property test:** with every provider failing, every request made goes to an enabled, unlocked, free catalog model.
- **Documented** which state is MongoDB-backed and which is process-local. **Not multi-instance ready** (status doc 15.2).

## Generation quality (no extra AI call)
- **Prompt (+121 input tokens):**
  - colours from the business's own world, avoiding generic blue-on-white;
  - no external image URLs;
  - mobile layout rules (collapse sidebar/nav, no overlap);
  - every requested feature and content implemented first.
- **`ai/sanitize.js`:** `<img>` sources that cannot load become inline SVG placeholders; external CSS backgrounds are removed. Covered: external URLs not given by the user, empty `src`, relative paths. Kept: fonts, `data:` images, user URLs.
- **Benchmark vs the single-call baseline** (same 7 prompts and model):

| | Baseline | New prompt |
| --- | --- | --- |
| Avg tokens per site | 3,026 | 3,306 (+9%) |
| Requirements met | 39/39 | 39/39 |
| Broken images | 3 | 0 |
| Mobile overlaps | 1 | 0 |
| Blue primaries | 4 of 7 | 2 of 7 |
| Hue families | 3 | 5 |

- Details and new defects: status doc 15.4.

## Verification
- 157 server tests pass (145 + 12 new). Client build passes.
- Browser E2E on a fresh test DB: generate, CSS / text / functional edits (the functional edit was click-tested), undo/redo after AI edit, save, deploy/undeploy and the daily-quota UI all pass. Verified/Google login is still untested.
