import { useEffect, useRef, useState } from "react";

const FONT = "'Inter', sans-serif";

// Axis/grid colors (Tailwind slate) -- ticks at slate-500 so they stay
// readable (the old slate-400 at 9.5px was below comfortable contrast).
const AXIS_TEXT = "#64748b";
const AXIS_TITLE = "#475569";
const GRID = "#e2e8f0";
const BASELINE = "#cbd5e1";

/* Hand-rolled SVG instead of pulling in a charting library -- these are
 * small multi-series line charts (per-call, or a recent-turns overview),
 * not a data-viz-heavy page, and the bundle is already flagged as
 * oversized in the build output. Shared by CallHistorySection's per-call
 * expanded view and AsrLatencyComparisonChart's page-level eval-mode
 * trend (via the `series` prop, for a per-provider instead of
 * per-pipeline-stage breakdown). */
// Brand blue-600 goes to the headline number (overall speech-end -> first
// audio); the three pipeline stages get distinct, clearly separable hues.
const LATENCY_SERIES = [
  { key: "e2e_ms", label: "Overall (speech end → first audio)", color: "#2563eb" },
  { key: "asr_ms", label: "ASR final", color: "#d97706" },
  { key: "llm_ttft_ms", label: "LLM TTFT", color: "#7c3aed" },
  { key: "tts_ttfb_ms", label: "TTS TTFB", color: "#059669" },
];

// Rounds the y-axis max up to a "nice" value (1, 2, 2.5, 5 x 10^n per
// step) so tick labels read 0 / 250 / 500 ... instead of 0 / 237 / 474.
function niceScale(maxValue, steps) {
  if (!(maxValue > 0)) return { max: 100, step: 25 };
  const raw = maxValue / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  return { max: step * steps, step };
}

function fmtTick(v) {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  return Math.round(v).toLocaleString();
}

/**
 * @param {Array<object>} points - one entry per x-axis position, each with
 *   whatever LATENCY_SERIES keys it has a value for (missing/null keys are
 *   fine, that series just skips the gap instead of interpolating a number
 *   that was never measured).
 * @param {(p: object) => string} xLabel - label under each point.
 * @param {string} [xAxisLabel] - what the x-axis positions mean (e.g.
 *   "Turn" for one call, "Call . Turn" across several) -- callers differ
 *   here, so there's no one sensible default.
 * @param {(p: object, i: number) => void} [onPointClick] - optional, makes
 *   points clickable (e.g. jump to that call in the table below).
 * @param {Array<{key: string, label: string, color: string}>} [series] -
 *   defaults to the fixed pipeline-stage breakdown (LATENCY_SERIES) that
 *   CallHistorySection/AgentLatencyOverview use -- pass a different series
 *   list (e.g. one entry per ASR provider) to chart something else with
 *   the same axes/legend/gap-skipping behavior.
 * @param {string} [emptyMessage] - shown instead of an empty plot when no
 *   point has a value for any series.
 */
