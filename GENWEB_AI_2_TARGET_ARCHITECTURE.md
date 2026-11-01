# GenWeb.ai 2.0: Target Architecture

*Proposal for review, 2026-11-01. Labels: **[VERIFIED]** = in `websiteBuilder-v2` today (checked in code on 2026-11-01); **[PROPOSED]** = design; **[ASSUMPTION]** = unmeasured belief. Nothing here is implemented by this document.*

---

## 0. Current-system audit (re-verified from code, not from the old audit)

### 0.1 Architecture and entry points **[VERIFIED]**

| Layer | Facts from code |
| --- | --- |
| Server boot | `server/index.js`: connect DB → `ensureIndexes()` → listen; graceful SIGTERM. |
| HTTP app | `server/app.js`:<br>• Razorpay webhook route with a raw body (1 MB), mounted **before** `express.json({ limit: "2mb" })`<br>• `/health`<br>• `/api` with a rate limiter and `checkOrigin` CSRF guard<br>• routers: auth, user, website, payment, admin<br>• JSON error handler<br>• `/s/:slug` public deploy route |
| Website API | `routes/website.routes.js`:<br>• `POST /generate`, `POST /enhance-prompt`<br>• `GET /`, `GET /:id`<br>• `PUT /:id` (AI edit)<br>• `PATCH /:id/code` (direct save; no AI, no credits)<br>• `DELETE /:id` (hard delete)<br>• `POST /:id/deploy`, `POST /:id/undeploy`<br>• `GET /status`<br>• Per-user limiters: AI 20 per 10 min; enhance 30 per 10 min; save 60 per min |
| Client | React 19 + Vite 8 + Redux Toolkit. Pages: Home, Pricing, Dashboard, Generate, Editor. Mostly inline styles; Tailwind is installed but largely unused. |

### 0.2 Generation and edit pipelines **[VERIFIED]**

- **`generateSite`:**
  1. `chooseStrategy` (auto = single);
  2. optional design brief (cached for 30 min);
  3. `runDocumentTask` (≤ 2 attempts), which runs `finalizeDocument`: extract, validate, deterministic repair, script-only repair, image sanitizer.
- **`editSite`:**
  1. `planEdit` picks one mode: `style_append` / `text_replace` / `section_patch` / `section_add` / `style_script_patch` / `full`;
  2. a small prompt runs on the extracted fragment (`maxTokens` 800 / 2000 / 6000);
  3. `patchHTML` + sanitizer, then `comparePatch` regression check;
  4. if the check fails, fall back to a full rewrite;
  5. the full rewrite is rejected if it lost scripts, sections or content.
- **Controllers:**
  1. reserve the daily slot, then reserve credits (transaction);
  2. run the AI;
  3. on failure, refund + release (exactly once, tested).
  - Success writes `latestCode` and pushes 2 messages into the embedded `conversation`.

### 0.3 AI adapters and routing **[VERIFIED]**

- `catalog.js`:
  - free-only models;
  - `quotaScope` defaults to `"provider"` (all keys share one quota);
  - locked models carry a `lockedReason`.
- **Working:**
  - `groq/gpt-oss-120b`, `groq/gpt-oss-20b`, `groq/qwen3.8-27b`;
  - `zhipu/glm-4.5-flash`;
  - `cloudflare/llama-3.3-70b`.
- **Locked:** Mistral, SambaNova, OpenRouter.
- **Router:**
  - `candidateOrder` by task priority;
  - key-pool cooldowns;
  - error classification;
  - capacity / neutral / transient outcome classes;
  - `assertFree` guard.
- **Tracking:** `ai_calls` (one row per attempt, tokens), `ai_requests` (one row per user action, totals, mode, validation).

### 0.4 Data model **[VERIFIED]**

