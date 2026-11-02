// Builds the example sites shown on the landing page from the real template
// library (no AI, no database): node scripts/build-examples.js
// Writes ../client/public/examples/<id>.html. Content is hand-written sample
// text for fictional businesses; re-run after changing the library.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildBlueprint, assembleSite } from "../library/assemble.js"
import { validateDocument } from "../ai/validate.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "../../client/public/examples")

// Deterministic choices, so the examples only change when the library does.
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

export const EXAMPLES = [
  {
    id: "salon", seed: 23, label: "Salon & spa",
    request: "Glow Studio – unisex salon in Sector 18 Noida with haircuts, colour, facials, bridal makeup and online appointments",
    content: { title: "Glow Studio — Unisex Salon, Noida", brand: "Glow Studio", tagline: "Hair, skin and bridal makeup in Sector 18.", sections: {
      hero: { eyebrow: "Sector 18, Noida", heading: "Look good. Feel better.", subheading: "Expert stylists, premium products and a calm space to unwind.", primaryCta: "Book an appointment", secondaryCta: "See prices", icon: "scissors" },
      about: { heading: "Ten years of happy clients", paragraphs: ["Glow Studio began as a two-chair salon and is now a favourite neighbourhood studio.", "We use only dermatologist-tested products."], highlights: [{ value: "10+", label: "years" }, { value: "12", label: "stylists" }], icon: "sparkles" },
      menu: { heading: "Services & prices", intro: "Transparent prices, no surprises.", items: [{ name: "Haircut & style", description: "Wash, cut and blow-dry", price: "₹699" }, { name: "Global hair colour", description: "Ammonia-free", price: "₹2,499", tag: "Popular" }, { name: "Hydra facial", description: "60 minutes", price: "₹1,999" }, { name: "Keratin smooth", description: "Lasts up to 4 months", price: "₹4,999" }, { name: "Manicure & pedicure", description: "With paraffin", price: "₹1,299" }, { name: "Bridal makeup", description: "HD, with trial", price: "₹14,999" }] },
      highlight: { heading: "Signature: Keratin Smooth", text: "Frizz-free, glossy hair for up to four months with our formaldehyde-free treatment.", points: ["Formaldehyde-free", "Done in 2 hours", "Lasts up to 4 months"], button: "Book this treatment", icon: "drop" },
      gallery: { heading: "Our work", items: [{ icon: "scissors", caption: "Balayage" }, { icon: "sparkles", caption: "Nail art" }, { icon: "heart", caption: "Bridal" }, { icon: "leaf", caption: "Spa day" }, { icon: "star", caption: "Party look" }, { icon: "smile", caption: "Kids' cuts" }] },
      team: { heading: "Meet our stylists", members: [{ name: "Neha", role: "Creative director", bio: "Colour specialist.", icon: "user" }, { name: "Imran", role: "Senior stylist", bio: "Cuts and beard design.", icon: "scissors" }, { name: "Pooja", role: "Skin expert", bio: "Facials and peels.", icon: "drop" }] },
      testimonials: { heading: "Loved by Noida", items: [{ quote: "Best hair colour I've had — and it lasted.", name: "Sakshi", role: "Client" }, { quote: "My bridal look was exactly what I imagined.", name: "Ritika", role: "Bride" }, { quote: "Calm, clean and always on time.", name: "Aman", role: "Regular" }] },
      hours: { heading: "Opening hours", items: [{ day: "Mon – Fri", time: "10 AM – 8 PM" }, { day: "Sat – Sun", time: "9 AM – 9 PM" }] },
      contact: { heading: "Book an appointment", intro: "We confirm on WhatsApp within the hour.", hours: "10 AM – 8 PM" },
      footer: { tagline: "Hair, skin and bridal makeup in Sector 18." },
    } },
  },
  {
    id: "cafe", seed: 11, label: "Restaurant & café",
    request: "Chai Corner – cosy café in Raj Nagar Extension Ghaziabad with masala chai, snacks, weekend live music and table booking",
    content: { title: "Chai Corner Café", brand: "Chai Corner", tagline: "Masala chai and warm snacks since 2019.", sections: {
      hero: { eyebrow: "Raj Nagar Extension, Ghaziabad", heading: "Your daily cup of happiness", subheading: "Slow-brewed masala chai, crispy samosas and live music every weekend.", primaryCta: "See the menu", secondaryCta: "Book a table", icon: "coffee" },
      about: { heading: "Brewed with love since 2019", paragraphs: ["A tiny tea stall that became the neighbourhood's favourite corner.", "Spices ground fresh every morning."], highlights: [{ value: "5+", label: "years" }, { value: "40k", label: "cups a year" }], icon: "coffee" },
      menu: { heading: "Made fresh every day", items: [{ name: "Masala chai", description: "Assam tea, ginger, cardamom", price: "₹40", tag: "Bestseller" }, { name: "Kulhad chai", description: "Served in clay", price: "₹50" }, { name: "Filter coffee", description: "South Indian decoction", price: "₹60" }, { name: "Aloo samosa", description: "With mint chutney", price: "₹25" }, { name: "Bun maska", description: "Soft bun, lots of butter", price: "₹45" }, { name: "Paneer sandwich", description: "Grilled, spicy", price: "₹90" }] },
      highlight: { heading: "Chef's special: Saffron chai", text: "Kashmiri saffron, slow-simmered milk and a hint of cardamom.", points: ["Real saffron", "Winter favourite"], button: "Order at the counter", icon: "star" },
      testimonials: { heading: "What our regulars say", items: [{ quote: "The best kulhad chai in town.", name: "Riya", role: "Regular" }, { quote: "Saturday music here is my weekly reset.", name: "Arjun", role: "Music lover" }, { quote: "Friendly staff, samosas always hot.", name: "Meera", role: "Office neighbour" }] },
      gallery: { heading: "Moments at the Corner", items: [{ icon: "coffee", caption: "Morning brew" }, { icon: "music", caption: "Saturday sets" }, { icon: "plate", caption: "Fresh snacks" }, { icon: "sun", caption: "Winter mornings" }, { icon: "users", caption: "Friends' table" }, { icon: "book", caption: "Reading corner" }] },
      hours: { heading: "Opening hours", items: [{ day: "Every day", time: "8 AM – 10 PM" }] },
      contact: { heading: "Book a table", intro: "Weekend evenings fill up fast." },
      footer: { tagline: "Masala chai and warm snacks." },
    } },
  },
  {
    id: "gym", seed: 7, label: "Gym & fitness",
    request: "IronHouse gym in Indirapuram with strength training, trainers, monthly memberships and free trial booking",
    content: { title: "IronHouse Gym — Indirapuram", brand: "IronHouse", tagline: "Strength, conditioning and coaching.", sections: {
      hero: { eyebrow: "Indirapuram, Ghaziabad", heading: "Train hard. Recover smart.", subheading: "Coached strength programs, modern equipment and a community that shows up.", primaryCta: "Start free trial", secondaryCta: "See memberships", icon: "dumbbell" },
      features: { heading: "Programs", items: [{ icon: "dumbbell", title: "Strength", text: "Barbell basics to advanced lifting." }, { icon: "bolt", title: "HIIT", text: "45-minute fat-burn sessions." }, { icon: "leaf", title: "Mobility", text: "Recover and move better." }] },
      steps: { heading: "Get started", items: [{ title: "Book a trial", text: "Pick a free slot online." }, { title: "Meet your coach", text: "Assessment and goals." }, { title: "Start training", text: "A plan built for you." }] },
      stats: { heading: "Results", items: [{ value: 18, suffix: "", label: "coaches" }, { value: 24, suffix: "/7", label: "access" }, { value: 6, suffix: "", label: "class types" }] },
      pricing: { heading: "Memberships", plans: [{ name: "Monthly", price: "₹2,499", period: "/month", features: ["Gym floor", "1 coach session"], cta: "Join" }, { name: "Quarterly", price: "₹6,499", period: "/3 months", features: ["All classes", "Diet plan"], cta: "Join", highlighted: true }, { name: "Annual", price: "₹21,999", period: "/year", features: ["Everything", "Locker"], cta: "Join" }] },
      team: { heading: "Trainers", members: [{ name: "Vikram", role: "Head coach", bio: "Powerlifting.", icon: "dumbbell" }, { name: "Pooja", role: "HIIT & mobility", bio: "Certified yoga trainer.", icon: "user" }] },
      testimonials: { heading: "Member stories", items: [{ quote: "Real coaching, real progress.", name: "Rahul", role: "Member" }, { quote: "Never crowded at 6 AM.", name: "Anjali", role: "Member" }, { quote: "Trainers actually check your form.", name: "Kunal", role: "Member" }] },
      hours: { heading: "Timings", items: [{ day: "Mon – Sat", time: "5 AM – 11 PM" }, { day: "Sunday", time: "7 AM – 1 PM" }] },
      contact: { heading: "Book your free trial" },
      footer: { tagline: "Strength, conditioning and coaching." },
    } },
  },
  {
    id: "portfolio", seed: 5, label: "Portfolio",
    request: "Portfolio of Ananya, a freelance UI designer, with selected work, experience and a contact form",
    content: { title: "Ananya — UI Designer", brand: "Ananya", tagline: "Calm, clear products for startups.", sections: {
      hero: { eyebrow: "Freelance UI/UX designer", heading: "Interfaces people enjoy using", subheading: "I design calm, clear products for startups in fintech and health.", primaryCta: "See my work", secondaryCta: "Hire me", icon: "sparkles" },
      about: { heading: "Hi, I'm Ananya", paragraphs: ["Six years designing apps used by millions.", "Good design is mostly about removing things."], highlights: [{ value: "6", label: "years" }, { value: "40+", label: "products" }], icon: "user" },
      gallery: { heading: "Selected work", items: [{ icon: "lock", caption: "Wallet app" }, { icon: "heart", caption: "Health tracker" }, { icon: "book", caption: "Reading app" }, { icon: "tag", caption: "Shop POS" }, { icon: "leaf", caption: "Meditation" }, { icon: "globe", caption: "Travel planner" }] },
      events: { heading: "Experience", items: [{ date: "2023 – now", title: "Freelance designer", text: "Product design for 12 startups." }, { date: "2020 – 2023", title: "Senior designer", text: "Led a fintech redesign." }, { date: "2018 – 2020", title: "Designer", text: "Web and mobile projects." }] },
      testimonials: { heading: "Kind words", items: [{ quote: "Turned a messy flow into something users love.", name: "Karan", role: "Founder" }, { quote: "Fast, thoughtful and easy to work with.", name: "Leah", role: "Product manager" }, { quote: "Our sign-ups doubled after the redesign.", name: "Dev", role: "CEO" }] },
      contact: { heading: "Let's work together", intro: "Available for new projects." },
      footer: { tagline: "Calm, clear products for startups." },
    } },
  },
]

export function buildExample(ex) {
  const blueprint = buildBlueprint({ text: ex.request, rand: seeded(ex.seed) })
  const site = assembleSite(blueprint, ex.content, { requestText: ex.request })
  const v = validateDocument(site.html)
  if (!v.valid) throw new Error(`${ex.id}: ${v.reasons}`)
  return { html: site.html, template: blueprint.template, preset: blueprint.preset.id, dropped: site.dropped }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(outDir, { recursive: true })
  for (const ex of EXAMPLES) {
    const r = buildExample(ex)
    fs.writeFileSync(path.join(outDir, `${ex.id}.html`), r.html)
    console.log(`${ex.id}.html  template=${r.template} theme=${r.preset} ${(r.html.length / 1024).toFixed(1)}KB${r.dropped.length ? ` dropped=${r.dropped}` : ""}`)
  }
}
