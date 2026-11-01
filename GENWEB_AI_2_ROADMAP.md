# GenWeb.ai 2.0: Phased Roadmap

*Proposal for review, 2026-11-01. **No phase has started.** Each phase needs explicit approval, ends with a verification report, and stops for review. "Priority 3" from the earlier plan is not started; this roadmap replaces that label with R-phases.*

**Global rules for every phase**

- **Scope:** work only in `websiteBuilder-v2`. Never touch `websiteBuilder`.
- **Money:** ₹0 model budget; free tiers only; no paid fallback.
- **Data:** no production DB or deploy without separate approval. Migrations run on a backup first.
- **Dependencies:** none added unless approved. Each one is listed as a **decision** below.
- **Compatibility:** existing endpoints and single-HTML projects keep working. All 157 existing tests must stay green.
- **Reporting:** verified / partial / untested, with real numbers only.

## Phase overview

| Phase | Theme | User value | Difficulty | Depends on |
| --- | --- | --- | --- | --- |
| **R0** | Launch blockers (from Priority 2) | Safe to go live | Low–Med | — |
| **R1** | Server versions, immutable releases, rollback | Never lose work; live site stable | Medium | R0 (for deploy only) |
| **R2** | Multi-file static project engine + migration | Real multi-page sites | High | R1 |
| **R3** | Workspace: explorer, editor, diffs, visual select | Control and understanding | Medium | R2 |
| **R4** | Quality engine + self-tests + traceability + plan mode | Trustworthy changes | High | R1 (R2 for multi-file) |
| **R5** | Ownership: ZIP export, GitHub push | No lock-in | Medium | R2 |
| **R6** | React + Vite projects | Developer audience | High | R2, R3; dependency decision |
| **R7** | Data features (forms, collections, BYO backend) | Functional apps | High | R2, R4 |
| **R8** | Collaboration (members, comments, review links) | Agencies, teams | Medium | R1, R3 |

**Recommended order:** R0 → R1 → R4 (single-file first) → R2 → R3 → R5 → R7 → R6 → R8.

R1 and R4 deliver the differentiators ("verified, reversible changes") on the code we already have, before the large R2 refactor.

---

## R0: Launch blockers (carry-over, no new features)

- **Features:**
  - rotate all secrets (they are in git history);
  - staging environment (separate Atlas DB + Render service);
  - Razorpay webhook configured on staging (test keys);
  - confirm provider terms for multiple Groq keys, or reduce to one;
  - remove dead provider accounts.
- **Files:** `server/.env.example`, docs only. Config is done in dashboards.
- **DB changes:** none.
- **Security:** key rotation; webhook secret.
- **Tests:**
  - full suite against staging;
  - a real Razorpay test-mode webhook delivery;
  - verified-email and Google login E2E (both untested today).
- **Risks:** a provider's terms forbid multiple accounts, leaving us with less capacity.
- **Acceptance:** all Priority 2 blockers closed; a webhook delivered and credited exactly once on staging.
- **Rollback:** n/a (configuration).

## R1: Versions, releases, rollback (single-HTML)

- **Features:**
  - a server-side version for every change (generate, AI edit, manual save, restore);
  - version timeline;
  - named checkpoints;
  - restore (which creates a new version);
  - immutable publish;
  - rollback of the live site;
  - soft delete with a 30-day restore;
  - conversation moved out of the project document.
- **Files/modules (new):**
  - `server/models/{blob,projectVersion,release,projectMessage,changeOperation}.model.js`
  - `server/services/versions.js`: `commitVersion`, `restoreVersion`, `gc`
  - `server/services/releases.js`
  - `server/scripts/migrate-projects-v2.js`
  - `client/src/components/VersionTimeline.jsx`
- **Files/modules (changed):**
  - `website.controller.js`: write versions with dual write to `latestCode`; deploy creates a release; `serveDeployedSite` reads the live release, falling back to `latestCode` for unmigrated projects.
  - `Editor.jsx`: undo/redo becomes version navigation.
