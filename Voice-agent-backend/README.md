# Voice agent backend

Streaming speech-to-speech pipeline and API for the Vaani Voice Agent
platform. See the [root README](../README.md) for setup.

## Services (`docker-compose.yaml`)

| Service | Port | What it does |
|---|---|---|
| `orchestrator` | 8000 | FastAPI app: agent CRUD, auth (Firebase session cookie), and the per-call WebSocket voice pipeline. |
| `mcp-server` | internal | FastMCP server with the agents' tools: per-agent RAG over ChromaDB (`ingest_*`, `rag_retrieve`, `list_sources`, `delete_source`) and `get_mandi_prices` (data.gov.in). |
| `sravaani` | internal | Whole-utterance [SraVaani-1.0](https://huggingface.co/ARTPARK-IISc/SraVaani-1.0) ASR, called by the orchestrator over HTTP. |

`dhvaani` (DhVaani voice-cloning TTS) and `ollama` are defined but disabled;
the orchestrator can also reach them on separate hosts via
`DHVAANI_API_BASE` / `OLLAMA_API_BASE`.

## Pipeline

Each call is one WebSocket (`/orchestrate/configurable/agent/{agent_id}`)
carrying raw PCM both ways:

1. **VAD** — Silero, on 16 kHz float32 mono input, cuts the stream into utterances.
2. **ASR** — SraVaani (local) or Sarvam (streaming, cloud).
3. **LLM** — Gemini/Gemma (Google), Gemini Live, or Ollama, streamed and split into sentences; tool calls go to the MCP server.
4. **TTS** — Kokoro (local), Gemini TTS, Sarvam, or DhVaani, streamed back as 24 kHz float32 mono.

Provider, model, voice and prompt are per-agent settings. Cloud providers run
on the agent owner's own API keys (Settings page); the server has none.

An optional evaluation mode (`?eval_mode=1`) also sends each utterance to the
other cloud ASR providers the user has keys for, for side-by-side comparison.

## Development

```bash
cd Orchestrator
python3.11 -m venv venv_main && source venv_main/bin/activate
pip install -r orchestrator_requirements.txt

alembic upgrade head
python -m scripts.seed_catalog   # provider/model/voice/prompt catalog for the UI
pytest                           # needs Postgres at TEST_DATABASE_URL

cd .. && ruff check .
```
