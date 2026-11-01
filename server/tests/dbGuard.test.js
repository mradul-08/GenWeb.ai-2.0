// Production-database guard. Pure checks on fake URIs; nothing here connects
// to any database except through a stubbed mongoose.connect.
import { test } from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { checkDatabaseTarget, assertSafeDatabaseTarget, databaseHosts, UnsafeDatabaseTargetError, DEFAULT_PRODUCTION_DB_HOSTS } from "../config/dbGuard.js"
import connectDb from "../config/db.js"

const PROD  = "mongodb+srv://user:p%40ss@cluster0.ayk95r2.mongodb.net/websiteBuilder?retryWrites=true"
const STAGE = "mongodb+srv://user:pw@staging.zz11aa.mongodb.net/genweb_staging"
const LOCAL = "mongodb://127.0.0.1:27017/genweb_dev?replicaSet=rs0"
const ok  = (uri, env) => checkDatabaseTarget(uri, env).ok

test("host parsing handles srv, seed lists, IPv6, credentials and ports without leaking credentials", () => {
  assert.deepEqual(databaseHosts(PROD), ["cluster0.ayk95r2.mongodb.net"])
  assert.deepEqual(databaseHosts("mongodb://a:b@h1.example.com:27017,H2.example.com:27018/db"), ["h1.example.com", "h2.example.com"])
  assert.deepEqual(databaseHosts("mongodb://[::1]:27017/db"), ["::1"])
  assert.deepEqual(databaseHosts("mongodb://localhost/db"), ["localhost"])
  assert.equal(databaseHosts("postgres://x"), null)
  assert.equal(databaseHosts(undefined), null)
  assert.ok(!JSON.stringify(checkDatabaseTarget(PROD, {})).includes("p%40ss"), "result never contains the password")
})

test("the production database is refused everywhere except APP_ENV=production", () => {
  for (const APP_ENV of [undefined, "", "development", "test", "staging"]) {
    for (const extra of [{}, { ALLOW_REMOTE_DB: "true" }]) {
      const r = checkDatabaseTarget(PROD, { APP_ENV, ...extra })
      assert.equal(r.ok, false, `APP_ENV=${APP_ENV} ${JSON.stringify(extra)}`)
      assert.match(r.reason, /production database host/)
    }
  }
  assert.equal(ok(PROD, { APP_ENV: "production" }), true)
  assert.equal(ok(PROD, { APP_ENV: " Production " }), true, "case/whitespace tolerant")
})

test("a production host in a seed list is detected even when listed second", () => {
  const uri = "mongodb://u:p@backup.example.com:27017,shard-00-01.ayk95r2.mongodb.net:27017/db"
  assert.equal(ok(uri, { APP_ENV: "staging" }), false)
})

test("ambiguous environment: no APP_ENV and a remote database is refused", () => {
  const r = checkDatabaseTarget(STAGE, {})
  assert.equal(r.ok, false)
  assert.match(r.reason, /APP_ENV is not set/)
})

test("unknown APP_ENV values are refused rather than guessed", () => {
  assert.equal(ok(LOCAL, { APP_ENV: "prod" }), false)
  assert.equal(ok(STAGE, { APP_ENV: "live" }), false)
})

test("local databases are allowed in every environment (no production data can live there)", () => {
  for (const APP_ENV of [undefined, "development", "test", "staging", "production"]) {
    for (const uri of [LOCAL, "mongodb://localhost:27017/x", "mongodb://[::1]:27017/x", "mongodb://db.localhost/x"]) {
      assert.equal(ok(uri, { APP_ENV }), true, `${APP_ENV} ${uri}`)
    }
  }
})

test("staging may use its own remote cluster; development/test need an explicit opt-in for one", () => {
  assert.equal(ok(STAGE, { APP_ENV: "staging" }), true)
  assert.equal(ok(STAGE, { APP_ENV: "development" }), false)
  assert.equal(ok(STAGE, { APP_ENV: "test" }), false)
  assert.equal(ok(STAGE, { APP_ENV: "development", ALLOW_REMOTE_DB: "true" }), true)
  assert.equal(ok(STAGE, { APP_ENV: "development", ALLOW_REMOTE_DB: "1" }), false, "only the exact value 'true' opts in")
})

