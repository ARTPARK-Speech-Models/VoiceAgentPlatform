from sqlalchemy import ARRAY, JSON, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.database.engine import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String)
    # Bcrypt hash under the old home-rolled auth, before Google Sign-In --
    # only ever set on rows created before that switch; never written to
    # or read by any current code path.
    password = Column(String, nullable=True)
    # Firebase Auth's uid for this user (Google Sign-In). Null for a
    # pre-Firebase row until its first sign-in links it by matching email
    # (src/crud.py's create_session). This is the auth-linkage column;
    # VoiceAgent.user_username stays the FK anchor (unchanged) so nothing
    # else needs to reference this.
    firebase_uid = Column(String, unique=True, nullable=True, index=True)
    # NULL/empty = account in good standing. Any text = banned; the text is
    # the reason (set by hand in the DB). A banned user is refused at login
    # and on every authenticated REST/WebSocket request (src/database/auth.py,
    # ws_auth.py, crud.py's create_session).
    ban_status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agents = relationship("VoiceAgent", back_populates="user")



# Per-user provider API keys, managed on the Settings page. Applied at call
# time to every agent the user owns (see utils.agent_info_orchestrator):
# an agent's own per-agent key (legacy, set at creation) wins, then the
# user's key here, then the platform's env key. Never returned raw by the
# API -- only masked.
class UserAPIKey(Base):
    __tablename__ = "user_api_keys"
    __table_args__ = (UniqueConstraint("user_username", "provider", name="uq_user_api_key_user_provider"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_username = Column(String, ForeignKey("users.username"), nullable=False, index=True)
    provider = Column(String, nullable=False)
    api_key = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ASRProvider(Base):
    __tablename__ = "asr_provider"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model = Column(String)
    provider = Column(String, nullable=False)
    keywords = Column(ARRAY(String))
    end_of_turn_confidence = Column(Float)
    end_of_turn_timeout = Column(Integer)
    min_speech_duration = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agents = relationship("VoiceAgent", back_populates="asr")


class LLMProvider(Base):
    __tablename__ = "llm_provider"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model = Column(String)
    provider = Column(String, nullable=False)
    prompt = Column(String)
    temperature = Column(Float)
    max_tokens = Column(Integer)

    mcp_url  = Column(String)
    api_key = Column(String)  # per-agent key, e.g. for provider "Vaani" (GeminiLLM) -- falls back to the owner's Settings key if unset
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agents = relationship("VoiceAgent", back_populates="llm")


class TTSProvider(Base):
    __tablename__ = "tts_provider"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)    
    model = Column(String)
    provider = Column(String, nullable=False)

    language = Column(String)
    speed = Column(Float)
    speaker_audio = Column(String)
    api_key = Column(String)  # per-agent key, e.g. for provider "Google" (GeminiTTS) -- falls back to the owner's Settings key if unset

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agents = relationship("VoiceAgent", back_populates="tts")
    

class VoiceAgent(Base):
    __tablename__ = "custom_voice_agents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)

    user_username = Column(String, ForeignKey("users.username"), nullable=False)

    asr_provider_name = Column(String)
    llm_provider_name = Column(String)
    tts_provider_name = Column(String)

    asr_id = Column(Integer, ForeignKey("asr_provider.id"), nullable=True)
    llm_id = Column(Integer, ForeignKey("llm_provider.id"), nullable=True)
    tts_id = Column(Integer, ForeignKey("tts_provider.id"), nullable=True)

    greeting_message = Column(String)
    end_call_message = Column(String)

    respose_audio_delay = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


    user = relationship("User", back_populates="agents")   
    asr = relationship("ASRProvider", foreign_keys=[asr_id], back_populates="agents")
    llm = relationship("LLMProvider", foreign_keys=[llm_id], back_populates="agents")
    tts = relationship("TTSProvider", foreign_keys=[tts_id], back_populates="agents")

    history = relationship("CallHistory", back_populates="agents")
    prompt_versions = relationship("PromptVersion", back_populates="agent", cascade="all, delete-orphan")


class PromptVersion(Base):
    """Snapshot of an agent's LLM system prompt from just before it was
    overwritten (issue #35) -- written in update_agent (src/crud.py),
    right before the incoming prompt replaces the stored one, only when
    the prompt actually changed (not on every save touching some other
    LLM field like temperature). The *current* prompt lives only on
    llm_provider.prompt as always; this table is purely past versions,
    so a fresh agent that's never had its prompt edited has zero rows
    here, not one."""
    __tablename__ = "prompt_versions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    agent_id = Column(Integer, ForeignKey("custom_voice_agents.id"), nullable=False)
    prompt_text = Column(String, nullable=False)
    changed_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("VoiceAgent", foreign_keys=[agent_id], back_populates="prompt_versions")


class AgentSession(Base):
    """Real DB-backed record of which agents are currently 'active' --
    previously this was tracked *only* in the frontend's sessionStorage,
    with no server-side source of truth at all. One row per activation;
    `deactivated_at` is null while active, set on explicit deactivate or
    when the same user switches to a different agent. "Active" here still
    just means "a user selected this agent in the UI" -- it is not tied to
    whether a live call/websocket is actually open."""
    __tablename__ = "agent_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    agent_id = Column(Integer, ForeignKey("custom_voice_agents.id"), nullable=False)
    user_username = Column(String, ForeignKey("users.username"), nullable=False)
    activated_at = Column(DateTime(timezone=True), server_default=func.now())
    deactivated_at = Column(DateTime(timezone=True), nullable=True)


class CallHistory(Base):
    """This table existed but nothing ever wrote to it -- the model was
    defined, migrated, and then never referenced from a single INSERT
    anywhere in main.py. Now written once per call, in the websocket
    handler's `finally` block, right where the latency summary was already
    being computed and printed to the console and nowhere else."""
    __tablename__ = "call_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String)
    agent_name = Column(String)
    username = Column(String)
    summary = Column(String)

    duration = Column(Integer)

    agent_id = Column(Integer, ForeignKey("custom_voice_agents.id"), nullable=True)
    agents = relationship("VoiceAgent", foreign_keys=[agent_id], back_populates="history")

    # Full transcript -- a list of {"role": "user"|"assistant", "text": ...,
    # "ts": <iso timestamp>} dicts, in order.
    messages = Column(JSON)

    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    language = Column(String, nullable=True)
    tool_call_count = Column(Integer, nullable=True)
    disconnect_reason = Column(String, nullable=True)
    # The same per-metric {n, min, max, avg} breakdown already printed as
    # "=== Latency Summary ===" on every call (ASR/LLM/TTS/E2E/TTFT) --
    # persisted here instead of only ever existing in server console logs.
    latency_summary = Column(JSON, nullable=True)
    # One entry per turn: {turn, req_id, asr_ms, llm_ttft_ms, llm_total_ms,
    # tts_ttfb_ms, e2e_ms, tool_calls} -- latency_summary only ever
    # aggregates a whole call into one min/max/avg, with no way to see how
    # latency moved turn over turn (issue #27). Some fields are None where
    # that turn's path didn't measure them (e.g. asr_ms for a cloud ASR
    # provider, tts_ttfb_ms for a non-Gemini TTS engine).
    latency_per_turn = Column(JSON, nullable=True)
    # {prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd}
    # (issue #31) -- summed from Gemini's real usage_metadata per turn
    # (LLM/gemini.py's generate()), never estimated from text length.
    # estimated_cost_usd is None if the model isn't in LLM/pricing.py's
    # verified rate table. Null (not zero) when nothing in the call
    # reported usage at all (e.g. an Ollama-only call).
    token_usage = Column(JSON, nullable=True)
    # "{agent_id}/{call_uuid}" -- relative to RECORDINGS_DIR (issue #29),
    # not an absolute path, so moving the volume mount never breaks old
    # rows. See src/recordings.py. None if the call never captured any
    # audio at all (e.g. it errored before either side produced any).
    recording_path = Column(String, nullable=True)
    # Evaluation mode (issue #69-72) -- one entry per user turn:
    # {"turn_id", "results": [{"provider", "model", "text", "latency_ms",
    # "is_primary"}, ...]}. Was live-only (WS message, never persisted)
    # until now -- this is what lets a historical/cross-call chart exist
    # later instead of only the current-session-only one on AgentDetails.
    # Null for every call made with evaluation mode off.
    asr_eval_results = Column(JSON, nullable=True)


################## PROVIDER/MODEL CATALOG (ASR/LLM/TTS pickers) ########################
# Backs the option lists rendered in ASRSection/LLMSection/TTSSection on the frontend --
# previously hardcoded there, now DB-driven via GET /api/catalog.

class CatalogProvider(Base):
    __tablename__ = "catalog_providers"
    __table_args__ = (UniqueConstraint("stage", "name", name="uq_catalog_provider_stage_name"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    stage = Column(String, nullable=False)  # 'asr' | 'llm' | 'tts'
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)

    models = relationship("CatalogModel", back_populates="provider", cascade="all, delete-orphan")
    languages = relationship("CatalogLanguage", back_populates="provider", cascade="all, delete-orphan")
    voices = relationship("CatalogVoice", back_populates="provider", cascade="all, delete-orphan")


class CatalogModel(Base):
    __tablename__ = "catalog_models"
    __table_args__ = (UniqueConstraint("provider_id", "value", name="uq_catalog_model_provider_value"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    provider_id = Column(Integer, ForeignKey("catalog_providers.id"), nullable=False)
    value = Column(String, nullable=False)   # sent to backend/model as-is
    label = Column(String, nullable=False)   # shown in the UI (usually == value)
    sort_order = Column(Integer, default=0)

    provider = relationship("CatalogProvider", back_populates="models")
    voices = relationship("CatalogVoice", back_populates="model", cascade="all, delete-orphan")


class CatalogLanguage(Base):
    __tablename__ = "catalog_languages"
    __table_args__ = (UniqueConstraint("provider_id", "name", name="uq_catalog_language_provider_name"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    provider_id = Column(Integer, ForeignKey("catalog_providers.id"), nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)

    provider = relationship("CatalogProvider", back_populates="languages")


class CatalogVoice(Base):
    __tablename__ = "catalog_voices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Exactly one of these is set: most providers scope voices to themselves,
    # Sarvam scopes voices to the selected model (Bulbul:v2 vs v3 differ).
    provider_id = Column(Integer, ForeignKey("catalog_providers.id"), nullable=True)
    model_id = Column(Integer, ForeignKey("catalog_models.id"), nullable=True)
    name = Column(String, nullable=False)
    gender = Column(String)
    sort_order = Column(Integer, default=0)

    provider = relationship("CatalogProvider", back_populates="voices")
    model = relationship("CatalogModel", back_populates="voices")


class CatalogPrompt(Base):
    __tablename__ = "catalog_prompts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)  # "Healthcare", "Customer Care", "Sales"
    prompt_text = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)


class TTSVoiceReference(Base):
    """A reference clip + transcript for zero-shot voice-cloning TTS models
    (currently DhVaani). Uploaded by a user rather than a fixed preset --
    speaker_audio on TTSProvider stores this row's `name` for those models."""
    __tablename__ = "tts_voice_references"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    audio_path = Column(String, nullable=False)  # relative path under the voice-references volume
    transcript = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())