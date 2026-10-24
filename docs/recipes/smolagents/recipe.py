"""Hugging Face smolagents + TrustShell over MCP. No API key, no model, no network: ground_quote checks locally that a quoted passage is in the source text.

    pip install "smolagents[mcp]" "mcp[ws]>=1.30,<2"
    python recipe.py

The "mcp[ws]<2" pin is NOT optional today: with the newest mcp (2.x) mcpadapt fails to import, and with 1.x it needs the websockets extra.
Verified 2026-10-22 on Windows 11, Python 3.13, smolagents 1.26.0, mcpadapt 0.1.20, mcp 1.30.0, @hyperdag/trustshell 1.8.0-rc.0. The same launch lists the same 20 tools on 1.8.0 (2026-10-23).
On Windows use command "npx.cmd" if "npx" is not found.
"""
import json
import os
import tempfile

from mcp import StdioServerParameters
from smolagents import ToolCollection

SOURCE = "The check workflow succeeded on commit 392797a69b6a. It ran one job."
home = tempfile.mkdtemp(prefix="trustshell-recipe-")
params = StdioServerParameters(
    command="npx", args=["-y", "-p", "@hyperdag/trustshell@latest", "trustshell-mcp"],
    env={"TRUSTSHELL_HOME": os.path.join(home, ".trustshell"), "TRUSTSHELL_MEMORY": os.path.join(home, "memory.sqlite"),
         "HOME": home, "USERPROFILE": home, "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "PATH": os.environ["PATH"]})

# trust_remote_code=True is smolagents' name for "this MCP server may run code on this machine": read the server before you say yes.
with ToolCollection.from_mcp(params, trust_remote_code=True, structured_output=False) as tc:
    print(f"{len(tc.tools)} TrustShell tools loaded")
    ground = next(t for t in tc.tools if t.name == "ground_quote")
    for quote in ("The check workflow succeeded on commit 392797a69b6a.", "The check workflow failed on commit 392797a69b6a."):
        verdict = json.loads(ground(source_text=SOURCE, quote=quote))["check"]
        print(f"{verdict['status']:9} {verdict['reason']:16} {quote}")
    # Next step (not verified here: it needs a model): CodeAgent(tools=[*tc.tools], model=<your model>)
