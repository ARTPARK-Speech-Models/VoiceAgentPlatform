import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAgent } from "../context/AgentContext";
import { baseURL } from "../url";
import PageHero from "../components/PageHero";
import AgentCallStats from "../components/AgentCallStats";
import EngineButton from "../components/EngineButton";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { DETAIL_CSS } from "../styles/agentDetailStyle";
import ASRSection from "../components/ASRSection";
import LLMSection from "../components/LLmSection";
import TTSSection from "../components/TTSSection";
import CallHistorySection from "../components/CallHistorySection";
import AsrLatencyComparisonChart from "../components/AsrLatencyComparisonChart";
import VoiceAgentWidget from "../components/VoiceAgentWidget.jsx";
import PromptHistoryModal from "../components/PromptHistoryModal";
import { Button, Card, SectionHeading, ErrorState } from "../components/ui";

// Same section components Create Voice Agent uses -- editing an existing
// agent's config renders identical options/layout.
const SECTION_COMPONENTS = { asr: ASRSection, llm: LLMSection, tts: TTSSection };

// Page-specific CSS (engine button, glass, modal animations...). Updated in
// place when the tag already exists, so an HMR edit to DETAIL_CSS applies
// instead of being skipped by a stale <style> from the previous version.
if (typeof document !== "undefined") {
  let s = document.getElementById("agent-detail-styles");
  if (!s) {
    s = document.createElement("style");
    s.id = "agent-detail-styles";
    document.head.appendChild(s);
  }
  if (s.textContent !== DETAIL_CSS) s.textContent = DETAIL_CSS;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AGENT_TYPE_MAP = {
  "A":     { full: "ASR",             label: "Speech to Text"  },
  "L":     { full: "LLM",             label: "Language Model"  },
  "T":     { full: "TTS",             label: "Text to Speech"  },
  "A+L":   { full: "ASR → LLM",       label: "Audio to Text"   },
  "A+L+T": { full: "ASR → LLM → TTS", label: "Full Pipeline"   },
  "L+T":   { full: "LLM → TTS",       label: "Text to Speech"  },
};

// Matches the ASR/LLM/TTS tab accents on Create Voice Agent
// (blue-600/emerald-600/violet-600).
const STEP_COLORS = {
  ASR: "bg-blue-50 text-blue-700 border-blue-200",
  LLM: "bg-emerald-50 text-emerald-700 border-emerald-200",
  TTS: "bg-violet-50 text-violet-700 border-violet-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseAgentType(code = "") {
  if (AGENT_TYPE_MAP[code]) return AGENT_TYPE_MAP[code];
  const parts = code.split("+").map(p => ({ A: "ASR", L: "LLM", T: "TTS" }[p.trim()] || p.trim()));
  return { full: parts.join(" → "), label: parts.join(" + ") };
}

function formatDateTime(iso) {
  // Date() parses ISO-8601 with "Z" or an explicit offset; an invalid
  // value must not reach Intl.DateTimeFormat (it throws).
  const date = new Date(iso);
  if (isNaN(date)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(date);
}



// Copyable monospace token instead of a bare exposed integer (issue #37).
function AgentIdToken({ id }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(String(id)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy agent ID"
      aria-label={copied ? "Agent ID copied" : `Copy agent ID ${id}`}
      className="inline-flex items-center gap-1.5 font-mono text-sm text-white/90 bg-white/10 border border-white/20 rounded-lg px-2.5 py-0.5 hover:bg-white/15 transition-colors max-w-full"
    >
      <span className="truncate">{id}</span>
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 opacity-80">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// Provider per stage, not just the generic ASR/LLM/TTS label -- so a mixed
// pipeline shows where a user's own models are in use (issue #36).
function PipelineVisual({ code = "", providers = {} }) {
  const steps = code.split("+").map(p => ({ A: "ASR", L: "LLM", T: "TTS" }[p.trim()] || p.trim()));
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold tracking-wide px-3 py-1 rounded-full border whitespace-nowrap ${STEP_COLORS[step] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
            {step}
            {providers[step] && <span className="font-normal opacity-80"> · {providers[step]}</span>}
          </span>
          {i < steps.length - 1 && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Long-text field (system prompt) ─────────────────────────────────────────
// Rendered apart from the kv tiles -- a multi-KB prompt needs wrapping and
// line breaks, not a tile built for short values.
function PromptBlock({ text, headingColor, agentId, onRolledBack }) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isLong = text.length > 160;
  return (
    <div className="pt-2.5 pb-0.5 border-t border-slate-100">
      <div className="flex items-center gap-3 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider m-0" style={{ color: headingColor }}>Prompt</p>
        {/* Version history, diff, and rollback (issue #35). */}
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold rounded-md px-1.5 py-0.5 hover:bg-slate-100"
          style={{ color: headingColor }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
          </svg>
          History
        </button>
      </div>
      {showHistory && (
        <PromptHistoryModal
          agentId={agentId}
          onClose={() => setShowHistory(false)}
          onRolledBack={() => { setShowHistory(false); onRolledBack?.(); }}
        />
      )}
      <div className={`agent-detail-prompt-text relative overflow-hidden text-[13.5px] leading-[1.6] text-slate-700 whitespace-pre-wrap break-words${!expanded && isLong ? " collapsed" : ""}`}>
        {text}
      </div>
      {isLong && (
        <button
          type="button"
          aria-expanded={expanded}
          className="mt-2 inline-flex items-center gap-1.5 border rounded-full text-[12.5px] font-semibold px-3 py-1 transition hover:brightness-95 active:scale-95"
          style={{ color: headingColor, borderColor: `${headingColor}33`, background: `${headingColor}0d` }}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? "Show less" : "Show full prompt"}
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Edit pop-up for one model section ───────────────────────────────────────
// Centred dialog on desktop, bottom sheet on phones. Escape / ✕ / backdrop
// close it (not while saving); focus moves in on open and back on close;
// the page behind doesn't scroll.
function EditModelModal({ title, icon, color, saving, saveError, onSave, onClose, children }) {
  const panelRef = useRef(null);
  const savingRef = useRef(saving);
  const onCloseRef = useRef(onClose);
  useEffect(() => { savingRef.current = saving; onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape" && !savingRef.current) onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${title}`}
        className="bg-slate-50 w-full sm:max-w-3xl max-h-[92dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: color.accent }} aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 m-0">Edit</p>
            <h2 className="text-base font-semibold text-slate-900 m-0 truncate">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        <div className="px-5 py-3.5 bg-white border-t border-slate-200 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          {saveError && <ErrorState className="mb-3" title="Couldn't save changes" message={saveError} />}
          <div className="flex gap-2.5 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="h-10 px-5 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: color.accent }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section card for ASR / LLM / TTS ────────────────────────────────────────
function ModelSection({ title, icon, color, data, delay = 0, sectionKey, agentId, agentName, catalog, onSaved, onPromptRolledBack }) {
  const isNull = !data;
  const { prompt, ...kvData } = data ?? {};

  const [editing, setEditing] = useState(false);
  // LLMSection reads config.mcpURL (camelCase), the backend field is
  // mcp_url -- alias it so a saved value shows up pre-filled.
  const [form, setForm] = useState(() => (
    sectionKey === "llm" && data ? { ...data, mcpURL: data.mcp_url ?? data.mcpURL ?? "" } : (data ?? {})
  ));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function startEdit() {
    setForm(sectionKey === "llm" ? { ...data, mcpURL: data.mcp_url ?? data.mcpURL ?? "" } : { ...data });
    setSaveError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError("");
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const { mcpURL, ...rest } = form;
      const payload = sectionKey === "llm" ? { ...rest, mcp_url: mcpURL || null } : form;
      const token = localStorage.getItem("agentToken");
      const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${baseURL}api/update/agent/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ body: { [sectionKey]: payload } }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `HTTP ${res.status}`);
      }
      onSaved(sectionKey, payload);
      setEditing(false);
    } catch (e) {
      setSaveError(e.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  const SectionComp = SECTION_COMPONENTS[sectionKey];

  return (
    <>
    {!isNull && editing && (
      <EditModelModal
        title={title}
        icon={icon}
        color={color}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        onClose={cancelEdit}
      >
        <SectionComp id={`edit-${sectionKey}`} config={form} onChange={setForm} catalog={catalog} agentName={agentName} />
      </EditModelModal>
    )}
    <div
      className="agent-detail-section-rise relative min-w-0 bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-sm hover:shadow-md transition-shadow before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--accent)] before:opacity-90"
      style={{ animationDelay: `${delay}s`, "--accent": color.accent, "--border": color.border }}
    >
      <div
        className="flex items-center gap-2.5 pl-5 pr-3.5 py-2.5 border-b border-slate-100"
        style={{ background: `linear-gradient(90deg, ${color.bg}, #fff 85%)` }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ background: color.accent, boxShadow: `0 6px 16px -6px ${color.accent}` }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <h3 className="text-[15px] font-semibold m-0 min-w-0 leading-snug" style={{ color: color.text }}>{title}</h3>
        {isNull ? (
          <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[12.5px] whitespace-nowrap">
            Not configured
          </span>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit ${title}`}
            className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)] bg-white border border-[var(--border)] rounded-lg px-3 py-1 transition hover:bg-[var(--accent)] hover:text-white hover:shadow-md active:scale-95"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            Edit
          </button>
        )}
      </div>

      <div className="pl-5 pr-3.5 sm:pl-5 sm:pr-4 pt-3 pb-3">
        {isNull ? (
          <p className="text-sm text-slate-500 m-0">This module is not part of the agent pipeline.</p>
        ) : (
          <>
            {/* Stacked label-over-value tiles -- inline label+value rows
                misaligned because label lengths vary a lot. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 pb-2">
              {Object.entries(kvData).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 transition-colors hover:bg-white hover:border-slate-200 min-w-0">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider truncate" style={{ color: color.accent }} title={k.replace(/_/g, " ")}>{k.replace(/_/g, " ")}</span>
                  {v === null || v === undefined || v === "" ? (
                    // TTS language and ASR keywords unset is a likely
                    // misconfiguration, not just an optional empty field --
                    // flag those amber with a direct Fix link (issue #33).
                    (sectionKey === "tts" && k === "language") || (sectionKey === "asr" && k === "keywords") ? (
                      <span className="self-start inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[12.5px]">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M12 9v4" /><path d="M12 17h.01" />
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        </svg>
                        Not set
                        <button type="button" onClick={startEdit} className="font-semibold underline text-amber-700" aria-label={`Fix ${k.replace(/_/g, " ")}`}>Fix</button>
                      </span>
                    ) : (
                      <span className="self-start px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[12.5px]">Not set</span>
                    )
                  ) : (
                    <span className="text-[13.5px] font-medium text-slate-800 break-words leading-snug">{String(v)}</span>
                  )}
                </div>
              ))}
            </div>
            {prompt && (
              <PromptBlock
                text={prompt}
                headingColor={color.accent}
                agentId={agentId}
                onRolledBack={onPromptRolledBack}
              />
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}

// ─── Evaluation-mode toggle (issue #73) ──────────────────────────────────────
// Read once at call connect on the backend (?eval_mode=1).
function EvalModeToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex items-center gap-2 pl-3.5 pr-1.5 py-1.5 rounded-full border transition-colors ${
        on ? "border-amber-300/60 bg-amber-400/15" : "border-white/20 bg-white/10 hover:bg-white/15"
      }`}
    >
      <span className={`text-[12.5px] font-medium whitespace-nowrap ${on ? "text-amber-200" : "text-white/90"}`}>Evaluation mode</span>
      <span className={`relative w-[30px] h-[18px] rounded-full flex-shrink-0 transition-colors ${on ? "bg-amber-500" : "bg-white/30"}`} aria-hidden="true">
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-[left] ${on ? "left-[14px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────
function DeleteModal({ agentName, onConfirm, onClose }) {
  const [input,    setInput]    = useState("");
  const [deleting, setDeleting] = useState("");  // "" | "busy" | "done" | "error"
  const [errMsg,   setErrMsg]   = useState("");
  const [closing,  setClosing]  = useState(false);
  const [shake,    setShake]    = useState(false);
  const inputRef = useRef(null);

  const matches = input.trim().toLowerCase() === agentName.trim().toLowerCase();

  const triggerClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 190);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && deleting !== "busy" && deleting !== "done") triggerClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [triggerClose, deleting]);

  async function handleDelete() {
    if (!matches) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      return;
    }
    setDeleting("busy");
    setErrMsg("");
    try {
      await onConfirm();
      setDeleting("done");
    } catch (e) {
      setErrMsg(e.message || "Deletion failed.");
      setDeleting("error");
    }
  }

  return (
    <div className="agent-detail-overlay" onClick={e => { if (e.target === e.currentTarget) triggerClose(); }}>
      <div className={`agent-detail-modal${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="delete-agent-title">
        {deleting === "done" ? (
          <div className="px-7 py-11 text-center flex flex-col items-center gap-3.5" role="status">
            <div className="agent-detail-pop w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[17px] font-semibold text-slate-900 m-0">Agent deleted</p>
            <p className="text-sm text-slate-500 m-0">Redirecting you back…</p>
          </div>
        ) : (
          <>
            <div className="px-6 pt-5 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-[38px] h-[38px] rounded-xl bg-red-50 border border-red-200 flex items-center justify-center" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider m-0">Danger zone</p>
                  <h2 id="delete-agent-title" className="text-[17px] font-semibold text-slate-900 m-0">Delete agent</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={triggerClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 flex items-center justify-center"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-6 pt-5 pb-6">
              <p className="text-[13.5px] text-slate-600 leading-relaxed mb-4 mt-0">
                This action is <strong className="text-red-600">permanent</strong> and cannot be undone.
                The agent <strong className="text-slate-900">"{agentName}"</strong> and all its configuration will be removed.
              </p>

              <label htmlFor="delete-agent-confirm" className="block text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Type the agent name to confirm
              </label>
              <input
                id="delete-agent-confirm"
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleDelete(); }}
                placeholder={agentName}
                autoComplete="off"
                className={`agent-detail-confirm-input${shake ? " agent-detail-shake" : ""}${matches ? " match" : ""}`}
              />

              {input.length > 0 && (
                <p className={`text-xs mt-2 mb-0 ${matches ? "text-green-600" : "text-amber-600"}`} aria-live="polite">
                  {matches ? "✓ Name matches — ready to delete" : "Name doesn't match yet"}
                </p>
              )}

              {deleting === "error" && errMsg && <ErrorState className="mt-3" title="Couldn't delete agent" message={errMsg} />}

              <div className="flex gap-2.5 mt-5">
                <Button variant="secondary" className="flex-1 !h-[42px]" onClick={triggerClose}>Cancel</Button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting === "busy"}
                  aria-disabled={!matches}
                  className={`flex-1 h-[42px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    matches
                      ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  } disabled:cursor-not-allowed`}
                >
                  {deleting === "busy" ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                      </svg>
                      Delete agent
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="w-full px-4 sm:px-6 pt-7 pb-16 flex flex-col gap-6" aria-label="Loading agent">
      <div className="grid gap-3 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="agent-detail-skeleton h-[72px] !rounded-2xl" />)}
      </div>
      <div className="agent-detail-skeleton h-40 !rounded-2xl" />
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="agent-detail-skeleton h-[54px] !rounded-none" />
            <div className="px-5 py-4 flex flex-col gap-2.5">
              <div className="agent-detail-skeleton h-3.5 w-[70%]" />
              <div className="agent-detail-skeleton h-3.5 w-1/2" />
              <div className="agent-detail-skeleton h-3.5 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const MODEL_ICONS = {
  asr: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  llm: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <rect x="2" y="3" width="20" height="14" rx="2.5"/>
      <path d="M8 21h8M12 17v4"/>
      <path d="M7 8h2M11 8h6M7 12h4M13 12h4"/>
    </svg>
  ),
  tts: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  ),
};

const MODEL_COLORS = {
  asr: { bg: "#eff6ff", border: "#bfdbfe", accent: "#2563eb", text: "#1d4ed8" },
  llm: { bg: "#ecfdf5", border: "#a7f3d0", accent: "#059669", text: "#047857" },
  tts: { bg: "#f5f3ff", border: "#ddd6fe", accent: "#7c3aed", text: "#6d28d9" },
};

const MODEL_TITLES = {
  asr: "Automatic Speech Recognition",
  llm: "Large Language Model",
  tts: "Text to Speech",
};

function OverviewRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 border-t border-white/10 min-w-0">
      <span className="text-[13px] text-white/80 flex-shrink-0">{label}</span>
      <div className="min-w-0 max-w-full flex justify-end">{children}</div>
    </div>
  );
}

export default function AgentDetail() {
  const { id }       = useParams();                 // agent id from URL
  const navigate     = useNavigate();
  const { activateAgent, deactivateAgent, activeAgent } = useAgent();
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  const [agent,       setAgent]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showDelete,  setShowDelete]  = useState(false);
  const [catalog,     setCatalog]     = useState(null);
  // Evaluation mode (issue #73) -- owned here (hero toggle, next to
  // Start/Stop) and passed to the call panel as a controlled prop.
  const [evalMode, setEvalMode] = useState(false);
  // Accumulated ASR-eval turns for AsrLatencyComparisonChart -- live-only,
  // fed by the widget's onAsrEval; a running trend for this page visit.
  const [asrEvalPoints, setAsrEvalPoints] = useState([]);
  // Live call numbers from the widget, overlaid on the saved stats;
  // statsVersion bumps after a call ends to refetch stats + history.
  const [liveCall, setLiveCall] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const wasOnCallRef = useRef(false);
  useEffect(() => {
    const onCall = !!liveCall?.onCall;
    if (wasOnCallRef.current && !onCall) {
      // The call row is written as the socket closes -- refetch shortly
      // after, then once more in case the save lands a little later.
      const t1 = setTimeout(() => setStatsVersion((v) => v + 1), 1500);
      const t2 = setTimeout(() => setStatsVersion((v) => v + 1), 5000);
      wasOnCallRef.current = onCall;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    wasOnCallRef.current = onCall;
  }, [liveCall?.onCall]);
  // provider -> model name, for the chart legend.
  const [asrProviderModels, setAsrProviderModels] = useState({});
  const handleAsrEval = useCallback(({ results }) => {
    setAsrEvalPoints((prev) => {
      const point = { turnIndex: prev.length + 1 };
      results.forEach((r) => { point[r.provider] = r.latency_ms; });
      return [...prev, point];
    });
    setAsrProviderModels((prev) => {
      const next = { ...prev };
      let changed = false;
      results.forEach((r) => {
        if (r.model && next[r.provider] !== r.model) { next[r.provider] = r.model; changed = true; }
      });
      return changed ? next : prev;
    });
  }, []);
  // Mount/animate split so the eval chart transitions both in and out:
  // showChart = DOM presence (kept 300ms after evalMode goes off),
  // chartActive = open/closed classes, flipped a frame after mount.
  const [showChart, setShowChart] = useState(evalMode);
  const [chartActive, setChartActive] = useState(false);
  useEffect(() => {
    if (evalMode) {
      Promise.resolve().then(() => setShowChart(true));
      const raf = requestAnimationFrame(() => setChartActive(true));
      return () => cancelAnimationFrame(raf);
    }
    Promise.resolve().then(() => setChartActive(false));
    const t = setTimeout(() => setShowChart(false), 300);
    return () => clearTimeout(t);
  }, [evalMode]);

  // ── Provider/model catalog -- same source Create Voice Agent uses. ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(baseURL + "api/catalog", {
          headers: { "ngrok-skip-browser-warning": "true" },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCatalog(data);
      } catch {
        /* SectionComp shows its own "Loading…" while catalog is null. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch agent ─────────────────────────────────────────────────────────────
  const loadAgentData = useCallback(async () => {
    const token   = localStorage.getItem("agentToken");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res     = await fetch(`${baseURL}api/agent/${encodeURIComponent(id)}`, {
      headers,
      credentials: "include",
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `HTTP ${res.status}`);
    }
    return (await res.json()).data;
  }, [id]);

  // State-writing version for event handlers (prompt rollback, retry).
  const fetchAgent = useCallback(async () => {
    try {
      setAgent(await loadAgentData());
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load agent.");
    }
  }, [loadAgentData]);

  const retryLoad = useCallback(async () => {
    setError("");
    setLoading(true);
    await fetchAgent();
    setLoading(false);
  }, [fetchAgent]);

  useEffect(() => {
    let cancelled = false;
    loadAgentData()
      .then(data => { if (!cancelled) setAgent(data); })
      .catch(e => { if (!cancelled) setError(e.message || "Failed to load agent."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAgentData]);

  // ── Start agent ──────────────────────────────────────────────────────────────
  const handleLaunch = useCallback(async () => {
    await activateAgent(agent, navigate);
  }, [agent, activateAgent, navigate]);

  // ── Model section saved -- merge the PATCHed section into local state. ──
  const handleSectionSaved = useCallback((sectionKey, newData) => {
    setAgent(prev => ({ ...prev, [sectionKey]: newData }));
  }, []);

  // ── Delete agent ─────────────────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    const token   = localStorage.getItem("agentToken");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${baseURL}api/delete/agent/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `HTTP ${res.status}`);
    }
    // Brief pause so the success tick is visible, then go back
    await new Promise(r => setTimeout(r, 1200));
    navigate(-1);
  }, [id, navigate]);

  const typeInfo = agent ? parseAgentType(agent.agent_type) : null;
  const isThisAgentActive = !!(activeAgent && agent && String(activeAgent.id) === String(agent.id));

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="lg:pl-[var(--sidebar-w)] min-h-screen bg-slate-50 flex flex-col overflow-x-clip"
      style={{ "--sidebar-w": `${sidebarWidth}px` }}
    >
      <Sidebar />

      {/* ── Hero -- agents are reached from the Agents page. ── */}
      <PageHero crumbs={["Agents", "Agent Details"]} active={isThisAgentActive} compact>
        {loading ? (
          <div className="mt-2 space-y-3" aria-hidden="true">
            <div className="agent-detail-skeleton-dark h-10 w-2/3 sm:w-2/5" />
            <div className="agent-detail-skeleton-dark h-5 w-1/3 sm:w-1/5" />
          </div>
        ) : agent ? (
          // Name/badges · Start+eval · Overview. Stacks on phones, two
          // columns (Overview drops below) on tablets, three on desktop.
          <div className="grid gap-5 items-center grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)]">
            {/* Column 1: avatar + name + type/status pills */}
            <div className="min-w-0">
              <div className="flex items-center gap-3.5 mb-3 min-w-0">
                <div className="agent-detail-glass w-[52px] h-[52px] rounded-2xl flex-shrink-0 flex items-center justify-center text-[22px] font-bold text-white" aria-hidden="true">
                  {agent.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <h1 className="text-[26px] sm:text-[30px] lg:text-[34px] font-semibold text-white leading-tight tracking-tight m-0 break-words min-w-0 [text-shadow:0_2px_16px_rgba(0,0,0,.15)]">
                  {agent.name}
                </h1>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[13.5px] font-medium px-3 py-1 rounded-full bg-white/10 text-white/90 border border-white/20">
                  {typeInfo.label}
                </span>
                {/* Online/offline -- only pulses when online. */}
                <span
                  className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                    isThisAgentActive
                      ? "bg-green-400/15 border-green-400/45 shadow-[0_0_18px_-4px_rgba(74,222,128,.6)]"
                      : "bg-white/10 border-white/20"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isThisAgentActive ? "bg-green-400 animate-pulse" : "bg-slate-300"}`} aria-hidden="true" />
                  <span className="text-[13.5px] font-medium whitespace-nowrap text-white/90">
                    {isThisAgentActive ? "Online" : "Offline"}
                  </span>
                </span>
              </div>
            </div>

            {/* Column 2: Start/Stop + evaluation-mode toggle */}
            <div className="flex flex-row md:flex-col items-center justify-center gap-4 md:gap-2">
              <EngineButton onLaunch={handleLaunch} onStop={deactivateAgent} isActive={isThisAgentActive} callState={isThisAgentActive ? liveCall?.state ?? null : null} />
              <EvalModeToggle on={evalMode} onToggle={() => setEvalMode((v) => !v)} />
            </div>

            {/* Column 3: Overview (glass). No min-width -- it shrinks with
                the viewport instead of forcing horizontal scroll. */}
            <div className="min-w-0 md:col-span-2 lg:col-span-1 flex lg:justify-end">
              <div className="agent-detail-glass w-full lg:max-w-[560px] rounded-2xl px-4 sm:px-5 pt-3.5 pb-2 min-w-0">
                <p className="text-[11.5px] font-bold uppercase tracking-widest text-white/80 mb-1.5 mt-0">Overview</p>
                <OverviewRow label="Name">
                  <span className="text-[14.5px] text-white font-medium break-words text-right">{agent.name}</span>
                </OverviewRow>
                <OverviewRow label="Agent ID">
                  <AgentIdToken id={id} />
                </OverviewRow>
                <OverviewRow label="Pipeline">
                  <PipelineVisual
                    code={agent.agent_type}
                    providers={{ ASR: agent.asr?.provider, LLM: agent.llm?.provider, TTS: agent.tts?.provider }}
                  />
                </OverviewRow>
                <OverviewRow label="Created">
                  <span className="text-[14.5px] text-white/90">{formatDateTime(agent.created_at)}</span>
                </OverviewRow>
              </div>
            </div>
          </div>
        ) : null}
      </PageHero>

      {/* ── Content ── */}
      {loading && <DetailSkeleton />}

      {!loading && error && !agent && (
        <div className="w-full px-4 sm:px-6 pt-7 pb-16">
          <ErrorState title="Couldn't load this agent" message={error} onRetry={retryLoad} />
        </div>
      )}

      {!loading && agent && (
        // Full-width content; pb-32 keeps the bottom-right "Talk to" launcher
        // clear of the Delete button at the end of the page.
        <div className="agent-detail-page-rise w-full min-w-0 px-4 sm:px-6 pt-7 pb-32 flex flex-col gap-8">
          {/* ASR latency comparison -- evaluation mode only, live-only. */}
          {showChart && (
            <div
              className={`origin-top transition-all duration-300 ease-out ${chartActive ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-[.98]"}`}
            >
              <AsrLatencyComparisonChart points={asrEvalPoints} providerModels={asrProviderModels} />
            </div>
          )}

          <AgentCallStats agentId={id} live={liveCall} refreshKey={statsVersion} />
          <CallHistorySection key={statsVersion} agentId={id} delay={0.14} maxCalls={5} />

          {/* ── Model configuration: ASR -> LLM -> TTS side by side in
              pipeline order; Edit opens the form in a pop-up. ── */}
          <section aria-labelledby="model-config-heading">
            <SectionHeading
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>
                </svg>
              }
              title={<span id="model-config-heading">Model configuration</span>}
              description="The speech, language and voice models this agent runs, in pipeline order."
            />
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start">
              {["asr", "llm", "tts"].map((key, i) => (
                <ModelSection
                  key={key}
                  sectionKey={key}
                  agentId={id}
                  agentName={agent.name}
                  catalog={catalog?.[key]}
                  title={MODEL_TITLES[key]}
                  icon={MODEL_ICONS[key]}
                  color={MODEL_COLORS[key]}
                  data={agent[key]}
                  delay={0.21 + i * 0.07}
                  onSaved={handleSectionSaved}
                  onPromptRolledBack={key === "llm" ? fetchAgent : undefined}
                />
              ))}
            </div>
          </section>

          {/* ── Danger zone ── */}
          <Card className="agent-detail-section-rise overflow-hidden !border-red-200 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-20px_rgba(220,38,38,.35)]" style={{ animationDelay: ".35s" }}>
            <div className="px-5 py-3.5 bg-gradient-to-r from-red-50 to-white border-b border-red-100 flex items-center gap-3">
              <div className="w-[34px] h-[34px] rounded-xl bg-white border border-red-200 flex items-center justify-center" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h2 className="text-[14.5px] font-semibold text-red-600 m-0">Danger zone</h2>
            </div>
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-slate-900 mt-0 mb-0.5">Delete this agent</p>
                <p className="text-[13.5px] text-slate-500 m-0 leading-normal">
                  Permanently removes the agent and all its configuration. This cannot be undone.
                </p>
              </div>
              <Button variant="danger" className="self-start sm:self-auto flex-shrink-0" onClick={() => setShowDelete(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete agent
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── "Talk to <agent>" -- always on this agent's page (and only
          here). If the agent isn't the active one, the launcher activates
          it first, then opens the call panel. ── */}
      {!loading && agent && (
        <VoiceAgentWidget
          agent={agent}
          evalMode={evalMode}
          onAsrEval={handleAsrEval}
          onLiveUpdate={setLiveCall}
        />
      )}

      {/* ── Delete modal ── */}
      {showDelete && (
        <DeleteModal
          agentName={agent?.name ?? ""}
          onConfirm={handleDeleteConfirm}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
