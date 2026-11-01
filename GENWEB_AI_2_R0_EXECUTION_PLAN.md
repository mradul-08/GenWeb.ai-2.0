# GenWeb.ai 2.0: R0 Launch Blockers, Verification and Execution Plan

> **Latest status (2026-11-01). The text below is kept unchanged as the historical plan.**
> - **Code work done:**
>   - D1–D4 are implemented, subject to the verification reported in `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md`.
>   - The follow-up defects F-D2-1 and F-D4-1 are fixed and tested (`GENWEB_AI_2_R0_FINAL_SECURITY_FIX_REPORT.md`).
>   - F-D3-1 is deferred.
>   - Tests: server **184/184**, client **10/10**; the client production build passes.
> - **Still pending:**
>   - owner actions O1–O10 (O11 is a later cut-over; O12 is optional);
>   - G1, the decision on which git repository holds v2;
>   - the staging deployment, which needs separate approval;
>   - staging E2E verification (D6–D10).
> - **R0 is NOT complete.** Current summary: `GENWEB_AI_2_R0_FINAL_STATUS.md`.

*Prepared 2026-11-01. This was a read-only investigation: no source, configuration, credential, deployment, provider or database was changed. **R0 is NOT complete.** This document is a plan awaiting approval.*

**Status labels used below**

| Label | Meaning |
| --- | --- |
| **VERIFIED** | Confirmed today, from code, local files, test runs or official documents. |
| **PARTIALLY VERIFIED** | Some parts confirmed; the rest needs dashboard access or a live run. |
| **NOT VERIFIED** | Could not be checked within the read-only boundaries. |
| **UNCONFIRMED** | Official sources do not settle the question. |

Secrets are shown only as a 4-character prefix and a length.

---

## 1. Executive summary

**R0 readiness verdict: NOT READY.** Six planned blockers were investigated, and the investigation found **four additional blockers** that were not in earlier reports.

| # | Blocker | Status | Severity | Who acts |
| --- | --- | --- | --- | --- |
| B1 | Exposed secrets: rotation needed | PARTIALLY VERIFIED | **Critical** | Owner (rotate) + developer (verify) |
| B2 | No staging environment | VERIFIED (staging does not exist) | High | Owner (create resources) + developer (small config changes) |
| B3 | Razorpay webhook not configured; real delivery untested | VERIFIED code / NOT VERIFIED live | High | Owner (dashboard) + developer (test run) |
| B4 | Multiple provider accounts vs terms | VERIFIED for Groq and Cloudflare (terms checked); UNCONFIRMED for ZhipuAI | **High (compliance)** | Owner (decision, account clean-up) |
| B5 | Dead or invalid providers | VERIFIED (locked in code) | Medium | Owner (revoke keys) |
| B6 | Auth E2E: verified-email and Google login untested | PARTIALLY VERIFIED | Medium | Owner (test accounts) + developer (run) |
| **B7 (new)** | `server/package.json` declares Node `18.x`, but the installed `mongoose` 9.6.1 and `mongodb` 7.2.0 require Node **≥ 20.19.0** | VERIFIED | **High** (deploy may fail or misbehave) | Developer (one-line change, needs approval) |
| **B8 (new)** | Cloudflare is configured as 5 separate accounts with `quotaScope: "credential"`, so its free allocation is **multiplied by 5** | VERIFIED | **High (compliance)** | Owner (keep 1 account) + developer (optional catalog change) |
| **B9 (new)** | The local `server/.env` points at the hosted Atlas cluster, database `websiteBuilder` (probably production) | VERIFIED (file contents) | **High** (accidental production writes during development) | Owner (decide) + developer (separate URIs) |
| **B10 (new)** | Firebase client config is hardcoded to project `genwebai-dca16`, so staging cannot use a separate Firebase project without a code change | VERIFIED | Medium | Developer (env-based config, needs approval) + owner (create project) |

**What is already solid:**
- **Tests:** 157/157 pass (run today).
- **Webhook:** signature checked against the raw body; replay is idempotent; webhook and browser verify race safely; secret enforced.
- **Auth:** server-side `email_verified` check; Firebase token audience and issuer checks; `tokenVersion` revocation.
- **Hygiene:** no real secrets in v2 source files; `.env*` are git-ignored.

---

## 2. Blocker-by-blocker evidence

### B1. Exposed secrets and credential rotation (PARTIALLY VERIFIED, Critical)

**Evidence**

