// Library v2: coverage of different kinds of websites, variety between
// generations, and limits that keep every template within free-tier budgets.
import { test } from "node:test"
import assert from "node:assert/strict"
import { KINDS, KIND_UI, LIST_KEY } from "../library/sections.js"
import { PRESETS } from "../library/presets.js"
import { TEMPLATES, mapKind, rankTemplates } from "../library/templates.js"
import { buildBlueprint, assembleSite, serializeBlueprint } from "../library/assemble.js"
import { buildContentPrompt } from "../ai/hybrid.js"
import { validateDocument } from "../ai/validate.js"
import { checkPlan } from "../ai/plan.js"

// Deterministic pseudo-random sequence for reproducible "random" choices.
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

test("the library covers many kinds of websites", () => {
  assert.ok(Object.keys(KINDS).length >= 19)
  const variants = Object.values(KINDS).reduce((n, k) => n + Object.keys(k.variants).length, 0)
  assert.ok(variants >= 45, `${variants} variants`)
  assert.ok(PRESETS.length >= 12)
  assert.ok(TEMPLATES.length >= 12)
  // Every kind has editor fields; every list kind has its list key in the fields.
  for (const k of Object.keys(KINDS)) {
    assert.ok(KIND_UI[k]?.fields.length, `${k} has editor fields`)
    if (LIST_KEY[k]) assert.ok(KIND_UI[k].fields.some(f => f.key === LIST_KEY[k]), `${k} edits its ${LIST_KEY[k]}`)
  }
  assert.equal(new Set(PRESETS.map(p => p.id)).size, PRESETS.length, "unique theme ids")
})

test("requests are matched to the right starter template", () => {
  const cases = [
    ["Unisex salon in Noida with bridal makeup and hair spa", "salon"],
    ["CrossFit gym with personal trainers and monthly memberships", "fitness"],
    ["IELTS and JEE coaching institute with weekend batches", "education"],
    ["Builder selling 2BHK flats and villa plots in Pune", "realestate"],
    ["Animal rescue NGO that needs volunteers and donations", "nonprofit"],
    ["Dental clinic with online appointments", "service"],
    ["Biryani cloud kitchen with home delivery", "restaurant"],
    ["Handmade jewellery online store", "shop"],
    ["Wedding of Riya and Arjun with the function schedule", "event"],
    ["SaaS invoicing app with subscription plans", "saas"],
    ["Portfolio of a freelance photographer", "portfolio"],
    ["CA firm offering tax and audit services", "business"],
  ]
  for (const [text, id] of cases) assert.equal(rankTemplates(text)[0].template.id, id, text)
})

test("a reviewed plan with generic sections still gets its business's template (live case)", () => {
  // The first live salon plan only had generic sections; it was built with the business template.
  const text = "Glow Studio – unisex salon in Sector 18 Noida, haircut, hair colour, facials and bridal makeup with prices, online appointment booking. Glow Studio Unisex salon offering haircuts, colour, facials, bridal makeup."
  assert.equal(rankTemplates(text, ["hero", "features", "pricing", "faq", "footer"])[0].template.id, "salon")
})

test("new section names map to the new kinds", () => {
  const cases = [
    [{ id: "hours", name: "Opening hours" }, "hours"], [{ id: "timings", name: "Timings" }, "hours"],
    [{ id: "process", name: "Our process" }, "steps"], [{ id: "help", name: "How you can help" }, "steps"],
    [{ id: "featured", name: "Featured project" }, "highlight"], [{ id: "special", name: "Chef's special" }, "highlight"],
    [{ id: "courses", name: "Courses" }, "menu"], [{ id: "listings", name: "Listings" }, "menu"],
    [{ id: "batches", name: "Batches" }, "events"], [{ id: "join", name: "Get involved" }, "cta"],
  ]
  for (const [s, kind] of cases) assert.equal(mapKind(s), kind, JSON.stringify(s))
})

