// HTML patching helpers for single-file projects: locate sections with
// balanced-tag matching and splice AI output back without regex replacement
// pitfalls. Pure functions (no I/O) so they are unit-testable.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Returns the full element whose opening tag matches openTagRegex, counting
// nested tags of the same name so the match ends at the correct closing tag.
function extractBalanced(html, openTagRegex) {
  const open = openTagRegex.exec(html)
  if (!open) return null
  const tag = open[1].toLowerCase()
  const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
  tagRe.lastIndex = open.index + open[0].length
  let depth = 1, t
  while ((t = tagRe.exec(html))) {
    depth += t[1] ? -1 : 1
    if (depth === 0) return html.slice(open.index, t.index + t[0].length)
  }
  return null
}

export function extractSection(html, sectionName) {
  const name = escapeRegex(sectionName)
  const tags = "section|div|nav|footer|header"

  const byId = extractBalanced(html, new RegExp(`<(${tags})\\b[^>]*\\bid=["']${name}["'][^>]*>`, "i"))
  if (byId) return byId

  // Whole class token only — "nav" must not match "nav-link".
  const byClass = extractBalanced(html, new RegExp(`<(${tags})\\b[^>]*\\bclass=["'](?:[^"']*\\s)?${name}(?:\\s[^"']*)?["'][^>]*>`, "i"))
  if (byClass) return byClass

  if (["nav","footer","header"].includes(sectionName)) {
    return extractBalanced(html, new RegExp(`<(${name})\\b[^>]*>`, "i"))
  }

  return null
}

export function extractBodyNoScript(html) {
  let body = html.replace(/<script[\s\S]*?<\/script>/gi, "")
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return bodyMatch ? bodyMatch[1] : body
}

export function buildSkeleton(html) {
  const sections = []
  const sectionPattern = /<(section|div)[^>]*(?:id|class)=["']([^"']*)["'][^>]*>/gi
  let match
  while ((match = sectionPattern.exec(html)) !== null) {
    sections.push(`<!-- ${match[2]} section -->`)
  }
  const style = html.match(/<style[\s\S]*?<\/style>/i)?.[0] || ""
  return style + "\n" + sections.join("\n") + "\n<!-- Add new section after relevant existing section -->"
}

// Inserts text at an index. Used instead of String.replace with a string
// replacement, which would interpret "$&", "$'" etc. inside AI output.
export const insertAt = (str, index, text) => str.slice(0, index) + text + str.slice(index)
export const replaceFirst = (str, search, replacement) => {
  const i = str.indexOf(search)
  return i === -1 ? str : str.slice(0, i) + replacement + str.slice(i + search.length)
}

