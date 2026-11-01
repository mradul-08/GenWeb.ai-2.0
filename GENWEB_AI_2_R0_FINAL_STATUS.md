# GenWeb.ai 2.0: R0 Final Status

*Consolidated 2026-11-01 from the four R0 reports. The tests and build were re-run while writing this document; the results are below.*

## Verdict: R0 is NOT complete

| Track | State |
| --- | --- |
| **Code work** | **Complete.** D1–D4 implemented; F-D2-1 and F-D4-1 fixed and tested; F-D3-1 deferred. |
| **Owner actions** | **Pending.** O1–O10 not started; G1 undecided. |
| **Staging** | **Pending.** Not created, not deployed, not verified. |

R0 can only be completed after:
- the owner actions are done;
- a staging deployment is separately approved and performed;
- the staging verification (D6–D10) passes.

---

## 1. Completed code work

| ID | What | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Server Node engine `18.x` → `24.x` (mongoose 9 / mongodb 7 need ≥ 20.19) | **Implemented, verified** | `tests/runtime.test.js` (5); mutation with 18.x flags 8 packages. CODE_CORRECTIONS_REPORT §3. |
| D2 | Firebase client config from `VITE_FIREBASE_*`; validation; secret-like `VITE_` names refused | **Implemented**; follow-up F-D2-1 fixed | `client/tests/firebaseConfig.test.js` |
| D3 | One quota per provider; first usable credential only; pool-wide pause on capacity errors | **Implemented, verified** | `server/tests/router.test.js` (34); runbook review §2 |
| D4 | Production DB guard before any connection (server, tests, 3 scripts) | **Implemented**; follow-up F-D4-1 fixed | `server/tests/dbGuard.test.js` |
| **F-D2-1** | Whole `import.meta.env` object was bundled → static per-variable access; Vercel `VITE_VERCEL_*` never bundled | **Fixed and tested** | `client/tests/bundle.test.js` (4, real builds); mutation check failed as expected on the old code. FINAL_SECURITY_FIX_REPORT §4.2–4.3. |
| **F-D4-1** | Trailing-dot hostname bypassed the guard → canonical hosts; malformed hosts refused | **Fixed and tested** | 6 new dbGuard tests, including driver-parser parity; adversarial matrix. FINAL_SECURITY_FIX_REPORT §4.1. |
| F-D3-1 | Transient-error failover may briefly use a second account | **Deferred** | Moot while one account per provider (O2) is kept; status warns when more than one credential is configured |

### Verification (re-run 2026-11-01)

| Check | Result |
| --- | --- |
| Server `npm test` | **184 / 184 pass** |
| Client `npm test` | **10 / 10 pass** |
| Client `npm run build` | **Passes** (pre-existing > 500 kB chunk warning only) |
| Bundle inspection | No env object, no unused `VITE_` values, no simulated Vercel secrets |
| Razorpay / auth / credits / AI-quota suites | green: 17 / 11 / 8 / 4 + 21 + 34 |

**Server test growth:**

| Point in time | Server tests |
| --- | --- |
| Before R0 | 157 |
| After D1–D4 | 178 |
| After F-D4-1 | 184 |

**Client test growth:**

| Point in time | Client tests |
| --- | --- |
| After D2 | 5 |
| After F-D2-1 | 10 |

Neither figure was measured on staging or production.

## 2. Outstanding owner actions (none started)

| ID | Action | Priority | Status |
| --- | --- | --- | --- |
| O1 | Rotate the Atlas production DB user (new user → Render → verify → delete old) | Critical | **Pending** |
| O2 | One account and one new key per provider (Groq, ZhipuAI, Cloudflare); revoke the rest | High (compliance) | **Pending** |
| O3 | Revoke Cerebras, Mistral, SambaNova and OpenRouter keys; remove their env vars | High | **Pending** |
| O4 | Rotate `JWT_SECRET` and the Razorpay test key secret | Critical | **Pending** |
| O5 | Staging Atlas project, Render service (`APP_ENV=staging`, `NODE_VERSION=24`), Vercel project | High | **Pending** (needs G1) |
| O6 | Staging Firebase project; `FIREBASE_PROJECT_ID` on Render staging | Medium | **Pending** |
| O7 | Razorpay **test-mode** webhook to staging; `RAZORPAY_WEBHOOK_SECRET` | High | **Pending** |
| O8 | Test mailbox and Google test account | Medium | **Pending** |
| O9 | Restrict the Firebase web API key by website | Low | **Pending** |
| O10 | Delete `client/.env.local`; replace the production `MONGODB_URL` in local `server/.env` | Medium | **Pending** |
| O11 | Production cut-over | — | Later; not part of R0 |
| O12 | Ask ZhipuAI about the multiple-account policy | Optional | Pending |
| **G1** | Decide the git repository for v2 (Render and Vercel deploy from git) | **Blocks staging** | **Pending** |
| F-D1-1 | Set and confirm `NODE_VERSION=24` on Render | Medium | **Pending** (part of O5 / O11) |

