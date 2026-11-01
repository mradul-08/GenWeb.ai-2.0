// Fixed-window rate limiter with an in-process store.
// Correct for a single API instance (current Render setup). When the API runs
// on several instances, replace the Map with a shared store (e.g. Redis INCR +
// EXPIRE) so limits apply across instances.

const buckets = new Map()   // key → { count, resetAt }

// Drop expired windows so the map cannot grow without bound.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key)
}, 60 * 1000)
sweeper.unref()

// Authenticated requests are limited per user, others per client IP.
const defaultKey = (req) => (req.user?._id ? `u:${req.user._id}` : `ip:${req.ip}`)

export function rateLimit({ name, windowMs, max, keyFn = defaultKey }) {
  return (req, res, next) => {
    const key = `${name}:${keyFn(req)}`
    const now = Date.now()
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count++
    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000)
      res.setHeader("Retry-After", String(retryAfter))
      return res.status(429).json({ success: false, message: `Too many requests. Try again in ${retryAfter}s.` })
    }
    next()
  }
}

// Test helper.
export function resetRateLimits() {
  buckets.clear()
}
