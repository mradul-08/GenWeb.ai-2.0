// Section library for the hybrid engine. Each kind has:
//   schema    — compact description of its content, shown to the model;
//   normalize — turns the model's (untrusted, possibly partial) JSON into
//               complete content, filling gaps from the plan so a section is
//               never empty and nothing is trusted as markup;
//   variants  — renderers returning { html, css, scripts[] }.
// All content is HTML-escaped on output: the model writes text, never markup.
// Styling uses only the design-token CSS variables set by assemble.js.
// Original work (no third-party templates).

// ── Helpers ───────────────────────────────────────────────────────────────────
import { iconSvg, artSvg, ICON_NAMES } from "./icons.js"

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
const str = (v, max, fallback = "") => {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : ""
  const t = s.replace(/\s+/g, " ").trim().slice(0, max)
  return t || fallback
}
const list = (v, max) => (Array.isArray(v) ? v.filter(x => x !== null && x !== undefined).slice(0, max) : [])
// One emoji / short symbol only (icons are text, never markup). Joined
// emoji such as "👨‍🍳" are several code points, so up to 8 are allowed, but
// no letters, digits or markup characters.
const icon = (v, fallback) => {
  const s = str(v, 16)
  return s && !/[<>&"'A-Za-z0-9]/.test(s) && [...s].length <= 8 ? s : fallback
}
// Icon name from the library (rendered as SVG) or a valid emoji; else fallback (an icon name).
const glyphValue = (v, fallback) => {
  const name = typeof v === "string" ? v.trim().toLowerCase() : ""
  return ICON_NAMES.includes(name) ? name : icon(v, fallback)
}
const glyph = (v) => iconSvg(v) || esc(v)
// Theme-coloured art with a big icon in front (hero / about / highlight visuals).
const artBlock = (value, style, cls) => `<div class="${cls} gw-art" aria-hidden="true">${artSvg(style)}<span class="gw-art-icon">${glyph(value)}</span></div>`
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null
}
const paragraphs = (v, max, fallback) => {
  const items = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(p => str(p, 600)).filter(Boolean).slice(0, max)
  return items.length ? items : [fallback]
}
const heading = (c, ctx) => str(c?.heading, 90, ctx.name)
const intro = (c, ctx) => str(c?.intro, 260, ctx.purpose)
const h2 = (c) => `<h2 class="gw-h2">${esc(c.heading)}</h2>${c.intro ? `<p class="gw-lead">${esc(c.intro)}</p>` : ""}`
const section = (ctx, cls, inner, extra = "") => `<section id="${esc(ctx.id)}" class="gw-section ${cls}"${extra}><div class="gw-wrap">${inner}</div></section>`

