# GenWeb.ai 2.0: GitHub Repository Preflight (`GenWeb.ai-2.0`)

*Prepared 2026-11-01. This was a read-only inspection of `websiteBuilder-v2`.*

**Not done:**
- no git repository was initialised in v2;
- no GitHub repository was created;
- nothing was committed or pushed;
- no source or env file was changed;
- no production service was accessed;
- nothing was deployed.

**How the `.gitignore` check was done.** The ignore rules were tested in a throwaway simulation in the session scratchpad, which has since been deleted. It used **empty placeholder files** with the same paths as v2, plus the three real `.gitignore` files. No file content was copied, so no `.env` content left v2.

## 0. Pre-push hardening: applied 2026-11-01 (latest state; §1–§10 below are the original preflight)

Approved items applied:
- root `.gitignore` hardened;
- `.gitattributes` added;
- benchmarks checked and included;
- personal e-mail removed from README;
- commit identity planned.

**Not done:**
- no `git init`;
- no staging, commit or push;
- no GitHub repository;
- no Vercel or Render connection;
- no source or env file change;
- no production access.

### 0.1 Changed files and diffs

**1. `.gitignore` (root), modified.** Lines 1–6 unchanged; added:

```diff
 *.log
 dist
 !.env.example
+
+# Credentials and private keys (never commit; keep them in the platform's env settings)
+*.pem
+*.key
+*.p12
+*.pfx
+id_rsa*
+id_ed25519*
+serviceAccount*.json
+*firebase-adminsdk*.json
+.npmrc
+
+# Hosting / tool state
+.vercel
+.firebase
+.render
+
+# Database dumps and backups
+dump/
+*.bson
+*.bak
+*.sql
+*.dump
+
+# Test output
+coverage/
+
+# OS / editor
+.DS_Store
+Thumbs.db
+.vscode/
+.idea/
```

**2. `.gitattributes`, new:**

```gitattributes
# Consistent line endings: LF in the repository and on Linux build hosts
# (Render, Vercel), regardless of the Windows checkout.
* text=auto eol=lf

# Binary files: never convert or diff as text.
*.png binary
*.jpg binary
*.ico binary
```

**3. `README.md`, modified.** One line removed from "Author" (the address is masked here):

```diff
 - GitHub: [@mradul-08](https://github.com/mradul-08)
-- Email: [mr…@gmail.com](mailto:mr…@gmail.com)
 - Project: [GenWeb.ai](https://github.com/mradul-08/Genweb.ai)
```

**4. `GENWEB_AI_2_GITHUB_REPOSITORY_PREFLIGHT.md` (this file), modified.** It gains this §0. In §8 and §9, the identity line, file count and step 0 are updated.

**Backups of the originals** are in the session scratchpad: `…\scratchpad\prepush-before\.gitignore` and `…\scratchpad\prepush-before\README.md`.

**Unchanged:**
- `server/.env`, `client/.env`, `client/.env.local`;
- all source code, `package.json`, lockfiles;
- the original `websiteBuilder`.

### 0.2 Re-run preflight results

Method: a fresh throwaway simulation in the scratchpad, using empty placeholder files at the same paths and the real `.gitignore` / `.gitattributes`. It has since been deleted.

