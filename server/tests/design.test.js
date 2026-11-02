// No-AI design editor: theme, layout, sections and text change without any
// AI call or credits; later AI/code edits are never lost silently.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys, VALID_PAGE } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache } from "../ai/config.js"
import { validateDocument } from "../ai/validate.js"
import { PRESETS } from "../library/presets.js"
import { rebuild, rethemeFiles, validateDesign, designState } from "../services/design.js"
import { hashFiles } from "../services/versions.js"
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

const PROMPT = "A cosy cafe in Ghaziabad called Chai Corner with menu, reviews and table booking"
const contentFor = (prompt) => {
  const ids = [...prompt.matchAll(/^- "([^"]+)" \((\w+)/gm)].map(m => m[1])
  return JSON.stringify({ title: "Chai Corner Café", brand: "Chai Corner", sections: Object.fromEntries(ids.map(id => [id, {
    heading: `${id} heading`, intro: "Fresh and local.", paragraphs: ["Since 2019."], subheading: "Chai and snacks.",
    items: [{ name: "Masala Chai", price: "₹40", title: "Masala Chai", text: "Spiced", quote: "Lovely", q: "Open?", a: "Yes.", caption: "Brew", emoji: "☕" }],
  }])) })
}

async function makeSite({ engine = "hybrid", credits = 200 } = {}) {
  const user = await legacyUser({ credits })
  stub = stubAiFetch(({ body }) => chatOk(engine === "hybrid" ? contentFor(body.messages[0].content) : `{"title":"x","message":"y"}\n\`\`\`html\n${VALID_PAGE}\n\`\`\``))
  const res = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: PROMPT, engine })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  stub.restore()
  // From here on, any AI call is a failure: design changes must not use AI.
  stub = stubAiFetch(() => { throw new Error("design changes must not call AI") })
  const id = res.body.websiteId, cookie = sessionCookie(user)
  return {
    user, id, cookie,
    design: async () => (await request(app).get(`/api/website/${id}/design`).set("Cookie", cookie)).body,
    apply: (design, extra = {}) => request(app).put(`/api/website/${id}/design`).set("Cookie", cookie).send({ design, ...extra }),
  }
}
const credits = async (user) => (await User.findById(user._id)).credits

test("template sites store their build; the design is available and in sync", async () => {
  const s = await makeSite()
  const site = await Website.findById(s.id).lean()
  assert.equal(site.build.v, 1)
  assert.equal(site.build.filesHash, hashFiles([{ path: "index.html", content: site.latestCode }]))
  const [v1] = await ProjectVersion.find({ project: s.id }).lean()
  assert.equal(v1.build.blueprint.preset, site.build.blueprint.preset)
  const d = await s.design()
  assert.equal(d.available, true)
  assert.equal(d.inSync, true)
  assert.deepEqual(d.design.sections.map(x => x.kind), site.build.blueprint.sections.map(x => x.kind))
})

test("the library lists every theme and section kind with variants and fields", async () => {
  const user = await legacyUser()
  assert.equal((await request(app).get("/api/website/library")).status, 401)
  const r = await request(app).get("/api/website/library").set("Cookie", sessionCookie(user))
  assert.equal(r.status, 200)
  assert.equal(r.body.presets.length, PRESETS.length)
  for (const k of ["hero", "menu", "testimonials", "contact", "footer"]) {
    assert.ok(r.body.kinds[k].variants.length >= 1 && r.body.kinds[k].fields.length >= 1, k)
  }
})

test("theme change: no AI, no credits, a 'design' version, still in sync", async () => {
  const s = await makeSite()
  const before = await credits(s.user)
  const d = (await s.design()).design
  const next = PRESETS.find(p => p.id !== d.preset && p.dark)
  const r = await s.apply({ ...d, preset: next.id })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.ok(r.body.code.includes(`--bg:${next.colors.bg}`))
  assert.match(r.body.code, /data-theme="dark"/)
  assert.equal(r.body.inSync, true)
  assert.equal(await credits(s.user), before)
  assert.equal(stub.calls.length, 0)
  const head = await ProjectVersion.findOne({ project: s.id }).sort({ seq: -1 }).lean()
  assert.equal(head.source, "design")
  assert.match(head.label, /theme/i)
})

