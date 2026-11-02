// Express app without listen(), so tests can drive it with supertest.
import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import cookieParser from "cookie-parser"
import { allowedOrigins } from "./config/origins.js"
import authRouter from "./routes/auth.routes.js"
import userRouter from "./routes/user.routes.js"
import websiteRouter from "./routes/website.routes.js"
import paymentRouter from "./routes/payment.router.js"
import adminRouter from "./routes/admin.routes.js"
import { serveDeployedSite } from "./controllers/website.controller.js"
import { razorpayWebhook } from "./controllers/payment.controller.js"
import checkOrigin from "./middlewares/checkOrigin.js"
import { rateLimit } from "./middlewares/rateLimit.js"

const app = express()

// Render terminates TLS in front of the app; trust one proxy hop so req.ip is
// the client address (used by rate limiting).
app.set("trust proxy", 1)
app.disable("x-powered-by")

// Must come before express.json: the signature is computed over the raw body.
app.post("/api/payment/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook)

// Generated sites plus edits can exceed express' 100kb default.
app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ["Content-Disposition"],  // export ZIP filename
}))

app.get("/health", (req, res) => {
  const dbUp = mongoose.connection.readyState === 1
  res.status(dbUp ? 200 : 503).json({ ok: dbUp })
})

app.get("/s/:slug", serveDeployedSite)
// Other pages of multi-page sites. Relative links ("menu.html") resolve here
// because "/s/:slug" is redirected to "/s/:slug/" (see below).
app.get("/s/:slug/:page", serveDeployedSite)

app.use("/api", rateLimit({ name: "api", windowMs: 60 * 1000, max: 300, keyFn: (req) => `ip:${req.ip}` }))
app.use("/api", checkOrigin)
app.use("/api/auth",    authRouter)
app.use("/api/user",    userRouter)
app.use("/api/website", websiteRouter)
app.use("/api/payment", paymentRouter)
app.use("/api/admin",   adminRouter)

// Last-resort handler: malformed JSON, oversized bodies, unexpected throws.
// Never sends stack traces or internal messages to clients.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || err.statusCode || 500
  if (status >= 500) console.error("[unhandled]", err)
  const message = status === 400 ? "Malformed request"
    : status === 413 ? "Request too large"
    : status < 500 ? (err.expose ? err.message : "Request error")
    : "Internal server error"
  res.status(status).json({ success: false, message })
})

export default app
