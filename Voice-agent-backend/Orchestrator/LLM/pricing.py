"""Per-model token pricing for the cost estimate in the token/cost counter
(issue #31). USD per million tokens, fetched live from
https://ai.google.dev/gemini-api/docs/pricing on 2026-09-17 -- standard
paid-tier rates, not the free tier (a user's key may be on either; the
estimate errs high). Gemma models are confirmed free of charge on Google's own
API (see the comment in scripts/seed_catalog.py); Ollama models are
self-hosted, genuinely zero marginal cost, not just "free tier."

Deliberately no entry (rather than a guessed one) for any model not
verified against a real pricing source -- an estimate is only shown for
models actually listed here; unlisted models get token counts with no
dollar figure attached, same principle as not fabricating an ASR
confidence score that was never computed (issue #30)."""

# model_id -> (input $ / 1M tokens, output $ / 1M tokens)
PRICE_PER_MILLION_TOKENS_USD = {
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.7-flash": (0.75, 3.75),
    "gemma-4-26b-a4b-it": (0.0, 0.0),
    "gemma-4-31b-it": (0.0, 0.0),
    "gemma3:4b": (0.0, 0.0),
    "gemma4:e4b": (0.0, 0.0),
}


def estimate_cost_usd(model_id: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    """None if this model isn't in the table -- never guess a price."""
    rates = PRICE_PER_MILLION_TOKENS_USD.get(model_id)
    if rates is None:
        return None
    input_rate, output_rate = rates
    return round((prompt_tokens * input_rate + completion_tokens * output_rate) / 1_000_000, 6)
