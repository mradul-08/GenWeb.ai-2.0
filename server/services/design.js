// No-AI design editor for template-built sites. The stored build source
// (ai/hybrid.js makeBuild) is edited and re-assembled deterministically:
// theme, page layout, section order/variants, adding/removing sections and
// their text. Costs no AI calls and no credits.
import { PRESETS, presetById } from "../library/presets.js"
import { KINDS, KIND_UI } from "../library/sections.js"
import { ICON_NAMES } from "../library/icons.js"
import { assembleSite, hydrateBlueprint, serializeBlueprint, applyTheme, resolveColors } from "../library/assemble.js"
import { validateDocument } from "../ai/validate.js"
import { hashFiles, currentFiles } from "./versions.js"

export const MAX_SECTIONS = 12
const MAX_CONTENT_BYTES = 100_000
const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export class DesignError extends Error {}

// What the editor can offer: themes (with their resolved colours) and, per
// section kind, its design variants and editable fields.
export function libraryInfo() {
  return {
    presets: PRESETS.map(p => {
      const c = resolveColors(p)
      return { id: p.id, dark: p.dark, fonts: p.fonts, colors: { primary: c.primary, secondary: c.secondary, accent: c.accent, bg: c.bg, text: c.text } }
    }),
    icons: ICON_NAMES,
    kinds: Object.fromEntries(Object.keys(KINDS).map(k => [k, { label: KIND_UI[k].label, variants: Object.keys(KINDS[k].variants), fields: KIND_UI[k].fields }])),
  }
}

const usableBuild = (website) => website.build && website.build.v === 1 && website.build.blueprint && website.build.content

// The site's design as the editor sees it, or null when it was not built
// from templates. inSync: the current files are exactly what the build
// produced (no AI or code edits since), so a rebuild loses nothing.
export function designState(website) {
  if (!usableBuild(website)) return null
  const b = website.build
  const content = b.content && typeof b.content === "object" ? b.content : {}
  return {
    inSync: b.filesHash === hashFiles(currentFiles(website)),
    design: {
      preset: b.blueprint.preset,
      multiPage: !!b.multiPage,
      sections: b.blueprint.sections.map(s => ({ id: s.id, kind: s.kind, name: s.name, variant: s.variant })),
      content: { brand: content.brand ?? "", title: content.title ?? "", tagline: content.tagline ?? "", sections: content.sections && typeof content.sections === "object" ? content.sections : {} },
    },
  }
}

const text = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v)

// Validates a design sent by the client. Never trusts it: unknown themes,
// kinds or variants are refused; text is length-limited here and escaped
// when the page is assembled.
export function validateDesign(input, build) {
  if (!isPlainObject(input)) throw new DesignError("Design is required")
  const preset = presetById(input.preset)
  if (!preset) throw new DesignError("Unknown theme")
  if (!Array.isArray(input.sections) || !input.sections.length) throw new DesignError("At least one section is required")
  if (input.sections.length > MAX_SECTIONS) throw new DesignError(`At most ${MAX_SECTIONS} sections`)

  const before = new Map(build.blueprint.sections.map(s => [s.id, s]))
  const ids = new Set()
  const sections = input.sections.map(s => {
    if (!isPlainObject(s)) throw new DesignError("Invalid section")
    const id = String(s.id ?? "")
    if (!SECTION_ID.test(id)) throw new DesignError(`Invalid section id "${id.slice(0, 40)}"`)
    if (ids.has(id)) throw new DesignError(`Duplicate section id "${id}"`)
    ids.add(id)
    if (!KINDS[s.kind]) throw new DesignError(`Unknown section type "${String(s.kind).slice(0, 30)}"`)
    if (!KINDS[s.kind].variants[s.variant]) throw new DesignError(`Unknown design "${String(s.variant).slice(0, 30)}" for ${s.kind}`)
    const name = text(s.name, 40)
    if (!name) throw new DesignError("Every section needs a name")
    return { id, kind: s.kind, variant: s.variant, name, purpose: before.get(id)?.purpose || "" }
  })
  if (sections.filter(s => s.kind === "nav").length > 1 || sections.filter(s => s.kind === "footer").length > 1) {
    throw new DesignError("Only one navigation and one footer")
  }
  // Navigation first, footer last — whatever order was sent.
  const ordered = [...sections.filter(s => s.kind === "nav"), ...sections.filter(s => s.kind !== "nav" && s.kind !== "footer"), ...sections.filter(s => s.kind === "footer")]

  const c = isPlainObject(input.content) ? input.content : {}
  if (Buffer.byteLength(JSON.stringify(c), "utf8") > MAX_CONTENT_BYTES) throw new DesignError("Content is too large")
  const given = isPlainObject(c.sections) ? c.sections : {}
  const content = {
    brand: text(c.brand, 40), title: text(c.title, 80), tagline: text(c.tagline, 160),
    sections: Object.fromEntries(ordered.filter(s => isPlainObject(given[s.id])).map(s => [s.id, given[s.id]])),
  }
  return { preset: preset.id, multiPage: input.multiPage === true, sections: ordered, content }
}

// True when the only difference from the stored design is the theme.
// Both sides are normalized the same way, so whitespace differences in the
// stored content never count as an edit.
export function isThemeOnly(design, build) {
  let now
  try { now = validateDesign(designState({ build, kind: "single_html", latestCode: "" }).design, build) } catch { return false }
  const strip = (d) => JSON.stringify({ m: d.multiPage, s: d.sections.map(x => [x.id, x.kind, x.variant, x.name]), c: d.content })
  return strip(design) === strip(now)
}

// Re-assembles the site from a validated design. Returns { files, build }.
export function rebuild(build, design) {
  const pureTheme = !!build.blueprint.pureTheme || design.preset !== build.blueprint.preset
  const blueprint = hydrateBlueprint({ ...build.blueprint, preset: design.preset, pureTheme, sections: design.sections })
  const site = assembleSite(blueprint, design.content, { plan: build.plan, requestText: build.requestText, multiPage: design.multiPage })
  for (const f of site.files) {
    const v = validateDocument(f.content)
    if (!v.valid) throw new Error(`design rebuild produced an invalid ${f.path}: ${v.reasons}`)
  }
  return {
    files: site.files, dropped: site.dropped,
    build: { ...build, blueprint: serializeBlueprint(blueprint), content: design.content, multiPage: design.multiPage },
  }
}

// Theme change on a site with later AI/code edits: swap only the theme in
// every page, keeping those edits. Pages without the generated token rule
// are left as they are and reported.
export function rethemeFiles(files, presetId) {
  const preset = presetById(presetId)
  const skipped = []
  const out = files.map(f => {
    const html = applyTheme(f.content, preset)
    if (html === null) { skipped.push(f.path); return f }
    return { path: f.path, content: html }
  })
  return { files: out, skipped }
}

export const presetLabel = (id) => id.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")
