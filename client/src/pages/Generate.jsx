import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Wand2, ClipboardList, Rocket, LayoutTemplate, Palette, FileText, Files, Monitor, Code2, Maximize2, Download, ArrowRight, X, Check, Shuffle, AlertTriangle, Loader2 } from 'lucide-react'
import { setUserData } from '../redux/userSlice'
import { serverUrl } from '../config'
import axios from 'axios'
import { buildPreviewDoc, PREVIEW_SANDBOX } from '../utils/previewDoc'
import PlanReview from '../components/PlanReview'
import AppHeader from '../components/AppHeader'
import { C, FONT, GLOBAL_CSS, pageBackground, btn, shadow, pill } from '../theme'

// ─── Palettes ─────────────────────────────────────────────────────────────────
const RANDOM_PALETTES = [
  { name: 'Sunset Coral',   primary: '#FF6B6B', accent: '#FFE66D', bg: '#1a0a0a', desc: 'Warm coral & golden tones' },
  { name: 'Ocean Mint',     primary: '#00D4AA', accent: '#00A8E8', bg: '#020f0d', desc: 'Fresh teal & sky blue' },
  { name: 'Neon Violet',    primary: '#BF5AF2', accent: '#FF375F', bg: '#0d0010', desc: 'Electric purple & pink' },
  { name: 'Forest Sage',    primary: '#4CAF50', accent: '#8BC34A', bg: '#050d05', desc: 'Natural greens, earthy' },
  { name: 'Amber Blaze',    primary: '#FF9500', accent: '#FF6B00', bg: '#0d0800', desc: 'Bold amber & deep orange' },
  { name: 'Arctic Blue',    primary: '#4FC3F7', accent: '#B3E5FC', bg: '#000d1a', desc: 'Cool icy blues, crisp' },
  { name: 'Rose Gold',      primary: '#F48FB1', accent: '#FCE4EC', bg: '#1a0510', desc: 'Soft rose, luxe feel' },
  { name: 'Cyberpunk',      primary: '#39FF14', accent: '#FF0090', bg: '#050505', desc: 'Neon green & hot pink' },
  { name: 'Sandstone',      primary: '#D4A76A', accent: '#8D6E63', bg: '#0d0906', desc: 'Warm desert neutrals' },
  { name: 'Lavender Dream', primary: '#CE93D8', accent: '#80DEEA', bg: '#08000d', desc: 'Soft purple & aqua' },
]
const getRandomPalette = () => RANDOM_PALETTES[Math.floor(Math.random() * RANDOM_PALETTES.length)]

const STEP_WEIGHTS = [0.10, 0.15, 0.20, 0.25, 0.20, 0.10]

const STYLE_PRESETS = [
  // Auto: no style is forced; the template and the business decide the look.
  { id: 'auto',          label: 'Auto',      icon: '✦', desc: 'Best fit for your business' },
  { id: 'minimal',       label: 'Minimal',   icon: '◻', desc: 'Clean, lots of whitespace' },
  { id: 'bold',          label: 'Bold',      icon: '◼', desc: 'Strong colours, big type' },
  { id: 'glassmorphism', label: 'Glass',     icon: '◈', desc: 'Frosted glass effects' },
  { id: 'dark',          label: 'Dark',      icon: '◉', desc: 'Dark theme, premium feel' },
  { id: 'colorful',      label: 'Colourful', icon: '◍', desc: 'Vibrant, playful palette' },
  { id: 'corporate',     label: 'Corporate', icon: '◫', desc: 'Professional, trustworthy' },
  { id: 'random',        label: 'Random',    icon: '🎲', desc: 'Surprise colour palette' },
]

const SECTIONS = [
  { id: 'hero',         label: 'Hero' },
  { id: 'features',     label: 'Features' },
  { id: 'pricing',      label: 'Pricing' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'faq',          label: 'FAQ' },
  { id: 'footer',       label: 'Footer' },
  { id: 'contact',      label: 'Contact' },
  { id: 'gallery',      label: 'Gallery' },
]

const EXAMPLES = [
  ['💇', 'Salon', 'Glow Studio – a unisex salon in Sector 18 Noida with haircuts, colour, facials, bridal makeup, prices and online appointments'],
  ['☕', 'Café', 'Chai Corner – a cosy café in Ghaziabad with a menu of chai and snacks, opening hours, photos and table booking'],
  ['🏋️', 'Gym', 'IronHouse – a gym in Indirapuram with strength programs, trainers, monthly memberships and a free trial form'],
  ['🩺', 'Clinic', 'SmileCare – a dental clinic with treatments, doctors, timings, patient reviews and appointment booking'],
  ['🎓', 'Coaching', 'BrightPath – a coaching institute with courses, batches, faculty, results and an enquiry form'],
  ['🎨', 'Portfolio', 'Portfolio of Ananya, a freelance UI designer, with selected work, experience and a contact form'],
]

