// Starter templates and deterministic matching (no AI): which template fits a
// request, which library kind renders each planned section, and which design
// preset fits the mood. Matching uses several signals, not the category name
// alone (blueprint §4.3).
import { KINDS } from "./sections.js"
import { PRESETS } from "./presets.js"

// sections: [kind, preferred variant or null (= random among the kind's variants)]
export const TEMPLATES = [
  {
    id: "restaurant", label: "Restaurant / café",
    tags: ["restaurant", "cafe", "café", "bakery", "food", "dining", "bistro", "kitchen", "dhaba", "chai", "coffee", "tea", "pizza", "bar", "catering", "sweets", "dessert", "menu", "chef", "cuisine"],
    sections: [["nav", "bar"], ["hero", null], ["about", "split"], ["menu", null], ["testimonials", null], ["gallery", "grid"], ["contact", "split"], ["footer", "columns"]],
    preset: "warm-bakery", booking: true,
  },
  {
    id: "business", label: "Business / agency / services",
    tags: ["business", "company", "agency", "consulting", "consultant", "services", "firm", "studio", "marketing", "law", "lawyer", "finance", "accounting", "construction", "real estate", "startup", "b2b", "solutions"],
    sections: [["nav", "bar"], ["hero", null], ["features", null], ["about", null], ["stats", "band"], ["testimonials", null], ["cta", "banner"], ["contact", null], ["footer", null]],
    preset: "corporate-blue",
  },
  {
    id: "portfolio", label: "Portfolio / personal",
    tags: ["portfolio", "personal", "resume", "cv", "freelancer", "designer", "developer", "photographer", "artist", "writer", "my work", "projects", "myself"],
    sections: [["nav", "center"], ["hero", "bold"], ["about", "split"], ["gallery", "grid"], ["events", "timeline"], ["testimonials", null], ["contact", "stacked"], ["footer", "simple"]],
    preset: "minimal-mono",
  },
  {
    id: "saas", label: "SaaS / app / product",
    tags: ["saas", "app", "software", "platform", "tool", "product", "ai", "dashboard", "api", "subscription", "tech", "launch", "beta", "users"],
    sections: [["nav", "bar"], ["hero", "centered"], ["features", "cards"], ["stats", "band"], ["pricing", "cards"], ["testimonials", null], ["faq", "accordion"], ["cta", null], ["footer", null]],
    preset: "midnight-tech",
  },
  {
    id: "shop", label: "Shop / products",
    tags: ["shop", "store", "ecommerce", "e-commerce", "boutique", "products", "buy", "sell", "jewellery", "jewelry", "clothing", "fashion", "handmade", "crafts", "online store", "catalog", "collection"],
    sections: [["nav", "bar"], ["hero", "split"], ["menu", "cards"], ["features", "list"], ["testimonials", null], ["faq", "accordion"], ["contact", null], ["footer", "columns"]],
    preset: "sunset-bold", filter: true,
  },
  {
    id: "event", label: "Event / conference / wedding",
    tags: ["event", "conference", "festival", "concert", "wedding", "meetup", "summit", "workshop", "party", "fest", "tickets", "speakers", "schedule"],
    sections: [["nav", "bar"], ["hero", "bold"], ["about", "centered"], ["events", "timeline"], ["team", "grid"], ["pricing", "cards"], ["faq", "accordion"], ["contact", null], ["footer", "simple"]],
    preset: "sunset-bold",
  },
  {
    id: "service", label: "Clinic / school / gym / local service",
    tags: ["clinic", "doctor", "dental", "hospital", "school", "coaching", "tuition", "academy", "course", "gym", "fitness", "yoga", "salon", "spa", "repair", "plumber", "travel", "hotel", "homestay", "ngo"],
    sections: [["nav", "bar"], ["hero", "split"], ["features", null], ["about", null], ["team", "grid"], ["testimonials", null], ["faq", "accordion"], ["contact", null], ["footer", "columns"]],
    preset: "ocean-calm", booking: true,
  },
]

