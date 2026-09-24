import json
import logging
import os
import re
import subprocess
from pathlib import Path

import chromadb
import requests
from chromadb.utils import embedding_functions
from constants import COLLECTION_NAME, DATA_DIR, DEFAULT_AGENT_ID
from mcp.server.fastmcp import FastMCP
from utils import (
    chunk_text,
    extract_text_from_url,
    fetch_mandi_data,
    load_file,
    make_chunk_id,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-mcp")

embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
 
chroma_client = chromadb.PersistentClient(path=str(DATA_DIR))
 
_collections: dict[str, "chromadb.Collection"] = {} 
 
def get_collection(agent_id: str):
    agent_id = (agent_id or DEFAULT_AGENT_ID).lower()
    if agent_id not in _collections:
        # Collection names must be safe identifiers; sanitize lightly.
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", agent_id)[:63]
        _collections[agent_id] = chroma_client.get_or_create_collection(
            name=f"{COLLECTION_NAME}__{safe_id}",
            embedding_function=embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )
    return _collections[agent_id]


mcp = FastMCP("mcp-server", host="0.0.0.0", port=8002)


# --------------------------------------------------------------------------
# Core ingest logic (shared by tools)
# --------------------------------------------------------------------------
 
 
def _ingest(text: str, source: str, doc_type: str, agent_id:str, extra_metadata: dict | None = None) -> dict:
    logger.info("[MCP DEBUG] _ingest started: source=%s doc_type=%s agent_id=%s text_length=%s", source, doc_type, agent_id, len(text))
    chunks = chunk_text(text)
    collection = get_collection(agent_id)
    logger.info("[MCP DEBUG] Chunking complete: source=%s chunks=%s", source, len(chunks))
    if not chunks:
        logger.warning("[MCP DEBUG] No chunks generated for source=%s", source)
        return {"source": source, "chunks_added": 0, "message": "No extractable text found."}
 
    ids, documents, metadatas = [], [], []
    base_meta = {"source": source, "type": doc_type}
    if extra_metadata:
        base_meta.update(extra_metadata)
 
    for i, chunk in enumerate(chunks):
        ids.append(make_chunk_id(source, i))
        documents.append(chunk)
        metadatas.append({**base_meta, "chunk_index": i})
 
    # Remove any pre-existing chunks for this exact source so re-ingesting
    # the same doc doesn't create duplicates.
    try:
        collection.delete(where={"source": source})
    except Exception:
        pass
 
    collection.add(ids=ids, documents=documents, metadatas=metadatas)
    logger.info("[MCP DEBUG] Ingestion finished: source=%s chunks_added=%s", source, len(chunks))
 
    return {
        "source": source,
        "chunks_added": len(chunks),
        "message": f"Ingested {len(chunks)} chunks from {source}.",
    }


@mcp.tool()
def ingest_text(text: str, source_name: str, agent_id: str = DEFAULT_AGENT_ID):
    return _ingest(text, source_name, doc_type="text", agent_id=agent_id)


@mcp.tool()
def ingest_file_content(filename: str, content_base64: str, agent_id: str = DEFAULT_AGENT_ID) -> dict:
    import base64
    import tempfile
 
    suffix = Path(filename).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt", ".md", ".markdown"):
        return {"error": f"Unsupported file type: {suffix}"}
 
    try:
        raw_bytes = base64.b64decode(content_base64)
    except Exception as e:
        return {"error": f"Invalid base64 content: {e}"}
 
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = Path(tmp.name)
 
    try:
        text = load_file(tmp_path)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.exception("Failed to extract text from uploaded file")
        return {"error": f"Failed to read file: {e}"}
    finally:
        tmp_path.unlink(missing_ok=True)
 
    # Use the original filename as the source identifier (not the temp path)
    # so re-uploads of the same file correctly replace prior chunks.
    return _ingest(text, source=filename, doc_type=suffix.lstrip("."), agent_id=agent_id)



@mcp.tool()
def ingest_url(url: str, agent_id: str = DEFAULT_AGENT_ID) -> dict:
    logger.info("[MCP DEBUG] ingest_url called: url=%s agent_id=%s", url, agent_id)
    try:
        text = extract_text_from_url(url)
        logger.info("[MCP DEBUG] extract_text_from_url returned text length=%s", len(text))
    except Exception as e:
        logger.exception("Failed to fetch/parse URL")
        return {"error": f"Failed to fetch URL: {e}"}
 
    result = _ingest(text, source=url, doc_type="url", agent_id=agent_id)
    logger.info("[MCP DEBUG] ingest_url result: %s", result)
    return result



# --------------------------------------------------------------------------
# RETREIVAL TOOL
# --------------------------------------------------------------------------

@mcp.tool()
def rag_retrieve(query: str, agent_id: str = DEFAULT_AGENT_ID, top_k: int = 5, source_filter: str | None = None) -> dict:
    """
    Search the knowledge base for information relevant to a query.

    Call this tool whenever a question touches on anything that could be
    covered by stored documents — specific facts, figures, names, dates,
    procedures, eligibility rules, guidelines, or any other detail you are
    not fully certain about. This applies whether or not the user's wording
    sounds like a "search" request; a plain factual or how-to question is
    just as valid a reason to check the knowledge base as an explicit
    "look this up" request.

    Default to calling this tool rather than answering from your own training
    knowledge whenever there is any realistic chance the knowledge base holds
    more current, more specific, or more authoritative information than what
    you already know. Your training data can be outdated, incomplete, or
    generic where the knowledge base is current, detailed, and specific to
    this deployment — treat the knowledge base as the more trustworthy source
    whenever the two might conflict or you are unsure which applies.

    Do not skip this tool just because you feel confident you already know
    the answer. Confidence is not the same as being current or being correct
    for this specific context. If you are able to call this tool and the
    answer might be in the knowledge base, call it before responding.

    Only skip this tool for questions that are clearly general knowledge,
    conversational, or unrelated to anything the knowledge base would cover
    (e.g. greetings, small talk, or basic concepts with no dependency on
    specific stored facts).

    Args:
        query: The search query text.
        agent_id: Identifier of the agent whose knowledge base to search.
        top_k: Number of top results to return.
        source_filter: Optional source name to restrict results to.
    """
    collection = get_collection(agent_id.lower())
    where = {"source": source_filter} if source_filter else None
 
    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where,
    )
 
    hits = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]
 
    for doc, meta, dist in zip(docs, metas, dists, strict=False):
        hits.append(
            {
                "text": doc,
                "source": meta.get("source"),
                "chunk_index": meta.get("chunk_index"),
                "type": meta.get("type"),
                "relevance_score": round(1 - dist, 4),  # cosine similarity
            }
        )
 
    return {"query": query, "agent_id": agent_id, "results": hits, "count": len(hits)}
  
