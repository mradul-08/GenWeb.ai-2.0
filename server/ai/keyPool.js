// Credentials for one provider, with quota-aware cooldowns.
//
// Every provider's credentials share ONE free quota: several keys or accounts
// never multiply a free-tier allocation.
//   - Requests always use the first usable credential (no round-robin), so
//     only one account's allowance is consumed.
//   - A rate-limit, billing, restriction or daily-quota response from ANY
//     credential pauses the whole pool until the reported reset.
//   - Another credential is used only when the current one is invalid (401/403,
//     dropped for good) or rested after repeated transient errors — never to
//     get around a limit.
// State is per process.

const FAILURE_THRESHOLD   = 3
const FAILURE_COOLDOWN_MS = 3 * 60 * 1000

export class KeyPool {
  constructor(name, credentials) {
    this.name  = name
    this.pool  = { until: 0, reason: null }
    this.items = credentials.map(c => ({ ...c, dead: false, until: 0, reason: null, failures: 0, requests: 0 }))
    // Health evidence from real calls only — never assumed.
    this.lastSuccessAt = null
    this.lastError = null   // { kind, at }
    if (this.items.length > 1) {
      console.warn(`[${name}] ${this.items.length} credentials configured: they share one free quota and only the first usable one is called`)
    }
  }

  noteSuccess() { this.lastSuccessAt = Date.now() }
  noteError(kind) { this.lastError = { kind, at: Date.now() } }

  _usable(k, now) { return !k.dead && k.until <= now }

  next() {
    const now = Date.now()
    if (this.pool.until > now) return null
    const k = this.items.find(c => this._usable(c, now))
    if (!k) return null
    k.requests++
    return k
  }

  available() {
    const now = Date.now()
    if (this.pool.until > now) return 0
    return this.items.filter(k => this._usable(k, now)).length
  }

  isEmpty() { return this.available() === 0 }

  // Pause after a quota-type response: always the whole pool (shared quota).
  coolDown(k, ms, reason) {
    const until = Date.now() + ms
    if (until > this.pool.until) this.pool = { until, reason }
    console.warn(`[${this.name}] ${reason}: paused ${Math.round(ms / 1000)}s (all credentials)`)
  }

  markDead(k) {
    k.dead = true
    console.error(`[${this.name}] credential …${k.key.slice(-4)} rejected as invalid`)
  }

  // Transient errors: after repeated failures, rest only that credential briefly.
  recordFailure(k) {
    k.failures++
    if (k.failures >= FAILURE_THRESHOLD) { k.until = Date.now() + FAILURE_COOLDOWN_MS; k.reason = "repeated_errors"; k.failures = 0 }
  }

  recordSuccess(k) { k.failures = 0 }

  status() {
    const now = Date.now()
    const waits = [this.pool.until, ...this.items.filter(k => !k.dead).map(k => k.until)].filter(t => t > now)
    return {
      provider:     this.name,
      quotaScope:   "provider",
      total:        this.items.length,
      available:    this.available(),
      dead:         this.items.filter(k => k.dead).length,
      pausedReason: this.pool.until > now ? this.pool.reason : (this.items.find(k => k.until > now)?.reason ?? null),
      nextResetMs:  waits.length ? Math.min(...waits) - now : null,
      lastSuccessAt: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      lastError:     this.lastError ? { kind: this.lastError.kind, at: new Date(this.lastError.at).toISOString() } : null,
      warning:      this.items.length > 1 ? "multiple_credentials_share_one_quota" : null,
    }
  }
}