// Which library kind renders a planned section (by its id, name and purpose).
// Order matters: specific kinds before broad ones ("menu bar" is navigation,
// "live music schedule" is events, not menu).
const KIND_RULES = [
  ["nav",          /^(nav|navbar|navigation|header|top-?bar)$|\bnav(igation|bar)?\b|menu bar/],
  ["footer",       /\bfooter\b|copyright/],
  ["hero",         /\bhero\b|\bbanner\b|\bwelcome\b|landing|above the fold|^home$/],
  ["faq",          /\bfaqs?\b|questions/],
  ["pricing",      /pricing|\bprices\b|\bplans?\b|packages?|membership|\btickets?\b|\brates\b|tariff/],
  ["testimonials", /testimonials?|reviews?|clients say|feedback|what (our|people) say/],
  ["team",         /\bteam\b|\bstaff\b|our people|\bchefs?\b|instructors?|doctors?|founders?|speakers?|trainers?|teachers?|artists? lineup/],
  ["stats",        /\bstats?\b|statistics|numbers|achievements|impact|metrics|milestones/],
  ["gallery",      /gallery|photos?|portfolio|our work|\bprojects?\b|showcase|lookbook/],
  ["contact",      /contact|booking|\bbook\b|reserv|appointment|enquir|inquir|get in touch|location|visit us|find us|order form/],
  ["cta",          /\bcta\b|call to action|newsletter|subscribe|join us|sign ?up|download/],
  ["events",       /events?|schedule|timeline|program(me)?|agenda|live music|itinerary|history|journey|experience|process|how it works|steps|classes|courses?|batches/],
  ["menu",         /\bmenu\b|dishes|\bfood\b|drinks|beverages|products?|\bshop\b|catalog(ue)?|collection|\bstore\b|\bitems\b|treatments|rooms/],
  ["about",        /about|our story|\bstory\b|who we are|mission|vision|values|philosophy/],
  ["features",     /features?|services?|benefits|why (us|choose)|what we (do|offer)|offerings?|solutions|amenities|specialit|facilities|highlights/],
]

export function mapKind(section) {
  const id = String(section.id || "").toLowerCase()
  const text = `${id} ${section.name || ""} ${section.purpose || ""}`.toLowerCase()
  // The id and name decide first; the purpose is only a fallback signal.
  const primary = `${id} ${section.name || ""}`.toLowerCase()
  for (const src of [primary, text]) {
    for (const [kind, re] of KIND_RULES) if (re.test(src)) return kind
  }
  return "content"
}

const words = (text) => String(text || "").toLowerCase()
const countTags = (text, tags) => tags.reduce((n, t) => n + (new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text) ? 1 : 0), 0)

// Scores every template against the request (and plan, when there is one).
// Returns [{ template, score }] best first. Score components (0–1 each):
// category tags, coverage of planned section kinds, and feature fit.
export function rankTemplates(text, planKinds = []) {
  const t = words(text)
  return TEMPLATES.map(tpl => {
    const category = Math.min(1, countTags(t, tpl.tags) / 2)
    const kinds = new Set(tpl.sections.map(([k]) => k))
    const coverage = planKinds.length ? planKinds.filter(k => kinds.has(k)).length / planKinds.length : 0
    const score = planKinds.length ? 0.6 * category + 0.4 * coverage : category
    return { template: tpl, score: Math.round(score * 100) / 100 }
  }).sort((a, b) => b.score - a.score)
}

// Picks a preset by mood/category words; ties broken by the template default,
// then randomly (variety between generations).
export function choosePreset(text, template, rand = Math.random) {
  const t = words(text)
  const wantsDark = /\bdark\b|night|neon|glass/.test(t)
  const wantsLight = /\blight\b|white|bright|minimal/.test(t)
  const scored = PRESETS.map(p => {
    let s = countTags(t, p.tags)
    if (p.id === template?.preset) s += 1.5
    if (wantsDark && p.dark) s += 2
    if (wantsLight && !p.dark) s += 1
    if (wantsDark && !p.dark) s -= 1
    return { p, s: s + rand() * 0.9 }
  }).sort((a, b) => b.s - a.s)
  return scored[0].p
}

export const variantsOf = (kind) => Object.keys(KINDS[kind].variants)
