import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent, AGENT_STATUS } from "../context/AgentContext";
import { baseURL } from "../url";
import { downloadTranscript } from "../utils/transcriptExport";
import ThumbsButtons from "./ThumbsButtons";

/* ─────────────────────────── constants ─────────────────────────── */

const CALL_STATE = {
  IDLE: "idle",
  CONNECTING: "connecting", // socket may be open, but no audio has arrived yet
  ACTIVE: "active",         // connected + mic live -- "Listening" to the user
  THINKING: "thinking",     // connected + agent generating a reply (mic muted)
  SPEAKING: "speaking",     // connected + agent audio playing (mic muted)
  ENDING: "ending",
};

// Single source of truth for the call-status label shown across the
// header pill, footer status line, and launcher button -- previously each
// of those hardcoded its own text per callState (some phrased differently,
// none of them aware of a separate "is the agent thinking" flag that could be
// true at the same time as any of them), which is how the panel could show
// contradictory things at once (e.g. footer says "Listening" while the
// transcript shows a "Thinking…" bubble). THINKING is now a real state in
// the same enum as everything else instead of a second, independent
// boolean, so there is exactly one variable driving all of this.
const STATUS_LABEL = {
  [CALL_STATE.IDLE]: "Ready to connect",
  [CALL_STATE.CONNECTING]: "Connecting…",
  [CALL_STATE.ACTIVE]: "Listening",
  [CALL_STATE.THINKING]: "Thinking…",
  [CALL_STATE.SPEAKING]: "Agent speaking",
  [CALL_STATE.ENDING]: "Ending call…",
};

const TTS_SAMPLE_RATE = 24000; // must match backend TTS output sample rate
const ASR_SAMPLE_RATE = 16000; // must match backend ASR expected sample rate

/* ────────────────────── gapless audio playback ─────────────────── */

class AudioQueue {
  constructor() {
    this._ctx = null;
    this._queue = [];
    this._activeSources = [];
    this._nextStartTime = 0;
    this._pendingCount = 0;
    this._onEnd = null;
  }
  _getCtx() {
    if (!this._ctx || this._ctx.state === "closed") {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TTS_SAMPLE_RATE,
      });
      this._nextStartTime = 0;
    }
    return this._ctx;
  }
  enqueue(arrayBuffer, onDone) {
    this._queue.push({ arrayBuffer, onDone });
    this._drain();
  }
  // Fires once the queue is *actually* empty (nothing left playing, nothing
  // left queued) -- unlike per-chunk `onDone`, which now fires many times
  // per reply (real Gemini TTS streams a reply as hundreds of small PCM
  // chunks, not one per sentence), so callers using it for "agent stopped
  // talking" UI state flipped speaking/listening on every chunk boundary
  // instead of once per turn.
  setOnDrained(cb) {
    this._onEnd = cb;
  }
  async _drain() {
    while (this._queue.length) {
      const { arrayBuffer, onDone } = this._queue.shift();
      try {
        const ctx = this._getCtx();
        if (ctx.state === "suspended") await ctx.resume();

        const float32 = new Float32Array(arrayBuffer);
        const buffer = ctx.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
        buffer.copyToChannel(float32, 0);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);

        const isFirstChunk = this._nextStartTime === 0;
        const WARMUP_LEAD_IN = 1.00; // seconds — tune 0.15–0.35 if needed
        const startAt = isFirstChunk
          ? ctx.currentTime + WARMUP_LEAD_IN
          : Math.max(this._nextStartTime, ctx.currentTime);
        src.start(startAt);
        this._nextStartTime = startAt + buffer.duration;

        this._pendingCount++;
        this._activeSources.push(src);
        src.onended = () => {
          this._activeSources = this._activeSources.filter((s) => s !== src);
          onDone?.();
          this._pendingCount--;
          if (this._pendingCount === 0 && this._queue.length === 0) {
            this._onEnd?.();
          }
        };
      } catch (err) {
        console.error("Audio playback error:", err);
        onDone?.();
      }
    }
  }
  clear() {
    this._queue = [];
    this._pendingCount = 0;
    this._activeSources.forEach((src) => {
      try { src.onended = null; } catch { /* already stopped/disconnected */ }
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* already disconnected */ }
    });
    this._activeSources = [];
    if (this._ctx) {
      try { this._ctx.suspend(); } catch { /* already closed/suspended */ }
      this._nextStartTime = this._ctx.currentTime;
    }
  }
  async close() {
    this.clear();
    try { await this._ctx?.close(); } catch { /* already closed */ }
    this._ctx = null;
  }
}

function buildWsUrl(agent_id, evalMode = false) {
  const base = baseURL.replace(/^http/, "ws").replace(/\/$/, "") + `/orchestrate/configurable/agent/${agent_id}`;
  return evalMode ? `${base}?eval_mode=1` : base;
}

// getUserMedia failures -> something a person can act on, instead of the
// raw DOMException text ("Permission denied", "Requested device not found").
function micErrorMessage(err) {
  const name = err?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow the microphone for this site (the lock or mic icon in your browser's address bar), then start the call again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one and start the call again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is in use by another app or tab. Close it there and start the call again.";
  }
  return `Couldn't start the microphone${err?.message ? `: ${err.message}` : "."}`;
}

/* ──────────────────────────── icons ─────────────────────────────── */

function BotIcon({ className = "w-6 h-6", stroke = "white" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2.5" stroke={stroke} strokeWidth="1.6" />
      <rect x="7" y="8" width="2.4" height="2.4" rx=".5" fill={stroke} />
      <rect x="14.6" y="8" width="2.4" height="2.4" rx=".5" fill={stroke} />
      <path d="M9 13 Q12 14.8 15 13" stroke={stroke} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="2.2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="1.6" r=".8" fill={stroke} />
    </svg>
  );
}

function PhoneIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z" />
    </svg>
  );
}

function PhoneOffIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function MicIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 4.24 2.73M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M19 10v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function CloseIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SparkleIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4L12 2z" />
    </svg>
  );
}

/* ─────────────────────── small subcomponents ────────────────────── */

function WaveBars({ active, colorClass = "bg-white" }) {
  return (
    <div className="flex items-end gap-[3px] h-4">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${colorClass} ${active ? "animate-vaw" : ""}`}
          style={{ height: active ? undefined : 4, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

// `statusText`: what the agent is doing right now, shown next to the dots
// instead of leaving the user staring at a wait with no idea whether it's
// thinking, searching the knowledge base, or about to call a tool.
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// issue #74: evaluation-mode per-turn comparison -- each eval model's
// transcript + latency, primary marked. Only ever populated on a user
// bubble (msg.evalResults), since eval mode is ASR-only for now.
// ms is what the backend measures/stores (matches every other latency
// field in this codebase); shown here in seconds since sub-second
// precision to the millisecond isn't meaningful to a person reading it.
function fmtLatencySeconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function AsrEvalPanel({ results, onVote }) {
  return (
    <div className="mt-1.5 w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Model comparison</p>
      {results.map((r) => (
        // Stacked, not a single row -- the provider+model label got long
        // once the model name was added ("Vaani (SraVaani-1.0) · primary"),
        // and cramming that plus latency plus a full Devanagari transcript
        // into one flex row wrapped unevenly in this widget's narrow
        // column. Badge+latency share a header line; text gets its own
        // speech-bubble line below (matches TranscriptBubble's agent-side
        // treatment, so this reads as "what each model heard" rather than
        // as plain metadata text).
        <div key={r.provider} className="text-[12px]">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded-md font-semibold leading-tight ${r.is_primary ? "bg-amber-200 text-amber-900" : "bg-white text-slate-500 border border-amber-100"}`}>
              {r.provider}{r.model ? ` (${r.model})` : ""}{r.is_primary ? " · primary" : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="flex-shrink-0 text-slate-400 tabular-nums text-[11px]">{fmtLatencySeconds(r.latency_ms)}</span>
              {onVote && <ThumbsButtons feedback={r.feedback} onVote={(fb) => onVote(r.provider, fb)} />}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl rounded-tl-sm bg-white border border-amber-100 text-slate-700 leading-relaxed shadow-sm">
            {r.text || <em className="text-slate-400">no transcript</em>}
          </div>
        </div>
      ))}
    </div>
  );
}

