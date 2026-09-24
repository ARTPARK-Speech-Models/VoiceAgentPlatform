
import difflib
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from firebase_admin import auth as firebase_auth
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from src.constants import (
    ALLOWED_AUDIO_EXTENSIONS,
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    MAX_VOICE_REFERENCE_BYTES,
    VOICE_REFERENCE_DIR,
)
from src.database.auth import get_current_user, verify_app_check
from src.database.engine import get_db
from src.database.models import (
    ASRProvider,
    CallHistory,
    CatalogModel,
    CatalogPrompt,
    CatalogProvider,
    CatalogVoice,
    LLMProvider,
    PromptVersion,
    TTSProvider,
    TTSVoiceReference,
    User,
    UserAPIKey,
    VoiceAgent,
)
from src.database.utils import (
    BANNED_MESSAGE,
    check_if_agent_name_exists,
    generate_unique_username,
    get_user_by_email,
    get_user_by_firebase_uid,
    invalidate_agent_config,
    is_banned,
)
from src.mcp_client import mcp_client
from src.recordings import recording_file_path
from src.request_schema import (
    AddCatalogModelRequest,
    AgentResponse,
    AsrEvalFeedbackRequest,
    CreateAgentRequestWrapper,
    GoogleSessionRequest,
    SaveApiKeyRequest,
    UpdateAgentRequestWrapper,
)

SESSION_COOKIE_DAYS = 5

router = APIRouter(
    prefix="/api",
    tags=["Crud Operations"]
)


# =======================================================================================
#                                       AUTHENTICATION
# =======================================================================================
@router.get("/auth/verify")
async def verify(
    request: Request,
    response: Response,
    user_payload: dict = Depends(get_current_user)
):
    username = user_payload.get("username")
    return {
        "username": username,
        "verified": True
    }


def _mint_session_cookie(response: Response, id_token: str) -> None:
    """Exchanges a Firebase ID token for one long-lived httpOnly session
    cookie -- replaces the old access+refresh JWT pair with a single
    cookie whose lifetime is fixed at mint time (Firebase caps this at 14
    days; we use 5)."""
    expires_in = timedelta(days=SESSION_COOKIE_DAYS)
    session_cookie = firebase_auth.create_session_cookie(id_token, expires_in=expires_in)
    response.set_cookie(
        key="session",
        value=session_cookie,
        httponly=True,
        samesite="none",
        max_age=int(expires_in.total_seconds()),
        secure=True
    )


