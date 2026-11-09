#!/usr/bin/env python3
"""Write (or update) the gitignored .env.lab: every login the lab tooling needs, in one place.

Sources, all local to this workstation:
  - ~/.config/fabric-ssh/hosts.toml  (the pod's device logins, keyed by "<fabric>/<device>")
  - --fsr-env FILE                    (an env file holding the FortiSOAR *application* login)
  - SOAR_OS_PASSWORD in the environment (the FortiSOAR guest's OS/SSH login; differs from the app login)
  - --set KEY=VALUE                   (anything else, e.g. a FortiGate API key; repeatable)

Values are written single-quoted and are meant to be PARSED, never sourced: a password can contain '$'.
Read the file with tools/with_lab_env.py, or point FSR_ENV_FILE at it (docubot and lab_setup parse it).
Nothing is printed except key names.

  python tools/make_lab_env.py --pod <pod-host> --fabric <fabric> --fsr-env <file> --fsr-port <gui port> \\
      --ssh-port Branch1=<port> --ssh-port FortiSOAR=<port> ...
  python tools/make_lab_env.py --set FGT_BRANCH1_API_KEY=...      # update one key in place
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / ".env.lab"

# Device name in the fabric -> env prefix. Forward ports are per pod: pass them with --ssh-port.
DEVICES = {
    "Branch1": "FGT_BRANCH1",
    "Branch2": "FGT_BRANCH2",
    "Enterprise_Core": "FGT_CORE",
    "FortiManager": "FMG",
    "Enterprise_FortiAnalyzer": "FAZ",
    "Corporate_FortiMail": "FML",
    "RedTeam_LXC": "REDTEAM",
    "Agent_Host": "AGENT_HOST",
}


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = re.sub(r"^export\s+", "", k.strip())
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        out[k] = v
    return out


def quote(v: str) -> str:
    if "'" in v:
        raise SystemExit("a value contains a single quote; quote it by hand")
    return f"'{v}'"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pod")
    ap.add_argument("--fabric")
    ap.add_argument("--fsr-env", type=Path)
    ap.add_argument("--fsr-port", help="the pod's forwarded FortiSOAR GUI port (required with --pod)")
    ap.add_argument("--ssh-port", action="append", default=[], metavar="DEVICE=PORT",
                    help="a device's forwarded SSH port on the pod (repeatable; FortiSOAR=<port> sets SOAR_SSH_PORT)")
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    a = ap.parse_args()

    env = read_env(OUT)
    ports = dict(kv.split("=", 1) for kv in a.ssh_port)
    if a.pod and a.fabric:
        if not a.fsr_port:
            raise SystemExit("--fsr-port is required with --pod")
        pods = tomllib.loads(Path("~/.config/fabric-ssh/hosts.toml").expanduser().read_text())["pods"]
        pod = pods[a.pod]
        env["LAB_POD_HOST"] = a.pod
        env["LAB_FABRIC"] = a.fabric
        env["DEVICE_PASSWORD"] = pod["pod_pass"]
        for name, prefix in DEVICES.items():
            if name in ports:
                env[f"{prefix}_SSH_PORT"] = ports[name]
            dev = pod["devices"].get(f"{a.fabric}/{name}")
            if not dev:
                continue
            env[f"{prefix}_USER"] = dev.get("user", "admin")
            env[f"{prefix}_PASSWORD"] = dev["password"]
            if dev.get("ip"):
                env[f"{prefix}_HOST"] = dev["ip"]
        env["FSR_BASE_URL"] = f"https://{a.pod}:{a.fsr_port}"
        env["FSR_PORT"] = str(a.fsr_port)  # some tools pass port= separately and would default to 443
        env.setdefault("FSR_VERIFY_SSL", "false")
        if "FortiSOAR" in ports:
            env["SOAR_SSH_PORT"] = ports["FortiSOAR"]
        env["SOAR_OS_USER"] = "csadmin"
    if a.fsr_env:
        src = read_env(a.fsr_env)
        env["FSR_USERNAME"] = src.get("FSR_USERNAME") or src.get("FSR_USER") or "csadmin"
        pw = src.get("FSR_PASSWORD") or src.get("FSR_PASS")
        if pw:
            env["FSR_PASSWORD"] = pw
    if os.environ.get("SOAR_OS_PASSWORD"):
        env["SOAR_OS_PASSWORD"] = os.environ["SOAR_OS_PASSWORD"]
    for kv in a.set:
        k, v = kv.split("=", 1)
        env[k] = v

    body = ["# Lab logins for this workshop's pod. GITIGNORED. Parse it, never source it (values can contain '$').",
            "# Regenerate with tools/make_lab_env.py; use it with tools/with_lab_env.py or FSR_ENV_FILE=.env.lab."]
    body += [f"{k}={quote(v)}" for k, v in sorted(env.items())]
    OUT.write_text("\n".join(body) + "\n")
    OUT.chmod(0o600)
    print(f"wrote {OUT.name}: {', '.join(sorted(env))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