// Applies [{find, replace}] pairs returned for a text edit. Every "find" must
// occur exactly once in the page (outside <script>/<style>) or the whole edit is
// rejected, so an ambiguous or hallucinated match can never change the wrong text.
export function applyTextReplacements(fullHTML, raw) {
  const s = String(raw).replace(/```(?:json)?/gi, "")
  const start = s.indexOf("["), end = s.lastIndexOf("]")
  if (start === -1 || end <= start) return null
  let pairs
  try { pairs = JSON.parse(s.slice(start, end + 1)) } catch { return null }
  if (!Array.isArray(pairs) || !pairs.length || pairs.length > 20) return null

  // Same-length masking keeps positions aligned with the real page.
  const mask = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, m => "\u0000".repeat(m.length))
  let out = fullHTML
  for (const p of pairs) {
    if (!p || typeof p.find !== "string" || typeof p.replace !== "string" || !p.find.trim()) return null
    if (/<\s*\/?\s*(script|style|iframe)\b/i.test(p.replace)) return null
    const masked = mask(out)
    const first = masked.indexOf(p.find)
    if (first === -1 || masked.indexOf(p.find, first + 1) !== -1) return null
    out = out.slice(0, first) + p.replace + out.slice(first + p.find.length)
  }
  return out
}

export function patchHTML(fullHTML, mode, sectionName, aiResponse) {
  const cleaned = cleanAIResponse(aiResponse)

  switch (mode) {
    case "text_replace":
      return applyTextReplacements(fullHTML, aiResponse)

    case "style_append": {
      const css = cleaned.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1]?.trim() ?? (/[{};]/.test(cleaned) && !/</.test(cleaned) ? cleaned : null)
      if (!css) return null
      const oldBlock = fullHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      // The model returned a whole stylesheet instead of overrides: replace.
      if (oldBlock && css.length > oldBlock[1].length * 0.7) {
        return replaceFirst(fullHTML, oldBlock[0], `<style>\n${css}\n</style>`)
      }
      const block = `<style data-gw-edit>\n${css}\n</style>\n`
      const headEnd = fullHTML.search(/<\/head>/i)
      return headEnd === -1 ? null : insertAt(fullHTML, headEnd, block)
    }

    case "style_only": {
      const newStyle = cleaned.match(/<style[\s\S]*?<\/style>/i)?.[0]
      if (!newStyle) return null
      const oldStyle = fullHTML.match(/<style[\s\S]*?<\/style>/i)?.[0]
      if (oldStyle) return replaceFirst(fullHTML, oldStyle, newStyle)
      const headEnd = fullHTML.search(/<\/head>/i)
      return headEnd === -1 ? null : insertAt(fullHTML, headEnd, newStyle + "\n")
    }

    case "style_script_patch": {
      let result = fullHTML
      const newStyle = cleaned.match(/<style[\s\S]*?<\/style>/i)?.[0]
      const newScript = cleaned.match(/<script[\s\S]*?<\/script>/i)?.[0]
      if (newStyle) {
        const oldStyle = fullHTML.match(/<style[\s\S]*?<\/style>/i)?.[0]
        if (oldStyle) result = replaceFirst(result, oldStyle, newStyle)
      }
      if (newScript) {
        const scripts = [...result.matchAll(/<script[\s\S]*?<\/script>/gi)]
        if (scripts.length > 0) {
          const last = scripts[scripts.length - 1]
          result = result.slice(0, last.index) + newScript + result.slice(last.index + last[0].length)
        }
      }
      return result
    }

    case "section_patch": {
      if (!sectionName) return null
      const oldSection = extractSection(fullHTML, sectionName)
      if (!oldSection) return null
      const newSection = extractSection(cleaned, sectionName) || cleaned
      return replaceFirst(fullHTML, oldSection, newSection)
    }

    case "section_add": {
      // Keep the footer last and scripts after content: insert before <footer>
      // when there is one, otherwise before </body>.
      const footerAt = fullHTML.search(/<footer\b/i)
      const bodyEnd  = fullHTML.search(/<\/body>/i)
      const at = footerAt !== -1 ? footerAt : bodyEnd
      if (at === -1) return null
      return insertAt(fullHTML, at, cleaned + "\n")
    }

    case "body_only": {
      const bodyMatch = fullHTML.match(/(<body[^>]*>)([\s\S]*)(<\/body>)/i)
      if (!bodyMatch) return null
      let newBody = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned
      // The AI saw the body without scripts; re-attach the originals so menus,
      // observers and other behaviour survive the edit.
      if (!/<script/i.test(newBody)) {
        const scripts = bodyMatch[2].match(/<script[\s\S]*?<\/script>/gi) || []
        if (scripts.length) newBody += "\n" + scripts.join("\n")
      }
      const start = bodyMatch.index + bodyMatch[1].length
      return fullHTML.slice(0, start) + "\n" + newBody + "\n" + fullHTML.slice(start + bodyMatch[2].length)
    }

    default:
      return null
  }
}

export function cleanAIResponse(raw) {
  return raw.replace(/```html\s*/gi, "").replace(/```\s*/gi, "").trim()
}
