import mongoose from "mongoose"

export const SIGNUP_CREDITS = 100

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, unique: true, required: true },
  avatar:      { type: String },
  firebaseUid: { type: String, unique: true, sparse: true },
  credits:     { type: Number, default: SIGNUP_CREDITS, min: 0 },
  plan:        { type: String, enum: ["free"], default: "free" },
  // Granted only server-side (scripts/set-admin.js); never settable through the API.
  role:        { type: String, enum: ["user", "admin"], default: "user" },

  // Embedded in session JWTs as `v`; incrementing it revokes every session.
  // Documents created before this field existed read as 0.
  tokenVersion:   { type: Number, default: 0 },
  // Set when the credit ledger has an opening/signup row for this user.
  ledgerOpenedAt: { type: Date },

  // ── Payment tracking ───────────────────────────────────────
  lastPaymentId:   { type: String, default: null },
  totalPurchased:  { type: Number, default: 0 },     // lifetime credits bought
  totalSpent:      { type: Number, default: 0 },     // lifetime INR spent
}, { timestamps: true })

const User = mongoose.model("User", userSchema)
export default User