| Check | Result |
| --- | --- |
| **Exact commit count** | **208** files: the original 206 + `.gitattributes` + this preflight report (diff-checked; no other change) |
| Ignored existing paths | `server/.env`, `client/.env`, `client/.env.local`, `server/node_modules/`, `client/node_modules/`, `client/dist/` |
| 22 risky future file types | **all ignored**:<br>• credentials and keys: `serviceAccount.json`, `*firebase-adminsdk*.json`, `*.pem`, `id_rsa`, `id_ed25519`, `*.p12`, `*.pfx`, `.npmrc`<br>• hosting/tool state: `.vercel/`, `.firebase/`, `.render/`<br>• dumps and backups: `dump/*.bson`, `*.bak`, `*.sql`, `*.dump`<br>• test output: `coverage/`<br>• OS/editor files: `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`<br>• env variants: `.env.production`, `.env.production.local` |
| `.gitattributes` | `README.md` → `text=auto`, `eol=lf`; `*.png` → binary (`text` unset) |
| **Real `.env` values in the 208 files** | **0** of 48 secret values. 19 hits are public Firebase identifiers (project id, sender id, auth domain, bucket). |
| Key formats, private keys, credentialed Atlas URIs | none, except fake fixtures in `server/tests/dbGuard.test.js` (`u:p`, `user:p%40ss`) and the simulated values in `client/tests/*` |
| **Personal e-mail** (gmail, yahoo, outlook, hotmail, icloud, proton) | **none** in any commit file (README fixed) |
| Machine-specific paths / OS username | Initially present in two docs: `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md` (scratchpad backup paths) and this file (§2 table, §8 `cd` line). **Redacted** on 2026-11-01 (§0.7); **none remain** in the 208 files. |
| Personal files (resume, pdf, docx, zip), backups, dumps, keys | none in the tree |

### 0.3 Benchmarks: checked and safe (82 files)

| Check | Result |
| --- | --- |
| Secrets / key formats / JWTs / Mongo URIs | none |
| Local paths, OS username, `localhost`/`127.0.0.1`, scratchpad references | none; `results.json` file and screenshot fields are relative names (e.g. `portfolio-single.html`) |
| E-mail addresses | only AI-generated placeholders: `you@example.com`, `ananya@example.com` |
| IDs (Mongo ObjectIds, UUIDs), IPs, phone numbers | none |
| External URLs | public services only: fonts.googleapis.com, fonts.gstatic.com, picsum.photos, images.unsplash.com, randomuser.me, via.placeholder.com, cdn.jsdelivr.net, linkedin.com, dribbble.com, google.com, w3.org. These come from generated sample pages; the "raw" originals predate the sanitizer. |
| JSON contents | timestamps (`ranAt`), categories, model ids, token counts, timings, quality metrics. No user data. |
| PNG screenshots (42) | only `IHDR`/`IDAT`/`IEND` chunks, so **no metadata** (no text, EXIF or time chunks). Page-viewport captures via the Chrome DevTools Protocol, which by design include no browser UI or desktop; one image was viewed to confirm. |

**Decision: benchmarks are included.**

### 0.4 Planned commit author identity

- **Current state.** Your **global** git config sets a personal Gmail address as `user.email`. Without a repository-local override, commits would carry it.
- **Planned no-reply identity.** GitHub's public API (unauthenticated) reports account `mradul-08` with id `206886372`, so the no-reply address is:

  `206886372+mradul-08@users.noreply.github.com`
- **Confirm before use:**
  - **[UNVERIFIED]** that `mradul-08` is the account that will own `GenWeb.ai-2.0` (taken from README);
  - on github.com → Settings → Emails: **"Keep my email addresses private"** is on (this shows the same no-reply address);
  - optionally **"Block command line pushes that expose my email"**.
- **How it will be set.** It can only be set inside a repository, so it is recorded here and applied **after** `git init` (§8 step 1) as **repository-local** config. Your global config stays unchanged.

### 0.5 Open decisions (not done; need approval)

1. ~~Redact the local Windows paths in `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md` and in this file.~~ **Done** (§0.7).
2. Confirm the GitHub account and no-reply address (§0.4).
3. Repository creation, `git init`, commit and push: separate approval.

### 0.7 Path redaction cleanup (2026-11-01)

**Purpose.** Windows absolute paths containing the local OS username were replaced with placeholders. Nothing else changed in these documents: no evidence was removed, and every path still names the same file.

