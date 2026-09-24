import { useState, useEffect, useRef, useCallback } from "react";
import { keyframes } from "../styles/keyframes";
import { useAgent } from "../context/AgentContext";
import { baseURL } from "../url";

// ─── State machine ────────────────────────────────────────────────────────────
const STATE = {
  IDLE:       "idle",
  RECORDING:  "recording",
  PROCESSING: "processing",
  RESPONSE:   "response",   // text response received / streaming
};

// ─── Wave bars (shared visual) ────────────────────────────────────────────────
function WaveBars({ color = "#3b82f6", small = false }) {
  const h  = small ? 20 : 36;
  const bh = small ? 16 : 32;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: small ? 3 : 4, height: h }}>
      {["wave-1", "wave-2", "wave-3", "wave-4", "wave-5"].map((cls, i) => (
        <div
          key={i}
          className={cls}
          style={{ width: small ? 3 : 4, height: bh, background: color, borderRadius: 2, transformOrigin: "bottom" }}
        />
      ))}
    </div>
  );
}

// ─── Idle display ─────────────────────────────────────────────────────────────
function IdleCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div className="idle-float" style={{ color: "#93c5fd" }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" strokeLinecap="round">
          {/* mic icon inside a speech-bubble shape */}
          <path
            d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"
            fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.3"
          />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#3b82f6" strokeWidth="1.3" />
          <line x1="12" y1="19" x2="12" y2="23" stroke="#3b82f6" strokeWidth="1.3" />
          <line x1="8"  y1="23" x2="16" y2="23" stroke="#3b82f6" strokeWidth="1.3" />
          {/* small text lines hinting at text output */}
          <line x1="3" y1="6" x2="6" y2="6"   stroke="#bfdbfe" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="3" y1="9" x2="6" y2="9"   stroke="#bfdbfe" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="3" y1="12" x2="6" y2="12" stroke="#bfdbfe" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
      <p style={{ fontSize: 16, color: "#64748b", fontWeight: 400 }}>Ready to listen</p>
      <p style={{ fontSize: 13, color: "#94a3b8" }}>Speak your prompt — get a text reply</p>
    </div>
  );
}

// ─── Recording display ────────────────────────────────────────────────────────
function RecordingCenter({ seconds }) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <WaveBars color="#3b82f6" />
      <p style={{
        fontSize: 26, fontWeight: 600, color: "#1e40af",
        letterSpacing: ".04em", fontVariantNumeric: "tabular-nums",
      }}>
        {m}:{s}
      </p>
      <p style={{ fontSize: 13, color: "#64748b" }}>Listening… tap mic to send</p>
    </div>
  );
}

// ─── Processing display ───────────────────────────────────────────────────────
function ProcessingCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 52, height: 52 }}>
        <div
          className="spin-anim"
          style={{
            width: 52, height: 52, borderRadius: "50%",
            border: "2.5px solid #dbeafe", borderTopColor: "#3b82f6",
            position: "absolute",
          }}
        />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3b82f6", opacity: .5 }} />
        </div>
      </div>
      <p style={{ fontSize: 15, color: "#64748b" }}>Transcribing &amp; thinking…</p>
    </div>
  );
}

// ─── Bot avatar (matches TextInputOutput style) ───────────────────────────────
function BotAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 8px rgba(59,130,246,.3)",
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="13" rx="2.5" stroke="white" strokeWidth="1.6" />
        <rect x="7"    y="8" width="2.4" height="2.4" rx=".5" fill="white" />
        <rect x="14.6" y="8" width="2.4" height="2.4" rx=".5" fill="white" />
        <path d="M9 13 Q12 14.8 15 13" stroke="white" strokeWidth="1.3" fill="none" />
        <line x1="12" y1="4" x2="12" y2="2.2" stroke="white" strokeWidth="1.5" />
        <circle cx="12" cy="1.6" r=".8" fill="white" />
      </svg>
    </div>
  );
}

// ─── Thinking dots ────────────────────────────────────────────────────────────
function ThinkingDots() {
  const dotStyle = (delay) => ({
    width: 7, height: 7, borderRadius: "50%", background: "#93c5fd",
    display: "inline-block",
    animation: `vtt-dot .9s ease-in-out ${delay} infinite`,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
      <span style={dotStyle("0s")} />
      <span style={dotStyle(".18s")} />
      <span style={dotStyle(".36s")} />
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      onClick={copy}
      title="Copy response"
      style={{
        background: "none", border: "1px solid #e2e8f0",
        borderRadius: 6, padding: "3px 9px", cursor: "pointer",
        fontSize: 11.5, color: copied ? "#16a34a" : "#94a3b8",
        fontFamily: "'Inter', sans-serif",
        display: "inline-flex", alignItems: "center", gap: 4,
        transition: "color .15s, border-color .15s",
      }}
      onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = "#3b82f6"; e.currentTarget.style.borderColor = "#bfdbfe"; } }}
      onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#e2e8f0"; } }}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Text response card ───────────────────────────────────────────────────────