test("every template renders a valid page in every theme, with content for each section", () => {
  for (const tpl of TEMPLATES) {
    const b = buildBlueprint({ text: tpl.tags.slice(0, 3).join(" "), rand: seeded(7) })
    assert.equal(b.template, tpl.id, `${tpl.id} is chosen for its own tags`)
    const content = { brand: "Test", sections: Object.fromEntries(b.sections.map(s => [s.id, sample(s.kind)])) }
    for (const preset of PRESETS) {
      const { html, dropped } = assembleSite({ ...b, preset }, content)
      assert.deepEqual(dropped, [], `${tpl.id}/${preset.id} dropped sections`)
      const v = validateDocument(html)
      assert.ok(v.valid && !v.warnings.includes("duplicate_ids"), `${tpl.id}/${preset.id}: ${v.reasons} ${v.warnings}`)
    }
  }
})

test("each template's content prompt stays well inside the free-tier request budget", () => {
  for (const tpl of TEMPLATES) {
    const b = buildBlueprint({ text: tpl.tags.slice(0, 3).join(" "), rand: seeded(3) })
    const p = buildContentPrompt(tpl.tags.slice(0, 3).join(" "), b, null)
    // ~4 chars per token: the prompt plus 3,500 output tokens must fit Groq's ~8k per request.
    assert.ok(p.length / 4 + 3500 < 7500, `${tpl.id}: prompt ${p.length} chars`)
  }
})

test("the same request produces visibly different designs across generations", () => {
  const text = "A cosy cafe called Chai Corner"
  const looks = new Set()
  for (let seed = 1; seed <= 25; seed++) {
    const b = buildBlueprint({ text, rand: seeded(seed * 97) })
    looks.add(`${b.preset.id}|${b.sections.map(s => s.variant).join(",")}`)
  }
  assert.ok(looks.size >= 15, `${looks.size} distinct looks out of 25`)
})

test("features force the designs that implement them", () => {
  const plan = {
    title: "T", summary: "", style: {},
    sections: [{ id: "nav", name: "Nav" }, { id: "faq", name: "FAQ" }, { id: "reviews", name: "Reviews" }, { id: "footer", name: "Footer" }],
    features: [{ kind: "accordion", text: "FAQ" }, { kind: "carousel", text: "Reviews" }],
  }
  for (let seed = 1; seed <= 20; seed++) {
    const b = buildBlueprint({ text: "", plan, rand: seeded(seed) })
    assert.equal(b.sections.find(s => s.kind === "faq").variant, "accordion")
    assert.equal(b.sections.find(s => s.kind === "testimonials").variant, "carousel")
    const { html } = assembleSite(b, { sections: Object.fromEntries(b.sections.map(s => [s.id, sample(s.kind)])) }, { plan })
    assert.deepEqual(checkPlan(html, plan).features.map(f => f.status), ["found", "found"])
  }
})

test("booking forms fit the business: tables for restaurants, appointments elsewhere", () => {
  const formOf = (text) => {
    const b = buildBlueprint({ text, rand: seeded(5) })
    const contact = b.sections.find(s => s.kind === "contact")
    return assembleSite(b, { sections: { [contact.id]: { heading: "Book" } } }).html
  }
  const cafe = formOf("A cafe with table booking")
  assert.match(cafe, /name="guests"/)
  assert.doesNotMatch(cafe, /name="time"/)
  const salon = formOf("Unisex salon with bridal makeup")
  assert.match(salon, /name="time"/)
  assert.doesNotMatch(salon, /name="guests"/)
  assert.doesNotMatch(formOf("CA firm offering audit services"), /name="date"/)
  // Builds stored before booking types existed (booking: true) keep the table form.
  assert.equal(serializeBlueprint({ ...buildBlueprint({ text: "cafe", rand: seeded(1) }), booking: true }).booking, "table")
})

