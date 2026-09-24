import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import Auth from "./Auth";
import AuthModal from "./AuthModal";
import { useAgent } from "../context/AgentContext";
import { useSidebarCollapsed, setSidebarCollapsed } from "../hooks/useSidebarCollapsed";

export const SIDEBAR_WIDTH_EXPANDED = 224;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

// Settings page (/settings) -- per-user API keys.
const SHOW_SETTINGS = true;

// Evaluation page flag -- flip to false to hide it from navigation
// (the route itself stays registered in App.jsx).
const SHOW_EVALUATION_PAGE = true;

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ─── Icons ──────────────────────────────────────────────────────────── */
function Svg({ children, size = 18, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      {children}
    </svg>
  );
}
const AgentsIcon = () => <Svg><rect x="3" y="4" width="18" height="14" rx="2.5" /><path d="M9 14 Q12 16.5 15 14" /><line x1="12" y1="4" x2="12" y2="1.5" /></Svg>;
const ModelsIcon = () => <Svg><rect x="3" y="4" width="7" height="7" rx="1.2" /><rect x="14" y="4" width="7" height="7" rx="1.2" /><rect x="3" y="15" width="7" height="7" rx="1.2" /><rect x="14" y="15" width="7" height="7" rx="1.2" /></Svg>;
const CallHistoryIcon = () => <Svg><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></Svg>;
const EvaluationIcon = () => <Svg><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></Svg>;
const CreateIcon = () => <Svg strokeWidth={2.2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>;
const SettingsIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);
const MenuIcon = () => <Svg size={20} strokeWidth={2}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></Svg>;
const CloseIcon = () => <Svg size={20} strokeWidth={2}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></Svg>;

/* ─── Information architecture ───────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Build",
    links: [
      { to: "/agents", label: "Agents", Icon: AgentsIcon },
      { to: "/models", label: "Models", Icon: ModelsIcon },
    ],
  },
  {
    label: "Monitor",
    links: [
      { to: "/call-history", label: "Call History", Icon: CallHistoryIcon },
      SHOW_EVALUATION_PAGE && { to: "/evaluation", label: "Evaluation", Icon: EvaluationIcon },
    ].filter(Boolean),
  },
];
const ACCOUNT_LINKS = [SHOW_SETTINGS && { to: "/settings", label: "Settings", Icon: SettingsIcon }].filter(Boolean);

/* ─── Pieces shared by the desktop rail and the mobile drawer ────────── */
function Brand({ showText = true, size = "w-10 h-10" }) {
  return (
    <>
      <img src="/vaanilogo.webp" alt={showText ? "" : "SamVaani"} className={cx(size, "rounded-xl flex-shrink-0 object-contain bg-white border border-slate-100 shadow-sm")} />
      {showText && (
        <span className="min-w-0 flex flex-col">
          <span className="text-slate-900 font-semibold text-[15px] leading-tight tracking-tight truncate">SamVaani</span>
          <span className="text-slate-500 font-medium text-[11.5px] leading-tight mt-0.5 truncate">Voice Agent Platform</span>
        </span>
      )}
    </>
  );
}

function GroupLabel({ children, collapsed }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-8 bg-slate-200" aria-hidden="true" />;
  return <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</p>;
}

function SideLink({ to, label, Icon, collapsed = false, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
          collapsed ? "justify-center w-11 h-10 mx-auto" : "px-3 py-2",
          isActive
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* active indicator bar */}
          {isActive && !collapsed && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-600" aria-hidden="true" />}
          <Icon />
          {!collapsed && <span className="truncate">{label}</span>}
          {collapsed && (
            <span
              className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 z-50"
              aria-hidden="true"
            >
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function CreateAgentButton({ collapsed = false, onNavigate }) {
  return (
    <NavLink
      to="/create"
      onClick={onNavigate}
      aria-label={collapsed ? "Create Agent" : undefined}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors",
          collapsed ? "w-11 h-11 mx-auto" : "w-full h-10",
          isActive ? "bg-blue-700" : "bg-blue-600 hover:bg-blue-700",
        )
      }
    >
      <CreateIcon />
      {!collapsed && "Create Agent"}
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 z-50" aria-hidden="true">
          Create Agent
        </span>
      )}
    </NavLink>
  );
}

