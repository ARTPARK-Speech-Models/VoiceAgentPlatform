import asyncio
import json
import os
import time
import traceback
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime
from functools import partial
from pathlib import Path

import httpx
import numpy as np
from ASR.gemini_asr import GEMINI_ASR_MODEL, GEMINI_ASR_MODEL_LATEST, transcribe_gemini
from ASR.muse_asr import MUSE_ASR_MODEL, transcribe_muse
from ASR.openai_asr import OPENAI_ASR_MODEL, transcribe_openai
from ASR.pricing import estimate_cost_usd as estimate_asr_cost_usd
from ASR.sarvam_asr import SARVAM_ASR_MODEL, transcribe_sarvam
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from LLM.gemini import GeminiLLM
from LLM.gemini_live import GeminiLiveLLM
from LLM.ollama import OllamaLLM
from LLM.pricing import estimate_cost_usd
from LLM.tools import ToolRegistry
from Sarvam.sarvam import SarvamASR, SarvamTTS
from sqlalchemy.sql import func
from src.boundary_detector import SentenceBoundaryDetector
from src.constants import (
    ASR_SAMPLE_RATE,
    LLM_ERROR_MESSAGE,
    SUMMARY_PROMPT,
    VOICE_REFERENCE_DIR,
)
from src.crud import router as crud_router
from src.database.auth import auth_required
from src.database.engine import get_db
from src.database.models import AgentSession, CallHistory, TTSVoiceReference
from src.database.utils import (
    agent_config_cache,
    agent_info_orchestrator,
    get_user_api_keys,
    invalidate_agent_config,
)
from src.database.ws_auth import get_ws_auth
from src.mcp_client import mcp_client
from src.recordings import save_call_recording
from TTS.dhvaani import DhVaaniTTS
from TTS.gemini import GeminiTTS
from TTS.kokoro import KokoroTTS
from TTS.pricing import estimate_cost_usd as estimate_tts_cost_usd
from VAD.voice_detection import StreamingVAD

allowed_tools = {"rag_retrieve", "list_sources", "get_mandi_prices"}
registry = ToolRegistry()

custom_llm = None

llm_choices = {
    "Vaani": GeminiLLM,
    "Google": GeminiLLM,  # real Gemma 4 via the Gemini API -- same client class, different model id
    "Google-Live": GeminiLiveLLM,  # Live API, native audio output -- see LLM/gemini_live.py
    "Ollama": OllamaLLM,
}


# --- local ASR / TTS config -----------------------------------------------
KOKORO_VOICE = "hf_alpha"
KOKORO_SPEED = 1

# Gemini TTS: splitting a reply into multiple synthesize() calls (tried as
# a bounded two-call split, and separately as a rolling call-every-N-
# sentences design) was reverted -- stitching independently synthesized
# clips together produces an audible seam/tone break at the join. One
# synthesize() call over the full reply (see run_llm's stream_end handler)
# has no seam -- that's a text-level decision, separate from
# GeminiTTS.stream() itself streaming that one call's audio back in
# chunks as it's generated (issue #66).

# Kokoro emits float32 PCM at this fixed rate (see KokoroTTS.sampling_rate).
# The synthesizer used to own this; now the frontend's TTS_SAMPLE_RATE /
# playback code must match this value (24000, float32, mono) or audio will
# play back at the wrong pitch/speed.
TTS_SAMPLE_RATE = 24000

# One Kokoro pipeline per language, loaded once and shared across every
# WebSocket connection. Despite the old comment here claiming lifespan()
# populated this, it never did -- lifespan() only ever called .clear() on
# it, so this dict was permanently empty and every Kokoro synthesize() call
# hit `tts_engines["hi"]` on an empty dict, raising KeyError('hi'). Lazily
# populated by get_kokoro_engine() below instead, same pattern as
# get_dhvaani_engine().
tts_engines: dict[str, KokoroTTS] = {}

# Kokoro's KPipeline takes a single-char lang_code, not an ISO 639-1 code --
# map the ones this pipeline's ASR/VAD actually produce; anything else
# falls back to Hindi ('h'), matching the old (broken) `or tts_engines["hi"]`
# fallback's intent.
KOKORO_LANG_CODE = {"hi": "h", "en": "a"}


def get_kokoro_engine(lang: str) -> KokoroTTS:
    lang_code = KOKORO_LANG_CODE.get(lang, "h")
    engine = tts_engines.get(lang_code)
    if engine is None:
        engine = KokoroTTS(lang_code=lang_code)
        tts_engines[lang_code] = engine
    return engine

# ASR is SraVaani-1.0, proxied to a remote inference service
# (sravaani_service.py, the `sravaani` compose service) over HTTP -- same
# relationship as LLM/ollama.py and TTS/dhvaani.py have to their services.
# SraVaani-1.0 is a TDT model with no incremental streaming API (confirmed:
# its config lacks supported_att_context_sizes, which the old
# SraVaani-0.5-live cache-aware streaming Conformer wrapper needed), only
# whole-utterance transcribe() -- which is fine, since VAD already hands
# transcribe_segment() a complete utterance, not a live chunk stream.
ASR_API_BASE = os.environ.get("SRAVAANI_API_BASE", "").rstrip("/")
ASR_API_KEY = os.environ.get("SRAVAANI_API_KEY", "")



class MissingAPIKeyError(ValueError):
    """An agent's provider needs a key the user hasn't added in Settings.
    str(e) is the user-facing message."""


# Providers that run on the user's own key: LLM/TTS keys resolve per agent
# (agent-level key, else the owner's Settings key -- see
# agent_info_orchestrator), everything else straight from Settings.
GOOGLE_LLM_PROVIDERS = {"Vaani", "Google", "Google-Live"}


def missing_api_key(config: dict) -> str | None:
    api_keys = config.get("api_keys") or {}
    if config["llm"]["provider"] in GOOGLE_LLM_PROVIDERS and not config["llm"].get("api_key"):
        return "This agent's LLM needs a Google API key -- add one in Settings."
    if config["tts"]["provider"] == "Google" and not config["tts"].get("api_key"):
        return "This agent's TTS needs a Google API key -- add one in Settings."
    if "Sarvam" in (config["asr"]["provider"], config["tts"]["provider"]) and not api_keys.get("Sarvam"):
        return "This agent uses Sarvam -- add a Sarvam API key in Settings."
    return None


async def get_agent_config(agent_id: int = 1) -> dict:
    global custom_llm
    if agent_id in agent_config_cache:
        return agent_config_cache[agent_id]

    config = {}
    with contextmanager(get_db)() as standalone_db:
        config = agent_info_orchestrator(standalone_db, agent_id)

    if not config:
        return {}

    missing = missing_api_key(config)
    if missing:
        raise MissingAPIKeyError(missing)

    agent_config_cache[agent_id] = config

    llm_provider = config["llm"]["provider"]
    llm_class = llm_choices.get(llm_provider)
    if llm_class is None:
        raise ValueError(
            f"Agent {agent_id} is configured with LLM provider '{llm_provider}', "
            f"which has no wired-up implementation. Available: {list(llm_choices)}"
        )
    llm_kwargs = dict(
        tool_registry=registry,
        allowed_tools=allowed_tools,
        model_name=config["llm"]["model"]
    )
    # api_key is the user's Google key -- only pass it for Gemini classes,
    # OllamaLLM's api_key kwarg means something different (the Ollama
    # proxy's own shared secret).
    if llm_class in (GeminiLLM, GeminiLiveLLM):
        llm_kwargs["api_key"] = config["llm"].get("api_key")
    custom_llm = llm_class(**llm_kwargs)
    custom_llm.compile_tools()
    mcp_url = config.get("mcp_url", None)
    if mcp_url:
        print("Found mcp url")
        await mcp_client.connect(mcp_url)
    return config


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tts_engines

    try:
        await mcp_client.connect()
        await registry.fetch_mcp_tools()
    except Exception as exc:
        print(f"MCP init skipped: {exc}")


    # Keep startup lightweight. Heavy TTS models are initialized lazily
    # when they are actually needed, so the FastAPI app is reachable quickly.
    tts_engines.clear()

    yield
    await mcp_client.close()


