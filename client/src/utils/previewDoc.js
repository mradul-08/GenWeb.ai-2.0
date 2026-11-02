// Generated sites are previewed in iframes via srcDoc WITHOUT allow-same-origin,
// so their scripts run in an opaque origin: they cannot read the app's DOM,
// Redux state, storage or make same-origin requests as the user.
export const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"

// Opaque-origin documents throw on localStorage/sessionStorage access, which
// breaks common scripts (theme toggles etc.); give them an in-memory stand-in.
const STORAGE_SHIM = `<script>(function(){try{window.localStorage.length}catch(e){var mk=function(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true})}catch(e2){}}})();<\/script>`

const PREVIEW_HEAD = `<base target="_blank">${STORAGE_SHIM}`

// Multi-page sites: a click on a link to another page of the site
// ("menu.html", "index.html#about") is handed to the editor, which shows that
// page; same-page "#id" links scroll in place. The sandboxed page can only
// post a page name — the editor accepts it only if the site has that page.
const PAGE_NAV = `<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";var m=/^([a-z0-9][a-z0-9-]*\\.html)?(#([A-Za-z0-9_-]*))?$/.exec(h);if(!m)return;e.preventDefault();if(m[1]){parent.postMessage({type:"gw-nav",page:m[1],hash:m[3]||""},"*")}else{var t=m[3]&&m[3]!=="top"?document.getElementById(m[3]):null;t?t.scrollIntoView({behavior:"smooth"}):window.scrollTo({top:0,behavior:"smooth"})}},true)})();</script>`

const scrollToScript = (id) => `<script>addEventListener("DOMContentLoaded",function(){var t=document.getElementById(${JSON.stringify(id)});if(t)t.scrollIntoView()});</script>`

// options.pages: the page is part of a multi-page site (enables page links).
// options.scrollTo: element id to show first (after following "page.html#id").
export function buildPreviewDoc(html, { pages = false, scrollTo = "" } = {}) {
  const extra = PREVIEW_HEAD + (pages ? PAGE_NAV : "") + (scrollTo && /^[A-Za-z0-9_-]{1,60}$/.test(scrollTo) ? scrollToScript(scrollTo) : "")
  const head = /<head(\s[^>]*)?>/i.exec(html)
  if (head) return html.slice(0, head.index + head[0].length) + extra + html.slice(head.index + head[0].length)
  return `<head>${extra}</head>${html}`
}

export const isPageNavMessage = (data, paths) =>
  !!data && data.type === "gw-nav" && typeof data.page === "string" && paths.includes(data.page)
