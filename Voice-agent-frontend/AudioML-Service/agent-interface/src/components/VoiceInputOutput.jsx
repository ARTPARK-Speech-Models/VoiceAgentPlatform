import { useState, useEffect, useRef, useCallback } from "react";
import { keyframes } from "../styles/keyframes";
import { useAgent } from "../context/AgentContext";
import { baseURL } from "../url";

const STATE = { IDLE: "idle", RECORDING: "recording", PROCESSING: "processing", PLAYBACK: "playback" };

function WaveBars({ color = "#3b82f6" }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 36 }}>
      {["wave-1", "wave-2", "wave-3", "wave-4", "wave-5"].map((cls, i) => (
        <div key={i} className={cls} style={{ width: 4, height: 32, background: color, borderRadius: 2, transformOrigin: "bottom" }} />
      ))}
    </div>
  );
}

function IdleCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div className="idle-float" style={{ color: "#93c5fd" }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="#eff6ff" stroke="#3b82f6" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#3b82f6" />
          <line x1="12" y1="19" x2="12" y2="23" stroke="#3b82f6" />
          <line x1="8" y1="23" x2="16" y2="23" stroke="#3b82f6" />
        </svg>
      </div>
      <p style={{ fontSize: 16, color: "#64748b", fontWeight: 400 }}>Ready to listen</p>
      <p style={{ fontSize: 13, color: "#94a3b8" }}>Tap the mic to start speaking</p>
    </div>
  );
}

function RecordingCenter({ seconds }) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <WaveBars color="#3b82f6" />
      <p style={{ fontSize: 26, fontWeight: 600, color: "#1e40af", letterSpacing: ".04em", fontVariantNumeric: "tabular-nums" }}>
        {m}:{s}
      </p>
      <p style={{ fontSize: 13, color: "#64748b" }}>Listening… tap mic to send</p>
    </div>
  );
}

function ProcessingCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 52, height: 52 }}>
        <div className="spin-anim" style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #dbeafe", borderTopColor: "#3b82f6", position: "absolute" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3b82f6", opacity: .5 }} />
        </div>
      </div>
      <p style={{ fontSize: 15, color: "#64748b" }}>Thinking…</p>
    </div>
  );
}

function PlaybackCenter({ text }) {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <WaveBars color="#16a34a" />
      <p style={{ fontSize: 13, color: "#16a34a", fontWeight: 500 }}>Speaking response…</p>
      {text && (
        <div className="transcript-card fade-up">
          <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Response</p>
          {text}
        </div>
      )}
    </div>
  );
}

