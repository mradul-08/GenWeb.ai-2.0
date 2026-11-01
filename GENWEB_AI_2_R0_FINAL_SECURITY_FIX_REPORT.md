# GenWeb.ai 2.0: R0 Final Security Fix Report (F-D2-1, F-D4-1)

> **Latest status (2026-11-01).**
> - This report is current for code work; no further code changes have been made since.
> - Consolidated R0 status: `GENWEB_AI_2_R0_FINAL_STATUS.md`.

*2026-11-01. Scope: only the two approved corrections, inside `websiteBuilder-v2`. F-D3-1 is deferred (§5). Not done: no dependency installed, no env file changed, no credential touched, no database connection, no external account change, no git repository created or pushed, no deployment, no AI provider call. **R0 is not complete** (§7).*

## 1. Summary

| Fix | Result |
| --- | --- |
| **F-D2-1** Firebase env exposure | Each Firebase variable is read by **static property access**; the whole `import.meta.env` is never passed. A production build test proves that unused variables and simulated Vercel system secrets are **absent** from the generated assets. The test fails against the old code (mutation check). |
| **F-D4-1** Production DB host bypass | Hosts are **canonicalised** (case, port, IPv6 brackets, one trailing DNS dot) before comparison. A URI with any malformed host is **refused (fail closed)**. A parity test against the installed MongoDB driver parser checks that the guard never allows a URI whose real hosts differ or include production. |
| Server tests | **184 / 184 pass**: 178 before + 6 new. |
| Client tests | **10 / 10 pass**: 5 before + 5 new; 1 existing assertion updated. |
| Client production build | **Passes.** Assets inspected (§4.3). |

## 2. Files changed

| File | Change |
| --- | --- |
| `client/src/firebase.js` | `readFirebaseConfig({...})` now receives an object built from six explicit `import.meta.env.VITE_FIREBASE_*` reads. A comment explains why the whole object must never be passed. |
| `client/src/firebaseConfig.js` | `findSecretLookingVars` ignores Vercel's own `VITE_VERCEL_*` system variables (`PLATFORM_SYSTEM_PREFIX`). They are present at build time but never bundled; client code may not reference them, which `bundle.test.js` enforces. Detection of user-defined secret-like `VITE_` variables is unchanged. |
| `client/tests/firebaseConfig.test.js` | The "no hardcoded values" test now requires static access for all six variables and forbids `readFirebaseConfig(import.meta.env)`. New test: `VITE_VERCEL_*` system variables are accepted; a user-defined `VITE_MY_TOKEN` is still refused. |
| `client/tests/bundle.test.js` | **New**, 4 tests: a source scan (only allowed, named `import.meta.env` reads), and three real `vite build` runs into a temporary directory (see §4.2). |
| `server/config/dbGuard.js` | New `canonicalHost()`; `databaseHosts()` returns `null` if any host is malformed. `PRODUCTION_DB_HOSTS` entries are canonicalised. A `.suffix` entry also matches the bare domain. Loopback `127.x.x.x` and percent-encoded Unix sockets count as local. Clearer refusal message. |
| `server/tests/dbGuard.test.js` | 6 new tests (§4.1). |

Not changed:
- `server/.env`, `client/.env`, `client/.env.local` (modification times unchanged: 2026-06-15, 2026-11-01 16:33 from D2, and 2026-06-11);
- any dependency, `package.json` or lockfile;
- server application code other than `dbGuard.js`.

## 3. What changed and why

### F-D2-1: Firebase environment variable exposure

- **Before (D2 version):**
  - `readFirebaseConfig(import.meta.env)` made Vite inline the **entire** env object into the bundle, i.e. every `VITE_*` variable present at build time. The earlier `dist` contained `VITE_SERVER_URL`, `VITE_API_URL` and `BASE_URL` keys.
  - Vercel exposes its system variables to Vite builds with a `VITE_` prefix, e.g. `VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_OIDC_TOKEN`. Those would therefore either be bundled or fail the build.
- **After:**
  - Vite statically replaces only the six named reads (and `VITE_API_URL` in `src/config.js`, which was already static).
  - Nothing else from the environment can reach the bundle.
- **Preserved:**
  - **Missing-variable validation:** `readFirebaseConfig` runs both at runtime and in `vite.config.js` on the build environment; tested.
  - **Secret-like detection:** still applies to every user-defined `VITE_` variable; tested.
  - **Project switching without source changes:** tested, §4.2.
- **Why `VITE_VERCEL_*` is exempt:**
  - those variables are created by the hosting platform, not by us;
  - after this fix they are never bundled;
  - `bundle.test.js` fails if client code ever references one.
  - Without the exemption, every Vercel build would fail on `…_BYPASS_SECRET` / `…_OIDC_TOKEN`.

### F-D4-1: MongoDB production host guard bypass

