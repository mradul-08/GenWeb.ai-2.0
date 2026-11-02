import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser } from "./helpers.js"
import Website from "../models/website.model.js"
import Release from "../models/release.model.js"

before(startDb)
after(stopDb)
beforeEach(() => clearDb())

const page = (text) => `<!DOCTYPE html><html><head><title>Release test</title></head><body><h1>${text}</h1></body></html>`

test("deploy publishes an immutable release; working saves do not change the live site", async () => {
  const user = await legacyUser()
  const site = await Website.create({ user: user._id, title: "Release test", latestCode: page("Draft"), slug: "release-test-aaaa" })
  const cookie = sessionCookie(user)

  const first = await request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", cookie).send({ code: page("First") })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const firstRelease = (await request(app).get(`/api/website/${site._id}/releases`).set("Cookie", cookie)).body.releases[0]
  assert.equal(firstRelease.status, "live")
  assert.match((await request(app).get("/s/release-test-aaaa")).text, /First/)

  const save = await request(app).patch(`/api/website/${site._id}/code`).set("Cookie", cookie).send({ code: page("Unpublished") })
  assert.equal(save.status, 200, JSON.stringify(save.body))
  assert.match((await request(app).get("/s/release-test-aaaa")).text, /First/)
})

test("a new deploy supersedes the old release and rollback restores it", async () => {
  const user = await legacyUser()
  const site = await Website.create({ user: user._id, title: "Rollback test", latestCode: page("Draft"), slug: "rollback-test-aaaa" })
  const cookie = sessionCookie(user)
  await request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", cookie).send({ code: page("First") })
  await request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", cookie).send({ code: page("Second") })

  const listed = (await request(app).get(`/api/website/${site._id}/releases`).set("Cookie", cookie)).body.releases
  assert.deepEqual(listed.map(r => r.status), ["live", "superseded"])
  const old = listed[1]
  const rollback = await request(app).post(`/api/website/${site._id}/releases/${old.id}/rollback`).set("Cookie", cookie)
  assert.equal(rollback.status, 200, JSON.stringify(rollback.body))
  assert.match((await request(app).get("/s/rollback-test-aaaa")).text, /First/)

  const after = (await request(app).get(`/api/website/${site._id}/releases`).set("Cookie", cookie)).body.releases
  assert.equal(after.find(r => String(r.id) === String(old.id)).status, "live")
  assert.equal(await Release.countDocuments({ project: site._id }), 2)
})

test("release endpoints enforce project ownership", async () => {
  const owner = await legacyUser()
  const other = await legacyUser()
  const site = await Website.create({ user: owner._id, title: "Private", latestCode: page("Private"), slug: "private-test-aaaa" })
  const ownerCookie = sessionCookie(owner)
  await request(app).post(`/api/website/${site._id}/deploy`).set("Cookie", ownerCookie).send({ code: page("Live") })
  const release = (await request(app).get(`/api/website/${site._id}/releases`).set("Cookie", ownerCookie)).body.releases[0]
  const otherCookie = sessionCookie(other)
  assert.equal((await request(app).get(`/api/website/${site._id}/releases`).set("Cookie", otherCookie)).status, 404)
  assert.equal((await request(app).post(`/api/website/${site._id}/releases/${release.id}/rollback`).set("Cookie", otherCookie)).status, 404)
})
