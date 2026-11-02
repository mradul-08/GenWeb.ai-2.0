// Hybrid engine, deterministic half (no AI, no I/O):
//   buildBlueprint — template, preset, section list (kind + variant) and
//                    feature flags for a request or a reviewed plan;
//   assembleSite   — renders the content into one complete HTML document.
import { KINDS, LIST_KEY, ALWAYS_RENDER, esc } from "./sections.js"
import { buildScript } from "./interactions.js"
import { TEMPLATES, mapKind, rankTemplates, choosePreset, variantsOf } from "./templates.js"
import { contrastRatio } from "../ai/prompts.js"
import { PRESETS, presetById } from "./presets.js"

const DEFAULT_LABELS = {
  nav: "Navigation", hero: "Home", features: "Services", about: "About", menu: "Menu", pricing: "Pricing",
  testimonials: "Reviews", gallery: "Gallery", team: "Team", stats: "Highlights", faq: "FAQ",
  events: "Schedule", contact: "Contact", cta: "Join us", footer: "Footer", content: "More",
}
const TEMPLATE_LABELS = {
  shop: { menu: "Products", features: "Why us" },
  portfolio: { gallery: "Work", events: "Experience" },
  event: { events: "Schedule", team: "Speakers", pricing: "Tickets", about: "About the event" },
  service: { team: "Our team" },
  restaurant: { contact: "Book a table" },
}
const MAX_SECTIONS = 12

// Feature requests found in free text (direct mode, no plan).
const TEXT_FEATURES = {
  theme_toggle:  /dark[ -]?mode|theme (toggle|switch)|light\/dark|dark\/light/,
  carousel:      /carousel|slider|slideshow|rotating (reviews|testimonials)/,
  counter:       /count[- ]?up|counter|animated (numbers|stats)/,
  newsletter:    /newsletter|subscribe|mailing list/,
  filter_search: /\bsearch\b|\bfilter\b/,
  accordion:     /\bfaq|accordion/,
  contact_form:  /contact form|enquiry form|inquiry form|booking form|order form|\bform\b/,
}
const BOOKING = /\bbook(ing)?\b|reserv|appointment|table for|rsvp/

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length) % arr.length]

// Sections listed by the Generate page ("Include sections: hero, faq, …").
function requestedKinds(text) {
  const m = String(text).match(/include sections:\s*([^.\n]+)/i)
  if (!m) return []
  return m[1].split(",").map(s => s.trim()).filter(Boolean).map(name => mapKind({ id: name, name }))
}

// rand: injectable for tests (default Math.random → variety between runs).
export function buildBlueprint({ text = "", plan = null, rand = Math.random }) {
  const fullText = [text, plan?.title, plan?.summary, plan?.style?.mood, ...(plan?.sections || []).map(s => `${s.name} ${s.purpose}`)].filter(Boolean).join(" ")
  const planKinds = plan ? plan.sections.map(s => mapKind(s)) : []
  const ranked = rankTemplates(fullText, planKinds)
  const template = ranked[0].score > 0 ? ranked[0].template : TEMPLATES.find(t => t.id === "business")
  const labels = { ...DEFAULT_LABELS, ...(TEMPLATE_LABELS[template.id] || {}) }
  const preferred = Object.fromEntries(template.sections.filter(([, v]) => v).map(([k, v]) => [k, v]))

  // 1. Section list: the plan's sections (in its order), or the template's.
  let sections = plan
    ? plan.sections.map((s, i) => ({ id: s.id, name: s.name, purpose: s.purpose || "", kind: planKinds[i] }))
    : template.sections.map(([kind]) => ({ id: kind, name: labels[kind], purpose: "", kind }))
  const ids = new Set(sections.map(s => s.id))
  const uniqueId = (base) => { let id = base; for (let n = 2; ids.has(id); n++) id = `${base}-${n}`; ids.add(id); return id }
  const has = (kind) => sections.some(s => s.kind === kind)
  // Inserts before the contact/footer block so pages keep a natural order.
  const add = (kind) => {
    if (has(kind) || sections.length >= MAX_SECTIONS) return
    const s = { id: uniqueId(kind), name: labels[kind], purpose: "", kind }
    const tail = sections.findIndex(x => x.kind === "contact" || x.kind === "footer" || x.kind === "cta")
    if (tail === -1) sections.push(s); else sections.splice(tail, 0, s)
  }
  if (!plan) for (const kind of requestedKinds(text)) if (kind !== "content") add(kind)

  // 2. Features: from the plan, or from the request text.
  const lower = fullText.toLowerCase()
  const features = new Set(plan
    ? plan.features.map(f => f.kind)
    : Object.entries(TEXT_FEATURES).filter(([, re]) => re.test(lower)).map(([k]) => k))
  if (features.has("carousel")) add("testimonials")
  if (features.has("counter")) add("stats")
  if (features.has("accordion")) add("faq")
  if (features.has("contact_form")) add("contact")
  if (features.has("newsletter")) add("cta")

  // 3. Navigation first and footer last, always.
  if (!has("nav")) sections.unshift({ id: uniqueId("nav"), name: labels.nav, purpose: "", kind: "nav" })
  if (!has("footer")) sections.push({ id: uniqueId("footer"), name: labels.footer, purpose: "", kind: "footer" })
  sections = [...sections.filter(s => s.kind === "nav").slice(0, 1), ...sections.filter(s => s.kind !== "nav" && s.kind !== "footer"), ...sections.filter(s => s.kind === "footer").slice(0, 1)]

  // 4. Variants: required by a feature, else the template's choice, else random.
  for (const s of sections) {
    if (s.kind === "testimonials" && features.has("carousel")) s.variant = "carousel"
    else if (s.kind === "cta" && features.has("newsletter")) s.variant = "newsletter"
    else s.variant = preferred[s.kind] && variantsOf(s.kind).includes(preferred[s.kind]) ? preferred[s.kind] : pick(variantsOf(s.kind), rand)
  }

  return {
    template: template.id, templateScore: ranked[0].score,
    preset: choosePreset(fullText, template, rand),
    sections,
    features: [...features],
    booking: !!template.booking || BOOKING.test(lower),
    filter: features.has("filter_search") || !!template.filter,
  }
}

