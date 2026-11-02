// Safe, deterministic repairs for mechanical quality issues.
// This module never executes generated JavaScript or changes existing values.

const ISSUE_NAMES = new Set([
  "missing_doctype",
  "missing_lang",
  "missing_viewport",
  "missing_body_close",
  "missing_html_close",
])

function requestedIssues(quality) {
  const issues = Array.isArray(quality) ? quality : quality?.issues
  return new Set((issues || []).filter(issue => ISSUE_NAMES.has(issue)))
}

function hasOpeningTag(html, tag) {
  return new RegExp(`<${tag}\\b`, "i").test(html)
}

function isClearlyTruncated(html, issues) {
  if (!issues.has("missing_body_close") && !issues.has("missing_html_close")) return false
  if (!hasOpeningTag(html, "html") || !hasOpeningTag(html, "body")) return false
  if (/<\/html\s*>/i.test(html)) return issues.has("missing_body_close") && !/<\/body\s*>/i.test(html)
  if (/<\/body\s*>/i.test(html)) return false
  const trimmed = html.trimEnd()
  return /<\/(?:footer|section|main|article|aside|nav|header|div|p|ul|ol|table|form|button)\s*>$/i.test(trimmed)
}

export function repairQualityIssues(html = "", quality = null) {
  if (typeof html !== "string" || !html) return html
  const issues = requestedIssues(quality)
  if (!issues.size) return html

  let out = html
  if (issues.has("missing_doctype") && !/<!doctype\b/i.test(out) && /<html\b/i.test(out)) {
    out = `<!DOCTYPE html>\n${out}`
  }
  if (issues.has("missing_lang") && /<html\b/i.test(out) && !/<html\b[^>]*\blang\s*=/i.test(out)) {
    out = out.replace(/<html\b([^>]*)>/i, (_match, attributes) => `<html lang="en"${attributes}>`)
  }
  if (issues.has("missing_viewport") && /<head\b/i.test(out) && !/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(out)) {
    const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    out = out.replace(/<head\b[^>]*>/i, match => `${match}\n  ${viewport}`)
  }
  if (isClearlyTruncated(out, issues)) {
    const suffix = []
    if (!/<\/body\s*>/i.test(out)) suffix.push("</body>")
    if (!/<\/html\s*>/i.test(out)) suffix.push("</html>")
    if (suffix.length) out = `${out.trimEnd()}\n${suffix.join("\n")}`
  }
  return out
}

