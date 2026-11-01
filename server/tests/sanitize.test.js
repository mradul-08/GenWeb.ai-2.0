import { test } from "node:test"
import assert from "node:assert/strict"
import { replaceExternalImages } from "../ai/sanitize.js"

const PAGE = `<html><head>
<link href="https://fonts.googleapis.com/css2?family=Lora" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Inter');
.hero{background:url("https://images.example.com/fake-hero.jpg") center/cover, linear-gradient(#fff,#eee)}
.logo{background-image:url(/local/logo.png)}
@font-face{font-family:X;src:url(https://cdn.example.com/x.woff2)}</style></head><body>
<img src="https://images.unsplash.com/photo-123?w=800" srcset="https://x.example.com/a.jpg 2x" alt="Fresh bread">
<img src="https://shop.example.com/real-product.jpg" alt="Product">
<img src="data:image/png;base64,AAAA" alt="inline">
<img src="images/local.png" alt="relative">
<img src="" alt="empty">
<div style="background-image: url('//cdn.example.com/bg.png')">x</div>
</body></html>`

test("fabricated external images are replaced; user-provided, inline, relative and font URLs are kept", () => {
  const { html, replaced } = replaceExternalImages(PAGE, "Use my product photo https://shop.example.com/real-product.jpg please")
  assert.equal(replaced, 5)   // unsplash img, relative img, empty img, hero background, inline-style background                                            // unsplash img, hero background, inline-style background
  assert.ok(!html.includes("images.unsplash.com"))
  assert.ok(!html.includes("fake-hero.jpg"))
  assert.ok(!html.includes("cdn.example.com/bg.png"))
  assert.ok(!html.includes("srcset="))
  assert.ok(html.includes('alt="Fresh bread"'))
  assert.ok(html.includes("data:image/svg+xml"))
  assert.ok(html.includes("https://shop.example.com/real-product.jpg"), "user-provided URL kept")
  assert.ok(html.includes("fonts.googleapis.com/css2?family=Inter"), "@import font kept")
  assert.ok(html.includes("fonts.googleapis.com/css2?family=Lora"), "font link kept")
  assert.ok(html.includes("x.woff2"), "web font kept")
  assert.ok(html.includes("data:image/png;base64,AAAA"), "inline image kept")
  assert.ok(!html.includes('src="images/local.png"') && !html.includes('src=""'), "unloadable relative/empty srcs replaced")
  assert.ok(html.includes("/local/logo.png"), "relative CSS url() is left alone (not an <img>)")
  assert.ok(html.includes("background:none center/cover, linear-gradient"), "background stays valid CSS")
})

test("pages without unloadable images are unchanged", () => {
  const page = "<html><body><img src='data:image/gif;base64,R0lGOD' alt=''><p>hi</p></body></html>"
  assert.deepEqual(replaceExternalImages(page, ""), { html: page, replaced: 0 })
})
