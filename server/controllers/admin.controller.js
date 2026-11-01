// Admin-only AI configuration and observability endpoints (free-only deployment).
import { AiCall, AiRequest } from "../models/ai.models.js"
import { getAiConfig, effectiveModels, validateConfigPatch, updateAiConfig, DEFAULT_AI_CONFIG } from "../ai/config.js"
import { getProviderStatus } from "../ai/router.js"

const serverError = (res, label, e) => {
  console.error(`[admin:${label}]`, e)
  return res.status(500).json({ success: false, message: "Something went wrong" })
}

const publicModel = (m) => ({
  id: m.id, provider: m.provider, model: m.model, tier: m.tier, enabled: m.enabled, lockedReason: m.lockedReason ?? null, tasks: m.tasks, priority: m.priority,
})

export const getConfig = async (req, res) => {
  try {
    const config = await getAiConfig()
    return res.json({ success: true, freeOnly: true, config, defaults: DEFAULT_AI_CONFIG, models: effectiveModels(config).map(publicModel) })
  } catch (e) { return serverError(res, "getConfig", e) }
}

export const putConfig = async (req, res) => {
  try {
    const { error, update } = validateConfigPatch(req.body)
    if (error) return res.status(400).json({ success: false, message: error })
    const config = await updateAiConfig(update, req.user._id)
    console.log(`[admin] AI config updated by ${req.user._id}: ${Object.keys(update).join(", ")}`)
    return res.json({ success: true, config, models: effectiveModels(config).map(publicModel) })
  } catch (e) { return serverError(res, "putConfig", e) }
}

export const getProviders = async (req, res) => {
  try { return res.json({ success: true, ...getProviderStatus() }) }
  catch (e) { return serverError(res, "getProviders", e) }
}

const sinceDays = (req, def = 7) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || def, 1), 90)
  return { days, since: new Date(Date.now() - days * 86400000) }
}
const count = (arr) => arr.filter(Boolean).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {})

// Request totals include every provider attempt (failures, planning, repairs).
export const getUsage = async (req, res) => {
  try {
    const { days, since } = sinceDays(req)
    const byModel = await AiCall.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { model: "$modelId", task: "$task" },
        calls: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ["$outcome", "success"] }, 1, 0] } },
        avgLatencyMs: { $avg: "$latencyMs" }, maxLatencyMs: { $max: "$latencyMs" },
        inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" },
        estimatedRows: { $sum: { $cond: ["$tokensEstimated", 1, 0] } },
        outcomes: { $push: "$outcome" },
      } },
      { $sort: { "_id.task": 1, calls: -1 } },
    ])
    const byTask = await AiRequest.aggregate([
      { $match: { createdAt: { $gte: since }, outcome: { $ne: "pending" } } },
      { $group: {
        _id: { task: "$task", strategy: "$strategy" },
        requests: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ["$outcome", "success"] }, 1, 0] } },
        avgDurationMs: { $avg: "$durationMs" }, avgAttempts: { $avg: "$attempts" },
        inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" },
        fellBackToFull: { $sum: { $cond: ["$fellBackToFull", 1, 0] } },
        editModes: { $push: "$editMode" }, failureReasons: { $push: "$failureReason" },
      } },
    ])
    return res.json({
      success: true, days,
      byTask: byTask.map(t => ({
        task: t._id.task, strategy: t._id.strategy ?? null, requests: t.requests,
        successRate: t.requests ? t.successes / t.requests : null,
        avgDurationMs: Math.round(t.avgDurationMs || 0), avgAttempts: t.avgAttempts,
        inputTokens: t.inputTokens, outputTokens: t.outputTokens,
        tokensPerSuccess: t.successes ? Math.round((t.inputTokens + t.outputTokens) / t.successes) : null,
        fellBackToFull: t.fellBackToFull, editModes: count(t.editModes), failureReasons: count(t.failureReasons),
      })),
      byModel: byModel.map(m => ({
        model: m._id.model, task: m._id.task, calls: m.calls, successRate: m.successes / m.calls,
        avgLatencyMs: Math.round(m.avgLatencyMs || 0), maxLatencyMs: m.maxLatencyMs,
        inputTokens: m.inputTokens, outputTokens: m.outputTokens, estimatedRows: m.estimatedRows,
        outcomes: count(m.outcomes),
      })),
    })
  } catch (e) { return serverError(res, "getUsage", e) }
}
