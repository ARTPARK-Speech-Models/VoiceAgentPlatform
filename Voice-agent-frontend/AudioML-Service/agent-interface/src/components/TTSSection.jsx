import { useState, useEffect, useEffectEvent, useCallback, useId } from "react";
import { baseURL } from "../url";
import { Skeleton } from "./ui";

// Provider/model/language/voice options come from the backend catalog
// (GET /api/catalog, catalog_providers/catalog_models/catalog_languages/
// catalog_voices tables) via the `catalog` prop --
// { providers: [{ name, models: [{ value, label, voices? }], languages: [name],
//                 voices: [{ name, gender }] }] }.
// Most providers scope voices to themselves (provider.voices); Sarvam scopes
// voices to the selected model instead (model.voices), since Bulbul:v2 and
// v3 have different speaker lists -- when a model entry carries its own
// `voices`, that takes priority over the provider-level list.

const getProvider = (catalog, providerName) =>
  catalog?.providers?.find(p => p.name === providerName);

const getModelsForProvider = (catalog, providerName) =>
  getProvider(catalog, providerName)?.models ?? [];

const getAllModels = (catalog) => {
  const seen = new Map();
  for (const p of catalog?.providers ?? []) {
    for (const m of p.models) if (!seen.has(m.value)) seen.set(m.value, m);
  }
  return Array.from(seen.values());
};

const getLanguagesForProvider = (catalog, providerName) =>
  getProvider(catalog, providerName)?.languages ?? [];

const getVoicesFor = (catalog, providerName, modelValue) => {
  const provider = getProvider(catalog, providerName);
  if (!provider) return [];
  const model = provider.models.find(m => m.value === modelValue);
  if (model?.voices) return model.voices;
  return provider.voices ?? [];
};

// Shared form styles (kept in sync with ASRSection / LLmSection).
const LABEL = "block text-sm font-medium text-slate-700";
const HELP = "text-xs text-slate-500 mt-1.5";
const INPUT = "w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const chip = (selected, disabled) =>
  `px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
    disabled
      ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed"
      : selected
        ? "bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-600/20"
        : "bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:text-violet-700"
  }`;
const voiceTile = (selected) =>
  `flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition text-left min-w-0 ${
    selected
      ? "border-violet-500 bg-violet-50 text-violet-900 ring-1 ring-violet-500/30"
      : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
  }`;

