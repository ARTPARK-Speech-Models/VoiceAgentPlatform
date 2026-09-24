# Vaani Voice Agent

Real-time speech-to-speech AI agent platform from ARTPARK/LDAI — a streaming
voice pipeline (VAD → ASR → LLM with tool calling → TTS) plus a
web UI for creating, configuring and talking to agents.

## Structure

| Directory | What it is |
|---|---|
| [`Voice-agent-backend/`](Voice-agent-backend) | FastAPI `Orchestrator` (streaming voice pipeline over WebSocket, agent CRUD, auth) + `MCP` tool/RAG server, run with Docker Compose. |
| [`Voice-agent-frontend/AudioML-Service/agent-interface/`](Voice-agent-frontend/AudioML-Service/agent-interface) | React + Vite web UI. |

## Bring your own keys

The server holds no LLM/ASR/TTS provider keys. Each user adds their own
(Google, Sarvam, OpenAI, ...) on the **Settings** page; an agent whose
provider has no key refuses to start and says which key to add. Local models
(SraVaani ASR, Kokoro TTS) need no key.

## Prerequisites

- Docker + Docker Compose, and a Postgres database
- A Firebase project with Google Sign-In enabled (web app config for the
  frontend, a service-account key for the backend)
- A Hugging Face token with access to the gated
  [`ARTPARK-IISc/SraVaani-1.0`](https://huggingface.co/ARTPARK-IISc/SraVaani-1.0) model

## Quick start

**Backend**

```bash
cd Voice-agent-backend
cp .env.example .env          # fill in DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON, HF_TOKEN, SRAVAANI_API_KEY
docker compose up -d --build
docker compose exec orchestrator alembic upgrade head
docker compose exec orchestrator python -m scripts.seed_catalog   # provider/model/voice pickers for the UI
```

**Frontend**

```bash
cd Voice-agent-frontend/AudioML-Service/agent-interface
cp .env.example .env          # VITE_API_BASE_URL + Firebase web config
npm install
npm run dev                   # http://localhost:5173
```

## Development

```bash
cd Voice-agent-backend/Orchestrator
python3.11 -m venv venv_main && source venv_main/bin/activate
pip install -r orchestrator_requirements.txt

alembic upgrade head   # apply DB migrations
pytest                 # needs a Postgres at TEST_DATABASE_URL (see tests/conftest.py)

cd ..
ruff check .           # lint (config in Voice-agent-backend/pyproject.toml)

cd ../Voice-agent-frontend/AudioML-Service/agent-interface
npm run lint
```

Audio is raw PCM throughout: 16 kHz float32 mono into VAD/ASR, 24 kHz float32
mono out of TTS.
