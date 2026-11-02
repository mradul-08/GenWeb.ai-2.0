# GenWeb.ai 2.0 — Hybrid Builder Decisions

*Decision register for planning review, updated 2026-11-02.*

## Locked decisions

| ID | Decision | Status |
|---|---|---|
| D-01 | Serve beginners and developers | `[VERIFIED: user brief]` |
| D-02 | Classic mode is HTML/CSS/JS | `[VERIFIED: user brief]` |
| D-03 | Advanced mode is React + Vite | `[VERIFIED: user brief]` |
| D-04 | Use hybrid templates/components plus AI | `[VERIFIED: user brief and current library]` |
| D-05 | Prefer legitimate free AI capacity; no paid fallback without approval | `[VERIFIED: user brief and catalog policy]` |
| D-06 | Evolve v2; preserve v1 and working v2 behavior | `[VERIFIED: user brief]` |

## Decisions required before implementation

| ID | Question | Recommendation | Blocking phase |
|---|---|---|---|
| O-01 | Is R0 formally closed after owner actions and staging verification? | No; close documented owner/staging gates first | All production work |
| O-02 | May R1 versions begin before staging is complete? | Local implementation only; no production cutover | R1 |
| O-03 | Long-job transport: held HTTP request or resumable polling? | In-process job record plus polling first; queue later | R2 |
| O-04 | How should multi-page credits be priced? | Show a preflight estimate; keep ledger mechanics unchanged | R2 |
| O-05 | How should React projects be previewed safely? | Decide between isolated build service and tightly scoped browser build after Classic | R6 |
| O-06 | Should deployed sites move to a separate domain? | Yes before public multi-user launch | R1/R5 |
| O-07 | When is Atlas storage too large for blobs? | Measure after R1 and set retention before launch | R1 |
| O-08 | Are external images allowed? | Safe placeholders or approved URLs; define licensing/proxy policy | R2 |
| O-09 | What dependency policy applies to Advanced mode? | Approved, pinned allowlist for MVP | R6 |

## Explicitly deferred

- arbitrary server-side code execution;
- automatic paid AI fallback;
- provider-account multiplication to increase quota;
- custom domains managed by GenWeb.ai;
- automatic GitHub pull/synchronization;
- real-time collaboration;
- unrestricted npm installation in previews.

## Readiness verdict

**NEEDS ARCHITECTURAL DECISIONS.** The current codebase is strong enough for technical review and a local R1 design, but not for claiming production implementation readiness while R0 owner/staging gates and the React preview/dependency policy remain unresolved.