function MicButton({ appState, onStart, onStop }) {
  const isIdle = appState === STATE.IDLE;
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
          background: isRecording ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
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
            <line x1="8" y1="23" x2="16" y2="23" />
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

function PlaybackMicPlaceholder() {
  return (
    <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#f0fdf4", border: "1.5px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    </div>
  );
}

export default function VoiceInputOutput({ defaultAgentName = "default", requestPath = "request/custom" }) {
  const { activeAgent, llmSession } = useAgent();
  const [appState, setAppState] = useState(STATE.IDLE);
  const [seconds, setSeconds] = useState(0);
  const [responseText, setResponseText] = useState("");
  const [_responseIdx, setResponseIdx] = useState(0);

  const mediaRecorderRef = useRef(null);
  const recorderMimeRef = useRef("audio/webm;codecs=opus");
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const styleInjected = useRef(false);

  useEffect(() => {
    if (!styleInjected.current) {
      const el = document.createElement("style");
      el.textContent = keyframes;
      document.head.appendChild(el);
      styleInjected.current = true;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      let mimeType;
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      }
      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mr = new MediaRecorder(stream, recorderOptions);
      recorderMimeRef.current = mr.mimeType || mimeType || "audio/webm;codecs=opus";
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onerror = e => console.error("MediaRecorder error", e);
      mr.start();
      mediaRecorderRef.current = mr;
    } catch (error) {
      console.error("Audio recording failed", error);
      audioChunksRef.current = [];
    }
    setSeconds(0);
    setAppState(STATE.RECORDING);
  }, []);

  useEffect(() => {
    if (appState === STATE.RECORDING) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [appState]);

  const stopAndProcess = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    const recorderMimeType = recorderMimeRef.current || "audio/webm;codecs=opus";
    if (mr && mr.state !== "inactive") {
      const stopPromise = new Promise(resolve => {
        mr.onstop = () => resolve();
      });
      mr.stop();
      mr.stream.getTracks().forEach(t => t.stop());
      await stopPromise;
      mediaRecorderRef.current = null;
      recorderMimeRef.current = "audio/webm;codecs=opus";
    }

    setAppState(STATE.PROCESSING);

    const blob = audioChunksRef.current.length
      ? new Blob(audioChunksRef.current, { type: recorderMimeType })
      : new Blob([], { type: recorderMimeType });

    const fileExtension = recorderMimeType.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio_file", blob, `recording.${fileExtension}`);

    const agent = activeAgent || { id: defaultAgentName, name: defaultAgentName };
    formData.append("agent_id", agent.id);
    if (llmSession) {
      formData.append("llm_session", llmSession);
    }

    const token = localStorage.getItem("agentToken");
    try {
      const normalizedRequestPath = requestPath.startsWith("http")
        ? requestPath
        : `${baseURL.replace(/\/$/, "")}/${requestPath.replace(/^\/+/, "")}`;
      const response = await fetch(normalizedRequestPath, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate audio response");
      }

      const audioResponse = await response.blob();
      const audioUrl = URL.createObjectURL(audioResponse);
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {
        console.warn("Audio playback failed, response audio still downloaded.");
      });
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setAppState(STATE.IDLE);
      };

      setResponseText("Audio response received");
      setResponseIdx(i => i + 1);
      setAppState(STATE.PLAYBACK);
    } catch (error) {
      console.error(error);
      setResponseText("Error generating audio response");
      setAppState(STATE.IDLE);
    }
  }, [activeAgent, defaultAgentName, llmSession, requestPath]);

  const cancelRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
      mr.stream.getTracks().forEach(t => t.stop());
    }
    audioChunksRef.current = [];
    setAppState(STATE.IDLE);
  }, []);

  const hintMap = {
    [STATE.IDLE]: "Tap once to start · tap again to send",
    [STATE.RECORDING]: "Tap mic to send · × to cancel",
    [STATE.PROCESSING]: "Generating your response…",
    [STATE.PLAYBACK]: "Playing response — standby…",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "32px 24px 24px", gap: 24, width: "100%" }}>
      {/* Main Display */}
      <div style={{ minHeight: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, width: "100%", maxWidth: 560 }}>
        {appState === STATE.IDLE && <IdleCenter />}
        {appState === STATE.RECORDING && <RecordingCenter seconds={seconds} />}
        {appState === STATE.PROCESSING && <ProcessingCenter />}
        {appState === STATE.PLAYBACK && <PlaybackCenter text={responseText} />}
      </div>

      {/* Controls Footer */}
      <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "20px 24px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 130, height: 90 }}>
          {appState === STATE.IDLE && (
            <MicButton appState={appState} onStart={startRecording} onStop={stopAndProcess} />
          )}
          {appState === STATE.RECORDING && (
            <div style={{ position: "relative" }}>
              <MicButton appState={appState} onStart={startRecording} onStop={stopAndProcess} />
              <button className="cancel-x-btn cancel-pop" onClick={cancelRecording} aria-label="Cancel recording">✕</button>
            </div>
          )}
          {appState === STATE.PROCESSING && <ProcessingMicPlaceholder />}
          {appState === STATE.PLAYBACK && <PlaybackMicPlaceholder />}
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>{hintMap[appState]}</p>
      </div>
    </div>
  );
}
