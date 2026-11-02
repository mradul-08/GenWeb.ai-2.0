// Export: the whole site (every page + README) as a valid .zip.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser } from "./helpers.js"
import { createZip, readZip } from "../utils/zip.js"
import Website from "../models/website.model.js"

before(startDb)
after(stopDb)
beforeEach(clearDb)

const page = (t) => `<!DOCTYPE html><html><head><title>${t}</title></head><body><h1>${t} — ₹40 चाय</h1></body></html>`
const binary = (res, cb) => { const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))) }
const exportOf = (id, cookie) => {
  const r = request(app).get(`/api/website/${id}/export`)
  if (cookie) r.set("Cookie", cookie)
  return r.buffer(true).parse(binary)
}

test("zip writer round-trips UTF-8 names and content with CRC checks", () => {
  const files = [{ name: "index.html", content: page("Héllo") }, { name: "मेनू.html", content: "x".repeat(10000) }, { name: "empty.txt", content: "" }]
  const back = readZip(createZip(files))
  assert.deepEqual(back.map(f => f.name), files.map(f => f.name))
  assert.deepEqual(back.map(f => f.content.toString("utf8")), files.map(f => f.content))
  const zip = createZip([{ name: "big.txt", content: "a".repeat(100000) }])
  assert.ok(zip.length < 2000, "content is compressed")
  // A flipped byte in the data is detected.
  const broken = Buffer.from(zip); broken[40] ^= 0xff
  assert.throws(() => readZip(broken))
})

test("a single-page site exports index.html exactly as saved, plus a README", async () => {
  const user = await legacyUser()
  const site = await Website.create({ user: user._id, title: "Chai Corner Café", latestCode: page("Chai"), slug: "chai-corner-cafe-ab12" })
  const res = await exportOf(site._id, sessionCookie(user))
  assert.equal(res.status, 200)
  assert.equal(res.headers["content-type"], "application/zip")
  assert.match(res.headers["content-disposition"], /attachment; filename="chai-corner-cafe-ab12\.zip"/)
  const files = readZip(res.body)
  assert.deepEqual(files.map(f => f.name), ["index.html", "README.md"])
  assert.equal(files[0].content.toString("utf8"), page("Chai"))
  const readme = files[1].content.toString("utf8")
  assert.match(readme, /# Chai Corner Café/)
  assert.match(readme, /Netlify Drop/)
  assert.match(readme, /do not\s+send anything yet/)
})

test("a multi-page site exports every page in order", async () => {
  const user = await legacyUser()
  const files = [{ path: "index.html", content: page("Home") }, { path: "menu.html", content: page("Menu") }, { path: "contact.html", content: page("Contact") }]
  const site = await Website.create({ user: user._id, title: "Multi", kind: "static", files, latestCode: files[0].content, slug: "multi-1234" })
  const res = await exportOf(site._id, sessionCookie(user))
  assert.equal(res.status, 200)
  const out = readZip(res.body)
  assert.deepEqual(out.map(f => f.name), ["index.html", "menu.html", "contact.html", "README.md"])
  for (const f of files) assert.equal(out.find(o => o.name === f.path).content.toString("utf8"), f.content)
  assert.match(out[3].content.toString("utf8"), /`menu\.html`/)
})

test("only the owner can export; signed-out requests are refused", async () => {
  const owner = await legacyUser(), other = await legacyUser()
  const site = await Website.create({ user: owner._id, title: "Mine", latestCode: page("Mine"), slug: "mine-1234" })
  assert.equal((await exportOf(site._id, sessionCookie(other))).status, 404)
  assert.equal((await exportOf(site._id)).status, 401)
  assert.equal((await exportOf("not-an-id", sessionCookie(owner))).status, 404)
})

test("unsafe titles still give a safe file name", async () => {
  const user = await legacyUser()
  const site = await Website.create({ user: user._id, title: `../../etc/"passwd"`, latestCode: page("x") })
  const res = await exportOf(site._id, sessionCookie(user))
  assert.match(res.headers["content-disposition"], /filename="[a-z0-9-]+\.zip"/)
  assert.doesNotMatch(res.headers["content-disposition"], /\.\.|\//)
})
