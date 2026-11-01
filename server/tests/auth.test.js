import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import { app, startDb, stopDb, clearDb, firebaseToken, wrongFirebaseKey, sessionCookie, legacyUser } from "./helpers.js"
import User from "../models/user.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"

before(startDb)
after(stopDb)
beforeEach(clearDb)

const signIn = (idToken, path = "google") => request(app).post(`/api/auth/${path}`).send({ idToken })

test("v1-style email login without a token is rejected", async () => {
  const res = await request(app).post("/api/auth/email").send({ email: "victim@example.com" })
  assert.equal(res.status, 400)
  assert.equal(await User.countDocuments(), 0)
})

test("token signed by an unknown key is rejected", async () => {
  const res = await signIn(firebaseToken({}, { key: wrongFirebaseKey }))
  assert.equal(res.status, 401)
})

test("token for another Firebase project is rejected", async () => {
  const res = await signIn(firebaseToken({}, { audience: "someone-else" }))
  assert.equal(res.status, 401)
})

test("expired token is rejected", async () => {
  const res = await signIn(firebaseToken({}, { expiresIn: -10 }))
  assert.equal(res.status, 401)
})

test("unverified email is rejected", async () => {
  const res = await signIn(firebaseToken({ email_verified: false }), "email")
  assert.equal(res.status, 403)
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED")
  assert.equal(await User.countDocuments(), 0)
})

test("first sign-in creates a user with a ledgered signup bonus; second reuses it", async () => {
  const first = await signIn(firebaseToken({ sub: "uid-a", email: "a@example.com" }))
  assert.equal(first.status, 200)
  assert.equal(first.body.isNewUser, true)
  assert.equal(first.body.user.credits, 100)
  assert.match(first.headers["set-cookie"][0], /^token=.*HttpOnly/i)

  const second = await signIn(firebaseToken({ sub: "uid-a", email: "a@example.com" }))
  assert.equal(second.status, 200)
  assert.equal(second.body.isNewUser, false)

  assert.equal(await User.countDocuments(), 1)
  const rows = await CreditTransaction.find({})
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, "signup_bonus")
  assert.equal(rows[0].amount, 100)
})

test("concurrent first sign-ins create exactly one account", async () => {
  const token = firebaseToken({ sub: "uid-race", email: "race@example.com" })
  const results = await Promise.all(Array.from({ length: 5 }, () => signIn(token)))
  for (const r of results) assert.equal(r.status, 200)
  assert.equal(await User.countDocuments(), 1)
  assert.equal(await CreditTransaction.countDocuments({ type: "signup_bonus" }), 1)
})

test("v1 account with a mixed-case email is linked, not duplicated", async () => {
  const old = await legacyUser({ email: "Mixed.Case@Example.com", credits: 70 })
  const res = await signIn(firebaseToken({ sub: "uid-mixed", email: "mixed.case@example.com" }))
  assert.equal(res.status, 200)
  assert.equal(res.body.isNewUser, false)
  assert.equal(String(res.body.user._id), String(old._id))
  assert.equal(res.body.user.credits, 70)
  assert.equal(await User.countDocuments(), 1)
  assert.equal((await User.findById(old._id)).firebaseUid, "uid-mixed")
})

test("email already linked to a different Firebase account is refused", async () => {
  await legacyUser({ email: "taken@example.com", firebaseUid: "uid-original" })
  const res = await signIn(firebaseToken({ sub: "uid-other", email: "taken@example.com" }))
  assert.equal(res.status, 409)
})

test("logout-all revokes existing sessions; tokens without a version still work at version 0", async () => {
  const user = await legacyUser()
  const legacyCookie = sessionCookie(user, { omitVersion: true })
  const cookie = sessionCookie(user)

  const before = await request(app).get("/api/user/current").set("Cookie", legacyCookie)
  assert.equal(String(before.body.user._id), String(user._id))

  const out = await request(app).post("/api/auth/logout-all").set("Cookie", cookie)
  assert.equal(out.status, 200)

  for (const c of [cookie, legacyCookie]) {
    const cur = await request(app).get("/api/user/current").set("Cookie", c)
    assert.equal(cur.body.user, null)
    const prot = await request(app).get("/api/user/websites").set("Cookie", c)
    assert.equal(prot.status, 401)
  }
})

test("garbage session cookie gives 401, not 500", async () => {
  const res = await request(app).get("/api/user/websites").set("Cookie", "token=garbage")
  assert.equal(res.status, 401)
})
