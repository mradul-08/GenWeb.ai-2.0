// AI pipeline for single-file sites: generation (single-call or brief + call),
// incremental editing, deterministic validation/repair and targeted AI repair.
// No HTTP, credits or quotas here — callers handle those.
import { runTask } from "./router.js"
import { planEdit } from "./intent.js"
import { patchHTML } from "./htmlPatch.js"
import { validateDocument, comparePatch, deterministicRepair, brokenScripts } from "./validate.js"
import { getCached, setCached } from "./cache.js"
import { chooseStrategy } from "./strategy.js"
import { getAiConfig } from "./config.js"
import { replaceExternalImages } from "./sanitize.js"
import {
  buildDesignBriefPrompt, parseDesignBrief, buildGenerationPrompt, buildFullEditPrompt,
  buildSectionEditPrompt, buildStyleEditPrompt, buildTextEditPrompt, buildScriptRepairPrompt, buildEnhancePrompt,
} from "./prompts.js"

const GENERATION_MAX_TOKENS = 12000
const MAX_GENERATION_ATTEMPTS = 2

export function robustExtract(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null
  let title = "Generated Website", message = "Website successfully generated.", code = ""
  try {
    const firstBrace = raw.indexOf("{"), firstClose = raw.indexOf("}")
    if (firstBrace !== -1 && firstClose !== -1 && firstClose > firstBrace) {
      const p = JSON.parse(raw.slice(firstBrace, firstClose + 1))
      if (p.title) title = p.title
      if (p.message) message = p.message
    }
  } catch {
    const t = raw.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
    const m = raw.match(/"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
    if (t) title = t[1]; if (m) message = m[1]
  }
  const htmlBlock = raw.match(/```html\s*([\s\S]*?)\s*```/i)
  if (htmlBlock?.[1]?.trim().length > 200) code = htmlBlock[1].trim()
  else {
    const lo = raw.toLowerCase()
    const s = lo.indexOf("<!doctype") !== -1 ? lo.indexOf("<!doctype") : lo.indexOf("<html")
    const e = lo.lastIndexOf("</html>")
    if (s !== -1) code = (e !== -1 ? raw.slice(s, e + 7) : raw.slice(s).replace(/```\s*$/, "")).trim()
  }
  if (!code || code.length < 500) return null
  return { title, message, code }
}

// Fixes JavaScript syntax errors by asking for the broken <script> only.
async function repairScripts(html, { deadline, ctx }) {
  let out = html
  for (const s of brokenScripts(html).slice(0, 2)) {
    const { content } = await runTask({ task: "edit", prompt: buildScriptRepairPrompt(s.full, s.error), maxTokens: 3000, deadline, ctx, minChars: 20 })
    const fixed = content?.match(/<script\b[\s\S]*?<\/script>/i)?.[0]
    if (!fixed) return null
    out = out.replace(s.full, () => fixed)
  }
  return out
}

// Produces a valid document from raw model output: deterministic repair first,
// then a targeted AI repair for broken scripts. Returns { parsed, validation, repairs }.
// allowedSource: text whose image URLs are legitimate (the user's request, and
// for edits the existing page); any other external image URL is replaced.
async function finalizeDocument(raw, { deadline, ctx, allowedSource = "" }) {
  const parsed = robustExtract(raw)
  if (!parsed) return { parsed: null, validation: { passed: false, reasons: ["unparseable_output"] }, repairs: [] }
  const images = replaceExternalImages(parsed.code, allowedSource)
  parsed.code = images.html

  let check = validateDocument(parsed.code)
  const repairs = []
  if (!check.valid) {
    const fixed = deterministicRepair(parsed.code)
    if (fixed.fixes.length) { parsed.code = fixed.html; repairs.push(...fixed.fixes); check = validateDocument(parsed.code) }
  }
  if (!check.valid && check.reasons.every(r => r === "script_syntax_error")) {
    const repaired = await repairScripts(parsed.code, { deadline, ctx })
    if (repaired) { parsed.code = repaired; repairs.push("ai_script_repair"); check = validateDocument(parsed.code) }
  }
  const warnings = images.replaced ? [...check.warnings, `external_images_replaced:${images.replaced}`] : check.warnings
  return { parsed: check.valid ? parsed : null, validation: { passed: check.valid, reasons: check.reasons, warnings }, repairs }
}

// Whole-document task with validation. Retries only when the output fails
// validation after repair; stops immediately when no free model is available.
export async function runDocumentTask(task, prompt, { deadline, ctx, allowedSource }) {
  let last = { validation: null, reason: "no_model_available", repairs: [] }
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && Date.now() < deadline; attempt++) {
    const r = await runTask({ task, prompt, maxTokens: GENERATION_MAX_TOKENS, deadline, ctx, minChars: 100 })
    if (!r.content) return { parsed: null, reason: r.exhausted ? "free_capacity_exhausted" : "no_model_available", exhausted: r.exhausted, retryAfterMs: r.retryAfterMs, validation: last.validation, repairs: last.repairs }
    const f = await finalizeDocument(r.content, { deadline, ctx, allowedSource })
    if (f.parsed) return { parsed: f.parsed, model: r.model, validation: f.validation, repairs: f.repairs }
    last = { validation: f.validation, reason: "validation_failed", repairs: f.repairs }
  }
  return { parsed: null, ...last }
}

async function designBrief(prompt, { deadline, ctx }) {
  const cached = await getCached("design_brief", prompt)
  if (cached) return { brief: parseDesignBrief(cached), status: "cached" }
  const r = await runTask({ task: "design_brief", prompt: buildDesignBriefPrompt(prompt), maxTokens: 700, deadline: Math.min(deadline, Date.now() + 35000), ctx })
  const brief = parseDesignBrief(r.content)
  if (brief) await setCached("design_brief", prompt, r.content)
  return { brief, status: brief ? "ok" : "failed" }
}

export async function generateSite(prompt, { deadline, ctx, strategy }) {
  const config = await getAiConfig()
  const chosen = strategy || chooseStrategy(prompt, config.designStrategy)
  let brief = null, briefStatus = "skipped"
  if (chosen === "brief") ({ brief, status: briefStatus } = await designBrief(prompt, { deadline, ctx }))
  const result = await runDocumentTask("generate", buildGenerationPrompt(prompt, brief), { deadline, ctx, allowedSource: prompt })
  return { ...result, strategy: chosen, briefStatus }
}

// Smallest edit that satisfies the request; falls back to a full rewrite when a
// patch cannot be applied or would make the page worse.
export async function editSite(fullHTML, prompt, { deadline, ctx }) {
  const plan = planEdit(fullHTML, prompt)
  const full = async (fellBackToFull, patchRejection) => {
    const r = await runDocumentTask("edit", buildFullEditPrompt(fullHTML, prompt), { deadline, ctx, allowedSource: prompt + "\n" + fullHTML })
    if (r.parsed) {
      const regression = comparePatch(fullHTML, r.parsed.code, plan.needs)
      // A full rewrite may legitimately restructure; only reject if it lost scripts/sections the user didn't ask to remove.
      const blocking = regression.reasons.filter(x => x === "scripts_lost" || x === "sections_lost" || x === "content_lost")
      if (blocking.length) return { ...r, parsed: null, reason: "full_edit_regressed", validation: { passed: false, reasons: blocking }, plan, mode: "full", fellBackToFull, patchRejection }
    }
    return { ...r, plan, mode: "full", fellBackToFull, patchRejection }
  }
  if (plan.mode === "full") return full(false)

  const promptFor = {
    style_append:       () => buildStyleEditPrompt(plan.extracted, prompt),
    text_replace:       () => buildTextEditPrompt(plan.extracted, prompt),
    section_patch:      () => buildSectionEditPrompt(plan.extracted, prompt, plan.instruction),
    section_add:        () => buildSectionEditPrompt(plan.extracted, prompt, plan.instruction),
    style_script_patch: () => buildSectionEditPrompt(plan.extracted, prompt, plan.instruction),
  }[plan.mode]
  const maxTokens = plan.mode === "text_replace" ? 800 : plan.mode === "style_append" ? 2000 : 6000
  const r = await runTask({ task: "edit", prompt: promptFor(), maxTokens, deadline, ctx, minChars: 2 })
  if (!r.content) return { parsed: null, reason: r.exhausted ? "free_capacity_exhausted" : "no_model_available", exhausted: r.exhausted, retryAfterMs: r.retryAfterMs, plan, mode: plan.mode }

  const rawPatched = patchHTML(fullHTML, plan.mode, plan.sectionName, r.content)
  const patched = rawPatched && replaceExternalImages(rawPatched, prompt + "\n" + fullHTML).html
  const check = comparePatch(fullHTML, patched, plan.needs)
  if (check.valid) {
    return { parsed: { code: patched }, model: r.model, plan, mode: plan.mode, fellBackToFull: false, validation: { passed: true, reasons: [] } }
  }
  console.log(`[SmartEdit] Patch rejected (${check.reasons.join(", ")}), falling back to full edit`)
  return full(true, check.reasons)
}

export async function enhanceIdea(idea, { ctx }) {
  const cached = await getCached("enhance", idea)
  if (cached) return { text: cached, cached: true }
  const r = await runTask({ task: "enhance", prompt: buildEnhancePrompt(idea), maxTokens: 800, ctx })
  if (!r.content) return { text: null, exhausted: r.exhausted, retryAfterMs: r.retryAfterMs }
  let text = r.content.trim()
  try {
    const clean = text.replace(/```json|```/g, "").trim()
    const f = clean.indexOf("{"), l = clean.lastIndexOf("}")
    if (f !== -1 && l !== -1) {
      const p = JSON.parse(clean.slice(f, l + 1))
      text = p?.enhancedPrompt || p?.enhanced_prompt || text
    }
  } catch { /* keep raw text */ }
  text = text.slice(0, 1500)
  await setCached("enhance", idea, text)
  return { text, model: r.model }
}
