// The Node version the server declares must satisfy every installed package.
// Render picks the runtime from package.json "engines" (unless NODE_VERSION,
// .node-version or .nvmrc override it), so a stale range ships an unsupported Node.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"

const pkg  = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"))

// Minimal semver range check for a concrete version (enough for engines fields).
const parse = (s) => {
  const m = String(s).trim().replace(/^v/, "").match(/^(\d+|x|\*)?(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/)
  const n = (p) => (p === undefined || p === "x" || p === "*" ? null : Number(p))
  return m && m[1] !== undefined ? [n(m[1]), n(m[2]), n(m[3])] : [null, null, null]
}
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }
const fill = (p, v) => p.map(x => x ?? v)
function comparatorOk(v, c) {
  const m = c.match(/^(>=|<=|>|<|=|\^|~)?\s*(.*)$/)
  const op = m[1] || "", p = parse(m[2])
  if (p[0] === null) return true                               // "*", "x", ""
  const lo = fill(p, 0)
  const nextUp = (i) => { const u = [...lo]; u[i]++; for (let j = i + 1; j < 3; j++) u[j] = 0; return u }
  if (op === ">=") return cmp(v, lo) >= 0
  if (op === ">")  return cmp(v, fill(p, Infinity)) > 0
  if (op === "<")  return cmp(v, lo) < 0
  if (op === "<=") return cmp(v, fill(p, Infinity)) <= 0
  if (op === "^")  return cmp(v, lo) >= 0 && cmp(v, nextUp(p[0] > 0 || p[1] === null ? 0 : p[1] > 0 || p[2] === null ? 1 : 2)) < 0
  if (op === "~")  return cmp(v, lo) >= 0 && cmp(v, nextUp(p[1] === null ? 0 : 1)) < 0
  const wild = p.indexOf(null)                                  // "24", "24.x", "=1.2.3"
  return wild === -1 ? cmp(v, lo) === 0 : cmp(v, lo) >= 0 && cmp(v, nextUp(wild - 1)) < 0
}
export function satisfies(version, range) {
  const v = parse(version)
  return String(range).split("||").some(alt => {
    const s = alt.trim()
    const hy = s.match(/^(\S+)\s+-\s+(\S+)$/)
    if (hy) return comparatorOk(v, ">=" + hy[1]) && comparatorOk(v, "<=" + hy[2])
    return s.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/).filter(Boolean).every(c => comparatorOk(v, c))
  })
}

test("range checker handles the forms used in engines fields", () => {
  assert.ok(satisfies("24.0.0", ">=20.19.0"))
  assert.ok(!satisfies("18.20.0", ">=20.19.0"))
  assert.ok(satisfies("24.5.0", "^20.19.0 || >=22.12.0"))
  assert.ok(!satisfies("21.0.0", "^20.19.0 || >=22.12.0"))
  assert.ok(satisfies("24.1.0", "24.x"))
  assert.ok(!satisfies("25.0.0", "24.x"))
  assert.ok(satisfies("24.0.0", ">= 18"))
  assert.ok(!satisfies("24.0.0", "^14.17.0 || ^16.10.0"))
  assert.ok(satisfies("24.0.0", "*"))
})

test("declared Node range is bounded (Render resolves unbounded ranges to the newest major)", () => {
  const range = pkg.engines?.node
  assert.ok(range, "engines.node must be set")
  assert.ok(!satisfies("999.0.0", range), `"${range}" has no upper bound`)
  assert.equal(lock.packages[""].engines?.node, range, "package-lock root engines must match package.json")
})

test("every installed package supports the lowest and highest Node versions the server declares", () => {
  const range = pkg.engines.node
  const major = Number(parse(range)[0])
  const lowest = `${major}.0.0`, highest = `${major}.999.999`
  assert.ok(satisfies(lowest, range) && satisfies(highest, range))
  const problems = []
  for (const [path, meta] of Object.entries(lock.packages)) {
    const req = meta.engines?.node
    if (!path || !req || typeof req !== "string") continue
    for (const v of [lowest, highest]) if (!satisfies(v, req)) problems.push(`${path.replace(/^node_modules\//, "")} requires node ${req} (fails for ${v})`)
  }
  assert.deepEqual(problems, [])
})

test("mongoose and the MongoDB driver (the packages that broke Node 18) are covered", () => {
  for (const name of ["mongoose", "mongodb"]) {
    const req = lock.packages[`node_modules/${name}`]?.engines?.node
    assert.ok(req, `${name} engines present in lockfile`)
    assert.ok(!satisfies("18.20.8", req), `${name} indeed rejects Node 18 (${req})`)
    assert.ok(satisfies(`${parse(pkg.engines.node)[0]}.0.0`, req))
  }
})

test("the Node running these tests is inside the declared range", () => {
  assert.ok(satisfies(process.versions.node, pkg.engines.node), `running ${process.versions.node}, declared ${pkg.engines.node}`)
})
