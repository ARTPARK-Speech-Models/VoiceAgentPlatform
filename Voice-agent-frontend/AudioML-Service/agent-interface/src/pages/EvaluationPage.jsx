import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import AsrLatencyComparisonChart from "../components/AsrLatencyComparisonChart";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { fmtDateTime } from "../utils/callFormat";
import ThumbsButtons from "../components/ThumbsButtons";
import { baseURL } from "../url";
import { Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton, StatCard } from "../components/ui";

const SUMMARY_API_URL = baseURL + "api/asr-eval/summary";

const ICONS = {
  mic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  turns: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>,
  table: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>,
  chart: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-6 4 3 5-8"/></svg>,
  list: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
};

// Shared by both tables on this page -- click a header to sort by that
// column, click again to flip direction. `sort` is {key, dir} | null
// (null = whatever order the API returned, i.e. chronological).
function SortArrow({ active, dir }) {
  if (!active) return <span className="ml-1 opacity-30" aria-hidden="true">↕</span>;
  return <span className="ml-1 text-blue-600" aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>;
}

function Th({ label, sortKey, sort, setSort, className = "" }) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 font-semibold whitespace-nowrap ${className}`}>
      <button
        type="button"
        onClick={() => setSort(active && sort.dir === "desc" ? { key: sortKey, dir: "asc" } : { key: sortKey, dir: "desc" })}
        className={`inline-flex items-center rounded uppercase tracking-wider hover:text-slate-900 transition-colors ${active ? "text-slate-900" : ""}`}
      >
        {label}
        <SortArrow active={active} dir={sort?.dir} />
      </button>
    </th>
  );
}

function sortRows(rows, sort, getValue) {
  if (!sort) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = getValue(a, sort.key);
    const bv = getValue(b, sort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return av.localeCompare(bv);
    return av - bv;
  });
  if (sort.dir === "desc") sorted.reverse();
  return sorted;
}

const THEAD_ROW = "text-left text-xs text-slate-500 border-y border-slate-100 bg-slate-50/70";

// One row per ASR model, aggregated across the calls scanned -- thumbs are
// plain counts here (not clickable; voting happens live in the call panel
// or in a specific call's Call History detail row). Sortable by any column.
function ProviderTable({ providers }) {
  const [sort, setSort] = useState(null);
  const rows = sortRows(providers, sort, (p, key) => key === "provider" ? p.provider : p[key]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={THEAD_ROW}>
            <Th label="Model" sortKey="provider" sort={sort} setSort={setSort} />
            <Th label="Turns" sortKey="turns" sort={sort} setSort={setSort} />
            <Th label="Avg latency" sortKey="avg_latency_ms" sort={sort} setSort={setSort} />
            <Th label="Thumbs up" sortKey="thumbs_up" sort={sort} setSort={setSort} />
            <Th label="Thumbs down" sortKey="thumbs_down" sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.provider} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                {p.provider}{p.model ? <span className="text-slate-500 font-normal"> ({p.model})</span> : ""}
              </td>
              <td className="px-4 py-3 text-slate-700 tabular-nums">{p.turns}</td>
              <td className="px-4 py-3 text-slate-700 tabular-nums">
                {p.avg_latency_ms != null ? `${(p.avg_latency_ms / 1000).toFixed(2)}s` : "—"}
              </td>
              <td className="px-4 py-3 text-emerald-700 font-medium tabular-nums">{p.thumbs_up}</td>
              <td className="px-4 py-3 text-red-600 font-medium tabular-nums">{p.thumbs_down}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One row per evaluated turn -- transcript text + feedback per model, so
// you can browse what each ASR model actually heard and how it was rated,
// not just the aggregate counts in ProviderTable above. Sortable by turn
// order, agent, or time; the per-provider transcript columns aren't
// sortable (there's no single scalar to sort text by). Rating here
// persists the same way Call History's detail row does -- same
// asr-eval-feedback endpoint, same underlying JSON column -- so a vote
// cast here shows up there too, and vice versa.
function TurnDetailsTable({ turnDetails, providerModels, onVote }) {
  const [sort, setSort] = useState(null);
  const providerNames = Object.keys(providerModels);

  if (turnDetails.length === 0) return null;

  const indexed = turnDetails.map((t, i) => ({ ...t, turnIndex: i + 1 }));
  const rows = sortRows(indexed, sort, (t, key) => key === "turnIndex" ? t.turnIndex : key === "started_at" ? t.started_at : t.agent_name);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={THEAD_ROW}>
            <Th label="Turn" sortKey="turnIndex" sort={sort} setSort={setSort} />
            <Th label="Agent" sortKey="agent_name" sort={sort} setSort={setSort} />
            <Th label="Time" sortKey="started_at" sort={sort} setSort={setSort} />
            {providerNames.map(name => (
              <th key={name} scope="col" className="px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap">
                {name}{providerModels[name] ? <span className="normal-case tracking-normal text-slate-400 font-normal"> ({providerModels[name]})</span> : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={`${t.call_id}-${t.turnIndex}`} className="border-b border-slate-100 last:border-0 align-top">
              <td className="px-4 py-3 text-slate-500 tabular-nums">{t.turnIndex}</td>
              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{t.agent_name}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDateTime(t.started_at)}</td>
              {providerNames.map(name => {
                const r = t.results.find(res => res.provider === name);
                if (!r) return <td key={name} className="px-4 py-3 text-slate-300">—</td>;
                return (
                  <td key={name} className="px-4 py-3 min-w-[200px] max-w-[280px]">
                    <div
                      className={`rounded-xl px-3 py-2 text-[13px] leading-snug ${r.is_primary ? "bg-blue-50 text-blue-900 ring-1 ring-blue-100" : "bg-slate-50 text-slate-700"}`}
                      title={r.text || ""}
                    >
                      {r.text || <span className="text-slate-400">—</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1 text-xs text-slate-500">
                      {r.latency_ms != null ? <span className="tabular-nums">{(r.latency_ms / 1000).toFixed(2)}s</span> : <span />}
                      <ThumbsButtons feedback={r.feedback} onVote={(fb) => onVote(t, r.provider, fb)} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="px-4 sm:px-6 pb-6 flex flex-col gap-3" aria-busy="true" aria-label="Loading evaluation data">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export default function EvaluationPage() {
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(SUMMARY_API_URL, { credentials: "include" })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(json => { if (!cancelled) { setData(json); setError(""); } })
      .catch(e => { if (!cancelled) setError(e.message || "Failed to load evaluation data"); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  function retry() {
    setError("");
    setReloadKey(k => k + 1);
  }

  const loading = !data && !error;
  const totalTurns = data ? data.turns.length : 0;
  const totalModels = data ? data.providers.length : 0;
  const isEmpty = data && data.providers.length === 0;
  const emptyHint = isEmpty ? "No evaluation calls yet" : error && !data ? "Couldn't load" : null;

  // Optimistic update, mirroring CallHistorySection's handleFeedback --
  // identify the turn by call_id+turn_id (stable identity from the
  // backend), not turnIndex (recomputed client-side on every sort).
  async function handleTurnVote(turnDetail, provider, feedback) {
    setData(prev => ({
      ...prev,
      turn_details: prev.turn_details.map(t =>
        t.call_id === turnDetail.call_id && t.turn_id === turnDetail.turn_id
          ? { ...t, results: t.results.map(r => (r.provider === provider ? { ...r, feedback } : r)) }
          : t,
      ),
    }));
    try {
      await fetch(`${baseURL}api/agent/${encodeURIComponent(turnDetail.agent_id)}/calls/${turnDetail.call_id}/asr-eval-feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn_id: turnDetail.turn_id, provider, feedback }),
      });
    } catch {
      /* best-effort, same as CallHistorySection's handleFeedback */
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` }}>
      <Sidebar />
      <PageHero crumbs={["Evaluation"]}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white/85 text-xs font-semibold tracking-widest uppercase">Overview</p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">Evaluation</h1>
          </div>
        </div>
        <p className="text-blue-50/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          Compare ASR models side by side across your evaluation-mode calls — latency, transcripts and ratings.
        </p>
      </PageHero>

      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full min-w-0">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <StatCard loading={loading} label="Evaluated turns" value={data ? totalTurns.toLocaleString() : null} hint={emptyHint} icon={ICONS.turns} />
          <StatCard loading={loading} label="Models compared" value={data ? totalModels : null} hint={emptyHint} icon={ICONS.mic} />
          <StatCard
            loading={loading}
            label="Calls scanned"
            value={data ? data.calls_scanned.toLocaleString() : null}
            hint={data ? "Most recent calls checked" : emptyHint}
            icon={ICONS.phone}
          />
        </div>

        {error && !data ? (
          <ErrorState title="Couldn't load evaluation data" message={error} onRetry={retry} />
        ) : isEmpty ? (
          <EmptyState
            icon={ICONS.mic}
            title="No evaluation data yet"
            description="Turn on Evaluation mode on an agent's page and make a call. Each evaluated turn's ASR latency, transcripts and ratings will show up here for comparison."
            action={<Button onClick={() => navigate("/agents")}>Go to your agents</Button>}
          />
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="px-4 sm:px-6 pt-5">
                <SectionHeading
                  icon={ICONS.table}
                  title="Model performance"
                  description="Aggregated across every evaluated turn in the scanned calls. Select a column to sort."
                />
              </div>
              {loading ? <TableSkeleton /> : <ProviderTable providers={data.providers} />}
            </Card>

            {data && data.turns.length > 0 && (
              <Card className="px-4 sm:px-6 py-5 min-w-0">
                <SectionHeading
                  icon={ICONS.chart}
                  title="Latency over time"
                  description="Every evaluated turn, oldest to newest, across the scanned calls"
                />
                <AsrLatencyComparisonChart
                  points={data.turns}
                  providerModels={data.provider_models}
                  bare
                  emptyMessage="No evaluated turns in the scanned calls."
                />
              </Card>
            )}

            {data && data.turn_details.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 sm:px-6 pt-5">
                  <SectionHeading
                    icon={ICONS.list}
                    title="Recent evaluated turns"
                    description="What each model heard and how it was rated. The blue bubble is the primary (live) ASR."
                  />
                </div>
                <TurnDetailsTable turnDetails={data.turn_details} providerModels={data.provider_models} onVote={handleTurnVote} />
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
