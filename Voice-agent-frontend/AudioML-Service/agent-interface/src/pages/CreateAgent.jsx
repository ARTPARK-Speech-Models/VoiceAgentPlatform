import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent } from "../context/AgentContext";
import { CA_CSS } from "../styles/createAgentStyle";
import "../styles/agentDashboard.css"
import { GearIcon, TickIcon } from "../components/Icons";
import { baseURL } from "../url";

/* ─── Google Fonts injected once ─────────────────────────────── */
if (!document.getElementById("ca-fonts")) {
  const l = document.createElement("link");
  l.id = "ca-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap";
  document.head.appendChild(l);
}

/* ─── Keyframes injected once ─────────────────────────────────── */

if (!document.getElementById("ca-styles")) {
  const s = document.createElement("style");
  s.id = "ca-styles";
  s.textContent = CA_CSS;
  document.head.appendChild(s);
}

/* ─── Constants ────────────────────────────────────────────────── */
const FONT = "'Inter', sans-serif";
const SERIF = "'Inter', sans-serif";
  
const ASR_TYPES = ["whisper", "conformer", "canary"];
const ASR_LANGUAGES = {
  whisper: ["hindi", "kannada", "telugu", "odia", "tulu", "bengali", "english"],
  conformer: ["multi", "hindi", "odia", "telugu", "kannada"],
  canary: ["english", "french", "german", "spanish"],
};
const WHISPER_VARIANTS = {
  hindi: ["tiny", "small", "medium", "large"],
  kannada: ["small", "medium"],
  telugu: ["medium", "large"],
  odia: ["large"],
  tulu: ["small"],
  bengali: ["medium"],
  english: ["tiny", "small"],
};

const ASR_VARIANTS = {
  whisper: [],
  conformer: [],
  canary: ["flash", "base"],
};

const LLM_TYPES = ["phi", "llama", "qwen", "bharat"];

const TTS_TYPES = ["qwen", "chatterbox"];
const TTS_SPEAKERS = {
  qwen: ["Ryan", "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Aiden", "Ono_Anna", "Sohee"],
  chatterbox: ["male", "female"],
};
const TTS_LANGUAGES = {
  f5tts: ["hindi"],
  qwen: ["english"],
  chatterbox: ["hindi", "bengali", "tamil", "telugu", "marathi", "gujarati", "kannada", "malayalam", "english"],
};
const TTS_VARIANTS = {
  qwen: ["base0.6", "base1.7", "custom", "design"],
};

const DEFAULT_CONFIGS = {
  asr: { asr_type: "conformer", variant: null, language: "multi" },
  llm: { llm_type: "llama", prompt: "default" },
  tts: { tts_type: "chatterbox", speaker: "male", language: "english", variant: null },
};

const MODEL_META = {
  asr: {
    key: "asr",
    label: "ASR",
    fullLabel: "Automatic Speech Recognition",
    description: "Converts spoken audio into text. The foundation of any voice-first pipeline — picks up speech and hands clean transcriptions downstream.",
    color: { bg: "#eff6ff", border: "#bfdbfe", accent: "#2563eb", light: "#dbeafe" },
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8"  y1="23" x2="16" y2="23"/>
      </svg>
    ),
  },
  llm: {
    key: "llm",
    label: "LLM",
    fullLabel: "Large Language Model",
    description: "The reasoning brain of the agent. Processes the transcribed text, applies your system prompt, and generates an intelligent response.",
    color: { bg: "#f0fdf4", border: "#bbf7d0", accent: "#15803d", light: "#dcfce7" },
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2.5"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h2M11 8h6M7 12h4M13 12h4"/>
      </svg>
    ),
  },
  tts: {
    key: "tts",
    label: "TTS",
    fullLabel: "Text to Speech",
    description: "Synthesises the LLM's response into natural-sounding audio. Gives your agent a voice — expressive, real-time, and configurable.",
    color: { bg: "#fdf4ff", border: "#e9d5ff", accent: "#7e22ce", light: "#f3e8ff" },
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    ),
  },
};

/* ─── Helpers ──────────────────────────────────────────────────── */
function deriveAgentType(selected) {
  const order = ["asr", "llm", "tts"];
  const parts = order.filter(k => selected[k]).map(k => k.toUpperCase()[0]);
  if (!parts.length) return "";
  return parts.join("+");
}

