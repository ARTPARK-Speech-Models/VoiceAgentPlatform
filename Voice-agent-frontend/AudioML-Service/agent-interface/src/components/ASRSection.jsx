import { useState, useEffect, useEffectEvent, useId } from "react";
import { Skeleton } from "./ui";

// Provider/model options come from the backend catalog (GET /api/catalog,
// catalog_providers/catalog_models tables) via the `catalog` prop --
// { providers: [{ name, models: [{ value, label }] }] }.

const getModelsForProvider = (catalog, providerName) =>
  catalog?.providers?.find(p => p.name === providerName)?.models ?? [];

const getAllModels = (catalog) => {
  const seen = new Map();
  for (const p of catalog?.providers ?? []) {
    for (const m of p.models) if (!seen.has(m.value)) seen.set(m.value, m);
  }
  return Array.from(seen.values());
};

// Shared form styles (kept in sync with LLmSection / TTSSection).
const LABEL = "block text-sm font-medium text-slate-700";
const HELP = "text-xs text-slate-500 mt-1.5";
const INPUT = "w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const READOUT = "w-16 flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg text-center py-2 text-sm font-semibold text-blue-700 tabular-nums";
const chip = (selected, disabled) =>
  `px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
    disabled
      ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed"
      : selected
        ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20"
        : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700"
  }`;