- **Dependencies:** none (Node `crypto`, `zlib`).
- **DB changes:**
  - **new:** `blobs`, `project_versions`, `releases`, `project_messages`, `change_operations`;
  - **new fields on `websites`:** `headVersion`, `liveRelease`, `schemaVersion`, `deletedAt`.
  - All additive.
- **API contracts (new):**
  - `GET /api/projects/:id/versions?limit=30&before=<seq>` → `[{ id, seq, source, label, pinned, createdAt, summary }]`
  - `GET /api/projects/:id/versions/:vid` → `{ files: [{ path, content }] }`
  - `POST /api/projects/:id/versions/:vid/restore` → `{ version }` (new head)
  - `PATCH /api/projects/:id/versions/:vid` `{ label, pinned }`
  - `POST /api/projects/:id/releases` `{ versionId? }` (default: head) → `{ release, url }`
  - `POST /api/projects/:id/releases/:rid/rollback` → `{ release }`
  - `GET /api/projects/:id/releases`
  - Existing `PUT /:id`, `PATCH /:id/code`, `POST /:id/deploy` keep their responses and add `version: { id, seq }`.
- **Security:** ownership check on every route; version and release IDs are always scoped by project.
- **Tests:**
  - unit: blob dedupe; manifest; retention GC (never deletes pinned or released versions);
  - concurrency: two saves → two versions with ordered `seq` (unique index);
  - migration: idempotent on a v1 fixture; hash equality; deployed project → release;
  - E2E: edit after publish does **not** change `/s/:slug` until republished; rollback restores the old page; undo/redo survives reload.
- **Risks:**
  - storage growth on the free Atlas tier (measure, then tune retention);
  - `seq` race (unique index + retry).
- **Acceptance:**
  - all old tests pass + new ones;
  - the migration dry run on a backup reports 0 mismatches;
  - the live site is stable across edits;
  - rollback in < 1 s.
- **Rollback:**
  - deploy the previous app build; dual write keeps `latestCode` current;
  - the new collections are ignored by the old code.

## R4: Quality engine, self-tests, traceability, plan mode (single-HTML first)

- **Features:**
  - requirement extraction (R-ids);
  - requirement checklist UI;
  - deterministic SEO, accessibility, link and image checks;
  - client-side responsive and runtime-error checks;
  - AI-generated declarative self-tests, run in the preview;
  - targeted repair of failing requirements (max 1);
  - Plan mode (show plan, affected areas and estimated tokens before running);
  - efficiency metrics with phase labels.
- **Files/modules (server):**
  - `server/ai/requirements.js`, `server/ai/testgen.js`, `server/ai/checks/{seo,a11y,links,css}.js`
  - `server/models/{requirement,testResult,generationSession}.model.js`
- **Files/modules (client):**
  - `client/src/utils/selftest-runner.js` (injected into the sandbox)
  - `client/src/components/QualityPanel.jsx`
  - `benchmarks/` script: a ≥ 3-run gate.
- **Dependencies:** none.
- **DB changes:** new `requirements`, `test_results`, `generation_sessions`; `ai_requests` gains `phase`, `sessionId`, `retryCount`, `repairTokens`, `accepted`.
- **API contracts:**
  - `POST /api/projects/:id/plan` `{ prompt }` → `{ plan: { mode, targets, requirementsTouched, estimatedTokens, withinBudget } }`. Costs no credits; uses one small-model call only if ambiguous.
  - `GET /api/projects/:id/requirements`
  - `POST /api/projects/:id/versions/:vid/test-results` `{ results }`: client-reported, marked `runner: "client"`, never trusted for billing.
  - `GET /api/projects/:id/quality?version=` → checks + latest test results.
- **Security:**
  - the test runner executes only whitelisted step types;
  - no `eval`;
  - it runs inside the existing sandbox;
  - results are user-reported (informational only).
- **Tests:**
  - unit tests for each check against fixtures (good and bad pages);
  - interpreter tests (each action, timeouts, missing selector);
  - E2E: generate → tests produced → pass; break a feature via manual edit → test fails → targeted repair fixes it;
  - token-budget test: no more than 1 repair call.
