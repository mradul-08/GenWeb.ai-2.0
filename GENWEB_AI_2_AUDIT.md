# GenWeb.ai 2.0 — Phase 0 Repository Audit

**Date:** 2026-11-01. **Scope:** read-only audit. No source code was changed, no packages were installed and no data was migrated for this deliverable.

**Codebases audited**
- **v1 (live):** `websiteBuilder/` (git repo `github.com/mradul-08/Genweb.ai`). The client is on Vercel (`genweb-ai-delta.vercel.app`), the API on Render (`genweb-ai-5o8k.onrender.com`) and the data in MongoDB Atlas.
- **v2 (working copy):** `websiteBuilder-v2/`. This is v1 plus the Phase-2-style security and bug fixes listed in `CHANGES.md`. v2 is **not deployed**, and it has not been tested end-to-end against a database (see Q).

**Labels:**
- **[C]** = confirmed from code. **[A]** = assumption, not verified (production data, hosting plan and provider quotas were not inspected).
- **Status:** "v1 open / v2 fixed" means the issue exists in the live product and is fixed in the v2 copy.

## Status update — Priority 1 completed in v2 (2026-11-01)

The sections below are the original Phase 0 findings and are kept unchanged as the baseline. This table records their current state in `websiteBuilder-v2`. **Nothing is deployed yet**, so every item below is still open in the live v1 product until v2 ships.

Evidence: `npm test` in `server/` (42/42 passing), a boot check of `index.js` against an in-memory replica set, and a headless Edge sandbox check. Details are in `GENWEB_AI_2_IMPLEMENTATION_STATUS.md`.

| ID | Issue | v2 status | Evidence / note |
| --- | --- | --- | --- |
| SEC-1, SEC-2 | Login without password / trusted client email | **Resolved** | Firebase ID token verification; 5 rejection tests |
| SEC-3, SEC-4 | Pack swap / payment replay | **Resolved** | Pack taken from the order; unique `payments` + ledger key; tests |
| SEC-5 | Deployed HTML on API origin | **Partially resolved** | CSP sandbox; separate deploy domain still recommended |
| SEC-6 | CSRF | **Resolved** | Origin check; tests |
| SEC-7 | Secrets in git history | **Outstanding — owner action** | Keys must be rotated in each provider dashboard |
| SEC-8 | No payment webhook | **Resolved** | `/api/payment/webhook`; webhook-only and concurrent tests. Needs dashboard configuration + secret |
| SEC-9 | No rate limiting | **Partially resolved** | In-memory limiter (correct for one instance); Redis store needed when scaling out |
| SEC-10 | No session revocation | **Partially resolved** | `tokenVersion` + `logout-all`; no per-device session list or UI yet |
| SEC-11 | Preview iframes with `allow-same-origin` | **Resolved** | `srcDoc` + opaque sandbox; browser-verified |
| SEC-12 | Free-tier key pooling vs ToS | **Outstanding** | Business decision; addressed by Priority 2 model strategy |
| SEC-13 | Credit check-then-deduct race | **Resolved** | Transactional reserve; 10-way concurrency test |
| DB-1 | Missing `websites.user` index | **Resolved** | `{user:1, createdAt:-1}` matches both list queries; created at startup |
| DB-3 | No credit ledger | **Resolved** | `credit_transactions` + migration and reconcile scripts |
| DB-4 | Payment history not reconstructable | **Partially resolved** | All new payments recorded; v1 history needs a Razorpay export if wanted |
| BE-4 | Raw error messages to clients | **Resolved** (server) | Generic 5xx messages; test for malformed JSON |
| BE-5 | Rate limiting | see SEC-9 | |
| BE-7 | Provider state in memory | **Outstanding** | Failure cooldown added; shared state is Priority 2 / scaling |
| BE-9 | Health / startup order / shutdown | **Resolved** (shutdown untested on Linux) | `/health`, DB + indexes before listen; SIGTERM handler not exercisable on Windows |
| AI-1 … AI-9, UI-*, the rest of BE-*/DB-* | — | **Outstanding** | Priority 2 / 3 / later phases, as approved |
| DB-7 | Production data not inspected | **Resolved (verification pass)** | Read-only backup → local test cluster: 6 users, 7 websites; migration rehearsal preserved all balances, 0 mismatches |

### Status update — Priority 2 implemented in v2 (2026-11-01, awaiting review)

| ID | Issue | v2 status | Evidence / note |
| --- | --- | --- | --- |
| AI-2 | Fixed visual brief in `MASTER_PROMPT` | **Resolved** | Prompt removed; per-request design brief; tests assert none of the old mandates remain; a live run produced a light, brief-coloured site |
| AI-3 | Weak, mislabelled models | **Partially resolved** | Honest model IDs, priority routing, paid models available behind a budget (disabled). Quality still limited by the free models |
| AI-4 | Classifier misroutes edits | **Resolved** | `ai/intent.js`; 27 routing tests including the dark-mode toggle |
| AI-5 | Cosmetic validation | **Partially resolved** | Structural checks with reasons (doctype, closing tags, style, balanced scripts); patch regressions rejected. No rendering check yet |
| AI-6 | No structured output | **Partially resolved** | The design brief is validated JSON; generation output contract unchanged (multi-file work in Priority 3) |
| AI-7 | Retries regenerate everything | **Partially resolved** | Retries only after validation failure, bounded by deadline; the router no longer re-tries every provider 3× |
| AI-8 | Prompt injection | **Partially resolved** | Delimited requests, `"""` neutralised, instructions to ignore embedded commands. Not a guarantee; output stays sandboxed |
| AI-9 | No token or cost accounting | **Resolved** | `ai_calls` / `ai_requests`; admin usage + estimate endpoints |
| AI-10 | Most providers failing | **Partially resolved** | Failures classified and routed around automatically; the keys and accounts themselves still need attention (owner) |
| BE-6 | Copy-pasted provider callers | **Resolved** | One OpenAI-compatible adapter + Cloudflare adapter |
| AI-11 (new) | Groq returns 404 for `llama-3.1-8b-instant` (model ID likely retired) | **Outstanding** | Update the catalog ID after checking Groq's current model list, or disable via admin config |

