// Refuses to connect to a database that does not belong to the current
// environment, so local development, tests and scripts cannot reach the
// production database by accident (e.g. a production URI left in .env).
//
// APP_ENV says where this process runs: production | staging | development | test.
//
//   target \ APP_ENV        production   staging   development / test   (unset)
//   production DB host      allowed      REFUSED   REFUSED              REFUSED
//   local host              allowed      allowed   allowed              allowed
//   other remote host       allowed      allowed   only with            REFUSED
//                                                  ALLOW_REMOTE_DB=true (ambiguous)
//
// Production DB hosts: PRODUCTION_DB_HOSTS (comma-separated; an entry starting
// with "." matches that suffix). Without it, the built-in list below is used.
// Hosts and entries are compared in canonical form (lower case, no port, no
// trailing DNS dot); a URI with any malformed host is refused (fail closed).
// Authorised production processes (the Render production service, or a script
// deliberately run against production) must set APP_ENV=production.

export const APP_ENVS = ["production", "staging", "development", "test"]

// Hostname suffix of the current production Atlas project (not a secret).
export const DEFAULT_PRODUCTION_DB_HOSTS = [".ayk95r2.mongodb.net"]

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

export class UnsafeDatabaseTargetError extends Error {
  constructor(message) { super(message); this.name = "UnsafeDatabaseTargetError" }
}

// DNS host name (letters, digits, "-", "_"; dot-separated labels; no empty labels).
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/
const IPV6 = /^[0-9a-f:.]*:[0-9a-f:.]*(?:%[0-9a-z]+)?$/

// One seed-list entry → canonical host, or null when it is not a clean host
// (callers then refuse the URI: fail closed rather than guess).
//   - lower case; port removed; IPv6 brackets removed
//   - ONE trailing dot removed: "host.example.net." is the same DNS name as
//     "host.example.net" (absolute form) and the MongoDB driver accepts it
//   - percent-encoded Unix socket paths (mongodb://%2Ftmp%2Fm.sock) → "unix:<path>"
//   - anything else (credentials that leaked into the host part because of
//     unescaped characters, "@", "%", spaces, empty labels "..") → null
export function canonicalHost(raw) {
  let h = String(raw ?? "").trim().toLowerCase()
  if (!h) return null
  const v6 = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(h)
  if (v6) return IPV6.test(v6[1]) ? v6[1] : null
  if (h.includes("%")) {
    let path
    try { path = decodeURIComponent(h) } catch { return null }
    return path.startsWith("/") && path.endsWith(".sock") ? `unix:${path}` : null
  }
  const port = /:\d{1,5}$/.exec(h)
  if (port) h = h.slice(0, port.index)
  if (h.endsWith(".")) h = h.slice(0, -1)
  return HOSTNAME.test(h) ? h : null
}

// Canonical hostnames from a mongodb:// or mongodb+srv:// URI, or null when the
// URI or any host in it is malformed. Credentials are never returned.
export function databaseHosts(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/?#]*@)?([^/?#]+)/i.exec(String(uri || "").trim())
  if (!m) return null
  const hosts = m[1].split(",").map(canonicalHost)
  return hosts.length && hosts.every(Boolean) ? hosts : null
}

const isLocal = (h) => LOCAL_HOSTS.has(h) || /^127(\.\d{1,3}){3}$/.test(h) || h.endsWith(".localhost") || h.startsWith("unix:")

// Entries are canonicalised the same way as hosts (case, trailing dot); a
// leading "." marks a suffix entry.
function productionHosts(env) {
  const list = (env.PRODUCTION_DB_HOSTS ?? "").split(",")
    .map(s => s.trim().toLowerCase().replace(/\.$/, "")).filter(s => s && s !== ".")
  return list.length ? list : DEFAULT_PRODUCTION_DB_HOSTS
}
// ".suffix" matches any host under it (and the bare domain itself); other entries match exactly.
const matches = (host, entry) => entry.startsWith(".") ? host.endsWith(entry) || host === entry.slice(1) : host === entry

// Returns { ok, reason, appEnv, hosts }. Never connects anywhere.
export function checkDatabaseTarget(uri, env = process.env) {
  const appEnv = (env.APP_ENV ?? "").trim().toLowerCase() || null
  const hosts = databaseHosts(uri)
  const result = (ok, reason) => ({ ok, reason, appEnv, hosts: hosts ?? [] })

  if (!hosts || !hosts.length) return result(false, "MongoDB URI is missing, not a mongodb:// / mongodb+srv:// URI, or has a malformed host")
  if (appEnv && !APP_ENVS.includes(appEnv)) return result(false, `APP_ENV="${env.APP_ENV}" is not one of ${APP_ENVS.join(", ")}`)
  if (appEnv === "production") return result(true, "APP_ENV=production")

  const prod = productionHosts(env)
  const prodHost = hosts.find(h => prod.some(e => matches(h, e)))
  if (prodHost) return result(false, `${prodHost} is a production database host; only APP_ENV=production may connect to it`)
  if (hosts.every(isLocal)) return result(true, "local database")
  if (appEnv === "staging") return result(true, "APP_ENV=staging, non-production host")
  if (!appEnv) return result(false, "APP_ENV is not set and the database is remote; set APP_ENV (production | staging | development | test)")
  if (env.ALLOW_REMOTE_DB === "true") return result(true, `APP_ENV=${appEnv} with ALLOW_REMOTE_DB=true, non-production host`)
  return result(false, `APP_ENV=${appEnv} may only use a local database (set ALLOW_REMOTE_DB=true for a non-production remote one)`)
}

export function assertSafeDatabaseTarget(uri, env = process.env) {
  const r = checkDatabaseTarget(uri, env)
  if (!r.ok) throw new UnsafeDatabaseTargetError(`Refusing to connect to MongoDB: ${r.reason}`)
  return r
}
