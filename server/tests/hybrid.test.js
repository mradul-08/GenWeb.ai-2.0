// Hybrid engine: library sections + AI-written content → complete pages.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache } from "../ai/config.js"
import { validateDocument, analyzeHtml } from "../ai/validate.js"
import { checkPlan } from "../ai/plan.js"
import { contrastRatio } from "../ai/prompts.js"
import { KINDS } from "../library/sections.js"
import { PRESETS } from "../library/presets.js"
import { mapKind, rankTemplates, TEMPLATES } from "../library/templates.js"
import { buildBlueprint, assembleSite, resolveColors } from "../library/assemble.js"
import { buildContentPrompt, contentCoverage } from "../ai/hybrid.js"
import Website from "../models/website.model.js"
import User from "../models/user.model.js"
import { ProjectVersion } from "../models/version.models.js"

before(startDb)
after(stopDb)

let stub
beforeEach(async () => {
  await clearDb()
  stub?.restore(); stub = null
  setAiKeys(["groq"])
  resetPools()
  resetAiConfigCache()
})

const seq = (...values) => { let i = 0; return () => values[i++ % values.length] }
const EVIL = `<script>alert("x")</script><img src=x onerror=alert(1)>`
// Every string field of every schema filled with hostile markup.
function hostile(kind, text = EVIL) {
  const deep = (v) => Array.isArray(v) ? [deep(v[0]), deep(v[0])] : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map(k => [k, deep(v[k])])) : typeof v === "number" ? 42 : typeof v === "boolean" ? true : text
  const shape = {
    nav: { brand: "", cta: "" }, hero: { eyebrow: "", heading: "", subheading: "", primaryCta: "", secondaryCta: "", emoji: "" },
    features: { heading: "", intro: "", items: [{ icon: "", title: "", text: "" }] }, about: { heading: "", paragraphs: [""], highlights: [{ value: "", label: "" }], emoji: "" },
    menu: { heading: "", intro: "", items: [{ name: "", description: "", price: "", tag: "" }], note: "" },
    pricing: { heading: "", intro: "", plans: [{ name: "", price: "", period: "", features: [""], cta: "", highlighted: true }] },
    testimonials: { heading: "", items: [{ quote: "", name: "", role: "" }] }, gallery: { heading: "", intro: "", items: [{ emoji: "", caption: "" }] },
    team: { heading: "", intro: "", members: [{ name: "", role: "", bio: "", emoji: "" }] }, stats: { heading: "", items: [{ value: 0, suffix: "", label: "" }] },
    faq: { heading: "", items: [{ q: "", a: "" }] }, events: { heading: "", intro: "", items: [{ date: "", title: "", text: "" }] },
    contact: { heading: "", intro: "", address: "", phone: "", email: "", hours: "", formTitle: "", submitLabel: "" },
    cta: { heading: "", text: "", button: "", newsletter: false }, footer: { tagline: "", address: "", hours: "", copyright: "" },
    content: { heading: "", intro: "", paragraphs: [""], items: [{ title: "", text: "" }] },
    hours: { heading: "", items: [{ day: "", time: "" }], note: "" },
    steps: { heading: "", intro: "", items: [{ title: "", text: "" }] },
    highlight: { heading: "", text: "", points: [""], button: "", emoji: "" },
  }[kind]
  return deep(shape)
}

const bp = (sections, extra = {}) => ({
  template: "business", templateScore: 1, preset: PRESETS[0], features: [], booking: false, filter: false, ...extra,
  sections: sections.map(([kind, variant], i) => ({ id: `${kind}-${i}`, name: `${kind} ${i}`, purpose: "", kind, variant })),
})