function isDefaultConfig(key, cfg) {
  const def = DEFAULT_CONFIGS[key];
  return JSON.stringify(cfg) === JSON.stringify(def);
}

function normalizeAsrConfig(config) {
  const type = config.asr_type || "whisper";

  if (type === "whisper") {
    const language = config.language || "english";
    const variants = WHISPER_VARIANTS[language] || [];
    const variant = variants.includes(config.variant)
      ? config.variant
      : (variants.length > 0 ? variants[0] : null);
    return { ...config, asr_type: "whisper", language, variant };
  }

  if (type === "conformer") {
    return { ...config, asr_type: "conformer", language: config.language || "multi", variant: null };
  }

  if (type === "canary") {
    const variant = ASR_VARIANTS.canary.includes(config.variant) ? config.variant : "flash";
    return { ...config, asr_type: "canary", language: config.language || "english", variant };
  }

  return { ...config, asr_type: type, language: config.language || "english", variant: config.variant ?? null };
}

function normalizeTtsConfig(config) {
  const defaults = {
    f5tts: { speaker: null, language: "hindi", variant: null },
    qwen: { speaker: TTS_SPEAKERS.qwen[0], language: "english", variant: "base0.6" },
    chatterbox: { speaker: "male", language: "english", variant: null },
  }[config.tts_type] || { speaker: null, language: "english", variant: null };
  return { ...config, speaker: defaults.speaker, language: defaults.language, variant: defaults.variant };
}