test("PRODUCTION_DB_HOSTS overrides the built-in list (exact hosts and .suffix entries)", () => {
  const env = { APP_ENV: "staging", PRODUCTION_DB_HOSTS: "prod.example.net, .prodproject.mongodb.net" }
  assert.equal(ok("mongodb://prod.example.net/db", env), false)
  assert.equal(ok("mongodb+srv://c0.prodproject.mongodb.net/db", env), false)
  assert.equal(ok("mongodb://notprod.example.net/db", env), true)
  assert.equal(ok(PROD, env), true, "the override replaces the default list")
  assert.ok(DEFAULT_PRODUCTION_DB_HOSTS.includes(".ayk95r2.mongodb.net"))
})

test("missing or malformed URIs are refused", () => {
  for (const uri of [undefined, "", "not a uri", "http://cluster0.ayk95r2.mongodb.net"]) {
    assert.equal(ok(uri, { APP_ENV: "production" }), false, String(uri))
  }
  assert.throws(() => assertSafeDatabaseTarget(undefined, {}), UnsafeDatabaseTargetError)
})

test("connectDb refuses before any connection attempt; a safe target still connects", async () => {
  const original = mongoose.connect
  const savedEnv = process.env.APP_ENV
  const calls = []
  // The stub records the URI and stops: no network, and connectDb never reaches ensureIndexes.
  const STOP = new Error("stub: connection not attempted")
  mongoose.connect = async (uri) => { calls.push(uri); throw STOP }
  try {
    process.env.APP_ENV = "development"
    await assert.rejects(connectDb(PROD), UnsafeDatabaseTargetError)
    delete process.env.APP_ENV
    await assert.rejects(connectDb(STAGE), UnsafeDatabaseTargetError)
    assert.deepEqual(calls, [], "mongoose.connect must not be called for refused targets")

    process.env.APP_ENV = "production"
    await assert.rejects(connectDb(PROD), (e) => e === STOP)
    assert.deepEqual(calls, [PROD], "APP_ENV=production keeps the normal production connection path")
    process.env.APP_ENV = "development"
    await assert.rejects(connectDb(LOCAL), (e) => e === STOP)
    assert.deepEqual(calls, [PROD, LOCAL], "local development database still connects")
  } finally {
    mongoose.connect = original
    if (savedEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedEnv
  }
})

// ── F-D4-1: canonical host comparison (trailing DNS dot and equivalent forms) ──
import { createRequire } from "module"
import { canonicalHost } from "../config/dbGuard.js"

const NON_PROD_ENVS = [{}, { APP_ENV: "development" }, { APP_ENV: "development", ALLOW_REMOTE_DB: "true" }, { APP_ENV: "test", ALLOW_REMOTE_DB: "true" }, { APP_ENV: "staging" }]
const PROD_VARIANTS = [
  "mongodb+srv://u:p@cluster0.ayk95r2.mongodb.net./websiteBuilder",                      // trailing dot
  "mongodb+srv://u:p@CLUSTER0.AYK95R2.MONGODB.NET./websiteBuilder",                      // upper case + dot
  "mongodb://u:p@cluster0-shard-00-00.ayk95r2.mongodb.net.:27017/websiteBuilder",        // dot + port
  "mongodb://u:p@backup.example.com:27017,cluster0-shard-00-01.ayk95r2.mongodb.net.:27017/db", // dotted 2nd seed
  "mongodb+srv://u:p@ayk95r2.mongodb.net/db",                                            // bare domain of the suffix
  "  mongodb+srv://u:p@cluster0.ayk95r2.mongodb.net/db  ",                               // surrounding whitespace
]

test("trailing-dot and other equivalent forms of the production host are refused outside production", () => {
  for (const uri of PROD_VARIANTS) {
    for (const env of NON_PROD_ENVS) assert.equal(ok(uri, env), false, `${uri} with ${JSON.stringify(env)}`)
    assert.equal(ok(uri, { APP_ENV: "production" }), true, `legitimate production use still works: ${uri}`)
  }
})

test("hosts are canonicalised: case, port, IPv6 brackets and one trailing dot", () => {
  assert.equal(canonicalHost("Cluster0.AYK95R2.mongodb.net."), "cluster0.ayk95r2.mongodb.net")
  assert.equal(canonicalHost("h.example.com.:27017"), "h.example.com")
  assert.equal(canonicalHost("[::1]:27017"), "::1")
  assert.equal(canonicalHost("localhost."), "localhost")
  assert.equal(canonicalHost("mongo_db:27017"), "mongo_db", "docker-style names are valid")
  assert.equal(canonicalHost("%2Ftmp%2Fmongodb-27017.sock"), "unix:/tmp/mongodb-27017.sock")
})

test("malformed hosts make the whole URI refused (fail closed), even with APP_ENV=production", () => {
  for (const uri of [
    "mongodb+srv://u:pa/ss@cluster0.ayk95r2.mongodb.net/db",   // unescaped "/" in password
    "mongodb+srv://u:pa?ss@cluster0.ayk95r2.mongodb.net/db",   // unescaped "?"
    "mongodb+srv://u:pa#ss@cluster0.ayk95r2.mongodb.net/db",   // unescaped "#"
    "mongodb+srv://u:p@ss@cluster0.ayk95r2.mongodb.net/db",    // unescaped "@"
    "mongodb+srv://cluster0.ayk95r2.mongodb.net../db",         // empty label
    "mongodb://h1.example.com,,h2.example.com/db",             // empty seed entry
    "mongodb://ho st.example.com/db",                          // space
    "mongodb://%41host.example.com/db",                        // percent-encoding that is not a socket path
    "mongodb://[zz::1]:27017/db",                              // invalid IPv6
  ]) {
    for (const env of [...NON_PROD_ENVS, { APP_ENV: "production" }]) assert.equal(ok(uri, env), false, `${uri} ${JSON.stringify(env)}`)
  }
})

test("local forms stay allowed for development and tests", () => {
  for (const uri of ["mongodb://localhost.:27017/x", "mongodb://127.0.0.2:27017/x", "mongodb://%2Ftmp%2Fmongodb-27017.sock/x", "mongodb://[::1]:27017,127.0.0.1:27018/x?replicaSet=rs0"]) {
    assert.equal(ok(uri, { APP_ENV: "development" }), true, uri)
    assert.equal(ok(uri, { APP_ENV: "test" }), true, uri)
  }
})

test("PRODUCTION_DB_HOSTS entries are canonicalised too (case, trailing dot)", () => {
  const env = { APP_ENV: "staging", PRODUCTION_DB_HOSTS: "PROD.Example.NET., .ProdProject.MongoDB.net." }
  assert.equal(ok("mongodb://prod.example.net./db", env), false)
  assert.equal(ok("mongodb://prod.example.net/db", env), false)
  assert.equal(ok("mongodb+srv://c0.prodproject.mongodb.net./db", env), false)
  assert.equal(ok("mongodb://other.example.net/db", env), true)
})

// Compatibility reference: the MongoDB driver's own connection-string parser
// (installed with the driver; pure parsing, no network).
const require = createRequire(import.meta.url)
const DriverConnectionString = require("mongodb-connection-string-url").default
const driverCanonical = (h) => h.toLowerCase().replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/:\d+$/, "").replace(/\.+$/, "")

