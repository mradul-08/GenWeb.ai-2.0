import React, { useState, useEffect } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import { Zap, Check, Infinity as InfinityIcon, ShieldCheck, Smartphone, ShoppingCart, CreditCard, Rocket, Plus, X, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { serverUrl } from '../config'
import { setUserData } from '../redux/userSlice'
import AppHeader from '../components/AppHeader'
import { C, FONT, GLOBAL_CSS, pageBackground, btn, card, shadow, pill } from '../theme'
import IconTile from '../components/IconTile'

/* ── Load Razorpay SDK ── */
function loadRazorpay() {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload  = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

/* ── Credit packs (the server's config/creditPacks.js is the source of truth) ── */
const PACKS = [
  { id: 'starter', credits: 100,  price: 499,  label: 'Starter', perCredit: 4.99, popular: false, color: '#9a8066', desc: 'Try it out' },
  { id: 'basic',   credits: 300,  price: 999,  label: 'Basic',   perCredit: 3.33, popular: false, color: '#a85f48', desc: 'For a few sites' },
  { id: 'pro',     credits: 700,  price: 1999, label: 'Pro',     perCredit: 2.85, popular: true,  color: '#687b68', desc: 'Most popular choice' },
  { id: 'growth',  credits: 1500, price: 3999, label: 'Growth',  perCredit: 2.67, popular: false, color: '#4e6251', desc: 'For regular work' },
  { id: 'agency',  credits: 3000, price: 6999, label: 'Agency',  perCredit: 2.33, popular: false, color: '#a85f48', desc: 'For power users' },
]
const COST = 50

const FAQS = [
  { q: 'What uses credits?', a: `Building a website or an AI edit costs ${COST} credits each. Reviewing the plan, improving your description with AI, the design editor, version history, publishing and ZIP export are free.` },
  { q: 'Do credits expire?', a: 'No. Credits stay on your account until you use them — no monthly reset.' },
  { q: 'What payment methods work?', a: 'UPI (GPay, PhonePe, Paytm QR), credit and debit cards (Visa, Mastercard, RuPay), net banking and wallets — through Razorpay.' },
  { q: 'Is payment secure?', a: 'Payments are processed by Razorpay. GenWeb never sees or stores your card details.' },
  { q: 'What if a payment fails?', a: 'A failed payment is not charged. If money was deducted but credits were not added, contact us with the payment ID and we will sort it out.' },
  { q: 'Can I get a refund?', a: 'Credits are non-refundable once added. If something went wrong during purchase, contact us within 48 hours.' },
]

const PERKS = [
  { icon: Zap,          label: 'Instant credits', desc: 'Added right after payment' },
  { icon: InfinityIcon, label: 'Never expire',    desc: 'No monthly reset' },
  { icon: ShieldCheck,  label: 'Secure payments', desc: 'Razorpay checkout' },
  { icon: Smartphone,   label: 'UPI & cards',     desc: 'GPay, PhonePe, all cards' },
]

const h2 = { margin: '0 0 10px', fontSize: 'clamp(1.6rem,3.5vw,2.3rem)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t) }, [onClose])
  const ok = type === 'success'
  return (
    <Motion.div role="status" initial={{ opacity: 0, y: 40, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 40, x: '-50%' }}
      style={{ position: 'fixed', bottom: 28, left: '50%', zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 12px 16px', borderRadius: 14, background: ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`, color: ok ? '#065f46' : '#991b1b', boxShadow: shadow.lg, maxWidth: 'calc(100vw - 32px)', fontFamily: FONT }}>
      {ok ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
      <span style={{ fontSize: 14, fontWeight: 600 }}>{msg}</span>
      <button aria-label="Dismiss" onClick={onClose} style={{ ...btn.ghost, padding: 2, color: 'inherit' }}><X size={16} /></button>
    </Motion.div>
  )
}

function FaqItem({ q, a, open, onToggle, id }) {
  return (
    <div style={{ ...card, boxShadow: 'none', borderRadius: 14, borderColor: open ? C.violet : C.border }}>
      <button onClick={onToggle} aria-expanded={open} aria-controls={id}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '17px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{q}</span>
        <Plus size={19} color={open ? C.violet : C.muted} style={{ flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <Motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, color: C.muted, lineHeight: 1.7 }}>{a}</p>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PackCard({ pack, onBuy, loading }) {
  const isLoading = loading === pack.id
  const disabled = !!loading
  const savings = pack.id !== 'starter' ? Math.round(100 - (pack.price / (pack.credits * 4.99)) * 100) : 0
  const sites = Math.floor(pack.credits / COST)
  return (
    <div className="gw-pack" style={{ ...card, position: 'relative', padding: '26px 22px', display: 'flex', flexDirection: 'column', gap: 18, height: '100%', border: pack.popular ? `2px solid ${pack.color}` : card.border, boxShadow: pack.popular ? `0 20px 50px ${pack.color}26` : shadow.md }}>
      {pack.popular && (
        <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', padding: '5px 14px', borderRadius: 99, background: C.brand, color: '#fff', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', whiteSpace: 'nowrap', boxShadow: shadow.brand }}>★ MOST POPULAR</span>
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: pack.color }}>{pack.label}</span>
          {savings > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 99, padding: '2px 9px' }}>Save {savings}%</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.muted }}>₹</span>
          <span style={{ fontSize: 40, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{pack.price.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }}>one-time</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.muted }}>{pack.desc}</p>
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 12, background: `${pack.color}0f`, border: `1px solid ${pack.color}2e`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={18} color={pack.color} fill={pack.color} />
          <span><b style={{ fontSize: 20, color: C.ink }}>{pack.credits.toLocaleString('en-IN')}</b> <span style={{ fontSize: 13, color: C.muted }}>credits</span></span>
        </span>
        <span style={{ fontSize: 12.5, color: C.muted }}>₹{pack.perCredit.toFixed(2)}/credit</span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 9 }}>
        {[`Up to ${sites} websites or AI edits`, 'Plans, design editor & export free', 'Credits never expire'].map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: C.text }}><Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} /> {f}</li>
        ))}
      </ul>

      <button onClick={() => onBuy(pack.id)} disabled={disabled}
        style={{ ...(pack.popular ? btn.primary : btn.secondary), marginTop: 'auto', width: '100%', padding: '12px 14px', fontSize: 14.5, opacity: disabled && !isLoading ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...(pack.popular ? {} : { color: pack.color, borderColor: `${pack.color}66` }) }}>
        {isLoading ? <><Loader2 size={16} style={{ animation: 'gw-spin 1s linear infinite' }} /> Processing…</> : <>Buy for ₹{pack.price.toLocaleString('en-IN')}</>}
      </button>
    </div>
  )
}

