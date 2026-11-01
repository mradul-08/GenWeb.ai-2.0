// Firebase client configuration comes only from VITE_FIREBASE_* variables.
// Runs with Node's built-in test runner: npm test (no extra dependencies).
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import { readFirebaseConfig, assertPublicClientEnv, findSecretLookingVars, FirebaseConfigError, FIREBASE_ENV } from "../src/firebaseConfig.js"

const STAGING = {
  VITE_FIREBASE_API_KEY: "AIzaStagingPublicKey000000000000000000",
  VITE_FIREBASE_AUTH_DOMAIN: "genweb-staging.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "genweb-staging",
  VITE_FIREBASE_APP_ID: "1:111:web:abc",
}
const PROD = {
  VITE_FIREBASE_API_KEY: "AIzaProdPublicKey00000000000000000000",
  VITE_FIREBASE_AUTH_DOMAIN: "genwebai-dca16.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "genwebai-dca16",
  VITE_FIREBASE_APP_ID: "1:350304621044:web:x",
  VITE_FIREBASE_STORAGE_BUCKET: "genwebai-dca16.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "350304621044",
}

test("the same code yields different projects from different environments", () => {
  const s = readFirebaseConfig(STAGING), p = readFirebaseConfig(PROD)
  assert.equal(s.projectId, "genweb-staging")
  assert.equal(p.projectId, "genwebai-dca16")
  assert.equal(p.messagingSenderId, "350304621044")
  assert.equal(s.storageBucket, undefined, "optional values are omitted, not invented")
})

test("missing required values fail with the variable names, never silently", () => {
  for (const key of ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"]) {
    const env = { ...STAGING, [key]: "  " }
    assert.throws(() => readFirebaseConfig(env), (e) => e instanceof FirebaseConfigError && e.message.includes(key))
  }
  assert.throws(() => readFirebaseConfig({}), /VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID/)
})

test("malformed project id or auth domain is rejected", () => {
  assert.throws(() => readFirebaseConfig({ ...STAGING, VITE_FIREBASE_PROJECT_ID: "Bad Project!" }), /project id/)
  assert.throws(() => readFirebaseConfig({ ...STAGING, VITE_FIREBASE_AUTH_DOMAIN: "https://x.firebaseapp.com/" }), /host name/)
})

test("secret-looking VITE_ variables are refused (they would ship to browsers)", () => {
  const bad = {
    VITE_RAZORPAY_KEY_SECRET: "abc",
    VITE_JWT: "x",
    VITE_DB: "mongodb+srv://u:p@c.example.net/db",
    VITE_AI: "gsk_" + "a".repeat(40),
    VITE_SA: '{"private_key": "x"}',
    VITE_OK_URL: "https://api.example.com",
  }
  assert.deepEqual(findSecretLookingVars(bad).sort(), ["VITE_AI", "VITE_DB", "VITE_JWT", "VITE_RAZORPAY_KEY_SECRET", "VITE_SA"])
  assert.throws(() => assertPublicClientEnv({ ...PROD, VITE_RAZORPAY_KEY_SECRET: "abc" }), /VITE_RAZORPAY_KEY_SECRET/)
  assert.deepEqual(findSecretLookingVars({ ...PROD, VITE_API_URL: "https://x" }), [], "the public Firebase web key and URLs are allowed")
  assert.deepEqual(findSecretLookingVars({ GROQ_API_KEY_1: "gsk_" + "a".repeat(40) }), [], "non-VITE variables are never bundled and are ignored")
})

test("no Firebase project values remain hardcoded in the client source", () => {
  const src = fs.readFileSync(new URL("../src/firebase.js", import.meta.url), "utf8")
  for (const literal of ["genwebai-dca16", "350304621044", "firebaseapp.com", "AIza"]) assert.ok(!src.includes(literal), literal)
  assert.ok(!/readFirebaseConfig\(\s*import\.meta\.env\s*\)/.test(src), "the whole env object must never be passed")
  for (const name of Object.values(FIREBASE_ENV)) assert.ok(src.includes(`import.meta.env.${name}`), `${name} read by static access`)
})

test("Vercel's own VITE_VERCEL_* system variables are not configuration errors (they are never bundled)", () => {
  const env = { ...PROD, VITE_VERCEL_AUTOMATION_BYPASS_SECRET: "x", VITE_VERCEL_OIDC_TOKEN: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig", VITE_VERCEL_ENV: "preview" }
  assert.deepEqual(findSecretLookingVars(env), [])
  assert.doesNotThrow(() => assertPublicClientEnv(env))
  assert.deepEqual(findSecretLookingVars({ ...env, VITE_MY_TOKEN: "x" }), ["VITE_MY_TOKEN"], "user-defined secret-like names are still refused")
})
