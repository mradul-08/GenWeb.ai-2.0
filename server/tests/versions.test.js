// Server-side version history (roadmap R1): every change is an immutable
// version; restore creates a new version; legacy sites keep their old code.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, stubAiFetch, chatOk, setAiKeys, VALID_PAGE } from "./helpers.js"
import { resetPools } from "../ai/router.js"
import { resetAiConfigCache } from "../ai/config.js"
import Website from "../models/website.model.js"
import { Blob, ProjectVersion } from "../models/version.models.js"
import User from "../models/user.model.js"
import { generateSlug } from "../controllers/website.controller.js"

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

const page = (text) => `<!DOCTYPE html><html><head><title>Site</title></head><body><h1>${text}</h1></body></html>`
const wrap = (html) => `{"title":"Crumb & Co","message":"Built a bakery site"}\n\`\`\`html\n${html}\n\`\`\``

const as = (user) => ({
  list:    (site) => request(app).get(`/api/website/${site._id}/versions`).set("Cookie", sessionCookie(user)),
  get:     (site, v) => request(app).get(`/api/website/${site._id}/versions/${v}`).set("Cookie", sessionCookie(user)),
  restore: (site, v) => request(app).post(`/api/website/${site._id}/versions/${v}/restore`).set("Cookie", sessionCookie(user)),
  save:    (site, code) => request(app).patch(`/api/website/${site._id}/code`).set("Cookie", sessionCookie(user)).send({ code }),
  edit:    (site, prompt) => request(app).put(`/api/website/${site._id}`).set("Cookie", sessionCookie(user)).send({ prompt }),
  deploy:  (site, body = {}) => request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", sessionCookie(user)).send(body),
  remove:  (site) => request(app).delete(`/api/website/${site._id}`).set("Cookie", sessionCookie(user)),
})

// A website as it exists today in the database: no version history yet.
const legacySite = (user, code = page("Original")) =>
  Website.create({ user: user._id, title: "Legacy", latestCode: code, slug: `legacy-${Math.random().toString(36).slice(2, 8)}` })

test("generation creates version 1 and it is the current version", async () => {
  const user = await legacyUser({ credits: 100 })
  stub = stubAiFetch(() => chatOk(wrap(VALID_PAGE)))
  const gen = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: "A bakery called Crumb & Co", engine: "ai" })
  assert.equal(gen.status, 201, JSON.stringify(gen.body))

  const site = await Website.findById(gen.body.websiteId)
  const res = await as(user).list(site)
  assert.equal(res.status, 200)
  assert.equal(res.body.versions.length, 1)
  const [v1] = res.body.versions
  assert.deepEqual([v1.seq, v1.source, v1.label, v1.current], [1, "generate", "A bakery called Crumb & Co", true])
  assert.equal(String(site.headVersion), String(v1.id))

  const got = await as(user).get(site, v1.id)
  assert.equal(got.body.code, VALID_PAGE)
})

test("each manual save is a new version; saving identical code does not add one", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  assert.equal((await as(user).save(site, page("Two"))).status, 200)
  assert.equal((await as(user).save(site, page("Two"))).status, 200)
  assert.equal((await as(user).save(site, page("Three"))).status, 200)

  const { versions } = (await as(user).list(site)).body
  // v1 = the code the site had before history existed, kept automatically.
  assert.deepEqual(versions.map(v => [v.seq, v.source]), [[3, "manual_save"], [2, "manual_save"], [1, "migration"]])
  assert.deepEqual(versions.map(v => v.current), [true, false, false])
  assert.equal((await as(user).get(site, versions[2].id)).body.code, page("Original"))
})

test("restore brings old code back as a NEW version; history is never rewritten", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  await as(user).save(site, page("Two"))
  const v1 = (await as(user).list(site)).body.versions.find(v => v.seq === 1)

  const res = await as(user).restore(site, v1.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.code, page("Original"))
  assert.equal(res.body.version.seq, 3)

  assert.equal((await Website.findById(site._id)).latestCode, page("Original"))
  const { versions } = (await as(user).list(site)).body
  assert.deepEqual(versions.map(v => [v.seq, v.source, v.label]), [
    [3, "restore", "Restored version 1"], [2, "manual_save", "Manual edit"], [1, "migration", "Before version history"],
  ])
  // Restoring the version that is already current changes nothing.
  const again = await as(user).restore(site, versions[0].id)
  assert.equal(again.body.version.created, false)
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 3)
})

test("restore also updates the deployed site (same as a manual save)", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  assert.equal((await as(user).deploy(site, { code: page("Live two") })).status, 200)
  const slug = (await Website.findById(site._id)).slug
  assert.match((await request(app).get(`/s/${slug}`)).text, /Live two/)

  const { versions } = (await as(user).list(site)).body
  assert.deepEqual(versions.map(v => v.source), ["deploy", "migration"])
  await as(user).restore(site, versions[1].id)
  assert.match((await request(app).get(`/s/${slug}`)).text, /Original/)
})

