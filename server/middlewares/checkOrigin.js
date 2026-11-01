import { allowedOrigins } from "../config/origins.js"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

// CSRF guard. The session cookie is SameSite=None, so browsers attach it to
// cross-site requests; reject state-changing requests from unknown origins.
// Requests without an Origin header come from non-browser clients, which
// cannot carry a victim's cookie.
const checkOrigin = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next()
  const origin = req.get("origin")
  if (!origin || allowedOrigins.includes(origin)) return next()
  return res.status(403).json({ success: false, message: "Origin not allowed" })
}

export default checkOrigin
