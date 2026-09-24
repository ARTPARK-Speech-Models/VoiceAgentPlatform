FROM python:3.11-slim

WORKDIR /app

ENV HF_TOKEN=""

# Install system deps needed by pypdf / sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY mcp_requirements.txt .

# 1. Force-install the lightweight CPU-only version of PyTorch first
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 2. Install the rest of your requirements
RUN pip install --no-cache-dir -r mcp_requirements.txt

COPY . .

# ChromaDB persistent storage — mount a volume here in production
RUN mkdir -p /app/chroma_data

# Set environment variable to force Hugging Face / PyTorch to use CPU
ENV CUDA_VISIBLE_DEVICES=-1

# This will now download the CPU version of the model layers safely
RUN python -c "from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction; SentenceTransformerEmbeddingFunction(model_name='all-MiniLM-L6-v2')"

EXPOSE 8002

CMD ["python", "server.py"]