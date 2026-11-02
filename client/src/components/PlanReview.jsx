import React, { useState } from 'react'

// Editable site plan shown before generation. The server re-validates
// whatever is sent (ai/plan.js normalizePlan), so this only shapes the UX.

const MAX_SECTIONS = 10
const MAX_FEATURES = 8

const FEATURE_LABEL = {
  contact_form: 'Form', newsletter: 'Newsletter', mobile_menu: 'Mobile menu', theme_toggle: 'Theme toggle',
  carousel: 'Carousel', accordion: 'Accordion', tabs: 'Tabs', modal: 'Popup', counter: 'Counter',
  filter_search: 'Search / filter', other: 'Custom',
}

const card = { background:'rgba(10,10,18,0.88)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'14px 16px', backdropFilter:'blur(14px)' }
const label = { fontSize:10.5, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em', textTransform:'uppercase', margin:'0 0 10px' }
const removeBtn = { marginLeft:'auto', flexShrink:0, width:22, height:22, borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'rgba(255,255,255,0.35)', cursor:'pointer', fontSize:12, lineHeight:1, fontFamily:'inherit' }
const input = { flex:1, minWidth:0, padding:'7px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:12.5, fontFamily:'inherit', outline:'none' }
const addBtn = (enabled) => ({ padding:'7px 12px', borderRadius:8, border:'1px solid rgba(59,130,246,0.35)', background:'rgba(59,130,246,0.08)', color: enabled ? '#60a5fa' : 'rgba(96,165,250,0.4)', fontSize:12, fontWeight:600, cursor: enabled ? 'pointer' : 'not-allowed', fontFamily:'inherit' })

function AddRow({ placeholder, disabled, onAdd }) {
  const [value, setValue] = useState('')
  const submit = () => { if (!value.trim() || disabled) return; onAdd(value.trim()); setValue('') }
  return (
    <div style={{ display:'flex', gap:6, marginTop:8 }}>
      <input value={value} onChange={e => setValue(e.target.value.slice(0, 120))} onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder={disabled ? 'Limit reached' : placeholder} disabled={disabled} style={input} />
      <button onClick={submit} disabled={disabled || !value.trim()} style={addBtn(!disabled && !!value.trim())}>+ Add</button>
    </div>
  )
}

export default function PlanReview({ plan, onChange, onGenerate, onDiscard, credits, generating }) {
  const setSections = (sections) => onChange({ ...plan, sections })
  const setFeatures = (features) => onChange({ ...plan, features })
  const move = (i, d) => {
    const s = [...plan.sections]; const j = i + d
    if (j < 0 || j >= s.length) return
    ;[s[i], s[j]] = [s[j], s[i]]
    setSections(s)
  }
  const st = plan.style || {}
  const canGenerate = plan.sections.length > 0 && !generating

  return (
    <div style={{ animation:'gw-plan-in 0.3s ease-out', width:'100%', maxWidth:640, maxHeight:'100%', overflowY:'auto', padding:'24px 20px', boxSizing:'border-box', display:'flex', flexDirection:'column', gap:12 }}>
      <style>{'@keyframes gw-plan-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}'}</style>
      <div>
        <p style={{ ...label, color:'#a78bfa', margin:'0 0 6px' }}>📋 Your site plan — review before building</p>
        <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'#fff', letterSpacing:'-0.02em' }}>{plan.title || 'Your website'}</h2>
        {plan.summary && <p style={{ margin:'6px 0 0', fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{plan.summary}</p>}
      </div>

      <div style={card}>
        <p style={label}>Sections · in page order</p>
        {plan.sections.map((s, i) => (
          <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ width:20, fontSize:11, color:'rgba(255,255,255,0.3)', textAlign:'right', flexShrink:0 }}>{i + 1}</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{s.name}</div>
              {s.purpose && <div style={{ fontSize:12, color:'rgba(255,255,255,0.42)', marginTop:1 }}>{s.purpose}</div>}
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:4, flexShrink:0 }}>
              <button title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...removeBtn, marginLeft:0, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
              <button title="Move down" onClick={() => move(i, 1)} disabled={i === plan.sections.length - 1} style={{ ...removeBtn, marginLeft:0, opacity: i === plan.sections.length - 1 ? 0.3 : 1 }}>↓</button>
              <button title="Remove section" onClick={() => setSections(plan.sections.filter(x => x.id !== s.id))} style={{ ...removeBtn, marginLeft:0 }}>✕</button>
            </div>
          </div>
        ))}
        {!plan.sections.length && <p style={{ fontSize:12, color:'#fca5a5', margin:0 }}>Add at least one section.</p>}
        <AddRow placeholder="Add a section, e.g. Gallery" disabled={plan.sections.length >= MAX_SECTIONS}
          onAdd={(name) => {
            const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'section'
            let id = base
            for (let n = 2; plan.sections.some(x => x.id === id); n++) id = `${base}-${n}`
            setSections([...plan.sections, { id, name: name.slice(0, 40), purpose: '' }])
          }} />
      </div>

      <div style={card}>
        <p style={label}>Features that must work</p>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ fontSize:10.5, fontWeight:600, color:'#60a5fa', background:'rgba(59,130,246,0.1)', borderRadius:99, padding:'2px 8px', flexShrink:0 }}>{FEATURE_LABEL[f.kind] || 'Custom'}</span>
            <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.75)' }}>{f.text}</span>
            <button title="Remove feature" onClick={() => setFeatures(plan.features.filter((_, j) => j !== i))} style={removeBtn}>✕</button>
          </div>
        ))}
        {!plan.features.length && <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', margin:0 }}>No interactive features.</p>}
        <AddRow placeholder="Add a feature, e.g. Booking form with date picker" disabled={plan.features.length >= MAX_FEATURES}
          onAdd={(text) => setFeatures([...plan.features, { kind: 'other', text }])} />
      </div>

      {(st.mood || st.colors?.length > 0 || st.headingFont) && (
        <div style={card}>
          <p style={label}>Style</p>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            {st.colors?.map(c => <span key={c} title={c} style={{ width:22, height:22, borderRadius:6, background:c, border:'1px solid rgba(255,255,255,0.15)' }} />)}
            {st.mood && <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.65)' }}>{st.mood}</span>}
            {st.headingFont && <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>· {st.headingFont}{st.bodyFont ? ` / ${st.bodyFont}` : ''}</span>}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={onGenerate} disabled={!canGenerate}
          style={{ flex:1, padding:'12px', borderRadius:11, border:'none', background: canGenerate ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)' : 'rgba(255,255,255,0.05)', color: canGenerate ? '#fff' : 'rgba(255,255,255,0.25)', fontWeight:700, fontSize:14, cursor: canGenerate ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
          🚀 Generate from this plan
        </button>
        <button onClick={onDiscard} disabled={generating}
          style={{ padding:'12px 16px', borderRadius:11, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.55)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
          Discard
        </button>
      </div>
      <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.3)', textAlign:'center' }}>
        Planning used no credits. Generating costs 50 credits · {credits ?? 0} remaining. After building, a checklist shows what made it into the site.
      </p>
    </div>
  )
}
