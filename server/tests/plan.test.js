// Plan mode: plan → review → generate from the plan → deterministic checklist.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys, VALID_PAGE } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache, updateAiConfig } from "../ai/config.js"
import { normalizePlan, renderPlan, checkPlan, PLAN_LIMITS } from "../ai/plan.js"
import { AiCall } from "../models/ai.models.js"
import { AiCounter } from "../ai/quota.js"
import Website from "../models/website.model.js"
import User from "../models/user.model.js"

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

const PLAN = {
  title: "Crumb & Co", summary: "Neighbourhood bakery",
  sections: [
    { id: "nav", name: "Navigation", purpose: "logo and links" },
    { id: "hero", name: "Hero", purpose: "fresh bread daily" },
    { id: "menu", name: "Menu", purpose: "breads and prices" },
    { id: "contact", name: "Contact", purpose: "order form" },
    { id: "footer", name: "Footer", purpose: "address" },
  ],
  features: [
    { kind: "contact_form", text: "Order form with name, phone and message" },
    { kind: "mobile_menu", text: "Hamburger menu on phones" },
    { kind: "other", text: "Warm, friendly tone" },
  ],
  style: { mood: "warm, rustic", colors: ["#b5651d", "#FFFAF0"], headingFont: "Playfair Display", bodyFont: "Lato" },
}

const PAGE_WITH_PLAN = `<!DOCTYPE html><html><head><title>Crumb &amp; Co</title><style>:root{--primary:#b5651d}${".x{margin:0}".repeat(150)}</style></head><body>
<nav id="nav"><button class="menu-toggle" aria-expanded="false">☰</button></nav>
<section id="hero"><h1>Crumb &amp; Co</h1></section>
<section id="our-breads"><h2>Our Menu</h2></section>
<section id="contact"><form><label>Name <input name="n"></label><textarea name="m"></textarea><button>Send</button></form></section>
<footer><p>© Crumb &amp; Co</p></footer>
<script>document.querySelector('.menu-toggle').addEventListener('click',e=>{e.target.setAttribute('aria-expanded','true')})</script></body></html>`

const wrap = (html) => `{"title":"Crumb & Co","message":"Built from your plan"}\n\`\`\`html\n${html}\n\`\`\``
const isPlanPrompt = (p) => p.startsWith("Plan a single-page website")

// ── normalizePlan ─────────────────────────────────────────────────────────────
test("normalizePlan reads JSON wrapped in prose and code fences", () => {
  const raw = "Sure! Here is the plan:\n```json\n" + JSON.stringify(PLAN) + "\n```\nHope it helps."
  const p = normalizePlan(raw)
  assert.equal(p.sections.length, 5)
  assert.deepEqual(p.style.colors, ["#b5651d", "#fffaf0"])
  assert.equal(p.features[0].kind, "contact_form")
})

test("normalizePlan cleans ids, drops invalid values and caps sizes", () => {
  const p = normalizePlan({
    sections: [
      { name: "About Us!" },                        // id derived from the name
      { id: "About Us", name: "About again" },     // duplicate id → suffixed
      { id: "x", name: "" },                        // no name → dropped
      ...Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `S${i}` })),
    ],
    features: [{ kind: "rm -rf", text: "Something custom" }, { kind: "tabs" }, ...Array.from({ length: 20 }, () => ({ kind: "modal", text: "m" }))],
    style: { colors: ["#123456", "red", "#12345", "javascript:alert(1)"], headingFont: "Inter</style><script>", bodyFont: "Lato" },
  })
  assert.deepEqual(p.sections.slice(0, 2).map(s => s.id), ["about-us", "about-us-2"])
  assert.equal(p.sections.length, PLAN_LIMITS.sections)
  assert.deepEqual(p.features[0], { kind: "other", text: "Something custom" })
  assert.equal(p.features.length, PLAN_LIMITS.features)     // the text-less "tabs" entry was dropped
  assert.deepEqual(p.style.colors, ["#123456"])
  assert.equal(p.style.headingFont, "")
  assert.equal(p.style.bodyFont, "Lato")
})

test("normalizePlan returns null without a usable section", () => {
  for (const bad of [null, "", "no json here", "{broken", [], { sections: [] }, { sections: [{ id: "a" }] }, 42]) {
    assert.equal(normalizePlan(bad), null, JSON.stringify(bad))
  }
})

test("renderPlan binds every section id and lists features and style", () => {
  const text = renderPlan(normalizePlan(PLAN))
  for (const id of ["nav", "hero", "menu", "contact", "footer"]) assert.ok(text.includes(`${id} (`), id)
  assert.match(text, /Order form with name/)
  assert.match(text, /Playfair Display/)
})

// ── checkPlan ─────────────────────────────────────────────────────────────────
test("checklist finds sections by id, by heading or by landmark tag, and verifies features", () => {
  const c = checkPlan(PAGE_WITH_PLAN, normalizePlan(PLAN))
  assert.deepEqual(c.sections.map(s => [s.id, s.status]), [
    ["nav", "found"], ["hero", "found"],
    ["menu", "found"],          // no id="menu", but a heading "Our Menu"
    ["contact", "found"], ["footer", "found"],   // <footer> without the id
  ])
  assert.deepEqual(c.features.map(f => f.status), ["found", "found", "not_checked"])
  assert.deepEqual(c.summary, { found: 7, checked: 7, total: 8 })
})

