"""LangChain / LangGraph + TrustShell over MCP. No API key, no model, no network: ground_quote checks locally that a quoted passage is in the source text.

    pip install langchain-mcp-adapters langgraph
    python recipe.py

The TrustShell MCP server is started by npx (the first run downloads @hyperdag/trustshell@latest). On Windows use "npx.cmd" if "npx" is not found.
Verified 2026-10-22 on Windows 11, Python 3.13, langchain-mcp-adapters 0.3.2, langgraph 1.2.16, @hyperdag/trustshell 1.8.0-rc.0. The same launch lists the same 20 tools on 1.8.0 (2026-10-23).
"""
import asyncio
import json
import os
import tempfile

from langchain_mcp_adapters.client import MultiServerMCPClient

SOURCE = "The check workflow succeeded on commit 392797a69b6a. It ran one job."
home = tempfile.mkdtemp(prefix="trustshell-recipe-")
ENV = {  # a throwaway home, so the recipe touches none of your real notes
    "TRUSTSHELL_HOME": os.path.join(home, ".trustshell"),
    "TRUSTSHELL_MEMORY": os.path.join(home, "memory.sqlite"),
    "HOME": home, "USERPROFILE": home,
    "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "PATH": os.environ["PATH"],
}


async def main() -> None:
    client = MultiServerMCPClient({"trustshell": {
        "transport": "stdio", "command": "npx",
        "args": ["-y", "-p", "@hyperdag/trustshell@latest", "trustshell-mcp"], "env": ENV}})
    tools = await client.get_tools()
    print(f"{len(tools)} TrustShell tools loaded, e.g. {', '.join(sorted(t.name for t in tools)[:6])}")
    ground = next(t for t in tools if t.name == "ground_quote")
    for quote in ("The check workflow succeeded on commit 392797a69b6a.",   # really in the source
                  "The check workflow failed on commit 392797a69b6a."):     # the agent's misquote
        out = await ground.ainvoke({"source_text": SOURCE, "quote": quote})
        verdict = json.loads(out[0]["text"])["check"]
        print(f"{verdict['status']:9} {verdict['reason']:16} {quote}")
    # Next step (not verified here: it needs a model key): hand `tools` to a LangGraph agent, e.g.
    #   from langgraph.prebuilt import create_react_agent
    #   agent = create_react_agent("<your model>", tools)


asyncio.run(main())
