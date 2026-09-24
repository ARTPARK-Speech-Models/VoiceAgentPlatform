import { useState, useEffect, useRef, useCallback } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { MODAL_STYLES } from "../styles/authModalStyles"
import { baseURL } from "../url";
import { getToken } from "firebase/app-check";
import { appCheck, auth } from "../firebase";
import { Button } from "./ui";

const googleProvider = new GoogleAuthProvider();

// Firebase's auth/<code> error codes reachable from a Google popup sign-in.
const FIREBASE_ERROR_MESSAGES = {
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Please allow popups and try again.",
  "auth/account-exists-with-different-credential": "An account already exists with this email using a different sign-in method.",
  "auth/network-request-failed": "Network error. Please try again.",
};

function firebaseErrorMessage(err) {
  return FIREBASE_ERROR_MESSAGES[err?.code] || "Something went wrong. Please try again.";
}

// Injected once at module load (not during render/effects).
if (typeof document !== "undefined" && !document.getElementById("auth-modal-styles-v2")) {
  const el = document.createElement("style");
  el.id = "auth-modal-styles-v2";
  el.textContent = MODAL_STYLES;
  document.head.appendChild(el);
}

function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }} aria-label="Signing in" role="status">
      <span className="am-dot" />
      <span className="am-dot" />
      <span className="am-dot" />
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * AuthModal — sign-in modal, backed by Firebase Auth's Google provider.
 *
 * Props:
 *   isOpen           boolean    — controls visibility
 *   onClose          () => void
 *   onSuccess        () => void — called once the backend session is set
 *   sessionEndpoint  string     (default "api/auth/session")
 *
 * Flow: Google popup sign-in via the Firebase client SDK gets an ID
 * token, which is exchanged with our own backend for an httpOnly session
 * cookie (credentials: "include") -- see exchangeForSession below. One
 * call handles both a brand-new account and a returning user; the
 * backend finds-or-creates the local user row. Nothing is stored in
 * localStorage -- the cookie is the only session state.
 */
export default function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  sessionEndpoint = "api/auth/session",
}) {
  const [closing, setClosing] = useState(false);
  const [shake,   setShake]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  // Reset transient state each time the modal opens -- done during render
  // from the previous `isOpen` (React's "adjust state on prop change"
  // pattern) instead of setState inside an effect.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) { setError(""); setSuccess(false); setLoading(false); }
  }

  const cardRef = useRef(null);
  const primaryRef = useRef(null);
  const returnFocusRef = useRef(null);

  const triggerClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose?.();
      // hand focus back to whatever opened the modal
      returnFocusRef.current?.focus?.();
    }, 200);
  }, [onClose]);

  // Keyboard close (subscription -- setState only happens in the handler)
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && isOpen) triggerClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, triggerClose]);

  // Focus management: remember the opener, move focus into the dialog.
  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement;
    primaryRef.current?.focus();
  }, [isOpen]);

  function trapTab(e) {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  /** Exchanges a fresh Firebase ID token for our backend's session cookie,
   * with an App Check (reCAPTCHA v3) token when App Check is configured
   * (see firebase.js). */
  async function exchangeForSession(idToken) {
    const headers = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    };
    if (appCheck) {
      const { token } = await getToken(appCheck);
      headers["X-Firebase-AppCheck"] = token;
    }
    const res = await fetch(baseURL + sessionEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ id_token: idToken }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || data?.message || data?.error || `Error ${res.status}`);
    }
    return data;
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      await exchangeForSession(idToken);

      setSuccess(true);
      setLoading(false);
      onSuccess?.();

      // Auto-close after short success pause
      setTimeout(() => triggerClose(), 1400);

    } catch (err) {
      setError(err?.code ? firebaseErrorMessage(err) : err.message || "Something went wrong. Please try again.");
      triggerShake();
      setLoading(false);
    }
  }

  if (!isOpen && !closing) return null;

  return (
    <div
      className={`am-backdrop${closing ? " closing" : ""}`}
      onMouseDown={(e) => { if (!cardRef.current?.contains(e.target)) triggerClose(); }}
    >
      <div className="am-blur-layer" aria-hidden="true" />

      <div
        ref={cardRef}
        className={`am-card${closing ? " closing" : ""}${shake ? " shake" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="am-title"
        aria-describedby="am-subtitle"
        onKeyDown={trapTab}
      >
        {/* ── Header: vaani blue band ── */}
        <div className="am-header">
          <div className="am-header-glow" aria-hidden="true" />
          <button type="button" className="am-close" onClick={triggerClose} aria-label="Close sign-in dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          <div className="am-logo">
            <img src="/vaanilogo.webp" alt="" />
          </div>
          <p id="am-title" className="am-title">{success ? "You're in!" : "Welcome to SamVaani"}</p>
          <p id="am-subtitle" className="am-subtitle">
            {success ? "Redirecting you now…" : "Sign in to your voice agent workspace"}
          </p>
        </div>

        {/* ── Body ── */}
        <div className="am-body">
          {success ? (
            <SuccessView />
          ) : (
            <>
              {error && (
                <div className="am-error" role="alert">
                  <span className="am-error-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </span>
                  {error}
                </div>
              )}

              <Button
                ref={primaryRef}
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? <LoadingDots /> : (<><GoogleIcon /> Continue with Google</>)}
              </Button>

              <p className="am-footer-note">
                New here? Signing in with Google creates your account automatically.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessView() {
  return (
    <div className="am-success" role="status">
      <div className="am-success-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p className="am-success-title">Signed in!</p>
      <p className="am-success-sub">You're in your workspace.</p>
    </div>
  );
}
