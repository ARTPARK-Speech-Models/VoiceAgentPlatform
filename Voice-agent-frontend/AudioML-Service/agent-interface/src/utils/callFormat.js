// Shared by CallHistorySection.jsx (per-agent) and CallHistoryPage.jsx
// (consolidated, across agents) -- split into their own file since mixing
// plain function exports into a component file breaks Fast Refresh
// (react-refresh/only-export-components).

export function fmtDuration(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