| Check | Result | Source |
| --- | --- | --- |
| Secrets in git history | **Previously verified in the original repo** (not re-checked: the original `websiteBuilder` is out of bounds). The audit recorded a commit "remove .env from tracking" and a ZhipuAI key in tracked `server/test.mjs`. | `GENWEB_AI_2_AUDIT.md:126`, `:238`; `GENWEB_AI_2_IMPLEMENTATION_STATUS.md:58` |
| v2 is a git repo? | **No** (`git rev-parse` fails). v2 adds no new history exposure. | today |
| Hardcoded secrets in v2 source | **None found.** Pattern scan for Groq/Cerebras/Razorpay/OpenRouter/Cloudflare/Mongo-URI/Firebase/JWT formats outside `node_modules`. Matches only in: `server/.env`, `client/.env`, `client/.env.local` (expected); `server/tests/helpers.js:10-11` (placeholders `rzp_test_key…`, not real); `client/dist/assets/*.js` (the Firebase **web** API key, public by design). | today |
| `server/test.mjs` in v2 | Not present. | today |
| `.gitignore` coverage | Root: `.env`, `.env.*`, `!.env.example`. Server: `.env`. Client: `*.local`, `.env*`. | `.gitignore`, `server/.gitignore`, `client/.gitignore` |

**Secret inventory: `server/.env` (masked)**

| Category | Variables | Count | Status in code |
| --- | --- | --- | --- |
| Database | `MONGODB_URL` (Atlas, host `***.ayk95r2.mongodb.net`, db `websiteBuilder`) | 1 | used |
| Session | `JWT_SECRET` (`KNEB…`, 49 chars) | 1 | used |
| Payments | `RAZORPAY_KEY_ID` (**`rzp_test_`** prefix = test mode), `RAZORPAY_KEY_SECRET` | 2 | used |
| Payments | `RAZORPAY_WEBHOOK_SECRET` | **missing** | webhook returns 503 without it |
| AI: Groq | `GROQ_API_KEY_1..5` (`gsk_…`, 56) | 5 | active |
| AI: ZhipuAI | `ZHIPU_API_KEY_1..5` (49) | 5 | active |
| AI: Cloudflare | `CLOUDFLARE_API_KEY_1..5` (`cfut…`) + `CLOUDFLARE_ACCOUNT_ID_1..5` | 5 + 5 | active |
| AI: Mistral | `MISTRAL_API_KEY_1..5` | 5 | locked |
| AI: SambaNova | `SAMBANOVA_API_KEY_1..5` | 5 | locked (invalid) |
| AI: OpenRouter | `OPENROUTER_API_KEY_1..5` (`sk-o…`) | 5 | locked (users not found) |
| AI: Cerebras | `CEREBRAS_API_KEY_1..5` (`csk-…`) | 5 | **unused**: provider removed from the catalog |

Other env files:
- `client/.env`: `VITE_FIREBASE_API_KEY` (public by design) plus API URLs. `VITE_SERVER_URL` is defined twice, and the second value wins.
- `client/.env.local`: `VERCEL_OIDC_TOKEN` (1,231 chars), dated Jun 11. These tokens are short-lived **[ASSUMPTION: expired]**. Delete the file.

**Liveness of credentials**
- Provider liveness was verified **today by real free calls** during the hardening pass: Groq, ZhipuAI and Cloudflare work; Mistral is limited to 0 requests per minute; SambaNova returns 401; OpenRouter reports the user as not found; Cerebras returns 402.
- **No new calls were made** for this report.
- **Razorpay, Atlas and JWT liveness: NOT VERIFIED.** Checking them would mean using the credentials against live services. Treat every one as **live and leaked**.

**Risk:**
- Anyone with the old history can call AI providers on our accounts (quota theft, ToS strikes).
- Anyone with `JWT_SECRET` can forge sessions for any user.
- Anyone with the Mongo password can read or alter production data, including credits.

**Rotation checklist (owner).** Do it in this order. Each new value goes straight into Render, never into chat or git.

