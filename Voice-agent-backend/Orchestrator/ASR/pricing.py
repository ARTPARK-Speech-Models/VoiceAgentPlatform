"""Per-audio-minute pricing for the cloud ASR providers in main.py's
EVAL_ASR_MODELS, used for per-call cost estimates. Fetched live from
each provider's official pricing page on 2026-09-24:

  - OpenAI gpt-4o-transcribe: "$0.006 / minute"
    (developers.openai.com/api/docs/pricing)
  - Gemini 3.5-flash-lite / 3.7-flash: audio input $0.30 / $0.75 per 1M
    tokens (ai.google.dev/gemini-api/docs/pricing), at Gemini's documented
    32 audio tokens/sec = 1,920 tokens/min. Transcript output tokens are
    not included (small next to the audio input).
  - Muse muse-voice-transcribe-1.0: "$0.18 per hour"
    (dev.meta.ai/docs/pricing-rate-limits)
  - Sarvam saaras:v4: "₹30" per hour (docs.sarvam.ai pricing), converted
    at INR_PER_USD below. That rate is deliberately on the low side so the
    USD figure errs high -- overcounting is the safe direction for a
    cost estimate.

Local SraVaani ("Vaani") is self-hosted: genuinely $0, not an estimate.
"""

import os

INR_PER_USD = float(os.getenv("INR_PER_USD", "80"))

USD_PER_AUDIO_MINUTE = {
    "Vaani": 0.0,
    "Google": 0.30 * 1920 / 1_000_000,
    "Google-Latest": 0.75 * 1920 / 1_000_000,
    "OpenAI": 0.006,
    "Sarvam": 30 / 60 / INR_PER_USD,
    "Muse": 0.18 / 60,
}


def estimate_cost_usd(provider: str, audio_seconds: float) -> float | None:
    """None if this provider isn't in the table -- never guess a price."""
    rate = USD_PER_AUDIO_MINUTE.get(provider)
    if rate is None:
        return None
    return round(rate * audio_seconds / 60, 6)
