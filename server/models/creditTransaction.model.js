import mongoose from "mongoose"

export const CREDIT_TX_TYPES = ["signup_bonus", "opening_balance", "purchase", "spend", "refund"]

// Append-only ledger. Every change to users.credits is written together with
// one of these rows inside a single transaction. idempotencyKey is globally
// unique, so retrying the same operation can never move the balance twice.
const creditTransactionSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:           { type: String, enum: CREDIT_TX_TYPES, required: true },
  amount:         { type: Number, required: true },          // + grant, − spend
  balanceAfter:   { type: Number, required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  ref: {
    orderId:   { type: String },
    paymentId: { type: String },
    websiteId: { type: mongoose.Schema.Types.ObjectId },
    spendKey:  { type: String },                              // refunds point at their spend
  },
  note: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } })

creditTransactionSchema.index({ user: 1, createdAt: -1 })

const CreditTransaction = mongoose.model("CreditTransaction", creditTransactionSchema, "credit_transactions")
export default CreditTransaction
