# weather-lab: a read-only MCP server for the workshop

A minimal MCP server with one read-only tool, `get_forecast`, that returns a
forecast from a fixed table. No network calls, so it runs anywhere. It is the
worked example for the "Advanced: Build Your Own MCP Server" page in Chapter 5.

## Run it

Install the dependencies into a virtualenv (not the system Python), then serve it
on localhost with an ASGI server:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

The MCP endpoint is then `http://localhost:8000/mcp/`.

## Where to run it

- On the FortiSOAR appliance itself (SSH in, serve on a local port, register
  `http://localhost:8000/mcp/`). The box can always reach its own localhost, so no
  TLS or firewall work is needed. Bind to localhost only.
- On a lab VM or container the box can reach, behind TLS.

A server on your laptop is NOT reachable from the box.

## Prove the handshake, then register

Follow the chapter: `initialize` (note the `mcp-session-id` response header),
`notifications/initialized`, `tools/list` (must return `get_forecast`), then
register the server with FortiSOAR using the `none` authentication type for this
lab server only, and grant `get_forecast` to one agent.

The tool returns the envelope `status`, `result`, `error`. FortiSOAR agents expect
that shape; some shipped agents break on a bare value.