### Status update — hardening phase (2026-11-01, free-only)

| ID | Issue | v2 status | Evidence / note |
| --- | --- | --- | --- |
| SEC-12 | Multi-account / multi-key free-tier pooling vs provider terms | **Partially resolved** | Quotas are now account-level: keys of one provider never multiply limits. Real probes show the 5 Groq keys report independent limits, i.e. likely 5 separate accounts — owner must confirm this is permitted by each provider's terms |
| AI-3 | Weak / mislabelled models | **Partially resolved** | Catalog re-verified with real calls; working free models: Groq gpt-oss-120b / 20b, qwen3.8-27b; ZhipuAI glm-4.5-flash; Cloudflare llama-3.3-70b |
| AI-5 | Cosmetic validation | **Resolved** | `ai/validate.js`: JS compile check, duplicate IDs, unbalanced tags, lost scripts / sections / content; deterministic repair before AI repair |
| AI-7 | Wasteful retries | **Resolved** | Deterministic repair, script-only AI repair, max 2 document attempts, no retry when capacity is exhausted |
| AI-10 / AI-11 | Provider failures; Groq 404 | **Resolved (diagnosed)** | Groq 404 = retired model (IDs updated); Mistral 429 = account limit 0; Cerebras 402 = payment required (provider removed); SambaNova 401 = invalid keys; ZhipuAI 429 = error 1113 paid balance (switched to free glm-4.5-flash); OpenRouter = accounts not found |
| BILL-2 (new) | Paid AI fallback existed (disabled) | **Resolved** | Removed entirely; free-only guards + tests |
| QUOTA-1 (new) | Daily user quota was count-then-check (race) | **Resolved** | Atomic reservation; 50-way concurrency test |
| UI-13 (new) | Editor showed a hardcoded "~N% tokens saved" | **Resolved** | Replaced with measured tokens from the server |
| DB-9 (new) | Model IDs with dots corrupted admin overrides in MongoDB | **Resolved** | Stored as an array; covered by router tests |

### Status update — correction pass (2026-11-01)

| ID | Issue | Status | Evidence |
| --- | --- | --- | --- |
| QUOTA-2 (new) | Transient `repeated_errors` pause counted as "capacity exhausted" | **Resolved** | Explicit capacity / neutral / transient classification; tests |
| QUOTA-3 (new) | Provider vs user quota responses and slot release untested | **Resolved** | 4 API tests: 503 vs 429, `Retry-After` at the next UTC day, release exactly once incl. concurrency |
| AI-12 (new) | Disabled providers could be re-enabled by admin config | **Resolved** | `lockedReason`; validation rejects; stored overrides ignored |
| AI-13 (new) | Fabricated / empty / relative image URLs render broken | **Resolved for static HTML/CSS** | `ai/sanitize.js`; benchmark 3 → 0 broken images. Images inserted by page JS are not covered |
| AI-14 (new) | Generic blue/white designs, mobile overlap | **Partially resolved** | Blue primaries 4/7 → 2/7, hue families 3 → 5, mobile overlaps 1 → 0; Inter-heavy typography and a desktop-visible menu toggle remain |
| ARCH-1 (new) | Multi-instance readiness | **Outstanding (documented)** | Provider pauses, health, rate limiter and config cache are process-local (status doc 15.2) |

### New findings from the Priority 1 verification pass (confirmed)

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| DB-8 | Production has **no indexes except `_id`**, not even the unique `users.email` index | High | v2 creates them at startup; no duplicate emails exist today |
| BILL-1 | The live product uses **Razorpay test keys** (`rzp_test_`), so no real payments are collected | High (business) | Owner decision |
| AI-10 | In a real run: Cerebras 402, OpenRouter (4) and SambaNova (2) keys dead, ZhipuAI 429; only Cloudflare succeeded | High | Priority 2 |
| UI-12 | Dashboard "⬇ Export" and "⎘ Duplicate" menu items are no-ops (`action: () => {}`) | Low | UI phase |
| OPS-1 | No staging environment; one DB, Firebase project and Razorpay account for everything | High | Deployment blocker |
| — | Correction: the Firebase Email/Password provider **is enabled** (verified by a real sign-up); earlier setup notes assumed it needed enabling | — | — |

> The most important finding for the 2.0 plan: GenWeb.ai today generates **one self-contained HTML file per project**, stored as a string (`Website.latestCode`). It has no files, no build step, no dependencies and no runtime. Most of the 2.0 spec needs a different core: multi-file projects, a build/preview sandbox, job queues and object storage. That is a re-architecture of the generation and preview core, not an incremental feature. The rest of the product (auth, dashboard, billing, editor UI shell) can be evolved in place.

---

## A. Existing repository architecture

