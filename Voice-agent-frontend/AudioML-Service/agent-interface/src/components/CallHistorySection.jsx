import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import { baseURL } from "../url";
import LatencyLineChart from "./LatencyLineChart";
import { downloadTranscript } from "../utils/transcriptExport";
import { fmtDuration, fmtDateTime } from "../utils/callFormat";
import ThumbsButtons from "./ThumbsButtons";
import { Card, Button, EmptyState, ErrorState, Skeleton } from "./ui";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Link } from "react-router-dom";

const FONT = "'Inter', sans-serif";
const PAGE_SIZE = 25;
// Hidden for now (not removed) -- flip back on whenever recordings should
// show in the call-detail dropdown again.
const SHOW_RECORDINGS = false;

/* One side's recording (issue #29) -- fetched as a blob (not a plain
 * <audio src="..."> URL) so the request goes through the same
 * credentials:"include" pattern every other authenticated call here
 * uses, rather than relying on the browser to send the session cookie
 * on a bare media-element request. Lazy: only fetched once the user
 * actually hits play, not just because the row is expanded -- a WAV can
 * be a few MB, no reason to pull it down for every row someone opens. */
function RecordingPlayer({ agentId, callId, side, label }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${baseURL}api/agent/${encodeURIComponent(agentId)}/calls/${callId}/recording/${side}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message || "Failed to load recording");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#64748b", fontFamily: FONT, minWidth: 90, flexShrink: 0 }}>{label}</span>
      {blobUrl ? (
        <audio controls src={blobUrl} style={{ height: 32, flex: 1, minWidth: 0 }} />
      ) : error ? (
        <span style={{ fontSize: 12, color: "#dc2626", fontFamily: FONT }}>{error}</span>
      ) : (
        <button
          onClick={load}
          disabled={loading}
          style={{
            fontSize: 12, fontWeight: 600, color: "#3b82f6", fontFamily: FONT,
            background: "none", border: "none", cursor: loading ? "default" : "pointer", padding: 0,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading…" : "▶ Load recording"}
        </button>
      )}
    </div>
  );
}

/* One expandable row's detail: fetched lazily on first expand, cached
 * after that so re-collapsing/re-expanding doesn't re-fetch. */
