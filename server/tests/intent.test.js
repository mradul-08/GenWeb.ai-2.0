// Edit routing: every rule in ai/intent.js, including the requests the old
// keyword classifier misrouted.
import { test } from "node:test"
import assert from "node:assert/strict"
import { analyzeEditIntent, planEdit } from "../ai/intent.js"

const CASES = [
  // Previously misrouted to style-only (could not add markup/JS):
  ["Add a dark/light mode toggle button to the navbar that switches the entire site theme", "FULL"],
  ["add a back to top button",                                   "FULL"],
  ["Add a contact form with email validation",                    "FULL"],
  ["Add a beautiful animated page loading screen that fades out after 1.5 seconds", "FULL"],
  ["Add an animated stats section with count-up numbers",         "FULL"],
  ["make the mobile hamburger menu open and close",               "FULL"],
  // Pure styling:
  ["Refresh the accent color throughout the site with a more vibrant, modern feel", "STYLE"],
  ["Fix all mobile responsiveness issues below 480px",            "STYLE"],
  ["change the navbar background to white",                       "STYLE"],
  ["Make all navigation links scroll smoothly to their sections", "STYLE"],
  ["use a bigger font for headings",                              "STYLE"],
  // Text:
  ["change the hero heading text to \"Fresh bread daily\"",       "TEXT"],
  ["fix the typo in the about paragraph",                         "TEXT"],
  // Sections:
  ["Add a testimonials section with 3 cards featuring star ratings", "SECTION_ADD_OR_MOD"],
  ["add a newsletter section",                                    "SECTION_ADD"],
  ["add a button to the hero that links to the menu",             "SECTION_MOD"],
  ["remove the twitter icon from the footer",                     "SECTION_MOD"],
  ["make the hero title bigger and change it to say Welcome",     "SECTION_MOD"],
  // Animation only:
  ["add a subtle fade-in animation when cards appear",            "ANIMATION"],
  ["smoother hover transitions on buttons",                       "ANIMATION"],
  // Whole-section removal / multi-step → full rewrite:
  ["remove the pricing section",                                  "FULL"],
  ["make the footer dark and also add a map and then update the phone number", "FULL"],
]

for (const [prompt, expected] of CASES) {
  test(`intent: ${prompt.slice(0, 60)} → ${expected}`, () => {
    assert.equal(analyzeEditIntent(prompt).editType, expected)
  })
}

const page = `<!DOCTYPE html><html><head><style>body{color:#222}</style></head><body>
<nav class="navbar"><a href="#hero">Home</a></nav>
<section id="hero"><h1>Crumb &amp; Co</h1></section>
<section id="testimonials"><p>Great bread</p></section>
<footer>© Crumb</footer>
<script>document.querySelectorAll('a')</script>
</body></html>`

test("planEdit: dark-mode toggle gets the whole document, not just <style>", () => {
  const plan = planEdit(page, "Add a dark mode toggle to the navbar")
  assert.equal(plan.mode, "full")
  assert.equal(plan.extracted, page)
})

test("planEdit: existing section is patched, missing one is added", () => {
  const existing = planEdit(page, "add a testimonials section with three reviews")
  assert.equal(existing.mode, "section_patch")
  assert.equal(existing.sectionName, "testimonials")
  const missing = planEdit(page, "add a pricing section with three plans")
  assert.equal(missing.mode, "section_add")
})

test("planEdit: style edits send only the <style> block and ask for overrides", () => {
  const plan = planEdit(page, "make the background a warm cream colour")
  assert.equal(plan.mode, "style_append")
  assert.ok(plan.extracted.startsWith("<style>"))
})

test("planEdit: section change falls back to full when the section does not exist", () => {
  const plan = planEdit(page, "add a phone icon to the contact section")
  assert.equal(plan.mode, "full")
})

test("planEdit: text edits use find/replace pairs; context is the section or the script-free body", () => {
  const plan = planEdit(page, "fix the spelling mistakes")
  assert.equal(plan.mode, "text_replace")
  assert.ok(!plan.extracted.includes("<script"))
  // Small target section (< 1500 chars): returning the section costs about the same and is less brittle.
  const scoped = planEdit(page, "change the hero heading text to \"Fresh bread\"")
  assert.equal(scoped.mode, "section_patch")
  assert.equal(scoped.sectionName, "hero")
  // Large target section: find/replace pairs avoid rewriting it.
  const big = page.replace("<h1>Crumb &amp; Co</h1>", "<h1>Crumb &amp; Co</h1>" + "<p>Our story.</p>".repeat(120))
  const large = planEdit(big, "change the hero heading text to \"Fresh bread\"")
  assert.equal(large.mode, "text_replace")
  assert.ok(large.extracted.startsWith('<section id="hero"'))
})