| Collection | Shape | Issues for 2.0 |
| --- | --- | --- |
| `websites` | `user`, `title`, `latestCode` (≤ 1.5 MB), embedded `conversation[]`, `deployed`, `deployUrl`, `slug` (unique), thumbnail fields, timestamps | One file only. Conversation grows without bound inside the document (16 MB limit). No versions. Deploy reads the **live** `latestCode`. |
| `users` | `credits`, `role`, `tokenVersion`, `firebaseUid`, `ledgerOpenedAt`, purchase totals | Fine. |
| `credit_transactions`, `payments` | Ledger with unique `idempotencyKey`; Razorpay orders | Fine; reuse. |
| `ai_calls`, `ai_requests`, `ai_counters`, `ai_cache`, `ai_config` | Tracking, quotas, cache, admin config | Extend `ai_requests` with phases; see §H. |

### 0.5 Editor, preview, save, history, deploy **[VERIFIED]**

- Preview: `srcDoc` iframe, sandbox without `allow-same-origin`; desktop / tablet (768 px) / mobile (375 px) widths.
- Code view: a `<textarea>` over the full HTML.
- Undo/redo:
  - a client-side ref holding the last **20** states;
  - each state change is persisted through `PATCH /:id/code`, but only as the *current* code;
  - history is lost on reload.
- Deploy:
  - optionally saves the posted code first, then sets `deployed = true`;
  - `/s/:slug` serves `latestCode` with a storage shim, a "Built with GenWeb.ai" ribbon and a CSP sandbox.
  - **Consequence: every later save or AI edit changes the live site immediately.** There is no release snapshot and no rollback.

### 0.6 Validation and tests **[VERIFIED]**

- 157 server tests (`node --test`, `mongodb-memory-server`, `supertest`). They cover auth, ownership, payments, credits, patching, intent, prompts, router, AI API, validation, quota and sanitizer.
- No client unit tests.
- Browser E2E exists only as scratchpad scripts, outside the repo.

### 0.7 Reuse vs evolve

| Component | Decision | Note |
| --- | --- | --- |
| Credits ledger, payments, webhook, auth, `tokenVersion`, ownership checks | **Reuse as-is** | Tested. |
| AI catalog / router / quota / usage / key pool | **Reuse, extend** | Add task types (plan, test-gen, file-edit). Add per-phase usage. |
| `intent.js` / `htmlPatch.js` / `validate.js` / `sanitize.js` | **Reuse, generalise** | Today they work on one HTML string; make them per-file operations. |
| `prompts.js` | **Extend** | Add multi-file and test-generation prompts. |
| `websites` collection | **Evolve** | Becomes the project header; files and versions move out (see §G). |
| Embedded `conversation[]` | **Replace** | Separate `project_messages` collection. |
| Client undo/redo | **Replace** | With server versions. Keep the keyboard shortcuts. |
| Deploy-by-flag | **Replace** | With immutable releases. |
| Process-local router state | **Keep for single instance** | Move to a shared store only when scaling (documented as not ready). |

---

## A. AI orchestration **[PROPOSED]**

```
user request
   │
   ▼
1. Intake (deterministic): normalise, detect language, classify
   (generate | edit | question | fix | test)
   │
   ▼
2. Requirement extraction: cheap model or rules → requirements[]
   with ids R1..Rn. Cached by hash.
   │
   ▼
3. Planner: deterministic first, AI only if ambiguous
   ├─ which files / sections are affected (impact engine, §E.3)
   ├─ the cheapest safe strategy (patch | file rewrite | multi-file)
   └─ budget estimate (tokens, calls) vs user daily cap + provider headroom
   │
   ▼
4. Executor: per-file tasks through the existing router (free models
   only). Small context: only the target files + an outline of the rest.
   │
   ▼
5. Quality gate (§E): validate → deterministic repair → targeted AI repair
   (max 1) → browser self-test (client)
   │
   ▼
6. Commit: new version + change record + requirement links + usage row
```

**Rules**

