import { test } from "node:test"
import assert from "node:assert/strict"
import { scoreQuality } from "../ai/quality.js"

const page = (extra = "") => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media (max-width: 700px){main{width:100%}}</style></head><body><nav id="nav">Home</nav><main><h1>Crumb & Co bakery</h1><section id="menu"><h2>Fresh bread</h2><p>Warm sourdough, cakes and pastries made daily for our neighbourhood.</p><button aria-label="Order now">Order now</button></section></main><footer id="footer">Contact</footer>${extra}<script>document.querySelector('button')</script></body></html>`

const plan = { sections: [{ id: "nav", name: "Navigation" }, { id: "menu", name: "Menu" }, { id: "footer", name: "Footer" }], features: [], style: {} }

test("quality scoring returns category scores and passes a complete template page", () => {
  const result = scoreQuality([{ path: "index.html", content: page() }], plan)
  assert.equal(result.passed, true)
  assert.equal(result.grade, "good")
  assert.equal(result.pages.length, 1)
  for (const key of ["content", "structure", "mobile", "accessibility", "interactions"]) assert.ok(result.categories[key] >= 0)
})

test("quality scoring reports missing mobile and accessibility signals", () => {
  const result = scoreQuality([{ path: "index.html", content: "<html><body><h1>Lorem ipsum</h1><img src='x'><input></body></html>" }])
  assert.ok(result.issues.includes("missing_viewport"))
  assert.ok(result.issues.includes("missing_lang"))
  assert.ok(result.categories.mobile < 75)
  assert.ok(result.categories.content < 75)
})

test("quality scoring averages multi-page results and detects missing plan sections", () => {
  const result = scoreQuality([
    { path: "index.html", content: page() },
    { path: "about.html", content: page().replace('id="menu"', 'id="about"') },
  ], plan)
  assert.equal(result.pages.length, 2)
  assert.ok(result.issues.includes("planned_section_missing"))
  assert.ok(result.pages.some(p => p.path === "about.html" && p.issues.includes("planned_section_missing")))
})
