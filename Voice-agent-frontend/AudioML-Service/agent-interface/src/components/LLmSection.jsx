import { useState, useEffect, useEffectEvent, useId } from "react";
import RAGFunctions from "./RAGSection";
import { Skeleton } from "./ui";

// Provider/model/prompt-preset options come from the backend catalog
// (GET /api/catalog, catalog_providers/catalog_models/catalog_prompts
// tables) via the `catalog` prop --
// { providers: [{ name, models: [{ value, label }] }], prompts: [{ name, prompt }] }.

const getModelsForProvider = (catalog, providerName) =>
  catalog?.providers?.find(p => p.name === providerName)?.models ?? [];

const getAllModels = (catalog) => {
  const seen = new Map();
  for (const p of catalog?.providers ?? []) {
    for (const m of p.models) if (!seen.has(m.value)) seen.set(m.value, m);
  }
  return Array.from(seen.values());
};

// Shared form styles (kept in sync with ASRSection / TTSSection).
const LABEL = "block text-sm font-medium text-slate-700";
const HELP = "text-xs text-slate-500 mt-1.5";
const READOUT = "w-16 flex-shrink-0 bg-emerald-50 border border-emerald-200 rounded-lg text-center py-2 text-sm font-semibold text-emerald-700 tabular-nums";
const chip = (selected, disabled) =>
  `px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
    disabled
      ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed"
      : selected
        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
        : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
  }`;