1. **Deterministic before AI.** Use rules wherever they are proven equal: text replace, colour change, file rename, link fixes, formatting.
2. **Smallest context.** Send the target fragment or file plus a compact *project outline*: file list, exported IDs/classes, design tokens. Do not send the whole project.
3. **Bounded retries.** At most 2 generation attempts and 1 targeted repair per change. More than that is a failure shown to the user, not a silent loop that spends tokens.
4. **Budget-aware routing** (innovation 4). Before a call, compare the estimated tokens with:
   - the model's per-request limit (e.g. Groq 8000 tokens/request **[VERIFIED in catalog]**);
   - the user's remaining daily requests;
   - each provider's remaining daily cap.
   If the work does not fit, split it into per-file steps or ask the user to narrow the change. Never upgrade to a paid model.
5. **Model selection by task.**
   - Short tasks (requirements, plans, test specs) → small, fast models (`gpt-oss-20b`).
   - Code → strongest free model available (`gpt-oss-120b`, `glm-4.5-flash`, `llama-3.3-70b`).
   - Local models (e.g. Ollama) are an optional *developer/self-host* adapter only, never a production dependency **[ASSUMPTION: no Ollama adapter exists today]**.
6. **Prompt-injection hygiene.** Keep the existing triple-quote delimiter escaping **[VERIFIED by test]**. File contents count as data. AI output is validated before it is stored.

**New router task types:** `requirements`, `plan`, `file_edit`, `file_create`, `test_gen`, `repair`. All tasks still go through `assertFree`.

## B. Multi-file project engine **[PROPOSED]**

### B.1 Project kinds

| Kind | Files | Preview | Status |
| --- | --- | --- | --- |
| `single_html` | `index.html` only | `srcDoc` (as today) | All existing projects |
| `static` | `*.html`, `css/*.css`, `js/*.js`, `assets/*` | Assembled in the iframe (B.4) | Phase R2 |
| `react_vite` | `src/**/*.jsx`, `index.html`, `package.json` | In-browser bundle (B.6) | Phase R6 (dependency decision) |

### B.2 File storage

- **Content-addressed blobs:** `blobs { _id: sha256, size, gz: Binary }`, compressed with Node's built-in `zlib`, so no new dependency.
- **A version** is an immutable manifest `{ path → blobId }`.
  - Unchanged files cost nothing extra.
  - A single-HTML edit still creates a full new blob; compression offsets this **[ASSUMPTION: typical 4–6× gzip ratio on generated HTML; measure]**.
- **Limits:**
  - per file ≤ 1.5 MB (as today);
  - per project ≤ 5 MB **[PROPOSED]**;
  - binary assets ≤ 1 MB each and ≤ 10 MB per project.
  - Larger assets are a later object-storage decision (see §G.4 storage sizing).

### B.3 Backward compatibility

- A `single_html` project is a project with one file, `index.html`.
- **During the transition** the `websites.latestCode` field stays populated: writes go to both the old field and the new store. This means:
  - old clients keep working;
  - the old deploy route keeps working;
  - rolling back the code release is safe.
- All existing endpoints keep their contracts. New endpoints sit under `/api/projects/:id/...`.

### B.4 Static multi-file preview (no new dependency)

The client builds one document for `srcDoc`:
1. Inline local `<link rel=stylesheet href="css/x.css">` as `<style>`.
2. Inline local `<script src="js/x.js">`.
3. Rewrite asset URLs to `data:` URLs (small assets) or `blob:` URLs.
4. Handle inter-page links (`about.html`) by intercepting clicks with a small injected script that asks the parent (`postMessage`) to switch pages.

The sandbox stays the same: no `allow-same-origin`.

### B.5 Edit operations as data

Every change is a list of operations:

```
{ op: "create" | "update" | "delete" | "rename",
  path, newPath?, patch?: { mode, section?, before?, after? },
  blobBefore?, blobAfter? }
```

This record powers diffs, impact analysis, traceability and replay.

### B.6 React + Vite (later, gated)

