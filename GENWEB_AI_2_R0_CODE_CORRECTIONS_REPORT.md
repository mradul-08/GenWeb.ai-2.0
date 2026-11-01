# GenWeb.ai 2.0: R0 Code Corrections Report (D1–D4)

> **Latest status (2026-11-01). The report below is kept unchanged as the historical record.**
> - **Superseded statements:** the owner runbook's independent review found two defects in this work.
>   - D2 "preserves existing behaviour" was incomplete: the whole `import.meta.env` object was bundled (**F-D2-1**).
>   - D4's production-host check could be bypassed with a trailing-dot hostname (**F-D4-1**).
>   - Both are now **fixed and tested** (`GENWEB_AI_2_R0_FINAL_SECURITY_FIX_REPORT.md`).
> - **Deferred:** F-D3-1.
> - **Current test counts:** server **184/184** (this report's 178 is historical), client **10/10** (this report's 5 is historical). The client production build passes.
> - **Still pending:** owner actions O1–O10, G1, the staging deployment and staging E2E. **R0 is NOT complete.** See `GENWEB_AI_2_R0_FINAL_STATUS.md`.

*2026-11-01. Scope: the approved D1–D4 only, inside `websiteBuilder-v2`. Not done: no deployment, no dependency install or upgrade, no production database access, no credential or provider configuration change, no AI provider call. **R0 is not complete**; see §7.*

## 1. Summary

| Item | Result |
| --- | --- |
| D1 Node.js engine | `18.x` → **`24.x`**. A test checks every installed package against it. |
| D2 Firebase client config | Hardcoded project values removed. Config comes only from `VITE_FIREBASE_*`. Build fails early when values are missing or secret-looking. |
| D3 Cloudflare quota scope | All providers use **one quota per provider**. Calls go to a **fixed primary credential** (no round-robin). Any capacity error pauses all credentials. |
| D4 Production DB guard | Refuses production / ambiguous / unauthorised targets **before** connecting. Covers the server, tests and the three admin/ledger scripts. |
| Server tests | **178 / 178 pass**: 157 before, +21 new, 1 replaced, 1 updated. |
| Client tests (new) | **5 / 5 pass** (`node --test`, no dependency). |
| Client build | **Passes**. The pre-existing > 500 kB chunk warning is unchanged. |

## 2. Changed files

