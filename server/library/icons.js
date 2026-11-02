// Line icons for generated sites (original work). 24×24 viewBox, drawn with
// the current text colour so they follow every theme. The model picks icons
// by name from ICON_NAMES; anything else falls back to the emoji renderer.

const P = {
  check:     `<path d="M20 6 9 17l-5-5"/>`,
  star:      `<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>`,
  heart:     `<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>`,
  bolt:      `<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
  shield:    `<path d="M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>`,
  leaf:      `<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19 13 11"/>`,
  sparkles:  `<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z"/>`,
  users:     `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 5"/>`,
  user:      `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  clock:     `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  calendar:  `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  pin:       `<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>`,
  phone:     `<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>`,
  mail:      `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>`,
  chat:      `<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>`,
  truck:     `<path d="M2 6h11v10H2zM13 10h5l4 3v3h-9"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>`,
  gift:      `<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12"/><path d="M12 9C10 5 6.5 5 6.5 7.2S10 9 12 9c2 0 5.5 0 5.5-1.8S14 5 12 9z"/>`,
  award:     `<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>`,
  chart:     `<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>`,
  target:    `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>`,
  globe:     `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4" ry="9"/>`,
  lock:      `<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>`,
  home:      `<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>`,
  coffee:    `<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v3M12 3v3"/>`,
  scissors:  `<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.8 20 18M8.5 15.2 20 6"/>`,
  dumbbell:  `<path d="M7 12h10"/><rect x="3" y="8" width="4" height="8" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/>`,
  book:      `<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>`,
  camera:    `<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>`,
  music:     `<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>`,
  sun:       `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  drop:      `<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>`,
  smile:     `<circle cx="12" cy="12" r="9"/><path d="M8 14.5a5 5 0 0 0 8 0"/><path d="M9 9.5h.01M15 9.5h.01"/>`,
  tag:       `<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>`,
  cap:       `<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/>`,
  building:  `<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"/>`,
  plate:     `<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.5"/><path d="M2 5v6M3.5 5v6M2.75 11v9M22 5c-1.5 1-2 3-2 6h2v9"/>`,
  rocket:    `<path d="M12 2c4 3 6 7 5 12l-2.5 2.5h-5L7 14c-1-5 1-9 5-12z"/><circle cx="12" cy="9" r="2"/><path d="M9.5 16.5 8 21l4-2 4 2-1.5-4.5"/>`,
  wifi:      `<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>`,
  paw:       `<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-5.5 3.5-5.5 6 0 1.5 1.2 2 2.5 2h6c1.3 0 2.5-.5 2.5-2 0-2.5-2.5-6-5.5-6z"/>`,
  tooth:     `<path d="M7 3c-2.5 0-4 2-4 4.5 0 3 1.5 4 2 7.5.4 3 1 6 2.5 6s1.8-3.5 2.5-5.5c.3-.8 1.7-.8 2 0 .7 2 1 5.5 2.5 5.5s2.1-3 2.5-6c.5-3.5 2-4.5 2-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/>`,
}

export const ICON_NAMES = Object.keys(P)

// Inline SVG for a known icon name, or null.
export function iconSvg(name, size = 24) {
  const body = P[name]
  if (!body) return null
  return `<svg class="gw-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
}

// Decorative compositions (theme colours only) used behind a big icon in
// hero/about/highlight visuals. Three styles for variety.
export function artSvg(style = 0) {
  const s = [
    `<svg class="gw-art-bg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><circle cx="200" cy="200" r="170" style="fill:var(--primary);opacity:.16"/><circle cx="200" cy="200" r="125" style="fill:none;stroke:var(--primary);stroke-width:2;opacity:.45"/><circle cx="200" cy="200" r="80" style="fill:var(--secondary);opacity:.35"/><circle cx="318" cy="96" r="22" style="fill:var(--accent)"/><circle cx="84" cy="300" r="14" style="fill:var(--primary)"/><circle cx="336" cy="292" r="8" style="fill:var(--secondary)"/></svg>`,
    `<svg class="gw-art-bg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><path d="M292 72c52 36 72 112 44 172s-104 96-172 84S44 260 52 192 112 64 176 52s64-16 116 20z" style="fill:var(--primary);opacity:.2"/><path d="M262 118c34 24 46 74 28 112s-68 62-112 54-78-46-72-90 40-82 82-90 40-10 74 14z" style="fill:var(--secondary);opacity:.45"/><rect x="300" y="282" width="46" height="46" rx="12" style="fill:var(--accent);opacity:.9"/><circle cx="74" cy="96" r="18" style="fill:none;stroke:var(--primary);stroke-width:3"/></svg>`,
    `<svg class="gw-art-bg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><g style="fill:var(--primary);opacity:.18">${Array.from({ length: 36 }, (_, i) => `<circle cx="${60 + (i % 6) * 56}" cy="${60 + Math.floor(i / 6) * 56}" r="5"/>`).join("")}</g><rect x="96" y="96" width="208" height="208" rx="48" transform="rotate(12 200 200)" style="fill:var(--secondary);opacity:.4"/><rect x="120" y="120" width="160" height="160" rx="40" style="fill:var(--primary);opacity:.25"/><circle cx="318" cy="318" r="26" style="fill:var(--accent)"/></svg>`,
  ]
  return s[Math.abs(style) % s.length]
}
