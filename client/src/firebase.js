import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { readFirebaseConfig } from "./firebaseConfig.js";

// Project-specific values come from VITE_FIREBASE_* (see client/.env.example),
// so local, staging and production builds can target different Firebase projects.
// Each variable is read by static property access: Vite then inlines only these
// six values. Never pass the whole import.meta.env object — that would inline
// every VITE_ variable of the build environment into the public bundle.
const firebaseConfig = readFirebaseConfig({
  VITE_FIREBASE_API_KEY:             import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID:              import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_STORAGE_BUCKET:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
});

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
