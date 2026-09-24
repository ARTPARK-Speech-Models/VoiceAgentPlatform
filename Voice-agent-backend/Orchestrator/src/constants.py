import os

ASR_SAMPLE_RATE = 16000
DECODE_THRESHOLD = 8_000
SILENCE_GATE_MS = 500

RAG_MCP_URL=os.getenv("RAG_MCP_URL", "http://mcp-server:8002/mcp")
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

VOICE_REFERENCE_DIR = os.getenv("VOICE_REFERENCE_DIR", "/app/data/voice_references")
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}
# DhVaani's model card asks for 3-10s of reference audio -- 15MB is generous
# headroom for that at any reasonable bitrate, not a real usage limit.
MAX_VOICE_REFERENCE_BYTES = 15 * 1024 * 1024

# Require a Firebase App Check (reCAPTCHA v3) token on login. Off by
# default: turn on only once the frontend is built with
# VITE_RECAPTCHA_SITE_KEY, or every sign-in is refused.
APP_CHECK_ENFORCE = os.getenv("APP_CHECK_ENFORCE", "false").lower() in ("1", "true", "yes")



GREETING = "Hello! I'm Vaani. How can I help you today?"

TOOL_CALL_START_MESSAGE = "Please hold while I look it up for you."
TOOL_CALL_END_MESSAGE = "Thank you for your patience."
LLM_ERROR_MESSAGE = "Sorry, I'm having trouble responding right now. Please try again."


SUMMARY_PROMPT = ("""You generate a summary of a completed conversation between a person and an AI assistant.

Look only at the person's own messages — not tool outputs, retrieved documents, or system content — and detect which language the person used the most in their own words. Write the summary in that language first, using natural first and second person as a person would speak in that language — for example "you asked" and "I told you" in English, or the equivalent natural phrasing in Hindi, Malayalam, Tamil, etc. Write it in that language's native script, not transliterated into English letters. Never use the words "user" or "model" or "assistant" — refer to the two people as "you" and "I" (or the natural equivalent in that language).

After the summary in the person's main language, add a second summary in English with the same content, written the same way, using "you" and "I". If the person's main language was already English, second summary is not required.

Keep each summary brief: 3 to 5 sentences, covering what was asked and what was resolved or advised, including any specific details, names, numbers, or next steps mentioned. Do not add headers, labels, or markdown — just the summary text in the main language, followed by a blank line, then the English version.
""")