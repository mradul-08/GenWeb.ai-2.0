import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { serverUrl } from '../config'
import ContentForm from './ContentForm'

// No-AI design editor for template-built sites: theme, page layout, section
// order/design/visibility, new sections and all text. Changes are rebuilt on
// the server from the site's template build — no AI, no credits.

const MAX_SECTIONS = 12
const api = (path, method = 'get', data) => axios({ url: `${serverUrl}/api/website/${path}`, method, data, withCredentials: true })
const errorOf = (e, fallback) => e?.response?.data?.message || fallback
const title = (id) => id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

const card = { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 14px' }
const h = { fontSize:10.5, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'0.12em', textTransform:'uppercase', margin:'0 0 10px' }
const btn = (on) => ({ padding:'5px 10px', borderRadius:7, border:`1px solid ${on ? 'rgba(154,181,155,0.45)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(154,181,155,0.12)' : 'transparent', color: on ? '#c9ddc9' : 'rgba(255,255,255,0.6)', fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' })
const icon = { width:26, height:26, borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:12, fontFamily:'inherit' }
const input = { padding:'6px 9px', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:12.5, fontFamily:'inherit', outline:'none' }

export default function DesignPanel({ websiteId, refreshKey, disabled, onApplied }) {
  const [library, setLibrary] = useState(null)
  const [state, setState]     = useState(null)    // { available, inSync, design, message }
  const [draft, setDraft]     = useState(null)
  const [open, setOpen]       = useState(null)    // section id whose content form is open
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [notice, setNotice]   = useState('')
  const [addKind, setAddKind] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const [lib, d] = await Promise.all([library ? Promise.resolve({ data: library }) : api('library'), api(`${websiteId}/design`)])
      if (!library) setLibrary(lib.data)
      setState(d.data)
      setDraft(d.data.available ? structuredClone(d.data.design) : null)
    } catch (e) { setError(errorOf(e, 'Could not load the design.')) }
  }, [websiteId, library])

  // Reload after changes made elsewhere (AI edits, saves, restores).
  useEffect(() => { load() }, [websiteId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => state?.available && draft && JSON.stringify(draft) !== JSON.stringify(state.design), [draft, state])

  const apply = async (design, force = false) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const { data } = await api(`${websiteId}/design`, 'put', { design, force })
      setState({ available: true, inSync: data.inSync, design: data.design })
      setDraft(structuredClone(data.design))
      setNotice(data.skipped?.length ? `Theme applied. Pages edited by hand kept their colours: ${data.skipped.join(', ')}.` : `✓ ${data.message.replace(/^Design: /, 'Applied: ')}`)
      onApplied(data)
    } catch (e) {
      const d = e?.response?.data
      if (d?.code === 'DIVERGED' && !force) {
        if (window.confirm(`${d.message}\n\nApply anyway?`)) return apply(design, true)
      } else setError(errorOf(e, 'Could not apply the design.'))
    } finally { setBusy(false) }
  }

  if (error && !state) return <Centered><p style={{ color:'#fca5a5' }}>{error}</p><button style={btn(false)} onClick={load}>Retry</button></Centered>
  if (!state || !library) return <Centered><p style={{ color:'rgba(255,255,255,0.4)' }}>Loading design…</p></Centered>
  if (!state.available) return <Centered><p style={{ color:'rgba(255,255,255,0.55)', maxWidth:420, textAlign:'center', lineHeight:1.6 }}>🎨 {state.message}<br /><span style={{ fontSize:12, opacity:0.7 }}>Generate a new site with the ⚡ Templates engine to use theme, section and text controls without AI.</span></p></Centered>

  const kinds = library.kinds
  const sections = draft.sections
  const setSections = (next) => setDraft({ ...draft, sections: next })
  const setSectionContent = (id, value) => setDraft({ ...draft, content: { ...draft.content, sections: { ...draft.content.sections, [id]: value } } })
  const move = (i, d) => { const a = [...sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSections(a) }
  const hasKind = (k) => sections.some(s => s.kind === k)
  const addable = Object.keys(kinds).filter(k => !((k === 'nav' || k === 'footer') && hasKind(k)))
  const addSection = () => {
    if (!addKind || sections.length >= MAX_SECTIONS) return
    let id = addKind, n = 2
    while (sections.some(s => s.id === id)) id = `${addKind}-${n++}`
    const s = { id, kind: addKind, variant: kinds[addKind].variants[0], name: kinds[addKind].label.split(' /')[0] }
    // New sections go before the contact/footer block.
    const tail = sections.findIndex(x => x.kind === 'contact' || x.kind === 'footer')
    const next = [...sections]; next.splice(tail === -1 ? next.length : tail, 0, s)
    setSections(next); setOpen(id); setAddKind('')
  }

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', background:'#08080f' }}>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'18px 16px 90px', display:'grid', gap:14 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <h3 style={{ margin:0, fontSize:15, color:'#fff', fontWeight:700 }}>Design</h3>
            <span style={{ fontSize:10.5, fontWeight:700, color:'#a9c2ab', background:'rgba(127,157,130,0.12)', padding:'2px 8px', borderRadius:99 }}>NO AI · FREE</span>
          </div>
          <p style={{ margin:'4px 0 0', fontSize:12, color:'rgba(255,255,255,0.4)' }}>Change the theme, layout, sections and text instantly. Every change is saved in History.</p>
        </div>

        {!state.inSync && (
          <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(200,121,93,0.08)', border:'1px solid rgba(200,121,93,0.25)', fontSize:12, color:'#e0aa95', lineHeight:1.55 }}>
            This site has AI or code edits made after it was built. Theme changes keep them. Other design changes rebuild the site from its template and replace those edits — you will be asked first, and they stay in History.
          </div>
        )}
        {error && <div style={{ padding:'8px 12px', borderRadius:8, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5', fontSize:12 }}>{error}</div>}
        {notice && <div style={{ padding:'8px 12px', borderRadius:8, background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.2)', color:'#86efac', fontSize:12 }}>{notice}</div>}

        {/* THEME — applied immediately */}
        <section style={card}>
          <p style={h}>Theme</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8 }}>
            {library.presets.map(p => {
              const active = p.id === state.design.preset
              return (
                <button key={p.id} disabled={busy || disabled} onClick={() => !active && apply({ ...draft, preset: p.id })} title={`${title(p.id)} · ${p.fonts.heading} / ${p.fonts.body}`}
                  style={{ textAlign:'left', padding:0, borderRadius:10, overflow:'hidden', cursor: active ? 'default' : 'pointer', border:`2px solid ${active ? '#9ab59b' : 'rgba(255,255,255,0.08)'}`, background:p.colors.bg, fontFamily:'inherit' }}>
                  <div style={{ display:'flex', gap:4, padding:'10px 10px 6px' }}>
                    {[p.colors.primary, p.colors.secondary, p.colors.accent].map(c => <span key={c} style={{ width:16, height:16, borderRadius:99, background:c, border:'1px solid rgba(0,0,0,0.15)' }} />)}
                  </div>
                  <div style={{ padding:'0 10px 9px', color:p.colors.text, fontSize:11.5, fontWeight:700 }}>{title(p.id)}{active ? ' ✓' : ''}</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* LAYOUT */}
        <section style={card}>
          <p style={h}>Layout</p>
          <div style={{ display:'flex', gap:8 }}>
            <button style={btn(!draft.multiPage)} onClick={() => setDraft({ ...draft, multiPage: false })}>📄 Single page</button>
            <button style={btn(draft.multiPage)} onClick={() => setDraft({ ...draft, multiPage: true })}>🗂 Multi-page</button>
          </div>
        </section>

        {/* SITE TEXT */}
        <section style={card}>
          <p style={h}>Site</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <input aria-label="Brand name" placeholder="Brand name" maxLength={40} value={draft.content.brand} onChange={e => setDraft({ ...draft, content: { ...draft.content, brand: e.target.value } })} style={input} />
            <input aria-label="Page title" placeholder="Page title" maxLength={80} value={draft.content.title} onChange={e => setDraft({ ...draft, content: { ...draft.content, title: e.target.value } })} style={input} />
            <input aria-label="Tagline" placeholder="Tagline" maxLength={160} value={draft.content.tagline} onChange={e => setDraft({ ...draft, content: { ...draft.content, tagline: e.target.value } })} style={{ ...input, gridColumn:'1 / -1' }} />
          </div>
        </section>

        {/* SECTIONS */}
        <section style={card}>
          <p style={h}>Sections · {sections.length}/{MAX_SECTIONS}</p>
          {sections.map((s, i) => {
            const k = kinds[s.kind]
            const fixed = s.kind === 'nav' || s.kind === 'footer'
            const empty = !draft.content.sections[s.id] && !['nav', 'hero', 'footer', 'contact'].includes(s.kind)
            return (
              <div key={s.id} style={{ borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none', padding:'9px 0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <input aria-label="Section name" value={s.name} maxLength={40} onChange={e => setSections(sections.map(x => (x.id === s.id ? { ...x, name: e.target.value } : x)))} style={{ ...input, width:150 }} />
                  <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.4)' }}>{k?.label}</span>
                  {empty && <span title="No content yet — this section is hidden until you add some" style={{ fontSize:10.5, color:'#d69a82' }}>● hidden (no content)</span>}
                  <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                    {k?.variants.length > 1 && (
                      <select aria-label="Design" value={s.variant} onChange={e => setSections(sections.map(x => (x.id === s.id ? { ...x, variant: e.target.value } : x)))} style={{ ...input, padding:'5px 6px' }}>
                        {k.variants.map(v => <option key={v} value={v} style={{ background:'#111' }}>{title(v)}</option>)}
                      </select>
                    )}
                    <button style={btn(open === s.id)} onClick={() => setOpen(open === s.id ? null : s.id)}>✎ Content</button>
                    {!fixed && <button title="Move up" style={icon} onClick={() => move(i, -1)}>↑</button>}
                    {!fixed && <button title="Move down" style={icon} onClick={() => move(i, 1)}>↓</button>}
                    <button title="Remove section" style={icon} onClick={() => setSections(sections.filter(x => x.id !== s.id))} disabled={sections.length <= 1}>✕</button>
                  </div>
                </div>
                {open === s.id && k && (
                  <div style={{ marginTop:10, padding:12, borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <ContentForm fields={k.fields} icons={library.icons || []} value={draft.content.sections[s.id]} onChange={v => setSectionContent(s.id, v)} />
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ display:'flex', gap:6, marginTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:10 }}>
            <select aria-label="Section type to add" value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...input, flex:1 }} disabled={sections.length >= MAX_SECTIONS}>
              <option value="" style={{ background:'#111' }}>{sections.length >= MAX_SECTIONS ? 'Section limit reached' : '+ Add a section from the library…'}</option>
              {addable.map(k => <option key={k} value={k} style={{ background:'#111' }}>{kinds[k].label}</option>)}
            </select>
            <button style={btn(!!addKind)} onClick={addSection} disabled={!addKind}>Add</button>
          </div>
        </section>
      </div>

      {/* Sticky apply bar */}
      {dirty && (
        <div style={{ position:'sticky', bottom:0, display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center', padding:'10px 16px', background:'rgba(8,8,15,0.96)', borderTop:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(10px)' }}>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginRight:'auto' }}>Unsaved design changes · no credits needed</span>
          <button style={btn(false)} disabled={busy} onClick={() => setDraft(structuredClone(state.design))}>Discard</button>
          <button disabled={busy || disabled} onClick={() => apply(draft)}
            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#687b68,#c8795d)', color:'#fff', fontWeight:700, fontSize:12.5, cursor: busy ? 'wait' : 'pointer', fontFamily:'inherit' }}>
            {busy ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      )}
    </div>
  )
}

function Centered({ children }) {
  return <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'#08080f', padding:24, boxSizing:'border-box' }}>{children}</div>
}
