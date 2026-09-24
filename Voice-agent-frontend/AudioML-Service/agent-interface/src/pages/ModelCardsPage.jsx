import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";
import { Badge, Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from "../components/ui";
import AsrTryModal from "../components/AsrTryModal";

const CATALOG_API_URL = baseURL + "api/catalog";
const CATALOG_MODELS_API_URL = baseURL + "api/catalog/models";
// ASR providers the "Try" pop-up can run (POST /api/asr/inference).
const ASR_EVAL_MODELS_URL = baseURL + "api/asr/eval-models";
// Real provider logos, bundled locally under public/logos/ rather than
// hotlinked -- avoids depending on a third-party host staying up.
// Vaani's is this platform's own SamVaani mark (already used
// elsewhere in the app); the rest are each provider's official icon
// mark, sourced from Wikimedia Commons (Gemini/OpenAI/Meta) or the
// provider's own public brand-assets CDN (Sarvam) -- unmodified, used
// only to identify which provider's API each card is about, the same
// way any integrations page shows partner logos.
const PROVIDER_LOGO_SRC = {
  Vaani: "/logos/vaani.webp",
  Google: "/logos/gemini.svg",
  "Google-Latest": "/logos/gemini.svg",
  OpenAI: "/logos/openai.svg",
  Sarvam: "/logos/sarvam.svg",
  Muse: "/logos/meta.svg",
};

// Colored-initial fallback if a logo file is ever missing -- same
// pattern already used elsewhere in this app (TTSSection.jsx's voice
// cards).
const PROVIDER_FALLBACK = {
  Vaani: { initial: "V", color: "bg-blue-600" },
  Google: { initial: "G", color: "bg-red-500" },
  "Google-Latest": { initial: "G", color: "bg-red-600" },
  OpenAI: { initial: "O", color: "bg-green-600" },
  Sarvam: { initial: "S", color: "bg-orange-500" },
  Muse: { initial: "M", color: "bg-indigo-600" },
  // Catalog-only providers (Models page's Agent Builder section).
  Deepgram: { initial: "D", color: "bg-slate-800" },
  AssemblyAI: { initial: "A", color: "bg-blue-500" },
  Groq: { initial: "G", color: "bg-orange-600" },
  Fireworks: { initial: "F", color: "bg-purple-600" },
  Ollama: { initial: "O", color: "bg-slate-700" },
  Kokoro: { initial: "K", color: "bg-pink-500" },
  ElevenLabs: { initial: "E", color: "bg-slate-900" },
};

// Fixed size (not a prop) -- Tailwind's JIT scans source for literal
// class strings, so a dynamically interpolated "w-${size}" would never
// actually get generated/compiled.
function ProviderBadge({ provider }) {
  const [failed, setFailed] = useState(false);
  const src = PROVIDER_LOGO_SRC[provider];
  const fallback = PROVIDER_FALLBACK[provider] || { initial: (provider || "?").charAt(0).toUpperCase(), color: "bg-slate-400" };

  if (!src || failed) {
    return (
      <div className={`w-10 h-10 rounded-xl ${fallback.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`} aria-hidden="true">
        {fallback.initial}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 p-1.5">
      <img src={src} alt={`${provider} logo`} className="w-full h-full object-contain" onError={() => setFailed(true)} />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  );
}

// ---------------------------------------------------------------------------
// Models page: ASR / LLM / TTS tabs over the Agent Builder catalog
// (GET /api/catalog), onboarding of new catalog models
// (POST /api/catalog/models).
// ---------------------------------------------------------------------------

// Brand blue drives every interactive state (tabs, buttons, focus); the
// per-stage hue survives only as a small Badge tone so the three stages
// stay distinguishable at a glance.
const STAGES = {
  asr: { label: "ASR", full: "Speech-to-text", tone: "blue" },
  llm: { label: "LLM", full: "Language model", tone: "green" },
  tts: { label: "TTS", full: "Text-to-speech", tone: "violet" },
};
const STAGE_KEYS = ["asr", "llm", "tts"];

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  );
}

function LayersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function modelKey(stage, provider, value) {
  return `${stage}::${provider}::${value}`;
}

