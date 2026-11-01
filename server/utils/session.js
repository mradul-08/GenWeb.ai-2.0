import jwt from "jsonwebtoken"
import User from "../models/user.model.js"

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   true,
  sameSite: "none",
}

const SESSION_DAYS = 7

export function issueSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user._id, v: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_DAYS}d` }
  )
  res.cookie("token", token, { ...COOKIE_OPTIONS, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 })
}

// Resolves a session token to its user, or null when the token is missing,
// invalid, expired, or revoked by a tokenVersion bump (logout-all).
// Tokens issued before versioning carry no `v` and count as version 0.
export async function userFromSessionToken(token) {
  if (!token) return null
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
  const user = await User.findById(decoded.id)
  if (!user) return null
  if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) return null
  return user
}
