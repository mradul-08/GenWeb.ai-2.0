import express from "express"
import { createOrder, verifyPayment, getPacks } from "../controllers/payment.controller.js"
import isAuth from "../middlewares/isAuth.js"
import { rateLimit } from "../middlewares/rateLimit.js"

const paymentRouter = express.Router()

const paymentLimit = rateLimit({ name: "payment", windowMs: 10 * 60 * 1000, max: 30 })

// The webhook is mounted separately in app.js (it needs the raw request body).
paymentRouter.get("/packs",         getPacks)                                 // public
paymentRouter.post("/create-order", isAuth, paymentLimit, createOrder)        // protected
paymentRouter.post("/verify",       isAuth, paymentLimit, verifyPayment)      // protected

export default paymentRouter
