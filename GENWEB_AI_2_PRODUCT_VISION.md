# GenWeb.ai 2.0: Product Vision

*Status: proposal for review. Written 2026-11-01. Nothing in this document is implemented unless it is labelled **[VERIFIED]**.*

**Labels used in all five blueprint documents**

| Label | Meaning |
| --- | --- |
| **[VERIFIED]** | Exists in `websiteBuilder-v2` today. I checked it in the code (and, where noted, by tests or E2E runs) on 2026-11-01. |
| **[PROPOSED]** | A design for the future. It does not exist. |
| **[ASSUMPTION]** | Something we believe but have not measured or confirmed. It needs validation before we rely on it. |
| **[COMPETITOR-DOC]** | A competitor capability as their official documentation describes it. We have not tested it ourselves. |

Companion documents:
- [COMPETITOR_ANALYSIS](GENWEB_AI_2_COMPETITOR_ANALYSIS.md)
- [TARGET_ARCHITECTURE](GENWEB_AI_2_TARGET_ARCHITECTURE.md)
- [ROADMAP](GENWEB_AI_2_ROADMAP.md)
- [INNOVATION_BACKLOG](GENWEB_AI_2_INNOVATION_BACKLOG.md)

---

## 1. Where GenWeb.ai is today (honest baseline)

**[VERIFIED]** GenWeb.ai today is a **single-file website generator with targeted AI editing**.

| Area | Current state |
| --- | --- |
| Project | One HTML string per project (`websites.latestCode`) plus an embedded chat log (`conversation[]`). |
| Generation | One AI call (`auto` = single strategy, chosen from benchmark data). Then validation, deterministic repair and an image sanitizer. |
| Editing | Intent planner chooses the cheapest safe mode: `style_append`, `text_replace`, `section_patch`, `section_add`, `style_script_patch`, or `full`. Measured output-token savings vs a full rewrite: **−87%** for style edits, **−92%** for body-text edits. |
| AI layer | Free-only model catalog; 3 working providers: Groq, ZhipuAI, Cloudflare Workers AI. Atomic per-user and per-provider daily quotas in MongoDB. Locked providers cannot be enabled. |
| Editor | Chat panel, sandboxed `srcDoc` preview, desktop/tablet/mobile widths, a plain `<textarea>` code view, and undo/redo. Undo/redo history is **client-memory only** (last 20 states); the server keeps only the latest code. |
| Deploy | Sets a flag and serves the project's **current** `latestCode` at `/s/:slug` with a CSP sandbox. There is no release snapshot: any later edit or save changes the live site immediately. |
| Credits / payments | Server-side credit ledger with transactions and idempotency; Razorpay orders and a signed webhook. A new user gets 100 credits; each generation or edit costs 50. |
| Quality evidence | 157 server tests. 7-category benchmark (39/39 requirements met; 0 broken images; 0 mobile overlaps). Browser E2E of generate, edit, undo/redo, save, deploy and quota. |

**Not present today (do not market these):**
- multi-file projects; backend generation; database or auth for *generated* apps;
- GitHub integration; export;
- server-side version history; immutable deploys; rollback;
- diff view; visual editing; terminal;
- automated functional tests of generated sites inside the product;
- collaboration; custom domains.

## 2. Vision statement **[PROPOSED]**

> **GenWeb.ai turns a plain-language idea into a working, tested, owned web project, and keeps it safe as it evolves. It also spends as little free AI capacity as possible to get there.**

Three product principles follow from our real constraints:

1. **Correct before clever.** Every AI change is validated, tested where possible, reversible, and explained. The user should never lose working code to an AI edit.
2. **Frugal by design.** The platform runs on a ₹0 model budget: free-tier models only, no paid fallback. Token efficiency is a first-class product metric, not a cost-cutting afterthought. Cheap deterministic steps (patching, validation, repair, testing) replace AI calls wherever they are as good.
3. **The user owns the result.** Standard files that the user can export, push to GitHub, or host anywhere. No lock-in to our runtime.

## 3. Target audiences

| Audience | Main job to be done | What they need most | What 2.0 offers them **[PROPOSED]** |
| --- | --- | --- | --- |
| **Non-technical founders and beginners** | "Get my idea online and looking credible, fast." | Plain language; no setup; nothing breaks; clear next steps. | Guided generation; requirement checklist ("you asked for X, here it is"); safe undo/rollback; one-click publish; explanations of every change. |
| **Developers** | "Skip the boilerplate, keep control of the code." | Real files; diffs; Git; no black box. | Multi-file projects; code editor; diffs per AI change; GitHub push; export; locked files; change-impact preview. |
| **Freelancers and agencies** | "Produce client sites quickly and hand them over cleanly." | Speed; brand consistency; handover; client review. | Design tokens/brand kit; versions with names; review links; ZIP/GitHub handover; quality report to share with the client. |
| **Students and independent builders** | "Learn and build without paying." | ₹0 usage; understanding; portfolio pieces. | Free daily allowance; "explain this change"; traceability from request → code; exportable projects. |

**[ASSUMPTION]** These audience needs come from the product brief and common patterns, not user research. Validating them (interviews, analytics on the existing app) is a roadmap item, not a done fact.

## 4. Where we can realistically win **[PROPOSED]**

Lovable and Bolt.new are well-funded and run large paid models. We cannot beat them on raw model power or breadth of hosted infrastructure under a ₹0 budget. We should compete where our constraints are an asset:

