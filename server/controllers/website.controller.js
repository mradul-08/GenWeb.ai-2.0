import mongoose from "mongoose"
import { newRequestId, getProviderStatus } from "../ai/router.js"
import { getAiConfig } from "../ai/config.js"
import { startRequest, finishRequest } from "../ai/usage.js"
import { AiRequest } from "../models/ai.models.js"
import { reserve as reserveQuota, release as releaseQuota, userCounterId } from "../ai/quota.js"
import { generateSite, editSite, enhanceIdea } from "../ai/pipeline.js"
import { insertAt } from "../ai/htmlPatch.js"
import { allowedOrigins } from "../config/origins.js"
import Website from "../models/website.model.js"
import { reserveCredits, refundCredits } from "../services/credits.js"
import { commitCode, ensureVersioned, listVersions, getVersionCode, deleteHistory } from "../services/versions.js"

const CREDITS_CONFIG = {
  COST_PER_GENERATION: 50,
  COST_PER_EDIT: 50,
}

// Clients abort generate/edit requests after 240s. Stop the AI work well
// before that so a late success is never charged to a user who saw an error.
const REQUEST_BUDGET_MS = 200000

const MAX_CODE_BYTES = 1_500_000

// Credits are reserved (ledgered) before AI work and refunded if it fails —
// see services/credits.js.

// 5xx responses never carry internal error text; details stay in server logs.
const serverError = (res, label, e) => {
  console.error(`[${label}]`, e)
  return res.status(500).json({ success: false, message: "Something went wrong. Please try again." })
}

