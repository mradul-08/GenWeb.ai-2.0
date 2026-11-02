// Plan mode (roadmap R4, single-file first): a short AI call turns the request
// into a structured plan the user can review and edit; generation follows the
// plan; afterwards a deterministic checklist reports which planned sections
// and features the page actually contains. Pure functions — no I/O.

export const PLAN_LIMITS = Object.freeze({ sections: 10, features: 8 })

// Features the checklist can verify from the HTML; anything else is "other"
// and reported as not checked rather than guessed.
export const FEATURE_KINDS = Object.freeze([
  "contact_form", "newsletter", "mobile_menu", "theme_toggle", "carousel",
  "accordion", "tabs", "modal", "counter", "filter_search", "other",
])

const HEX = /^#[0-9a-f]{6}$/i
const FONT = /^[A-Za-z0-9 ]{2,40}$/
// Ids every plan needs anyway; also the ones whose landmark tag can stand in.
const LANDMARK_IDS = { nav: "nav", header: "header", footer: "footer" }

const text = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const slugId = (v) => text(v, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30)

// Validates and cleans a plan from the model or from the client (the user may
// have edited it). Returns null when nothing usable remains. Never throws.
export function normalizePlan(input) {
  let p = input
  if (typeof p === "string") {
    const clean = p.replace(/```(?:json)?/gi, "")
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}")
    if (s === -1 || e <= s) return null
    try { p = JSON.parse(clean.slice(s, e + 1)) } catch { return null }
  }
  if (!p || typeof p !== "object" || Array.isArray(p)) return null

  const seen = new Set()
  const sections = (Array.isArray(p.sections) ? p.sections : []).map(s => {
    const name = text(s?.name, 40)
    let id = slugId(s?.id || name)
    if (!name || !id) return null
    for (let n = 2; seen.has(id); n++) id = `${slugId(s?.id || name)}-${n}`
    seen.add(id)
    return { id, name, purpose: text(s?.purpose, 160) }
  }).filter(Boolean).slice(0, PLAN_LIMITS.sections)
  if (!sections.length) return null

  const features = (Array.isArray(p.features) ? p.features : []).map(f => {
    const label = text(f?.text ?? f?.name, 120)
    if (!label) return null
    return { kind: FEATURE_KINDS.includes(f?.kind) ? f.kind : "other", text: label }
  }).filter(Boolean).slice(0, PLAN_LIMITS.features)

  const st = p.style && typeof p.style === "object" ? p.style : {}
  const style = {
    mood: text(st.mood, 120),
    colors: (Array.isArray(st.colors) ? st.colors : []).filter(c => typeof c === "string" && HEX.test(c)).map(c => c.toLowerCase()).slice(0, 5),
    headingFont: FONT.test(st.headingFont || "") ? st.headingFont : "",
    bodyFont: FONT.test(st.bodyFont || "") ? st.bodyFont : "",
  }

  return { title: text(p.title, 80), summary: text(p.summary, 300), sections, features, style }
}

// Plan text for the generation prompt. Ids are binding so the checklist can
// find every section afterwards.
export function renderPlan(plan) {
  const lines = [
    `Sections, in this order — each element MUST carry exactly this id attribute: ${plan.sections.map(s => `${s.id} ("${s.name}"${s.purpose ? `: ${s.purpose}` : ""})`).join("; ")}.`,
  ]
  if (plan.features.length) lines.push(`Required working features: ${plan.features.map(f => f.text).join("; ")}.`)
  const st = plan.style
  const style = [st.mood && `mood ${st.mood}`, st.colors.length && `colours ${st.colors.join(", ")}`, st.headingFont && `heading font "${st.headingFont}"`, st.bodyFont && `body font "${st.bodyFont}"`].filter(Boolean)
  if (style.length) lines.push(`Style: ${style.join("; ")}.`)
  return lines.join("\n")
}

// ── Deterministic checklist ───────────────────────────────────────────────────
const scriptsOf = (html) => (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).join("\n")
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function hasId(html, id) {
  return new RegExp(`\\bid\\s*=\\s*["']${escapeRe(id)}["']`, "i").test(html)
}

function hasHeading(html, name) {
  const want = name.toLowerCase()
  for (const m of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    if (m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase().includes(want)) return true
  }
  return false
}

// Each detector looks for the markup AND the behaviour a feature needs.
const FEATURE_CHECKS = {
  contact_form:  (h) => /<form\b[\s\S]*?<\/form>/i.test(h) && /<(input|textarea)\b/i.test(h),
  newsletter:    (h) => /<form\b[\s\S]*?type\s*=\s*["']email["'][\s\S]*?<\/form>/i.test(h),
  mobile_menu:   (h, js) => /<button\b[^>]*(menu|nav|hamburger|toggle|aria-expanded)/i.test(h) && /(classList\.(toggle|add)|aria-expanded|setAttribute)/.test(js),
  theme_toggle:  (h, js) => /(dark|theme|light)/i.test(js) && /(classList|dataset|setAttribute|localStorage)/.test(js),
  carousel:      (h, js) => /(carousel|slider|slide)/i.test(h) && /(setInterval|scrollBy|scrollTo|translateX|currentSlide|slide)/i.test(js),
  accordion:     (h, js) => /<details\b/i.test(h) || (/(accordion|faq)/i.test(h) && /(classList\.toggle|aria-expanded|maxHeight|hidden)/.test(js)),
  tabs:          (h, js) => (/role\s*=\s*["']tab["']/i.test(h) || /\btabs?\b/i.test(h)) && /(classList|aria-selected|hidden)/.test(js),
  modal:         (h, js) => /<dialog\b/i.test(h) || (/modal/i.test(h) && /(classList|showModal|style\.display|hidden)/.test(js)),
  counter:       (h, js) => /count/i.test(js) && /(setInterval|requestAnimationFrame)/.test(js),
  filter_search: (h, js) => (/type\s*=\s*["']search["']/i.test(h) || /filter/i.test(h)) && /(filter|includes|indexOf|toLowerCase)\s*\(/.test(js),
}

// Returns { sections: [{id, name, status}], features: [{kind, text, status}], summary }
// status: "found" | "missing" | "not_checked". Section matches by its planned id,
// falling back to a heading with its name (or the landmark tag for nav/header/footer).
export function checkPlan(html, plan) {
  if (!plan || !html) return null
  const js = scriptsOf(html)
  const sections = plan.sections.map(s => {
    const landmark = LANDMARK_IDS[s.id]
    const found = hasId(html, s.id) || hasHeading(html, s.name) || (landmark && new RegExp(`<${landmark}\\b`, "i").test(html))
    return { id: s.id, name: s.name, status: found ? "found" : "missing" }
  })
  const features = plan.features.map(f => {
    const check = FEATURE_CHECKS[f.kind]
    return { kind: f.kind, text: f.text, status: check ? (check(html, js) ? "found" : "missing") : "not_checked" }
  })
  const all = [...sections, ...features]
  const checked = all.filter(x => x.status !== "not_checked")
  return {
    sections, features,
    summary: { found: checked.filter(x => x.status === "found").length, checked: checked.length, total: all.length },
  }
}
