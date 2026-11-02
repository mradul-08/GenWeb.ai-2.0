import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { serverUrl } from '../config'
import { setUserData } from '../redux/userSlice'
import { LayoutDashboard, Plus, LogOut, Menu, X, Zap, Gem } from 'lucide-react'
import { C, FONT, btn, shadow } from '../theme'

// The same header on every app page: Dashboard and "New website" are always
// one click away for signed-in users.

function Avatar({ user, size = 34 }) {
  if (user.avatar) return <img src={user.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  return <span style={{ width: size, height: size, borderRadius: '50%', background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.42, fontWeight: 700 }}>{(user.name || 'U').charAt(0).toUpperCase()}</span>
}

export default function AppHeader({ maxWidth = 1200 }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dispatch = useDispatch()
  const { userData } = useSelector(s => s.user)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (to) => { setMenuOpen(false); setMobileOpen(false); navigate(to) }
  const logout = async () => {
    try {
      await signOut(auth).catch(() => {})
      await fetch(`${serverUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch { /* signed out locally either way */ }
    dispatch(setUserData(null))
    go('/')
  }

  const links = userData
    ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: '/pricing', label: 'Pricing', icon: Gem }]
    : [{ to: '/#examples', label: 'Examples' }, { to: '/#how-it-works', label: 'How it works' }, { to: '/pricing', label: 'Pricing' }]
  const isActive = (to) => to === pathname

  const navLink = (l) => (
    <a key={l.to} href={l.to} onClick={e => { if (!l.to.includes('#')) { e.preventDefault(); go(l.to) } else { setMobileOpen(false) } }}
      aria-current={isActive(l.to) ? 'page' : undefined}
      style={{ ...btn.ghost, textDecoration: 'none', color: isActive(l.to) ? C.violet : C.text, background: isActive(l.to) ? 'rgba(104,123,104,0.10)' : 'transparent' }}>
      {l.icon && <l.icon size={16} />}{l.label}
    </a>
  )

  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 200, fontFamily: FONT, background: scrolled ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${scrolled ? C.border : 'transparent'}`, transition: 'all .2s' }}>
        <div style={{ maxWidth, margin: '0 auto', height: 66, padding: '0 clamp(16px,4vw,32px)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" onClick={e => { e.preventDefault(); go('/') }} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginRight: 8 }}>
            <span style={{ width: 34, height: 34, borderRadius: 11, background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, boxShadow: shadow.brand }}>✦</span>
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>GenWeb<span style={{ color: C.violet }}>.ai</span></span>
          </a>

          <nav aria-label="Main" className="gw-hdr-desktop" style={{ display: 'flex', gap: 2 }}>{links.map(navLink)}</nav>

          <div className="gw-hdr-desktop" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {userData ? (
              <>
                <button onClick={() => go('/pricing')} title="Credits" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: '1px solid #d8b39f', background: '#f7e9e2', color: C.terracotta, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  <Zap size={14} fill="#d69a82" color={C.terracotta} />{userData.credits ?? 0}<span style={{ fontWeight: 500, color: C.text }}>credits</span>
                </button>
                <button onClick={() => go('/generate')} style={{ ...btn.primary, padding: '9px 16px', fontSize: 14 }}><Plus size={16} />New website</button>
                <div ref={menuRef} style={{ position: 'relative' }}>
                  <button aria-label="Account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)} style={{ padding: 0, border: `2px solid ${menuOpen ? C.violet : 'transparent'}`, borderRadius: '50%', background: 'none', cursor: 'pointer' }}>
                    <Avatar user={userData} />
                  </button>
                  {menuOpen && (
                    <div role="menu" style={{ position: 'absolute', right: 0, top: 46, width: 240, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: shadow.lg, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14, borderBottom: `1px solid ${C.border}` }}>
                        <Avatar user={userData} size={38} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userData.name || 'User'}</div>
                          <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userData.email}</div>
                        </div>
                      </div>
                      {[['Dashboard', '/dashboard', LayoutDashboard], ['New website', '/generate', Plus], ['Buy credits', '/pricing', Gem]].map(([label, to, icon]) => (
                        <button key={to} role="menuitem" onClick={() => go(to)} style={{ ...btn.ghost, width: '100%', borderRadius: 0, padding: '11px 16px', justifyContent: 'flex-start' }}>{React.createElement(icon, { size: 16, color: C.muted })}{label}</button>
                      ))}
                      <button role="menuitem" onClick={logout} style={{ ...btn.ghost, width: '100%', borderRadius: 0, padding: '11px 16px', color: C.red, borderTop: `1px solid ${C.border}`, justifyContent: 'flex-start' }}><LogOut size={16} />Sign out</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => go('/login')} style={{ ...btn.ghost }}>Sign in</button>
                <button onClick={() => go('/login')} style={{ ...btn.primary, padding: '9px 18px', fontSize: 14 }}>Get started free</button>
              </>
            )}
          </div>

          <button className="gw-hdr-mobile" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(o => !o)} style={{ marginLeft: 'auto', display: 'none', padding: 8, border: 'none', background: 'none', color: C.ink, cursor: 'pointer' }}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="gw-hdr-mobile-panel" style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: 14, display: 'grid', gap: 4 }}>
            {userData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, marginBottom: 6, borderRadius: 12, background: C.soft }}>
                <Avatar user={userData} /><div><div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>{userData.name}</div><div style={{ fontSize: 12, color: C.terracotta, fontWeight: 700 }}>⚡ {userData.credits ?? 0} credits</div></div>
              </div>
            )}
            {userData && <button onClick={() => go('/generate')} style={{ ...btn.primary, width: '100%' }}><Plus size={16} />New website</button>}
            {links.map(navLink)}
            {userData
              ? <button onClick={logout} style={{ ...btn.ghost, color: C.red }}><LogOut size={16} />Sign out</button>
              : <button onClick={() => go('/login')} style={{ ...btn.primary, width: '100%', marginTop: 6 }}>Get started free</button>}
          </div>
        )}
      </header>
      <style>{`@media (max-width: 820px){.gw-hdr-desktop{display:none !important}.gw-hdr-mobile{display:block !important}}`}</style>
    </>
  )
}