// ══════════════════════════════════════════════════════════════════════════════
// THUMBNAIL EXTRACTOR
// ══════════════════════════════════════════════════════════════════════════════
function extractThumbnailMeta(html, fallbackTitle = "") {
  let bg     = "#0a0a0f"
  let accent = "#818cf8"
  let title  = fallbackTitle

  try {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch?.[1]?.trim()) title = titleMatch[1].trim().slice(0, 60)

    const bgPatterns = [
      /--(?:bg|background|color-bg|bg-color|background-color)\s*:\s*(#[0-9a-fA-F]{3,8})/i,
      /body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/i,
      /:root\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/i,
    ]
    for (const pat of bgPatterns) {
      const m = html.match(pat)
      if (m?.[1]) { bg = m[1]; break }
    }

    const accentPatterns = [
      /--(?:primary|accent|color-primary|brand|highlight|main-color|theme-color)\s*:\s*(#[0-9a-fA-F]{3,8})/i,
      /--(?:violet|cyan|emerald|rose|amber|purple|blue|pink|teal|green|orange)\s*:\s*(#[0-9a-fA-F]{3,8})/i,
      /linear-gradient\([^)]*?(#[0-9a-fA-F]{6})/i,
    ]
    for (const pat of accentPatterns) {
      const m = html.match(pat)
      if (m?.[1] && m[1].toLowerCase() !== bg.toLowerCase()) {
        accent = m[1]
        break
      }
    }

    const knownAccents = ["#8b5cf6", "#06b6d4", "#10b981", "#f43f5e", "#f59e0b"]
    if (accent === "#818cf8") {
      for (const known of knownAccents) {
        if (html.includes(known)) { accent = known; break }
      }
    }
  } catch {
    // silent
  }

  return { thumbnailBg: bg, thumbnailAccent: accent, thumbnailTitle: title }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════
// Readable slug + random suffix: "Business Solutions" → "business-solutions-k3f9".
// Only new slugs use this; existing slugs are never changed (shared links).
export const generateSlug = (title) => {
  const base = String(title || "").toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "")
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 6).padEnd(4, "0")
}

const humanTime = (ms) => {
  if (!ms || ms <= 0) return "a few minutes"
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m} min` : "less than a minute"
}

// Basic sanity check for user-supplied HTML (direct edits, deploy).
function validateUserCode(code) {
  if (typeof code !== "string" || !code.trim()) return "Code is required"
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) return "Code is too large"
  if (!/<html[\s>]/i.test(code) || !/<\/html>/i.test(code)) return "Code must be a complete HTML document"
  return null
}

const notFound = (res) => res.status(404).json({ success: false, message: "Not found" })

// Loads the requesting user's website, or null for missing/invalid ids.
async function findOwnWebsite(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Website.findOne({ _id: req.params.id, user: req.user._id })
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
export const getApiStatus = async (req, res) => {
  try {
    const s = getProviderStatus()
    return res.json({ success: true, available: s.anyAvailable, providers: s.providers })
  } catch (e) { return serverError(res, "getApiStatus", e) }
}

// ── Daily AI request quota (atomic) ───────────────────────────────────────────
// A slot is reserved before any AI work and given back when the request fails
// for reasons that are not the user's (no free capacity, errors).
async function reserveDailySlot(userId) {
  const { perUserDailyRequests } = await getAiConfig()
  const slot = await reserveQuota(userCounterId(userId), perUserDailyRequests)
  return slot.ok ? userCounterId(userId) : null
}
const quotaResponse = (res) =>
  res.status(429).json({ success: false, code: "DAILY_LIMIT", message: "Daily AI request limit reached. Please try again tomorrow." })

// All free providers are out of capacity: say so clearly, with a retry hint.
const capacityResponse = (res, retryAfterMs) => {
  const retryAfterSeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds))
  return res.status(503).json({
    success: false, code: "AI_QUOTA_EXHAUSTED",
    message: `Free AI capacity is used up right now. Please try again in ${humanTime(retryAfterMs)}. No credits were charged.`,
    retryAfterSeconds,
  })
}

export const enhancePrompt = async (req, res) => {
  const requestId = newRequestId()
  const started = Date.now()
  let slot = null
  try {
    const { prompt } = req.body
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ success: false, message: "Prompt required" })
    slot = await reserveDailySlot(req.user._id)
    if (!slot) return quotaResponse(res)

    await startRequest({ requestId, userId: req.user._id, task: "enhance" })
    const r = await enhanceIdea(prompt.trim(), { ctx: { requestId, userId: req.user._id } })
    if (!r.text) {
      await releaseQuota(slot); slot = null
      await finishRequest(requestId, { outcome: "failed", failureReason: r.exhausted ? "free_capacity_exhausted" : "no_model_available", durationMs: Date.now() - started })
      return r.exhausted ? capacityResponse(res, r.retryAfterMs) : res.status(503).json({ success: false, message: "Enhance engine busy" })
    }
    await finishRequest(requestId, { outcome: "success", modelUsed: r.model?.id || "cache", durationMs: Date.now() - started })
    return res.json({ success: true, enhancedPrompt: r.text })
  } catch (e) {
    if (slot) await releaseQuota(slot)
    await finishRequest(requestId, { outcome: "failed", failureReason: "error" })
    return serverError(res, "enhancePrompt", e)
  }
}

export const generateWebsite = async (req, res) => {
  const cost = CREDITS_CONFIG.COST_PER_GENERATION
  const requestId = newRequestId()
  const started = Date.now()
  let reservation = null, slot = null
  try {
    const { prompt } = req.body
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ success: false, message: "Prompt required" })
    const user = req.user

    slot = await reserveDailySlot(user._id)
    if (!slot) return quotaResponse(res)
    reservation = await reserveCredits(user._id, cost, { note: "generation" })
    if (!reservation) { await releaseQuota(slot); slot = null; return res.status(403).json({ success: false, message: `Need ${cost} credits` }) }

    await startRequest({ requestId, userId: user._id, task: "generate" })
    const result = await generateSite(prompt.trim(), { deadline: Date.now() + REQUEST_BUDGET_MS, ctx: { requestId, userId: user._id } })

    if (!result.parsed) {
      await refundCredits(user._id, reservation, "generation failed"); reservation = null
      await releaseQuota(slot); slot = null
      await finishRequest(requestId, {
        outcome: "failed", failureReason: result.reason, strategy: result.strategy, designBrief: result.briefStatus,
        validation: result.validation, durationMs: Date.now() - started,
      })
      if (result.exhausted) return capacityResponse(res, result.retryAfterMs)
      const s = getProviderStatus()
      return res.status(503).json({ success: false, message: "Generation failed", nextResetHuman: humanTime(s.earliestReset) })
    }
    const parsed = result.parsed

    const title = (parsed.title || prompt.trim()).slice(0, 80)
    const { thumbnailBg, thumbnailAccent, thumbnailTitle } = extractThumbnailMeta(parsed.code, title)

    const website = await Website.create({
      user:           user._id,
      title,
      latestCode:     parsed.code,
      slug:           generateSlug(title),
      thumbnailBg,
      thumbnailAccent,
      thumbnailTitle,
      conversation: [
        { role: "user", content: prompt.trim() },
        { role: "ai",   content: parsed.message || "Website generated." },
      ],
    })

    // History is secondary to the generated site: a failure here is logged,
    // never charged back (the next change creates the missing first version).
    try {
      await commitCode(website._id, parsed.code, { source: "generate", label: prompt.trim(), userId: user._id })
    } catch (e) { console.error("[versions] generate", e) }

    await finishRequest(requestId, {
      outcome: "success", website: website._id, modelUsed: result.model.id, strategy: result.strategy,
      designBrief: result.briefStatus, validation: result.validation, durationMs: Date.now() - started,
    })

    return res.status(201).json({
      success:   true,
      message:   parsed.message,
      code:      parsed.code,
      websiteId: website._id,
      website:   { id: website._id, title: website.title, slug: website.slug },
      credits:   { used: cost, remaining: reservation.balance },
    })
  } catch (e) {
    if (reservation) await refundCredits(req.user._id, reservation, "generation error")
    if (slot) await releaseQuota(slot)
    await finishRequest(requestId, { outcome: "failed", failureReason: "error", durationMs: Date.now() - started })
    return serverError(res, "generateWebsite", e)
  }
}

export const getUserWebsites = async (req, res) => {
  try {
    const websites = await Website.find({ user: req.user._id })
      .select("title slug deployed deployUrl createdAt thumbnailBg thumbnailAccent thumbnailTitle")
      .sort({ createdAt: -1 })
    return res.json({ success: true, websites })
  } catch (e) { return serverError(res, "getUserWebsites", e) }
}

export const getWebsite = async (req, res) => {
  try {
    const w = await findOwnWebsite(req)
    if (!w) return notFound(res)
    return res.json({ success: true, website: w })
  } catch (e) { return serverError(res, "getWebsite", e) }
}

export const updateWebsite = async (req, res) => {
  const cost = CREDITS_CONFIG.COST_PER_EDIT
  const requestId = newRequestId()
  const started = Date.now()
  let reservation = null, slot = null
  try {
    const { prompt } = req.body
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ success: false, message: "Prompt required" })

    const user    = req.user
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)

    slot = await reserveDailySlot(user._id)
    if (!slot) return quotaResponse(res)
    reservation = await reserveCredits(user._id, cost, { websiteId: website._id, note: "edit" })
    if (!reservation) { await releaseQuota(slot); slot = null; return res.status(403).json({ success: false, message: "Insufficient credits" }) }

    await startRequest({ requestId, userId: user._id, task: "edit", websiteId: website._id })
    const r = await editSite(website.latestCode, prompt.trim(), { deadline: Date.now() + REQUEST_BUDGET_MS, ctx: { requestId, userId: user._id } })
    console.log(`[SmartEdit] ${r.plan.editType} → ${r.mode}${r.fellBackToFull ? " (fallback)" : ""} | needs ${JSON.stringify(r.plan.needs)}`)

    if (!r.parsed) {
      await refundCredits(user._id, reservation, "edit failed"); reservation = null
      await releaseQuota(slot); slot = null
      await finishRequest(requestId, {
        outcome: "failed", failureReason: r.reason, editType: r.plan.editType, editMode: r.mode,
        fellBackToFull: r.fellBackToFull, validation: r.validation, durationMs: Date.now() - started,
      })
      if (r.exhausted) return capacityResponse(res, r.retryAfterMs)
      return res.status(503).json({ success: false, message: "Update failed — try again." })
    }

    // Code, conversation and version are written together; if this throws,
    // nothing was saved and the catch below refunds the credits.
    await commitCode(website._id, r.parsed.code, {
      source: "ai_edit", label: prompt.trim(), userId: user._id,
      set: extractThumbnailMeta(r.parsed.code, website.title),
      push: { conversation: { $each: [
        { role: "user", content: prompt.trim() },
        { role: "ai",   content: `Done! Applied: ${prompt.trim().slice(0, 80)}` },
      ] } },
    })

    await finishRequest(requestId, {
      outcome: "success", modelUsed: r.model?.id, editType: r.plan.editType, editMode: r.mode,
      fellBackToFull: r.fellBackToFull, validation: r.validation, durationMs: Date.now() - started,
    })

    // Measured totals across every AI call of this edit (incl. failed attempts and fallbacks).
    const totals = await AiRequest.findOne({ requestId }).select("inputTokens outputTokens attempts").lean()

    return res.json({
      success:  true,
      message:  `Applied: ${prompt.trim().slice(0, 60)}`,
      code:     r.parsed.code,
      editType: r.plan.editType,
      mode:     r.mode,
      usage:    totals ? { inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, aiCalls: totals.attempts } : null,
      credits:  { used: cost, remaining: reservation.balance },
    })
  } catch (e) {
    if (reservation) await refundCredits(req.user._id, reservation, "edit error")
    if (slot) await releaseQuota(slot)
    await finishRequest(requestId, { outcome: "failed", failureReason: "error", durationMs: Date.now() - started })
    return serverError(res, "updateWebsite", e)
  }
}

// Saves code edited directly in the editor (source edit, undo/redo). No AI, no credits.
// PATCH /api/website/:id/code  body: { code }
export const saveWebsiteCode = async (req, res) => {
  try {
    const { code } = req.body
    const invalid = validateUserCode(code)
    if (invalid) return res.status(400).json({ success: false, message: invalid })

    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)

    const version = await commitCode(website._id, code, {
      source: "manual_save", label: "Manual edit", userId: req.user._id,
      set: extractThumbnailMeta(code, website.title),
    })
    return res.json({ success: true, message: "Saved", version })
  } catch (e) {
    return serverError(res, "saveWebsiteCode", e)
  }
}

export const deleteWebsite = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res)
    const w = await Website.findOneAndDelete({ _id: req.params.id, user: req.user._id })
    if (!w) return notFound(res)
    await deleteHistory(w._id)
    return res.json({ success: true, message: "Deleted successfully" })
  } catch (e) { return serverError(res, "deleteWebsite", e) }
}

// ══════════════════════════════════════════════════════════════════════════════
// VERSION HISTORY — see services/versions.js
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/website/:id/versions → newest first, without content.
export const getWebsiteVersions = async (req, res) => {
  try {
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)
    await ensureVersioned(website)
    const [versions, head] = await Promise.all([
      listVersions(website._id),
      Website.findById(website._id).select("headVersion").lean(),
    ])
    return res.json({
      success: true,
      versions: versions.map(v => ({
        id: v._id, seq: v.seq, source: v.source, label: v.label,
        size: v.files.reduce((n, f) => n + f.size, 0), createdAt: v.createdAt,
        current: String(v._id) === String(head.headVersion),
      })),
    })
  } catch (e) { return serverError(res, "getWebsiteVersions", e) }
}

async function findOwnVersion(req, res) {
  const website = await findOwnWebsite(req)
  if (!website || !mongoose.isValidObjectId(req.params.versionId)) { notFound(res); return null }
  const found = await getVersionCode(website._id, req.params.versionId)
  if (!found) { notFound(res); return null }
  return { website, ...found }
}

// GET /api/website/:id/versions/:versionId → { code } of that version.
export const getWebsiteVersion = async (req, res) => {
  try {
    const found = await findOwnVersion(req, res)
    if (!found) return
    const { version, code } = found
    return res.json({ success: true, version: { id: version._id, seq: version.seq, source: version.source, label: version.label, createdAt: version.createdAt }, code })
  } catch (e) { return serverError(res, "getWebsiteVersion", e) }
}

// POST /api/website/:id/versions/:versionId/restore → makes that version's
// code current by recording it as a NEW version (history is never rewritten).
// Like a manual save, it also updates a deployed site.
export const restoreWebsiteVersion = async (req, res) => {
  try {
    const found = await findOwnVersion(req, res)
    if (!found) return
    const { website, version, code } = found
    const head = await commitCode(website._id, code, {
      source: "restore", label: `Restored version ${version.seq}`, userId: req.user._id,
      set: extractThumbnailMeta(code, website.title),
    })
    return res.json({ success: true, message: `Restored version ${version.seq}`, code, version: head })
  } catch (e) { return serverError(res, "restoreWebsiteVersion", e) }
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPLOY — serves HTML directly from Express at /s/:slug
// ══════════════════════════════════════════════════════════════════════════════

// body: { code? } — when present, the editor's current code is saved first so
// the deployed site matches what the user sees.
export const deployWebsite = async (req, res) => {
  try {
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)

    if (req.body?.code !== undefined) {
      const invalid = validateUserCode(req.body.code)
      if (invalid) return res.status(400).json({ success: false, message: invalid })
      await commitCode(website._id, req.body.code, {
        source: "deploy", label: "Saved when deploying", userId: req.user._id,
        set: extractThumbnailMeta(req.body.code, website.title),
      })
    }

    if (!website.slug) {
      website.slug = generateSlug(website.title)
    }

    const baseUrl  = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3002}`
    const deployUrl = `${baseUrl}/s/${website.slug}`

    website.deployed  = true
    website.deployUrl = deployUrl
    await website.save()

    console.log(`[Deploy] ✅ "${website.title}" → ${deployUrl}`)

    return res.json({
      success:   true,
      deployUrl,
      slug:      website.slug,
      message:   "Deployed successfully!",
    })
  } catch (e) {
    return serverError(res, "deployWebsite", e)
  }
}

