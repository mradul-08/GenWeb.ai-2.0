import React from 'react'

// Shows which planned sections and features the current code contains. The
// checklist is computed on the server from the code (no AI), so it updates
// after every edit. "Not checked" items cannot be verified automatically.

const STATUS = {
  found:       { icon: '✅', color: '#4ade80', text: 'Found' },
  missing:     { icon: '❌', color: '#f87171', text: 'Missing' },
  not_checked: { icon: '➖', color: 'rgba(255,255,255,0.35)', text: 'Not checked automatically' },
}

function Row({ title, detail, status }) {
  const s = STATUS[status] || STATUS.not_checked
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize:14, width:18, textAlign:'center' }}>{s.icon}</span>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, color:'#fff' }}>{title}</div>
        {detail && <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)' }}>{detail}</div>}
      </div>
      <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:s.color, whiteSpace:'nowrap' }}>{s.text}</span>
    </div>
  )
}

export default function PlanChecklist({ checklist, onFix, disabled }) {
  const { sections, features, summary } = checklist
  const missing = [...sections, ...features].filter(x => x.status === 'missing')
  const allGood = summary.checked > 0 && summary.found === summary.checked
  const fixPrompt = missing.length
    ? `Add what is missing from the plan: ${missing.map(m => m.name ? `the "${m.name}" section` : m.text).join('; ')}. Keep everything else unchanged.`
    : ''

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', background:'#08080f' }}>
      <div style={{ maxWidth:640, margin:'0 auto', padding:'18px 16px' }}>
        <h3 style={{ margin:0, fontSize:15, color:'#fff', fontWeight:700 }}>Plan checklist</h3>
        <p style={{ margin:'4px 0 14px', fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
          Checked against the current code — it updates after every edit.
        </p>

        <div style={{ padding:'12px 14px', borderRadius:10, marginBottom:14, background: allGood ? 'rgba(74,222,128,0.07)' : 'rgba(251,191,36,0.07)', border:`1px solid ${allGood ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)'}`, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20, fontWeight:800, color: allGood ? '#4ade80' : '#fbbf24' }}>{summary.found}/{summary.checked}</span>
          <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.65)' }}>
            {allGood ? 'Everything in the plan that can be checked is in your site.' : `${missing.length} planned item${missing.length === 1 ? ' is' : 's are'} missing.`}
          </span>
          {missing.length > 0 && onFix && (
            <button onClick={() => onFix(fixPrompt)} disabled={disabled}
              style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:8, border:'1px solid rgba(168,85,247,0.35)', background:'rgba(168,85,247,0.1)', color:'#c084fc', fontSize:12, fontWeight:600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily:'inherit', opacity: disabled ? 0.5 : 1, whiteSpace:'nowrap' }}>
              ✨ Fix with AI
            </button>
          )}
        </div>

        <p style={{ fontSize:10.5, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em', textTransform:'uppercase', margin:'14px 0 2px' }}>Sections</p>
        {sections.map(s => <Row key={s.id} title={s.name} detail={`#${s.id}`} status={s.status} />)}

        {features.length > 0 && <>
          <p style={{ fontSize:10.5, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em', textTransform:'uppercase', margin:'18px 0 2px' }}>Features</p>
          {features.map((f, i) => <Row key={i} title={f.text} status={f.status} />)}
        </>}
      </div>
    </div>
  )
}