app = FastAPI(lifespan=lifespan)
print("CRUD ROUTER FILE:", crud_router)

app.include_router(crud_router)

# Frontend origins allowed to call the API with the session cookie.
# Comma-separated CORS_ORIGINS overrides the local-dev defaults.
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()] or [
    "http://localhost:5173",
    "https://localhost:5173",
    "https://localhost",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




async def transcribe_segment(segment: np.ndarray) -> str:
        """Send one VAD-detected utterance to the remote SraVaani-1.0
        service and return its transcript. `segment` is already raw
        float32 PCM mono at ASR_SAMPLE_RATE (16kHz), matching exactly what
        the service expects with no resampling."""
        assert segment.dtype == np.float32
        pcm_bytes = segment.tobytes()

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{ASR_API_BASE}/transcribe",
                files={"file": ("segment.pcm", pcm_bytes, "application/octet-stream")},
                headers={"X-API-Key": ASR_API_KEY},
            )
        response.raise_for_status()
        return response.json().get("text", "")


@app.get("/")
def home():
    return {
        "message": "Helloo",
        "status": 200
    }


def eval_asr_cost_usd(segment: np.ndarray, providers) -> float:
    """Cost of one eval-mode fan-out (the given cloud ASR providers) over
    this segment. Charged whether or not each provider succeeds --
    overcounting is the safe direction for an estimate."""
    seconds = len(segment) / ASR_SAMPLE_RATE
    return sum(estimate_asr_cost_usd(p, seconds) or 0.0 for p in providers)

asr_choices = {
    "Sarvam": SarvamASR
}

# Evaluation mode (issue #69-72) -- a call-time toggle, not a per-agent
# setting: when the browser connects with ?eval_mode=1, every VAD-finalized
# segment is additionally sent to each of these, purely for the comparison
# UI. "Vaani" here maps to the exact same transcribe_segment() the real
# pipeline already calls -- its result is reused rather than re-run (see
# run_asr_eval below), this entry just documents it's the primary/baseline
# for agents actually configured to use it. Pluggable: adding another
# provider here is one more entry, not a redesign. `model` is the actual
# underlying model name (not just the provider), shown in the comparison
# UI as "Provider (model)".
#
# Every cloud entry runs on the user's own key for its `key` provider (from
# Settings) and is skipped when the user has none -- see eval_providers.
# Each provider call in run_asr_eval below is independently
# timeout+exception-isolated, so a bad key just yields None text for that
# provider without affecting the others or the real pipeline.
# "Google-Latest" is gemini-3.7-flash -- added alongside "Google" (not a
# replacement) for direct comparison, even though gemini_asr.py documents
# it hallucinating on silence. `partial` binds the model since
# transcribe_gemini is shared by both entries.
EVAL_ASR_MODELS = {
    "Vaani": {"fn": transcribe_segment, "model": "SraVaani-1.0", "key": None},
    "Google": {"fn": transcribe_gemini, "model": GEMINI_ASR_MODEL, "key": "Google"},
    "Google-Latest": {"fn": partial(transcribe_gemini, model=GEMINI_ASR_MODEL_LATEST), "model": GEMINI_ASR_MODEL_LATEST, "key": "Google"},
    "OpenAI": {"fn": transcribe_openai, "model": OPENAI_ASR_MODEL, "key": "OpenAI"},
    "Sarvam": {"fn": transcribe_sarvam, "model": SARVAM_ASR_MODEL, "key": "Sarvam"},
    "Muse": {"fn": transcribe_muse, "model": MUSE_ASR_MODEL, "key": "Muse"},
}
EVAL_ASR_TIMEOUT_S = 15


def eval_providers(api_keys: dict) -> dict:
    """Cloud EVAL_ASR_MODELS entries the user has a key for, as
    {name: transcribe_fn} with the key already bound."""
    return {
        name: partial(cfg["fn"], api_key=api_keys[cfg["key"]])
        for name, cfg in EVAL_ASR_MODELS.items()
        if cfg["key"] and api_keys.get(cfg["key"])
    }


def load_user_api_keys(username: str | None) -> dict:
    if not username:
        return {}
    with contextmanager(get_db)() as db:
        return get_user_api_keys(db, username)


@app.get("/api/asr/eval-models")
@auth_required
async def list_asr_eval_models(request: Request, response: Response, user_payload: dict = None):
    """Model Cards page -- lists every ASR provider available for on-demand
    inference/comparison (same EVAL_ASR_MODELS dict evaluation mode's live
    fan-out already uses), so the frontend doesn't hardcode the provider
    list and drift out of sync with it. `available` is False for a cloud
    provider the user has no key for in Settings."""
    available = {"Vaani", *eval_providers(load_user_api_keys((user_payload or {}).get("username")))}
    return {"providers": [
        {"provider": name, "model": cfg["model"], "available": name in available, "key_provider": cfg["key"]}
        for name, cfg in EVAL_ASR_MODELS.items()
    ]}


@app.post("/api/asr/inference")
@auth_required
async def run_asr_inference(
    request: Request,
    response: Response,
    audio: UploadFile = File(...),
    providers: str = Form(...),
    user_payload: dict = None,
):
    """Model Cards page's on-demand inference/comparison -- runs one
    recorded clip through whichever ASR providers the user selected
    (comma-separated in `providers`), reusing the exact same transcribe_fn
    per provider as the live eval-mode fan-out (run_asr_eval below), just
    triggered from a one-shot upload instead of a VAD-finalized call
    segment. `audio` is raw float32 PCM mono at 16kHz -- the same "segment"
    shape every transcribe_fn already expects, produced by the same
    AudioWorklet-based mic capture the live call widget uses, just
    recorded to one buffer and sent whole instead of streamed continuously.
    Independently timeout+exception-isolated per provider, same as
    run_asr_eval, so one slow/broken provider can't fail the whole request."""
    pcm_bytes = await audio.read()
    segment = np.frombuffer(pcm_bytes, dtype=np.float32)
    if segment.size == 0:
        raise HTTPException(detail="No audio received.", status_code=400)

    requested = [p.strip() for p in providers.split(",") if p.strip()]
    selected = [(name, EVAL_ASR_MODELS[name]) for name in requested if name in EVAL_ASR_MODELS]
    if not selected:
        raise HTTPException(detail=f"No valid providers in {requested!r}. Available: {list(EVAL_ASR_MODELS)}", status_code=400)
    runnable = {"Vaani": transcribe_segment, **eval_providers(load_user_api_keys((user_payload or {}).get("username")))}
    missing = [cfg["key"] for name, cfg in selected if name not in runnable]
    if missing:
        raise HTTPException(detail=f"Add a {', '.join(sorted(set(missing)))} API key in Settings to use this provider.", status_code=400)

    async def run_one(provider: str, cfg: dict):
        start = time.perf_counter()
        try:
            text = await asyncio.wait_for(runnable[provider](segment), timeout=EVAL_ASR_TIMEOUT_S)
        except Exception as e:
            print(f"[ASR inference] {provider} failed: {e}")
            text = None
        return {
            "provider": provider,
            "model": cfg["model"],
            "text": text,
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
        }

    results = await asyncio.gather(*(run_one(name, cfg) for name, cfg in selected))
    return {"results": results}


