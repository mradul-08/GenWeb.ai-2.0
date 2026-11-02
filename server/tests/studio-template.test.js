import test from "node:test"
import assert from "node:assert/strict"
import { buildBlueprint, assembleSite } from "../library/assemble.js"
import { PRESETS, presetById } from "../library/presets.js"
import { TEMPLATES, rankTemplates } from "../library/templates.js"

const studio = TEMPLATES.find(template => template.id === "studio")

test("studio template is selected for appointment-led local practices", () => {
  const ranked = rankTemplates("A calm physiotherapy and wellness studio for appointments", null)
  assert.equal(ranked[0].template.id, "studio")
  assert.ok(ranked[0].score > 0)
})

test("studio preset uses readable warm editorial tokens", () => {
  const preset = presetById("studio-sage")
  assert.ok(preset)
  assert.equal(preset.dark, false)
  assert.equal(preset.colors.bg, "#f7f4ee")
  assert.match(preset.fonts.heading, /DM Serif/i)
  assert.ok(PRESETS.includes(preset))
})

test("studio template renders a valid page and preserves working interactions", () => {
  assert.ok(studio)
  const blueprint = buildBlueprint({ text: "A physiotherapy and wellness studio for appointments", rand: () => 0.2 })
  assert.equal(blueprint.template, "studio")
  assert.deepEqual(Object.fromEntries(blueprint.sections.map(section => [section.kind, section.variant])), {
    nav: "bar", hero: "split", features: "numbered", highlight: "left", steps: "row",
    testimonials: "spotlight", faq: "accordion", hours: "table", contact: "card", footer: "minimal",
  })
  const content = {
    title: "Stillpoint Studio", brand: "Stillpoint", tagline: "Care that meets you where you are.",
    sections: Object.fromEntries(blueprint.sections.map(section => [section.id, { heading: section.name, intro: section.purpose }])),
  }
  const site = assembleSite(blueprint, content, { requestText: "A physiotherapy and wellness studio for appointments" })
  assert.match(site.html, /class="gw-menu-toggle"[^>]+aria-controls=/)
  assert.match(site.html, /gw-form-status/)
  assert.match(site.html, /<meta name="viewport"/i)
  assert.equal(site.files[0].path, "index.html")
  assert.deepEqual(site.dropped.sort(), ["faq", "features", "hours", "steps", "testimonials"])
})