test("parity with the MongoDB driver parser: the guard never allows a URI whose real hosts differ or include production", () => {
  const corpus = [
    ...PROD_VARIANTS.map(s => s.trim()),
    "mongodb+srv://u:p%2Fss@cluster0.ayk95r2.mongodb.net/db",
    "mongodb+srv://u:pa/ss@cluster0.ayk95r2.mongodb.net/db",
    "mongodb+srv://u:p@ss@cluster0.ayk95r2.mongodb.net/db",
    "mongodb+srv://cluster0.ayk95r2.mongodb.net../db",
    "mongodb+srv://u:p@staging.zz11aa.mongodb.net/genweb_staging",
    "mongodb+srv://u:p@staging.zz11aa.mongodb.net./genweb_staging",
    "mongodb://u:p@h1.example.com:27017,H2.Example.com.:27018/db?replicaSet=x",
    "mongodb://u:p@[::1]:27017,cluster0-shard-00-01.ayk95r2.mongodb.net.:27017/db",
    "mongodb://127.0.0.1:27017/x?replicaSet=rs0",
    "mongodb://%2Ftmp%2Fmongodb-27017.sock/x",
    "mongodb://localhost./x",
  ]
  for (const uri of corpus) {
    let driverHosts = null
    try { driverHosts = new DriverConnectionString(uri).hosts.map(driverCanonical) } catch { /* driver rejects */ }
    const guard = checkDatabaseTarget(uri, { APP_ENV: "staging" })
    if (guard.ok) {
      assert.ok(driverHosts, `guard allowed a URI the driver rejects: ${uri}`)
      const g = guard.hosts.map(h => h.startsWith("unix:") ? h.slice(5) : h)
      const d = driverHosts.map(h => decodeURIComponent(h))
      assert.deepEqual(g, d, `guard and driver disagree on hosts for ${uri}`)
    }
    if (driverHosts?.some(h => h === "ayk95r2.mongodb.net" || h.endsWith(".ayk95r2.mongodb.net"))) {
      assert.equal(guard.ok, false, `driver would reach a production host but the guard allowed it: ${uri}`)
    }
  }
})
