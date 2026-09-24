import asyncio
import base64
import json
import logging
from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from src.constants import RAG_MCP_URL

logger = logging.getLogger("orchestrator.mcp")
 

class MCPConnectClient:
    def __init__(self):
        self._exit_stack = AsyncExitStack()
        self._session: ClientSession | None = None
        self._lock = asyncio.Lock()
    

    async def disconnect(self):
        """Tear down any existing connection before reconnecting."""
        if self._session is not None:
            try:
                await self._exit_stack.aclose()
            except Exception as e:
                logger.warning(f"Error while closing existing MCP connection: {e}")
            finally:
                self._session = None
                self._exit_stack = AsyncExitStack()  # fresh stack, ready for reuse


    async def connect(self, mcp_url: str | None = None):
        await self.disconnect()

        target_url = mcp_url or RAG_MCP_URL
        try:
            transport = await self._exit_stack.enter_async_context(
                streamable_http_client(target_url)
            )
            read, write, _ = transport
            self._session = await self._exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await self._session.initialize()
            logger.info(f"RAGIngestionClient connected to MCP server at {target_url}")
        except (Exception, asyncio.CancelledError) as exc:
            # asyncio.CancelledError is a BaseException (not Exception) as of
            # Python 3.8+ -- a failed connection attempt can surface as one via
            # the transport's internal task group cancelling initialize(), and
            # left uncaught it aborts the whole app's startup instead of just
            # this optional MCP connection.
            logger.warning(f"MCP connection unavailable at {target_url}: {exc}")
            self._session = None
 
    
    async def close(self):
        await self._exit_stack.aclose()
    

    async def mcp_call(self, tool: str, args: dict) -> dict:
        async with self._lock:
            result = await self._session.call_tool(tool, args)
        text = "".join(b.text for b in result.content if hasattr(b, "text"))
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}
        
    

    async def ingest_file(self, filename: str, content: bytes, agent_id: str) -> dict:
        """
        Ingest an in-memory file (bytes from UploadFile.read()) into the
        MCP server's RAG knowledge base for the given agent_id.
        """
        return await self.mcp_call(
            "ingest_file_content",
            {
                "filename": filename,
                "content_base64": base64.b64encode(content).decode("ascii"),
                "agent_id": agent_id,
            },
        )
 
    async def ingest_url(self, url: str, agent_id: str) -> dict:
        """Fetch and ingest a URL into the given agent's knowledge base."""
        return await self.mcp_call(
            "ingest_url",
            {"url": url, "agent_id": agent_id},
        )
 
    async def ingest_text(self, text: str, source_name: str, agent_id: str) -> dict:
        """Ingest raw text into the given agent's knowledge base."""
        return await self.mcp_call(
            "ingest_text",
            {"text": text, "source_name": source_name, "agent_id": agent_id},
        )
    

    async def list_tools(self):
        response = await self._session.list_tools()
        return response.tools



    ##### dev and testing endpoints for RAG knowledge base management #####
    async def list_sources(self, agent_id: str) -> dict:
        return await self.mcp_call("list_sources", {"agent_id": agent_id})
 
    async def delete_source(self, source: str, agent_id: str) -> dict:
        return await self.mcp_call("delete_source", {"source": source, "agent_id": agent_id})

    async def list_collections(self) -> list[str]:
        """
        List all agent IDs that currently have a RAG knowledge base collection
        stored in this MCP server.
        """
        return await self.mcp_call("list_collections", {})

    async def delete_collection(self, agent_id: str) -> dict:
        """
        Delete the entire RAG knowledge base collection for the given agent_id.
        """
        return await self.mcp_call("delete_collection", {"agent_id": agent_id})

    async def get_mandi_prices(self, 
    commodity: str,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
    variety: str | None = None,
    grade: str | None = None,
    limit: int = 10,
        
        ) -> dict:
        """
        Get the latest mandi prices for a given commodity from the MCP server.
        """
        return await self.mcp_call(
            "get_mandi_prices",
            {
                "commodity": commodity,
                "state": state,
                "district": district,
                "market": market,
                "variety": variety,
                "grade": grade,
                "limit": limit,
            },
        )

mcp_client = MCPConnectClient()