// ── Section kinds ─────────────────────────────────────────────────────────────
export const KINDS = {
  nav: {
    schema: `{"brand":"business name","cta":"short button text or empty"}`,
    normalize: (c, ctx) => ({ brand: str(c?.brand, 40, ctx.site.brand), cta: str(c?.cta, 24) }),
    variants: {
      bar: (c, ctx) => navRender(c, ctx, "gw-nav-bar"),
      center: (c, ctx) => navRender(c, ctx, "gw-nav-center"),
    },
  },

  hero: {
    schema: `{"eyebrow":"short label","heading":"headline, max 9 words","subheading":"1-2 sentences","primaryCta":"button text","secondaryCta":"button text or empty","icon":"icon name"}`,
    normalize: (c, ctx) => ({
      eyebrow: str(c?.eyebrow, 50), heading: str(c?.heading, 90, ctx.site.title), subheading: str(c?.subheading, 260, ctx.site.tagline || ctx.purpose),
      primaryCta: str(c?.primaryCta, 28, "Get started"), secondaryCta: str(c?.secondaryCta, 28), emoji: glyphValue(c?.icon ?? c?.emoji, "sparkles"),
    }),
    variants: {
      centered: (c, ctx) => ({
        html: `<section id="${esc(ctx.id)}" class="gw-hero gw-hero-centered"><div class="gw-wrap">${heroText(c, ctx)}</div></section>`,
        css: `.gw-hero-centered{padding:110px 0 96px;text-align:center;background:radial-gradient(1200px 500px at 50% -10%,color-mix(in srgb,var(--primary) 18%,transparent),transparent),var(--bg)}.gw-hero-centered .gw-hero-actions{justify-content:center}.gw-hero-centered p{margin-inline:auto}`,
      }),
      split: (c, ctx) => ({
        html: `<section id="${esc(ctx.id)}" class="gw-hero gw-hero-split"><div class="gw-wrap gw-hero-grid"><div>${heroText(c, ctx)}</div>${artBlock(c.emoji, ctx.site.brand.length, "gw-hero-visual")}</div></section>`,
        css: `.gw-hero-split{padding:90px 0}.gw-hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center}.gw-hero-visual{aspect-ratio:1;border-radius:calc(var(--radius)*2);background:var(--surface)}@media(max-width:768px){.gw-hero-grid{grid-template-columns:1fr}.gw-hero-visual{max-width:280px;margin:0 auto}}`,
      }),
      bold: (c, ctx) => ({
        html: `<section id="${esc(ctx.id)}" class="gw-hero gw-hero-bold"><div class="gw-wrap">${heroText(c, ctx)}</div></section>`,
        css: `.gw-hero-bold{padding:120px 0 100px;background:radial-gradient(900px 420px at 85% 0%,color-mix(in srgb,var(--secondary) 35%,transparent),transparent),linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 72%,#000));color:var(--on-primary)}.gw-hero-bold h1{font-size:clamp(2.4rem,5.6vw,4.2rem);max-width:16ch;color:var(--on-primary)}.gw-hero-bold .gw-eyebrow,.gw-hero-bold p{color:var(--on-primary);opacity:.9}.gw-hero-bold .gw-btn{background:var(--on-primary);color:var(--primary)}.gw-hero-bold .gw-btn-ghost{border-color:var(--on-primary);color:var(--on-primary);background:transparent}`,
      }),
    },
  },

  features: {
    schema: `{"heading":"…","intro":"one sentence","items":[{"icon":"icon name","title":"2-4 words","text":"1-2 sentences"}] (exactly 3 or 6 items)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx),
      items: fill(list(c?.items, 6).map(i => ({ icon: glyphValue(i?.icon ?? i?.emoji, "star"), title: str(i?.title, 60), text: str(i?.text, 240) })).filter(i => i.title), 3, (n) => ({ icon: "★", title: `${ctx.name} ${n}`, text: ctx.purpose })),
    }),
    variants: {
      cards: (c, ctx) => ({
        html: section(ctx, "gw-features", `${h2(c)}<div class="gw-grid">${c.items.map(i => `<article class="gw-card gw-reveal"><div class="gw-icon" aria-hidden="true">${glyph(i.icon)}</div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></article>`).join("")}</div>`),
        css: `.gw-icon{width:52px;height:52px;border-radius:var(--radius);display:grid;place-items:center;font-size:26px;background:color-mix(in srgb,var(--primary) 14%,var(--surface));margin-bottom:14px}`,
      }),
      list: (c, ctx) => ({
        html: section(ctx, "gw-features gw-alt", `${h2(c)}<ul class="gw-feature-list">${c.items.map(i => `<li class="gw-reveal"><span class="gw-icon-sm" aria-hidden="true">${glyph(i.icon)}</span><div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div></li>`).join("")}</ul>`),
        css: `.gw-feature-list{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:28px 40px}.gw-feature-list li{display:flex;gap:16px;align-items:flex-start}.gw-icon-sm{flex-shrink:0;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:20px;background:var(--surface)}.gw-feature-list h3{margin:4px 0 6px}`,
      }),
    },
  },

  about: {
    schema: `{"heading":"…","paragraphs":["2-3 short paragraphs"],"highlights":[{"value":"e.g. 15+","label":"years"}] (0-3),"icon":"icon name"}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), paragraphs: paragraphs(c?.paragraphs, 3, ctx.purpose || `About ${ctx.site.brand}.`), emoji: glyphValue(c?.icon ?? c?.emoji, "heart"),
      highlights: list(c?.highlights, 3).map(h => ({ value: str(h?.value, 12), label: str(h?.label, 40) })).filter(h => h.value && h.label),
    }),
    variants: {
      split: (c, ctx) => ({
        html: section(ctx, "gw-about", `<div class="gw-about-grid">${artBlock(c.emoji, ctx.site.brand.length + 1, "gw-about-art")}<div><h2 class="gw-h2">${esc(c.heading)}</h2>${c.paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}${highlights(c)}</div></div>`),
        css: `.gw-about-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:56px;align-items:center}.gw-about-art{aspect-ratio:4/5;border-radius:calc(var(--radius)*2);background:var(--surface)}@media(max-width:768px){.gw-about-grid{grid-template-columns:1fr}.gw-about-art{aspect-ratio:16/9}}` + HIGHLIGHT_CSS,
      }),
      centered: (c, ctx) => ({
        html: section(ctx, "gw-about gw-alt", `<div class="gw-narrow"><h2 class="gw-h2">${esc(c.heading)}</h2>${c.paragraphs.map(p => `<p class="gw-lead">${esc(p)}</p>`).join("")}${highlights(c)}</div>`),
        css: `.gw-narrow{max-width:760px;margin:0 auto;text-align:center}.gw-narrow .gw-highlights{justify-content:center}` + HIGHLIGHT_CSS,
      }),
    },
  },

  menu: {
    schema: `{"heading":"…","intro":"one sentence","items":[{"name":"…","description":"short","price":"with currency, e.g. ₹120","tag":"optional e.g. Bestseller"}] (6-8 items),"note":"optional small print"}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx), note: str(c?.note, 160),
      items: fill(list(c?.items, 12).map(i => ({ name: str(i?.name, 60), description: str(i?.description, 160), price: str(i?.price, 20), tag: str(i?.tag, 20) })).filter(i => i.name), 3, (n) => ({ name: `Item ${n}`, description: ctx.purpose, price: "", tag: "" })),
    }),
    variants: {
      list: (c, ctx) => ({
        html: section(ctx, "gw-menu", `${h2(c)}${filterBox(ctx)}<div class="gw-menu-list">${c.items.map(i => `<div class="gw-menu-item gw-filter-item"><div class="gw-menu-row"><h3>${esc(i.name)}${i.tag ? ` <span class="gw-tag">${esc(i.tag)}</span>` : ""}</h3><span class="gw-dots" aria-hidden="true"></span>${i.price ? `<strong class="gw-price">${esc(i.price)}</strong>` : ""}</div>${i.description ? `<p>${esc(i.description)}</p>` : ""}</div>`).join("")}</div>${c.note ? `<p class="gw-note">${esc(c.note)}</p>` : ""}`),
        css: `.gw-menu-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:22px 56px}.gw-menu-row{display:flex;align-items:baseline;gap:10px}.gw-menu-row h3{margin:0}.gw-dots{flex:1;border-bottom:2px dotted color-mix(in srgb,var(--muted) 50%,transparent);transform:translateY(-4px)}.gw-menu-item p{margin:6px 0 0;color:var(--muted)}` + MENU_CSS,
      }),
      cards: (c, ctx) => ({
        html: section(ctx, "gw-menu gw-alt", `${h2(c)}${filterBox(ctx)}<div class="gw-grid">${c.items.map(i => `<article class="gw-card gw-filter-item gw-reveal">${i.tag ? `<span class="gw-tag">${esc(i.tag)}</span>` : ""}<h3>${esc(i.name)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ""}${i.price ? `<strong class="gw-price">${esc(i.price)}</strong>` : ""}</article>`).join("")}</div>${c.note ? `<p class="gw-note">${esc(c.note)}</p>` : ""}`),
        css: `.gw-menu .gw-card .gw-price{display:block;margin-top:12px;font-size:1.15rem}` + MENU_CSS,
      }),
    },
  },

  pricing: {
    schema: `{"heading":"…","intro":"one sentence","plans":[{"name":"…","price":"e.g. ₹499","period":"/month or empty","features":["3-6 short points"],"cta":"button text","highlighted":true|false}] (2-3 plans)}`,
    normalize: (c, ctx) => {
      const plans = fill(list(c?.plans, 4).map(p => ({ name: str(p?.name, 40), price: str(p?.price, 20), period: str(p?.period, 20), cta: str(p?.cta, 24, "Choose plan"), highlighted: p?.highlighted === true, features: list(p?.features, 8).map(f => str(f, 90)).filter(Boolean) })).filter(p => p.name), 1, () => ({ name: "Standard", price: "", period: "", cta: "Contact us", highlighted: true, features: [] }))
      if (plans.length && !plans.some(p => p.highlighted)) plans[Math.min(1, plans.length - 1)].highlighted = true
      return { heading: heading(c, ctx), intro: intro(c, ctx), plans }
    },
    variants: {
      cards: (c, ctx) => ({
        html: section(ctx, "gw-pricing", `${h2(c)}<div class="gw-plans">${c.plans.map(p => `<article class="gw-plan${p.highlighted ? " gw-plan-hot" : ""} gw-reveal"><h3>${esc(p.name)}</h3><p class="gw-plan-price">${esc(p.price)}<span>${esc(p.period)}</span></p><ul>${p.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul><a class="gw-btn${p.highlighted ? "" : " gw-btn-ghost"}" href="${esc(ctx.link(ctx.contactId || ctx.id))}">${esc(p.cta)}</a></article>`).join("")}</div>`),
        css: `.gw-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px;align-items:stretch}.gw-plan{display:flex;flex-direction:column;padding:30px;border-radius:calc(var(--radius)*1.5);background:var(--surface);border:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.gw-plan-hot{background:var(--primary);color:var(--on-primary);transform:translateY(-8px);box-shadow:var(--shadow)}.gw-plan-hot .gw-btn{background:var(--on-primary);color:var(--primary)}.gw-plan-price{font-size:2.4rem;font-weight:800;margin:8px 0 16px;font-family:var(--font-heading)}.gw-plan-price span{font-size:1rem;font-weight:500;opacity:.75}.gw-plan ul{list-style:none;padding:0;margin:0 0 24px;flex:1}.gw-plan li{padding:7px 0 7px 26px;position:relative}.gw-plan li::before{content:"✓";position:absolute;left:0;font-weight:800}@media(max-width:768px){.gw-plan-hot{transform:none}}`,
      }),
    },
  },

  testimonials: {
    schema: `{"heading":"…","items":[{"quote":"1-2 sentences","name":"person","role":"e.g. Regular customer"}] (exactly 3 items)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx),
      items: fill(list(c?.items, 6).map(i => ({ quote: str(i?.quote, 280), name: str(i?.name, 40), role: str(i?.role, 50) })).filter(i => i.quote && i.name), 2, (n) => ({ quote: `${ctx.site.brand} is wonderful.`, name: `Customer ${n}`, role: "" })),
    }),
    variants: {
      grid: (c, ctx) => ({
        html: section(ctx, "gw-testimonials gw-alt", `<h2 class="gw-h2">${esc(c.heading)}</h2><div class="gw-grid">${c.items.map(i => quoteCard(i)).join("")}</div>`),
        css: QUOTE_CSS,
      }),
      carousel: (c, ctx) => ({
        html: section(ctx, "gw-testimonials gw-alt", `<h2 class="gw-h2">${esc(c.heading)}</h2><div class="gw-carousel" data-interval="5000" aria-roledescription="carousel"><div class="gw-carousel-track">${c.items.map((i, n) => `<div class="gw-slide${n === 0 ? " is-active" : ""}" aria-hidden="${n === 0 ? "false" : "true"}">${quoteCard(i)}</div>`).join("")}</div><div class="gw-dots-nav">${c.items.map((_, n) => `<button type="button" class="gw-dot${n === 0 ? " is-active" : ""}" aria-label="Show review ${n + 1}"></button>`).join("")}</div></div>`),
        css: QUOTE_CSS + `.gw-carousel{max-width:720px;margin:0 auto;text-align:center}.gw-slide{display:none}.gw-slide.is-active{display:block;animation:gw-fade .5s ease}.gw-dots-nav{display:flex;gap:10px;justify-content:center;margin-top:20px}.gw-dot{width:11px;height:11px;border-radius:50%;border:0;padding:0;background:color-mix(in srgb,var(--text) 25%,transparent);cursor:pointer}.gw-dot.is-active{background:var(--primary);transform:scale(1.25)}@keyframes gw-fade{from{opacity:0}to{opacity:1}}`,
        scripts: ["carousel"],
      }),
    },
  },

  gallery: {
    schema: `{"heading":"…","intro":"one sentence","items":[{"icon":"icon name","caption":"2-5 words"}] (exactly 6 items)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx),
      items: fill(list(c?.items, 9).map(i => ({ emoji: glyphValue(i?.icon ?? i?.emoji, "camera"), caption: str(i?.caption, 60) })).filter(i => i.caption), 3, (n) => ({ emoji: "📷", caption: `${ctx.name} ${n}` })),
    }),
    variants: {
      grid: (c, ctx) => ({
        html: section(ctx, "gw-gallery", `${h2(c)}<div class="gw-gallery-grid">${c.items.map((i, n) => `<figure class="gw-tile gw-tile-${n % 4} gw-reveal"><span aria-hidden="true">${glyph(i.emoji)}</span><figcaption>${esc(i.caption)}</figcaption></figure>`).join("")}</div>`),
        css: `.gw-gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:900px){.gw-gallery-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.gw-gallery-grid{grid-template-columns:1fr}}.gw-tile{margin:0;aspect-ratio:4/3;border-radius:var(--radius);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:54px;color:var(--on-primary);box-shadow:var(--shadow);transition:transform .25s}.gw-tile:hover{transform:scale(1.03)}.gw-tile figcaption{font-size:.95rem;font-weight:600}.gw-tile-0{background:linear-gradient(135deg,var(--primary),var(--secondary))}.gw-tile-1{background:linear-gradient(135deg,var(--accent),var(--primary))}.gw-tile-2{background:linear-gradient(135deg,var(--secondary),var(--accent))}.gw-tile-3{background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 70%,#000),var(--primary))}`,
      }),
    },
  },

  team: {
    schema: `{"heading":"…","intro":"one sentence","members":[{"name":"…","role":"…","bio":"one sentence","icon":"icon name"}] (3-4)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx),
      members: fill(list(c?.members, 8).map(m => ({ name: str(m?.name, 40), role: str(m?.role, 50), bio: str(m?.bio, 200), emoji: glyphValue(m?.icon ?? m?.emoji, "user") })).filter(m => m.name), 2, (n) => ({ name: `Team member ${n}`, role: "", bio: "", emoji: "🙂" })),
    }),
    variants: {
      grid: (c, ctx) => ({
        html: section(ctx, "gw-team", `${h2(c)}<div class="gw-grid">${c.members.map(m => `<article class="gw-card gw-member gw-reveal"><div class="gw-avatar" aria-hidden="true">${glyph(m.emoji)}</div><h3>${esc(m.name)}</h3>${m.role ? `<p class="gw-role">${esc(m.role)}</p>` : ""}${m.bio ? `<p>${esc(m.bio)}</p>` : ""}</article>`).join("")}</div>`),
        css: `.gw-member{text-align:center}.gw-avatar{width:96px;height:96px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:44px;background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--secondary) 40%,var(--surface)))}.gw-role{color:var(--primary);font-weight:700;margin:-4px 0 8px}`,
      }),
    },
  },

  stats: {
    schema: `{"heading":"optional","items":[{"value":120,"suffix":"+ or % or empty","label":"…"}] (3-4 items, value is a number)}`,
    normalize: (c, ctx) => ({
      heading: str(c?.heading, 90),
      items: fill(list(c?.items, 4).map(i => ({ value: num(i?.value), suffix: str(i?.suffix, 4), label: str(i?.label, 40) })).filter(i => i.value !== null && i.label), 2, (n) => ({ value: n * 10, suffix: "+", label: ctx.name })),
    }),
    variants: {
      band: (c, ctx) => ({
        html: section(ctx, "gw-stats", `${c.heading ? `<h2 class="gw-h2">${esc(c.heading)}</h2>` : ""}<div class="gw-stats-grid">${c.items.map(i => `<div class="gw-stat"><strong><span data-count="${esc(i.value)}">${esc(i.value)}</span>${esc(i.suffix)}</strong><span>${esc(i.label)}</span></div>`).join("")}</div>`),
        css: `.gw-stats{background:var(--primary);color:var(--on-primary);padding:70px 0}.gw-stats .gw-h2{color:var(--on-primary);text-align:center}.gw-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px;text-align:center}.gw-stat strong{display:block;font-family:var(--font-heading);font-size:clamp(2.2rem,5vw,3.2rem)}.gw-stat span{opacity:.88}`,
        scripts: ["counter"],
      }),
    },
  },

  faq: {
    schema: `{"heading":"…","items":[{"q":"question","a":"1-3 sentence answer"}] (exactly 5 items)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx),
      items: fill(list(c?.items, 8).map(i => ({ q: str(i?.q ?? i?.question, 160), a: str(i?.a ?? i?.answer, 500) })).filter(i => i.q && i.a), 2, (n) => ({ q: `Question ${n}`, a: ctx.purpose || "Please contact us for details." })),
    }),
    variants: {
      accordion: (c, ctx) => ({
        html: section(ctx, "gw-faq", `<div class="gw-narrow-left"><h2 class="gw-h2">${esc(c.heading)}</h2>${c.items.map((i, n) => `<details class="gw-faq-item"${n === 0 ? " open" : ""}><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join("")}</div>`),
        css: `.gw-narrow-left{max-width:800px;margin:0 auto}.gw-faq-item{border-bottom:1px solid color-mix(in srgb,var(--text) 14%,transparent);padding:4px 0}.gw-faq-item summary{cursor:pointer;list-style:none;padding:18px 36px 18px 0;font-weight:700;position:relative}.gw-faq-item summary::-webkit-details-marker{display:none}.gw-faq-item summary::after{content:"+";position:absolute;right:4px;top:12px;font-size:1.6rem;color:var(--primary);transition:transform .2s}.gw-faq-item[open] summary::after{transform:rotate(45deg)}.gw-faq-item p{margin:0 0 18px;color:var(--muted)}`,
      }),
    },
  },

  events: {
    schema: `{"heading":"…","intro":"one sentence","items":[{"date":"e.g. Sat 7 PM or 2021","title":"…","text":"one sentence"}] (3-6 items)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx),
      items: fill(list(c?.items, 8).map(i => ({ date: str(i?.date, 30), title: str(i?.title, 70), text: str(i?.text, 220) })).filter(i => i.title), 2, (n) => ({ date: "", title: `${ctx.name} ${n}`, text: ctx.purpose })),
    }),
    variants: {
      timeline: (c, ctx) => ({
        html: section(ctx, "gw-events gw-alt", `${h2(c)}<ol class="gw-timeline">${c.items.map(i => `<li class="gw-reveal">${i.date ? `<span class="gw-when">${esc(i.date)}</span>` : ""}<h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ""}</li>`).join("")}</ol>`),
        css: `.gw-timeline{list-style:none;margin:0 auto;padding:0 0 0 28px;max-width:760px;border-left:3px solid color-mix(in srgb,var(--primary) 35%,transparent)}.gw-timeline li{position:relative;padding:0 0 32px 20px}.gw-timeline li::before{content:"";position:absolute;left:-37px;top:4px;width:16px;height:16px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 5px var(--bg)}.gw-when{display:inline-block;font-size:.85rem;font-weight:700;color:var(--primary);letter-spacing:.04em;text-transform:uppercase}.gw-timeline h3{margin:4px 0 6px}`,
      }),
    },
  },

  contact: {
    schema: `{"heading":"…","intro":"one sentence","address":"only if in the request, else empty","phone":"only if in the request, else empty","email":"only if in the request, else empty","hours":"…","formTitle":"…","submitLabel":"button text"}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx), address: str(c?.address, 160), phone: str(c?.phone, 40), email: str(c?.email, 80),
      hours: str(c?.hours, 120), formTitle: str(c?.formTitle, 60, ctx.booking ? "Book now" : "Send us a message"), submitLabel: str(c?.submitLabel, 28, ctx.booking ? "Book" : "Send"),
    }),
    variants: {
      split: (c, ctx) => ({
        html: section(ctx, "gw-contact", `<div class="gw-contact-grid"><div>${h2(c)}<ul class="gw-contact-info">${contactInfo(c)}</ul></div>${contactForm(c, ctx)}</div>`),
        css: CONTACT_CSS,
        scripts: ["forms"],
      }),
      stacked: (c, ctx) => ({
        html: section(ctx, "gw-contact gw-alt", `<div class="gw-narrow">${h2(c)}</div>${contactForm(c, ctx, "gw-form-center")}<ul class="gw-contact-info gw-contact-row">${contactInfo(c)}</ul>`),
        css: CONTACT_CSS + `.gw-form-center{max-width:560px;margin:0 auto}.gw-contact-row{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 32px;margin-top:32px}`,
        scripts: ["forms"],
      }),
    },
  },

  cta: {
    schema: `{"heading":"…","text":"one sentence","button":"button text","newsletter":true|false}`,
    normalize: (c, ctx) => ({ heading: heading(c, ctx), text: str(c?.text, 220, ctx.purpose), button: str(c?.button, 28, "Get in touch"), newsletter: c?.newsletter === true || ctx.newsletter }),
    variants: {
      banner: (c, ctx) => c.newsletter ? newsletterRender(c, ctx) : ({
        html: section(ctx, "gw-cta", `<div class="gw-cta-box"><h2 class="gw-h2">${esc(c.heading)}</h2><p>${esc(c.text)}</p><a class="gw-btn" href="${esc(ctx.link(ctx.contactId || "top"))}">${esc(c.button)}</a></div>`),
        css: CTA_CSS,
      }),
      newsletter: (c, ctx) => newsletterRender(c, ctx),
    },
  },

  footer: {
    schema: `{"tagline":"one line","address":"only if in the request","hours":"optional","copyright":"© year name"}`,
    normalize: (c, ctx) => ({ brand: ctx.site.brand, tagline: str(c?.tagline, 140, ctx.site.tagline), address: str(c?.address, 160), hours: str(c?.hours, 120), copyright: str(c?.copyright, 80, `© ${new Date().getFullYear()} ${ctx.site.brand}`) }),
    variants: {
      simple: (c, ctx) => ({
        html: `<footer id="${esc(ctx.id)}" class="gw-footer"><div class="gw-wrap gw-footer-simple"><strong>${esc(c.brand)}</strong>${c.tagline ? `<p>${esc(c.tagline)}</p>` : ""}<nav aria-label="Footer">${ctx.navLinks.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav><small>${esc(c.copyright)}</small></div></footer>`,
        css: FOOTER_CSS + `.gw-footer-simple{text-align:center}.gw-footer-simple nav{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;margin:16px 0}`,
      }),
      columns: (c, ctx) => ({
        html: `<footer id="${esc(ctx.id)}" class="gw-footer"><div class="gw-wrap gw-footer-cols"><div><strong>${esc(c.brand)}</strong>${c.tagline ? `<p>${esc(c.tagline)}</p>` : ""}</div><nav aria-label="Footer"><h3>Explore</h3>${ctx.navLinks.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav>${c.address || c.hours ? `<div><h3>Visit</h3>${c.address ? `<p>${esc(c.address)}</p>` : ""}${c.hours ? `<p>${esc(c.hours)}</p>` : ""}</div>` : ""}</div><div class="gw-wrap"><small>${esc(c.copyright)}</small></div></footer>`,
        css: FOOTER_CSS + `.gw-footer-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px;margin-bottom:28px}.gw-footer-cols nav{display:flex;flex-direction:column;gap:8px}.gw-footer h3{font-size:.85rem;text-transform:uppercase;letter-spacing:.1em;opacity:.7;margin:0 0 12px}`,
      }),
    },
  },

  content: {
    schema: `{"heading":"…","intro":"one sentence","paragraphs":["1-2 short paragraphs"],"items":[{"title":"…","text":"one sentence"}] (0-6)}`,
    normalize: (c, ctx) => ({
      heading: heading(c, ctx), intro: intro(c, ctx), paragraphs: paragraphs(c?.paragraphs, 2, ""),
      items: list(c?.items, 6).map(i => ({ title: str(i?.title, 60), text: str(i?.text, 240) })).filter(i => i.title),
    }),
    variants: {
      cards: (c, ctx) => ({
        html: section(ctx, "gw-content", `${h2(c)}${c.paragraphs.filter(Boolean).map(p => `<p class="gw-copy">${esc(p)}</p>`).join("")}${c.items.length ? `<div class="gw-grid">${c.items.map(i => `<article class="gw-card gw-reveal"><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></article>`).join("")}</div>` : ""}`),
        css: `.gw-copy{max-width:760px}`,
      }),
    },
  },
}

// ── Shared pieces ─────────────────────────────────────────────────────────────
// Lists are never padded with invented entries: fake reviews, prices or team
// members would be presented to visitors as real. A list section left empty
// is dropped by assemble.js (see LIST_KEY) and shows as missing in the checklist.
function fill(items) {
  return items
}

// The list each content-driven kind cannot exist without.
export const LIST_KEY = {
  features: "items", menu: "items", pricing: "plans", testimonials: "items", gallery: "items",
  team: "members", stats: "items", faq: "items", events: "items",
}
// Kinds that are meaningful from the plan alone (structure, not claims).
export const ALWAYS_RENDER = new Set(["nav", "hero", "footer", "contact"])

// Editable fields per kind, for the no-AI design editor. Mirrors each kind's
// normalize(); the server still normalizes and escapes whatever is sent.
// type: text | textarea | emoji | number | bool | strings (list of text) | list (of objects)
const t = (key, label, max = 120) => ({ key, label, type: "text", max })
const ta = (key, label, max = 600) => ({ key, label, type: "textarea", max })
const em = (key, label = "Emoji") => ({ key, label, type: "emoji", max: 8 })
const items = (key, label, maxItems, item) => ({ key, label, type: "list", maxItems, item })
export const KIND_UI = {
  nav:          { label: "Navigation", fields: [t("brand", "Brand name", 40), t("cta", "Button text (optional)", 24)] },
  hero:         { label: "Hero", fields: [t("eyebrow", "Small label", 50), t("heading", "Headline", 90), ta("subheading", "Sub-heading", 260), t("primaryCta", "Main button", 28), t("secondaryCta", "Second button (optional)", 28), em("emoji")] },
  features:     { label: "Features / services", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("items", "Items", 6, [em("icon", "Icon"), t("title", "Title", 60), ta("text", "Text", 240)])] },
  about:        { label: "About", fields: [t("heading", "Heading", 90), { key: "paragraphs", label: "Paragraphs", type: "strings", maxItems: 3, max: 600 }, items("highlights", "Highlights", 3, [t("value", "Value", 12), t("label", "Label", 40)]), em("emoji")] },
  menu:         { label: "Menu / products", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("items", "Items", 12, [t("name", "Name", 60), t("description", "Description", 160), t("price", "Price", 20), t("tag", "Tag", 20)]), t("note", "Small print", 160)] },
  pricing:      { label: "Pricing", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("plans", "Plans", 4, [t("name", "Name", 40), t("price", "Price", 20), t("period", "Period", 20), { key: "features", label: "Features", type: "strings", maxItems: 8, max: 90 }, t("cta", "Button", 24), { key: "highlighted", label: "Highlight", type: "bool" }])] },
  testimonials: { label: "Testimonials", fields: [t("heading", "Heading", 90), items("items", "Reviews", 6, [ta("quote", "Quote", 280), t("name", "Name", 40), t("role", "Role", 50)])] },
  gallery:      { label: "Gallery", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("items", "Tiles", 9, [em("emoji"), t("caption", "Caption", 60)])] },
  team:         { label: "Team", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("members", "Members", 8, [t("name", "Name", 40), t("role", "Role", 50), ta("bio", "Bio", 200), em("emoji")])] },
  stats:        { label: "Stats", fields: [t("heading", "Heading (optional)", 90), items("items", "Numbers", 4, [{ key: "value", label: "Value", type: "number" }, t("suffix", "Suffix", 4), t("label", "Label", 40)])] },
  faq:          { label: "FAQ", fields: [t("heading", "Heading", 90), items("items", "Questions", 8, [t("q", "Question", 160), ta("a", "Answer", 500)])] },
  events:       { label: "Schedule / timeline", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("items", "Entries", 8, [t("date", "Date / time", 30), t("title", "Title", 70), ta("text", "Text", 220)])] },
  contact:      { label: "Contact / booking", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), t("address", "Address", 160), t("phone", "Phone", 40), t("email", "Email", 80), t("hours", "Hours", 120), t("formTitle", "Form title", 60), t("submitLabel", "Button", 28)] },
  cta:          { label: "Call to action", fields: [t("heading", "Heading", 90), ta("text", "Text", 220), t("button", "Button", 28), { key: "newsletter", label: "Email sign-up form", type: "bool" }] },
  footer:       { label: "Footer", fields: [t("tagline", "Tagline", 140), t("address", "Address", 160), t("hours", "Hours", 120), t("copyright", "Copyright", 80)] },
  content:      { label: "Text section", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), { key: "paragraphs", label: "Paragraphs", type: "strings", maxItems: 2, max: 600 }, items("items", "Cards", 6, [t("title", "Title", 60), ta("text", "Text", 240)])] },
}

function navRender(c, ctx, cls) {
  const cta = c.cta && ctx.contactId ? `<a class="gw-btn gw-btn-sm" href="${esc(ctx.link(ctx.contactId))}">${esc(c.cta)}</a>` : ""
  // The button already leads to the contact section; don't list it twice.
  const links = ctx.navLinks.filter(l => !(cta && l.id === ctx.contactId)).map(l => `<a href="${esc(l.href)}"${l.current ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`).join("")
  const theme = ctx.themeToggle ? `<button type="button" class="gw-theme-toggle" aria-label="Toggle dark mode">◐</button>` : ""
  return {
    html: `<nav id="${esc(ctx.id)}" class="gw-nav ${cls}" aria-label="Main"><div class="gw-wrap gw-nav-inner"><a class="gw-brand" href="${esc(ctx.link("top"))}">${esc(c.brand)}</a><button type="button" class="gw-menu-toggle" aria-expanded="false" aria-controls="${esc(ctx.id)}-links" aria-label="Open menu">☰</button><div class="gw-nav-links" id="${esc(ctx.id)}-links">${links}${cta}${theme}</div></div></nav>`,
    css: `.gw-nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid color-mix(in srgb,var(--text) 8%,transparent)}.gw-nav-inner{display:flex;align-items:center;gap:24px;min-height:68px}.gw-brand{font-family:var(--font-heading);font-weight:800;font-size:1.3rem;color:var(--primary);text-decoration:none}.gw-nav-links{display:flex;align-items:center;gap:22px;margin-left:auto}.gw-nav-links a:not(.gw-btn){color:var(--text);text-decoration:none;font-weight:600;opacity:.85}.gw-nav-links a:not(.gw-btn):hover,.gw-nav-links a[aria-current="page"]{color:var(--primary);opacity:1}.gw-nav-links a[aria-current="page"]{text-decoration:underline;text-underline-offset:6px;text-decoration-thickness:2px}.gw-menu-toggle{display:none;margin-left:auto;background:none;border:0;font-size:1.6rem;color:var(--text);cursor:pointer}.gw-theme-toggle{background:var(--surface);border:0;border-radius:50%;width:36px;height:36px;color:var(--text);cursor:pointer}.gw-nav-center .gw-nav-inner{flex-direction:column;gap:6px;padding:14px 0}.gw-nav-center .gw-nav-links{margin:0}@media(max-width:768px){.gw-nav-center .gw-nav-inner{flex-direction:row;padding:0}.gw-menu-toggle{display:block}.gw-nav-links{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:flex-start;gap:4px;padding:12px 24px 20px;background:var(--bg);border-bottom:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.gw-nav-links.is-open{display:flex}.gw-nav-links a{padding:8px 0}}`,
    scripts: ["mobileMenu", ...(ctx.themeToggle ? ["themeToggle"] : [])],
  }
}

const heroText = (c, ctx) => `${c.eyebrow ? `<p class="gw-eyebrow">${esc(c.eyebrow)}</p>` : ""}<h1>${esc(c.heading)}</h1><p class="gw-hero-sub">${esc(c.subheading)}</p><div class="gw-hero-actions"><a class="gw-btn" href="${esc(ctx.link(ctx.firstContentId || ctx.contactId || "top"))}">${esc(c.primaryCta)}</a>${c.secondaryCta ? `<a class="gw-btn gw-btn-ghost" href="${esc(ctx.link(ctx.contactId || ctx.firstContentId || "top"))}">${esc(c.secondaryCta)}</a>` : ""}</div>`

const highlights = (c) => c.highlights.length ? `<div class="gw-highlights">${c.highlights.map(h => `<div><strong>${esc(h.value)}</strong><span>${esc(h.label)}</span></div>`).join("")}</div>` : ""
const HIGHLIGHT_CSS = `.gw-highlights{display:flex;flex-wrap:wrap;gap:28px;margin-top:24px}.gw-highlights strong{display:block;font-family:var(--font-heading);font-size:2rem;color:var(--primary)}.gw-highlights span{color:var(--muted);font-size:.92rem}`

const filterBox = (ctx) => ctx.filter ? `<label class="gw-filter"><span class="gw-sr">Search ${esc(ctx.name)}</span><input type="search" class="gw-filter-input" placeholder="Search ${esc(ctx.name.toLowerCase())}…"></label>` : ""
const MENU_CSS = `.gw-tag{display:inline-block;font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:99px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--text);vertical-align:middle;margin-bottom:6px}.gw-price{color:var(--primary);white-space:nowrap}.gw-note{margin-top:28px;font-size:.9rem;color:var(--muted)}.gw-filter{display:block;max-width:360px;margin:0 0 28px}.gw-filter-input{width:100%;padding:12px 16px;border-radius:99px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);background:var(--bg);color:var(--text);font:inherit}`

const quoteCard = (i) => `<figure class="gw-quote gw-card"><blockquote>“${esc(i.quote)}”</blockquote><figcaption><strong>${esc(i.name)}</strong>${i.role ? `<span>${esc(i.role)}</span>` : ""}</figcaption></figure>`
const QUOTE_CSS = `.gw-quote{margin:0}.gw-quote blockquote{margin:0 0 16px;font-size:1.08rem;line-height:1.65}.gw-quote figcaption strong{display:block}.gw-quote figcaption span{color:var(--muted);font-size:.9rem}`

function contactInfo(c) {
  return [["pin", c.address], ["phone", c.phone], ["mail", c.email], ["clock", c.hours]].filter(([, v]) => v).map(([i, v]) => `<li>${iconSvg(i)}<span>${esc(v)}</span></li>`).join("")
}
function contactForm(c, ctx, cls = "") {
  // booking "table" (restaurants): date + guests; any other booking: date + time.
  const booking = !ctx.booking ? ""
    : ctx.booking === "appointment"
      ? `<div class="gw-form-row"><label>Date<input type="date" name="date" required></label><label>Time<input type="time" name="time" required></label></div>`
      : `<div class="gw-form-row"><label>Date<input type="date" name="date" required></label><label>Guests<input type="number" name="guests" min="1" max="50" value="2" required></label></div>`
  return `<form class="gw-form gw-card ${cls}" novalidate><h3>${esc(c.formTitle)}</h3><label>Name<input type="text" name="name" autocomplete="name" required></label><label>Phone or email<input type="text" name="contact" autocomplete="email" required></label>${booking}<label>Message<textarea name="message" rows="4"${ctx.booking ? "" : " required"}></textarea></label><button class="gw-btn" type="submit">${esc(c.submitLabel)}</button><p class="gw-form-status" role="status" aria-live="polite"></p></form>`
}
const CONTACT_CSS = `.gw-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start}.gw-contact-info{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:14px}.gw-contact-info li{display:flex;gap:12px}.gw-form{display:grid;gap:14px}.gw-form h3{margin:0 0 4px}.gw-form label{display:grid;gap:6px;font-weight:600;font-size:.92rem}.gw-form input,.gw-form textarea{padding:12px 14px;border-radius:calc(var(--radius)*.7);border:1px solid color-mix(in srgb,var(--text) 18%,transparent);background:var(--bg);color:var(--text);font:inherit}.gw-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gw-form-status{margin:0;min-height:1.2em;font-weight:600;color:var(--primary)}.gw-form .is-invalid{border-color:#d63f3f}@media(max-width:768px){.gw-contact-grid{grid-template-columns:1fr}}`

function newsletterRender(c, ctx) {
  return {
    html: section(ctx, "gw-cta", `<div class="gw-cta-box"><h2 class="gw-h2">${esc(c.heading)}</h2><p>${esc(c.text)}</p><form class="gw-form gw-newsletter" novalidate><label class="gw-sr" for="${esc(ctx.id)}-email">Email address</label><input id="${esc(ctx.id)}-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><button class="gw-btn" type="submit">${esc(c.button)}</button><p class="gw-form-status" role="status" aria-live="polite"></p></form></div>`),
    css: CTA_CSS + `.gw-newsletter{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:520px;margin:20px auto 0}.gw-newsletter input{flex:1 1 240px;padding:13px 16px;border-radius:99px;border:0;font:inherit}.gw-newsletter .gw-form-status{flex-basis:100%;color:var(--on-primary)}`,
    scripts: ["forms"],
  }
}
const CTA_CSS = `.gw-cta-box{text-align:center;padding:56px 32px;border-radius:calc(var(--radius)*2);background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,var(--accent)));color:var(--on-primary)}.gw-cta-box .gw-h2{color:var(--on-primary)}.gw-cta-box p{max-width:560px;margin:0 auto 22px;opacity:.92}.gw-cta-box .gw-btn{background:var(--on-primary);color:var(--primary)}`
const FOOTER_CSS = `.gw-footer{padding:56px 0 32px;background:var(--footer-bg);color:var(--footer-text);border-top:1px solid color-mix(in srgb,var(--footer-text) 12%,transparent)}.gw-footer p,.gw-footer a{color:var(--footer-text);opacity:.85}.gw-footer a{text-decoration:none}.gw-footer a:hover{opacity:1;text-decoration:underline}.gw-footer strong,.gw-footer h3{font-family:var(--font-heading);font-size:1.25rem;color:var(--footer-text)}.gw-footer small{opacity:.75}`

// ══════════════════════════════════════════════════════════════════════════════
// Library v2: more designs for existing kinds and three new kinds (opening
// hours, steps, highlight). Same rules: content is escaped, styling uses only
// the theme tokens, lists are never padded with invented entries.
// ══════════════════════════════════════════════════════════════════════════════
const pad2 = (n) => String(n).padStart(2, "0")
const TILE_CSS = `.gw-tile{margin:0;border-radius:var(--radius);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:54px;color:var(--on-primary);box-shadow:var(--shadow);transition:transform .25s}.gw-tile:hover{transform:scale(1.03)}.gw-tile figcaption{font-size:.95rem;font-weight:600}.gw-tile-0{background:linear-gradient(135deg,var(--primary),var(--secondary))}.gw-tile-1{background:linear-gradient(135deg,var(--accent),var(--primary))}.gw-tile-2{background:linear-gradient(135deg,var(--secondary),var(--accent))}.gw-tile-3{background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 70%,#000),var(--primary))}`

Object.assign(KINDS.hero.variants, {
  minimal: (c, ctx) => ({
    html: `<section id="${esc(ctx.id)}" class="gw-hero gw-hero-minimal"><div class="gw-wrap">${heroText(c, ctx)}</div></section>`,
    css: `.gw-hero-minimal{padding:128px 0 88px;border-bottom:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.gw-hero-minimal h1{font-size:clamp(2.6rem,6.5vw,4.8rem);max-width:16ch}.gw-hero-minimal .gw-hero-sub{max-width:560px}`,
  }),
  panel: (c, ctx) => ({
    html: `<section id="${esc(ctx.id)}" class="gw-hero gw-hero-panel"><div class="gw-wrap"><div class="gw-panel"><div class="gw-panel-emoji" aria-hidden="true">${glyph(c.emoji)}</div>${heroText(c, ctx)}</div></div></section>`,
    css: `.gw-hero-panel{padding:96px 0;background:radial-gradient(color-mix(in srgb,var(--primary) 22%,transparent) 1.2px,transparent 1.3px) 0 0/22px 22px,var(--bg)}.gw-panel{max-width:780px;margin:0 auto;text-align:center;background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 10%,transparent);border-radius:calc(var(--radius)*2);padding:56px 40px;box-shadow:var(--shadow)}.gw-panel-emoji{font-size:56px;margin-bottom:10px}.gw-hero-panel .gw-hero-actions{justify-content:center}.gw-hero-panel .gw-hero-sub{margin-inline:auto}@media(max-width:768px){.gw-panel{padding:40px 22px}}`,
  }),
})

KINDS.features.variants.numbered = (c, ctx) => ({
  html: section(ctx, "gw-features", `${h2(c)}<ol class="gw-numbered">${c.items.map((i, n) => `<li class="gw-card gw-reveal"><span class="gw-num" aria-hidden="true">${pad2(n + 1)}</span><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></li>`).join("")}</ol>`),
  css: `.gw-numbered{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}.gw-num{display:block;font-family:var(--font-heading);font-size:2.6rem;font-weight:800;line-height:1;color:var(--primary);opacity:.85;margin-bottom:14px}`,
})

KINDS.about.variants.quote = (c, ctx) => ({
  html: section(ctx, "gw-about", `<div class="gw-about-quote"><p class="gw-eyebrow">${esc(c.heading)}</p><blockquote>${esc(c.paragraphs[0])}</blockquote>${c.paragraphs.slice(1).map(p => `<p class="gw-lead">${esc(p)}</p>`).join("")}${highlights(c)}</div>`),
  css: `.gw-about-quote{max-width:860px;margin:0 auto;text-align:center}.gw-about-quote blockquote{margin:0 0 24px;font-family:var(--font-heading);font-size:clamp(1.5rem,3.2vw,2.3rem);line-height:1.35;color:var(--text)}.gw-about-quote blockquote::before{content:"“";display:block;font-size:4rem;line-height:.6;color:var(--primary)}.gw-about-quote .gw-lead{margin-inline:auto}.gw-about-quote .gw-highlights{justify-content:center}` + HIGHLIGHT_CSS,
})

KINDS.menu.variants.compact = (c, ctx) => ({
  html: section(ctx, "gw-menu", `${h2(c)}${filterBox(ctx)}<ul class="gw-compact">${c.items.map(i => `<li class="gw-filter-item"><div><strong>${esc(i.name)}</strong>${i.tag ? ` <span class="gw-tag">${esc(i.tag)}</span>` : ""}${i.description ? `<span class="gw-compact-desc">${esc(i.description)}</span>` : ""}</div>${i.price ? `<span class="gw-price">${esc(i.price)}</span>` : ""}</li>`).join("")}</ul>${c.note ? `<p class="gw-note">${esc(c.note)}</p>` : ""}`),
  css: `.gw-compact{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 48px}.gw-compact li{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.gw-compact-desc{display:block;font-size:.9rem;color:var(--muted);margin-top:2px}` + MENU_CSS,
})

KINDS.pricing.variants.compact = (c, ctx) => ({
  html: section(ctx, "gw-pricing gw-alt", `${h2(c)}<div class="gw-price-rows">${c.plans.map(p => `<article class="gw-price-row${p.highlighted ? " is-hot" : ""}"><div><h3>${esc(p.name)}</h3>${p.features.length ? `<p>${p.features.map(esc).join(" · ")}</p>` : ""}</div><strong class="gw-row-price">${esc(p.price)}<span>${esc(p.period)}</span></strong><a class="gw-btn${p.highlighted ? "" : " gw-btn-ghost"}" href="${esc(ctx.link(ctx.contactId || ctx.id))}">${esc(p.cta)}</a></article>`).join("")}</div>`),
  css: `.gw-price-rows{display:grid;gap:14px}.gw-price-row{display:grid;grid-template-columns:1fr auto auto;gap:24px;align-items:center;padding:22px 26px;border-radius:var(--radius);background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.gw-price-row.is-hot{border:2px solid var(--primary);box-shadow:var(--shadow)}.gw-price-row h3{margin:0 0 4px}.gw-price-row p{margin:0;color:var(--muted);font-size:.92rem}.gw-row-price{font-family:var(--font-heading);font-size:1.8rem;white-space:nowrap}.gw-row-price span{font-size:.9rem;font-weight:500;opacity:.75}@media(max-width:768px){.gw-price-row{grid-template-columns:1fr;gap:12px}}`,
})

KINDS.testimonials.variants.spotlight = (c, ctx) => {
  const [first, ...rest] = c.items
  return {
    html: section(ctx, "gw-testimonials", `<h2 class="gw-h2">${esc(c.heading)}</h2><figure class="gw-spotlight"><blockquote>“${esc(first.quote)}”</blockquote><figcaption><strong>${esc(first.name)}</strong>${first.role ? ` · ${esc(first.role)}` : ""}</figcaption></figure>${rest.length ? `<div class="gw-grid">${rest.map(i => quoteCard(i)).join("")}</div>` : ""}`),
    css: QUOTE_CSS + `.gw-spotlight{margin:0 auto 40px;max-width:820px;text-align:center}.gw-spotlight blockquote{margin:0 0 16px;font-family:var(--font-heading);font-size:clamp(1.4rem,3vw,2.1rem);line-height:1.4}.gw-spotlight figcaption{color:var(--muted)}.gw-spotlight figcaption strong{color:var(--primary)}`,
  }
}

KINDS.gallery.variants.masonry = (c, ctx) => ({
  html: section(ctx, "gw-gallery gw-alt", `${h2(c)}<div class="gw-masonry">${c.items.map((i, n) => `<figure class="gw-tile gw-tile-${n % 4} gw-h-${n % 3}"><span aria-hidden="true">${glyph(i.emoji)}</span><figcaption>${esc(i.caption)}</figcaption></figure>`).join("")}</div>`),
  css: TILE_CSS + `.gw-masonry{columns:3 220px;column-gap:16px}.gw-masonry .gw-tile{break-inside:avoid;margin:0 0 16px}.gw-h-0{height:200px}.gw-h-1{height:290px}.gw-h-2{height:240px}`,
})

KINDS.team.variants.list = (c, ctx) => ({
  html: section(ctx, "gw-team gw-alt", `${h2(c)}<div class="gw-team-list">${c.members.map(m => `<article class="gw-member-row gw-reveal"><div class="gw-avatar-sm" aria-hidden="true">${glyph(m.emoji)}</div><div><h3>${esc(m.name)}</h3>${m.role ? `<p class="gw-role">${esc(m.role)}</p>` : ""}${m.bio ? `<p>${esc(m.bio)}</p>` : ""}</div></article>`).join("")}</div>`),
  css: `.gw-team-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}.gw-member-row{display:flex;gap:16px;align-items:flex-start;padding:20px;border-radius:var(--radius);background:var(--bg)}.gw-avatar-sm{flex-shrink:0;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:30px;background:var(--surface)}.gw-member-row h3{margin:0 0 2px}.gw-member-row p{margin:0;color:var(--muted)}.gw-member-row .gw-role{color:var(--primary);font-weight:700;margin-bottom:6px}`,
})

KINDS.stats.variants.cards = (c, ctx) => ({
  html: section(ctx, "gw-stats-cards", `${c.heading ? `<h2 class="gw-h2">${esc(c.heading)}</h2>` : ""}<div class="gw-grid">${c.items.map(i => `<div class="gw-card gw-stat-card"><strong><span data-count="${esc(i.value)}">${esc(i.value)}</span>${esc(i.suffix)}</strong><span>${esc(i.label)}</span></div>`).join("")}</div>`),
  css: `.gw-stat-card{text-align:center;border-top:4px solid var(--primary)}.gw-stat-card strong{display:block;font-family:var(--font-heading);font-size:clamp(2.2rem,5vw,3rem);color:var(--primary)}.gw-stat-card>span{color:var(--muted)}`,
  scripts: ["counter"],
})

KINDS.faq.variants.columns = (c, ctx) => ({
  html: section(ctx, "gw-faq gw-alt", `<h2 class="gw-h2">${esc(c.heading)}</h2><dl class="gw-faq-cols">${c.items.map(i => `<div class="gw-faq-card"><dt>${esc(i.q)}</dt><dd>${esc(i.a)}</dd></div>`).join("")}</dl>`),
  css: `.gw-faq-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin:0}.gw-faq-card{padding:22px;border-radius:var(--radius);background:var(--bg)}.gw-faq-card dt{font-weight:700;margin-bottom:8px}.gw-faq-card dd{margin:0;color:var(--muted)}`,
})

KINDS.events.variants.cards = (c, ctx) => ({
  html: section(ctx, "gw-events", `${h2(c)}<div class="gw-grid">${c.items.map(i => `<article class="gw-card gw-event-card gw-reveal">${i.date ? `<span class="gw-date-badge">${esc(i.date)}</span>` : ""}<h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ""}</article>`).join("")}</div>`),
  css: `.gw-date-badge{display:inline-block;margin-bottom:12px;padding:5px 12px;border-radius:99px;background:var(--primary);color:var(--on-primary);font-size:.8rem;font-weight:700;letter-spacing:.03em}`,
})