- **Before:** `cluster0.ayk95r2.mongodb.net.` (trailing dot, a valid absolute DNS name that the driver accepts) did not match the suffix `.ayk95r2.mongodb.net`, so it was **allowed** with `APP_ENV=staging` or development + `ALLOW_REMOTE_DB=true`.
- **After:**
  - **Canonical form:** each seed-list host is lower-cased, its port and IPv6 brackets are removed, and **one** trailing dot is removed.
  - **Hostname validation:** after that, the host must be a valid DNS name (labels of `a–z 0–9 - _`, no empty labels), a valid IPv6 address, or a percent-encoded Unix socket path ending in `.sock`.
  - **Fail closed:** anything else makes the URI malformed, and it is refused. That covers credentials that leaked into the host part through unescaped `/ ? # @`, `%`, spaces, `..` and empty seed entries.
  - **Production host list:** `PRODUCTION_DB_HOSTS` entries go through the same canonicalisation, so the case and trailing dot of an entry no longer matter.
- **Compatibility reference:**
  - the installed driver parser `mongodb-connection-string-url` (shipped with the `mongodb` driver) is used in a **test** as the reference;
  - it is not imported by application code, because it is a transitive dependency, not a declared one.
- **Production behaviour:**
  - every well-formed production URI, including dotted, upper-case and seed-list forms, is still **allowed** with `APP_ENV=production`;
  - **behaviour change:** a *malformed* URI is now refused even with `APP_ENV=production`, where it was previously allowed. The driver itself rejects most of these. The two it accepts (`u:p@ss@host` with an unescaped `@`, and a host ending in `..`) are not valid configurations.

## 4. Test evidence (run 2026-11-01)

### 4.1 Server: `npm test`

```
ℹ tests 184   ℹ pass 184   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ duration_ms 32592
```

Per file:

| File | Tests | File | Tests |
| --- | --- | --- | --- |
| ai-api | 21 | patch | 6 |
| auth | 11 | payments (Razorpay) | 17 |
| credits | 8 | prompts | 11 |
| **dbGuard** | **16** (10 + 6 new) | quota | 4 |
| intent | 5 | router | 34 |
| ownership | 6 | runtime | 5 |
| sanitize | 2 | validate | 16 |

**Unchanged and green:** Razorpay (`payments`, 17), authentication (`auth`, 11), credits (`credits`, 8), AI quota (`quota`, 4; `ai-api`, 21; `router`, 34).

**New dbGuard tests:**
1. trailing-dot and equivalent production forms are refused in 5 non-production configurations and allowed with `APP_ENV=production`. Forms covered: dot, upper-case + dot, dot + port, dotted second seed host, bare suffix domain, surrounding whitespace.
2. canonicalisation unit cases;
3. malformed hosts are refused in every environment, production included (9 forms);
4. local forms stay allowed for development/test (`localhost.`, `127.0.0.2`, Unix socket, IPv6 + IPv4 seed list);
5. `PRODUCTION_DB_HOSTS` entries are canonicalised;
6. **driver parity** over a 17-URI corpus:
   - whenever the guard allows a URI in staging, the driver parses it and both report the same hosts;
   - whenever the driver would reach an `ayk95r2` host, the guard refuses.

**Adversarial matrix after the fix** (pure checks, no connection):

| URI (credentials hidden) | unset | dev + `ALLOW_REMOTE_DB` | staging | production | driver |
| --- | --- | --- | --- | --- | --- |
| `cluster0.ayk95r2.mongodb.net` (encoded password) | REFUSE | REFUSE | REFUSE | allow | parses |
| `cluster0.ayk95r2.mongodb.net.` | REFUSE | REFUSE | REFUSE | allow | parses |
| `cluster0-shard-00-00.ayk95r2.mongodb.net.:27017` | REFUSE | REFUSE | REFUSE | allow | parses |
| `CLUSTER0.AYK95R2.MONGODB.NET.` | REFUSE | REFUSE | REFUSE | allow | parses |
| `[::1]` + `…ayk95r2.mongodb.net.:27017` | REFUSE | REFUSE | REFUSE | allow | parses |
| password with unescaped `/` | REFUSE | REFUSE | REFUSE | REFUSE | rejects |
| password with unescaped `@` | REFUSE | REFUSE | REFUSE | REFUSE | parses (host `ss`) |
| `cluster0.ayk95r2.mongodb.net..` | REFUSE | REFUSE | REFUSE | REFUSE | parses |
| `staging.zz11aa.mongodb.net.` | REFUSE | allow | allow | allow | parses |
| `127.0.0.1:27017` | allow | allow | allow | allow | parses |

**Before the fix**, row 2 was **allowed** in staging (see the runbook review, F-D4-1).

### 4.2 Client: `npm test`

```
ℹ tests 10   ℹ pass 10   ℹ fail 0
```

`bundle.test.js` runs real production builds (`vite build`, temporary out-dir, deleted afterwards):

