import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import express from "express"
import request from "supertest"
import { app, startDb, stopDb, clearDb, sessionCookie, legacyUser, resetRateLimits } from "./helpers.js"
import User from "../models/user.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"
import { reserveCredits, refundCredits, createUserWithSignupCredits } from "../services/credits.js"
import { migrateCreditLedger, rollbackCreditLedger } from "../scripts/migrate-credit-ledger.js"
import { reconcileCredits } from "../scripts/reconcile-credits.js"
import { rateLimit } from "../middlewares/rateLimit.js"

before(startDb)
after(stopDb)
beforeEach(clearDb)

const ledgerSum = async (userId) =>
  (await CreditTransaction.find({ user: userId })).reduce((s, r) => s + r.amount, 0)

test("concurrent reservations never overdraw the balance", async () => {
  const user = await createUserWithSignupCredits({ name: "C", email: "c@example.com" })   // 100 credits
  const results = await Promise.all(Array.from({ length: 10 }, () => reserveCredits(user._id, 50)))
  assert.equal(results.filter(Boolean).length, 2)
  const fresh = await User.findById(user._id)
  assert.equal(fresh.credits, 0)
  assert.equal(await ledgerSum(user._id), 0)
  assert.equal(await CreditTransaction.countDocuments({ type: "spend" }), 2)
})

test("a refund applies once even when called repeatedly", async () => {
  const user = await createUserWithSignupCredits({ name: "R", email: "r@example.com" })
  const reservation = await reserveCredits(user._id, 50)
  await Promise.all([refundCredits(user._id, reservation), refundCredits(user._id, reservation)])
  await refundCredits(user._id, reservation)
  assert.equal((await User.findById(user._id)).credits, 100)
  assert.equal(await CreditTransaction.countDocuments({ type: "refund" }), 1)
  assert.equal(await ledgerSum(user._id), 100)
})

test("failed generation refunds the reserved credits", async () => {
  // Tests run with no AI provider keys, so generation fails without network calls.
  const user = await createUserWithSignupCredits({ name: "G", email: "g@example.com" })
  const res = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: "a bakery site", engine: "ai" })
  assert.equal(res.status, 503)
  assert.equal((await User.findById(user._id)).credits, 100)
  const types = (await CreditTransaction.find({ user: user._id }).sort({ createdAt: 1 })).map(r => r.type)
  assert.deepEqual(types, ["signup_bonus", "spend", "refund"])
})

test("generation is refused when credits are insufficient", async () => {
  const user = await legacyUser({ credits: 10 })
  const res = await request(app).post("/api/website/generate").set("Cookie", sessionCookie(user)).send({ prompt: "x", engine: "ai" })
  assert.equal(res.status, 403)
  assert.equal((await User.findById(user._id)).credits, 10)
  assert.equal(await CreditTransaction.countDocuments(), 0)
})

test("rate limiter returns 429 with Retry-After after the limit, then resets", async () => {
  const mini = express()
  mini.get("/x", rateLimit({ name: "t", windowMs: 200, max: 2 }), (req, res) => res.send("ok"))
  assert.equal((await request(mini).get("/x")).status, 200)
  assert.equal((await request(mini).get("/x")).status, 200)
  const limited = await request(mini).get("/x")
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers["retry-after"]) >= 1)
  await new Promise(r => setTimeout(r, 250))
  assert.equal((await request(mini).get("/x")).status, 200)
  resetRateLimits()
})

test("ledger migration: dry run writes nothing, apply reconciles, re-run is a no-op, rollback removes only opening rows", async () => {
  const old1 = await legacyUser({ credits: 70 })
  const old2 = await legacyUser({ credits: 250 })
  const fresh = await createUserWithSignupCredits({ name: "N", email: "n@example.com" })
  // A legacy user who already spent through the ledger after the v2 deploy.
  const old3 = await legacyUser({ credits: 100 })
  await reserveCredits(old3._id, 50)

  const dry = await migrateCreditLedger({ apply: false, log: () => {} })
  assert.equal(dry.wouldOpen, 3)
  assert.equal(await CreditTransaction.countDocuments({ type: "opening_balance" }), 0)

  const applied = await migrateCreditLedger({ apply: true })
  assert.equal(applied.opened, 3)
  assert.equal(applied.alreadyOpen, 1)

  const report = await reconcileCredits()
  assert.equal(report.mismatches.length, 0, JSON.stringify(report.mismatches))
  assert.equal(report.notLedgered, 0)
  const opening3 = await CreditTransaction.findOne({ user: old3._id, type: "opening_balance" })
  assert.equal(opening3.amount, 100)    // 50 now + 50 already spent

  const again = await migrateCreditLedger({ apply: true })
  assert.equal(again.opened, 0)
  assert.equal(await CreditTransaction.countDocuments({ type: "opening_balance" }), 3)

  // Balances never change during migration.
  assert.equal((await User.findById(old1._id)).credits, 70)
  assert.equal((await User.findById(old2._id)).credits, 250)

  const rb = await rollbackCreditLedger()
  assert.equal(rb.deletedOpeningRows, 3)
  assert.equal(await CreditTransaction.countDocuments({ type: "signup_bonus" }), 1)
  assert.equal(await CreditTransaction.countDocuments({ type: "spend" }), 1)
  assert.equal((await User.findById(old1._id)).ledgerOpenedAt, undefined)
  assert.ok((await User.findById(fresh._id)).ledgerOpenedAt)
})

test("a failure while writing the ledger row leaves the balance untouched", async () => {
  const user = await createUserWithSignupCredits({ name: "F", email: "f@example.com" })
  const original = CreditTransaction.create
  CreditTransaction.create = async function () { throw new Error("simulated ledger failure") }
  try {
    await assert.rejects(() => reserveCredits(user._id, 50), /simulated ledger failure/)
  } finally {
    CreditTransaction.create = original
  }
  assert.equal((await User.findById(user._id)).credits, 100)
  assert.equal(await CreditTransaction.countDocuments({ type: "spend" }), 0)
})

test("mixed concurrent spends, refunds and a purchase keep balance == ledger sum", async () => {
  const user = await createUserWithSignupCredits({ name: "M", email: "m@example.com" })   // 100
  const reservations = (await Promise.all(Array.from({ length: 6 }, () => reserveCredits(user._id, 20)))).filter(Boolean)
  assert.equal(reservations.length, 5)                                                    // 100 / 20
  await Promise.all([
    ...reservations.slice(0, 3).map(r => refundCredits(user._id, r)),
    ...reservations.slice(0, 3).map(r => refundCredits(user._id, r)),                     // duplicates
    reserveCredits(user._id, 20), reserveCredits(user._id, 20),
  ])
  const fresh = await User.findById(user._id)
  assert.ok(fresh.credits >= 0)
  assert.equal(fresh.credits, await ledgerSum(user._id))
  assert.equal(await CreditTransaction.countDocuments({ type: "refund" }), 3)
  const report = await reconcileCredits()
  assert.equal(report.mismatches.length, 0)
})