/* ─── ModelCard ────────────────────────────────────────────────── */
function ModelCard({ modelKey, selected, configOpen, onToggle, onGear, configs }) {
  const meta   = MODEL_META[modelKey];
  const col    = meta.color;
  const isSel  = selected[modelKey];
  const isOpen = configOpen === modelKey;
  const isCustom = isSel && !isDefaultConfig(modelKey, configs[modelKey]);

  return (
    <div
      onClick={() => onToggle(modelKey)}
      style={{
        fontFamily: FONT,
        cursor: "pointer",
        borderRadius: 16,
        border: isSel ? `2px solid ${col.accent}` : "2px solid #e2e8f0",
        background: isSel ? col.bg : "#fff",
        padding: "22px 20px 18px",
        position: "relative",
        transition: "border-color .2s, background .2s, box-shadow .2s, transform .15s",
        boxShadow: isSel
          ? `0 0 0 4px ${col.light}, 0 4px 20px rgba(0,0,0,.07)`
          : "0 2px 12px rgba(0,0,0,.05)",
        transform: isSel ? "translateY(-2px)" : "none",
        userSelect: "none",
      }}
    >
      {/* Selected tick badge */}
      {isSel && (
        <div
          style={{
            position: "absolute", top: -10, right: -10,
            width: 26, height: 26, borderRadius: "50%",
            background: col.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 8px ${col.accent}55`,
          }}
          className="ca-badge-in"
        >
          <TickIcon size={14} />
        </div>
      )}

      {/* Icon */}
      <div
        style={{
          width: 52, height: 52, borderRadius: 14,
          background: isSel ? col.light : "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isSel ? col.accent : "#94a3b8",
          marginBottom: 14,
          transition: "background .2s, color .2s",
        }}
      >
        {meta.icon}
      </div>

      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20, color: "#0f172a" }}>
          {meta.label}
        </span>
        <span
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
            padding: "2px 8px", borderRadius: 99,
            background: isSel ? col.light : "#f1f5f9",
            color: isSel ? col.accent : "#94a3b8",
            border: `1px solid ${isSel ? col.border : "#e2e8f0"}`,
            transition: "all .2s",
          }}
        >
          {meta.fullLabel}
        </span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, marginBottom: isSel ? 16 : 0 }}>
        {meta.description}
      </p>

      {/* Settings row — only when selected */}
      {isSel && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onGear(modelKey)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px 5px 9px",
              borderRadius: 8,
              border: `1px solid ${isOpen ? col.accent : (isCustom ? "#22c55e" : "#e2e8f0")}`,
              background: isOpen ? col.bg : (isCustom ? "#f0fdf4" : "#f8fafc"),
              color: isOpen ? col.accent : (isCustom ? "#16a34a" : "#94a3b8"),
              cursor: "pointer",
              fontSize: 12.5,
              fontFamily: FONT,
              fontWeight: 500,
              transition: "all .18s",
            }}
          >
            <GearIcon size={14} spinning={isOpen} />
            Configure
            {isCustom && !isOpen && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#22c55e", display: "inline-block", marginLeft: 2,
              }} />
            )}
          </button>
          {isCustom && (
            <span style={{
              fontSize: 11, color: "#16a34a", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Custom
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ConfigPanel (placeholder shell) ────────────────────────── */
function UseAgentButton({ onLaunch }) {
   const [state, setState] = useState("idle"); // idle | running | success | error

  async function handleClick() {
    if (state !== "idle") return;
    setState("running");
    try {
      await onLaunch(); // onLaunch is already bound to the full agent object
      // navigation happens inside context; show success briefly before redirect
      setState("success");
    } catch {
      setState("idle");
    }
  }

  const btnClass =
    state === "running" ? "agdb-engine-btn agdb-engine-btn-running" :
    state === "success" ? "agdb-engine-btn agdb-engine-btn-success" :
    "agdb-engine-btn agdb-engine-btn-idle";

    return (
      <div className="relative flex items-center justify-center" style={{ width: 66, height: 66 }}>
        {/* Comet orbit ring — visible only while running */}
        {state === "running" && <div className="agdb-comet-ring" />}

        <button
          className={btnClass}
          disabled={state === "running"}
          onClick={handleClick}
          aria-label={state === "running" ? "Launching…" : "Launch agent"}
          title={state === "idle" ? "Start agent" : state === "running" ? "Launching…" : "Launched!"}
        >
          {state === "idle" && (
            /* Engine start icon — ignition key symbol */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" fill="white" stroke="none" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          )}
          {state === "running" && (
            <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <span className="agdb-dot1" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "inline-block" }} />
              <span className="agdb-dot2" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "inline-block" }} />
              <span className="agdb-dot3" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "inline-block" }} />
            </span>
          )}
          {state === "success" && (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      </div>
    );
}

function ConfigPanel({ modelKey, configs, onChange }) {
  const meta = MODEL_META[modelKey];
  const col  = meta.color;
  const cfg  = configs[modelKey];

  const renderSelect = (label, field, options, help) => {
    const value = cfg[field] ?? null;
    return (
      <div>
        <label style={{
          display: "block", fontSize: 10.5, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: ".07em",
          color: "#94a3b8", marginBottom: 6,
        }}>
          {label}
        </label>
        <select
          value={value ?? ""}
          onChange={e => onChange(modelKey, { [field]: e.target.value || null })}
          style={{
            width: "100%", height: 42,
            border: `1.5px solid #e2e8f0`,
            borderRadius: 9,
            padding: "0 12px",
            fontFamily: FONT, fontSize: 13.5, color: "#334155",
            background: "#fff",
            outline: "none",
            transition: "border-color .15s, box-shadow .15s",
            boxSizing: "border-box",
          }}
        >
          <option value="" disabled>Select {label.toLowerCase()}</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {help && <p style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>{help}</p>}
      </div>
    );
  };

  const renderInput = (label, field, placeholder) => {
    const value = cfg[field] ?? "";
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{
          display: "block", fontSize: 10.5, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: ".07em",
          color: "#94a3b8", marginBottom: 6,
        }}>
          {label}
        </label>
        <input
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(modelKey, { [field]: e.target.value })}
          style={{
            width: "100%", minHeight: 42,
            border: "1.5px solid #e2e8f0",
            borderRadius: 9,
            padding: "0 12px",
            fontFamily: FONT, fontSize: 13.5, color: "#334155",
            background: "#fff",
            outline: "none",
            transition: "border-color .15s, box-shadow .15s",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  };

  return (
    <div
      className="ca-config-open"
      style={{
        marginTop: 20,
        borderRadius: 16,
        border: `1.5px solid ${col.border}`,
        background: col.bg,
        overflow: "hidden",
        fontFamily: FONT,
      }}
    >
      <div style={{
        padding: "14px 22px",
        borderBottom: `1px solid ${col.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: col.accent }}><GearIcon size={16} /></span>
          <span style={{ fontFamily: SERIF, fontSize: 17, color: "#0f172a" }}>
            {meta.label} Configuration
          </span>
        </div>
        <button
          onClick={() => onChange(modelKey, DEFAULT_CONFIGS[modelKey])}
          style={{
            fontSize: 12, fontFamily: FONT, fontWeight: 500,
            color: "#94a3b8", background: "none", border: "1px solid #e2e8f0",
            borderRadius: 7, padding: "4px 11px", cursor: "pointer",
            transition: "color .15s, border-color .15s",
          }}
        >
          Reset to default
        </button>
      </div>

      <div style={{ padding: "20px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {modelKey === "asr" && (
          <>
                      {renderSelect("ASR type", "asr_type", ASR_TYPES, "Pick the ASR engine.")}
            {renderSelect("Language", "language", ASR_LANGUAGES[cfg.asr_type] || ASR_LANGUAGES.conformer)}
            {(cfg.asr_type === "whisper" ? WHISPER_VARIANTS[cfg.language] : ASR_VARIANTS[cfg.asr_type])?.length > 0 && (
              renderSelect(
                "Variant",
                "variant",
                cfg.asr_type === "whisper" ? (WHISPER_VARIANTS[cfg.language] || []) : ASR_VARIANTS[cfg.asr_type],
                "Choose the model size or quality."
              )
            )}
          </>
        )}

        {modelKey === "llm" && (
          <>
            {renderSelect("LLM type", "llm_type", LLM_TYPES, "Choose a language model engine.")}
            {renderInput("Prompt", "prompt", "default")}
          </>
        )}

        {modelKey === "tts" && (
          <>
            {renderSelect("TTS type", "tts_type", TTS_TYPES, "Pick the text-to-speech engine.")}
            {(cfg.tts_type === "qwen" || cfg.tts_type === "chatterbox") &&
              renderSelect("Speaker", "speaker", TTS_SPEAKERS[cfg.tts_type] ?? [])}
            {TTS_LANGUAGES[cfg.tts_type] &&
              renderSelect("Language", "language", TTS_LANGUAGES[cfg.tts_type], "Select voice language.")}
            {TTS_VARIANTS[cfg.tts_type] &&
              renderSelect("Variant", "variant", TTS_VARIANTS[cfg.tts_type], "Choose the model variant.")}
          </>
        )}
      </div>

      <div style={{
        padding: "10px 22px 14px",
        fontSize: 12, color: "#94a3b8", fontStyle: "italic",
      }}>
        Fields that are not required for the selected model type are kept null in the payload.
      </div>
    </div>
  );
}

/* ─── AgentTypeBadge ───────────────────────────────────────────── */
function AgentTypeBadge({ agentType }) {
  if (!agentType) return null;
  const parts = agentType.split("+").map(p => ({ A: "ASR", L: "LLM", T: "TTS" }[p] || p));
  const colors = { ASR: "#2563eb", LLM: "#15803d", TTS: "#7e22ce" };
  const bgs    = { ASR: "#eff6ff", LLM: "#f0fdf4", TTS: "#fdf4ff" };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".05em",
            padding: "3px 10px", borderRadius: 99,
            background: bgs[p] || "#f1f5f9",
            color: colors[p] || "#475569",
            fontFamily: FONT,
            className: "ca-badge-in",
          }}>
            {p}
          </span>
          {i < parts.length - 1 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6"/>
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────── */
export default function CreateAgent() {
  const navigate = useNavigate();
  const [name,       setName]       = useState("");
  const [selected,   setSelected]   = useState({ asr: false, llm: false, tts: false });
  const [configOpen, setConfigOpen] = useState(null); // "asr"|"llm"|"tts"|null
  const [configs,    setConfigs]    = useState({
    asr: { ...DEFAULT_CONFIGS.asr },
    llm: { ...DEFAULT_CONFIGS.llm },
    tts: { ...DEFAULT_CONFIGS.tts },
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState(null);
  const [createdAgent, setCreatedAgent] = useState(null);
  const [error,      setError]      = useState("");
  const configRef = useRef(null);
  const { activateAgent } = useAgent();

  const agentType = deriveAgentType(selected);

  function toggleModel(key) {
    setSelected(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // close config panel if deselecting
      if (prev[key]) setConfigOpen(o => (o === key ? null : o));
      return next;
    });
  }

  function toggleGear(key) {
    setConfigOpen(prev => (prev === key ? null : key));
    // scroll to config panel
    setTimeout(() => configRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }

  function updateConfig(key, val) {
    setConfigs(prev => {
      const next = { ...prev[key], ...val };
      if (key === "asr") {
        if (val.asr_type || val.language) {
          return { ...prev, [key]: normalizeAsrConfig(next) };
        }
      }
      if (key === "tts" && val.tts_type) {
        return { ...prev, [key]: normalizeTtsConfig(next) };
      }
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Please give your agent a name."); return; }
    if (!agentType)   { setError("Select at least one model to continue."); return; }

    const payload = {
      name: name.trim(),
      agent_type: agentType,
      asr: selected.asr ? configs.asr : null,
      llm: selected.llm ? configs.llm : null,
      tts: selected.tts ? configs.tts : null,
    };

    setSubmitting(true);
    try {
      const token = localStorage.getItem("agentToken");
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(baseURL + "create", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      let newAgentId = data.agent_id ?? null;
      if (!newAgentId && token) {
        const agentRes = await fetch(baseURL + "agents", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (agentRes.ok) {
          const agentData = await agentRes.json().catch(() => ({}));
          const foundAgent = (agentData.data ?? []).find(a => a.name === name.trim());
          newAgentId = foundAgent?.id ?? null;
        }
      }
      setSubmitted(true);
      setCreatedAgentId(newAgentId);
      setCreatedAgent(newAgentId ? {
        id: newAgentId,
        name: name.trim(),
        agent_type: agentType,
      } : null);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Render ── */
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: FONT }}>

      {/* ── Hero ── */}
      <div
        className="ca-hero"
        style={{ padding: "48px 24px 44px", textAlign: "center", position: "relative", overflow: "hidden" }}
      >
        
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 20% 50%,rgba(255,255,255,.07) 0%,transparent 60%),radial-gradient(ellipse at 80% 30%,rgba(255,255,255,.05) 0%,transparent 55%)",
        }} />
        <button
          onClick={() => navigate("/agents")}
          style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 99, padding: "5px 13px",
            color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            fontFamily: "'Inter',sans-serif", transition: "background .15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.12)"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Dashboard
        </button>
        <div style={{ position: "relative", zIndex: 1 }}>
          
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 99, padding: "5px 14px", marginBottom: 18,
            fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.85)", letterSpacing: ".04em",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              <circle cx="12" cy="12" r="3" fill="white" stroke="none"/>
            </svg>
            Build a Custom Agent
          </div>
          <h1 style={{
            fontFamily: SERIF, fontSize: "clamp(28px,5vw,46px)", fontWeight: 400,
            color: "#fff", lineHeight: 1.18, marginBottom: 14,
            textShadow: "0 2px 20px rgba(0,0,0,.15)",
          }}>
            Design your pipeline,<br />
            <em style={{ color: "#bfdbfe" }}>your way.</em>
          </h1>
          <p style={{
            fontSize: "clamp(13px,2vw,15px)", color: "rgba(255,255,255,.7)",
            maxWidth: 400, margin: "0 auto", fontWeight: 300, lineHeight: 1.65,
          }}>
            Name your agent, pick the models you need, and wire them together into a working voice pipeline.
          </p>
        </div>
      </div>

      {/* ── Form area ── */}
      <div
        className="ca-page-rise"
        style={{ maxWidth: 860, margin: "0 auto", padding: "36px 24px 64px" }}
      >

        {/* ── Agent name ── */}
        <div style={{ marginBottom: 40 }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".08em",
            color: "#94a3b8", marginBottom: 10,
          }}>
            Agent Name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Lively Bot"
            style={{
              width: "100%", height: 50, boxSizing: "border-box",
              border: "2px solid #e2e8f0", borderRadius: 12,
              padding: "0 18px",
              fontFamily: SERIF, fontSize: 18, color: "#0f172a",
              background: "#fff", outline: "none",
              transition: "border-color .15s, box-shadow .15s",
              boxShadow: "0 2px 8px rgba(0,0,0,.04)",
            }}
            onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 4px rgba(59,130,246,.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,.04)"; }}
          />
        </div>

        {/* ── Choose models heading ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 22, color: "#0f172a", fontWeight: 400 }}>
              Choose Models
            </h2>
            {/* Live agent_type pill */}
            {agentType && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#f1f5f9", borderRadius: 10, padding: "5px 12px",
                border: "1px solid #e2e8f0",
              }}>
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  type
                </span>
                <AgentTypeBadge agentType={agentType} />
              </div>
            )}
          </div>
          <p style={{ fontSize: 13.5, color: "#94a3b8", fontWeight: 300 }}>
            Select the components your agent needs. Click a card to include it — click again to remove.
          </p>
        </div>

        {/* ── Model cards grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18, marginBottom: 4 }}>
          {["asr", "llm", "tts"].map(key => (
            <ModelCard
              key={key}
              modelKey={key}
              selected={selected}
              configOpen={configOpen}
              onToggle={toggleModel}
              onGear={toggleGear}
              configs={configs}
            />
          ))}
        </div>

        {/* ── Config panel (accordion) ── */}
        <div ref={configRef}>
          {configOpen && selected[configOpen] && (
            <ConfigPanel
              key={configOpen}
              modelKey={configOpen}
              configs={configs}
              onChange={updateConfig}
            />
          )}
        </div>

        {/* ── Payload preview ── */}
        {agentType && (
          <div style={{
            marginTop: 28, borderRadius: 14,
            border: "1.5px solid #e2e8f0", background: "#f8fafc",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 18px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".07em",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              Payload Preview
            </div>
            <pre style={{
              fontFamily: "'Courier New', monospace", fontSize: 12.5,
              color: "#334155", padding: "16px 18px", margin: 0,
              overflowX: "auto", lineHeight: 1.7, background: "none",
            }}>
              {JSON.stringify({
                name: name || "…",
                agent_type: agentType,
                ...(selected.asr && { asr: configs.asr }),
                ...(selected.llm && { llm: configs.llm }),
                ...(selected.tts && { tts: configs.tts }),
              }, null, 2)}
            </pre>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{
            marginTop: 18, padding: "12px 16px",
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
            color: "#dc2626", fontSize: 13.5,
            display: "flex", alignItems: "center", gap: 9,
            fontFamily: FONT,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── Submit ── */}
        <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSubmit}
            disabled={submitting || submitted}
            style={{
              height: 46, padding: "0 32px",
              borderRadius: 12, border: "none",
              background: submitted
                ? "linear-gradient(135deg,#22c55e,#16a34a)"
                : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
              color: "#fff",
              fontFamily: FONT, fontSize: 14.5, fontWeight: 600,
              cursor: submitting || submitted ? "default" : "pointer",
              boxShadow: submitted
                ? "0 4px 16px rgba(34,197,94,.35)"
                : "0 4px 16px rgba(59,130,246,.35)",
              display: "flex", alignItems: "center", gap: 9,
              transition: "filter .15s, transform .15s",
              opacity: submitting ? .75 : 1,
            }}
            onMouseEnter={e => { if (!submitting && !submitted) e.currentTarget.style.filter = "brightness(1.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            {submitted ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Agent Created!
              </>
            ) : submitting ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{ animation: "ca-gear-spin .8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Creating…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Agent
              </>
            )}
          </button>
        </div>

        {createdAgentId && (
          <div style={{ marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
              <span style={{
                fontFamily: SERIF,
                fontSize: 28,
                fontWeight: 400,
                color: "#0f172a",
                letterSpacing: ".02em",
              }}>
                Start
              </span>
              <UseAgentButton onLaunch={() => activateAgent(createdAgent, navigate)} />
              <span style={{
                fontFamily: SERIF,
                fontSize: 28,
                fontWeight: 400,
                color: "#0f172a",
                letterSpacing: ".02em",
              }}>
                Engine
              </span>
            </div>
            <p style={{
              fontSize: 13,
              color: "#64748b",
              fontWeight: 300,
              marginTop: 8,
            }}>
              Your agent is ready. Launch it now or manage it later from the dashboard.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}