export const undeployWebsite = async (req, res) => {
  try {
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)

    website.deployed  = false
    website.deployUrl = ""
    await website.save()

    console.log(`[Undeploy] "${website.title}" taken offline`)
    return res.json({ success: true, message: "Site taken offline." })
  } catch (e) {
    return serverError(res, "undeployWebsite", e)
  }
}

// Deployed sites are sandboxed (opaque origin) because they are served from the
// API's own origin: without this, a site's scripts could call /api/* with the
// visitor's session cookie. Sandboxed pages cannot use real localStorage, so a
// small in-memory stand-in keeps theme toggles and similar scripts working.
const STORAGE_SHIM = `<script>(function(){try{window.localStorage.length}catch(e){var mk=function(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true})}catch(e2){}}})();</script>`

const DEPLOY_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
  `frame-ancestors 'self' ${allowedOrigins.join(" ")}`,
].join("; ")

// ── Public route — NO auth — serves raw HTML at GET /s/:slug ─────────────────
export const serveDeployedSite = async (req, res) => {
  try {
    const { slug } = req.params
    const website  = await Website.findOne({ slug: String(slug), deployed: true })
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173"

    if (!website) {
      return res.status(404).send(`<!DOCTYPE html>
<html><head><title>Not Found — GenWeb.ai</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#040408;color:#fff;font-family:system-ui,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:100vh;gap:16px;text-align:center;padding:24px}
  h1{font-size:64px;font-weight:800;background:linear-gradient(135deg,#818cf8,#38bdf8);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  p{color:rgba(255,255,255,0.45);font-size:16px;line-height:1.7;max-width:400px}
  a{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:12px 28px;
    border-radius:12px;background:linear-gradient(135deg,#818cf8,#38bdf8);
    color:#fff;text-decoration:none;font-weight:700;font-size:14px}
</style></head>
<body>
  <h1>404</h1>
  <p>This site isn't deployed or the link has expired.</p>
  <a href="${clientUrl}">✦ Build your own with GenWeb.ai</a>
</body></html>`)
    }

    const ribbon = `<style>
#__gwai_ribbon{position:fixed;bottom:16px;right:16px;z-index:2147483647;
  display:flex;align-items:center;gap:7px;padding:8px 16px;
  border-radius:999px;background:rgba(4,4,12,0.88);
  border:1px solid rgba(129,140,248,0.4);backdrop-filter:blur(16px);
  text-decoration:none;font-family:system-ui,sans-serif;font-size:12px;
  font-weight:700;color:#a5b4fc;box-shadow:0 4px 24px rgba(0,0,0,0.5);
  transition:all .2s;letter-spacing:-.01em}
#__gwai_ribbon:hover{border-color:rgba(129,140,248,0.8);color:#c7d2fe;
  transform:translateY(-2px);box-shadow:0 8px 32px rgba(129,140,248,0.25)}
</style>
<a id="__gwai_ribbon" href="${clientUrl}" target="_blank" rel="noopener">
  ✦ Built with GenWeb.ai
</a>`

    let html = website.latestCode

    const headOpen = html.match(/<head[^>]*>/i)
    html = headOpen
      ? insertAt(html, headOpen.index + headOpen[0].length, STORAGE_SHIM)
      : STORAGE_SHIM + html

    const bodyEnd = html.search(/<\/body>/i)
    html = bodyEnd !== -1 ? insertAt(html, bodyEnd, ribbon + "\n") : html + ribbon

    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Content-Security-Policy", DEPLOY_CSP)
    res.setHeader("Cache-Control", "public, max-age=60")
    return res.send(html)

  } catch (e) {
    console.error("[serveDeployedSite]", e)
    return res.status(500).send("Server error")
  }
}
