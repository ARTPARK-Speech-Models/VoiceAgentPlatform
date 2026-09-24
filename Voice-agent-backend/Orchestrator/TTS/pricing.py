"""Per-model token pricing for Gemini TTS cost tracking, same rationale
and verification standard as LLM/pricing.py. USD per million tokens,
fetched live from https://ai.google.dev/gemini-api/docs/pricing on
2026-09-21.

Only gemini-3.1-flash-tts-preview is listed -- the only TTS model this
codebase actually calls (TTS/gemini.py's default and only model id).
Kokoro and DhVaani are self-hosted (genuinely zero marginal cost, not
estimated as $0). Sarvam TTS is a real paid API but isn't in the
create-agent catalog's ENABLED_CATALOG_PROVIDERS (crud.py) -- no agent
can actually select it right now, and its pricing is INR-denominated
(https://docs.sarvam.ai/api/getting-started/pricing.md), which would need
a currency conversion to combine with this file's USD figures. Left out
rather than guessing an exchange rate; add it for real once Sarvam TTS is
actually enabled and a proper INR handling decision is made.

Deliberately no entry for any other model -- same "an absent number beats
a fabricated one" rule as LLM/pricing.py and the ASR confidence score
that was never computed (issue #30)."""

# model_id -> (input $ / 1M text tokens, output $ / 1M audio tokens)
PRICE_PER_MILLION_TOKENS_USD = {
    "gemini-3.1-flash-tts-preview": (1.00, 20.00),
}


def estimate_cost_usd(model_id: str, prompt_tokens: int, output_tokens: int) -> float | None:
    """None if this model isn't in the table -- never guess a price."""
    rates = PRICE_PER_MILLION_TOKENS_USD.get(model_id)
    if rates is None:
        return None
    input_rate, output_rate = rates
    return round((prompt_tokens * input_rate + output_tokens * output_rate) / 1_000_000, 6)
