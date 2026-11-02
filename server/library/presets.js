// Design presets: complete, contrast-checked token sets. The hybrid engine
// picks one that fits the request's mood/category and may tint it with the
// plan's colours (see assemble.js applyPlanStyle). Original work.

export const PRESETS = [
  {
    id: "warm-bakery", tags: ["warm", "cosy", "rustic", "food", "cafe", "bakery", "restaurant", "earthy", "hand-made", "organic"],
    colors: { primary: "#8a4b1f", secondary: "#c98c4e", accent: "#2f5d50", bg: "#fffaf2", surface: "#f6e7cf", text: "#2b1a0e", muted: "#6e5a48" },
    fonts: { heading: "Playfair Display", body: "Nunito" }, radius: "14px", shadow: "0 6px 24px rgba(138,75,31,0.10)", dark: false,
  },
  {
    id: "fresh-green", tags: ["fresh", "green", "nature", "health", "wellness", "eco", "organic", "garden", "yoga", "calm"],
    colors: { primary: "#2e7d4f", secondary: "#8fc1a0", accent: "#e0a526", bg: "#f6fbf7", surface: "#e3f1e7", text: "#14301f", muted: "#4f6b5a" },
    fonts: { heading: "Merriweather", body: "Source Sans 3" }, radius: "16px", shadow: "0 6px 22px rgba(46,125,79,0.10)", dark: false,
  },
  {
    id: "corporate-blue", tags: ["professional", "corporate", "business", "trust", "finance", "consulting", "law", "agency", "clean"],
    colors: { primary: "#1f4e9c", secondary: "#5b8def", accent: "#f2a33a", bg: "#f7f9fc", surface: "#e8eef8", text: "#14213d", muted: "#55627a" },
    fonts: { heading: "Montserrat", body: "Open Sans" }, radius: "10px", shadow: "0 8px 26px rgba(20,33,61,0.10)", dark: false,
  },
  {
    id: "midnight-tech", tags: ["dark", "tech", "saas", "startup", "modern", "software", "ai", "app", "futuristic", "gaming"],
    colors: { primary: "#7c8cff", secondary: "#38bdf8", accent: "#f472b6", bg: "#0b0d17", surface: "#161a2e", text: "#eef0ff", muted: "#a3a9c9" },
    fonts: { heading: "Space Grotesk", body: "Inter" }, radius: "14px", shadow: "0 10px 30px rgba(0,0,0,0.45)", dark: true,
  },
  {
    id: "minimal-mono", tags: ["minimal", "clean", "portfolio", "designer", "photography", "architecture", "simple", "elegant", "white"],
    colors: { primary: "#111111", secondary: "#555555", accent: "#d9480f", bg: "#ffffff", surface: "#f2f2f2", text: "#111111", muted: "#5c5c5c" },
    fonts: { heading: "DM Serif Display", body: "DM Sans" }, radius: "4px", shadow: "0 2px 12px rgba(0,0,0,0.06)", dark: false,
  },
  {
    id: "sunset-bold", tags: ["bold", "vibrant", "colorful", "colourful", "fun", "playful", "kids", "creative", "event", "music", "festival"],
    colors: { primary: "#c2304f", secondary: "#ff9f43", accent: "#3d348b", bg: "#fff7f2", surface: "#ffe6d9", text: "#2a1320", muted: "#6d4c5a" },
    fonts: { heading: "Poppins", body: "Nunito" }, radius: "18px", shadow: "0 10px 28px rgba(194,48,79,0.14)", dark: false,
  },
  {
    id: "luxury-gold", tags: ["luxury", "premium", "elegant", "jewellery", "jewelry", "fashion", "hotel", "spa", "wedding", "salon", "beauty"],
    colors: { primary: "#b8893b", secondary: "#e2c98f", accent: "#7a2e3a", bg: "#14110f", surface: "#221d19", text: "#f7efe2", muted: "#c2b4a0" },
    fonts: { heading: "Cormorant Garamond", body: "Lato" }, radius: "2px", shadow: "0 10px 30px rgba(0,0,0,0.5)", dark: true,
  },
  {
    id: "espresso-night", tags: ["dark", "food", "cafe", "café", "coffee", "restaurant", "bar", "bistro", "chai", "bakery", "warm", "cosy", "night"],
    colors: { primary: "#e0a96d", secondary: "#a0522d", accent: "#7fb39b", bg: "#1a1410", surface: "#261d17", text: "#f6ece1", muted: "#c9b8a6" },
    fonts: { heading: "Playfair Display", body: "Nunito" }, radius: "14px", shadow: "0 10px 30px rgba(0,0,0,0.45)", dark: true,
  },
  {
    id: "ocean-calm", tags: ["calm", "blue", "travel", "medical", "clinic", "dental", "education", "school", "course", "friendly", "light"],
    colors: { primary: "#0e7490", secondary: "#67c6d9", accent: "#f97316", bg: "#f5fbfd", surface: "#dff1f6", text: "#0f2a33", muted: "#4a6670" },
    fonts: { heading: "Nunito", body: "Inter" }, radius: "12px", shadow: "0 6px 22px rgba(14,116,144,0.12)", dark: false,
  },
]

export const presetById = (id) => PRESETS.find(p => p.id === id) || null
