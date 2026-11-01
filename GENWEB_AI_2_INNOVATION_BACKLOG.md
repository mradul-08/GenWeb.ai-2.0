# GenWeb.ai 2.0: Innovation Backlog

*Proposal for review, 2026-11-01. Every item is **[PROPOSED]** unless stated. The scores are my judgement, not measurements. Each item states what would prove it works.*

## Scoring

| Dimension | 1 | 5 |
| --- | --- | --- |
| **User value** | nice-to-have | solves a frequent, painful problem |
| **Difficulty** (lower is easier) | days | months, risky |
| **Run cost** (₹0 budget fit; lower is cheaper) | deterministic, no tokens | many extra AI calls per change |
| **Differentiation** | competitors clearly have it | not found in competitor docs (see [competitor analysis](GENWEB_AI_2_COMPETITOR_ANALYSIS.md)) |

**Priority score** = Value × 2 + Differentiation + (6 − Difficulty) + (6 − Cost). Maximum 30.

## Ranked backlog

| Rank | Innovation | Value | Diff. | Cost | Differentiation | Score | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **6. Safe Project Evolution** | 5 | 2 | 1 | 3 | 22 | R1 |
| 2 | **1. Requirement-to-Code Traceability** | 5 | 3 | 2 | 4 | 21 | R4 |
| 3 | **N2. Change receipt and cost preview** | 4 | 2 | 1 | 4 | 21 | R4 |
| 4 | **N1. Zero-token micro-edits** | 4 | 2 | 1 | 3 | 20 | R3 |
| 5 | **2. Smart Change Impact Engine** | 4 | 3 | 1 | 4 | 20 | R4/R3 |
| 6 | **4. Budget-Aware AI Engine** | 4 | 3 | 1 | 3 | 19 | R4 |
| 7 | **N3. Deterministic accessibility/SEO auto-fix** | 4 | 2 | 1 | 2 | 19 | R4 |
| 8 | **3. Self-Testing Application** | 5 | 4 | 3 | 3 | 18 | R4 |
| 9 | **N4. Clarify-before-generate** | 4 | 2 | 2 | 2 | 18 | R4 |
| 10 | **N6. Hindi/Hinglish prompts and multilingual sites** | 4 | 3 | 2 | 3 | 18 | R4+ |
| 11 | **N5. Client handover pack** | 3 | 2 | 1 | 3 | 18 | R5 |
| 12 | **5. Design Intelligence** | 4 | 3 | 2 | 2 | 17 | R2+ |
| 13 | **N7. Learn mode** (explain code ↔ requirement) | 3 | 2 | 2 | 3 | 17 | R3+ |
| 14 | **N8. Local-model adapter** (self-host/dev only) | 2 | 2 | 1 | 2 | 15 | any |

*Ties are ordered by user value. Self-Testing scores lower than its value because it is the hardest and costliest item; it is still in R4 because traceability and impact analysis are much stronger with tests.*

---

## The six requested innovations

### 1. Requirement-to-Code Traceability

- **What:** Every request becomes numbered requirements (R1..Rn). Each is linked to code anchors (file + selector/section) and to tests. The user sees a checklist: present / tested ✓ / failing / missing.
- **Builds on:** the benchmark's requirement scoring on the rendered DOM. Today this is offline tooling only **[VERIFIED]**.
- **Token cost:**
  - one small-model call per generation for extraction (about 200–400 tokens **[ASSUMPTION]**), cached by prompt hash;
  - anchors are found deterministically.
- **Risk:** extraction granularity. Too coarse is useless; too fine is noisy. Cap at about 15 requirements.
- **Proof it works:** on the benchmark set, the checklist agrees with the manual verification in ≥ 90% of requirements.

### 2. Smart Change Impact Engine

- **What:** Before an edit, show which files, sections, requirements and tests the change may affect. After the edit, re-run the impacted tests first.
- **Builds on:** `planEdit` already identifies the target section and `needs` **[VERIFIED]**. `comparePatch` detects lost scripts, sections and content **[VERIFIED]**.
- **Token cost:** ₹0. It is deterministic: class/ID/function reference graph + anchor links.
- **Risk:** false confidence. Dynamic JS selectors are not fully traceable. Label the result "may affect", never "safe".
- **Proof:** on seeded edits, every test that broke was flagged in advance (recall ≥ 95%).

### 3. Self-Testing Application

- **What:** AI writes declarative test steps for each interactive requirement once. A fixed interpreter runs them inside the sandboxed preview in the user's browser. Failing tests trigger at most one targeted repair.
- **Builds on:** the E2E click-check approach used in verification (scratchpad tooling) **[VERIFIED as a manual method]**.
- **Token cost:** one test-generation call per generation (~500–1,000 tokens **[ASSUMPTION]**); 0 for running tests.
- **Risks:**
  - wrong or flaky tests: validate them on first generation; drop tests that cannot pass;
  - client-reported results can be faked: they are informational only, never used for billing.
