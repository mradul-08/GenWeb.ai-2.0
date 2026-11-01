import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser } from "./helpers.js"
import Website from "../models/website.model.js"

before(startDb)
after(stopDb)
beforeEach(clearDb)

const HTML = "<!DOCTYPE html><html><head><title>B site</title></head><body><h1>Owner B</h1></body></html>"

async function setup() {
  const a = await legacyUser({ name: "A" })
  const b = await legacyUser({ name: "B" })
  const site = await Website.create({ user: b._id, title: "B site", latestCode: HTML, slug: "b-site-1234" })
  return { a, b, site, cookieA: sessionCookie(a), cookieB: sessionCookie(b) }
}

test("user A cannot read, change, deploy or delete user B's website", async () => {
  const { site, cookieA } = await setup()
  const id = site._id

  const attempts = [
    request(app).get(`/api/website/${id}`),
    request(app).put(`/api/website/${id}`).send({ prompt: "change title" }),
    request(app).patch(`/api/website/${id}/code`).send({ code: "<html><body>pwned</body></html>" }),
    request(app).post(`/api/website/${id}/deploy`).send({}),
    request(app).post(`/api/website/${id}/undeploy`).send({}),
    request(app).delete(`/api/website/${id}`),
  ]
  for (const req of attempts) {
    const res = await req.set("Cookie", cookieA)
    assert.equal(res.status, 404, `${res.req.method} ${res.req.path} should be 404`)
  }

  const after = await Website.findById(id)
  assert.equal(after.latestCode, HTML)
  assert.equal(after.deployed, false)
})

test("A's project list does not include B's projects; list omits source code", async () => {
  const { a, cookieA, cookieB } = await setup()
  await Website.create({ user: a._id, title: "A site", latestCode: HTML, slug: "a-site-1234" })

  const listA = await request(app).get("/api/user/websites").set("Cookie", cookieA)
  assert.equal(listA.status, 200)
  assert.deepEqual(listA.body.websites.map(w => w.title), ["A site"])
  assert.equal(listA.body.websites[0].latestCode, undefined)

  const listB = await request(app).get("/api/user/websites").set("Cookie", cookieB)
  assert.deepEqual(listB.body.websites.map(w => w.title), ["B site"])
})

test("owner can read and save their own website", async () => {
  const { site, cookieB } = await setup()
  const get = await request(app).get(`/api/website/${site._id}`).set("Cookie", cookieB)
  assert.equal(get.status, 200)

  const newCode = "<!DOCTYPE html><html><head><title>B2</title></head><body>v2</body></html>"
  const save = await request(app).patch(`/api/website/${site._id}/code`).set("Cookie", cookieB).send({ code: newCode })
  assert.equal(save.status, 200)
  assert.equal((await Website.findById(site._id)).latestCode, newCode)
})

test("invalid ids return 404 instead of a server error", async () => {
  const { cookieB } = await setup()
  const res = await request(app).get("/api/website/not-an-id").set("Cookie", cookieB)
  assert.equal(res.status, 404)
})

test("state-changing requests from foreign origins are blocked", async () => {
  const { site, cookieB } = await setup()
  for (const origin of ["https://evil.example", "null"]) {
    const res = await request(app).delete(`/api/website/${site._id}`).set("Cookie", cookieB).set("Origin", origin)
    assert.equal(res.status, 403)
  }
  assert.ok(await Website.findById(site._id))
})

test("malformed JSON returns a generic 400 without internals", async () => {
  const res = await request(app).post("/api/auth/google").set("Content-Type", "application/json").send("{bad json")
  assert.equal(res.status, 400)
  assert.equal(res.body.message, "Malformed request")
})
