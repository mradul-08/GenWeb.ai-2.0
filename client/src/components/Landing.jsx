import React, { useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowRight, LayoutTemplate, ListChecks, Palette, History, Download, ShieldCheck, Sparkles, Check, LayoutDashboard, PenLine, ClipboardCheck, Rocket, Scissors, Coffee, Dumbbell, GraduationCap, House, Stethoscope } from 'lucide-react'
import { C, FONT, btn, card, pill, shadow } from '../theme'
import IconTile from './IconTile'

// Landing page sections (light theme). Everything described here exists in
// the product; the example sites are real output of the template engine
// (server/scripts/build-examples.js) for fictional businesses.

const EXAMPLES = [
  { id: 'salon',     label: 'Salon & spa',   url: 'glowstudio.example', prompt: 'Glow Studio – unisex salon in Sector 18 Noida with haircuts, colour, facials, bridal makeup and online appointments' },
  { id: 'cafe',      label: 'Café',          url: 'chaicorner.example', prompt: 'Chai Corner – cosy café in Raj Nagar Extension Ghaziabad with masala chai, snacks, weekend live music and table booking' },
  { id: 'gym',       label: 'Gym & fitness', url: 'ironhouse.example',  prompt: 'IronHouse gym in Indirapuram with strength training, trainers, monthly memberships and free trial booking' },
  { id: 'portfolio', label: 'Portfolio',     url: 'ananya.example',     prompt: 'Portfolio of Ananya, a freelance UI designer, with selected work, experience and a contact form' },
]

const IDEAS = [
  { icon: Scissors, label: 'Salon', text: 'A unisex salon in my city with services, prices and online appointments' },
  { icon: Coffee, label: 'Café', text: 'A cosy café with a menu, opening hours, photos and table booking' },
  { icon: Dumbbell, label: 'Gym', text: 'A gym with programs, trainers, memberships and a free trial form' },
  { icon: GraduationCap, label: 'Coaching', text: 'A coaching institute with courses, batches, faculty and enquiries' },
  { icon: House, label: 'Real estate', text: 'A real estate builder with listings, amenities and site-visit booking' },
  { icon: Stethoscope, label: 'Clinic', text: 'A dental clinic with treatments, doctors, timings and appointments' },
/*
  ['💇', 'Salon', 'A unisex salon in my city with services, prices and online appointments'],
  ['☕', 'Café', 'A cosy café with a menu, opening hours, photos and table booking'],
  ['🏋️', 'Gym', 'A gym with programs, trainers, memberships and a free trial form'],
  ['🎓', 'Coaching', 'A coaching institute with courses, batches, faculty and enquiries'],
  ['🏠', 'Real estate', 'A real estate builder with listings, amenities and site-visit booking'],
  ['🩺', 'Clinic', 'A dental clinic with treatments, doctors, timings and appointments'],
*/]

const STEPS = [
  { icon: PenLine,        title: 'Describe your business',  text: 'One or two sentences in plain English — what you do, where, and what visitors should be able to do.' },
  { icon: ClipboardCheck, title: 'Check the plan',          text: 'See the pages, sections and features before anything is built. Change them freely — planning uses no credits.' },
  { icon: Rocket,         title: 'Edit, publish or export', text: 'Fine-tune theme, sections and text without AI, then publish with one click or download the whole site.' },
]

const FEATURES = [
  { icon: LayoutTemplate, color: '#687b68', title: 'Complete websites, every time',     text: 'Tested templates and sections for 12 kinds of business, filled with copy written for yours — single page or multi-page.' },
  { icon: ListChecks,     color: '#c8795d', title: 'Plan first, checklist after',       text: 'Approve the sections and features up front; a checklist shows what made it into the site after every change.' },
  { icon: Palette,        color: '#9a8066', title: 'Design editor — no AI, no credits', text: '12 themes, 47 section designs, reorder or add sections and edit every text and price instantly.' },
  { icon: History,        color: '#5f8067', title: 'Version history',                   text: 'Every change is saved. Preview any earlier version and restore it in one click.' },
  { icon: Download,       color: '#4e6251', title: 'Publish or take it with you',       text: 'Publish on a GenWeb link, or export a ZIP of all pages to host free on Netlify, GitHub Pages or anywhere.' },
  { icon: ShieldCheck,    color: '#b45309', title: 'Honest by design',                  text: 'No invented phone numbers or addresses, and a reminder to check prices, hours and reviews before you publish.' },
]