- **Proof:** a seeded-defect benchmark (remove a handler, break a toggle) has a detection rate ≥ 80%, and the false-failure rate stays < 5%.

### 4. Budget-Aware AI Engine

- **What:** Every task gets a token estimate before it runs. The engine picks the cheapest safe strategy (deterministic → patch → file rewrite → multi-file), respects per-request limits (Groq 8k tokens), the user's daily cap and provider headroom, and splits or narrows work rather than failing late. It never escalates to paid models.
- **Builds on:**
  - `estimateTokens`, the edit modes, `maxTokens` per mode, the atomic quotas and the capacity classification **[VERIFIED]**;
  - measured savings of −87% / −92% on style and text edits **[VERIFIED]**.
- **Token cost:** negative. Its purpose is to save tokens.
- **Risk:** under-spending, which hurts quality. The benchmark gate rejects any strategy change that lowers coverage or test pass rate.
- **Proof:** tokens per *accepted, passing* change fall while coverage stays at least equal (≥ 3 runs × 7 categories).

### 5. Design Intelligence

- **What:**
  - design tokens (palette, type scale, spacing) extracted deterministically from the generated CSS and stored per project;
  - edits must reuse the tokens;
  - a brand kit for agencies;
  - checks for contrast, font variety and the "generic blue" look.
- **Builds on:**
  - the prompt now asks for business-specific colours; blue primaries fell from 4/7 to 2/7 **[VERIFIED small sample]**;
  - `contrastRatio` exists **[VERIFIED]**.
- **Known gaps:**
  - typography is still Inter-heavy (6/7);
  - `$` is the default currency;
  - the desktop menu toggle defect **[VERIFIED limitations]**.
- **Token cost:** about 0 (deterministic extraction); a small number of prompt tokens to pass the tokens to edits.
- **Risk:** taste is subjective. Measure with user ratings, not only with heuristics.
- **Proof:** cross-edit consistency (no new off-palette colours after 5 edits), plus user preference tests.

### 6. Safe Project Evolution

- **What:**
  - immutable versions and releases;
  - restore and rollback;
  - named checkpoints;
  - soft delete;
  - "edit after publish doesn't change the live site";
  - divergence-safe GitHub push (one-way first).
- **Why first:** it fixes a **verified defect class**. Today the deploy serves the live working copy, and history lives only in browser memory (20 states, lost on reload).
- **Token cost:** ₹0.
- **Risk:** storage growth on the free Atlas tier. Mitigated by retention, dedupe and gzip, then measured.
- **Proof:** E2E: publish → edit → live unchanged → republish → rollback restores exactly (hash-equal).

---

## New proposals

| ID | Idea | Why | Cost |
| --- | --- | --- | --- |
| **N1** | **Zero-token micro-edits:** inline text edit, colour picker on design tokens, image swap, reorder sections. Implemented as deterministic operations with no AI call and no credits. | Many edits are tiny; today each costs 50 credits and an AI call **[VERIFIED: flat `COST_PER_EDIT = 50`]**. | ₹0 |
| **N2** | **Change receipt and cost preview:** before running, "≈ 1,300 tokens, 1 call, mode: style"; after, "1,343 tokens used, 2 files changed, 7/7 requirements still pass". | Transparency; builds on the measured usage badge **[VERIFIED]**. | ₹0 |
| **N3** | **Deterministic a11y/SEO auto-fix:** add a missing `lang`, a viewport meta, `alt` from context, form labels, a meta description from the hero text. | Cheap quality wins without AI. | ₹0 |
| **N4** | **Clarify before generate:** when a prompt is very short or ambiguous, ask 1–2 multiple-choice questions (deterministic rules first). | Avoids wasted generations on free capacity. | ~0 |
| **N5** | **Client handover pack:** export plus an HTML quality report (requirements, tests, a11y/SEO results, version log). | Agencies and freelancers. | ₹0 |
| **N6** | **Hindi/Hinglish prompts + multilingual sites.** | India-first audience. Non-English prompts are **untested today [VERIFIED gap]**. | Benchmark tokens only |
| **N7** | **Learn mode:** hover a requirement to highlight its code; "explain this change" in plain language from the operation log. | Students and beginners. | Small summary calls, cacheable |
| **N8** | **Local-model adapter** (Ollama-compatible) for self-hosting and development, never in the production fallback chain. | Developer testing without consuming free cloud quota. | ₹0 (the user's hardware) |

## Explicitly rejected ideas

- **Rotating many free accounts to multiply quota.** This violates the constraint and likely provider terms.
- **Paid "turbo" model fallback.** Violates ₹0.
- **WebContainers-based terminal.** Needs a commercial licence.
- **Server-side headless browser testing for every change.** Compute cost on Render, plus a new dependency. Client-side testing gives most of the value at ₹0.

## What would change these rankings

- User research showing beginners rarely care about requirement checklists (would lower #1 and #3 for that segment).
- Storage measurements after R1 (could raise the difficulty of #6 if the tier must change).
- Benchmark results for test-generation token cost (could raise the cost of #3).
