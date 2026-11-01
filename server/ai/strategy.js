// Chooses between a single generation call (the model plans the design itself)
// and two-stage planning (design-brief call + generation call).
//
// "auto" = single. Benchmark on 2026-11-01 (7 categories × 2 strategies, same
// generation model; benchmarks/2026-11-01/results.json):
//   single: avg 3,026 tokens, 1 call, requirements 39/39, 3 broken images
//   brief:  avg 3,440 tokens (+14%), 2 calls, requirements 37/39, 13 broken images
// The brief only added typography variety (7 vs 5 distinct font pairs), while
// doubling request-quota use — the binding constraint on free tiers.
// "brief" stays available for admins who prefer more design variety.

export function chooseStrategy(prompt, configured = "auto") {
  if (configured === "brief" || configured === "single") return configured
  return "single"
}