async def run_asr_eval(segment: np.ndarray, turn_id: str, primary_text: str, primary_latency_ms: float, send_json, providers: dict, history: list | None = None):
    """Evaluation mode (issue #72) -- runs every other configured eval
    model against the same segment the real pipeline already transcribed,
    purely for the comparison UI. Meant to be dispatched via create_task
    from the caller so it can never block or delay the real turn; every
    model call here is independently timed out and exception-isolated so
    one slow/broken model can't take the others (or the real conversation)
    down with it.

    Takes the caller's own send_json wrapper (it has its own send lock)
    rather than assuming one. `providers` is eval_providers() for the
    agent's owner -- only cloud models they have a key for run.

    history (issue #69-72 persistence follow-up): if the caller passes its
    own accumulator list, each turn's results are appended to it (for the
    finally block to persist onto CallHistory later)."""
    results = [{
        "provider": "Vaani",
        "model": EVAL_ASR_MODELS["Vaani"]["model"],
        "text": primary_text,
        "latency_ms": round(primary_latency_ms, 1),
        "is_primary": True,
    }]

    async def run_one(provider: str, transcribe_fn, model: str):
        start = time.perf_counter()
        try:
            text = await asyncio.wait_for(transcribe_fn(segment), timeout=EVAL_ASR_TIMEOUT_S)
        except Exception as e:
            print(f"[ASR eval] {provider} failed: {e}")
            text = None
        return {
            "provider": provider,
            "model": model,
            "text": text,
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            "is_primary": False,
        }

    other_models = [(p, fn, EVAL_ASR_MODELS[p]["model"]) for p, fn in providers.items()]
    if other_models:
        results.extend(await asyncio.gather(*(run_one(p, fn, model) for p, fn, model in other_models)))

    if history is not None:
        history.append({"turn_id": turn_id, "results": results})

    try:
        await send_json({"type": "asr_eval", "turn_id": turn_id, "results": results})
    except Exception as e:
        print(f"[ASR eval] failed to send results: {e}")


tts_choices = {
    "Sarvam": SarvamTTS
}

# Loaded lazily on first use, like the ASR/Kokoro models -- this is a gated,
# ~123M-param download (needs a real HF_TOKEN with access), not something to
# pull in at app startup.
dhvaani_engine: DhVaaniTTS | None = None


def get_dhvaani_engine() -> DhVaaniTTS:
    global dhvaani_engine
    if dhvaani_engine is None:
        dhvaani_engine = DhVaaniTTS()
    return dhvaani_engine




