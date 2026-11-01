import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import {
  app, startDb, stopDb, clearDb, sessionCookie, legacyUser,
  fakeRazorpay, checkoutSignature, webhookSignature,
} from "./helpers.js"
import User from "../models/user.model.js"
import Payment from "../models/payment.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"

before(startDb)
after(stopDb)

let rzp
beforeEach(async () => {
  await clearDb()
  rzp = fakeRazorpay()
})

async function paidOrder(user, packId = "starter") {
  const res = await request(app).post("/api/payment/create-order").set("Cookie", sessionCookie(user)).send({ packId })
  assert.equal(res.status, 200)
  rzp.markPaid(res.body.order.id)
  return res.body.order.id
}

const verify = (user, orderId, paymentId, signature = checkoutSignature(orderId, paymentId)) =>
  request(app).post("/api/payment/verify").set("Cookie", sessionCookie(user))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, packId: "agency" })

function webhook(event, { secret, signature } = {}) {
  const body = JSON.stringify(event)
  return request(app).post("/api/payment/webhook")
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", signature ?? webhookSignature(body, secret))
    .set("x-razorpay-event-id", `evt_${Math.random()}`)
    .send(body)
}

const orderPaidEvent = (order, paymentId) => ({
  event: "order.paid",
  payload: { order: { entity: order }, payment: { entity: { id: paymentId, order_id: order.id } } },
})

const credits = async (user) => (await User.findById(user._id)).credits

test("verify grants the pack from the order, not the packId the client sends", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user, "starter")
  const res = await verify(user, orderId, "pay_1")   // body claims "agency"
  assert.equal(res.status, 200)
  assert.equal(res.body.creditsAdded, 100)
  assert.equal(await credits(user), 100)

  const payment = await Payment.findOne({ orderId })
  assert.equal(payment.source, "verify")
  const row = await CreditTransaction.findOne({ type: "purchase" })
  assert.equal(row.amount, 100)
  assert.equal(row.balanceAfter, 100)
})

test("verify rejects a bad signature", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const res = await verify(user, orderId, "pay_1", "f".repeat(64))
  assert.equal(res.status, 400)
  assert.equal(await credits(user), 0)
})

test("verify rejects another user's order", async () => {
  const buyer = await legacyUser({ credits: 0 })
  const thief = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(buyer)
  const res = await verify(thief, orderId, "pay_1")
  assert.equal(res.status, 403)
  assert.equal(await credits(thief), 0)
  assert.equal(await Payment.countDocuments(), 0)
})

test("verify rejects an unpaid order and an amount that does not match the pack", async () => {
  const user = await legacyUser({ credits: 0 })
  const res = await request(app).post("/api/payment/create-order").set("Cookie", sessionCookie(user)).send({ packId: "pro" })
  const orderId = res.body.order.id
  assert.equal((await verify(user, orderId, "pay_1")).status, 400)       // still "created"

  rzp.markPaid(orderId)
  rzp.orders.get(orderId).amount = 100                                     // tampered amount
  assert.equal((await verify(user, orderId, "pay_1")).status, 400)
  assert.equal(await credits(user), 0)
})

test("verify called twice grants credits once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const first  = await verify(user, orderId, "pay_1")
  const second = await verify(user, orderId, "pay_1")
  assert.equal(first.body.creditsAdded, 100)
  assert.equal(second.status, 200)
  assert.equal(second.body.creditsAdded, 0)
  assert.equal(await credits(user), 100)
  assert.equal(await CreditTransaction.countDocuments({ type: "purchase" }), 1)
})

test("webhook alone credits a paid order (browser callback never arrived)", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user, "basic")
  const res = await webhook(orderPaidEvent(rzp.orders.get(orderId), "pay_9"))
  assert.equal(res.status, 200)
  assert.equal(res.body.status, "granted")
  assert.equal(await credits(user), 300)
  assert.equal((await Payment.findOne({ orderId })).source, "webhook")
})

test("payment.captured webhook fetches the order and credits once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const event = { event: "payment.captured", payload: { payment: { entity: { id: "pay_c", order_id: orderId } } } }
  assert.equal((await webhook(event)).body.status, "granted")
  assert.equal((await webhook(event)).body.status, "already_processed")
  assert.equal(await credits(user), 100)
})

test("concurrent verify + webhook deliveries for one order grant exactly once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user, "pro")
  const order = rzp.orders.get(orderId)

  const results = await Promise.all([
    ...Array.from({ length: 5 }, () => verify(user, orderId, "pay_x")),
    ...Array.from({ length: 5 }, () => webhook(orderPaidEvent(order, "pay_x"))),
  ])
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body))

  assert.equal(await credits(user), 700)
  assert.equal(await Payment.countDocuments({ orderId }), 1)
  assert.equal(await CreditTransaction.countDocuments({ type: "purchase" }), 1)
  const granted = results.filter(r => r.body.status === "granted" || r.body.creditsAdded === 700)
  assert.equal(granted.length, 1)
})