```text
Browser (React 19 SPA, Vite 8, Redux Toolkit, framer-motion, inline styles)
  │  fetch/axios, credentials: include (cookie "token", SameSite=None)
  ▼
Express 5 API (single Node process on Render)            [C] index.js
  ├─ /api/auth     Firebase-identity → JWT cookie (7d)
  ├─ /api/user     current user, website list
  ├─ /api/website  generate / enhance / edit / deploy / CRUD
  ├─ /api/payment  Razorpay orders + verification
  └─ /s/:slug      serves deployed HTML from MongoDB
        │
        ├─ MongoDB Atlas (Mongoose 9): users, websites (+ payments in v2)
        ├─ AI layer config/openRouter.js: 7 providers × up to 5 keys,
        │   in-memory round-robin + cooldown state (per process)
        └─ Razorpay (orders API)
```

| Area | Facts | Label |
| --- | --- | --- |
| Frontend | 6 routes (`App.jsx`): `/`, `/pricing`, `/login`, `/dashboard`, `/generate`, `/editor?id=`. About 4,800 lines in 5 large page files, almost entirely inline style objects. | [C] |
| Backend | 4 routers, 4 controllers, 1 auth middleware. `website.controller.js` (~700 lines) holds prompts, diffing, patching, deploy and public serving. | [C] |
| Artifact | One HTML string per project (`website.model.js` `latestCode`), plus an embedded `conversation[]`. | [C] |
| AI | Synchronous HTTP: the request stays open for the whole generation (90 s timeout per provider, up to 3 attempts in v1). No queue, no streaming. | [C] |
| State | Provider key health lives in process memory, so it is wrong as soon as there is more than one API instance. | [C] |
| Tests / CI | None. No test framework or CI config in the repo. | [C] |
| Hosting | Render plan tier unknown. A free tier would sleep and cold-start, which affects generation latency. | [A] |
| Secrets | `.env` was committed in early history (`git log` shows "remove .env from tracking"). `server/test.mjs` (tracked) contains a ZhipuAI key. | [C] |

---

## B. Working and broken features

| Feature | v1 (live) | v2 copy | Evidence |
| --- | --- | --- | --- |
| Google sign-in | Works, but the server trusts client-sent email | Verified Firebase ID token | `auth.controller.js` |
| Email sign-in | **Broken / insecure**: password is never checked, anyone can log in as any email | Firebase email/password, verified email required | v1 `auth.controller.js:37`, `LoginModels.jsx:126` |
| Forgot password | Dead link | Works (Firebase reset email) | `LoginModels.jsx` |
| Logout | Broken in production (Home calls `localhost:3002`) | Fixed | v1 `Home.jsx:156` |
| Generate site | Works (single HTML), quality limited by free models | Same + credit reserve/refund + 200 s budget | `website.controller.js` |
| Prompt enhance | Works, free | Same | |
| AI edit | Works for simple edits; patching corrupts nested sections; text edits drop scripts | Patching fixed (9 unit checks passed) | `patchHTML`, `extractSection` |
| "Dark mode toggle" quick edit | **Broken by design**: the prompt contains "dark", is classified STYLE, and only `<style>` is returned, so no button or JS can be added | Still open | `classifyEdit` + `Editor.jsx` QUICK_EDITS [C] |
| Direct code edit / undo / redo | Client-only, lost on reload, not deployed | Saved via `PATCH /:id/code` | `Editor.jsx` |
| Deploy / undeploy | Works; serves the last AI version, not editor state | Deploys editor state, sandboxed | `deployWebsite` |
| Dashboard search + "deployed" tab | Works | Same; list no longer downloads full HTML | `Dashboard.jsx:790` |
| Templates / Import HTML / Clone | Placeholder cards ("SOON", no action) | Same | `Dashboard.jsx:797-800` |
| Settings menu item | No-op (`action: () => {}`) | Same | `Dashboard.jsx:850` |
| Credit purchase | Works but **exploitable** (pack taken from request body; old payments replayable) | Pack from order, ledgered `Payment` | `payment.controller.js` |
| Payment if tab is closed after paying | **Credits never granted**: no webhook, crediting only happens in the browser callback | Still open | `Pricing.jsx` handler, no webhook route [C] |
| Export | Downloads the single HTML file | Same | `Editor.jsx` handleDownload |
| Thumbnails | Iframe of the live deployed site (3× scaled) or a placeholder | Same | `Dashboard.jsx:450` |

---

## C. Current UI and UX review

