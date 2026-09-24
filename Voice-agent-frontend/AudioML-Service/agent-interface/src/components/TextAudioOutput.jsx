import { useState, useEffect, useRef, useCallback } from "react";
import { keyframes } from "../styles/keyframes";
import { useAgent } from "../context/AgentContext";
import { baseURL } from "../url";

const STATE = {
  IDLE:       "idle",
  PROCESSING: "processing",
  PLAYBACK:   "playback",
};

/* ─── Shared wave bars (reused from voice component) ─────────── */
function WaveBars({ color = "#3b82f6", small = false }) {
  const h = small ? 20 : 36;
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

/* ─── Idle display ───────────────────────────────────────────── */
function IdleCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div className="idle-float" style={{ color: "#93c5fd" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.4" />
          <line x1="7" y1="9"  x2="17" y2="9"  stroke="#93c5fd" strokeWidth="1.3" />
          <line x1="7" y1="12" x2="14" y2="12" stroke="#93c5fd" strokeWidth="1.3" />
          <line x1="7" y1="15" x2="11" y2="15" stroke="#93c5fd" strokeWidth="1.3" />
        </svg>
      </div>
      <p style={{ fontSize: 15, color: "#64748b", fontWeight: 400 }}>Type your prompt below</p>
      <p style={{ fontSize: 12.5, color: "#94a3b8" }}>The response will be played as audio</p>
    </div>
  );
}

/* ─── Processing display ─────────────────────────────────────── */
function ProcessingCenter() {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 52, height: 52 }}>
        <div
          className="spin-anim"
          style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #dbeafe", borderTopColor: "#3b82f6", position: "absolute" }}
        />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3b82f6", opacity: .5 }} />
        </div>
      </div>
      <p style={{ fontSize: 15, color: "#64748b" }}>Generating response…</p>
    </div>
  );
}

