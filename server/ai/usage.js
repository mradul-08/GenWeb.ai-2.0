// Usage tracking. Writes are best-effort: a failure to record never breaks
// the user's request, but is logged.
import { AiCall, AiRequest } from "../models/ai.models.js"

export async function recordCall(row) {
  try { await AiCall.create(row) } catch (e) { console.error("[ai-usage] recordCall failed:", e.message) }
}

export async function startRequest({ requestId, userId, task, websiteId }) {
  try { await AiRequest.create({ requestId, user: userId, task, website: websiteId }) } catch (e) { console.error("[ai-usage] startRequest failed:", e.message) }
}

// Totals include EVERY provider attempt of the request: failed calls,
// design-brief planning and repairs.
export async function finishRequest(requestId, fields) {
  try {
    const [t = { attempts: 0, input: 0, output: 0 }] = await AiCall.aggregate([
      { $match: { requestId } },
      { $group: { _id: null, attempts: { $sum: 1 }, input: { $sum: "$inputTokens" }, output: { $sum: "$outputTokens" } } },
    ])
    await AiRequest.updateOne({ requestId }, {
      $set: { ...fields, attempts: t.attempts, inputTokens: t.input, outputTokens: t.output },
    })
  } catch (e) { console.error("[ai-usage] finishRequest failed:", e.message) }
}
