# GenWeb.ai 2.0: Competitor Analysis (Lovable and Bolt.new)

*Researched 2026-11-01 from official documentation, help centres and pricing pages. Labels are as defined in [PRODUCT_VISION](GENWEB_AI_2_PRODUCT_VISION.md).*

## 0. Method and limits

- **Sources.** Official docs only: `docs.lovable.dev`, `lovable.dev`, `support.bolt.new`, `bolt.new`. Vendor blog and comparison posts were found but are treated as marketing and not used for feature claims.
- **Not tested.** We have **not** used either product hands-on for this analysis. Every competitor cell is **[COMPETITOR-DOC]**: what their docs say, not what we observed.
- **Freshness.** Both products change monthly. Some doc pages were 2–6 months old, and pricing pages disagreed with older billing pages (noted below). Re-check before any public comparison.
- **Search coverage.** Where my searches did not find a documented capability, the cell says "not found in docs". That means *unknown*, not *absent*.

Sources:
- Lovable:
  - [Glossary](https://docs.lovable.dev/glossary)
  - [FAQ](https://docs.lovable.dev/introduction/faq)
  - [Git sync](https://docs.lovable.dev/integrations/git-sync-overview)
  - [GitHub](https://docs.lovable.dev/integrations/github)
  - [Deployment/hosting/ownership](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership)
  - [Security](https://docs.lovable.dev/features/security)
  - [Project chat](https://docs.lovable.dev/tips-tricks/troubleshooting)
  - [Payments](https://docs.lovable.dev/features/payments)
  - [Custom domain](https://docs.lovable.dev/features/custom-domain)
  - [Credits](https://docs.lovable.dev/introduction/credits-and-usage)
  - [Plans](https://docs.lovable.dev/introduction/subscription-plans)
  - [Changelog](https://docs.lovable.dev/changelog)
  - [Enterprise](https://docs.lovable.dev/introduction/lovable-for-enterprise)
  - [MCP publishing](https://docs.lovable.dev/features/agent-integrations)
- Bolt:
  - [Glossary](https://support.bolt.new/concepts/glossary)
  - [FAQ](https://support.bolt.new/reference/faq)
  - [Release notes](https://support.bolt.new/release-notes)
  - [Projects & files](https://support.bolt.new/building/using-bolt/projects-files)
  - [Code view](https://support.bolt.new/building/using-bolt/code-view)
  - [Version history & GitHub](https://support.bolt.new/concepts/version-history-github)
  - [Backups/restore](https://support.bolt.new/building/using-bolt/rollback-backup)
  - [Database](https://support.bolt.new/cloud/database)
  - [Token efficiency](https://support.bolt.new/prompting/maximizing-token-efficiency)
  - [Manage context](https://support.bolt.new/prompting/manage-context)
  - [Design system](https://support.bolt.new/design-system)
  - [Supported technologies](https://support.bolt.new/reference/supported-technologies)
  - [Pricing](https://bolt.new/pricing)
  - [Tokens](https://support.bolt.new/account-and-subscription/tokens)
  - [Hosting plans](https://support.bolt.new/cloud/hosting/plans)
- WebContainers licence:
  - [bolt.new README (via mirror)](https://huggingface.co/spaces/T1ckbase/bolt.diy/commit/36f219fb4a54571b5f5e69008555bb61cbb5c4db)
  - [third-party pricing summary](https://www.eesel.ai/blog/stackblitz-pricing)

## 1. Feature comparison

| Capability | Lovable **[COMPETITOR-DOC]** | Bolt.new **[COMPETITOR-DOC]** | GenWeb.ai v2 today **[VERIFIED]** | Gap |
| --- | --- | --- | --- | --- |
| **Prompt-to-app** | Yes. Chat, Plan mode (investigates without changing code) and Build mode (formerly "Agent mode") that applies changes across files. | Yes. Agent-based build; Plan mode replaced "Discussion Mode" (retired Aug 2026). Up to 20 queued prompts. | Yes, **website only**. One AI call creates one HTML page. Prompt enhancer. No plan mode. | Large |
| **Multi-file code generation** | Yes (full project). | Yes (full project, runs in WebContainers). | **No.** Single HTML file. | Large |
| **Frontend + backend generation** | Frontend + backend via Lovable Cloud (managed Postgres, auth, storage, edge functions) or the user's own Supabase. | Frontend + Bolt Cloud database (auth, edge functions, secrets, storage); Supabase still supported. | **Frontend only** (static page with inline JS). | Large |
| **Database and auth (for generated apps)** | Lovable Cloud or Supabase. | Built-in databases "created automatically when needed"; Supabase optional. | **None for generated apps.** Our own platform has Firebase auth + MongoDB, not offered to generated sites. | Large |
| **Visual editing** | Preview toolbar: select elements, inline text edit, annotations, comments (replaces the older Visual Edits panel). | Not found in my searches. | **No.** The preview is view-only (its overlay only opens a full-page preview). Edits happen through chat or the code view. | Medium |
| **Code editor / terminal** | Code editor ("Code mode") on paid plans. Terminal not found in docs. | Code View with file explorer, target files, lock files/folders, terminal (runs without tokens). Desktop only; read-only in Safari. | `<textarea>` code view for the single file. No terminal. | Large |
| **Live preview** | Yes. | Yes, in-browser via WebContainers. | Yes. Sandboxed `srcDoc` iframe; desktop/tablet/mobile widths. | Small |
| **Version history / rollback** | History log; revert; bookmark checkpoints. | Automatic version after every prompt; preview and restore; rename versions; restores cost no tokens. | **Client-memory undo/redo only** (20 states, lost on reload). The server stores only the latest code. No rollback of deploys. | Large |
| **GitHub integration** | Two-way sync; one repo per project. Divergence can overwrite Lovable-only edits. Migrations and edge functions are not deployed on sync. Export-only: cannot import an existing repo. | GitHub backup/collaboration/publishing; org-level app install. | **None.** | Large |
| **Testing / debugging** | Can test the app in a browser, write and run frontend tests, and check backend logic when asked. Security Quick scan (DB rules, deps, MCP exposure) and Deep scan (app code, ownership and role checks). Auto-fix for some findings. Docs say scans "do not guarantee" security. | Not found beyond terminal tooling (e.g. `npx knip`, `npm dedupe`). | Server-side HTML validation, script compile check, deterministic repair, image sanitizer **for every AI output**. No functional tests of the user's site in-product (benchmarks only). | Medium |
| **Deployment / hosting** | Publish to `*.lovable.app`. Custom domains on paid plans; buy domains in-product. Self-host via GitHub. | Bolt Cloud hosting on a free `bolt.host` subdomain; custom domains on Pro. Free hosting is capped, and the site goes offline for the rest of the month if exceeded. | Publish to `/s/:slug` on our API with a CSP sandbox. **Not immutable.** No custom domains; no export. | Large |
| **Integrations / extensibility** | Built-in Stripe and Paddle payments (paid plans); BYO Stripe key; 50+ connectors (enterprise page); publish an app as an MCP server. | Supabase, GitHub, Bolt Cloud. **No public API/CLI/SDK** (FAQ). | None for generated sites. | Large |
| **Collaboration** | Workspaces; project comments that can be sent to the agent; roles and SSO on Business/Enterprise. | Real-time multiplayer collaboration (release notes); Teams plan with SSO. | **None.** Single owner per project. | Large |
| **Usage / cost model** | Credits. Free: 5 daily up to 30/month. Pro from $25/month (100 credits). Business from $50/month. Temporary chat pricing ended 2026-10-31. | Tokens. Free: 1M/month with a 300K daily cap. Pro $25/month (10M tokens). Teams $30/member. Reload tokens do not expire. An older billing page lists different tiers. | Credits: 100 at sign-up, 50 per generation or edit (flat, regardless of size). Per-user daily AI cap (default 60). Razorpay packs in ₹. Real token usage shown per edit. | Different model |
| **Context / token controls** | Plan mode reduces wasted builds (docs). | Target files, lock files, `.bolt/ignore`, token-efficiency guide. | Automatic edit planner sends only the relevant section; measured −87% / −92% output tokens on style/text edits. | **We are comparable or ahead on automation [ASSUMPTION]**; Bolt has manual controls we lack. |

## 2. Classification

### 2.1 Features we must match (table stakes for "AI app builder")

| Feature | Why it's table stakes | Our planned approach | Phase |
| --- | --- | --- | --- |
| Server-side version history + restore | Both competitors have it; we lose history on reload. | Immutable versions per change; restore = new version. | R1 |
| Immutable publish + rollback | Our live site changes on every save (a correctness risk). | Releases point to a version. | R1 |
| Multi-file projects | Both are project-based. | File store with content hashes; single-HTML projects become a one-file project. | R2 |
| Code view with file explorer | Both offer it. | Explorer + editor (dependency decision pending). | R3 |
| GitHub push / export | Ownership expectation. | ZIP export + push to the user's repo (user's own token). | R5 |
| Some form of data/auth for generated apps | Both offer Postgres-backed backends. | BYO Supabase/Firebase first; optional small GenWeb data API. | R7 |
| Plan-before-build mode | Both have Plan mode. | Cheap planning pass that shows the change plan before spending generation tokens. | R4 |

### 2.2 Features we can implement differently

| Competitor approach | Our different approach | Reason |
| --- | --- | --- |
| WebContainers (full Node in the browser) | Static multi-file preview assembled in the iframe; later `esbuild-wasm` for React. | WebContainers is free only for personal/open-source use; commercial use needs a StackBlitz licence (price not published). ₹0 constraint. |
| Managed hosted Postgres per project | User-owned free-tier backend (Supabase/Firebase) connected by the user, or a small quota'd collections API on our Atlas. | We cannot host databases for every user at ₹0. |
| Terminal | Task palette with deterministic, token-free tasks (validate, format, run tests, check links). | No server sandbox budget. Most beginners don't need a shell **[ASSUMPTION]**. |
| Manual file lock/target (Bolt) | Automatic impact analysis plus optional user locks. | Builds on our existing edit planner. |
| Security scans (Lovable) | Deterministic checks of generated code (secrets in client code, unsafe `innerHTML` with user input, open forms without spam protection), run on every change. | No paid scanners; deterministic and cheap. |
| Large paid frontier models | Free models + more deterministic work + targeted context. | ₹0 budget. Quality must come from engineering, not model size. |

### 2.3 Potential GenWeb.ai differentiators (hypotheses, not claims)

None of these is proven. Each needs a measured result before marketing.

1. **Verified change loop.** Each AI change ships with a diff, validation result, impact summary and browser self-test result, plus one-click rollback. *Competitors have pieces of this* (Lovable browser testing; Bolt versions). We have not found a documented combined guarantee **[ASSUMPTION]**.
2. **Requirement-to-code traceability** visible to the user: "you asked for 7 things; 7 are present; here is where".
3. **Transparent token efficiency.** Real tokens per change, the strategy used, and the cheapest safe strategy chosen automatically.
4. **India-first pricing.** ₹ packs, Razorpay, a free daily allowance that runs on free models.
5. **Ownership by default.** Standard files, export always available, no runtime lock-in.

## 3. What we deliberately do not copy

- Two-way Git sync that can overwrite in-app edits on divergence. Lovable's docs warn about this. We start with one-way push and explicit pull/merge.
- Hosting that goes offline when a free quota is exceeded (Bolt free hosting). If we cap, the default is a degraded "over limit" page with the owner notified, not silent loss **[PROPOSED]**.
- Credits/tokens that are hard to predict. We show estimated and actual cost per change **[PROPOSED]**.

## 4. Licensing notes that affect architecture

| Technology | Licence (as found) | Impact |
| --- | --- | --- |
| WebContainer API (StackBlitz) | Free for personal and open-source use; commercial use needs a paid licence, "contact sales". Source: Bolt README. | Not usable for GenWeb.ai at ₹0 as a commercial product. |
| `esbuild-wasm` | MIT (npm). | Candidate for React/Vite bundling in the browser. **New dependency, needs approval.** |
| Sandpack bundler (CodeSandbox) | Self-hosting supported. **Licence not confirmed** by my search; an issue reports dependency install problems with self-hosted v2. | Do not rely on it until the licence and maintenance are confirmed. |
| CodeMirror 6 | MIT **[ASSUMPTION: from general knowledge; re-check before adopting]**. | Candidate code editor; new dependency. |

## 5. Re-check list before any public comparison

- Lovable free-plan credit numbers and chat pricing (a temporary offer ended 2026-10-31).
- Bolt token tiers: the pricing page and the billing page disagree.
- Bolt Lite / Forge status: sign-ups were stated to close 2026-10-14.
- Whether Bolt documents a visual editor, and how it shows diffs.
- Whether Lovable's code editor is still paid-only.
