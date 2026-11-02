// Deterministic quality scoring for template-generated websites.
// This never executes generated JavaScript and never calls an AI model.
import { analyzeHtml, validateDocument } from "./validate.js"
import { checkPlan } from "./plan.js"

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
const textOnly = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

function contentScore(html) {
  const text = textOnly(html)
  let score = 45
  if (text.length >= 250) score += 20
  if (text.length >= 700) score += 15
  if (/<h1\b/i.test(html)) score += 10
  if (/<p\b/i.test(html) && /<button\b|<a\b/i.test(html)) score += 10
  if (/\b(lorem ipsum|your title|add your|\[name\]|\{name\})\b/i.test(text)) score -= 35
  return clamp(score)
}

function structureScore(html, analysis) {
  const validation = validateDocument(html)
  let score = validation.valid ? 65 : 30
  if (analysis.hasDoctype) score += 7
  if (analysis.hasHtmlClose && analysis.hasBodyClose) score += 8
  if (analysis.sectionIds.length >= 3) score += 10
  if (/<nav\b/i.test(html) && /<main\b/i.test(html) && /<footer\b/i.test(html)) score += 10
  if (analysis.duplicateIds.length) score -= 15
  if (analysis.scriptErrors.length) score -= 25
  return clamp(score)
}

function mobileScore(html, analysis) {
  let score = 35
  if (analysis.hasViewport) score += 30
  if (/@media\s*\(/i.test(html)) score += 20
  if (/max-width\s*:\s*(100%|[0-9]+px)|width\s*:\s*100%/i.test(html)) score += 10
  if (/min-width\s*:\s*(9[0-9]{2}|[1-9][0-9]{3,})px/i.test(html)) score -= 20
  if (/overflow-x\s*:\s*hidden/i.test(html)) score += 5
  return clamp(score)
}

function accessibilityScore(html, analysis) {
  let score = 45
  if (analysis.hasLang) score += 15
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)]
  if (!images.length || images.every(m => /\balt\s*=/.test(m[1]))) score += 15
  const inputs = [...html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)]
  if (!inputs.length || inputs.every(m => /\baria-label\s*=|\bid\s*=/.test(m[2]))) score += 10
  if (/<button\b[^>]*>\s*(?:<[^>]+>\s*)*[^<\s]/i.test(html) || /aria-label\s*=/i.test(html)) score += 10
  if (/:focus(?:-visible)?\b|outline\s*:/i.test(html)) score += 5
  if (/color\s*:\s*#(?:fff|ffffff)\b[^}]*background\s*:\s*#(?:fff|ffffff)\b/i.test(html)) score -= 20
  return clamp(score)
}

function interactionScore(html, plan) {
  if (!plan?.features?.length) return 85
  const checklist = checkPlan(html, plan)
  if (!checklist || !checklist.summary.checked) return 45
  return clamp((checklist.summary.found / checklist.summary.checked) * 100)
}

export function scoreQuality(files, plan = null) {
  const pages = (Array.isArray(files) ? files : []).filter(f => f?.content).map(f => ({ path: f.path || "index.html", html: f.content }))
  if (!pages.length) return null

  const pageResults = pages.map(({ path, html }) => {
    const analysis = analyzeHtml(html)
    const validation = validateDocument(html)
    const categories = {
      content: contentScore(html),
      structure: structureScore(html, analysis),
      mobile: mobileScore(html, analysis),
      accessibility: accessibilityScore(html, analysis),
      interactions: interactionScore(html, plan),
    }
    const issues = []
    if (!validation.valid) issues.push(...validation.reasons)
    if (analysis.duplicateIds.length) issues.push("duplicate_ids")
    if (!analysis.hasViewport) issues.push("missing_viewport")
    if (!analysis.hasLang) issues.push("missing_lang")
    if (plan) {
      const checklist = checkPlan(html, plan)
      if (checklist?.features.some(f => f.status === "missing")) issues.push("planned_feature_missing")
      if (checklist?.sections.some(s => s.status === "missing")) issues.push("planned_section_missing")
    }
    return { path, overall: clamp(Object.values(categories).reduce((sum, n) => sum + n, 0) / Object.keys(categories).length), categories, issues: [...new Set(issues)] }
  })

  const categoryNames = ["content", "structure", "mobile", "accessibility", "interactions"]
  const categories = Object.fromEntries(categoryNames.map(name => [name, clamp(pageResults.reduce((sum, p) => sum + p.categories[name], 0) / pageResults.length)]))
  const overall = clamp(Object.values(categories).reduce((sum, n) => sum + n, 0) / categoryNames.length)
  const issues = [...new Set(pageResults.flatMap(p => p.issues))]
  return {
    overall,
    grade: overall >= 90 ? "excellent" : overall >= 75 ? "good" : overall >= 60 ? "needs_review" : "weak",
    passed: overall >= 75 && !issues.some(x => ["script_syntax_error", "missing_html_close", "missing_body_close"].includes(x)),
    categories,
    issues,
    pages: pageResults,
  }
}
