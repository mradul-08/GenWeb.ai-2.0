// Verifies Firebase ID tokens without firebase-admin, using Google's public signing certs.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
import jwt from "jsonwebtoken"

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

let certCache = { certs: null, expiresAt: 0 }

// Tests install their own { kid: publicKeyPem } map instead of Google's certs.
export function setCertsForTests(certs) {
  certCache = { certs, expiresAt: Infinity }
}

async function getCerts() {
  if (certCache.certs && Date.now() < certCache.expiresAt) return certCache.certs
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`Failed to fetch Firebase certs: HTTP ${res.status}`)
  const maxAge = Number(res.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 3600)
  certCache = { certs: await res.json(), expiresAt: Date.now() + maxAge * 1000 }
  return certCache.certs
}

export async function verifyFirebaseIdToken(idToken) {
  const projectId = process.env.FIREBASE_PROJECT_ID || "genwebai-dca16"

  const decoded = jwt.decode(idToken, { complete: true })
  const kid = decoded?.header?.kid
  if (!kid || decoded.header.alg !== "RS256") throw new Error("Invalid token header")

  const certs = await getCerts()
  const cert  = certs[kid]
  if (!cert) throw new Error("Unknown signing key")

  const claims = jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience:   projectId,
    issuer:     `https://securetoken.google.com/${projectId}`,
  })
  if (!claims.sub) throw new Error("Token missing subject")
  return claims
}
