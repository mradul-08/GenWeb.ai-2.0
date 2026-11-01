// The public browser bundle must contain only the environment values the app
// reads by name. Runs a real production build into a temporary directory with
// simulated Vercel system secrets and unused variables, then scans the output.
// No network access; nothing outside the temp directory is written.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const viteBin = path.join(clientRoot, "node_modules", "vite", "bin", "vite.js")

// Every import.meta.env property the client may read. Adding one is a
// deliberate decision: it becomes public.
const ALLOWED_ENV_READS = new Set([
  "VITE_API_URL",
  "VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID", "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "MODE", "DEV", "PROD", "BASE_URL", "SSR",
])

const STAGING = {
  VITE_API_URL: "https://bundle-test-api.example.com",
  VITE_FIREBASE_API_KEY: "AIzaBundleTestPublicKey0000000000000000",
  VITE_FIREBASE_AUTH_DOMAIN: "genweb-bundle-test.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "genweb-bundle-test",
  VITE_FIREBASE_APP_ID: "1:999:web:bundletest",
  VITE_FIREBASE_STORAGE_BUCKET: "genweb-bundle-test.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "999000999",
}
// Present in the build environment, must never reach the bundle.
const MUST_NOT_SHIP = {
  VITE_VERCEL_AUTOMATION_BYPASS_SECRET: "simulated-bypass-secret-7f3a91",
  VITE_VERCEL_OIDC_TOKEN: "eyJhbGciOiJSUzI1NiJ9.eyJzaW11bGF0ZWQiOiJvaWRjIn0.simulatedsig42",
  VITE_VERCEL_ENV: "simulated-vercel-env-marker",
  VITE_VERCEL_URL: "simulated-preview-url-marker.vercel.app",
  VITE_UNUSED_PUBLIC_FLAG: "unused-variable-marker-5c2e",
  VITE_SERVER_URL: "https://unused-server-url-marker.example.com",
}

function srcFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? srcFiles(p) : /\.(jsx?|tsx?)$/.test(e.name) ? [p] : []
  })
}
function outputText(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).map(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? outputText(p) : /\.(js|mjs|css|html|map|json)$/.test(e.name) ? fs.readFileSync(p, "utf8") : ""
  }).join("\n")
}
function build(extraEnv) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "genweb-bundle-"))
  const env = { ...process.env, ...extraEnv }
  delete env.NODE_OPTIONS
  const r = spawnSync(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"],
    { cwd: clientRoot, env, encoding: "utf8", timeout: 180000 })
  return { ...r, outDir }
}

test("client source reads environment variables only by name, and only allowed ones", () => {
  const problems = []
  for (const file of srcFiles(path.join(clientRoot, "src"))) {
    // Comments may mention import.meta.env; only code counts.
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    for (const m of code.matchAll(/import\.meta\.env(\.([A-Za-z_][A-Za-z0-9_]*))?/g)) {
      const rel = path.relative(clientRoot, file)
      if (!m[2]) problems.push(`${rel}: whole import.meta.env object used`)
      else if (!ALLOWED_ENV_READS.has(m[2])) problems.push(`${rel}: reads ${m[2]} (not in the allowed list)`)
    }
  }
  assert.deepEqual(problems, [])
})

test("production build output contains the configured Firebase project and no other environment values", () => {
  const r = build({ ...STAGING, ...MUST_NOT_SHIP })
  try {
    assert.equal(r.status, 0, `build failed:\n${r.stderr}`)
    const out = outputText(r.outDir)
    assert.ok(out.length > 1000, "build produced assets")

    // Switching projects needed only environment variables.
    for (const v of Object.values(STAGING)) assert.ok(out.includes(v), `configured value missing: ${v}`)
    assert.ok(!out.includes("genwebai-dca16"), "no production Firebase value leaks into a staging build")

    for (const [name, v] of Object.entries(MUST_NOT_SHIP)) assert.ok(!out.includes(v), `${name} value was bundled`)
    // Only the Firebase variable *names* may appear (used in configuration error messages).
    // Any other VITE_ name would mean an environment object was inlined.
    const names = [...new Set(out.match(/VITE_[A-Z0-9_]+/g) ?? [])]
    const firebaseNames = new Set(Object.keys(STAGING).filter(n => n.startsWith("VITE_FIREBASE_")))
    assert.deepEqual(names.filter(n => !firebaseNames.has(n)), [], "unexpected VITE_ names in the bundle")
  } finally {
    fs.rmSync(r.outDir, { recursive: true, force: true })
  }
})

test("a user-defined secret-looking VITE_ variable still stops the build before anything is written", () => {
  const r = build({ ...STAGING, VITE_PAYMENT_SECRET: "should-never-ship" })
  try {
    assert.notEqual(r.status, 0)
    assert.match(r.stderr + r.stdout, /VITE_PAYMENT_SECRET/)
    assert.deepEqual(fs.readdirSync(r.outDir), [], "no assets written")
  } finally {
    fs.rmSync(r.outDir, { recursive: true, force: true })
  }
})

test("a missing required Firebase variable stops the build", () => {
  const r = build({ ...STAGING, VITE_FIREBASE_APP_ID: "" })
  try {
    assert.notEqual(r.status, 0)
    assert.match(r.stderr + r.stdout, /Missing Firebase configuration: VITE_FIREBASE_APP_ID/)
  } finally {
    fs.rmSync(r.outDir, { recursive: true, force: true })
  }
})