- **Risks:**
  - flaky DOM tests (fixed timeouts, retries = 1);
  - AI writes wrong tests (tests are validated against the generated page once; a test that fails on first generation is regenerated once, then dropped and reported);
  - extra tokens per generation (measured; the gate keeps coverage at least equal).
- **Acceptance:**
  - the benchmark (7 categories × 3 runs) reports coverage, test pass rate and tokens;
  - the extra cost of test generation is reported honestly;
  - zero regressions in existing metrics.
- **Rollback:** feature flag `quality.enabled` in `ai_config`; the new collections are inert when it is off.

## R2: Multi-file static project engine

- **Features:**
  - `static` project kind;
  - multi-page generation (per-file calls within the 8k-token limit);
  - file-level edit planning;
  - multi-file preview assembly;
  - multi-file deploy serving `/s/:slug/*`;
  - lazy and batch migration of single-HTML projects.
- **Files/modules:**
  - `server/ai/project/{outline.js, planFiles.js, fileEdit.js}`
  - generalised `intent.js` / `htmlPatch.js` / `validate.js` / `sanitize.js` (per file)
  - `server/services/projectFiles.js`
  - `client/src/utils/assemblePreview.js`
- **Dependencies:** none.
- **DB changes:** `websites.kind`. Versions already hold manifests (R1).
- **API contracts:**
  - `GET /api/projects/:id/files?version=`
  - `PUT /api/projects/:id/files/*path` `{ content, baseVersion }` → 409 if `baseVersion` ≠ head
  - `DELETE` and `POST …/rename` similarly
  - `POST /api/website/generate` gains `{ kind?: "single_html"|"static" }` (default unchanged)
- **Security:**
  - path validation: no `..`, an allow-list of extensions, normalised separators;
  - per-project size limits;
  - SVG scripts stripped.
- **Tests:**
  - path-traversal tests;
  - preview assembly unit tests;
  - cross-file regression (a renamed CSS class used in another file is flagged);
  - migration of 100% of fixtures;
  - all single-HTML behaviour unchanged (existing suite).
- **Risks:**
  - multi-file generation needs more calls, hence more tokens (measure);
  - cross-file consistency with free models **[ASSUMPTION: may be weaker; mitigate with an outline + deterministic link checks]**.
- **Acceptance:**
  - a 3-page site is generated, edited, previewed and deployed with all links working;
  - single-HTML projects are untouched;
  - tokens per generation are reported.
- **Rollback:** `kind: static` behind a flag; single-HTML remains the default.

## R3: Development workspace

- **Features:**
  - file explorer;
  - per-file editor;
  - line diff per change;
  - side-by-side version compare;
  - visual select → chat context;
  - inline text edit (deterministic, no AI);
  - file locks;
  - Tasks panel (validate, test, check links, export);
  - more device widths.
- **Files/modules:**
  - `client/src/components/workspace/{FileTree,CodePane,DiffView,TasksPanel,SelectOverlay}.jsx`
  - `client/src/utils/diff.js`
  - server: lock flags on the version manifest
- **Dependencies:** **decision needed.** CodeMirror 6 (MIT) vs an improved `<textarea>`. The plan assumes the textarea unless approved.
- **DB changes:** `project_versions.files[].locked`.
- **API contracts:**
  - `GET /api/projects/:id/diff?from=&to=` → `[{ path, hunks }]` (or computed on the client);
  - lock endpoints.
- **Security:** the visual-select script stays in the sandbox; the parent checks the `postMessage` source.
- **Tests:**
  - diff algorithm unit tests;
  - E2E: select element → chat edit changes only that element;
  - a locked file is never modified by AI (server-enforced).
- **Risks:** editor performance on large files with the textarea.
- **Acceptance:** a non-technical user can find and edit an element without the code view **[usability check with real users]**.
- **Rollback:** the workspace is a separate route; the old Editor stays available behind a flag.

## R5: Ownership (export, GitHub)

- **Features:**
  - ZIP export of any version;
  - GitHub push to the user's repo (fine-grained token first, a GitHub App later);
  - push log;
  - deploy guides for user-owned free hosts.
