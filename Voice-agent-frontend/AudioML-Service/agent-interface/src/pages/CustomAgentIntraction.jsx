import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keyframes } from "../styles/keyframes";
import { useAgent, AGENT_STATUS } from "../context/AgentContext"

// // ── I/O components — adjust import paths to match your project ────────────────
import VoiceInputOutput     from "../components/VoiceInputOutput"
import TextInputAudioOutput from "../components/TextAudioOutput"
import TextChat             from "../components/TextInputOutput"
import VoiceInputTextOutput from "../components/VoiceInputTextOutput"

const IO_REGISTRY = {
  "AtA": {
    component: VoiceInputOutput,
    label: "Audio → Audio",
    icon: (color = "currentColor") => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8"  y1="23" x2="16" y2="23"/>
      </svg>
    ),
  },
  "TtA": {
    component: TextInputAudioOutput,
    label: "Text → Audio",
    icon: (color = "currentColor") => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <line x1="7" y1="9"  x2="17" y2="9"/>
        <line x1="7" y1="13" x2="13" y2="13"/>
      </svg>
    ),
  },
  "TtT": {
    component: TextChat,
    label: "Text → Text",
    icon: (color = "currentColor") => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  "AtT": {
    component: VoiceInputTextOutput,
    label: "Audio → Text",
    icon: (color = "currentColor") => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8"  y1="23" x2="16" y2="23"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="20" x2="20" y2="20"/>
        <line x1="17" y1="23" x2="19" y2="23"/>
      </svg>
    ),
  }
};

// ── Inject keyframes once ─────────────────────────────────────────────────────
let _injected = false;
function injectStyles() {
  if (_injected) return; _injected = true;
  const el = document.createElement("style");
  el.textContent = keyframes + `
    @keyframes ai-shimmer {
      0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}
    }
    @keyframes ai-fade-up {
      from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)}
    }
    .ai-hero {
      background:linear-gradient(135deg,#0d47a1 0%,#1565c0 30%,#0277bd 60%,#01579b 100%);
      background-size:200% 200%;
      animation:ai-shimmer 8s ease infinite;
    }
    .ai-fade-up { animation:ai-fade-up .35s ease both; }
  `;
  document.head.appendChild(el);
}

