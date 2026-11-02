import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useSelector } from 'react-redux'
import useGetCurrentUser from './hooks/useGetCurrentUser.jsx'

// Keep route-specific code out of the initial bundle. The editor and dashboard
// are only downloaded when a signed-in user visits those routes.
const Home = lazy(() => import('./pages/Home.jsx'))
const Login = lazy(() => import('./components/LoginModels.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Generate = lazy(() => import('./pages/Generate.jsx'))
const Editor = lazy(() => import('./pages/Editor.jsx'))
const Pricing = lazy(() => import('./pages/Pricing.jsx'))

function RouteFallback() {
  return (
    <div style={{ minHeight: '100vh', background: '#040408', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
      Loading…
    </div>
  )
}


function Protected({ children }) {
  const { userData, authChecked } = useSelector(s => s.user)
  if (!authChecked) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#040408',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 14,
        opacity: 0.5
      }}>
        Loading...
      </div>
    )
  }
  if (!userData) return <Navigate to="/login" replace />
  return children
}

function PublicOnly({ children }) {
  const { userData, authChecked } = useSelector(s => s.user)
  if (!authChecked) return null
  if (userData) return <Navigate to="/dashboard" replace />
  return children
}

function AppContent() {
  useGetCurrentUser()

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/pricing"   element={<Pricing />} />
        <Route path="/login"     element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/generate"  element={<Protected><Generate /></Protected>} />
        <Route path="/editor"    element={<Protected><Editor /></Protected>} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
