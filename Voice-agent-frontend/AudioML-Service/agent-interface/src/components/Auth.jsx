import { useState, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AUTH_STYLES } from "../styles/authStyles";
import { useAgent } from "../context/AgentContext"; // adjust path as needed
import { auth } from "../firebase";
import { baseURL } from "../url";
import { Button } from "./ui";

// Square-headed bot SVG profile icon
function BotIcon({ size = 22, color = "rgba(255,255,255,0.9)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="13" rx="2.5" stroke={color} strokeWidth="1.6" fill="none" />
      <rect x="8" y="9" width="2.4" height="2.4" rx="0.6" fill={color} />
      <rect x="13.6" y="9" width="2.4" height="2.4" rx="0.6" fill={color} />
      <path d="M9 13.5 Q12 15.5 15 13.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <line x1="12" y1="5" x2="12" y2="2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="2" r="1" fill={color} />
    </svg>
  );
}

// Injected once at module load (not during render/effects).
if (typeof document !== "undefined" && !document.getElementById("auth-styles-v2")) {
  const el = document.createElement("style");
  el.id = "auth-styles-v2";
  el.textContent = AUTH_STYLES;
  document.head.appendChild(el);
}

// variant="dark" (default) sits on the blue PageHero band (Navbar's usage).
// variant="light" is for a plain white background (Sidebar / mobile drawer).
// `compact`: collapsed sidebar rail -- avatar circle only, no text.
export default function Auth({ onLoginClick, onRegisterClick, onLogout, variant = "dark", compact = false }) {
  const isLight = variant === "light";
  const navigate = useNavigate();

  const { isVerified, username, verifySession } = useAgent();
  const [showMenu, setShowMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuId = useId();

  // Close the profile menu on outside click or Escape (subscriptions only).
  useEffect(() => {
    if (!showMenu) return;
    const onMouseDown = (e) => {
      if (!e.target.closest(".auth-profile-wrap")) setShowMenu(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setShowMenu(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showMenu]);

  const handleLogout = async () => {
    setShowMenu(false);
    setLoggingOut(true);
    try {
      // Clears the httpOnly session cookie server-side (JS can't touch it
      // directly) and the Firebase SDK's own client-side token cache --
      // both are needed, neither alone leaves the user fully logged out.
      await fetch(`${baseURL}api/auth/logout`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        method: "POST",
        credentials: "include",
      });
      await signOut(auth);
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setLoggingOut(false);
      await verifySession();
      onLogout?.();
    }
  };

  if (isVerified === null) {
    return <div className="auth-bar" />;
  }

  const toggleMenu = () => setShowMenu((v) => !v);
  const menuButtonProps = {
    type: "button",
    "aria-label": `Account menu${username ? ` for ${username}` : ""}`,
    "aria-haspopup": "menu",
    "aria-expanded": showMenu,
    "aria-controls": showMenu ? menuId : undefined,
    onClick: toggleMenu,
  };

  return (
    <div className="auth-bar">
      {!isVerified ? (
        compact ? (
          <button type="button" className="auth-profile-btn-light" aria-label="Log in" title="Log in" onClick={onLoginClick}>
            <BotIcon size={18} color="#475569" />
          </button>
        ) : isLight ? (
          <div className="flex w-full gap-2">
            <Button variant="secondary" size="sm" className="flex-1 h-9" onClick={onRegisterClick}>Register</Button>
            <Button variant="primary" size="sm" className="flex-1 h-9" onClick={onLoginClick}>Login</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* translucent-on-blue register; hidden on phones (Login's modal creates accounts too) */}
            <button
              type="button"
              onClick={onRegisterClick}
              className="hidden sm:inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-semibold text-white border border-white/35 bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap"
            >
              Register
            </button>
            <button
              type="button"
              onClick={onLoginClick}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-semibold text-blue-700 bg-white hover:bg-blue-50 shadow-sm shadow-blue-950/20 transition-colors whitespace-nowrap"
            >
              Login
            </button>
          </div>
        )
      ) : (
        <div className="auth-profile-wrap" style={isLight && !compact ? { width: "100%", position: "relative" } : undefined}>
          {isLight && !compact ? (
            <button className="auth-profile-full" {...menuButtonProps}>
              <span className="auth-profile-full-avatar">
                <BotIcon size={18} color="#2563eb" />
              </span>
              <span className="auth-profile-full-name">{username || "Account"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showMenu ? "none" : "rotate(180deg)", flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : isLight ? (
            <button className="auth-profile-btn-light" title={username || "Account"} {...menuButtonProps}>
              <BotIcon size={18} color="#2563eb" />
            </button>
          ) : (
            <button className="auth-profile-btn" {...menuButtonProps}>
              <BotIcon />
            </button>
          )}
          {showMenu && (
            <div id={menuId} className={isLight ? (compact ? "auth-tooltip-light auth-tooltip-compact" : "auth-tooltip-light") : "auth-tooltip"} role="menu">
              {username && (
                <div className="auth-tooltip-header">
                  <span className="auth-tooltip-label">Signed in as</span>
                  <span className="auth-tooltip-name">{username}</span>
                </div>
              )}
              <button
                type="button"
                className="auth-tooltip-item"
                role="menuitem"
                onClick={() => { setShowMenu(false); navigate("/settings"); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                </svg>
                Settings
              </button>
              <div className="auth-tooltip-divider" />
              <button
                type="button"
                className="auth-tooltip-item danger"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
