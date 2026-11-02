// Short-lived cache for deterministic-enough AI results keyed by exact input:
// design briefs (a retry of the same prompt reuses its brief) and prompt
// enhancements. Never caches whole generated sites — users expect variety.
import crypto from "crypto"
import { AiCache } from "../models/ai.models.js"

const TTL_MS = { design_brief: 30 * 60 * 1000, enhance: 24 * 60 * 60 * 1000, plan: 30 * 60 * 1000 }

const keyFor = (task, input) =>
  `${task}:${crypto.createHash("sha256").update(input.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex")}`

export async function getCached(task, input) {
  try {
    const doc = await AiCache.findById(keyFor(task, input)).lean()
    return doc && doc.expiresAt > new Date() ? doc.value : null
  } catch { return null }
}

export async function setCached(task, input, value) {
  try {
    await AiCache.updateOne(
      { _id: keyFor(task, input) },
      { $set: { value, expiresAt: new Date(Date.now() + (TTL_MS[task] ?? 30 * 60 * 1000)) } },
      { upsert: true }
    )
  } catch (e) { console.error("[ai-cache] write failed:", e.message) }
}