export default function Pricing() {
  const navigate   = useNavigate()
  const dispatch   = useDispatch()
  const [params]   = useSearchParams()
  const { userData } = useSelector(s => s.user)

  const [loading, setLoading] = useState(null)
  const [toast,   setToast]   = useState(null)
  const [openFaq, setOpenFaq] = useState(0)
  const closeToast = React.useCallback(() => setToast(null), [])

  // Handle return from payment (success/cancel)
  useEffect(() => {
    if (params.get('success') === 'true') {
      const credits = params.get('credits')
      setToast({ msg: `${credits || 'Credits'} credits added to your account!`, type: 'success' })
      axios.get(`${serverUrl}/api/user/current`, { withCredentials: true })
        .then(r => { if (r.data.user) dispatch(setUserData(r.data.user)) }).catch(() => {})
      window.history.replaceState({}, '', '/pricing')
    }
  }, [params, dispatch])

  /* ── Buy handler ── */
  const handleBuy = async (packId) => {
    if (!userData) { navigate('/login'); return }
    setLoading(packId)

    try {
      // 1. Load Razorpay SDK
      const ok = await loadRazorpay()
      if (!ok) { setToast({ msg: 'Failed to load payment SDK. Check internet connection.', type: 'error' }); return }

      // 2. Create order on backend
      const { data } = await axios.post(`${serverUrl}/api/payment/create-order`, { packId }, { withCredentials: true })
      if (!data.success) { setToast({ msg: data.message || 'Could not create order', type: 'error' }); return }

      // 3. Open Razorpay popup
      await new Promise((resolve) => {
        const rzp = new window.Razorpay({
          key:         data.key,
          order_id:    data.order.id,
          amount:      data.order.amount,
          currency:    'INR',
          name:        'GenWeb.ai',
          description: `${data.pack.credits} AI Credits`,
          image:       '/favicon.svg',
          prefill: {
            name:  data.user.name,
            email: data.user.email,
          },
          theme: { color: '#687b68' },
          modal: {
            ondismiss: () => {
              setToast({ msg: 'Payment cancelled.', type: 'error' })
              resolve()
            },
          },
          handler: async (response) => {
            try {
              // 4. Verify payment on backend
              const verify = await axios.post(
                `${serverUrl}/api/payment/verify`,
                {
                  razorpay_order_id:   response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature:  response.razorpay_signature,
                },
                { withCredentials: true }
              )
              if (verify.data.success) {
                const r = await axios.get(`${serverUrl}/api/user/current`, { withCredentials: true })
                if (r.data.user) dispatch(setUserData(r.data.user))
                setToast({ msg: `${data.pack.credits} credits added! Total: ${verify.data.newTotal}`, type: 'success' })
              } else {
                setToast({ msg: verify.data.message || 'Verification failed', type: 'error' })
              }
            } catch {
              setToast({ msg: 'Payment verified but update failed. Contact support.', type: 'error' })
            }
            resolve()
          },
        })
        rzp.open()
      })
    } catch (e) {
      setToast({ msg: e.response?.data?.message || 'Payment error. Try again.', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const credits = userData?.credits ?? 0

  return (
    <div style={{ minHeight: '100vh', ...pageBackground, color: C.text, fontFamily: FONT, overflowX: 'hidden' }}>
      <style>{GLOBAL_CSS + `@keyframes gw-spin{to{transform:rotate(360deg)}}.gw-pack{transition:transform .2s}.gw-pack:hover{transform:translateY(-4px)}`}</style>
      <AnimatePresence>{toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}</AnimatePresence>
      <AppHeader />

      <main>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: 'clamp(28px,5vw,52px) clamp(20px,5vw,60px) clamp(22px,4vw,34px)' }}>
          <span style={{ ...pill(C.violet), marginBottom: 12 }}><Zap size={13} /> PAY AS YOU GO</span>
          <h1 style={{ maxWidth: 850, margin: '0 auto 12px', fontSize: 'clamp(2rem,5vw,3.25rem)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.04em', color: C.ink }}>
            Simple credit pricing.{' '}
            <span style={{ background: C.brandText, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>No subscriptions.</span>
          </h1>
          <p style={{ margin: '0 auto 20px', fontSize: 'clamp(15px,2.2vw,17.5px)', color: C.muted, lineHeight: 1.6, maxWidth: 560 }}>
            Buy credits once and use them whenever you like. Building a website costs {COST} credits — planning, design edits and export are free.
          </p>

          {userData ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '10px 12px 10px 18px', borderRadius: 16, background: C.surface, border: `1px solid ${C.border}`, boxShadow: shadow.md, marginBottom: 20 }}>
              <Zap size={18} color={C.terracotta} fill="#d69a82" />
              <span style={{ fontSize: 15, color: C.text }}>You have <b style={{ color: C.ink, fontSize: 17 }}>{credits}</b> credits · enough for <b style={{ color: C.ink }}>{Math.floor(credits / COST)}</b> {Math.floor(credits / COST) === 1 ? 'website' : 'websites'}</span>
              <button onClick={() => navigate('/dashboard')} style={{ ...btn.secondary, padding: '7px 14px', fontSize: 13.5 }}>My dashboard</button>
            </div>
          ) : (
            <p style={{ margin: '0 0 30px', fontSize: 15, color: C.text }}>New accounts get <b style={{ color: C.ink }}>100 free credits</b> — no card needed.</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {PERKS.map(({ icon, label, desc }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 14, background: C.surface, border: `1px solid ${C.border}` }}>
                <IconTile icon={icon} color={C.sage} size={18} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Packs */}
        <section id="packs" style={{ maxWidth: 1240, margin: '0 auto', padding: '14px clamp(16px,4vw,40px) 70px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,215px), 1fr))', gap: 18, alignItems: 'stretch' }}>
            {PACKS.map(pack => <PackCard key={pack.id} pack={pack} onBuy={handleBuy} loading={loading} />)}
          </div>
          <div style={{ marginTop: 28, padding: '16px 22px', borderRadius: 16, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 22px' }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: '0.08em' }}>PAY WITH RAZORPAY</span>
            {['UPI / QR scan', 'Credit & debit cards', 'Net banking', 'Wallets'].map(m => (
              <span key={m} style={{ fontSize: 13.5, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} color={C.green} /> {m}</span>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 clamp(16px,4vw,40px) 70px' }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <span style={{ ...pill(C.blue), marginBottom: 12 }}>HOW IT WORKS</span>
            <h2 style={h2}>Get credits in a minute</h2>
          </div>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
            {[
              { icon: ShoppingCart, title: 'Pick a pack',     desc: 'Choose the credits you need — from 100.' },
              { icon: CreditCard,   title: 'Pay your way',    desc: 'UPI, card or net banking in the Razorpay window.' },
              { icon: Zap,          title: 'Credits added',   desc: 'They appear on your account right after payment.' },
              { icon: Rocket,       title: 'Build',           desc: `Each website or AI edit uses ${COST} credits.` },
            ].map((s, i) => (
              <li key={s.title} style={{ ...card, padding: '22px 20px', position: 'relative' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 16, right: 18, fontSize: 30, fontWeight: 800, color: '#e4ded3' }}>{i + 1}</span>
                <IconTile icon={s.icon} color={[C.sage, C.terracotta, C.amber, C.green][i]} />
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: C.ink }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* How many */}
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(16px,4vw,40px) 70px' }}>
          <div style={{ ...card, padding: 'clamp(24px,4vw,36px)' }}>
            <h2 style={{ ...h2, fontSize: 'clamp(1.3rem,3vw,1.7rem)' }}>How many credits do I need?</h2>
            <p style={{ margin: '0 0 22px', fontSize: 14.5, color: C.muted, lineHeight: 1.7 }}>
              Building a website or an AI edit = <b style={{ color: C.violet }}>{COST} credits</b>. Plans, “Improve with AI”, the design editor, history, publishing and export are <b style={{ color: C.green }}>free</b>.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,250px), 1fr))', gap: 12 }}>
              {[
                { label: '💡 Just exploring', desc: '2–6 websites',   pack: 'Starter or Basic' },
                { label: '🏪 My own business', desc: '10–14 websites or edits', pack: 'Pro' },
                { label: '💼 Client work',     desc: '30 websites or edits',   pack: 'Growth' },
                { label: '🏢 Agency',          desc: '60 websites or edits',   pack: 'Agency' },
              ].map(item => (
                <div key={item.label} style={{ padding: 16, borderRadius: 14, background: C.soft, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13.5, color: C.muted }}>{item.desc} → <b style={{ color: C.violet }}>{item.pack}</b></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(16px,4vw,40px) 70px' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <span style={{ ...pill(C.green), marginBottom: 12 }}>FAQ</span>
            <h2 style={h2}>Common questions</h2>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {FAQS.map((f, i) => <FaqItem key={f.q} id={`faq-${i}`} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />)}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '0 clamp(16px,5vw,60px) 70px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 28, background: C.brand, padding: 'clamp(36px,6vw,56px) clamp(22px,5vw,56px)', textAlign: 'center', color: '#fff', boxShadow: shadow.brand, position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ ...h2, color: '#fff' }}>{userData ? 'Ready to build your next website?' : 'Start building today'}</h2>
              <p style={{ margin: '0 auto 26px', fontSize: 15.5, color: 'rgba(255,255,255,0.9)', maxWidth: 440, lineHeight: 1.7 }}>
                {userData ? 'Describe your business and see the plan for free.' : 'New accounts get 100 free credits. No card needed to start.'}
              </p>
              <button onClick={() => navigate(userData ? '/generate' : '/login')} style={{ ...btn.secondary, border: 'none', color: C.violet, padding: '14px 28px', fontSize: 16, fontWeight: 700 }}>
                {userData ? 'Build a new website' : 'Start free — 100 credits'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: 'clamp(20px,3vw,30px) clamp(20px,5vw,60px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>GenWeb<span style={{ color: C.violet }}>.ai</span></span>
        <nav aria-label="Footer" style={{ display: 'flex', gap: 4 }}>
          {[['Home', '/'], userData ? ['Dashboard', '/dashboard'] : ['Sign in', '/login']].map(([l, p]) => (
            <a key={l} href={p} onClick={e => { e.preventDefault(); navigate(p) }} style={{ fontSize: 14, color: C.muted, textDecoration: 'none', padding: '4px 10px' }}>{l}</a>
          ))}
        </nav>
        <span style={{ fontSize: 13, color: C.muted }}>© {new Date().getFullYear()} GenWeb.ai · Payments by Razorpay</span>
      </footer>
    </div>
  )
}
