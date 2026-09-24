import { useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-collapsed";
const EVENT_NAME = "sidebar-collapse-change";

// Sidebar and any page that needs to offset its content by the sidebar's
// current width share this via localStorage + a custom event (no React
// context/provider wiring into App.jsx needed for two consumers).
export function readSidebarCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* localStorage unavailable (private mode, etc.) -- state just won't persist */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: collapsed }));
}

// Pages use this to know how much left padding to reserve for the fixed
// Sidebar -- reacts live as the user toggles collapse.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  useEffect(() => {
    const handler = (e) => setCollapsed(e.detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  return collapsed;
}