@router.post("/auth/session")
async def create_session(
    request: GoogleSessionRequest,
    response: Response,
    db: Session = Depends(get_db),
    _app_check: None = Depends(verify_app_check),
):
    """Google Sign-In find-or-create: one endpoint for both a brand-new
    account and a returning user, since Google's popup flow doesn't
    distinguish them the way a separate register/login form did.

    Gated by Firebase App Check (reCAPTCHA v3) when APP_CHECK_ENFORCE is
    set -- blocks scripted sign-ups that skip the real web page."""
    try:
        decoded = firebase_auth.verify_id_token(request.id_token)
    except Exception as e:
        # The real reason (bad signature, expired, wrong audience/project,
        # revoked, ...) was being swallowed into one generic client-facing
        # message with nothing in the server logs to debug from -- log it
        # here (never in the response) instead.
        print(f"[auth] verify_id_token failed: {type(e).__name__}: {e}")
        raise HTTPException(detail="Invalid ID token", status_code=401) from e

    firebase_uid = decoded["uid"]
    email = decoded.get("email")
    user = get_user_by_firebase_uid(db, firebase_uid)

    if not user and email:
        # Covers an existing (pre-Google-Sign-In) local row signing in for
        # the first time with the Google account matching their email --
        # link it instead of creating a duplicate.
        user = get_user_by_email(db, email)
        if user:
            user.firebase_uid = firebase_uid
            db.commit()

    if not user:
        base = decoded.get("name") or email or firebase_uid
        username = generate_unique_username(db, base)
        user = User(
            username=username,
            email=email,
            firebase_uid=firebase_uid,
            password=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if is_banned(user):
        raise HTTPException(detail=BANNED_MESSAGE, status_code=403)

    _mint_session_cookie(response, request.id_token)

    return {
        "message": "Signed in successfully",
        "user": user.username
    }


@router.post("/auth/logout")
def logout(
    response: Response
):
    response.delete_cookie(
        key="session",
        httponly=True,
        samesite="none",
        secure=True
    )

    return {
        "message": "Logged out!!",
        "status": 200
    }

# =======================================================================================
#                                       PROVIDER/MODEL CATALOG
# =======================================================================================
# Backs the ASR/LLM/TTS option pickers in the create-agent UI. Was previously
# hardcoded in the frontend; now DB-driven (catalog_* tables) so it can be
# updated without a frontend deploy. Read-only for now -- edit rows directly
# in the DB, or re-run Orchestrator/scripts/seed_catalog.py after changing it.

# Every other provider (Sarvam, Deepgram, OpenAI, Groq, Kokoro, ElevenLabs,
# etc.) stays in the catalog_* tables untouched -- this only narrows what
# GET /api/catalog serves to the create-agent UI, so re-enabling one later
# is just editing this dict, not re-seeding anything. Per-stage rather
# than one flat list: "Vaani" covers real, working SraVaani ASR, but its
# only TTS model (DhVaani) needs voice-reference .wav files that never
# made it onto this VM's volume, so "Vaani" is dropped from tts only.
ENABLED_CATALOG_PROVIDERS = {
    "asr": ["Vaani"],
    "llm": ["Google"],
    "tts": ["Google"],
}


@router.get("/catalog")
def get_catalog(db: Session = Depends(get_db)):
    def providers_for(stage, include_models=True, include_languages=False, include_voices=False):
        providers = (
            db.query(CatalogProvider)
            .filter_by(stage=stage)
            .filter(CatalogProvider.name.in_(ENABLED_CATALOG_PROVIDERS[stage]))
            .order_by(CatalogProvider.sort_order)
            .all()
        )
        out = []
        for p in providers:
            entry = {"name": p.name}
            if include_models:
                models = sorted(p.models, key=lambda m: m.sort_order)
                entry["models"] = [{"value": m.value, "label": m.label} for m in models]
            if include_languages:
                langs = sorted(p.languages, key=lambda lang: lang.sort_order)
                entry["languages"] = [lang.name for lang in langs]
            if include_voices:
                voices = sorted(p.voices, key=lambda v: v.sort_order)
                entry["voices"] = [{"name": v.name, "gender": v.gender} for v in voices]
            out.append(entry)
        return out

    tts_providers = providers_for("tts", include_languages=True, include_voices=True)
    # Sarvam's voices are keyed by model instead of provider (Bulbul:v2 vs v3
    # have different speaker lists) -- attach them under each model entry.
    voices_by_model_id = {}
    for v in db.query(CatalogVoice).filter(CatalogVoice.model_id.isnot(None)).order_by(CatalogVoice.sort_order).all():
        voices_by_model_id.setdefault(v.model_id, []).append({"name": v.name, "gender": v.gender})
    for entry in tts_providers:
        provider = db.query(CatalogProvider).filter_by(stage="tts", name=entry["name"]).first()
        for i, model in enumerate(sorted(provider.models, key=lambda m: m.sort_order)):
            if model.id in voices_by_model_id:
                entry["models"][i] = {
                    "value": model.value,
                    "label": model.label,
                    "voices": voices_by_model_id[model.id],
                }

    prompts = db.query(CatalogPrompt).order_by(CatalogPrompt.sort_order).all()

    return {
        "asr": {"providers": providers_for("asr")},
        "llm": {
            "providers": providers_for("llm"),
            "prompts": [{"name": p.name, "prompt": p.prompt_text} for p in prompts],
        },
        "tts": {"providers": tts_providers},
    }


# Onboard a model into the catalog (Models page). Only for providers that
# GET /api/catalog already serves -- those are the ones with a real code
# path at call time, so a model added here is usable straight away (e.g. a
# new Gemini model id under "Google"). A brand-new provider still needs
# code + an ENABLED_CATALOG_PROVIDERS entry, not just a row.
@router.post("/catalog/models", status_code=201)
def add_catalog_model(
    payload: AddCatalogModelRequest,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    stage = (payload.stage or "").strip().lower()
    provider_name = (payload.provider or "").strip()
    value = (payload.value or "").strip()
    label = (payload.label or "").strip() or value

    if stage not in ENABLED_CATALOG_PROVIDERS:
        raise HTTPException(status_code=400, detail="Stage must be one of: asr, llm, tts.")
    if provider_name not in ENABLED_CATALOG_PROVIDERS[stage]:
        allowed = ", ".join(ENABLED_CATALOG_PROVIDERS[stage])
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_name}' isn't supported for {stage.upper()} yet. Supported: {allowed}.",
        )
    if not value:
        raise HTTPException(status_code=400, detail="Model ID is required.")

    provider = db.query(CatalogProvider).filter_by(stage=stage, name=provider_name).first()
    if provider is None:
        max_order = db.query(func.max(CatalogProvider.sort_order)).filter_by(stage=stage).scalar() or 0
        provider = CatalogProvider(stage=stage, name=provider_name, sort_order=max_order + 1)
        db.add(provider)
        db.flush()

    if db.query(CatalogModel).filter_by(provider_id=provider.id, value=value).first():
        raise HTTPException(status_code=409, detail=f"'{value}' is already in the {provider_name} {stage.upper()} catalog.")

    max_order = db.query(func.max(CatalogModel.sort_order)).filter_by(provider_id=provider.id).scalar() or 0
    db.add(CatalogModel(provider_id=provider.id, value=value, label=label, sort_order=max_order + 1))
    db.commit()
    return {"stage": stage, "provider": provider_name, "value": value, "label": label}


# =======================================================================================
#                                       SETTINGS -- API KEYS
# =======================================================================================
# Providers offered on the Settings page. used_for is set only where the
# platform actually reads the key today (per-agent override in
# utils.agent_info_orchestrator -> GeminiLLM / GeminiTTS); the rest are
# stored for when those providers get wired up, and the UI says so.
SETTINGS_API_KEY_PROVIDERS = [
    {"name": "Google", "used_for": "Gemini LLM & TTS, ASR comparison"},
    {"name": "Sarvam", "used_for": "Sarvam ASR & TTS, ASR comparison"},
    {"name": "OpenAI", "used_for": "ASR comparison"},
    {"name": "Muse", "used_for": "ASR comparison"},
    {"name": "Deepgram", "used_for": None},
    {"name": "ElevenLabs", "used_for": None},
    {"name": "Azure", "used_for": None},
    {"name": "AssemblyAI", "used_for": None},
    {"name": "Hugging Face", "used_for": None},
]
_SETTINGS_PROVIDER_NAMES = {p["name"] for p in SETTINGS_API_KEY_PROVIDERS}


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}{'•' * 8}{key[-4:]}"


