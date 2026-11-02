// Multi-page ("static") sites: generation, per-page and site-wide edits,
// versions/restore of all pages, and deploy URLs.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache } from "../ai/config.js"
import { validateDocument } from "../ai/validate.js"
import { buildBlueprint, assembleSite } from "../library/assemble.js"
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

const PROMPT = "A cosy cafe in Ghaziabad called Chai Corner with menu, gallery, faq and table booking"
const contentFor = (prompt) => {
  const ids = [...prompt.matchAll(/^- "([^"]+)" \((\w+)/gm)].map(m => m[1])
  return JSON.stringify({ title: "Chai Corner Café", brand: "Chai Corner", sections: Object.fromEntries(ids.map(id => [id, {
    heading: `${id} heading`, intro: "Fresh and local.", paragraphs: ["Since 2019."], subheading: "Chai and snacks.",
    items: [{ name: "Masala Chai", price: "₹40", title: "Masala Chai", text: "Spiced", quote: "Lovely", q: "Open Sundays?", a: "Yes.", caption: "Morning brew", emoji: "☕", day: "Mon – Sun", time: "8 AM – 10 PM" }],
    text: "Our signature kulhad chai.", points: ["Brewed fresh"],
  }])) })
}
const pagesOf = (html) => [...html.matchAll(/href="([a-z0-9-]+\.html)(#[^"]*)?"/g)].map(m => m[1])

// ── Library ───────────────────────────────────────────────────────────────────
test("multi-page assembly: home + one valid page per major section, all links resolve", () => {
  const b = buildBlueprint({ text: PROMPT, rand: () => 0.3 })
  const content = JSON.parse(contentFor(b.sections.map(s => `- "${s.id}" (${s.kind}`).join("\n")))
  const out = assembleSite(b, content, { multiPage: true })
  const paths = out.files.map(f => f.path)
  assert.equal(paths[0], "index.html")
  assert.ok(paths.includes("menu.html") && paths.includes("contact.html"), paths.join())
  const byPath = Object.fromEntries(out.files.map(f => [f.path, f.content]))
  for (const f of out.files) {
    assert.ok(validateDocument(f.content).valid, f.path)
    assert.equal((f.content.match(/<h1\b/g) || []).length, 1, `${f.path}: one h1`)
    // Every link to another page (and its #anchor) exists.
    for (const m of f.content.matchAll(/href="([a-z0-9-]+\.html)?(#([^"]*))?"/g)) {
      const [, page, , anchor] = m
      const target = page ? byPath[page] : f.content
      assert.ok(target, `${f.path} → ${page}`)
      if (anchor && anchor !== "top") assert.match(target, new RegExp(`id="${anchor}"`), `${f.path} → ${page || ""}#${anchor}`)
    }
  }
  // The current page is marked in the navigation.
  assert.match(byPath["menu.html"], /<a href="#menu" aria-current="page">/)
  assert.match(byPath["index.html"], /<a href="#top" aria-current="page">Home<\/a>/)
})

// ── API ───────────────────────────────────────────────────────────────────────
async function makeSite(credits = 300) {
  const user = await legacyUser({ credits })
  stub = stubAiFetch(({ body }) => chatOk(contentFor(body.messages[0].content)))
  const res = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: PROMPT, pages: "multi" })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  stub.restore(); stub = null
  return { user, res, id: res.body.websiteId, cookie: sessionCookie(user) }
}

test("generate pages:multi stores every page, versions them together and checks the plan across pages", async () => {
  const { res, id } = await makeSite()
  assert.equal(res.body.kind, "static")
  assert.ok(res.body.files.length >= 4)
  assert.equal(res.body.checklist.summary.found, res.body.checklist.summary.checked)
  const site = await Website.findById(id).lean()
  assert.equal(site.kind, "static")
  assert.deepEqual(site.files.map(f => f.path), res.body.files.map(f => f.path))
  assert.equal(site.latestCode, site.files[0].content)
  const [v1] = await ProjectVersion.find({ project: id }).lean()
  assert.equal(v1.files.length, site.files.length)
})

test("multi-page needs the Templates engine; unknown page modes are rejected", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => { throw new Error("must not be called") })
  for (const body of [{ pages: "multi", engine: "ai" }, { pages: "many" }]) {
    const r = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: PROMPT, ...body })
    assert.equal(r.status, 400, JSON.stringify(body))
  }
  assert.equal(stub.calls.length, 0)
  assert.equal((await User.findById(user._id)).credits, 100)
})

test("an AI edit of one page changes only that page", async () => {
  const { id, cookie } = await makeSite()
  const before = (await Website.findById(id).lean()).files
  stub = stubAiFetch(() => chatOk('[{"find":"Masala Chai","replace":"Kulhad Chai"}]'))
  const r = await request(app).put(`/api/website/${id}`).set("Cookie", cookie).send({ prompt: 'change the text "Masala Chai" so it says "Kulhad Chai"', path: "menu.html" })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.path, "menu.html")
  assert.equal(r.body.siteWide, false)
  const after = (await Website.findById(id).lean()).files
  for (const f of after) {
    const old = before.find(b => b.path === f.path)
    if (f.path === "menu.html") assert.ok(f.content.includes("Kulhad Chai") && !f.content.includes("Masala Chai"))
    else assert.equal(f.content, old.content, `${f.path} must be untouched`)
  }
  assert.deepEqual(r.body.files.map(f => f.path), after.map(f => f.path))
})

