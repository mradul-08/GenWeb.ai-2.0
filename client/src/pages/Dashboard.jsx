import React, { useState, useEffect, useRef } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, Search, Pencil, Globe, Rocket, Download, Trash2, MoreHorizontal, Link2, ExternalLink, Zap, LayoutGrid, FileText, Sparkles, X, Check, Share2, Gem } from "lucide-react";
import { serverUrl } from "../config";
import AppHeader from "../components/AppHeader";
import { C, FONT, GLOBAL_CSS, pageBackground, btn, card, input, shadow } from "../theme";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function useOutsideClick(ref, cb) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, cb]);
}

function useEscape(cb) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") cb(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cb]);
}

function timeAgo(date) {
  if (!date) return "";
  const s = Math.max(0, (Date.now() - new Date(date)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const pageCount = (site) => (site.kind === "static" && site.files?.length) || 1;

// Downloads the saved site as a ZIP (same endpoint as the editor).
async function downloadZip(id) {
  const res = await axios.get(`${serverUrl}/api/website/${id}/export`, { withCredentials: true, responseType: "blob" });
  const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "website.zip";
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const START_IDEAS = [
  ["💇", "Salon", "A unisex salon in my city with services, prices and online appointments"],
  ["☕", "Café", "A cosy café with a menu, opening hours, photos and table booking"],
  ["🏋️", "Gym", "A gym with programs, trainers, memberships and a free trial form"],
  ["🩺", "Clinic", "A dental clinic with treatments, doctors, timings and appointments"],
  ["🎨", "Portfolio", "A portfolio for a freelance designer with selected work and a contact form"],
];

/* ── modal shell ─────────────────────────────────────────────────────────── */

function Modal({ onClose, children, width = 440, labelledBy }) {
  useEscape(onClose);
  return (
    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(20,17,43,0.38)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Motion.div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        style={{ ...card, boxShadow: shadow.lg, borderRadius: 22, padding: 28, width: "100%", maxWidth: width, position: "relative", fontFamily: FONT }}>
        <button aria-label="Close" onClick={onClose} style={{ ...btn.ghost, position: "absolute", top: 14, right: 14, padding: 6, color: C.muted }}><X size={18} /></button>
        {children}
      </Motion.div>
    </Motion.div>
  );
}

const modalIcon = (Icon, color) => (
  <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: `${color}14`, border: `1px solid ${color}30`, marginBottom: 16 }}>
    <Icon size={22} color={color} />
  </div>
);

/* ── publish modal ───────────────────────────────────────────────────────── */

function PublishModal({ site, onClose, onChanged }) {
  const [phase, setPhase] = useState(site.deployed ? "live" : "idle");
  const [url, setUrl] = useState(site.deployUrl || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publish = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await axios.post(`${serverUrl}/api/website/${site._id}/deploy`, {}, { withCredentials: true });
      if (!data.success) throw new Error(data.message);
      setUrl(data.deployUrl); setPhase("live"); onChanged(site._id, data.deployUrl);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Publishing failed. Please try again.");
    } finally { setBusy(false); }
  };
  const unpublish = async () => {
    setBusy(true); setErr("");
    try {
      await axios.post(`${serverUrl}/api/website/${site._id}/undeploy`, {}, { withCredentials: true });
      setUrl(""); setPhase("idle"); onChanged(site._id, "");
    } catch (e) {
      setErr(e?.response?.data?.message || "Could not unpublish. Please try again.");
    } finally { setBusy(false); }
  };
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  const share = [
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${site.title}\n${url}`)}`],
    ["X", `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(site.title || "")}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
  ];

  return (
    <Modal onClose={onClose} labelledBy="publish-title">
      {phase === "live" && url ? (
        <>
          {modalIcon(Globe, C.green)}
          <h3 id="publish-title" style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>Your site is live</h3>
          <p style={{ margin: "0 0 18px", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>Anyone with the link can see <b style={{ color: C.text }}>{site.title}</b>. Publishing again pushes your latest changes; the link stays the same.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green, flexShrink: 0 }} />
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#047857", fontWeight: 600, fontFamily: "ui-monospace,monospace", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</a>
            <button onClick={copy} style={{ ...btn.ghost, padding: "5px 10px", fontSize: 12.5, color: "#047857", background: "#fff", border: "1px solid #a7f3d0" }}>{copied ? <><Check size={14} /> Copied</> : <><Link2 size={14} /> Copy</>}</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}><Share2 size={14} /> Share:</span>
            {share.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{ ...btn.secondary, padding: "6px 12px", fontSize: 13, textDecoration: "none" }}>{label}</a>
            ))}
          </div>
          {err && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: C.red }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btn.primary, flex: "1 1 140px", textDecoration: "none", padding: "11px 16px", fontSize: 14 }}><ExternalLink size={16} /> Open site</a>
            <button onClick={publish} disabled={busy} style={{ ...btn.secondary, flex: "1 1 120px", padding: "11px 16px", fontSize: 14 }}><Rocket size={16} /> {busy ? "Working…" : "Publish again"}</button>
            <button onClick={unpublish} disabled={busy} style={{ ...btn.ghost, flex: "1 1 100%", color: C.red, justifyContent: "center" }}>Unpublish (take the site offline)</button>
          </div>
        </>
      ) : (
        <>
          {modalIcon(Rocket, C.violet)}
          <h3 id="publish-title" style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>Publish “{site.title || "Untitled"}”</h3>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>Your site gets a public GenWeb link you can share. Before publishing, check the prices, hours, phone number and reviews are correct.</p>
          {err && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: C.red }}>{err}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ ...btn.secondary, flex: 1, fontSize: 14 }}>Cancel</button>
            <button onClick={publish} disabled={busy} style={{ ...btn.primary, flex: 2, fontSize: 14, opacity: busy ? 0.7 : 1 }}><Rocket size={16} /> {busy ? "Publishing…" : "Publish now"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── project card ────────────────────────────────────────────────────────── */

// Live sites show the real page scaled down; drafts show a mock in their colours.
function Thumbnail({ site }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.25);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const accent = site.thumbnailAccent || C.violet;
  const bg = site.thumbnailBg || "#ffffff";
  return (
    <div ref={box} style={{ position: "relative", aspectRatio: "16 / 10", overflow: "hidden", background: bg, borderBottom: `1px solid ${C.border}` }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, padding: "9% 9%", display: "flex", flexDirection: "column", gap: "6%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ width: "22%", height: 8, borderRadius: 4, background: accent, opacity: 0.85 }} />
          <span style={{ display: "flex", gap: 6 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 22, height: 6, borderRadius: 3, background: accent, opacity: 0.3 }} />)}</span>
        </div>
        <div style={{ fontSize: "clamp(14px,1.6vw,20px)", fontWeight: 800, color: accent, lineHeight: 1.15, maxWidth: "80%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", filter: "saturate(1.1)" }}>{site.thumbnailTitle || site.title || "Untitled"}</div>
        <span style={{ width: "28%", height: 14, borderRadius: 7, background: accent }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: "auto" }}>
          {[0, 1, 2].map(i => <span key={i} style={{ height: 34, borderRadius: 8, background: accent, opacity: 0.14 }} />)}
        </div>
      </div>
      {site.deployed && site.deployUrl && (
        <iframe title={`Preview of ${site.title}`} src={site.deployUrl} loading="lazy" scrolling="no" tabIndex={-1} sandbox="allow-scripts" onLoad={() => setLoaded(true)}
          style={{ position: "absolute", top: 0, left: 0, width: 1280, height: 800, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none", background: "#fff", opacity: loaded ? 1 : 0, transition: "opacity .4s" }} />
      )}
    </div>
  );
}

function StatusBadge({ live }) {
  return live ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} /> Live
    </span>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, background: C.soft, border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 700 }}>Draft</span>
  );
}

function ProjectCard({ site, index, navigate, onPublish, onDelete, onToast }) {
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef(null);
  const close = React.useCallback(() => setMenu(false), []);
  useOutsideClick(ref, close);
  const edit = () => navigate(`/editor?id=${site._id}`);
  const pages = pageCount(site);

  const exportZip = async () => {
    setMenu(false); setExporting(true);
    try { await downloadZip(site._id); } catch { onToast("Export failed. Please try again."); } finally { setExporting(false); }
  };
  const copyLink = () => {
    setMenu(false);
    navigator.clipboard?.writeText(site.deployUrl).then(() => onToast("Link copied"), () => onToast("Could not copy the link"));
  };

  const items = [
    { label: "Edit", icon: Pencil, action: edit },
    site.deployed && site.deployUrl && { label: "Open live site", icon: ExternalLink, action: () => { setMenu(false); window.open(site.deployUrl, "_blank", "noopener"); } },
    site.deployed && site.deployUrl && { label: "Copy link", icon: Link2, action: copyLink },
    { label: site.deployed ? "Publish settings" : "Publish", icon: Rocket, action: () => { setMenu(false); onPublish(site); } },
    { label: exporting ? "Exporting…" : "Download ZIP", icon: Download, action: exportZip },
    { label: "Delete", icon: Trash2, action: () => { setMenu(false); onDelete(site); }, danger: true },
  ].filter(Boolean);

  return (
    <Motion.article initial={{ y: 14 }} animate={{ y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35 }}
      className="gw-card" style={{ ...card, overflow: "visible", display: "flex", flexDirection: "column" }}>
      <button onClick={edit} aria-label={`Open ${site.title || "website"} in the editor`} style={{ padding: 0, border: 0, background: "none", cursor: "pointer", display: "block", borderRadius: "18px 18px 0 0", overflow: "hidden", textAlign: "left" }}>
        <Thumbnail site={site} />
      </button>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 title={site.title} style={{ margin: "0 0 5px", fontSize: 15.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{site.title || "Untitled"}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: C.muted }}>
              <StatusBadge live={site.deployed} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><FileText size={13} />{pages} {pages === 1 ? "page" : "pages"}</span>
              <span>· Edited {timeAgo(site.updatedAt || site.createdAt)}</span>
            </div>
          </div>
          <div ref={ref} style={{ position: "relative" }}>
            <button aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}
              style={{ ...btn.ghost, padding: 6, color: C.muted, background: menu ? C.soft : "transparent" }}><MoreHorizontal size={18} /></button>
            {menu && (
              <div role="menu" style={{ position: "absolute", right: 0, top: 36, zIndex: 50, width: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: shadow.lg, padding: 6 }}>
                {items.map(({ label, icon, action, danger }) => (
                  <button key={label} role="menuitem" onClick={action}
                    style={{ ...btn.ghost, width: "100%", justifyContent: "flex-start", padding: "9px 10px", fontSize: 13.5, color: danger ? C.red : C.text, borderTop: danger ? `1px solid ${C.border}` : "none", borderRadius: danger ? 0 : 10 }}>
                    {React.createElement(icon, { size: 15 })}{label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button onClick={edit} style={{ ...btn.primary, flex: 1, padding: "9px 12px", fontSize: 13.5, boxShadow: "none" }}><Pencil size={15} /> Edit</button>
          {site.deployed && site.deployUrl
            ? <a href={site.deployUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn.secondary, flex: 1, padding: "9px 12px", fontSize: 13.5, textDecoration: "none" }}><ExternalLink size={15} /> View live</a>
            : <button onClick={() => onPublish(site)} style={{ ...btn.secondary, flex: 1, padding: "9px 12px", fontSize: 13.5 }}><Rocket size={15} /> Publish</button>}
        </div>
      </div>
    </Motion.article>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

function Stat({ icon, label, value, color, action }) {
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: `${color}14`, color, flexShrink: 0 }}>{React.createElement(icon, { size: 20 })}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, color: C.muted }}>{label}</div>
      </div>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const { userData } = useSelector(s => s.user);
  const navigate = useNavigate();
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("edited");
  const [publishing, setPublishing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [idea, setIdea] = useState("");

  useEffect(() => { if (userData === null) navigate("/login"); }, [userData, navigate]);

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const { data } = await axios.get(`${serverUrl}/api/user/websites`, { withCredentials: true });
      setWebsites(data.websites || []);
    } catch {
      setLoadError("Could not load your websites.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (userData?._id) load(); }, [userData?._id, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await axios.delete(`${serverUrl}/api/website/${deleting._id}`, { withCredentials: true });
      setWebsites(p => p.filter(w => w._id !== deleting._id));
      setToast("Website deleted");
      setDeleting(null);
    } catch {
      setToast("Could not delete. Please try again.");
    } finally { setDeleteBusy(false); }
  };
  const onPublishChanged = (id, url) => {
    setWebsites(p => p.map(w => (w._id === id ? { ...w, deployed: !!url, deployUrl: url, updatedAt: new Date().toISOString() } : w)));
    setPublishing(p => (p && p._id === id ? { ...p, deployed: !!url, deployUrl: url } : p));
  };
  const startWith = (text) => {
    const t = (text || "").trim();
    if (t) sessionStorage.setItem("pendingPrompt", t.slice(0, 1500));
    navigate("/generate");
  };

  if (!userData) return <div style={{ minHeight: "100vh", ...pageBackground }} />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (userData.name || "there").split(" ")[0];
  const credits = userData.credits ?? 0;
  const liveCount = websites.filter(w => w.deployed).length;
  const counts = { all: websites.length, live: liveCount, draft: websites.length - liveCount };

  const q = query.trim().toLowerCase();
  const shown = websites
    .filter(w => (tab === "live" ? w.deployed : tab === "draft" ? !w.deployed : true))
    .filter(w => !q || (w.title || "").toLowerCase().includes(q))
    .sort((a, b) => sort === "name" ? (a.title || "").localeCompare(b.title || "")
      : sort === "created" ? new Date(b.createdAt) - new Date(a.createdAt)
      : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  return (
    <div style={{ minHeight: "100vh", ...pageBackground, color: C.text, fontFamily: FONT }}>
      <style>{GLOBAL_CSS + `.gw-card{transition:transform .2s, box-shadow .2s}.gw-card:hover{transform:translateY(-3px);box-shadow:${shadow.lg}}
        @media (max-width:640px){.gw-dash-hero{grid-template-columns:1fr !important}.gw-toolbar{flex-direction:column;align-items:stretch !important}.gw-toolbar>*{flex:none !important}}`}</style>
      <AppHeader />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(20px,4vw,36px) clamp(16px,4vw,32px) 64px" }}>
        {/* Welcome + start a new site */}
        <section className="gw-dash-hero" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 18, marginBottom: 18 }}>
          <div style={{ ...card, padding: "clamp(22px,3vw,32px)", position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", right: -60, top: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.14), transparent 70%)" }} />
            <p style={{ margin: "0 0 4px", fontSize: 14, color: C.muted, fontWeight: 600 }}>{greeting}, {firstName} 👋</p>
            <h1 style={{ margin: "0 0 18px", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>What are we building today?</h1>
            <form onSubmit={(e) => { e.preventDefault(); startWith(idea); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label htmlFor="dash-idea" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Describe your business</label>
              <input id="dash-idea" value={idea} onChange={e => setIdea(e.target.value)} maxLength={1500} placeholder="Describe your business in a sentence…" style={{ ...input, flex: "1 1 260px", background: C.soft }} />
              <button type="submit" style={{ ...btn.primary, flex: "0 0 auto" }}><Sparkles size={17} /> Start</button>
            </form>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
              {START_IDEAS.map(([icon, label, text]) => (
                <button key={label} type="button" onClick={() => setIdea(text)} aria-pressed={idea === text}
                  style={{ padding: "6px 12px", borderRadius: 99, border: `1px solid ${idea === text ? C.violet : C.border}`, background: idea === text ? "rgba(124,58,237,0.08)" : C.surface, color: idea === text ? C.violet : C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <Stat icon={Zap} color="#d97706" label="Credits left" value={credits}
              action={<button onClick={() => navigate("/pricing")} style={{ ...btn.secondary, marginLeft: "auto", padding: "7px 12px", fontSize: 13 }}><Gem size={14} /> Buy</button>} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat icon={LayoutGrid} color={C.violet} label="Websites" value={loading ? "–" : websites.length} />
              <Stat icon={Globe} color={C.green} label="Live" value={loading ? "–" : liveCount} />
            </div>
          </div>
        </section>

        {credits <= 0 && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", marginBottom: 18, borderRadius: 14, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 14 }}>
            <Zap size={18} color="#d97706" />
            <span style={{ flex: 1, minWidth: 200 }}>You're out of credits. Planning a site and the design editor stay free; generating and AI edits need credits.</span>
            <button onClick={() => navigate("/pricing")} style={{ ...btn.secondary, padding: "7px 14px", fontSize: 13.5 }}>Get credits</button>
          </div>
        )}

        {/* Projects */}
        <section aria-labelledby="my-sites" style={{ marginTop: 30 }}>
          <div className="gw-toolbar" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <h2 id="my-sites" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink, marginRight: "auto" }}>My websites</h2>
            <div role="tablist" aria-label="Filter" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
              {[["all", "All"], ["live", "Live"], ["draft", "Drafts"]].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  style={{ ...btn.ghost, flex: 1, justifyContent: "center", padding: "6px 12px", fontSize: 13.5, background: tab === k ? C.soft : "transparent", color: tab === k ? C.violet : C.muted }}>
                  {label} <span style={{ fontSize: 12, opacity: 0.75 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="gw-search" style={{ position: "relative", flex: "0 1 240px" }}>
              <Search size={16} color={C.faint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input aria-label="Search websites" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" style={{ ...input, padding: "9px 12px 9px 36px", fontSize: 14 }} />
            </div>
            <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)} style={{ ...input, width: "auto", padding: "9px 12px", fontSize: 14, cursor: "pointer" }}>
              <option value="edited">Recently edited</option>
              <option value="created">Newest first</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,290px),1fr))", gap: 18 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ ...card, overflow: "hidden" }}>
                  <div className="gw-skel" style={{ aspectRatio: "16 / 10" }} />
                  <div style={{ padding: 16, display: "grid", gap: 10 }}><div className="gw-skel" style={{ height: 14, width: "60%", borderRadius: 6 }} /><div className="gw-skel" style={{ height: 34, borderRadius: 10 }} /></div>
                </div>
              ))}
              <style>{`.gw-skel{background:linear-gradient(90deg,${C.soft},#fbfaff,${C.soft});background-size:200% 100%;animation:gwskel 1.3s infinite}@keyframes gwskel{to{background-position:-200% 0}}`}</style>
            </div>
          ) : loadError ? (
            <div style={{ ...card, padding: 28, textAlign: "center" }}>
              <p style={{ margin: "0 0 14px", color: C.text }}>{loadError}</p>
              <button onClick={load} style={btn.secondary}>Try again</button>
            </div>
          ) : websites.length === 0 ? (
            <div style={{ ...card, padding: "clamp(32px,6vw,56px)", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto 18px", display: "grid", placeItems: "center", background: C.brand, color: "#fff", boxShadow: shadow.brand }}><Sparkles size={28} /></div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: C.ink }}>No websites yet</h3>
              <p style={{ margin: "0 auto 22px", maxWidth: 420, color: C.muted, lineHeight: 1.6 }}>Describe your business above, or pick an idea. You'll see the plan first — planning is free.</p>
              <button onClick={() => startWith(idea)} style={btn.primary}><Plus size={17} /> Create my first website</button>
            </div>
          ) : shown.length === 0 ? (
            <div style={{ ...card, padding: 28, textAlign: "center", color: C.muted }}>
              No websites match{q ? <> “<b style={{ color: C.text }}>{query}</b>”</> : " this filter"}.{" "}
              <button onClick={() => { setQuery(""); setTab("all"); }} style={{ ...btn.ghost, display: "inline-flex", color: C.violet }}>Show all</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,290px),1fr))", gap: 18 }}>
              <button onClick={() => navigate("/generate")} className="gw-card"
                style={{ ...card, boxShadow: "none", border: `2px dashed ${C.borderStrong}`, background: "rgba(255,255,255,0.6)", minHeight: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", fontFamily: FONT, color: C.violet }}>
                <span style={{ width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(124,58,237,0.1)" }}><Plus size={26} /></span>
                <span style={{ fontSize: 15.5, fontWeight: 700, color: C.ink }}>New website</span>
                <span style={{ fontSize: 13, color: C.muted }}>Start from a sentence</span>
              </button>
              {shown.map((site, i) => (
                <ProjectCard key={site._id} site={site} index={i} navigate={navigate} onPublish={setPublishing} onDelete={setDeleting} onToast={setToast} />
              ))}
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {publishing && <PublishModal key="publish" site={publishing} onClose={() => setPublishing(null)} onChanged={onPublishChanged} />}
        {deleting && (
          <Modal key="delete" onClose={() => !deleteBusy && setDeleting(null)} width={400} labelledBy="delete-title">
            {modalIcon(Trash2, C.red)}
            <h3 id="delete-title" style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: C.ink }}>Delete “{deleting.title || "Untitled"}”?</h3>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>The website, all its pages and its version history are deleted permanently.{deleting.deployed ? " Its public link stops working." : ""} This can't be undone.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleting(null)} disabled={deleteBusy} style={{ ...btn.secondary, flex: 1, fontSize: 14 }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleteBusy} style={{ ...btn.primary, flex: 1, fontSize: 14, background: C.red, boxShadow: "none", opacity: deleteBusy ? 0.7 : 1 }}>{deleteBusy ? "Deleting…" : "Delete"}</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <Motion.div role="status" initial={{ x: "-50%", y: 20, opacity: 0 }} animate={{ x: "-50%", y: 0, opacity: 1 }} exit={{ x: "-50%", y: 20, opacity: 0 }}
            style={{ position: "fixed", bottom: 24, left: "50%", zIndex: 600, padding: "11px 18px", borderRadius: 12, background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: shadow.lg, fontFamily: FONT }}>
            {toast}
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
