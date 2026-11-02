import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import AppHeader from '../components/AppHeader'
import { Hero, Examples, HowItWorks, Features, SiteFooter } from '../components/Landing'
import { C, FONT, GLOBAL_CSS, pageBackground } from '../theme'

export default function Home() {
  const navigate = useNavigate()
  const { hash } = useLocation()
  const { userData } = useSelector(state => state.user)

  // Arriving from another page at /#examples etc.: the browser tries to scroll
  // before the sections exist, so scroll once they have rendered.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (el) el.scrollIntoView()
  }, [hash])

  return (
    <div style={{ minHeight: '100vh', ...pageBackground, color: C.text, fontFamily: FONT, overflowX: 'hidden' }}>
      <style>{GLOBAL_CSS + 'html{scroll-behavior:smooth}'}</style>
      <AppHeader />
      <main>
        <Hero userData={userData} navigate={navigate} />
        <Examples userData={userData} navigate={navigate} />
        <HowItWorks />
        <Features />
      </main>
      <SiteFooter userData={userData} navigate={navigate} />
    </div>
  )
}