KINDS.contact.variants.card = (c, ctx) => ({
  html: section(ctx, "gw-contact gw-alt", `<div class="gw-contact-card"><div class="gw-narrow">${h2(c)}</div><ul class="gw-contact-info gw-contact-chips">${contactInfo(c)}</ul>${contactForm(c, ctx, "gw-form-center")}</div>`),
  css: CONTACT_CSS + `.gw-narrow{max-width:760px;margin:0 auto;text-align:center}.gw-contact-card{max-width:760px;margin:0 auto}.gw-contact-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:0 0 28px}.gw-contact-chips li{padding:8px 14px;border-radius:99px;background:var(--bg);font-size:.92rem}.gw-form-center{max-width:560px;margin:0 auto}`,
  scripts: ["forms"],
})

KINDS.cta.variants.split = (c, ctx) => c.newsletter ? newsletterRender(c, ctx) : ({
  html: section(ctx, "gw-cta", `<div class="gw-cta-split"><div><h2 class="gw-h2">${esc(c.heading)}</h2><p>${esc(c.text)}</p></div><a class="gw-btn" href="${esc(ctx.link(ctx.contactId || "top"))}">${esc(c.button)}</a></div>`),
  css: `.gw-cta-split{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:40px 44px;border-radius:calc(var(--radius)*1.5);background:var(--surface);border-left:6px solid var(--primary)}.gw-cta-split .gw-h2{margin-bottom:6px}.gw-cta-split p{margin:0;color:var(--muted)}@media(max-width:768px){.gw-cta-split{flex-direction:column;align-items:flex-start;padding:30px 24px}}`,
})