test("webhook with a bad signature is rejected and credits nothing", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const res = await webhook(orderPaidEvent(rzp.orders.get(orderId), "pay_1"), { secret: "wrong" })
  assert.equal(res.status, 401)
  assert.equal(await credits(user), 0)
})

test("webhook is refused when no secret is configured", async () => {
  const saved = process.env.RAZORPAY_WEBHOOK_SECRET
  delete process.env.RAZORPAY_WEBHOOK_SECRET
  try {
    const res = await webhook({ event: "order.paid" }, { signature: "x" })
    assert.equal(res.status, 503)
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = saved
  }
})

test("webhook ignores unrelated events and orders that fail validation", async () => {
  const user = await legacyUser({ credits: 0 })
  assert.equal((await webhook({ event: "refund.created", payload: {} })).body.ignored, true)

  const orderId = await paidOrder(user)
  const forged = { ...rzp.orders.get(orderId), amount: 1 }
  const res = await webhook(orderPaidEvent(forged, "pay_1"))
  assert.equal(res.status, 200)
  assert.equal(res.body.ignored, true)
  assert.equal(await credits(user), 0)
})

test("webhook works without an Origin header and is not blocked by CSRF checks", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const res = await webhook(orderPaidEvent(rzp.orders.get(orderId), "pay_1"))
  assert.equal(res.status, 200)
  assert.equal(await credits(user), 100)
})

// ── Final-verification cases ─────────────────────────────────────────────────

test("signature is checked against the raw body: same JSON re-serialized fails", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const event = orderPaidEvent(rzp.orders.get(orderId), "pay_raw")
  const compact = JSON.stringify(event)
  const pretty  = JSON.stringify(event, null, 2)       // identical data, different bytes
  const res = await request(app).post("/api/payment/webhook")
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", webhookSignature(compact))
    .send(pretty)
  assert.equal(res.status, 401)
  assert.equal(await credits(user), 0)
})

test("order.paid and payment.captured for the same payment grant once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user, "basic")
  const paid     = await webhook(orderPaidEvent(rzp.orders.get(orderId), "pay_same"))
  const captured = await webhook({ event: "payment.captured", payload: { payment: { entity: { id: "pay_same", order_id: orderId } } } })
  assert.equal(paid.body.status, "granted")
  assert.equal(captured.body.status, "already_processed")
  assert.equal(await credits(user), 300)
  assert.equal(await CreditTransaction.countDocuments({ type: "purchase" }), 1)
})

test("byte-identical webhook replays grant once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const body = JSON.stringify(orderPaidEvent(rzp.orders.get(orderId), "pay_replay"))
  const send = () => request(app).post("/api/payment/webhook")
    .set("Content-Type", "application/json").set("x-razorpay-signature", webhookSignature(body)).send(body)
  const statuses = []
  for (let i = 0; i < 3; i++) statuses.push((await send()).body.status)
  assert.deepEqual(statuses, ["granted", "already_processed", "already_processed"])
  assert.equal(await credits(user), 100)
})

test("a failure inside the credit transaction rolls back everything; Razorpay's retry then grants once", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  const event = orderPaidEvent(rzp.orders.get(orderId), "pay_tx")

  const original = User.findByIdAndUpdate
  User.findByIdAndUpdate = function () { throw new Error("simulated DB failure") }
  let failed
  try {
    failed = await webhook(event)
  } finally {
    User.findByIdAndUpdate = original
  }
  assert.equal(failed.status, 500)                         // tells Razorpay to retry
  assert.equal(await Payment.countDocuments(), 0)          // payment row rolled back
  assert.equal(await CreditTransaction.countDocuments(), 0)
  assert.equal(await credits(user), 0)

  const retry = await webhook(event)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.status, "granted")
  assert.equal(await credits(user), 100)
  assert.equal(await Payment.countDocuments(), 1)
})

test("refund and failed-payment events do not change credits (policy unchanged)", async () => {
  const user = await legacyUser({ credits: 0 })
  const orderId = await paidOrder(user)
  await webhook(orderPaidEvent(rzp.orders.get(orderId), "pay_r"))
  for (const type of ["refund.created", "refund.processed", "payment.failed"]) {
    const res = await webhook({ event: type, payload: { payment: { entity: { id: "pay_r", order_id: orderId } } } })
    assert.equal(res.status, 200)
    assert.equal(res.body.ignored, true)
  }
  assert.equal(await credits(user), 100)
})
