"""One-off seed for the ASR/LLM/TTS provider catalog. Idempotent -- safe to
re-run; upserts by each table's natural unique key instead of blind insert."""
import json
import os

from src.database.engine import Base, SessionLocal, engine
from src.database.models import (
    CatalogLanguage,
    CatalogModel,
    CatalogPrompt,
    CatalogProvider,
    CatalogVoice,
)

Base.metadata.create_all(bind=engine)

_PROMPTS_PATH = os.path.join(os.path.dirname(__file__), "catalog_prompts.json")
with open(_PROMPTS_PATH) as f:
    PROMPTS = json.load(f)

ASR_PROVIDERS = {
    "Vaani": [("sravaani", "Sravaani(CPU)")],
    "Sarvam": [("saaras:v3", "saaras:v3"), ("saaras:flash", "saaras:flash")],
    "Deepgram": [("nova-3", "nova-3"), ("nova-2", "nova-2")],
    "AssemblyAI": [("best", "best"), ("nano", "nano")],
    "Whisper (OpenAI)": [("whisper-1", "whisper-1")],
}

LLM_PROVIDERS = {
    # Real Gemma 4 via the Gemini API / Google AI Studio (LLM/gemini.py's
    # GeminiLLM, same google.genai SDK/endpoint as regular Gemini models --
    # confirmed via Google's own docs). Free of charge on Google's own API
    # (no paid tier at all for Gemma there, unlike third-party hosts).
    # Replaces the earlier "Gemini-3.8-flash"/"Gemma 3" placeholders, which
    # were never real model ids and were never wired to anything.
    "Google": [
        # gemma-4-12b-it does NOT exist despite some third-party writeups
        # claiming otherwise -- confirmed via a live 404 and cross-checked
        # against client.models.list() on the real API with a real key:
        # only these two Gemma 4 ids are actually served.
        ("gemma-4-26b-a4b-it", "Gemma 4 26B (MoE)"), ("gemma-4-31b-it", "Gemma 4 31B"),
        # Real Gemini chat models, each confirmed via live calls through
        # this app's actual pipeline (not just docs/pricing pages) -- not
        # the earlier fake "Gemini-3.8-flash" placeholder id these once
        # sat next to. gemma-4-26b-a4b-it is a "thinking" model that burns
        # most of its wall-clock time on invisible reasoning tokens before
        # any visible output (measured ~18s avg TTFT); these gemini-*
        # ones stream real tokens immediately with no such overhead.
        ("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"),
        ("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite"),
        ("gemini-3.7-flash", "Gemini 3.7 Flash"),
    ],
    "OpenAI": ["Qwen2.5-7B-Instruct", "Qwen2.5-72B-Instruct", "LLaMA 3.1 8B", "LLaMA 3.3 70B", "Mistral 7B", "Mistral Large", "Gemma 2 9B"],
    "Groq": ["LLaMA 3.1 8B", "LLaMA 3.3 70B", "Mistral 7B", "Gemma 2 9B"],
    "Together AI": ["Qwen2.5-7B-Instruct", "Qwen2.5-72B-Instruct", "LLaMA 3.1 8B", "LLaMA 3.3 70B", "Mistral 7B", "Mistral Large", "Gemma 2 9B"],
    "Fireworks": ["Qwen2.5-7B-Instruct", "LLaMA 3.1 8B", "LLaMA 3.3 70B", "Mistral 7B"],
    # Ollama-backed models actually pulled/deployed (a separate Ollama host,
    # via LLM/ollama.py) -- narrowed from a placeholder list of generic names
    # that didn't correspond to anything pulled/servable. gemma4:e4b ("effective
    # 4B", ~8B raw params, 9.6GB Q4 quantized) doesn't fully fit in the box's
    # ~5.5GB free RAM -- confirmed working via direct test (real response, no
    # OOM) but with heavy swap-backed load latency (~16s cold load vs
    # near-instant for gemma3:4b), so still exposed as a selectable option
    # but expect a slow first turn.
    "Ollama": [("gemma3:4b", "Gemma 3 4B"), ("gemma4:e4b", "Gemma 4 E4B")],
}

