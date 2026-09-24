import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ASRSection from "../components/ASRSection";
import LLMSection from "../components/LLmSection";
import TTSSection from "../components/TTSSection";

import { CustomerCare } from "../constants";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { Badge, Button, Card, ErrorState } from "../components/ui";
import { useSidebarCollapsed, setSidebarCollapsed, readSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";
import { alignToCatalog } from "../utils/catalogDefaults";

// Flow builder: the same config as the classic form at /create, shown as a
// node map. The graph doesn't change pipeline order -- the real pipeline is
// always VAD -> ASR -> LLM -> TTS -- clicking a node opens that stage's form
// (the exact section components /create uses) in the stage panel below.
// `?template=<prompt name>` preselects that catalog prompt, like /create.

const DEFAULT_GREETING = "Hello! I'm your virtual assistant. How can I help you today?";
const DEFAULT_END_CALL = "Thank you for calling. Have a wonderful day! Goodbye.";

/* ─── Stages ──────────────────────────────────────────────────────── */
// Tailwind classes are spelled out in full so the JIT picks them up.
const STAGES = [
  {
    id: "identity", label: "Identity", name: "Agent identity",
    description: "Name your agent and set how it opens and closes calls.",
    color: "#334155",
    tile: "bg-slate-800 text-white",
    text: "text-slate-700",
    headerBg: "from-slate-100 to-white",
    selected: "border-slate-500 ring-4 ring-slate-400/25",
    icon: (size = 18) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: "asr", label: "ASR", name: "Speech recognition",
    description: "How the agent listens to callers and transcribes their speech.",
    color: "#2563eb",
    tile: "bg-blue-600 text-white",
    text: "text-blue-700",
    headerBg: "from-blue-50 to-white",
    selected: "border-blue-500 ring-4 ring-blue-500/25",
    icon: (size = 18) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
  },
  {
    id: "llm", label: "LLM", name: "Language model",
    description: "The model and system prompt that decide what your agent says.",
    color: "#059669",
    tile: "bg-emerald-600 text-white",
    text: "text-emerald-700",
    headerBg: "from-emerald-50 to-white",
    selected: "border-emerald-500 ring-4 ring-emerald-500/25",
    icon: (size = 18) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2.5"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h2M11 8h6M7 12h4M13 12h4"/>
      </svg>
    ),
  },
  {
    id: "tts", label: "TTS", name: "Text to speech",
    description: "The voice, language and pace your agent speaks with.",
    color: "#7c3aed",
    tile: "bg-violet-600 text-white",
    text: "text-violet-700",
    headerBg: "from-violet-50 to-white",
    selected: "border-violet-500 ring-4 ring-violet-500/25",
    icon: (size = 18) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    ),
  },
];
const STAGE_BY_ID = Object.fromEntries(STAGES.map((s, i) => [s.id, { ...s, index: i }]));

// Canvas layout: one row when the canvas is wide enough, one column
// otherwise (phones / narrow windows).
const NODE_W = 272;
const ROW_GAP = 64;
const COL_GAP = 188;
const ROW_MIN_WIDTH = 860;
const CANVAS_H = { row: 270, column: 640 };

const INPUT_CLASS =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400";

const CheckIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

function StatusBadge({ status }) {
  if (status === "required") return <Badge tone="red">Required</Badge>;
  if (status === "configured") return <Badge tone="green"><CheckIcon size={10} /> Configured</Badge>;
  return <Badge tone="neutral">Default</Badge>;
}

const STATUS_TEXT = { required: "Required", configured: "Configured", default: "Using defaults" };

