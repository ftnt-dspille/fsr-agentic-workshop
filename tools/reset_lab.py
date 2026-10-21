#!/usr/bin/env python3
"""LIVE TOOL. DESTRUCTIVE. Run by the lab owner, never by CI or an agent.

Removes everything the workshop created on a FortiSOAR box, identified by the
``agentlab_`` prefix or the "Agent Lab" collection name:

    users                 email starts with "agentlab_"        -> deactivated (pyfsr has no user delete)
    modules               name "agentlab" or "agentlab_*"      -> records purged, then module deleted
    playbook collections  name starts with "Agent Lab"         -> collection deleted (hard)
    schedules             name starts with "agentlab_" or "Agent Lab" -> deleted
    connector             acme-threat-feed, if configured      -> uninstalled

Modes
-----
    python3 tools/reset_lab.py --check-only   # report what exists, change nothing
    python3 tools/reset_lab.py                # print the plan, then ask you to type RESET

Connection comes from FSR_ENV_FILE (a KEY=VALUE file) or the process environment:
    FSR_BASE_URL      https://fortisoar.example.com
    FSR_API_KEY       <your-api-key>            (or FSR_USERNAME + FSR_PASSWORD)
    FSR_VERIFY_SSL    1 (default) or 0 for an appliance with a self-signed certificate

Requires the pyfsr package (client.modules, client.modules_admin, client.records,
client.users, client.workflow_collections, client.schedules, client.connectors).
Nothing is deleted without the RESET prompt.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MODULE_PREFIX = "agentlab_"
MODULE_EXACT = "agentlab"
USER_EMAIL_PREFIX = "agentlab_"
COLLECTION_PREFIX = "Agent Lab"
SCHEDULE_PREFIXES = ("agentlab_", "Agent Lab")
CONNECTOR = "acme-threat-feed"
CONFIRM_WORD = "RESET"
DELETE_CHUNK = 100


def read_env_file(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    out: dict[str, str] = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip("\"'")
    return out


def setting(name: str, file_env: dict[str, str], default: str | None = None) -> str | None:
    return file_env.get(name) or os.environ.get(name) or default


def build_client(file_env: dict[str, str]):
    from pyfsr import FortiSOAR  # imported here so --help works without pyfsr

    base = setting("FSR_BASE_URL", file_env)
    if not base:
        sys.exit("reset_lab: FSR_BASE_URL is required (set it in FSR_ENV_FILE or the environment)")
    verify = (setting("FSR_VERIFY_SSL", file_env, "1") or "1").lower() not in ("0", "false", "no")
    api_key = setting("FSR_API_KEY", file_env)
    if api_key:
        return FortiSOAR(base, api_key=api_key, verify_ssl=verify)
    user = setting("FSR_USERNAME", file_env)
    password = setting("FSR_PASSWORD", file_env)
    if not (user and password):
        sys.exit("reset_lab: set FSR_API_KEY, or FSR_USERNAME and FSR_PASSWORD")
    return FortiSOAR(base, username=user, password=password, verify_ssl=verify)


@dataclass
class Plan:
    users: list[dict[str, Any]] = field(default_factory=list)
    modules: list[dict[str, Any]] = field(default_factory=list)  # {"name", "records": [uuid, ...]}
    collections: list[dict[str, Any]] = field(default_factory=list)
    schedules: list[str] = field(default_factory=list)
    connector_version: str | None = None

    def is_empty(self) -> bool:
        return not (self.users or self.modules or self.collections or self.schedules or self.connector_version)


def collect_plan(client) -> Plan:
    plan = Plan()

    for person in client.records("people").iterate(raw=True):
        email = (person.get("email") or "").strip()
        if email.lower().startswith(USER_EMAIL_PREFIX):
            plan.users.append({"uuid": person.get("uuid"), "email": email})

    for mod in client.modules.list():
        name = mod.get("plural") or ""
        if name == MODULE_EXACT or name.startswith(MODULE_PREFIX):
            uuids = [r.get("uuid") for r in client.records(name).iterate(raw=True) if r.get("uuid")]
            plan.modules.append({"name": name, "records": uuids})

    for col in client.workflow_collections.list():
        name = col.get("name") or ""
        if name.startswith(COLLECTION_PREFIX):
            plan.collections.append({"uuid": col.get("uuid"), "name": name})

    for task in client.schedules.list(typed=False):
        name = task.get("name") or ""
        if name.startswith(SCHEDULE_PREFIXES):
            plan.schedules.append(name)

    plan.connector_version = client.connectors.resolve_version(CONNECTOR)
    return plan


def print_plan(plan: Plan) -> None:
    def section(title: str, rows: list[str]) -> None:
        print(f"{title}: {len(rows)}")
        for row in rows:
            print(f"  - {row}")

    section("users (deactivate)", [u["email"] for u in plan.users])
    section("modules (purge records, then delete)",
            [f"{m['name']} ({len(m['records'])} record(s))" for m in plan.modules])
    section("playbook collections (delete)", [c["name"] for c in plan.collections])
    section("schedules (delete)", plan.schedules)
    if plan.connector_version:
        print(f"connector {CONNECTOR} (uninstall): version {plan.connector_version}")
    else:
        print(f"connector {CONNECTOR}: not configured")


def chunks(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def execute(client, plan: Plan) -> int:
    failures = 0

    for user in plan.users:
        try:
            client.users.deactivate(user["uuid"])
            print(f"deactivated user {user['email']}")
        except Exception as exc:  # keep going; report at the end
            failures += 1
            print(f"FAILED deactivate {user['email']}: {exc}")

    for mod in plan.modules:
        try:
            for batch in chunks(mod["records"], DELETE_CHUNK):
                client.records(mod["name"]).delete_many(batch, hard=True)
            client.modules_admin.delete_module(mod["name"])
            print(f"deleted module {mod['name']}")
        except Exception as exc:
            failures += 1
            print(f"FAILED module {mod['name']}: {exc}")

    for col in plan.collections:
        try:
            client.workflow_collections.delete(col["uuid"], hard=True)
            print(f"deleted playbook collection {col['name']}")
        except Exception as exc:
            failures += 1
            print(f"FAILED collection {col['name']}: {exc}")

    for name in plan.schedules:
        try:
            client.schedules.delete(name)
            print(f"deleted schedule {name}")
        except Exception as exc:
            failures += 1
            print(f"FAILED schedule {name}: {exc}")

    if plan.connector_version:
        try:
            client.connectors.uninstall(CONNECTOR, version=plan.connector_version)
            print(f"uninstalled connector {CONNECTOR} {plan.connector_version}")
        except Exception as exc:
            failures += 1
            print(f"FAILED connector {CONNECTOR}: {exc}")

    return failures


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="LIVE, DESTRUCTIVE: remove the agentlab_ workshop objects from a FortiSOAR box.")
    ap.add_argument("--check-only", action="store_true", help="report what exists and change nothing")
    args = ap.parse_args(argv)

    env_path = os.environ.get("FSR_ENV_FILE")
    file_env = read_env_file(env_path)
    client = build_client(file_env)

    plan = collect_plan(client)
    print_plan(plan)
    if args.check_only:
        return 0
    if plan.is_empty():
        print("nothing to remove")
        return 0

    print()
    typed = input(f"This deletes the objects above on the box. Type {CONFIRM_WORD} to continue: ").strip()
    if typed != CONFIRM_WORD:
        print("aborted; nothing changed")
        return 1

    failures = execute(client, plan)
    if failures:
        print(f"{failures} step(s) failed; re-run --check-only to see what is left")
        return 1
    print("reset complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