@mcp.tool()
def list_sources(agent_id: str = DEFAULT_AGENT_ID) -> dict:
    """
    List all distinct document sources currently stored in a specific
    agent's RAG knowledge base, with their chunk counts.
 
    Args:
        agent_id: Identifier of the agent whose knowledge base to inspect.
    """
    collection = get_collection(agent_id.lower())
    all_items = collection.get(include=["metadatas"])
    counts: dict[str, dict] = {}
    for meta in all_items["metadatas"]:
        src = meta.get("source", "unknown")
        if src not in counts:
            counts[src] = {"type": meta.get("type"), "chunks": 0}
        counts[src]["chunks"] += 1
 
    return {"agent_id": agent_id, "sources": counts, "total_sources": len(counts)}


@mcp.tool()
def delete_source(source: str, agent_id: str = DEFAULT_AGENT_ID) -> dict:
    """
    Delete all chunks belonging to a given source (file path, URL, or
    source_name) from a specific agent's RAG knowledge base.
 
    Args:
        source: The exact source identifier to remove (as shown by list_sources).
        agent_id: Identifier of the agent whose knowledge base this belongs to.
    """
    collection = get_collection(agent_id)
    collection.delete(where={"source": source})
    return {"message": f"Deleted all chunks for source: {source} (agent_id={agent_id})"}

@mcp.tool()
def list_collections() -> list[str]:
    """
    List all agent IDs that currently have a RAG knowledge base collection
    stored in this MCP server.
    """
    # Query the persistent Chroma store directly rather than the in-memory
    # _collections cache — that cache is only populated lazily per-process
    # when get_collection() is called, so it can be empty or incomplete
    # right after a restart or when multiple worker processes are running,
    # even though the actual collections exist on disk.
    prefix = f"{COLLECTION_NAME}__"
    all_collections = chroma_client.list_collections()

    agent_ids = []
    for coll in all_collections:
        name = coll.name if hasattr(coll, "name") else coll  # chromadb version differences
        if name.startswith(prefix):
            agent_ids.append(name[len(prefix):])

    logger.info("list_collections found on disk: %s", agent_ids)
    return agent_ids

@mcp.tool()
def delete_collection(agent_id: str) -> dict:
    """
    Delete an entire agent's RAG knowledge base collection from this MCP server.
    Use with caution — this is irreversible and will remove all stored chunks
    for that agent.

    Args:
        agent_id: Identifier of the agent whose collection to delete.
    """
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", agent_id)[:63]
    collection_name = f"{COLLECTION_NAME}__{safe_id}"

    try:
        chroma_client.delete_collection(name=collection_name)
    except Exception as e:
        # Most chromadb versions raise if the collection doesn't exist
        return {"error": f"Could not delete collection for agent_id={agent_id}: {e}"}

    # Remove from the in-memory cache too, so a future get_collection() call
    # creates a genuinely fresh collection rather than reusing a stale reference.
    _collections.pop(agent_id, None)

    return {"message": f"Deleted entire collection for agent_id={agent_id}"}




RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
BASE_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"
# Operator-supplied (free key from data.gov.in) -- no built-in default.
# Without it, get_mandi_prices returns an error instead of calling the API.
API_KEY = os.environ.get("DATA_GOV_IN_API_KEY", "")