// ── Colours ───────────────────────────────────────────────────────────────────
const HEX6 = /^#[0-9a-f]{6}$/i
function mix(a, b, t) {
  const p = (h, i) => parseInt(h.slice(i, i + 2), 16)
  return "#" + [1, 3, 5].map(i => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, "0")).join("")
}
const readableOn = (bg) => (contrastRatio("#ffffff", bg) >= contrastRatio("#111111", bg) ? "#ffffff" : "#111111")

// Preset colours, tinted by colours the user asked for — only where the
// result stays readable (WCAG AA for text roles).
export function resolveColors(preset, { planColors = [], requestText = "" } = {}) {
  const c = { ...preset.colors }
  const palette = String(requestText).match(/primary:\s*(#[0-9a-f]{6}).*?accent:\s*(#[0-9a-f]{6}).*?background:\s*(#[0-9a-f]{6})/i)
  const wanted = palette ? { primary: palette[1], accent: palette[2], bg: palette[3] } : { primary: planColors[0], secondary: planColors[1], accent: planColors[2] }

  if (wanted.bg && HEX6.test(wanted.bg)) {
    c.bg = wanted.bg.toLowerCase()
    if (contrastRatio(c.text, c.bg) < 7) c.text = readableOn(c.bg)
    c.surface = mix(c.bg, c.text, 0.07)
    c.muted = mix(c.text, c.bg, 0.3)
  }
  if (wanted.primary && HEX6.test(wanted.primary) && contrastRatio(wanted.primary.toLowerCase(), c.bg) >= 4.5) c.primary = wanted.primary.toLowerCase()
  if (wanted.secondary && HEX6.test(wanted.secondary)) c.secondary = wanted.secondary.toLowerCase()
  if (wanted.accent && HEX6.test(wanted.accent)) c.accent = wanted.accent.toLowerCase()
  if (contrastRatio(c.muted, c.bg) < 4.5) c.muted = mix(c.text, c.bg, 0.2)
  const dark = contrastRatio("#ffffff", c.bg) > contrastRatio("#111111", c.bg)
  // Footer: a deeper shade of the page on dark sites, a dark band on light ones.
  const footerBg = dark ? mix(c.bg, "#000000", 0.45) : mix(c.text, c.primary, 0.12)
  return { ...c, onPrimary: readableOn(c.primary), dark, footerBg, footerText: readableOn(footerBg) === "#ffffff" ? (dark ? c.text : c.bg) : c.text }
}

// ── Document ──────────────────────────────────────────────────────────────────
const FONT_OK = /^[A-Za-z0-9 ]{2,40}$/

const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}body{margin:0;font-family:var(--font-body),system-ui,sans-serif;font-size:17px;line-height:1.65;background:var(--bg);color:var(--text);overflow-x:hidden}
h1,h2,h3{font-family:var(--font-heading),Georgia,serif;line-height:1.15;color:var(--text);margin:0 0 .5em}h1{font-size:clamp(2.3rem,5.5vw,4rem);letter-spacing:-.02em}h3{font-size:1.2rem}p{margin:0 0 1em}a{color:var(--primary)}
.gw-wrap{width:100%;max-width:1140px;margin:0 auto;padding:0 24px}.gw-section{padding:88px 0}.gw-alt{background:var(--surface)}.gw-h2{font-size:clamp(1.8rem,3.6vw,2.6rem);margin-bottom:12px}.gw-lead{font-size:1.1rem;color:var(--muted);max-width:640px;margin-bottom:40px}
.gw-eyebrow{display:inline-block;font-size:.8rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--primary);margin-bottom:14px}.gw-hero-sub{font-size:1.18rem;color:var(--muted);max-width:620px;margin-bottom:30px}.gw-hero-actions{display:flex;flex-wrap:wrap;gap:12px}
.gw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 26px;border-radius:calc(var(--radius)*.8);border:2px solid var(--primary);background:var(--primary);color:var(--on-primary);font:inherit;font-weight:700;text-decoration:none;cursor:pointer;transition:transform .15s,box-shadow .15s}.gw-btn:hover{transform:translateY(-2px);box-shadow:var(--shadow)}.gw-btn-ghost{background:transparent;color:var(--primary)}.gw-btn-sm{padding:8px 16px;font-size:.92rem}
.gw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}.gw-card{background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 9%,transparent);border-radius:var(--radius);padding:28px;box-shadow:var(--shadow)}.gw-alt .gw-card{background:var(--bg)}.gw-card p{color:var(--muted);margin:0}
.gw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.js .gw-reveal{transform:translateY(14px);transition:transform .6s ease}.js .gw-reveal.is-visible{transform:none}
@media(max-width:768px){.gw-section{padding:64px 0}body{font-size:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`

function themeCss(colors) {
  // The toggle switches to the opposite scheme with readable defaults.
  const other = colors.dark
    ? { bg: "#fbfaf8", surface: "#efece6", text: "#1c1a17", muted: "#5d5850" }
    : { bg: "#111318", surface: "#1b1e26", text: "#eef0f4", muted: "#a7adba" }
  const scheme = colors.dark ? "light" : "dark"
  return `html[data-theme="${scheme}"]{--bg:${other.bg};--surface:${other.surface};--text:${other.text};--muted:${other.muted}}`
}

// Everything a theme contributes to a page. pure: the user picked this preset
// explicitly — use it as designed, without the request's colours or fonts.
export function themeParts(preset, { plan = null, requestText = "", pure = false } = {}) {
  const colors = pure ? resolveColors(preset) : resolveColors(preset, { planColors: plan?.style?.colors || [], requestText })
  const headingFont = !pure && FONT_OK.test(plan?.style?.headingFont || "") ? plan.style.headingFont : preset.fonts.heading
  const bodyFont = !pure && FONT_OK.test(plan?.style?.bodyFont || "") ? plan.style.bodyFont : preset.fonts.body
  const fontsUrl = `https://fonts.googleapis.com/css2?${[...new Set([headingFont, bodyFont])].map(f => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700;800`).join("&")}&display=swap`
  const tokens = `:root{--primary:${colors.primary};--secondary:${colors.secondary};--accent:${colors.accent};--bg:${colors.bg};--surface:${colors.surface};--text:${colors.text};--muted:${colors.muted};--on-primary:${colors.onPrimary};--footer-bg:${colors.footerBg};--footer-text:${colors.footerText};--radius:${preset.radius};--shadow:${preset.shadow};--font-heading:"${headingFont}";--font-body:"${bodyFont}";color-scheme:${colors.dark ? "dark" : "light"}}`
  return { colors, tokens, fontsUrl, headingFont, bodyFont, toggleCss: themeCss(colors) }
}

// Swaps the theme of an already-built page in place: design tokens, font
// stylesheet, colour scheme and the dark-mode toggle rule. Everything else
// (including later AI or code edits) is untouched. Returns null when the
// page no longer has the generated token rule (e.g. rewritten by hand).
const TOKENS_RE = /:root\{--primary:[^}]*\}/
export function applyTheme(html, preset) {
  if (!TOKENS_RE.test(html)) return null
  const p = themeParts(preset, { pure: true })
  return html
    .replace(TOKENS_RE, () => p.tokens)
    .replace(/(<link href=")https:\/\/fonts\.googleapis\.com\/css2\?[^"]*(" rel="stylesheet">)/, (m, a, b) => a + esc(p.fontsUrl) + b)
    .replace(/(<html\b[^>]*\bdata-theme=")(dark|light)(")/, (m, a, s, b) => a + (p.colors.dark ? "dark" : "light") + b)
    .replace(/html\[data-theme="(dark|light)"\]\{[^}]*\}/, () => p.toggleCss)
}

// ── Build source (stored with the site so design changes need no AI) ─────────
// A blueprint with its preset as an id, safe to store in MongoDB.
export const serializeBlueprint = (b) => ({
  template: b.template, preset: b.preset.id, pureTheme: !!b.pureTheme,
  sections: b.sections.map(s => ({ id: s.id, name: s.name, purpose: s.purpose || "", kind: s.kind, variant: s.variant })),
  features: [...b.features], booking: !!b.booking, filter: !!b.filter,
})
export const hydrateBlueprint = (s) => ({ ...s, templateScore: 1, preset: presetById(s.preset) || PRESETS[0], sections: s.sections.map(x => ({ ...x })) })

// content: { title, brand, tagline, sections: { [id]: rawContent } } from the
// model (untrusted). Missing or invalid parts fall back to plan-based text.
// multiPage: split into index.html + one self-contained page per major
// section (each page carries its own <style>, so per-page edits keep working).
export function assembleSite(blueprint, content = {}, { plan = null, requestText = "", multiPage = false } = {}) {
  const raw = content && typeof content === "object" ? content : {}
  const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
  const brand = clean(raw.brand, 40) || clean(plan?.title, 40) || clean(raw.title, 40) || "Our Business"
  const site = { brand, title: clean(raw.title, 80) || clean(plan?.title, 80) || brand, tagline: clean(raw.tagline, 160) || clean(plan?.summary, 160) }

  // Pass 1: normalize content and drop sections the model gave nothing real
  // for (never fill them with invented reviews, prices or people).
  const baseCtx = (s) => ({
    id: s.id, name: s.name, purpose: s.purpose, site,
    booking: blueprint.booking && s.kind === "contact", filter: blueprint.filter && s.kind === "menu",
    themeToggle: blueprint.features.includes("theme_toggle"), newsletter: blueprint.features.includes("newsletter"),
  })
  const kept = []
  for (const s of blueprint.sections) {
    const kind = KINDS[s.kind] || KINDS.content
    const given = raw.sections?.[s.id]
    if (!ALWAYS_RENDER.has(s.kind) && (!given || typeof given !== "object" || Array.isArray(given))) continue
    const data = kind.normalize(given, { ...baseCtx(s), navLinks: [] })
    if (LIST_KEY[s.kind] && !data[LIST_KEY[s.kind]].length) continue
    kept.push({ s, kind, data })
  }

  // Pages: one index.html, or (multiPage) a home page plus one page per major section.
  const pages = splitPages(kept, multiPage, site)
  const pageOf = new Map(pages.flatMap(p => p.items.map(k => [k.s.id, p])))
  const contactId = kept.find(k => k.s.kind === "contact")?.s.id || null
  const firstContentId = kept.find(k => !["nav", "hero"].includes(k.s.kind))?.s.id || null

  const theme = themeParts(blueprint.preset, { plan, requestText, pure: !!blueprint.pureTheme })
  const { colors, tokens, fontsUrl, headingFont, bodyFont } = theme
  const description = site.tagline || `${site.brand} — official website`

  const renderPage = (page) => {
    const isHome = page.path === MAIN_PAGE
    // Same page → "#id"; a section's own page → "menu.html"; elsewhere → "index.html#id".
    const link = (id) => {
      if (!id || id === "top") return isHome ? "#top" : MAIN_PAGE
      const target = pageOf.get(id)
      if (!target) return isHome ? "#top" : MAIN_PAGE
      if (target === page) return `#${id}`
      return target.main === id ? target.path : `${target.path}#${id}`
    }
    const navLinks = multiPage
      ? [
          { id: "top", label: "Home", href: link("top"), current: isHome },
          ...kept.filter(k => !["nav", "hero", "footer"].includes(k.s.kind)).map(k => ({ id: k.s.id, label: k.s.name, href: link(k.s.id), current: page.main === k.s.id })),
        ].slice(0, 7)
      : kept.filter(k => !["nav", "hero", "footer"].includes(k.s.kind)).slice(0, 6).map(k => ({ id: k.s.id, label: k.s.name, href: link(k.s.id), current: false }))
    const rendered = page.items.map(({ s, kind, data }) => {
      const ctx = { ...baseCtx(s), navLinks, contactId, firstContentId, link }
      const render = kind.variants[s.variant] || Object.values(kind.variants)[0]
      const out = render(data, ctx)
      // Inner pages get a page header with the page's h1 right after the nav.
      return s.kind === "nav" && !isHome ? { ...out, html: out.html + pageHeader(page, site) } : out
    })
    const css = [tokens, BASE_CSS, isHome ? "" : PAGE_HEAD_CSS, ...new Set(rendered.map(r => r.css).filter(Boolean)), blueprint.features.includes("theme_toggle") ? theme.toggleCss : ""].filter(Boolean).join("\n")
    const script = buildScript(rendered.flatMap(r => r.scripts || []).concat(blueprint.filter && page.items.some(k => k.s.kind === "menu") ? ["filter"] : []))
    const title = isHome ? site.title : `${page.title} — ${site.brand}`
    return `<!DOCTYPE html>
<html lang="en" data-theme="${colors.dark ? "dark" : "light"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${esc(fontsUrl)}" rel="stylesheet">
<style>
${css}
</style>
</head>
<body id="top">
${rendered.map(r => r.html).join("\n")}
<script>
${script}
</script>
</body>
</html>`
  }

  const files = pages.map(p => ({ path: p.path, content: renderPage(p) }))
  return {
    html: files[0].content, files, title: site.title, colors, fonts: { heading: headingFont, body: bodyFont },
    pages: pages.map(p => ({ path: p.path, title: p.title, sections: p.items.map(k => k.s.id) })),
    sections: kept.map(k => k.s), dropped: blueprint.sections.filter(s => !kept.some(k => k.s === s)).map(s => s.id),
  }
}

// ── Pages ─────────────────────────────────────────────────────────────────────
export const MAIN_PAGE = "index.html"
const MAX_PAGES = 8
// Sections substantial enough for a page of their own on multi-page sites.
const OWN_PAGE_KINDS = new Set(["menu", "gallery", "events", "pricing", "team", "faq", "contact", "content"])
export const PAGE_PATH = /^[a-z0-9][a-z0-9-]{0,40}\.html$/

// [{ path, title, main, items }]; nav and footer appear on every page.
function splitPages(kept, multiPage, site) {
  if (!multiPage) return [{ path: MAIN_PAGE, title: site.title, main: null, items: kept }]
  const nav = kept.filter(k => k.s.kind === "nav"), footer = kept.filter(k => k.s.kind === "footer")
  const body = kept.filter(k => k.s.kind !== "nav" && k.s.kind !== "footer")
  const own = body.filter(k => OWN_PAGE_KINDS.has(k.s.kind)).slice(0, MAX_PAGES - 1)
  const home = body.filter(k => !own.includes(k))
  const used = new Set([MAIN_PAGE])
  const pages = [{ path: MAIN_PAGE, title: site.title, main: null, items: [...nav, ...home, ...footer] }]
  for (const k of own) {
    let base = String(k.s.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "page"
    if (base === "index") base = "index-page"
    let path = `${base}.html`
    for (let n = 2; used.has(path); n++) path = `${base}-${n}.html`
    used.add(path)
    pages.push({ path, title: k.s.name, main: k.s.id, items: [...nav, k, ...footer] })
  }
  return pages
}

const pageHeader = (page, site) => `<header class="gw-page-head"><div class="gw-wrap"><p class="gw-eyebrow">${esc(site.brand)}</p><h1>${esc(page.title)}</h1></div></header>`
const PAGE_HEAD_CSS = `.gw-page-head{padding:72px 0 0;background:linear-gradient(180deg,color-mix(in srgb,var(--primary) 12%,var(--bg)),var(--bg))}.gw-page-head h1{font-size:clamp(2.2rem,5vw,3.4rem);margin:0}.gw-page-head+.gw-section{padding-top:48px}`