def _serialize_key(row: UserAPIKey) -> dict:
    stamp = row.updated_at or row.created_at
    return {
        "provider": row.provider,
        "masked": _mask_key(row.api_key),
        "updated_at": stamp.isoformat() if stamp else None,
    }


def _invalidate_user_agent_configs(db: Session, username: str):
    # A cached agent config holds the key it resolved at build time --
    # drop every one of this user's so the next call picks up the change.
    for (agent_id,) in db.query(VoiceAgent.id).filter(VoiceAgent.user_username == username).all():
        invalidate_agent_config(agent_id, force=True)


@router.get("/settings/api-keys")
def list_api_keys(
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    username = user_payload.get("username")
    rows = db.query(UserAPIKey).filter(UserAPIKey.user_username == username).order_by(UserAPIKey.provider).all()
    return {
        "providers": [
            {"name": p["name"], "in_use": p["used_for"] is not None, "used_for": p["used_for"]}
            for p in SETTINGS_API_KEY_PROVIDERS
        ],
        "keys": [_serialize_key(r) for r in rows],
    }


@router.put("/settings/api-keys")
def save_api_key(
    payload: SaveApiKeyRequest,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    username = user_payload.get("username")
    provider = (payload.provider or "").strip()
    api_key = (payload.api_key or "").strip()
    if provider not in _SETTINGS_PROVIDER_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'.")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key can't be empty.")

    row = db.query(UserAPIKey).filter_by(user_username=username, provider=provider).first()
    if row is None:
        row = UserAPIKey(user_username=username, provider=provider, api_key=api_key)
        db.add(row)
    else:
        row.api_key = api_key
        row.updated_at = func.now()
    db.commit()
    db.refresh(row)
    _invalidate_user_agent_configs(db, username)
    return _serialize_key(row)


@router.delete("/settings/api-keys/{provider}")
def delete_api_key(
    provider: str,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    username = user_payload.get("username")
    row = db.query(UserAPIKey).filter_by(user_username=username, provider=provider).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No saved key for '{provider}'.")
    db.delete(row)
    db.commit()
    _invalidate_user_agent_configs(db, username)
    return {"deleted": True}


# =======================================================================================
#                                       CREATE AGENT
# =======================================================================================

@router.post("/create/new/voice/agent")
async def create_agent(
        request: Request,
        response: Response,
        payload: CreateAgentRequestWrapper,
        db: Session = Depends(get_db),
        user_payload: dict = Depends(get_current_user)
    ):
    body = payload.body
    username = user_payload.get("username")

    if check_if_agent_name_exists(db, body.name, username):
        raise HTTPException(
            detail="Agent name already in use",
            status_code=400
        )
   
    try:
        asr =  ASRProvider(
            model = body.asr.model,
            provider = body.asr.provider,
            keywords = body.asr.keywords or None,
            end_of_turn_confidence = body.asr.end_of_turn_confidence,
            end_of_turn_timeout = body.asr.end_of_turn_timeout,
            min_speech_duration = body.asr.min_speech_duration
        )

        api_keys = body.api_keys or {}

        llm = LLMProvider(
            model = body.llm.model,
            provider = body.llm.provider,
            prompt = body.llm.prompt,
            temperature = body.llm.temperature,
            max_tokens = body.llm.max_tokens,
            api_key = api_keys.get(body.llm.provider)
        )

        tts = TTSProvider(
            model = body.tts.model,
            provider = body.tts.provider,
            language = body.tts.language,
            speed = body.tts.speed,
            speaker_audio = body.tts.speaker_audio,
            api_key = api_keys.get(body.tts.provider)
        )

        db.add(asr)
        db.add(tts)
        db.add(llm)
        db.flush()

        agent = VoiceAgent(
            name = body.name,
            user_username = username,
            asr_provider_name = body.asr.model,
            llm_provider_name = body.llm.model,
            tts_provider_name = body.tts.model,
            asr_id = asr.id,
            llm_id = llm.id,
            tts_id = tts.id,
            greeting_message = body.greeting_message,
            end_call_message = body.end_call_message,
            respose_audio_delay = body.response_audio_delay
        )
    
        db.add(agent)
        db.commit()
        db.refresh(agent)

        return {
            "message": "Agent created succefully!!",
            "agent_id": agent.id,
            "status": 200   
        }

    except Exception as e:
        raise HTTPException(
            detail=str(e),
            status_code=400
        ) from e


# =======================================================================================
#                                       UPDATE AGENT
# =======================================================================================

@router.patch("/update/agent/{agent_id}")
async def update_agent(
        agent_id: int,
        payload: UpdateAgentRequestWrapper,
        db: Session = Depends(get_db),
        user_payload: dict = Depends(get_current_user)
    ):
    body = payload.body
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter(
        VoiceAgent.id == agent_id,
        VoiceAgent.user_username == username
    ).first()

    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    try:
        # Each section is optional -- only whichever one the caller sent
        # gets touched. api_key isn't a field on these Pydantic models, so
        # this can never accidentally overwrite a stored per-agent key.
        if body.asr and agent.asr:
            for field, value in body.asr.model_dump().items():
                setattr(agent.asr, field, value)
            agent.asr_provider_name = body.asr.model

        if body.llm and agent.llm:
            # Snapshot the outgoing prompt before it's overwritten (issue
            # #35) -- only when it's actually changing, not on every save
            # that happens to touch this section (e.g. just temperature).
            # The current prompt always lives on agent.llm.prompt itself;
            # this table is purely what it used to be.
            if body.llm.prompt is not None and body.llm.prompt != agent.llm.prompt:
                db.add(PromptVersion(agent_id=agent.id, prompt_text=agent.llm.prompt, changed_by=username))
            for field, value in body.llm.model_dump().items():
                setattr(agent.llm, field, value)
            agent.llm_provider_name = body.llm.model

        if body.tts and agent.tts:
            for field, value in body.tts.model_dump().items():
                setattr(agent.tts, field, value)
            agent.tts_provider_name = body.tts.model

        db.commit()
        invalidate_agent_config(agent_id, force=True)

        return {"message": "Agent updated successfully", "status": 200}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            detail=str(e),
            status_code=400
        ) from e


# =======================================================================================
#                                       PROMPT VERSION HISTORY (issue #35)
# =======================================================================================
@router.get("/agent/{agent_id}/prompt-history")
def list_prompt_versions(
    agent_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Past prompt versions only -- the current one is agent.llm.prompt
    itself, not duplicated here. Newest-first, same as call history."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    versions = (
        db.query(PromptVersion)
        .filter_by(agent_id=agent_id)
        .order_by(PromptVersion.created_at.desc())
        .all()
    )
    return {
        "current_prompt": agent.llm.prompt if agent.llm else None,
        "versions": [
            {
                "id": v.id,
                "prompt_text": v.prompt_text,
                "changed_by": v.changed_by,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in versions
        ],
    }


@router.get("/agent/{agent_id}/prompt-history/{version_id}/diff")
def diff_prompt_version(
    agent_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Line-based diff between one past version and the current prompt --
    stdlib difflib, not a new dependency or a hand-rolled diff algorithm.
    Each line is {"tag": "equal"|"delete"|"insert"|"replace", "old", "new"}
    from SequenceMatcher.get_opcodes(), grouped so the frontend doesn't
    have to reimplement opcode interpretation."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent or not agent.llm:
        raise HTTPException(detail="Agent not found", status_code=404)

    version = db.query(PromptVersion).filter_by(id=version_id, agent_id=agent_id).first()
    if not version:
        raise HTTPException(detail="Prompt version not found", status_code=404)

    old_lines = version.prompt_text.splitlines()
    new_lines = agent.llm.prompt.splitlines()
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines)

    rows = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        old_chunk = old_lines[i1:i2]
        new_chunk = new_lines[j1:j2]
        for k in range(max(len(old_chunk), len(new_chunk))):
            rows.append({
                "tag": tag,
                "old": old_chunk[k] if k < len(old_chunk) else None,
                "new": new_chunk[k] if k < len(new_chunk) else None,
            })

    return {"version_id": version_id, "rows": rows}


@router.post("/agent/{agent_id}/prompt-history/{version_id}/rollback")
def rollback_prompt_version(
    agent_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Restores a past prompt version as the current one. Snapshots the
    *current* prompt into history first (same rule as update_agent: only
    if it actually differs), so a rollback is itself just another
    recorded version change -- undoable the same way, not a special
    irreversible action."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent or not agent.llm:
        raise HTTPException(detail="Agent not found", status_code=404)

    version = db.query(PromptVersion).filter_by(id=version_id, agent_id=agent_id).first()
    if not version:
        raise HTTPException(detail="Prompt version not found", status_code=404)

    if version.prompt_text != agent.llm.prompt:
        db.add(PromptVersion(agent_id=agent.id, prompt_text=agent.llm.prompt, changed_by=username))
        agent.llm.prompt = version.prompt_text
        db.commit()
        invalidate_agent_config(agent_id, force=True)

    return {"message": "Prompt rolled back", "status": 200}


@router.get("/get/agent/list", response_model=list[AgentResponse])
async def list_agents(
        request: Request,
        response: Response,
        db: Session = Depends(get_db),
        user_payload: dict = Depends(get_current_user),
):
    try:
        username = user_payload.get("username")
        agents =  db.query(
            VoiceAgent.id,
            VoiceAgent.name,
            VoiceAgent.asr_provider_name,
            VoiceAgent.llm_provider_name,
            VoiceAgent.tts_provider_name,
            VoiceAgent.created_at
            ).filter(VoiceAgent.user_username == username
            ).order_by(VoiceAgent.created_at.desc()).all()

        return agents

    except Exception as e:
        raise HTTPException(
            detail="Error getting the agents",
            status_code=400
        ) from e


@router.get("/agent-stats/summary")
def get_agent_call_stats_summary(
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Total call count + total call duration across every agent the
    current user owns -- one aggregate query instead of the dashboard
    paging through every agent's full call list client-side just to sum
    a number. NULL duration (a call that errored before ending cleanly)
    is excluded from the sum by func.sum itself, not treated as zero.
    Optional ?agent_id= narrows it to one of the user's agents (the
    agent details page's Call Stats section)."""
    username = user_payload.get("username")

    def scoped(query):
        query = query.join(VoiceAgent, VoiceAgent.id == CallHistory.agent_id).filter(VoiceAgent.user_username == username)
        return query.filter(CallHistory.agent_id == agent_id) if agent_id is not None else query

    total_calls, total_duration, agents_with_calls = scoped(
        db.query(
            func.count(CallHistory.id),
            func.sum(CallHistory.duration),
            func.count(func.distinct(CallHistory.agent_id)),
        )
    ).one()

    # token_usage is a JSON blob (not a plain numeric column), so this
    # sums in Python rather than fighting Postgres JSON operators for one
    # aggregate query -- fine at this scale (one column, no transcript/
    # per-turn data pulled). estimated_cost_usd stays None (not $0) if no
    # call in the set ever had a tracked cost, same "absent beats a
    # fabricated number" rule LLM/pricing.py itself follows -- a call on
    # an untracked model has no cost data, not a zero-cost one.
    usage_rows = scoped(db.query(CallHistory.token_usage)).all()
    total_tokens = 0
    total_cost_usd = 0.0
    any_cost_tracked = False
    # ASR/TTS: same None-means-untracked rule -- 0.0 is a real tracked
    # value (Vaani ASR, Kokoro/DhVaani TTS are genuinely free), so it's
    # summed like any other cost; only a call whose token_usage never set
    # the key at all (written before this field existed) is skipped.
    total_asr_cost_usd = 0.0
    any_asr_cost_tracked = False
    total_tts_cost_usd = 0.0
    any_tts_cost_tracked = False
    for (usage,) in usage_rows:
        if not usage:
            continue
        total_tokens += usage.get("total_tokens") or 0
        cost = usage.get("estimated_cost_usd")
        if cost is not None:
            total_cost_usd += cost
            any_cost_tracked = True
        asr_cost = usage.get("asr_cost_usd")
        if asr_cost is not None:
            total_asr_cost_usd += asr_cost
            any_asr_cost_tracked = True
        tts_cost = usage.get("tts_cost_usd")
        if tts_cost is not None:
            total_tts_cost_usd += tts_cost
            any_tts_cost_tracked = True

    return {
        "total_calls": total_calls or 0,
        "total_duration_seconds": int(total_duration) if total_duration is not None else 0,
        "agents_with_calls": agents_with_calls or 0,
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost_usd, 4) if any_cost_tracked else None,
        "total_asr_cost_usd": round(total_asr_cost_usd, 4) if any_asr_cost_tracked else None,
        "total_tts_cost_usd": round(total_tts_cost_usd, 4) if any_tts_cost_tracked else None,
    }


@router.get("/calls")
def list_all_calls(
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Consolidated call history across every agent the current user owns
    (the Call History page) -- same shape as list_agent_calls below, plus
    agent_id/agent_name per row since rows span multiple agents here."""
    username = user_payload.get("username")

    query = (
        db.query(CallHistory, VoiceAgent.name.label("agent_name"))
        .join(VoiceAgent, VoiceAgent.id == CallHistory.agent_id)
        .filter(VoiceAgent.user_username == username)
        .order_by(CallHistory.started_at.desc())
    )
    total = query.count()

    limit = max(1, min(limit, 100))
    rows = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "calls": [
            {
                "id": c.id,
                "agent_id": c.agent_id,
                "agent_name": agent_name,
                "summary": c.summary,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "ended_at": c.ended_at.isoformat() if c.ended_at else None,
                "duration": c.duration,
                "language": c.language,
                "tool_call_count": c.tool_call_count,
                "disconnect_reason": c.disconnect_reason,
                "token_usage": c.token_usage,
            }
            for c, agent_name in rows
        ],
    }


@router.get("/agent/{agent_id}")
def get_agent_detail(
    agent_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    asr, llm, tts = agent.asr, agent.llm, agent.tts
    agent_type = "+".join(
        code for code, present in (("A", asr), ("L", llm), ("T", tts)) if present
    )

    return {
        "data": {
            "id": agent.id,
            "name": agent.name,
            "agent_type": agent_type,
            "created_at": agent.created_at.isoformat(),
            "asr": {
                "model": asr.model,
                "provider": asr.provider,
                "keywords": asr.keywords,
                "end_of_turn_confidence": asr.end_of_turn_confidence,
                "end_of_turn_timeout": asr.end_of_turn_timeout,
                "min_speech_duration": asr.min_speech_duration,
            } if asr else None,
            "llm": {
                "model": llm.model,
                "provider": llm.provider,
                "prompt": llm.prompt,
                "temperature": llm.temperature,
                "max_tokens": llm.max_tokens,
                "mcp_url": llm.mcp_url,
            } if llm else None,
            "tts": {
                "model": tts.model,
                "provider": tts.provider,
                "language": tts.language,
                "speed": tts.speed,
                "speaker_audio": tts.speaker_audio,
            } if tts else None,
        }
    }


# =======================================================================================
#                                       CALL HISTORY (issue #27)
# =======================================================================================
@router.get("/agent/{agent_id}/calls")
def list_agent_calls(
    agent_id: int,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Extendable table of past calls for one agent -- summary rows only
    (no transcript/per-turn latency, that's the detail endpoint below), so
    this stays cheap to page through. Same ownership check as
    get_agent_detail: filtering by (id, user_username) together is both
    the existence check and the "is this yours" check in one query."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    limit = max(1, min(limit, 100))
    query = db.query(CallHistory).filter_by(agent_id=agent_id).order_by(CallHistory.started_at.desc())
    total = query.count()
    calls = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "calls": [
            {
                "id": c.id,
                "summary": c.summary,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "ended_at": c.ended_at.isoformat() if c.ended_at else None,
                "duration": c.duration,
                "language": c.language,
                "tool_call_count": c.tool_call_count,
                "disconnect_reason": c.disconnect_reason,
                "token_usage": c.token_usage,
                "recording_available": {
                    "user": bool(c.recording_path and recording_file_path(c.recording_path, "user")),
                    "agent": bool(c.recording_path and recording_file_path(c.recording_path, "agent")),
                } if c.recording_path else None,
            }
            for c in calls
        ],
    }


@router.get("/agent/{agent_id}/calls/{call_id}")
def get_agent_call_detail(
    agent_id: int,
    call_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Full transcript + latency breakdown for one call -- the expandable-
    row detail, including latency_per_turn for the per-turn latency line
    chart."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    call = db.query(CallHistory).filter_by(id=call_id, agent_id=agent_id).first()
    if not call:
        raise HTTPException(detail="Call not found", status_code=404)

    return {
        "id": call.id,
        "summary": call.summary,
        "started_at": call.started_at.isoformat() if call.started_at else None,
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        "duration": call.duration,
        "language": call.language,
        "tool_call_count": call.tool_call_count,
        "disconnect_reason": call.disconnect_reason,
        "messages": call.messages,
        "latency_summary": call.latency_summary,
        "latency_per_turn": call.latency_per_turn,
        "token_usage": call.token_usage,
        "asr_eval_results": call.asr_eval_results,
        "recording_available": {
            "user": bool(call.recording_path and recording_file_path(call.recording_path, "user")),
            "agent": bool(call.recording_path and recording_file_path(call.recording_path, "agent")),
        } if call.recording_path else None,
    }


@router.post("/agent/{agent_id}/calls/{call_id}/asr-eval-feedback")
def set_asr_eval_feedback(
    agent_id: int,
    call_id: int,
    request: AsrEvalFeedbackRequest,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Thumbs up/down on one ASR eval-mode model's output, stored right in
    CallHistory.asr_eval_results (each entry already keyed by turn_id,
    with one dict per provider in `results`) -- no new table, this is
    exactly the "part of the eval column json" the feature asked for.
    Live in-call feedback isn't possible: a call has no call_id until
    it's already been persisted (see main.py's finally block), so this
    only ever applies to the post-call Call History view."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    call = db.query(CallHistory).filter_by(id=call_id, agent_id=agent_id).first()
    if not call:
        raise HTTPException(detail="Call not found", status_code=404)

    if not call.asr_eval_results:
        raise HTTPException(detail="This call has no ASR evaluation results", status_code=404)

    turn = next((t for t in call.asr_eval_results if t.get("turn_id") == request.turn_id), None)
    if not turn:
        raise HTTPException(detail="Turn not found", status_code=404)

    result = next((r for r in turn.get("results", []) if r.get("provider") == request.provider), None)
    if not result:
        raise HTTPException(detail="Model not found for this turn", status_code=404)

    result["feedback"] = request.feedback
    # JSON columns aren't change-tracked for in-place mutation (unlike a
    # plain scalar column) -- without this, the dict above is mutated in
    # Python but SQLAlchemy has no idea the column needs to be re-written,
    # and the UPDATE never happens.
    flag_modified(call, "asr_eval_results")
    db.commit()

    return {"turn_id": request.turn_id, "provider": request.provider, "feedback": request.feedback}


# Most recent calls scanned for the Evaluation page's aggregate stats and
# historical chart -- bounded rather than every call ever made, same
# "cheap to compute, not a full table scan" reasoning as the rest of this
# file's stats endpoints.
ASR_EVAL_SUMMARY_CALL_LIMIT = 50


@router.get("/asr-eval/summary")
def get_asr_eval_summary(
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Aggregate ASR evaluation-mode results (issue: Evaluation page).

    The provider stats (turns/avg latency/thumbs) and the latency-over-time
    chart are GLOBAL -- every user's evaluation-mode calls contribute, so
    the numbers reflect real usage across the platform rather than just
    this user's own testing. turn_details (the actual transcript text per
    model) is scoped to the current user's own calls only -- other users'
    call content shouldn't be readable just because their calls fed into
    the aggregate ratings above."""
    username = user_payload.get("username")

    calls = (
        db.query(CallHistory.id, CallHistory.asr_eval_results, CallHistory.started_at, VoiceAgent.id.label("agent_id"), VoiceAgent.name.label("agent_name"), VoiceAgent.user_username)
        .join(VoiceAgent, VoiceAgent.id == CallHistory.agent_id)
        .filter(CallHistory.asr_eval_results.isnot(None))
        .order_by(CallHistory.started_at.desc())
        .limit(ASR_EVAL_SUMMARY_CALL_LIMIT)
        .all()
    )

    provider_stats: dict[str, dict] = {}
    turns_newest_first = []
    details_newest_first = []
    for call_id, eval_results, started_at, agent_id, agent_name, owner_username in calls:
        is_own_call = owner_username == username
        for turn in eval_results or []:
            point = {}
            results_out = []
            for r in turn.get("results", []):
                provider = r.get("provider")
                if not provider:
                    continue
                stats = provider_stats.setdefault(provider, {
                    "provider": provider,
                    "model": r.get("model"),
                    "turns": 0,
                    "latency_sum_ms": 0.0,
                    "latency_count": 0,
                    "thumbs_up": 0,
                    "thumbs_down": 0,
                })
                stats["turns"] += 1
                if r.get("latency_ms") is not None:
                    stats["latency_sum_ms"] += r["latency_ms"]
                    stats["latency_count"] += 1
                if r.get("feedback") == "up":
                    stats["thumbs_up"] += 1
                elif r.get("feedback") == "down":
                    stats["thumbs_down"] += 1
                point[provider] = r.get("latency_ms")
                results_out.append({
                    "provider": provider,
                    "model": r.get("model"),
                    "text": r.get("text"),
                    "latency_ms": r.get("latency_ms"),
                    "is_primary": r.get("is_primary", False),
                    "feedback": r.get("feedback"),
                })
            if point:
                turns_newest_first.append(point)
                if is_own_call:
                    details_newest_first.append({
                        "call_id": call_id,
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "turn_id": turn.get("turn_id"),
                        "started_at": started_at.isoformat() if started_at else None,
                        "results": results_out,
                    })

    # Calls were scanned newest-first; both lists read left-to-right /
    # top-to-bottom as a timeline, so flip to oldest-first before assigning
    # turnIndex (turns and turn_details stay index-aligned).
    turns = list(reversed(turns_newest_first))
    turn_details = list(reversed(details_newest_first))
    for i, point in enumerate(turns):
        point["turnIndex"] = i + 1

    providers = [
        {
            "provider": s["provider"],
            "model": s["model"],
            "turns": s["turns"],
            "avg_latency_ms": round(s["latency_sum_ms"] / s["latency_count"], 1) if s["latency_count"] else None,
            "thumbs_up": s["thumbs_up"],
            "thumbs_down": s["thumbs_down"],
        }
        for s in provider_stats.values()
    ]
    provider_models = {s["provider"]: s["model"] for s in provider_stats.values() if s["model"]}

    return {
        "providers": providers,
        "turns": turns,
        "turn_details": turn_details,
        "provider_models": provider_models,
        "calls_scanned": len(calls),
    }


@router.get("/agent/{agent_id}/calls/{call_id}/recording/{side}")
def get_agent_call_recording(
    agent_id: int,
    call_id: int,
    side: str,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    """Streams one side's WAV recording for a call (issue #29). side is
    "user" (mic input) or "agent" (TTS output) -- real audio of what was
    said, so this goes through the same agent-ownership check every
    other call-history endpoint uses, not a public/unauthenticated path."""
    username = user_payload.get("username")

    agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
    if not agent:
        raise HTTPException(detail="Agent not found", status_code=404)

    call = db.query(CallHistory).filter_by(id=call_id, agent_id=agent_id).first()
    if not call or not call.recording_path:
        raise HTTPException(detail="Recording not found", status_code=404)

    path = recording_file_path(call.recording_path, side)
    if not path:
        raise HTTPException(detail="Recording not found", status_code=404)

    return FileResponse(path, media_type="audio/wav", filename=f"call-{call_id}-{side}.wav")


# =======================================================================================
#                                       DELETE AGENT



@router.delete("/delete/agent/{agent_id}")
def delete_agent(
    request: Request,
    response: Response,
    agent_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):

    try:
        username = user_payload.get("username")
        agent = db.query(VoiceAgent).filter_by(id=agent_id, user_username=username).first()
        if not agent:
            return

        invalidate_agent_config(agent_id, True)

        asr_id, llm_id, tts_id = agent.asr_id, agent.llm_id, agent.tts_id
        db.delete(agent)
        db.flush()  # ensure the agent row is gone before checking references

        if not db.query(VoiceAgent).filter_by(asr_id=asr_id).first():
            db.query(ASRProvider).filter_by(id=asr_id).delete()
        if not db.query(VoiceAgent).filter_by(llm_id=llm_id).first():
            db.query(LLMProvider).filter_by(id=llm_id).delete()
        if not db.query(VoiceAgent).filter_by(tts_id=tts_id).first():
            db.query(TTSProvider).filter_by(id=tts_id).delete()

        db.commit()

        return {
            "message": "Successfully deleted agent",
            "status": 200
        }

    except Exception as e:
        print("Error deleting agent:", str(e))
        raise HTTPException(
            detail="error deleting the agent: " + str(e),
            status_code=400
        ) from e

# =======================================================================================
#                                       RAG SETUP
# =======================================================================================

@router.post("/llm/ingest/data")

async def llm_ingest(
    request: Request,
    response: Response,
    agent_name: str = Form(...),
    urls: list[str] | None = Form(None),
    text: str | None = Form(None),
    text_source: str | None = Form(None),
    files: list[UploadFile] | None = File(None),
    user_payload: dict = None
):
    agent_name = agent_name

    results = []

    for upload in files or []:
        suffix = "." + upload.filename.rsplit(".", 1)[-1].lower() if "." in upload.filename else ""
        if suffix not in ALLOWED_EXTENSIONS:
            results.append({
                "source": upload.filename,
                "type": "file",
                "status": "error",
                "detail": f"Unsupported file type '{suffix}'.",
            })
            continue
    

        content = await upload.read()
        if len(content) > MAX_UPLOAD_BYTES:
            results.append({
                "source": upload.filename,
                "type": "file",
                "status": "error",
                "detail": "File exceeds 25 MB limit.",
            })
            continue    


        result = await mcp_client.ingest_file(upload.filename, content, agent_name)
        results.append({
            "source": upload.filename,
            "type": "file",
            "status": "error" if "error" in result else "ok",
            **result,
        })
    

    for url in urls or []:
        result = await mcp_client.ingest_url(url, agent_name)
        results.append({
            "source": url,
            "type": "url",
            "status": "error" if "error" in result else "ok",
            **result,
        })
    
    if text:
        result = await mcp_client.ingest_text(
            text, text_source, agent_name
        )
        results.append({
            "source": text_source or text[:10],
            "type": "text",
            "status": "error" if "error" in result else "ok",
            **result,
        })
    

    has_error = any(r["status"] == "error" for r in results)
    all_error = all(r["status"] == "error" for r in results)


    if all_error:
        response.status_code = 422
    

    return {
        "agent_name": agent_name,
        "ingested": len([r for r in results if r["status"] == "ok"]),
        "failed": len([r for r in results if r["status"] == "error"]),
        "partial": has_error and not all_error,
        "results": results,
    }






@router.get("/test/list/sorces/{agent_id}")
async def list_sources(agent_id: str):
    return {
        "result" : await mcp_client.list_sources(agent_id) 
    }

@router.delete("/test/delete/source/{agent_id}")
async def delete_sources(agent_id: str, source: str):
    await mcp_client.delete_source(source, agent_id)
    return {
        "result" : await mcp_client.list_sources(agent_id)
    }

@router.get("/test/list/collections")
async def list_collections():  
    return {
        "result" : await mcp_client.list_collections()
    }

@router.delete("/test/delete/collection/{agent_id}")
async def delete_collection(agent_id: str):
    await mcp_client.delete_collection(agent_id)
    return {
        "result" : await mcp_client.list_collections()
    }

@router.get("/test/mandi/prices")
async def get_mandi_prices(
    commodity: str,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
    variety: str | None = None,
    grade: str | None = None,
    limit: int = 10,
):
    return {
        "result" : await mcp_client.get_mandi_prices(
            commodity=commodity,
            state=state,
            district=district,
            market=market,
            variety=variety,
            grade=grade,
            limit=limit
        )
    }


# =======================================================================================
#                                       TTS VOICE REFERENCES
# =======================================================================================
# Reference clips + transcripts for zero-shot voice-cloning TTS models
# (currently DhVaani) -- these have no fixed named voices, every synthesis
# call needs a reference audio clip and its transcript.

@router.post("/tts/voice-references")
async def upload_voice_reference(
    name: str = Form(...),
    transcript: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            detail=f"Unsupported audio type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
            status_code=400,
        )

    content = await file.read()
    if len(content) > MAX_VOICE_REFERENCE_BYTES:
        raise HTTPException(detail="Reference clip exceeds 15 MB.", status_code=400)

    if db.query(TTSVoiceReference).filter_by(name=name).first():
        raise HTTPException(detail=f"A voice reference named '{name}' already exists.", status_code=400)

    voice_ref_dir = Path(VOICE_REFERENCE_DIR)
    voice_ref_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid.uuid4().hex}{suffix}"
    (voice_ref_dir / stored_filename).write_bytes(content)

    ref = TTSVoiceReference(name=name, audio_path=stored_filename, transcript=transcript)
    db.add(ref)
    db.commit()
    db.refresh(ref)

    return {
        "id": ref.id,
        "name": ref.name,
        "transcript": ref.transcript,
        "status": 200,
    }


@router.get("/tts/voice-references")
def list_voice_references(db: Session = Depends(get_db)):
    refs = db.query(TTSVoiceReference).order_by(TTSVoiceReference.created_at.desc()).all()
    return [{"id": r.id, "name": r.name, "transcript": r.transcript} for r in refs]


@router.delete("/tts/voice-references/{ref_id}")
def delete_voice_reference(
    ref_id: int,
    db: Session = Depends(get_db),
    user_payload: dict = Depends(get_current_user),
):
    ref = db.query(TTSVoiceReference).filter_by(id=ref_id).first()
    if not ref:
        return {"message": "Not found", "status": 404}

    audio_file = Path(VOICE_REFERENCE_DIR) / ref.audio_path
    audio_file.unlink(missing_ok=True)

    db.delete(ref)
    db.commit()
    return {"message": "Voice reference deleted", "status": 200}       