| File | Change | Item |
| --- | --- | --- |
| `server/package.json` | `engines.node`: `18.x` → `24.x` | D1 |
| `server/package-lock.json` | Root package `engines.node` → `24.x` (the only line changed; no dependency entries touched) | D1 |
| `server/tests/runtime.test.js` | **new**: 5 tests | D1 |
| `server/ai/keyPool.js` | Rewritten: provider-wide pool only; fixed primary credential; multi-credential warning | D3 |
| `server/ai/router.js` | Pool created without a scope; the daily cap always uses one provider counter | D3 |
| `server/ai/catalog.js` | Cloudflare `quotaScope: "credential"` → `"provider"`; comment updated | D3 |
| `server/tests/router.test.js` | 1 test replaced, 1 updated, 7 added | D3 |
| `server/config/dbGuard.js` | **new**: target check (pure function; never connects) | D4 |
| `server/config/db.js` | Calls the guard before `mongoose.connect` | D4 |
| `server/scripts/migrate-credit-ledger.js`, `reconcile-credits.js`, `set-admin.js` | Call the guard before `mongoose.connect` (exit 2 on refusal) | D4 |
| `server/tests/helpers.js` | `APP_ENV=test`; clears `ALLOW_REMOTE_DB`; the in-memory DB URI goes through the guard | D4 |
| `server/tests/dbGuard.test.js` | **new**: 10 tests | D4 |
| `server/.env.example` | Documents `APP_ENV`, `PRODUCTION_DB_HOSTS`, `ALLOW_REMOTE_DB` | D4 |
| `client/src/firebaseConfig.js` | **new**: reads and validates `VITE_FIREBASE_*`; detects secret-looking `VITE_` vars | D2 |
| `client/src/firebase.js` | Uses `readFirebaseConfig(import.meta.env)`; no project literals | D2 |
| `client/vite.config.js` | Runs the same checks at dev start and build (fails before bundling) | D2 |
| `client/package.json` | New script `"test": "node --test \"tests/*.test.js\""` (no new dependency) | D2 |
| `client/tests/firebaseConfig.test.js` | **new**: 5 tests | D2 |
| `client/.env.example` | Documents all 6 Firebase variables, per-environment | D2 |
| `client/.env` *(local, git-ignored)* | Added the 5 public values previously hardcoded in `firebase.js`, so local dev keeps working. Backup at `<SESSION_SCRATCHPAD>\client-env.bak` (`<SESSION_SCRATCHPAD>` = the assistant session's temporary folder, outside the repository; absolute path redacted). `VITE_FIREBASE_API_KEY` unchanged. | D2 |
| `client/dist/` | Rebuilt by `npm run build` (build output) | — |

**No other files changed.** In particular these are untouched:
- `server/.env`, `client/.env.local`;
- all dependencies and `node_modules`;
- the original `websiteBuilder`.

## 3. What changed and why: before / after

### D1: Node.js compatibility

- **Why.** The declared range `18.x` was incompatible with the installed packages.
  - A lockfile scan shows **8 packages** that require `node >=20.19.0` and fail on Node 18: `mongoose`, `mongodb`, `bson`, `mquery`, `mongodb-connection-string-url`, `mongodb-memory-server`, `mongodb-memory-server-core`, and a nested `mongodb`.
- **Choice: `24.x`.**
  - **Bounded.** Render's docs say an unbounded range like `>=20` "always resolves to the latest release of Node.js".
  - **Tested combination.** The full test suite runs on Node v24.11.0 locally. Render's documented default for new services is 24.22.1.
  - **Compatible.** Satisfies every package's `engines` (checked at 24.0.0 and 24.999.999).
- **Render runtime.** Precedence: `NODE_VERSION` env var → `.node-version` → `.nvmrc` → `package.json` `engines` ([Render docs](https://render.com/docs/node-version)). Two things about the actual Render service are **NOT VERIFIED** (no dashboard access, by design):
  - whether `NODE_VERSION` is set, which would override `engines`;
  - whether the service's Root Directory is `server`.
  Owner check: the Render build log line showing the Node version, or the `NODE_VERSION` env var (set to `24` for certainty).
- **Before:** Render could choose Node 18.x, which the DB driver does not support.
- **After:** Node 24.x. The test fails if any future dependency or engines change breaks compatibility.

### D2: Firebase environment configuration

**Why:**
- the project ID, auth domain, app ID, sender ID and bucket were hardcoded;
- staging could not use its own Firebase project without editing source.

**Before:**
- the API key came from env; the other 5 values were literals for `genwebai-dca16`;
- a missing key failed silently in the browser at sign-in.

**After:**
- **Source of values.** All values come from `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` (required), and `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID` (optional).
- **Validation.** Missing or malformed values stop `vite` / `vite build` with the variable names. The runtime throws the same error.
- **Public vs private separation.** The build refuses any `VITE_` variable whose **name** contains SECRET, PRIVATE, PASSWORD, TOKEN, CREDENTIAL, SERVICE_ACCOUNT, MONGO, DATABASE_URL, JWT or WEBHOOK. It also refuses any `VITE_` variable whose **value** looks like:
  - a private key or service-account JSON;
  - a Mongo URI with credentials;
  - a Groq, Cerebras, OpenAI/OpenRouter-style or Cloudflare key;
  - a JWT.
  Server secrets stay in `server/.env`, which no client code reads.
- **Authentication behaviour unchanged.** The production values are identical. `LoginModels.jsx`, the token flow and the server checks are untouched. The server still verifies tokens against `FIREBASE_PROJECT_ID`.

### D3: Cloudflare quota scope (and all providers)

**Why:**
- Cloudflare was `quotaScope: "credential"`, and the key pool used **round-robin** for every provider;
- with 5 Cloudflare accounts, usage spread across accounts and each consumed its own 10,000-Neuron allocation, giving about 5× the free quota;
- for Groq, round-robin also spread per-minute token usage across accounts, even though the daily counter was shared.

**Before:**
- Cloudflare: a limit on account 1 left accounts 2–5 usable;
- every provider rotated keys on each request.

**After** (`server/ai/keyPool.js`):
1. One pool per provider. Every capacity outcome pauses **all** of that provider's credentials until the reported reset: `rate_limit`, `quota_exhausted`, `billing`, `restricted`, `daily_request_cap`.
2. `next()` returns the **first usable** credential, so only one account's allowance is ever consumed.
3. Another credential is used only when the current one is **invalid** (401/403, dropped permanently) or **rested after 3 transient errors** (3 min). Neither is a quota event.
4. Provider status adds `warning: "multiple_credentials_share_one_quota"` when more than one credential is configured. A startup log line says the same.

**Classification unchanged:**
- `CAPACITY_REASONS`, `NEUTRAL_REASONS` and `isCapacityExhausted()` were not modified;
- the tests confirm that HTTP 500 stays transient (`exhausted: false`) and that a daily-allocation error stays capacity (`exhausted: true`).

**No AI calls.** All tests use the existing fetch stub. Nothing reached a provider.

### D4: Production database guard

**Why:**
- local `server/.env` contains the hosted Atlas URI (`***.ayk95r2.mongodb.net/websiteBuilder`);
- `npm run dev` / `npm start` would have connected to it;
- the admin and ledger scripts accepted any `--uri`.

**Rule** (`server/config/dbGuard.js`; `APP_ENV` ∈ `production | staging | development | test`):

| Target \ `APP_ENV` | production | staging | development / test | unset |
| --- | --- | --- | --- | --- |
| Production DB host | allowed | **refused** | **refused** | **refused** |
| Local host (`localhost`, `127.0.0.1`, `::1`, `*.localhost`) | allowed | allowed | allowed | allowed |
| Other remote host | allowed | allowed | only with `ALLOW_REMOTE_DB=true` | **refused** (ambiguous) |

Further rules:
- **Production host list.** `PRODUCTION_DB_HOSTS` (comma-separated; `.suffix` entries match by suffix). Default: `.ayk95r2.mongodb.net`, a hostname suffix and not a secret.
- **Bad input.** An unknown `APP_ENV` value, or a missing or malformed URI, is refused.
- **Where it runs.** Before `mongoose.connect` in `connectDb` (server startup exits with "DB startup failed: Refusing to connect…") and in the three scripts (exit code 2).
- **Authorised environments:**
  - Render production must set `APP_ENV=production`;
  - Render staging, `APP_ENV=staging`;
  - a script deliberately run against production needs `APP_ENV=production` on that command.

**Before:** any URI was connected.

**After:**
- the production URI only connects with an explicit `APP_ENV=production`;
- tests are forced to `APP_ENV=test` and local hosts only.

## 4. Test evidence (run 2026-11-01)

### 4.1 Server: `npm test`

```
ℹ tests 178   ℹ pass 178   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ duration_ms 54150
```

| File | Tests | Notes |
| --- | --- | --- |
| ai-api | 21 | AI quota/API, unchanged, green |
| auth | 11 | Authentication, unchanged, green |
| credits | 8 | Credit ledger, unchanged, green |
| **dbGuard** | **10** | new (D4) |
| intent / patch / prompts / sanitize / validate | 5 / 6 / 11 / 2 / 16 | unchanged, green |
| ownership | 6 | unchanged, green |
| payments | 17 | Razorpay verify + webhook, unchanged, green |
| quota | 4 | unchanged, green |
| **router** | **34** | 28 before: −1 replaced, +7 new; 1 assertion updated (D3) |
| **runtime** | **5** | new (D1) |

Arithmetic: 157 − 1 + 7 + 10 + 5 = **178**.

**Changed expectations (intentional, D3):**
- **Replaced:** "Cloudflare accounts are separate: a limit on one account leaves the other usable". It asserted the quota multiplication that D3 removes.
- **Updated:** "when every free provider is out of capacity…". It expected 4 calls (Cloudflare account 2 tried after account 1's limit). It now expects 3 calls (one per provider), and none on the next run.

**New D3 tests:**
1. every provider has `quotaScope: "provider"`;
2. Cloudflare daily allocation on account 1 → account 2 never called; both runs `exhausted: true`; `pausedReason: quota_exhausted`;
3. Cloudflare rate limit pauses all accounts;
4. 4 Groq runs and 3 Cloudflare runs all use only credential/account 1;
5. an invalid Cloudflare token is dropped and account 2 takes over;
6. 3 × HTTP 500 → `exhausted: false` each time, then the credential rests and account 2 is used;
7. the status warning is present for 2 credentials and absent for 1.

**New D4 tests (no real connection):**
1. host parsing (srv, seed lists, IPv6, ports) never returns the password;
2. the production host is refused in every non-production env, even with `ALLOW_REMOTE_DB=true`;
3. a production host second in a seed list is detected;
4. no `APP_ENV` + remote → refused;
5. unknown `APP_ENV` → refused;
6. local hosts are allowed everywhere;
7. staging can use a remote cluster; dev/test need the exact `ALLOW_REMOTE_DB=true`;
8. the `PRODUCTION_DB_HOSTS` override;
9. missing or malformed URIs are refused;
10. `connectDb` with a stubbed `mongoose.connect` (which records the URI and throws immediately):
    - refused targets make **zero** connect calls;
    - `APP_ENV=production` + production URI and `development` + local URI reach the connect call (normal path preserved).

**New D1 tests:**
1. the range checker itself;
2. the declared range is bounded and matches the lockfile root;
3. every lockfile package's `engines` is satisfied at 24.0.0 and 24.999.999;
4. mongoose/mongodb reject Node 18 and accept the declared range;
5. the running Node is inside the range.

**Mutation check (D1):** with the old `18.x` value, the scan reports the 8 incompatible packages listed in §3.

### 4.2 Guard decision for the real local `server/.env` URI

Checked with the pure function only: `mongoose` was not loaded and no connection was made.

| Environment | Decision |
| --- | --- |
| `APP_ENV` unset | REFUSED: `***.ayk95r2.mongodb.net` is a production database host |
| `development` | REFUSED |
| `development` + `ALLOW_REMOTE_DB=true` | REFUSED |
| `staging` | REFUSED |
| `production` | ALLOWED |

### 4.3 Client

- `npm test`: **5 / 5 pass**:
  1. env switching;
  2. missing values named;
  3. malformed values rejected;
  4. secret-looking `VITE_` vars refused;
  5. no Firebase literals left in `src/firebase.js`.
- `npm run build`: **passes**. Logs `Firebase project: genwebai-dca16 (mode: production)` from local `.env`.

**Switching without source changes.** Builds went to scratchpad folders, so `client/dist` was not affected:

| Build | Result |
| --- | --- |
| 4 required staging values in the environment | Built; bundle contains `genweb-staging-check`. One `genwebai-dca16` remained, coming from the local `.env` `VITE_FIREBASE_STORAGE_BUCKET`, which was not overridden. |
| All 6 values set to staging | Built; production project id **0** occurrences, staging id 3. |
| `VITE_FIREBASE_PROJECT_ID=` (empty) | **Build failed**, exit 1: "Missing Firebase configuration: VITE_FIREBASE_PROJECT_ID" |
| Extra `VITE_RAZORPAY_KEY_SECRET` | **Build failed**: "look like secrets … VITE_RAZORPAY_KEY_SECRET" |

**Lesson:** set **all six** variables per environment in Vercel. Vercel builds do not see local `.env` files (they are git-ignored).

## 5. Behavioural impact to know before any deployment

1. **Render must have `APP_ENV`.** Production `APP_ENV=production`, staging `APP_ENV=staging`. Without it, a v2 server with an Atlas URI **refuses to start**: fail-safe by design. Render keeps the previous deploy running when a new one fails its start **[ASSUMPTION: Render behaviour; confirm on staging]**.
2. **Vercel needs the Firebase variables.** Production and Preview must have all 6 `VITE_FIREBASE_*` variables before the next client build. If they are missing, the **build fails** and Vercel keeps serving the previous deployment, instead of shipping a broken login.
3. **Admin and ledger scripts against production** now need `APP_ENV=production node scripts/… --uri …`.
4. **Fewer AI calls per account.** Each provider uses only its first usable credential. Free capacity is therefore one account per provider, which is the compliant configuration from the R0 plan (B4/B8).
5. **Local development** with the current `server/.env` refuses to start until `MONGODB_URL` points at a local or staging database. This is the intended D4 outcome.

## 6. Rollback

| Item | Rollback | Data risk |
| --- | --- | --- |
| D1 | Restore `"18.x"` in `server/package.json` and the lockfile root. Not advisable: the dependencies need ≥ 20.19. Backup: `<SESSION_SCRATCHPAD>\server-package.json.bak` | none |
| D2 | Restore the literal config in `src/firebase.js` and drop the check in `vite.config.js`. Local `.env` backup: `<SESSION_SCRATCHPAD>\client-env.bak` | none |
| D3 | Restore the previous `keyPool.js` / `router.js` / catalog line. **Not recommended**: it reintroduces quota multiplication. | none |
| D4 | Remove the `assertSafeDatabaseTarget` calls (db.js, scripts, helpers). Or, at deploy time, set the correct `APP_ENV`. | none |

v2 is not a git repository, so there is no commit to revert. The change list in §2 is the complete diff surface.

## 7. Remaining R0 blockers (unchanged by this work)

| Blocker | Status | Needs |
| --- | --- | --- |
| B1 Secret rotation (Atlas, JWT, Razorpay, all AI keys) | open | owner |
| B2 Staging environment | open | owner, plus separate deployment approval |
| B3 Real Razorpay test-mode webhook delivery; `RAZORPAY_WEBHOOK_SECRET` missing locally | open | owner + staging |
| B4 / B8 One account per provider (configuration) | **code now enforces one quota**; extra accounts and keys still exist | owner: revoke extras |
| B5 Dead provider keys (Mistral, SambaNova, OpenRouter, Cerebras) | open | owner: revoke |
| B6 Verified-email and Google login E2E | open | owner test accounts + staging |
| B7 Node engine | **code fixed**; Render runtime not verified | owner: check the Render build log / `NODE_VERSION` |
| B9 Production URI in local `.env` | **guard in place**; the URI is still in the file | owner: replace it with a local/staging URI after rotation |
| B10 Firebase env config | **code fixed** | owner: set the 6 variables in Vercel (Production + Preview), create the staging Firebase project |

**R0 readiness: NOT READY.** The code-side corrections are done. The owner actions and staging verification remain.

## 8. Unresolved risks

1. **Default production host list assumption.** `.ayk95r2.mongodb.net` assumes the Atlas hostname suffix identifies the production *project* **[ASSUMPTION]**.
   - A staging cluster created **in the same Atlas project** would share the suffix and be refused in staging.
   - Recommended: a separate Atlas project for staging, as in the plan.
   - Alternatively, set exact hosts in `PRODUCTION_DB_HOSTS`.
2. **The guard checks hosts, not database names.** A production cluster reached through an unlisted alias or IP would not be recognised. Mitigation: set `PRODUCTION_DB_HOSTS` on every non-production service.
3. **The `ALLOW_REMOTE_DB=true` escape hatch** allows non-production remote DBs in development. It can never unlock the listed production hosts.
4. **Secret-name heuristic.** The rule could reject a legitimate future public variable whose name contains e.g. `TOKEN`. Rename such a variable; do not weaken the rule.
5. **Render runtime selection** is from docs, not observed (B7).
6. **Process-local key-pool state** (pauses, dead keys) is unchanged and still per instance. This is documented as not multi-instance ready.
7. **`client/.env` `VITE_SERVER_URL` duplicate.** Pre-existing and unused by the code; left as is.
8. **Older docs are now outdated.** `GENWEB_AI_2_IMPLEMENTATION_STATUS.md` §12/§15 still describe Cloudflare as `quotaScope: "credential"` and "separate accounts". They are superseded by this report; I did not edit them, to keep this change set to D1–D4.

## 9. Confirmations

- **Original `websiteBuilder` untouched.** `git status --short` still shows only `?? resume/`.
- **No production service or database accessed:**
  - no MongoDB connection was made except the in-memory test server;
  - the guard was checked on the real URI as a pure function, without loading `mongoose`.
- **No AI provider was called.** All provider traffic in tests went to the fetch stub.
- **No dependency was installed or upgraded.** `node_modules` and the dependency entries in the lockfiles are unchanged.
- **Nothing deployed** (no Vercel, no Render).
- **No credential or provider configuration was changed.** `server/.env` was not edited. `client/.env` only gained the 5 public Firebase values (§2).
- **R1 not started.**

**Stopping here. Awaiting separate approval for any deployment or further work.**
