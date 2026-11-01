# GenWeb.ai 2.0: R0 Owner Runbook and Staging Readiness

> **Latest status (2026-11-01). The runbook below stays the procedure to follow; its review findings are kept as found.**
> - **Fixed and tested since this runbook was written** (`GENWEB_AI_2_R0_FINAL_SECURITY_FIX_REPORT.md`):
>   - **F-D2-1:** Firebase variables are now read by static access, and a build-output test passes.
>   - **F-D4-1:** hosts are canonicalised, the trailing-dot bypass is closed, and a driver-parity test passes.
> - **Deferred:** F-D3-1 (one account per provider, O2).
> - **No longer required:** turning off Vercel's "Automatically expose System Environment Variables" was an interim mitigation for F-D2-1 (O5c step 4 and the §4.2 row). It is now optional.
> - **Current tests:** server **184/184**, client **10/10**; the client production build passes.
> - **Still pending:**
>   - **all owner actions O1–O10**;
>   - **G1**;
>   - F-D1-1 (setting and confirming `NODE_VERSION=24` on Render);
>   - the staging deployment (separate approval);
>   - staging E2E.
> - **R0 is NOT complete.** See `GENWEB_AI_2_R0_FINAL_STATUS.md`.

*Prepared 2026-11-01 as a read-only investigation. No source file, env file, credential, account, provider setting or deployment was changed while writing it. The only commands run were the two test suites and pure parsing checks. **R0 is NOT complete.***

**Who does what.** "You" means the owner, who performs every O-step in your own dashboards. I cannot do these steps and must not: they involve live credentials and accounts.

**Dashboard labels change often.** Navigation below matches each provider's current documentation as far as I know. If a label differs, look for the same function nearby, and record what you actually clicked in the evidence log (§6).

---

## 0. Before you start (read this once)

1. **Production is live, and it runs the original v1 code.**
   - The production Render service (`genweb-ai-5o8k`) and Vercel project use **the same credentials** listed below.
   - Every rotation must therefore follow **create new → put the new value into the production service → verify → revoke old**. Revoking first takes the live site down.
2. **Keep variable names; change only values.**
   - When updating the **production** Render service, edit the **existing** variable names in place.
   - v1 may read different names than v2 (e.g. `MONGODB_URL`).
   - Do **not** rename, add or delete production variables in R0, except removing dead provider keys (O3).
3. **Never paste a secret** into chat, a document, a screenshot, a commit or a ticket.
   - Evidence means: the time, which item, the **last 4 characters** of the new value, and a screenshot with the value hidden.
4. **Work from a private notes file** on your own machine as the evidence log (template in §6).
5. **Suggested order** (dependencies in §5):
   O1 → O4 → O2 → O3 → O9 → O10 → **decision on git repo (new blocker G1)** → O5 → O6 → O7 → O8 → staging verification → O11 later.

---

## 1. Owner actions O1–O12

### O1. Rotate the MongoDB Atlas production database user *(Critical, ~30 min)*

**Objective:** the leaked database password stops working, and production keeps running with a new credential.

**Prerequisites:**
- Atlas Project Owner access;
- the production Render service's Environment page open.

**Where:** <https://cloud.mongodb.com> → select the **production** project (cluster hostname ends in `.ayk95r2.mongodb.net`).

**Steps (zero-downtime: new user first):**
1. **Create the new user.**
   1. Left menu → **Security → Database Access** (newer UI: *Database & Network Access → Database Users*) → **Add New Database User**.
   2. **Authentication Method:** Password → **Autogenerate Secure Password** → copy it into your private notes.
   3. **Privileges:** the same as the current app user, normally *Read and write to any database*. Better: **Specific Privileges → `readWrite` on database `websiteBuilder`** (the production DB name in the current URI). Do not grant Atlas admin.
   4. Name it, e.g. `genweb_app_2026_11`. Click **Add User**.
2. **Point production at it.**
   1. Build the new connection string: the same host, path `/websiteBuilder` and query (`retryWrites=true&w=majority`) as today, with the new user and password. **URL-encode** special characters in the password; the driver rejects unescaped `@ : / ? #`.
   2. Render dashboard → production service → **Environment** → edit the existing DB variable (v1 reads `MONGODB_URL`; v2 reads `MONGODB_URI`, falling back to `MONGODB_URL`).
   3. Paste the new URI → **Save, rebuild, and deploy** (or Save + Manual Deploy).
3. **Verify** (see below).
4. **Revoke the leaked credential.** Atlas → Database Access → the **old** user → **Delete**.
5. **Optional hardening:** Atlas → **Network Access**. Today it is probably `0.0.0.0/0`. Render publishes outbound IP ranges per region (Render service → *Connect* → *Outbound*). Restricting to them is safer, but a wrong list breaks production. **Do it only after staging has proven the procedure.**

**Do NOT change:**
- the cluster, its tier, its data, the database name, backups;
- other users you don't recognise (ask first);
- Network Access during this step.

**Verify:**
- Render deploy log shows a successful start. v1 shows its own "connected" log line. The v2 guard would print `DB target allowed: …`, but production still runs v1.
- The production site loads, you can sign in, and the dashboard lists projects.
- After deleting the old user, Atlas shows only the new app user, and the site still works.