| Test | Build environment | Expected | Result |
| --- | --- | --- | --- |
| Source scan | — | every `import.meta.env` use is a named, allowed property; no whole-object use; no `VITE_VERCEL_*` reads (comments ignored) | pass |
| Build output | all 7 staging values + simulated `VITE_VERCEL_AUTOMATION_BYPASS_SECRET`, `VITE_VERCEL_OIDC_TOKEN`, `VITE_VERCEL_ENV`, `VITE_VERCEL_URL`, unused `VITE_UNUSED_PUBLIC_FLAG`, unused `VITE_SERVER_URL` | build succeeds; all staging values present; production Firebase id `genwebai-dca16` absent; **none** of the six must-not-ship values present; the only `VITE_` names present are the six Firebase names (used in error messages) | pass |
| User-defined secret | staging + `VITE_PAYMENT_SECRET` | build fails naming the variable; out-dir empty | pass |
| Missing variable | staging with `VITE_FIREBASE_APP_ID=""` | build fails: "Missing Firebase configuration: VITE_FIREBASE_APP_ID" | pass |

**Mutation check (proves the test catches the defect):**
1. `src/firebase.js` was temporarily changed back to `readFirebaseConfig(import.meta.env)`.
2. Both the source scan and the build-output test **failed**. The build test failed with `AssertionError: VITE_VERCEL_AUTOMATION_BYPASS_SECRET value was bundled`.
3. The file was restored from a copy and verified byte-identical with `cmp`.

### 4.3 Client production build (`npm run build`) and asset inspection

The build passes, and logs `Firebase project: genwebai-dca16 (mode: production)` from local `.env`. Inspection of `dist/assets/*.js` and `dist/index.html`:

| Searched for | Occurrences | Meaning |
| --- | --- | --- |
| `VITE_SERVER_URL` / `localhost:3002` (unused var / its local value) | 0 / 0 | not bundled |
| `VITE_API_URL` key name | 0 | static replacement, value only |
| `VITE_VERCEL` | 0 | — |
| `BASE_URL:` (marker of an inlined env object) | 0 | no env object |
| `genweb-ai-5o8k.onrender.com` | 1 | the `VITE_API_URL` value, used by the app |
| `genwebai-dca16` | 3 | configured Firebase values (public) |
| `VITE_*` names | the six `VITE_FIREBASE_*` names only | error-message strings, not values |

## 5. Deferred: F-D3-1 (not implemented)

- **Issue.** After 3 transient errors on credential 1, up to 3 minutes of traffic may use credential 2, which is a different account when several are configured.
- **Why deferred:**
  - the provider policy (owner action O2) keeps **one account per provider**, so no second credential exists to fail over to;
  - provider status shows `warning: "multiple_credentials_share_one_quota"` if more than one is ever configured, so a misconfiguration is visible.
- **Revisit if** a second credential per provider is ever configured. Fix: fail over only on `auth` (invalid key).

## 6. Remaining risks

1. **Guard scope.** The guard still matches hostnames only. An IP address or DNS alias of the production cluster is not recognised. Mitigation: no aliases; optionally set `PRODUCTION_DB_HOSTS` on staging.
2. **Atlas suffix assumption.** `DEFAULT_PRODUCTION_DB_HOSTS = .ayk95r2.mongodb.net` assumes the suffix identifies the production Atlas project **[ASSUMPTION]**. Staging must therefore be a separate Atlas project.
3. **`VITE_VERCEL_*` exemption.** It relies on the source-scan test to forbid reading those variables. Anyone adding such a read must update the allow-list in `bundle.test.js` deliberately.
4. **Public variable names in the bundle.** The six Firebase variable *names* appear in the bundle (error messages). Names are not secrets; values other than the configured public ones are absent.
5. **Parity test dependency.** It uses `mongodb-connection-string-url` from `node_modules` (installed with the driver). A future driver upgrade that drops the package would break the test, not the guard.
6. **Unverified hosting behaviour** (unchanged; needs staging):
   - whether Vercel exposes `VITE_VERCEL_*` for this project;
   - which Node version Render really runs (F-D1-1);
   - cross-site cookie behaviour in Safari.
7. **Older docs.** `GENWEB_AI_2_IMPLEMENTATION_STATUS.md` still describes the pre-D3 Cloudflare behaviour, and the corrections report's D2/D4 statements are superseded by this report.

## 7. Final status

| Item | Status |
| --- | --- |
| F-D2-1 | **Fixed and verified** (tests, build, asset inspection, mutation check) |
| F-D4-1 | **Fixed and verified** (tests, adversarial matrix, driver parity) |
| F-D3-1 | **Deferred** (documented) |
| R0 overall | **NOT READY**: owner actions O1–O10 pending; G1 (v2 not in a git repository) open; staging deployment needs separate approval; webhook (B3) and auth E2E (B6) need staging |

**Confirmations:**
- **Original `websiteBuilder` untouched.** `git status --short` still shows only `?? resume/`.
- **No database connection was made.** The guard checks are pure functions, and the server tests use only the in-memory MongoDB.
- **No AI provider was called.** Stubs only.
- **No dependency was installed.**
- **No env file was changed.**
- **No credential, account, repository or deployment was touched.**
- **R1 not started.**
- One stray temp file (`/tmp/x`, a concatenated copy of public build assets) was created by an inspection command and deleted immediately.

**Stopping here. Awaiting approval.**
