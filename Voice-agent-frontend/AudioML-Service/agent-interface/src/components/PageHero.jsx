import Navbar from "./Navbar";

// Single source of truth for the blue banner at the top of every main page
// (Agents, Agent Details, Create Agent, Models, ...). Styled after the
// vaani.iisc.ac.in blue band: brand blue (#2563eb -> #1d4ed8) with soft sky
// and violet radial glows -- calm, no looping animation.
//
// This component owns only the background chrome (gradient, glows, Navbar,
// breadcrumb, sizing/padding). Each page supplies its own title/icon/
// badges/buttons as children.

const HERO_CSS = `
  @keyframes page-hero-rise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .page-hero-rise { animation: page-hero-rise .4s cubic-bezier(.34,1.1,.64,1) both; }
`;

if (typeof document !== "undefined" && !document.getElementById("page-hero-styles-v2")) {
  const s = document.createElement("style");
  s.id = "page-hero-styles-v2";
  s.textContent = HERO_CSS;
  document.head.appendChild(s);
}

const BLUE_BAND =
  "radial-gradient(ellipse 45% 90% at 0% 0%, rgba(56,189,248,.38) 0%, transparent 65%)," +
  "radial-gradient(ellipse 40% 90% at 100% 100%, rgba(139,92,246,.38) 0%, transparent 65%)," +
  "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
const OFFLINE_BAND =
  "radial-gradient(ellipse 45% 90% at 0% 0%, rgba(148,163,184,.25) 0%, transparent 65%)," +
  "linear-gradient(135deg, #475569 0%, #334155 100%)";

// `crumbs`: array of breadcrumb labels, e.g. ["Agents", "Agent Details"]
// (last one is the current page).
// `showAuth`: forwarded to Navbar -- false on every page with a Sidebar
// (Auth lives there instead), true on pages without one.
// `containerClassName`: overrides the inner content wrapper's width --
// defaults to full-width (Sidebar pages); a centered single-column page can
// pass "max-w-4xl mx-auto".
// `active`: undefined (default) = brand blue, for pages with no
// online/offline concept. true/false = the band reflects the page subject's
// state -- slate when false, blue when true (cross-fades between the two).
// `compact`: less vertical padding, for pages whose hero already carries a
// lot of content (AgentDetails).
export default function PageHero({ crumbs = [], showAuth = false, containerClassName = "w-full", active, compact = false, children }) {
  const isOffline = active === false;
  return (
    <div className="page-hero relative isolate overflow-hidden text-white" data-offline={isOffline || undefined}>
      {/* Two stacked backgrounds so online <-> offline cross-fades smoothly
          (gradients themselves can't transition). */}
      <div className="absolute inset-0 -z-10" style={{ background: OFFLINE_BAND }} aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 transition-opacity duration-700"
        style={{ background: BLUE_BAND, opacity: isOffline ? 0 : 1 }}
        aria-hidden="true"
      />
      {/* faint soft wave lines, bottom-right -- static, decorative */}
      <svg
        className="absolute right-0 bottom-0 w-[520px] max-w-full h-28 -z-10 opacity-[0.12] pointer-events-none"
        viewBox="0 0 520 112"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 80 C 90 40, 170 110, 260 70 S 430 30, 520 60" stroke="white" strokeWidth="1.5" />
        <path d="M0 96 C 90 60, 170 120, 260 88 S 430 50, 520 80" stroke="white" strokeWidth="1.5" />
      </svg>

      <Navbar showAuth={showAuth} />

      <div className={`relative px-4 sm:px-6 ${compact ? "py-4 sm:py-5" : "py-7 sm:py-9"} page-hero-rise ${containerClassName}`}>
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className={compact ? "mb-3" : "mb-5"}>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
              <li className="flex items-center" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                </svg>
              </li>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <li key={`${i}-${crumb}`} className="flex items-center gap-2 min-w-0">
                    {i > 0 && <span className="text-white/60" aria-hidden="true">/</span>}
                    <span
                      className={isLast ? "text-white font-semibold truncate" : "truncate"}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {children}
      </div>
    </div>
  );
}