test("a style edit restyles every page with one AI call", async () => {
  const { id, cookie } = await makeSite()
  stub = stubAiFetch(() => chatOk("<style>:root{--primary:#0057b8}</style>"))
  const r = await request(app).put(`/api/website/${id}`).set("Cookie", cookie).send({ prompt: "change the primary colour to blue", path: "contact.html" })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.siteWide, true)
  assert.equal(stub.calls.length, 1)
  const files = (await Website.findById(id).lean()).files
  for (const f of files) {
    assert.equal((f.content.match(/<style data-gw-edit>/g) || []).length, 1, f.path)
    assert.match(f.content, /--primary:#0057b8/)
    assert.ok(validateDocument(f.content).valid)
  }
  const head = await ProjectVersion.findOne({ project: id }).sort({ seq: -1 }).lean()
  assert.match(head.label, /\(all pages\)/)
})

test("editing a missing or malformed page path fails before any AI call or charge", async () => {
  const { id, cookie, user } = await makeSite()
  const credits = (await User.findById(user._id)).credits
  stub = stubAiFetch(() => { throw new Error("must not be called") })
  for (const [path, status] of [["nope.html", 404], ["../index.html", 400], ["menu", 400], ["a/b.html", 400]]) {
    const r = await request(app).put(`/api/website/${id}`).set("Cookie", cookie).send({ prompt: "make it blue", path })
    assert.equal(r.status, status, path)
    const s = await request(app).patch(`/api/website/${id}/code`).set("Cookie", cookie).send({ code: "<!DOCTYPE html><html><body>x</body></html>", path })
    assert.equal(s.status, status, `save ${path}`)
  }
  assert.equal(stub.calls.length, 0)
  assert.equal((await User.findById(user._id)).credits, credits)
})

test("concurrent saves of different pages both survive", async () => {
  const { id, cookie } = await makeSite()
  const page = (t) => `<!DOCTYPE html><html><head><title>${t}</title></head><body><h1>${t}</h1></body></html>`
  const results = await Promise.all([
    request(app).patch(`/api/website/${id}/code`).set("Cookie", cookie).send({ code: page("Menu v2"), path: "menu.html" }),
    request(app).patch(`/api/website/${id}/code`).set("Cookie", cookie).send({ code: page("Contact v2"), path: "contact.html" }),
  ])
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body))
  const files = Object.fromEntries((await Website.findById(id).lean()).files.map(f => [f.path, f.content]))
  assert.match(files["menu.html"], /Menu v2/)
  assert.match(files["contact.html"], /Contact v2/)
})

test("restoring a version brings back every page", async () => {
  const { id, cookie } = await makeSite()
  const original = (await Website.findById(id).lean()).files
  const page = (t) => `<!DOCTYPE html><html><head><title>${t}</title></head><body><h1>${t}</h1></body></html>`
  await request(app).patch(`/api/website/${id}/code`).set("Cookie", cookie).send({ code: page("New home"), path: "index.html" })
  await request(app).patch(`/api/website/${id}/code`).set("Cookie", cookie).send({ code: page("New menu"), path: "menu.html" })
  const v1 = (await request(app).get(`/api/website/${id}/versions`).set("Cookie", cookie)).body.versions.find(v => v.seq === 1)
  const view = await request(app).get(`/api/website/${id}/versions/${v1.id}`).set("Cookie", cookie)
  assert.deepEqual(view.body.files.map(f => f.path), original.map(f => f.path))

  const r = await request(app).post(`/api/website/${id}/versions/${v1.id}/restore`).set("Cookie", cookie)
  assert.equal(r.status, 200)
  assert.equal(r.body.version.seq, 4)
  const now = (await Website.findById(id).lean())
  assert.deepEqual(now.files, original)
  assert.equal(now.latestCode, original[0].content)
})

test("deploy: /s/slug redirects to /s/slug/, every page is served, unknown pages are 404", async () => {
  const { id, cookie } = await makeSite()
  const d = await request(app).post(`/api/website/${id}/deploy`).set("Cookie", cookie).send({})
  assert.equal(d.status, 200)
  assert.match(d.body.deployUrl, /\/s\/[a-z0-9-]+\/$/)
  const slug = d.body.slug
  const redirect = await request(app).get(`/s/${slug}`)
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.location, `/s/${slug}/`)
  const home = await request(app).get(`/s/${slug}/`)
  assert.equal(home.status, 200)
  assert.match(home.headers["content-security-policy"], /sandbox/)
  for (const p of pagesOf(home.text)) assert.equal((await request(app).get(`/s/${slug}/${p}`)).status, 200, p)
  assert.match((await request(app).get(`/s/${slug}/menu.html`)).text, /Masala Chai/)
  for (const bad of ["nope.html", "..%2Findex.html", "menu", "%2E%2E"]) assert.equal((await request(app).get(`/s/${slug}/${bad}`)).status, 404, bad)
})

test("single-page sites keep their URL and behaviour", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(({ body }) => chatOk(contentFor(body.messages[0].content)))
  const g = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: PROMPT })
  assert.equal(g.body.kind, "single_html")
  assert.equal(g.body.files, undefined)
  const site = await Website.findById(g.body.websiteId).lean()
  assert.equal(site.files, undefined)
  const d = await request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", sessionCookie(user)).send({})
  assert.match(d.body.deployUrl, /\/s\/[a-z0-9-]+$/)
  assert.equal((await request(app).get(`/s/${d.body.slug}`)).status, 200)
  assert.equal((await request(app).get(`/s/${d.body.slug}/menu.html`)).status, 404)
})
