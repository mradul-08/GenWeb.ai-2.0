import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { serverUrl } from '../config'
import { buildPreviewDoc, PREVIEW_SANDBOX } from '../utils/previewDoc'
import { Sparkles, Bot, Pencil, Rocket, RotateCcw, Archive, CircleDot, Eye, Pin, X } from 'lucide-react'

// Server-side version history for one website: list, preview and restore.
// Restoring never deletes anything — the server records it as a new version.

const SOURCE = {
  generate: { icon: Sparkles, text: 'Generated' },
  ai_edit: { icon: Bot, text: 'AI edit' },
  manual_save: { icon: Pencil, text: 'Manual edit' },
  deploy: { icon: Rocket, text: 'Saved on deploy' },
  restore: { icon: RotateCcw, text: 'Restored' },
  migration: { icon: Archive, text: 'Original' },
}

function timeAgo(date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const api = (path, method = 'get', data) => axios({ url: `${serverUrl}/api/website/${path}`, method, data, withCredentials: true })
const errorText = (e, fallback) => e?.response?.data?.message || fallback

const btn = (accent) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
  border: `1px solid ${accent ? 'rgba(154,181,155,0.35)' : 'rgba(255,255,255,0.1)'}`,
  background: accent ? 'rgba(154,181,155,0.1)' : 'rgba(255,255,255,0.03)',
  color: accent ? '#c8d8c7' : 'rgba(255,255,255,0.6)',
})

export default function VersionHistory({ websiteId, refreshKey, disabled, onRestored }) {
  const [versions, setVersions] = useState(null)
  const [releases, setReleases] = useState(null)
  const [error, setError]       = useState('')
  const [preview, setPreview]   = useState(null)   // { version, doc }
  const [busyId, setBusyId]     = useState(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const { data } = await api(`${websiteId}/versions`)
      setVersions(data.versions)
      const releaseResponse = await api(`${websiteId}/releases`)
      setReleases(releaseResponse.data.releases)
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

  const updateMeta = async (v, changes) => {
    setBusyId(`meta:${v.id}`)
    try {
      await api(`${websiteId}/versions/${v.id}`, 'patch', changes)
      await load()
    } catch (e) { setError(errorText(e, 'Could not update the checkpoint.')) }
    finally { setBusyId(null) }
  }

  const rename = (v) => {
    const label = window.prompt('Checkpoint name', v.label || `Version ${v.seq}`)
    if (label !== null) updateMeta(v, { label })
  }

  const rollback = async (release) => {
    if (!window.confirm('Roll back the public site to this release? Your working version will not change.')) return
    setBusyId(`release:${release.id}`)
    try {
      await api(`${websiteId}/releases/${release.id}/rollback`, 'post')
      setError('Public site rolled back. The working version was not changed.')
      await load()
    } catch (e) { setError(errorText(e, 'Rollback failed. Nothing was changed.')) }
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
          const s = SOURCE[v.source] || { icon: CircleDot, text: v.source }
          const selected = preview?.version.id === v.id
          return (
            <div key={v.id} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 10, background: selected ? 'rgba(154,181,155,0.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${selected ? 'rgba(154,181,155,0.35)' : v.current ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#9ab59b', background: 'rgba(154,181,155,0.10)' }}><s.icon size={13} strokeWidth={1.9} /></span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>v{v.seq}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{s.text}</span>
                {v.current && <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', padding: '1px 7px', borderRadius: 99, background: 'rgba(74,222,128,0.1)' }}>CURRENT</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{timeAgo(v.createdAt)}</span>
              </div>
              {v.label && v.source !== 'migration' && v.label !== s.text && (
                <p title={v.label} style={{ margin: '6px 0 0 21px', fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 21 }}>
                <button onClick={() => view(v)} disabled={busyId === v.id} style={btn(false)}><Eye size={13} /> {busyId === v.id && !selected ? 'Loading' : 'View'}</button>
                <button onClick={() => rename(v)} disabled={disabled || busyId === `meta:${v.id}`} style={btn(false)}>Name</button>
                <button onClick={() => updateMeta(v, { pinned: !v.pinned })} disabled={disabled || busyId === `meta:${v.id}`} style={btn(v.pinned)}><Pin size={13} /> {v.pinned ? 'Unpin' : 'Pin'}</button>
                {!v.current && (
                  <button onClick={() => restore(v)} disabled={disabled || busyId === v.id} title={disabled ? 'Wait for the current AI edit to finish' : ''} style={{ ...btn(true), opacity: disabled ? 0.5 : 1 }}><RotateCcw size={13} /> Restore</button>
                )}
              </div>
            </div>
          )
        })}

        {releases?.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <h4 style={{ margin: 0, fontSize: 13, color: '#fff' }}>Published releases</h4>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{releases.length}</span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Public sites stay fixed until you deploy again.
            </p>
            {releases.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'rgba(255,255,255,0.65)' }}>v{String(r.version).slice(-6)} · {timeAgo(r.createdAt)}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: r.status === 'live' ? '#4ade80' : 'rgba(255,255,255,0.35)' }}>{r.status.toUpperCase()}</span>
                {r.status !== 'live' && <button onClick={() => rollback(r)} disabled={disabled || busyId === `release:${r.id}`} style={{ ...btn(true), padding: '4px 8px', opacity: disabled ? 0.5 : 1 }}>Rollback</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(12,12,20,0.95)' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Previewing <b style={{ color: '#fff' }}>v{preview.version.seq}</b> (read-only)</span>
            {!preview.version.current && (
              <button onClick={() => restore(preview.version)} disabled={disabled || busyId === preview.version.id} style={{ ...btn(true), marginLeft: 'auto' }}><RotateCcw size={13} /> Restore this version</button>
            )}
            <button onClick={() => setPreview(null)} aria-label="Close version preview" title="Close preview" style={{ ...btn(false), marginLeft: preview.version.current ? 'auto' : 0 }}><X size={13} /> Close</button>
          </div>
          <iframe title={`Version ${preview.version.seq}`} srcDoc={preview.doc} sandbox={PREVIEW_SANDBOX} style={{ flex: 1, width: '100%', border: 'none', background: 'white' }} />
        </div>
      )}
    </div>
  )
}