| # | Item | Where | Notes |
| --- | --- | --- | --- |
| 1 | MongoDB Atlas DB user password, or a new user + delete the old one | Atlas → Database Access | Restrict Network Access (IP allow-list) to Render's outbound IPs if the plan allows, otherwise keep `0.0.0.0/0` documented as a risk. Rotate first: highest impact. |
| 2 | `JWT_SECRET` | generate ≥ 48 random bytes | Logs every user out once (expected). Announce. |
| 3 | Razorpay key secret (test now; live later) | Razorpay → Settings → API Keys → Regenerate | Then create `RAZORPAY_WEBHOOK_SECRET` (B3). |
| 4 | Groq key(s) | console.groq.com → API Keys | Revoke all 5; create **one** (see B4). |
| 5 | ZhipuAI key(s) | open.bigmodel.cn → API keys | Revoke all, including the one from `test.mjs`; create **one**. |
| 6 | Cloudflare API tokens | dash.cloudflare.com → API Tokens | Revoke all 5; keep **one** account and one token scoped to *Workers AI: Read/Run* only (B8). |
| 7 | Cerebras, Mistral, SambaNova, OpenRouter keys | each dashboard | **Revoke/delete** (unused or dead, B5). |
| 8 | Firebase web key | Google Cloud → Credentials | Not secret, but add HTTP-referrer restrictions (prod + staging domains). |
| 9 | `client/.env.local` | local disk | Delete (stale Vercel OIDC token). |
| 10 | Optional: purge git history of the original repo | `git filter-repo` | Only after rotation. Rotation is what actually protects you. The original repo is outside this task. |

**Test procedure (developer, after rotation):**
1. On staging, set the new env values.
2. `/health` returns 200.
3. Sign-in works.
4. One free AI generation succeeds.
5. An old JWT cookie is rejected (401).
6. An old provider key, called once from the owner's machine against a free model-list endpoint, returns 401. Owner's choice.

**Rollback:**
- Credential rotation cannot be safely undone after a leak.
- If a new value is wrong, put in the **corrected new** value. Never restore the old one.

**Effort:** owner ~1–2 h; developer ~30 min of verification.

### B2. Staging environment (VERIFIED: does not exist)

**Evidence**

| Item | Finding | Source |
| --- | --- | --- |
| Client hosting | Vercel builds `client` (`npm run build --prefix client`, output `client/dist`, SPA rewrite). | `vercel.json` |
| Production URLs | `CLIENT_URL=https://genweb-ai-delta.vercel.app`, `SERVER_URL=https://genweb-ai-5o8k.onrender.com` | `server/.env` |
| Allowed origins | Hardcoded: `localhost:5173`, `genweb-ai-delta.vercel.app`, `genwebai-dca16.web.app`, plus `CLIENT_URL`. A staging API would also accept the production frontend origin (low risk, but not isolated). | `server/config/origins.js:2-7` |
| Cookies | `secure: true, sameSite: "none"`, cross-site cookie. Staging client and API must both use HTTPS. | `server/utils/session.js:6-7` |
| DB | `MONGODB_URI` or `MONGODB_URL`; must be a replica set (transactions). | `server/config/db.js:17` |
| Firebase | Server: `FIREBASE_PROJECT_ID` (default `genwebai-dca16`). Client: **hardcoded** config. | `server/utils/verifyFirebaseToken.js:24`; `client/src/firebase.js` |
| Render / Atlas dashboard settings | **NOT VERIFIED** (no dashboard access, by design). No `render.yaml` in the repo. | — |
| Node version | See B7. | — |

**Required staging resources (owner)**
1. **Atlas:** a separate project or cluster (M0 free is fine), DB name `genweb_staging`, its own DB user. **Never** reuse the production cluster user.
2. **Render:** a second Web Service from the same code, root `server`, start `npm start`.
3. **Vercel:** a stable staging domain, either a second project or a fixed Preview alias, with Preview-scoped env vars.
4. **Firebase:** a separate project `genwebai-staging` (recommended; needs B10), or reuse production Firebase with test accounts only (weaker isolation).
5. **Razorpay:** **test mode** keys + a test-mode webhook pointing at staging.
6. **AI:** one key per provider. Either share the production accounts, which share quota (acceptable on the free tier if production is not live yet), or use none. Do **not** create extra accounts for staging (B4).

**Staging environment variables**

| Service | Variable | Staging value |
| --- | --- | --- |
| Render | `NODE_ENV` | `production` |
| Render | `MONGODB_URI` | staging cluster URI |
| Render | `JWT_SECRET` | new, different from production |
| Render | `CLIENT_URL` | staging client origin (exact) |
| Render | `SERVER_URL` | staging Render URL |
| Render | `FIREBASE_PROJECT_ID` | `genwebai-staging` (or the production ID if reusing) |
| Render | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | test-mode keys |
| Render | `RAZORPAY_WEBHOOK_SECRET` | the secret entered on the staging webhook |
| Render | `GROQ_API_KEY_1`, `ZHIPU_API_KEY_1`, `CLOUDFLARE_API_KEY_1` + `CLOUDFLARE_ACCOUNT_ID_1` | one each |
| Vercel (Preview) | `VITE_API_URL` | staging Render URL |
| Vercel (Preview) | `VITE_FIREBASE_*` | staging Firebase config (after B10) |

