from pathlib import Path

DATA_DIR = Path("./chroma_data")
 
COLLECTION_NAME = "documents"
 
# Chunking parameters
CHUNK_SIZE = 1000  # characters
CHUNK_OVERLAP = 150
DEFAULT_AGENT_ID = "default"