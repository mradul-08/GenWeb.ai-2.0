import mongoose from "mongoose"

// One document per processed Razorpay payment. The unique indexes make
// crediting idempotent: a replayed payment or order fails to insert.
const paymentSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId:     { type: String, required: true, unique: true },
  paymentId:   { type: String, required: true, unique: true },
  packId:      { type: String, required: true },
  credits:     { type: Number, required: true },
  amountPaise: { type: Number, required: true },
  source:      { type: String, enum: ["verify", "webhook"], required: true },
}, { timestamps: true })

paymentSchema.index({ user: 1, createdAt: -1 })

const Payment = mongoose.model("Payment", paymentSchema)
export default Payment
