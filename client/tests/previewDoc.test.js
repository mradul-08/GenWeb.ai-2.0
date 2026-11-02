// Preview documents: sandbox helpers and in-preview link handling.
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildPreviewDoc, isPageNavMessage, PREVIEW_SANDBOX } from "../src/utils/previewDoc.js"

const PAGE = `<!DOCTYPE html><html><head><title>x</title></head><body><a href="#menu">Menu</a><section id="menu"></section></body></html>`

test("every preview handles in-page links inside the preview (single and multi-page)", () => {
  for (const doc of [buildPreviewDoc(PAGE), buildPreviewDoc(PAGE, { pages: true })]) {
    assert.match(doc, /<head><base target="_blank">/)
    assert.match(doc, /h\.charAt\(0\)==="#"/, "same-page anchors are intercepted")
    assert.match(doc, /type:"gw-nav"/, "page links are handed to the editor")
    assert.ok(doc.indexOf("gw-nav") < doc.indexOf("<title>"), "handler is injected at the start of <head>")
  }
})

test("scrollTo is only injected for safe ids", () => {
  assert.match(buildPreviewDoc(PAGE, { scrollTo: "about-us" }), /getElementById\("about-us"\)/)
  assert.doesNotMatch(buildPreviewDoc(PAGE, { scrollTo: "</script><script>alert(1)" }), /alert\(1\)/)
  assert.doesNotMatch(buildPreviewDoc(PAGE, { scrollTo: 'a" onload="x' }), /onload/)
})

test("documents without <head> still get the preview helpers", () => {
  assert.match(buildPreviewDoc("<p>hi</p>"), /^<head><base target="_blank">/)
})

test("the editor accepts page-navigation messages only for pages the site has", () => {
  const paths = ["index.html", "menu.html"]
  assert.equal(isPageNavMessage({ type: "gw-nav", page: "menu.html", hash: "" }, paths), true)
  assert.equal(isPageNavMessage({ type: "gw-nav", page: "evil.html" }, paths), false)
  assert.equal(isPageNavMessage({ type: "other", page: "menu.html" }, paths), false)
  assert.equal(isPageNavMessage(null, paths), false)
})

test("the preview sandbox never grants same-origin access", () => {
  assert.doesNotMatch(PREVIEW_SANDBOX, /allow-same-origin/)
})