- **Files/modules:**
  - `server/services/zip.js` (in-house store/deflate writer)
  - `server/services/github.js` (REST via built-in `fetch`)
  - `server/models/integration.model.js` (encrypted token)
- **Dependencies:** none.
- **DB changes:** new `integrations { user, provider, encToken, scopes, createdAt }`.
- **API contracts:**
  - `GET /api/projects/:id/export?version=` → `application/zip`
  - `POST /api/integrations/github` `{ token }`
  - `POST /api/projects/:id/github/push` `{ repo, branch, versionId? }` → `{ commitUrl }`
- **Security:**
  - AES-256-GCM token encryption (key from env);
  - the token is never returned;
  - minimal scopes;
  - export limited to the owner.
- **Tests:**
  - the ZIP opens in standard tools (verified with the OS unzip);
  - CRC tests;
  - GitHub push against a test repo (manual, with the owner's approval);
  - encryption round-trip.
- **Risks:** GitHub API rate limits; token leakage (mitigated by encryption and scoping).
- **Acceptance:** exported ZIP runs locally by opening `index.html`; a push creates a commit with the expected tree.
- **Rollback:** a feature flag; stored tokens can be deleted.

## R7: Data features for generated sites

- **Features:**
  - `genweb.data.json` schema;
  - forms (contact, waitlist);
  - BYO Supabase/Firebase adapter (generated client code + rules/SQL for the user to apply);
  - optional GenWeb Data API (owner decision);
  - permission tests ("user B cannot read A's rows").
- **Files/modules:** `server/ai/data/{schema.js, adapters/supabase.js, adapters/firebase.js}`; optional `server/routes/data.routes.js`.
- **Dependencies:** none server-side. The generated *projects* reference provider SDKs from a CDN.
- **DB changes:** only if the GenWeb Data API is approved: `data_records { project, collection, doc, createdAt }`, with a project-level quota.
- **Security:**
  - no secrets in client files (scanner);
  - row-level rules generated and tested;
  - spam protection on forms (honeypot + per-IP limit);
  - the GenWeb Data API is CORS-limited to the project's release origin.
- **Risks:**
  - hosting user data creates legal and privacy obligations (owner decision);
  - free-tier backends change their terms;
  - free models generating insecure rules **[mitigated by deterministic rule tests]**.
- **Acceptance:** a waitlist site stores entries in the user's own Supabase project, and the permission tests pass.
- **Rollback:** a flag; generated code is plain files the user owns.

## R6: React + Vite projects

- **Features:** `react_vite` kind; in-browser preview; Vite-ready export.
- **Dependencies:** **decision needed.** `esbuild-wasm` (MIT) + an ESM CDN, or the no-bundler import-map approach.
- **Files/modules:** `client/src/workers/bundler.worker.js`, `server/ai/project/react.js`.
- **Risks:**
  - preview fidelity;
  - CDN availability;
  - token cost of component-heavy projects.
- **Acceptance:** exported projects pass `npm install && npm run build` locally; the preview matches the build.
- **Rollback:** the project kind sits behind a flag.

## R8: Collaboration

- **Features:**
  - `project_members` (owner / editor / viewer);
  - comments on elements or versions;
  - share-for-review links (read-only preview);
  - optimistic concurrency (`baseVersion` → 409 → merge prompt).
- **Dependencies:** none (polling, no websockets at first).
- **Security:** the role check replaces the owner-only check in `loadOwnProject`; audit log.
- **Acceptance:** two users editing the same project never silently overwrite each other.
- **Rollback:** a flag; membership rows are inert.

---

## Decisions needed before the phases they block

| Decision | Blocks | Options |
| --- | --- | --- |
| Atlas tier / storage budget | R1 at scale | Stay on M0 with tight retention, or upgrade (cost) |
| Code editor library | R3 | `<textarea>` (default) / CodeMirror 6 |
| Bundler | R6 | `esbuild-wasm` / import maps only |
| GenWeb Data API | R7 | BYO only / also hosted (privacy obligations) |
| Credit pricing per change | R4 | Flat 50 (today) / scaled by measured tokens |
| Provider multi-account terms | R0 | Confirm with providers / reduce to one account each |
