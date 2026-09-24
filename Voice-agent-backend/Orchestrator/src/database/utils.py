import re

from sqlalchemy.orm import Session
from src.database.models import User, UserAPIKey, VoiceAgent

# =======================================================================================
#                                       AUTHENTICATION
# =======================================================================================
# Password storage/verification and JWT signing used to live here (bcrypt +
# a single shared JWT_KEY) -- both are gone now that Firebase Auth owns
# credentials entirely; the backend only ever verifies a Firebase-issued
# session cookie or ID token (src/database/auth.py, src/database/ws_auth.py)
# and looks up the local User row by firebase_uid/email below. Cloudflare
# Turnstile verification (verify_turnstile_token) is also gone -- replaced
# by Firebase App Check (src/database/auth.py's verify_app_check).

def check_if_user_exist(db: Session, username: str):
    return db.query(User).filter(User.username == username).count() > 0

def get_user_by_firebase_uid(db: Session, firebase_uid: str) -> User | None:
    return db.query(User).filter(User.firebase_uid == firebase_uid).first()

BANNED_MESSAGE = "This account has been suspended."


def is_banned(user: User | None) -> bool:
    return bool(user and user.ban_status and user.ban_status.strip())

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()

def generate_unique_username(db: Session, base: str) -> str:
    """Google Sign-In has no separate username field to collect, but
    VoiceAgent.user_username still needs one -- derived from the Google
    account's email local-part (or displayName as a fallback), sanitized
    down to VoiceAgent's FK-safe charset, and deduped with a numeric
    suffix against any existing collision."""
    slug = re.sub(r"[^a-zA-Z0-9_]", "", base.split("@")[0]).lower() or "user"
    candidate = slug
    suffix = 1
    while check_if_user_exist(db, username=candidate):
        suffix += 1
        candidate = f"{slug}{suffix}"
    return candidate




# =======================================================================================
#                                       FETCH AGENTS
# =======================================================================================

def check_if_agent_name_exists(db:Session, name: str, username: str):
    return db.query(VoiceAgent).filter(
        VoiceAgent.name == name,
        VoiceAgent.user_username == username
        ).count() > 0



# Agent provider label -> the Settings provider whose key it runs on. The
# Gemini-backed LLM labels ("Vaani" is Gemma via the Gemini API) all share
# the user's Google key.
_SETTINGS_KEY_PROVIDER = {"Vaani": "Google", "Google-Live": "Google"}


def settings_key_provider(provider: str | None) -> str | None:
    return _SETTINGS_KEY_PROVIDER.get(provider, provider)


def get_user_api_keys(db: Session, username: str) -> dict:
    """{Settings provider name: key} for everything this user has saved."""
    return {
        k.provider: k.api_key
        for k in db.query(UserAPIKey).filter(UserAPIKey.user_username == username).all()
    }


def agent_info_orchestrator(db: Session, agent_id: int):
    
    try:
        agent: VoiceAgent = db.query(VoiceAgent).filter(
            VoiceAgent.id == agent_id
        ).first()

        if not agent:
            return None

        asr = agent.asr
        llm = agent.llm
        tts = agent.tts

        # Key precedence: the agent's own key (set at creation) -> the
        # owner's key from Settings for that provider -> None, which the
        # orchestrator rejects with a "add a key in Settings" error. There
        # is no platform-wide fallback key.
        user_keys = get_user_api_keys(db, agent.user_username)
        llm_api_key = (llm.api_key if llm else None) or (user_keys.get(settings_key_provider(llm.provider)) if llm else None)
        tts_api_key = (tts.api_key if tts else None) or (user_keys.get(settings_key_provider(tts.provider)) if tts else None)

        return {
            "name": agent.name,
            "speech_threshold": asr.end_of_turn_confidence if asr else None,
            "min_silence": asr.end_of_turn_timeout if asr else None,
            "min_speech_duration": asr.min_speech_duration if asr else None,
            "mcp_url": llm.mcp_url if llm else None,
            "asr": {
                "model": asr.model if asr else None,
                "provider": asr.provider if asr else None,
                "keywords": asr.keywords if asr else None,
            },
            "tts": {
                "model": tts.model if asr else None,
                "provider": tts.provider if asr else None,
                "language": tts.language if asr else None,
                "speed": tts.speed if asr else 1,
                "speaker": tts.speaker_audio if asr else None,
                "api_key": tts_api_key
            },
            "llm": {
                "model": llm.model if llm else None,
                "provider": llm.provider if llm else None,
                "prompt": llm.prompt if llm else None,
                "temperature": llm.temperature if llm else None,
                "max_tokens": llm.max_tokens if llm else None,
                "api_key": llm_api_key
            },
            "api_keys": user_keys,
            "greeting_message": agent.greeting_message,
            "end_call_message": agent.end_call_message,
            "response_audio_delay": agent.respose_audio_delay
        }
    
    except Exception as e:
        print("error:", str(e))
        return None
    



################## ACTIVE AGENT CONFIGURATION ########################
agent_config_cache: dict[int, dict] = {}


def invalidate_agent_config(agent_id: int, force = False):
    if not agent_id:
        return
    if len(agent_config_cache) > 5 or force:
        agent_config_cache.pop(agent_id, None)

######################################################################