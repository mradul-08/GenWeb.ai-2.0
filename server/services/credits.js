// All writes to users.credits go through this module. Each change is made in
// one MongoDB transaction together with an append-only credit_transactions
// row whose idempotencyKey is unique, so no operation can apply twice.
import crypto from "crypto"
import mongoose from "mongoose"
import User, { SIGNUP_CREDITS } from "../models/user.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"
import Payment from "../models/payment.model.js"
import { CREDIT_PACKS } from "../config/creditPacks.js"

export const isDuplicateKeyError = (e) =>
  e?.code === 11000 || e?.cause?.code === 11000 || /E11000/.test(e?.message || "")

// Runs fn(session) in a transaction. withTransaction retries transient errors
// (e.g. write conflicts between concurrent requests), so fn must be re-runnable.
export async function inTransaction(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => { result = await fn(session) })
    return result
  } finally {
    await session.endSession()
  }
}

export class PaymentValidationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ── Spending ──────────────────────────────────────────────────────────────────

// Deducts cost if the balance allows it. Returns { spendKey, balance } or null
// when the balance is insufficient. Concurrent calls cannot overdraw.
export async function reserveCredits(userId, cost, { websiteId, note } = {}) {
  const spendKey = `spend:${crypto.randomUUID()}`
  return inTransaction(async (session) => {
    const user = await User.findOneAndUpdate(
      { _id: userId, credits: { $gte: cost } },
      { $inc: { credits: -cost } },
      { returnDocument: "after", session }
    )
    if (!user) return null
    await CreditTransaction.create([{
      user: userId, type: "spend", amount: -cost, balanceAfter: user.credits,
      idempotencyKey: spendKey, ref: { websiteId }, note,
    }], { session })
    return { spendKey, balance: user.credits }
  })
}

// Returns a reservation's credits. Safe to call more than once: only the first
// call refunds. Never throws — a failed refund is logged for manual repair.
export async function refundCredits(userId, reservation, note) {
  if (!reservation?.spendKey) return null
  try {
    return await inTransaction(async (session) => {
      const spend = await CreditTransaction.findOne({
        idempotencyKey: reservation.spendKey, user: userId, type: "spend",
      }).session(session)
      if (!spend) throw new Error(`Unknown reservation ${reservation.spendKey}`)

      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { credits: -spend.amount } },
        { returnDocument: "after", session }
      )
      await CreditTransaction.create([{
        user: userId, type: "refund", amount: -spend.amount, balanceAfter: user.credits,
        idempotencyKey: `refund:${reservation.spendKey}`,
        ref: { spendKey: reservation.spendKey, websiteId: spend.ref?.websiteId }, note,
      }], { session })
      return { balance: user.credits }
    })
  } catch (e) {
    if (isDuplicateKeyError(e)) return null
    console.error(`[credits] REFUND FAILED user=${userId} reservation=${reservation.spendKey}:`, e)
    return null
  }
}

// ── Granting ──────────────────────────────────────────────────────────────────

// Creates a user together with the signup bonus ledger row.
export async function createUserWithSignupCredits(fields) {
  return inTransaction(async (session) => {
    const [user] = await User.create([{
      ...fields, credits: SIGNUP_CREDITS, ledgerOpenedAt: new Date(),
    }], { session })
    await CreditTransaction.create([{
      user: user._id, type: "signup_bonus", amount: SIGNUP_CREDITS, balanceAfter: SIGNUP_CREDITS,
      idempotencyKey: `signup:${user._id}`,
    }], { session })
    return user
  })
}

// Credits a paid Razorpay order exactly once. Used by both /verify and the
// webhook; whichever arrives second gets status "already_processed".
// Everything (owner, pack, amount) is read from the server-created order.
export async function grantPurchaseForOrder({ order, paymentId, source, expectedUserId }) {
  if (!order?.id || !paymentId) throw new PaymentValidationError(400, "Missing order or payment id")
  if (order.status !== "paid") throw new PaymentValidationError(400, "Order not paid")

  const userId = order.notes?.userId
  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw new PaymentValidationError(400, "Order has no valid owner")
  }
  if (expectedUserId && userId !== String(expectedUserId)) {
    throw new PaymentValidationError(403, "Payment does not belong to this account")
  }

  const packId = order.notes?.packId
  const pack   = CREDIT_PACKS[packId]
  if (!pack || Number(order.amount) !== pack.amountPaise || order.currency !== "INR") {
    throw new PaymentValidationError(400, "Order does not match a credit pack")
  }

  try {
    return await inTransaction(async (session) => {
      await Payment.create([{
        user: userId, orderId: order.id, paymentId, packId,
        credits: pack.credits, amountPaise: pack.amountPaise, source,
      }], { session })

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { credits: pack.credits, totalPurchased: pack.credits, totalSpent: pack.amountPaise / 100 },
          $set: { lastPaymentId: paymentId },
        },
        { returnDocument: "after", session }
      )
      if (!user) throw new PaymentValidationError(404, "User not found")

      await CreditTransaction.create([{
        user: userId, type: "purchase", amount: pack.credits, balanceAfter: user.credits,
        idempotencyKey: `purchase:${order.id}`, ref: { orderId: order.id, paymentId },
      }], { session })

      return { status: "granted", balance: user.credits, pack, userId }
    })
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e
    const current = await User.findById(userId).select("credits")
    return { status: "already_processed", balance: current?.credits, pack, userId }
  }
}