test("joined emoji are kept; text or markup in an emoji field is not", () => {
  const b = { template: "x", templateScore: 1, preset: PRESETS[0], features: [], booking: false, filter: false,
    sections: [{ id: "team", name: "Team", purpose: "", kind: "team", variant: "grid" }] }
  const html = (emoji) => assembleSite(b, { sections: { team: { members: [{ name: "Ravi", emoji }] } } }).html
  assert.match(html("👨‍🍳"), /👨‍🍳/)
  assert.match(html("💆‍♀️"), /💆‍♀️/)
  for (const bad of ["<b>", "chef", "x\"y", "12"]) assert.ok(!html(bad).includes(`>${bad}<`), bad)
})

test("icon names render as theme-coloured SVG; older emoji content still works", () => {
  const b = { template: "x", templateScore: 1, preset: PRESETS[0], features: [], booking: false, filter: false,
    sections: [["hero", "split"], ["features", "cards"], ["team", "grid"], ["contact", "split"]].map(([kind, variant]) => ({ id: kind, name: kind, purpose: "", kind, variant })) }
  const html = assembleSite(b, { sections: {
    hero: { heading: "Hi", icon: "scissors" },
    features: { items: [{ icon: "shield", title: "Safe", text: "x" }, { icon: "🙂", title: "Old emoji", text: "y" }, { icon: "not-an-icon", title: "Fallback", text: "z" }] },
    team: { members: [{ name: "Ravi", emoji: "👨‍🍳" }] },
    contact: { phone: "+91 98100 12345" },
  } }).html
  assert.match(html, /class="gw-hero-visual gw-art"[\s\S]*?<svg class="gw-svg"/, "hero art with an SVG icon")
  assert.ok((html.match(/<svg class="gw-svg"/g) || []).length >= 4, "feature, hero, fallback star and contact icons")
  assert.match(html, /🙂/)
  assert.match(html, /👨‍🍳/)
  assert.doesNotMatch(html, /not-an-icon/)
  assert.doesNotMatch(html, /📞/, "contact info uses SVG icons")
  assert.ok(validateDocument(html).valid)
})

test("the content prompt asks for icons by name, exact counts and no invented contact details", () => {
  const b = buildBlueprint({ text: "salon in Noida", rand: seeded(2) })
  const p = buildContentPrompt("salon in Noida", b, null)
  assert.match(p, /use only these names — check, star/)
  assert.match(p, /Never invent contact details/)
  assert.match(p, /exactly 3 items/)
  assert.doesNotMatch(p, /"emoji":"one emoji"/)
})

// Realistic content for any kind (what a good model answer looks like).
function sample(kind) {
  const item = { name: "Masala Chai", description: "Spiced tea", price: "₹40", title: "Fresh daily", text: "Made every morning.", quote: "Lovely place.", role: "Regular",
    q: "Do you deliver?", a: "Yes, within 5 km.", caption: "Morning brew", emoji: "☕", icon: "☕", date: "Sat 7 PM", day: "Mon – Sun", time: "8 AM – 10 PM", value: 120, suffix: "+", label: "happy guests", bio: "Ten years of experience." }
  return {
    brand: "Chai Corner", heading: "Section heading", intro: "A short intro.", subheading: "A short subheading.", primaryCta: "Visit us", secondaryCta: "Call",
    paragraphs: ["First paragraph.", "Second paragraph."], highlights: [{ value: "5+", label: "years" }], items: [item, { ...item, name: "Samosa", title: "Warm", q: "Parking?" }],
    members: [{ name: "Ravi", role: "Chef", bio: "Ten years.", emoji: "👨‍🍳" }], plans: [{ name: "Basic", price: "₹499", period: "/month", features: ["One"], cta: "Join" }, { name: "Pro", price: "₹999", period: "/month", features: ["Two"], cta: "Join", highlighted: true }],
    points: ["Fresh", "Local"], text: "Highlight text.", button: "Book now", address: "Ghaziabad", phone: "+91 98765 43210", email: "hi@example.com", hours: "8 AM – 10 PM", tagline: "Since 2019", note: "Closed on Diwali",
  }
}
