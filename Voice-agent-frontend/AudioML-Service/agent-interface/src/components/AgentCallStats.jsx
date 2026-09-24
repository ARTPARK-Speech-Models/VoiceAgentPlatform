import { useEffect, useState } from "react";
import { baseURL } from "../url";
import { StatCard, SectionHeading, EmptyState, ErrorState, Badge } from "./ui";

// Per-agent call stats for the agent details page: saved totals from
// GET /api/agent-stats/summary?agent_id=, with the in-progress call (from
// VoiceAgentWidget's onLiveUpdate) added on top so the numbers move in
// real time while a call is running. ASR/TTS cost only exist once a call
// is saved, so those stay at their saved totals until the call ends.

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function fmtCost(v) {
  return v == null ? null : `$${v.toFixed(4)}`;
}

const ICON_PATHS = {
  calls: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z" />,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  avg: <><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></>,
  tokens: <><rect x="2" y="3" width="20" height="14" rx="2.5" /><path d="M7 8h2M11 8h6M7 12h4M13 12h4" /></>,
  cost: <><circle cx="12" cy="12" r="9" /><path d="M12 6v12M9 9.5a2.5 2.5 0 0 1 2.5-1.5h1a2.25 2.25 0 0 1 0 4.5h-1a2.25 2.25 0 0 0 0 4.5h1a2.5 2.5 0 0 0 2.5-1.5" /></>,
  asr: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></>,
  tts: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>,
};

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

const NO_COST_HINT = "Cost appears after a call is saved";

export default function AgentCallStats({ agentId, live, refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseURL}api/agent-stats/summary?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      credentials: "include",
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((data) => { if (!cancelled) { setStats(data); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load call stats."); });
    return () => { cancelled = true; };
  }, [agentId, refreshKey, retryKey]);

  const onCall = !!live?.onCall;
  const ready = stats !== null;
  const savedCalls = stats?.total_calls ?? 0;
  const calls = savedCalls + (onCall ? 1 : 0);
  const seconds = (stats?.total_duration_seconds ?? 0) + (onCall ? live.seconds : 0);
  const avg = calls > 0 ? seconds / calls : 0;
  const tokens = (stats?.total_tokens ?? 0) + (onCall ? live.tokens : 0);
  const liveCost = onCall && live.costUsd != null ? live.costUsd : null;
  const llmCost = stats?.total_cost_usd == null && liveCost == null ? null : (stats?.total_cost_usd ?? 0) + (liveCost ?? 0);
  const noCallsYet = ready && savedCalls === 0 && !onCall;
  const anyCostMissing = ready && (llmCost == null || stats.total_asr_cost_usd == null || stats.total_tts_cost_usd == null);

  return (
    <section aria-labelledby="call-stats-heading">
      <SectionHeading
        icon={<Icon name="avg" size={16} />}
        title={<span id="call-stats-heading">Call stats</span>}
        description={onCall ? "Updating live while the call runs." : "Totals across every saved call with this agent."}
        action={onCall ? <Badge tone="green" dot pulse>Live · {fmtDuration(live.seconds)}</Badge> : null}
      />

      {error && !ready ? (
        <ErrorState
          title="Couldn't load call stats"
          message={error}
          onRetry={() => { setError(""); setRetryKey((k) => k + 1); }}
        />
      ) : noCallsYet ? (
        <EmptyState
          compact
          icon={<Icon name="calls" size={20} />}
          title="No calls yet"
          description="Talk to this agent to see stats here: call count, talk time, tokens and cost."
        />
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          <StatCard icon={<Icon name="calls" />} label="Total calls" value={ready ? calls.toLocaleString() : null} loading={!ready} tone={onCall ? "live" : "default"} hint={onCall ? "Includes this call" : null} />
          <StatCard icon={<Icon name="time" />} label="Total call time" value={ready ? fmtDuration(seconds) : null} loading={!ready} tone={onCall ? "live" : "default"} />
          <StatCard icon={<Icon name="avg" />} label="Avg call length" value={ready ? fmtDuration(avg) : null} loading={!ready} tone={onCall ? "live" : "default"} />
          <StatCard icon={<Icon name="tokens" />} label="Total tokens" value={ready ? tokens.toLocaleString() : null} loading={!ready} tone={onCall && live.tokens > 0 ? "live" : "default"} />
          <StatCard
            icon={<Icon name="cost" />}
            label="LLM cost"
            value={ready ? fmtCost(llmCost) : null}
            loading={!ready}
            tone={liveCost != null ? "live" : "default"}
          />
          <StatCard
            icon={<Icon name="asr" />}
            label="ASR cost"
            value={ready ? fmtCost(stats.total_asr_cost_usd) : null}
            loading={!ready}
            hint={onCall ? "Updates after the call" : null}
          />
          <StatCard
            icon={<Icon name="tts" />}
            label="TTS cost"
            value={ready ? fmtCost(stats.total_tts_cost_usd) : null}
            loading={!ready}
            hint={onCall ? "Updates after the call" : null}
          />
        </div>
      )}
      {!noCallsYet && anyCostMissing && !(error && !ready) && (
        <p className="text-xs text-slate-500 mt-2.5 mb-0">
          <span className="font-semibold text-slate-600">—</span> {NO_COST_HINT}.
        </p>
      )}
    </section>
  );
}