// ── Pipeline chips (same style as AgentDashboard) ─────────────────────────────
const PIPE_COLORS = {
  ASR: { bg:"#eff6ff", text:"#2563eb", border:"#bfdbfe" },
  LLM: { bg:"#f0fdf4", text:"#15803d", border:"#bbf7d0" },
  TTS: { bg:"#fdf4ff", text:"#7e22ce", border:"#e9d5ff" },
};
function PipelineChips({ agentType }) {
  const parts = (agentType || "").split("+")
    .map(p => ({ A:"ASR", L:"LLM", T:"TTS" }[p.trim()] || p.trim()));
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
      {parts.map((p, i) => {
        const c = PIPE_COLORS[p] || { bg:"#f1f5f9", text:"#475569", border:"#e2e8f0" };
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{
              fontSize:10.5, fontWeight:700, padding:"2px 8px", borderRadius:99,
              background:c.bg, color:c.text, border:`1px solid ${c.border}`,
              letterSpacing:".04em", fontFamily:"'Inter',sans-serif",
            }}>{p}</span>
            {i < parts.length - 1 && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Guard shown when no agent is active ───────────────────────────────────────
function NoAgentGuard({ onBack }) {
  return (
    <div className="ai-fade-up" style={{
      flex:1, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"48px 24px", gap:20, textAlign:"center",
    }}>
      <div className="idle-float" style={{ color:"#93c5fd" }}>
        <svg width="58" height="58" viewBox="0 0 24 24" fill="none" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="14" rx="2.5"
            fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.3"/>
          <rect x="7"    y="8" width="2.8" height="2.8" rx=".5" fill="#93c5fd" stroke="none"/>
          <rect x="14.2" y="8" width="2.8" height="2.8" rx=".5" fill="#93c5fd" stroke="none"/>
          <path d="M9 13.5 Q12 15.5 15 13.5" stroke="#3b82f6" strokeWidth="1.4" fill="none"/>
          <line x1="12" y1="4" x2="12" y2="1.8" stroke="#3b82f6" strokeWidth="1.5"/>
          <circle cx="12" cy="1.2" r=".9" fill="#3b82f6" stroke="none"/>
        </svg>
      </div>
      <div>
        <p style={{
          fontFamily:"'Inter',sans-serif", fontSize:22,
          color:"#0f172a", marginBottom:8,
        }}>
          No agent is active
        </p>
        <p style={{
          fontFamily:"'Inter',sans-serif", fontSize:13.5,
          color:"#94a3b8", maxWidth:320, margin:"0 auto", lineHeight:1.6,
        }}>
          Go to your dashboard and hit the ignition button on any agent to start a session.
        </p>
      </div>
      <button
        onClick={onBack}
        style={{
          height:40, padding:"0 24px", borderRadius:10, border:"none",
          background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",
          color:"#fff", fontFamily:"'Inter',sans-serif",
          fontSize:14, fontWeight:600, cursor:"pointer",
          boxShadow:"0 4px 14px rgba(59,130,246,.3)",
          display:"flex", alignItems:"center", gap:8,
          transition:"filter .15s",
        }}
        onMouseEnter={e => e.currentTarget.style.filter="brightness(1.07)"}
        onMouseLeave={e => e.currentTarget.style.filter="none"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentInteract() {
  injectStyles();

  const navigate = useNavigate();
  const { activeAgent, ioFormat, status, error, deactivateAgent, clearError } = useAgent();

  // Key increments when agent changes → forces IOComponent to remount cleanly.
  // Adjusted during render (React's sanctioned pattern for this) rather than
  // via refs -- mutating a ref during render isn't safe under concurrent
  // rendering/Strict Mode, since a thrown-away render wouldn't undo it.
  const [ioKey, setIoKey] = useState(0);
  const [prevName, setPrevName] = useState(activeAgent?.name ?? null);
  if (activeAgent?.name !== prevName) {
    setIoKey(k => k + 1);
    setPrevName(activeAgent?.name ?? null);
  }

  const isActive   = status === AGENT_STATUS.ACTIVE  && !!ioFormat && !!activeAgent;
  const isWaiting  = status === AGENT_STATUS.ACTIVATING;
  const isIdle     = !isActive && !isWaiting;   // show the guard

  const ioEntry    = ioFormat ? IO_REGISTRY[ioFormat] : null;
  const IOComponent = ioEntry?.component ?? null;

  async function handleStop() {
    await deactivateAgent();
    navigate("/");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh", background:"#f8fafc",
      display:"flex", flexDirection:"column",
      fontFamily:"'Inter',sans-serif",
    }}>

      {/* ── Hero ── */}
      <div className="ai-hero" style={{
        padding:"36px 24px 32px", textAlign:"center",
        position:"relative", overflow:"hidden",
      }}>
        {/* Radial glow */}
        <div style={{
          position:"absolute", inset:0, pointerEvents:"none",
          background:
            "radial-gradient(ellipse at 20% 50%,rgba(255,255,255,.07) 0%,transparent 60%)," +
            "radial-gradient(ellipse at 80% 30%,rgba(255,255,255,.05) 0%,transparent 55%)",
        }}/>

        {/* Back pill */}
        <button
          onClick={() => navigate("/agents")}
          style={{
            position:"absolute", top:16, left:16,
            background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
            borderRadius:99, padding:"5px 13px",
            color:"rgba(255,255,255,.8)", fontSize:12, fontWeight:500,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Inter',sans-serif", transition:"background .15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.2)"}
          onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.12)"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Dashboard
        </button>

        <div style={{ position:"relative", zIndex:1 }}>
          {/* Status badge */}
          <div style={{
            display:"inline-flex", alignItems:"center", gap:7,
            background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
            borderRadius:99, padding:"5px 14px", marginBottom:14,
            fontSize:12, fontWeight:500,
            color:"rgba(255,255,255,.85)", letterSpacing:".04em",
          }}>
            <span style={{
              width:7, height:7, borderRadius:"50%", display:"inline-block",
              background: isActive  ? "#4ade80"
                        : isWaiting ? "#fbbf24"
                        : "#94a3b8",
              boxShadow: isActive ? "0 0 6px #4ade80" : "none",
            }}/>
            {isActive ? "Agent Active" : isWaiting ? "Starting up…" : "No Agent Running"}
          </div>

          <h1 style={{
            fontFamily:"'Inter',sans-serif",
            fontSize:"clamp(24px,4.5vw,40px)", fontWeight:400,
            color:"#fff", lineHeight:1.2, marginBottom:10,
            textShadow:"0 2px 20px rgba(0,0,0,.15)",
          }}>
            {isActive ? (
              <>{activeAgent.name}<br/><em style={{ color:"#bfdbfe" }}>is listening.</em></>
            ) : (
              <>Agent Interaction<br/><em style={{ color:"#bfdbfe" }}>Studio</em></>
            )}
          </h1>
        </div>
      </div>

      {/* ── Active agent info + stop bar ── */}
      {isActive && ioEntry && (
        <div className="ai-fade-up" style={{
          background:"#f0fdf4", borderBottom:"1px solid #bbf7d0",
          padding:"10px 20px",
          display:"flex", alignItems:"center",
          justifyContent:"space-between", flexWrap:"wrap", gap:10,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {/* Live dot */}
            <span style={{
              width:8, height:8, borderRadius:"50%", background:"#22c55e",
              display:"inline-block", boxShadow:"0 0 6px #22c55e",
            }}/>
            <span style={{ fontSize:13, fontWeight:600, color:"#15803d" }}>
              {activeAgent.name}
            </span>
            <span style={{ color:"#86efac" }}>·</span>
            {/* I/O mode */}
            <span style={{
              display:"flex", alignItems:"center", gap:5,
              color:"#16a34a", fontSize:12.5,
            }}>
              {ioEntry.icon("#16a34a")}
              {ioEntry.label}
            </span>
            <span style={{ color:"#86efac" }}>·</span>
            <PipelineChips agentType={activeAgent.agent_type}/>
          </div>

          {/* Stop button */}
          <button
            onClick={handleStop}
            style={{
              height:32, padding:"0 14px", borderRadius:8,
              border:"1.5px solid #fecaca", background:"#fff",
              color:"#dc2626", fontFamily:"'Inter',sans-serif",
              fontSize:12.5, fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", gap:6,
              transition:"background .15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background="#fef2f2"}
            onMouseLeave={e => e.currentTarget.style.background="#fff"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6"  y1="6" x2="18" y2="18"/>
            </svg>
            Stop Agent
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          margin:"16px 20px 0", padding:"11px 14px", borderRadius:11,
          background:"#fef2f2", border:"1px solid #fecaca",
          color:"#dc2626", fontSize:13, fontFamily:"'Inter',sans-serif",
          display:"flex", alignItems:"center", gap:9,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ flex:1 }}>{error}</span>
          <button onClick={clearError}
            style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:15, padding:0 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── I/O area ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>

        {/* Activating spinner */}
        {isWaiting && (
          <div className="ai-fade-up" style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:16,
          }}>
            <div style={{ position:"relative", width:56, height:56 }}>
              <div className="spin-anim" style={{
                width:56, height:56, borderRadius:"50%",
                border:"2.5px solid #dbeafe", borderTopColor:"#3b82f6",
                position:"absolute",
              }}/>
              <div style={{
                position:"absolute", inset:0,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <div style={{
                  width:14, height:14, borderRadius:"50%",
                  background:"#3b82f6", opacity:.4,
                }}/>
              </div>
            </div>
            <p style={{ fontSize:15, color:"#64748b" }}>Starting agent…</p>
          </div>
        )}

        {/* No agent active — guard */}
        {isIdle && <NoAgentGuard onBack={() => navigate("/")}/>}

        {/* Matched I/O component */}
        {isActive && IOComponent && <IOComponent key={ioKey}/>}

        {/* Unknown format fallback */}
        {isActive && !IOComponent && (
          <div className="ai-fade-up" style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            padding:32, gap:10, textAlign:"center",
          }}>
            <p style={{
              fontFamily:"'Inter',sans-serif", fontSize:20, color:"#0f172a",
            }}>
              Unknown format:{" "}
              <code style={{ fontFamily:"monospace", color:"#7e22ce" }}>{ioFormat}</code>
            </p>
            <p style={{ fontSize:13.5, color:"#94a3b8" }}>
              Add an entry for <code>{ioFormat}</code> to the{" "}
              <code>IO_REGISTRY</code> in AgentInteract.jsx.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}