// No-AI design editor endpoints (services/design.js). No credits, no AI quota.
import mongoose from "mongoose"
import Website from "../models/website.model.js"
import { checkPlan } from "../ai/plan.js"
import { commitFiles, commitTransform, currentFiles, MAIN_FILE } from "../services/versions.js"
import { libraryInfo, designState, validateDesign, isThemeOnly, rebuild, rethemeFiles, presetLabel, DesignError } from "../services/design.js"
import { extractThumbnailMeta } from "./website.controller.js"

const notFound = (res) => res.status(404).json({ success: false, message: "Not found" })
const serverError = (res, label, e) => {
  console.error(`[${label}]`, e)
  return res.status(500).json({ success: false, message: "Something went wrong. Please try again." })
}
async function findOwnWebsite(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Website.findOne({ _id: req.params.id, user: req.user._id })
}
const NOT_TEMPLATE = "Design controls are available for sites built with the Templates engine."

// GET /api/website/library → themes and section kinds (variants, fields).
export const getLibrary = (req, res) => res.json({ success: true, ...libraryInfo() })

// GET /api/website/:id/design
export const getDesign = async (req, res) => {
  try {
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)
    const state = designState(website)
    if (!state) return res.json({ success: true, available: false, message: NOT_TEMPLATE })
    return res.json({ success: true, available: true, ...state })
  } catch (e) { return serverError(res, "getDesign", e) }
}

// A short history label describing what changed.
function describe(design, build) {
  const before = build.blueprint
  const parts = []
  if (design.preset !== before.preset) parts.push(`theme ${presetLabel(design.preset)}`)
  if (design.multiPage !== !!build.multiPage) parts.push(design.multiPage ? "multi-page" : "single page")
  const ids = (list) => list.map(s => s.id).join(",")
  const added = design.sections.filter(s => !before.sections.some(b => b.id === s.id)).length
  const removed = before.sections.filter(b => !design.sections.some(s => s.id === b.id)).length
  if (added) parts.push(`${added} section${added > 1 ? "s" : ""} added`)
  if (removed) parts.push(`${removed} section${removed > 1 ? "s" : ""} removed`)
  if (!added && !removed && ids(design.sections) !== ids(before.sections)) parts.push("sections reordered")
  if (design.sections.some(s => { const b = before.sections.find(x => x.id === s.id); return b && (b.variant !== s.variant || b.name !== s.name) })) parts.push("section designs")
  if (JSON.stringify(design.content) !== JSON.stringify({ brand: build.content?.brand ?? "", title: build.content?.title ?? "", tagline: build.content?.tagline ?? "", sections: build.content?.sections ?? {} })) parts.push("content")
  return `Design: ${parts.join(", ") || "no changes"}`
}

// PUT /api/website/:id/design  body: { design, force? }
// Rebuilds the site from its template build with the edited design. When
// the site has AI/code edits made after it was built, a rebuild would replace
// them: it is refused unless force=true (the edits stay in History). A
// theme-only change never needs force: the theme is swapped in place.
export const applyDesign = async (req, res) => {
  try {
    const website = await findOwnWebsite(req)
    if (!website) return notFound(res)
    const state = designState(website)
    if (!state) return res.status(409).json({ success: false, code: "NOT_TEMPLATE", message: NOT_TEMPLATE })

    let design
    try { design = validateDesign(req.body?.design, website.build) } catch (e) {
      if (e instanceof DesignError) return res.status(400).json({ success: false, message: e.message })
      throw e
    }
    const label = describe(design, website.build)
    const userId = req.user._id
    let files, kind, skipped = []

    if (!state.inSync && isThemeOnly(design, website.build)) {
      // Keep later edits: swap only the theme, page by page, on the current files.
      const build = { ...website.build, blueprint: { ...website.build.blueprint, preset: design.preset, pureTheme: true } }
      delete build.filesHash
      await commitTransform(website._id, (current) => {
        const r = rethemeFiles(current, design.preset)
        skipped = r.skipped
        files = r.files
        return r.files
      }, { source: "design", label, userId, build, buildInSync: false })
      kind = website.kind
    } else {
      if (!state.inSync && req.body?.force !== true) {
        return res.status(409).json({
          success: false, code: "DIVERGED",
          message: "This site has AI or code edits made after it was built. Applying these design changes rebuilds it from its template and replaces those edits — they stay in History and can be restored.",
        })
      }
      const r = rebuild(website.build, design)
      files = r.files
      kind = design.multiPage ? "static" : "single_html"
      const build = { ...r.build }
      delete build.filesHash
      const index = files.find(f => f.path === MAIN_FILE) ?? files[0]
      await commitFiles(website._id, files, { source: "design", label, userId, build, kind, set: extractThumbnailMeta(index.content, website.title) })
    }

    const fresh = await Website.findById(website._id)
    return res.json({
      success: true, message: label,
      code: currentFiles(fresh)[0].content, kind: fresh.kind,
      files: fresh.kind === "static" ? currentFiles(fresh) : undefined,
      skipped, ...designState(fresh),
      checklist: checkPlan(currentFiles(fresh).map(f => f.content).join("\n"), fresh.plan),
    })
  } catch (e) { return serverError(res, "applyDesign", e) }
}