# Confirmed field schema for this resource (data.gov.in dataset:
# "Current Daily Price of Various Commodities from Various Markets (Mandi)"):
#   state, district, market, commodity, variety, grade  -> keyword (exact match) fields
#   arrival_date                                         -> date
#   min_price, max_price, modal_price                    -> double (rupees per quintal)

@mcp.tool()
def get_mandi_prices(
    commodity: str,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
    variety: str | None = None,
    grade: str | None = None,
    limit: int = 10,
) -> dict:
    """
    Get current daily wholesale mandi (market) prices for an agricultural commodity
    anywhere in India, sourced from the government's official Agmarknet price
    reporting network via the data.gov.in open data platform.

    USE THIS TOOL WHEN a farmer or user asks about:
    - "What is the price of [crop] today / in my area / in [market/district/state]?"
    - "Where can I sell [crop] for a better price?"
    - "Should I sell my [crop] now or wait?" (fetch current price as one input to that decision)
    - "What's the rate for [crop] in [mandi name]?"
    - Comparing prices of the same commodity across different markets or states

    DO NOT use this tool for: retail/consumer prices (this is wholesale mandi data),
    futures or forward prices, international commodity prices, or prices for
    non-agricultural goods. It also will not have real-time intraday prices —
    data is updated on a daily basis, reflecting the most recent trading day's
    arrivals at each mandi.

    PARAMETER NORMALIZATION (required before calling):
    This dataset only matches exact English names with the first letter of
    each word capitalized (e.g. "Tomato", "Onion", "Maharashtra", "Andhra
    Pradesh"). Before calling this tool:
    - Translate any non-English input (Hindi, Tamil, Telugu, or any other
      language the user spoke in) to its standard English name.
    - Convert regional or colloquial crop names to the standard English
      commodity name used by Agmarknet (e.g. "Tamatar" or "Thakkali" should
      become "Tomato", not be passed through as-is).
    - Capitalize the first letter of every word in commodity, state, district,
      market, and variety (e.g. "banana" -> "Banana", "andhra pradesh" ->
      "Andhra Pradesh"). Never pass lowercase, all-caps, or non-English values.
    - If unsure of the exact standard spelling for a crop or place name, make
      your best normalized guess rather than passing raw user input verbatim —
      a reasonable guess has a better chance of matching than an untranslated
      or miscapitalized value.

    Args:
        commodity: Name of the commodity in English, first letter of each word
                    capitalized, e.g. "Tomato", "Wheat", "Onion". Must match
                    Agmarknet's standard naming — normalize regional, colloquial,
                    or non-English crop names to this before calling.
        state: Optional state name to filter by, English, capitalized, e.g.
               "Maharashtra", "Andhra Pradesh".
        district: Optional district name to filter by, English, capitalized.
        market: Optional specific market/mandi name to filter by, English, capitalized.
        variety: Optional crop variety to filter by (e.g. "Local", "Hybrid"),
                 English, capitalized — prices can differ meaningfully by
                 variety for the same commodity.
        grade: Optional quality grade to filter by (e.g. "FAQ", "Non-FAQ"),
               English, capitalized — prices can differ by grade even within
               the same variety.
        limit: Max number of records to return (default 10).

    Returns:
        A dict with a "count" and a "prices" list. Each record contains state,
        district, market, commodity, variety, grade, min/max/modal price
        (in rupees per quintal, i.e. per 100 kg), and the arrival date.
    """
    if not API_KEY:
        return {"error": "Mandi prices are unavailable: DATA_GOV_IN_API_KEY is not configured on the server."}
    params = {
        "api-key": API_KEY,
        "format": "json",
        "limit": limit,
        "filters[commodity]": commodity,
    }
    if state:
        params["filters[state]"] = state
    if district:
        params["filters[district]"] = district
    if market:
        params["filters[market]"] = market
    if variety:
        params["filters[variety]"] = variety
    if grade:
        params["filters[grade]"] = grade

    logger.info("get_mandi_price called with params: %s", params)

    prepared = requests.Request("GET", BASE_URL, params=params).prepare()
    logger.info("Final request URL: %s", prepared.url)

    try:
        data = fetch_mandi_data(prepared.url)
    except (subprocess.TimeoutExpired, RuntimeError, json.JSONDecodeError) as e:
        logger.exception("Failed to fetch mandi price data")
        return {"error": f"Failed to fetch price data: {str(e)}"}

    records = data.get("records", [])
    if not records:
        return {
            "error": f"No price data found for '{commodity}'"
            + (f" in {market or district or state}" if (market or district or state) else "")
        }

    results = []
    for r in records:
        results.append({
            "state": r.get("state"),
            "district": r.get("district"),
            "market": r.get("market"),
            "commodity": r.get("commodity"),
            "variety": r.get("variety"),
            "grade": r.get("grade"),
            "min_price_per_quintal": r.get("min_price"),
            "max_price_per_quintal": r.get("max_price"),
            "modal_price_per_quintal": r.get("modal_price"),
            "arrival_date": r.get("arrival_date"),
        })

    return {"count": len(results), "prices": results}

if __name__ == "__main__":
    mcp.run(transport="streamable-http")    