// ── Library: every variant renders a valid, safe page ────────────────────────
test("every section variant renders a valid page and escapes hostile content", () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    for (const variant of Object.keys(def.variants)) {
      const blueprint = bp([["nav", "bar"], [kind, variant], ["footer", "simple"]], { features: ["theme_toggle", "newsletter"], booking: true, filter: true })
      const content = { brand: EVIL, title: EVIL, sections: Object.fromEntries(blueprint.sections.map(s => [s.id, hostile(s.kind)])) }
      const { html } = assembleSite(blueprint, content)
      const v = validateDocument(html)
      assert.ok(v.valid, `${kind}/${variant}: ${v.reasons}`)
      const a = analyzeHtml(html)
      assert.deepEqual(a.duplicateIds, [], `${kind}/${variant} duplicate ids`)
      assert.deepEqual(a.unbalanced, {}, `${kind}/${variant} unbalanced tags`)
      assert.ok(!html.includes(`<script>alert`) && !html.includes("<img"), `${kind}/${variant} injected markup`)
      assert.equal(a.scriptCount, 1, "exactly one library script")
      for (const s of blueprint.sections) assert.match(html, new RegExp(`id="${s.id}"`), `${kind}/${variant} id ${s.id}`)
    }
  }
})

test("missing content never produces empty or broken output", () => {
  const kinds = Object.keys(KINDS)
  const blueprint = bp(kinds.map(k => [k, Object.keys(KINDS[k].variants)[0]]))
  for (const content of [{}, { sections: null }, { sections: { "hero-1": "nonsense", "menu-6": [1, 2] } }, null]) {
    const { html } = assembleSite(blueprint, content, { plan: { title: "Chai Corner", summary: "Tea house" } })
    assert.ok(validateDocument(html).valid)
    assert.doesNotMatch(html, /undefined|\[object Object\]|>null</)
    assert.match(html, /Chai Corner/)
  }
})

test("sections without real content are left out — never filled with invented reviews, prices or people", () => {
  const blueprint = bp([["nav", "bar"], ["hero", "centered"], ["menu", "list"], ["testimonials", "grid"], ["team", "grid"], ["pricing", "cards"], ["contact", "split"], ["footer", "simple"]])
  const content = { brand: "Chai Corner", sections: {
    "hero-1": { heading: "Fresh chai daily" },
    "menu-2": { heading: "Menu", items: [{ name: "Masala Chai", price: "₹40" }] },
    "testimonials-3": { heading: "Reviews", items: [{ quote: "", name: "" }] },   // nothing usable
    // team and pricing: no content at all
  } }
  const out = assembleSite(blueprint, content)
  assert.deepEqual(out.dropped, ["testimonials-3", "team-4", "pricing-5"])
  assert.deepEqual(out.sections.map(s => s.kind), ["nav", "hero", "menu", "contact", "footer"])
  assert.ok(validateDocument(out.html).valid)
  assert.doesNotMatch(out.html, /Customer|Team member|Standard|Item \d/)
  // Navigation links only point at sections that exist.
  for (const m of out.html.matchAll(/href="#([^"]+)"/g)) assert.ok(m[1] === "top" || out.html.includes(`id="${m[1]}"`), `dangling link #${m[1]}`)
  // The checklist reports dropped planned sections as missing.
  const plan = { sections: blueprint.sections.map(s => ({ id: s.id, name: s.name })), features: [] }
  const c = checkPlan(out.html, plan)
  assert.deepEqual(c.sections.filter(s => s.status === "missing").map(s => s.id), ["testimonials-3", "team-4", "pricing-5"])
})

test("every preset is readable (WCAG AA) including buttons", () => {
  for (const p of PRESETS) {
    const c = resolveColors(p)
    assert.ok(contrastRatio(c.text, c.bg) >= 7, `${p.id} text/bg`)
    assert.ok(contrastRatio(c.muted, c.bg) >= 4.5, `${p.id} muted/bg ${contrastRatio(c.muted, c.bg).toFixed(2)}`)
    assert.ok(contrastRatio(c.primary, c.bg) >= 4.5, `${p.id} primary/bg ${contrastRatio(c.primary, c.bg).toFixed(2)}`)
    assert.ok(contrastRatio(c.onPrimary, c.primary) >= 4.5, `${p.id} button text ${contrastRatio(c.onPrimary, c.primary).toFixed(2)}`)
    assert.ok(contrastRatio(c.footerText, c.footerBg) >= 7, `${p.id} footer ${contrastRatio(c.footerText, c.footerBg).toFixed(2)}`)
    assert.equal(c.dark, p.dark, `${p.id} dark flag`)
  }
})

