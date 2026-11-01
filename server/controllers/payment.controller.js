import crypto from "crypto"
import { CREDIT_PACKS } from "../config/creditPacks.js"
import { getRazorpay } from "../config/razorpay.js"
import { grantPurchaseForOrder, PaymentValidationError } from "../services/credits.js"

export { CREDIT_PACKS }

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0

const hmacHex = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex")

function safeEqual(expected, actual) {
  const a = Buffer.from(expected)
  const b = Buffer.from(String(actual))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ─── Create Razorpay Order ─────────────────────────────────────────────────────
// POST /api/payment/create-order
// body: { packId }
export const createOrder = async (req, res) => {
  try {
    const { packId } = req.body
    const user = req.user

    const pack = CREDIT_PACKS[packId]
    if (!pack) {
      return res.status(400).json({ success: false, message: "Invalid pack selected" })
    }

    // notes are the server's record of who bought what; verify and the
    // webhook trust only these, never the client.
    const order = await getRazorpay().orders.create({
      amount:   pack.amountPaise,  // in paise
      currency: "INR",
      receipt:  `rcpt_${Date.now()}`,
      notes: {
        userId:  user._id.toString(),
        packId,
        credits: pack.credits.toString(),
        email:   user.email,
      },
    })

    return res.json({
      success: true,
      order: {
        id:       order.id,
        amount:   order.amount,
        currency: order.currency,
      },
      pack: {
        credits: pack.credits,
        label:   pack.label,
        amount:  pack.amountPaise / 100,
      },
      key: process.env.RAZORPAY_KEY_ID,
      user: {
        name:  user.name,
        email: user.email,
      },
    })
  } catch (e) {
    console.error("[createOrder]", e)
    return res.status(500).json({ success: false, message: "Could not create order. Please try again." })
  }
}

// ─── Verify Payment & Add Credits (browser callback) ──────────────────────────
// POST /api/payment/verify
// body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id:   orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature:  signature,
    } = req.body

    if (![orderId, paymentId, signature].every(isNonEmptyString)) {
      return res.status(400).json({ success: false, message: "Missing payment details" })
    }

    const expected = hmacHex(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`)
    if (!safeEqual(expected, signature)) {
      console.error("[verifyPayment] Signature mismatch — possible fraud attempt")
      return res.status(400).json({ success: false, message: "Payment verification failed" })
    }

    const order  = await getRazorpay().orders.fetch(orderId)
    const result = await grantPurchaseForOrder({
      order, paymentId, source: "verify", expectedUserId: req.user._id,
    })

    if (result.status === "granted") {
      console.log(`[Payment] ✅ user=${result.userId} +${result.pack.credits} credits (${result.pack.label}) via verify`)
    }

    return res.json({
      success:      true,
      message:      result.status === "granted" ? `${result.pack.credits} credits added successfully!` : "Already processed",
      credits:      result.balance,
      newTotal:     result.balance,
      creditsAdded: result.status === "granted" ? result.pack.credits : 0,
    })
  } catch (e) {
    if (e instanceof PaymentValidationError) {
      console.error(`[verifyPayment] rejected: ${e.message}`)
      return res.status(e.status).json({ success: false, message: e.message })
    }
    console.error("[verifyPayment]", e)
    return res.status(500).json({ success: false, message: "Payment verification error. Contact support if you were charged." })
  }
}

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
// POST /api/payment/webhook   (raw JSON body; mounted before express.json)
// Credits orders whose browser callback never reached /verify (tab closed,
// network loss). Configure in Razorpay Dashboard → Webhooks with events
// order.paid and payment.captured, and the same secret as RAZORPAY_WEBHOOK_SECRET.
//
// Responses: 2xx tells Razorpay to stop retrying. Processing errors return 500
// so Razorpay retries; permanently invalid events return 200 with ignored=true.
export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET not configured — event not processed")
    return res.status(503).json({ ok: false })
  }

  const rawBody   = Buffer.isBuffer(req.body) ? req.body : Buffer.from("")
  const signature = req.get("x-razorpay-signature")
  if (!signature || !safeEqual(hmacHex(secret, rawBody), signature)) {
    console.error("[webhook] Invalid signature")
    return res.status(401).json({ ok: false })
  }

  let event
  try {
    event = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return res.status(400).json({ ok: false })
  }

  const eventId = req.get("x-razorpay-event-id") || "unknown"
  const type    = event?.event

  try {
    let order, paymentId
    if (type === "order.paid") {
      order     = event.payload?.order?.entity
      paymentId = event.payload?.payment?.entity?.id
    } else if (type === "payment.captured") {
      const payment = event.payload?.payment?.entity
      paymentId = payment?.id
      if (!payment?.order_id) return res.json({ ok: true, ignored: true })
      order = await getRazorpay().orders.fetch(payment.order_id)
      // A captured payment whose order is not yet marked paid is credited by order.paid.
      if (order?.status !== "paid") return res.json({ ok: true, ignored: true })
    } else {
      return res.json({ ok: true, ignored: true })
    }

    const result = await grantPurchaseForOrder({ order, paymentId, source: "webhook" })
    console.log(`[webhook] ${type} event=${eventId} order=${order.id} → ${result.status}`)
    return res.json({ ok: true, status: result.status })
  } catch (e) {
    if (e instanceof PaymentValidationError) {
      console.error(`[webhook] ${type} event=${eventId} rejected: ${e.message}`)
      return res.json({ ok: true, ignored: true })
    }
    console.error(`[webhook] ${type} event=${eventId} processing error`, e)
    return res.status(500).json({ ok: false })
  }
}

// ─── Get Pack Info (for frontend display) ─────────────────────────────────────
export const getPacks = async (req, res) => {
  const packs = Object.entries(CREDIT_PACKS).map(([id, p]) => ({
    id,
    credits:  p.credits,
    amount:   p.amountPaise / 100,
    label:    p.label,
    popular:  p.popular,
    perCredit: Math.round(p.amountPaise / p.credits) / 100,
  }))
  return res.json({ success: true, packs })
}