TTS_MODELS = {
    "Vaani": ["DhVaani"],
    "Kokoro": ["Kokoro"],
    "Sarvam": ["Bulbul:v2", "Bulbul:v3"],
    "ElevenLabs": ["Eleven Multilingual v2", "Eleven Turbo v2", "Eleven Flash v2.5"],
    "Azure TTS": ["Neural", "Neural HD"],
    # Real Gemini native TTS (TTS/gemini.py), not the earlier "Google TTS"
    # placeholder (Wavenet/Neural2/Studio -- Google Cloud TTS product
    # names, never wired to anything). gemini-2.5-flash-preview-tts is
    # retired here: live-tested (both generate_content_stream and
    # interactions.create) and confirmed it doesn't actually stream on the
    # Gemini Developer API despite its name/Cloud-TTS docs suggesting it
    # does -- it returns one blob wrapped in a streaming envelope. Only
    # gemini-3.1-flash-tts-preview (confirmed real streaming) is offered.
    "Google": [
        ("gemini-3.1-flash-tts-preview", "Gemini 3.1 Flash TTS"),
    ],
}

TTS_LANGUAGES = {
    "Vaani": ["English", "Hindi", "Bengali", "Marathi", "Kannada", "Telugu", "Maithili", "Magahi", "Chhattisgarhi", "Bhojpuri", "Assamese", "Tamil", "Gujarati", "Malayalam", "Manipuri", "Odia", "Punjabi", "Nepali", "Sindhi", "Konkani", "Santali", "Bodo", "Urdu", "Sanskrit", "Dogri", "Kashmiri", "Rajasthani"],
    "Kokoro": ["English", "Hindi", "Japanese", "Chinese", "French", "Spanish"],
    "Sarvam": ["Hindi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Gujarati", "Odia"],
    "ElevenLabs": ["English", "French", "German", "Spanish", "Portuguese", "Italian", "Polish"],
    "Azure TTS": ["English", "Hindi", "French", "German", "Spanish", "Japanese", "Chinese", "Arabic"],
    # Google deliberately has no entry here: Gemini TTS auto-detects the
    # spoken language from the input text ("60+ languages" per Google's
    # docs, no fixed enumerable list, no language-selection parameter to
    # populate a dropdown for) rather than taking an explicit language
    # choice like the other providers do.
}

# Provider-scoped voices: (name, gender)
TTS_VOICES_BY_PROVIDER = {
    # Vaani/DhVaani has no fixed named presets -- it's zero-shot voice
    # cloning from a user-uploaded reference clip (tts_voice_references
    # table), not a preset list. An earlier version of this seed had
    # fabricated names (Ananya, Ishita, ...) with no real audio behind
    # them; removed rather than shipping fake presets.
    "Kokoro": [("af_heart", "female"), ("af_bella", "female"), ("am_adam", "male"), ("am_michael", "male"), ("bf_emma", "female"), ("bm_george", "male"), ("bm_lewis", "male"), ("hf_alpha", "female")],
    "ElevenLabs": [("Rachel", "female"), ("Domi", "female"), ("Bella", "female"), ("Antoni", "male"), ("Elli", "female"), ("Josh", "male"), ("Arnold", "male"), ("Adam", "male")],
    "Azure TTS": [("Jenny", "female"), ("Guy", "male"), ("Aria", "female"), ("Davis", "male"), ("Emma", "female"), ("Brian", "male")],
    # All 30 of Gemini TTS's real documented prebuilt voices
    # (https://ai.google.dev/gemini-api/docs/speech-generation). Google
    # describes them by character/tone (e.g. Kore="firm", Puck="upbeat"),
    # not gender -- None throughout rather than guessing.
    "Google": [
        ("Zephyr", None), ("Puck", None), ("Charon", None), ("Kore", None), ("Fenrir", None),
        ("Leda", None), ("Orus", None), ("Aoede", None), ("Callirrhoe", None), ("Autonoe", None),
        ("Enceladus", None), ("Iapetus", None), ("Umbriel", None), ("Algieba", None), ("Despina", None),
        ("Erinome", None), ("Algenib", None), ("Rasalgethi", None), ("Laomedeia", None), ("Achernar", None),
        ("Alnilam", None), ("Schedar", None), ("Gacrux", None), ("Pulcherrima", None), ("Achird", None),
        ("Zubenelgenubi", None), ("Vindemiatrix", None), ("Sadachbia", None), ("Sadaltager", None), ("Sulafat", None),
    ],
}