**Separation rules:**
- No production URI, secret or Firebase project in staging.
- Staging data is disposable.
- Production data is never copied to staging. If realistic data is needed, use an anonymised export, approved separately.

**Test procedure:**
1. Deploy staging.
2. `/health` returns 200.
3. Run the full E2E: register, verify, login, generate, edit, undo, save, deploy/undeploy, buy credits (test mode).
4. Check that the production DB is untouched: compare document counts before and after; read-only, owner-run.

**Rollback:** delete the staging services. Production is unaffected.

**Effort:** owner ~2–3 h (accounts and dashboards); developer ~2 h (B7 + B10 + smoke run).

### B3. Razorpay webhook (VERIFIED in code / NOT VERIFIED live)

**Evidence: code**

| Property | Implementation | Source |
| --- | --- | --- |
| Raw body | `express.raw({ type: "application/json", limit: "1mb" })` mounted **before** `express.json` | `server/app.js:25` |
| Secret required | No `RAZORPAY_WEBHOOK_SECRET` → 503 (Razorpay retries) | `payment.controller.js:125-128` |
| Signature | HMAC-SHA256 of the raw body vs `x-razorpay-signature`, timing-safe compare | `payment.controller.js:133` |
| Events | `order.paid` (credits); `payment.captured` (fetches the order, credits only if `status === "paid"`); all others ignored with 200 | `payment.controller.js:146-160` |
| Trust | Credits come from the order's server-written `notes`, not the client | `createOrder`; `services/credits.js:104` |
| Idempotency | `payments.orderId` and `paymentId` are unique; ledger `idempotencyKey: purchase:<orderId>` is unique; grant runs in a transaction | `models/payment.model.js`; `services/credits.js:141`; `models/creditTransaction.model.js:13` |
| Replay protection | A replayed valid event is a no-op ("already"). There is **no timestamp window and no stored event-id**: `x-razorpay-event-id` is only logged (`:145`). This is acceptable because crediting is idempotent per order. | — |
| Errors | Processing error → 500 (retry); validation error → 200 `ignored` | `:162-170` |
| CSRF | The webhook route is outside `/api` `checkOrigin` and works without an Origin header | test at `payments.test.js:173` |

**Evidence: tests (all pass today).** 17 payment tests (`server/tests/payments.test.js:48-245`):
- bad signature;
- missing secret;
- re-serialised body fails;
- byte-identical replay grants once;
- `order.paid` + `payment.captured` grant once;
- concurrent verify + webhook grant once;
- a transaction failure rolls back, then the retry grants once;
- refund and failed events do not change credits.

**Not verified:**
- a real delivery from Razorpay's servers;
- the dashboard configuration;
- live-mode keys.

`RAZORPAY_WEBHOOK_SECRET` is **absent** from the local `server/.env`, so local and probably current production webhooks return 503 **[production env NOT VERIFIED]**.

**Staging configuration (owner):** Razorpay Dashboard (Test mode) → Settings → Webhooks → Add:
- URL: `https://<staging-render-host>/api/payment/webhook`
- Secret: a random 32+ chars string, also set in Render as `RAZORPAY_WEBHOOK_SECRET`
- Active events: `order.paid`, `payment.captured`

**Real test-mode delivery procedure (developer, with owner present):**
1. Sign in on staging. Note the credits, e.g. 100.
2. Buy the smallest pack with a Razorpay **test** card or UPI test ID.
3. **Case A (normal):** the browser `/verify` path grants. Then the webhook arrives and is logged as `already`. Credits grow by exactly one pack.
4. **Case B (lost callback):**
   1. create a second order;
   2. close the tab after payment is authorised and before the redirect, or block `/api/payment/verify` in DevTools;
   3. the webhook alone grants;
   4. credits grow by exactly one pack.
5. **Replay:** Razorpay Dashboard → Webhooks → the event → *Resend*. Status `already`; credits unchanged.
6. **Bad secret:** temporarily set a wrong `RAZORPAY_WEBHOOK_SECRET` on staging, then resend. The response is 401 and Razorpay shows a failed delivery. Restore the correct secret, resend, and the result is `already`.
7. **Ledger check:** run `npm run ledger:reconcile` against the **staging** DB. Expect 0 mismatches.

**Expected result:** every purchase is credited exactly once; `payments` and `credit_transactions` each have one row per order; reconcile is clean.

