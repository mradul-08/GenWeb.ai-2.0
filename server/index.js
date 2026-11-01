import "./env.js"
import mongoose from "mongoose"
import app from "./app.js"
import connectDb from "./config/db.js"

const port = process.env.PORT || 3002

try {
  // Connect and create indexes before accepting traffic.
  await connectDb()
} catch (error) {
  console.error("DB startup failed:", error.message)
  process.exit(1)
}

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

// Render sends SIGTERM on deploys/restarts: stop accepting connections, let
// in-flight requests finish, then close the DB connection.
const shutdown = (signal) => {
  console.log(`${signal} received — shutting down`)
  server.close(async () => {
    await mongoose.disconnect().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 25000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))
