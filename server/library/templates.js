// Starter templates and deterministic matching (no AI): which template fits a
// request, which library kind renders each planned section, and which design
// preset fits the mood. Matching uses several signals, not the category name
// alone (blueprint §4.3).
import { KINDS } from "./sections.js"
import { PRESETS } from "./presets.js"

// sections: [kind, preferred variant or null (= random among the kind's
// variants, for variety between sites)]. More specific templates come before
// the generic "service" one: on equal scores the earlier template wins.
export const TEMPLATES = [
  {
    id: "restaurant", label: "Restaurant / café",
    tags: ["restaurant", "cafe", "café", "bakery", "food", "dining", "bistro", "kitchen", "dhaba", "chai", "coffee", "tea", "pizza", "bar", "catering", "sweets", "dessert", "menu", "chef", "cuisine", "biryani", "thali", "cloud kitchen"],
    sections: [["nav", "bar"], ["hero", null], ["about", null], ["menu", null], ["highlight", null], ["testimonials", null], ["gallery", null], ["hours", null], ["contact", null], ["footer", null]],
    preset: "warm-bakery", booking: "table",
  },
  {
    id: "salon", label: "Salon / spa / beauty",
    tags: ["salon", "spa", "beauty", "parlour", "parlor", "makeup", "bridal", "nails", "nail art", "hair", "skincare", "barber", "grooming", "mehndi", "facial"],
    sections: [["nav", "bar"], ["hero", null], ["about", null], ["menu", null], ["highlight", null], ["gallery", null], ["team", null], ["testimonials", null], ["hours", null], ["contact", null], ["footer", null]],
    preset: "rose-blush", booking: "appointment",
  },
  {
    id: "fitness", label: "Gym / fitness / yoga / dance",
    tags: ["gym", "fitness", "yoga", "crossfit", "trainer", "workout", "pilates", "martial arts", "karate", "dance", "zumba", "boxing", "sports academy", "athlete"],
    sections: [["nav", "bar"], ["hero", null], ["features", null], ["steps", null], ["stats", null], ["pricing", null], ["team", null], ["testimonials", null], ["hours", null], ["contact", null], ["footer", null]],
    preset: "slate-pro", booking: "appointment",
  },
  {
    id: "education", label: "Coaching / school / courses",
    tags: ["school", "coaching", "tuition", "academy", "course", "courses", "classes", "institute", "tutor", "training", "learning", "ielts", "jee", "neet", "upsc", "kindergarten", "preschool", "university"],
    sections: [["nav", "bar"], ["hero", null], ["menu", null], ["events", null], ["team", null], ["stats", null], ["testimonials", null], ["faq", "accordion"], ["contact", null], ["footer", null]],
    preset: "ocean-calm",
  },
  {
    id: "realestate", label: "Real estate / property",
    tags: ["real estate", "property", "properties", "flats", "apartments", "villa", "plots", "builder", "realtor", "homes", "rent", "broker", "interior", "architect"],
    sections: [["nav", "bar"], ["hero", null], ["menu", null], ["highlight", null], ["features", null], ["stats", null], ["testimonials", null], ["contact", null], ["footer", null]],
    preset: "corporate-blue", booking: "appointment",
  },
  {
    id: "nonprofit", label: "NGO / charity / community",
    tags: ["ngo", "nonprofit", "non-profit", "charity", "foundation", "trust", "volunteer", "donate", "donation", "cause", "welfare", "community", "animal rescue"],
    sections: [["nav", "bar"], ["hero", null], ["about", null], ["stats", null], ["steps", null], ["events", null], ["team", null], ["cta", null], ["contact", null], ["footer", null]],
    preset: "fresh-green",
  },
  {
    id: "business", label: "Business / agency / services",
    tags: ["business", "company", "agency", "consulting", "consultant", "services", "firm", "studio", "marketing", "law", "lawyer", "finance", "accounting", "construction", "startup", "b2b", "solutions", "ca firm"],
    sections: [["nav", "bar"], ["hero", null], ["features", null], ["steps", null], ["about", null], ["stats", null], ["testimonials", null], ["cta", null], ["contact", null], ["footer", null]],
    preset: "corporate-blue",
  },
  {
    id: "studio", label: "Wellness / local studio / practice",
    tags: ["wellness studio", "wellness", "therapy", "therapist", "physio", "physiotherapy", "practice", "appointment", "consulting studio", "creative studio", "pilates studio", "mindfulness", "nutrition", "counselling", "counseling"],
    sections: [["nav", "bar"], ["hero", "split"], ["features", "numbered"], ["highlight", "left"], ["steps", "row"], ["testimonials", "spotlight"], ["faq", "accordion"], ["hours", "table"], ["contact", "card"], ["footer", "minimal"]],
    preset: "studio-sage", booking: "appointment",
  },
  {
    id: "portfolio", label: "Portfolio / personal",
    tags: ["portfolio", "personal", "resume", "cv", "freelancer", "designer", "developer", "photographer", "artist", "writer", "my work", "projects", "myself"],
    sections: [["nav", "center"], ["hero", null], ["about", null], ["gallery", null], ["events", null], ["testimonials", null], ["contact", null], ["footer", null]],
    preset: "minimal-mono",
  },
  {
    id: "saas", label: "SaaS / app / product",
    tags: ["saas", "app", "software", "platform", "tool", "product", "ai", "dashboard", "api", "subscription", "tech", "launch", "beta", "users"],
    sections: [["nav", "bar"], ["hero", null], ["features", null], ["steps", null], ["stats", null], ["pricing", null], ["testimonials", null], ["faq", "accordion"], ["cta", null], ["footer", null]],
    preset: "midnight-tech",
  },
  {
    id: "shop", label: "Shop / products",
    tags: ["shop", "store", "ecommerce", "e-commerce", "boutique", "products", "buy", "sell", "jewellery", "jewelry", "clothing", "fashion", "handmade", "crafts", "online store", "catalog", "collection"],
    sections: [["nav", "bar"], ["hero", null], ["menu", null], ["highlight", null], ["features", null], ["testimonials", null], ["faq", "accordion"], ["contact", null], ["footer", null]],
    preset: "citrus-fresh", filter: true,
  },
  {
    id: "event", label: "Event / conference / wedding",
    tags: ["event", "conference", "festival", "concert", "wedding", "meetup", "summit", "workshop", "party", "fest", "tickets", "speakers", "schedule"],
    sections: [["nav", "bar"], ["hero", null], ["about", null], ["events", null], ["team", null], ["pricing", null], ["faq", "accordion"], ["contact", null], ["footer", null]],
    preset: "sunset-bold",
  },
  {
    id: "service", label: "Clinic / local service",
    tags: ["clinic", "doctor", "dental", "dentist", "hospital", "physio", "repair", "plumber", "electrician", "travel", "hotel", "homestay", "laundry", "cleaning", "pest control", "pet", "vet", "car service", "tailor"],
    sections: [["nav", "bar"], ["hero", null], ["features", null], ["about", null], ["steps", null], ["team", null], ["testimonials", null], ["hours", null], ["faq", "accordion"], ["contact", null], ["footer", null]],
    preset: "ocean-calm", booking: "appointment",
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
  ["highlight",    /^(highlight|spotlight|featured)(-|$)|\bspotlight\b|featured (project|product|dish|item|property)|chef'?s special|signature (dish|service)/],
  ["team",         /\bteam\b|\bstaff\b|our people|\bchefs?\b|instructors?|doctors?|founders?|speakers?|trainers?|teachers?|artists? lineup/],
  ["stats",        /\bstats?\b|statistics|numbers|achievements|impact|metrics|milestones/],
  ["gallery",      /gallery|photos?|portfolio|our work|\bprojects?\b|showcase|lookbook/],
  ["hours",        /opening hours|\bhours\b|timings|open(ing)? times|business hours/],
  ["contact",      /contact|booking|\bbook\b|reserv|appointment|enquir|inquir|get in touch|location|visit us|find us|order form/],
  ["cta",          /\bcta\b|call to action|newsletter|subscribe|join us|sign ?up|download|get involved/],
  ["steps",        /how it works|process|\bsteps\b|getting started|our approach|how to (join|order|book|help|start)|how you can help/],
  ["events",       /events?|schedule|timeline|program(me)?s?\b|agenda|live music|itinerary|history|journey|experience|classes|batches/],
  ["menu",         /\bmenu\b|dishes|\bfood\b|drinks|beverages|products?|\bshop\b|catalog(ue)?|collection|\bstore\b|\bitems\b|treatments|rooms|courses?|listings?|price list|rate card/],
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
  planKinds = Array.isArray(planKinds) ? planKinds : []
  const t = words(text)
  return TEMPLATES.map(tpl => {
    const category = Math.min(1, countTags(t, tpl.tags) / 2)
    const kinds = new Set(tpl.sections.map(([k]) => k))
    const coverage = planKinds.length ? planKinds.filter(k => kinds.has(k)).length / planKinds.length : 0
    // The kind of business matters most; coverage of the planned sections breaks ties.
    const score = planKinds.length ? 0.75 * category + 0.25 * coverage : category
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
