/* Plain-text transcript export (issue #28) -- shared by the two live call
 * panel (VoiceAgentWidget) and CallHistorySection's
 * per-call detail view, since both end up with a list of
 * {role?, text, ts} messages, just from slightly different sources (live
 * card state vs. the backend's stored call_messages). `role` is optional --
 * a message without one falls back to "Agent" rather than showing
 * "undefined". `ts` works as either an ISO string (backend) or an epoch-ms
 * number (live card state) -- `new Date()` accepts both.
 */
export function formatTranscript(messages, meta = {}) {
  const lines = [];
  if (meta.title) lines.push(meta.title);
  if (meta.startedAt) lines.push(`Started: ${new Date(meta.startedAt).toLocaleString()}`);
  if (meta.title || meta.startedAt) lines.push("");

  for (const m of messages) {
    const role = m.role === "user" ? "User" : "Agent";
    const ts = m.ts ? new Date(m.ts).toLocaleTimeString() : "";
    lines.push(ts ? `[${ts}] ${role}: ${m.text}` : `${role}: ${m.text}`);
  }
  return lines.join("\n");
}

export function downloadTranscript(messages, filename, meta) {
  const text = formatTranscript(messages, meta);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