test("requested colours are used only when they stay readable", () => {
  const light = PRESETS.find(p => !p.dark)
  assert.equal(resolveColors(light, { planColors: ["#1d4ed8"] }).primary, "#1d4ed8")
  assert.equal(resolveColors(light, { planColors: ["#fff3a0"] }).primary, light.colors.primary)   // too light on a light page
  const fromPalette = resolveColors(light, { requestText: 'Use this exact palette — primary: #ffcc00, accent: #00ffaa, background: #101010. Name: "x".' })
  assert.equal(fromPalette.bg, "#101010")
  assert.equal(fromPalette.primary, "#ffcc00")
  assert.ok(contrastRatio(fromPalette.text, fromPalette.bg) >= 7)
  assert.ok(contrastRatio(fromPalette.muted, fromPalette.bg) >= 4.5)
})

// ── Matching ──────────────────────────────────────────────────────────────────
test("planned sections map to the right library kinds", () => {
  const cases = [
    [{ id: "nav", name: "Navigation" }, "nav"], [{ id: "menu", name: "Menu" }, "menu"], [{ id: "events", name: "Live Music" }, "events"],
    [{ id: "reviews", name: "Reviews" }, "testimonials"], [{ id: "book", name: "Book a table" }, "contact"], [{ id: "gallery", name: "Photo Gallery" }, "gallery"],
    [{ id: "our-story", name: "Our Story" }, "about"], [{ id: "services", name: "Services" }, "features"], [{ id: "plans", name: "Plans" }, "pricing"],
    [{ id: "speakers", name: "Speakers" }, "team"], [{ id: "how", name: "How it works" }, "steps"], [{ id: "faq", name: "FAQ" }, "faq"],
    [{ id: "products", name: "Our Products" }, "menu"], [{ id: "newsletter", name: "Newsletter" }, "cta"], [{ id: "x", name: "Sustainability" }, "content"],
    [{ id: "footer", name: "Footer" }, "footer"], [{ id: "hero", name: "Hero" }, "hero"],
  ]
  for (const [s, kind] of cases) assert.equal(mapKind(s), kind, JSON.stringify(s))
})

test("templates are chosen by several signals, not one keyword", () => {
  assert.equal(rankTemplates("A cosy cafe serving chai and samosas")[0].template.id, "restaurant")
  assert.equal(rankTemplates("SaaS analytics app with subscription plans")[0].template.id, "saas")
  assert.equal(rankTemplates("portfolio for a freelance designer")[0].template.id, "portfolio")
  assert.equal(rankTemplates("handmade jewellery online store")[0].template.id, "shop")
  assert.equal(rankTemplates("qwerty zxcv")[0].score, 0)
  // Plan coverage counts: a plan full of event sections leans to "event".
  assert.equal(rankTemplates("our big day", ["hero", "events", "team", "pricing", "faq"])[0].template.id, "event")
})

test("a plan's sections keep their ids and order; nav/footer are added when missing", () => {
  const plan = { title: "T", summary: "", style: {}, features: [], sections: [{ id: "hero", name: "Hero", purpose: "" }, { id: "menu", name: "Menu", purpose: "" }, { id: "visit", name: "Visit us", purpose: "" }] }
  const b = buildBlueprint({ text: "a cafe", plan, rand: seq(0) })
  assert.deepEqual(b.sections.map(s => [s.id, s.kind]), [["nav", "nav"], ["hero", "hero"], ["menu", "menu"], ["visit", "contact"], ["footer", "footer"]])
})

