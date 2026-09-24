FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV DATABASE_URL=""
ENV FIREBASE_SERVICE_ACCOUNT_JSON=""

WORKDIR /app

# ffmpeg needed only if this container decodes WebM/Opus → PCM
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY orchestrator_requirements.txt .
RUN pip install --no-cache-dir -r orchestrator_requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]