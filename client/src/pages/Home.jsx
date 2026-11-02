import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { useSelector, useDispatch } from 'react-redux'
import { setUserData } from '../redux/userSlice'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { serverUrl } from '../config'
import { Hero, Examples, HowItWorks, Features, FinalCta, SiteFooter } from '../components/Landing'
import { LogOut, X, Menu, Zap } from "lucide-react"

/* ── Animated gradient orb background ── */
function OrbBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Top-left violet orb */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '60vw', height: '60vw', maxWidth: 700, maxHeight: 700,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'orbFloat1 12s ease-in-out infinite',
      }} />
      {/* Bottom-right cyan orb */}
      <div style={{
        position: 'absolute', bottom: '-15%', right: '-5%',
        width: '50vw', height: '50vw', maxWidth: 600, maxHeight: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(59,130,246,0.06) 50%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'orbFloat2 15s ease-in-out infinite',
      }} />
      {/* Center subtle pink orb */}
      <div style={{
        position: 'absolute', top: '40%', left: '30%',
        width: '40vw', height: '40vw', maxWidth: 500, maxHeight: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(244,114,182,0.06) 0%, transparent 60%)',
        filter: 'blur(60px)',
        animation: 'orbFloat3 18s ease-in-out infinite',
      }} />
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />
      <style>{`
        @keyframes orbFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(3%,5%) scale(1.05)} 66%{transform:translate(-2%,3%) scale(0.97)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-4%,-3%) scale(1.08)} 70%{transform:translate(2%,-5%) scale(0.95)} }
        @keyframes orbFloat3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(3%,-4%)} }
      `}</style>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { userData } = useSelector(state => state.user)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try {
      await signOut(auth).catch(() => {})
      await fetch(`${serverUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch (err) { console.log(err) }
    dispatch(setUserData(null))
    navigate('/')
  }


  return (
    <div style={{
      minHeight: '100vh',
      background: '#040408',
      color: 'white',
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      overflowX: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #040408; } ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 3px; }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.4} 100%{transform:scale(1.6);opacity:0} }
      `}</style>

      <OrbBackground />

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
          height: 64,
          background: scrolled ? 'rgba(4,4,8,0.95)' : 'rgba(4,4,8,0.6)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 clamp(16px,4vw,48px)',
          transition: 'all 0.3s ease',
          boxShadow: scrolled ? '0 4px 32px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        {/* Logo */}
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 0 20px rgba(139,92,246,0.4)',
          }}>✦</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
            GenWeb<span style={{ color: '#8b5cf6' }}>.ai</span>
          </span>
        </div>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="desktop-nav">
          <Link to="/pricing" style={{
            fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none', padding: '6px 14px', borderRadius: 8,
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
          >Pricing</Link>

          {userData && (
            <div onClick={() => navigate('/pricing')} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,191,36,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,191,36,0.08)'}
            >
              <Zap size={13} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>{userData?.credits ?? 0}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>credits</span>
            </div>
          )}

          {userData ? (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setDropdownOpen(p => !p)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                  border: dropdownOpen ? '2px solid rgba(139,92,246,0.7)' : '2px solid transparent',
                  padding: 0, background: 'none', overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  boxShadow: dropdownOpen ? '0 0 16px rgba(139,92,246,0.4)' : 'none',
                }}
              >
                {userData.avatar
                  ? <img src={userData.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                      {userData.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                }
              </motion.button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', top: 46, right: 0,
                      width: 230,
                      background: 'rgba(8,8,16,0.98)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 16,
                      boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
                      backdropFilter: 'blur(24px)',
                      overflow: 'hidden', zIndex: 300,
                    }}
                  >
                    {/* User info */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {userData.avatar
                        ? <img src={userData.avatar} alt="avatar" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.4)' }} />
                        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                            {userData.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                      }
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userData.name || 'User'}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userData.email}</p>
                      </div>
                    </div>

                    {[
                      { icon: '⚡', label: 'Dashboard', action: () => { navigate('/dashboard'); setDropdownOpen(false) } },
                      { icon: '💎', label: 'Upgrade Plan', action: () => { navigate('/pricing'); setDropdownOpen(false) } },
                    ].map((item, i) => (
                      <div key={i} onClick={item.action} style={{ padding: '11px 16px', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      ><span>{item.icon}</span>{item.label}</div>
                    ))}

                    <div onClick={handleLogout} style={{ padding: '11px 16px', cursor: 'pointer', fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    ><LogOut size={14} />Sign out</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/login')}
              style={{
                padding: '8px 20px', borderRadius: 10,
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 0 20px rgba(139,92,246,0.3)',
              }}
            >Get Started</motion.button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(p => !p)}
            style={{ display: 'none', background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}
            className="hamburger-btn"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              position: 'fixed', top: 64, left: 0, right: 0, zIndex: 190,
              background: 'rgba(4,4,8,0.98)', backdropFilter: 'blur(20px)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {userData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 8 }}>
                  {userData.avatar
                    ? <img src={userData.avatar} alt="avatar" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{userData.name?.charAt(0).toUpperCase()}</div>
                  }
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>{userData.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{userData.email}</p>
                  </div>
                </div>
              )}
              {userData && <div onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false) }} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>⚡ Dashboard</div>}
              <div onClick={() => { navigate('/pricing'); setMobileMenuOpen(false) }} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Pricing</div>
              {userData
                ? <div onClick={handleLogout} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, color: '#f87171', marginTop: 4 }}>Sign out</div>
                : <button onClick={() => { navigate('/login'); setMobileMenuOpen(false) }} style={{ margin: '8px 0 0', padding: 12, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Get Started</button>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Landing sections (components/Landing.jsx) */}
      <Hero userData={userData} navigate={navigate} />
      <Examples userData={userData} navigate={navigate} />
      <HowItWorks />
      <Features />
      <FinalCta userData={userData} navigate={navigate} />
      <SiteFooter navigate={navigate} />

      <style>{`
        @media (max-width: 640px) {
          .desktop-nav > *:not(.hamburger-btn) { display: none !important; }
          .hamburger-btn { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
