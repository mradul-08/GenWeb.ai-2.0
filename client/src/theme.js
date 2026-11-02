// GenWeb app design system (light). One place for colours, surfaces and
// common element styles so every page looks like the same product.

export const C = {
  bg:        '#f6f3ed',
  surface:   '#fffdf8',
  soft:      '#eeeae1',
  border:    '#ded8cc',
  borderStrong: '#c9c1b3',
  ink:       '#25231f',
  text:      '#514d46',
  muted:     '#6e685f',
  faint:     '#a29b90',
  sage:      '#4e6251',
  terracotta:'#c8795d',
  // Backwards-compatible aliases for components not yet migrated.
  violet:    '#4e6251',
  blue:      '#a85f48',
  green:     '#4e6f55',
  amber:     '#8a6235',
  red:       '#bd625a',
  brand:     'linear-gradient(135deg,#4e6251 0%,#596d59 100%)',
  brandText: 'linear-gradient(120deg,#3f5142 0%,#4e6251 100%)',
}

export const FONT = "'DM Sans','Inter',system-ui,-apple-system,sans-serif"

export const shadow = {
  sm: '0 1px 2px rgba(37,35,31,0.06)',
  md: '0 8px 24px rgba(78,98,81,0.09)',
  lg: '0 20px 50px rgba(78,98,81,0.13)',
  brand: '0 10px 26px rgba(78,98,81,0.22)',
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
    'radial-gradient(900px 500px at 10% -10%, rgba(104,123,104,0.08), transparent 60%)',
    'radial-gradient(800px 500px at 100% 0%, rgba(200,121,93,0.06), transparent 60%)',
    'radial-gradient(700px 500px at 50% 110%, rgba(200,121,93,0.04), transparent 60%)',
    'radial-gradient(rgba(37,35,31,0.045) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: 'auto, auto, auto, 22px 22px',
  backgroundAttachment: 'fixed',
}

// Global CSS shared by app pages (fonts, focus ring, scrollbar).
export const GLOBAL_CSS = `
*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
::selection{background:rgba(104,123,104,0.22)}
:focus-visible{outline:3px solid rgba(104,123,104,0.5);outline-offset:2px}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#c9c1b3;border-radius:8px}::-webkit-scrollbar-track{background:transparent}
input::placeholder,textarea::placeholder{color:${C.muted}}
`