/* ── Main LLMSection ────────────────────────────────────────── */
export default function LLMSection({ id, config, onChange, agentName, catalog }) {
  const uid = useId();
  const [provider, setProvider] = useState(config?.provider ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [maxTokens, setMaxTokens] = useState(config?.max_tokens ?? 512);
  const [temperature, setTemperature] = useState(config?.temperature ?? 0.7);
  // No UI control edits this yet -- it only ever comes in via `config`.
  const [mcpURL] = useState(config?.mcpURL ?? "");
  const [activePreset, setActivePreset] = useState(config?.prompt ? "Custom" : "");
  const [prompt, setPrompt] = useState(config?.prompt ?? "");

  const providerNames = (catalog?.providers ?? []).map(p => p.name);
  const allModels = getAllModels(catalog);
  const supportedModels = getModelsForProvider(catalog, provider);
  const prompts = catalog?.prompts ?? [];
  const presetTabs = [...prompts.map(p => p.name), "Custom"];
  // A prompt whose text is exactly a catalog preset (e.g. a template picked
  // on the Agents page, or an existing agent's untouched preset) shows that
  // preset as selected; anything else falls back to the tracked tab.
  const matchedPreset = prompt ? prompts.find(p => p.prompt === prompt)?.name : undefined;
  const selectedPreset = matchedPreset ?? activePreset;

  // Pick a default provider/model/prompt once the catalog arrives (each time
  // the `catalog` prop changes identity), if none was already supplied via
  // `config` (e.g. editing an existing agent). Local state is adjusted during
  // render (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes);
  // the parent is notified from an effect -- in the same order, with the same
  // payloads as before -- since a parent can't be updated mid-render.
  const [seenCatalog, setSeenCatalog] = useState(null);
  const [pendingDefaults, setPendingDefaults] = useState(null);
  if (catalog && catalog !== seenCatalog) {
    setSeenCatalog(catalog);
    const notifications = [];
    if (!provider) {
      const first = catalog.providers?.[0];
      if (first) {
        const firstModel = first.models[0]?.value ?? "";
        setProvider(first.name);
        setModel(firstModel);
        notifications.push({
          provider: first.name,
          model: firstModel,
          prompt,
          temperature,
          mcpURL,
          max_tokens: maxTokens,
        });
      }
    }
    if (!activePreset && catalog.prompts?.length) {
      const firstPreset = catalog.prompts[0];
      setActivePreset(firstPreset.name);
      setPrompt(firstPreset.prompt);
      notifications.push({
        provider: provider || catalog.providers?.[0]?.name,
        model: model || catalog.providers?.[0]?.models?.[0]?.value,
        prompt: firstPreset.prompt,
        temperature,
        mcpURL,
        max_tokens: maxTokens,
      });
    }
    if (notifications.length) setPendingDefaults(notifications);
  }
  const notifyDefault = useEffectEvent((cfg) => onChange?.(cfg));
  useEffect(() => {
    pendingDefaults?.forEach((cfg) => notifyDefault(cfg));
  }, [pendingDefaults]);

  const handleProviderChange = (p) => {
    setProvider(p);
    const supported = getModelsForProvider(catalog, p);
    const nextModel = supported.some(m => m.value === model) ? model : (supported[0]?.value ?? "");
    setModel(nextModel);
    onChange?.({
      provider: p,
      model: nextModel,
      prompt,
      temperature,
      mcpURL,
      max_tokens: maxTokens,
    });
  };

  const handlePresetClick = (tab) => {
    setActivePreset(tab);
    const nextPrompt = tab === "Custom" ? "" : (prompts.find(p => p.name === tab)?.prompt ?? "");
    setPrompt(nextPrompt);
    onChange?.({
      provider,
      model,
      prompt: nextPrompt,
      temperature,
      mcpURL,
      max_tokens: maxTokens,
    });
  };

  if (!catalog) {
    return (
      <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden p-5 sm:p-6 flex flex-col gap-3" aria-busy="true">
        <p className="text-sm text-slate-500">Loading LLM options…</p>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  const ids = {
    provider: `${uid}-provider`,
    model: `${uid}-model`,
    maxTokens: `${uid}-max-tokens`,
    temperature: `${uid}-temperature`,
    presets: `${uid}-presets`,
    prompt: `${uid}-prompt`,
  };

  return (
    <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 sm:px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2.5"/>
            <path d="M8 21h8M12 17v4"/>
            <path d="M7 8h2M11 8h6M7 12h4M13 12h4"/>
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Large Language Model</h2>
          <p className="text-sm text-slate-500 mt-0.5">Choose the model and system prompt that decide what your agent says</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-6">

        {/* Provider */}
        <div>
          <p id={ids.provider} className={`${LABEL} mb-2`}>Provider</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={ids.provider}>
            {providerNames.map(p => (
              <button
                key={p}
                type="button"
                aria-pressed={provider === p}
                onClick={() => handleProviderChange(p)}
                className={chip(provider === p, false)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <p id={ids.model} className={`${LABEL} mb-2`}>Model</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={ids.model}>
            {allModels.map(({ value }) => {
              const supported = supportedModels.some(m => m.value === value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={model === value}
                  onClick={() => {
                    if (!supported) return;
                    setModel(value);
                    onChange?.({
                      provider,
                      model: value,
                      prompt,
                      temperature,
                      mcpURL,
                      max_tokens: maxTokens,
                    });
                  }}
                  disabled={!supported}
                  title={!supported ? `Not available on ${provider}` : undefined}
                  className={chip(model === value, !supported)}
                >
                  {value}
                </button>
              );
            })}
          </div>
          {supportedModels.length < allModels.length && (
            <p className={`${HELP} flex items-center gap-1.5`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Greyed-out models are not available on <strong>{provider}</strong>.</span>
            </p>
          )}
        </div>

        {/* Max New Tokens + Temperature */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor={ids.maxTokens} className={`${LABEL} mb-1.5`}>
              Max new tokens <span className="ml-2 text-xs font-normal text-slate-500">(1 – 4096)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id={ids.maxTokens}
                type="range" min={1} max={4096} step={1} value={maxTokens}
                aria-describedby={`${ids.maxTokens}-help`}
                onChange={e => {
                  const next = Number(e.target.value);
                  setMaxTokens(next);
                  onChange?.({
                    provider,
                    model,
                    prompt,
                    temperature,
                    mcpURL,
                    max_tokens: next,
                  });
                }}
                className="flex-1 min-w-0 accent-emerald-600"
              />
              <output htmlFor={ids.maxTokens} className={READOUT}>{maxTokens}</output>
            </div>
            <p id={`${ids.maxTokens}-help`} className={HELP}>Maximum tokens the model can generate per turn.</p>
          </div>
          <div>
            <label htmlFor={ids.temperature} className={`${LABEL} mb-1.5`}>
              Temperature <span className="ml-2 text-xs font-normal text-slate-500">(0 – 2)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id={ids.temperature}
                type="range" min={0} max={2} step={0.01} value={temperature}
                aria-describedby={`${ids.temperature}-help`}
                onChange={e => {
                  const next = Number(e.target.value);
                  setTemperature(next);
                  onChange?.({
                    provider,
                    model,
                    prompt,
                    temperature: next,
                    mcpURL,
                    max_tokens: maxTokens,
                  });
                }}
                className="flex-1 min-w-0 accent-emerald-600"
              />
              <output htmlFor={ids.temperature} className={READOUT}>{temperature.toFixed(2)}</output>
            </div>
            <div id={`${ids.temperature}-help`} className={`${HELP} flex justify-between gap-2`}>
              <span>0 · Precise</span><span>1 · Balanced</span><span>2 · Creative</span>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label htmlFor={ids.prompt} className={LABEL}>System prompt</label>
            <span className="text-xs text-slate-500 tabular-nums">{prompt.length.toLocaleString()} characters</span>
          </div>
          <p id={ids.presets} className="sr-only">Prompt presets</p>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-3 flex-wrap" role="group" aria-labelledby={ids.presets}>
            {presetTabs.map(tab => {
              const selected = selectedPreset === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handlePresetClick(tab)}
                  className={`flex-1 min-w-[88px] py-2 px-3 rounded-lg text-xs font-semibold transition ${
                    selected ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          {selectedPreset && selectedPreset !== "Custom" && (
            <div className="flex items-center gap-2 mb-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span><strong className="font-semibold">{selectedPreset}</strong> preset loaded — edit the prompt below to fine-tune behaviour.</span>
            </div>
          )}
          <textarea
            id={ids.prompt}
            value={prompt}
            onChange={e => {
              const next = e.target.value;
              setPrompt(next);
              setActivePreset("Custom");
              onChange?.({
                provider,
                model,
                prompt: next,
                temperature,
                mcpURL,
                max_tokens: maxTokens,
              });
            }}
            placeholder="Describe who the agent is, what it should help callers with, and how it should speak…"
            rows={12}
            className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-sm text-slate-800 transition resize-y placeholder:text-slate-400 leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>

        {/* RAG & Functions */}
        <RAGFunctions agentName={agentName} config={config} onChange={onChange} />

      </div>
    </section>
  );
}