| File | Before (username shown as `<user>`) | After | Count |
| --- | --- | --- | --- |
| `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md` §2 table (`client/.env` row) | `C:\Users\<user>\AppData\Local\Temp\claude\<session>\scratchpad\client-env.bak` | `<SESSION_SCRATCHPAD>\client-env.bak`, plus a one-time definition: "`<SESSION_SCRATCHPAD>` = the assistant session's temporary folder, outside the repository; absolute path redacted" | 1 |
| same file, §6 Rollback (D1 row) | `C:\Users\<user>\…\scratchpad\server-package.json.bak` | `<SESSION_SCRATCHPAD>\server-package.json.bak` | 1 |
| same file, §6 Rollback (D2 row) | `C:\Users\<user>\…\scratchpad\client-env.bak` | `<SESSION_SCRATCHPAD>\client-env.bak` | 1 |
| this file, §2 table | row "Local Windows path `C:\Users\<user>\…`, … optional redaction" | row "Local Windows paths containing the OS username, … **Redacted 2026-11-01** → `<SESSION_SCRATCHPAD>\…`" | 1 |
| this file, §8 commands | `cd "/c/Users/<user>/OneDrive/Desktop/WebAi/websiteBuilder-v2"` | `cd "<PROJECT_ROOT>"   # the websiteBuilder-v2 folder on your machine` | 1 |

**Placeholders used:**
- `<PROJECT_ROOT>`: the local `websiteBuilder-v2` folder.
- `<SESSION_SCRATCHPAD>`: the assistant's temporary session folder, which is outside the project. That is why it is not written as `<PROJECT_ROOT>`.

**Backups of both documents before the cleanup:** `<SESSION_SCRATCHPAD>\redact-before\`.

**Verification:** see the final checks recorded with this cleanup; the summary is in §0.2.

### 0.6 Exact commit list (208)

<details><summary>Root (19), docs (2), client (38), server (67)</summary>

```
.gitattributes
.gitignore
CHANGES.md
GENWEB_AI_2_AUDIT.md
GENWEB_AI_2_COMPETITOR_ANALYSIS.md
GENWEB_AI_2_GITHUB_REPOSITORY_PREFLIGHT.md
GENWEB_AI_2_IMPLEMENTATION_STATUS.md
GENWEB_AI_2_INNOVATION_BACKLOG.md
GENWEB_AI_2_PRODUCT_VISION.md
GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md
GENWEB_AI_2_R0_EXECUTION_PLAN.md
GENWEB_AI_2_R0_FINAL_SECURITY_FIX_REPORT.md
GENWEB_AI_2_R0_FINAL_STATUS.md
GENWEB_AI_2_R0_OWNER_RUNBOOK.md
GENWEB_AI_2_ROADMAP.md
GENWEB_AI_2_TARGET_ARCHITECTURE.md
README.md
package.json
vercel.json
docs/PRIORITY_1_PLAN.md
docs/PRIORITY_2_PLAN.md
client/.env.example
client/.firebaserc
client/.gitignore
client/README.md
client/eslint.config.js
client/firebase.json
client/index.html
client/package-lock.json
client/package.json
client/vercel.json
client/vite.config.js
client/public/favicon.svg
client/public/icons.svg
client/public/index.html
client/src/App.css
client/src/App.jsx
client/src/assets/hero.png
client/src/assets/react.svg
client/src/assets/vite.svg
client/src/components/LoginModels.jsx
client/src/components/global.css
client/src/components/login.css
client/src/config.js
client/src/firebase.js
client/src/firebaseConfig.js
client/src/hooks/useGetCurrentUser.jsx
client/src/index.css
client/src/main.jsx
client/src/pages/Dashboard.jsx
client/src/pages/Editor.jsx
client/src/pages/Generate.jsx
client/src/pages/Home.jsx
client/src/pages/Pricing.jsx
client/src/redux/store.js
client/src/redux/userSlice.js
client/src/utils/previewDoc.js
client/tests/bundle.test.js
client/tests/firebaseConfig.test.js
server/.env.example
server/.gitignore
server/app.js
server/env.js
server/index.js
server/package-lock.json
server/package.json
server/ai/cache.js
server/ai/catalog.js
server/ai/config.js
server/ai/htmlPatch.js
server/ai/intent.js
server/ai/keyPool.js
server/ai/pipeline.js
server/ai/prompts.js
server/ai/providers.js
server/ai/quota.js
server/ai/router.js
server/ai/sanitize.js
server/ai/strategy.js
server/ai/usage.js
server/ai/validate.js
server/config/creditPacks.js
server/config/db.js
server/config/dbGuard.js
server/config/origins.js
server/config/razorpay.js
server/controllers/admin.controller.js
server/controllers/auth.controller.js
server/controllers/payment.controller.js
server/controllers/user.controllers.js
server/controllers/website.controller.js
server/middlewares/checkOrigin.js
server/middlewares/isAuth.js
server/middlewares/rateLimit.js
server/middlewares/requireAdmin.js
server/models/ai.models.js
server/models/creditTransaction.model.js
server/models/payment.model.js
server/models/user.model.js
server/models/website.model.js
server/routes/admin.routes.js
server/routes/auth.routes.js
server/routes/payment.router.js
server/routes/user.routes.js
server/routes/website.routes.js
server/scripts/migrate-credit-ledger.js
server/scripts/reconcile-credits.js
server/scripts/set-admin.js
server/services/credits.js
server/tests/ai-api.test.js
server/tests/auth.test.js
server/tests/credits.test.js
server/tests/dbGuard.test.js
server/tests/helpers.js
server/tests/intent.test.js
server/tests/ownership.test.js
server/tests/patch.test.js
server/tests/payments.test.js
server/tests/prompts.test.js
server/tests/quota.test.js
server/tests/router.test.js
server/tests/runtime.test.js
server/tests/sanitize.test.js
server/tests/validate.test.js
server/utils/session.js
server/utils/verifyFirebaseToken.js
```
</details>

<details><summary>Benchmarks (82)</summary>

```
benchmarks/2026-11-01/            51 files: {agency,dashboard,docs,ecommerce,portfolio,restaurant,saas}-{brief,single}-{desktop,mobile}.png (28),
                                  {…}-brief.html (7), {…}-single.html (7), {…}-single.rendered.html (7),
                                  edit-mode-comparison.json, results.json