test("sections: change design, reorder, remove, edit text and add a new one", async () => {
  const s = await makeSite()
  const d = (await s.design()).design
  const menu = d.sections.find(x => x.kind === "menu")
  const testimonials = d.sections.find(x => x.kind === "testimonials")
  const sections = d.sections.filter(x => x !== testimonials).map(x => x === menu ? { ...x, variant: menu.variant === "list" ? "cards" : "list", name: "Our Chai" } : x)
  // Move the menu right after the hero and add an FAQ before the footer.
  const order = [sections[0], sections[1], sections.find(x => x.id === menu.id), ...sections.slice(2).filter(x => x.id !== menu.id)]
  order.splice(order.length - 1, 0, { id: "faq", kind: "faq", variant: "accordion", name: "FAQ" })
  const content = structuredClone(d.content)
  content.sections[menu.id].items = [{ name: "Kulhad Chai", price: "₹55", description: "Clay cup" }]
  content.sections.faq = { heading: "Questions", items: [{ q: "Parking?", a: "Free, outside." }] }
  const r = await s.apply({ ...d, sections: order, content })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const html = r.body.code
  assert.ok(validateDocument(html).valid)
  assert.ok(html.includes("Kulhad Chai") && html.includes("₹55") && !html.includes("Masala Chai</h3>"))
  assert.ok(!html.includes(`id="${testimonials.id}"`), "removed section is gone")
  assert.match(html, /<details class="gw-faq-item"/)
  const ids = [...html.matchAll(/<(?:nav|section|footer) id="([^"]+)"/g)].map(m => m[1])
  assert.ok(ids.indexOf(menu.id) < ids.indexOf("faq"), "new order applied")
  assert.match(html, />Our Chai</)   // renamed in the navigation
  assert.equal(stub.calls.length, 0)
})

test("switching single ↔ multi-page", async () => {
  const s = await makeSite()
  const d = (await s.design()).design
  const multi = await s.apply({ ...d, multiPage: true })
  assert.equal(multi.status, 200, JSON.stringify(multi.body))
  assert.equal(multi.body.kind, "static")
  assert.ok(multi.body.files.length > 1)
  assert.equal((await Website.findById(s.id).lean()).kind, "static")
  const single = await s.apply({ ...d, multiPage: false })
  assert.equal(single.body.kind, "single_html")
  const site = await Website.findById(s.id).lean()
  assert.equal(site.files, undefined)
  assert.equal(single.body.inSync, true)
})

test("after a code edit: structural changes need confirmation; a theme change keeps the edit", async () => {
  const s = await makeSite()
  const original = (await Website.findById(s.id).lean()).latestCode
  const edited = original.replace("</h1>", " — open late</h1>")
  assert.equal((await request(app).patch(`/api/website/${s.id}/code`).set("Cookie", s.cookie).send({ code: edited })).status, 200)
  const state = await s.design()
  assert.equal(state.inSync, false)
  const d = state.design

  // Structural change without force: refused, nothing changes.
  const refused = await s.apply({ ...d, sections: d.sections.filter(x => x.kind !== "testimonials") })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, "DIVERGED")
  assert.equal((await Website.findById(s.id).lean()).latestCode, edited)

  // Theme only: swapped in place, the manual edit survives, still not in sync.
  const next = PRESETS.find(p => p.id !== d.preset)
  const themed = await s.apply({ ...d, preset: next.id })
  assert.equal(themed.status, 200, JSON.stringify(themed.body))
  assert.match(themed.body.code, /open late/)
  assert.ok(themed.body.code.includes(`--primary:${next.colors.primary}`))
  assert.equal(themed.body.inSync, false)

  // With force the site is rebuilt; the edit is gone from the site but kept in History.
  const forced = await s.apply({ ...themed.body.design, sections: d.sections.filter(x => x.kind !== "testimonials") }, { force: true })
  assert.equal(forced.status, 200, JSON.stringify(forced.body))
  assert.doesNotMatch(forced.body.code, /open late/)
  assert.ok(forced.body.code.includes(`--primary:${next.colors.primary}`), "theme choice kept")
  assert.equal(forced.body.inSync, true)
  const sources = (await ProjectVersion.find({ project: s.id }).sort({ seq: 1 }).lean()).map(v => v.source)
  assert.deepEqual(sources, ["generate", "manual_save", "design", "design"])
})

