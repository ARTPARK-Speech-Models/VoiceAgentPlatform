// Keep a builder's ASR/LLM/TTS config in line with what GET /api/catalog
// actually serves: if the current provider/model isn't offered (e.g. a
// retired hard-coded default), swap in that stage's first catalog option
// so card summaries and the created agent match the real pickers. A config
// that's already valid is returned unchanged (same object).
// Preferred defaults per stage when several models are offered (catalog
// order is seed order, not "best first") -- the first one present wins,
// otherwise the stage's first catalog option.
const PREFERRED_MODELS = {
  llm: ["gemini-3.7-flash", "gemini-3.5-flash-lite"],
};

function pickDefault(stage, providers) {
  for (const value of PREFERRED_MODELS[stage] ?? []) {
    for (const p of providers) {
      const m = (p.models ?? []).find((x) => x.value === value);
      if (m) return { p, m };
    }
  }
  const p = providers[0];
  return { p, m: p?.models?.[0] };
}

export function alignToCatalog(stage, config, catalog) {
  const providers = catalog?.[stage]?.providers ?? [];
  const offered = providers.some(
    (p) => p.name === config.provider && (p.models ?? []).some((m) => m.value === config.model),
  );
  const { p, m } = pickDefault(stage, providers);
  if (offered || !p || !m) return config;

  const next = { ...config, provider: p.name, model: m.value };
  if (stage === "tts") {
    const languages = p.languages ?? [];
    const voices = m.voices ?? p.voices ?? [];
    next.language = languages.includes(config.language) ? config.language : (languages[0] ?? config.language);
    next.speaker_audio = voices.some((v) => v.name === config.speaker_audio)
      ? config.speaker_audio
      : (voices[0]?.name ?? config.speaker_audio);
  }
  return next;
}