function NavGroups({ collapsed = false, onNavigate }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5" role="group" aria-label={group.label}>
          <GroupLabel collapsed={collapsed}>{group.label}</GroupLabel>
          {group.links.map((link) => (
            <SideLink key={link.to} {...link} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Sidebar() {
  const { verifySession } = useAgent();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("login");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Shared with every other page via localStorage + a custom event (see the
  // hook) -- a page like the flow builder can force-collapse the sidebar.
  const collapsed = useSidebarCollapsed();

  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);

  const openLogin = useCallback(() => { setDrawerOpen(false); setModalTab("login"); setModalOpen(true); }, []);
  const openRegister = useCallback(() => { setDrawerOpen(false); setModalTab("register"); setModalOpen(true); }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const handleAuthSuccess = useCallback(async () => { await verifySession(); }, [verifySession]);
  const handleLogout = useCallback(() => {}, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);
  // Closing because a link was followed -- no focus restore needed.
  const closeDrawerOnNavigate = useCallback(() => setDrawerOpen(false), []);

  // Drawer open: move focus inside and lock page scroll (DOM side effects
  // only -- no state is set here).
  useEffect(() => {
    if (!drawerOpen) return undefined;
    closeButtonRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [drawerOpen]);

  function handleDrawerKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDrawer();
      return;
    }
    if (e.key !== "Tab" || !drawerRef.current) return;
    const items = Array.from(drawerRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <>
      {/* ── Mobile / tablet top bar (below lg) ── */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 h-14 px-4 bg-white/95 backdrop-blur border-b border-slate-200/70">
        <Link to="/agents" className="flex items-center gap-2.5 min-w-0 rounded-lg" aria-label="SamVaani — go to Agents">
          <Brand size="w-9 h-9" />
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        >
          <MenuIcon />
        </button>
      </header>

      {/* ── Mobile slide-over drawer ── */}
      <div
        className={cx("lg:hidden fixed inset-0 z-50 transition-[visibility] duration-300", drawerOpen ? "visible" : "invisible")}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cx("absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300", drawerOpen ? "opacity-100" : "opacity-0")}
          onClick={closeDrawer}
        />
        <div
          id="mobile-nav-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          onKeyDown={handleDrawerKeyDown}
          className={cx(
            "absolute left-0 top-0 h-full w-[288px] max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 h-16 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0"><Brand size="w-9 h-9" /></div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation menu"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
            <CreateAgentButton onNavigate={closeDrawerOnNavigate} />
            <NavGroups onNavigate={closeDrawerOnNavigate} />
            {ACCOUNT_LINKS.length > 0 && (
              <div className="flex flex-col gap-0.5" role="group" aria-label="Account">
                <GroupLabel>Account</GroupLabel>
                {ACCOUNT_LINKS.map((link) => <SideLink key={link.to} {...link} onNavigate={closeDrawerOnNavigate} />)}
              </div>
            )}
          </nav>

          <div className="px-3 py-4 border-t border-slate-100">
            <Auth variant="light" onLoginClick={openLogin} onRegisterClick={openRegister} onLogout={handleLogout} />
          </div>
        </div>
      </div>

      {/* ── Desktop rail (lg+) ── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-white border-r border-slate-200/70 z-40 transition-[width] duration-150"
        style={{ width }}
      >
        <Link
          to="/agents"
          aria-label={collapsed ? "SamVaani — go to Agents" : undefined}
          className={cx("flex items-center gap-3 h-[76px] border-b border-slate-100 flex-shrink-0", collapsed ? "justify-center px-0" : "px-5")}
        >
          <Brand showText={!collapsed} />
        </Link>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3.5 top-[22px] w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: collapsed ? "rotate(180deg)" : "none" }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <nav aria-label="Main" className="flex-1 min-h-0 px-3 pt-5 pb-4 flex flex-col gap-5">
          <CreateAgentButton collapsed={collapsed} />
          <NavGroups collapsed={collapsed} />
        </nav>

        {/* Account -- Settings plus sign-in / profile */}
        <div className="px-3 pt-3 pb-4 border-t border-slate-100 flex flex-col gap-2">
          {ACCOUNT_LINKS.length > 0 && (
            <div className="flex flex-col gap-0.5" role="group" aria-label="Account">
              {!collapsed && <GroupLabel>Account</GroupLabel>}
              {ACCOUNT_LINKS.map((link) => <SideLink key={link.to} {...link} collapsed={collapsed} />)}
            </div>
          )}
          <div className={collapsed ? "flex justify-center" : ""}>
            <Auth
              variant="light"
              compact={collapsed}
              onLoginClick={openLogin}
              onRegisterClick={openRegister}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </aside>

      <AuthModal
        isOpen={modalOpen}
        defaultTab={modalTab}
        onClose={closeModal}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