- **Option 1:** `esbuild-wasm` (MIT), lazy-loaded in a Web Worker. npm imports resolve to a CDN that serves ESM (e.g. esm.sh), whitelisted by package name.
  - **Needs approval:** it is a new client dependency, and it creates a third-party CDN dependency at preview time.
- **Option 2 (no dependency):**
  - generate React projects that use only browser-native ES modules + import maps;
  - preview without a bundler;
  - export a Vite-ready `package.json`.
  - Lower fidelity, zero dependencies.
- **Rejected:** WebContainers (commercial licence) and server-side builds (compute cost).

## C. Development workspace **[PROPOSED]**

| Panel | Design | Dependency |
| --- | --- | --- |
| File explorer | Tree from the version manifest; create, rename, delete; lock a file (excluded from AI edits). | none |
| Code editor | **Default:** improved `<textarea>`: line numbers, tab key, find, per-file. **Option:** CodeMirror 6. | CodeMirror = new dependency, needs approval |
| Terminal | **Not a shell.** A "Tasks" panel of deterministic, token-free actions: Validate, Run self-tests, Check links/images, Format, Export ZIP. | none |
| Preview | Existing sandboxed iframe + page switcher + device widths (320 / 375 / 768 / 1024 / 1366). | none |
| Visual select | An injected script in the preview highlights elements on hover. A click sends `{ selector, outerHTML excerpt, file, line }` to the parent → chat context ("change *this*"). Inline text edit becomes a deterministic `text_replace` operation (no AI). | none |
| Chat edits | Existing chat. The plan card shows the affected files and estimated tokens before running (Plan mode). | none |
| History and diffs | Version timeline: auto versions, named checkpoints, releases. Per-change diff (line diff written in-house, about 100 lines, Myers or patience algorithm). Restore = new version. | none |

## D. Full-stack generation **[PROPOSED; staged; ₹0-constrained]**

The constraint: we cannot host a database, server and auth for every generated app for free. The design is therefore **adapter-based and user-owned**.

| Layer | Approach |
| --- | --- |
| Frontend | As B. |
| Backend / APIs | **Tier 1:** none (static sites, ~most current use **[ASSUMPTION]**). **Tier 2:** serverless function files generated for the user's own platform (e.g. Supabase Edge Functions or Firebase Functions on *their* free tier), deployed by the user. **Tier 3 (optional, owner decision):** a tiny *GenWeb Data API* on our Express + Atlas. It is limited to forms and simple JSON collections, with strict per-project quotas, no arbitrary code execution, and every row scoped by project ID. |
| DB schema | AI generates a declarative schema file (`genweb.data.json`: collections, fields, types, rules). Adapters turn it into Supabase SQL plus row-level security, Firebase rules, or GenWeb Data API collections. |
| Auth and permissions | Generated client code uses the provider SDK of the *user's* backend (Supabase Auth / Firebase Auth). The permission rules come from the schema file and are checked by deterministic tests ("user B cannot read user A's rows"). |
| Storage | The user's provider. GenWeb only stores project assets within the B.2 limits. |
| Integrations | Templates (payments link, maps embed, forms-to-email) that need no secrets in client code. |
| Secure environment | Secrets are **never** stored in generated client files. A per-project `env` holds names only, plus encrypted values for server-side adapters, using AES-256-GCM via Node `crypto` (no dependency) with a key from the server env. A scanner blocks secrets that look real (`sk_live_…`, private keys) in client files. |

## E. Quality engine **[PROPOSED; builds on VERIFIED validators]**

