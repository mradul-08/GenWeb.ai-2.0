// Edit-intent analysis: decides what an edit request needs (markup, style,
// script, text) and picks the smallest safe edit mode. Replaces the old
// first-keyword-wins classifier, which sent e.g. "add a dark mode toggle" to a
// style-only edit that could never add the button or its JavaScript.
import { extractSection, extractBodyNoScript, buildSkeleton } from "./htmlPatch.js"

const RE = {
  // Behaviour that requires JavaScript.
  script: /\b(toggle|switch(?:er)?|on ?click|clickable|interactive|dropdown|modal|pop-?up|accordion|carousel|slider|slideshow|tabs?|counter|count-?up|count ?down|countdown|timer|validat\w*|submit|form handling|back[- ]to[- ]top|scroll[- ]to[- ]top|hamburger|mobile menu|dark[- ]?mode|light[- ]?mode|theme switch\w*|filter|search|sort|cart|calculator|javascript|\bjs\b|script|loader|loading screen|preloader|typewriter|parallax|lightbox|copy to clipboard|local ?storage)\b/,
  // Pure animation / transition polish (CSS + an observer script at most).
  animation: /\b(animat\w*|transition\w*|hover|fade\w*|slide[- ]?in|bounce|spin|pulse|keyframe\w*|micro[- ]interaction\w*)\b/,
  // Smooth scrolling is CSS (scroll-behavior), not JavaScript.
  style: /\b(smooth\w* scroll\w*|scroll\w* smooth\w*|colou?rs?|background|bg|gradient|palette|shade|hue|tint|opacity|transparen\w*|borders?|shadows?|glow|fonts?|typography|bold|italic|bigger|smaller|larger|size|rounded|radius|spacing|padding|margin|align\w*|cent(er|re)\w*|layout|grid|flex\w*|columns?|rows?|responsive\w*|mobile|tablet|breakpoints?|css|style|styling|darker|lighter|contrast|modern|look|theme|width|height)\b/,
  additive: /\b(add|insert|include|create|introduce|put|place|append|new)\b/,
  removal: /\b(remove|delete|hide|get rid of|drop)\b/,
  text: /\b(text|copy|wording|heading|headline|title|subtitle|paragraph|tagline|rename|typo|spelling|says?|reads?|label)\b|change .{0,40}\bto\b\s*["'“]|replace .{0,40}\bwith\b/,
  newSectionKind: /\b(section|testimonials?|faq|pricing|gallery|team|stats|statistics|newsletter|features?|about|contact|cta|call to action|partners|clients|timeline|blog)\b/,
}

const SECTION_TARGETS = [
  ["nav",          /\b(nav|navbar|navigation|menu bar|top bar|header links?|logo)\b/],
  ["footer",       /\b(footer|copyright|bottom of the page)\b/],
  ["hero",         /\b(hero|headline|banner|main heading|above the fold)\b/],
  ["features",     /\bfeatures?\b/],
  ["pricing",      /\b(pricing|plans?)\b/],
  ["testimonials", /\b(testimonials?|reviews?)\b/],
  ["faq",          /\bfaqs?\b/],
  ["contact",      /\bcontact\b/],
  ["gallery",      /\bgallery\b/],
  ["about",        /\babout\b/],
  ["team",         /\bteam\b/],
]

export function analyzeEditIntent(prompt) {
  const p = prompt.toLowerCase()
  const needs = {
    script:    RE.script.test(p),
    animation: RE.animation.test(p),
    style:     RE.style.test(p),
    text:      RE.text.test(p),
    additive:  RE.additive.test(p),
    removal:   RE.removal.test(p),
  }
  const target = SECTION_TARGETS.find(([, re]) => re.test(p))?.[0] || null
  // "add X to the contact section" edits an existing section; "add a contact section" creates one.
  const intoExisting = /\b(to|in|inside|into|within|under)\s+(the|our|my)\s+[\w -]{0,30}?\b(section|area|block|part|footer|header|navbar|nav|hero)\b/.test(p)
  const newSection = needs.additive && RE.newSectionKind.test(p) && !intoExisting
  const multiStep = /\b(and also|as well as|then|plus)\b/.test(p) || (p.match(/\band\b/g) || []).length >= 2

  // First matching rule wins; each rule is covered by tests/intent.test.js.
  let editType
  if (needs.script) {
    editType = "FULL"                                   // new behaviour needs markup + JS (+ CSS)
  } else if (multiStep) {
    editType = "FULL"                                   // several unrelated changes in one request
  } else if (needs.removal && /\bsections?\b/.test(p)) {
    editType = "FULL"                                   // removing a whole section also affects nav links etc.
  } else if (newSection) {
    editType = target ? "SECTION_ADD_OR_MOD" : "SECTION_ADD"   // resolved against the page in planEdit
  } else if (needs.animation && !needs.removal) {
    editType = "ANIMATION"
  } else if ((needs.additive || needs.removal) && target) {
    editType = "SECTION_MOD"                            // add/remove an element inside one section
  } else if (needs.additive || needs.removal) {
    editType = "FULL"
  } else if (needs.text && needs.style) {
    editType = target ? "SECTION_MOD" : "FULL"          // text + its styling in one place
  } else if (needs.text) {
    editType = "TEXT"
  } else if (needs.style) {
    editType = "STYLE"
  } else if (target) {
    editType = "SECTION_MOD"
  } else {
    editType = "FULL"
  }
  return { editType, target, needs }
}

const SMALL_SECTION_CHARS = 1500

const full = (fullHTML, editType, needs) => ({ editType, needs, extracted: fullHTML, mode: "full", instruction: "" })

// Chooses the smallest edit that can still satisfy the request on this page.
export function planEdit(fullHTML, prompt) {
  const { editType, target, needs } = analyzeEditIntent(prompt)

  switch (editType) {
    case "STYLE": {
      // The model returns only the rules to add/override (appended), not the whole stylesheet.
      const style = fullHTML.match(/<style[\s\S]*?<\/style>/i)?.[0]
      if (!style) return full(fullHTML, "FULL", needs)
      return { editType, needs, extracted: style, mode: "style_append" }
    }

    case "ANIMATION": {
      const style  = fullHTML.match(/<style[\s\S]*?<\/style>/i)?.[0]
      const script = fullHTML.match(/<script[\s\S]*?<\/script>/gi)?.find(s => /intersection|observer|animate|scroll/i.test(s))
      const extracted = [style, script].filter(Boolean).join("\n\n")
      if (extracted.length <= 100) return full(fullHTML, "FULL", needs)
      return { editType, needs, extracted, mode: "style_script_patch", instruction: "Return ONLY the updated <style> tag and/or <script> tag for animations. Nothing else." }
    }

    case "TEXT": {
      // Measured (benchmarks/2026-11-01/edit-mode-comparison.json): for a small
      // section, returning the section costs about the same as find/replace
      // pairs and is less brittle; for large context, pairs avoid rewriting it.
      const section = target && extractSection(fullHTML, target)
      if (section && section.length < SMALL_SECTION_CHARS) {
        return { editType, needs, extracted: section, mode: "section_patch", sectionName: target, instruction: `Return ONLY the updated HTML for the ${target} section. Keep all classes and IDs identical.` }
      }
      return { editType, needs, extracted: section || extractBodyNoScript(fullHTML), mode: "text_replace", sectionName: section ? target : undefined }
    }

    case "SECTION_MOD":
    case "SECTION_ADD_OR_MOD": {
      const section = target && extractSection(fullHTML, target)
      if (section) {
        return {
          editType: "SECTION_MOD", needs, extracted: section, mode: "section_patch", sectionName: target,
          instruction: `Return ONLY the updated HTML for the ${target} section. Keep existing classes and IDs. Reuse existing CSS classes; if new styling is required, use inline style attributes.`,
        }
      }
      if (editType === "SECTION_MOD") return full(fullHTML, "FULL", needs)
      // fall through: the section does not exist yet → add it
    }
    // eslint-disable-next-line no-fallthrough
    case "SECTION_ADD":
      return { editType: "SECTION_ADD", needs, extracted: buildSkeleton(fullHTML), mode: "section_add", instruction: "Return ONLY the new section HTML to be inserted. Include any needed CSS as a <style> block before it. Do NOT return the full page." }

    default:
      return full(fullHTML, "FULL", needs)
  }
}
