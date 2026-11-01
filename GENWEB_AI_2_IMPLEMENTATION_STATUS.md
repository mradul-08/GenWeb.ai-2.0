# GenWeb.ai 2.0 — Implementation Status

Last updated: 2026-11-01 (correction pass after hardening review — awaiting approval)

| Phase / priority | State |
| --- | --- |
| Phase 0 audit | Done (`GENWEB_AI_2_AUDIT.md`) |
| **Priority 1 — security & financial correctness** | **Implemented and verified in v2. Conditionally approved. Not deployed; production deployment not approved.** |
| **Priority 2 — AI architecture** | **Implemented in v2, awaiting review.** Not deployed. See section 11 |
| **Hardening — free-only AI, quotas, efficiency** | Conditionally approved; correction pass done (section 15), awaiting approval |
| Priority 3 — multi-file foundation | Not started (waiting for approval) |

Boundaries kept during verification:
- The original `websiteBuilder/` was not modified.
- Nothing was deployed.
- Production MongoDB was only **read** once (a backup copy); no writes and no migrations ran against it.
- Priority 2 and Priority 3 were not started.
- No new runtime dependencies were added.

---

## 1. Verified items

| Area | Verification | Result |
| --- | --- | --- |
| Webhook signature over raw body | Automated test: valid signature for compact JSON, body sent re-serialized (same data, different bytes) | **401**, no credits |
| Webhook replay / duplicates | Byte-identical replay ×3; concurrent 5×verify + 5×webhook; real-entity replays | One grant; others `already_processed` |
| `order.paid` + `payment.captured` for the same payment | Automated test **and** real Razorpay entities | One grant |
| Transaction failure + retry | Simulated DB failure inside the crediting transaction | Webhook → **500** (Razorpay retries); payment row, ledger row and balance all rolled back; retry → granted once |
| Refund / failed-payment events | `refund.created`, `refund.processed`, `payment.failed` | Ignored (200); credits unchanged — policy not altered |
| Atomic balance + ledger | Simulated ledger-insert failure during a spend | Balance unchanged, no ledger row |
| Concurrency | 10 parallel spends on a 2-spend balance; mixed parallel spends + duplicate refunds | Never negative; balance == ledger sum; refunds applied once |
| Migration preserves balances | Rehearsal on a copy of production (section 4) | 0 balance changes, 0 mismatches |
| Real Firebase token | Real unverified token from Firebase → v2 server; same token with tampered signature | **403** `EMAIL_NOT_VERIFIED`; **401** |
| Preview sandbox | Hostile generated site in the real preview sandbox, on the real app origin (section 5) | All attacks blocked |
| Ownership / CSRF | Automated tests + form-POST CSRF from the preview in a real browser | Blocked |

**Automated suite:** `npm test` in `server/` → **49 tests, 49 pass, 0 fail** (7 added in this pass: raw-body, mixed events, byte replays, transaction rollback + retry, refund/failed events, ledger-write failure, mixed concurrency).

---

## 2. Integration test results (real services)

| Integration | What ran | Result |
| --- | --- | --- |
| Razorpay **test mode** — checkout + `/verify` | Real checkout in headless Edge: Pricing → Buy Starter → contact → Netbanking → Razorpay mock bank → **Success** | Order `order_Tue11LqOArKaNG` **paid**; payment `pay_Tue2eYYZQ99tIC` **captured**, netbanking, ₹499. App `/verify` granted **+100** (100 → 200). DB: 1 `payments` row (`source: verify`), ledger `signup 100 → purchase 100 → 200`, `totalSpent` 499 |
| Razorpay test mode — "tab closed" | Second real payment (Basic ₹999); the browser's `/verify` request was **blocked** via DevTools | Credits stayed 200 → webhook built from Razorpay's real `order`/`payment` entities → **granted (+300 → 500)**; replay → `already_processed` |
| Razorpay → our webhook delivery **from Razorpay's servers** | — | **Not possible yet (blocked)**: the server is not publicly reachable and the dashboard webhook is not configured (needs your Razorpay account). Webhooks were posted locally with Razorpay's real entity payloads and a local secret instead. |
| Firebase Auth | Real sign-up via UI; real ID token sent to the server | Works (see section 6). Both temporary test accounts were **deleted** from Firebase afterwards |
| AI providers (real keys) | Generate + edit via UI | Worked, but **only via the last-resort Cloudflare provider** (see section 3) |

---

## 3. Remaining security and reliability risks