| Check | Where it runs | Cost | Exists today? |
| --- | --- | --- | --- |
| HTML structure, `<html>`/`<body>`, balanced sections | server | ₹0, deterministic | **Yes** (`validateDocument`) |
| JS syntax | server (`vm.Script` compile only, no execution) | ₹0 | **Yes** (`brokenScripts`) |
| CSS syntax (brace balance, unknown at-rules) | server | ₹0 | No |
| Broken images / external URLs | server | ₹0 | **Yes** (sanitizer, static HTML only) |
| Broken internal links / missing files | server, against the manifest | ₹0 | No |
| Regression vs previous version (scripts, sections, content lost) | server | ₹0 | **Yes** (`comparePatch`) |
| Responsive: horizontal overflow, text overlap at 375 px | **client**: hidden iframe in the user's browser | ₹0 server | Benchmark tooling only |
| Accessibility basics: alt text, labels, contrast, landmarks, heading order | server (static) + client (computed contrast) | ₹0 | Contrast helper exists for briefs |
| SEO basics: title, meta description, `lang`, one `h1`, viewport | server | ₹0 | No |
| Runtime JS errors | client (`error` events from the preview, sent by `postMessage`) | ₹0 | No |
| **Functional self-tests** (innovation 3) | client: test steps run inside the sandboxed preview | AI tokens only to *generate* the steps (once per requirement) | No |
| Targeted repair | server: only the failing file or section is sent to AI, max 1 attempt | tokens | Script-only repair exists |

### E.1 Self-test format (declarative, no eval of AI code in our origin)

```
{ id: "T3", requirement: "R3", steps: [
    { action: "click", selector: ".back-to-top" },
    { action: "scroll", y: 2000 },
    { expect: "visible", selector: ".back-to-top" },
    { expect: "scrollY", op: "<", value: 10 } ] }
```

- A fixed interpreter is injected into the preview iframe. It executes only these whitelisted actions.
- The tests run in the same sandbox as the page, so there is no new privilege.
- Results return by `postMessage` and are stored with the version.

### E.2 Requirement traceability (innovation 1)

`requirements[]` (R1..Rn) are extracted at generation. Each is linked to:
- **code anchors:** file + selector/section, found deterministically by keyword/DOM search after generation;
- **tests:** T-ids.

The UI shows: requirement → status (present / tested ✓ / failing ✗ / missing).

### E.3 Change impact engine (innovation 2)

Before an edit, a deterministic analysis covers:
- the target files and sections from the planner;
- dependents: which files reference a changed class, ID, function or file;
- the requirements and tests linked to the touched anchors.

It shows "this change may affect: R2 (pricing toggle), T4". After the edit, only the impacted tests re-run, then the rest.

## F. Deployment and ownership **[PROPOSED]**

| Capability | Design |
| --- | --- |
| Immutable releases | `releases { project, versionId, slug, createdAt, createdBy, status }`. `/s/:slug` serves the **release's** files, not the working copy. Publish = create a release. Rollback = point the slug at an older release (instant, no AI). |
| Multi-file serving | `/s/:slug/*path` resolves through the release manifest, keeping the same CSP sandbox, storage shim and ribbon. Cached with an ETag = blob hash. |
| Export | ZIP built server-side with a small in-house *store-only* ZIP writer (CRC32 + headers ≈ 80 lines, no dependency), or `zlib` deflate per entry. Includes a README and `genweb.json` (requirements, tests). |
| GitHub | One-way push to a repo in the **user's** account, using a fine-grained token or a GitHub App the user installs. Commit message = change summary. No auto-pull at first; explicit "import changes" with a diff later. Tokens are encrypted (D. secure env). |
| Deploy adapters | Export-based guides first (Netlify Drop, GitHub Pages, Vercel, all with user-owned free tiers). API adapters later, with the user's token. |
| Environment config | Per-release snapshot of non-secret env names. |
| Logs | `release_events` (publish, rollback, unpublish, quota-limited); per-slug request counts aggregated daily. |
| Custom domains | Not planned for 2.0: it needs TLS and DNS infrastructure, which costs money. Users can attach domains through their own host after export. |

## G. Database schemas and migration **[PROPOSED]**

### G.1 New / changed collections