KINDS.footer.variants.minimal = (c, ctx) => ({
  html: `<footer id="${esc(ctx.id)}" class="gw-footer gw-footer-min"><div class="gw-wrap gw-footer-row"><strong>${esc(c.brand)}</strong><nav aria-label="Footer">${ctx.navLinks.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav><small>${esc(c.copyright)}</small></div></footer>`,
  css: FOOTER_CSS + `.gw-footer-min{padding:28px 0}.gw-footer-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px}.gw-footer-row nav{display:flex;flex-wrap:wrap;gap:6px 18px}`,
})

// ── New kinds ─────────────────────────────────────────────────────────────────
KINDS.hours = {
  schema: `{"heading":"e.g. Opening hours","items":[{"day":"e.g. Mon – Fri","time":"e.g. 8 AM – 10 PM or Closed"}] (2-7 rows),"note":"optional, e.g. holiday timings"}`,
  normalize: (c, ctx) => ({
    heading: heading(c, ctx), note: str(c?.note, 160),
    items: fill(list(c?.items, 7).map(i => ({ day: str(i?.day, 30), time: str(i?.time, 40) })).filter(i => i.day && i.time)),
  }),
  variants: {
    table: (c, ctx) => ({
      html: section(ctx, "gw-hours", `<div class="gw-hours-box"><h2 class="gw-h2">${esc(c.heading)}</h2><table class="gw-hours-table"><tbody>${c.items.map(i => `<tr><th scope="row">${esc(i.day)}</th><td>${esc(i.time)}</td></tr>`).join("")}</tbody></table>${c.note ? `<p class="gw-hours-note">${esc(c.note)}</p>` : ""}</div>`),
      css: `.gw-hours-box{max-width:560px;margin:0 auto;text-align:center}.gw-hours-table{width:100%;border-collapse:collapse;text-align:left}.gw-hours-table th,.gw-hours-table td{padding:14px 6px;border-bottom:1px dashed color-mix(in srgb,var(--text) 18%,transparent)}.gw-hours-table th{font-weight:700}.gw-hours-table td{text-align:right;color:var(--muted)}.gw-hours-note{margin:20px 0 0;font-size:.9rem;color:var(--muted)}`,
    }),
    band: (c, ctx) => ({
      html: section(ctx, "gw-hours gw-hours-band", `<h2 class="gw-h2">${esc(c.heading)}</h2><div class="gw-hours-grid">${c.items.map(i => `<div><span>${esc(i.day)}</span><strong>${esc(i.time)}</strong></div>`).join("")}</div>${c.note ? `<p class="gw-hours-note">${esc(c.note)}</p>` : ""}`),
      css: `.gw-hours-band{background:var(--primary);color:var(--on-primary);text-align:center}.gw-hours-band .gw-h2{color:var(--on-primary)}.gw-hours-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:16px}.gw-hours-grid div{min-width:150px;padding:16px 20px;border-radius:var(--radius);background:color-mix(in srgb,var(--on-primary) 12%,transparent)}.gw-hours-grid span{display:block;font-size:.9rem;opacity:.85}.gw-hours-grid strong{font-size:1.1rem}.gw-hours-band .gw-hours-note{margin:20px 0 0;opacity:.85}`,
    }),
  },
}