| Bet | Why it is credible for us | What it requires |
| --- | --- | --- |
| **Verified changes** (every AI edit is validated, tested in the browser, diffed and reversible) | Validation, repair and edit planning already exist **[VERIFIED]**. Browser-side tests can run in the user's preview at ₹0 server cost. | Version store, diff, in-preview test runner. |
| **Requirement traceability** (each requested feature is mapped to the code and to a check) | We already score requirements in benchmarks (offline tooling). Making it a product feature is new. | Requirement extraction + check registry. |
| **Measured token efficiency** (show real tokens per change; pick the cheapest safe strategy) | Measured usage per request is already recorded and shown **[VERIFIED]**. Competitors bill in credits/tokens but do not, to our knowledge, show per-change efficiency strategies **[ASSUMPTION]**. | Per-phase metrics, budget-aware planner. |
| **Safe project evolution** (immutable releases, rollback, impact preview) | Fixes a real gap in our own product (live deploy = latest code). | Release snapshots, version graph. |
| **India-first affordability** (₹ pricing, Razorpay, free daily usage) | Razorpay and credit ledger exist **[VERIFIED]**. | Clear free tier; honest limits. |

**We must not claim** to be better than Lovable or Bolt today. On most capability rows of the comparison we are behind; see the [competitor analysis](GENWEB_AI_2_COMPETITOR_ANALYSIS.md).

## 5. Product scope for 2.0 **[PROPOSED]**

**In scope (staged; see [ROADMAP](GENWEB_AI_2_ROADMAP.md))**

1. Server-side version history, named checkpoints, immutable releases and rollback.
2. Multi-file static projects (HTML/CSS/JS/assets). Existing single-HTML projects keep working unchanged.
3. Development workspace: file explorer, code editor, per-change diffs, device preview, element select → chat edit.
4. Quality engine: syntax/structure validation, responsive checks, accessibility and SEO basics, broken links and images, and functional self-tests run in the browser preview.
5. Ownership: ZIP export, GitHub push (the user's own account), and a release log.
6. React + Vite projects with in-browser bundling. This is gated on a dependency decision (see architecture §B.6).
7. Lightweight data features for generated sites (forms, simple collections, auth) through **the user's own** free-tier backend accounts (e.g. Supabase or Firebase), or a strictly-quota'd GenWeb data API.

**Out of scope for 2.0**

- A full server-side terminal or container runtime. This is not feasible at ₹0 at scale: server sandboxes cost money, and WebContainers needs a commercial licence (see competitor analysis §4).
- Native mobile apps.
- Paid model fallbacks of any kind.
- Treating multiple provider accounts as extra quota.

## 6. Success measures **[PROPOSED]**

All targets below are hypotheses. None has been measured beyond the benchmark noted.

| Measure | Definition | Current evidence |
| --- | --- | --- |
| Requirement coverage | Checks passing / requirements extracted, scored on the rendered DOM | Benchmark: 39/39 on 7 prompts, 1 run each **[VERIFIED, small sample]** |
| Functional self-test pass rate | Generated tests passing on first generation and after edits | none |
| Tokens per accepted change | All provider-reported tokens (incl. retries/repairs) / changes the user keeps | Per-request totals recorded **[VERIFIED]**; "accepted" is not tracked |
| Repair overhead | Tokens spent on retries and repairs / total tokens | Per-call records exist; not aggregated |
| Regression rate | Edits that break a previously passing check | none |
| Time to first preview | Prompt → visible preview | Benchmark average 6.7 s for generation **[VERIFIED, small sample]** |
| Rollback use and success | Rollbacks performed / succeeded | No server rollback exists |
| Free-capacity headroom | Daily provider requests used / free cap | Counters exist **[VERIFIED]** |

## 7. Constraints this vision must respect

- **₹0 personal API/model budget.** Only legitimately free tiers or optional local models. Never use a paid model as an automatic fallback.
- **Respect provider terms.** Do not treat multiple accounts or keys as unlimited quota. The catalog already defaults to `quotaScope: "provider"`: all keys of a provider share one quota **[VERIFIED]**. Whether the 5 Groq keys are allowed at all must be confirmed against Groq's terms. This is an open deployment blocker.
- **No new dependencies without explicit approval.** Where a dependency would help (code editor, bundler, zip), the architecture names it, names a no-dependency alternative, and leaves the decision to you.
- **Infrastructure stays as decided:** Vercel (client) + Render (API) + MongoDB Atlas. Atlas and Render free/low tiers limit storage and compute. Every storage-heavy proposal is sized against this (see architecture §G).
- **The current deploy blockers still apply:** key rotation, staging, Razorpay webhook setup, test vs live keys, provider terms, dead accounts.

## 8. Open questions for you

1. **Code editor dependency.** Do we stay with `<textarea>`, or approve one editor library (CodeMirror 6 is MIT-licensed)?
2. **React + Vite projects.** Is in-browser bundling with `esbuild-wasm` (MIT, a new dependency) acceptable when we reach that phase?
3. **Data features.** "Bring your own Supabase/Firebase" only, or also a small GenWeb-hosted data API with tight quotas?
4. **Pricing.** Should credits cost the same for every edit, or scale with the measured tokens? Today every edit costs 50 credits, even a one-line text change.
5. **Branding ribbon.** Keep the "Built with GenWeb.ai" ribbon on free deploys (current behaviour), and remove it for paying users?