@app.websocket("/orchestrate/configurable/agent/{agent_id}")
async def ochestrate_agent(
    browser_ws: WebSocket,
    agent_id: int,
    auth_data: dict = Depends(get_ws_auth)
):
    # Firebase session cookies have one fixed lifetime (set at mint time,
    # see crud.py's create_session) -- no separate access/refresh pair to
    # rotate mid-handshake, unlike the old JWT cookies. get_ws_auth already
    # denied the upgrade if the cookie was missing/invalid/expired, so
    # accept() here needs no extra headers.
    await browser_ws.accept()

    # Evaluation mode (issue #70) -- a call-time toggle read once at
    # connect, not a persisted per-agent setting: ?eval_mode=1 on the WS
    # URL. Deliberately not stored in agent_config -- this is instrumentation
    # for the person testing the agent, not part of the agent's own config.
    eval_mode = browser_ws.query_params.get("eval_mode") in ("1", "true", "True")
    # Built once per call; empty when eval mode is off, so nothing extra runs.
    call_eval_providers = eval_providers(load_user_api_keys(auth_data.get("user_payload", {}).get("username"))) if eval_mode else {}

    # agent_config_cache
    try:
        agent_config = await get_agent_config(agent_id=agent_id)
    except MissingAPIKeyError as e:
        await browser_ws.send_json({"type": "error", "text": str(e)})
        await browser_ws.close(code=1008, reason=str(e))
        return
    if not agent_config:
        # get_agent_config() returns {} for a nonexistent/deleted agent_id --
        # previously this fell through to agent_config["tts"]["model"] below
        # and crashed with an unhandled KeyError, which uvicorn surfaces as
        # an ungraceful socket drop (client sees close code 1006) instead of
        # a real error message.
        await browser_ws.send_json({"type": "error", "text": f"Agent {agent_id} not found."})
        await browser_ws.close(code=1008)
        return

    # Fire-and-forget RAG warm-up: the first real rag_retrieve call for this
    # agent pays a one-time cold-start cost (mcp-server opening/creating its
    # ChromaDB collection for this agent_id), on top of the LLM's own
    # decision latency. Triggering it here, at activation, absorbs that cost
    # before the user's first question instead of adding it to their first
    # turn's latency. execute_tool() already swallows its own errors and
    # returns a string rather than raising, so a missing/empty knowledge
    # base here is harmless -- this is purely a latency optimization, its
    # result is discarded.
    username = auth_data.get("user_payload", {}).get("username")
    asyncio.create_task(
        registry.execute_tool(
            name="rag_retrieve", args={"query": "hello"},
            agent_name=agent_config["name"].lower(),
        )
    )

    vad = StreamingVAD(
        speech_threshold=agent_config.get("speech_threshold", 0.6),
        min_silence_ms=agent_config.get("min_silence", 500),
        min_speech_ms=agent_config.get("min_speech_duration", 250)
    )
    can_play = True
    tts_buffer: list[bytes] = []
    current_lang = "hi"
    curr_req_id = None
    was_speaking = False
    history: list[dict] = []
    llm_task: asyncio.Task | None = None

    tts_queue: asyncio.Queue = asyncio.Queue()
    audio_out_queue: asyncio.Queue = asyncio.Queue()  # ("bytes", pcm) from whichever TTS engine
    tts_done_event = asyncio.Event()
    tts_done_event.set()  # nothing pending initially

    # browser_ws.send_json/send_bytes are called from several independent
    # tasks (audio_sender, run_llm's stream_end/keepalive, handle_transcript,
    # tool-call status pings, farewell/summary) -- the underlying websockets
    # library's connection object isn't safe for concurrent writers: two
    # sends racing on the same socket corrupts its internal drain-waiter
    # state and crashes with a bare `AssertionError` deep in
    # websockets/legacy/protocol.py's _drain_helper (surfaced here as an
    # empty "[LLM] Unexpected error: "). Became far more likely once a
    # single non-streamed Gemini TTS call started sending one large audio
    # payload (many seconds to drain) instead of many small ones, widening
    # the window for a second send to land mid-drain. Every send below
    # goes through this lock so only one is ever in flight at a time.
    ws_send_lock = asyncio.Lock()

    async def ws_send_json(data: dict):
        async with ws_send_lock:
            await browser_ws.send_json(data)

    async def ws_send_bytes(data: bytes):
        async with ws_send_lock:
            await browser_ws.send_bytes(data)

    tool_in_progress = False

    asr_timings: list[float] = []
    llm_total_timings: list[float] = []
    llm_no_tool_timings: list[float] = []
    llm_tool_timings: list[float] = []
    tts_timings: list[float] = []
    ttft_timings: list[float] = []
    e2e_timings: list[float] = []
    # Evaluation mode (issue #69-72) -- run_asr_eval appends each turn's
    # results here as they complete (it's dispatched fire-and-forget via
    # create_task, so this is the only way the finally block below can see
    # them for persistence). Stays empty when eval_mode is off.
    eval_results_history: list[dict] = []
    # Set the moment a turn's LLM task is kicked off (speech decoded), and
    # consumed by audio_sender the first time it actually sends a byte for
    # that turn -- this is the number that actually matters for perceived
    # latency ("how long after I stopped talking until I hear something"),
    # which nothing here measured before.
    turn_start_time: float | None = None

    # Per-turn latency breakdown (issue #27) -- the *_timings lists above
    # are per-metric and only ever aggregated into one min/max/avg summary
    # for the whole call, with no way to see how latency moved turn over
    # turn. pending_turn accumulates one turn's numbers as they become
    # available (ASR at transcript time, TTFT/total at stream_end, TTS
    # ttfb at the same point since Gemini TTS is awaited synchronously
    # there, e2e once audio_sender has dequeued this turn's first chunk)
    # and is pushed onto turn_latencies once the turn is fully done. Only
    # one turn is ever in flight (handle_transcript cancels any prior
    # llm_task first), so a single scratch dict is safe.
    turn_latencies: list[dict] = []
    pending_turn: dict = {}

    # Token/cost counter (issue #31) -- summed from each turn's real
    # usage_metadata (see LLM/gemini.py's generate()), never estimated
    # from text length. Ollama turns don't report usage yet, so they just
    # don't add to this (not a wrong number, an absent one).
    call_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    # Same idea for Gemini TTS (see TTS/gemini.py's stream()) -- real
    # usage_metadata tokens, summed per turn. Stays at 0 for every other
    # TTS engine (Kokoro/DhVaani self-hosted, or no usage captured).
    call_tts_usage = {"prompt_tokens": 0, "output_tokens": 0}
    # Eval-mode cloud ASR fan-out cost, charged when each turn's fan-out is
    # dispatched (see ASR/pricing.py).
    call_eval_asr_spend = 0.0

    # Call-history tracking -- call_history table existed but nothing ever
    # wrote to it. call_messages mirrors `history` but only clean user/
    # assistant text turns (no function_calls/function_responses bookkeeping),
    # for a readable transcript dump.
    call_messages: list[dict] = []
    call_started_at = datetime.now(UTC)
    total_tool_calls = 0
    disconnect_reason = "unknown"
    username = auth_data.get("user_payload", {}).get("username")

    # Call recording (issue #29) -- raw PCM float32 bytes, buffered in
    # memory for the call's duration and written out as WAV once at the
    # end (call_uuid is generated now rather than using the CallHistory
    # row's id, which doesn't exist until that row is inserted in the
    # finally block below). user_audio is every received mic frame
    # regardless of VAD state (a real recording of the call, not just the
    # segments ASR saw); agent_audio is every chunk audio_sender actually
    # dequeued, tapped once at that single point regardless of whether it
    # was sent immediately or buffered in tts_buffer for a delayed flush,
    # so nothing is recorded twice.
    call_uuid = str(uuid.uuid4())
    user_audio_chunks: list[bytes] = []
    agent_audio_chunks: list[bytes] = []

    farewell_done_event = asyncio.Event()
    farewell_req_id = None


    tts_provider_client = None
    gemini_tts_client = None
    tts_model = agent_config["tts"]["model"]
    # GeminiLiveLLM (provider "Google-Live") produces its own native audio
    # per conversational turn (see LLM/gemini_live.py) -- the TTS engine
    # built below still gets constructed normally and still voices the
    # greeting/farewell/LLM-error-fallback lines (none of which go through
    # the LLM's reply path), only the conversational-reply TTS call in
    # run_llm's "stream_end" handling is skipped for this bot.
    llm_is_live = agent_config["llm"]["provider"] == "Google-Live"
    dhvaani_reference_audio_path = None
    dhvaani_reference_transcript = None
    if tts_model == "DhVaani":
        # DhVaani clones from a reference clip rather than picking a named
        # preset -- "speaker" here is the TTSVoiceReference's name, resolved
        # once per connection rather than per synthesize() call.
        with contextmanager(get_db)() as standalone_db:
            voice_ref = standalone_db.query(TTSVoiceReference).filter_by(
                name=agent_config["tts"]["speaker"]
            ).first()
        if voice_ref:
            dhvaani_reference_audio_path = str(Path(VOICE_REFERENCE_DIR) / voice_ref.audio_path)
            dhvaani_reference_transcript = voice_ref.transcript
        else:
            print(f"[DhVaani] No voice reference named {agent_config['tts']['speaker']!r} -- this agent will produce no TTS audio.")
    elif agent_config["tts"]["provider"] == "Google":
        # google.genai's Client is a lightweight HTTP wrapper (no model
        # load like DhVaani), so constructing fresh per connection is
        # simpler than a shared singleton, and respects whichever real
        # Gemini TTS model id this agent has configured (the catalog
        # value, not a fixed discriminator label like "DhVaani"/"Kokoro").
        gemini_tts_client = GeminiTTS(model_name=tts_model, api_key=agent_config["tts"].get("api_key"))
    elif tts_model != "Kokoro":
        tts_provider = tts_choices.get(agent_config["tts"]["provider"])
        if tts_provider:
            tts_provider_client = tts_provider(
                api_key=agent_config["api_keys"].get("Sarvam"),
                model=agent_config["tts"]["model"],
                speaker=agent_config["tts"]["speaker"],
                speed=agent_config["tts"]["speed"]
            )
            await tts_provider_client.connect(agent_config["tts"]["language"])


    async def synthesize(text: str, lang: str):
        """Same call whichever engine is active for this agent -- Kokoro, a
        connected provider client, and DhVaani all expose .stream(text,
        queue, ...) and push ("bytes", pcm) chunks onto it."""
        if tts_model == "Kokoro":
            engine = get_kokoro_engine(lang)
            await engine.stream(text, audio_out_queue, voice=agent_config["tts"]["speaker"])
        elif tts_model == "DhVaani" and dhvaani_reference_audio_path:
            engine = get_dhvaani_engine()
            await engine.stream(
                text, audio_out_queue,
                reference_audio_path=dhvaani_reference_audio_path,
                reference_transcript=dhvaani_reference_transcript,
                speed=agent_config["tts"]["speed"],
            )
        elif gemini_tts_client:
            await gemini_tts_client.stream(
                text, audio_out_queue,
                voice=agent_config["tts"]["speaker"],
            )
        elif tts_provider_client:
            await tts_provider_client.stream(text, audio_out_queue)


        
    async def tts_worker():
        nonlocal farewell_req_id
        while True:
            item = await tts_queue.get()
            if item is None:
                break
            text, lang, req_id = item
            print(f"TTS chunk: {text!r}")
            start = time.perf_counter()
            try:
                await synthesize(text, lang or "hi")
            except Exception as e:
                print("TTS error:", e)
                continue
            tts_ms = (time.perf_counter() - start) * 1000
            tts_timings.append(tts_ms)
            print(f"[TTS Timing] request_id={req_id} tts_ms={tts_ms:.1f}")
            if req_id == farewell_req_id:
                farewell_done_event.set()

    def current_call_cost_usd() -> float:
        """This call's estimated LLM + TTS + eval-mode ASR spend so far --
        same estimators the CallHistory.token_usage write below uses.
        Untracked (None) counts as 0."""
        llm_cost = estimate_cost_usd(
            agent_config["llm"]["model"],
            call_token_usage["prompt_tokens"],
            call_token_usage["completion_tokens"],
        ) or 0.0
        tts_cost = (estimate_tts_cost_usd(
            agent_config["tts"]["model"],
            call_tts_usage["prompt_tokens"],
            call_tts_usage["output_tokens"],
        ) or 0.0) if gemini_tts_client else 0.0
        return llm_cost + tts_cost + call_eval_asr_spend

    async def run_llm(text, lang, req_id):
        nonlocal current_lang, curr_req_id, tool_in_progress, total_tool_calls, pending_turn
        detector = SentenceBoundaryDetector()
        llm_start_time = time.perf_counter()
        first_token_time: float | None = None
        tool_call_count = 0
        tool_call_total_ms = 0.0
        active_tool_start_time: float | None = None
        # Text is still sent to Gemini TTS as one call over the full reply,
        # not split into per-sentence calls like the other providers below
        # -- splitting was tried (bounded two-call, then a rolling
        # every-N-sentences variant) and reverted: stitching independently
        # synthesized clips back together is audible as a seam/tone break
        # (reported as "quality takes a dip" / "tts dont breakup the
        # text"). That's a text-level decision (one synthesize() call),
        # separate from GeminiTTS.stream() itself now streaming that one
        # call's *audio* back in chunks as it's generated (issue #66) --
        # the old dispatch_gemini_chunk relay (a private one-shot queue
        # plus a keepalive-ping task to survive a single blocking call's
        # 15-20s silence) assumed exactly one audio chunk would ever come
        # back and both are gone now: audio_out_queue is passed to
        # stream() directly below, same as every other TTS engine, and
        # streamed chunks start arriving in ~2s (live-measured), so
        # there's no more long silence to paper over with a keepalive.

        try:
            async for event in custom_llm.generate(
                text, 
                history, 
                req_id, 
                lang, 
                agent_name = agent_config['name'],
                system_prompt = agent_config["llm"]["prompt"],
                temperature = agent_config["llm"]["temperature"],
                max_tokens = agent_config["llm"]["max_tokens"]
                ):
                ev = event.get("event")
                if ev == "stream_start":
                    curr_req_id = event.get("request_id", None)

                elif ev == "tool_start":
                    tool_in_progress = True
                    tool_call_count += 1
                    total_tool_calls += 1
                    active_tool_start_time = time.perf_counter()
                    # UI-only ping (not spoken, no TTS queued) -- lets the
                    # frontend's typing bubble say "Searching..." instead of
                    # a generic "Thinking..." while a tool call is actually
                    # in flight. Replaces the old spoken "Please wait while
                    # I search..." message removed earlier -- same idea,
                    # visual only instead of a real TTS call every time.
                    await ws_send_json({"type": "status", "phase": "searching"})

                elif ev == "tool_end":
                    tool_in_progress = False
                    await ws_send_json({"type": "status", "phase": "thinking"})
                    if active_tool_start_time is not None:
                        tool_call_total_ms += (time.perf_counter() - active_tool_start_time) * 1000
                        active_tool_start_time = None
                    # tts_queue.put_nowait((TOOL_CALL_END_MESSAGE, "en", str(uuid.uuid4())))        # OFF

                elif ev == "token":
                    if first_token_time is None:
                        first_token_time = time.perf_counter()
                        ttft_ms = (first_token_time - llm_start_time) * 1000
                        ttft_timings.append(ttft_ms)
                        print(f"[LLM TTFT] request_id={req_id} ttft_ms={ttft_ms:.1f}")
                        if pending_turn.get("req_id") == req_id:
                            pending_turn["llm_ttft_ms"] = round(ttft_ms, 1)
                    delta = event["delta"]
                    if gemini_tts_client:
                        # No per-sentence TTS dispatch here -- the whole
                        # reply is synthesized as one call at stream_end
                        # (see the module-level comment near KOKORO_VOICE).
                        continue
                    sentences = detector.feed(delta)
                    for sentence in sentences:
                        tts_queue.put_nowait((sentence, current_lang, str(uuid.uuid4())))

                elif ev == "audio_chunk":
                    # GeminiLiveLLM's own native audio output (provider
                    # "Google-Live") -- already-synthesized PCM, pushed
                    # straight to audio_out_queue like any TTS engine's
                    # .stream() call, bypassing tts_queue/synthesize()
                    # entirely for this bot's conversational replies.
                    audio_out_queue.put_nowait(("bytes", event["pcm"]))

                elif ev == "stream_end":
                    # Use the LLM's own full_text verbatim, not a
                    # reconstruction joined from the sentence detector's
                    # fragments -- that reconstruction subtly differs from
                    # the original text (spacing/formatting around sentence
                    # boundaries), and Gemini TTS reacted to that difference
                    # by refusing to just read it aloud: "Model tried to
                    # generate text, but it should only be used for TTS."
                    full_text = (event.get("full_text") or "").strip()
                    if full_text:
                        call_messages.append({
                            "role": "assistant",
                            "text": full_text,
                            "ts": datetime.now(UTC).isoformat(),
                        })

                    # Reveal the reply text to the browser before TTS runs,
                    # not after. This used to sit at the very end of this
                    # block, so for Gemini -- whose TTS is one `await` that
                    # doesn't return until the whole reply is synthesized --
                    # audio chunks reached the browser and started playing
                    # well before the frontend's buffered chat bubble
                    # (the call widget's pending text) had anything to
                    # reveal.
                    await ws_send_json({
                        "type": "transcript",
                        "transcript": event.get("full_text", " "),
                        "done": True
                    })

                    if gemini_tts_client and not llm_is_live:
                        if full_text:
                            # Pushes straight to audio_out_queue itself,
                            # same as every other TTS engine's stream()
                            # call -- GeminiTTS now delivers real audio
                            # chunks as they're generated (issue #66)
                            # instead of one blocking response, so the
                            # first chunk reaches the browser in ~2s
                            # rather than waiting out the whole reply's
                            # generation (previously up to 15-20s, which
                            # needed a keepalive ping to stop the
                            # connection being treated as idle/dead
                            # in-flight -- no longer needed).
                            start = time.perf_counter()
                            tts_ttfb_s = None
                            try:
                                tts_ttfb_s = await gemini_tts_client.stream(
                                    full_text, audio_out_queue,
                                    voice=agent_config["tts"]["speaker"],
                                )
                            except Exception as e:
                                print("TTS error:", e)
                            tts_ms = (time.perf_counter() - start) * 1000
                            tts_timings.append(tts_ms)
                            print(f"[TTS Timing] request_id={req_id} tts_ms={tts_ms:.1f}")
                            if pending_turn.get("req_id") == req_id and tts_ttfb_s is not None:
                                pending_turn["tts_ttfb_ms"] = round(tts_ttfb_s * 1000, 1)
                            # Read right after awaiting stream() -- see
                            # GeminiTTS.last_usage's docstring. None on a
                            # cache hit (nothing new billed) or if the SDK
                            # omitted usage_metadata.
                            tts_usage = gemini_tts_client.last_usage
                            if tts_usage:
                                call_tts_usage["prompt_tokens"] += tts_usage["prompt_tokens"]
                                call_tts_usage["output_tokens"] += tts_usage["output_tokens"]
                    else:
                        remainder = detector.flush()
                        if remainder:
                            print(f"Flushing remainder to TTS: {remainder!r}")
                            tts_queue.put_nowait((remainder, current_lang, str(uuid.uuid4())))

                    total_elapsed_ms = (time.perf_counter() - llm_start_time) * 1000
                    without_tool_call_ms = max(total_elapsed_ms - tool_call_total_ms, 0.0)

                    llm_total_timings.append(total_elapsed_ms)
                    llm_no_tool_timings.append(without_tool_call_ms)
                    if tool_call_count > 0:
                        llm_tool_timings.append(tool_call_total_ms)

                    print(
                        f"[LLM Timing] request_id={req_id} total_ms={total_elapsed_ms:.1f} "
                        f"tool_calls={tool_call_count} tool_call_time_ms={tool_call_total_ms:.1f} "
                        f"without_tool_call_ms={without_tool_call_ms:.1f}"
                    )

                    if pending_turn.get("req_id") == req_id:
                        pending_turn["llm_total_ms"] = round(total_elapsed_ms, 1)
                        pending_turn["tool_calls"] = tool_call_count
                        # audio_sender has already dequeued this turn's
                        # first chunk by now -- for Gemini, its await above
                        # doesn't return until every chunk is generated,
                        # well after the first one was already sent; for
                        # the sentence-queued engines, the first sentence's
                        # synthesis has had a full stream_end's worth of
                        # time to complete. Either way e2e_timings[-1] is
                        # this turn's value if audio actually went out.
                        if e2e_timings:
                            pending_turn["e2e_ms"] = round(e2e_timings[-1], 1)

                        usage = event.get("usage")
                        if usage:
                            pending_turn["prompt_tokens"] = usage["prompt_tokens"]
                            pending_turn["completion_tokens"] = usage["completion_tokens"]
                            pending_turn["total_tokens"] = usage["total_tokens"]
                            call_token_usage["prompt_tokens"] += usage["prompt_tokens"]
                            call_token_usage["completion_tokens"] += usage["completion_tokens"]
                            call_token_usage["total_tokens"] += usage["total_tokens"]
                            # Live running counter for the call panel itself
                            # (not just the historical call-history view) --
                            # a plain status-style ping, not spoken.
                            await ws_send_json({
                                "type": "usage",
                                "turn_tokens": usage["total_tokens"],
                                "call_tokens": call_token_usage["total_tokens"],
                                "estimated_cost_usd": estimate_cost_usd(
                                    agent_config["llm"]["model"],
                                    call_token_usage["prompt_tokens"],
                                    call_token_usage["completion_tokens"],
                                ),
                            })

                        turn_latencies.append(pending_turn)
                        pending_turn = {}

                elif ev == "error":
                    # Was comparing the whole event dict to the string
                    # "error" (always False) and reading a "detail" key
                    # that's never set -- silently dropped every LLM error
                    # (including the Gemini stream timeout above), leaving
                    # the caller waiting with no audio and no explanation.
                    print("LLM error:", event.get("message"))
                    curr_req_id = None
                    tts_queue.put_nowait((LLM_ERROR_MESSAGE, "en", str(uuid.uuid4())))

        except asyncio.CancelledError:
            print(f"[LLM] Request {req_id} cancelled (barge-in)")

        except WebSocketDisconnect:
            # The browser dropped mid-turn (network blip, backgrounded tab,
            # a proxy's idle timeout on the long-lived socket -- more likely
            # now that a single Gemini TTS call can hold stream_end's
            # send_json for 15-20s+ on a long reply than it was with the
            # old multi-chunk design). str(WebSocketDisconnect()) is "",
            # which is why this used to surface as a mysterious empty
            # "[LLM] Unexpected error: ". Nothing to apologize to -- queuing
            # LLM_ERROR_MESSAGE here just burns a TTS call on a dead socket.
            print("[LLM] Browser disconnected mid-turn")
            curr_req_id = None

        except Exception as e:
            print(f"[LLM] Unexpected error: {type(e).__name__}: {e}")
            traceback.print_exc()
            curr_req_id = None
            tts_queue.put_nowait((LLM_ERROR_MESSAGE, "en", str(uuid.uuid4())))

    async def audio_sender():
        nonlocal tts_buffer, turn_start_time
        while True:
            item = await audio_out_queue.get()
            if item is None:
                break
            kind, payload = item
            print(kind)
            if kind == "bytes":
                agent_audio_chunks.append(payload)
                if turn_start_time is not None:
                    e2e_ms = (time.perf_counter() - turn_start_time) * 1000
                    e2e_timings.append(e2e_ms)
                    print(f"[E2E Timing] speech_end_to_first_audio_ms={e2e_ms:.1f}")
                    turn_start_time = None
                if can_play:
                    try:
                        await ws_send_bytes(payload)
                    except (RuntimeError, WebSocketDisconnect):
                        # Browser already closed the socket (hangup, tab
                        # close) but a chunk was still in flight -- was an
                        # unhandled exception crashing this task with a
                        # scary traceback instead of just stopping quietly
                        # now that the call is over.
                        break
                else:
                    tts_buffer.append(payload)

    async def handle_transcript(text: str, lang: str | None, asr_ms: float | None = None, turn_id: str | None = None):
        """Shared by both ASR paths: local-streaming (called after a VAD
        segment is transcribed, which also measures asr_ms) and cloud/API-key
        providers (called async, whenever their own on_transcript callback
        fires -- those don't measure their own elapsed time here, so asr_ms
        stays None for cloud-ASR turns in the per-turn latency breakdown).

        turn_id (issue #72): only set for the local-ASR path, where eval
        mode may also be running the same segment through other models --
        lets the frontend match a later asr_eval message to this exact
        transcript bubble. None for the cloud-ASR path (no segment-level
        boundary to key off), which is fine since eval mode never fires
        there (see the fan-out site below)."""
        nonlocal current_lang, llm_task, turn_start_time, pending_turn

        if not text or not text.strip():
            return

        current_lang = lang or current_lang

        call_messages.append({
            "role": "user",
            "text": text,
            "ts": datetime.now(UTC).isoformat(),
        })

        await ws_send_json({
            "type": "user_transcript",
            "transcript": text,
            "done": True,
            "turn_id": turn_id,
        })

        if llm_task and not llm_task.done() and not tool_in_progress:
            llm_task.cancel()
            try:
                await asyncio.wait_for(llm_task, timeout=0.01)
            except Exception:
                pass

        req_id = str(uuid.uuid4())
        turn_start_time = time.perf_counter()
        pending_turn = {
            "turn": len(turn_latencies) + 1,
            "req_id": req_id,
            "asr_ms": round(asr_ms, 1) if asr_ms is not None else None,
        }
        llm_task = asyncio.create_task(run_llm(text, current_lang, req_id))
        

    async def on_asr_transcript(text: str, lang: str):
        """Callback handed to a cloud/API-key ASR provider client -- it
        calls this whenever it has a finalized transcript, independent of
        our own VAD (the provider does its own turn-detection)."""
        print(f"[Cloud ASR] transcript: {text!r}")
        await handle_transcript(text, lang)

    async def flush_tts_buffer():
        nonlocal tts_buffer
        print("I am going to send audio to browser")
        if not tts_buffer:
            print("I have nothing to send")
            return
        print(f"Silence confirmed — flushing {len(tts_buffer)} buffered TTS chunk(s)")
        for chunk in tts_buffer:
            await ws_send_bytes(chunk)
        tts_buffer = []

    tts_worker_task = asyncio.create_task(tts_worker())
    audio_sender_task = asyncio.create_task(audio_sender())

    asr_client = None
    asr_provider = agent_config["asr"]["provider"]
    asr_model = agent_config["asr"]["model"]
    use_local_asr = (asr_provider == "Vaani")
    if not use_local_asr:
        asr_provider = asr_choices.get(agent_config["asr"]["provider"])
        if asr_provider:
            asr_client = asr_provider(api_key=agent_config["api_keys"].get("Sarvam"), model=asr_model, on_transcript=on_asr_transcript)
            await asr_client.connect()

    
    ################ CALL END EVENTS #############
    async def speak_farewell(text, lang="en"):
        nonlocal farewell_req_id
        farewell_req_id = str(uuid.uuid4())
        farewell_done_event.clear()
        tts_queue.put_nowait((text, lang, farewell_req_id))
        try:
            await asyncio.wait_for(farewell_done_event.wait(), timeout=8.0)
        except TimeoutError:
            print(f"[Farewell] Timed out waiting for synthesis of {farewell_req_id}")

    async def send_call_summary(browser_ws, history):
        if not history:
            return
        try:
            summary_text = ""
            async for event in custom_llm.generate(
                text="Summarize this call in 3-4 sentences: what the I asked for and what was resolved.",
                history=list(history),  # pass a copy; don't mutate the live history
                system_prompt=SUMMARY_PROMPT,   
                temperature=0.3,
                max_tokens=150,
            ):
                if event.get("event") == "stream_end":
                    summary_text = event.get("full_text", "")

            if not summary_text:
                summary_text = "Call ended. No summary could be generated."

            await ws_send_json({"type": "summary", "summary": summary_text})
        except Exception as e:
            print("Summary generation failed:", e)
            try:
                await ws_send_json({
                    "type": "summary",
                    "summary": "Call ended. Summary unavailable."
                })
            except Exception:
                pass  # browser_ws may already be closed
    try:
        tts_queue.put_nowait((agent_config["greeting_message"], "hi", str(uuid.uuid4())))
       
        call_ending = False

        while True:
            data = await browser_ws.receive()

            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                except json.JSONDecodeError:
                    print("Received invalid JSON control frame.")
                    continue
            
                msg_type = msg.get("type")

                if msg_type == "end_call":
                    call_ending = True
                    if llm_task and not llm_task.done():
                        llm_task.cancel()
                        try:
                            await asyncio.wait_for(llm_task, timeout=1.0)
                        except Exception:
                            pass

                    await send_call_summary(browser_ws, history)
                    
                    await speak_farewell(agent_config["end_call_message"], "hi")

                    await ws_send_json({"type": "call_ended"})
                    await browser_ws.close(code=1000, reason="Call ended by server after summary")
                    return  # exit the loop; finally block still runs cleanup below

                if msg_type == "asr_eval_feedback":
                    # Thumbs up/down clicked live, during the call --
                    # updates eval_results_history in place (the same list
                    # run_asr_eval already appends each turn's results to,
                    # see below) so it lands in CallHistory.asr_eval_results
                    # for free when the finally block below persists it, no
                    # separate write path needed. Safe the moment the
                    # frontend can even render the thumbs button: run_asr_eval
                    # appends to this list before it ever sends the asr_eval
                    # message the button is rendered from, so the entry is
                    # guaranteed to already be here.
                    fb_turn_id = msg.get("turn_id")
                    fb_provider = msg.get("provider")
                    fb_value = msg.get("feedback")
                    turn_entry = next((t for t in eval_results_history if t["turn_id"] == fb_turn_id), None)
                    if turn_entry:
                        result_entry = next((r for r in turn_entry["results"] if r["provider"] == fb_provider), None)
                        if result_entry:
                            result_entry["feedback"] = fb_value
                    continue

                # room for other control messages here later (e.g. mute, barge_in re-enable, etc.)
                continue

            if "bytes" in data:
                if call_ending:
                    continue
 
                pcm_bytes = data["bytes"]
                user_audio_chunks.append(pcm_bytes)
                pcm = np.frombuffer(pcm_bytes, dtype=np.float32)

                loop = asyncio.get_event_loop()
                segment = await loop.run_in_executor(None, vad.feed, pcm)
 
                if vad.is_speaking:
                    if not was_speaking:
                        was_speaking = True
                        # Confirmed root cause of the Live-bot audio cutting
                        # out mid-reply: this pipeline has no echo
                        # cancellation / mic muting while the agent is
                        # speaking, so the agent's own audio playing through
                        # the user's speakers leaks back into the mic and
                        # VAD misreads it as the user barging in -- which
                        # clears audio_out_queue/tts_buffer and gates
                        # audio_sender's can_play, silently dropping
                        # everything from that point on (no error anywhere,
                        # while the transcript still sends unconditionally
                        # at stream_end -- hence "text pops, audio cuts").
                        # Every bot is exposed to this in principle, but
                        # Live's replies run long enough to make it land on
                        # effectively every turn, versus GeminiTTS's shorter/
                        # faster ones rarely giving it the same window.
                        # Real fix is proper echo cancellation or client-side
                        # mic muting during playback -- out of scope here.
                        # Narrowest safe fix until then: a Live agent's own
                        # audio never triggers its own barge-in. Every other
                        # bot's barge-in is unchanged.
                        if not llm_is_live:
                            can_play = False
                            tts_buffer.clear()

                            while not tts_queue.empty():
                                try:
                                    tts_queue.get_nowait()
                                except asyncio.QueueEmpty:
                                    break

                            while not audio_out_queue.empty():
                                try:
                                    audio_out_queue.get_nowait()
                                except asyncio.QueueEmpty:
                                    break
                else:
                    if was_speaking:
                        was_speaking = False

                    if not can_play and vad.is_silent_for(agent_config.get("response_audio_delay", 500)):
                        can_play = True
                        await flush_tts_buffer()
 
                if segment is not None and use_local_asr:
                    print(f"Speech detected of length {len(segment) / 16000:.2f}s")
                    turn_id = str(uuid.uuid4()) if eval_mode else None

                    seg_start = time.perf_counter()
                    try:
                        text = await transcribe_segment(segment)
                    except Exception as e:
                        # Unhandled, this would propagate up and kill the
                        # whole call over one bad ASR request (60s httpx
                        # timeout or a transient service error) -- localize
                        # it to just this utterance instead. handle_transcript
                        # already no-ops on empty text, same as any other
                        # unintelligible/silent segment.
                        print(f"[ASR] transcribe_segment failed: {e}")
                        text = ""
                    elapsed_ms = (time.perf_counter() - seg_start) * 1000
                    asr_timings.append(elapsed_ms)
                    print(f"[ASR Timing] elapsed_ms={elapsed_ms:.1f} text={text!r}")

                    await handle_transcript(text, current_lang, asr_ms=elapsed_ms, turn_id=turn_id)

                    # Evaluation mode (issue #72) -- fire-and-forget, must
                    # never block/delay the real turn above. Only makes
                    # sense to run when there's real text to compare
                    # against (an empty/unintelligible segment has nothing
                    # for other models to disagree on).
                    if eval_mode and text:
                        call_eval_asr_spend += eval_asr_cost_usd(segment, call_eval_providers)
                        asyncio.create_task(
                            run_asr_eval(segment, turn_id, primary_text=text, primary_latency_ms=elapsed_ms, send_json=ws_send_json, providers=call_eval_providers, history=eval_results_history)
                        )

                elif not use_local_asr and asr_client:
                    # Cloud provider does its own turn-detection over a
                    # continuous stream -- forward every frame regardless
                    # of our local VAD segment boundaries. handle_transcript
                    # gets invoked later, async, via on_asr_transcript.
                    await asr_client.send_audio(pcm)
                

    except WebSocketDisconnect:
        print("Client Disconnected")
        disconnect_reason = "client_disconnected"

    except Exception as e:
        print("Error:", str(e))
        disconnect_reason = f"error: {e}"
        try:
            await ws_send_json({"type": "error", "text": str(e)})
        except Exception:
            pass

    finally:

        def summarize(name, vals):
            if not vals:
                print(f"{name}: no data")
                return None
            stats = {"n": len(vals), "min_ms": round(min(vals), 1), "max_ms": round(max(vals), 1), "avg_ms": round(sum(vals) / len(vals), 1)}
            print(f"{name}: n={stats['n']} min={stats['min_ms']}ms max={stats['max_ms']}ms avg={stats['avg_ms']}ms")
            return stats

        print("\n=== Latency Summary ===")
        latency_summary = {
            "asr": summarize("ASR", asr_timings),
            "llm_total": summarize("LLM total", llm_total_timings),
            "llm_without_tool": summarize("LLM without tool", llm_no_tool_timings),
            "llm_tool_call_only": summarize("LLM tool-call only", llm_tool_timings),
            "llm_ttft": summarize("LLM time-to-first-token", ttft_timings),
            "tts": summarize("TTS", tts_timings),
            "e2e": summarize("End-to-end (speech end -> first audio)", e2e_timings),
        }

        # call_history table existed but nothing ever wrote to it -- one
        # row per call, written here since this is the one place that
        # already runs exactly once per connection regardless of how it
        # ended (clean disconnect, error, or the client just closing the
        # tab), with the transcript and the latency breakdown already
        # freshly computed above instead of only ever printed to console.
        # Also written for a call with no messages if it still cost money
        # (greeting TTS, eval-mode ASR), so its cost estimate isn't lost.
        if call_messages or current_call_cost_usd() > 0:
            call_ended_at = datetime.now(UTC)
            try:
                recording_path = save_call_recording(agent_id, call_uuid, user_audio_chunks, agent_audio_chunks)
            except Exception as e:
                print("Failed to save call recording:", e)
                recording_path = None
            try:
                with contextmanager(get_db)() as standalone_db:
                    standalone_db.add(CallHistory(
                        agent_name=agent_config.get("name"),
                        agent_id=agent_id,
                        username=username,
                        summary=f"{len(call_messages)} message(s) exchanged",
                        duration=round((call_ended_at - call_started_at).total_seconds()),
                        messages=call_messages,
                        started_at=call_started_at,
                        ended_at=call_ended_at,
                        language=current_lang,
                        tool_call_count=total_tool_calls,
                        disconnect_reason=disconnect_reason,
                        latency_summary=latency_summary,
                        latency_per_turn=turn_latencies,
                        token_usage={
                            **call_token_usage,
                            "estimated_cost_usd": estimate_cost_usd(
                                agent_config["llm"]["model"],
                                call_token_usage["prompt_tokens"],
                                call_token_usage["completion_tokens"],
                            ),
                            # ASR: only Vaani (local SraVaani) is enabled in
                            # the create-agent catalog right now -- genuinely
                            # free (self-hosted), not an estimate. Cloud ASR
                            # (Sarvam) is code-reachable but not selectable
                            # by any real agent and its pricing is INR-
                            # denominated (would need a currency conversion
                            # decision this codebase hasn't made) -- None,
                            # not a guessed number.
                            "asr_cost_usd": 0.0 if use_local_asr else None,
                            # For a Google-Live agent specifically, this
                            # is real but partial: gemini_tts_client.stream()
                            # only ever runs for its greeting/farewell/
                            # error-fallback lines (llm_is_live skips it for
                            # conversational replies -- see the "stream_end"
                            # handler above), so it's TTS cost for those few
                            # lines, not per-turn conversational cost. Live's
                            # own audio-generation cost isn't estimated here
                            # at all (gemini-3.8-live isn't in LLM/pricing.py's
                            # table, which fails closed to None rather than
                            # guessing).
                            "tts_prompt_tokens": call_tts_usage["prompt_tokens"],
                            "tts_output_tokens": call_tts_usage["output_tokens"],
                            "tts_cost_usd": estimate_tts_cost_usd(
                                agent_config["tts"]["model"],
                                call_tts_usage["prompt_tokens"],
                                call_tts_usage["output_tokens"],
                            ) if gemini_tts_client else (0.0 if tts_model in ("Kokoro", "DhVaani") else None),
                            "eval_asr_cost_usd": round(call_eval_asr_spend, 6),
                        } if (call_token_usage["total_tokens"] > 0 or call_tts_usage["output_tokens"] > 0 or call_eval_asr_spend > 0) else None,
                        recording_path=recording_path,
                        # Best-effort: run_asr_eval is dispatched fire-and-
                        # forget (create_task, never awaited/tracked), so a
                        # call ended right after its last turn can close
                        # before that turn's eval finishes appending here --
                        # every earlier turn is safe. Empty list -> None,
                        # same "absent beats a fabricated empty value"
                        # convention as recording_path above.
                        asr_eval_results=eval_results_history or None,
                    ))
                    standalone_db.commit()
            except Exception as e:
                print("Failed to write call_history row:", e)

        print("Executing final connection cleanup...")
 
        tts_queue.put_nowait(None)
        audio_out_queue.put_nowait(None)
 
        if not tts_worker_task.done():
            tts_worker_task.cancel()
        if not audio_sender_task.done():
            audio_sender_task.cancel()
 
        if tts_provider_client and hasattr(tts_provider_client, "disconnect"):
            try:
                await tts_provider_client.disconnect()
            except Exception:
                pass
 
        if asr_client and hasattr(asr_client, "disconnect"):
            try:
                await asr_client.disconnect()
            except Exception:
                pass
 
        if llm_task is not None and not llm_task.done():
            llm_task.cancel()
            try:
                await llm_task
            except asyncio.CancelledError:
                pass
 
        print("Connection closed completely and safely.")