test("an AI edit of a legacy site keeps the pre-edit code as version 1, with its conversation", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await legacySite(user, VALID_PAGE)
  stub = stubAiFetch(() => chatOk("<style>:root{--primary:#0057b8}</style>"))
  const res = await as(user).edit(site, "change the primary colour to blue")
  assert.equal(res.status, 200, JSON.stringify(res.body))

  const after = await Website.findById(site._id)
  assert.ok(after.latestCode.includes("--primary:#0057b8"))
  assert.deepEqual(after.conversation.map(m => m.role), ["user", "ai"])
  assert.ok(after.conversation[0].createdAt instanceof Date)

  const { versions } = (await as(user).list(site)).body
  assert.deepEqual(versions.map(v => [v.seq, v.source, v.label]), [[2, "ai_edit", "change the primary colour to blue"], [1, "migration", "Before version history"]])
  assert.equal((await as(user).get(site, versions[1].id)).body.code, VALID_PAGE)
  assert.equal(String(after.headVersion), String(versions[0].id))
})

test("a failed AI edit creates no version, changes no code and is refunded", async () => {
  const user = await legacyUser({ credits: 100 })
  const site = await legacySite(user, VALID_PAGE)
  stub = stubAiFetch(() => ({ status: 500 }))
  const res = await as(user).edit(site, "change the primary colour to blue")
  assert.notEqual(res.status, 200)
  assert.equal((await Website.findById(site._id)).latestCode, VALID_PAGE)
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 0)
  assert.equal((await User.findById(user._id)).credits, 100)
})

test("other users get 404 for list, view and restore; foreign or invalid version ids are 404", async () => {
  const owner = await legacyUser()
  const other = await legacyUser()
  const site = await legacySite(owner)
  const otherSite = await legacySite(other)
  await as(owner).save(site, page("Two"))
  await as(other).save(otherSite, page("Theirs"))
  const ownV = (await as(owner).list(site)).body.versions[0].id
  const foreignV = (await as(other).list(otherSite)).body.versions[0].id

  for (const r of [as(other).list(site), as(other).get(site, ownV), as(other).restore(site, ownV)]) {
    assert.equal((await r).status, 404)
  }
  // A real version id, but of another website: never served or restored here.
  assert.equal((await as(owner).get(site, foreignV)).status, 404)
  assert.equal((await as(owner).restore(site, foreignV)).status, 404)
  assert.equal((await as(owner).get(site, "not-an-id")).status, 404)
  assert.equal((await Website.findById(site._id)).latestCode, page("Two"))
})

test("listing a legacy site's history creates its first version exactly once", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  const [a, b] = await Promise.all([as(user).list(site), as(user).list(site)])
  assert.equal(a.status, 200); assert.equal(b.status, 200)
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 1)
  assert.equal((await as(user).list(site)).body.versions[0].source, "migration")
})

test("concurrent saves get unique, gapless version numbers", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  await as(user).list(site)   // v1
  const results = await Promise.all([1, 2, 3, 4, 5].map(i => as(user).save(site, page(`Parallel ${i}`))))
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body))

  const seqs = (await ProjectVersion.find({ project: site._id }).lean()).map(v => v.seq).sort((x, y) => x - y)
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6])
  // The current code is exactly the content of the head version.
  const w = await Website.findById(site._id)
  const head = (await as(user).list(site)).body.versions[0]
  assert.equal(head.seq, 6)
  assert.equal((await as(user).get(site, head.id)).body.code, w.latestCode)
})

test("identical content is stored once per project (compressed)", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  const big = page("x".repeat(20000))
  await as(user).save(site, big)
  await as(user).save(site, page("Original"))
  await as(user).save(site, big)
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 4)
  const blobs = await Blob.find({ project: site._id }).lean()
  assert.equal(blobs.length, 2)
  const stored = blobs.find(b => b.size > 20000)
  assert.ok(stored.data.length() < stored.size / 10, "content is gzip-compressed")
})

test("deleting a website deletes its versions and stored content", async () => {
  const user = await legacyUser()
  const site = await legacySite(user)
  const keep = await legacySite(user)
  await as(user).save(site, page("Two"))
  await as(user).save(keep, page("Kept"))
  assert.equal((await as(user).remove(site)).status, 200)
  assert.equal(await ProjectVersion.countDocuments({ project: site._id }), 0)
  assert.equal(await Blob.countDocuments({ project: site._id }), 0)
  assert.equal(await ProjectVersion.countDocuments({ project: keep._id }), 2)
})

test("slugs are readable: words joined by hyphens plus a 4-character suffix", () => {
  assert.match(generateSlug("Business Solutions"), /^business-solutions-[a-z0-9]{4}$/)
  assert.match(generateSlug("  Sunset   Bistro -- Restaurant! "), /^sunset-bistro-restaurant-[a-z0-9]{4}$/)
  assert.match(generateSlug("Chai Corner Café"), /^chai-corner-cafe-[a-z0-9]{4}$/)
  assert.match(generateSlug("!!!"), /^site-[a-z0-9]{4}$/)
  assert.match(generateSlug(""), /^site-[a-z0-9]{4}$/)
  const long = generateSlug("a very long website title that keeps going far beyond forty characters")
  assert.match(long, /^[a-z0-9-]+-[a-z0-9]{4}$/)
  assert.ok(!long.includes("--"))
  assert.ok(long.length <= 45)
})