export function CallDetailRow({ agentId, callId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseURL}api/agent/${encodeURIComponent(agentId)}/calls/${callId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load call detail");
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, callId]);

  // Optimistic -- updates local state immediately so the click feels
  // instant, then fires the real request; a failed vote just doesn't
  // persist (not worth a whole error banner for a thumbs click).
  async function handleFeedback(turnId, provider, feedback) {
    setDetail(prev => ({
      ...prev,
      asr_eval_results: prev.asr_eval_results.map(t =>
        t.turn_id === turnId
          ? { ...t, results: t.results.map(r => (r.provider === provider ? { ...r, feedback } : r)) }
          : t,
      ),
    }));
    try {
      await fetch(`${baseURL}api/agent/${encodeURIComponent(agentId)}/calls/${callId}/asr-eval-feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn_id: turnId, provider, feedback }),
      });
    } catch {
      /* best-effort, see comment above */
    }
  }

  if (error) return <ErrorState title="Couldn't load this call" message={error} />;
  if (!detail) {
    return (
      <div className="space-y-2" aria-label="Loading call detail">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const turns = detail.latency_per_turn || [];
  const recAvail = detail.recording_available;
  const asrEvalTurns = detail.asr_eval_results || [];

  // Each section is its own white bordered card on the row's light-gray
  // background -- a plain uppercase label with no border (the previous
  // treatment) didn't read as distinct sections at a glance.
  const sectionStyle = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", minWidth: 0 };
  const sectionTitleStyle = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#64748b", fontFamily: FONT, margin: "0 0 10px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {SHOW_RECORDINGS && recAvail && (recAvail.user || recAvail.agent) && (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>Recording</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recAvail.user && <RecordingPlayer agentId={agentId} callId={callId} side="user" label="User (mic)" />}
            {recAvail.agent && <RecordingPlayer agentId={agentId} callId={callId} side="agent" label="Agent (TTS)" />}
          </div>
        </div>
      )}

      {turns.length > 0 ? (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>Latency per turn</p>
          <LatencyLineChart points={turns} xLabel={t => t.turn} xAxisLabel="Turn" />
        </div>
      ) : (
        <p className="text-sm text-slate-500 m-0">
          No per-turn latency was recorded for this call.
        </p>
      )}

      {asrEvalTurns.length > 0 && (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>ASR evaluation</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {asrEvalTurns.map((turn, i) => (
              <div key={turn.turn_id || i}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", fontFamily: FONT, margin: "0 0 6px" }}>
                  Turn {i + 1}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {turn.results.map(r => (
                    <div key={r.provider} style={{ fontSize: 12.5, fontFamily: FONT }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          padding: "1px 7px", borderRadius: 6, fontWeight: 600,
                          background: r.is_primary ? "#fde68a" : "#fff", color: r.is_primary ? "#92400e" : "#64748b",
                          border: r.is_primary ? "none" : "1px solid #fde68a",
                        }}>
                          {r.provider}{r.model ? ` (${r.model})` : ""}{r.is_primary ? " · primary" : ""}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* ms is what's stored; shown in seconds -- not
                              meaningful to read at millisecond precision. */}
                          <span style={{ color: "#94a3b8", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                            {(r.latency_ms / 1000).toFixed(2)}s
                          </span>
                          <ThumbsButtons
                            feedback={r.feedback}
                            onVote={(fb) => handleFeedback(turn.turn_id, r.provider, fb)}
                          />
                        </div>
                      </div>
                      <div style={{ padding: "8px 12px", borderRadius: 12, borderTopLeftRadius: 4, background: "#fff", border: "1px solid #fde68a", color: "#334155", lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
                        {r.text || <em style={{ color: "#94a3b8" }}>no transcript</em>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.messages && detail.messages.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <p style={{ ...sectionTitleStyle, margin: 0 }}>Transcript</p>
            <button
              onClick={() => downloadTranscript(
                detail.messages, `call-${callId}-transcript.txt`,
                { title: `Call #${callId} -- transcript`, startedAt: detail.started_at },
              )}
              aria-label="Download transcript"
              title="Download transcript"
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <svg width="14" height="14" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
          {/* Same color scheme + alignment as VoiceAgentWidget's
              TranscriptBubble (blue gradient, right-aligned for the user;
              white/bordered, left-aligned for the agent) -- role is
              conveyed by side + color, no "User"/"Agent" label needed. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
            {detail.messages.map((m, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12.5, fontFamily: FONT, padding: "8px 12px", borderRadius: 12,
                  lineHeight: 1.5, maxWidth: "85%", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  ...(m.role === "user"
                    ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", borderBottomRightRadius: 4 }
                    : { background: "#fff", color: "#334155", border: "1px solid #dbeafe", borderBottomLeftRadius: 4 }),
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Calls happen through a completely separate component (the floating
// VoiceAgentWidget) -- there's no shared in-process event
// to hook this table's refresh to when a call ends, so it polls instead.
const AUTO_REFRESH_MS = 5000;

// `maxCalls`: show only the latest N calls (no paging) plus a "View all"
// link to the Call History page -- used on the agent page.
export default function CallHistorySection({ agentId, delay = 0, maxCalls }) {
  const pageSize = maxCalls ?? PAGE_SIZE;
  // Table at md+, stacked cards below (one layout mounted at a time, so an
  // expanded call's CallDetailRow -- which fetches -- mounts only once).
  const isWide = useMediaQuery("(min-width: 768px)");
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const loadPage = useCallback(async (offset, limit = pageSize) => {
    const res = await fetch(
      `${baseURL}api/agent/${encodeURIComponent(agentId)}/calls?limit=${limit}&offset=${offset}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [agentId, pageSize]);

  // Re-fetches from the top, re-requesting however many rows were already
  // loaded (so an expanded-and-scrolled-down view doesn't collapse back to
  // one page's worth on every refresh) -- used for the manual Refresh
  // button, the background poll, and the initial load, so all three paths
  // stay in sync instead of drifting.
  const refresh = useCallback(async ({ background = false } = {}) => {
    if (background) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const data = await loadPage(0, maxCalls ?? Math.max(PAGE_SIZE, calls.length));
      setCalls(data.calls);
      setTotal(data.total);
    } catch (e) {
      setError(e.message || "Failed to load call history");
    } finally {
      if (background) setRefreshing(false); else setLoading(false);
    }
  }, [loadPage, calls.length, maxCalls]);

  useEffect(() => {
    let cancelled = false;
    loadPage(0)
      .then(data => {
        if (cancelled) return;
        setCalls(data.calls);
        setTotal(data.total);
      })
      .catch(e => { if (!cancelled) setError(e.message || "Failed to load call history"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadPage]);

  // refresh() closes over calls.length (to preserve however many pages are
  // loaded), so it's a new function every time calls changes -- a plain
  // setInterval(refresh, ...) would freeze on whatever calls.length was at
  // mount and silently truncate "Load more" progress on every poll after
  // that. Keep a ref pointing at the latest refresh instead (updated in an
  // effect, not during render), and set the interval up once.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Background poll -- silent (no loading skeleton), so an open expanded
  // row and its chart don't flicker away every 5s.
  useEffect(() => {
    const id = setInterval(() => { refreshRef.current({ background: true }); }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [agentId]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const data = await loadPage(calls.length);
      setCalls(prev => [...prev, ...data.calls]);
      setTotal(data.total);
    } catch (e) {
      setError(e.message || "Failed to load more calls");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Card className="agent-detail-section-rise overflow-hidden" style={{ animationDelay: `${delay}s` }}>
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 leading-tight m-0">Call history</h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-0 truncate">
            {total > 0
              ? maxCalls && total > calls.length
                ? `Latest ${calls.length} of ${total} calls · select one for latency and transcript`
                : `${total} call${total === 1 ? "" : "s"} · select a row for latency and transcript`
              : "Every call with this agent is saved here."}
          </p>
        </div>
        {/* Calls happen through a separate widget/page, so this table
            can't know a new one just finished -- it polls in the
            background every 5s (see AUTO_REFRESH_MS), and this button
            lets the user force it sooner. */}
        <button
          type="button"
          onClick={() => refresh({ background: true })}
          disabled={loading || refreshing}
          aria-label="Refresh call history"
          title="Refresh"
          className="ml-auto w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={refreshing ? "animate-spin" : undefined} aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className="p-4 sm:p-5 space-y-3" aria-label="Loading call history">
          <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-4/5" />
        </div>
      )}
      {!loading && error && (
        <div className="p-4 sm:p-5">
          <ErrorState title="Couldn't load call history" message={error} onRetry={() => refresh()} />
        </div>
      )}
      {!loading && !error && calls.length === 0 && (
        <div className="p-4 sm:p-5">
          <EmptyState
            compact
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z" />
              </svg>
            }
            title="No calls yet"
            description="Talk to this agent and each call shows up here with its duration, tokens, summary and transcript."
          />
        </div>
      )}

      {!loading && !error && calls.length > 0 && !isWide && (
        <ul className="divide-y divide-slate-100">
          {calls.map(c => {
            const isExpanded = expandedId === c.id;
            const usage = c.token_usage;
            return (
              <li key={c.id} className={isExpanded ? "bg-blue-50/40" : ""}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Hide" : "Show"} details for call started ${fmtDateTime(c.started_at)}`}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-800">{fmtDateTime(c.started_at)}</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-500 tabular-nums">
                      {fmtDuration(c.duration)}
                      {usage ? ` · ${usage.total_tokens.toLocaleString()} tokens` : ""}
                      {usage?.estimated_cost_usd != null ? ` · ~$${usage.estimated_cost_usd.toFixed(4)}` : ""}
                    </p>
                    {c.summary && !isExpanded && (
                      <p className="mt-1 text-[12.5px] text-slate-500 line-clamp-2">{c.summary}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 pt-0.5">
                    {isExpanded ? "Hide" : "Details"}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                    {c.summary && (
                      <p className="text-sm text-slate-600 my-2"><span className="font-semibold text-slate-700">Summary: </span>{c.summary}</p>
                    )}
                    <CallDetailRow agentId={agentId} callId={c.id} />
                  </div>
                )}
              </li>
            );
          })}
          {calls.length < total && (
            <li className="px-4 py-3 text-center">
              {maxCalls ? (
                <Link to="/call-history" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all {total} calls →</Link>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, total - calls.length)} more`}
                </Button>
              )}
            </li>
          )}
        </ul>
      )}

      {!loading && !error && calls.length > 0 && isWide && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                {[
                  ["Started", ""],
                  ["Duration", ""],
                  ["Tool calls", "hidden md:table-cell"],
                  ["Tokens", ""],
                  ["Summary", "hidden lg:table-cell"],
                ].map(([h, cls]) => (
                  <th key={h} scope="col" className={`text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap ${cls}`}>
                    {h}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {calls.map(c => {
                const isExpanded = expandedId === c.id;
                const toggle = () => setExpandedId(isExpanded ? null : c.id);
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={toggle}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/50" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-2.5 text-[13px] text-slate-700 whitespace-nowrap">{fmtDateTime(c.started_at)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-700 whitespace-nowrap tabular-nums">{fmtDuration(c.duration)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-700 tabular-nums hidden md:table-cell">{c.tool_call_count ?? 0}</td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-700 whitespace-nowrap tabular-nums">
                        {c.token_usage ? (
                          <>
                            {c.token_usage.total_tokens.toLocaleString()}
                            {c.token_usage.estimated_cost_usd != null && (
                              <span className="text-slate-500 hidden sm:inline"> (~${c.token_usage.estimated_cost_usd.toFixed(4)})</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400" title="No token usage was reported for this call">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-500 max-w-[320px] truncate hidden lg:table-cell">
                        {c.summary || <span className="text-slate-400">No summary</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {/* Real button so the row is keyboard-reachable;
                            its click bubbles to the row's toggle. */}
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Hide" : "Show"} details for call started ${fmtDateTime(c.started_at)}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap rounded-md px-1.5 py-1"
                        >
                          {isExpanded ? "Hide" : "Details"}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-3 sm:px-5 pt-3.5 pb-5 bg-slate-50 border-b border-slate-100">
                          {c.summary && (
                            <p className="lg:hidden text-sm text-slate-600 mb-3 mt-0 whitespace-normal">
                              <span className="font-semibold text-slate-700">Summary: </span>{c.summary}
                            </p>
                          )}
                          <CallDetailRow agentId={agentId} callId={c.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {calls.length < total && (
            <div className="px-4 py-3 text-center">
              {maxCalls ? (
                <Link to="/call-history" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all {total} calls →</Link>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, total - calls.length)} more`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