**Rollback:** disable the webhook in the dashboard. Browser `/verify` still credits payments, which is the previous behaviour.

**Effort:** owner ~30 min; developer ~1 h.

### B4. AI provider terms: multiple accounts (VERIFIED for Groq and Cloudflare / UNCONFIRMED for ZhipuAI)

**Official terms checked today**

| Provider | Official text | Verdict for our setup |
| --- | --- | --- |
| **Groq** | [Acceptable Use Policy](https://console.groq.com/docs/legal/ai-policy) (effective 2025-10-15) prohibits use "beyond published parameters, rate limits, or use limitations, **including by registering multiple accounts**", and coordinating usage across organisations. [Rate limits](https://console.groq.com/docs/rate-limits) apply at the organisation level. The [Services Agreement](https://console.groq.com/docs/legal/services-agreement) says Groq has no obligation to provide multiple accounts. | **Not permitted.** Our 5 keys show independent 1000 requests/day budgets, i.e. 5 accounts. The shared counter caps the *daily* total at one account's limit, but round-robin still spreads per-minute token load across accounts. → **Keep exactly one Groq account/key.** If needed, use Groq *Projects* within one organisation. |
| **Cloudflare** | [Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/) (updated 2025-09-12) §2.2.1(c): no use "intended to circumvent Service-specific usage limits, quotas"; §2.2.1(e): no automated creation of multiple accounts. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10,000 Neurons/day free. | **Very likely not permitted.** 5 accounts used together to get 5 × 10,000 Neurons are exactly a quota-circumvention pattern (see B8). → **Keep one account.** |
| **ZhipuAI / Z.ai** | [Z.ai Terms of Use](https://docs.z.ai/legal-agreement/terms-of-use) (updated 2026-04-14): no explicit rule on multiple accounts or rate limits. Note: our code calls `open.bigmodel.cn` (the China platform), whose own user agreement **I could not retrieve**. | **UNCONFIRMED.** Under our own rule ("multiple keys never multiply free quota"), use **one** key. |

**Code behaviour (VERIFIED):**
- `server/ai/keyPool.js:1-8`: scope `provider` means that a rate-limit or quota response from any key pauses the whole pool.
- `catalog.js:27`, `:35`: Groq and ZhipuAI are `quotaScope: "provider"`.
- `router.js`: Groq's daily cap is reserved once per provider (`scopeKey = "account"`).
- So **code does not multiply Groq or ZhipuAI daily quotas**. Using several accounts at all is still the problem.

**Compliant configuration (recommended):**
1. Exactly **one account and one key per provider**: `GROQ_API_KEY_1`, `ZHIPU_API_KEY_1`, `CLOUDFLARE_API_KEY_1` + `CLOUDFLARE_ACCOUNT_ID_1`.
2. Delete the extra accounts or keys, or at least do not configure them anywhere.
3. Free capacity becomes roughly:
   - Groq 1000 requests/day;
   - ZhipuAI: its free limit (**UNCONFIRMED**; third-party pages mention about 1000/day);
   - Cloudflare 10,000 Neurons/day.
4. The per-user daily cap (default 60) and credits keep demand inside this. Measure after launch; never add accounts to grow.

**Owner action:** decide and clean up accounts. Optionally email Z.ai/Zhipu support to confirm.

**Developer action:** none required. B8 has an optional code hardening.

**Test:** with one key per provider, the existing router tests plus one staging generation still pass. `/api/admin/ai/providers` shows `total: 1` per provider.

**Rollback:** n/a. Do not re-add accounts.

**Effort:** owner ~1 h.

### B5. Dead or invalid providers (VERIFIED)

| Provider | Catalog | Evidence (real calls, 2026-11-01) | Action |
| --- | --- | --- | --- |
| Mistral | `enabled: false`, `lockedReason` | 0 requests/minute limit on all keys | Keep locked; revoke keys (B1 #7) |
| SambaNova | locked | 401 invalid on all keys | Keep locked; delete keys |
| OpenRouter | locked | "User not found" (accounts deleted) | Keep locked; remove env vars |
| Cerebras | **not in the catalog** (removed) | 402 Payment required | Remove `CEREBRAS_API_KEY_*` from env (unused) and revoke |
| ZhipuAI `glm-4.5-air` | excluded | error 1113 (needs a paid balance) | stays excluded |

Locks are enforced in code:
- the admin config rejects enabling them;
- DB overrides are ignored;
- health shows `disabled`.

These are covered by tests: locked/paid property tests among the 157 passing. Source: `server/ai/catalog.js:69-88`.

**Effort:** owner ~20 min (revoke and remove env vars).

### B6. Authentication E2E (PARTIALLY VERIFIED)

| Flow | Code | Automated tests (pass) | Real browser E2E |
| --- | --- | --- | --- |
| Email signup sends a verification mail | `LoginModels.jsx:159-161` (`createUserWithEmailAndPassword` + `sendEmailVerification`) | — | **PASS** (registration + verification notice) |
| Unverified login rejected | client `LoginModels.jsx:169` re-sends verification; server `auth.controller.js:31-32` → 403 `EMAIL_NOT_VERIFIED` | `auth.test.js:35` | **PASS** |
| Verified email login | `auth.controller.js` | creation/linking tests `:42-79` (with signed test tokens) | **NOT TESTED**: needs a real inbox |
| Google login | `LoginModels.jsx:200` (`signInWithPopup`) | same server path | **NOT TESTED**: needs a Google test account |
| Token checks (audience, issuer, expiry, unknown key) | `verifyFirebaseToken.js:24-39` | `auth.test.js:20-30` | — |
| Logout-all / `tokenVersion` | `auth.controller.js` `logoutAll` | `auth.test.js:85` | PASS (earlier pass) |

**Missing coverage:**
- a real Firebase-issued token for a verified email, and for Google;
- Firebase Authorized Domains for staging (Google popup fails on unlisted domains);
- the account-linking path for a v1 user with a real Google account.

**Safe prerequisites (owner):**
- a dedicated test mailbox (e.g. a new Gmail used only for testing);
- one Google test account;
- the staging domain added in Firebase → Authentication → Settings → Authorized domains;
- no real user accounts used.

**Test procedure (staging):**
1. Sign up with the test mailbox. Login before verifying is blocked.
2. Click the verification link, then log in. The dashboard shows 100 credits and one `signup` ledger row.
3. Log out, then log in again: same user, no duplicate.
4. Google login with the test Google account creates a new user. Logging in again reuses it.
5. Same email via email/password and via Google: the outcome is a link, or a 409 if the UIDs differ, as designed.
6. Logout-all: an old cookie gets 401.

**Expected:** all steps pass; a single user per identity; credits are ledgered once.

**Rollback:** delete the test users from staging Firebase and the staging DB.

**Effort:** owner ~20 min; developer ~1 h.

### B7 (new). Node version mismatch (VERIFIED)

- **Evidence:**
  - `server/package.json:17`: `"engines": { "node": "18.x" }`;
  - installed `mongoose` 9.6.1 requires `node >= 20.19.0`;
  - installed `mongodb` 7.2.0 requires `>= 20.19.0`.
  - Local tests run on Node v24.11.0, which is why it did not show.
- **Risk:** Render selects the Node version from `engines` **[ASSUMPTION: Render's documented behaviour; verify in the Render build log]**. On Node 18 the server may fail at start or fail in subtle ways.
- **Developer action (needs approval):**
  1. set `"node": ">=20.19 <25"` or `"22.x"`;
  2. optionally add `.node-version`;
  3. no dependency changes.
- **Test:** the staging build log shows Node 22; `/health` returns 200; full E2E passes.
- **Rollback:** revert the line. It is meaningless to roll back to 18, though, because the dependencies need 20+.
- **Effort:** 10 min plus a staging build.

### B8 (new). Cloudflare quota multiplied across 5 accounts (VERIFIED)

- **Evidence:**
  - `server/ai/catalog.js:38-44`: Cloudflare uses `quotaScope: "credential"`, documented as "each credential is a distinct account";
  - `server/.env` holds 5 distinct `CLOUDFLARE_ACCOUNT_ID_n`;
  - each account has its own 10,000 Neurons/day, so the router rotates to the next account when one is exhausted.
- **Conflicts:** this contradicts the stated rule "Do not treat multiple API keys/accounts as unlimited quota" and likely Cloudflare §2.2.1(c).
- **Owner action:** configure **one** Cloudflare account only.
- **Developer action (optional, needs approval):** change Cloudflare to `quotaScope: "provider"` (so even a misconfiguration cannot multiply quota), and have the admin providers view warn when more than one credential is configured for any provider. Add a test.
- **Test:** with 2 Cloudflare credentials configured, a capacity error on one pauses both.
- **Rollback:** revert the catalog line.
- **Effort:** owner 10 min; developer 30 min.

### B9 (new). Development environment points at the hosted database (VERIFIED file contents)

- **Evidence:**
  - `server/.env` `MONGODB_URL` → Atlas host `***.ayk95r2.mongodb.net`, database `/websiteBuilder`;
  - `server/config/db.js:17` uses it whenever `npm run dev` / `npm start` runs locally.
  - Whether this is the production DB is **NOT VERIFIED** (no connection made), but the production `CLIENT_URL` / `SERVER_URL` sit in the same file.
  - All work so far used `mongodb-memory-server` or a local replica set, so **no production access happened**.
- **Risk:** starting the v2 server locally would run `ensureIndexes()` and serve writes on production data. The index creation is additive, but writes are not.
- **Owner action:** after rotation (B1), do **not** put the production URI in any local file. Use a local replica set or the staging cluster for development.
- **Developer action (optional, needs approval):** a startup guard that refuses to start when `NODE_ENV !== "production"` and the URI host is on a configured production list.
- **Effort:** owner 5 min; developer 30 min (optional).

### B10 (new). Firebase client config hardcoded (VERIFIED)

- **Evidence:** `client/src/firebase.js` hardcodes `projectId: "genwebai-dca16"` and the app config. The server side is already env-driven (`FIREBASE_PROJECT_ID`).
- **Developer action (needs approval):**
  - read `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` and `VITE_FIREBASE_STORAGE_BUCKET`;
  - default to the current production values, so production behaviour is unchanged;
  - update `client/.env.example`.
- **Test:**
  - the production build without the new vars produces an identical config;
  - the staging build with staging vars signs in against the staging project;
  - the server rejects a staging token when `FIREBASE_PROJECT_ID` is production (existing audience test).
- **Rollback:** revert the file.
- **Effort:** 30 min.

---

## 3. Owner action checklist

- [ ] **O1 (Critical):** rotate the Atlas DB password / user (B1 #1).
- [ ] **O2:** decide one account per provider (B4). Revoke extra Groq, ZhipuAI and Cloudflare keys; keep one each (B1 #4–6, B8).
- [ ] **O3:** revoke Mistral, SambaNova, OpenRouter and Cerebras keys; remove them from all env stores (B5).
- [ ] **O4:** regenerate the Razorpay test key secret (B1 #3).
- [ ] **O5:** create the staging Atlas cluster + user, Render service, Vercel staging domain and Firebase staging project (B2).
- [ ] **O6:** set the staging env vars (table in B2), including a **new** staging `JWT_SECRET`.
- [ ] **O7:** create the Razorpay test-mode webhook pointing at staging; set `RAZORPAY_WEBHOOK_SECRET` (B3).
- [ ] **O8:** add the staging domain to Firebase Authorized Domains; create a test mailbox and a Google test account (B6).
- [ ] **O9:** restrict the Firebase web API key by HTTP referrer (B1 #8).
- [ ] **O10:** delete `client/.env.local`; remove the production `MONGODB_URL` from local `server/.env` after rotation (B1 #9, B9).
- [ ] **O11:** later, at production cut-over: rotate the production `JWT_SECRET` and set production env vars on Render. **This is not part of R0 execution without separate approval.**
- [ ] **O12 (optional):** ask Z.ai/Zhipu support about the multiple-account policy.

## 4. Developer execution sequence (after approval)

| Step | Action | Changes code/config? | Depends on |
| --- | --- | --- | --- |
| D1 | B7: set Node engine to `>=20.19` (or `22.x`) | `server/package.json`, 1 line | approval |
| D2 | B10: env-driven Firebase client config with production defaults; update `.env.example` | `client/src/firebase.js`, `client/.env.example` | approval |
| D3 | B8 (optional): Cloudflare `quotaScope: "provider"` + a warning when >1 credential per provider + a test | `server/ai/catalog.js`, `router.js` / admin view, tests | approval |
| D4 | B9 (optional): production-URI startup guard + a test | `server/config/db.js`, test | approval |
| D5 | Re-run `npm test` (expect 157 + new) and `npm run build` | — | D1–D4 |
| D6 | Staging smoke: `/health`, Node version in the build log, sign-in, one generation, one edit, deploy/undeploy | — | O5, O6, D5, **deployment approval for staging** |
| D7 | B3 webhook procedure (cases A, B, replay, bad secret, reconcile) | — | O7, D6 |
| D8 | B6 auth procedure (6 steps) | — | O8, D6 |
| D9 | B1 post-rotation checks (old JWT rejected; providers OK with one key each) | — | O1–O4, D6 |
| D10 | Write the R0 verification report (verified / partial / untested) and stop | docs | D6–D9 |

Code changes D1–D4 are small and isolated. None of them adds a dependency.

## 5. Verification matrix

| Blocker | Test | Expected | Environment | Status today |
| --- | --- | --- | --- | --- |
| B1 | Old JWT cookie after rotation | 401 | staging | NOT VERIFIED |
| B1 | Generation with one new key per provider | success, `total: 1` | staging | NOT VERIFIED |
| B1 | No secrets in v2 source | 0 real matches | local | **VERIFIED** |
| B2 | `/health`, full E2E on staging | all pass | staging | NOT VERIFIED (no staging) |
| B2 | Production DB untouched by staging | counts unchanged (owner, read-only) | production | NOT VERIFIED |
| B3 | Webhook code paths (17 tests) | pass | local | **VERIFIED** |
| B3 | Real delivery: normal, lost callback, replay, bad secret | +1 pack each; replay no-op; 401 | staging test mode | NOT VERIFIED |
| B3 | Ledger reconcile | 0 mismatches | staging | NOT VERIFIED |
| B4 | One account per provider configured | `total: 1` each | staging | NOT VERIFIED |
| B4 | Groq / Cloudflare terms | multiple accounts not allowed | docs | **VERIFIED** |
| B4 | ZhipuAI terms | — | docs | **UNCONFIRMED** |
| B5 | Locked providers cannot be enabled | rejected / ignored | local tests | **VERIFIED** |
| B6 | Unverified login blocked | 403 `EMAIL_NOT_VERIFIED` | local + browser | **VERIFIED** |
| B6 | Verified email + Google login | success, single user | staging | NOT VERIFIED |
| B7 | Build uses Node ≥ 20.19 | log shows the version | staging | NOT VERIFIED (mismatch VERIFIED) |
| B8 | Capacity pause spans all Cloudflare credentials | pool paused | local test (after D3) | NOT VERIFIED |
| B10 | Production config unchanged when vars are absent | identical config | local build | NOT VERIFIED |
| All | Regression | 157/157 pass | local | **VERIFIED today** (53 s) |

## 6. Rollback plan

| Change | Rollback | Data risk |
| --- | --- | --- |
| Credential rotation | Never restore old values; fix forward with a corrected new value | none |
| Staging resources | Delete the staging Render/Vercel/Atlas/Firebase resources | none (disposable) |
| Razorpay staging webhook | Disable it in the dashboard; `/verify` still credits | none |
| D1 Node engine | Revert the line (but dependencies need ≥ 20.19) | none |
| D2 Firebase env config | Revert the file; defaults equal production anyway | none |
| D3 Cloudflare scope | Revert the catalog line | none |
| D4 DB guard | Remove the guard | none |
| Provider account reduction | Not rolled back: compliance | capacity lower (expected) |

## 7. Unresolved questions

1. **Is the Atlas `websiteBuilder` database in local `server/.env` the production database?** (owner)
2. **Which Node version does the current Render production service actually run?** The `engines` field says 18; check the Render build log. If production runs v2 code on Node 18, there may be a live incident. Today's production may still run v1 code.
3. **Is `RAZORPAY_WEBHOOK_SECRET` set on Render production?** It is absent locally.
4. **ZhipuAI multiple-account policy** for the `open.bigmodel.cn` platform: UNCONFIRMED.
5. **ZhipuAI free-tier limits:** not documented by any official source I found; third-party sources say about 1000/day.
6. **Firebase for staging:** a separate project (recommended, needs D2) or the production project with test accounts?
7. **Do staging AI calls share the production provider accounts?** (one account each, so a shared quota)
8. **Should D3 and D4 (optional hardening) be included in R0?**
9. **Permission to deploy to staging** (D6). Earlier instructions forbid deployment; staging needs its own explicit approval.
10. **Live Razorpay keys:** when, and who completes Razorpay KYC/activation? This is outside R0 test-mode verification.

## 8. Final R0 readiness verdict

**NOT READY.**
- Code-level readiness is good: tests pass, the webhook and auth logic are verified, and v2 source has no hardcoded secrets.
- R0 cannot be completed until the owner rotates the credentials, reduces to one account per provider, and creates staging.
- After that, D1–D10 must run and pass on staging.
- Two new blockers need code changes before any deploy: B7 (Node engine) and B10 (Firebase config).
- One new blocker needs immediate owner attention because of its compliance impact: B8 (Cloudflare multi-account quota).

**Stopping here. No changes have been made. Awaiting explicit approval for the owner checklist, the developer steps D1–D4, and a staging deployment.**