benchmarks/2026-11-01-v2prompt/   31 files: {agency,dashboard,docs,ecommerce,portfolio,restaurant,saas}-single-{desktop,mobile}.png (14),
                                  {…}-single.html (7), {…}-single.rendered.html (7),
                                  restaurant-single.raw.html, comparison.json, results.json
```
</details>

**Pre-push verdict: READY for the separately approved steps** (repository creation → `git init` → stage → checklist §9 → commit → push), once the decisions in §0.5 are made.

---

## Verdict: **READY**, conditional on the checklist in §9

- **Content:** the current tree can be pushed to a new private repository without exposing secrets.
  - Every real secret value in the local `.env` files was cross-checked against all 206 files that would be committed, and **none** was found.
  - The existing ignore rules exclude all three env files, `node_modules` and `dist`.
- **Strongly recommended before `git init`:** harden the root `.gitignore` (§4.2; needs your approval to edit the file). Today's tree has no risky files of those kinds, but the current rules would **not** stop a future private key, service-account JSON, DB dump or root `.vercel/` folder.
- **Leaked credentials (B1 / O1–O4):**
  - They are **not** in this tree. The new repository starts with fresh history, because v2 has no `.git`.
  - They are still valid and must still be rotated. The old v1 repository's history is unaffected by this step.

---

## 1. Source tree inventory (excluding `node_modules`, `client/dist`)

| Area | Files | Commit? |
| --- | --- | --- |
| Root docs (`*.md`: audit, status, blueprint, R0 reports, README, CHANGES) | 15 | yes |
| Root config (`package.json`, `vercel.json`, `.gitignore`) | 3 | yes |
| `docs/` (Priority 1/2 plans) | 2 | yes |
| `server/` source (`ai/`, `config/`, `controllers/`, `middlewares/`, `models/`, `routes/`, `scripts/`, `services/`, `utils/`, `app.js`, `index.js`, `env.js`) | 49 | yes |
| `server/tests/` | 15 | yes |
| `server/package.json`, `package-lock.json`, `.gitignore`, `.env.example` | 4 | yes |
| `client/src/` (22), `client/tests/` (2), `client/public/` (3) | 27 | yes |
| `client/` config (`package.json`, lockfile, `vite.config.js`, `eslint.config.js`, `index.html`, `vercel.json`, `firebase.json`, `.firebaserc`, `.gitignore`, `.env.example`, `README.md`) | 11 | yes |
| `benchmarks/2026-11-01` (51), `benchmarks/2026-11-01-v2prompt` (31): AI-generated sample pages, screenshots, `results.json` | 82 | yes (recommended; it is the evidence the reports cite). Optional: exclude, see §3. |
| **Total to commit** | **206** in the simulation; **207** including this preflight report (written afterwards; contains no secrets) | about **5.6 MB**; largest file 363 KB (a screenshot). GitHub's per-file limit is 100 MB. |

**Must be excluded (all confirmed ignored by the current rules in the simulation):**

| Path | Contains | Ignored by |
| --- | --- | --- |
| `server/.env` | all server secrets (Mongo URI with password, JWT secret, Razorpay keys, 40 AI keys) | root `.env`, `server/.gitignore` |
| `client/.env` | Firebase web config (public) + API URLs | root `.env`, `client/.gitignore` `.env*` |
| `client/.env.local` | stale Vercel OIDC token | root `.env.*`, client `*.local` |
| `server/node_modules/`, `client/node_modules/` | dependencies | `node_modules` |
| `client/dist/` | generated build | root `dist`, client `dist` |

**Other observations:**
- `client/src/components/New folder/` is empty. Git ignores empty folders, so it has no effect; it can be deleted later.
- No `.git` exists anywhere in v2, so there is no inherited history. In particular, the v1 history that contained secrets is **not** carried over.
- No personal or unrelated files were found: no resume, `*.pdf`, `*.docx`, `*.bak`, `*.log`, `*.zip`, `*.pem`, `*.key`, service-account JSON, or v1 `test.mjs`.
- **Original `websiteBuilder` not included:**
  - no files, folders or code references point to the original project folder;
  - the original's `resume/` is not present;
  - v2's code is a derivative of v1 by design.
  - The original still shows only `?? resume/` in its own `git status`.

## 2. Secret and sensitive-data scan of the 206 commit candidates

**A. Exact cross-check.** Every value of 12+ characters from `server/.env`, `client/.env` and `client/.env.local` (52 values, including the password part of the Mongo URI) was searched in all 206 files. Nothing was printed.

| Result | Detail |
| --- | --- |
| **0 secret values found** | No JWT secret, Mongo password, Razorpay secret, AI key, Cloudflare token, Firebase web API key or OIDC token appears in any commit candidate |
| 17 matches, all **public Firebase identifiers** | project id `genwebai-dca16`, auth domain, storage bucket, sender id: in docs, tests, `client/.firebaserc`, `server/config/origins.js`, `server/utils/verifyFirebaseToken.js` (the default project id). Public by design. |

**B. Pattern scan.** Patterns covered:
- key formats: Groq, Cerebras, OpenRouter, OpenAI-style, Cloudflare, Razorpay, ZhipuAI;
- credentials and tokens: Mongo URIs with credentials, Firebase web keys, JWTs, private keys, generic `SECRET=`/`TOKEN=` assignments;
- personal data: e-mail addresses, local Windows paths, the Atlas host suffix.

| Hit | Where | Assessment |
| --- | --- | --- |
| Firebase-key-shaped string, JWT-shaped string, `…SECRET`/`TOKEN` assignments | `client/tests/bundle.test.js`, `client/tests/firebaseConfig.test.js` | **Fake test fixtures**, deliberately named `simulated-…` / `…BundleTest…` |
| Mongo URI with credentials | `server/tests/dbGuard.test.js` | fake (`user:p%40ss`, `u:p`) |
| `JWT_SECRET=` / `VITE_FIREBASE_API_KEY=` | `README.md` | placeholders (`use…`, `you…`) |
| Atlas host suffix `ayk95r2` (48 lines) | R0 reports, `server/config/dbGuard.js`, its tests, `server/.env.example` | Hostname suffix, **not a credential**. It reveals which Atlas project hosts production. Acceptable in a private repo; required by the D4 guard. |
| Author name, GitHub handle and contact e-mail | `README.md` § Author | Intentional author contact, inherited from the original README. Your choice to keep it. |
| Local Windows paths containing the OS username | `GENWEB_AI_2_R0_CODE_CORRECTIONS_REPORT.md` (scratchpad backup paths) | **Redacted 2026-11-01** → `<SESSION_SCRATCHPAD>\…` (§0.7) |

**Conclusion: no secrets and no user data among the commit candidates.** Benchmark pages are AI-generated from test prompts. E2E test data lived in a disposable local DB and is not in the tree.

## 3. Decisions for you (defaults in bold)

| Decision | Options |
| --- | --- |
| Benchmarks (5 MB of screenshots and pages) | **Commit** (evidence for the reports) / exclude with `benchmarks/**/*.png` |
| README author e-mail | **Keep** / remove |
| Local path in the corrections report | **Keep** (private repo) / redact |
| Commit author e-mail | **GitHub no-reply address** (`<id>+<username>@users.noreply.github.com`) / personal address |

## 4. `.gitignore` verification

### 4.1 Current rules (verified in the simulation)

- **Root:** `node_modules`, `.env`, `.env.*`, `*.log`, `dist`, `!.env.example`.
- **`server/`:** `node_modules`, `.env`, `*.log`.
- **`client/`:** logs, `node_modules`, `dist`, `dist-ssr`, `*.local`, editor folders, `.vercel`, `.env*`, `!.env.example`.

| Future file (simulated) | Current rules |
| --- | --- |
| `server/.env.production`, `.env.staging`, `client/.env.production.local`, root `.env` | ignored |
| `client/.vercel/project.json`, `server/npm-debug.log` | ignored |
| `server/serviceAccount.json`, `*firebase-adminsdk*.json` | **NOT ignored** |
| `server/key.pem`, `id_rsa` | **NOT ignored** |
| root `.vercel/project.json` | **NOT ignored** |
| `server/dump/*.bson`, `*.bak` | **NOT ignored** |
| `coverage/`, `.DS_Store`, `.vscode/`, `client/.firebase/` | **NOT ignored** |

### 4.2 Proposed root `.gitignore` (needs your approval to apply)

Validated in the simulation:
- every **NOT ignored** row above becomes ignored;
- the set of committed files stays **exactly the same 206 files** (diff-checked).

```gitignore
node_modules
.env
.env.*
*.log
dist
!.env.example

# Credentials and private keys (never commit; keep them in the platform's env settings)
*.pem
*.key
*.p12
*.pfx
id_rsa*
id_ed25519*
serviceAccount*.json
*firebase-adminsdk*.json
.npmrc

# Hosting / tool state
.vercel
.firebase
.render

# Database dumps and backups
dump/
*.bson
*.bak
*.sql
*.dump

# Test output
coverage/

# OS / editor
.DS_Store
Thumbs.db
.vscode/
.idea/
```

**Optional `.gitattributes`** (Windows checkout, Linux build hosts), to keep line endings consistent:

```gitattributes
* text=auto eol=lf
*.png binary
```

## 5. `.env.example` files

Both are **safe as they are**. Non-comment lines contain only placeholders (`https://your-frontend.example`), empty values, `PORT=3002` and `APP_ENV=development`.

- `server/.env.example`:
  - documents `APP_ENV`, `PRODUCTION_DB_HOSTS` and `ALLOW_REMOTE_DB` (D4);
  - **suggested later clean-up (doc only):** remove the `MISTRAL_`, `CEREBRAS_`, `SAMBANOVA_` and `OPENROUTER_` lines once O3 is done. They invite configuring dead or unused providers.
- `client/.env.example`: documents all six `VITE_FIREBASE_*` variables per environment.
- No new `.env.example` is required.

## 6. Accidentally tracked secrets and sensitive history

| Check | Result |
| --- | --- |
| Git repository or history inside v2 | **none**: no `.git` folder anywhere, so the new repo starts clean |
| Secrets in files to be committed | **none** (§2) |
| v1 history (`websiteBuilder` repository) | contains leaked secrets (earlier audit). **Not part of this repo.** The remedy is rotation (O1–O4), which is still pending. |
| v1 public repository link | `README.md` links to `github.com/mradul-08/Genweb.ai`. If that repository is **public**, its history exposes the leaked keys to anyone, which makes O1–O4 more urgent. This step does not change that. |

## 7. Minimum GitHub permissions

| Who / what | Minimum access |
| --- | --- |
| **You (repository owner)** | Create a **private** repository `GenWeb.ai-2.0` under your account. **Empty**: no README, `.gitignore` or licence, so the first push needs no merge. |
| **Pushing from this PC** | One of:<br>(a) **Git Credential Manager** (bundled with Git for Windows 2.51; browser sign-in on first push), or<br>(b) a **fine-grained personal access token**: *Repository access: Only select repositories → `GenWeb.ai-2.0`*; *Permissions: Contents → Read and write* (Metadata read is added automatically); expiry 30–90 days.<br>No Administration, Workflows, Secrets, Actions or Pages permissions. |
| **Collaborators** | None for now. Add later with the *Write* role only if needed. |
| **Render / Vercel (later, for staging)** | Install their GitHub Apps with **"Only select repositories" → `GenWeb.ai-2.0`**: read access to code. Not "All repositories". |
| **Repository settings (after first push)** | <ul><li>Keep **Private**.</li><li>Enable **secret scanning and push protection** if your plan offers them for private repositories (availability varies by plan **[UNVERIFIED for your account]**).</li><li>Optional: a branch protection rule on `main`.</li><li>**Never** add the production secrets as GitHub Actions secrets in R0; no CI is planned.</li></ul> |

## 8. Exact commands (Git Bash, run by you or by me after approval)

> **OneDrive note.** v2 lives inside a OneDrive-synced folder. OneDrive syncing a `.git` folder can lock or corrupt files during git operations. Either pause OneDrive sync while running these commands, or move the project out of OneDrive first. **[Risk; your choice.]**

```bash
cd "<PROJECT_ROOT>"                         # the websiteBuilder-v2 folder on your machine

# 0. Hardened root .gitignore and .gitattributes: ALREADY APPLIED (§0.1).

# 1. Fresh repository, REPOSITORY-LOCAL identity (overrides the personal global e-mail; see §0.4)
git init -b main
git config user.name  "<your name>"
git config user.email "206886372+mradul-08@users.noreply.github.com"   # confirm the account first (§0.4)
git config user.email                                                   # must print the no-reply address

# 2. Stage everything that is not ignored
git add -A

# 3. Review what is staged (see the checklist in §9)
git status --short | head -50
git ls-files | wc -l                      # expect 208 (exact list in §0.6)
git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'   # expect NO output
git ls-files | grep -E '(^|/)(node_modules|dist)/'                     # expect NO output
git ls-files | grep -Ei '\.(pem|key|p12|pfx|bson|bak|sql)$|serviceaccount|adminsdk|id_rsa'  # expect NO output

# 4. Secret-pattern scan of the staged content (expect only the known test fixtures, §2)
git grep --cached -nE 'gsk_[A-Za-z0-9]{20,}|csk-[a-z0-9]{20,}|sk-or-v1-|cfut_[A-Za-z0-9]{20,}|rzp_(test|live)_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|mongodb(\+srv)?://[^ ]*:[^ @]{6,}@[a-z0-9.-]*mongodb\.net'

# 5. Exact cross-check: no real .env value is staged (prints only names, never values)
node -e '
const fs=require("fs"),cp=require("child_process");
const staged=cp.execSync("git ls-files",{encoding:"utf8"}).split("\n").filter(Boolean);
let hits=0;
for (const ef of ["server/.env","client/.env","client/.env.local"]) { if(!fs.existsSync(ef)) continue;
  for (const l of fs.readFileSync(ef,"utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*["\x27]?(.*?)["\x27]?\s*$/); if(!m) continue;
    const vals=[m[2],...((m[2].match(/:\/\/[^:]+:([^@]+)@/)||[]).slice(1))].filter(v=>v&&v.length>=12&&!/^https?:/.test(v)&&!/^(genwebai-dca16|350304621044)/.test(v)&&!/firebase(app\.com|storage\.app)$/.test(v));
    for (const f of staged) { const t=fs.readFileSync(f,"latin1"); for (const v of vals) if (t.includes(v)) { console.log("STAGED SECRET:", ef+":"+m[1], "in", f); hits++ } } } }
console.log(hits ? "STOP: remove these files from the index" : "OK: no .env value is staged");'

# 6. First commit
git commit -m "GenWeb.ai 2.0: initial import (v2 code, R0 corrections, docs, benchmarks)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

# 7. Create the EMPTY private repository on github.com (New repository → name GenWeb.ai-2.0 →
#    Private → no README / .gitignore / licence), then:
git remote add origin https://github.com/<github-username>/GenWeb.ai-2.0.git
git push -u origin main
```

**If something wrong was staged *before* committing:**
- remove it from the index with `git rm --cached <path>`;
- fix `.gitignore`;
- repeat step 3.

**If a secret was committed but *not pushed*:**
- delete the local `.git` folder and start again from step 1. Nothing has left the machine.

**If a secret was *pushed*:**
- treat the secret as leaked and **rotate it**;
- delete and recreate the repository, or rewrite its history.
- Private repositories are not a safe place for secrets.

## 9. Final staged-file review checklist (before `git commit`, and again before `git push`)

| # | Check | Expected |
| --- | --- | --- |
| 1 | OneDrive sync paused, or project moved | yes |
| 2 | Hardened `.gitignore` + `.gitattributes` present | yes (applied §0.1) |
| 3 | `git ls-files \| wc -l` | **208**, matching the list in §0.6 |
| 4 | No `.env`, `.env.local` or `.env.*` other than the two `.env.example` | no output |
| 5 | No `node_modules/`, `dist/` | no output |
| 6 | No key, certificate, dump, backup or service-account files | no output |
| 7 | Secret-pattern scan (step 4) | only the known test fixtures |
| 8 | Exact `.env` cross-check (step 5) | "OK: no .env value is staged" |
| 9 | Both `.env.example` files contain no real values | placeholders only |
| 10 | Author e-mail is the intended one (`git config user.email`, repository-local) | `206886372+mradul-08@users.noreply.github.com` (after confirming §0.4); **not** the personal global address |
| 11 | Spot-check `git diff --cached --stat` for anything unexpected (e.g. personal files) | none |
| 12 | GitHub repository is **Private** and **empty** before the push | yes |
| 13 | After the push: on github.com, `server/.env`, `client/.env`, `client/.env.local` are **absent**; the file count matches | yes |
| 14 | Render / Vercel GitHub Apps (later) scoped to this one repository | yes |

## 10. Remaining items not addressed by this step

- **Credential rotation:** O1–O4 pending (most urgent if the v1 repository is public).
- **Owner actions:** O5–O10 pending.
- **Staging:** deployment and E2E pending; they need separate approval.
- **This step itself:**
  - the hardened `.gitignore` and the optional `.gitattributes` need your approval;
  - so do the repository creation and the push.

**Stopping here. No git repository has been created, and nothing has been committed or pushed.**