test("invalid designs are refused with a clear message and change nothing", async () => {
  const s = await makeSite()
  const d = (await s.design()).design
  const code = (await Website.findById(s.id).lean()).latestCode
  const nav = d.sections.find(x => x.kind === "nav")
  const bad = [
    { ...d, preset: "neon-hack" },
    { ...d, sections: [] },
    { ...d, sections: [...d.sections, { id: "x", kind: "carousel3d", variant: "a", name: "X" }] },
    { ...d, sections: [...d.sections, { id: "x", kind: "faq", variant: "spinning", name: "X" }] },
    { ...d, sections: [...d.sections, { ...d.sections[1] }] },                       // duplicate id
    { ...d, sections: [...d.sections, { id: "../x", kind: "faq", variant: "accordion", name: "X" }] },
    { ...d, sections: [...d.sections, { ...nav, id: "nav-2" }] },                     // two navigations
    { ...d, sections: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, kind: "content", variant: "cards", name: `S${i}` })) },
    { ...d, content: { sections: { big: { heading: "x".repeat(120_000) } } } },
    null,
  ]
  for (const design of bad) {
    const r = await s.apply(design)
    assert.equal(r.status, 400, JSON.stringify(design)?.slice(0, 120))
    assert.ok(r.body.message)
  }
  assert.equal((await Website.findById(s.id).lean()).latestCode, code)
})

test("navigation is always first and the footer last; text is escaped", async () => {
  const s = await makeSite()
  const d = (await s.design()).design
  const reversed = [...d.sections].reverse()
  const content = structuredClone(d.content)
  const hero = d.sections.find(x => x.kind === "hero")
  content.sections[hero.id].heading = `<img src=x onerror=alert(1)>Hi`
  const r = await s.apply({ ...d, sections: reversed, content })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const ids = [...r.body.code.matchAll(/<(nav|section|footer) id="/g)].map(m => m[1])
  assert.equal(ids[0], "nav")
  assert.equal(ids.at(-1), "footer")
  assert.ok(!r.body.code.includes("<img src=x"))
  assert.match(r.body.code, /&lt;img src=x onerror=alert\(1\)&gt;Hi/)
})

test("sites not built from templates have no design editor", async () => {
  const s = await makeSite({ engine: "ai" })
  const d = await s.design()
  assert.equal(d.available, false)
  const r = await s.apply({ preset: PRESETS[0].id, sections: [{ id: "a", kind: "hero", variant: "centered", name: "A" }] })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, "NOT_TEMPLATE")
})

test("restoring an older version restores its design state too", async () => {
  const s = await makeSite()
  const d = (await s.design()).design
  const next = PRESETS.find(p => p.id !== d.preset)
  await s.apply({ ...d, preset: next.id, multiPage: true })
  const v1 = (await request(app).get(`/api/website/${s.id}/versions`).set("Cookie", s.cookie)).body.versions.find(v => v.seq === 1)
  const r = await request(app).post(`/api/website/${s.id}/versions/${v1.id}/restore`).set("Cookie", s.cookie)
  assert.equal(r.status, 200)
  const after = await s.design()
  assert.equal(after.design.preset, d.preset)
  assert.equal(after.design.multiPage, false)
  assert.equal(after.inSync, true)
  assert.equal((await Website.findById(s.id).lean()).kind, "single_html")
})

test("other users cannot read or change a site's design", async () => {
  const s = await makeSite()
  const other = sessionCookie(await legacyUser())
  assert.equal((await request(app).get(`/api/website/${s.id}/design`).set("Cookie", other)).status, 404)
  const d = (await s.design()).design
  assert.equal((await request(app).put(`/api/website/${s.id}/design`).set("Cookie", other).send({ design: d })).status, 404)
})

test("an in-place theme swap gives exactly the page a rebuild would", async () => {
  const s = await makeSite()
  const site = await Website.findById(s.id).lean()
  const next = PRESETS.find(p => p.id !== site.build.blueprint.preset).id
  const design = validateDesign({ ...designState(site).design, preset: next }, site.build)
  const rebuilt = rebuild(site.build, design).files
  // A site that already uses an explicitly chosen theme (pureTheme) swaps
  // tokens identically to a rebuild.
  const pure = rebuild({ ...site.build, blueprint: { ...site.build.blueprint, pureTheme: true } }, { ...design, preset: site.build.blueprint.preset }).files
  const swapped = rethemeFiles(pure, next).files
  assert.equal(hashFiles(swapped), hashFiles(rebuilt))
})