| # | Risk | Severity | Status / mitigation |
| --- | --- | --- | --- |
| R1 | Leaked secrets in git history (AI keys, Razorpay test secret, JWT secret, Mongo password, ZhipuAI key in `test.mjs`) | **Critical** | Owner action: rotate (section 8d) |
| R2 | **Production has no MongoDB indexes except `_id`** — not even the unique `users.email` index (confirmed on the backup copy). v1 could create duplicate accounts under concurrent sign-ups. | High | v2 creates them at startup. No email duplicates exist today (checked, case-insensitive), so creation will succeed |
| R3 | **The live product uses Razorpay test keys** (`rzp_test_`) — no real money is collected today | High (business) | Decide when to switch to live keys; switching requires a live webhook secret too |
| R4 | AI provider health (real run): Cerebras HTTP **402**, 4 OpenRouter keys and 2 SambaNova keys **dead (401/403)**, ZhipuAI **429**. Generate and edit succeeded only via Cloudflare. | High (product) | Priority 2 (model routing / paid fallback) |
| R5 | Deployed sites share the API origin; mitigated by CSP `sandbox` | Medium | Separate deploy domain recommended |
| R6 | Preview sandbox allows `allow-popups` + `allow-popups-to-escape-sandbox` + `allow-modals` | Low | Generated code can open un-sandboxed tabs (normal web behaviour, user's own code) and show dialogs. It cannot reach the app origin, cookies or API |
| R7 | Rate limiter is in-memory / per instance | Medium at scale | Redis store when the API runs on more than one instance |
| R8 | Sessions: `logout-all` only (section 6) | Medium | Documented; per-device sessions later |
| R9 | No staging environment (section 8b) | High (process) | **Deployment blocker** |
| R10 | Dashboard "⬇ Export" and "⎘ Duplicate" menu items do nothing (`action: () => {}`), carried from v1 | Low | Violates "no dummy controls"; fix in the UI phase or hide now |

---

## 4. Migration reconciliation (production backup → separate local test cluster)

- **Backup:** a read-only copy of production (`listCollections` + `find` only) went into a **separate local MongoDB replica set** (127.0.0.1:27100). No Atlas test cluster exists, so a local replica set was used.
- **Contents copied:** `users` 6, `websites` 7; no other collections exist in production.
- **Data hygiene:** the local copy (~200 MB including browser profiles) was **deleted** after verification.

| Check | Before | After apply | After rollback |
| --- | --- | --- | --- |
| Users | 6 | 6 | 6 |
| Websites | 7 | 7 | 7 |
| Total credits | 200 | 200 | 200 |
| Per-user balances (0, 0, 0, 50, 100, 50) | — | **0 changes** | **0 changes** |
| Ledger rows | 0 | 6 `opening_balance` | 0 |
| Reconcile mismatches | — | **0** (6/6 ledgered) | n/a |

- **Dry run:** "would open 6", 0 rows written.
- **Re-apply:** no-op ("alreadyOpen 6").
- **Data checks:** all 6 emails are already lowercase; 0 case-insensitive duplicates; no users missing a `credits` field; no user has a `firebaseUid` yet, so all will be linked on first v2 sign-in.
- **Indexes:** v2 startup created `users.email` (unique), `users.firebaseUid` (unique, sparse), `websites {user, createdAt}`, and the `payments` + `credit_transactions` indexes without errors.
- **After the full browser E2E run on the same copy:** reconcile → **7 users ledgered, 0 mismatches**. The six original balances are still 0, 0, 0, 50, 100, 50.

---

## 5. Preview security review

**Actual configuration:**
- Editor and Generate: `<iframe srcDoc=… sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox">`. There is **no `allow-same-origin`** and **no `allow-top-navigation`**.
- Deployed sites: header `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals; frame-ancestors 'self' <app origins>`.

Results of a hostile site running in the real preview sandbox on `http://localhost:5173` (Edge 156):

| Attack | Result |
| --- | --- |
| Read parent DOM | `SecurityError` |
| Read cookies | `SecurityError` |
| `localStorage` | Works via the in-memory shim (data does not persist and is not shared with the app) |
| `fetch` API with credentials (user profile, project) | Blocked by CORS (`TypeError`) |
| JSON `POST /undeploy` with credentials | Blocked (`TypeError`, preflight fails) |
| Classic form `POST /undeploy` (no preflight) | Rejected; project stayed deployed (Origin `null` refused by the CSRF check) |
| `top.location = …` (navigate the app away) | `SecurityError`; app stayed on `/dashboard` |

Remaining limitations: R5 and R6 in section 3.

---

## 6. Authentication — sessions and logout-all

**How sessions work now:**
- 7-day JWT in an `HttpOnly; Secure; SameSite=None` cookie, carrying `{ id, v }`.
- The server rejects a token when `v ≠ users.tokenVersion`.
- Tokens issued before v2 carry no `v` and are treated as version 0, so **no existing session breaks on deploy**.

**Current limitations:**
1. `POST /api/auth/logout-all` revokes **every** session of that user, including the current one. Single-device revocation and a session list do not exist.
2. There is **no UI** for logout-all yet; it is API-only.
3. Plain logout only clears the cookie on that browser. A copied token stays valid until it expires (≤ 7 days) or until logout-all.
4. JWTs are stateless: a revoked user's token is rejected on the next request, but no server-side session list exists to audit.

**Safe ways to invalidate sessions without a breaking change:**
- **One user:** increment their `tokenVersion` (`logout-all`, or `db.users.updateOne({_id}, {$inc: {tokenVersion: 1}})`). Only that user is signed out.
- **Everyone (break-glass):** rotate `JWT_SECRET`. Every user must sign in again. This is required once anyway after the secret leak (R1), so schedule it with the v2 release and announce it.
- **Future per-device sessions:** add a `sessions` collection and a session id in the JWT. Keep accepting tokens without a session id until they expire (7 days), then require it. No forced logout is needed.

**Browser results for Register → Login:**

| Step | Result |
| --- | --- |
| Register (email/password via UI) | **PASS** — Firebase account created; UI shows "We sent a verification link…" (the Email/Password provider is enabled; the earlier assumption that it was disabled was wrong) |
| Login (same account, unverified) | **Blocked as designed** — "Your email is not verified yet…"; stays on `/login` |
| Login (verified) | **NOT TESTED** — needs a real inbox to click the verification link |
| Google sign-in | **NOT TESTED** — the headless popup was blocked (`auth/popup-blocked`, automation without a user gesture) and a real Google account would be needed |

---

## 7. Browser end-to-end results

Environment:
- v2 client (Vite, :5173) and v2 API (:3099) against the local production copy.
- API on a local-only `JWT_SECRET`; Razorpay **test** keys; real AI provider keys.
- Headless Edge driven over the DevTools Protocol.

| Step | Result | Evidence |
| --- | --- | --- |
| Register | **PASS** | UI notice; Firebase account created, later deleted |
| Login | **NOT COMPLETED** | See section 6. Later steps used a session **injected** for a test user created through the real ledgered signup path (100 credits) |
| Create order | **PASS** | Razorpay order created with server notes (`userId`, `packId`) |
| Payment | **PASS** (test mode) | Netbanking mock bank → Success; Razorpay: order paid, payment captured |
| Credits | **PASS** | 100 → 200 via `/verify`; 200 → 500 via webhook when `/verify` was blocked. The success toast was not captured by the script (timing); credits verified through the API and DB |
| Generate | **PASS** | 40 s; project created; 500 → 450 credits; preview rendered in the sandboxed `srcDoc` iframe |
| Edit (AI) | **PASS** | DB shows the edit applied (`latestCode` contains the new footer text), conversation updated, ledger `spend -50 → 400`. The test script's own UI detector failed: labels render uppercase, so it timed out. Verified from DB and server log instead |
| Save (direct code edit) | **PASS** | Marker saved to DB; Undo removed it in DB; Redo restored it in DB |
| Deploy | **PASS** | `/s/crumb-co-bakery-aizv` → 200, serves the editor's saved state, CSP sandbox header present, ribbon injected |
| Undeploy (Dashboard UI) | **PASS** | API `deployed: false`; public URL → **404**; modal offers "Deploy Now" again |

**Failures and gaps recorded:**
- Verified login: not completed.
- Google sign-in: not testable here.
- Razorpay-originated webhook delivery: blocked until deployed and configured.
- Two harness issues (toast timing, uppercase label); the underlying app behaviour was verified by other means.
- Dashboard "Export" and "Duplicate" are no-op controls (R10).

---

## 8. Deployment readiness

### 8a. Environment-variable checklist

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| `MONGODB_URI` | Render | Yes | Must be a replica set (Atlas ✓). Production and staging must be **different** clusters or databases |
| `JWT_SECRET` | Render | Yes | **New value** (leaked); rotating it logs everyone out once |
| `CLIENT_URL` | Render | Yes | Exact Vercel origin, used for CORS, CSRF and framing |
| `SERVER_URL` | Render | Yes | Public API origin; used to build deploy URLs |
| `FIREBASE_PROJECT_ID` | Render | Recommended | `genwebai-dca16` (default) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Render | Yes | Currently **test** keys (R3); rotate |
| `RAZORPAY_WEBHOOK_SECRET` | Render | **Yes (new)** | Without it the webhook returns 503 and processes nothing |
| `*_API_KEY_n`, `CLOUDFLARE_ACCOUNT_ID_n` | Render | ≥ 1 provider | Rotate; remove the dead keys (R4) |
| `SITE_URL`, `PORT` | Render | Optional | |
| `VITE_API_URL` | Vercel | Yes | Render API origin |
| `VITE_FIREBASE_API_KEY` | Vercel | Yes | Public by design; restricted by referrer (verified) |

### 8b. Staging vs production separation — **NOT in place (blocker)**

- Today there is **one** database (`cluster0…/websiteBuilder`), **one** Firebase project and **one** Razorpay account, used by everything.
- `client/.env` points at the production API.
- This verification used a separate local copy instead.

Needed:
- A staging Atlas database (a separate cluster, or at least a separate database name with separate credentials).
- A staging Render service and a Vercel preview environment pointing at it.
- A Razorpay test-mode webhook pointing at staging.
- Ideally a separate Firebase project for staging (test sign-ups currently land in the production Firebase project).

### 8c. Razorpay webhook configuration

1. Razorpay Dashboard (test mode for staging, live mode for production) → **Settings → Webhooks → Add New Webhook**.
2. URL: `https://<SERVER_URL>/api/payment/webhook` (production: `https://genweb-ai-5o8k.onrender.com/api/payment/webhook`).
3. Secret: a new random string, also set as `RAZORPAY_WEBHOOK_SECRET` on that environment's Render service.
4. Active events: **`order.paid`** and **`payment.captured`**. Other events are ignored safely.
5. Verify:
   - Make a test payment and close the tab before the redirect. Credits must appear.
   - Razorpay's webhook log must show `200` responses.
   - The server log must show `[webhook] order.paid … → granted`.

### 8d. API key rotation (owner actions)

For each item: create the new value → set it in Render/Vercel → redeploy → verify → revoke the old value.

- **MongoDB:** Atlas → Database Access → edit user → new password; update `MONGODB_URI`.
- **JWT:** new `JWT_SECRET` (forces one re-login for all users; announce it).
- **Razorpay:** Dashboard → API Keys → regenerate (test and later live); new webhook secret.
- **AI providers:** regenerate in each console (Groq, Mistral, ZhipuAI, Cerebras, SambaNova, OpenRouter, Cloudflare); drop dead keys.
- **Repo:** delete the `test.mjs` key from the provider; optionally purge git history (`git filter-repo`) — rotation is what actually matters.

### 8e. Rollback instructions

- **Code:** redeploy the previous Render/Vercel build. v1 ignores the new collections and fields.
- **Ledger:** `npm run ledger:migrate -- --uri <URI> --rollback` deletes only `opening_balance` rows; balances are untouched (verified).
- **Indexes:** leave them in place; they are additive and harmless for v1.
- **Payments credited by v2:** remain valid; `payments` and the ledger are the audit trail.
- **JWT rotation:** cannot be "rolled back" safely after a leak. Keep the new secret.

---

## 9. Deployment blockers

1. **R1** — secrets not yet rotated.
2. **8b** — no staging environment; v2 has never run against a staging DB or a Razorpay-delivered webhook.
3. `RAZORPAY_WEBHOOK_SECRET` not set, and the dashboard webhook not configured.
4. Verified-email login and Google login not yet exercised end-to-end (needs a human with an inbox or Google account, on staging).
5. **Decision needed:** R3 (test keys in production).
6. **Recommended before launch:** plan for R4 (only one AI provider currently works).

---

## 10. Final Priority 1 readiness assessment

**Code: ready for staging.**
- Every Priority 1 item has automated tests (49/49).
- Real Razorpay test-mode payments credit correctly, through both the browser callback and the webhook path, with no double grants.
- The migration preserved every balance on a copy of production data.
- Preview isolation holds against a hostile generated site in a real browser.

**Production: not ready.** The blockers in section 9 are environment and operations items (key rotation, staging, webhook configuration, human login checks), not code defects.

**Recommendation:**
1. Set up staging.
2. Rotate the keys.
3. Configure the staging webhook.
4. Repeat the browser E2E there with a real verified login and a Razorpay-delivered webhook.
5. Then schedule production with the migration steps in section 4 and the rollback in 8e.

---

## Files changed in this verification pass

- `server/tests/payments.test.js` (+5 tests), `server/tests/credits.test.js` (+2 tests).
- No application source files were changed.
- Verification scripts live outside the repo, in the session scratchpad.

## Decisions log

- `users.credits` remains the authoritative balance; the ledger is written in the same transaction.
- No new runtime dependencies.
- Webhook events that fail validation return 200 (`ignored`); processing errors return 500 (Razorpay retries).
- Refund and dispute events do not change credits (billing policy unchanged; needs your decision).
- Browser automation used headless Edge over CDP instead of installing a new tool.

## 11. Priority 2 — AI architecture (implemented, awaiting review)

Plan and cost estimates: `docs/PRIORITY_2_PLAN.md`. Changelog: `CHANGES.md`.

### Files

**New:**
- `server/ai/{catalog,keyPool,providers,router,config,usage,intent,prompts,htmlPatch}.js`
- `server/models/ai.models.js` (`ai_calls`, `ai_requests`, `ai_config`)
- `server/middlewares/requireAdmin.js`, `server/controllers/admin.controller.js`, `server/routes/admin.routes.js`
- `server/scripts/set-admin.js`
- `server/tests/{intent,prompts,router,ai-api}.test.js`

**Modified:**
- `server/controllers/website.controller.js` (generate / edit / enhance use the router, design brief, intent planning and tracking)
- `server/models/user.model.js` (`role`)
- `server/app.js` (admin routes)
- `server/tests/{helpers,patch}.test.js`
- `README.md`

**Removed:** `server/config/openRouter.js`.

No client changes. No new dependencies. No data migration: all additions are additive.

### Tests executed

| What | Result |
| --- | --- |
| `npm test` — 105 tests (Priority 1 + intent, prompts, router, AI API) | **105 pass, 0 fail** |
| Live smoke test, real free-tier providers (tracking in a throwaway DB) | Design brief: Mistral 429 → Groq 404 → Cerebras 402 → ZhipuAI 429 → **Cloudflare success**. Brief parsed: light mode, earthy palette, Lato/Merriweather for a "calm ayurvedic clinic". Generation: Cerebras 402 → SambaNova 401 (key marked dead) → ZhipuAI 429 → **Cloudflare success** (37 s, 478 in / 3,047 out tokens, provider-reported). The page uses the brief's primary colour; the old `#0a0a0f` default is absent |

### Not verified
- No browser E2E of the new pipeline (API contract unchanged; covered by API tests with stubbed providers).
- Output quality across many prompts is not yet measured; the `ai_requests` data will provide it.
- Paid models were not called (disabled by default; prices are Nov 2026 third-party snapshots).
- Concurrent paid calls could overshoot the budget by at most one in-flight call each (checks are estimate-based and not atomic).

### Owner actions for AI
1. Fix provider accounts: Cerebras (402 billing), SambaNova/OpenRouter (dead keys), ZhipuAI (429).
2. Check Groq's current model ID (404).
3. Decide whether to enable a paid model. Current estimate: ≈ $0.008–0.010 per generation (see the plan).
4. Grant yourself admin: `node scripts/set-admin.js --uri <URI> --email <you>`.

## 12. Hardening phase — free-only AI, quotas, efficiency (implemented, awaiting review)

Business constraint: **₹0 budget — no paid API request, ever.**
Changelog: `CHANGES.md` ("Hardening"). Audit: "Status update — hardening phase".

### 12.1 Provider availability (real API calls, 2026-11-01)

Every key was checked with one metadata call (no tokens). Each provider then got tiny completions (≤ 5 output tokens). Keys are reported by index only.

| Provider | Keys | Result | Root cause | In use |
| --- | --- | --- | --- | --- |
| Groq | 5 | ✅ `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` answer | Earlier 404: `llama-3.1-8b-instant` is **retired**. Headers: 1000 requests/day, 8000 tokens/min | ✅ |
| ZhipuAI | 5 | ✅ `glm-4.5-flash` on all 5 keys | Earlier "429" was error **1113 = paid balance required** for `glm-4.5-air`; `glm-4-flash` IDs no longer exist (1211) | ✅ (flash) |
| Cloudflare | 5 accounts | ✅ token verify + `llama-3.3-70b` | Response shape changed to `result.choices` (adapter fixed) | ✅ |
| Mistral | 5 | ❌ 429 on every key, header `x-ratelimit-limit-req-minute: 0` | The accounts have no free API rate (not a transient limit) | disabled |
| SambaNova | 5 | ❌ 401 `invalid_api_key` on every key (model list is public, so it is not a credential check) | Invalid keys | disabled |
| OpenRouter | 5 | ❌ 401 "User not found" on every key | Accounts no longer exist. Old `:free` model IDs are no longer listed (catalog updated) | disabled |
| Cerebras | 5 | ❌ 402 "Payment required" on every key and model | No free access → **removed** (₹0 rule) | removed |

- **Successful real calls during this phase:** Groq (benchmark: 14 generations; E2E), ZhipuAI (E2E text edit), Cloudflare (E2E style edit).
- **Status reporting is evidence-based.** `/api/admin/ai/providers` (and `/api/website/status`) report `health`:
  - `verified` only after a successful real call in the last hour;
  - otherwise `unverified`, `paused`, `invalid_credentials`, `no_credentials` or `disabled`.
- **Multiple keys:** the 5 Groq keys each report an independent 1000-requests/day budget, which suggests 5 separate accounts. GenWeb.ai now treats each provider as ONE quota pool and never rotates keys to get around a limit. **Owner action:** confirm each provider's terms allow more than one account; if not, keep one key per provider.

### 12.2 Token efficiency — measured

**Generation strategies.** 7 categories × 2 strategies through the real pipeline, generation model pinned to `groq/gpt-oss-120b`. Totals include every call (design brief included). Provider-reported tokens; none estimated.

| Strategy | Avg total tokens | Avg input | Avg output | API calls | Avg time | Requirements met | Broken images | Distinct font pairs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **single** | **3,026** | 342 | 2,683 | **1** | 6.1 s | **39/39** | **3** | 5 / 7 |
| brief + generation | 3,440 (+14%) | 679 | 2,761 | 2 | 6.6 s | 37/39 | 13 | **7 / 7** |

**Decision:** `designStrategy: "auto"` → single call.
- The brief cost 14% more tokens and **2× the request quota** (the binding free-tier limit).
- It did not improve requirement coverage, and it produced more broken image URLs.
- Its only measured gain was typography variety. `brief` remains available for admins.

**Edit modes** (same page, same model; `benchmarks/2026-11-01/edit-mode-comparison.json`):

| Edit | Old mode (input / output tokens, latency) | New mode | Result |
| --- | --- | --- | --- |
| Style: accent colour + rounded buttons | whole `<style>`: 1,336 / 1,305, 3.4 s | overrides only: 1,339 / **166**, 0.7 s | output −87%, total −43%; both valid |
| Text: product rename across the body | whole body: 1,478 / 1,414, 3.5 s | find/replace: 1,490 / **117**, 0.7 s | output −92%, total −44%; both valid |
| Text: headline in a small section | whole section: 208 / 94 | find/replace: 218 / 117 | new mode slightly **worse** → rule added: sections < 1,500 chars use the section patch |

**Prompt templates:**
- v1 `MASTER_PROMPT`: 371 tokens.
- v2 single-call template: 270 tokens.
- Edit templates: 70–103 tokens plus the context they need.

**Other savings, not separately benchmarked:**
- deterministic repair of truncated pages (no AI call);
- script-only AI repair instead of regeneration;
- max 2 document attempts, no retries once free capacity is exhausted;
- brief cached 30 minutes and enhancement cached 24 hours for identical input.

### 12.3 Generation quality benchmark (actual observations, no invented scores)

Outputs, screenshots (375 px and 1366 px) and the raw data are in `benchmarks/2026-11-01/`. Rendered in headless Edge 156.

\* = regex result corrected by manual inspection (see `manualVerification` in `results.json`).

| Category | Strategy | Calls | In | Out | Total | Sec | Requirements | Primary / page bg | Fonts | @media | Mobile overflow | Runtime JS errors | Broken imgs | Unlabelled inputs | Repairs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| portfolio | single | 1 | 335 | 2825 | 3160 | 7 | 5/5 | #006d77 / (245, 245, 245) | Inter, Playfair Display | 2 | 0px | 0 | 2 | 0 | 0 |
| portfolio | brief | 2 | 668 | 3218 | 3886 | 8 | 5/5 | #004e92 / (255, 255, 255) | Open Sans, Roboto Slab | 3 | 0px | 0 | 1 | 0 | 0 |
| saas | brief | 2 | 678 | 3529 | 4207 | 8 | 5/5 | #1e88e5 / (255, 255, 255) | Poppins, Roboto | 1 | 0px | 0 | 6 | 0 | 0 |
| saas | single | 1 | 349 | 2833 | 3182 | 6 | 5/5 | #0D47A1 / (245, 247, 250) | Inter, Playfair Display | 1 | 0px | 0 | 0 | 0 | 0 |
| restaurant | single | 1 | 339 | 2580 | 2919 | 6 | 6/6 | #00695c / (250, 250, 250) | Playfair Display, Open Sans | 1 | 0px | 0 | 0 | 0 | 0 |
| restaurant | brief | 2 | 671 | 3386 | 4057 | 8 | 6/6 | #2e8b57 / (255, 248, 225) | Montserrat, Open Sans | 2 | 0px | 0 | 2 | 0 | 0 |
| ecommerce | brief | 2 | 732 | 2619 | 3351 | 6 | 5/6* | #a0522d / (255, 255, 255) | Open Sans, Playfair Display | 1 | 0px | 0 | 4 | 3 | 0 |
| ecommerce | single | 1 | 347 | 2379 | 2726 | 6 | 6/6* | #8B4513 / (250, 248, 245) | Playfair Display, Inter | 1 | 0px | 0 | 0 | 0 | 0 |
| agency | single | 1 | 336 | 3094 | 3430 | 7 | 6/6 | #0d3b66 / (255, 255, 255) | Inter, Playfair Display | 1 | 0px | 0 | 1 | 0 | 0 |
| agency | brief | 2 | 669 | 2462 | 3131 | 6 | 6/6 | #3a5fcd / (255, 255, 255) | Open Sans, Poppins | 1 | 0px | 0 | 0 | 0 | 0 |
| dashboard | brief | 2 | 660 | 2001 | 2661 | 5 | 4/5* | #004c8c / (255, 255, 255) | Roboto | 1 | 0px | 0 | 0 | 0 | 0 |
| dashboard | single | 1 | 343 | 2728 | 3071 | 6 | 5/5 | #0d6efd / (248, 249, 250) | Inter | 1 | 0px | 0 | 0 | 0 | 0 |
| docs | single | 1 | 348 | 2343 | 2691 | 5 | 6/6 | #0066cc / (249, 250, 251) | Inter, JetBrains Mono | 1 | 0px | 0 | 0 | 0 | 0 |
| docs | brief | 2 | 676 | 2112 | 2788 | 5 | 6/6* | #0066cc / (255, 255, 255) | Open Sans, Roboto | 1 | 0px | 0 | 0 | 0 | 0 |

**Observations:**
- **Coverage and correctness:** all 14 pages passed validation, with no JS syntax errors, no runtime exceptions and no repairs needed.
- **Confirmed requirement misses (brief strategy):**
  - ecommerce-brief shows 3 products **without prices**;
  - dashboard-brief has **no check-ins KPI**.
- **Accessibility:** every page had `lang`, focus styles and labelled inputs, except ecommerce-brief (3 unlabelled inputs).
- **Broken images:** models sometimes invent image URLs (16 broken images across 14 pages; 13 of them in the brief runs). In restaurant-brief the hero image fails and the hero shows as a plain grey block.
- **Mobile layout:** no horizontal overflow at 375 px on any page. But in dashboard-single the sidebar does not collapse on mobile and the logo overlaps the page title (seen in the screenshot). Zero overflow does not mean a good mobile layout.
- **Visual uniqueness is limited:**
  - all 14 sites are light-themed;
  - 9 of 14 primaries are blues;
  - "Inter + Playfair Display" recurs.
  - Designs are clean but generic. The requirement-driven prompt removed the forced dark template; it did not yet produce strong variety from these free models.
- **Possible next step (not done, needs your call):** an explicit "avoid the typical blue/white look; derive colours from the business" instruction or palette seeds. It costs no extra calls, but needs its own benchmark.

### 12.4 Edit validation (automated)

`server/tests/validate.test.js` (16 tests) and `server/tests/ai-api.test.js` cover:
- broken HTML (unclosed tags, truncation, mid-tag cuts);
- invalid JavaScript (compile-only check; JSON-LD and module scripts excluded);
- missing scripts and sections;
- duplicate IDs (new ones rejected, pre-existing ones not blamed on the patch);
- destructive patches, and a removed `</body>`;
- section selection (`features` vs `features-list`, wrong section caught);
- unusable, ambiguous or script-injecting text replacements;
- patch-to-full fallback;
- a full rewrite that drops scripts is refused and refunded.

### 12.5 Browser E2E (isolated, test data only)

**Setup:**
- a fresh local MongoDB replica set (not a production copy);
- local API and client;
- real free AI providers and real Firebase;
- headless Edge over the DevTools Protocol.

**Cleanup afterwards:** the Firebase test account was deleted, and the test database and browser profile were removed.

| Step | Result | Evidence |
| --- | --- | --- |
| Register (real Firebase) | PASS | "We sent a verification link…" |
| Unverified login blocked | PASS | "Your email is not verified yet…", stays on /login |
| Verified login / Google | NOT TESTED | needs a real inbox or Google account; later steps used an injected session for a test user |
| Generate via UI | PASS | 10 s, `groq/gpt-oss-120b`, single strategy, 1 AI call, 2,832 tokens, validation passed |
| Editor + sandboxed preview | PASS | `srcdoc`, sandbox without `allow-same-origin` |
| AI edit — style | PASS | `style_append`, 1 call, 1,265 tokens (later re-check: 1,162 tokens via Cloudflare) |
| AI edit — text | **FAIL, then PASS** | 1st run: the test user had 0 credits left; the server correctly refused ("Sorry, I hit an error: Insufficient credits") — a test-setup error. With credits: `section_patch` (small footer), ZhipuAI, 1 call, 284 tokens, new text saved |
| Save / undo / redo | PASS | persisted in the DB |
| Deploy / undeploy | PASS | public URL 200 with CSP sandbox → 404 after unpublish |
| Daily quota in UI | PASS | "Daily AI request limit reached…", no charge |
| **Bug found and fixed:** the editor reloaded after every AI edit | PASS after fix | Cause: the load effect depended on the whole `userData` object, which changes when credits refresh. Effect: wiped the **undo history** and the chat's per-edit badges. Re-tested: badges "⚡ 50 credits" + "1,162 tokens" render; Undo after an AI edit restores the previous version in the DB. **Also present in v1 (live).** |

### 12.6 Tests

`npm test` (server): **145 tests, 145 pass, 0 fail**. New in this phase:
- router 21 (free-only guards, account-level quotas, real error shapes, daily caps, request size, exhaustion, health evidence);
- quota 4;
- validate 16;
- AI API 17;
- strategy 1.

Client `npm run build` passes; lint shows no new error types.

## 13. Known limitations

- **Free-capacity ceiling.** Only three providers work with the current accounts (Groq, ZhipuAI flash, Cloudflare).
  - Groq allows 1000 requests/day per account and 8000 tokens/minute, so about one generation per minute per Groq account.
  - Real throughput is limited by these free quotas.
- **In-process state.** Provider cooldowns and health are per process; the daily request caps are shared via MongoDB. Several API instances would each learn about a rate limit separately, and the first 429 then pauses them.
- **Image URLs** invented by models break (16 broken images across the 14 pages). Not yet handled (e.g. a placeholder or stripping external images).
- **Mobile layout quality** is not fully measured: overflow is checked, overlap is not.
- **Visual variety** from the free models is limited (see 12.3).
- **Benchmark scope.** One run per category per strategy, one model; results show tendencies, not statistically significant differences.
- **Verified-email and Google login** have still not been exercised end-to-end.

## 14. Remaining blockers

1. Key rotation (all secrets leaked in git history).
2. No staging environment.
3. Razorpay webhook secret and dashboard configuration.
4. Live product still on Razorpay test keys (decision).
5. **New:** confirm provider terms for multiple accounts/keys (Groq keys look like 5 accounts; Cloudflare has 5 account IDs).
6. **New:** fix or remove dead provider accounts (Mistral 0 rpm, SambaNova invalid keys, OpenRouter deleted accounts) if more free capacity is wanted.
7. The v1 editor undo/reload bug (12.5) is live in production until v2 ships.

## 15. Correction pass after the hardening review (2026-11-01, awaiting approval)

The scope was the corrections requested in the hardening review. Not done in this pass: Priority 3, deployment, production data access, paid APIs, new dependencies.

### 15.1 Quota classification (corrected)

**Bug found and fixed.** A provider paused for repeated *transient* errors (`repeated_errors`) used to be counted as "capacity exhausted". Users were then told "free capacity is used up" when the real cause was an error.

Classification is now explicit (`isCapacityExhausted()` in `ai/router.js`):

| Class | Reasons | Meaning |
| --- | --- | --- |
| capacity | `rate_limit`, `quota_exhausted`, **`daily_request_cap`**, `restricted`, `billing` | a free-tier limit was hit → 503 `AI_QUOTA_EXHAUSTED` + `Retry-After` |
| neutral | `auth`, `invalid_credentials`, `no_credentials`, `model_unavailable`, `request_too_large` | configuration or size; does not decide either way |
| transient | HTTP / timeout / network errors, empty output, `repeated_errors`, `deadline` | → 503 "try again", not "exhausted" |

**Exhausted** = at least one capacity reason and no transient failure.

**Verified by tests:**
- **Provider quota:** Groq's daily cap reached → no provider call, 503 `AI_QUOTA_EXHAUSTED`, `Retry-After` equal to the time until the next UTC day (±10 s), user slot returned, no charge.
- **User quota, independently:** user cap reached while providers are healthy → 429 `DAILY_LIMIT`, no provider call, no provider counter used, no charge.
- **Release exactly once.** A starting count of 1 stays 1 after:
  - an AI validation failure;
  - a server error *after* the AI succeeded;
  - an edit failure.
  - A success then makes it 2.
- **Concurrent failures:** 6 simultaneous failing requests leave the counter at its starting value.

### 15.2 Provider state: what lives where (no multi-instance claim)

| State | Where | Effect if several API instances run |
| --- | --- | --- |
| User daily AI quota (`ai_counters`) | **MongoDB** (atomic) | correct across instances |
| Provider daily request caps (Groq 1000/day) | **MongoDB** (atomic) | correct across instances |
| Credits ledger, payments | **MongoDB** (transactions) | correct across instances |
| AI config overrides (`ai_config`) | **MongoDB**, cached **30 s per process** | changes reach each instance within 30 s |
| AI tracking (`ai_calls`, `ai_requests`), brief/enhance cache (`ai_cache`) | **MongoDB** | shared |
| Provider pauses (`rate_limit`, `billing`, `restricted`, `quota_exhausted`, `repeated_errors`) and dead keys | **process memory** | each instance learns a limit separately (may spend one extra provider call per instance); lost on restart |
| Retired-model cooldowns | **process memory** | same as above |
| Provider health evidence (`lastSuccessAt`, `lastError`) | **process memory** | `/providers` reports only that instance's view |
| HTTP rate limiter buckets | **process memory** | effective limits multiply by the number of instances |
| Firebase signing-cert cache | **process memory** | harmless |

**GenWeb.ai is NOT multi-instance ready.** It is correct for the current single Render instance. Several instances need the in-memory rows above moved to a shared store (e.g. Redis).

**Locked providers.**
- Mistral, SambaNova and OpenRouter now carry a `lockedReason` in the catalog.
- Admin config **rejects** enabling them.
- An override written directly to the database is **ignored**; locked models are forced off in `effectiveModels()`.
- Their health shows `disabled`.
- Unlocking requires a code change after a real successful call.

**No paid request:**
- A property test runs every task 4× with every provider failing and all provider keys present. Every request made was to an enabled, unlocked, free catalog model, and no locked provider was called.
- Existing guards stay in place: `assertFree()`, the OpenRouter `:free` check, and admin rejection of paid fields.

### 15.3 Quality changes (no extra AI call)

**Prompt (same single call):**
- Colours are taken from the business's own world (products, place, materials, mood, audience). Avoid the generic blue-on-white or dark-glass look unless asked; a tinted background is welcome.
- No external image URLs: use CSS, inline SVG or emoji.
- Mobile: single column, collapse sidebar/nav, nothing wider than the screen, no overlapping elements.
- Implement every requested feature, section and piece of content (interactive ones with working JS) before extras.
- Cost: the template grew from 270 to **391 tokens** of input.

**Deterministic image sanitizer** (`ai/sanitize.js`, no AI, no network):
- Any `<img>` that cannot load is replaced with an inline SVG placeholder. That covers external URLs not present in the user's request (or, for edits, already on the page), empty `src`, and relative paths (single-file pages have no asset files).
- External CSS `url()` backgrounds become `none`.
- Kept: Google Fonts (`<link>` and `@import`), web fonts, `data:` images, user-provided URLs.
- Applied to generations, full edits and patches.

**Benchmark tooling** (not product code):
- Mobile overlap is now detected per rendered text line. It is clipped to visible areas and ignores closed `<details>`, collapsed accordions, screen-reader-only text and wrapped inline links.
- Every flagged overlap was checked against a screenshot or element coordinates; false positives were removed before the numbers below.
- Requirement coverage is re-scored on the **rendered DOM**, so JavaScript-built content counts.

### 15.4 Benchmark: new prompt vs single-call baseline

- **Same set-up for both:** the same 7 prompts and the same generation model (`groq/gpt-oss-120b`), one run each.
- **Tokens:** provider-reported, all calls included (1 call per site in both sets).
- **Data:** `benchmarks/2026-11-01-v2prompt/` (outputs, screenshots, `results.json`, `comparison.json`).
- **Sanitizer note:** the empty/relative-`src` rule was added after this run. It was applied deterministically to the saved outputs (1 image replaced, restaurant); originals are kept as `*.raw.html`.

| Metric | Baseline (old prompt) | New prompt |
| --- | --- | --- |
| Avg total tokens (input / output) | 3,026 (342 / 2,683) | **3,306 (435 / 2,870), +9%** |
| API calls | 7 (1 per site) | 7 (1 per site) |
| Avg time | 6.1 s | 6.7 s |
| Requirements (rendered DOM, manually verified) | 39/39 | 39/39 |
| Broken images | 3 | **0** |
| Mobile text overlaps (375 px) | 1 (dashboard sidebar over title) | **0** |
| Horizontal overflow at 375 px / runtime JS errors | 0 / 0 | 0 / 0 |
| Primary colour = blue | 4 of 7 | **2 of 7** |
| Distinct primary hue families | 3 (teal, blue, brown) | **5** (teal, blue, brown, red, green) |
| Pages using Inter | 6 of 7 | 6 of 7 |

**Per category** (baseline → new primary colour):

| Category | Baseline | New |
| --- | --- | --- |
| portfolio | teal `#006d77` | teal `#00695c` |
| saas | blue `#0D47A1` | blue `#0D47A1` |
| restaurant | teal | teal, with a cream-tinted background |
| ecommerce | brown `#8B4513` | brown `#6B4226` |
| agency | navy `#0d3b66` | slate `#2A4D69` |
| dashboard | blue `#0d6efd` | **red `#d62828`** |
| docs | blue `#0066cc` | **green `#2a7f5c`** on a light-green background |

**Observed in screenshots:**
- The new dashboard collapses its sidebar into a hamburger on mobile, with single-column KPI cards; the baseline's logo/title overlap is gone.
- The new restaurant gallery uses CSS shapes and emoji instead of broken photos.
- **New defects / limits:**
  - The new restaurant page shows both the "☰ Menu" toggle and the full nav links on desktop: the toggle should be mobile-only.
  - Prices default to `$` when the prompt names no currency (new ecommerce and dashboard).
  - Typography is still mostly Inter (+ Playfair).
- **Trade-off:** +9% tokens per generation (mostly the 121 extra prompt tokens and slightly longer pages) for zero broken images, zero overlaps and more varied colour. **Requirement coverage did not change.**
- **Caveat:** one run per category; these are tendencies, not statistically significant results.

**Checker corrections recorded in the JSON (manual verification):**
- New ecommerce: prices are in USD and rendered by JS; the check only looked for ₹.
- Baseline ecommerce: the cart-count JS exists.

### 15.5 Final regression

| Check | Result |
| --- | --- |
| `npm test` (server) | **157 / 157 pass**: 145 existing + 12 new (classification 3, locked/paid property 2, sanitizer 2, quota API 4, prompt rules 1) |
| Client `npm run build` | passes |
| Browser E2E (fresh test DB, real free providers, real Firebase; test data deleted afterwards) | all steps below |

| E2E step | Result | Evidence |
| --- | --- | --- |
| Register (real Firebase) | PASS | verification notice |
| Unverified login blocked | PASS | stays on /login |
| Verified login / Google | **NOT TESTED** | needs a real inbox or Google account (session injected for the rest) |
| Generate (UI) | PASS | Groq, single strategy, 1 call, 3,341 tokens, validation passed |
| Editor + sandboxed preview | PASS | `srcdoc`, no `allow-same-origin` |
| CSS edit | PASS | `style_append`, 1 call, 1,343 tokens; badge "1,343 tokens" |
| Text edit | PASS | `text_replace`, ZhipuAI, 1 call, 1,446 tokens |
| Functional edit ("back to top" button) | PASS | full edit, Cloudflare, 1 call, 5,898 tokens. **Clicked in a real browser:** hidden at the top, visible after scrolling, click returns `scrollY` 1748 → 0; no script errors; earlier saved content kept |
| Undo / redo right after an AI edit | PASS | persisted in the DB |
| Save (direct code edit) + undo/redo | PASS | persisted |
| Deploy / undeploy | PASS | 200 with CSP sandbox → 404 |
| Daily quota (UI) | PASS | "Daily AI request limit reached…", credits unchanged (500 − 4×50 = 300) |
| Daily quota edge cases (API) | PASS | concurrent cap, release-once, user vs provider quota — see 15.1 |

### 15.6 Verified / partially verified / untested

**Verified** (automated tests and/or real runs):
- free-only routing and paid-request guards;
- account-level quotas, daily caps and capacity classification;
- user quota atomicity and release-once;
- locked providers;
- image sanitizer;
- generation, CSS, text and functional edits;
- undo/redo/save;
- deploy/undeploy;
- preview sandbox;
- registration and unverified-login blocking;
- payments and webhook (earlier passes);
- evidence-based provider health.

**Partially verified:**
- **Generation quality:** 7 prompts × 1 run per variant; one generation model.
- **Mobile layout:** overflow and text overlap are measured. Visual polish is judged only from the screenshots I reviewed: dashboard, restaurant, docs.
- **Provider availability:** real calls on 2026-11-01. Free-tier policies can change at any time.

**Untested:**
- verified-email and Google login end-to-end;
- Razorpay-delivered webhooks (needs a public URL and dashboard configuration);
- multi-instance behaviour (documented as not ready);
- images built inside page JavaScript (the sanitizer only handles static HTML/CSS);
- non-English prompts.

### 15.7 Known limitations (updated)

- Free capacity: three working providers (Groq 1000 requests/day and 8000 tokens/min per account; ZhipuAI `glm-4.5-flash`; Cloudflare daily allocation).
- Not multi-instance ready (15.2).
- The sanitizer cannot see image URLs that page JavaScript inserts at runtime.
- Desktop menu toggle shown alongside the nav links (new restaurant page).
- Currency defaults to `$` unless the request names one.
- Typography variety is still low (Inter-heavy).
- The +9% token cost of the richer prompt applies to every generation.

### 15.8 Blockers (unchanged)

Production deployment stays blocked by section 14:
- key rotation;
- staging environment;
- Razorpay webhook setup;
- test vs live Razorpay keys;
- confirming provider terms for multiple accounts;
- dead provider accounts.

## Next steps (need approval)

- Review of this correction pass.
- Priority 3 and production deployment are **not** started.