const GEN_STEPS = [
  'Understanding your business…',
  'Choosing a template and theme…',
  'Laying out the sections…',
  'Writing your content…',
  'Assembling the pages…',
  'Checking and saving…',
]

const TIPS = [
  '💡 Mention your city or area — it makes the copy feel local.',
  '📞 Add your real phone, address and hours to the prompt; we never invent them.',
  '🎨 After building, the Design tab changes theme, sections and text without AI or credits.',
  '🗂 Choose Multi-page for a separate Menu, Gallery or Contact page.',
  '📱 Every site works on phones out of the box.',
  '🕘 Every change is saved in History — you can always go back.',
  '⬇️ You can download the whole site as a ZIP and host it anywhere.',
  '📋 Review the plan first to add or remove sections before building — it is free.',
]

// ─── Timer persistence ─────────────────────────────────────────────────────────
const STORAGE_KEY    = 'gen_avg_ms'
const DEFAULT_EST_MS = 30000
const PROMPT_CHAR_LIMIT = 1500
const GENERATION_COST = 50

function getStoredAvg() {
  try { const v = localStorage.getItem(STORAGE_KEY); return v ? parseFloat(v) : DEFAULT_EST_MS } catch { return DEFAULT_EST_MS }
}
function updateStoredAvg(ms) {
  try {
    const old = getStoredAvg()
    localStorage.setItem(STORAGE_KEY, String(old === DEFAULT_EST_MS ? ms : old * 0.7 + ms * 0.3))
  } catch { /* storage unavailable */ }
}
function formatTime(s) {
  if (s <= 0) return '0s'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    return { response, data }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The AI request took too long. Please try again with a shorter prompt.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── Small pieces ─────────────────────────────────────────────────────────────
const LBL = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: C.ink, margin: '0 0 10px' }
const choice = (on) => ({
  padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
  border: `1.5px solid ${on ? C.violet : C.border}`, background: on ? 'rgba(124,58,237,0.06)' : C.surface,
  boxShadow: on ? '0 0 0 3px rgba(124,58,237,0.08)' : 'none', transition: 'border-color .15s, background .15s',
})
const Spin = ({ size = 16 }) => <Loader2 size={size} style={{ animation: 'gw-spin 1s linear infinite' }} />

function CircularProgress({ pct = 0, size = 168, stroke = 10 }) {
  const r = (size - stroke) / 2
  const circum = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="gw-prog" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#2563eb" /></linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece9fb" strokeWidth={stroke} />
      <Motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#gw-prog)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circum} animate={{ strokeDashoffset: circum * (1 - pct / 100) }} transition={{ duration: 0.55, ease: 'easeOut' }} />
    </svg>
  )
}

// Syntax-highlighted, read-only code view (dark, like a code editor).
function CodeViewer({ code }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const highlight = (raw) => {
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return escaped
      .replace(/(&lt;\/?)([\w-]+)/g, '<span style="color:#60a5fa">$1$2</span>')
      .replace(/(\s)([\w-]+)(=)/g, '$1<span style="color:#93c5fd">$2</span>$3')
      .replace(/(&lt;!--.*?--&gt;)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
  }
  const lines = code.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f1020' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#15172b', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'ui-monospace,monospace' }}>index.html · {lines.length} lines</span>
        <button onClick={handleCopy} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)', color: copied ? '#4ade80' : 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
        <div style={{ padding: '14px 0', userSelect: 'none', flexShrink: 0, minWidth: 46, textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {lines.map((_, i) => <div key={i} style={{ padding: '0 12px', fontSize: 11.5, lineHeight: '20px', color: 'rgba(255,255,255,0.22)', fontFamily: "'Fira Code',ui-monospace,monospace" }}>{i + 1}</div>)}
        </div>
        <div style={{ flex: 1, padding: '14px 18px', fontFamily: "'Fira Code',ui-monospace,monospace", fontSize: 12.5, lineHeight: '20px', color: '#d6dbe4', whiteSpace: 'pre' }}>
          {lines.map((line, i) => <div key={i} dangerouslySetInnerHTML={{ __html: highlight(line) || '&nbsp;' }} style={{ minHeight: 20 }} />)}
        </div>
      </div>
    </div>
  )
}

