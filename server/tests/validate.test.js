// Edit validation: every way a patch can damage a page must be caught before
// it is saved; legitimate changes must pass.
import { test } from "node:test"
import assert from "node:assert/strict"
import { analyzeHtml, validateDocument, comparePatch, deterministicRepair, brokenScripts } from "../ai/validate.js"
import { extractSection, patchHTML, applyTextReplacements } from "../ai/htmlPatch.js"

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>body{color:#222}${".a{margin:0}".repeat(120)}</style></head><body>
<nav id="nav"><a href="#hero">Home</a></nav>
<section id="hero"><h1>Crumb &amp; Co</h1><p>Fresh bread daily in Kochi.</p></section>
<section id="features"><div class="card">Sourdough</div><div class="card">Croissants</div></section>
<section id="features-list"><ul><li>Organic flour</li></ul></section>
<footer id="footer"><p>© Crumb &amp; Co</p></footer>
<script>document.getElementById('nav').addEventListener('click', () => {})</script>
<script type="application/ld+json">{"@context":"https://schema.org"}</script>
</body></html>`

test("baseline page is valid", () => {
  const v = validateDocument(PAGE)
  assert.equal(v.valid, true, v.reasons.join())
  assert.deepEqual(v.warnings, [])
})

// ── Broken HTML ───────────────────────────────────────────────────────────────
test("broken HTML: a patch that leaves a tag unclosed is rejected", () => {
  const patched = PAGE.replace('<div class="card">Croissants</div>', '<div class="card">Croissants')
  assert.deepEqual(comparePatch(PAGE, patched).reasons, ["unbalanced_tags"])
})

test("broken HTML: a truncated document is flagged; safe closing-tag repair needs no AI", () => {
  const truncated = PAGE.slice(0, PAGE.indexOf("</body>"))
  assert.ok(validateDocument(truncated).reasons.includes("missing_body_close"))
  const fixed = deterministicRepair(truncated)
  assert.deepEqual(fixed.fixes, ["closed_body", "closed_html"])
  assert.equal(validateDocument(fixed.html).valid, true)
})

test("broken HTML: output cut mid-tag is not 'repaired' into a fake complete page", () => {
  const cut = PAGE.slice(0, PAGE.indexOf("Croissants"))
  assert.deepEqual(deterministicRepair(cut).fixes, [])
})

// ── Invalid JavaScript ────────────────────────────────────────────────────────
test("invalid JavaScript: syntax errors are detected without executing the code", () => {
  const bad = PAGE.replace("addEventListener('click', () => {})", "addEventListener('click', () => {)")
  assert.ok(validateDocument(bad).reasons.includes("script_syntax_error"))
  assert.equal(brokenScripts(bad).length, 1)
  assert.deepEqual(comparePatch(PAGE, bad).reasons, ["script_syntax_error"])
})

test("JSON-LD / module scripts are not parsed as classic JavaScript", () => {
  assert.equal(analyzeHtml(PAGE).scriptErrors.length, 0)
  assert.equal(analyzeHtml(PAGE.replace("<script>document", '<script type="module">import x from "./x.js";document')).scriptErrors.length, 0)
})

// ── Missing scripts / sections ────────────────────────────────────────────────
test("missing scripts: a patch that drops the page's script is rejected", () => {
  const patched = PAGE.replace(/<script>document[\s\S]*?<\/script>/, "")
  assert.ok(comparePatch(PAGE, patched).reasons.includes("scripts_lost"))
})

test("missing sections: losing a section is rejected unless the user asked to remove something", () => {
  const patched = extractSection(PAGE, "features") && PAGE.replace(extractSection(PAGE, "features"), "")
  assert.ok(comparePatch(PAGE, patched).reasons.includes("sections_lost"))
  assert.equal(comparePatch(PAGE, patched, { removal: true }).valid, true)
})

// ── Duplicate IDs ─────────────────────────────────────────────────────────────
test("duplicate IDs: introducing one is rejected; pre-existing duplicates are not blamed on the patch", () => {
  const dup = PAGE.replace('<section id="features-list">', '<section id="hero">')
  assert.ok(comparePatch(PAGE, dup, { removal: true }).reasons.includes("duplicate_ids"))
  const alreadyDup = dup
  const patched = alreadyDup.replace("Fresh bread daily", "Fresh bread every day")
  assert.equal(comparePatch(alreadyDup, patched).valid, true)
  assert.ok(validateDocument(dup).warnings.includes("duplicate_ids"))
})

// ── Destructive patches ───────────────────────────────────────────────────────
test("destructive patch: replacing most of the page is rejected", () => {
  const patched = patchHTML(PAGE, "style_only", null, "<style>body{}</style>")
  assert.ok(comparePatch(PAGE, patched).reasons.includes("content_lost"))
})

test("a patch that removes </body> or </html> is rejected", () => {
  assert.ok(comparePatch(PAGE, PAGE.replace("</body>", "")).reasons.includes("missing_body_close"))
})

// ── Section selection ─────────────────────────────────────────────────────────
test("section selection: exact id wins over a prefix-similar id", () => {
  assert.ok(extractSection(PAGE, "features").includes("Sourdough"))
  assert.ok(!extractSection(PAGE, "features").includes("Organic flour"))
  assert.ok(extractSection(PAGE, "features-list").includes("Organic flour"))
})

test("section patch for the wrong section is caught: replacing hero with features content loses sections", () => {
  const wrong = patchHTML(PAGE, "section_patch", "hero", extractSection(PAGE, "features"))
  const r = comparePatch(PAGE, wrong)
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes("duplicate_ids") || r.reasons.includes("sections_lost"))
})

// ── Text replacements ─────────────────────────────────────────────────────────
test("text edits: exact unique matches are applied", () => {
  const out = applyTextReplacements(PAGE, '[{"find":"Fresh bread daily in Kochi.","replace":"Baked fresh every morning in Kochi."}]')
  assert.ok(out.includes("Baked fresh every morning in Kochi."))
  assert.equal(comparePatch(PAGE, out).valid, true)
})

test("text edits: ambiguous, missing or script-injecting replacements reject the whole edit", () => {
  assert.equal(applyTextReplacements(PAGE, '[{"find":"Crumb &amp; Co","replace":"X"}]'), null)          // appears twice
  assert.equal(applyTextReplacements(PAGE, '[{"find":"Not on the page","replace":"X"}]'), null)
  assert.equal(applyTextReplacements(PAGE, '[{"find":"Sourdough","replace":"<script>alert(1)</script>"}]'), null)
  assert.equal(applyTextReplacements(PAGE, '[{"find":"getElementById","replace":"x"}]'), null)          // inside <script> only
  assert.equal(applyTextReplacements(PAGE, "not json"), null)
})

// ── Style overrides ───────────────────────────────────────────────────────────
test("style edits append overrides instead of rewriting the stylesheet", () => {
  const out = patchHTML(PAGE, "style_append", null, "<style>body{background:#fff8e7}</style>")
  assert.ok(out.includes("<style data-gw-edit>"))
  assert.ok(out.includes(".a{margin:0}"), "original rules kept")
  assert.equal(comparePatch(PAGE, out).valid, true)
})
