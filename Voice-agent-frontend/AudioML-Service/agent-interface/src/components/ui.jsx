// Shared UI kit -- the one place page building blocks get their look, so
// every page's buttons, cards, stat tiles and empty/error states match.
// Tailwind only; brand blue is Tailwind blue-600 (#2563eb, same as
// vaani.iisc.ac.in). Pages compose these instead of hand-rolling their own.

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ─── Button ─────────────────────────────────────────────────────────── */
const BUTTON_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20",
  secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20",
};
const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
};

export function Button({ variant = "primary", size = "md", className, type = "button", children, ...props }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────── */
export function Card({ className, children, ...props }) {
  return (
    <div className={cx("bg-white rounded-2xl border border-slate-200/70 shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

/* ─── Section heading (title + optional description + right-side action) */
export function SectionHeading({ icon, title, description, action, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 mb-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h2>
          {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

/* ─── Stat tile ──────────────────────────────────────────────────────── */
// tone: "default" | "live" (emerald, for values changing during a call).
// value null/undefined renders "—"; pass `hint` to say why.
export function StatCard({ icon, label, value, hint, tone = "default", loading = false }) {
  const live = tone === "live";
  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3.5 flex items-center gap-3 transition-colors duration-300",
        live ? "bg-emerald-50/70 border-emerald-200" : "bg-white border-slate-200/70 shadow-sm",
      )}
    >
      {icon && (
        <div
          className={cx("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", live ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-600")}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        {loading ? (
          <div className="h-6 w-16 mt-1 rounded bg-slate-100 animate-pulse" />
        ) : (
          <p className="text-xl font-semibold text-slate-900 leading-tight truncate tabular-nums">{value ?? "—"}</p>
        )}
        {hint && <p className={cx("text-[11px] truncate", live ? "text-emerald-700" : "text-slate-400")}>{hint}</p>}
      </div>
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, description, action, compact = false, className }) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-300 bg-white/60",
        compact ? "px-6 py-8 gap-2" : "px-6 py-14 gap-3",
        className,
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {description && <p className="text-sm text-slate-500 max-w-md leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ─── Error state (inline banner with optional retry) ────────────────── */
export function ErrorState({ title = "Something went wrong", message, onRetry, className }) {
  return (
    <div role="alert" className={cx("flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3", className)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-700">{title}</p>
        {message && <p className="text-sm text-red-600 mt-0.5 break-words">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>Retry</Button>
      )}
    </div>
  );
}

/* ─── Skeleton block ─────────────────────────────────────────────────── */
export function Skeleton({ className }) {
  return <div className={cx("rounded-lg bg-slate-200/70 animate-pulse", className)} aria-hidden="true" />;
}

/* ─── Badge ──────────────────────────────────────────────────────────── */
const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};
// `dot`: small status dot before the label; `pulse` animates it (live).
export function Badge({ tone = "neutral", dot = false, pulse = false, className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap", BADGE_TONES[tone], className)}>
      {dot && (
        <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
          {pulse && <span className="absolute inline-flex w-full h-full rounded-full bg-current opacity-60 animate-ping" />}
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