export default function LatencyLineChart({
  points = [],
  xLabel,
  xAxisLabel,
  onPointClick,
  series = LATENCY_SERIES,
  emptyMessage = "No latency measurements yet.",
}) {
  // Stretching this to fill its container by scaling the whole viewBox
  // (width: 100% against a fixed viewBox) scales stroke width, dot
  // radius, and font size right along with it. Instead, measure the
  // actual rendered width and set the SVG's width/viewBox to that exact
  // pixel value: 1 viewBox unit is then always 1 real pixel, so only the
  // x-axis spacing grows with the container. Below MIN_W the SVG keeps
  // MIN_W and scrolls inside its own container -- never the page.
  const MIN_W = 360;
  const n = points.length;
  const allValues = points.flatMap(p => series.map(s => p[s.key]).filter(v => v != null));
  const hasData = allValues.length > 0;

  const containerRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(640);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const initial = el.getBoundingClientRect().width;
    if (initial) setMeasuredWidth(Math.max(MIN_W, Math.round(initial)));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setMeasuredWidth(Math.max(MIN_W, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Re-attach when switching between the empty state and the chart --
    // the ref points at a different element in each.
  }, [hasData]);

  if (!hasData) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500"
        style={{ fontFamily: FONT }}
      >
        {emptyMessage}
      </div>
    );
  }

  const H = 248, padL = 56, padR = 16, padT = 14, padB = 46;
  const W = measuredWidth;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const gridSteps = 4;
  const { max: maxVal, step } = niceScale(Math.max(...allValues) * 1.05, gridSteps);

  const x = i => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = v => padT + plotH - (v / maxVal) * plotH;

  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => ({ val: step * i, yPos: y(step * i) }));

  // Thin out x tick labels so they never overlap (~48px per label).
  const labelEvery = Math.max(1, Math.ceil((n * 48) / Math.max(plotW, 1)));

  const describedSeries = series.filter(s => points.some(p => p[s.key] != null)).map(s => s.label).join(", ");

  return (
    <div className="w-full min-w-0" style={{ fontFamily: FONT }}>
      <div ref={containerRef} className="w-full overflow-x-auto">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block" }}
          role="img"
          aria-label={`Latency in milliseconds per ${xAxisLabel ? xAxisLabel.toLowerCase() : "point"}, ${n} ${n === 1 ? "point" : "points"}: ${describedSeries}`}
        >
          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={g.yPos} y2={g.yPos} stroke={i === 0 ? BASELINE : GRID} strokeWidth="1" />
              <text x={padL - 8} y={g.yPos + 3.5} textAnchor="end" fontSize="11" fill={AXIS_TEXT} fontFamily={FONT} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtTick(g.val)}
              </text>
            </g>
          ))}
          {/* Y-axis title, rotated -- what the numbers on the left mean. */}
          <text
            x={0} y={0} fontSize="11" fontWeight="600" fill={AXIS_TITLE} fontFamily={FONT}
            textAnchor="middle"
            transform={`translate(${13}, ${padT + plotH / 2}) rotate(-90)`}
          >
            Latency (ms)
          </text>

          {points.map((p, i) => (
            // Always label the last point; label every `labelEvery`-th
            // point otherwise, skipping one that would crowd the last.
            i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery) ? (
              <text key={i} x={x(i)} y={H - padB + 17} textAnchor="middle" fontSize="11" fill={AXIS_TEXT} fontFamily={FONT}>
                {xLabel(p, i)}
              </text>
            ) : null
          ))}

          {/* X-axis title -- what those tick labels above are counting. */}
          {xAxisLabel && (
            <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={AXIS_TITLE} fontFamily={FONT}>
              {xAxisLabel}
            </text>
          )}

          {series.map(s => {
            // Only connect points that actually have a value for this
            // series -- some points genuinely have no measurement (e.g.
            // asr_ms for a cloud ASR provider, tts_ttfb_ms for a non-Gemini
            // TTS engine), and a straight line across a gap would imply a
            // number that was never measured.
            const pts = points
              .map((p, i) => (p[s.key] != null ? { x: x(i), y: y(p[s.key]), i, v: p[s.key] } : null))
              .filter(Boolean);
            if (pts.length === 0) return null;
            return (
              <g key={s.key}>
                <polyline
                  points={pts.map(p => `${p.x},${p.y}`).join(" ")}
                  fill="none" stroke={s.color} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {pts.map(p => (
                  <circle
                    key={p.i} cx={p.x} cy={p.y} r={onPointClick ? 4 : 3} fill={s.color}
                    stroke="#fff" strokeWidth="1.5"
                    style={onPointClick ? { cursor: "pointer" } : undefined}
                    onClick={onPointClick ? () => onPointClick(points[p.i], p.i) : undefined}
                  >
                    <title>{`${s.label} · ${xLabel(points[p.i], p.i)}: ${Math.round(p.v).toLocaleString()} ms`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-3 pl-1 sm:pl-14 list-none" aria-label="Legend">
        {series.map(s => (
          <li key={s.key} className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-3 h-[3px] rounded-full flex-shrink-0" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-xs text-slate-600">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