| # | Issue | File / evidence | Severity | Impact | Fix |
| --- | --- | --- | --- | --- | --- |
| UI-1 | No design system: every page hand-writes inline style objects; colours, radii and spacing differ per page (violet Home/Login, blue Generate, purple/cyan Editor, indigo Dashboard) | all `pages/*.jsx` [C] | High | Inconsistent product feel; every change is copy-paste | Token-based theme + shared component library (L) |
| UI-2 | Tailwind is installed and imported but effectively unused (0–6 `className` per page); `global.css` and `login.css` are not imported anywhere | `index.css`, `grep` [C] | Low | Dead weight and confusion | Choose one styling approach (recommend Tailwind + CSS variables) |
| UI-3 | Fake or unverifiable metrics: "100+ Websites built", "10s avg build" (the generator's own default estimate is 30 s) | `LoginModels.jsx:266`, `Home.jsx:494` [C] | Medium | Credibility; violates "no fake metrics" | Remove or wire to real stats |
| UI-4 | Simulated progress: steps and percentage are driven by timers, not backend events | `Generate.jsx` `startTimers`, `Editor.jsx` [C] | Medium | Progress lies when generation is slow or fails | SSE job events (Phase 3) |
| UI-5 | No accessibility: 0 `aria-*`, `role` or `tabIndex` in any page; many clickable `div`/`span` elements with no keyboard support | `grep` [C] | High | Keyboard and screen-reader users cannot navigate | Semantic buttons/links, focus styles, labelled controls |
| UI-6 | No responsive layout for Editor (fixed 370 px chat), Generate (fixed 368 px sidebar) or Pricing; 0 media queries | `grep @media` [C] | High | Unusable on phones and small tablets | Responsive shells per breakpoint (§19) |
| UI-7 | Heavy decorative rendering: ~12 components each run `setInterval` at 48–60 ms, plus full-screen canvas particle loops on Login and Editor | `Dashboard.jsx:64-290`, `LoginModels.jsx` [C] | Medium | Constant re-renders, battery drain, jank on low-end devices | CSS animations, `prefers-reduced-motion`, remove most |
| UI-8 | Branding inconsistency: Panda logo on Dashboard, ✦ mark elsewhere; HTML `<title>` is "client" | `Dashboard.jsx:40`, `index.html` [C] | Low | Unprofessional | Single brand kit |
| UI-9 | Nonfunctional controls: SOON cards, Settings, "Terms"/"Privacy" spans with no links | Dashboard, Login [C] | Medium | Violates "no dummy buttons" | Remove, or disable with an explanation |
| UI-10 | Two copies of the same deploy modal (one unused); a single JS bundle of 770 kB with no code-splitting | build output [C] | Low | Maintenance; slow first load | Route-level `lazy()` |
| UI-11 | Error and empty states are partial: errors are often only `console.log`; delete failure is silent | `Dashboard.jsx:775` [C] | Medium | Users don't know what failed | Toast/error component used everywhere |

---

## D. Screen inventory

| # | Spec screen | Exists? | Notes |
| --- | --- | --- | --- |
| 1 | Landing | Yes (`Home.jsx`) | Redesign; remove fake stats |
| 2 | Features | Section only | Home "features" section; a separate page is optional |
| 3 | Pricing | Yes | Improve; FAQ fixed in v2 |
| 4 | Showcase | No | Needs real opt-in published projects |
| 5 | FAQ | Inside Pricing | Reuse |
| 6–7 | Login / Signup | Yes (one page, tabs) | Keep the combined page |
| 8 | Forgot password | v2: inline action | Firebase-hosted reset page; custom page optional |
| 9 | Reset password | Firebase-hosted | Custom action handler optional |
| 10–11 | Dashboard / All projects | Yes (one page) | Add pagination, sort, filters, list view |
| 12 | New project | Yes (`Generate.jsx`) | Becomes the Creation Studio |
| 13 | Generation progress | Inside Generate | Must use real job events |
| 14–16 | Workspace / Preview / Code | Partial (`Editor.jsx`) | Single-file only; no file tree or Monaco |
| 17 | Version history | No | Only in-memory undo |
| 18 | Deployment center | Modal only | |
| 19–20 | Usage & credits / Billing history | No | Needs a credit ledger |
| 21–22 | Profile / Settings | No | |
| 23 | Help / onboarding | No | |
| 24–29 | Admin screens | No | Needs a server-side role model first |

---

## E. Backend module review

| # | Issue | File / evidence | Severity | Fix |
| --- | --- | --- | --- | --- |
| BE-1 | God controller: prompts, classifier, regex patcher, deploy and public serving in one file | `website.controller.js` [C] | Medium | Split into `ai/`, `projects/`, `deploy/` modules |
| BE-2 | Duplicate endpoints: `GET /api/user/websites` and `GET /api/website/` do the same thing with different response shapes | `user.controllers.js`, `website.controller.js` [C] | Low | One projects listing API |
| BE-3 | No request validation library; ad-hoc checks; inconsistent error shapes (`{message}` vs `{success,message}`) | all controllers [C] | Medium | zod schemas + one error format |
| BE-4 | Raw `e.message` returned to clients (e.g. Mongo or Razorpay errors) | most handlers [C] | Medium | Map to safe messages; log internally |
| BE-5 | No rate limiting on any route, including auth, generate and payment | `index.js` [C] | High | Distributed rate limiter (Redis) |
| BE-6 | Seven near-identical provider callers (~40 lines each) | `openRouter.js` [C] | Low | One OpenAI-compatible adapter + config |
| BE-7 | Provider key state in memory; resets on restart; wrong with more than one instance | `KeyManager` [C] | High at scale | Move health and quotas to Redis |
| BE-8 | Long synchronous AI requests occupy API workers for up to ~200 s | `generateWebsite` [C] | High at scale | Queue + workers + SSE (§26) |
| BE-9 | No health endpoint, no graceful shutdown; `connectDb` calls `process.exit` on failure; DB connection only starts after `listen` | `index.js`, `db.js` [C] | Medium | `/health`, `/ready`, SIGTERM handling |
| BE-10 | Logs include user emails and prompt fragments | `payment.controller.js`, `[SmartEdit]` logs [C] | Low | Structured logs with PII policy |

---

## F. Database review

| # | Finding | Evidence | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| DB-1 | `websites.user` has no index, yet every listing queries by user and sorts by `createdAt` | `website.model.js` (only `slug` unique) [C] | Medium now, High at scale | Compound index `{user:1, updatedAt:-1}` |
| DB-2 | The full HTML (`latestCode`) and an unbounded `conversation[]` are embedded in each website document | model [C] | Medium | Files and messages in separate collections or object storage |
| DB-3 | No credit ledger: deductions are not recorded anywhere; v2 records purchases only (`payments`) | [C] | High | `credit_transactions` ledger with idempotency keys |
| DB-4 | `User.totalSpent` was never incremented in v1 (v2 increments it); `lastPaymentId` holds only one id, so past payments cannot be reconstructed from the DB | v1 `verifyPayment` [C] | Medium | Backfill from Razorpay dashboard/API if needed |
| DB-5 | Hard deletes only; no soft delete or retention | `deleteWebsite` [C] | Medium | `deletedAt` + scheduled purge |
| DB-6 | `plan` enum only `"free"` | `user.model.js` [C] | Low | Plans collection when subscriptions exist |
| DB-7 | Real data volume, document sizes and email case consistency are unknown (production data not inspected) | — [A] | — | Read-only stats query + backup before migration (O) |

---

## G. Authentication and payment security review

| # | Issue | File | Severity | v1 / v2 | Recommended fix (if open) |
| --- | --- | --- | --- | --- | --- |
| SEC-1 | Login as any email with no password | `auth.controller.js` | **Critical** | v1 open / v2 fixed | — |
| SEC-2 | Google login trusts client-sent email | same | **Critical** | v1 open / v2 fixed | — |
| SEC-3 | Pay for a cheap pack, claim an expensive one (`packId` from body) | `payment.controller.js` | **Critical** | v1 open / v2 fixed | — |
| SEC-4 | Replay of older payments | same | High | v1 open / v2 fixed | — |
| SEC-5 | Deployed user HTML served on the API origin can call `/api/*` with the visitor's cookie | `serveDeployedSite` | High | v1 open / v2 mitigated (CSP sandbox) | Long-term: separate deploy domain |
| SEC-6 | CSRF: `SameSite=None` cookie, no origin check | `index.js` | High | v1 open / v2 fixed | — |
| SEC-7 | Secrets in git history + hardcoded key in `test.mjs` | git history | **Critical** | Open (needs key rotation by owner) | Rotate all keys; consider a history rewrite |
| SEC-8 | No webhook: a paid order whose browser callback never runs is never credited | `Pricing.jsx`, no webhook route | High | Open in both | Razorpay `order.paid` webhook with signature check |
| SEC-9 | No rate limiting (credential stuffing, AI abuse, payment probing) | `index.js` | High | Open in both | Redis rate limiter |
| SEC-10 | 7-day JWT with no revocation or session list; logout only clears the cookie | `auth.controller.js` | Medium | Open in both | Session collection + rotation, or short JWT + refresh |
| SEC-11 | Editor/Generate preview iframes use `allow-scripts allow-same-origin` on blob URLs, so generated code runs with the app's origin | `Editor.jsx`, `Generate.jsx` | Medium | Open in both | Drop `allow-same-origin` / serve preview from an isolated origin |
| SEC-12 | Provider key rotation across many free accounts may breach provider terms of service | `openRouter.js` | Medium (business) | Open [A] | Review ToS; use paid tiers for production |
| SEC-13 | Credit check-then-deduct race | v1 `generateWebsite` | Medium | v1 open / v2 fixed (atomic reserve) | — |

---

## H. AI generation pipeline review

**Current flow [C]:** one prompt (`MASTER_PROMPT` + user text) → a provider in the round-robin → the model returns JSON + an HTML code block → regex extraction → length/DOCTYPE checks → saved. Edits:
- keyword regex classifies the edit into 9 types,
- regex extracts part of the HTML,
- the model returns the fragment,
- the regex patcher merges it back,
- on failure, the whole site is regenerated.

| # | Finding | Severity |
| --- | --- | --- |
| AI-1 | Output is a single HTML file, so multi-page apps, routing, components and real dependencies are impossible. This is the core gap vs the 2.0 goal. [C] | Critical (product) |
| AI-2 | Fixed visual brief in `MASTER_PROMPT` (dark `#0a0a0f`, one of 5 accents, Inter, glassmorphism, same mandatory sections), so every site looks alike. This directly contradicts "unique from-scratch design". [C] | High |
| AI-3 | Model mix is small or free-tier. Two models are mislabelled: "DeepSeek" is `llama-3.1-8b:free` and "GLM" is `gemma-2-9b:free`. Quality for long multi-file output will be poor. [C labels / A quality] | High |
| AI-4 | Keyword classifier misroutes edits: any prompt containing "dark", "light", "border" etc. becomes a style-only edit (see the dark-mode toggle bug in B). [C] | High |
| AI-5 | Validation is cosmetic (length, DOCTYPE, `</body>`). No HTML parse, no JS syntax check, no rendering check. [C] | Medium |
| AI-6 | No structured output or schema; JSON is pulled out with `indexOf("{")…indexOf("}")`. [C] | Medium |
| AI-7 | Retries regenerate everything (up to 3 full generations), which wastes tokens. [C] | Medium |
| AI-8 | User prompts are concatenated straight into instructions. Prompt injection impact is low today (output is sandboxed HTML), but rises once the model drives file operations. [C] | Medium (future) |
| AI-9 | Nothing is recorded per request: no token or cost accounting, latency or success rate. [C] | High (cannot optimise what isn't measured) |

---

## I. Token optimization opportunities

1. **Measure first.** Record per call: provider, model, input/output/cached tokens (from provider `usage` fields), latency, outcome and repair count. Without this, every other optimisation is guesswork.
2. **Stop sending full HTML on edits.** "Full" mode sends the whole document (often 20–60 kB) as input. Multi-file projects with a file index plus retrieval of only the affected files cut this sharply.
3. **Structured file operations** (`create`/`update`/`patch` with search–replace blocks, validated against a schema) instead of whole-file rewrites.
4. **Repair only what failed.** Feed back the build or validation error and the failing file, instead of regenerating the project.
5. **Route by task:** a small, fast model for classification, enhancement and summaries; a strong model for planning and multi-file generation.
6. **Project memory:** a compact, persisted project summary (stack, routes, design tokens, component list) reused as context.
7. **Prompt caching** where providers support it, for the stable system prompt and project summary.
8. **The optimisation target is cost per *successful* project** (spec §25), not tokens per call. A cheaper model that needs three repairs can cost more than a stronger one.

---

## J. 100K scalability: design and assumptions

**Where the system stands today [C]:** a single Express process, synchronous AI calls, in-memory provider state, no cache, no queue, no rate limiting and one unindexed hot query. The **realistic capacity today is unknown and much lower** than the target. No load test exists.

**The binding constraint is AI capacity, not web servers [A].** The spec scenario assumes ~100 concurrent AI jobs (bursts of 200–300). Today's pool is 5 free-tier keys per provider. Free tiers typically allow only a few requests per minute per key, so this pool cannot sustain that load. Planning must start from provider quotas and budget.

**Target architecture (staged, introduced only when measured load needs it):**

```text
Cloudflare (CDN/WAF, static SPA, deployed-site domain)
   │
Load balancer ──► API (stateless, N replicas, autoscaled on CPU/latency)
                    │        │             │
              MongoDB Atlas  Redis         Object storage (S3/R2)
              (replica set,  (sessions,    (file snapshots, versions,
               indexes)       rate limits,  build artifacts, exports)
                              BullMQ,
                              provider health)
                    │
              Workers (separate deployables)
                ├─ ai-worker:    queue "generate"/"edit"; concurrency = provider quota
                ├─ build-worker: isolated sandboxes (container/microVM per job)
                └─ deploy-worker
              SSE gateway (job events from Redis pub/sub, resumable by job id)
```

**Planning numbers (assumptions from the spec, to be replaced by measurements):**
- 1.7–3.3k req/s steady, 5–10k burst.
- 100 average / 300 burst AI jobs.

**Back-of-envelope [A]:**
- API: a handful of stateless Node replicas can serve this request rate once AI work is off the request path. This needs load-test confirmation.
- AI: the job count is capped by the sum of provider rate limits. Admission control (queue + backpressure) is mandatory, so users wait in a queue instead of seeing timeouts.

---

## K. Feature-by-feature upgrade matrix

Effort: S < 1 day, M 1–3 days, L ~1–2 weeks, XL > 2 weeks (single developer, rough).

| Spec § | Feature | Current | Gap | Phase | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | Auth basics, verification, reset | v2 done (Firebase) | Rate limit, change password, delete account, sessions | 2/5 | M |
| 2 | Dashboard | Search + 1 filter, client-side | Pagination, sort, list view, rename/duplicate/export, activity | 5 | M |
| 3 | Creation Studio modes | One mode, fixed brief | Scratch / template / component modes; supported-stack selector | 3/5 | L |
| 4 | Real generation progress | Fake timers | Jobs, SSE, cancel, resume, summary | 3 | L |
| 5 | IDE workspace | Single-file editor | File tree, Monaco, tabs, resizable panels, console | 4 | XL |
| 6 | Incremental multi-file editing | Regex patcher | Plan → file ops → validate → checkpoint | 3 | XL |
| 7 | Per-project design system | Fixed palette | Design-token planner in the AI pipeline | 3 | M |
| 8 | Visual editing | None | Element picker → source mapping | Later (after 4) | XL |
| 9 | Versions / checkpoints | In-memory undo | Version collection + object storage snapshots | 4 | L |
| 10 | Export ZIP / GitHub | Single HTML download | ZIP of real files; GitHub OAuth later | 4/6 | M / L |
| 11 | Deployment management | Serve HTML from API | Build + deploy to static hosting, history, rollback | 6 | XL |
| 12 | Billing & credits | Purchases ledgered (v2) | Credit ledger, usage history, webhook, payment history UI | 2/5 | M |
| 13 | Settings center | None | Profile, preferences, security, deletion | 5 | M |
| 14 | Admin | None | Server-side roles, audit log, job and provider views | 7 | L |
| 15 | Onboarding / help | None | First-project walkthrough, docs, FAQ | 5 | M |
| 16–20 | Design system + screens + responsiveness | Inline styles | Component library, tokens, responsive shells | 5 | XL |
| 24–26 | AI engine, tokens, queues | Synchronous single prompt | Orchestrator, router, ledger, BullMQ, SSE | 3/7 | XL |
| 27 | Build sandbox | None | Isolated build/preview execution | 6 | XL |
| 28–29 | Scale + observability | None | Redis, workers, metrics, health, load tests | 7 | XL |
| 32 | Tests | None | Unit/API/e2e/load suites | every phase | ongoing |

---

## L. Proposed UI structure

**Styling decision (recommended):** Tailwind (already installed) + CSS-variable design tokens for light/dark, plus a small in-house component set. Optionally add Radix primitives for dialog, dropdown, tabs and tooltips, for accessibility. Monaco via `@monaco-editor/react` for the code editor. *These are new dependencies and need approval.*

```text
client/src/
  app/            router, layouts (PublicLayout, AppLayout, WorkspaceLayout), providers
  design/         tokens.css, theme switch
  components/ui/  Button, Input, Textarea, Select, Dialog, ConfirmDialog, Dropdown,
                  Tabs, Tooltip, Toast, Skeleton, EmptyState, ErrorState, Badge,
                  CreditIndicator, ProgressSteps
  features/
    auth/         LoginPage, ForgotPassword, VerifyNotice
    dashboard/    DashboardPage, ProjectCard, ProjectList, filters
    studio/       CreateProjectPage, PromptEditor, ModeSelector, JobProgress
    workspace/    WorkspacePage, FileTree, EditorTabs, PreviewPane, ChatPanel,
                  ConsolePanel, HistoryPanel, DeviceToolbar
    billing/      PricingPage, UsagePage, PaymentHistory
    settings/     ProfilePage, SecurityPage, PreferencesPage
    admin/        (gated by server role)
  lib/            api client (one axios instance + error mapping), sse client
```

**Routes:**
- Public: `/`, `/pricing`, `/login`, `/forgot-password`.
- App: `/dashboard`, `/new`, `/jobs/:jobId`, `/p/:projectId` (workspace; tabs via query), `/billing`, `/settings/*`, `/admin/*`.
- `/generate` and `/editor?id=` are kept as redirects for old links.

**Workspace modes:** *Simple* (chat + preview) as the default for beginners; *Advanced* (file tree + code + console) behind a toggle.

---

## M. Proposed backend structure (modular monolith)

```text
server/src/
  app.js, server.js (graceful shutdown), config/ (env schema validated with zod)
  middleware/  auth, requireRole, checkOrigin, rateLimit, validate, errorHandler, requestId
  modules/
    auth/ users/ projects/ files/ versions/ jobs/ ai/ (router, providers/, prompts/,
    context/, orchestrator, validators/, usage) builds/ deployments/ billing/
    (payments, credits, plans, webhooks) admin/ health/
  workers/    ai.worker.js, build.worker.js, deploy.worker.js
  lib/        logger, redis, storage (S3/R2 adapter), sse, errors
  tests/
```

Workers are separate entry points (same codebase) so they scale independently from the API. Existing `/api/*` routes stay behind thin compatibility handlers until the client migrates.

---

## N. API contract plan

**Conventions:**
- JSON everywhere. Errors use `{ error: { code, message, details? } }`.
- zod validation on every body and query.
- Cursor pagination: `?cursor=&limit=`.
- Ownership enforced in the service layer, not only in routes.
- Idempotency key header on credit-spending and payment endpoints.

| Module | Endpoints |
| --- | --- |
| Auth | `POST /auth/session` (Firebase token → cookie), `POST /auth/logout`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` |
| Users | `PATCH /users/me`, `DELETE /users/me` (confirm + grace period), `GET/PATCH /users/me/preferences` |
| Projects | `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `POST /projects/:id/duplicate`, `DELETE /projects/:id` (soft), `GET /projects/:id/export` (zip) |
| Files | `GET /projects/:id/tree`, `GET/PUT/DELETE /projects/:id/files?path=`, `POST /projects/:id/files/rename`, `GET /projects/:id/files/search?q=` |
| AI / Jobs | `POST /ai/jobs` (generate / edit / component / debug), `GET /ai/jobs/:id`, `GET /ai/jobs/:id/events` (SSE, `Last-Event-ID` resume), `POST /ai/jobs/:id/cancel`, `POST /ai/jobs/:id/retry`, `POST /ai/enhance-prompt`, `GET /projects/:id/conversations` |
| Versions | `GET /projects/:id/versions`, `POST /projects/:id/versions`, `GET /projects/:id/versions/:a/diff/:b`, `POST /projects/:id/versions/:v/restore` |
| Builds | `POST /projects/:id/builds`, `GET /builds/:id`, `GET /builds/:id/logs` (SSE), `POST /builds/:id/cancel` |
| Deployments | `POST /projects/:id/deployments`, `GET /projects/:id/deployments`, `GET /deployments/:id`, `POST /deployments/:id/rollback` |
| Billing | `GET /billing/packs`, `GET /billing/balance`, `GET /billing/transactions`, `POST /billing/orders`, `POST /billing/verify`, `POST /billing/webhooks/razorpay`, `GET /billing/payments` |
| Admin | `GET /admin/users`, `GET /admin/jobs`, `GET /admin/providers`, `GET /admin/payments`, `GET /admin/audit` (all `requireRole('admin')`, server-side) |
| Health | `GET /health` (liveness), `GET /ready` (DB/Redis checks) |

---

## O. Database migration plan

**New or evolved collections:**
- `projects`: evolve `websites` in place; keep `_id`s.
- `project_files`: path, content or storage key, hash, size.
- `project_versions`: metadata in Mongo, snapshot in object storage.
- `conversations`, `messages`, `jobs`, `ai_usage`.
- `credit_transactions`: unique `(user, idempotencyKey)`.
- `payments`: exists in v2.
- `builds`, `deployments`, `audit_events`, `sessions`.

**Steps (each reversible, each rehearsed on a restored copy first):**
1. **Backup:** Atlas snapshot or `mongodump`. Read-only stats: counts, average and max `latestCode` size, email case collisions.
2. **Additive only:** add `schemaVersion`, `kind: "single-html"`, `deletedAt` and indexes. Old code keeps working.
3. **Files:** for each website, create `project_files { path: "index.html", content: latestCode }`. Keep `latestCode` untouched until v2 has been stable for a release cycle.
4. **Conversations:** copy the embedded `conversation[]` to `messages`. The original stays as is.
5. **Credits:** insert one `opening_balance` ledger row per user equal to the current `credits`. From then on, the balance is derived from or reconciled against the ledger.
6. **Payments:** `payments` starts empty for v1 history (only `lastPaymentId` exists). Optionally backfill from Razorpay's API.
7. **Rollback:** every step leaves the v1 fields intact, so rollback means redeploying the old build. Removing old fields is a separate, later migration that needs explicit approval.

---

## P. Infrastructure cost stages

All figures are **rough order-of-magnitude [A]**, to be re-priced on provider pricing pages before committing. AI spend usually dominates and depends entirely on the model choice and the measured tokens per successful project.

| Stage | Users | Shape | Infra (excl. AI) |
| --- | --- | --- | --- |
| 0 — Dev | you | Local + free tiers; no paid infra | ~$0 |
| 1 — Beta | ≤ 1k | 1 API + 1 worker instance, Atlas small dedicated, small managed Redis, R2 | tens of $/month |
| 2 — Growth | ~10k | 2–4 API replicas, autoscaled workers, Atlas mid tier with backups, Cloudflare | low hundreds to ~1k $/month |
| 3 — Target | 100k concurrent | Autoscaled API fleet, worker pools, sharded or large Atlas, Redis cluster, sandbox fleet, observability | several thousand $/month+ |

**AI cost formula to track from Phase 3:**

> cost per successful project = Σ(input × price_in + output × price_out) over all calls, including repairs ÷ successful projects

---

## Q. Testing plan

**Current state [C]:** zero automated tests.

What has been verified in v2 so far, all executed:
- 9 patch-helper checks.
- 7 HTTP security checks on a local instance with a dummy DB.
- A client production build.

Proposed stack (new dev dependencies, approval needed):

| Layer | Tooling | First targets |
| --- | --- | --- |
| Server unit | `node:test` or Vitest | patcher, path validation, credit math, signature check |
| API integration | Supertest + `mongodb-memory-server` | auth token rejection, ownership (user A cannot read B), payment idempotency, **concurrent** verify and credit reserve |
| Frontend | Vitest + React Testing Library | auth forms, editor history, error states |
| E2E | Playwright | sign-in → generate → edit → deploy, against a test DB and Razorpay **test mode** |
| Load | k6 | dashboard/list/read mix; queue admission under AI burst |
| Security | `npm audit`, dependency review, header checks | per release |

---

## R. Risks and dependencies

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| Leaked keys still valid (git history) | High / Critical | Rotate everything now; it is independent of 2.0 work |
| Free-model quality is too low for multi-file apps | High / High | Budget for paid models on planning and generation; measure with a fixed eval prompt set |
| Free-tier key pooling breaks provider terms or gets banned | Medium / High | Use paid accounts for production |
| Sandbox complexity and cost (running untrusted builds) | High / High | Start with a cheaper preview path (see decision 2 below); never run generated scripts in the API process |
| Hosting limits (Render tier, cold starts) | Medium / Medium | Confirm plan; move workers to dedicated compute in Phase 6–7 |
| Data migration mistakes | Low / Critical | Additive-only migrations, backups, rehearsal on a copy |
| Existing v1 email users must re-register once in Firebase | Certain / Low | In-app notice + support message |
| Scope: the spec describes multiple person-years of work | Certain / High | Strict phase gates; ship value per phase |

**Decisions needed from you before Phase 1:**
1. **Base codebase:** continue from `websiteBuilder-v2` (recommended)?
2. **Generated project type for 2.0 v1:**
   - (a) multi-file static HTML/CSS/JS — cheapest, no build server; or
   - (b) React + Vite — needs a bundler/sandbox.
   - Recommended: (a) first, (b) next.
3. **Preview/sandbox approach for React projects:**
   - in-browser bundling: cheap, no server execution; check licensing for the specific tool; or
   - server-side isolated containers: full Node builds; costly and ops-heavy.
4. **AI budget:** stay on free tiers, or allocate a monthly paid-model budget?
5. **Hosting direction:** stay on Vercel + Render + Atlas for now, or plan the AWS Mumbai move from Phase 7?

---

## S. Phase-by-phase roadmap

| Phase | Goal | Exit criteria |
| --- | --- | --- |
| 0 — Audit | This document | Approved by you |
| 1 — Blueprint | Feature matrix sign-off, screen specs, API and DB contracts, AI design, decisions 1–5 | Written spec approved |
| 2 — Critical backend | Deploy the v2 fixes after a test-DB run; add webhook, rate limits, credit ledger, validation, health endpoints, tests for auth/ownership/payments | All Phase 2 tests green; keys rotated; v2 live |
| 3 — AI engine | Multi-file project model, structured file ops, router, usage ledger, BullMQ jobs + SSE, validation and repair loop, per-project design system | Eval set: N prompts produce valid multi-file projects; cost per success measured |
| 4 — Workspace | File tree, Monaco, real preview, chat bound to file ops, versions, ZIP export | E2E: create → edit files → restore version → export |
| 5 — UI redesign | Design system, all screens in D, responsive, accessible | Lint/a11y checks, mobile pass, no dummy controls |
| 6 — Build/deploy | Isolated builds, deploy domain, history, rollback | Untrusted build cannot reach the host or network beyond allow-list |
| 7 — Scale | Redis everywhere, stateless API, workers, metrics, autoscaling | Load test meets staged targets |
| 8 — Release | Regression, security, migration rehearsal, docs, rollback plan | Go/no-go checklist |

**Recommendation:** finish Phase 2 first (rotate keys, deploy v2, add the webhook and credit ledger). It closes live security holes and money risks in the current product, independent of how big 2.0 becomes.

*Awaiting approval before any implementation.*
