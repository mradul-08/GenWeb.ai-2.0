import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { serverUrl } from '../config'
import { buildPreviewDoc, PREVIEW_SANDBOX } from '../utils/previewDoc'

// Server-side version history for one website: list, preview and restore.
// Restoring never deletes anything — the server records it as a new version.

const SOURCE = {
  generate:    { icon: '✨', text: 'Generated' },
  ai_edit:     { icon: '🤖', text: 'AI edit' },
  manual_save: { icon: '✎',  text: 'Manual edit' },
  deploy:      { icon: '🚀', text: 'Saved on deploy' },
  restore:     { icon: '↺',  text: 'Restored' },
  migration:   { icon: '🗂', text: 'Original' },
}

function timeAgo(date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const api = (path, method = 'get') => axios({ url: `${serverUrl}/api/website/${path}`, method, withCredentials: true })
const errorText = (e, fallback) => e?.response?.data?.message || fallback

const btn = (accent) => ({
  padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
  border: `1px solid ${accent ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.1)'}`,
  background: accent ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
  color: accent ? '#c084fc' : 'rgba(255,255,255,0.6)',
})

export default function VersionHistory({ websiteId, refreshKey, disabled, onRestored }) {
  const [versions, setVersions] = useState(null)
  const [error, setError]       = useState('')
  const [preview, setPreview]   = useState(null)   // { version, doc }
  const [busyId, setBusyId]     = useState(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const { data } = await api(`${websiteId}/versions`)
      setVersions(data.versions)
    } catch (e) { setError(errorText(e, 'Could not load version history.')) }
  }, [websiteId])

  // Reload when the code changes elsewhere (AI edit, save, undo, deploy).
  useEffect(() => { load() }, [load, refreshKey])

  const view = async (v) => {
    setBusyId(v.id)
    try {
      const { data } = await api(`${websiteId}/versions/${v.id}`)
      setPreview({ version: v, doc: buildPreviewDoc(data.code) })
    } catch (e) { setError(errorText(e, 'Could not open this version.')) }
    finally { setBusyId(null) }
  }

  const restore = async (v) => {
    if (!window.confirm(`Restore version ${v.seq}? Your current version stays in the history, so you can switch back any time.`)) return
    setBusyId(v.id)
    try {
      const { data } = await api(`${websiteId}/versions/${v.id}/restore`, 'post')
      setPreview(null)
      onRestored(data.code, v.seq, data.files)
      await load()
    } catch (e) { setError(errorText(e, 'Restore failed. Nothing was changed.')) }
    finally { setBusyId(null) }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#08080f', overflow: 'hidden' }}>
      <div style={{ width: preview ? 340 : '100%', maxWidth: preview ? 340 : 760, margin: preview ? 0 : '0 auto', flexShrink: 0, overflowY: 'auto', padding: '18px 16px', boxSizing: 'border-box', borderRight: preview ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: '#fff', fontWeight: 700 }}>Version history</h3>
          {versions && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{versions.length} version{versions.length === 1 ? '' : 's'}</span>}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
          Every change is saved here. Restoring adds a new version — nothing is ever lost.
        </p>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{error}</span>
            <button onClick={load} style={{ ...btn(false), padding: '2px 8px' }}>Retry</button>
          </div>
        )}
        {!versions && !error && <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12.5 }}>Loading…</p>}

        {versions?.map(v => {
          const s = SOURCE[v.source] || { icon: '•', text: v.source }
          const selected = preview?.version.id === v.id
          return (
            <div key={v.id} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 10, background: selected ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${selected ? 'rgba(168,85,247,0.35)' : v.current ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{s.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>v{v.seq}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{s.text}</span>
                {v.current && <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', padding: '1px 7px', borderRadius: 99, background: 'rgba(74,222,128,0.1)' }}>CURRENT</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{timeAgo(v.createdAt)}</span>
              </div>
              {v.label && v.source !== 'migration' && v.label !== s.text && (
                <p title={v.label} style={{ margin: '6px 0 0 21px', fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</p>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 21 }}>
                <button onClick={() => view(v)} disabled={busyId === v.id} style={btn(false)}>{busyId === v.id && !selected ? '…' : '👁 View'}</button>
                {!v.current && (
                  <button onClick={() => restore(v)} disabled={disabled || busyId === v.id} title={disabled ? 'Wait for the current AI edit to finish' : ''} style={{ ...btn(true), opacity: disabled ? 0.5 : 1 }}>↺ Restore</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {preview && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(12,12,20,0.95)' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Previewing <b style={{ color: '#fff' }}>v{preview.version.seq}</b> (read-only)</span>
            {!preview.version.current && (
              <button onClick={() => restore(preview.version)} disabled={disabled || busyId === preview.version.id} style={{ ...btn(true), marginLeft: 'auto' }}>↺ Restore this version</button>
            )}
            <button onClick={() => setPreview(null)} style={{ ...btn(false), marginLeft: preview.version.current ? 'auto' : 0 }}>✕ Close</button>
          </div>
          <iframe title={`Version ${preview.version.seq}`} srcDoc={preview.doc} sandbox={PREVIEW_SANDBOX} style={{ flex: 1, width: '100%', border: 'none', background: 'white' }} />
        </div>
      )}
    </div>
  )
}
