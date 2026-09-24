// Firebase Auth (Google Sign-In). None of this config is secret -- it's
// the standard Firebase web config object, safe to ship in the client
// bundle -- but it's read from env vars instead of hardcoded so it's not
// baked in per-environment like src/url.js's baseURL is.
//
// App Check (reCAPTCHA v3) runs only when VITE_RECAPTCHA_SITE_KEY is set
// (register the site key for the app's domain in the Firebase console:
// Build > App Check). AuthModal.jsx attaches its token as
// X-Firebase-AppCheck on login; the backend checks it when
// APP_CHECK_ENFORCE is on (src/database/auth.py's verify_app_check).
//
// Imported once from main.jsx, before anything else mounts, so auth is
// ready the moment a component needs it.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
export const appCheck = recaptchaSiteKey
  ? initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;
