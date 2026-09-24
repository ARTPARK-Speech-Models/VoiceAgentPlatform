import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ASRSection from "../components/ASRSection";
import LLMSection from "../components/LLmSection";
import TTSSection from "../components/TTSSection";

import { CustomerCare } from "../constants";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { Badge, Button, Card, ErrorState, SectionHeading } from "../components/ui";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";
import { alignToCatalog } from "../utils/catalogDefaults";

// Fonts and the hero gradient/waveform/Navbar are owned by PageHero.
// `?template=<prompt name>` (from the Agents page's template cards)
// preselects that catalog prompt as the LLM system prompt.

/* ─── Pipeline components ─────────────────────────────────────────── */
// Each entry is a clickable card on the page; clicking it opens that
// component's form in a modal. Order here is the order of the pipeline.
const COMPONENTS = [
  {
    id: "identity", label: "Identity", sublabel: "Name & messages",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    accent: "bg-slate-800 text-white",
    ring: "hover:border-slate-400",
  },
  {
    id: "asr", label: "ASR", sublabel: "Speech recognition",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
    accent: "bg-blue-600 text-white",
    ring: "hover:border-blue-400",
  },
  {
    id: "llm", label: "LLM", sublabel: "Language model",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2.5"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h2M11 8h6M7 12h4M13 12h4"/>
      </svg>
    ),
    accent: "bg-emerald-600 text-white",
    ring: "hover:border-emerald-400",
  },
  {
    id: "tts", label: "TTS", sublabel: "Text to speech",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    ),
    accent: "bg-violet-600 text-white",
    ring: "hover:border-violet-400",
  },
];

const DEFAULT_GREETING = "Hello! I'm your virtual assistant. How can I help you today?";
const DEFAULT_END_CALL = "Thank you for calling. Have a wonderful day! Goodbye.";

const INPUT_CLASS =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400";

const CheckIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ─── Toggle switch (real button, keyboard + screen-reader friendly) ─ */
function Switch({ checked, onChange, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-9 h-5 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/* ─── Greeting / end-call message field ────────────────────────────── */
function MessageField({ id, label, help, icon, custom, onCustomChange, value, onValueChange }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-slate-500 flex-shrink-0" aria-hidden="true">{icon}</span>
          <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        </div>
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
            custom
              ? "bg-white border-slate-300 text-slate-800"
              : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        />
        <p id={`${id}-help`} className="text-xs text-slate-500 mt-1.5">
          {help}{!custom && " Turn on Customise to edit it."}
        </p>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */
export default function CreateVoiceAgent() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The template requested on arrival (?template=<prompt name>).
  const [requestedTemplate] = useState(() => searchParams.get("template"));
  // { name, prompt } once applied, or { name, missing: true } when the
  // catalog has no prompt by that name.
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
    // Defaults only -- fully user-configurable per agent (issues #15/#16):
    // 0.5 keeps factual/grounded responses steady without over-flattening
    // style; 258 keeps replies voice-conversation-length by default while
    // still leaving room for a real answer, without hard-capping what an
    // agent can be configured to generate.
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Which component's form modal is open (a COMPONENTS id), or null.
  const [openComponent, setOpenComponent] = useState(null);
  // Components whose form the user has opened and closed at least once.
  const [configured, setConfigured] = useState(() => new Set());
  const appSidebarCollapsed = useSidebarCollapsed();
  const appSidebarWidth = appSidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogKey, setCatalogKey] = useState(0);

  const modalBodyRef = useRef(null);
  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const templateAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchCatalog() {
      try {
        const res = await fetch(baseURL + "api/catalog", {
          headers: { 'ngrok-skip-browser-warning': 'true' },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
        const data = await res.json();
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
      } catch (e) {
        if (!cancelled) setCatalogError(e.message || "Failed to load provider/model options.");
      }
    }

    fetchCatalog();

    return () => {
      cancelled = true;
    };
  }, [catalogKey, requestedTemplate]);

  const retryCatalog = () => {
    setCatalogError("");
    setCatalogKey(k => k + 1);
  };

  const dropTemplateParam = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("template");
    setSearchParams(next, { replace: true });
  };

  // Clearing an untouched template restores the default prompt; if the
  // user already edited the prompt, their edits are kept.
  const clearTemplate = () => {
    if (template && !template.missing && llmConfig.prompt === template.prompt) {
      setLlmConfig(prev => ({ ...prev, prompt: CustomerCare }));
    }
    setTemplate(null);
    dropTemplateParam();
  };

  // Return focus to whatever opened the modal once it closes. (Declared
  // before the effect below so it captures the opener before focus moves
  // into the dialog.)
  const isModalOpen = Boolean(openComponent);
  useEffect(() => {
    if (!isModalOpen) return;
    const opener = document.activeElement;
    return () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [isModalOpen]);

  // While a component modal is open: Escape closes it, and the page
  // behind it doesn't scroll.
  useEffect(() => {
    if (!openComponent) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setConfigured(prev => new Set(prev).add(openComponent));
      setOpenComponent(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalBodyRef.current?.scrollTo({ top: 0 });
    // Identity with no name yet -> straight to the name field.
    if (openComponent === "identity" && nameInputRef.current && !nameInputRef.current.value) {
      nameInputRef.current.focus();
    } else {
      dialogRef.current?.focus();
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openComponent]);

  const closeComponent = () => {
    if (openComponent) setConfigured(prev => new Set(prev).add(openComponent));
    setOpenComponent(null);
  };

  const goToComponent = (id) => {
    if (openComponent) setConfigured(prev => new Set(prev).add(openComponent));
    setOpenComponent(id);
  };

  const hasName = Boolean(agentName.trim());

  // Name of the catalog prompt the current LLM prompt matches, if any.
  const catalogPromptName = catalog?.llm?.prompts?.find(p => p.prompt === llmConfig.prompt)?.name;
  const promptLabel = !catalog ? null : catalogPromptName ? `${catalogPromptName} prompt` : "Custom prompt";

  // One-line summary of each component's current settings, shown on its card.
  const summaries = {
    identity: hasName ? `"${agentName.trim()}" · ${responseDelay}ms delay` : "Name your agent (required)",
    asr: `${asrConfig.provider} · ${asrConfig.model}`,
    llm: [llmConfig.provider, llmConfig.model, promptLabel].filter(Boolean).join(" · "),
    tts: `${ttsConfig.provider} · ${ttsConfig.model} · ${ttsConfig.language}`,
  };

  const isComponentDone = (id) => configured.has(id) && !(id === "identity" && !hasName);
  const configuredCount = COMPONENTS.filter(c => isComponentDone(c.id)).length;
  const progressPct = Math.round((configuredCount / COMPONENTS.length) * 100);
  const templateEdited = template && !template.missing && llmConfig.prompt !== template.prompt;

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!agentName.trim()) {
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

    const wrappedPayload = {
      body: payload
    }

    setSubmitting(true);
    try {
      const res = await fetch(baseURL + "api/create/new/voice/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wrappedPayload),
        credentials: "include"
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : null;
        throw new Error(data.message || data.error || detail || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      setSuccess(`Agent created successfully${data.agent_id ? ` (id: ${data.agent_id})` : ""}.`);
      // The new agent shows up on the Agents page -- go there.
      window.location.href = "/agents";
    } catch (err) {
      setError(err.message || "Failed to create agent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const delayFeel = responseDelay === 0 ? "Instant" : responseDelay <= 500 ? "Natural" : responseDelay <= 1500 ? "Thoughtful" : "Slow";

  const identityForm = (
    <section id="identity" className="bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
      <div className="flex items-center gap-4 px-5 sm:px-6 py-5 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Agent identity</h2>
          <p className="text-sm text-slate-500 mt-0.5">Name your agent and set how it opens and closes calls</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-6">
        {/* Agent Name */}
        <div>
          <label htmlFor="agent-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Agent name <span className="text-red-600" aria-hidden="true">*</span>
          </label>
          <input
            ref={nameInputRef}
            id="agent-name"
            type="text"
            name="x-agent-label-noautofill"
            autoComplete="off"
            required
            aria-required="true"
            aria-describedby="agent-name-help"
            value={agentName}
            onChange={e => setAgentName(e.target.value)}
            placeholder="e.g. Aria, HealthBot, SalesBot…"
            className={`${INPUT_CLASS} bg-white border-slate-300 text-base font-semibold tracking-tight text-slate-900 py-3 placeholder:font-normal placeholder:text-sm`}
          />
          <p id="agent-name-help" className={`text-xs mt-1.5 flex items-center gap-1 ${hasName ? "text-emerald-700" : "text-slate-500"}`}>
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
          id="greeting-message"
          label="Greeting message"
          help="Spoken at the start of every call."
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          custom={customGreeting}
          onCustomChange={setCustomGreeting}
          value={greetingMsg}
          onValueChange={setGreetingMsg}
        />

        <MessageField
          id="end-call-message"
          label="End call message"
          help="Spoken just before the agent hangs up."
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07C9.44 17.29 7.76 15.7 6.53 14A19.62 19.62 0 0 1 3.46 5.37 2 2 0 0 1 5.44 3h3.06a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11z"/><line x1="23" y1="1" x2="1" y2="23"/></svg>}
          custom={customEndCall}
          onCustomChange={setCustomEndCall}
          value={endCallMsg}
          onValueChange={setEndCallMsg}
        />

        {/* Response Delay */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 flex-shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <label htmlFor="response-delay" className="text-sm font-medium text-slate-700">Response delay</label>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-4">
              <input
                id="response-delay"
                type="range"
                min={250} max={3000} step={50}
                value={responseDelay}
                onChange={e => setResponseDelay(Number(e.target.value))}
                aria-describedby="response-delay-help"
                aria-valuetext={`${responseDelay} milliseconds (${delayFeel})`}
                className="flex-1 min-w-0 accent-blue-600"
              />
              <output htmlFor="response-delay" className="w-20 flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg text-center py-2 text-sm font-semibold text-blue-700 tabular-nums">
                {responseDelay}ms
              </output>
            </div>
            <div className="flex items-start justify-between gap-3 mt-2">
              <p id="response-delay-help" className="text-xs text-slate-500">
                How long the agent waits after the caller finishes speaking before it replies.
              </p>
              <Badge tone="blue" className="flex-shrink-0">{delayFeel}</Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div
      className="min-h-screen bg-slate-50 font-sans flex flex-col lg:pl-[var(--sidebar-w)]"
      style={{ "--sidebar-w": `${appSidebarWidth}px` }}
    >
      <Sidebar />

      <PageHero crumbs={["Agents", "Create Voice Agent"]}>
        <div className="flex flex-col sm:flex-row sm:items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white/80 text-xs font-semibold tracking-widest uppercase">New agent</p>
                <h1 className="font-sans font-semibold tracking-tight text-3xl sm:text-4xl text-white leading-tight">
                  Create a voice agent
                </h1>
              </div>
            </div>
            <p className="text-white/90 text-sm leading-relaxed max-w-xl">
              Name your agent, then choose how it listens (ASR), thinks (LLM) and speaks (TTS).
            </p>
          </div>

          <Link
            to="/create-flow"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 shadow-md shadow-blue-950/20 rounded-lg px-3.5 py-2.5 transition whitespace-nowrap"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7 15.8 10.8"/><path d="M15.8 13.2 8.2 16"/></svg>
            Try the flow builder
          </Link>
        </div>
      </PageHero>

      {/* ── BODY ─────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">

        {catalogError && (
          <ErrorState
            title="Couldn't load provider and model options"
            message={catalogError}
            onRetry={retryCatalog}
          />
        )}

        {/* ── Progress + template ─────────────────────────────── */}
        <Card className="p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                <span className="tabular-nums">{configuredCount} of {COMPONENTS.length}</span> configured
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Every component starts with default settings — only the agent name is required.
              </p>
            </div>
            {template && (
              template.missing ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge tone="amber" className="max-w-full whitespace-normal">
                    Template "{template.name}" wasn't found — using the default prompt
                  </Badge>
                  <button
                    type="button"
                    onClick={clearTemplate}
                    aria-label="Dismiss template notice"
                    className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge tone="blue" dot className="max-w-full">
                    <span className="truncate">{templateEdited ? "Based on template" : "Using template"}: {template.name}</span>
                  </Badge>
                  <button
                    type="button"
                    onClick={clearTemplate}
                    aria-label={`Stop using template ${template.name}`}
                    title={templateEdited ? "Remove template label (your prompt edits are kept)" : "Clear template and use the default prompt"}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )
            )}
          </div>
          <div
            className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
            role="progressbar"
            aria-label="Agent setup progress"
            aria-valuemin={0}
            aria-valuemax={COMPONENTS.length}
            aria-valuenow={configuredCount}
            aria-valuetext={`${configuredCount} of ${COMPONENTS.length} components configured`}
          >
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </Card>

        {/* ── Pipeline components ───────────────────────────────── */}
        <section aria-labelledby="build-heading">
          <SectionHeading
            title={<span id="build-heading">Build your agent</span>}
            description="Click a component to configure it."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {COMPONENTS.map((comp, i) => {
              const needsName = comp.id === "identity" && !hasName;
              const isDone = isComponentDone(comp.id);
              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => setOpenComponent(comp.id)}
                  aria-label={`Step ${i + 1}: ${comp.label}, ${comp.sublabel}. ${needsName ? "Required." : isDone ? "Configured." : "Using defaults."} ${summaries[comp.id]}`}
                  className={`group text-left bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col gap-3 min-w-0 ${comp.ring} ${
                    needsName ? "border-red-200" : "border-slate-200/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${comp.accent}`}>
                        {comp.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 font-medium">Step {i + 1}</p>
                        <p className="text-base font-semibold text-slate-900 leading-tight">{comp.label}</p>
                        <p className="text-xs text-slate-500 truncate">{comp.sublabel}</p>
                      </div>
                    </div>
                    {needsName ? (
                      <Badge tone="red">Required</Badge>
                    ) : isDone ? (
                      <Badge tone="green"><CheckIcon size={10} /> Configured</Badge>
                    ) : (
                      <Badge tone="neutral">Default</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 break-words" title={summaries[comp.id]}>{summaries[comp.id]}</p>
                  <span className="text-xs font-semibold text-blue-600 group-hover:text-blue-700 group-hover:underline underline-offset-2 mt-auto" aria-hidden="true">
                    {isDone ? "Edit settings →" : "Configure →"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* API keys live on the Settings page and apply to every agent
              at call time. */}
          <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>
              API keys are managed in{" "}
              <Link to="/settings" className="font-medium text-slate-700 hover:text-blue-600 underline underline-offset-2">Settings</Link>
            </span>
          </p>
        </section>

        {/* ── Submit bar ────────────────────────────────────────── */}
        <Card className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Ready to create your agent?</p>
              {hasName ? (
                <p className="text-xs text-slate-500 mt-0.5">
                  <strong className="font-semibold text-slate-700">{agentName.trim()}</strong> will appear on your Agents page once created.
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1">
                  <span>Your agent needs a name before it can be created.</span>
                  <button
                    type="button"
                    onClick={() => setOpenComponent("identity")}
                    className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                  >
                    Name your agent to continue
                  </button>
                </p>
              )}
            </div>
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={!hasName || submitting}
              aria-describedby={!hasName ? "create-disabled-reason" : undefined}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              )}
              {submitting ? "Creating…" : "Create agent"}
            </Button>
            {!hasName && <span id="create-disabled-reason" className="sr-only">Disabled until your agent has a name.</span>}
          </div>
          {error && <ErrorState title="Couldn't create the agent" message={error} />}
          {success && (
            <div role="status" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckIcon size={14} /> {success}
            </div>
          )}
        </Card>
      </main>

      {/* ── Component form modal ─────────────────────────────── */}
      {openComponent && (() => {
        const idx = COMPONENTS.findIndex(c => c.id === openComponent);
        const comp = COMPONENTS[idx];
        const next = COMPONENTS[idx + 1];
        return (
          <div
            className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-6"
            onClick={closeComponent}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="component-dialog-title"
              tabIndex={-1}
              className="bg-slate-50 w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${comp.accent}`}>{comp.icon}</div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Step {idx + 1} of {COMPONENTS.length}</p>
                    <h2 id="component-dialog-title" className="text-base font-semibold text-slate-900 leading-tight truncate">
                      {comp.label} <span className="text-slate-500 font-normal text-sm">· {comp.sublabel}</span>
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeComponent}
                  className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition flex-shrink-0"
                  aria-label={`Close ${comp.label} settings`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div ref={modalBodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6">
                {openComponent === "identity" && identityForm}
                {openComponent === "asr" && (
                  <ASRSection id="asr" config={asrConfig} onChange={setAsrConfig} catalog={catalog?.asr} />
                )}
                {openComponent === "llm" && (
                  <LLMSection
                    key={template && !template.missing ? `template-${template.name}` : "default"}
                    id="llm"
                    config={llmConfig}
                    onChange={setLlmConfig}
                    agentName={agentName}
                    catalog={catalog?.llm}
                  />
                )}
                {openComponent === "tts" && (
                  <TTSSection id="tts" config={ttsConfig} onChange={setTtsConfig} catalog={catalog?.tts} />
                )}
              </div>

              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-white border-t border-slate-200 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <Button variant="ghost" onClick={closeComponent}>Done</Button>
                {next ? (
                  <Button onClick={() => goToComponent(next.id)}>Next: {next.label} →</Button>
                ) : (
                  <Button onClick={closeComponent}>Save &amp; review</Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