KINDS.steps = {
  schema: `{"heading":"e.g. How it works","intro":"one sentence","items":[{"title":"2-4 words","text":"one sentence"}] (3-5 steps, in order)}`,
  normalize: (c, ctx) => ({
    heading: heading(c, ctx), intro: intro(c, ctx),
    items: fill(list(c?.items, 6).map(i => ({ title: str(i?.title, 60), text: str(i?.text, 220) })).filter(i => i.title)),
  }),
  variants: {
    row: (c, ctx) => ({
      html: section(ctx, "gw-steps", `${h2(c)}<ol class="gw-steps-row">${c.items.map((i, n) => `<li class="gw-reveal"><span class="gw-step-dot" aria-hidden="true">${n + 1}</span><h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ""}</li>`).join("")}</ol>`),
      css: `.gw-steps-row{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px}.gw-steps-row li{text-align:center}.gw-steps-row .gw-step-dot{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;font-family:var(--font-heading);font-weight:800;font-size:1.3rem;background:var(--primary);color:var(--on-primary);box-shadow:0 0 0 8px color-mix(in srgb,var(--primary) 16%,transparent)}.gw-steps-row p{color:var(--muted);margin:0}`,
    }),
    stack: (c, ctx) => ({
      html: section(ctx, "gw-steps gw-alt", `<div class="gw-steps-narrow">${h2(c)}<ol class="gw-steps-stack">${c.items.map((i, n) => `<li class="gw-reveal"><span class="gw-step-num" aria-hidden="true">${pad2(n + 1)}</span><div><h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ""}</div></li>`).join("")}</ol></div>`),
      css: `.gw-steps-narrow{max-width:800px;margin:0 auto}.gw-steps-stack{list-style:none;margin:0;padding:0;display:grid;gap:14px}.gw-steps-stack li{display:flex;gap:18px;align-items:flex-start;padding:20px 22px;border-radius:var(--radius);background:var(--bg)}.gw-step-num{flex-shrink:0;font-family:var(--font-heading);font-weight:800;font-size:1.5rem;color:var(--primary)}.gw-steps-stack h3{margin:0 0 4px}.gw-steps-stack p{margin:0;color:var(--muted)}`,
    }),
  },
}

