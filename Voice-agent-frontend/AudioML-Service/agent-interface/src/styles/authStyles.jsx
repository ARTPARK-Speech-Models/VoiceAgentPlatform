// Styles for Auth.jsx's profile button + menu. Guest Login/Register buttons
// are Tailwind (ui.jsx Button) now; only the pieces that need positioning or
// pseudo-elements live here. Font is the app-wide Inter; accents use the
// brand blue (#2563eb, Tailwind blue-600).
export const AUTH_STYLES = `
  @keyframes auth-tooltip-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  @keyframes auth-tooltip-in-up {
    from { opacity: 0; transform: translateY(4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .auth-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  }

  .auth-profile-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* On the blue PageHero band */
  .auth-profile-btn {
    width: 38px; height: 38px;
    border-radius: 9999px;
    border: 1.5px solid rgba(255,255,255,.45);
    background: rgba(255,255,255,.14);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: border-color .15s, background .15s;
    padding: 0;
    flex-shrink: 0;
  }
  .auth-profile-btn:hover { border-color: rgba(255,255,255,.75); background: rgba(255,255,255,.22); }

  /* On white (Sidebar rail collapsed) */
  .auth-profile-btn-light {
    width: 40px; height: 40px;
    border-radius: 9999px;
    border: 1px solid #e2e8f0;
    background: #eff6ff;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: border-color .15s, background .15s;
    padding: 0;
    flex-shrink: 0;
  }
  .auth-profile-btn-light:hover { border-color: #bfdbfe; background: #dbeafe; }

  /* Full-width sidebar footer row: avatar + username. */
  .auth-profile-full {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px 7px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #fff;
    cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .auth-profile-full:hover { background: #f8fafc; border-color: #cbd5e1; }
  .auth-profile-full-avatar {
    width: 32px; height: 32px; border-radius: 9999px;
    background: #eff6ff;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .auth-profile-full-name {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Opens upward -- this block sits at the bottom of the sidebar/drawer. */
  .auth-tooltip-light {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 6px 0;
    box-shadow: 0 -4px 16px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06);
    animation: auth-tooltip-in-up .16s ease forwards;
    font-size: 13px;
    color: #334155;
    z-index: 1000;
  }
  /* Collapsed rail: the anchor is only ~40px wide, so use a fixed width. */
  .auth-tooltip-compact {
    left: 0;
    right: auto;
    min-width: 180px;
  }

  /* Downward menu on the blue band */
  .auth-tooltip {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 6px 0;
    box-shadow: 0 10px 28px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.06);
    min-width: 180px;
    animation: auth-tooltip-in .16s ease forwards;
    font-size: 13px;
    color: #334155;
    z-index: 1000;
  }

  .auth-tooltip-header {
    display: flex;
    flex-direction: column;
    padding: 6px 14px 8px;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 4px;
  }
  .auth-tooltip-label { font-size: 11px; color: #64748b; }
  .auth-tooltip-name {
    font-size: 13px; font-weight: 600; color: #0f172a;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .auth-tooltip-item {
    padding: 8px 14px;
    cursor: pointer;
    transition: background .12s;
    display: flex; align-items: center; gap: 8px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: #334155;
    background: none; border: none; width: 100%; text-align: left;
    white-space: nowrap;
  }
  .auth-tooltip-item:hover { background: #f1f5f9; }
  .auth-tooltip-item:disabled { opacity: .6; cursor: not-allowed; }
  .auth-tooltip-item.danger { color: #dc2626; }
  .auth-tooltip-item.danger:hover { background: #fef2f2; }
  .auth-tooltip-divider { height: 1px; background: #f1f5f9; margin: 4px 0; }
`;