```js
// projects (evolves `websites`; same collection name kept during transition)
{ _id, user, title, kind: "single_html"|"static"|"react_vite",
  headVersion: ObjectId,           // current working version
  liveRelease: ObjectId|null,
  latestCode: String,              // TRANSITION ONLY: mirror of index.html for old code paths
  slug, deployed, deployUrl,       // kept; deployed ⇔ liveRelease != null after migration
  thumbnail*, schemaVersion: 2, createdAt, updatedAt, deletedAt: Date|null }  // soft delete
// index: { user:1, createdAt:-1 } (exists), { slug:1 } unique (exists)

// blobs — content-addressed, gzip
{ _id: "sha256:<hex>", size, gzSize, data: Binary, createdAt }

// project_versions — immutable
{ _id, project, parent: ObjectId|null, seq: Number,
  files: [{ path, blob, size }],   // manifest
  source: "generate"|"ai_edit"|"manual_save"|"restore"|"migration"|"import",
  label: String|null, pinned: Boolean,          // named checkpoint
  changeId: ObjectId|null, createdBy, createdAt }
// index: { project:1, seq:-1 } unique

// change_operations — one per user-visible change
{ _id, project, fromVersion, toVersion, requestId, prompt,
  ops: [{ op, path, newPath, mode, section }],
  impact: { files:[String], requirements:[String], tests:[String] },
  summary, createdAt }

// project_messages (replaces embedded conversation)
{ _id, project, role: "user"|"ai"|"system", content, changeId, createdAt }
// index: { project:1, createdAt:1 }

// generation_sessions — one per generate/edit run (links tracking)
{ _id, requestId, project, task, strategy, phases: [{ name, calls, inputTokens, outputTokens, ms, outcome }],
  outcome, toVersion, createdAt }

// requirements
{ _id, project, rid: "R3", text, source: "prompt"|"user"|"edit", status: "active"|"removed",
  anchors: [{ path, selector, section }], tests: ["T3"], createdAt, updatedAt }

// test_results
{ _id, project, version, runner: "client"|"server", results: [{ tid, rid, passed, error, ms }],
  checks: { a11y:[...], seo:[...], links:[...], responsive:[...] }, createdAt }

// releases
{ _id, project, version, slug, status: "live"|"superseded"|"rolled_back", createdBy, createdAt }

// ai_requests — extended (existing collection)
{ ...existing, sessionId, phase, accepted: Boolean|null, repairTokens, retryCount }
```

### G.2 Retention (to fit free Atlas storage)

- Keep all pinned versions, all versions referenced by releases, and the last 30 auto versions per project.
- Prune older auto versions. A daily job garbage-collects unreferenced blobs, using mark-and-sweep with a 24 h grace period.

**[ASSUMPTION]** Atlas M0 (512 MB) cannot hold full history for many users. Storage will need measuring after R1, and the cluster tier must be decided before public launch. This is a cost the owner must approve.

### G.3 Migration from single-HTML (no data loss)

1. **Additive deploy.** New collections and fields only. Old fields stay. `schemaVersion` is absent on old docs.
2. **Lazy migration on read.** When a v1 project (no `headVersion`) is opened or edited:
   - create a blob from `latestCode`;
   - create version `seq 1` with `source: "migration"`;
   - if deployed, create a release for it;
   - set `headVersion` / `liveRelease`;
   - copy the `conversation[]` into `project_messages`, **without deleting** the embedded array.
   - Everything runs in one transaction (Atlas replica set **[VERIFIED requirement]**). The step is idempotent: guarded by `headVersion: null` in the filter.
3. **Background batch script** (`scripts/migrate-projects-v2.js`):
   - same function, in batches;
   - `--dry-run` by default;
   - reports counts and hash checks (`sha256(latestCode) === blob._id`).
   - **Run on a backup first**, the same discipline as the ledger migration.
