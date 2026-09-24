import hashlib
import json
import logging
import re
import subprocess
from pathlib import Path

import docx
import httpx
from bs4 import BeautifulSoup
from constants import CHUNK_OVERLAP, CHUNK_SIZE
from pypdf import PdfReader

logger = logging.getLogger("rag-mcp-utils")

def extract_text_from_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    return "\n\n".join(pages)


def extract_text_from_docx(path: Path) -> str:
    d = docx.Document(str(path))
    return "\n".join(p.text for p in d.paragraphs if p.text.strip())
 
 
def extract_text_from_txt_or_md(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")
 
 
def extract_text_from_url(url: str, timeout: float = 20.0) -> str:
    logger.info("[MCP DEBUG] Starting URL fetch: %s", url)
    resp = httpx.get(
        url,
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (RAG-MCP-Server)"},
    )
    logger.info("[MCP DEBUG] URL fetch completed: %s status=%s content_length=%s", url, resp.status_code, len(resp.text))
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    logger.info("[MCP DEBUG] HTML parsed for URL: %s", url)
 
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
 
    text = soup.get_text(separator="\n")
    # collapse excess blank lines
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    logger.info("[MCP DEBUG] Extracted text length for URL %s: %s chars", url, len(text))
    return text 


def load_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(path)
    elif suffix == ".docx":
        return extract_text_from_docx(path)
    elif suffix in (".txt", ".md", ".markdown"):
        return extract_text_from_txt_or_md(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")
    



def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Simple sliding-window character chunker with sentence-boundary snapping."""
    text = text.strip()
    if not text:
        return []
 
    chunks = []
    start = 0
    n = len(text)
 
    while start < n:
        end = min(start + chunk_size, n)
 
        # try to end on a sentence/paragraph boundary if possible
        if end < n:
            window = text[start:end]
            last_break = max(window.rfind(". "), window.rfind("\n"))
            if last_break > chunk_size * 0.5:
                end = start + last_break + 1
 
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
 
        if end >= n:
            break
        start = max(end - overlap, start + 1)
 
    return chunks
 
 
def make_chunk_id(source: str, idx: int) -> str:
    h = hashlib.sha256(f"{source}::{idx}".encode()).hexdigest()[:16]
    return f"{h}-{idx}"
 
 




def fetch_mandi_data(url: str, timeout: int = 15) -> dict:
    result = subprocess.run(
        [
            "curl", "-s", "--max-time", str(timeout),
            "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "-H", "Accept: application/json, text/plain, */*",
            url,
        ],
        capture_output=True,
        text=True,
        timeout=timeout + 5,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed (exit {result.returncode}): {result.stderr}")
    return json.loads(result.stdout)