# Model-scoped voices (Sarvam only): model value -> [(name, gender)]
TTS_VOICES_BY_MODEL = {
    "Bulbul:v2": [("Anushka", "female"), ("Abhilash", "male"), ("Manisha", "female"), ("Vidya", "female"), ("Arjun", "male"), ("Meera", "female")],
    "Bulbul:v3": [
        ("Aditya", "male"), ("Ritu", "female"), ("Ashutosh", "male"), ("Priya", "female"), ("Neha", "female"), ("Rahul", "male"),
        ("Pooja", "female"), ("Rohan", "male"), ("Simran", "female"), ("Kavya", "female"), ("Amit", "male"), ("Dev", "male"),
        ("Ishita", "female"), ("Shreya", "female"), ("Ratan", "male"), ("Varun", "male"), ("Manan", "male"), ("Sumit", "male"),
        ("Roopa", "female"), ("Kabir", "male"), ("Aayan", "male"), ("Shubh", "male"), ("Advait", "male"), ("Anand", "male"),
        ("Tanya", "female"), ("Tarun", "male"), ("Sunny", "male"), ("Mani", "male"), ("Gokul", "male"), ("Vijay", "male"),
        ("Shruti", "female"), ("Suhani", "female"), ("Mohit", "male"), ("Kavitha", "female"), ("Rehan", "male"), ("Soham", "male"),
        ("Rupali", "female"), ("Niharika", "female"),
    ],
}

TTS_PROVIDER_ORDER = ["Vaani", "Kokoro", "Sarvam", "ElevenLabs", "Azure TTS", "Google"]


def get_or_create_provider(db, stage, name, order):
    p = db.query(CatalogProvider).filter_by(stage=stage, name=name).first()
    if p:
        return p
    p = CatalogProvider(stage=stage, name=name, sort_order=order)
    db.add(p)
    db.flush()
    return p


def get_or_create_model(db, provider, value, label, order):
    m = db.query(CatalogModel).filter_by(provider_id=provider.id, value=value).first()
    if m:
        return m
    m = CatalogModel(provider_id=provider.id, value=value, label=label, sort_order=order)
    db.add(m)
    db.flush()
    return m


def get_or_create_language(db, provider, name, order):
    if db.query(CatalogLanguage).filter_by(provider_id=provider.id, name=name).first():
        return
    db.add(CatalogLanguage(provider_id=provider.id, name=name, sort_order=order))


def get_or_create_voice(db, name, gender, order, provider=None, model=None):
    q = db.query(CatalogVoice).filter_by(name=name)
    q = q.filter_by(provider_id=provider.id if provider else None)
    q = q.filter_by(model_id=model.id if model else None)
    if q.first():
        return
    db.add(CatalogVoice(
        provider_id=provider.id if provider else None,
        model_id=model.id if model else None,
        name=name, gender=gender, sort_order=order,
    ))


def seed():
    db = SessionLocal()
    try:
        # ASR
        for i, (pname, models) in enumerate(ASR_PROVIDERS.items()):
            provider = get_or_create_provider(db, "asr", pname, i)
            for j, (value, label) in enumerate(models):
                get_or_create_model(db, provider, value, label, j)

        # LLM
        for i, (pname, models) in enumerate(LLM_PROVIDERS.items()):
            provider = get_or_create_provider(db, "llm", pname, i)
            for j, model in enumerate(models):
                # Most entries are plain display-name strings (value == label,
                # cosmetic-only -- not wired to any real backend). Tuples are
                # for providers with a real backend, where the stored value
                # must be the actual model tag the backend expects (e.g.
                # Ollama's "gemma3:4b"), distinct from its display label.
                value, label = model if isinstance(model, tuple) else (model, model)
                get_or_create_model(db, provider, value, label, j)

        for i, (name, text) in enumerate(PROMPTS.items()):
            if not db.query(CatalogPrompt).filter_by(name=name).first():
                db.add(CatalogPrompt(name=name, prompt_text=text, sort_order=i))

        # TTS
        model_by_key = {}  # (provider_name, model_value) -> CatalogModel, for Sarvam voice linking
        for i, pname in enumerate(TTS_PROVIDER_ORDER):
            provider = get_or_create_provider(db, "tts", pname, i)
            for j, model in enumerate(TTS_MODELS.get(pname, [])):
                # Most entries are plain display-name strings (value ==
                # label, cosmetic-only -- not wired to any real backend).
                # Tuples are for providers with a real backend (e.g.
                # Google/Gemini TTS), where the stored value must be the
                # actual model id the backend expects.
                mvalue, mlabel = model if isinstance(model, tuple) else (model, model)
                model_by_key[(pname, mvalue)] = get_or_create_model(db, provider, mvalue, mlabel, j)
            for j, lname in enumerate(TTS_LANGUAGES.get(pname, [])):
                get_or_create_language(db, provider, lname, j)
            for j, (vname, gender) in enumerate(TTS_VOICES_BY_PROVIDER.get(pname, [])):
                get_or_create_voice(db, vname, gender, j, provider=provider)

        for model_value, voices in TTS_VOICES_BY_MODEL.items():
            model = model_by_key.get(("Sarvam", model_value))
            for j, (vname, gender) in enumerate(voices):
                get_or_create_voice(db, vname, gender, j, model=model)

        db.commit()
        print("Catalog seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