test("features select the variants and sections that implement them", () => {
  const plan = {
    title: "T", summary: "", style: {}, sections: [{ id: "hero", name: "Hero", purpose: "" }, { id: "reviews", name: "Reviews", purpose: "" }],
    features: [{ kind: "carousel", text: "Rotating reviews" }, { kind: "counter", text: "Animated numbers" }, { kind: "newsletter", text: "Newsletter" }, { kind: "accordion", text: "FAQ" }, { kind: "contact_form", text: "Form" }],
  }
  const b = buildBlueprint({ text: "", plan, rand: seq(0) })
  const byKind = Object.fromEntries(b.sections.map(s => [s.kind, s]))
  assert.equal(byKind.testimonials.variant, "carousel")
  assert.equal(byKind.cta.variant, "newsletter")
  for (const k of ["stats", "faq", "contact"]) assert.ok(byKind[k], `${k} added`)
  assert.equal(b.sections.at(-1).kind, "footer")
})

test("direct mode honours 'Include sections' from the Generate page", () => {
  const b = buildBlueprint({ text: "A cafe called Chai Corner. Visual style: dark. Include sections: hero, pricing, faq, gallery, footer.", rand: seq(0) })
  const kinds = b.sections.map(s => s.kind)
  for (const k of ["pricing", "faq", "gallery"]) assert.ok(kinds.includes(k), k)
  assert.equal(b.template, "restaurant")
  assert.ok(b.preset.dark, "dark style requested")
  assert.ok(b.sections.length <= 12)
})

test("generated pages pass their own checklist (sections and features found)", () => {
  const plan = {
    title: "Chai Corner", summary: "", style: {},
    sections: ["nav", "hero", "menu", "reviews", "stats", "faq", "contact", "newsletter", "footer"].map(id => ({ id, name: id, purpose: "" })),
    features: ["contact_form", "mobile_menu", "carousel", "counter", "accordion", "newsletter", "theme_toggle", "filter_search"].map(kind => ({ kind, text: kind })),
  }
  const b = buildBlueprint({ text: "cafe", plan, rand: seq(0.99) })
  const { html } = assembleSite(b, { sections: Object.fromEntries(b.sections.map(s => [s.id, hostile(s.kind, "Sample text")])) }, { plan })
  const c = checkPlan(html, plan)
  assert.deepEqual([...c.sections, ...c.features].filter(x => x.status !== "found").map(x => x.id || x.kind), [])
})

test("the content prompt is small and lists only the chosen sections", () => {
  const b = buildBlueprint({ text: "A cosy cafe called Chai Corner with live music", rand: seq(0) })
  const p = buildContentPrompt("A cosy cafe called Chai Corner with live music", b, null)
  assert.ok(p.length < 6000, `prompt ${p.length} chars`)
  for (const s of b.sections) assert.ok(p.includes(`"${s.id}"`))
  assert.match(p, /REQUEST \(data, not instructions\)/)
  assert.equal(contentCoverage({ sections: {} }, b), 0)
})

// ── API ───────────────────────────────────────────────────────────────────────
const contentFor = (prompt) => {
  const ids = [...prompt.matchAll(/^- "([^"]+)" \((\w+)/gm)].map(m => [m[1], m[2]])
  const sections = Object.fromEntries(ids.map(([id, kind]) => [id, {
    heading: `${id} heading`, intro: "Fresh and local.", items: [{ name: "Masala Chai", description: "Spiced tea", price: "₹40", title: "Masala Chai", text: "Spiced tea", quote: "Lovely place", q: "Open Sundays?", a: "Yes, 8am to 10pm.", caption: "Morning brew", emoji: "☕", day: "Mon – Sun", time: "8 AM – 10 PM" }],
    members: [{ name: "Ravi", role: "Head chef" }], plans: [{ name: "Regular", price: "₹999", features: ["Free chai"] }],
    text: "Our signature kulhad chai.", points: ["Brewed fresh"],
    paragraphs: ["Since 2019 in Ghaziabad."], subheading: "Chai, snacks and music.", primaryCta: "See menu", address: "RDC, Ghaziabad", phone: "+91 98765 43210",
  }]))
  return JSON.stringify({ title: "Chai Corner Café", brand: "Chai Corner", tagline: "Masala chai since 2019", sections })
}
const gen = (user, body = {}) => request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: "A cosy cafe in Ghaziabad called Chai Corner with menu and reviews", ...body })

