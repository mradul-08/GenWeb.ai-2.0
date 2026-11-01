// Atomic daily counters for user and provider quotas.
//
// A slot is reserved with a single conditional upsert, so concurrent requests
// can never push a counter past its limit (no count-then-increment race).
// Counters are keyed by UTC day and expire automatically after two days.
import mongoose from "mongoose"
import { isDuplicateKeyError } from "../services/credits.js"

const counterSchema = new mongoose.Schema({
  _id:       { type: String },
  count:     { type: Number, default: 0 },
  expiresAt: { type: Date },
}, { versionKey: false })
counterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const AiCounter = mongoose.model("AiCounter", counterSchema, "ai_counters")

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10)
export const msUntilNextUtcDay = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()
}

// Reserves one unit of `id` if the count is below `limit`.
// Returns { ok: true, count } or { ok: false, count }.
export async function reserve(id, limit) {
  if (!(limit > 0)) return { ok: false, count: 0 }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const doc = await AiCounter.findOneAndUpdate(
        { _id: id, count: { $lt: limit } },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 86400000) } },
        { upsert: true, returnDocument: "after" }
      )
      return { ok: true, count: doc.count }
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e
      // Either the counter is at its limit (filter missed, insert collided) or a
      // concurrent request created it first — re-read to tell which.
      const current = await AiCounter.findById(id).lean()
      if (current && current.count >= limit) return { ok: false, count: current.count }
    }
  }
  return { ok: false, count: limit }
}

// Gives a reserved unit back (e.g. the request failed for reasons that are not the user's).
export async function release(id) {
  await AiCounter.updateOne({ _id: id, count: { $gt: 0 } }, { $inc: { count: -1 } })
}

export const userCounterId     = (userId) => `user:${userId}:${utcDay()}`
export const providerCounterId = (provider, scopeKey) => `provider:${provider}:${scopeKey}:${utcDay()}`