// Content is always visible; only a small slide animates in.
const fade = { initial: { y: 18 }, whileInView: { y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } }
const sectionWrap = { position: 'relative', padding: 'clamp(64px,9vw,104px) clamp(20px,5vw,60px)', fontFamily: FONT }
const h2 = { margin: '0 0 14px', fontSize: 'clamp(1.9rem,4vw,2.8rem)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.12 }
const lead = { margin: '0 auto', fontSize: 16.5, color: C.muted, lineHeight: 1.7, maxWidth: 580 }

// Starts generation with an idea: straight to the builder when signed in,
// otherwise through login (which continues to the builder afterwards).
function useStartWithIdea(userData, navigate) {
  return (idea) => {
    const text = (idea || '').trim()
    if (text) sessionStorage.setItem('pendingPrompt', text.slice(0, 1500))
    navigate(userData ? '/generate' : '/login')
  }
}

// ── Hero ────────────────────────────────────────────────────────────────────
export function Hero({ userData, navigate }) {
  const [idea, setIdea] = useState('')
  const start = useStartWithIdea(userData, navigate)
  const submit = (e) => { e.preventDefault(); start(idea) }

  return (
    <section style={{ ...sectionWrap, minHeight: 'calc(100vh - 66px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 'clamp(40px,7vw,80px)', textAlign: 'center' }}>
      {userData ? (
        <div className="gw-welcome" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '7px 7px 7px 18px', marginBottom: 28, borderRadius: 999, background: C.surface, border: `1px solid ${C.border}`, boxShadow: shadow.md }}>
          <span style={{ fontSize: 14, color: C.text }}>
            Welcome back, <b style={{ color: C.ink }}>{(userData.name || 'there').split(' ')[0]}</b>
            <span style={{ color: C.faint }}> · </span>
            <span style={{ color: C.terracotta, fontWeight: 700 }}>⚡ {userData.credits ?? 0} credits</span>
          </span>
          <button onClick={() => navigate('/dashboard')} style={{ ...btn.primary, padding: '8px 16px', fontSize: 14, borderRadius: 999, boxShadow: 'none' }}>
            <LayoutDashboard size={15} /> Go to my dashboard
          </button>
        </div>
      ) : (
        <div style={{ ...pill(C.violet), marginBottom: 22 }}><Sparkles size={13} /> AI website builder for small businesses</div>
      )}

      <Motion.h1 initial={{ y: 20 }} animate={{ y: 0 }} transition={{ duration: 0.6 }}
        style={{ margin: '0 0 20px', fontSize: 'clamp(2.4rem,6.4vw,4.7rem)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.04em', color: C.ink, maxWidth: 920 }}>
        Describe your business.{' '}
        <span style={{ background: C.brandText, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Get a complete website.</span>
      </Motion.h1>
      <p style={{ margin: '0 0 32px', fontSize: 'clamp(15.5px,2.2vw,18.5px)', color: C.muted, lineHeight: 1.7, maxWidth: 620 }}>
        Pages, sections, booking forms and copy written for your business — then change anything yourself, publish, or download it.
      </p>

      <form className="gw-hero-form" onSubmit={submit}
        style={{ position: 'relative', width: '100%', maxWidth: 720, display: 'flex', gap: 8, padding: 8, borderRadius: 18, background: C.surface, border: `1px solid ${C.borderStrong}`, boxShadow: shadow.lg }}>
        <label htmlFor="hero-idea" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Describe your business</label>
        <input id="hero-idea" value={idea} onChange={e => setIdea(e.target.value)} maxLength={1500}
          placeholder="e.g. A unisex salon in Noida with prices and online booking"
          style={{ flex: 1, minWidth: 0, padding: '14px 16px', border: 'none', outline: 'none', background: 'transparent', color: C.ink, fontSize: 16, fontFamily: FONT }} />
        <button type="submit" style={{ ...btn.primary, padding: '0 22px', whiteSpace: 'nowrap' }}>Build my website <ArrowRight size={17} /></button>
      </form>
      <style>{'@media (max-width: 560px){.gw-hero-form{flex-direction:column}.gw-hero-form button{padding:14px 22px !important}.gw-welcome{border-radius:18px !important;padding:12px !important}}'}</style>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18, maxWidth: 760 }}>
        {IDEAS.map(({ icon: IdeaIcon, label, text }) => {
          const on = idea === text
          return (
            <button key={label} type="button" onClick={() => setIdea(text)} aria-pressed={on}
              style={{ padding: '8px 15px', borderRadius: 999, border: `1px solid ${on ? C.violet : C.border}`, background: on ? 'rgba(104,123,104,0.10)' : C.surface, color: on ? C.violet : C.text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow.sm }}>
              {React.createElement(IdeaIcon, { size: 15, strokeWidth: 1.9 })} {label}
            </button>
          )
        })}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 26px', color: C.muted, fontSize: 14 }}>
        {['Free to start', 'No code needed', 'Edit design without AI', 'Export anytime'].map(t => (
          <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={16} color={C.green} /> {t}</li>
        ))}
      </ul>
    </section>
  )
}

// ── Live examples ───────────────────────────────────────────────────────────
// A real site rendered at desktop width and scaled down to fit its card.
function SitePreview({ id, url }) {
  const box = useRef(null)
  const [scale, setScale] = useState(0.35)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div style={{ ...card, borderRadius: 16, overflow: 'hidden', boxShadow: shadow.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: C.soft, borderBottom: `1px solid ${C.border}` }}>
        {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />)}
        <span style={{ marginLeft: 10, padding: '3px 10px', borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted, fontFamily: 'ui-monospace,monospace' }}>{url}</span>
      </div>
      <div ref={box} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 11', overflow: 'hidden', background: '#fff' }}>
        <iframe title={`Example: ${url}`} src={`/examples/${id}.html`} loading="lazy" scrolling="no" tabIndex={-1} sandbox="allow-scripts"
          style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 880, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

export function Examples({ userData, navigate }) {
  const start = useStartWithIdea(userData, navigate)
  return (
    <section id="examples" style={sectionWrap}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Motion.div {...fade} style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ ...pill(C.blue), marginBottom: 16 }}>MADE WITH GENWEB</div>
          <h2 style={h2}>Real sites from the same engine you'll use</h2>
          <p style={lead}>Example businesses (fictional), built from our templates with no hand-coding. Open one, or start from the same idea.</p>
        </Motion.div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,500px),1fr))', gap: 30 }}>
          {EXAMPLES.map((ex) => (
            <Motion.div key={ex.id} {...fade}>
              <SitePreview id={ex.id} url={ex.url} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginRight: 'auto' }}>{ex.label}</span>
                <a href={`/examples/${ex.id}.html`} target="_blank" rel="noopener noreferrer" style={{ ...btn.secondary, padding: '8px 14px', fontSize: 13.5, textDecoration: 'none' }}>Open full site ↗</a>
                <button type="button" onClick={() => start(ex.prompt)} style={{ ...btn.primary, padding: '8px 14px', fontSize: 13.5, boxShadow: 'none' }}>Build one like this</button>
              </div>
            </Motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ────────────────────────────────────────────────────────────
export function HowItWorks() {
  return (
    <section id="how-it-works" style={sectionWrap}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Motion.div {...fade} style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ ...pill(C.green), marginBottom: 16 }}>HOW IT WORKS</div>
          <h2 style={h2}>From idea to live website in three steps</h2>
        </Motion.div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18 }}>
          {STEPS.map((s, i) => (
            <Motion.li key={s.title} {...fade} style={{ ...card, position: 'relative', padding: '30px 26px' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 22, right: 24, fontSize: 44, fontWeight: 800, color: '#e4ded3', lineHeight: 1 }}>{i + 1}</span>
              <IconTile icon={s.icon} color={[C.green, C.terracotta, C.sage][i]} />
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: C.ink }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: C.muted }}>{s.text}</p>
            </Motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── Features ────────────────────────────────────────────────────────────────
