// Generated sites are previewed in iframes via srcDoc WITHOUT allow-same-origin,
// so their scripts run in an opaque origin: they cannot read the app's DOM,
// Redux state, storage or make same-origin requests as the user.
export const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"

// Opaque-origin documents throw on localStorage/sessionStorage access, which
// breaks common scripts (theme toggles etc.); give them an in-memory stand-in.
const STORAGE_SHIM = `<script>(function(){try{window.localStorage.length}catch(e){var mk=function(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true})}catch(e2){}}})();<\/script>`

const PREVIEW_HEAD = `<base target="_blank">${STORAGE_SHIM}`

export function buildPreviewDoc(html) {
  const head = /<head(\s[^>]*)?>/i.exec(html)
  if (head) return html.slice(0, head.index + head[0].length) + PREVIEW_HEAD + html.slice(head.index + head[0].length)
  return `<head>${PREVIEW_HEAD}</head>${html}`
}