**Evidence:**
- time of each step;
- new user name (not the password);
- Render deploy ID / time;
- a screenshot of the Database Users list (passwords are never shown there).

**Rollback:** if production fails after step 2, edit the Render variable again with a corrected **new** URI; the typical fault is password encoding. **Do not recreate the old password.** If the old user was not yet deleted, you may temporarily point back to it while fixing, then finish step 4 the same day.

**Depends on:** nothing. Do it first.

---

### O2. Reduce AI providers to one compliant account each, and rotate the kept key *(High, ~60 min)*

**Objective:**
- one account and one fresh key for Groq, ZhipuAI and Cloudflare;
- every other key or account revoked.

**Why:**
- the Groq Acceptable Use Policy forbids exceeding limits "by registering multiple accounts";
- the Cloudflare terms §2.2.1(c) forbid circumventing usage limits or quotas;
- ZhipuAI is UNCONFIRMED, so treat it the same.

**Code status:** D3 already makes all keys of a provider share one quota. The extra accounts still exist and must be removed.

**Steps per provider.** In each case: choose the **one** account to keep (the oldest, registered with your real identity) → create a **new** key in it → update **production** Render (the `_1` variable, in place) → verify → delete **all** other keys in that account → in each extra account, delete all keys. Deleting the extra accounts is optional but recommended.

| Provider | Where | Keep | Revoke |
| --- | --- | --- | --- |
| **Groq** | <https://console.groq.com> → **API Keys** (organisation settings) | 1 account → 1 new key (`gsk_…`) | the old keys in the kept account; every key in the other 4 accounts |
| **ZhipuAI** | <https://open.bigmodel.cn> → user centre → **API Keys** (the code calls the China platform `open.bigmodel.cn`) | 1 account → 1 new key | all others, **including the key that was hardcoded in v1 `server/test.mjs`** |
| **Cloudflare** | <https://dash.cloudflare.com> → **My Profile → API Tokens** | 1 account → **Create Token** → *Workers AI* template, or custom: *Account → Workers AI → Read* + *Edit*, limited to that one account → note the **Account ID** (dashboard sidebar / Workers AI page) | **Roll or Delete** the old tokens in the kept account; every token in the other 4 accounts |

**Production Render changes:**
- set `GROQ_API_KEY_1`, `ZHIPU_API_KEY_1`, `CLOUDFLARE_API_KEY_1`, `CLOUDFLARE_ACCOUNT_ID_1` to the kept values;
- **delete** `_2`…`_5` for these three providers. These deletions are the only allowed name removals.