// issue #58/#59: wider column + taller line-height (Devanagari needs more
// vertical room than the Latin default), repeated-avatar dedup on
// consecutive agent turns (via showAvatar), and a hover timestamp + copy
// button per turn.
function TranscriptBubble({ msg, statusText, showAvatar = true, onAsrFeedback }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg.text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable -- silently ignore, non-critical */
    }
  }

  return (
    <div className={`group flex w-full flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={`flex items-end gap-2 max-w-[92%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {!isUser && (
          <div className={`w-7 h-7 rounded-full flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-800 flex items-center justify-center shadow-sm ${showAvatar ? "" : "invisible"}`}>
            <BotIcon className="w-3.5 h-3.5" />
          </div>
        )}
        <div className="flex flex-col gap-1" style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
          <div
            className={[
              "px-4 py-2.5 text-[15px] rounded-2xl shadow-sm whitespace-pre-wrap break-words",
              isUser
                ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-md shadow-blue-600/20"
                : "bg-white text-slate-700 ring-1 ring-slate-900/5 rounded-bl-md",
            ].join(" ")}
            style={{ lineHeight: 1.75 }}
          >
            {msg.text || (
              <span className="inline-flex items-center gap-2 py-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-vdot" style={{ animationDelay: "0s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-vdot" style={{ animationDelay: ".15s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-vdot" style={{ animationDelay: ".3s" }} />
                </span>
                {statusText && <span className="text-[12px] text-slate-400">{statusText}</span>}
              </span>
            )}
          </div>
          {msg.text && (
            <div className="flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {msg.ts && <span className="text-[10px] text-slate-400 tabular-nums">{fmtTime(msg.ts)}</span>}
              <button
                onClick={handleCopy}
                className="text-[10px] text-slate-400 hover:text-blue-500"
                aria-label="Copy message"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
      {isUser && msg.evalResults && (
        <AsrEvalPanel
          results={msg.evalResults}
          onVote={onAsrFeedback ? (provider, fb) => onAsrFeedback(msg.turnId, provider, fb) : undefined}
        />
      )}
    </div>
  );
}

function SummaryCard({ text }) {
  return (
    <div className="mx-auto max-w-[92%] mt-2">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-center shadow-sm">
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <SparkleIcon className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] font-semibold tracking-wide uppercase text-blue-600">
            Call summary
          </span>
          <SparkleIcon className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────── main widget ───────────────────────── */

// `docked`: renders as a normal-flow block meant to sit in a page's own
// right-rail column (AgentDetails.jsx) instead of a fixed floating
// popdown -- the call panel used to float directly over that page's TTS
// config card, obscuring it, since it was position:fixed regardless of
// what page it was mounted on (issue #38). Docked mode skips the
// launcher pill entirely (the panel is always visible, nothing to pop
// open) and fills its container's height instead of capping at 90vh.
// `onLiveUpdate`: optional; called with {onCall, state, seconds, tokens, costUsd}
// (state = the CALL_STATE value: idle/connecting/active/thinking/speaking/ending)
// whenever the live call's duration or usage changes (AgentDetails' Call
// Stats section overlays it on the saved totals in real time).
// `agent`: the agent this widget talks to (AgentDetails passes its own
// page's agent). If it isn't the active agent, the launcher / Start call
// activates it first via AgentContext -- no separate "Start agent" step
// needed. Falls back to the context's activeAgent when omitted.
export default function VoiceAgentWidget({ agent, docked = false, evalMode: evalModeProp, onAsrEval, onLiveUpdate }) {
  const { activeAgent, isVerified, activateAgent, status: agentStatus } = useAgent();
  const navigate = useNavigate();
  const targetAgent = agent ?? activeAgent;
  const isThisActive = !!(activeAgent?.id && targetAgent?.id && String(activeAgent.id) === String(targetAgent.id));

  const [isOpen, setIsOpen] = useState(false);
  const [callState, setCallState] = useState(CALL_STATE.IDLE);
  const [messages, setMessages] = useState([]); // { id, role: 'user'|'agent', text, streaming, ts }
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [summary, setSummary] = useState("");
  // True while a tool call (e.g. RAG retrieval) is in flight -- lets the
  // typing bubble say "Searching..." instead of just "Thinking...", driven
  // by a lightweight status ping from the server (not spoken, purely UI).
  const [isSearching, setIsSearching] = useState(false);
  // Running token/cost counter for the call so far (issue #31) -- from the
  // server's real per-turn usage_metadata, not estimated client-side.
  // null until the first turn with usage actually lands (not every engine
  // reports it -- see the "usage" ws message handler below).
  const [usage, setUsage] = useState(null);
  // User-initiated mute (issue #61) -- distinct from the system muting the
  // mic during THINKING/SPEAKING: this is the user's own choice, persists
  // across those states, and needs its own control separate from End
  // Call (previously the only control on the call, so "how do I stop
  // talking without hanging up" had no answer).
  const [userMuted, setUserMuted] = useState(false);
  const userMutedRef = useRef(false);
  // Evaluation mode (issue #73) -- a call-time toggle, not a persisted
  // per-agent setting: when on, ?eval_mode=1 is appended to the WS URL at
  // connect, and the backend additionally runs every finalized user
  // utterance through other ASR models for comparison (see #72). Locked
  // once a call starts (see the IDLE-only control below) since changing
  // it mid-call would mean re-connecting.
  //
  // Controlled when a parent passes evalMode (docked mode, AgentDetails'
  // hero owns the toggle there, right under the Start/Stop button) --
  // uncontrolled fallback otherwise (the floating popup on /agents,
  // which has no hero to host it, so it keeps its own footer checkbox).
  const [evalModeState, setEvalModeState] = useState(false);
  const evalMode = evalModeProp !== undefined ? evalModeProp : evalModeState;
  // Activation of *this* agent requested from the launcher / Start call.
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  // Neutral (non-error) note shown in the status strip, e.g. why a call ended.
  const [notice, setNotice] = useState("");
  const launcherRef = useRef(null);
  const panelRef = useRef(null);
  const startBtnRef = useRef(null);

  const wsRef = useRef(null);
  const micRef = useRef(null);
  // True while startMic() is between calling getUserMedia() and actually
  // committing the resulting stream to micRef -- micRef.current stays null
  // for that whole (possibly slow: permission prompt, worklet load) window,
  // so a second concurrent startMic() call would pass the `if (micRef.current)
  // return` guard too and open a second, never-tracked stream that stopMic()
  // can never reach. This closes that window synchronously.
  const micStartingRef = useRef(false);
  const audioQueueRef = useRef(new AudioQueue());
  const scrollRef = useRef(null);
  const timerRef = useRef(null);
  const activeSpeaking = useRef(false);
  const endCallTimeoutRef = useRef(null);
  // startMic() (declared above endCall) needs to end the call when mic access
  // fails. Going through a ref, assigned in an effect below, avoids
  // referencing the endCall const before its declaration.
  const endCallRef = useRef(null);
  // True only once the first audio blob has been received from the server.
  // This is the single source of truth for "the call is actually connected" —
  // it gates both the mic being opened at all AND every outbound send.
  const isConnectedRef = useRef(false);
  // True from the moment the user hangs up until a new call starts.
  // endCall() resets isConnectedRef to false client-side immediately, but
  // the socket stays open a little longer for the server's farewell audio
  // to arrive -- handleWsMessage's `isFirstChunk = !isConnectedRef.current`
  // check reads that reset as "this is a new connection's first chunk" and
  // schedules startMic() to fire once the farewell finishes playing,
  // reopening the mic seconds after the user disconnected. This ref is
  // what actually distinguishes "ended" from "not yet connected".
  const callEndingRef = useRef(false);
  const currentAgentCardId = useRef(null);
  const currentUserCardId = useRef(null);
  // Agent reply text streams from the LLM in seconds, but its TTS audio
  // (DhVaani especially) can take tens of seconds per sentence. Buffer
  // agent text here and only reveal it once the matching audio chunk
  // actually starts playing, instead of showing it well ahead of the
  // voice. The user's own transcript (currentUserCardId) is unaffected --
  // it should still appear immediately.
  const pendingAgentTextRef = useRef("");
  const pendingAgentDoneRef = useRef(false);
  // handleWsMessage is a plain function re-declared every render, but
  // ws.onmessage binds to whichever instance existed at call-start and is
  // never reassigned -- so it closes over that render's callState forever
  // (always IDLE, since the call hasn't started yet at that point) and
  // can't read it directly. This mirrors "are we currently in THINKING"
  // into a ref, updated at every point that transitions callState into or
  // out of THINKING, purely so handleWsMessage's internal logic (deciding
  // whether to open a new agent card) can read the live value -- it is
  // NOT a second source of truth for anything rendered; every render
  // decision reads callState itself.
  const thinkingRef = useRef(false);

  /* auto-scroll transcript */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, summary, callState]);

  /* call timer — only ticks once actually connected. Reset to 0 happens
     in makeCall (an event handler) rather than here, so the effect never
     sets state synchronously. */
  useEffect(() => {
    if (callState === CALL_STATE.ACTIVE || callState === CALL_STATE.THINKING || callState === CALL_STATE.SPEAKING) {
      timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  /* ── mic capture (raw PCM via AudioWorklet, same as LiveCall) ──
   * Only ever called AFTER the first server audio blob has arrived, so no
   * mic permission is requested and no audio node exists while the call
   * is still in CONNECTING.
   */
  async function startMic() {
    if (micRef.current || micStartingRef.current) return;
    micStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // stopMic() may have run while the permission prompt/getUserMedia
      // call above was still pending (e.g. the user ended the call before
      // granting it) -- don't hand it a stream to leak, close this one and
      // walk away instead of committing it to micRef.
      if (!micStartingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: ASR_SAMPLE_RATE });
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");

      if (!micStartingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        try { audioCtx.close(); } catch { /* already closed */ }
        return;
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const pcmNode = new AudioWorkletNode(audioCtx, "pcm-processor");

      pcmNode.port.onmessage = (e) => {
        // Belt-and-suspenders: even though the mic is only opened post-
        // connect, never let a frame out unless we're actually connected,
        // the socket is open, and the agent isn't currently speaking.
        if (
          isConnectedRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN &&
          !activeSpeaking.current &&
          !userMutedRef.current
        ) {
          wsRef.current.send(e.data);
        }
      };

      source.connect(pcmNode);
      micRef.current = { audioCtx, stream, source, pcmNode };
    } catch (err) {
      setError(micErrorMessage(err));
      // Without a mic there's no point keeping the call open.
      endCallRef.current?.();
    } finally {
      micStartingRef.current = false;
    }
  }

  function stopMic() {
    // Cancels a startMic() call that's still mid-flight (see the checks
    // above) so it self-cleans instead of reopening the mic right after
    // this function tore it down.
    micStartingRef.current = false;

    const rec = micRef.current;
    if (rec) {
      try {
        rec.source.disconnect();
        console.log("[stopMic] source.disconnect() ok");
      } catch (e) { console.warn("[stopMic] source.disconnect() failed:", e); }

      try {
        rec.pcmNode.disconnect();
        console.log("[stopMic] pcmNode.disconnect() ok");
      } catch (e) { console.warn("[stopMic] pcmNode.disconnect() failed:", e); }

      try {
        rec.pcmNode.port.onmessage = null;
        console.log("[stopMic] pcmNode.port.onmessage cleared");
      } catch (e) { console.warn("[stopMic] clearing pcmNode.port.onmessage failed:", e); }

      // The one that actually matters for the OS/browser mic indicator --
      // readyState should read "ended" for every track right after this.
      rec.stream.getTracks().forEach((t) => {
        t.stop();
        console.log(`[stopMic] track ${t.kind} (${t.label || "unlabeled"}) readyState after stop():`, t.readyState);
      });

      try {
        rec.audioCtx.close();
        console.log("[stopMic] audioCtx.close() ok, state:", rec.audioCtx.state);
      } catch (e) { console.warn("[stopMic] audioCtx.close() failed:", e); }
    } else {
      console.log("[stopMic] called with no active mic (already stopped, or never started)");
    }
    micRef.current = null;
  }

  /* ── transcript helpers ── */
  const openCard = useCallback((role, turnId = null) => {
    const id = `m-${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text: "", streaming: true, ts: Date.now(), turnId }]);
    return id;
  }, []);

  const appendToCard = useCallback((id, token) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: m.text + token } : m)));
  }, []);

  const sealCard = useCallback((id) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)));
  }, []);

  function fallbackSummary(msgs) {
    if (!msgs.length) return "No conversation was recorded for this call.";
    const turns = msgs.length;
    const firstUser = msgs.find((m) => m.role === "user")?.text;
    const preview = firstUser ? `Started with: "${firstUser.slice(0, 80)}${firstUser.length > 80 ? "…" : ""}"` : "";
    return `${turns} message${turns === 1 ? "" : "s"} exchanged during the call. ${preview}`.trim();
  }

  /* ── websocket message handling ── */
  function handleWsMessage(event) {
    // Binary → audio playback
    if (event.data instanceof Blob) {
      const isFirstChunk = !isConnectedRef.current;
      if (isFirstChunk) {
        isConnectedRef.current = true;
        setStatusMsg("Connected — speak now");
      }

      activeSpeaking.current = true;
      setCallState((prev) => (prev === CALL_STATE.ENDING ? prev : CALL_STATE.SPEAKING));

      // Open the agent's card the moment its audio actually starts,
      // regardless of whether the transcript text has arrived yet --
      // the backend can now deliver a chunk's audio before sending the
      // "transcript" message for it (chunked TTS dispatches a chunk's
      // audio as soon as it's ready, independent of when the LLM's
      // full_text becomes available), so this can no longer assume text
      // is always buffered first. If it *is* already buffered, reveal it
      // now same as before; if not, the card opens empty and the
      // "transcript" message (whenever it arrives) fills it in via the
      // "already revealed" branch below instead of being buffered forever
      // with no future audio chunk left to trigger the reveal.
      //
      // Gated on thinkingRef so this only fires for an actual LLM
      // reply, not the call's opening greeting -- the greeting's audio
      // goes out via the same audio_out_queue but is never followed by a
      // "transcript" message or a done signal (it isn't generated through
      // run_llm at all), so opening a card for it left a permanently
      // empty, never-sealed bubble showing "..." from the moment the call
      // connected, before the user had said anything.
      if (thinkingRef.current && !currentAgentCardId.current) {
        currentAgentCardId.current = openCard("agent");
        if (pendingAgentTextRef.current) {
          appendToCard(currentAgentCardId.current, pendingAgentTextRef.current);
          pendingAgentTextRef.current = "";
        }
        if (pendingAgentDoneRef.current) {
          sealCard(currentAgentCardId.current);
          currentAgentCardId.current = null;
          pendingAgentDoneRef.current = false;
        }
      }
      thinkingRef.current = false;

      event.data.arrayBuffer().then((buf) => {
        audioQueueRef.current.enqueue(buf, () => {
          // speaking -> listening is handled by setOnDrained above (fires
          // once for the whole turn, not once per streamed chunk) -- this
          // per-chunk onDone is only for the first-chunk-of-the-call mic
          // kickoff below.
          //
          // Don't reopen the mic for a farewell chunk that arrives after
          // the user already hung up -- see callEndingRef's comment.
          if (isFirstChunk && !callEndingRef.current) void startMic();
        });
      });
      return;
    }

    let parsed = null;
    try { parsed = JSON.parse(event.data); } catch { /* non-JSON text is a valid raw token, handled below */ }

    if (parsed) {
      const { type, text, transcript, done, status, phase, summary: summaryText } = parsed;

      if (type === "status" || status) {
        // Only surface server status text while we're still connecting —
        // once live, the status strip is driven by call state instead.
        if (!isConnectedRef.current) setStatusMsg(text || status || "");
        // `phase` is separate from the connecting-only status text above --
        // it drives the typing bubble's label ("Searching..." vs
        // "Thinking...") for as long as the call is live, tool call or not.
        if (phase === "searching") setIsSearching(true);
        if (phase === "thinking") setIsSearching(false);
        return;
      }
      if (type === "error") {
        setError(text || "Server error");
        return;
      }

      if (type === "usage") {
        setUsage({ callTokens: parsed.call_tokens, estimatedCostUsd: parsed.estimated_cost_usd });
        return;
      }

      // Evaluation mode (issue #74) -- arrives some time after the user's
      // turn already rendered (other models run in parallel, not blocking
      // the real turn), so this finds the right bubble after the fact by
      // turnId rather than assuming it's the most recent message.
      if (type === "asr_eval") {
        const { turn_id, results } = parsed;
        setMessages((prev) => prev.map((m) => (m.turnId === turn_id ? { ...m, evalResults: results } : m)));
        onAsrEval?.({ turnId: turn_id, results });
        return;
      }

      if (type === "summary" || summaryText) {
        setSummary(summaryText || text || "");
        return;
      }

      if (type === "call_ended") {
        clearTimeout(endCallTimeoutRef.current);
        // Server closes the socket right after this; ws.onclose does final cleanup.
        return;
      }

      const isUserTurn = type === "user_transcript" || parsed.role === "user";

      const token = (isUserTurn ? transcript ?? text : type === "transcript" ? transcript ?? text : text ?? transcript) ?? "";
      const isDone = done === true || done === "true";

      if (isUserTurn) {
        if (!currentUserCardId.current) currentUserCardId.current = openCard("user", parsed.turn_id ?? null);
        if (token) appendToCard(currentUserCardId.current, token);
        if (isDone) {
          sealCard(currentUserCardId.current);
          currentUserCardId.current = null;
          // The user's turn just finished -- the agent starts working on a
          // reply from here, so show the typing indicator now rather than
          // waiting for the first LLM token.
          thinkingRef.current = true;
          setCallState((prev) => (prev === CALL_STATE.ENDING ? prev : CALL_STATE.THINKING));
          setIsSearching(false); // fresh turn -- don't inherit the last turn's tool-call state
        }
      } else if (currentAgentCardId.current) {
        // Already revealed for this turn (its audio has started) -- stream live.
        if (token) appendToCard(currentAgentCardId.current, token);
        if (isDone) { sealCard(currentAgentCardId.current); currentAgentCardId.current = null; }
      } else {
        // Not yet revealed -- buffer until the matching audio chunk starts.
        if (token) {
          // first token of a new reply
          if (!pendingAgentTextRef.current) {
            thinkingRef.current = true;
            setCallState((prev) => (prev === CALL_STATE.ENDING ? prev : CALL_STATE.THINKING));
          }
          pendingAgentTextRef.current += token;
        }
        if (isDone) pendingAgentDoneRef.current = true;
      }
      return;
    }

    // plain text token → treat as agent speech, same buffer-until-audio rule
    if (currentAgentCardId.current) {
      appendToCard(currentAgentCardId.current, event.data);
    } else {
      if (!pendingAgentTextRef.current) {
        thinkingRef.current = true;
        setCallState((prev) => (prev === CALL_STATE.ENDING ? prev : CALL_STATE.THINKING));
      }
      pendingAgentTextRef.current += event.data;
    }
  }

  // ws.onmessage goes through this ref so the socket always runs the
  // latest render's handler (it only touches refs, state setters and the
  // onAsrEval prop) without makeCall needing to change on every render.
  const handleWsMessageRef = useRef(null);
  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
  });

  /* ── make call ── */
  const makeCall = useCallback(async () => {
    if (callState !== CALL_STATE.IDLE) return;
    setError("");
    setNotice("");
    setCallSeconds(0);
    setMessages([]);
    setSummary("");
    setUsage(null);
    setUserMuted(false);
    userMutedRef.current = false;
    thinkingRef.current = false;
    currentAgentCardId.current = null;
    currentUserCardId.current = null;
    pendingAgentTextRef.current = "";
    pendingAgentDoneRef.current = false;
    isConnectedRef.current = false;
    callEndingRef.current = false;
    setCallState(CALL_STATE.CONNECTING);
    setStatusMsg("Connecting…");

    const ws = new WebSocket(buildWsUrl(targetAgent?.id, evalMode));
    ws.binaryType = "blob";
    wsRef.current = ws;
    ws.onopen = () => {
      // Socket transport is up, but we deliberately stay in CONNECTING —
      // and do NOT touch the mic — until the first audio blob arrives.
      setCallState(CALL_STATE.CONNECTING);
      setStatusMsg("Connecting…");
    };
    ws.onmessage = (event) => handleWsMessageRef.current?.(event);
    ws.onerror = (e) => {
      console.error("WebSocket error", e);
      setError("Connection error. Check that the server is reachable.");
    };
    ws.onclose = (e) => {
      clearTimeout(endCallTimeoutRef.current);
      stopMic();
      // audioQueueRef.current.clear();
      activeSpeaking.current = false;
      isConnectedRef.current = false;

      if (currentAgentCardId.current) { sealCard(currentAgentCardId.current); currentAgentCardId.current = null; }
      if (currentUserCardId.current) { sealCard(currentUserCardId.current); currentUserCardId.current = null; }

      setStatusMsg(e.code === 1000 || e.wasClean ? "Call ended" : `Disconnected (code ${e.code})`);
      // Keep an earlier, more specific error (e.g. mic blocked) visible.
      // 1008 = policy close from the server (e.g. account suspended) -- its
      // reason is the user-facing explanation.
      if (e.code === 1008 && e.reason) setError(e.reason);
      else if (!e.wasClean && e.code !== 1000) setError((prev) => prev || `The connection to the agent dropped (code ${e.code}). Start the call again to reconnect.`);
      setCallState(CALL_STATE.IDLE);
      thinkingRef.current = false;

      setMessages((prev) => {
        setSummary((s) => s || fallbackSummary(prev));
        return prev;
      });
    };
  }, [callState, targetAgent?.id, evalMode, sealCard]);

  
  const endCall = useCallback(() => {
    if (callState === CALL_STATE.IDLE || callState === CALL_STATE.ENDING) return;
    setCallState(CALL_STATE.ENDING);
    stopMic();                       // stop capturing immediately, client-side
    audioQueueRef.current.clear();   // stop playing anything queued
    activeSpeaking.current = false;
    isConnectedRef.current = false;  // pcmNode.onmessage guard already checks this too
    callEndingRef.current = true;    // block startMic() being re-armed by a farewell chunk still in flight

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setStatusMsg("Ending call…");
      wsRef.current.send(JSON.stringify({ type: "end_call" }));

      // Fallback: if the server never acks (crash, hang, network issue),
      // don't leave the UI stuck in ENDING forever.
      endCallTimeoutRef.current = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
          wsRef.current.close(1000, "Client timeout waiting for server ack");
        }
      }, 8000);
    } else {
      // Socket already gone for some reason — just force local cleanup.
      wsRef.current?.close(1000, "User ended call");
    }
  }, [callState]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // User-initiated mute toggle (issue #61) -- flips both the ref (read by
  // the mic-send gate, which can't wait for a re-render) and the state
  // (read by the button's own label/style).
  const toggleMute = useCallback(() => {
    setUserMuted((prev) => {
      const next = !prev;
      userMutedRef.current = next;
      return next;
    });
  }, []);

  // Live ASR eval-mode thumbs (issue: rating in chat) -- updates the
  // bubble immediately (optimistic), and if the call is still connected,
  // sends the vote over the same WebSocket so the backend can fold it
  // into eval_results_history in place (see the asr_eval_feedback
  // handler in main.py) before that turn's results ever get persisted
  // to CallHistory.asr_eval_results at call end. A call has no call_id
  // until after it's over, so this can't hit the post-call REST endpoint
  // -- going over the live connection instead means there's nothing to
  // reconcile afterward, the vote is just already in the row that gets
  // written.
  const handleAsrEvalFeedback = useCallback((turnId, provider, feedback) => {
    setMessages((prev) => prev.map((m) => (
      m.turnId === turnId
        ? { ...m, evalResults: m.evalResults.map((r) => (r.provider === provider ? { ...r, feedback } : r)) }
        : m
    )));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "asr_eval_feedback", turn_id: turnId, provider, feedback }));
    }
  }, []);

  /* cleanup on unmount */
  useEffect(() => {
    const audioQueue = audioQueueRef.current;
    return () => {
      stopMic();
      wsRef.current?.close();
      audioQueue.close();
      clearInterval(timerRef.current);
    };
  }, []);

  // Flip speaking -> listening once the audio queue is truly empty, not on
  // every individual chunk's onDone (see AudioQueue.setOnDrained's comment)
  // -- set once, the queue instance persists for the component's life.
  useEffect(() => {
    audioQueueRef.current.setOnDrained(() => {
      activeSpeaking.current = false;
      setCallState((prev) => {
        if (prev === CALL_STATE.ENDING) return prev; // don't resurrect from ENDING (e.g. farewell audio)
        return prev === CALL_STATE.SPEAKING ? CALL_STATE.ACTIVE : prev;
      });
    });
  }, []);

  const callDuration = useMemo(() => {
    const m = Math.floor(callSeconds / 60);
    const s = String(callSeconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [callSeconds]);

  const isLive = callState !== CALL_STATE.IDLE;
  const isOnCall = callState === CALL_STATE.ACTIVE || callState === CALL_STATE.THINKING || callState === CALL_STATE.SPEAKING;

  useEffect(() => {
    onLiveUpdate?.({
      onCall: isOnCall,
      state: callState,
      seconds: callSeconds,
      tokens: usage?.callTokens ?? 0,
      costUsd: usage?.estimatedCostUsd ?? null,
    });
  }, [onLiveUpdate, isOnCall, callState, callSeconds, usage]);
  // issue #25: the system also gates the mic (not sending PCM) while the
  // agent is thinking/speaking, independent of the user's own mute choice
  // -- kept as a derived read, not state, since it's fully determined by
  // callState + userMuted already in scope.
  const systemMuted = !userMuted && (callState === CALL_STATE.THINKING || callState === CALL_STATE.SPEAKING);
  const agentName = targetAgent?.name || "Voice Agent";
  // Activation in flight -- ours, or one started from the page's own
  // Start button for this same agent.
  const isActivating = activating || (!isThisActive && agentStatus === AGENT_STATUS.ACTIVATING);

  function handleCloseModal() {
    // don't allow closing mid-call by accident; end call first
    if (isLive) return;
    setIsOpen(false);
  }

  // Makes sure *this* agent is the active one (single active agent app-wide
  // -- activating it replaces whichever was active). activateAgent never
  // navigates (its navigate arg is unused), so the user stays on this page.
  // Resolves true once active, false on failure (message already set).
  const ensureActive = useCallback(async () => {
    if (isThisActive) return true;
    if (!targetAgent?.id) {
      setActivateError("No agent selected.");
      return false;
    }
    setActivating(true);
    setActivateError("");
    try {
      await activateAgent(targetAgent, navigate);
      return true;
    } catch (e) {
      setActivateError(`Couldn't start ${targetAgent.name || "this agent"}${e?.message ? `: ${e.message}` : "."} Check your connection and try again.`);
      return false;
    } finally {
      setActivating(false);
    }
  }, [isThisActive, targetAgent, activateAgent, navigate]);

  // Launcher: activate this agent first if needed, then open the panel.
  async function handleLauncherClick() {
    if (isActivating) return;
    if (!isThisActive) {
      const ok = await ensureActive();
      if (!ok) return;
    }
    setActivateError("");
    setIsOpen(true);
  }

  // In-panel Start call: re-activates if the agent was stopped meanwhile
  // (e.g. via the page's Stop button), then connects.
  async function handleStartCall() {
    if (callState !== CALL_STATE.IDLE || isActivating) return;
    if (!isThisActive) {
      const ok = await ensureActive();
      if (!ok) return;
    }
    makeCall();
  }

  // Agent stopped (banner Stop, another tab, status poll) while a call is
  // connecting/live: end the call cleanly -- mic off, audio cleared, socket
  // closed via the normal endCall path -- instead of leaving it dangling.
  // Deferred to a microtask so the effect body itself never sets state.
  const wasActiveRef = useRef(isThisActive);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isThisActive;
    if (wasActive && !isThisActive && isLive && callState !== CALL_STATE.ENDING) {
      queueMicrotask(() => {
        endCallRef.current?.();
        setNotice(`Call ended because ${agentName} was stopped.`);
      });
    }
  }, [isThisActive, isLive, callState, agentName]);

  // Focus: into the panel when it opens (Start call if idle), back to the
  // launcher when it closes.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (docked) return;
    if (isOpen && !wasOpenRef.current) {
      const raf = requestAnimationFrame(() => (startBtnRef.current || panelRef.current)?.focus());
      wasOpenRef.current = true;
      return () => cancelAnimationFrame(raf);
    }
    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      const raf = requestAnimationFrame(() => launcherRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, docked]);

  // Keyboard: Escape closes the panel when no call is running; Tab stays
  // inside the open panel (it's a modal dialog).
  useEffect(() => {
    if (docked || !isOpen) return;
    function onKey(e) {
      if (e.key === "Escape") {
        if (!isLive) { e.preventDefault(); setIsOpen(false); }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = [...panelRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, isLive, docked]);

  // Logged-out visitors never see the launcher or the modal at all.
  if (!isVerified) return null;

  const launcherLabel = isActivating
    ? `Starting ${agentName}…`
    : isOnCall
    ? `${STATUS_LABEL[callState]} · ${callDuration}`
    : callState === CALL_STATE.CONNECTING
    ? STATUS_LABEL[CALL_STATE.CONNECTING]
    : callState === CALL_STATE.ENDING
    ? STATUS_LABEL[CALL_STATE.ENDING]
    : `Talk to ${agentName}`;

  return (
    <>
      {/* local keyframes for the widget (wave bars, dots, ring pulses) */}
      <style>{`
        @keyframes vaw { 0%,100% { height: 4px; } 50% { height: 16px; } }
        .animate-vaw { animation: vaw 0.9s ease-in-out infinite; }
        @keyframes vdot { 0%,80%,100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
        .animate-vdot { animation: vdot 1.1s ease-in-out infinite; }
        @keyframes vring { 0% { transform: scale(.8); opacity: .6; } 100% { transform: scale(1.6); opacity: 0; } }
        .animate-vring { animation: vring 1.8s ease-out infinite; }
        @keyframes vhero { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .animate-vhero { background-size: 200% 200%; animation: vhero 8s ease infinite; }
        @keyframes vpop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-vpop { animation: vpop .25s ease both; }
        /* Launcher icon growing into the full call panel on click, instead
           of the panel just fading in at full size already. */
        @keyframes vgrow { from { opacity: 0; transform: scale(.15); } to { opacity: 1; transform: scale(1); } }
        .animate-vgrow { animation: vgrow .32s cubic-bezier(.2,.8,.3,1.1) both; }
      `}</style>

      {/* ── Top-right popdown -- the launcher pill stays its original
          compact size (not stretched to the panel's width) so opening it
          reads as that icon growing into the call panel, which takes over
          the full 50vw/full-height footprint only once it's open. ── */}
      <div
        className={
          docked
            ? "w-full h-full flex flex-col"
            : isOpen
            // Full-width/near-full-height on phones (small inset margin
            // instead of the desktop top-right gap) -- 50vw would be a
            // sliver on a ~375px screen.
            ? "fixed inset-3 z-50 flex flex-col sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[min(600px,calc(100vw-48px))] sm:h-[calc(100dvh-48px)]"
            // Closed: a compact launcher pill in the bottom-right corner,
            // clear of every page's hero (a full-width top-right bar used
            // to sit on top of AgentDetails' Overview card).
            : "fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-32px)]"
        }
      >
        {!docked && !isOpen && activateError && (
          <div role="alert" className="w-[min(340px,calc(100vw-32px))] rounded-2xl border border-red-200 bg-white shadow-lg shadow-slate-900/10 p-3.5 flex items-start gap-2.5 animate-vpop">
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="flex-1 text-[13px] leading-snug text-slate-700 m-0">{activateError}</p>
            <button
              type="button"
              onClick={() => setActivateError("")}
              aria-label="Dismiss error"
              className="w-6 h-6 -mt-0.5 -mr-0.5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex-shrink-0"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </div>
        )}
        {!docked && !isOpen && (
          <button
            ref={launcherRef}
            onClick={handleLauncherClick}
            type="button"
            aria-label={isActivating ? `Starting ${agentName}` : isLive ? `Open call with ${agentName}: ${launcherLabel}` : `Talk to ${agentName}`}
            aria-haspopup="dialog"
            aria-busy={isActivating || undefined}
            title={!isThisActive && !isActivating ? `Starts ${agentName} and opens a call panel` : undefined}
            className="group max-w-full flex items-center gap-3 rounded-full bg-white/95 backdrop-blur border border-blue-100 shadow-lg shadow-blue-900/15 pl-2 pr-4 sm:pr-5 py-2 hover:shadow-xl hover:-translate-y-0.5 hover:border-blue-300 transition-all disabled:cursor-wait"
          >
            <span className="relative flex-shrink-0">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                {isActivating ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
                ) : (
                  <BotIcon className="w-5 h-5" />
                )}
              </span>
              {/* Amber while starting/connecting, emerald once this agent
                  is running (solid on a call), slate when it will be
                  started on click. */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                  isActivating || callState === CALL_STATE.CONNECTING
                    ? "bg-amber-400"
                    : isThisActive
                    ? "bg-emerald-400"
                    : "bg-slate-300"
                }`}
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800 max-w-[52vw] sm:max-w-[280px]" aria-hidden="true">
              {launcherLabel}
            </span>
          </button>
        )}

      {/* ── Call panel: grows from the launcher icon's top-right corner up
          to its full 50vw/full-height size. ── */}
      {(docked || isOpen) && (
        <div
          className={
            docked
              ? "w-full flex-1 min-h-0 flex flex-col rounded-3xl overflow-hidden border border-blue-100 bg-white shadow-lg"
              : "w-full h-full flex flex-col rounded-[28px] overflow-hidden bg-white shadow-2xl shadow-blue-950/30 ring-1 ring-slate-900/5 animate-vgrow origin-bottom-right"
          }
          ref={panelRef}
          tabIndex={-1}
          role={docked ? undefined : "dialog"}
          aria-modal={docked ? undefined : true}
          aria-label={`Voice call with ${agentName}`}
        >
          {/* ── Hero ── issue #55: docked mode already sits inside the page's
              own blue hero (AgentDetails), so a second blue gradient here
              just fights it -- neutral white surface when docked, keep the
              gradient treatment only for the floating popdown. issue #57:
              once on a call the avatar + onboarding subtitle below collapse,
              so this whole block shrinks to make room for the transcript. */}
          <div
            className={
              docked
                ? `relative flex-shrink-0 text-center overflow-hidden bg-white border-b border-blue-100 transition-[padding] duration-300 ease-out ${isOnCall ? "px-6 pt-4 pb-3" : "px-6 pt-6 pb-5"}`
                : `relative flex-shrink-0 text-center overflow-hidden bg-gradient-to-br from-indigo-950 via-blue-800 to-sky-600 animate-vhero transition-[padding] duration-300 ease-out ${isOnCall ? "px-6 pt-4 pb-3" : "px-6 pt-8 pb-6"}`
            }
          >
            {!docked && (
              <>
                {/* Soft glow orbs behind the header content */}
                <div className="pointer-events-none absolute -top-12 -left-10 w-44 h-44 rounded-full bg-sky-400/30 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -right-8 w-48 h-48 rounded-full bg-indigo-400/30 blur-3xl" />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.12) 0%, transparent 60%)" }}
                />
              </>
            )}
            {messages.length > 0 && (
              <button
                onClick={() => downloadTranscript(
                  messages, `${agentName.replace(/\s+/g, "-")}-transcript-${Date.now()}.txt`,
                  { title: `${agentName} -- call transcript` },
                )}
                className={`absolute top-3 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${docked ? "right-3 bg-blue-50 text-blue-400 hover:bg-blue-100 hover:text-blue-600" : "right-12 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"}`}
                aria-label="Download transcript"
                title="Download transcript"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            {/* Nothing to close in docked mode -- it's a permanent rail,
                not a dismissable popover. */}
            {!docked && (
              <button
                onClick={handleCloseModal}
                disabled={isLive}
                className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={isLive ? "End the call before closing" : "Close call panel"}
                title={isLive ? "End the call before closing" : "Close (Esc)"}
              >
                <CloseIcon />
              </button>
            )}

            <div className="relative z-10 flex flex-col items-center">
              {/* issue #57: this avatar + the subtitle below it are
                  permanent onboarding copy -- useful before a call starts,
                  dead weight once connected. Collapse both and give the
                  freed space to the transcript. Animated via a grid-rows
                  trick (kept mounted, 1fr<->0fr) rather than conditional
                  unmount, so it eases instead of snapping instantly. */}
              <div className={`w-full grid transition-[grid-template-rows] duration-300 ease-out ${isOnCall ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
                <div className="overflow-hidden">
                  <div className={`relative mb-4 mt-1 mx-auto w-20 h-20 flex justify-center transition-opacity duration-200 ${isOnCall ? "opacity-0" : "opacity-100"}`}>
                    {!docked && (callState === CALL_STATE.IDLE || callState === CALL_STATE.CONNECTING) && (
                      <>
                        <span className="absolute inset-0 rounded-full border-2 border-white/30 animate-vring" />
                        <span className="absolute inset-0 rounded-full border-2 border-white/20 animate-vring" style={{ animationDelay: ".9s" }} />
                      </>
                    )}
                    <div className={`relative w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-sm ${docked ? "bg-blue-50 border border-blue-100" : "bg-gradient-to-br from-white/30 to-white/5 border border-white/30 shadow-lg shadow-blue-950/40"}`}>
                      {/* BotIcon's stroke/fill are literal SVG attrs, not
                          currentColor -- a text-* className does nothing to
                          it, which is exactly why this rendered white on
                          the light docked background and disappeared.
                          Passing stroke explicitly is what the component
                          actually reads. */}
                      <BotIcon className="w-9 h-9" stroke={docked ? "#3b82f6" : "white"} />
                    </div>
                    {callState === CALL_STATE.CONNECTING && (
                      <span className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-400 animate-pulse ${docked ? "border-2 border-white" : "border-2 border-blue-800"}`} />
                    )}
                  </div>
                </div>
              </div>

              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-2.5 ${docked ? "bg-blue-50 border border-blue-100" : "bg-white/10 border border-white/20"}`}>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    callState === CALL_STATE.IDLE
                      ? docked ? "bg-blue-300" : "bg-white/50"
                      : callState === CALL_STATE.CONNECTING
                      ? "bg-amber-300 shadow-[0_0_0_3px_rgba(252,211,77,.25)]"
                      : "bg-emerald-400 shadow-[0_0_0_3px_rgba(74,222,128,.25)]"
                  }`}
                />
                <span className={`text-[11px] font-medium tracking-wide ${docked ? "text-blue-600" : "text-white/90"}`}>
                  {/* Status word only, no duration here -- the footer below
                      is the single place the live call duration is shown. */}
                  {isActivating && callState === CALL_STATE.IDLE ? `Starting ${agentName}…` : STATUS_LABEL[callState]}
                </span>
              </div>

              <h2 className={`font-semibold leading-tight tracking-tight transition-all duration-300 ease-out ${isOnCall ? "text-base mb-0" : "text-2xl mb-1.5"} ${docked ? "text-slate-800" : "text-white"}`}>
                {agentName}
              </h2>
              <div className={`w-full grid transition-[grid-template-rows] duration-300 ease-out ${isOnCall ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
                <div className="overflow-hidden flex justify-center">
                  <p className={`text-[12.5px] max-w-[260px] leading-relaxed transition-opacity duration-200 ${isOnCall ? "opacity-0" : "opacity-100"} ${docked ? "text-slate-500" : "text-blue-100/80"}`}>
                    Start a live voice call — speak naturally and your agent will respond in real time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Body: transcript (scrollable) ── */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-3 bg-gradient-to-b from-slate-50 to-blue-50/50">
            {messages.length === 0 && !summary && callState !== CALL_STATE.CONNECTING && (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 py-10">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm ring-1 ring-blue-100 flex items-center justify-center">
                  <MicIcon className="w-6 h-6 text-blue-500" />
                </div>
                <p className="text-[14px] font-semibold text-slate-700">Ready when you are</p>
                <p className="text-[13px] text-slate-500 leading-relaxed -mt-1.5 max-w-[280px]">
                  {isThisActive
                    ? `Tap the green call button below to start talking with ${agentName}.`
                    : `${agentName} isn't running right now. Tap the green call button and it will be started first.`}
                </p>
              </div>
            )}

            {callState === CALL_STATE.CONNECTING && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 py-10">
                {/* Static icon, not another spinner -- the footer's cancel
                    button below already carries the one spinning indicator
                    for this state (and doubles as the actionable "give up
                    waiting" control), so this doesn't need its own. */}
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm ring-1 ring-amber-100 flex items-center justify-center">
                  <PhoneIcon className="w-6 h-6 text-amber-500" />
                </div>
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Waiting for {agentName} to join the call…
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <TranscriptBubble
                key={m.id}
                msg={m}
                showAvatar={m.role === "user" || messages[i - 1]?.role !== m.role}
                onAsrFeedback={handleAsrEvalFeedback}
              />
            ))}

            {callState === CALL_STATE.THINKING && (
              <TranscriptBubble
                msg={{ role: "agent", text: "" }}
                statusText={isSearching ? "Searching…" : STATUS_LABEL[CALL_STATE.THINKING]}
              />
            )}

            {summary && (callState === CALL_STATE.IDLE || callState === CALL_STATE.ENDING) && <SummaryCard text={summary} />}
          </div>

          {/* Token/cost counter (issue #31) -- real usage from the server,
              stays visible after the call ends too (like the summary), not
              just while live. */}
          {usage && (
            <div className="flex-shrink-0 px-4 py-1.5 border-t border-blue-100 bg-blue-50/40 flex items-center justify-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
              </svg>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {usage.callTokens.toLocaleString()} tokens
                {usage.estimatedCostUsd != null && ` · ~$${usage.estimatedCostUsd.toFixed(4)}`}
              </span>
            </div>
          )}

          {/* status / error strip -- issue #60: once on a call the footer
              below already carries one status line (WaveBars + label +
              duration); this strip duplicated it via statusMsg, so it's
              now shown only pre/post-call. Errors still surface here in
              any state -- they're not redundant with anything. */}
          {(error || activateError || notice || (statusMsg && !isOnCall)) && (
            <div className="flex-shrink-0 px-4 py-2.5 border-t border-blue-100 bg-white" aria-live="polite">
              {error || activateError ? (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-red-700 m-0">
                      {activateError && !error ? "Couldn't start the agent" : "Call problem"}
                    </p>
                    <p className="text-[12.5px] text-red-600 leading-snug mt-0.5 mb-0 break-words">{error || activateError}</p>
                    {callState === CALL_STATE.IDLE && (
                      <button
                        type="button"
                        onClick={() => { setError(""); setActivateError(""); handleStartCall(); }}
                        className="mt-1.5 text-[12.5px] font-semibold text-red-700 underline underline-offset-2 hover:text-red-800"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(""); setActivateError(""); }}
                    aria-label="Dismiss error"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-red-400 hover:bg-red-100 hover:text-red-700 flex-shrink-0"
                  >
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </div>
              ) : notice ? (
                <p className="text-[12.5px] text-amber-700 m-0">{notice}</p>
              ) : (
                <p className="text-[12px] text-slate-500 truncate m-0">{statusMsg}</p>
              )}
            </div>
          )}

          {/* ── Footer: call control -- issue #60/#61: one status line, one
              mic control (mute, distinct from the red End call), and the
              caption only where it's the sole informative text (idle /
              connecting / ending) instead of repeating a live-call state
              already shown by the line above it. ── */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2.5 px-5 pt-4 pb-5 border-t border-slate-100 bg-white">
            {isOnCall && (
              <div className="flex items-center gap-2 mb-0.5 rounded-full bg-blue-50 ring-1 ring-blue-100 px-3 py-1">
                <WaveBars active={callState === CALL_STATE.SPEAKING} colorClass="bg-blue-500" />
                <span className="text-[11.5px] font-semibold text-blue-600 tabular-nums">
                  {userMuted ? "Muted" : STATUS_LABEL[callState]} · {callDuration}
                </span>
              </div>
            )}

            {callState === CALL_STATE.IDLE && (
              <>
                {/* Evaluation mode (issue #73) -- locked to IDLE only,
                    since it's read once at WS connect on the backend
                    (see eval_mode in ochestrate_agent); toggling it
                    mid-call would need a reconnect to take effect.
                    Docked mode gets this from AgentDetails' hero instead
                    (right under Start/Stop) -- only shown here when
                    nothing else is controlling it. */}
                {evalModeProp === undefined && (
                  <label className="flex items-center gap-2 mb-1 text-[12px] text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={evalMode}
                      onChange={(e) => setEvalModeState(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    Evaluation mode: compare ASR models
                  </label>
                )}
                <span className="relative inline-flex">
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/40 animate-vring" />
                  <button
                    ref={startBtnRef}
                    type="button"
                    onClick={handleStartCall}
                    disabled={isActivating}
                    className="relative w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-100 hover:scale-105 active:scale-95 transition-transform disabled:cursor-wait disabled:hover:scale-100"
                    aria-label={isActivating ? `Starting ${agentName}` : isThisActive ? `Start call with ${agentName}` : `Start ${agentName} and call`}
                  >
                    {isActivating
                      ? <span className="w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
                      : <PhoneIcon className="w-7 h-7" />}
                  </button>
                </span>
              </>
            )}

            {/* CONNECTING is now cancellable — the wait for the first audio
                blob is server-dependent and could hang, so give the user an
                escape hatch instead of a dead spinner. Clicking it just runs
                the normal endCall() path. */}
            {callState === CALL_STATE.CONNECTING && (
              <button
                onClick={endCall}
                type="button"
                className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-100 ring-4 ring-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors group"
                aria-label="Cancel connecting"
              >
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 group-hover:border-t-red-400 animate-spin" />
              </button>
            )}

            {isOnCall && (
              <div className="flex items-start gap-8">
                {/* Mute (issue #25/#61): three distinct visual states, not
                    two -- the icon alone must say whether the mic is off
                    because the user chose that (amber, persists across
                    states) or because the system is briefly gating it while
                    the agent thinks/speaks (gray, temporary, no user action
                    involved). Same slash glyph would read as "broken mic"
                    either way if we didn't split the color/label. */}
                <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    userMuted
                      ? "bg-amber-400 text-white shadow-md shadow-amber-400/30"
                      : systemMuted
                      ? "bg-slate-100 text-slate-300"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  aria-label={
                    userMuted
                      ? "Unmute microphone"
                      : systemMuted
                      ? "Mute microphone (currently paused while agent responds)"
                      : "Mute microphone"
                  }
                  aria-pressed={userMuted}
                  title={systemMuted && !userMuted ? "Mic briefly paused while the agent responds" : undefined}
                >
                  {userMuted || systemMuted ? <MicOffIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
                </button>
                <span className="text-[11px] font-medium text-slate-500" aria-hidden="true">{userMuted ? "Unmute" : "Mute"}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={endCall}
                  className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-red-500/40 hover:scale-105 active:scale-95 transition-transform"
                  aria-label="End call"
                >
                  <PhoneOffIcon className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-medium text-slate-500" aria-hidden="true">End</span>
                </div>
              </div>
            )}

            {callState === CALL_STATE.ENDING && (
              <button type="button" disabled aria-label="Ending call" className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-100 ring-4 ring-slate-50 text-slate-400">
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-red-400 animate-spin" />
              </button>
            )}

            {!isOnCall && (
              <p className="text-[12px] text-slate-500 text-center m-0">
                {callState === CALL_STATE.IDLE && (isActivating ? `Starting ${agentName}…` : "Your microphone will activate once the agent joins.")}
                {callState === CALL_STATE.CONNECTING && "Waiting for the agent — mic is off until connected."}
                {callState === CALL_STATE.ENDING && "Closing connection…"}
              </p>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}