# =======================================================================================
#                                       ACTIVATE AGENT
# =======================================================================================




@app.post("/api/activate/configurable/agent")
@auth_required
async def activate_agent(
    request: Request,
    response: Response,
    body: dict,
    user_payload: dict = None,
):
    agent_id = body.get("agent_id")
    old_agent_id = body.get("old_agent_id", None)
    username = user_payload.get("username")

    try:
        if old_agent_id:
            invalidate_agent_config(old_agent_id)

        config = await get_agent_config(agent_id)

        # Real DB-backed "active" record -- previously this only ever lived
        # in the frontend's sessionStorage, with nothing on the server to
        # confirm it against. Close out any session(s) this user already
        # had open (switching agents, or a stale one from a previous tab
        # that never cleanly deactivated), then open a fresh one.
        with contextmanager(get_db)() as standalone_db:
            standalone_db.query(AgentSession).filter(
                AgentSession.user_username == username,
                AgentSession.deactivated_at.is_(None),
            ).update({"deactivated_at": func.now()}, synchronize_session=False)
            standalone_db.add(AgentSession(agent_id=agent_id, user_username=username))
            standalone_db.commit()

        return {
            "message": "Agent active",
            "agent_name": config["name"],
            "agent_id": agent_id,
            "status": 200
        }
    except MissingAPIKeyError as e:
        raise HTTPException(detail=str(e), status_code=400) from e
    except Exception as e:
        print("Error", e)
        raise HTTPException(
            detail="Failed to activate",
            status_code=400
        ) from e