/* ─── Playback display ───────────────────────────────────────── */
function PlaybackCenter({ isPlaying, onToggle, onReplay, duration, currentTime }) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", maxWidth: 460 }}>
      {/* Waveform / static bars */}
      <div style={{ opacity: isPlaying ? 1 : 0.4, transition: "opacity .3s" }}>
        <WaveBars color={isPlaying ? "#16a34a" : "#64748b"} />
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            width: "100%", height: 4, borderRadius: 99,
            background: "#e2e8f0", overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg,#3b82f6,#16a34a)",
              width: `${pct}%`,
              transition: "width .25s linear",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Replay from start */}
        <button
          onClick={onReplay}
          title="Replay from beginning"
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "1.5px solid #e2e8f0", background: "#f8fafc",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#64748b",
            transition: "background .15s, border-color .15s, color .15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; e.currentTarget.style.color = "#3b82f6"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
        >
          {/* Replay icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={onToggle}
          style={{
            width: 52, height: 52, borderRadius: "50%", border: "none",
            background: isPlaying
              ? "linear-gradient(135deg,#16a34a,#15803d)"
              : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: isPlaying
              ? "0 4px 18px rgba(22,163,74,.35)"
              : "0 4px 18px rgba(59,130,246,.35)",
            transition: "background .2s, box-shadow .2s",
          }}
        >
          {isPlaying ? (
            /* Pause */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16" rx="1.5"/>
              <rect x="14" y="4" width="4" height="16" rx="1.5"/>
            </svg>
          ) : (
            /* Play */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>
      </div>

      <p style={{ fontSize: 12, color: isPlaying ? "#16a34a" : "#94a3b8", transition: "color .2s", fontWeight: 500 }}>
        {isPlaying ? "Playing response…" : "Paused — press play to continue"}
      </p>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function TextInputAudioOutput() {
  const { activeAgent, llmSession, isVerified } = useAgent();
  const [appState,     setAppState]     = useState(STATE.IDLE);
  const [prompt,       setPrompt]       = useState("");
  const [error,        setError]        = useState("");
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [duration,     setDuration]     = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);

  const audioRef      = useRef(null);   // HTMLAudioElement
  const audioUrlRef   = useRef(null);   // object URL (kept alive for replay)
  const styleInjected = useRef(false);
  const textareaRef   = useRef(null);

  /* inject shared keyframes once */
  useEffect(() => {
    if (!styleInjected.current) {
      const el = document.createElement("style");
      el.textContent = keyframes;
      document.head.appendChild(el);
      styleInjected.current = true;
    }
  }, []);

  /* wire up audio element events */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration   = () => setDuration(audio.duration || 0);
    const onEnded      = () => setIsPlaying(false);
    const onPlay       = () => setIsPlaying(true);
    const onPause      = () => setIsPlaying(false);

    audio.addEventListener("timeupdate",       onTimeUpdate);
    audio.addEventListener("durationchange",   onDuration);
    audio.addEventListener("loadedmetadata",   onDuration);
    audio.addEventListener("ended",            onEnded);
    audio.addEventListener("play",             onPlay);
    audio.addEventListener("pause",            onPause);

    return () => {
      audio.removeEventListener("timeupdate",     onTimeUpdate);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended",          onEnded);
      audio.removeEventListener("play",           onPlay);
      audio.removeEventListener("pause",          onPause);
    };
  }, []);

  /* revoke old URL when a new request comes in */
  function revokeOldAudio() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }

  const handleSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    setError("");
    revokeOldAudio();
    setAppState(STATE.PROCESSING);
    if (!isVerified) {
      setError("You must be logged in to submit a prompt.");
      setAppState(STATE.IDLE);
      return;
    }
    // agentToken was a vestigial localStorage token from the pre-Firebase
    // auth system that the backend never actually read (it authorizes via
    // the session cookie, credentials:"include") -- gone now, kept here
    // only because the Authorization header below is otherwise harmless
    // dead weight, same as it already was.
    const token = localStorage.getItem("agentToken");
    try {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("agent_id", activeAgent.id);
      if (llmSession) {
        formData.append("llm_session", llmSession);
      }

      const response = await fetch(baseURL + "request/custom", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => "");
        throw new Error(msg || `HTTP ${response.status}`);
      }

      const blob    = await response.blob();
      const url     = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio   = audioRef.current;
      audio.src     = url;
      audio.load();
      audio.play().catch(e => console.warn("Autoplay blocked:", e));

      setAppState(STATE.PLAYBACK);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to get response.");
      setAppState(STATE.IDLE);
    }
  }, [prompt, isVerified, activeAgent.id, llmSession]);

  /* Ctrl/Cmd + Enter submits */
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (appState === STATE.IDLE || appState === STATE.PLAYBACK) handleSubmit();
    }
  };

  function togglePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else              audio.pause();
  }

  function replayAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  const canSubmit = prompt.trim().length > 0 && appState !== STATE.PROCESSING;

  /* ── Render ── */
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        padding: "32px 24px 24px", gap: 24, width: "100%",
      }}
    >
      {/* hidden audio element — persists between renders */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* ── Status / display area ── */}
      <div
        style={{
          minHeight: 150, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 12, width: "100%", maxWidth: 560,
        }}
      >
        {appState === STATE.IDLE       && <IdleCenter />}
        {appState === STATE.PROCESSING && <ProcessingCenter />}
        {appState === STATE.PLAYBACK   && (
          <PlaybackCenter
            isPlaying={isPlaying}
            onToggle={togglePlayPause}
            onReplay={replayAudio}
            duration={duration}
            currentTime={currentTime}
          />
        )}
      </div>

      {/* ── Input footer ── */}
      <div
        style={{
          background: "#fff", borderTop: "1px solid #e2e8f0",
          padding: "18px 20px 24px",
          display: "flex", flexDirection: "column",
          alignItems: "stretch", gap: 10,
          width: "100%",
        }}
      >
        {/* Error */}
        {error && (
          <div
            className="fade-up"
            style={{
              padding: "9px 14px", borderRadius: 10,
              background: "#fef2f2", border: "1px solid #fecaca",
              color: "#dc2626", fontSize: 13,
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Textarea + send button row */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 0 }}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => {
              setPrompt(e.target.value);
              // auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your prompt here…"
            rows={3}
            disabled={appState === STATE.PROCESSING}
            style={{
              width: "100%", boxSizing: "border-box",
              resize: "none", overflow: "hidden",
              border: "1.5px solid #e2e8f0",
              borderRadius: 14,
              padding: "13px 56px 13px 16px",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14, lineHeight: 1.65,
              color: "#334155",
              background: appState === STATE.PROCESSING ? "#f8fafc" : "#fff",
              outline: "none",
              transition: "border-color .15s, box-shadow .15s",
              boxShadow: "0 2px 8px rgba(0,0,0,.04)",
            }}
            onFocus={e => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow   = "0 0 0 3px rgba(59,130,246,.12)";
            }}
            onBlur={e => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow   = "0 2px 8px rgba(0,0,0,.04)";
            }}
          />

          {/* Send button — floats inside textarea bottom-right */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            title="Send (Ctrl + Enter)"
            style={{
              position: "absolute", bottom: 10, right: 10,
              width: 36, height: 36, borderRadius: 10,
              border: "none",
              background: canSubmit
                ? "linear-gradient(135deg,#3b82f6,#1d4ed8)"
                : "#e2e8f0",
              color: canSubmit ? "#fff" : "#94a3b8",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canSubmit ? "pointer" : "not-allowed",
              transition: "background .18s, color .18s, transform .12s",
              boxShadow: canSubmit ? "0 2px 10px rgba(59,130,246,.3)" : "none",
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.transform = "scale(1.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            onMouseDown={e => { if (canSubmit) e.currentTarget.style.transform = "scale(.93)"; }}
            onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {appState === STATE.PROCESSING ? (
              /* spinner inside button while processing */
              <div
                className="spin-anim"
                style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,.3)",
                  borderTopColor: "#fff",
                }}
              />
            ) : (
              /* paper-plane send icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>

        {/* Hint row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 2 }}>
          <p style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'Inter', sans-serif" }}>
            {appState === STATE.PROCESSING
              ? "Generating audio…"
              : appState === STATE.PLAYBACK
              ? "Response ready — send a new prompt to replace"
              : "Press Ctrl + Enter to send"}
          </p>
          {/* char count */}
          <span style={{ fontSize: 11, color: prompt.length > 800 ? "#f59e0b" : "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>
            {prompt.length}
          </span>
        </div>
      </div>
    </div>
  );
}