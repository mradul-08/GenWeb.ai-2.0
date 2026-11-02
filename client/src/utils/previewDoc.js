// Generated sites are previewed in iframes via srcDoc WITHOUT allow-same-origin,
// so their scripts run in an opaque origin: they cannot read the app's DOM,
// Redux state, storage or make same-origin requests as the user.
export const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"

// Opaque-origin documents throw on localStorage/sessionStorage access, which
// breaks common scripts (theme toggles etc.); give them an in-memory stand-in.
const STORAGE_SHIM = `<script>(function(){try{window.localStorage.length}catch(e){var mk=function(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true})}catch(e2){}})();</script>`

const PREVIEW_HEAD = `<base target="_blank">${STORAGE_SHIM}`

// Link handling inside the preview. The <base target="_blank"> above sends
// every link to a new tab, which breaks in-page navigation ("#menu", "Book
// now" buttons, footer links). So, for every preview:
//   "#id" / "#"       → scroll inside the preview;
//   "page.html[#id]"  → hand to the editor (multi-page sites), which opens that
//                       page — it only accepts pages the site really has;
//   anything else     → default (external links open in a new tab).
const LINK_NAV = `<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#"){e.preventDefault();var id=decodeURIComponent(h.slice(1));var t=id&&id!=="top"?document.getElementById(id):null;t?t.scrollIntoView({behavior:"smooth"}):window.scrollTo({top:0,behavior:"smooth"});return}var m=/^([a-z0-9][a-z0-9-]*\\.html)(#([^\\s"]*))?$/.exec(h);if(m){e.preventDefault();parent.postMessage({type:"gw-nav",page:m[1],hash:m[3]?decodeURIComponent(m[3]):""},"*")}},true)})();</script>`

const scrollToScript = (id) => `<script>addEventListener("DOMContentLoaded",function(){var t=document.getElementById(${JSON.stringify(id)});if(t)t.scrollIntoView()});</script>`

// options.scrollTo: element id to show first (after following "page.html#id").
// (options.pages is accepted for compatibility; link handling is always on.)
export function buildPreviewDoc(html, { scrollTo = "" } = {}) {
  const extra = PREVIEW_HEAD + LINK_NAV + (scrollTo && /^[^\s"<>]{1,80}$/.test(scrollTo) ? scrollToScript(scrollTo) : "")
  const head = /<head(\s[^>]*)?>/i.exec(html)
  if (head) return html.slice(0, head.index + head[0].length) + extra + html.slice(head.index + head[0].length)
  return `<head>${extra}</head>${html}`
}

export const isPageNavMessage = (data, paths) =>
  !!data && data.type === "gw-nav" && typeof data.page === "string" && paths.includes(data.page)