4. **Dual write.** Until cut-over, every new version also updates `latestCode` (index.html). This keeps the old client, the old deploy route and the old code rollback working.
5. **Cut-over:** stop reading `latestCode` once 100% of projects are migrated and verified. Remove the embedded conversation only in a later, separate release, after a backup.
6. **Rollback:** the old code ignores the new collections and keeps working on `latestCode`. Because of dual write, nothing is lost by rolling back the application release.

### G.4 Storage sizing (to verify)

| Item | Estimate | Basis |
| --- | --- | --- |
| Average generated page | ~10–15 KB raw | Benchmark outputs: ~2,800 output tokens × ~4 chars **[VERIFIED order of magnitude]** |
| Compressed | ~3–4 KB | **[ASSUMPTION]** |
| 30 versions × 1 file | ~100–120 KB per project | derived |

## H. Token efficiency as a first-class metric **[PROPOSED; builds on VERIFIED tracking]**

### H.1 What we measure

| Metric | Source | Today |
| --- | --- | --- |
| Tokens per generation (in / out, all calls) | `ai_requests` totals | **Recorded [VERIFIED]** |
| Tokens per edit, by mode | `ai_requests.editMode` + totals | **Recorded [VERIFIED]** |
| Tokens per retry / repair | `ai_calls` rows grouped by phase | Rows exist; phase is not labelled |
| Requirement coverage | `requirements` + `test_results` | Benchmark tooling only |
| Functional test success | `test_results` | No |
| Time | `durationMs` | **Recorded [VERIFIED]** |
| Accepted vs rejected change | user keeps, undoes or restores within N minutes | No |
| **Efficiency score** | tokens per *accepted, passing* change | No |

### H.2 Strategy comparison

| Strategy | Measured so far | Notes |
| --- | --- | --- |
| One-call generation | 3,306 tokens avg, 39/39 requirements, 0 broken images, 0 overlaps (7 prompts, 1 run) **[VERIFIED small sample]** | Current default. |
| Multi-stage (brief + generate) | 3,440 tokens, 37/39, 13 broken images (old prompt) **[VERIFIED small sample]** | Worse on this sample; kept as an option. |
| Hybrid **[PROPOSED]** | not measured | One call for the core page → deterministic checks → *targeted* calls only for missing requirements or failing tests. Hypothesis: same tokens on the happy path, fewer than a full retry when something is missing. |
| Multi-file per-file calls **[PROPOSED]** | not measured | Needed when a project exceeds the 8k-token request limit. |

**Benchmark protocol for every strategy change:**
- the same 7+ category prompts, ≥ 3 runs each;
- report the mean and range of tokens, coverage, test pass rate and time;
- a change is accepted only if coverage and test pass rate do not drop.

"Don't sacrifice quality to save tokens" becomes an automated gate in the benchmark script.

## I. Security model **[PROPOSED additions]**

- **All generated code runs only in opaque-origin sandboxes** (editor preview and `/s/:slug` CSP sandbox). Keep this **[VERIFIED today]**.
- The self-test interpreter and visual-select script are injected into the sandbox and talk only via `postMessage`. The parent validates `event.source === iframe.contentWindow`.
- **Project-level authorisation on every new endpoint** through one `loadOwnProject(req)` helper, the same pattern as `findOwnWebsite` **[VERIFIED pattern]**. Future collaboration adds `project_members { project, user, role }`.
- **GitHub / backend tokens:** encrypted at rest; never returned to the client after save; scope-minimal.
- **Upload validation:** magic-byte sniffing for images; SVG sanitised (no scripts) or served only inside the sandbox.
- **Rate limits** are per user and per project. They remain process-local until a shared store exists (documented limitation).

## J. Scaling notes

The router state, provider pauses and rate-limiter buckets are per process **[VERIFIED]**. 2.0 stays single-instance on Render until a shared store (e.g. a Redis free tier, or a MongoDB-backed TTL collection) is approved. A MongoDB-backed limiter is possible with no new dependency, but it adds DB load **[ASSUMPTION; measure]**.
