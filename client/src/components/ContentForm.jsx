import React, { useId } from 'react'

// Generic form for one section's content, driven by the field list the
// server publishes (GET /api/website/library). Field types: text, textarea,
// emoji, number, bool, strings (list of text), list (of objects).

const input = { width:'100%', boxSizing:'border-box', padding:'7px 9px', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:12.5, fontFamily:'inherit', outline:'none' }
const small = { padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.55)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }
const label = { display:'block', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.5)', margin:'0 0 4px' }

function Field({ field, value, onChange, iconList }) {
  const id = useId()
  switch (field.type) {
    case 'textarea':
      return <><label htmlFor={id} style={label}>{field.label}</label><textarea id={id} rows={2} maxLength={field.max} value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...input, resize:'vertical' }} /></>
    case 'number':
      return <><label htmlFor={id} style={label}>{field.label}</label><input id={id} type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={input} /></>
    case 'bool':
      return <label style={{ ...label, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}><input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />{field.label}</label>
    case 'strings':
      return <StringList field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />
    case 'list':
      return <ItemList field={field} value={Array.isArray(value) ? value : []} onChange={onChange} iconList={iconList} />
    case 'emoji':
      // Icon name from the library (suggested) or an emoji.
      return <><label htmlFor={id} style={label}>{field.label} <span style={{ fontWeight:400, opacity:0.6 }}>(icon name or emoji)</span></label><input id={id} type="text" maxLength={16} list={iconList} placeholder="e.g. star" value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...input, width:160 }} /></>
    default: // text
      return <><label htmlFor={id} style={label}>{field.label}</label><input id={id} type="text" maxLength={field.max} value={value ?? ''} onChange={e => onChange(e.target.value)} style={input} /></>
  }
}

function StringList({ field, value, onChange }) {
  return (
    <div>
      <span style={label}>{field.label}</span>
      {value.map((v, i) => (
        <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
          <input type="text" maxLength={field.max} value={typeof v === 'string' ? v : ''} onChange={e => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} style={input} />
          <button type="button" title="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} style={small}>✕</button>
        </div>
      ))}
      {value.length < field.maxItems && <button type="button" onClick={() => onChange([...value, ''])} style={small}>+ Add</button>}
    </div>
  )
}

function ItemList({ field, value, onChange, iconList }) {
  const set = (i, item) => onChange(value.map((x, j) => (j === i ? item : x)))
  const move = (i, d) => { const a = [...value]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div>
      <span style={label}>{field.label} <span style={{ fontWeight:400, opacity:0.6 }}>({value.length}/{field.maxItems})</span></span>
      {value.map((item, i) => {
        const obj = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
        return (
          <div key={i} style={{ padding:10, marginBottom:8, borderRadius:9, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)' }}>
            <div style={{ display:'flex', gap:4, justifyContent:'flex-end', marginBottom:4 }}>
              <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...small, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
              <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1} style={{ ...small, opacity: i === value.length - 1 ? 0.3 : 1 }}>↓</button>
              <button type="button" title="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} style={small}>✕</button>
            </div>
            <div style={{ display:'grid', gap:8 }}>
              {field.item.map(sub => <div key={sub.key}><Field field={sub} value={obj[sub.key]} iconList={iconList} onChange={v => set(i, { ...obj, [sub.key]: v })} /></div>)}
            </div>
          </div>
        )
      })}
      {value.length < field.maxItems && <button type="button" onClick={() => onChange([...value, {}])} style={small}>+ Add {field.label.toLowerCase().replace(/s$/, '')}</button>}
      {!value.length && <p style={{ fontSize:11, color:'#fbbf24', margin:'6px 0 0' }}>Add at least one — sections without items are left out of the site.</p>}
    </div>
  )
}

export default function ContentForm({ fields, value, onChange, icons = [] }) {
  const v = value && typeof value === 'object' ? value : {}
  const listId = useId()
  return (
    <div style={{ display:'grid', gap:10 }}>
      <datalist id={listId}>{icons.map(n => <option key={n} value={n} />)}</datalist>
      {fields.map(f => <div key={f.key}><Field field={f} value={v[f.key]} iconList={listId} onChange={x => onChange({ ...v, [f.key]: x })} /></div>)}
    </div>
  )
}