export function Features() {
  return (
    <section id="features" style={sectionWrap}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Motion.div {...fade} style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ ...pill('#c8795d'), marginBottom: 16 }}>WHAT YOU GET</div>
          <h2 style={h2}>Everything you need — and control over all of it</h2>
          <p style={lead}>AI does the first draft. You stay in charge of every detail, for free.</p>
        </Motion.div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 18 }}>
          {FEATURES.map(({ icon, color, title, text }) => (
            <Motion.div key={title} {...fade} style={{ ...card, padding: 26 }}>
              <IconTile icon={icon} color={color} />
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: C.ink }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: C.muted }}>{text}</p>
            </Motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ──────────────────────────────────────────────────────────────────
export function SiteFooter({ userData, navigate }) {
  const links = [['Examples', '#examples'], ['How it works', '#how-it-works'], ['Features', '#features'], ['Pricing', '/pricing'], userData ? ['Dashboard', '/dashboard'] : ['Sign in', '/login']]
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: 'clamp(28px,4vw,40px) clamp(20px,5vw,60px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13 }}>✦</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>GenWeb<span style={{ color: C.violet }}>.ai</span></span>
      </div>
      <nav aria-label="Footer" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {links.map(([label, to]) => (
          <a key={label} href={to} onClick={e => { if (to.startsWith('/')) { e.preventDefault(); navigate(to) } }}
            style={{ fontSize: 14, color: C.muted, textDecoration: 'none', padding: '4px 10px', borderRadius: 6 }}>{label}</a>
        ))}
      </nav>
      <span style={{ fontSize: 13, color: C.muted }}>© {new Date().getFullYear()} GenWeb.ai</span>
    </footer>
  )
}