Step-by-step instructions: `GENWEB_AI_2_R0_OWNER_RUNBOOK.md` §1.

## 3. Outstanding staging work (needs approval)

| Step | What | Depends on | Status |
| --- | --- | --- | --- |
| Staging deployment | Render manual deploy + Vercel deploy | G1, O5, O6; **separate approval** | **Pending** |
| D6 | Smoke checks: `/health`, Node 24, DB guard log line, sign-in, generate, edit, undo, save, deploy/undeploy | deployment | **Pending** |
| D7 / B3 | Razorpay test webhook: normal, lost callback, replay, wrong secret, reconcile | O7 + deployment | **Pending** |
| D8 / B6 | Verified-email and Google login E2E (and Safari cookie check) | O6, O8 + deployment | **Pending** |
| D9 | Post-rotation checks: old JWT rejected; one key per provider | O1–O4 + deployment | **Pending** |
| D10 | R0 verification report | D6–D9 | **Pending** |

## 4. Historical findings (kept for the record)

| Finding | Found in | Current state |
| --- | --- | --- |
| Secrets in v1 git history; hardcoded ZhipuAI key in v1 `test.mjs` | earlier audit | open → O1–O4 |
| `RAZORPAY_WEBHOOK_SECRET` missing locally | Execution plan B3 | open → O7 |
| Groq AUP forbids extra accounts to exceed limits; Cloudflare terms forbid quota circumvention; ZhipuAI unconfirmed | Execution plan B4 | code enforces one quota (D3); accounts still exist → O2 |
| B7 Node engine mismatch | Execution plan | fixed in code (D1); Render runtime unverified (F-D1-1) |
| B8 Cloudflare quota multiplied ×5 | Execution plan | fixed in code (D3) |
| B9 Production URI in local `.env` | Execution plan | guarded (D4, F-D4-1); file unchanged → O10 |
| B10 Firebase config hardcoded | Execution plan | fixed in code (D2, F-D2-1); Vercel vars → O5c / O11 |
| F-D2-1 whole env object bundled | Owner runbook review | **fixed** |
| F-D4-1 trailing-dot bypass | Owner runbook review | **fixed** |
| F-D3-1 transient failover | Owner runbook review | **deferred** |
| G1 v2 not a git repository | Owner runbook | open |
| Cross-site session cookie (Safari) | Owner runbook | unverified → D8 |

## 5. Remaining risks

**Assumptions to confirm:**
- `.ayk95r2.mongodb.net` identifies the production Atlas project. Because of this, staging must be a separate Atlas project.
- Render's Node selection and Vercel's `VITE_VERCEL_*` exposure are taken from their docs; neither has been observed for this project.

**Known limitations:**
- The guard matches hostnames only; an IP address or DNS alias of the production cluster is not recognised.
- The process-local provider state is not multi-instance ready.

**Documentation:**
- `GENWEB_AI_2_IMPLEMENTATION_STATUS.md` still describes the pre-D3 Cloudflare behaviour.
- It is not an R0 document and was not edited.
- This file and the R0 report headers supersede it on that point.

## 6. Documentation updated in this step

A dated status block was added at the top of each file. Historical content is unchanged.

| File | Change |
| --- | --- |
| `GENWEB_AI_2_R0_EXECUTION_PLAN.md` | Status block added |
| `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md` | Status block added; superseded statements noted |
| `GENWEB_AI_2_R0_OWNER_RUNBOOK.md` | Status block added; the Vercel interim mitigation is marked optional |
| `GENWEB_AI_2_R0_FINAL_SECURITY_FIX_REPORT.md` | Pointer to this file |
| `GENWEB_AI_2_R0_FINAL_STATUS.md` | New (this file) |

## 7. Confirmations

**Not done in this step:**
- no application source code modified;
- no env file modified;
- no git repository created or pushed;
- no credential or account changed;
- no production connection;
- no deployment;
- no AI provider call.

**Other checks:**
- R1 not started.
- Original `websiteBuilder` untouched: `git status --short` shows only `?? resume/`.

**Stopping here. Awaiting approval.**
