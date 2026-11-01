// Deterministic post-processing of generated pages (no AI, no network).
//
// Models invent image URLs that do not exist; they render as broken images or
// empty grey boxes. Any <img> whose source cannot load (external URL the user
// did not provide, empty src, or a relative path — single-file pages have no
// asset files) gets an inline SVG placeholder (works on light and dark pages), and
// external CSS background images are removed so the element's colour shows.
// URLs that appear in the user's request are kept untouched.

const PLACEHOLDER = (label) => {
  const text = String(label || "").replace(/[<>&"']/g, "").slice(0, 40)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500' viewBox='0 0 800 500'><rect width='800' height='500' fill='#888' fill-opacity='0.18'/><path d='M300 330l70-90 60 70 45-50 75 70z' fill='#888' fill-opacity='0.35'/><circle cx='480' cy='200' r='28' fill='#888' fill-opacity='0.35'/>${text ? `<text x='400' y='420' font-family='sans-serif' font-size='26' text-anchor='middle' fill='#888'>${text}</text>` : ""}</svg>`
  return "data:image/svg+xml," + encodeURIComponent(svg)
}

const isExternal = (url) => /^(https?:)?\/\//i.test(url.trim())
// A single-file page has no asset files, so an empty or relative image path can
// never load; only inline data: images (or URLs the user gave) can work.
const cannotLoad = (url) => !url.trim() || (!/^data:/i.test(url.trim()) && !isExternal(url))

export function replaceExternalImages(html, userRequest = "") {
  const allowed = new Set((String(userRequest).match(/https?:\/\/[^\s"'<>)]+/gi) || []).map(u => u.replace(/[.,;]+$/, "")))
  const keep = (url) => allowed.has(url.trim())
  let replaced = 0

  // <img src="…"> (and its srcset)
  let out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\ssrc\s*=\s*["']([^"']*)["']/i)?.[1]
    if (src === undefined || keep(src)) return tag
    if (!isExternal(src) && !cannotLoad(src)) return tag          // data: images are fine
    replaced++
    const alt = tag.match(/\salt\s*=\s*["']([^"']*)["']/i)?.[1]
    return tag
      .replace(/\s(srcset|data-src)\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\ssrc\s*=\s*["'][^"']*["']/i, ` src="${PLACEHOLDER(alt)}"`)
  })

  // CSS url(http…) in <style> blocks and style="" attributes (fonts are not url() images here).
  out = out.replace(/url\(\s*(["']?)((?:https?:)?\/\/[^"')]+)\1\s*\)/gi, (m, q, url, offset, str) => {
    // Keep stylesheet imports and web fonts (e.g. @import url(fonts.googleapis.com…)).
    if (/@import\s*$/i.test(str.slice(Math.max(0, offset - 12), offset))) return m
    if (keep(url) || /\.(woff2?|ttf|otf|css)(\?|$)/i.test(url) || /fonts\.(googleapis|gstatic)\.com/i.test(url)) return m
    replaced++
    return "none"
  })

  return { html: out, replaced }
}
