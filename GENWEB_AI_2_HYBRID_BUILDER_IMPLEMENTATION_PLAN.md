# GenWeb.ai 2.0 — Hybrid Builder Implementation Plan

*Planning-only companion to `GENWEB_AI_2_HYBRID_BUILDER_BLUEPRINT.md`, updated 2026-11-02.*

This plan maps the proposed hybrid builder onto the current v2 tree. It does not authorize implementation, deployment, database changes, provider calls, package installation, or payment changes.

## 1. Guardrails and readiness

- `[VERIFIED]` Keep `websiteBuilder/` untouched; work only in `websiteBuilder-v2`.
- `[VERIFIED]` R0 is not closed. Owner actions, staging, credential rotation and webhook verification remain prerequisites for production readiness (`GENWEB_AI_2_R0_FINAL_STATUS.md`).
- `[VERIFIED]` Current local baseline: server `267/267` tests pass, client `15/15` tests pass, client lint is clean, and the production build succeeds.
- `[PROPOSED]` Implement behind feature flags and preserve the existing `single_html` path until the multi-file path meets benchmark gates.
- `[BLOCKED]` Do not call the React/Vite generation path until a safe preview/build strategy and dependency policy are approved.

## 2. Phase map

| Phase | Objective | Existing integration points | New modules proposed | Exit criteria |
|---|---|---|---|---|
| R0 closure | Complete security/staging prerequisites | `server/config/dbGuard.js`, `server/middlewares/checkOrigin.js`, R0 runbook | None | Owner actions complete; staging smoke, auth, payment webhook and AI checks pass |
| R1 | Immutable project versions and safe restore | `server/models/website.model.js`, `server/services/versions.js`, `website.controller.js`, `client/src/components/VersionHistory.jsx` | `models/blob.model.js`, `services/projectVersions.js` | Generate, edit, manual save and restore create recoverable versions; legacy data migrates idempotently |
| R4 | Requirement-aware planning and quality checks | `server/ai/plan.js`, `server/ai/validate.js`, `client/src/components/PlanReview.jsx`, `PlanChecklist.jsx` | `server/ai/requirements.js`, `server/quality/*` | Plan is reviewable, requirements are checked, targeted repairs do not rewrite unrelated files |
| R2 | Classic HTML/CSS/JS multi-file hybrid engine | `server/library/*`, `server/library/assemble.js`, `server/ai/pipeline.js`, `server/controllers/website.controller.js` | `server/ai/project/*`, `services/projectFiles.js`, `models/projectVersion.model.js` | Multi-page generation, link-complete preview, per-file edits, export and deploy pass benchmark gates |
| R3 | Developer workspace | `client/src/pages/Editor.jsx`, `VersionHistory.jsx`, `DesignPanel.jsx` | `components/FileTree.jsx`, `DiagnosticsPanel.jsx`, `components/TaskProgress.jsx` | File-level edits, diagnostics and version-aware save work without breaking beginner flow |
| R5 | Ownership/export | Existing `server/utils/zip.js`, export controller | GitHub adapter only after token/security design approval | Exported site runs from disk; user-controlled GitHub push is explicit and reversible |
| R6 | Advanced React + Vite mode | Shared planner/router; client preview utilities | `server/ai/frameworks/reactVite/*`, isolated build worker/adapter | Three representative React apps build and preview in isolation |
| R7/R8 | Data features and collaboration | Existing auth/credits/ownership patterns | Separate project data API and membership model | Deferred until core project model and quota policy are proven |

## 3. R1 implementation sequence

1. Add additive version/blob schemas; do not remove `latestCode` or `conversation`.
2. Store a manifest of normalized file paths and content-addressed blobs.
3. Add one project-authorization helper used by every new endpoint.
4. Add lazy migration on read, guarded by a null `headVersion` filter and a transaction.
5. Dual-write `latestCode` for old routes until migration is complete.
6. Convert generation, AI edit, manual save, restore and deploy to explicit version records.
7. Keep restore as a new version; never rewrite history.
8. Add ownership, concurrency, rollback, idempotency and storage-size tests before UI changes.

Rollback is the previous application version. The old path continues to read `latestCode`; dual-write prevents data loss.

## 4. R2 generation orchestration

`POST /api/website/generate` should eventually become a bounded job with these phases:

1. `analyze`: normalize the prompt into requirements.
2. `plan`: produce pages, sections, design tokens, interactions and a manifest.
3. `match`: score starters and section variants using metadata only.
4. `retrieve`: load only selected component/interaction source.
5. `generate`: run dependency-ordered file tasks and checkpoint accepted files.
6. `integrate`: resolve paths, imports, links, tokens and assets.
7. `validate`: run deterministic checks and isolated build/runtime checks where available.
8. `repair`: patch only the affected file/dependency group with a hard retry budget.
9. `commit`: create one coherent project version and return the plan/checklist.

The current `server/ai/router.js`, `keyPool.js`, `quota.js`, `usage.js` and `catalog.js` remain the provider boundary. Orchestration must preserve free-only enforcement, provider terms, daily quota reservation and credit-ledger behavior.

## 5. File and data model proposal

`websites` remains the compatibility project record. Add fields additively:

```js
{
  kind: "single_html" | "static" | "react_vite",
  headVersion,
  liveRelease: null,
  schemaVersion: 2,
  memorySummary: { purpose, framework, design, decisions, knownIssues, updatedAt }
}
```

`project_versions` stores `{ project, parent, seq, source, files, manifestHash, createdBy, createdAt }`; `blobs` stores compressed content by SHA-256. Start with MongoDB because the current product already uses Mongoose and free-tier constraints discourage a new storage service. Reassess object storage only after measuring Atlas growth.

## 6. Frontend rollout

- Reuse `Editor.jsx`, `VersionHistory.jsx`, `DesignPanel.jsx`, `PlanReview.jsx` and `PlanChecklist.jsx`.
- Add file explorer and diagnostics as progressive panels, not a replacement workspace.
- Keep beginner mode focused on prompt, plan, preview and publish.
- Expose file-level controls only in Advanced mode.
- Retain route-level lazy loading and measure route chunk performance after each UI phase.

## 7. Testing and security gates

Every phase requires unit tests, ownership tests and a rollback path. Multi-file phases additionally require path-traversal rejection, import/link resolution, cross-page edit isolation, concurrent-save behavior, sandbox origin isolation, bounded repair loops, and proof that failed/retried generation cannot double-charge credits.

## 8. Explicit non-goals for MVP

`[DEFERRED]` Arbitrary backend code execution, custom domains, collaboration, automatic GitHub pull, unrestricted dependency installation, production-scale job queues, and automatic paid AI fallback require separate security, cost and ownership decisions.
