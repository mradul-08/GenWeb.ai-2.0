// GenWeb app design system (light). One place for colours, surfaces and
// common element styles so every page looks like the same product.

export const C = {
  bg:        '#f8f7ff',   // page
  surface:   '#ffffff',   // cards, panels
  soft:      '#f3f1fd',   // subtle fills, inputs
  border:    '#e6e3f5',
  borderStrong: '#d6d1ef',
  ink:       '#14112b',   // headings, primary text
  text:      '#3f3b5c',   // body text
  muted:     '#6e6a8a',   // secondary text (AA on white)
  faint:     '#9a96b3',   // hints, placeholders (not for body text)
  violet:    '#7c3aed',
  blue:      '#2563eb',
  green:     '#059669',
  amber:     '#b45309',
  red:       '#dc2626',
  brand:     'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)',
  brandText: 'linear-gradient(120deg,#7c3aed 0%,#2563eb 55%,#0891b2 100%)',
}

export const FONT = "'DM Sans','Inter',system-ui,-apple-system,sans-serif"

export const shadow = {
  sm: '0 1px 2px rgba(20,17,43,0.06)',
  md: '0 8px 24px rgba(76,61,180,0.08)',
  lg: '0 20px 50px rgba(76,61,180,0.12)',
  brand: '0 10px 30px rgba(99,62,234,0.28)',
}

export const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: shadow.md }

export const btn = {
  primary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, border: 'none', background: C.brand, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow.brand },
  secondary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.surface, color: C.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT },
}

export const input = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.surface, color: C.ink, fontSize: 15, fontFamily: FONT, outline: 'none' }

export const pill = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}33`, color, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' })

// Soft coloured glows + a faint dot grid behind light pages.
export const pageBackground = {
  backgroundColor: C.bg,
  backgroundImage: [
    'radial-gradient(900px 500px at 10% -10%, rgba(124,58,237,0.10), transparent 60%)',
    'radial-gradient(800px 500px at 100% 0%, rgba(37,99,235,0.09), transparent 60%)',
    'radial-gradient(700px 500px at 50% 110%, rgba(236,72,153,0.06), transparent 60%)',
    'radial-gradient(rgba(20,17,43,0.06) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: 'auto, auto, auto, 22px 22px',
  backgroundAttachment: 'fixed',
}

// Global CSS shared by app pages (fonts, focus ring, scrollbar).
export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
::selection{background:rgba(124,58,237,0.18)}
:focus-visible{outline:3px solid rgba(124,58,237,0.45);outline-offset:2px}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#d6d1ef;border-radius:8px}::-webkit-scrollbar-track{background:transparent}
input::placeholder,textarea::placeholder{color:${C.faint}}
`