@app.post("/api/deactivate/agent/{agent_id}")
@auth_required
async def deactivate_agent(
    request: Request,
    response: Response,
    agent_id: int,
    user_payload: dict = None,
):
    username = user_payload.get("username")

    with contextmanager(get_db)() as standalone_db:
        standalone_db.query(AgentSession).filter(
            AgentSession.agent_id == agent_id,
            AgentSession.user_username == username,
            AgentSession.deactivated_at.is_(None),
        ).update({"deactivated_at": func.now()}, synchronize_session=False)
        standalone_db.commit()

    return {"message": "Agent deactivated", "agent_id": agent_id, "status": 200}


@app.get("/api/agents/active-status")
async def agents_active_status():
    """How many open (deactivated_at IS NULL) sessions each agent has right
    now, across all users -- a simple GROUP BY, not per-agent-id lookups.
    The frontend uses this to seed/resync its local "active" marker against
    real DB state instead of trusting sessionStorage alone."""
    with contextmanager(get_db)() as standalone_db:
        rows = (
            standalone_db.query(AgentSession.agent_id, func.count(AgentSession.id))
            .filter(AgentSession.deactivated_at.is_(None))
            .group_by(AgentSession.agent_id)
            .all()
        )
    return {"active_counts": {agent_id: count for agent_id, count in rows}}
