---
title: "Advanced: Build Your Own MCP Server"
linkTitle: "Advanced: Build Your Own"
weight: 30
description: "Optional: write a small read-only MCP server, prove its handshake with curl, and register it with FortiSOAR."
---

Optional, for teams who want to see the server side. You write a read-only MCP server, prove it speaks the protocol with curl, and register it the same way you registered the public server. Keep the tool read-only: the exercise is about the handshake, not about writing to anything.

Where to run it, in order of preference:

1. **Your own lab VM or container, if the class provides one.** A per-student container (an LXC or similar) that the box can reach is the cleanest shape: your server is then a true remote server, exactly like the production case. Ask your instructor whether the lab topology includes one.
2. **The FortiSOAR appliance itself.** SSH to the box, start the server on a local port, and register `http://localhost:<port>/mcp/`. The box can always reach its own localhost, so no TLS or firewall work is needed.

## 1. Build a read-only server

The server below exposes one tool that returns a forecast from a fixed table. It makes no network calls, so it works on a laptop with no internet access. The tool is named and typed, and its docstring is what the model reads to decide when to call it.

The import below is for the v1 MCP Python SDK. The v2 SDK renamed `FastMCP` to `MCPServer`, in the module `mcp.server.mcpserver`. Use whichever your SDK installs; the import path is in the SDK's own docs.

```python
# server.py - read-only lab server, no network calls
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather-lab", instructions="Read-only forecast lookups for the lab.")

FORECASTS = {
    "lab-city-a": "Sunny, 21 C",
    "lab-city-b": "Rain, 14 C",
}

@mcp.tool()
def get_forecast(city: str) -> dict:
    """Return the forecast for a known lab city. Read-only."""
    text = FORECASTS.get(city)
    if text is None:
        return {"status": "error", "result": None, "error": "unknown city"}
    return {"status": "ok", "result": text, "error": None}

app = mcp.streamable_http_app()
```

Copy `server.py` to the appliance and serve it on a local port with an ASGI server, for example `uvicorn server:app --port 8000` (install `mcp` and `uvicorn` into a virtualenv on the box, not into the system Python). Bind to localhost only. If you must run it anywhere other than the box itself, put it behind TLS termination before any other system can reach it.

The tool returns the envelope `status`, `result` and `error`. FortiSOAR agents expect that shape, and some shipped agents break on a bare value.

## 2. Prove the handshake with curl

Before FortiSOAR sees the server, check it yourself. The client must send an `Accept` header that lists both JSON and event-stream. The server returns a session ID in the `mcp-session-id` response header, and every later call must send it back.

<!-- step: fsa05-03-handshake manual: a curl handshake run from a shell against the server, not a box UI step -->

Send `initialize`. Read the session ID from the response headers. Send `notifications/initialized` with that session header. Then send `tools/list` and `tools/call`.

```bash
# 1. initialize: note the mcp-session-id response header
curl -i -X POST http://localhost:8000/mcp/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"<protocol-version-your-sdk-supports>","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'

# 2. tools/list: send the session ID you read above
curl -s -X POST http://localhost:8000/mcp/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id-from-step-1>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

**What success looks like**

- The initialize response names the server and includes a session ID.
- The tools list includes `get_forecast` with its input schema.
- A `tools/call` for a known city returns the envelope with the forecast.

A request without the `Accept` header is rejected, so if the call fails with a 406, check that header first.

## 3. Register it

Register the server with the steps from the previous page. Validate first, and check that validation returns `get_forecast`. Then persist, note the UUID, and check the status.

Use the `none` authentication type for this lab server only, and register the on-box URL `http://localhost:8000/mcp/`. A server running on your laptop is NOT reachable from the box - that is why the lab runs it on the appliance's own CLI. If your class provides a shared reachable host instead, confirm the box can reach it and that its certificate is trusted before you validate.

## 4. Grant it and prove it

Grant the server to one agent exactly as you did for the public server on the previous page, listing only `get_forecast`, then ask the agent for a known city's forecast and check the trace for the call. The allowlist rules from that page apply unchanged.

## 5. Optional: break the JSON-string rule on purpose

Only do this on a throwaway non-production box you own. Do not run it on a shared class box.

<!-- step: fsa05-05-json-trap manual: breaks the JSON rule on purpose on a throwaway box; the page forbids it on a shared box -->

Save a second copy of the server's definition, with `authentication` sent as a JSON object instead of a string. Watch the status route. Then fix the row by writing `authentication` back as a string, and check the status again.

**What success looks like**

- You saw the status route fail for every server, not only the broken one.
- After the fix, every server reports its status normally.

{{% notice warning %}}
Remove the broken copy when you finish. A leftover broken row can make the status route fail for every user of the box.
{{% /notice %}}

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Handshake returns 406 | The `Accept` header lacks event-stream | Send both JSON and event-stream in `Accept` |
| Tool call fails with no session | The `mcp-session-id` header was not sent back | Read it from step 1 and send it on every later call |
| Validation returns no tools | The server did not start, or the URL points elsewhere | Check the server is up, and the URL ends in the path you served |
| Agent says the tool is not allowed | The tool name in the allowlist does not match the server's name | Copy the name from the tools list exactly |
| Agent calls tools you did not grant | No allowlist entry, or the agent has no allowlist file | Write an explicit allowlist with only `get_forecast` |
| Status route fails for every server | A row with `authentication` stored as an object | Rewrite that row's `authentication` as a string |
| Tool call times out | The tool is slow, and the platform's call timeout is short | Keep tool responses small and fast. Check the timeout on your build. |

