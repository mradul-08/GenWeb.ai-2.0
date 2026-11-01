import Razorpay from "razorpay"

let razorpayClient

export function getRazorpay() {
  if (razorpayClient) return razorpayClient
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env")
  }
  razorpayClient = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  return razorpayClient
}

// Tests replace the client with a stub exposing orders.create / orders.fetch.
export function setRazorpayClient(client) {
  razorpayClient = client
}
