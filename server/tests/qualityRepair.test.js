import test from "node:test"
import assert from "node:assert/strict"
import { repairQualityIssues } from "../ai/qualityRepair.js"

const issues = (...names) => ({ issues: names })

test("repairs each supported mechanical issue", () => {
  const html = '<html><head><title>Demo</title></head><body><main><h1>Demo</h1></main>'
  const repaired = repairQualityIssues(html, issues("missing_doctype", "missing_lang", "missing_viewport", "missing_body_close", "missing_html_close"))
  assert.match(repaired, /^<!DOCTYPE html>\n<html lang="en">/)
  assert.match(repaired, /<meta name="viewport" content="width=device-width, initial-scale=1">/)
  assert.match(repaired, /<\/body>\n<\/html>$/)
})

test("is idempotent after repair", () => {
  const html = '<html><head></head><body><section>Content</section>'
  const quality = issues("missing_doctype", "missing_lang", "missing_viewport", "missing_body_close", "missing_html_close")
  const once = repairQualityIssues(html, quality)
  assert.equal(repairQualityIssues(once, quality), once)
})

test("does nothing for good HTML", () => {
  const html = '<!DOCTYPE html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>Ready</main></body></html>'
  assert.equal(repairQualityIssues(html, { overall: 98, issues: [] }), html)
})

test("never overwrites existing language or viewport values", () => {
  const html = '<!DOCTYPE html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=2"></head><body><main>Ready</main></body></html>'
  assert.equal(repairQualityIssues(html, issues("missing_lang", "missing_viewport")), html)
})

test("does not append closing tags to ambiguous output", () => {
  const html = '<html><head></head><body><script>const value = "unfinished"'
  assert.equal(repairQualityIssues(html, issues("missing_body_close", "missing_html_close")), html)
})

