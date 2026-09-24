import { useState } from "react";
import { Badge } from "./ui";

// One agent as a card: name + created date, its ASR/LLM/TTS pipeline, an
// Active badge, and Activate/Deactivate. The whole card opens the agent
// (a stretched <button> covers it, so it's one real, keyboard-focusable
// control rather than a clickable div); the Activate/Deactivate button sits
// above that overlay so it stays independently clickable.
export default function AgentCard({ agent, isActive = false, onClick, onActivate, onDeactivate }) {
  const [activateState, setActivateState] = useState("idle"); // idle | loading | success | error
  // Which action the current loading/success/error state belongs to. While
  // idle the button follows isActive (active -> Deactivate, else Activate);
  // once clicked it sticks to that action until the feedback finishes, so
  // "Activated" doesn't flip to "Deactivate" mid-animation.
  const [pendingAction, setPendingAction] = useState("activate");
  const action = activateState === "idle" ? (isActive ? "deactivate" : "activate") : pendingAction;
  const handler = action === "deactivate" ? onDeactivate : onActivate;
  const showButton = Boolean(handler) || activateState !== "idle";
  const name = agent.name || "Unnamed agent";
  const justActivated = activateState === "success" && pendingAction === "activate";

  const handleAction = async (e) => {
    e.stopPropagation(); // don't trigger the card's open action (navigation)
    if (activateState === "loading") return;

    setPendingAction(action);
    setActivateState("loading");
    try {
      await handler?.(agent);
      setActivateState("success");
      setTimeout(() => setActivateState("idle"), 1800);
    } catch {
      setActivateState("error");
      setTimeout(() => setActivateState("idle"), 1800);
    }
  };

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border p-4 shadow-sm transition overflow-hidden ${
        isActive
          ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-400/30"
          : "border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-md"
      } ${justActivated ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
    >
      {/* Scoped keyframes for this component's animations */}
      <style>{`
        @keyframes agentCardPopIn {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes agentCardFadeOut {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .agent-card-pop-in {
          animation: agentCardPopIn 0.35s ease-out;
        }
        .agent-card-fade-out {
          animation: agentCardFadeOut 1.8s ease-out forwards;
        }
      `}</style>

      {/* Success sweep overlay */}
      {justActivated && (
        <div className="absolute inset-0 bg-emerald-400/10 agent-card-fade-out pointer-events-none" aria-hidden="true" />
      )}

      {/* Header row */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold transition-colors ${
            isActive ? "bg-blue-600" : "bg-slate-800 group-hover:bg-blue-600"
          }`}
          aria-hidden="true"
        >
          {name[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          {/* Stretched link: its ::after covers the whole card. */}
          <button
            type="button"
            onClick={onClick}
            className="block max-w-full text-left text-base font-semibold text-slate-900 leading-tight truncate focus-visible:outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-blue-600 focus-visible:after:ring-inset"
            title={name}
          >
            {name}
            <span className="sr-only"> — open agent details</span>
          </button>
          <p className="text-xs text-slate-500 mt-1 truncate">Created {formatLocalDateTime(agent.createdAt)}</p>
        </div>
        {isActive && (
          <Badge tone="green" dot pulse className="flex-shrink-0">Active</Badge>
        )}
      </div>

      {/* Pipeline */}
      <dl className={`flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 ${showButton ? "mb-4" : ""}`}>
        <ModelRow icon="mic" label="ASR" value={agent.asrModel} color="text-blue-600" />
        <ModelRow icon="brain" label="LLM" value={agent.llmModel} color="text-emerald-600" />
        <ModelRow icon="volume" label="TTS" value={agent.ttsModel} color="text-violet-600" />
      </dl>

      {/* Activate / Deactivate -- whichever applies to this agent right now */}
      {showButton && (
        <div className="relative z-10 mt-auto">
          <AgentActionButton action={action} state={activateState} onClick={handleAction} agentName={name} />
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}

// Activate is the primary action (solid brand blue); Deactivate is a
// quieter outlined rose button so it reads as "stop" without shouting on
// every active card.
const ACTION_BUTTON = {
  activate: {
    idle: "bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:-translate-y-px",
    loading: "bg-blue-600 text-white cursor-wait",
    success: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20",
    error: "bg-red-600 text-white",
    labels: { idle: "Activate", loading: "Activating…", success: "Activated", error: "Failed — retry" },
    icon: <PlayIcon />,
    ping: "bg-blue-400/40",
  },
  deactivate: {
    idle: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:-translate-y-px",
    loading: "bg-rose-50 text-rose-600 border border-rose-200 cursor-wait",
    success: "bg-slate-100 text-slate-600 border border-slate-200",
    error: "bg-red-600 text-white",
    labels: { idle: "Deactivate", loading: "Deactivating…", success: "Deactivated", error: "Failed — retry" },
    icon: <StopIcon />,
    ping: "bg-rose-300/40",
  },
};

function AgentActionButton({ action, state, onClick, agentName }) {
  const cfg = ACTION_BUTTON[action];
  const base = "relative w-full h-10 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 overflow-hidden";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "loading"}
      aria-label={state === "idle" ? `${cfg.labels.idle} ${agentName}` : undefined}
      className={`${base} ${cfg[state]}`}
    >
      {/* Pulsing ring while loading */}
      {state === "loading" && (
        <span className={`absolute inset-0 rounded-xl animate-ping ${cfg.ping}`} aria-hidden="true" />
      )}

      <span className="relative flex items-center gap-2" aria-live="polite">
        {state === "idle" && cfg.icon}
        {state === "loading" && <Spinner />}
        {state === "success" && (
          <svg className="agent-card-pop-in" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {state === "error" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        {cfg.labels[state]}
      </span>
    </button>
  );
}

/**
 * Formats a UTC timestamp (as produced by Python's datetime.utcnow(), which
 * has no timezone suffix) as a short local date/time, e.g. "23 Sep 2026, 14:05".
 */
function formatLocalDateTime(createdAt) {
  if (!createdAt) return "just now";

  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(createdAt);
  const isoString = hasTimezone ? createdAt : `${createdAt}Z`;

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "just now";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MODEL_ICONS = {
  mic: (
    <>
      <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>
  ),
  brain: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2.5" />
      <path d="M7 8h2M11 8h6M7 12h4M13 12h4" />
    </>
  ),
  volume: (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </>
  ),
};

function ModelRow({ icon, label, value, color }) {
  const shown = value ?? "—";
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs min-w-0">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`flex-shrink-0 ${color}`} aria-hidden="true">
        {MODEL_ICONS[icon]}
      </svg>
      <dt className="font-semibold text-slate-500 w-8 flex-shrink-0">{label}</dt>
      <dd className="text-slate-800 font-medium truncate ml-auto text-right" title={String(shown)}>{shown}</dd>
    </div>
  );
}
