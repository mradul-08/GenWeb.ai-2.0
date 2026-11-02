import React, { useState } from 'react'
import { ArrowUp, ArrowDown, X, Plus, Rocket, ClipboardList } from 'lucide-react'
import { C, FONT, btn, card as baseCard, input as baseInput, pill } from '../theme'

// Editable site plan shown before generation. The server re-validates
// whatever is sent (ai/plan.js normalizePlan), so this only shapes the UX.

const MAX_SECTIONS = 10
const MAX_FEATURES = 8

const FEATURE_LABEL = {
  contact_form: 'Form', newsletter: 'Newsletter', mobile_menu: 'Mobile menu', theme_toggle: 'Theme toggle',
  carousel: 'Carousel', accordion: 'Accordion', tabs: 'Tabs', modal: 'Popup', counter: 'Counter',
  filter_search: 'Search / filter', other: 'Custom',
}

const card = { ...baseCard, boxShadow: 'none', borderRadius: 16, padding: '16px 18px' }
const label = { fontSize: 11.5, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }
const iconBtn = { flexShrink: 0, width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, cursor: 'pointer', padding: 0 }

function AddRow({ placeholder, disabled, onAdd }) {
  const [value, setValue] = useState('')
  const submit = () => { if (!value.trim() || disabled) return; onAdd(value.trim()); setValue('') }
  const ok = !disabled && !!value.trim()
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <input value={value} onChange={e => setValue(e.target.value.slice(0, 120))} onKeyDown={e => { if (e.key === 'Enter') submit() }}
        aria-label={placeholder} placeholder={disabled ? 'Limit reached' : placeholder} disabled={disabled}
        style={{ ...baseInput, flex: 1, minWidth: 0, padding: '8px 12px', fontSize: 13.5, background: C.soft }} />
      <button onClick={submit} disabled={!ok} style={{ ...btn.secondary, padding: '8px 14px', fontSize: 13.5, color: ok ? C.violet : C.faint, cursor: ok ? 'pointer' : 'not-allowed' }}><Plus size={15} /> Add</button>
    </div>
  )
}

export default function PlanReview({ plan, onChange, onGenerate, onDiscard, credits, cost = 50, generating }) {
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
    <div style={{ animation: 'gw-plan-in 0.3s ease-out', width: '100%', maxWidth: 680, margin: '0 auto', padding: 'clamp(16px,3vw,28px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
      <style>{'@keyframes gw-plan-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}'}</style>
      <div>
        <span style={{ ...pill(C.violet), marginBottom: 10 }}><ClipboardList size={13} /> YOUR SITE PLAN — REVIEW BEFORE BUILDING</span>
        <h2 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{plan.title || 'Your website'}</h2>
        {plan.summary && <p style={{ margin: '6px 0 0', fontSize: 14.5, color: C.muted, lineHeight: 1.6 }}>{plan.summary}</p>}
      </div>

      <div style={card}>
        <p style={label}>Sections · in page order</p>
        {plan.sections.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: C.violet, background: 'rgba(104,123,104,0.10)', flexShrink: 0 }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{s.name}</div>
              {s.purpose && <div style={{ fontSize: 13, color: C.muted, marginTop: 1 }}>{s.purpose}</div>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
              <button aria-label={`Move ${s.name} up`} title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={14} /></button>
              <button aria-label={`Move ${s.name} down`} title="Move down" onClick={() => move(i, 1)} disabled={i === plan.sections.length - 1} style={{ ...iconBtn, opacity: i === plan.sections.length - 1 ? 0.35 : 1 }}><ArrowDown size={14} /></button>
              <button aria-label={`Remove ${s.name}`} title="Remove section" onClick={() => setSections(plan.sections.filter(x => x.id !== s.id))} style={{ ...iconBtn, color: C.red }}><X size={14} /></button>
            </div>
          </div>
        ))}
        {!plan.sections.length && <p style={{ fontSize: 13, color: C.red, margin: 0 }}>Add at least one section.</p>}
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
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.blue, background: 'rgba(200,121,93,0.11)', borderRadius: 99, padding: '3px 9px', flexShrink: 0 }}>{FEATURE_LABEL[f.kind] || 'Custom'}</span>
            <span style={{ fontSize: 13.5, color: C.text }}>{f.text}</span>
            <button aria-label="Remove feature" title="Remove feature" onClick={() => setFeatures(plan.features.filter((_, j) => j !== i))} style={{ ...iconBtn, marginLeft: 'auto', color: C.red }}><X size={14} /></button>
          </div>
        ))}
        {!plan.features.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No interactive features.</p>}
        <AddRow placeholder="Add a feature, e.g. Booking form with date picker" disabled={plan.features.length >= MAX_FEATURES}
          onAdd={(text) => setFeatures([...plan.features, { kind: 'other', text }])} />
      </div>

      {(st.mood || st.colors?.length > 0 || st.headingFont) && (
        <div style={card}>
          <p style={label}>Style</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {st.colors?.map(c => <span key={c} title={c} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: `1px solid ${C.borderStrong}` }} />)}
            {st.mood && <span style={{ fontSize: 13.5, color: C.text }}>{st.mood}</span>}
            {st.headingFont && <span style={{ fontSize: 13, color: C.muted }}>· {st.headingFont}{st.bodyFont ? ` / ${st.bodyFont}` : ''}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onGenerate} disabled={!canGenerate}
          style={{ ...btn.primary, flex: 1, opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
          <Rocket size={17} /> Build from this plan
        </button>
        <button onClick={onDiscard} disabled={generating} style={btn.secondary}>Discard</button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
        Planning used no credits. Building costs {cost} credits · {credits ?? 0} remaining. After building, a checklist shows what made it into the site.
      </p>
    </div>
  )
}
