import { useEffect, useRef, useState } from "react";

// Start/Stop button in an agent's banner (AgentDetails). While a call is
// live it also shows what the agent is doing: listening (waveform flows
// into the button), thinking (an arc circles it), speaking (waveform flows
// out). Styles live in styles/agentDetailStyle.jsx (DETAIL_CSS), which
// AgentDetails injects.

// Waveform stretching from the button out across the banner, drawn BEHIND
// the banner's other content (negative z-index) so it never covers the
// name or Overview card. `direction` "in": the pulse starts at the far end
// and travels toward the button (listening); "out": starts at the button
// and travels away (agent speaking). Bars stay put -- the travelling peak
// comes from each bar's staggered animation delay.
const WAVE_BARS = 40;
// Organic, uneven heights that grow toward the button (index 0 = far end).
const WAVE_HEIGHTS = Array.from({ length: WAVE_BARS }, (_, i) => {
  const t = i / (WAVE_BARS - 1);
  const envelope = 0.3 + 0.7 * t;
  const ripple = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37));
  return Math.round(46 * envelope * ripple + 6);
});

function WaveSide({ side, direction }) {
  const left = side === "left";
  return (
    <div
      className={`hidden sm:flex absolute top-1/2 -translate-y-1/2 -z-10 items-center justify-between pointer-events-none w-[min(42vw,620px)] ${
        left ? "right-full mr-1 flex-row" : "left-full ml-1 flex-row-reverse"
      }`}
      style={{
        // Fade out toward the far end so the wave dissolves into the banner.
        // Bright only near the button, faint (~30%) where it passes under
        // the agent name / Overview card so text stays readable.
        WebkitMaskImage: `linear-gradient(to ${left ? "right" : "left"}, transparent 0%, rgba(0,0,0,.3) 30%, rgba(0,0,0,.35) 60%, #000 92%)`,
        maskImage: `linear-gradient(to ${left ? "right" : "left"}, transparent 0%, rgba(0,0,0,.3) 30%, rgba(0,0,0,.35) 60%, #000 92%)`,
      }}
      aria-hidden="true"
    >
      {WAVE_HEIGHTS.map((h, i) => {
        const step = direction === "in" ? i : WAVE_BARS - 1 - i;
        return (
          <span
            key={i}
            className="agent-detail-eq-bar agent-detail-eq-bar-wide flex-shrink-0"
            style={{ height: h, animationDelay: `${(step * 0.045).toFixed(3)}s` }}
          />
        );
      })}
    </div>
  );
}

const CALL_PHASE_LABEL = {
  connecting: "Connecting…",
  active: "Listening…",
  thinking: "Thinking…",
  speaking: "Agent speaking…",
};

// `callState`: the live call's state from the call panel (idle / connecting
// / active (= listening) / thinking / speaking / ending), or null.
export default function EngineButton({ onLaunch, onStop, isActive, callState = null }) {
  // `isActive` (AgentContext, the source of truth) drives idle/success
  // directly; `launching` only tracks this button's own in-flight request.
  const [launching, setLaunching] = useState(false);
  // Stop needs two clicks within 4s (issue #37): the first arms a confirm.
  const [confirmingStop, setConfirmingStop] = useState(false);
  const confirmTimeoutRef = useRef(null);
  const state = launching ? "running" : isActive ? "success" : "idle";

  useEffect(() => () => clearTimeout(confirmTimeoutRef.current), []);

  async function handleClick() {
    if (state === "idle") {
      setLaunching(true);
      try {
        await onLaunch();
      } catch {
        // activateAgent already shows a banner on failure.
      } finally {
        setLaunching(false);
      }
    } else if (state === "success") {
      if (confirmingStop) {
        clearTimeout(confirmTimeoutRef.current);
        setConfirmingStop(false);
        onStop();
      } else {
        setConfirmingStop(true);
        confirmTimeoutRef.current = setTimeout(() => setConfirmingStop(false), 4000);
      }
    }
  }

  const btnClass = `agent-detail-engine-btn agent-detail-engine-btn-${state}${confirmingStop ? " agent-detail-engine-btn-confirm" : ""}`;
  const label = state === "running" ? "Starting…"
    : state === "success" ? (confirmingStop ? "Click again to stop" : "Stop agent")
    : "Start agent";
  // While a call is live the caption shows what the agent is doing; the
  // button itself is still Stop (aria-label/title keep that).
  const phase = state === "success" && !confirmingStop ? callState : null;
  const caption = CALL_PHASE_LABEL[phase] ?? label;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center w-[100px] h-[100px]">
        {state === "running" && <div className="agent-detail-comet-ring" />}
        {phase === "connecting" && <span className="agent-detail-breathe" aria-hidden="true" />}
        {phase === "active" && (
          <>
            <WaveSide side="left" direction="in" />
            <WaveSide side="right" direction="in" />
            <span className="agent-detail-ring agent-detail-ring-in" aria-hidden="true" />
            <span className="agent-detail-ring agent-detail-ring-in" style={{ animationDelay: ".8s" }} aria-hidden="true" />
          </>
        )}
        {phase === "thinking" && (
          <>
            <span className="agent-detail-think-ring" aria-hidden="true" />
            <span className="agent-detail-orbit-dot" aria-hidden="true" />
          </>
        )}
        {phase === "speaking" && (
          <>
            <WaveSide side="left" direction="out" />
            <WaveSide side="right" direction="out" />
            <span className="agent-detail-ring agent-detail-ring-out" aria-hidden="true" />
            <span className="agent-detail-ring agent-detail-ring-out" style={{ animationDelay: ".55s" }} aria-hidden="true" />
            <span className="agent-detail-ring agent-detail-ring-out" style={{ animationDelay: "1.1s" }} aria-hidden="true" />
          </>
        )}
        <button
          type="button"
          className={btnClass}
          disabled={state === "running"}
          onClick={handleClick}
          aria-label={label}
          title={label}
        >
          {state === "idle" && (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="none" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))" }} aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {state === "running" && (
            <span className="flex gap-1.5 items-center" aria-hidden="true">
              <span className="agent-detail-dot1" /><span className="agent-detail-dot2" /><span className="agent-detail-dot3" />
            </span>
          )}
          {state === "success" && (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="none" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))" }} aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          )}
        </button>
      </div>
      <span key={caption} className="agent-detail-label-fade text-[13.5px] font-medium text-white/90" aria-live="polite">{caption}</span>
    </div>
  );
}

