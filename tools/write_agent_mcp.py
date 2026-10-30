#!/usr/bin/env python3
"""Write the agent's .mcp.json for the docubot SPEND_AI runs, repeatably.

The docubot chapter specs drive a real `claude` TUI whose only box access is
the fsr-agentic-toolkit MCP server named via DOCUBOT_MCP_CONFIG. This builds
that config from a box env file, reusing agent-drive/run.py's server builder
and its box-identity preflight so the file can never point the agent at a box
other than the env file's. The output holds box credentials, so it is written
to a gitignored path (default .agent-lab/.mcp.json) with 0600 perms.

Usage:
    python3 tools/write_agent_mcp.py --env-file .env.<box> [--out PATH]

Then: DOCUBOT_MCP_CONFIG="$PWD/.agent-lab/.mcp.json" SPEND_AI=1 \
      npx tsx ../docubot/src/cli.ts run . --chapter 08-playbook
"""
import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
RUN_PY = HERE / "agent-drive" / "run.py"


def _load_run_module():
    spec = importlib.util.spec_from_file_location("agent_drive_run", RUN_PY)
    mod = importlib.util.module_from_spec(spec)
    # Register before exec so run.py's @dataclass decorators can resolve their module.
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--env-file", required=True, help="KEY=VALUE box env file (FSR_BASE_URL, creds)")
    ap.add_argument("--out", default=".agent-lab/.mcp.json", help="where to write the .mcp.json")
    args = ap.parse_args(argv)

    run = _load_run_module()
    run.load_env_file(args.env_file)
    if not os.environ.get("FSR_BASE_URL"):
        sys.exit("FSR_BASE_URL must be set (check the env file)")

    server = run.fortisoar_lab_server()
    expected_host = (urlparse(os.environ["FSR_BASE_URL"]).hostname or "").lower()
    # Asserts the server config/identity targets the env file's box; aborts otherwise.
    run.preflight(server, expected_host)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"mcpServers": {run.LAB_SERVER: server}}, indent=2) + "\n")
    out.chmod(0o600)
    print(f"wrote {out} targeting {expected_host} (server: {run.LAB_SERVER})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