function stageModelCount(catalog, stage) {
  return (catalog?.[stage]?.providers || []).reduce((n, p) => n + (p.models?.length || 0), 0);
}

// WAI-ARIA tabs pattern: roving tabindex (only the active tab is in the
// tab order), Left/Right/Home/End move between tabs and activate them.
function StageTabs({ active, onChange, catalog }) {
  const refs = useRef({});

  function onKeyDown(e) {
    const i = STAGE_KEYS.indexOf(active);
    let next = null;
    if (e.key === "ArrowRight") next = STAGE_KEYS[(i + 1) % STAGE_KEYS.length];
    else if (e.key === "ArrowLeft") next = STAGE_KEYS[(i - 1 + STAGE_KEYS.length) % STAGE_KEYS.length];
    else if (e.key === "Home") next = STAGE_KEYS[0];
    else if (e.key === "End") next = STAGE_KEYS[STAGE_KEYS.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Model type"
      onKeyDown={onKeyDown}
      className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm self-start max-w-full"
    >
      {STAGE_KEYS.map(key => {
        const s = STAGES[key];
        const isActive = key === active;
        const count = catalog ? stageModelCount(catalog, key) : null;
        return (
          <button
            key={key}
            ref={el => { refs.current[key] = el; }}
            id={`models-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`models-panel-${key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${
              isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            {s.label}
            <span className={`hidden sm:inline font-normal text-xs ${isActive ? "text-white/85" : "text-slate-500"}`}>{s.full}</span>
            {count != null && (
              <span className={`text-[11px] font-semibold tabular-nums rounded-full px-1.5 min-w-[1.25rem] text-center ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                <span className="sr-only">, </span>{count}<span className="sr-only"> models</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CatalogModelCard({ stage, provider, model, highlighted, onTry }) {
  const s = STAGES[stage];
  const isTts = stage === "tts";
  const languageCount = provider.languages?.length || 0;
  const voiceCount = model.voices?.length ?? provider.voices?.length ?? 0;
  const label = model.label || model.value;
  return (
    <div
      id={`catalog-${modelKey(stage, provider.name, model.value)}`}
      className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col gap-3 transition-shadow hover:shadow-md ${
        highlighted ? "ring-2 ring-blue-500 border-blue-300" : "border-slate-200/70 shadow-sm hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <ProviderBadge provider={provider.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 break-words">{label}</p>
            {highlighted && <Badge tone="blue" dot>New</Badge>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{provider.name}</p>
        </div>
        <Badge tone={s.tone} className="flex-shrink-0">{s.label}</Badge>
      </div>
      <code className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 break-all">{model.value}</code>
      {onTry && (
        <Button variant="secondary" size="sm" onClick={onTry} className="mt-auto self-start" aria-label={`Try ${label}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          Try it
        </Button>
      )}
      {isTts && (
        <div className="flex items-center gap-2 flex-wrap mt-auto">
          <Badge>{languageCount} {languageCount === 1 ? "language" : "languages"}</Badge>
          <Badge>{voiceCount} {voiceCount === 1 ? "voice" : "voices"}</Badge>
        </div>
      )}
    </div>
  );
}

function formatErrorDetail(json, status) {
  const detail = json?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map(d => d?.msg || JSON.stringify(d)).join("; ");
  }
  if (status === 401) return "You need to be signed in to add a model.";
  return `Request failed (HTTP ${status})`;
}

const INPUT_CLASS = "w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition disabled:bg-slate-50 disabled:text-slate-500";

function AddModelModal({ stage, providerNames, onClose, onAdded }) {
  const s = STAGES[stage];
  const [provider, setProvider] = useState(providerNames[0] || "");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const firstInputRef = useRef(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape" && !submitting) onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedValue = value.trim();
    if (!provider) { setError("Choose a provider."); return; }
    if (!trimmedValue) { setError("Model ID is required."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(CATALOG_MODELS_API_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ stage, provider, value: trimmedValue, label: label.trim() || trimmedValue }),
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty or non-JSON body */ }
      if (!res.ok) {
        setError(formatErrorDetail(json, res.status));
        setSubmitting(false);
        return;
      }
      onAdded({
        stage: json?.stage || stage,
        provider: json?.provider || provider,
        value: json?.value || trimmedValue,
        label: json?.label || label.trim() || trimmedValue,
      });
    } catch (err) {
      setError(err.message || "Network error -- couldn't reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { if (!submitting) onClose(); }}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        aria-describedby="add-model-desc"
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <Badge tone={s.tone}>{s.label} · {s.full}</Badge>
            <h2 id="add-model-title" className="text-lg font-semibold text-slate-900 mt-1.5">Add a model</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 sm:px-6 py-5 flex flex-col gap-4 overflow-y-auto" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-model-provider" className="text-xs font-semibold text-slate-700">Provider</label>
            <select
              id="add-model-provider"
              ref={firstInputRef}
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className={INPUT_CLASS}
              disabled={submitting}
            >
              {providerNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-model-value" className="text-xs font-semibold text-slate-700">
              Model ID <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span>
            </label>
            <input
              id="add-model-value"
              type="text"
              required
              aria-required="true"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="e.g. gemini-3.5-flash"
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT_CLASS} font-mono`}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-model-label" className="text-xs font-semibold text-slate-700">
              Display label <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="add-model-label"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={value.trim() || "Defaults to the model ID"}
              autoComplete="off"
              className={INPUT_CLASS}
              disabled={submitting}
            />
          </div>

          <p id="add-model-desc" className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 leading-relaxed">
            The model must be supported by the provider's API — it will appear in the Agent Builder's model list.
          </p>

          {error && <ErrorState title="Couldn't add the model" message={error} />}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !value.trim() || !provider}>
              {submitting ? "Adding…" : "Add model"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CatalogSection({ stage, catalog, loading, error, highlightKey, onAddClick, onRetry, tryableProviders, onTry }) {
  const s = STAGES[stage];
  const providers = catalog?.[stage]?.providers || [];
  const items = providers.flatMap(p => (p.models || []).map(m => ({ provider: p, model: m })));
  const canAdd = !loading && !error && providers.length > 0;

  const summary = !loading && !error && items.length > 0
    ? ` ${items.length} ${items.length === 1 ? "model" : "models"} across ${providers.length} ${providers.length === 1 ? "provider" : "providers"}.`
    : "";

  const addButton = (
    <Button
      onClick={onAddClick}
      disabled={!canAdd}
      title={canAdd ? undefined : "Available once the catalog has loaded"}
    >
      <PlusIcon /> <span className="hidden sm:inline">Add model</span><span className="sm:hidden">Add</span>
    </Button>
  );

  return (
    <Card
      id={`models-panel-${stage}`}
      role="tabpanel"
      aria-labelledby={`models-tab-${stage}`}
      className="px-4 sm:px-6 py-5"
    >
      <SectionHeading
        icon={<LayersIcon size={18} />}
        title={`${s.full} models`}
        description={`Available in Agent Builder for configuring agents.${summary}`}
        action={addButton}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading models">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl border border-slate-200/70 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
              <Skeleton className="h-7 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load the model catalog" message={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<LayersIcon />}
          title={`No ${s.label} models in the catalog yet`}
          description={providers.length > 0 ? "Add a model your provider's API supports and it will appear in the Agent Builder." : "No providers are configured for this stage yet."}
          action={providers.length > 0 ? <Button variant="secondary" onClick={onAddClick}><PlusIcon /> Add model</Button> : null}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {items.map(({ provider, model }) => {
            const key = modelKey(stage, provider.name, model.value);
            return (
              <CatalogModelCard
                key={key}
                stage={stage}
                provider={provider}
                model={model}
                highlighted={key === highlightKey}
                onTry={stage === "asr" && tryableProviders?.has(provider.name) ? () => onTry({ provider: provider.name, label: model.label || model.value }) : undefined}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function ModelCardsPage() {
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") || "").toLowerCase();
  const tab = STAGE_KEYS.includes(rawTab) ? rawTab : "asr";

  function selectTab(next) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set("tab", next);
      return params;
    }, { replace: true });
  }

  // ASR models the "Try" pop-up can run -- only these get a Try button.
  const [asrEvalModels, setAsrEvalModels] = useState([]);
  const [tryTarget, setTryTarget] = useState(null); // { provider, label }
  useEffect(() => {
    let cancelled = false;
    fetch(ASR_EVAL_MODELS_URL, { credentials: "include", headers: { "ngrok-skip-browser-warning": "true" } })
      .then(res => (res.ok ? res.json() : { providers: [] }))
      // Cloud providers need the user's own key from Settings -- hide the
      // ones they haven't added one for.
      .then(json => { if (!cancelled) setAsrEvalModels((json.providers || []).filter(m => m.available !== false)); })
      .catch(() => { /* no Try buttons if this fails */ });
    return () => { cancelled = true; };
  }, []);
  const tryableProviders = new Set(asrEvalModels.map(m => m.provider));

  // Agent Builder catalog (all three stages).
  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_API_URL, { credentials: "include", headers: { "ngrok-skip-browser-warning": "true" } })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(json => { if (!cancelled) { setCatalog(json); setCatalogError(""); } })
      .catch(e => { if (!cancelled) setCatalogError(e.message || "Failed to load catalog"); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [catalogReload]);

  function reloadCatalog({ silent = false } = {}) {
    if (!silent) { setCatalogLoading(true); setCatalogError(""); }
    setCatalogReload(n => n + 1);
  }

  // Add-model flow.
  const [addOpen, setAddOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState(null);
  const [toast, setToast] = useState(null);

  const catalogProviderNames = (catalog?.[tab]?.providers || []).map(p => p.name).filter(Boolean);

  function handleAdded(added) {
    setAddOpen(false);
    const key = modelKey(added.stage, added.provider, added.value);
    setHighlightKey(key);
    setToast(`Added ${added.label || added.value} (${added.provider}) to ${STAGES[added.stage]?.label || added.stage} models.`);
    reloadCatalog({ silent: true });
  }

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!highlightKey) return undefined;
    const t = setTimeout(() => setHighlightKey(null), 6000);
    return () => clearTimeout(t);
  }, [highlightKey]);

  // Scroll the newly-added card into view once the refetched catalog contains it.
  useEffect(() => {
    if (!highlightKey || !catalog) return;
    const el = document.getElementById(`catalog-${highlightKey}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightKey, catalog]);

  const closeAdd = useCallback(() => setAddOpen(false), []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` }}>
      <Sidebar />

      <PageHero crumbs={["Models"]}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
            <LayersIcon size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-white/85 text-xs font-semibold tracking-widest uppercase">Catalog</p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">Models</h1>
          </div>
        </div>
        <p className="text-blue-50/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          Browse the ASR, LLM and TTS models available to your agents, and onboard new ones.
        </p>
      </PageHero>

      <main className="flex-1 flex flex-col gap-5 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full min-w-0">
        <StageTabs active={tab} onChange={selectTab} catalog={catalog} />

        <CatalogSection
          stage={tab}
          catalog={catalog}
          loading={catalogLoading && !catalog}
          error={catalog ? "" : catalogError}
          highlightKey={highlightKey}
          onAddClick={() => setAddOpen(true)}
          onRetry={() => reloadCatalog()}
          tryableProviders={tryableProviders}
          onTry={setTryTarget}
        />
      </main>

      {tryTarget && (
        <AsrTryModal
          provider={tryTarget.provider}
          modelLabel={tryTarget.label}
          evalModels={asrEvalModels}
          onClose={() => setTryTarget(null)}
        />
      )}

      {addOpen && (
        <AddModelModal
          key={tab}
          stage={tab}
          providerNames={catalogProviderNames}
          onClose={closeAdd}
          onAdded={handleAdded}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-[60] sm:max-w-sm bg-slate-900 text-white text-sm rounded-xl shadow-lg px-4 py-3 flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          <span className="flex-1 min-w-0 break-words">{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification" className="-m-1 p-1 rounded-md text-slate-400 hover:text-white">
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
