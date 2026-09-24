from datetime import datetime

from pydantic import BaseModel

# =======================================================================================
#                                       AUTHENTICATION
# =======================================================================================

# Google Sign-In collapses register/login into one action -- a returning
# user's ID token finds their existing local row, a new user's creates
# one (with an auto-generated username, see utils.generate_unique_username)
# -- so there's a single request shape for both, not separate ones.
class GoogleSessionRequest(BaseModel):
    id_token: str


# =======================================================================================
#                                       CREATE AGENT
# =======================================================================================

class ASRProviderParams(BaseModel):
    model: str
    provider: str
    keywords: list | None = []
    end_of_turn_confidence: float
    end_of_turn_timeout: float
    min_speech_duration: float

class LLMProviderParams(BaseModel):
    model: str
    provider: str
    prompt: str
    temperature: float
    max_tokens: int
    mcp_url: str | None = None

class TTSProviderParams(BaseModel):
    model: str
    provider: str
    language: str
    speed: float
    speaker_audio: str

class CreateAgentRequest(BaseModel):
    name: str
    
    asr: ASRProviderParams
    llm: LLMProviderParams
    tts: TTSProviderParams

    api_keys: dict | None = None

    greeting_message: str
    end_call_message: str

    response_audio_delay: float

class CreateAgentRequestWrapper(BaseModel):
    body: CreateAgentRequest

# =======================================================================================
#                                       UPDATE AGENT
# =======================================================================================
# Each section optional -- the agent detail page's per-card edit/save only
# ever sends the one section (asr/llm/tts) the user just edited, not the
# whole agent.

class UpdateAgentRequest(BaseModel):
    asr: ASRProviderParams | None = None
    llm: LLMProviderParams | None = None
    tts: TTSProviderParams | None = None

class UpdateAgentRequestWrapper(BaseModel):
    body: UpdateAgentRequest

# =======================================================================================
#                                       CATALOG / SETTINGS
# =======================================================================================

# Onboard a model into the provider/model catalog (Models page). stage is
# "asr" | "llm" | "tts"; provider must be one GET /api/catalog serves.
class AddCatalogModelRequest(BaseModel):
    stage: str
    provider: str
    value: str
    label: str | None = None


# Save (create or replace) one of the user's provider API keys (Settings).
class SaveApiKeyRequest(BaseModel):
    provider: str
    api_key: str


# =======================================================================================
#                                       CALL HISTORY
# =======================================================================================

# Thumbs up/down on one ASR eval-mode model's output for one turn
# (identified by turn_id + provider within CallHistory.asr_eval_results).
# feedback: "up" | "down" | None (None clears any existing vote).
class AsrEvalFeedbackRequest(BaseModel):
    turn_id: str
    provider: str
    feedback: str | None = None


# List agent Response
class AgentResponse(BaseModel):
    id: int
    name: str
    asr_provider_name: str
    llm_provider_name: str
    tts_provider_name: str
    created_at: datetime

    class Config:
        from_attributes = True # Allows Pydantic to read SQLAlchemy model attributes