function ResponseCard({ text, streaming, onNewRecording }) {
  return (
    <div
      className="fade-up"
      style={{
        width: "100%", maxWidth: 580,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        boxShadow: "0 4px 20px rgba(15,23,42,.07), 0 1px 4px rgba(15,23,42,.04)",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 16px",
        borderBottom: "1px solid #f1f5f9",
        background: "#f8fafc",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BotAvatar size={26} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", fontFamily: "'Inter', sans-serif" }}>
            Response
          </span>
          {streaming && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em",
              color: "#3b82f6", textTransform: "uppercase",
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 99, padding: "2px 7px",
            }}>
              Streaming
            </span>
          )}
        </div>
        {!streaming && text && <CopyButton text={text} />}
      </div>

      {/* Response body */}
      <div style={{ padding: "16px 18px", minHeight: 60 }}>
        {streaming && !text ? (
          <ThinkingDots />
        ) : (
          <p style={{
            fontSize: 14, lineHeight: 1.75,
            color: "#334155",
            fontFamily: "'Inter', sans-serif",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}>
            {text}
            {streaming && (
              <span style={{
                display: "inline-block",
                width: 2, height: "1em",
                background: "#3b82f6",
                borderRadius: 1,
                marginLeft: 2,
                verticalAlign: "text-bottom",
                animation: "vtt-cursor .7s ease-in-out infinite",
              }} />
            )}
          </p>
        )}
      </div>

      {/* Footer action */}
      {!streaming && text && (
        <div style={{
          borderTop: "1px solid #f1f5f9",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'Inter', sans-serif" }}>
            {text.split(/\s+/).filter(Boolean).length} words
          </span>
          <button
            onClick={onNewRecording}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: "1px solid #e2e8f0",
              borderRadius: 8, padding: "5px 12px", cursor: "pointer",
              fontSize: 12, color: "#64748b",
              fontFamily: "'Inter', sans-serif",
              transition: "background .15s, border-color .15s, color .15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#eff6ff";
              e.currentTarget.style.borderColor = "#bfdbfe";
              e.currentTarget.style.color = "#3b82f6";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.color = "#64748b";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            New recording
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mic button (same as VoiceInputOutput) ────────────────────────────────────
function MicButton({ appState, onStart, onStop }) {
  const isIdle      = appState === STATE.IDLE;
  const isRecording = appState === STATE.RECORDING;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 90 }}>
      {isRecording && (
        <>
          <div className="ring-3" style={{ position: "absolute", width: 76, height: 76, borderRadius: "50%", border: "2px solid #3b82f6" }} />
          <div className="ring-2" style={{ position: "absolute", width: 76, height: 76, borderRadius: "50%", border: "2px solid #3b82f6" }} />
          <div className="ring-1" style={{ position: "absolute", width: 76, height: 76, borderRadius: "50%", border: "2px solid #3b82f6" }} />
          <div style={{ position: "absolute", width: 86, height: 86 }}>
            <div className="blob-anim" style={{ width: 86, height: 86, background: "#dbeafe", opacity: .55 }} />
          </div>
        </>
      )}
      <button
        className="mic-btn"
        aria-label={isIdle ? "Start recording" : "Stop and send"}
        onClick={isIdle ? onStart : onStop}
        style={{
          background: isRecording
            ? "linear-gradient(135deg,#ef4444,#dc2626)"
            : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
          boxShadow: isRecording
            ? "0 6px 24px rgba(239,68,68,.35),0 2px 8px rgba(0,0,0,.1)"
            : "0 6px 24px rgba(59,130,246,.4),0 2px 8px rgba(0,0,0,.1)",
        }}
      >
        {isIdle ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8"  y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

function ProcessingMicPlaceholder() {
  return (
    <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#eff6ff", border: "1.5px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="spin-anim" style={{ width: 32, height: 32, borderRadius: "50%", border: "2.5px solid #dbeafe", borderTopColor: "#3b82f6" }} />
    </div>
  );
}

// ─── Extra keyframes injected once ───────────────────────────────────────────
const EXTRA_STYLES = `
  @keyframes vtt-dot {
    0%,100% { transform:translateY(0);   opacity:.4 }
    50%     { transform:translateY(-5px);opacity:1  }
  }
  @keyframes vtt-cursor {
    0%,100% { opacity:1 }
    50%     { opacity:0 }
  }
`;

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * VoiceInputTextOutput
 *
 * Records audio → POSTs to the agent endpoint → renders the text response.
 *
 * Props:
 *   defaultAgentName  (string)  fallback agent id when AgentContext has none
 *   requestPath       (string)  relative or absolute URL path for the POST
 *
 * FormData keys sent:
 *   audio_file  – the recorded webm blob
 *   agent_id    – from AgentContext or defaultAgentName
 *
 * Expected API response: JSON  { response: "..." }  or  { text: "..." }  or plain text.
 * Streaming (text/event-stream or chunked text/plain) is also handled.
 */
export default function VoiceInputTextOutput({
  defaultAgentName = "default",
  requestPath      = "request/custom",
}) {
  const { activeAgent, llmSession } = useAgent();

  const [appState,   setAppState]   = useState(STATE.IDLE);
  const [seconds,    setSeconds]    = useState(0);
  const [respText,   setRespText]   = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [error,      setError]      = useState("");

  const mediaRecorderRef = useRef(null);
  const recorderMimeRef  = useRef("audio/webm;codecs=opus");
  const audioChunksRef   = useRef([]);
  const timerRef         = useRef(null);
  const styleInjected    = useRef(false);
  const abortRef         = useRef(null);

  // Inject shared keyframes + extra once
  useEffect(() => {
    if (!styleInjected.current) {
      const shared = document.createElement("style");
      shared.textContent = keyframes;
      document.head.appendChild(shared);
      const extra = document.createElement("style");
      extra.textContent = EXTRA_STYLES;
      document.head.appendChild(extra);
      styleInjected.current = true;
    }
  }, []);

  // Cleanup abort on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Recording timer
  useEffect(() => {
    if (appState === STATE.RECORDING) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [appState]);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType;
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm"))         mimeType = "audio/webm";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderMimeRef.current = mr.mimeType || mimeType || "audio/webm;codecs=opus";
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onerror = e => console.error("MediaRecorder error", e);
      mr.start();
      mediaRecorderRef.current = mr;
    } catch (err) {
      console.error("Mic access failed:", err);
      audioChunksRef.current = [];
    }
    setSeconds(0);
    setError("");
    setAppState(STATE.RECORDING);
  }, []);

  // ── Stop + send ────────────────────────────────────────────────────────────
  const stopAndProcess = useCallback(async () => {
    const mr            = mediaRecorderRef.current;
    const mimeType      = recorderMimeRef.current || "audio/webm;codecs=opus";

    if (mr && mr.state !== "inactive") {
      await new Promise(resolve => { mr.onstop = resolve; mr.stop(); });
      mr.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }

    setRespText("");
    setStreaming(false);
    setError("");
    setAppState(STATE.PROCESSING);

    const blob          = audioChunksRef.current.length
      ? new Blob(audioChunksRef.current, { type: mimeType })
      : new Blob([], { type: mimeType });
    audioChunksRef.current = [];

    const fileExt  = mimeType.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio_file", blob, `recording.${fileExt}`);

    const agent = activeAgent || { id: defaultAgentName };
    formData.append("agent_id", agent.id);
    if (llmSession) {
      formData.append("llm_session", llmSession);
    }

    const token = localStorage.getItem("agentToken");
    abortRef.current = new AbortController();

    try {
      const normalizedPath = requestPath.startsWith("http")
        ? requestPath
        : `${baseURL.replace(/\/$/, "")}/${requestPath.replace(/^\/+/, "")}`;

      const response = await fetch(normalizedPath, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body:    formData,
        signal:  abortRef.current.signal,
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => "");
        throw new Error(msg || `HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      // ── Streaming response ────────────────────────────────────────────────
      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        setStreaming(true);
        setAppState(STATE.RESPONSE);

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // Handle SSE "data: " framing if present
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                buffer += parsed?.text ?? parsed?.delta ?? parsed?.content ?? data;
              } catch {
                buffer += data;
              }
            } else {
              buffer += chunk;
            }
          }
          setRespText(buffer);
        }

        setStreaming(false);

      // ── JSON response ─────────────────────────────────────────────────────
      } else if (contentType.includes("application/json")) {
        const data = await response.json();
        const text = data?.output_text ?? data?.response ?? data?.text
                  ?? data?.message     ?? data?.reply     ?? data?.content
                  ?? data?.answer      ?? JSON.stringify(data);
        setRespText(text.trim());
        setStreaming(false);
        setAppState(STATE.RESPONSE);

      // ── Plain text fallback ───────────────────────────────────────────────
      } else {
        const text = await response.text();
        setRespText(text.trim());
        setStreaming(false);
        setAppState(STATE.RESPONSE);
      }

    } catch (err) {
      if (err.name === "AbortError") return;
      console.error(err);
      setError(err.message || "Failed to get a response.");
      setAppState(STATE.IDLE);
    }
  }, [activeAgent, defaultAgentName, llmSession, requestPath]);

  // ── Cancel recording ───────────────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
      mr.stream.getTracks().forEach(t => t.stop());
    }
    audioChunksRef.current = [];
    setAppState(STATE.IDLE);
  }, []);

  // ── Reset to idle ──────────────────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    abortRef.current?.abort();
    setAppState(STATE.IDLE);
    setRespText("");
    setStreaming(false);
    setError("");
  }, []);

  // ── Hint text ──────────────────────────────────────────────────────────────
  const hintMap = {
    [STATE.IDLE]:       "Tap once to start · tap again to send",
    [STATE.RECORDING]:  "Tap mic to send · × to cancel",
    [STATE.PROCESSING]: "Transcribing &amp; generating response…",
    [STATE.RESPONSE]:   streaming ? "Streaming response…" : "Response ready",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "space-between",
      padding: "32px 24px 24px", gap: 24, width: "100%",
    }}>

      {/* ── Centre stage ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16, width: "100%", maxWidth: 600,
      }}>

        {/* Error banner */}
        {error && (
          <div className="fade-up" style={{
            width: "100%", maxWidth: 560,
            padding: "10px 14px", borderRadius: 12,
            background: "#fef2f2", border: "1px solid #fecaca",
            color: "#dc2626", fontSize: 13,
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Inter', sans-serif",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8"  x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError("")}
              style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        )}

        {/* State-driven display */}
        {appState === STATE.IDLE       && <IdleCenter />}
        {appState === STATE.RECORDING  && <RecordingCenter seconds={seconds} />}
        {appState === STATE.PROCESSING && <ProcessingCenter />}
        {appState === STATE.RESPONSE   && (
          <ResponseCard
            text={respText}
            streaming={streaming}
            onNewRecording={resetToIdle}
          />
        )}
      </div>

      {/* ── Controls footer ── */}
      <div style={{
        background: "#fff", borderTop: "1px solid #e2e8f0",
        padding: "18px 24px 26px",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 10, width: "100%",
      }}>
        <div style={{
          position: "relative", display: "flex",
          alignItems: "center", justifyContent: "center",
          width: 130, height: 90,
        }}>
          {appState === STATE.IDLE && (
            <MicButton appState={appState} onStart={startRecording} onStop={stopAndProcess} />
          )}
          {appState === STATE.RECORDING && (
            <div style={{ position: "relative" }}>
              <MicButton appState={appState} onStart={startRecording} onStop={stopAndProcess} />
              <button
                className="cancel-x-btn cancel-pop"
                onClick={cancelRecording}
                aria-label="Cancel recording"
              >✕</button>
            </div>
          )}
          {appState === STATE.PROCESSING && <ProcessingMicPlaceholder />}
          {appState === STATE.RESPONSE && (
            /* Muted mic placeholder — tap to start new */
            <button
              onClick={resetToIdle}
              title="Start new recording"
              style={{
                width: 76, height: 76, borderRadius: "50%", border: "none",
                background: streaming
                  ? "linear-gradient(135deg,#e2e8f0,#cbd5e1)"
                  : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: streaming ? "not-allowed" : "pointer",
                boxShadow: streaming
                  ? "none"
                  : "0 6px 24px rgba(59,130,246,.35)",
                transition: "background .2s, box-shadow .2s",
                opacity: streaming ? .5 : 1,
              }}
              disabled={streaming}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8"  y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
        </div>

        <p
          style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", fontFamily: "'Inter', sans-serif" }}
          dangerouslySetInnerHTML={{ __html: hintMap[appState] }}
        />
      </div>
    </div>
  );
}