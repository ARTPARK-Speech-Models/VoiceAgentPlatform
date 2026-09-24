import { useCallback, useEffect, useState, Fragment } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useNavigate } from "react-router-dom";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";
import { CallDetailRow } from "../components/CallHistorySection";
import { fmtDateTime, fmtDuration } from "../utils/callFormat";
import { Badge, Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton, StatCard } from "../components/ui";

const PAGE_SIZE = 25;
const CALLS_API_URL = baseURL + "api/calls";
const STATS_API_URL = baseURL + "api/agent-stats/summary";

// Table at md+, stacked cards below (see useMediaQuery) so an expanded
// call's detail -- which fetches its own data -- mounts only once.
const useIsWide = () => useMediaQuery("(min-width: 768px)");

function formatTotalDuration(totalSeconds) {
  if (!totalSeconds) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function fmtTokens(c) {
  if (!c.token_usage) return "—";
  const cost = c.token_usage.estimated_cost_usd;
  return `${c.token_usage.total_tokens.toLocaleString()}${cost != null ? ` (~$${cost.toFixed(4)})` : ""}`;
}

const ICONS = {
  phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>,
  clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  trend: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-6 4 3 5-8"/></svg>,
  agent: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="M9 14 Q12 16.5 15 14"/><line x1="12" y1="4" x2="12" y2="1.5"/></svg>,
  tokens: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2.5"/><path d="M7 8h2M11 8h6M7 12h4M13 12h4"/></svg>,
  dollar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9.5a2.5 2.5 0 0 1 2.5-1.5h1a2.25 2.25 0 0 1 0 4.5h-1a2.25 2.25 0 0 0 0 4.5h1a2.5 2.5 0 0 0 2.5-1.5"/></svg>,
  mic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  speaker: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  history: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>,
};

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Avg duration is derived client-side (total_duration_seconds /
// total_calls) rather than asked of the backend separately -- it's one
// division on two numbers the summary endpoint already returns.
function SummaryStats({ stats, status }) {
  const loading = status === "loading";
  const failed = status === "error";
  const noCalls = stats && stats.total_calls === 0;
  const avgSeconds = stats && stats.total_calls > 0 ? Math.round(stats.total_duration_seconds / stats.total_calls) : 0;

  // Hint that explains a "—" (never shown next to a real value).
  const missingHint = failed ? "Couldn't load stats" : noCalls ? "No calls yet" : null;
  // *_cost_usd is null when no call in the set had a tracked model
  // (LLM/pricing.py's verified-rate rule) or predates cost tracking -- so
  // "—" instead of a misleadingly precise $0.00. 0.0 is a real value
  // (self-hosted ASR/TTS are genuinely free).
  const cost = (v) => (stats && v != null ? `$${v.toFixed(4)}` : null);
  const costHint = (v) => {
    if (stats && v != null) return null;
    if (failed) return "Couldn't load stats";
    if (noCalls) return "Appears once calls are saved";
    return "Not tracked for these calls";
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard loading={loading} label="Total calls" value={stats ? stats.total_calls.toLocaleString() : null} hint={missingHint} icon={ICONS.phone} />
      <StatCard loading={loading} label="Total call time" value={stats ? formatTotalDuration(stats.total_duration_seconds) : null} hint={failed ? missingHint : null} icon={ICONS.clock} />
      <StatCard loading={loading} label="Avg call length" value={stats && !noCalls ? fmtDuration(avgSeconds) : null} hint={missingHint} icon={ICONS.trend} />
      <StatCard loading={loading} label="Agents with calls" value={stats ? stats.agents_with_calls : null} hint={failed ? missingHint : null} icon={ICONS.agent} />
      <StatCard loading={loading} label="Total tokens" value={stats ? stats.total_tokens.toLocaleString() : null} hint={failed ? missingHint : null} icon={ICONS.tokens} />
      <StatCard loading={loading} label="LLM cost" value={cost(stats?.total_cost_usd)} hint={costHint(stats?.total_cost_usd)} icon={ICONS.dollar} />
      <StatCard loading={loading} label="ASR cost" value={cost(stats?.total_asr_cost_usd)} hint={costHint(stats?.total_asr_cost_usd)} icon={ICONS.mic} />
      <StatCard loading={loading} label="TTS cost" value={cost(stats?.total_tts_cost_usd)} hint={costHint(stats?.total_tts_cost_usd)} icon={ICONS.speaker} />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-4 sm:px-6 pb-6 flex flex-col gap-3" aria-busy="true" aria-label="Loading call history">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-28 sm:w-40" />
          <Skeleton className="h-4 w-24 hidden sm:block" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

const TH = "text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";
const TD = "px-4 py-3 text-sm text-slate-700 whitespace-nowrap";

function CallsTable({ calls, expandedId, onToggle }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50/70">
            <th scope="col" className={TH}>Agent</th>
            <th scope="col" className={TH}>Started</th>
            <th scope="col" className={TH}>Duration</th>
            <th scope="col" className={TH}>Tool calls</th>
            <th scope="col" className={TH}>Tokens</th>
            <th scope="col" className={TH}>Summary</th>
            <th scope="col" className={TH}><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {calls.map(c => {
            const isExpanded = expandedId === c.id;
            return (
              <Fragment key={c.id}>
                <tr
                  onClick={() => onToggle(c)}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/50" : "hover:bg-slate-50"}`}
                >
                  <td className={`${TD} font-medium text-slate-900`}>{c.agent_name || "—"}</td>
                  <td className={TD}>{fmtDateTime(c.started_at)}</td>
                  <td className={`${TD} tabular-nums`}>{fmtDuration(c.duration)}</td>
                  <td className={`${TD} tabular-nums`}>{c.tool_call_count ?? 0}</td>
                  <td className={`${TD} tabular-nums`}>{fmtTokens(c)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-[320px] truncate" title={c.summary || undefined}>{c.summary || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggle(c); }}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Hide" : "Show"} details for call with ${c.agent_name || "agent"} on ${fmtDateTime(c.started_at)}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {isExpanded ? "Hide" : "Details"} <Chevron open={isExpanded} />
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="px-5 pt-4 pb-6 bg-slate-50 border-b border-slate-100">
                      <CallDetailRow agentId={c.agent_id} callId={c.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CallsCards({ calls, expandedId, onToggle }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
      {calls.map(c => {
        const isExpanded = expandedId === c.id;
        return (
          <li key={c.id} className={isExpanded ? "bg-blue-50/40" : undefined}>
            <button
              type="button"
              onClick={() => onToggle(c)}
              aria-expanded={isExpanded}
              className="w-full text-left px-4 py-3.5 flex flex-col gap-1.5 hover:bg-slate-50"
            >
              <span className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-sm font-semibold text-slate-900 truncate">{c.agent_name || "—"}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 flex-shrink-0">
                  {isExpanded ? "Hide" : "Details"} <Chevron open={isExpanded} />
                </span>
              </span>
              <span className="text-xs text-slate-500">{fmtDateTime(c.started_at)}</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                <span><span className="text-slate-400">Duration</span> {fmtDuration(c.duration)}</span>
                <span><span className="text-slate-400">Tools</span> {c.tool_call_count ?? 0}</span>
                <span className="break-all"><span className="text-slate-400">Tokens</span> {fmtTokens(c)}</span>
              </span>
              {c.summary && <span className="text-sm text-slate-600 line-clamp-2">{c.summary}</span>}
            </button>
            {isExpanded && (
              <div className="px-3 pb-4 pt-1 min-w-0 overflow-x-auto">
                <CallDetailRow agentId={c.agent_id} callId={c.id} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function CallHistoryPage() {
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const navigate = useNavigate();
  const isWide = useIsWide();

  const [stats, setStats] = useState(null);
  const [statsStatus, setStatsStatus] = useState("loading"); // loading | ok | error
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null); // { agentId, callId } | null

  const loadPage = useCallback(async (offset, limit = PAGE_SIZE) => {
    const res = await fetch(`${CALLS_API_URL}?limit=${limit}&offset=${offset}`, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPage(0)
      .then(data => {
        if (cancelled) return;
        setCalls(data.calls);
        setTotal(data.total);
        setError("");
      })
      .catch(e => { if (!cancelled) setError(e.message || "Failed to load call history"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadPage, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(STATS_API_URL, { credentials: "include" })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { if (!cancelled) { setStats(data); setStatsStatus("ok"); } })
      // Stat cards show "—" with a "Couldn't load stats" hint -- not worth its own banner.
      .catch(() => { if (!cancelled) setStatsStatus("error"); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  function retry() {
    setLoading(true);
    setError("");
    setStatsStatus("loading");
    setReloadKey(k => k + 1);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const data = await loadPage(calls.length);
      setCalls(prev => [...prev, ...data.calls]);
      setTotal(data.total);
    } catch (e) {
      setLoadMoreError(e.message || "Failed to load more calls");
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleExpanded(call) {
    setExpandedRow(prev =>
      prev && prev.callId === call.id ? null : { agentId: call.agent_id, callId: call.id },
    );
  }

  const expandedId = expandedRow?.callId ?? null;
  const remaining = total - calls.length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` }}>
      <Sidebar />
      <PageHero crumbs={["Call History"]}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white/85 text-xs font-semibold tracking-widest uppercase">Overview</p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">Call History</h1>
          </div>
        </div>
        <p className="text-blue-50/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          Every call across every agent you've configured, consolidated in one place.
        </p>
      </PageHero>

      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full min-w-0">
        <SummaryStats stats={stats} status={statsStatus} />

        <Card className="overflow-hidden">
          <div className="px-4 sm:px-6 pt-5">
            <SectionHeading
              icon={ICONS.history}
              title="All calls"
              description="Newest first, across every agent. Select a call to see its details."
              action={total > 0 ? <Badge tone="blue">{total.toLocaleString()} call{total === 1 ? "" : "s"}</Badge> : null}
            />
          </div>

          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <div className="px-4 sm:px-6 pb-6">
              <ErrorState title="Couldn't load call history" message={error} onRetry={retry} />
            </div>
          ) : calls.length === 0 ? (
            <div className="px-4 sm:px-6 pb-6">
              <EmptyState
                icon={ICONS.phone}
                title="No calls yet"
                description="Once you talk to one of your agents, each call shows up here with its duration, token usage and summary."
                action={<Button onClick={() => navigate("/agents")}>Go to your agents</Button>}
              />
            </div>
          ) : (
            <>
              {isWide
                ? <CallsTable calls={calls} expandedId={expandedId} onToggle={toggleExpanded} />
                : <CallsCards calls={calls} expandedId={expandedId} onToggle={toggleExpanded} />}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
                  Showing {calls.length.toLocaleString()} of {total.toLocaleString()}
                </p>
                {remaining > 0 && (
                  <Button variant="secondary" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, remaining)} more`}
                  </Button>
                )}
              </div>
              {loadMoreError && (
                <div className="px-4 sm:px-6 pb-4">
                  <ErrorState title="Couldn't load more calls" message={loadMoreError} onRetry={handleLoadMore} />
                </div>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
