// Deterministic HTML/JS checks used before (and instead of) asking an AI to
// repair anything. Scripts are compiled with vm.Script — compiled, never run.
import vm from "vm"

const STRUCTURAL = ["div", "section", "nav", "header", "footer", "main", "article", "aside", "form", "ul", "ol", "table", "button"]
const SECTION_TAGS = /<(section|header|footer|nav|main|article|aside)\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi

function inlineScripts(html) {
  const out = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1].toLowerCase()
    if (/\bsrc\s*=/.test(attrs)) continue
    if (/type\s*=\s*["']?(module|application\/(ld\+)?json|text\/template|importmap)/.test(attrs)) continue
    out.push({ code: m[2], start: m.index, full: m[0] })
  }
  return out
}

function scriptError(code) {
  try { new vm.Script(code); return null } catch (e) { return e.message.split("\n")[0] }
}

export function analyzeHtml(html = "") {
  const lo = html.toLowerCase()
  const idCounts = new Map()
  for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) idCounts.set(m[1], (idCounts.get(m[1]) || 0) + 1)
  const scripts = inlineScripts(html).map(s => ({ ...s, error: scriptError(s.code) }))
  const unbalanced = {}
  for (const tag of STRUCTURAL) {
    const opens  = (lo.match(new RegExp(`<${tag}\\b`, "g")) || []).length
    const closes = (lo.match(new RegExp(`</${tag}\\s*>`, "g")) || []).length
    if (opens !== closes) unbalanced[tag] = opens - closes
  }
  return {
    length:        html.length,
    hasDoctype:    lo.includes("<!doctype"),
    hasHtmlClose:  lo.includes("</html>"),
    hasBodyClose:  lo.includes("</body>"),
    hasStyle:      /<style[\s>]/.test(lo),
    hasViewport:   /<meta[^>]+name\s*=\s*["']viewport/.test(lo),
    hasLang:       /<html[^>]+\blang\s*=/.test(lo),
    duplicateIds:  [...idCounts].filter(([, n]) => n > 1).map(([id]) => id),
    scriptCount:   scripts.length,
    scriptErrors:  scripts.filter(s => s.error).map(s => s.error),
    sectionIds:    [...html.matchAll(SECTION_TAGS)].map(m => m[2]),
    unbalanced,
  }
}

// Checks a complete generated document. `reasons` block acceptance (the page
// is incomplete or its JavaScript cannot run); `warnings` are recorded for
// quality tracking but do not trigger a costly regeneration, because browsers
// tolerate them.
export function validateDocument(html) {
  const a = analyzeHtml(html)
  const reasons = [], warnings = []
  if (a.length < 1500)                     reasons.push("too_short")
  if (!a.hasDoctype)                       reasons.push("missing_doctype")
  if (!a.hasHtmlClose)                     reasons.push("missing_html_close")
  if (!a.hasBodyClose)                     reasons.push("missing_body_close")
  if (!a.hasStyle)                         reasons.push("missing_style")
  if (a.scriptErrors.length)               reasons.push("script_syntax_error")
  if (a.duplicateIds.length)               warnings.push("duplicate_ids")
  if (Object.keys(a.unbalanced).length)    warnings.push("unbalanced_tags")
  if (!a.hasViewport)                      warnings.push("missing_viewport")
  if (!a.hasLang)                          warnings.push("missing_lang")
  return { valid: reasons.length === 0, reasons, warnings, analysis: a }
}

// A patch must not make the page worse than it was.
export function comparePatch(original, patched, needs = {}) {
  if (!patched) return { valid: false, reasons: ["patch_not_applicable"] }
  const before = analyzeHtml(original), after = analyzeHtml(patched)
  const reasons = []
  if (after.scriptErrors.length > before.scriptErrors.length)                       reasons.push("script_syntax_error")
  if (after.duplicateIds.some(id => !before.duplicateIds.includes(id)))            reasons.push("duplicate_ids")
  if (Object.entries(after.unbalanced).some(([t, d]) => Math.abs(d) > Math.abs(before.unbalanced[t] || 0))) reasons.push("unbalanced_tags")
  if (before.hasBodyClose && !after.hasBodyClose)                                    reasons.push("missing_body_close")
  if (before.hasHtmlClose && !after.hasHtmlClose)                                    reasons.push("missing_html_close")
  if (!needs.removal) {
    if (after.scriptCount < before.scriptCount)                                      reasons.push("scripts_lost")
    if (before.sectionIds.some(id => !after.sectionIds.includes(id)))                reasons.push("sections_lost")
    if (patched.length < original.length * 0.5)                                      reasons.push("content_lost")
  }
  return { valid: reasons.length === 0, reasons }
}

// Fixes only what is safe without AI: a missing doctype, and closing tags cut
// off at the very end of an otherwise complete page (truncated output).
export function deterministicRepair(html) {
  let out = html.trimEnd()
  const fixes = []
  if (!/<!doctype/i.test(out) && /<html[\s>]/i.test(out)) { out = "<!DOCTYPE html>\n" + out; fixes.push("added_doctype") }
  const lo = out.toLowerCase()
  if (!lo.includes("</html>") && /<\/(footer|section|main|div)>\s*(<script[\s\S]*<\/script>\s*)?$/i.test(out)) {
    if (!lo.includes("</body>")) { out += "\n</body>"; fixes.push("closed_body") }
    out += "\n</html>"; fixes.push("closed_html")
  }
  return { html: out, fixes }
}

// Returns inline scripts that fail to compile (for targeted AI repair).
export function brokenScripts(html) {
  return inlineScripts(html).map(s => ({ ...s, error: scriptError(s.code) })).filter(s => s.error)
}