KINDS.highlight = {
  schema: `{"heading":"…","text":"2-3 sentences","points":["3-4 short points"],"button":"button text or empty","icon":"icon name"}`,
  normalize: (c, ctx) => ({
    heading: heading(c, ctx), text: str(c?.text, 500, ctx.purpose), emoji: glyphValue(c?.icon ?? c?.emoji, "star"), button: str(c?.button, 28),
    points: (Array.isArray(c?.points) ? c.points : []).map(p => str(p, 120)).filter(Boolean).slice(0, 5),
  }),
  variants: {
    left: (c, ctx) => highlightRender(c, ctx, false),
    right: (c, ctx) => highlightRender(c, ctx, true),
  },
}
function highlightRender(c, ctx, flip) {
  return {
    html: section(ctx, "gw-highlight", `<div class="gw-hl${flip ? " gw-hl-flip" : ""}">${artBlock(c.emoji, ctx.site.brand.length + 2, "gw-hl-art")}<div><h2 class="gw-h2">${esc(c.heading)}</h2>${c.text ? `<p class="gw-lead">${esc(c.text)}</p>` : ""}${c.points.length ? `<ul class="gw-hl-points">${c.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}${c.button ? `<a class="gw-btn" href="${esc(ctx.link(ctx.contactId || "top"))}">${esc(c.button)}</a>` : ""}</div></div>`),
    css: `.gw-hl{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:center}.gw-hl-flip .gw-hl-art{order:2}.gw-hl-art{aspect-ratio:1;border-radius:calc(var(--radius)*2);background:var(--surface)}.gw-hl .gw-lead{margin-bottom:20px}.gw-hl-points{list-style:none;padding:0;margin:0 0 26px;display:grid;gap:10px}.gw-hl-points li{padding-left:32px;position:relative}.gw-hl-points li::before{content:"✓";position:absolute;left:0;top:2px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:.75rem;font-weight:800;background:var(--primary);color:var(--on-primary)}@media(max-width:768px){.gw-hl{grid-template-columns:1fr}.gw-hl-flip .gw-hl-art{order:0}.gw-hl-art{max-width:260px;margin:0 auto}}`,
  }
}

LIST_KEY.hours = "items"
LIST_KEY.steps = "items"
Object.assign(KIND_UI, {
  hours:     { label: "Opening hours", fields: [t("heading", "Heading", 90), items("items", "Rows", 7, [t("day", "Day(s)", 30), t("time", "Time", 40)]), t("note", "Note", 160)] },
  steps:     { label: "Steps / how it works", fields: [t("heading", "Heading", 90), ta("intro", "Intro", 260), items("items", "Steps", 6, [t("title", "Title", 60), ta("text", "Text", 220)])] },
  highlight: { label: "Highlight", fields: [t("heading", "Heading", 90), ta("text", "Text", 500), { key: "points", label: "Points", type: "strings", maxItems: 5, max: 120 }, t("button", "Button (optional)", 28), em("emoji")] },
})
