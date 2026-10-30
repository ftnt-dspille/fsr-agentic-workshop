# server.py - read-only lab MCP server, no network calls.
#
# One tool, get_forecast, that returns a forecast from a fixed table. It makes no
# network calls, so it runs on a laptop with no internet access. The tool is named
# and typed, and its docstring is what the model reads to decide when to call it.
#
# The import below is for the v1 MCP Python SDK. The v2 SDK renamed FastMCP to
# MCPServer, in the module mcp.server.mcpserver. Use whichever your SDK installs;
# the import path is in the SDK's own docs.
#
# Serve it with an ASGI server, bound to localhost only:
#     uvicorn server:app --host 127.0.0.1 --port 8000
# then register the on-box URL http://localhost:8000/mcp/ with FortiSOAR.
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("fortinet-weather", instructions="Read-only weather lookups for Fortinet office cities.")

# Fixed table keyed by Fortinet office city (HQ is Sunnyvale, California).
FORECASTS = {
    "Sunnyvale": "Sunny, 24 C",
    "Ottawa": "Snow, -6 C",
    "Burnaby": "Rain, 11 C",
}


@mcp.tool()
def get_forecast(city: str) -> dict:
    """Return the weather for a Fortinet office city (for example Sunnyvale). Read-only."""
    text = FORECASTS.get(city)
    if text is None:
        return {"status": "error", "result": None, "error": "unknown city"}
    return {"status": "ok", "result": text, "error": None}


app = mcp.streamable_http_app()
