// Atomic daily counters: concurrency must never exceed a limit.
import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { startDb, stopDb, clearDb } from "./helpers.js"
import { reserve, release, AiCounter } from "../ai/quota.js"

before(startDb)
after(stopDb)
beforeEach(clearDb)

test("50 simultaneous reservations against a limit of 5 grant exactly 5", async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => reserve("user:test:day", 5)))
  assert.equal(results.filter(r => r.ok).length, 5)
  assert.equal((await AiCounter.findById("user:test:day")).count, 5)
})

test("releasing a slot makes exactly one more reservation possible", async () => {
  for (let i = 0; i < 3; i++) await reserve("k", 3)
  assert.equal((await reserve("k", 3)).ok, false)
  await release("k")
  assert.equal((await reserve("k", 3)).ok, true)
  assert.equal((await reserve("k", 3)).ok, false)
})

test("a limit of 0 never grants, and release never goes negative", async () => {
  assert.equal((await reserve("z", 0)).ok, false)
  assert.equal(await AiCounter.countDocuments(), 0)
  await release("nothing-here")
  await reserve("one", 1); await release("one"); await release("one")
  assert.equal((await AiCounter.findById("one")).count, 0)
})

test("counters carry an expiry so old days are cleaned up automatically", async () => {
  await reserve("exp", 2)
  const doc = await AiCounter.findById("exp")
  assert.ok(doc.expiresAt > new Date(Date.now() + 86400000))
})