/* ─── Canvas node ─────────────────────────────────────────────────── */
function PipelineNode({ data }) {
  const stage = STAGE_BY_ID[data.kind];
  const vertical = data.orientation === "column";
  // Source handle: a small filled dot in the stage colour; the target handle
  // is invisible so the incoming edge's arrowhead meets the card edge.
  const sourceStyle = { width: 9, height: 9, background: stage.color, border: "2px solid #fff" };
  const targetStyle = { width: 1, height: 1, minWidth: 0, minHeight: 0, background: "transparent", border: 0 };
  return (
    <div
      className={`pipeline-node rounded-2xl border bg-white cursor-pointer transition-[box-shadow,border-color] duration-200 ${
        data.selected ? `${stage.selected} shadow-lg` : "border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"
      }`}
      style={{ width: NODE_W }}
    >
      {data.index > 0 && (
        <Handle type="target" position={vertical ? Position.Top : Position.Left} isConnectable={false} style={targetStyle} />
      )}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stage.tile}`}>{stage.icon(18)}</div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 leading-none">Step {data.index + 1}</p>
            <p className={`text-base font-semibold leading-tight mt-1 ${stage.text}`}>{stage.label}</p>
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>
      <div className="mx-4 mt-3 mb-4 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
        <p className={`text-sm font-semibold leading-snug break-words line-clamp-1 ${data.titleMuted ? "text-slate-400 italic font-medium" : "text-slate-900"}`}>
          {data.title}
        </p>
        <p className="text-xs text-slate-500 leading-snug mt-0.5 break-all line-clamp-2">{data.subtitle}</p>
      </div>
      {!vertical && data.detail && (
        <p className="px-4 -mt-2 pb-4 text-xs text-slate-500 leading-snug line-clamp-1">{data.detail}</p>
      )}
      {data.index < STAGES.length - 1 && (
        <Handle type="source" position={vertical ? Position.Bottom : Position.Right} isConnectable={false} style={sourceStyle} />
      )}
    </div>
  );
}

const nodeTypes = { pipeline: PipelineNode };

// Re-fit the view whenever the canvas resizes or the layout changes, so the
// four nodes always fill the width instead of sitting small in the middle.
function AutoFit({ layoutKey }) {
  const { fitView } = useReactFlow();
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (initialized && width && height) fitView({ padding: 0.06, maxZoom: 1 });
  }, [fitView, width, height, initialized, layoutKey]);
  return null;
}

/* ─── Toggle switch (real button, keyboard + screen-reader friendly) ─ */
function Switch({ checked, onChange, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-9 h-5 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${checked ? "bg-blue-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/* ─── Greeting / end-call message field ────────────────────────────── */
function MessageField({ id, label, help, custom, onCustomChange, value, onValueChange }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        <div className="flex items-center gap-2">
          <span id={`${id}-switch`} className="text-xs font-medium text-slate-600">Customise</span>
          <Switch checked={custom} onChange={onCustomChange} labelledBy={`${id}-switch`} />
        </div>
      </div>
      <div className="p-4">
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={e => onValueChange(e.target.value)}
          disabled={!custom}
          aria-describedby={`${id}-help`}
          className={`${INPUT_CLASS} resize-none ${
            custom ? "bg-white border-slate-300 text-slate-800" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        />
        <p id={`${id}-help`} className="text-xs text-slate-500 mt-1.5">
          {help}{!custom && " Turn on Customise to edit it."}
        </p>
      </div>
    </div>
  );
}

