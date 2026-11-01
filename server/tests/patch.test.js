// Unit tests for the HTML patching helpers (no database needed).
import { test } from "node:test"
import assert from "node:assert/strict"
import { extractSection, patchHTML } from "../ai/htmlPatch.js"

const page = `<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>
<nav class="navbar"><a class="nav-link">x</a></nav>
<div id="hero"><div class="inner"><div>deep</div></div><p>after nested</p></div>
<section class="features card-grid"><h2>F</h2></section>
<footer>foot</footer>
<script>menu()</script><script>observer()</script>
</body></html>`

test("nested elements are extracted up to their own closing tag", () => {
  const hero = extractSection(page, "hero")
  assert.ok(hero.includes("after nested"))
  assert.ok(hero.endsWith("</div>"))
})

test("class matching uses whole tokens", () => {
  assert.ok(extractSection(page, "nav").startsWith('<nav class="navbar"'))
  assert.ok(extractSection(page, "features").startsWith("<section"))
  assert.equal(extractSection(page, "card"), null)
})

test("section patch replaces exactly one section and keeps $ sequences literal", () => {
  const out = patchHTML(page, "section_patch", "hero", `<div id="hero">NEW $& $' $$</div>`)
  assert.ok(out.includes("NEW $& $' $$"))
  assert.ok(!out.includes("after nested"))
  assert.equal(out.match(/id="hero"/g).length, 1)
})

test("body-only edits keep the page's scripts", () => {
  const out = patchHTML(page, "body_only", null, "<h1>Rewritten</h1>")
  assert.ok(out.includes("menu()") && out.includes("observer()") && out.includes("Rewritten"))
  assert.ok(out.includes("<style>"))
})

test("new sections are inserted before the footer", () => {
  const out = patchHTML(page, "section_add", null, "<section id='new'>N</section>")
  assert.ok(out.indexOf("id='new'") < out.indexOf("<footer>"))
})

test("style replacement is literal", () => {
  const out = patchHTML(page, "style_only", null, "<style>body{color:$&}</style>")
  assert.ok(out.includes("body{color:$&}"))
  assert.equal(out.match(/<style>/g).length, 1)
})