function FullPreviewOverlay({ doc, onClose }) {
  return (
    <Motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      <div style={{ height: 50, flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 8 }}><Monitor size={16} color={C.violet} /> Full-page preview</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>Press Esc to go back</span>
          <button aria-label="Close preview" onClick={onClose} style={{ ...btn.secondary, padding: 7 }}><X size={16} /></button>
        </div>
      </div>
      <iframe srcDoc={doc} style={{ flex: 1, width: '100%', border: 'none', background: 'white' }} title="Full page preview" sandbox={PREVIEW_SANDBOX} />
    </Motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Generate() {
  const { userData } = useSelector(s => s.user)
  const navigate     = useNavigate()
  const dispatch     = useDispatch()
  const [prompt,            setPrompt]            = useState('')
  const [isEnhanced,        setIsEnhanced]        = useState(false)
  const [enhancing,         setEnhancing]         = useState(false)
  const [selectedStyle,     setSelectedStyle]     = useState('auto')
  const [selectedSections,  setSelectedSections]  = useState([])   // optional: empty = the template chooses
  const [activePalette,     setActivePalette]     = useState(null)
  const [showMore,          setShowMore]          = useState(false)

  // "hybrid": tested templates + AI-written content (complete pages, few tokens).
  // "ai": the model writes the whole page (more freedom, may be cut off).
  const [engine,         setEngine]         = useState('hybrid')
  // "single": one long page; "multi": home + a page per major section (Templates engine only).
  const [pageMode,       setPageMode]       = useState('single')
  // Plan mode: an editable plan reviewed before generating (null = direct mode).
  const [plan,           setPlan]           = useState(null)
  const [planning,       setPlanning]       = useState(false)

  const [generating,     setGenerating]     = useState(false)
  const [generatingStep, setGeneratingStep] = useState(0)
  const [generated,      setGenerated]      = useState(false)
  const [generatedCode,  setGeneratedCode]  = useState('')
  const [websiteId,      setWebsiteId]      = useState(null)
  const [previewDoc,     setPreviewDoc]     = useState(null)
  const [error,          setError]          = useState('')
  const [redirecting,    setRedirecting]    = useState(false)
  const [exporting,      setExporting]      = useState(false)

  const [activeTab,       setActiveTab]       = useState('preview')
  const [showFullPreview, setShowFullPreview] = useState(false)

  const [elapsedMs,   setElapsedMs]   = useState(0)
  const [estimatedMs, setEstimatedMs] = useState(DEFAULT_EST_MS)
  const [tipIndex,    setTipIndex]    = useState(0)

  const textareaRef  = useRef(null)
  const countdownRef = useRef(null)
  const stepTimeouts = useRef([])
  const startTimeRef = useRef(null)
  const tipTimerRef  = useRef(null)
  const redirectTimer = useRef(null)
  const mainRef      = useRef(null)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setShowFullPreview(false) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => { if (!userData) navigate('/login') }, [userData, navigate])

  useEffect(() => {
    const p = sessionStorage.getItem('pendingPrompt')
    if (p) { setPrompt(p.slice(0, PROMPT_CHAR_LIMIT)); sessionStorage.removeItem('pendingPrompt') }
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px' }
  }, [prompt])

  // On narrow screens the plan / progress / preview sit below the form: bring them into view.
  const showingResult = !!plan || generating || generated
  useEffect(() => {
    if (showingResult && window.matchMedia('(max-width: 900px)').matches) mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showingResult])

  useEffect(() => () => {
    clearInterval(countdownRef.current)
    stepTimeouts.current.forEach(clearTimeout)
    clearInterval(tipTimerRef.current)
    clearTimeout(redirectTimer.current)
  }, [])

  const handleStyleSelect = (id) => { setSelectedStyle(id); setActivePalette(id === 'random' ? getRandomPalette() : null) }
  const rerollPalette = () => setActivePalette(getRandomPalette())
  const toggleSection = (id) => setSelectedSections(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id])

  const startTimers = useCallback((totalMs) => {
    setEstimatedMs(totalMs); startTimeRef.current = Date.now(); setElapsedMs(0)
    clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 150)
    stepTimeouts.current.forEach(clearTimeout); stepTimeouts.current = []
    let cum = 0
    STEP_WEIGHTS.slice(0, -1).forEach((w, i) => { cum += w * totalMs; stepTimeouts.current.push(setTimeout(() => setGeneratingStep(i + 1), cum)) })
    clearInterval(tipTimerRef.current)
    tipTimerRef.current = setInterval(() => setTipIndex(p => (p + 1) % TIPS.length), 6000)
  }, [])

  const stopTimers = useCallback(() => {
    clearInterval(countdownRef.current); stepTimeouts.current.forEach(clearTimeout); clearInterval(tipTimerRef.current)
    updateStoredAvg(Date.now() - (startTimeRef.current || Date.now()))
  }, [])

  const updatePromptDraft = (value) => {
    setPrompt(value.slice(0, PROMPT_CHAR_LIMIT))
    setIsEnhanced(false)
    setPlan(null)   // a plan describes the prompt it was made from
  }

  // The prompt as sent to the server: the user's idea plus the sidebar choices.
  const buildEnrichedPrompt = () => {
    let styleNote = selectedStyle, paletteNote = ''
    if (selectedStyle === 'random' && activePalette) {
      styleNote   = 'colorful with custom palette'
      paletteNote = ` Use this exact palette — primary: ${activePalette.primary}, accent: ${activePalette.accent}, background: ${activePalette.bg}. Name: "${activePalette.name}".`
    }
    // Only choices the user actually made are added; defaults would override
    // what the template and the request imply (e.g. every site turning dark).
    const style = selectedStyle === 'auto' ? '' : ` Visual style: ${styleNote}.${paletteNote}`
    const sections = selectedSections.length ? ` Include sections: ${selectedSections.join(', ')}.` : ''
    // One full stop after the idea, whether or not the user typed one.
    return `${prompt.trim().replace(/[.\s]+$/, '')}.${style}${sections}`
  }

  const handlePlan = async () => {
    if (!prompt.trim() || planning || generating) return
    setPlanning(true); setError(''); setPlan(null)
    try {
      const { response, data } = await fetchJsonWithTimeout(`${serverUrl}/api/website/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: buildEnrichedPrompt() }),
      }, 75000)
      if (!response.ok || !data.success) throw new Error(data.message || 'Planning failed')
      setPlan(data.plan)
    } catch (err) {
      setError(err.message || 'Could not plan this site. Try again, or build directly.')
    } finally {
      setPlanning(false)
    }
  }

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || enhancing) return
    setEnhancing(true)
    setError('')
    try {
      const { response, data } = await fetchJsonWithTimeout(`${serverUrl}/api/website/enhance-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: prompt.trim() }),
      }, 75000)
      if (!response.ok || !data.success) throw new Error(data.message || 'Enhancement failed')
      setPrompt(data.enhancedPrompt.slice(0, PROMPT_CHAR_LIMIT))
      setIsEnhanced(true)
      setPlan(null)
    } catch (err) {
      setError(err.message || 'Failed to improve the description. Try again.')
    } finally {
      setEnhancing(false)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    clearTimeout(redirectTimer.current); setRedirecting(false)
    setGenerating(true); setGenerated(false); setError(''); setGeneratingStep(0); setElapsedMs(0)
    setTipIndex(Math.floor(Math.random() * TIPS.length)); setShowFullPreview(false)
    setPreviewDoc(null)
    startTimers(getStoredAvg())
    try {
      const body = { prompt: buildEnrichedPrompt(), engine, pages: engine === 'hybrid' ? pageMode : 'single', ...(plan ? { plan } : {}) }
      const { response: res, data } = await fetchJsonWithTimeout(`${serverUrl}/api/website/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      }, 240000)
      if (!res.ok || !data.success) throw new Error(data.message || 'Generation failed')
      setGeneratedCode(data.code)
      setPlan(null)
      setGeneratingStep(GEN_STEPS.length)
      setPreviewDoc(buildPreviewDoc(data.code))
      setGenerated(true)
      setActiveTab('preview')

      try {
        const result = await axios.get(`${serverUrl}/api/user/current`, { withCredentials: true })
        if (result.data.user) dispatch(setUserData(result.data.user))
      } catch { /* credits refresh is best-effort */ }

      if (data.websiteId) {
        setWebsiteId(data.websiteId)
        setRedirecting(true)
        redirectTimer.current = setTimeout(() => navigate(`/editor?id=${data.websiteId}`), 4000)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      stopTimers()
      setGenerating(false)
    }
  }

  const stayHere = () => { clearTimeout(redirectTimer.current); setRedirecting(false) }
  const openEditor = () => { clearTimeout(redirectTimer.current); navigate(websiteId ? `/editor?id=${websiteId}` : '/dashboard') }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }

  // Whole site (every page) as a ZIP from the server; plain HTML if unsaved.
  const handleDownload = async () => {
    stayHere()
    if (!websiteId) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([generatedCode], { type: 'text/html' }))
      a.download = 'index.html'; a.click()
      return
    }
    setExporting(true)
    try {
      const res = await axios.get(`${serverUrl}/api/website/${websiteId}/export`, { withCredentials: true, responseType: 'blob' })
      const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || 'website.zip'
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setError('Download failed. You can also export from the editor.')
    } finally {
      setExporting(false)
    }
  }

  const credits       = userData?.credits ?? 0
  const realPct       = Math.min(99, Math.round((elapsedMs / estimatedMs) * 100))
  const remainingSecs = Math.max(0, (estimatedMs - elapsedMs) / 1000)
  const busy          = generating || enhancing || planning
  const canGenerate   = prompt.trim().length > 0 && !busy && (!plan || plan.sections.length > 0)
  const canPlan       = prompt.trim().length > 0 && !busy
  const lowCredits    = credits < GENERATION_COST

  return (
    <div style={{ minHeight: '100vh', ...pageBackground, color: C.text, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <style>{GLOBAL_CSS + `
        @keyframes gw-spin{to{transform:rotate(360deg)}}
        .gw-gen{display:grid;grid-template-columns:minmax(340px,420px) minmax(0,1fr);height:calc(100vh - 66px)}
        .gw-gen-side{overflow-y:auto}
        @media (max-width:900px){.gw-gen{grid-template-columns:1fr;height:auto}.gw-gen-side{overflow:visible;border-right:none !important}.gw-gen-main{min-height:620px}}
        @media (max-width:900px){.gw-gen-actions{position:static !important;margin:0 !important;padding:0 !important;background:none !important}}
        .gw-ex:hover{border-color:${C.violet} !important;color:${C.violet} !important}
      `}</style>

      <AnimatePresence>
        {showFullPreview && previewDoc && <FullPreviewOverlay doc={previewDoc} onClose={() => setShowFullPreview(false)} />}
      </AnimatePresence>

      <AppHeader maxWidth={1600} />

      <div className="gw-gen">
        {/* ── Left: describe + options ── */}
        <aside className="gw-gen-side" style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(10px)', borderRight: `1px solid ${C.border}` }}>
          <div style={{ padding: 'clamp(18px,3vw,26px)', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>Create a new website</h1>
              <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Tell us about your business — we'll plan and build the site.</p>
            </div>

            <AnimatePresence>
              {error && (
                <Motion.div role="alert" initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13.5 }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1 }}>{error}</span>
                  <button aria-label="Dismiss" onClick={() => setError('')} style={{ ...btn.ghost, padding: 2, color: '#991b1b' }}><X size={15} /></button>
                </Motion.div>
              )}
            </AnimatePresence>

            {/* Prompt */}
            <div>
              <label htmlFor="gen-prompt" style={{ ...LBL, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={15} color={C.violet} /> Describe your business</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: prompt.length > PROMPT_CHAR_LIMIT - 100 ? C.red : C.faint }}>{prompt.length}/{PROMPT_CHAR_LIMIT}</span>
              </label>
              <div style={{ borderRadius: 14, border: `1.5px solid ${prompt ? C.violet : C.borderStrong}`, background: C.surface, boxShadow: prompt ? '0 0 0 4px rgba(124,58,237,0.08)' : shadow.sm, transition: 'border-color .2s, box-shadow .2s' }}>
                <textarea id="gen-prompt" ref={textareaRef} value={prompt} onChange={e => updatePromptDraft(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="e.g. A unisex salon in Noida called Glow Studio with haircuts, facials, bridal makeup, prices and online appointments"
                  style={{ display: 'block', width: '100%', minHeight: 110, maxHeight: 220, padding: '14px 14px 6px', border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: C.ink, fontSize: 14.5, lineHeight: 1.6, fontFamily: FONT }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 8px 12px' }}>
                  {isEnhanced
                    ? <span style={{ fontSize: 12, color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Improved by AI — edit freely</span>
                    : <span style={{ fontSize: 12, color: C.faint }}>Ctrl + Enter to build</span>}
                  <button onClick={handleEnhancePrompt} disabled={!prompt.trim() || busy} title="Let AI add useful details to your description (optional)"
                    style={{ ...btn.ghost, marginLeft: 'auto', padding: '6px 10px', fontSize: 13, color: prompt.trim() && !busy ? C.violet : C.faint, background: 'rgba(124,58,237,0.06)', cursor: prompt.trim() && !busy ? 'pointer' : 'not-allowed' }}>
                    {enhancing ? <><Spin size={14} /> Improving…</> : <><Wand2 size={14} /> Improve with AI</>}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 7px', fontSize: 12, color: C.muted, fontWeight: 600 }}>Or start from an example</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXAMPLES.map(([icon, label, text]) => (
                    <button key={label} className="gw-ex" onClick={() => updatePromptDraft(text)} title={text}
                      style={{ padding: '6px 11px', borderRadius: 99, border: `1px solid ${prompt === text ? C.violet : C.border}`, background: prompt === text ? 'rgba(124,58,237,0.07)' : C.surface, color: prompt === text ? C.violet : C.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* How to build */}
            <div>
              <p style={LBL}><LayoutTemplate size={15} color={C.violet} /> How to build</p>
              <div role="radiogroup" aria-label="Generation engine" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { id: 'hybrid', label: 'Templates', badge: 'Recommended', hint: 'Always a complete, tested site' },
                  { id: 'ai',     label: 'Free-form AI', hint: 'More freedom · may be cut short' },
                ].map(o => (
                  <button key={o.id} role="radio" aria-checked={engine === o.id} onClick={() => setEngine(o.id)} disabled={generating} style={choice(engine === o.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{o.label}</span>
                      {o.badge && <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: '#ecfdf5', borderRadius: 99, padding: '1px 7px' }}>{o.badge}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{o.hint}</div>
                  </button>
                ))}
              </div>
              {engine === 'hybrid' && (
                <div role="radiogroup" aria-label="Pages" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  {[
                    { id: 'single', label: 'Single page', icon: FileText, hint: 'Everything on one page' },
                    { id: 'multi',  label: 'Multi-page',  icon: Files,    hint: 'Home + Menu, Gallery, Contact…' },
                  ].map(o => (
                    <button key={o.id} role="radio" aria-checked={pageMode === o.id} onClick={() => setPageMode(o.id)} disabled={generating} style={choice(pageMode === o.id)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: C.ink }}>{React.createElement(o.icon, { size: 15, color: pageMode === o.id ? C.violet : C.muted })}{o.label}</span>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{o.hint}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Optional style + sections */}
            <div>
              <button onClick={() => setShowMore(s => !s)} aria-expanded={showMore}
                style={{ ...btn.ghost, width: '100%', justifyContent: 'space-between', padding: '10px 12px', border: `1px solid ${C.border}`, background: C.surface, borderRadius: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.ink }}><Palette size={15} color={C.violet} /> Style & sections <span style={{ fontWeight: 500, color: C.muted }}>(optional)</span></span>
                <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>
                  {[selectedStyle !== 'auto' && STYLE_PRESETS.find(s => s.id === selectedStyle)?.label, selectedSections.length && `${selectedSections.length} sections`].filter(Boolean).join(' · ') || 'Auto'} {showMore ? '▲' : '▼'}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {showMore && (
                  <Motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    <div style={{ paddingTop: 14, display: 'grid', gap: 16 }}>
                      <div>
                        <p style={{ ...LBL, fontWeight: 600, color: C.text }}>Visual style</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
                          {STYLE_PRESETS.map(s => (
                            <button key={s.id} onClick={() => handleStyleSelect(s.id)} aria-pressed={selectedStyle === s.id} style={{ ...choice(selectedStyle === s.id), padding: '8px 10px' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}><span style={{ color: selectedStyle === s.id ? C.violet : C.faint, marginRight: 6 }}>{s.icon}</span>{s.label}</div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{s.id === 'random' && activePalette ? activePalette.name : s.desc}</div>
                            </button>
                          ))}
                        </div>
                        {selectedStyle === 'random' && activePalette && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface }}>
                            <div style={{ display: 'flex', gap: 4 }}>{[activePalette.primary, activePalette.accent, activePalette.bg].map(c => <span key={c} style={{ width: 16, height: 16, borderRadius: 99, background: c, border: `1px solid ${C.border}` }} />)}</div>
                            <span style={{ flex: 1, fontSize: 13, color: C.text }}>{activePalette.name}</span>
                            <button onClick={rerollPalette} aria-label="Another palette" style={{ ...btn.secondary, padding: 6 }}><Shuffle size={14} /></button>
                          </div>
                        )}
                      </div>
                      <div>
                        <p style={{ ...LBL, fontWeight: 600, color: C.text }}>Must-have sections <span style={{ fontWeight: 500, color: C.muted }}>— picked for you if empty</span></p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {SECTIONS.map(s => {
                            const on = selectedSections.includes(s.id)
                            return (
                              <button key={s.id} onClick={() => toggleSection(s.id)} aria-pressed={on}
                                style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? C.violet : C.border}`, background: on ? 'rgba(124,58,237,0.07)' : C.surface, color: on ? C.violet : C.text }}>
                                {on ? '✓ ' : ''}{s.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </Motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="gw-gen-actions" style={{ display: 'grid', gap: 10, position: 'sticky', bottom: 0, margin: '0 -26px -26px', padding: '14px 26px 18px', background: 'linear-gradient(to top, #fff 82%, rgba(255,255,255,0))' }}>
              {lowCredits && (
                <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                  Building needs {GENERATION_COST} credits and you have {credits}. Reviewing the plan is still free. <button onClick={() => navigate('/pricing')} style={{ ...btn.ghost, display: 'inline', padding: 0, color: C.amber, textDecoration: 'underline', fontSize: 13 }}>Get credits</button>
                </div>
              )}
              {!plan && (
                <button onClick={handlePlan} disabled={!canPlan} title="See the sections and features first, change them, then build"
                  style={{ ...btn.secondary, width: '100%', opacity: canPlan ? 1 : 0.55, cursor: canPlan ? 'pointer' : 'not-allowed' }}>
                  {planning ? <><Spin /> Planning your site…</> : <><ClipboardList size={17} color={C.violet} /> Review the plan first <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>FREE</span></>}
                </button>
              )}
              <button onClick={handleGenerate} disabled={!canGenerate}
                style={{ ...btn.primary, width: '100%', padding: '14px 22px', opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed', boxShadow: canGenerate ? shadow.brand : 'none' }}>
                {generating ? <><Spin /> {GEN_STEPS[Math.min(generatingStep, GEN_STEPS.length - 1)]}</> : <><Rocket size={17} /> {plan ? 'Build from plan' : 'Build my website'}</>}
              </button>
              <p style={{ margin: 0, fontSize: 12.5, color: C.muted, textAlign: 'center' }}>
                {GENERATION_COST} credits per website · <b style={{ color: C.amber }}>{credits}</b> left
              </p>
            </div>
          </div>
        </aside>

        {/* ── Right: plan / progress / preview ── */}
        <main ref={mainRef} className="gw-gen-main" style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {generated && !generating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
              <div role="tablist" aria-label="View" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: C.soft }}>
                {[['preview', 'Preview', Monitor], ['code', 'Code', Code2]].map(([id, label, Icon]) => (
                  <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}
                    style={{ ...btn.ghost, padding: '6px 12px', fontSize: 13, background: activeTab === id ? C.surface : 'transparent', color: activeTab === id ? C.violet : C.muted, boxShadow: activeTab === id ? shadow.sm : 'none' }}>
                    {React.createElement(Icon, { size: 15 })}{label}
                  </button>
                ))}
              </div>
              {activeTab === 'preview' && <button onClick={() => setShowFullPreview(true)} style={{ ...btn.ghost, fontSize: 13 }}><Maximize2 size={15} /> Full page</button>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={handleDownload} disabled={exporting} style={{ ...btn.secondary, padding: '8px 14px', fontSize: 13.5 }}><Download size={15} /> {exporting ? 'Preparing…' : 'Download'}</button>
                <button onClick={openEditor} style={{ ...btn.primary, padding: '8px 16px', fontSize: 13.5, boxShadow: 'none' }}>Open in editor <ArrowRight size={15} /></button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'auto', alignItems: generated && !generating ? 'stretch' : 'center', justifyContent: 'center' }}>
            {/* Plan review */}
            {!generating && !generated && plan && (
              <div style={{ width: '100%', alignSelf: 'flex-start' }}>
                <PlanReview plan={plan} onChange={setPlan} onGenerate={handleGenerate} onDiscard={() => setPlan(null)} credits={credits} cost={GENERATION_COST} generating={generating} />
              </div>
            )}

            {/* Idle */}
            {!generating && !generated && !plan && (
              <Motion.div initial={{ y: 16 }} animate={{ y: 0 }} style={{ textAlign: 'center', maxWidth: 520, padding: 28 }}>
                <div style={{ position: 'relative', width: 'min(100%, 380px)', margin: '0 auto 28px' }}>
                  <div aria-hidden="true" style={{ borderRadius: 18, background: C.surface, border: `1px solid ${C.border}`, boxShadow: shadow.lg, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 5, padding: '9px 12px', background: C.soft, borderBottom: `1px solid ${C.border}` }}>
                      {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: 99, background: c }} />)}
                    </div>
                    <div style={{ padding: 20, display: 'grid', gap: 10 }}>
                      <div style={{ height: 12, width: '45%', borderRadius: 6, background: C.brand, opacity: 0.85 }} />
                      <div style={{ height: 22, width: '80%', borderRadius: 8, background: '#ece9fb' }} />
                      <div style={{ height: 10, width: '65%', borderRadius: 6, background: '#f1effb' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 6 }}>
                        {[0, 1, 2].map(i => <div key={i} style={{ height: 48, borderRadius: 10, background: '#f5f3ff', border: `1px solid ${C.border}` }} />)}
                      </div>
                    </div>
                  </div>
                  <span style={{ position: 'absolute', right: -14, top: -14, width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: C.brand, color: '#fff', boxShadow: shadow.brand }}><Sparkles size={22} /></span>
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: C.ink, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Your website will appear here</h2>
                <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, margin: '0 0 22px' }}>
                  Describe your business, then <b style={{ color: C.text }}>review the plan</b> to check sections for free, or <b style={{ color: C.text }}>build</b> right away.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {['Complete pages every time', 'Booking & contact forms', 'Works on phones', 'Edit without AI'].map(f => (
                    <span key={f} style={{ ...pill(C.violet), fontWeight: 600, letterSpacing: 0, fontSize: 12.5 }}><Check size={13} /> {f}</span>
                  ))}
                </div>
              </Motion.div>
            )}

            {/* Generating */}
            {generating && (
              <Motion.div initial={{ y: 12 }} animate={{ y: 0 }} aria-live="polite" style={{ textAlign: 'center', maxWidth: 420, width: '100%', padding: 28 }}>
                <div style={{ position: 'relative', width: 168, margin: '0 auto 22px' }}>
                  <CircularProgress pct={realPct} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{realPct}%</span>
                    <span style={{ fontSize: 12.5, color: C.muted }}>{remainingSecs > 1 ? `~${formatTime(remainingSecs)} left` : 'almost done…'}</span>
                  </div>
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: C.ink, margin: '0 0 16px' }}>Building your website</h3>
                <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'grid', gap: 6, textAlign: 'left' }}>
                  {GEN_STEPS.map((step, i) => {
                    const done = i < generatingStep, active = i === generatingStep
                    return (
                      <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: active ? C.surface : 'transparent', border: `1px solid ${active ? C.border : 'transparent'}`, boxShadow: active ? shadow.sm : 'none', opacity: done || active ? 1 : 0.45 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', flexShrink: 0, background: done ? C.green : active ? 'rgba(124,58,237,0.1)' : C.soft, color: done ? '#fff' : C.violet, fontSize: 11, fontWeight: 700 }}>
                          {done ? <Check size={13} /> : active ? <Spin size={13} /> : i + 1}
                        </span>
                        <span style={{ fontSize: 13.5, color: done ? C.text : active ? C.ink : C.muted, fontWeight: active ? 700 : 500 }}>{step}</span>
                      </li>
                    )
                  })}
                </ol>
                <AnimatePresence mode="wait">
                  <Motion.div key={tipIndex} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -5, opacity: 0 }} transition={{ duration: 0.3 }}
                    style={{ padding: '12px 14px', borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13.5, color: C.text, lineHeight: 1.6, textAlign: 'left' }}>
                    {TIPS[tipIndex]}
                  </Motion.div>
                </AnimatePresence>
              </Motion.div>
            )}

            {/* Generated */}
            {generated && !generating && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: activeTab === 'preview' ? 'clamp(10px,2vw,20px)' : 0, minHeight: 0 }}>
                {activeTab === 'preview' ? (
                  <div style={{ flex: 1, minHeight: 480, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: shadow.lg, background: '#fff', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', background: C.soft, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                      {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: 99, background: c }} />)}
                    </div>
                    <iframe srcDoc={previewDoc} style={{ flex: 1, width: '100%', border: 'none', background: 'white' }} title="Generated website preview" sandbox={PREVIEW_SANDBOX} />
                  </div>
                ) : (
                  <div style={{ flex: 1, minHeight: 480, overflow: 'hidden' }}><CodeViewer code={generatedCode} /></div>
                )}
              </div>
            )}

            {/* Success toast with redirect */}
            <AnimatePresence>
              {generated && redirecting && (
                <Motion.div role="status" initial={{ x: '-50%', y: 20, opacity: 0 }} animate={{ x: '-50%', y: 0, opacity: 1 }} exit={{ x: '-50%', y: 20, opacity: 0 }}
                  style={{ position: 'absolute', bottom: 22, left: '50%', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 16px', borderRadius: 14, background: C.ink, color: '#fff', boxShadow: shadow.lg, fontSize: 14, whiteSpace: 'nowrap' }}>
                  <Check size={17} color="#4ade80" /> Website saved — opening the editor…
                  <button onClick={stayHere} style={{ ...btn.ghost, padding: '6px 10px', color: '#fff', background: 'rgba(255,255,255,0.12)', fontSize: 13 }}>Stay here</button>
                </Motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
