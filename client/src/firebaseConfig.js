// Public Firebase web-app configuration, read from VITE_FIREBASE_* variables so
// local, staging and production can use different Firebase projects without
// code changes. These values are public by design (they ship in the browser
// bundle); server secrets must never be given a VITE_ name. vite.config.js runs
// the same checks at build/dev start so a misconfigured build fails early.

export const FIREBASE_ENV = {
  apiKey:            "VITE_FIREBASE_API_KEY",
  authDomain:        "VITE_FIREBASE_AUTH_DOMAIN",
  projectId:         "VITE_FIREBASE_PROJECT_ID",
  appId:             "VITE_FIREBASE_APP_ID",
  storageBucket:     "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
}
const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"]

export class FirebaseConfigError extends Error {
  constructor(message) { super(message); this.name = "FirebaseConfigError" }
}

const value = (env, name) => (typeof env[name] === "string" ? env[name].trim() : "")

export function readFirebaseConfig(env) {
  const missing = REQUIRED.filter(k => !value(env, FIREBASE_ENV[k])).map(k => FIREBASE_ENV[k])
  if (missing.length) throw new FirebaseConfigError(`Missing Firebase configuration: ${missing.join(", ")}. See client/.env.example.`)
  const config = {}
  for (const [key, name] of Object.entries(FIREBASE_ENV)) if (value(env, name)) config[key] = value(env, name)
  if (!/^[a-z0-9-]{4,40}$/.test(config.projectId)) throw new FirebaseConfigError(`${FIREBASE_ENV.projectId} is not a valid Firebase project id`)
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.authDomain)) throw new FirebaseConfigError(`${FIREBASE_ENV.authDomain} must be a host name such as <project>.firebaseapp.com`)
  return config
}

// VITE_* variables are bundled into public JavaScript. Names or values that look
// like server secrets are refused so they can never be shipped by mistake.
const SECRET_NAME  = /SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|CREDENTIAL|SERVICE_ACCOUNT|MONGO|DATABASE_URL|JWT|WEBHOOK/i
const SECRET_VALUE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /mongodb(\+srv)?:\/\/[^/\s]*:[^/\s]*@/i,
  /^gsk_[A-Za-z0-9]{20,}/,                 // Groq
  /^csk-[a-z0-9]{20,}/,                    // Cerebras
  /^sk-(or-|proj-|ant-)?[A-Za-z0-9_-]{20,}/, // OpenRouter / OpenAI-style / Anthropic
  /^cfut_[A-Za-z0-9]{20,}/,                // Cloudflare API token
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT-shaped token
]

// Vercel exposes its own system variables to Vite builds as VITE_VERCEL_* (some
// are secrets, e.g. VITE_VERCEL_AUTOMATION_BYPASS_SECRET, VITE_VERCEL_OIDC_TOKEN).
// They are present in the build environment but never bundled, because client
// code reads only named variables and never references VITE_VERCEL_* (enforced
// by tests/bundle.test.js), so they are not treated as a configuration error.
export const PLATFORM_SYSTEM_PREFIX = "VITE_VERCEL_"

export function findSecretLookingVars(env) {
  return Object.keys(env)
    .filter(name => name.startsWith("VITE_") && !name.startsWith(PLATFORM_SYSTEM_PREFIX))
    .filter(name => SECRET_NAME.test(name) || SECRET_VALUE.some(re => re.test(String(env[name] ?? "").trim())))
}

export function assertPublicClientEnv(env) {
  const bad = findSecretLookingVars(env)
  if (bad.length) throw new FirebaseConfigError(`These VITE_ variables look like secrets and would be published in the browser bundle: ${bad.join(", ")}`)
  return readFirebaseConfig(env)
}
