import mongoose from "mongoose"

const { ObjectId, Mixed } = mongoose.Schema.Types

// One row per provider attempt (success or failure).
const aiCallSchema = new mongoose.Schema({
  requestId:  { type: String, required: true },
  user:       { type: ObjectId, ref: "User" },
  task:       { type: String, required: true },
  modelId:    { type: String, required: true },
  provider:   { type: String, required: true },
  tier:       { type: String, enum: ["free"], required: true },
  outcome:    { type: String, required: true },     // success | auth | restricted | billing | quota_exhausted | rate_limit | model_unavailable | http | timeout | network | empty
  httpStatus: { type: Number },
  latencyMs:  { type: Number },
  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  cachedTokens: { type: Number, default: 0 },
  tokensEstimated: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } })
aiCallSchema.index({ createdAt: -1 })
aiCallSchema.index({ requestId: 1 })

// One row per user-facing AI action (generate / edit / enhance).
const aiRequestSchema = new mongoose.Schema({
  requestId:  { type: String, required: true, unique: true },
  user:       { type: ObjectId, ref: "User" },
  task:       { type: String, required: true },
  website:    { type: ObjectId, ref: "Website" },
  outcome:    { type: String, enum: ["success", "failed", "pending"], default: "pending" },
  failureReason: { type: String },
  editType:   { type: String },
  editMode:   { type: String },
  fellBackToFull: { type: Boolean },
  designBrief: { type: String, enum: ["ok", "failed", "skipped", "cached"] },
  strategy:   { type: String },
  validation: { passed: Boolean, reasons: [String] },
  attempts:   { type: Number, default: 0 },
  modelUsed:  { type: String },
  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  durationMs: { type: Number },
}, { timestamps: true })
aiRequestSchema.index({ user: 1, createdAt: -1 })
aiRequestSchema.index({ createdAt: -1 })

// Short-lived cache of design briefs / enhancements for identical requests.
const aiCacheSchema = new mongoose.Schema({
  _id:       { type: String },          // task:sha256(normalised input)
  value:     { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false })
aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Single document (_id: "global") holding admin overrides.
const aiConfigSchema = new mongoose.Schema({
  _id:                  { type: String, default: "global" },
  perUserDailyRequests: { type: Number },
  designStrategy:       { type: String },
  modelOverrides:       { type: [Mixed], default: undefined },   // [{ id, enabled?, priority? }] (ids contain dots)
  updatedBy:            { type: ObjectId, ref: "User" },
}, { timestamps: true, minimize: false })

export const AiCall    = mongoose.model("AiCall", aiCallSchema, "ai_calls")
export const AiRequest = mongoose.model("AiRequest", aiRequestSchema, "ai_requests")
export const AiConfig  = mongoose.model("AiConfig", aiConfigSchema, "ai_config")
export const AiCache   = mongoose.model("AiCache", aiCacheSchema, "ai_cache")