**Do NOT:**
- add a payment method to any provider account;
- enable paid plans, credits or auto-recharge;
- create new accounts;
- share one login between people (also prohibited by Groq's terms).

**Verify:**
- Production generates one site (v1). In v1 an edit costs credits, so use your own test account.
- Each provider dashboard shows exactly one active key or token.
- Later, on v2 staging: `/api/admin/ai/providers` shows `total: 1` and `warning: null` per provider. With more than one credential it shows `warning: "multiple_credentials_share_one_quota"`, which D3 added.

**Evidence:**
- per provider: the kept account e-mail (masked, e.g. `ma…@gmail.com`), the new key's last 4 characters, the time;
- a screenshot of each key list showing one entry;
- for each extra account: a screenshot showing no keys, or a deletion confirmation.

**Rollback:**
- a wrong or invalid new key → create another new key in the kept account;
- never restore revoked keys or re-add accounts.

**Capacity impact (expected):**
- Groq about 1,000 requests/day;
- Cloudflare 10,000 Neurons/day;
- ZhipuAI: its free limit, which is UNCONFIRMED.
- This applies to the live v1 site too.

**Depends on:** O1 is recommended first; O2 is independent of it.

---

### O3. Revoke unused or dead provider credentials (Cerebras first) *(High, ~20 min)*

**Objective:** credentials that are leaked and unused can't be abused.

| Provider | Status (verified by real calls 2026-11-01) | Where | Action |
| --- | --- | --- | --- |
| **Cerebras** | not in the v2 catalog; 402 "Payment required" | <https://cloud.cerebras.ai> → **API Keys** | Delete all keys in all accounts. **Check that no payment method is attached.** |
| Mistral | locked: 0 requests/minute | <https://console.mistral.ai> → **API Keys** | Delete all |
| SambaNova | locked: 401 invalid | <https://cloud.sambanova.ai> → **API Keys** | Delete any remaining |
| OpenRouter | locked: "User not found" (accounts gone) | <https://openrouter.ai/settings/keys> | If you can still sign in, delete the keys; otherwise nothing to do |

**Production Render:** delete the variables `CEREBRAS_API_KEY_*`, `MISTRAL_API_KEY_*`, `SAMBANOVA_API_KEY_*`, `OPENROUTER_API_KEY_*`.

> **Check first:** does v1 still *call* Mistral, SambaNova or OpenRouter? Removing them from v1 then makes those calls fail fast. That is acceptable because the keys are already dead or limited.

**Do NOT:** delete keys of the three kept providers (O2 handles them).

**Verify:**
- each dashboard shows no keys;
- production still generates;
- the Render Environment no longer lists these names.

**Evidence:** a screenshot per dashboard; the list of removed variable names (names only).

**Rollback:** none needed. A provider can be re-added later only with a code change after a real successful call (see the catalog's `lockedReason` rule).

---

### O4. Rotate `JWT_SECRET` and the Razorpay test key secret *(Critical, ~20 min)*

**Objective:**
- forged sessions and webhook/API impersonation become impossible with the leaked values.

**`JWT_SECRET` steps:**
1. Generate locally, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Don't paste the result anywhere except Render.
2. Render production → Environment → `JWT_SECRET` → new value → Save & deploy.
3. **Effect:** every user is logged out once. Announce it first if you have active users.

**Razorpay test key steps:**
1. <https://dashboard.razorpay.com> → switch to **Test Mode** (toggle in the header).
2. **Account & Settings → API Keys** (older UI: *Settings → API Keys*) → **Regenerate Test Key**. The new secret is shown **once**: copy the Key ID and Secret.
3. Render production → set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` → Save & deploy.

**Do NOT:**
- touch **Live Mode** keys, activation/KYC, settlements or bank details;
- create a production webhook in R0.

**Verify:**
- the old session cookie is rejected: open the site in a browser that was signed in, and it should show you signed out;
- signing in again works;
- in test mode, *create order* on the Pricing page opens the Razorpay checkout (no payment needed).

**Evidence:** times; the new Razorpay Key ID prefix (`rzp_test_` + last 4); a screenshot of the API Keys page with the secret hidden.

**Rollback:**
- JWT: set another new value (fix forward). Do not restore the old one.
- Razorpay: regenerate again.

**Depends on:** none. Do it right after O1.

---

### O5. Create the isolated staging infrastructure (Atlas, Render, Vercel) *(High, ~2–3 h)*

**Prerequisite: blocker G1.** `websiteBuilder-v2` is **not a git repository**, and Render and Vercel deploy from git. Decide how v2 reaches a repo:
- a new **private** repository (recommended), or
- a branch of the existing one.

Your earlier instruction was "directly git nhi", so this needs your explicit decision. **Never commit `.env` files.** The `.gitignore` files already exclude them.

#### O5a. Atlas staging project

1. **Create the project.** Atlas → top-left project selector → **New Project** → name `genweb-staging` → Create. It **must be a separate project**: the D4 guard treats any host ending in `.ayk95r2.mongodb.net` as production **[ASSUMPTION: the hostname suffix is per Atlas project]**.
2. **Create the cluster.** **Create** → **M0 (Free)** → provider/region close to your Render staging region → name `staging` → Create.
3. **Create the app user.** **Database Access → Add New Database User**:
   - name `genweb_staging_app`;
   - autogenerated password;
   - **Specific Privileges: `readWrite` @ `genweb_staging`** only.
4. **Network Access.** **Add IP Address** → `0.0.0.0/0` (Render free instances have no fixed IP). Note it as a staging-only risk.
5. **Get the connection string.** **Connect → Drivers** → copy the `mongodb+srv://…` string → insert the password (URL-encoded) and the path `/genweb_staging`.
6. **Check the hostname.** It must **not** end in `.ayk95r2.mongodb.net`. Record the suffix in your evidence; it is not a secret.

**Do NOT:**
- import or copy any production data into staging;
- create the staging cluster inside the production project.

#### O5b. Render staging web service

1. <https://dashboard.render.com> → **New → Web Service** → connect the repo/branch from G1.
2. **Name:** `genweb-staging-api`.
3. **Root Directory:** `server`.
   - Render runs commands relative to it, and "files outside your service's root directory are not available".
4. **Commands:**
   - Build: `npm ci`;
   - Start: `npm start`;
   - Health Check Path: `/health`.
5. **Instance:** Free. It spins down when idle, so the first request and webhooks may be slow; Razorpay retries webhooks.
6. **Auto-Deploy:** **Off** until staging is approved.
7. **Environment:** use the matrix in §4. **Set `NODE_VERSION=24`**: this env var has the highest precedence, so the runtime no longer depends on how Render reads `engines` (see review F-D1-1).
8. **Do not deploy yet** if the dashboard lets you save without deploying. The first deploy needs the separate staging-deployment approval.

#### O5c. Vercel staging frontend

1. <https://vercel.com/new> → import the same repo/branch as a **separate project** `genweb-staging`. Using a separate project means its "Production" environment *is* staging, which keeps env vars simple.
2. **Settings:**
   - Root Directory: repository root (the existing `vercel.json` builds `client`);
   - Framework: Vite.
3. **Environment Variables:** the §4 frontend rows, scoped to *Production* of this staging project.
4. **System variables: blocker for D2 (F-D2-1).** Until the D2 follow-up fix is approved and applied, turn **off** "Automatically expose System Environment Variables" (Project → Settings → Environment Variables). Otherwise either:
   - the build fails on the secret-name check, or
   - a future change bundles `VITE_VERCEL_*` values.
5. **Domain:** note the stable `*.vercel.app` domain. It goes into Render `CLIENT_URL` and into the Firebase authorized domains.

**Verify (after the approved deploy):**
- `GET https://<staging-api>/health` → 200;
- the Render log shows Node 24.x and `DB target allowed: APP_ENV=staging, non-production host`;
- the staging site loads.

**Evidence:**
- Atlas project name and host suffix;
- Render service name, Node version line, health result;
- Vercel project name and domain.

**Rollback:** delete the staging Render service, the Vercel project and the Atlas project. Production is not affected.

---

### O6. Create a separate staging Firebase project *(Medium, ~30 min)*

1. <https://console.firebase.google.com> → **Add project** → `genweb-staging` (Analytics optional; off is simpler). Note the **project ID**.
2. **Build → Authentication → Get started → Sign-in method:**
   - enable **Email/Password**; leave *Email link* off unless needed;
   - enable **Google**, with your support e-mail.
3. **Authentication → Settings → Authorized domains:** add the Vercel staging domain from O5c (`localhost` is there by default).
4. **Project settings (gear) → General → Your apps → Web `</>`** → register the app → copy `apiKey`, `authDomain`, `projectId`, `appId`, `storageBucket`, `messagingSenderId` into the **Vercel staging** variables (§4).
5. **Render staging:** `FIREBASE_PROJECT_ID=<staging project id>`.
   - **Required.** The server defaults to the production ID `genwebai-dca16` when it is unset, and a staging API would then accept production tokens.

**Do NOT:**
- change the production Firebase project (`genwebai-dca16`) in this step, apart from O9;
- add staging domains to the production project.

**Verify:** on staging (in O8), sign-up sends a verification e-mail **from the staging project**. The user then appears in the staging project's *Users* list, not in production's.

**Rollback:** delete the staging Firebase project.

---

### O7. Configure the Razorpay test-mode webhook for staging *(High, ~20 min)*

1. Razorpay Dashboard → **Test Mode** → **Account & Settings → Webhooks** (older UI: *Settings → Webhooks*) → **Add New Webhook**.
2. **URL:** `https://<staging-api-host>/api/payment/webhook`.
3. **Secret:** generate a random string of 32+ characters locally. Put it here **and** into Render staging `RAZORPAY_WEBHOOK_SECRET`.
4. **Active events:** `order.paid` and `payment.captured` only.
5. **Alert e-mail:** yours.
6. **Create.** Render staging keys: `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` = the **test** keys from O4. Separate test keys per environment are possible, but optional.

**Do NOT:**
- add the webhook in **Live** mode;
- point a webhook at production in R0;
- enable other events.

**Verify:** procedure D7 in the R0 plan (§B3): normal purchase, lost callback, *Resend*, wrong secret → 401, then `npm run ledger:reconcile` against the **staging** DB. Since D4, the reconcile script needs `APP_ENV=staging` in that shell.

**Evidence:**
- a screenshot of the webhook (secret hidden);
- the delivery log showing 2xx for valid events and 401 for the wrong-secret test;
- the reconcile output `mismatches: []`.

**Rollback:** disable or delete the webhook. The browser `/verify` path still credits.

---

### O8. Prepare the verified-email and Google-login test accounts *(Medium, ~20 min)*

1. **Test mailbox A**, used for email/password only. Create a new mailbox, e.g. a new Gmail `genweb.test.a…@gmail.com`. Never use a real customer's address.
2. **Google test account B**, used for Google login. Create a separate new Google account.
3. **Optional linking case:** sign in with A's address via Google too, to exercise the "same e-mail, different provider" path.
4. Record which account is used for which test. Never record passwords in shared places.

**Test procedure (on staging, after deployment approval; R0 plan B6):**
1. Sign up with A. Logging in before verifying shows "Please verify your email" (server 403 `EMAIL_NOT_VERIFIED`).
2. Click the link in the e-mail, then log in. The dashboard shows **100 credits**.
3. Log out and log in again: same account, no duplicate.
4. Google login with B creates a new user. A repeat login reuses it.
5. Linking case: the result follows the code's rule, i.e. linked, or 409 if the Firebase UIDs differ.
6. Logout-all: the old session cookie gets 401.
7. **Also test in Safari or iOS (pre-existing architecture risk).** The API cookie is `SameSite=None; Secure` across `*.vercel.app` and `*.onrender.com`, which are different sites. Browsers that block third-party cookies may not keep the session **[NOT VERIFIED]**.

**Rollback:** delete the test users from the staging Firebase project and the staging DB.

---

### O9. Restrict the Firebase web API keys *(Low, ~15 min)*

The Firebase web key is public by design. A restriction limits abuse.

1. <https://console.cloud.google.com> → select the Firebase project → **APIs & Services → Credentials** → the *Browser key (auto created by Firebase)*.
2. **Application restrictions → Websites:**
   - production: `https://genweb-ai-delta.vercel.app/*`, `https://genwebai-dca16.web.app/*`, `https://genwebai-dca16.firebaseapp.com/*`, `http://localhost:5173/*`;
   - staging (in its own project): the staging domain + `localhost`.
3. **API restrictions:** leave **unrestricted** for now. Restricting to the wrong APIs breaks sign-in. Only change it after testing on staging.

**Verify:** production sign-in (email and Google) still works immediately after saving. Changes can take a few minutes.

**Rollback:** remove the restriction (Application restrictions → None).

---

### O10. Clean up local secrets on your machine *(Medium, ~10 min)*

1. Delete `websiteBuilder-v2/client/.env.local`. It holds a stale Vercel OIDC token; short-lived, but still a credential.
2. In `websiteBuilder-v2/server/.env`:
   - replace `MONGODB_URL` with a **local** database, e.g. a local replica set `mongodb://127.0.0.1:27017/genweb_dev?replicaSet=rs0`, or with the staging URI + `ALLOW_REMOTE_DB=true`;
   - add `APP_ENV=development`.
   - Since D4, the server refuses the production URI in development anyway, but keeping production credentials on a laptop is the real risk.
3. Replace every rotated value in local `server/.env` with the new values, or leave AI keys empty locally (tests don't need them).
4. **Do not** copy `server/.env` anywhere else, and do not commit it.

**Verify:** `npm test` in `server` still passes (it uses an in-memory DB). `npm run dev` starts and logs `DB target allowed: local database`.

---

### O11. Production cut-over *(not part of R0; separate approval)*

**Later, when v2 goes to production** (production `APP_ENV=production` and the cut-over steps are in the roadmap and status docs, not in R0):
- set production Render `APP_ENV=production`, `NODE_VERSION=24` and `MONGODB_URI`;
- set the 6 production `VITE_FIREBASE_*` variables in Vercel;
- create the production `RAZORPAY_WEBHOOK_SECRET` and its webhook;
- confirm that the live Razorpay keys are activated.

### O12. Ask ZhipuAI about multiple accounts *(Optional)*

- **Status:** the Z.ai terms (updated 2026-04-14) have no explicit rule, and the `open.bigmodel.cn` user agreement was not retrieved, so this stays UNCONFIRMED.
- **Ask support:** "Is it permitted to hold more than one account/API key for the same application, and what are the free limits for glm-4.5-flash?"
- **Until answered:** keep one account (O2).

---

## 2. Independent review of D1–D4 (code checked today, not the report)

**Re-run today:**
- server `npm test`: **178/178 pass**;
- client `npm test`: **5/5 pass**.

### D1: Node 24

| Check | Result |
| --- | --- |
| `server/package.json:17` `"node": "24.x"`; lockfile root matches | **Confirmed** |
| `tests/runtime.test.js` checks every lockfile package at 24.0.0 and 24.999.999 | **Confirmed**; mutation with 18.x flags 8 packages |
| Render actually uses Node 24 | **NOT VERIFIED.** No dashboard access. |

**Findings:**
- **F-D1-1 (Medium):** Render precedence is `NODE_VERSION` → `.node-version` → `.nvmrc` → `engines`. With Root Directory `server`, Render works relative to `server`. Two cases are a risk:
  - Root Directory **unset**: the repo-root `package.json` has **no** `engines`, and Render's default depends on when the service was created (e.g. 14.17.0 for services created before 2023-11-01, 24.x for recent ones);
  - an existing `NODE_VERSION` env var: it overrides `engines`.
  - **Owner action:** set `NODE_VERSION=24` on every Render service running v2 (O5b, O11) and confirm it in the build log.
- **F-D1-2 (Info):** Vercel's Node version for the client build is unaffected (root `package.json` unchanged). Vite 8 needs Node ^20.19 or ≥ 22.12; check it in Vercel project settings **[NOT VERIFIED]**.

### D2: Firebase environment configuration

| Check | Result |
| --- | --- |
| `client/src/firebase.js` has no project literals; it uses `readFirebaseConfig(import.meta.env)` | **Confirmed** |
| Missing/malformed values fail `vite` / `vite build` early | **Confirmed** (earlier builds: exit 1 with variable names) |
| Switching projects needs only env changes | **Confirmed** (staging build: production id 0×, staging id 3×) |

**Findings:**
- **F-D2-1 (High; regression introduced by D2; code fix needs approval):**
  - **Cause.** Passing the whole `import.meta.env` object makes Vite inline **every** `VITE_*` variable into the bundle. Today's bundle contains `VITE_SERVER_URL`, `VITE_API_URL` and all Firebase values. Before D2, only the statically referenced `VITE_FIREBASE_API_KEY` and `VITE_API_URL` were bundled.
  - **Effect today:** no harm; all values are public.
  - **Effect on Vercel:** Vercel exposes system variables with a `VITE_` prefix for Vite projects, and its system list includes `VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_OIDC_TOKEN`. On a Vercel build either:
    - (a) the D2 secret-name check fails the build (safe, but blocks deployment), or
    - (b) if a name slips past the heuristic, the value is published in the bundle.
  - **Recommended fix:**
    - read each variable by **static property access** (`import.meta.env.VITE_FIREBASE_API_KEY`, …) so only those six are bundled;
    - add a test that the built bundle contains no unexpected `VITE_` keys;
    - make the name check ignore Vercel's own `VITE_VERCEL_*` system variables, which are no longer bundled after the fix.
  - **Interim owner mitigation:** turn off "Automatically expose System Environment Variables" in the Vercel staging project.
  - **Report correction:** this means the statement in the corrections report that D2 "preserves existing behaviour" was **incomplete**.
- **F-D2-2 (Low):** `vite.config.js` loads env from `process.cwd()`, the same as Vite's default `envDir`. With `npm run build --prefix client`, npm runs the script inside `client`, so this matches. Acceptable.
- **F-D2-3 (Low):** the client tests check the pure module and the source text, not the built bundle. That is why F-D2-1 was not caught. Covered by the fix above.

### D3: Cloudflare and provider quota aggregation

| Check | Result |
| --- | --- |
| `KeyPool.next()` returns the first usable credential (no index rotation); no other rotation code in `server/ai/` | **Confirmed** (grep) |
| Every capacity outcome pauses the whole pool (`coolDown` sets `this.pool.until`) | **Confirmed** |
| Daily cap uses one counter per provider: `providerCounterId(model.provider, "account")` | **Confirmed** (`router.js:143`) |
| Classification sets and `isCapacityExhausted` unchanged | **Confirmed** (`router.js:33-38`) |
| Catalog: all providers `quotaScope: "provider"`; test asserts it | **Confirmed** |
| Credentials switch only for `auth` (401/403 → dead) or after 3 transient failures (3 min rest) | **Confirmed** (`router.js:157-160`) |

**Findings:**
- **F-D3-1 (Low):** while credential 1 is resting after 3 transient errors, up to 3 minutes of traffic uses credential 2's allocation, a different account if several are configured. This is moot once O2 leaves one account per provider. Optional hardening: allow failover only for `auth`.
- **F-D3-2 (Info):** `getProviderStatus()` creates pools for locked providers too, so the "N credentials" warning is also logged for Mistral, SambaNova and OpenRouter while their keys exist in `.env`. Log noise only; gone after O3.
- **F-D3-3 (Info):** `quotaScope` in the catalog is now documentation only; `KeyPool` ignores it.

### D4: Production database guard

| Check | Result |
| --- | --- |
| `config/db.js`: `assertSafeDatabaseTarget(uri)` runs **before** `mongoose.connect` | **Confirmed** |
| `scripts/migrate-credit-ledger.js:88`, `reconcile-credits.js:40`, `set-admin.js:22`: guard before connect, exit 2 | **Confirmed** (all three) |
| Other `mongoose.connect` / `MongoClient` uses in the server or benchmarks | **None found** besides `tests/helpers.js`, which guards with `APP_ENV=test` |
| Tests and scripts do not load `.env` (only `index.js` imports `env.js`) | **Confirmed**, so tests can never pick up the production URI |
| Real local URI decision | REFUSED in unset / development / development + `ALLOW_REMOTE_DB` / staging; allowed only with production. Pure check, no connection. |

**Parser comparison:** I compared the guard's host parsing with the MongoDB driver's own installed parser (`mongodb-connection-string-url`; pure parsing, no network).

| Input | Guard | Driver | Outcome |
| --- | --- | --- | --- |
| Normal SRV / seed list / IPv6 / upper-case host | correct host(s) | same | correct |
| Password with unescaped `/ ? #` | wrong host (`u:pa`), allowed in staging | **rejects the URI** | fail-safe: the connection cannot happen |
| `MONGODB+SRV://` (upper-case scheme) | parsed | rejects | fail-safe |
| **Trailing-dot FQDN** `cluster0.ayk95r2.mongodb.net.` | `…mongodb.net.`, which does **not** match `.ayk95r2.mongodb.net`, so **ALLOWED** in staging and development + `ALLOW_REMOTE_DB` | **accepts** | **bypass** |

**Findings:**
- **F-D4-1 (Medium; code fix needs approval):** trailing-dot hostname bypass (table above). It needs a deliberately or accidentally dotted host plus a non-production `APP_ENV`. Fix: strip trailing dots before matching, and add a test.
- **F-D4-2 (Low):** a staging cluster inside the production Atlas project shares the `ayk95r2` suffix and would be refused. Correct for our plan (O5a uses a separate project), but it rests on an **[ASSUMPTION]** about Atlas hostnames.
- **F-D4-3 (Low):** matching is hostname-only. An IP address or DNS alias for the production cluster would not be recognised. Mitigation: never use such aliases; optionally set `PRODUCTION_DB_HOSTS` on staging.
- **F-D4-4 (Info):** `APP_ENV=production` on a laptop deliberately bypasses the guard. That is the documented, explicit mechanism for authorised scripts.

### Summary of report accuracy

Confirmed as written:
- D1 code;
- D3 behaviour;
- D4 placement and test claims;
- test counts.

Needs correction:
- D2 "preserves existing behaviour" (F-D2-1);
- D4 "refused everywhere except production" (true except the trailing-dot form, F-D4-1).

---

## 3. Staging environment setup guide (order)

1. **G1:** decide the repo for v2 (private repo recommended). No `.env` files committed.
2. **Code follow-ups (need your approval; small):**
   - **F-D2-1:** static env access + bundle test;
   - **F-D4-1:** trailing-dot fix + test.
   - Optional: **F-D3-1** auth-only failover.
3. O5a Atlas staging project → O6 Firebase staging project → O5b Render staging (env from §4, `NODE_VERSION=24`, `APP_ENV=staging`) → O5c Vercel staging (env from §4; system-var exposure off until F-D2-1 is fixed) → O7 Razorpay test webhook.
4. **Staging deployment (separate approval):**
   - Render manual deploy, then the Vercel deploy;
   - smoke checks: health, Node 24, DB guard log line, sign-in, one generation, one edit, undo, save, deploy/undeploy.
5. R0 verification runs: webhook (D7), auth (D8), post-rotation (D9), then the R0 verification report (D10).

---

## 4. Environment variable matrix (names only)

**Status legend:**
- **Req** = required;
- **Opt** = optional;
- **Local** = present in local `server/.env` or `client/.env` today (values not shown);
- **Staging** = there is **no staging yet**, so every staging cell is *not configured*.

### 4.1 Render staging backend (`server`)

| Variable | Req? | Staging value (description) | Local today | Notes |
| --- | --- | --- | --- | --- |
| `NODE_VERSION` | **Req** (operational) | `24` | n/a | F-D1-1 |
| `APP_ENV` | **Req** | `staging` | not set | D4: a remote DB with no `APP_ENV` is refused |
| `MONGODB_URI` | **Req** | staging Atlas URI, `/genweb_staging` | `MONGODB_URL` set (production host) | must not end in `.ayk95r2.mongodb.net` |
| `PRODUCTION_DB_HOSTS` | Opt | e.g. `.ayk95r2.mongodb.net` (the default already) | not set | explicit is clearer |
| `ALLOW_REMOTE_DB` | — | leave unset | not set | only for development |
| `JWT_SECRET` | **Req** | new, unique to staging | set (leaked, rotate) | never reuse production's |
| `CLIENT_URL` | **Req** | exact staging Vercel origin | set (production) | CORS, CSRF, framing |
| `SERVER_URL` | **Req** | staging Render URL | set (production) | deploy URLs |
| `PORT` | Opt | Render provides it | set | |
| `FIREBASE_PROJECT_ID` | **Req** | staging Firebase project id | not set | defaults to production `genwebai-dca16` if unset |
| `RAZORPAY_KEY_ID` | **Req** | test key id (`rzp_test_…`) | set (test, leaked, rotate) | |
| `RAZORPAY_KEY_SECRET` | **Req** | test secret | set (leaked, rotate) | |
| `RAZORPAY_WEBHOOK_SECRET` | **Req** | the same as the staging webhook (O7) | **missing** | webhook returns 503 without it |
| `GROQ_API_KEY_1` | Req ≥ 1 provider | the kept key (O2) | set ×5 | `_2…_5` must not be set |
| `ZHIPU_API_KEY_1` | Opt | the kept key | set ×5 | |
| `CLOUDFLARE_API_KEY_1` + `CLOUDFLARE_ACCOUNT_ID_1` | Opt | the kept token + account | set ×5 | |
| `MISTRAL_*`, `SAMBANOVA_*`, `OPENROUTER_*`, `CEREBRAS_*` | **Must not be set** | — | set (dead or unused) | O3 |
| `SITE_URL` | Opt | staging origin | not set | OpenRouter header only (locked) |
| `NODE_ENV` | Opt | `production` | not set | not read by app code; Express performance only |

### 4.2 Vercel staging frontend (`client`)

| Variable | Req? | Value | Local today | Notes |
| --- | --- | --- | --- | --- |
| `VITE_API_URL` | **Req** | staging Render URL | set | |
| `VITE_FIREBASE_API_KEY` | **Req** | staging web key | set (production) | public |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Req** | `<staging-id>.firebaseapp.com` | set (production) | |
| `VITE_FIREBASE_PROJECT_ID` | **Req** | staging project id | set (production) | |
| `VITE_FIREBASE_APP_ID` | **Req** | staging web app id | set (production) | |
| `VITE_FIREBASE_STORAGE_BUCKET` | Opt (set it) | staging bucket | set (production) | if unset on Vercel, nothing leaks from production (local `.env` is not deployed) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Opt (set it) | staging sender id | set (production) | |
| `VITE_SERVER_URL` | — | not needed (unused by code) | set twice (duplicate) | bundled today because of F-D2-1 |
| Vercel setting "Automatically expose System Environment Variables" | **Off** (interim) | — | n/a | F-D2-1 |

### 4.3 Firebase staging project

| Item | Required | Status |
| --- | --- | --- |
| Project created (`genweb-staging`) | Yes | not done |
| Email/Password sign-in enabled | Yes | not done |
| Google sign-in enabled (support e-mail) | Yes | not done |
| Authorized domain: staging Vercel domain | Yes | not done |
| Web app registered (config → §4.2) | Yes | not done |
| API key website restriction (O9) | Recommended | not done |

### 4.4 MongoDB staging Atlas project

| Item | Required | Status |
| --- | --- | --- |
| Separate project `genweb-staging` | Yes (guard and isolation) | not done |
| M0 cluster (replica set; transactions OK) | Yes | not done |
| User `readWrite@genweb_staging` only | Yes | not done |
| Network access (`0.0.0.0/0`, staging only) | Yes | not done |
| Host suffix ≠ `.ayk95r2.mongodb.net` | Yes | unverified |

### 4.5 Razorpay test-mode webhook

| Item | Required | Status |
| --- | --- | --- |
| Test Mode selected | Yes | — |
| Test API key regenerated (O4) | Yes | not done |
| Webhook URL `https://<staging-api>/api/payment/webhook` | Yes | not done |
| Events: `order.paid`, `payment.captured` | Yes | not done |
| Secret = Render `RAZORPAY_WEBHOOK_SECRET` | Yes | not done |
| No live-mode webhook | Yes | — |

---

## 5. Dependencies between actions

```
O1 (Atlas prod user) ─┐
O4 (JWT, Razorpay)  ──┼─> production keeps running on new credentials
O2 (one AI account) ──┤
O3 (revoke dead)    ──┘
O9, O10 (independent)
G1 (repo decision) ──> O5b, O5c
code follow-ups F-D2-1, F-D4-1 (approval) ──> staging deploy
O5a ──> O5b env ;  O6 ──> O5b (FIREBASE_PROJECT_ID) + O5c (VITE_FIREBASE_*)
O5b deployed (approval) ──> O7 webhook URL ──> D7 webhook test
O6 + O8 + deploy ──> D8 auth test
```

---

## 6. Verification evidence checklist

Keep this table in your private notes. Never record secret values.

| # | Action | Evidence to capture | Done |
| --- | --- | --- | --- |
| O1 | Atlas prod user rotated | new user name; Render deploy time; site sign-in OK; old user deleted (screenshot) | ☐ |
| O2 | One account/key per provider | per provider: kept account (masked), key last 4, key-list screenshot with 1 entry; extra accounts emptied | ☐ |
| O3 | Dead keys revoked | screenshots per dashboard; removed variable names | ☐ |
| O4 | JWT + Razorpay test key rotated | times; `rzp_test_…` last 4; old session signed out | ☐ |
| O5a | Atlas staging | project name; host suffix (≠ `ayk95r2`); user role | ☐ |
| O5b | Render staging | service name; `NODE_VERSION=24`; log lines "Node 24.x" and "DB target allowed: APP_ENV=staging…" | ☐ |
| O5c | Vercel staging | project name; domain; system-var exposure off | ☐ |
| O6 | Firebase staging | project id; providers enabled; authorized domain | ☐ |
| O7 | Razorpay webhook | webhook screenshot (secret hidden); delivery log 2xx / 401; reconcile `mismatches: []` | ☐ |
| O8 | Test accounts | which account is used for which test; B6 steps 1–7 results | ☐ |
| O9 | API key restricted | restriction screenshot; production sign-in still OK | ☐ |
| O10 | Local cleanup | `.env.local` deleted; local server starts with "local database" | ☐ |
| G1 | Repo decision | repo/branch name; confirmation that no `.env` is in git | ☐ |

---

## 7. Remaining blockers

| ID | Blocker | Owner / developer | Status |
| --- | --- | --- | --- |
| B1 | Credential rotation (O1, O2, O4) and dead-key revocation (O3) | owner | open |
| **G1 (new)** | v2 is not in a git repository; Render and Vercel cannot deploy it | owner decision | open |
| **F-D2-1 (new)** | Whole `import.meta.env` is bundled; conflicts with Vercel's `VITE_`-prefixed system vars | developer, needs approval | open |
| **F-D4-1 (new)** | Trailing-dot hostname bypasses the production DB guard | developer, needs approval | open |
| F-D1-1 | Render Node version not confirmed; set `NODE_VERSION=24` | owner | open |
| B2 | Staging resources (O5, O6) | owner | open |
| B3 | Real test-mode webhook delivery (O7 + D7) | owner + developer, after the staging deploy | open |
| B6 | Verified-email / Google login E2E (O8 + D8) | owner + developer | open |
| — | Staging deployment | **separate approval** | not requested yet |
| Risk | Cross-site session cookie in Safari / third-party-cookie-blocking browsers | test in O8 step 7 | unverified |

## 8. Final R0 readiness verdict

**NOT READY.**
- **Code-side:** D1, D3 and D4 work as intended, apart from the trailing-dot gap. D2 needs one follow-up fix before any Vercel build: F-D2-1.
- **Owner-side:** every action O1–O10 is still pending, and staging cannot exist until **G1** is decided.

**Stopping here. Awaiting your approval for:**
- (a) the owner actions, which you perform;
- (b) the small code follow-ups F-D2-1 and F-D4-1, plus optionally F-D3-1;
- (c) the G1 repository decision;
- (d) a later, separate staging deployment.

---

*Sources used for this runbook:*
- *Render: [Node version](https://render.com/docs/node-version), [monorepo / root directory](https://render.com/docs/monorepo-support)*
- *Vercel: [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite.md), [OIDC](https://vercel.com/docs/oidc)*
- *Provider terms: [Groq AUP](https://console.groq.com/docs/legal/ai-policy), [Cloudflare terms](https://www.cloudflare.com/terms/), [Z.ai terms](https://docs.z.ai/legal-agreement/terms-of-use)*