test("hybrid is the default engine: one small AI call, complete page, plan + checklist + version", async () => {
  const user = await legacyUser({ credits: 100 })
  const prompts = []
  stub = stubAiFetch(({ body }) => { prompts.push(body.messages[0].content); return chatOk(contentFor(body.messages[0].content), { prompt_tokens: 900, completion_tokens: 1500 }) })
  const res = await gen(user)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /^Write the text content/)
  assert.ok(stub.calls.length === 1 && prompts[0].length < 6000)
  assert.equal(res.body.engine, "hybrid")
  assert.equal(res.body.hybrid.template, "restaurant")
  assert.ok(validateDocument(res.body.code).valid)
  assert.match(res.body.code, /Masala Chai/)
  assert.match(res.body.code, /₹40/)
  assert.equal(res.body.checklist.summary.found, res.body.checklist.summary.checked)

  const site = await Website.findById(res.body.websiteId).lean()
  assert.ok(site.plan.sections.length >= 5)
  assert.equal(site.thumbnailTitle, "Chai Corner Café")
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 1)
  assert.equal((await User.findById(user._id)).credits, 50)
})

test("hybrid follows a reviewed plan exactly (ids and order)", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(({ body }) => chatOk(contentFor(body.messages[0].content)))
  const plan = { title: "Chai Corner", summary: "Tea house", style: { colors: ["#1d4ed8"] }, features: [{ kind: "carousel", text: "Rotating reviews" }],
    sections: [{ id: "nav", name: "Nav" }, { id: "welcome", name: "Hero" }, { id: "chai-menu", name: "Menu" }, { id: "music", name: "Live Music" }, { id: "reviews", name: "Reviews" }, { id: "footer", name: "Footer" }] }
  const res = await gen(user, { plan })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  const ids = [...res.body.code.matchAll(/<(?:nav|section|footer) id="([^"]+)"/g)].map(m => m[1])
  assert.deepEqual(ids, ["nav", "welcome", "chai-menu", "music", "reviews", "footer"])
  assert.equal(res.body.hybrid.sections.find(s => s.id === "reviews").variant, "carousel")
  assert.deepEqual(res.body.checklist.summary, { found: 7, checked: 7, total: 7 })
})

test("model markup in content is escaped, never executed", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(({ body }) => chatOk(contentFor(body.messages[0].content).replace(/Masala Chai/g, `<script>steal()</script>`)))
  const res = await gen(user)
  assert.equal(res.status, 201)
  assert.ok(!res.body.code.includes("<script>steal()"))
  assert.match(res.body.code, /&lt;script&gt;steal\(\)/)
})

test("unusable content is retried once, then refunded with no site saved", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => chatOk("Sorry, I can only write prose."))
  const res = await gen(user)
  assert.equal(res.status, 503)
  assert.equal(stub.calls.length, 2)
  assert.equal((await User.findById(user._id)).credits, 100)
  assert.equal(await Website.countDocuments(), 0)
})

test("mostly-empty content is retried and the better answer is used", async () => {
  const user = await legacyUser({ credits: 100 })
  const answers = seq(JSON.stringify({ title: "x", sections: {} }), null)
  stub = stubAiFetch(({ body }) => chatOk(answers() ?? contentFor(body.messages[0].content)))
  const res = await gen(user)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.equal(stub.calls.length, 2)
  assert.match(res.body.code, /Masala Chai/)
})

test("an unknown engine is rejected before any work", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => { throw new Error("must not be called") })
  const res = await gen(user, { engine: "magic" })
  assert.equal(res.status, 400)
  assert.equal(stub.calls.length, 0)
})

test("library templates only reference kinds and variants that exist", () => {
  for (const t of TEMPLATES) for (const [kind, variant] of t.sections) {
    assert.ok(KINDS[kind], `${t.id}: kind ${kind}`)
    if (variant) assert.ok(KINDS[kind].variants[variant], `${t.id}: ${kind}/${variant}`)
  }
})