export default function ASRSection({ id, config, onChange, catalog }) {
  const uid = useId();
  const [provider, setProvider] = useState(config?.provider ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [confidence, setConfidence] = useState(config?.end_of_turn_confidence ?? 0.65);
  const [timeout, setTimeout2] = useState(config?.end_of_turn_timeout ?? 500);
  const [minSpeech, setMinSpeech] = useState(config?.min_speech_duration ?? 100);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState(config?.keywords ?? []);

  const providerNames = (catalog?.providers ?? []).map(p => p.name);
  const supportedModels = getModelsForProvider(catalog, provider);
  const allModels = getAllModels(catalog);

  // Pick a default provider/model once the catalog arrives (each time the
  // `catalog` prop changes identity), if none was already supplied via
  // `config` (e.g. editing an existing agent). Local state is adjusted during
  // render (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes);
  // the parent is notified from an effect, since a parent can't be updated
  // mid-render.
  const [seenCatalog, setSeenCatalog] = useState(null);
  const [pendingDefault, setPendingDefault] = useState(null);
  if (catalog && catalog !== seenCatalog) {
    setSeenCatalog(catalog);
    const first = provider ? undefined : catalog.providers?.[0];
    if (first) {
      const firstModel = first.models[0]?.value ?? "";
      setProvider(first.name);
      setModel(firstModel);
      setPendingDefault({
        provider: first.name,
        model: firstModel,
        keywords,
        end_of_turn_confidence: confidence,
        end_of_turn_timeout: timeout,
        min_speech_duration: minSpeech,
      });
    }
  }
  const notifyDefault = useEffectEvent((cfg) => onChange?.(cfg));
  useEffect(() => {
    if (pendingDefault) notifyDefault(pendingDefault);
  }, [pendingDefault]);

  const handleProviderChange = (p) => {
    setProvider(p);
    const supported = getModelsForProvider(catalog, p);
    const nextModel = supported.some(m => m.value === model) ? model : (supported[0]?.value ?? "");
    setModel(nextModel);
    onChange?.({
      provider: p,
      model: nextModel,
      keywords,
      end_of_turn_confidence: confidence,
      end_of_turn_timeout: timeout,
      min_speech_duration: minSpeech,
    });
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      const nextKeywords = [...keywords, kw];
      setKeywords(nextKeywords);
      setKeywordInput("");
      onChange?.({
        provider,
        model,
        keywords: nextKeywords,
        end_of_turn_confidence: confidence,
        end_of_turn_timeout: timeout,
        min_speech_duration: minSpeech,
      });
    }
  };

  const removeKeyword = (kw) => {
    const nextKeywords = keywords.filter(k => k !== kw);
    setKeywords(nextKeywords);
    onChange?.({
      provider,
      model,
      keywords: nextKeywords,
      end_of_turn_confidence: confidence,
      end_of_turn_timeout: timeout,
      min_speech_duration: minSpeech,
    });
  };

  if (!catalog) {
    return (
      <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden p-5 sm:p-6 flex flex-col gap-3" aria-busy="true">
        <p className="text-sm text-slate-500">Loading ASR options…</p>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-9 w-full" />
      </section>
    );
  }

  const ids = {
    provider: `${uid}-provider`,
    model: `${uid}-model`,
    confidence: `${uid}-confidence`,
    timeout: `${uid}-timeout`,
    minSpeech: `${uid}-min-speech`,
    keywords: `${uid}-keywords`,
  };

  return (
    <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-4 px-5 sm:px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-sky-50">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Automatic Speech Recognition</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure how the agent listens and transcribes speech</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Provider */}
        <div className="md:col-span-2">
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
        <div className="md:col-span-2">
          <p id={ids.model} className={`${LABEL} mb-2`}>Model</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={ids.model}>
            {allModels.map(({ label, value }) => {
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
                      keywords,
                      end_of_turn_confidence: confidence,
                      end_of_turn_timeout: timeout,
                      min_speech_duration: minSpeech,
                    });
                  }}
                  disabled={!supported}
                  title={!supported ? `Not available on ${provider}` : undefined}
                  className={chip(model === value, !supported)}
                >
                  {label}
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

        {/* End of Turn Confidence */}
        <div>
          <label htmlFor={ids.confidence} className={`${LABEL} mb-1.5`}>
            End of turn confidence
            <span className="ml-2 text-xs font-normal text-slate-500">(0 – 1)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              id={ids.confidence}
              type="range"
              min={0} max={1} step={0.01}
              value={confidence}
              aria-describedby={`${ids.confidence}-help`}
              onChange={e => {
                const next = Number(e.target.value);
                setConfidence(next);
                onChange?.({
                  provider,
                  model,
                  keywords,
                  end_of_turn_confidence: next,
                  end_of_turn_timeout: timeout,
                  min_speech_duration: minSpeech,
                });
              }}
              className="flex-1 min-w-0 accent-blue-600"
            />
            <output htmlFor={ids.confidence} className={READOUT}>{confidence.toFixed(2)}</output>
          </div>
          <p id={`${ids.confidence}-help`} className={HELP}>Higher values require stronger speaker pause signals before ending the turn.</p>
        </div>

        {/* End of Turn Timeout */}
        <div>
          <label htmlFor={ids.timeout} className={`${LABEL} mb-1.5`}>
            End of turn timeout
            <span className="ml-2 text-xs font-normal text-slate-500">(ms)</span>
          </label>
          <div className="relative">
            <input
              id={ids.timeout}
              type="number"
              inputMode="numeric"
              value={timeout}
              min={500} max={10000} step={100}
              aria-describedby={`${ids.timeout}-help`}
              onChange={e => {
                const next = Number(e.target.value);
                setTimeout2(next);
                onChange?.({
                  provider,
                  model,
                  keywords,
                  end_of_turn_confidence: confidence,
                  end_of_turn_timeout: next,
                  min_speech_duration: minSpeech,
                });
              }}
              className={`${INPUT} pr-12 tabular-nums`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none" aria-hidden="true">ms</span>
          </div>
          <p id={`${ids.timeout}-help`} className={HELP}>Time to wait after the last word before treating it as the end of the turn.</p>
        </div>

        {/* Min Speech Duration */}
        <div className="md:col-span-2">
          <label htmlFor={ids.minSpeech} className={`${LABEL} mb-1.5`}>
            Min speech duration
            <span className="ml-2 text-xs font-normal text-slate-500">(ms)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              id={ids.minSpeech}
              type="range"
              min={0} max={1000} step={10}
              value={minSpeech}
              aria-describedby={`${ids.minSpeech}-help`}
              onChange={e => {
                const next = Number(e.target.value);
                setMinSpeech(next);
                onChange?.({
                  provider,
                  model,
                  keywords,
                  end_of_turn_confidence: confidence,
                  end_of_turn_timeout: timeout,
                  min_speech_duration: next,
                });
              }}
              className="flex-1 min-w-0 accent-blue-600"
            />
            <output htmlFor={ids.minSpeech} className={`${READOUT} w-20`}>{minSpeech}ms</output>
          </div>
          <div id={`${ids.minSpeech}-help`} className={`${HELP} flex flex-wrap justify-between gap-x-4 gap-y-1`}>
            <span>Speech segments shorter than <strong>{minSpeech}ms</strong> are ignored.</span>
            <span className="font-medium text-slate-600">{minSpeech === 0 ? "All segments captured" : minSpeech < 200 ? "Filters brief noise" : "Filters short utterances"}</span>
          </div>
        </div>

        {/* Keywords */}
        <div className="md:col-span-2">
          <label htmlFor={ids.keywords} className={`${LABEL} mb-1.5`}>Keywords / hotwords</label>
          <div className="flex gap-2 mb-3">
            <input
              id={ids.keywords}
              type="text"
              value={keywordInput}
              onChange={e => setKeywordInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              placeholder="Type a keyword and press Enter"
              className={`${INPUT} flex-1 min-w-0`}
            />
            <button
              type="button"
              onClick={addKeyword}
              className="h-auto px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition flex items-center gap-1.5 flex-shrink-0 shadow-sm shadow-blue-600/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </button>
          </div>
          {keywords.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Keywords">
              {keywords.map(kw => (
                <li key={kw} className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm pl-3 pr-1.5 py-1 rounded-lg">
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    aria-label={`Remove keyword ${kw}`}
                    className="p-1 rounded-md text-blue-500 hover:text-blue-800 hover:bg-blue-100 transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // Amber prompt, not a plain muted empty-state line -- this is
            // the cheapest real ASR accuracy win available for an
            // entity-heavy support call, worth actively nudging toward
            // rather than mentioning in passing (issue #33).
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5" aria-hidden="true">
                <path d="M12 9v4" /><path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
              <span>No keywords added yet — they're the cheapest way to boost recognition of names, products and other domain-specific terms your callers will say.</span>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
