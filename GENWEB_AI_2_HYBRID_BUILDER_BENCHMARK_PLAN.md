# GenWeb.ai 2.0 — Hybrid Builder Benchmark Plan

*Planning-only companion to the hybrid builder blueprint, updated 2026-11-02.*

## 1. Purpose

Measure whether the hybrid engine improves working output per token without reducing quality, edit accuracy or safety. No benchmark result is claimed until the experiment is run and recorded.

## 2. Baselines

The baseline must be the current v2 implementation at the exact tested revision, with provider responses captured or deterministic fixtures. Record the current local verification separately: server `267/267`, client `15/15`, lint clean, build successful.

Compare current single-call generation, brief-plus-generation, proposed hybrid generation, targeted edits, and repair-only retry versus full regeneration.

## 3. Workload matrix

Run the same prompts across strategies, with at least three independent runs per prompt after the fixture/provider harness is stable:

| ID | Scenario |
|---|---|
| B01 | Restaurant single page |
| B02 | Personal portfolio |
| B03 | E-commerce landing/catalog |
| B04 | SaaS landing page |
| B05 | Admin dashboard |
| B06 | Booking website |
| B07 | Multi-page business site |
| B08 | Unusual experimental visual direction |
| B09 | Existing site style modification |
| B10 | Add a pricing page to an existing site |
| B11 | Responsive layout correction |
| B12 | Runtime or syntax error repair |

Each prompt must specify expected requirements, pages, interactions and acceptance checks independently of model output.

## 4. Metrics

### Reliability

- project generation and build success;
- missing-file, broken-link, runtime-error and repair-success rates;
- regression rate on untouched files;
- percentage of edits limited to planned files.

### Quality

- requirement coverage;
- responsive checks at fixed viewport sizes;
- accessibility checks for landmarks, labels, contrast and keyboard behavior;
- design-token consistency and visual variation using a fixed, blinded rubric.

### Efficiency

- input, output and total provider tokens;
- repair tokens and call count;
- time to first preview and final completion;
- files generated versus reused;
- tokens per accepted passing change;
- credit reservation and refund outcomes.

## 5. Methodology

1. Pin prompts, library version, model catalog, token limits and environment.
2. Use provider fixtures for repeatable CI; run real-provider canaries only with explicit approval and free capacity.
3. Reset the database/project for every run.
4. Use identical viewport screenshots and deterministic DOM checks.
5. Score functional requirements before visual preference.
6. Report mean, median, range and failure reasons; never report a single best run.
7. Retain manifests, logs, validation output and screenshots as artifacts.

## 6. Proposed acceptance gates

- single-page success and requirement coverage must not fall below the current baseline;
- multi-page generation must produce valid resolving internal links in at least 80% of runs before becoming default;
- targeted edits must preserve untouched-file hashes in 100% of safe-edit cases;
- repair loops must stay within the approved repair-token budget;
- failed generation and duplicate retry must never produce a double credit charge;
- every quality improvement must report its token and latency cost.

Thresholds should be recalibrated only after the first three-run baseline, with raw evidence retained.

## 7. Test ownership

- server: `server/tests/*` and new hybrid/manifest tests;
- preview/security: `client/tests/previewDoc.test.js` and browser smoke tests;
- build/environment safety: `client/tests/bundle.test.js`;
- visual artifacts: `benchmarks/<date>/<scenario>/`;
- comparison summary: schema-versioned `results.json`.