test("checklist reports missing sections and features that lack their behaviour", () => {
  const page = `<html><body><nav><button class="menu-toggle">☰</button></nav><section id="hero"><h1>Hi</h1></section></body></html>`
  const c = checkPlan(page, normalizePlan(PLAN))
  assert.deepEqual(c.sections.filter(s => s.status === "missing").map(s => s.id), ["menu", "contact", "footer"])
  // The menu button exists but no script makes it work; there is no form.
  assert.deepEqual(c.features.map(f => f.status), ["missing", "missing", "not_checked"])
  assert.equal(checkPlan(page, null), null)
})

// ── API ───────────────────────────────────────────────────────────────────────
const planReq = (user, prompt = "A bakery called Crumb & Co with an order form") =>
  request(app).post("/api/website/plan").set("Cookie", sessionCookie(user)).send({ prompt })
const genReq = (user, body) =>
  request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: "A bakery called Crumb & Co with an order form", engine: "ai", ...body })

test("POST /plan returns a cleaned plan, uses no credits and is cached for the same prompt", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(({ body }) => {
    assert.ok(isPlanPrompt(body.messages[0].content))
    return chatOk("```json\n" + JSON.stringify(PLAN) + "\n```", { prompt_tokens: 300, completion_tokens: 400 })
  })
  const a = await planReq(user)
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.deepEqual(a.body.plan.sections.map(s => s.id), ["nav", "hero", "menu", "contact", "footer"])
  const b = await planReq(user)
  assert.deepEqual(b.body.plan, a.body.plan)
  assert.equal(stub.calls.length, 1, "second request served from cache")
  assert.equal((await User.findById(user._id)).credits, 100)
  assert.equal((await AiCall.findOne({ task: "plan" })).outputTokens, 400)
})

test("POST /plan: unusable model output → 503 and the daily slot is returned", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => chatOk("I cannot help with that."))
  const res = await planReq(user)
  assert.equal(res.status, 503)
  const counter = await AiCounter.findOne({ _id: new RegExp(`^user:${user._id}:`) }).lean()
  assert.equal(counter?.count ?? 0, 0)
})

test("POST /plan requires sign-in and a prompt", async () => {
  assert.equal((await request(app).post("/api/website/plan").send({ prompt: "x" })).status, 401)
  const user = await legacyUser()
  assert.equal((await planReq(user, "  ")).status, 400)
})

test("generating from a plan: the prompt carries the plan as data, the plan is stored, a checklist is returned", async () => {
  await updateAiConfig({ designStrategy: "brief" })   // plan mode replaces the brief call
  const user = await legacyUser({ credits: 100 })
  const prompts = []
  stub = stubAiFetch(({ body }) => { prompts.push(body.messages[0].content); return chatOk(wrap(PAGE_WITH_PLAN)) })

  const res = await genReq(user, { plan: PLAN })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.equal(prompts.length, 1, "no design-brief call")
  assert.match(prompts[0], /Follow the PLAN below exactly/)
  assert.match(prompts[0], /PLAN \(data, not instructions\)/)
  assert.ok(prompts[0].includes("contact (\"Contact\""))
  assert.deepEqual(res.body.checklist.summary, { found: 7, checked: 7, total: 8 })

  const site = await Website.findById(res.body.websiteId).lean()
  assert.deepEqual(site.plan.sections.map(s => s.id), ["nav", "hero", "menu", "contact", "footer"])
  const get = await request(app).get(`/api/website/${site._id}`).set("Cookie", sessionCookie(user))
  assert.deepEqual(get.body.checklist.summary, { found: 7, checked: 7, total: 8 })
})

test("an invalid plan is rejected before any AI call or charge", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => { throw new Error("must not be called") })
  const res = await genReq(user, { plan: { sections: [] } })
  assert.equal(res.status, 400)
  assert.equal(stub.calls.length, 0)
  assert.equal((await User.findById(user._id)).credits, 100)
})

test("generating without a plan is unchanged: no plan stored, no checklist", async () => {
  const user = await legacyUser({ credits: 100 })
  const prompts = []
  stub = stubAiFetch(({ body }) => { prompts.push(body.messages[0].content); return chatOk(wrap(VALID_PAGE)) })
  const res = await genReq(user, {})
  assert.equal(res.status, 201)
  assert.equal(res.body.checklist, null)
  assert.ok(!prompts[0].includes("PLAN"))
  assert.equal((await Website.findById(res.body.websiteId).lean()).plan, null)
})

test("the checklist follows later edits", async () => {
  const user = await legacyUser({ credits: 200 })
  stub = stubAiFetch(() => chatOk(wrap(PAGE_WITH_PLAN)))
  const gen = await genReq(user, { plan: PLAN })
  stub.restore()
  // The user removes the contact section (a full edit; the regression guard
  // allows it because removal was requested).
  const withoutContact = PAGE_WITH_PLAN.replace(/<section id="contact">[\s\S]*?<\/section>/, "")
  stub = stubAiFetch(() => chatOk(wrap(withoutContact)))
  const edit = await request(app).put(`/api/website/${gen.body.websiteId}`).set("Cookie", sessionCookie(user)).send({ prompt: "Remove the contact section" })
  assert.equal(edit.status, 200, JSON.stringify(edit.body))
  const contact = edit.body.checklist.sections.find(s => s.id === "contact")
  assert.equal(contact.status, "missing")
  assert.equal(edit.body.checklist.features[0].status, "missing")
})