const SelectedCheck = () => (
  <svg className="ml-auto flex-shrink-0 text-violet-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);

// DhVaani has no fixed voice presets -- it's zero-shot cloning from a
// user-uploaded reference clip (tts_voice_references table), not a picker
// grid. Voice references aren't part of the static catalog (they're
// per-deployment, user-created data), so they're fetched separately.
function useVoiceReferences(active) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${baseURL}api/tts/voice-references`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRefs(data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load voice references.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [active, refreshKey]);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  return { refs, loading, error, reload };
}

function VoiceReferenceUpload({ onUploaded }) {
  const uid = useId();
  const [name, setName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim() && transcript.trim() && file && !uploading;

  const handleUpload = async () => {
    if (!canSubmit) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("transcript", transcript.trim());
      formData.append("file", file);
      const res = await fetch(`${baseURL}api/tts/voice-references`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setName("");
      setTranscript("");
      setFile(null);
      onUploaded?.(data.name);
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <fieldset className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex flex-col gap-3 min-w-0">
      <legend className="px-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">Add a reference voice</legend>
      <div>
        <label htmlFor={`${uid}-name`} className={`${LABEL} mb-1`}>Voice name</label>
        <input
          id={`${uid}-name`}
          type="text"
          placeholder="e.g. Priya"
          value={name}
          onChange={e => setName(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-transcript`} className={`${LABEL} mb-1`}>Transcript</label>
        <textarea
          id={`${uid}-transcript`}
          placeholder="Exact transcript of the reference clip"
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          rows={2}
          className={`${INPUT} resize-y`}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-file`} className={`${LABEL} mb-1`}>Audio clip</label>
        <input
          id={`${uid}-file`}
          type="file"
          accept="audio/*"
          aria-describedby={`${uid}-file-help`}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-violet-100 file:text-violet-700 file:text-xs file:font-semibold hover:file:bg-violet-200"
        />
        <p id={`${uid}-file-help`} className={HELP}>3–10 seconds of clear, single-speaker audio works best.</p>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!canSubmit}
        className="self-start h-9 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition"
      >
        {uploading ? "Uploading…" : "Upload voice"}
      </button>
    </fieldset>
  );
}

export default function TTSSection({ id, config, onChange, catalog }) {
  const uid = useId();
  const [provider, setProvider] = useState(config?.provider ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [speed, setSpeed] = useState(config?.speed ?? 1.0);
  const [language, setLanguage] = useState(config?.language ?? "");
  const [voice, setVoice] = useState(config?.speaker_audio ?? "");

  const supportedModels = getModelsForProvider(catalog, provider);
  const allModels = getAllModels(catalog);
  const currentVoices = getVoicesFor(catalog, provider, model);
  const isDhVaani = model === "DhVaani";
  const voiceRefs = useVoiceReferences(isDhVaani);

  // Pick defaults once the catalog arrives (each time the `catalog` prop
  // changes identity), if none came from `config` (e.g. editing an existing
  // agent). Local state is adjusted during render
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes);
  // the parent is notified from an effect, since a parent can't be updated
  // mid-render.
  const [seenCatalog, setSeenCatalog] = useState(null);
  const [pendingDefault, setPendingDefault] = useState(null);
  if (catalog && catalog !== seenCatalog) {
    setSeenCatalog(catalog);
    const first = provider ? undefined : catalog.providers?.[0];
    if (first) {
      const firstModel = first.models[0]?.value ?? "";
      const firstLang = first.languages?.[0] ?? "";
      const firstVoice = getVoicesFor(catalog, first.name, firstModel)[0]?.name ?? "";
      setProvider(first.name);
      setModel(firstModel);
      setLanguage(firstLang);
      setVoice(firstVoice);
      setPendingDefault({
        provider: first.name,
        model: firstModel,
        language: firstLang,
        speed,
        speaker_audio: firstVoice,
      });
    }
  }
  const notifyDefault = useEffectEvent((cfg) => onChange?.(cfg));
  useEffect(() => {
    if (pendingDefault) notifyDefault(pendingDefault);
  }, [pendingDefault]);

  const handleProvider = (p) => {
    const models = getModelsForProvider(catalog, p);
    const newModel = models[0]?.value ?? "";
    const newLang = getLanguagesForProvider(catalog, p)[0] ?? "";
    const newVoice = getVoicesFor(catalog, p, newModel)[0]?.name ?? "";

    setProvider(p);
    setModel(newModel);
    setLanguage(newLang);
    setVoice(newVoice);

    onChange?.({
      provider: p,
      model: newModel,
      language: newLang,
      speed,
      speaker_audio: newVoice,
    });
  };

  const handleModel = (m) => {
    if (!supportedModels.some(sm => sm.value === m)) return;

    // Voice lists can differ per model (e.g. Sarvam Bulbul:v2 vs v3), so
    // re-resolve the voice list and fall back to the first entry if the
    // currently selected voice isn't available on the new model.
    const newVoices = getVoicesFor(catalog, provider, m);
    const newVoice = newVoices.some(v => v.name === voice) ? voice : (newVoices[0]?.name ?? "");

    setModel(m);
    setVoice(newVoice);
    onChange?.({
      provider,
      model: m,
      language,
      speed,
      speaker_audio: newVoice,
    });
  };

  const handleLanguage = (l) => {
    setLanguage(l);
    onChange?.({
      provider,
      model,
      language: l,
      speed,
      speaker_audio: voice,
    });
  };

  if (!catalog) {
    return (
      <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden p-5 sm:p-6 flex flex-col gap-3" aria-busy="true">
        <p className="text-sm text-slate-500">Loading TTS options…</p>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  const ids = {
    provider: `${uid}-provider`,
    model: `${uid}-model`,
    speed: `${uid}-speed`,
    language: `${uid}-language`,
    voice: `${uid}-voice`,
  };

  return (
    <section id={id} className="scroll-mt-16 bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 sm:px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-purple-50">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Text to Speech</h2>
          <p className="text-sm text-slate-500 mt-0.5">Choose the voice, language and pace your agent speaks with</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Provider */}
        <div className="md:col-span-2">
          <p id={ids.provider} className={`${LABEL} mb-2`}>Provider</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={ids.provider}>
            {(catalog.providers ?? []).map(p => (
              <button
                key={p.name}
                type="button"
                aria-pressed={provider === p.name}
                onClick={() => handleProvider(p.name)}
                className={chip(provider === p.name, false)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="md:col-span-2">
          <p id={ids.model} className={`${LABEL} mb-2`}>Model</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={ids.model}>
            {allModels.map(({ value }) => {
              const supported = supportedModels.some(m => m.value === value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={model === value}
                  onClick={() => handleModel(value)}
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

        {/* Speed */}
        <div>
          <label htmlFor={ids.speed} className={`${LABEL} mb-1.5`}>Speaking speed</label>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <input
                id={ids.speed}
                type="range"
                min={0.5} max={2.0} step={0.05}
                value={speed}
                aria-describedby={`${ids.speed}-help`}
                aria-valuetext={`${speed.toFixed(2)} times`}
                onChange={e => {
                  const next = Number(e.target.value);
                  setSpeed(next);
                  onChange?.({
                    provider,
                    model,
                    language,
                    speed: next,
                    speaker_audio: voice,
                  });
                }}
                className="w-full accent-violet-600"
              />
              <div id={`${ids.speed}-help`} className="flex justify-between text-xs text-slate-500 mt-0.5">
                <span>0.5× Slow</span>
                <span>1× Normal</span>
                <span>2× Fast</span>
              </div>
            </div>
            <output htmlFor={ids.speed} className="w-16 flex-shrink-0 bg-violet-50 border border-violet-200 rounded-lg text-center py-2 text-sm font-semibold text-violet-700 tabular-nums">
              {speed.toFixed(2)}×
            </output>
          </div>
        </div>

        {/* Language */}
        <div>
          <label htmlFor={ids.language} className={`${LABEL} mb-1.5`}>Language</label>
          <div className="relative">
            <select
              id={ids.language}
              value={language}
              onChange={e => handleLanguage(e.target.value)}
              className={`${INPUT} appearance-none pr-10`}
            >
              {getLanguagesForProvider(catalog, provider).map(l => <option key={l}>{l}</option>)}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <p className={HELP}>Languages available on {provider || "this provider"}.</p>
        </div>

        {/* Voice Picker */}
        <div className="md:col-span-2">
          <p id={ids.voice} className={`${LABEL} mb-2`}>Speaker voice</p>
          {isDhVaani ? (
            <div className="flex flex-col gap-3">
              {voiceRefs.error && <p role="alert" className="text-xs text-red-600">{voiceRefs.error}</p>}
              {voiceRefs.loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" aria-busy="true">
                  {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
              ) : voiceRefs.refs.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="group" aria-labelledby={ids.voice}>
                  {voiceRefs.refs.map(r => {
                    const isSelected = voice === r.name;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setVoice(r.name);
                          onChange?.({ provider, model, language, speed, speaker_audio: r.name });
                        }}
                        className={voiceTile(isSelected)}
                      >
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-violet-500" aria-hidden="true">
                          {r.name[0].toUpperCase()}
                        </span>
                        <span className="font-medium truncate min-w-0">{r.name}</span>
                        {isSelected && <SelectedCheck />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No reference voices yet — upload one below to get started.</p>
              )}
              <VoiceReferenceUpload
                onUploaded={(newName) => {
                  voiceRefs.reload();
                  setVoice(newName);
                  onChange?.({ provider, model, language, speed, speaker_audio: newName });
                }}
              />
            </div>
          ) : currentVoices.length === 0 ? (
            <p className="text-sm text-slate-500">No preset voices are listed for this model.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="group" aria-labelledby={ids.voice}>
              {currentVoices.map(v => {
                const isSelected = voice === v.name;
                return (
                  <button
                    key={v.name}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setVoice(v.name);
                      onChange?.({
                        provider,
                        model,
                        language,
                        speed,
                        speaker_audio: v.name,
                      });
                    }}
                    className={voiceTile(isSelected)}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        v.gender === "female" ? "bg-pink-500" : "bg-blue-500"
                      }`}
                      aria-hidden="true"
                    >
                      {v.name[0].toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{v.name}</span>
                      {v.gender && (
                        <span className={`block text-xs capitalize ${v.gender === "female" ? "text-pink-600" : "text-blue-600"}`}>{v.gender}</span>
                      )}
                    </span>
                    {isSelected && <SelectedCheck />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Current selection summary */}
        <div className="md:col-span-2 flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-xl min-w-0">
          <span className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-violet-900">Selected voice</p>
            <p className="text-xs text-violet-700 truncate">
              {[model, voice, language, `${speed.toFixed(2)}× speed`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="ml-auto hidden min-[420px]:flex items-end gap-0.5 h-5" aria-hidden="true">
            {[3,5,7,5,8,4,6,3,7,5].map((h, i) => (
              <div key={i} className="w-0.5 bg-violet-400 rounded-full" style={{ height: `${h * 2}px`, opacity: 0.6 + i * 0.04 }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
