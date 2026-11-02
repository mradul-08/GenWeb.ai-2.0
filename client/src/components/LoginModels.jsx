import React, { useState } from 'react'
import { motion as Motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { auth, provider } from "../firebase"
import { useDispatch } from 'react-redux'
import { setUserData } from '../redux/userSlice'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from "firebase/auth"
import { User, Mail, Lock, Eye, EyeOff, AlertTriangle, MailCheck, X, Check, Loader2, ArrowLeft } from 'lucide-react'
import { serverUrl } from '../config'
import { C, FONT, GLOBAL_CSS, pageBackground, btn, card, shadow } from '../theme'

const FIREBASE_ERRORS = {
  'auth/invalid-credential':     'Incorrect email or password.',
  'auth/wrong-password':         'Incorrect email or password.',
  'auth/user-not-found':         'No account found with this email.',
  'auth/email-already-in-use':   'An account with this email already exists. Sign in instead.',
  'auth/invalid-email':          'Please enter a valid email address.',
  'auth/weak-password':          'Password must be at least 6 characters.',
  'auth/too-many-requests':      'Too many attempts. Please wait a minute and try again.',
  'auth/popup-closed-by-user':   'Google sign-in was cancelled.',
  'auth/network-request-failed': 'Network error. Check your connection.',
}
const authErrorMessage = (err) => FIREBASE_ERRORS[err?.code] || err?.message || 'Something went wrong.'

// Exchanges a Firebase ID token for our session cookie.
async function createServerSession(path, firebaseUser, extra = {}) {
  const idToken = await firebaseUser.getIdToken()
  const response = await fetch(`${serverUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken, ...extra }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Sign-in failed')
  return data
}

const PERKS = [
  'Complete websites for your business, single or multi-page',
  'See and change the plan before anything is built — free',
  'Edit theme, sections and text without AI or credits',
  'Publish with one click or download a ZIP',
]

export default function Login() {
  const [isLogin, setIsLogin]         = useState(true)
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [name, setName]               = useState('')
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')
  const [showPass, setShowPass]       = useState(false)

  const navigate = useNavigate()
  const dispatch = useDispatch()
  const hasIdea = !!sessionStorage.getItem('pendingPrompt')

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields.'); return }
    if (!isLogin && !name.trim()) { setError('Please enter your name.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError(''); setNotice('')
    try {
      if (!isLogin) {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(user, { displayName: name.trim() })
        await sendEmailVerification(user)
        await signOut(auth)
        setIsLogin(true); setPassword('')
        setNotice(`We sent a verification link to ${email.trim()}. Verify your email, then sign in.`)
        return
      }

      const { user } = await signInWithEmailAndPassword(auth, email.trim(), password)
      if (!user.emailVerified) {
        await sendEmailVerification(user).catch(() => {})
        await signOut(auth)
        setNotice('Your email is not verified yet. We sent a new verification link — check your inbox.')
        return
      }
      const data = await createServerSession('email', user)
      dispatch(setUserData(data.user))
      // An idea typed on the landing page continues straight to generation.
      navigate(sessionStorage.getItem('pendingPrompt') ? '/generate' : '/dashboard')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError(''); setNotice('')
    if (!email.trim()) { setError('Enter your email above, then click "Forgot password?".'); return }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setNotice(`If an account exists for ${email.trim()}, a password reset link has been sent.`)
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  const handleGoogleAuth = async () => {
    setError(''); setNotice('')
    setGoogleLoading(true)
    try {
      const { user } = await signInWithPopup(auth, provider)
      const data = await createServerSession('google', user)
      dispatch(setUserData(data.user))
      // An idea typed on the landing page continues straight to generation.
      navigate(sessionStorage.getItem('pendingPrompt') ? '/generate' : '/dashboard')
    } catch (err) {
      console.error('GOOGLE ERROR =', err)
      setError(authErrorMessage(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  const submit = (e) => { e.preventDefault(); handleEmailAuth() }
  const switchMode = (m) => { setIsLogin(m); setError(''); setNotice(''); setName(''); setEmail(''); setPassword('') }
  const busy = loading || googleLoading

  return (
    <div style={{ minHeight: '100vh', ...pageBackground, color: C.text, fontFamily: FONT, display: 'flex' }}>
      <style>{GLOBAL_CSS + `
        @keyframes gw-spin{to{transform:rotate(360deg)}}
        .gw-field{width:100%;padding:13px 14px 13px 44px;border-radius:12px;border:1.5px solid ${C.borderStrong};background:${C.surface};color:${C.ink};font-size:15px;font-family:${FONT};outline:none;transition:border-color .2s, box-shadow .2s}
        .gw-field:focus{border-color:${C.violet};box-shadow:0 0 0 4px rgba(104,123,104,0.1)}
        .gw-google:hover:not(:disabled){border-color:${C.violet} !important;background:${C.soft} !important}
        @media (max-width:900px){.gw-login-side{display:none !important}}
        @media (max-width:480px){.gw-login-card{padding:26px 20px !important}}
      `}</style>

      {/* Left: what you get */}
      <aside className="gw-login-side" style={{ width: '46%', padding: 'clamp(32px,5vw,64px)', display: 'flex', flexDirection: 'column', background: C.brand, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <Link to="/" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#fff' }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 16 }}>✦</span>
          <span style={{ fontSize: 19, fontWeight: 800 }}>GenWeb.ai</span>
        </Link>
        <div style={{ position: 'relative', margin: 'auto 0', maxWidth: 460 }}>
          <h1 style={{ fontSize: 'clamp(2rem,3.4vw,2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 16px' }}>Describe your business. Get a complete website.</h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(255,255,255,0.88)', margin: '0 0 28px' }}>Free to start. No code needed.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {PERKS.map(p => (
              <li key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.5 }}>
                <span style={{ width: 22, height: 22, borderRadius: 99, background: 'rgba(255,255,255,0.22)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check size={13} /></span>{p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right: form */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'clamp(20px,4vw,56px)' }}>
        <Link to="/" style={{ ...btn.ghost, alignSelf: 'flex-start', textDecoration: 'none', color: C.muted, marginBottom: 12 }}><ArrowLeft size={16} /> Back to home</Link>
        <div className="gw-login-card" style={{ ...card, boxShadow: shadow.lg, width: '100%', maxWidth: 440, padding: '36px 34px', borderRadius: 24 }}>
          <div role="tablist" aria-label="Account" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: C.soft, marginBottom: 26 }}>
            {[[true, 'Sign in'], [false, 'Create account']].map(([m, label]) => (
              <button key={label} role="tab" aria-selected={isLogin === m} onClick={() => switchMode(m)}
                style={{ ...btn.ghost, flex: 1, justifyContent: 'center', padding: '9px 10px', background: isLogin === m ? C.surface : 'transparent', color: isLogin === m ? C.violet : C.muted, boxShadow: isLogin === m ? shadow.sm : 'none' }}>{label}</button>
            ))}
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{isLogin ? 'Welcome back 👋' : 'Create your free account'}</h2>
          <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 22px', lineHeight: 1.6 }}>
            {hasIdea ? 'Sign in and we’ll start building your idea right away.' : isLogin ? 'Sign in to continue to your websites.' : 'Build your first website in a few minutes.'}
          </p>

          <AnimatePresence>
            {error && (
              <Motion.div role="alert" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, padding: '11px 12px', marginBottom: 16, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13.5, lineHeight: 1.5 }}>
                  <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ flex: 1 }}>{error}</span>
                  <button aria-label="Dismiss" onClick={() => setError('')} style={{ ...btn.ghost, padding: 0, color: '#991b1b' }}><X size={15} /></button>
                </div>
              </Motion.div>
            )}
            {notice && (
              <Motion.div role="status" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, padding: '11px 12px', marginBottom: 16, borderRadius: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13.5, lineHeight: 1.5 }}>
                  <MailCheck size={17} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ flex: 1 }}>{notice}</span>
                  <button aria-label="Dismiss" onClick={() => setNotice('')} style={{ ...btn.ghost, padding: 0, color: '#065f46' }}><X size={15} /></button>
                </div>
              </Motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 14 }}>
            {!isLogin && (
              <Field id="login-name" label="Full name" icon={User}>
                <input id="login-name" className="gw-field" type="text" autoComplete="name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              </Field>
            )}
            <Field id="login-email" label="Email address" icon={Mail}>
              <input id="login-email" className="gw-field" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field id="login-pass" label="Password" icon={Lock}
              extra={isLogin && <button type="button" onClick={handleForgotPassword} style={{ ...btn.ghost, padding: 0, fontSize: 13, color: C.violet }}>Forgot password?</button>}>
              <input id="login-pass" className="gw-field" style={{ paddingRight: 46 }} type={showPass ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', ...btn.ghost, padding: 6, color: C.muted }}>{showPass ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </Field>
            <button type="submit" disabled={busy} style={{ ...btn.primary, width: '100%', padding: '14px 20px', marginTop: 6, opacity: busy ? 0.75 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {loading ? <><Loader2 size={17} style={{ animation: 'gw-spin 1s linear infinite' }} />{isLogin ? 'Signing in…' : 'Creating account…'}</> : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <span style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: '0.08em' }}>OR</span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <button className="gw-google" onClick={handleGoogleAuth} disabled={busy} style={{ ...btn.secondary, width: '100%', padding: '13px 20px', opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {googleLoading ? <><Loader2 size={17} style={{ animation: 'gw-spin 1s linear infinite' }} /> Opening Google…</> : <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>}
          </button>

          <p style={{ textAlign: 'center', fontSize: 14, color: C.muted, margin: '22px 0 0' }}>
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => switchMode(!isLogin)} style={{ ...btn.ghost, display: 'inline', padding: 0, fontSize: 14, color: C.violet, fontWeight: 700 }}>{isLogin ? 'Sign up free' : 'Sign in'}</button>
          </p>
        </div>
      </main>
    </div>
  )
}

function Field({ id, label, icon, extra, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <label htmlFor={id} style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{label}</label>
        {extra}
      </div>
      <div style={{ position: 'relative' }}>
        {React.createElement(icon, { size: 17, color: C.faint, style: { position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } })}
        {children}
      </div>
    </div>
  )
}