/* ─── Identity form (agent name, greeting/end-call, response delay) ── */
function IdentityForm({ nameInputRef, agentName, setAgentName, customGreeting, setCustomGreeting, greetingMsg, setGreetingMsg, customEndCall, setCustomEndCall, endCallMsg, setEndCallMsg, responseDelay, setResponseDelay }) {
  const hasName = Boolean(agentName.trim());
  const delayFeel = responseDelay <= 500 ? "Natural" : responseDelay <= 1500 ? "Thoughtful" : "Slow";
  return (
    <div className="p-5 sm:p-6 flex flex-col gap-6">
      <div>
        <label htmlFor="flow-agent-name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Agent name <span className="text-red-600" aria-hidden="true">*</span>
        </label>
        <input
          ref={nameInputRef}
          id="flow-agent-name"
          type="text"
          name="x-agent-label-noautofill"
          autoComplete="off"
          required
          aria-required="true"
          aria-describedby="flow-agent-name-help"
          value={agentName}
          onChange={e => setAgentName(e.target.value)}
          placeholder="e.g. Aria, HealthBot, SalesBot…"
          className={`${INPUT_CLASS} bg-white border-slate-300 text-base font-semibold tracking-tight text-slate-900 py-3 placeholder:font-normal placeholder:text-sm`}
        />
        <p id="flow-agent-name-help" className={`text-xs mt-1.5 flex items-center gap-1 ${hasName ? "text-emerald-700" : "text-slate-500"}`}>
          {hasName ? (
            <>
              <CheckIcon size={11} />
              <span>Agent will be identified as <strong>"{agentName.trim()}"</strong></span>
            </>
          ) : (
            "Required. Shown on your Agents page and in call history."
          )}
        </p>
      </div>

      <MessageField
        id="flow-greeting-message"
        label="Greeting message"
        help="Spoken at the start of every call."
        custom={customGreeting}
        onCustomChange={setCustomGreeting}
        value={greetingMsg}
        onValueChange={setGreetingMsg}
      />

      <MessageField
        id="flow-end-call-message"
        label="End call message"
        help="Spoken just before the agent hangs up."
        custom={customEndCall}
        onCustomChange={setCustomEndCall}
        value={endCallMsg}
        onValueChange={setEndCallMsg}
      />

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <label htmlFor="flow-response-delay" className="text-sm font-medium text-slate-700">Response delay</label>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4">
            <input
              id="flow-response-delay"
              type="range"
              min={250} max={3000} step={50}
              value={responseDelay}
              onChange={e => setResponseDelay(Number(e.target.value))}
              aria-describedby="flow-response-delay-help"
              aria-valuetext={`${responseDelay} milliseconds (${delayFeel})`}
              className="flex-1 min-w-0 accent-blue-600"
            />
            <output htmlFor="flow-response-delay" className="w-20 flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg text-center py-2 text-sm font-semibold text-blue-700 tabular-nums">
              {responseDelay}ms
            </output>
          </div>
          <div className="flex items-start justify-between gap-3 mt-2">
            <p id="flow-response-delay-help" className="text-xs text-slate-500">
              How long the agent waits after the caller finishes speaking before it replies.
            </p>
            <Badge tone="blue" className="flex-shrink-0">{delayFeel}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function CreateVoiceAgentFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requestedTemplate] = useState(() => searchParams.get("template"));
  // { name, prompt } once applied, or { name, missing: true }.
  const [template, setTemplate] = useState(null);

  const [agentName, setAgentName] = useState("");
  const [customGreeting, setCustomGreeting] = useState(false);
  const [customEndCall, setCustomEndCall] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState(DEFAULT_GREETING);
  const [endCallMsg, setEndCallMsg] = useState(DEFAULT_END_CALL);
  const [responseDelay, setResponseDelay] = useState(1000);
  const [asrConfig, setAsrConfig] = useState({
    provider: "Vaani",
    model: "conformer",
    keywords: [],
    end_of_turn_confidence: 0.65,
    end_of_turn_timeout: 500,
    min_speech_duration: 100,
  });
  const [llmConfig, setLlmConfig] = useState({
    provider: "Vaani",
    model: "Gemini-2.5-flash-lite",
    prompt: CustomerCare,
    temperature: 0.5,
    mcp_url: null,
    max_tokens: 258,
  });
  const [ttsConfig, setTtsConfig] = useState({
    provider: "Vaani",
    model: "Kokoro",
    language: "English",
    speed: 1.0,
    speaker_audio: "af_heart",
  });
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogKey, setCatalogKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState("identity");
  // Stages the user has opened and moved on from at least once.
  const [configured, setConfigured] = useState(() => new Set());
  const [orientation, setOrientation] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= 1024 ? "row" : "column",
  );

  const selectedRef = useRef("identity");
  const panelRef = useRef(null);
  const panelHeadingRef = useRef(null);
  const nameInputRef = useRef(null);
  const createButtonRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const pendingRef = useRef(null); // { scroll, focus } to apply after a stage change
  const templateAppliedRef = useRef(false);

  const appSidebarCollapsed = useSidebarCollapsed();
  const appSidebarWidth = appSidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  // The node canvas wants the room -- collapse the app Sidebar on entry,
  // restore whatever the user had before on the way out (the flag is
  // global, shared via localStorage).
  useEffect(() => {
    const wasCollapsed = readSidebarCollapsed();
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(wasCollapsed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(baseURL + "api/catalog", { headers: { "ngrok-skip-browser-warning": "true" }, credentials: "include" })
      .then(res => { if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`); return res.json(); })
      .then(data => {
        if (cancelled) return;
        setCatalog(data);
        // Default to what the catalog actually offers (see alignToCatalog).
        setAsrConfig(prev => alignToCatalog("asr", prev, data));
        setLlmConfig(prev => alignToCatalog("llm", prev, data));
        setTtsConfig(prev => alignToCatalog("tts", prev, data));
        // Preselect the requested template's prompt, once.
        if (requestedTemplate && !templateAppliedRef.current) {
          templateAppliedRef.current = true;
          const match = (data?.llm?.prompts ?? []).find(p => p.name === requestedTemplate);
          if (match) {
            setLlmConfig(prev => ({ ...prev, prompt: match.prompt }));
            setTemplate({ name: match.name, prompt: match.prompt });
          } else {
            setTemplate({ name: requestedTemplate, missing: true });
          }
        }
      })
      .catch(e => { if (!cancelled) setCatalogError(e.message || "Failed to load provider/model options."); });
    return () => { cancelled = true; };
  }, [catalogKey, requestedTemplate]);

  const retryCatalog = () => {
    setCatalogError("");
    setCatalogKey(k => k + 1);
  };

  // Clearing an untouched template restores the default prompt; edits are kept.
  const clearTemplate = () => {
    if (template && !template.missing && llmConfig.prompt === template.prompt) {
      setLlmConfig(prev => ({ ...prev, prompt: CustomerCare }));
    }
    setTemplate(null);
    const next = new URLSearchParams(searchParams);
    next.delete("template");
    setSearchParams(next, { replace: true });
  };

  // Canvas orientation follows the canvas's own width.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setOrientation(entry.contentRect.width >= ROW_MIN_WIDTH ? "row" : "column");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Switch stages. `scroll` brings the panel into view if it's off-screen
  // (e.g. tapping a node on a phone); `focus` moves keyboard focus to the
  // panel heading (Prev/Next) or the name field.
  const selectStage = useCallback((id, { scroll = false, focus = null } = {}) => {
    if (!STAGE_BY_ID[id]) return;
    const prev = selectedRef.current;
    if (prev !== id) {
      setConfigured(c => (c.has(prev) ? c : new Set(c).add(prev)));
      selectedRef.current = id;
      setSelected(id);
    }
    pendingRef.current = { scroll, focus };
    // Same stage: apply now (no re-render will run the effect below).
    if (prev === id) applyPending();
  }, []);

  function applyPending() {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p) return;
    const panel = panelRef.current;
    if (p.scroll && panel) {
      const top = panel.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight - 160) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        panel.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      }
    }
    if (p.focus === "name") nameInputRef.current?.focus({ preventScroll: p.scroll });
    else if (p.focus === "heading") panelHeadingRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    applyPending();
  }, [selected]);

  const hasName = Boolean(agentName.trim());

  const modelLabel = (stage, provider, model) =>
    catalog?.[stage]?.providers?.find(p => p.name === provider)?.models?.find(m => m.value === model)?.label ?? model;
  const catalogPromptName = catalog?.llm?.prompts?.find(p => p.prompt === llmConfig.prompt)?.name;
  const promptLabel = !catalog ? null : catalogPromptName ? `${catalogPromptName} prompt` : "Custom prompt";

  const statusOf = useCallback((id) => {
    if (id === "identity") return hasName ? "configured" : "required";
    return configured.has(id) ? "configured" : "default";
  }, [hasName, configured]);

  const summaries = useMemo(() => ({
    identity: {
      title: hasName ? agentName.trim() : "Unnamed agent",
      titleMuted: !hasName,
      subtitle: `${customGreeting ? "Custom" : "Default"} greeting · ${customEndCall ? "custom" : "default"} goodbye`,
      detail: `${responseDelay}ms response delay`,
    },
    asr: {
      title: asrConfig.provider,
      subtitle: modelLabel("asr", asrConfig.provider, asrConfig.model),
      detail: `Confidence ${asrConfig.end_of_turn_confidence} · ${asrConfig.end_of_turn_timeout}ms turn timeout`,
    },
    llm: {
      title: llmConfig.provider,
      subtitle: modelLabel("llm", llmConfig.provider, llmConfig.model),
      detail: [promptLabel, `temp ${llmConfig.temperature}`].filter(Boolean).join(" · "),
    },
    tts: {
      title: ttsConfig.provider,
      subtitle: modelLabel("tts", ttsConfig.provider, ttsConfig.model),
      detail: `${ttsConfig.language} · ${ttsConfig.speaker_audio} · ${ttsConfig.speed}x`,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [agentName, hasName, customGreeting, customEndCall, responseDelay, asrConfig, llmConfig, ttsConfig, catalog, promptLabel]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Rebuild node/edge definitions from the summaries -- positions come from
  // the layout (this is a config map, not a freeform canvas).
  useEffect(() => {
    setNodes(prev => STAGES.map((stage, i) => {
      const summary = summaries[stage.id];
      const status = statusOf(stage.id);
      const old = prev.find(n => n.id === stage.id);
      return {
        ...old,
        id: stage.id,
        type: "pipeline",
        position: orientation === "row" ? { x: i * (NODE_W + ROW_GAP), y: 0 } : { x: 0, y: i * COL_GAP },
        selected: selected === stage.id,
        ariaRole: "button",
        ariaLabel: `Step ${i + 1} of ${STAGES.length}: ${stage.label}, ${stage.name}. ${STATUS_TEXT[status]}. ${summary.title}, ${summary.subtitle}.${selected === stage.id ? " Currently editing." : ""}`,
        data: { kind: stage.id, index: i, orientation, status, selected: selected === stage.id, ...summary },
      };
    }));
    setEdges(STAGES.slice(1).map((stage, i) => ({
      id: `e-${STAGES[i].id}-${stage.id}`,
      source: STAGES[i].id,
      target: stage.id,
      type: orientation === "row" ? "default" : "straight",
      animated: true,
      focusable: false,
      selectable: false,
      style: { stroke: stage.color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stage.color, width: 18, height: 18 },
    })));
  }, [summaries, selected, orientation, statusOf, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => selectStage(node.id, { scroll: true }), [selectStage]);
  // Enter/Space on a focused node selects it in React Flow -- mirror that.
  const onSelectionChange = useCallback(({ nodes: sel }) => {
    if (sel.length === 1 && sel[0].id !== selectedRef.current) selectStage(sel[0].id, { scroll: true });
  }, [selectStage]);

  const doneCount = STAGES.filter(s => statusOf(s.id) === "configured").length;
  const progressPct = Math.round((doneCount / STAGES.length) * 100);
  const templateEdited = template && !template.missing && llmConfig.prompt !== template.prompt;

  const current = STAGE_BY_ID[selected];
  const prevStage = STAGES[current.index - 1];
  const nextStage = STAGES[current.index + 1];

  const goToCreate = () => {
    setConfigured(c => (c.has(selected) ? c : new Set(c).add(selected)));
    const btn = createButtonRef.current;
    if (!btn) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    btn.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    if (!btn.disabled) btn.focus({ preventScroll: true });
  };

  const nameAgent = () => selectStage("identity", { scroll: true, focus: "name" });

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!agentName.trim()) {
      nameAgent();
      setError("Please give your agent a name.");
      return;
    }

    const payload = {
      name: agentName.trim(),
      asr: {
        model: asrConfig.model,
        provider: asrConfig.provider,
        keywords: asrConfig.keywords,
        end_of_turn_confidence: asrConfig.end_of_turn_confidence,
        end_of_turn_timeout: asrConfig.end_of_turn_timeout,
        min_speech_duration: asrConfig.min_speech_duration,
      },
      llm: {
        model: llmConfig.model,
        provider: llmConfig.provider,
        prompt: llmConfig.prompt,
        temperature: llmConfig.temperature,
        max_tokens: llmConfig.max_tokens,
        mcp_url: llmConfig.mcpURL || null,
      },
      tts: {
        model: ttsConfig.model,
        provider: ttsConfig.provider,
        language: ttsConfig.language,
        speed: ttsConfig.speed,
        speaker_audio: ttsConfig.speaker_audio,
      },
      greeting_message: greetingMsg,
      end_call_message: endCallMsg,
      response_audio_delay: responseDelay,
    };

    setSubmitting(true);
    try {
      const res = await fetch(baseURL + "api/create/new/voice/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: payload }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : null;
        throw new Error(data.message || data.error || detail || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      setSuccess(`Agent created successfully${data.agent_id ? ` (id: ${data.agent_id})` : ""}.`);
      window.location.href = "/agents";
    } catch (err) {
      setError(err.message || "Failed to create agent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${appSidebarWidth}px` }}>
      <Sidebar />

      {/* React Flow chrome + stage-panel tweaks. The section components
          (shared with /create) bring their own card + header; inside the
          stage panel the panel header already names the stage, so their
          header is hidden and their card flattened. */}
      <style>{`
        .flow-canvas .react-flow__node:focus { outline: none; }
        .flow-canvas .react-flow__node:focus-visible .pipeline-node { outline: 3px solid #2563eb; outline-offset: 4px; }
        .flow-canvas .react-flow__controls { box-shadow: 0 1px 2px rgb(15 23 42 / .08); border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .flow-canvas .react-flow__controls-button { width: 28px; height: 28px; border-bottom-color: #e2e8f0; }
        .flow-canvas .react-flow__attribution { background: transparent; }
        .flow-stage-body > section { border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
        .flow-stage-body > section > div.border-b:first-child { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .flow-canvas .react-flow__edge.animated path { animation: none !important; stroke-dasharray: none !important; }
        }
      `}</style>

      <PageHero crumbs={["Agents", "Create Voice Agent (Flow)"]}>
        <div className="flex flex-col sm:flex-row sm:items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/>
                  <path d="M7.5 6h9"/><path d="M6.3 8.2 10.7 15.8"/><path d="M17.7 8.2 13.3 15.8"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white/80 text-xs font-semibold tracking-widest uppercase">New agent · Flow builder</p>
                <h1 className="font-sans text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">Build the pipeline</h1>
              </div>
            </div>
            <p className="text-blue-50/90 text-sm leading-relaxed max-w-xl">
              Click a stage to configure it. The graph mirrors the same Identity → ASR → LLM → TTS pipeline as the classic form.
            </p>
          </div>
          <Link
            to="/create"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 shadow-md shadow-blue-950/20 rounded-lg px-3.5 py-2.5 transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Switch to classic form
          </Link>
        </div>
      </PageHero>

      <main className="flex-1 min-w-0 w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {catalogError && (
          <ErrorState title="Couldn't load provider and model options" message={catalogError} onRetry={retryCatalog} />
        )}

        {/* ── Canvas ─────────────────────────────────────────────── */}
        <Card role="region" className="overflow-hidden" aria-labelledby="flow-canvas-heading">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-5 py-3.5 border-b border-slate-100">
            <div className="min-w-0">
              <h2 id="flow-canvas-heading" className="text-base font-semibold text-slate-900">Agent pipeline</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select a stage to edit it — click it, or Tab to it and press Enter.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {template && (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                  {template.missing ? (
                    <Badge tone="amber" className="max-w-full whitespace-normal">Template "{template.name}" wasn't found — using the default prompt</Badge>
                  ) : (
                    <Badge tone="blue" dot className="max-w-full">
                      <span className="truncate">{templateEdited ? "Based on template" : "Using template"}: {template.name}</span>
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={clearTemplate}
                    aria-label={template.missing ? "Dismiss template notice" : `Stop using template ${template.name}`}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </span>
              )}
              <Badge tone={doneCount === STAGES.length ? "green" : "neutral"}>
                <span className="tabular-nums">{doneCount} of {STAGES.length}</span> configured
              </Badge>
            </div>
          </div>
          <div
            ref={canvasWrapRef}
            className="flow-canvas relative bg-slate-50/70"
            style={{ height: CANVAS_H[orientation] }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={false}
              multiSelectionKeyCode={null}
              selectionKeyCode={null}
              deleteKeyCode={null}
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              zoomOnPinch={orientation === "row"}
              panOnDrag={orientation === "row"}
              preventScrolling={false}
              minZoom={0.4}
              maxZoom={1.25}
              fitView
              fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="#cbd5e1" />
              {orientation === "row" && <Controls showInteractive={false} orientation="horizontal" position="bottom-left" />}
              <AutoFit layoutKey={orientation} />
            </ReactFlow>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* ── Stage panel ──────────────────────────────────────── */}
          <section
            ref={panelRef}
            aria-labelledby="flow-stage-heading"
            className="scroll-mt-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm min-w-0"
          >
            <div className={`flex items-start justify-between gap-3 px-5 sm:px-6 py-5 border-b border-slate-100 rounded-t-2xl bg-gradient-to-r ${current.headerBg}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${current.tile}`} aria-hidden="true">
                  {current.icon(20)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    Stage {current.index + 1} of {STAGES.length} · <span className={`font-semibold ${current.text}`}>{current.label}</span>
                  </p>
                  <h2
                    id="flow-stage-heading"
                    ref={panelHeadingRef}
                    tabIndex={-1}
                    className="text-lg font-semibold text-slate-900 leading-tight mt-0.5 focus:outline-none focus-visible:underline"
                  >
                    {current.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">{current.description}</p>
                </div>
              </div>
              <div className="hidden sm:block flex-shrink-0 pt-0.5"><StatusBadge status={statusOf(selected)} /></div>
            </div>

            <div className="flow-stage-body min-w-0">
              {selected === "identity" && (
                <IdentityForm
                  nameInputRef={nameInputRef}
                  agentName={agentName} setAgentName={setAgentName}
                  customGreeting={customGreeting} setCustomGreeting={setCustomGreeting}
                  greetingMsg={greetingMsg} setGreetingMsg={setGreetingMsg}
                  customEndCall={customEndCall} setCustomEndCall={setCustomEndCall}
                  endCallMsg={endCallMsg} setEndCallMsg={setEndCallMsg}
                  responseDelay={responseDelay} setResponseDelay={setResponseDelay}
                />
              )}
              {selected === "asr" && <ASRSection id="flow-asr" config={asrConfig} onChange={setAsrConfig} catalog={catalog?.asr} />}
              {selected === "llm" && (
                <LLMSection
                  key={template && !template.missing ? `template-${template.name}` : "default"}
                  id="flow-llm"
                  config={llmConfig}
                  onChange={setLlmConfig}
                  agentName={agentName}
                  catalog={catalog?.llm}
                />
              )}
              {selected === "tts" && <TTSSection id="flow-tts" config={ttsConfig} onChange={setTtsConfig} catalog={catalog?.tts} />}
            </div>

            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur border-t border-slate-200 rounded-b-2xl pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              {prevStage ? (
                <Button variant="secondary" onClick={() => selectStage(prevStage.id, { scroll: true, focus: "heading" })}>
                  <span aria-hidden="true">←</span> <span className="hidden sm:inline">Previous:</span> {prevStage.label}
                </Button>
              ) : <span />}
              <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
                {STAGES.map(s => (
                  <span key={s.id} className={`h-1.5 rounded-full transition-all ${s.id === selected ? "w-5 bg-blue-600" : statusOf(s.id) === "configured" ? "w-1.5 bg-blue-300" : "w-1.5 bg-slate-300"}`} />
                ))}
              </div>
              {nextStage ? (
                <Button onClick={() => selectStage(nextStage.id, { scroll: true, focus: "heading" })}>
                  Next: {nextStage.label} <span aria-hidden="true">→</span>
                </Button>
              ) : (
                <Button onClick={goToCreate}>Review &amp; create <span aria-hidden="true">→</span></Button>
              )}
            </div>
          </section>

          {/* ── Review & create ──────────────────────────────────── */}
          <aside aria-labelledby="flow-create-heading" className="lg:sticky lg:top-4 min-w-0">
            <Card className="p-5 flex flex-col gap-4">
              <div>
                <h2 id="flow-create-heading" className="text-base font-semibold text-slate-900">Review &amp; create</h2>
                <p className="text-xs text-slate-500 mt-0.5">Every stage starts with defaults — only the name is required.</p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700"><span className="tabular-nums">{doneCount} of {STAGES.length}</span> configured</span>
                  <span className="text-slate-500 tabular-nums">{progressPct}%</span>
                </div>
                <div
                  className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
                  role="progressbar"
                  aria-label="Agent setup progress"
                  aria-valuemin={0}
                  aria-valuemax={STAGES.length}
                  aria-valuenow={doneCount}
                  aria-valuetext={`${doneCount} of ${STAGES.length} stages configured`}
                >
                  <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <ul className="flex flex-col gap-1 -mx-2">
                {STAGES.map((s, i) => {
                  const summary = summaries[s.id];
                  const status = statusOf(s.id);
                  const isCurrent = s.id === selected;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => selectStage(s.id, { scroll: true, focus: "heading" })}
                        aria-current={isCurrent ? "step" : undefined}
                        aria-label={`Edit step ${i + 1}, ${s.label}: ${summary.title}, ${summary.subtitle}. ${STATUS_TEXT[status]}.`}
                        className={`w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isCurrent ? "bg-slate-100" : "hover:bg-slate-50"}`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.tile}`} aria-hidden="true">{s.icon(15)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-900 leading-tight">{s.label}</span>
                          <span className={`block text-xs truncate ${summary.titleMuted ? "text-slate-400 italic" : "text-slate-500"}`}>
                            {s.id === "identity" ? summary.title : `${summary.title} · ${summary.subtitle}`}
                          </span>
                        </span>
                        {status === "required" ? (
                          <Badge tone="red">Required</Badge>
                        ) : status === "configured" ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0" aria-hidden="true"><CheckIcon size={11} /></span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-slate-200 flex-shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                <Button
                  ref={createButtonRef}
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!hasName || submitting}
                  aria-describedby={!hasName ? "flow-create-disabled-reason" : undefined}
                  className="w-full mt-3"
                >
                  {submitting ? (
                    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  )}
                  {submitting ? "Creating…" : "Create agent"}
                </Button>
                {hasName ? (
                  <p className="text-xs text-slate-500 text-center">
                    <strong className="font-semibold text-slate-700">{agentName.trim()}</strong> will appear on your Agents page.
                  </p>
                ) : (
                  <p id="flow-create-disabled-reason" className="text-xs text-slate-500 text-center">
                    Your agent needs a name first.{" "}
                    <button
                      type="button"
                      onClick={nameAgent}
                      className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      Name your agent to continue
                    </button>
                  </p>
                )}
              </div>

              {error && <ErrorState title="Couldn't create the agent" message={error} />}
              {success && (
                <div role="status" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <CheckIcon size={14} /> {success}
                </div>
              )}

              {/* API keys live on the Settings page and apply to every
                  agent at call time. */}
              <p className="text-xs text-slate-500 flex items-center gap-1.5 justify-center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>
                  API keys are managed in{" "}
                  <Link to="/settings" className="font-medium text-slate-700 hover:text-blue-600 underline underline-offset-2">Settings</Link>
                </span>
              </p>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
