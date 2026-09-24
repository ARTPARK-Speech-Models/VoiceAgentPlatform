import asyncio
import json
import logging

from src.mcp_client import mcp_client

logger = logging.getLogger("tool_registry")

# Bounds a single tool call (RAG retrieval, mandi prices, etc.) -- without
# this, a hung MCP server (stalled ChromaDB/embedding call, or an
# unresponsive external API like Agmarknet) leaves the caller stuck forever
# right after the spoken "please hold while I look it up" message, with no
# way out. Mirrors the timeout already added to the Gemini LLM call itself.
TOOL_CALL_TIMEOUT_S = 20

class ToolRegistry:
 
    def __init__(self):
        
        self._mcp_tools = []        


    def as_gemini(self, allowed_tools: set[str]):
        """Filter master tools against an allowed list and format for Gemini."""
        from google.genai import types
 
        declarations = []
        for tool in self._mcp_tools:
            # Only include tools explicitly allowed for this agent configuration
            if tool.name not in allowed_tools:
                continue

            schema = self._clean_for_gemini(
                tool.inputSchema or {"type": "object", "properties": {}}
            )
            declarations.append(
                types.FunctionDeclaration(
                    name=tool.name,
                    description=tool.description or "",
                    parameters=schema,
                )
            )
        return [types.Tool(function_declarations=declarations)] if declarations else []
 
    def as_openai(self, allowed_tools: set[str]):
        """Filter master tools against an allowed list and format for the
        OpenAI-compatible function-calling schema (also what Ollama's
        /v1/chat/completions endpoint expects). Was previously returning
        self._openai_tools, an attribute never set anywhere -- _build_openai()
        existed but nothing called it -- and unlike as_gemini() it didn't
        filter by allowed_tools at all."""
        return self._build_openai(allowed_tools)


    async def fetch_mcp_tools(self):
        """Fetch live tools from the connected MCP client."""
        from src.mcp_client import mcp_client
        # This now calls the exact method you defined in MCPConnectClient
        self._mcp_tools = await mcp_client.list_tools()
        

    async def execute_tool(self, name, args: dict, agent_name: str):

        try:
            async with asyncio.timeout(TOOL_CALL_TIMEOUT_S):
                result = await mcp_client.mcp_call(name, {**args, "agent_id": agent_name})
            return result if isinstance(result, str) else json.dumps(result)

        except TimeoutError:
            logger.warning(f"Tool '{name}' timed out after {TOOL_CALL_TIMEOUT_S}s")
            return f"Tool '{name}' timed out -- no result available. Tell the user you couldn't retrieve that information right now."

        except Exception as e:
            logger.exception(f"Tool '{name}' failed")
            return f"Tool '{name}' failed: {e}"



    def _build_openai(self, allowed_tools: set[str]) -> list[dict]:
        tools = []
        for tool in self._mcp_tools:
            if tool.name not in allowed_tools:
                continue
            tools.append({
                "type": "function",
                "function": {
                    "name":        tool.name,
                    "description": tool.description or "",
                    "parameters":  self._clean_for_openai(
                        tool.inputSchema or {"type": "object", "properties": {}}
                    ),
                },
            })
        return tools



    def _clean_for_gemini(self, schema: dict) -> dict:
        """Gemini rejects anyOf, additionalProperties, title, default."""
        if not isinstance(schema, dict):
            return schema
        drop = {"title", "additionalProperties", "$schema", "default"}
        out = {k: v for k, v in schema.items() if k not in drop}
        if "properties" in out:
            out["properties"] = {
                k: self._clean_for_gemini(v)
                for k, v in out["properties"].items()
                if k != "agent_id"           # host-injected, never shown to model
            }
        if "required" in out:
            out["required"] = [r for r in out["required"] if r != "agent_id"]
        if "anyOf" in out:
            non_null = [s for s in out["anyOf"] if s.get("type") != "null"]
            if len(non_null) == 1:
                out.update(self._clean_for_gemini(non_null[0]))
            out.pop("anyOf", None)
        return out
 
    def _clean_for_openai(self, schema: dict) -> dict:
        """OpenAI is closest to raw JSON Schema — just strip agent_id."""
        return self._strip_agent_id(schema)
    

    def _strip_agent_id(self, schema: dict) -> dict:
        schema = dict(schema)
        props = dict(schema.get("properties", {}))
        props.pop("agent_id", None)
        schema["properties"] = props
        if "required" in schema:
            schema["required"] = [r for r in schema["required"] if r != "agent_id"]
        return schema


