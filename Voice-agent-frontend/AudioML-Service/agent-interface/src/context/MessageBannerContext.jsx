import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * MessageBanner — global drop-down notification bar (Tailwind version).
 *
 * Usage:
 *   1. Wrap your app once:
 *        <MessageBannerProvider>
 *          <App />
 *        </MessageBannerProvider>
 *
 *   2. From any component:
 *        const { showMessage } = useMessageBanner();
 *        showMessage("Login to your account", "info");
 *        showMessage("Agent successfully activated", "success");
 *        showMessage("Agent not activated", "error");
 *
 *   showMessage(text, type, durationMs) — type: 'info' | 'success' | 'error' | 'warning'
 *   durationMs defaults to 3200ms. Pass 0 to keep it up until manually closed.
 *
 * Messages queue: if one is already showing, the next call waits until the
 * current one finishes leaving before dropping in.
 */

const MessageBannerContext = createContext(null);

const TYPE_STYLES = {
  info: "text-blue-700",
  success: "text-emerald-700",
  error: "text-red-700",
  warning: "text-amber-700",
};

const ICONS = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="7.5" x2="12.01" y2="7.5" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

const DEFAULT_DURATION = 3200;
const LEAVE_ANIM_MS = 220;

// Tailwind's core utilities don't include a "slide down from above, then
// back up" keyframe out of the box, so this one small <style> block
// defines just the two keyframes and hooks them up as utility classes.
// Everything else in the component is plain Tailwind.
const ANIM_STYLE_TAG = (
  <style>{`
    @keyframes mb-drop-in {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);      opacity: 1; }
    }
    @keyframes mb-drop-out {
      from { transform: translateY(0);      opacity: 1; }
      to   { transform: translateY(-100%); opacity: 0; }
    }
    .mb-anim-in  { animation: mb-drop-in .28s cubic-bezier(.34,1.56,.64,1) forwards; }
    .mb-anim-out { animation: mb-drop-out .22s ease forwards; }
  `}</style>
);

export function MessageBannerProvider({ children }) {
  const [current, setCurrent] = useState(null); // { id, text, type, leaving }
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const processingRef = useRef(false);
  // processQueue recurses into itself from a timeout. Calling it directly would
  // reference the const before its declaration completes; going through a ref
  // (assigned in an effect below) keeps that legal and lint-clean.
  const processQueueRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setCurrent(null);
      return;
    }
    processingRef.current = true;
    setCurrent({ ...next, leaving: false });

    const finishAndAdvance = () => {
      setCurrent((prev) => (prev ? { ...prev, leaving: true } : prev));
      clearTimer();
      timerRef.current = setTimeout(() => {
        processingRef.current = false;
        processQueueRef.current?.();
      }, LEAVE_ANIM_MS);
    };

    if (next.duration > 0) {
      clearTimer();
      timerRef.current = setTimeout(finishAndAdvance, next.duration);
    }
    // duration === 0 means "stay until dismissed" — no auto-timer set
  }, []);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const showMessage = useCallback(
    (text, type = "info", duration = DEFAULT_DURATION) => {
      const id = `mb-${Date.now()}-${Math.random()}`;
      queueRef.current.push({ id, text, type, duration });
      if (!processingRef.current) processQueue();
    },
    [processQueue]
  );

  const dismiss = useCallback(() => {
    if (!current) return;
    clearTimer();
    setCurrent((prev) => (prev ? { ...prev, leaving: true } : prev));
    timerRef.current = setTimeout(() => {
      processingRef.current = false;
      processQueue();
    }, LEAVE_ANIM_MS);
  }, [current, processQueue]);

  return (
    <MessageBannerContext.Provider value={{ showMessage, dismiss }}>
      {children}
      {ANIM_STYLE_TAG}
      <div
        className="fixed top-0 left-0 right-0 z-[2000] flex flex-col items-center pointer-events-none px-2.5 sm:px-0"
        aria-live="polite"
        aria-atomic="true"
      >
        {current && (
          <div
            key={current.id}
            className={[
              "pointer-events-auto w-full max-w-[480px] mt-2 sm:mt-3",
              "flex items-center gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3",
              "rounded-xl bg-white border border-slate-200 shadow-lg shadow-black/10",
              "font-medium text-[12.5px] sm:text-[13.5px]",
              current.leaving ? "mb-anim-out" : "mb-anim-in",
            ].join(" ")}
            role={current.type === "error" ? "alert" : "status"}
          >
            <span className={`flex-shrink-0 w-5 h-5 ${TYPE_STYLES[current.type] || TYPE_STYLES.info}`}>
              {ICONS[current.type] || ICONS.info}
            </span>
            <span className={`flex-1 leading-snug break-words ${TYPE_STYLES[current.type] || TYPE_STYLES.info}`}>
              {current.text}
            </span>
            <button
              className="flex-shrink-0 flex items-center justify-center w-[22px] h-[22px] rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 active:scale-90 transition"
              aria-label="Dismiss"
              onClick={dismiss}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </MessageBannerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- public API imported app-wide from this module; splitting it out would change every import path (HMR just full-reloads this file instead)
export function useMessageBanner() {
  const ctx = useContext(MessageBannerContext);
  if (!ctx) {
    throw new Error("useMessageBanner must be used within a MessageBannerProvider");
  }
  return ctx;
}