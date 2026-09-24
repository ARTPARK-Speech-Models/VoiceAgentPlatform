import LatencyLineChart from "./LatencyLineChart";
import { Card, Badge } from "./ui";

// Palette assigned by first-seen order, not hardcoded per provider name --
// new eval models (e.g. Sarvam, issue #75) show up with their own color
// automatically instead of needing this file updated every time the
// backend's EVAL_ASR_MODELS list grows.
const PALETTE = ["#f59e0b", "#3b82f6", "#22c55e", "#7c3aed", "#ec4899"];

/**
 * Evaluation-mode ASR latency comparison -- asr_eval results only ever
 * exist live, over the WebSocket, for the current session
 * (VoiceAgentWidget's onAsrEval callback), so `points` is whatever's been
 * seen since this page mounted -- gone on refresh.
 *
 * @param {Array<object>} points - one entry per ASR turn, each keyed by
 *   provider name -> latency_ms (e.g. { turnIndex, Vaani: 210, Google: 640 }).
 * @param {Object<string,string>} [providerModels] - provider name -> model name.
 * @param {boolean} [bare] - skip the card wrapper and just render the chart
 *   (the Evaluation page supplies its own card and heading).
 * @param {string} [emptyMessage] - shown when points is empty.
 */
export default function AsrLatencyComparisonChart({
  points,
  providerModels = {},
  bare = false,
  emptyMessage,
}) {
  const providers = [...new Set(points.flatMap(p => Object.keys(p).filter(k => k !== "turnIndex")))];
  const series = providers.map((name, i) => ({
    key: name,
    label: providerModels[name] ? `${name} (${providerModels[name]})` : name,
    color: PALETTE[i % PALETTE.length],
  }));

  const empty = points.length === 0;

  const chart = empty ? (
    bare ? (
      <p className="text-sm text-slate-500 m-0">{emptyMessage ?? "No turns yet."}</p>
    ) : (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-4">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" />
          </svg>
        </div>
        <p className="text-sm text-slate-600 m-0">
          {emptyMessage ?? "No turns yet. Start a call with evaluation mode on and each turn's latency per ASR model appears here."}
        </p>
      </div>
    )
  ) : (
    <LatencyLineChart
      points={points}
      series={series}
      xLabel={(p) => `Turn ${p.turnIndex}`}
      xAxisLabel="Turn"
    />
  );

  if (bare) return chart;

  // No mount-animation class here -- AgentDetails' wrapper owns the
  // pop in/out transition (toggled off evalMode, not just on mount).
  return (
    <Card className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 m-0">ASR latency comparison</h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-0">
            Per-turn latency across ASR models in evaluation mode. Live for this session only.
          </p>
        </div>
        <Badge tone="amber" dot>Evaluation mode</Badge>
      </div>
      {chart}
    </Card>
  );
}
