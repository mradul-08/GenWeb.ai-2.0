// Effective AI configuration = defaults + admin overrides from MongoDB.
// Free-only deployment: there are no paid models, prices or budgets to
// configure, and attempts to set them are rejected.
import { AiConfig } from "../models/ai.models.js"
import { DEFAULT_MODELS, TASKS } from "./catalog.js"

export const DESIGN_STRATEGIES = ["auto", "brief", "single"]

export const DEFAULT_AI_CONFIG = Object.freeze({
  perUserDailyRequests: 60,      // generate + edit + enhance per user per UTC day
  designStrategy:       "auto",  // see ai/strategy.js
  models:               {},      // { [modelId]: { enabled?, priority? } }
})

const CACHE_MS = 30 * 1000
let cache = { value: null, at: 0 }

export function resetAiConfigCache() { cache = { value: null, at: 0 } }

// Model IDs contain dots ("glm-4.5-flash"), which MongoDB treats as path
// separators in object keys — so overrides are stored as an array of
// { id, ...fields } and exposed as an object keyed by id.
const modelsToArray = (obj = {}) => Object.entries(obj).map(([id, o]) => ({ id, ...o }))
const modelsToObject = (arr) => Array.isArray(arr) ? Object.fromEntries(arr.map(({ id, ...o }) => [id, o])) : {}

// Last loaded config without I/O (defaults before the first load). For status
// reporting only; request paths use getAiConfig().
export function peekAiConfig() { return cache.value || { ...DEFAULT_AI_CONFIG } }

export async function getAiConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value
  const doc = await AiConfig.findById("global").lean().catch(() => null)
  const merged = { ...DEFAULT_AI_CONFIG }
  for (const k of ["perUserDailyRequests", "designStrategy"]) if (doc && doc[k] !== undefined && doc[k] !== null) merged[k] = doc[k]
  merged.models = modelsToObject(doc?.modelOverrides)
  cache = { value: merged, at: Date.now() }
  return merged
}

// Catalog with per-model overrides applied. Always free-only.
export function effectiveModels(config) {
  return DEFAULT_MODELS.filter(m => m.tier === "free").map(m => {
    const o = config.models?.[m.id] || {}
    const priority = typeof o.priority === "number"
      ? Object.fromEntries(m.tasks.map(t => [t, o.priority]))
      : { ...m.priority, ...(o.priority || {}) }
    // Locked models can never be enabled through configuration.
    return { ...m, enabled: m.lockedReason ? false : (o.enabled ?? m.enabled), priority }
  })
}

const PAID_FIELDS = new Set(["paidEnabled", "monthlyBudgetUsd", "perUserDailyPaidUsd", "paidFirstTasks", "priceIn", "priceOut", "tier"])
const PAID_MESSAGE = "Paid AI usage is disabled in this deployment (free-only); paid models, prices and budgets cannot be configured"
const isNum = (v, min = 0, max = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max

// Validates an admin patch; returns { error } or { update }.
export function validateConfigPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { error: "Body must be an object" }
  const update = {}
  for (const [k, v] of Object.entries(patch)) {
    if (PAID_FIELDS.has(k)) return { error: PAID_MESSAGE }
    if (k === "perUserDailyRequests") {
      if (!(Number.isInteger(v) && v >= 0 && v <= 10000)) return { error: "perUserDailyRequests must be an integer 0–10000" }
    } else if (k === "designStrategy") {
      if (!DESIGN_STRATEGIES.includes(v)) return { error: `designStrategy must be one of ${DESIGN_STRATEGIES.join(", ")}` }
    } else if (k === "models") {
      if (!v || typeof v !== "object" || Array.isArray(v)) return { error: "models must be an object" }
      const ids = new Set(DEFAULT_MODELS.map(m => m.id))
      for (const [id, o] of Object.entries(v)) {
        if (!ids.has(id)) return { error: `Unknown model: ${id} (only catalog models can be configured)` }
        if (!o || typeof o !== "object") return { error: `models.${id} must be an object` }
        for (const [f, fv] of Object.entries(o)) {
          if (PAID_FIELDS.has(f)) return { error: PAID_MESSAGE }
          if (f === "enabled") {
            if (typeof fv !== "boolean") return { error: `models.${id}.enabled must be boolean` }
            const locked = DEFAULT_MODELS.find(m => m.id === id)?.lockedReason
            if (fv && locked) return { error: `models.${id} is locked and cannot be enabled: ${locked}` }
          }
          else if (f === "priority") {
            const ok = isNum(fv, 0, 1000) || (fv && typeof fv === "object" && Object.entries(fv).every(([t, p]) => TASKS.includes(t) && isNum(p, 0, 1000)))
            if (!ok) return { error: `models.${id}.priority must be a number or { task: number }` }
          } else return { error: `Unknown field models.${id}.${f}` }
        }
      }
    } else {
      return { error: `Unknown field: ${k}` }
    }
    update[k] = v
  }
  return { update }
}

export async function updateAiConfig(update, adminId) {
  const { models, ...rest } = update
  const set = { ...rest, updatedBy: adminId }
  if (models) {
    const current = modelsToObject((await AiConfig.findById("global").lean())?.modelOverrides)
    for (const [id, o] of Object.entries(models)) current[id] = { ...(current[id] || {}), ...o }
    set.modelOverrides = modelsToArray(current)
  }
  await AiConfig.updateOne({ _id: "global" }, { $set: set }, { upsert: true })
  resetAiConfigCache()
  return getAiConfig()
}

// Test/maintenance helper: replace all model overrides.
export async function setModelOverrides(models) {
  await AiConfig.updateOne({ _id: "global" }, { $set: { modelOverrides: modelsToArray(models) } }, { upsert: true })
  resetAiConfigCache()
}
