#!/usr/bin/env python3
"""LIVE TOOL. DESTRUCTIVE. Run by the lab owner, never by CI or an agent.

Removes everything the workshop created on a FortiSOAR box, identified by the
``agentlab_`` prefix or the "Agent Lab" collection name:

    users                 email starts with "agentlab_"        -> deactivated (pyfsr has no user delete)
    modules               name "agentlab" or "agentlab_*"      -> records purged, then module deleted
    playbook collections  name starts with "Agent Lab"         -> collection deleted (hard)
    schedules             name starts with "agentlab_" or "Agent Lab" -> deleted
    connectors            the lab connectors (CONNECTORS), if installed -> uninstalled
    dashboards            name in DASHBOARD_NAMES (e.g. "Workshop Verdicts") -> removed

Modes
-----
    python3 tools/reset_lab.py --check-only   # report what exists, change nothing
    python3 tools/reset_lab.py                # print the plan, then ask you to type RESET
    python3 tools/reset_lab.py --yes          # non-interactive (for automated pre-run reset)

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
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MODULE_PREFIX = "agentlab_"
MODULE_EXACT = "agentlab"
USER_EMAIL_PREFIX = "agentlab_"
COLLECTION_PREFIX = "Agent Lab"
# Dashboards the labs build in the widget builder (chapter 3). A dashboard is a view
# template stored at /api/3/dashboard, so it is matched by its displayName.
DASHBOARD_NAMES = ("Workshop Verdicts",)
ALERT_NAME_PREFIX = "Agent Lab"  # seeded demo alerts ("Agent Lab - ...") and the agent's own test alerts ("Agent Lab crit/ioc/sweep/...")
SCHEDULE_PREFIXES = ("agentlab_", "Agent Lab")
# Connectors the labs install (ch9): the one the student builds+installs, and the
# one installed from the Content Hub. Uninstalling them lets the build/install
# chapters run a clean deploy instead of hitting "same name is already active".
# Override with FSR_LAB_CONNECTORS (comma-separated).
CONNECTORS = [c.strip() for c in os.environ.get(
    "FSR_LAB_CONNECTORS", "agentlab-dadjoke,whois-rdap").split(",") if c.strip()]
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
    if not verify:
        # Lab boxes use self-signed certs; verification is off, so drop the per-request warning.
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    # Prefer a user (JWT) login: it is required for install labs (Content Hub /
    # solution-pack / connector installs are not supported with an API key).
    # Fall back to an API key only when no user creds are set.
    user = setting("FSR_USERNAME", file_env)
    password = setting("FSR_PASSWORD", file_env)
    if user and password:
        return FortiSOAR(base, username=user, password=password, verify_ssl=verify)
    api_key = setting("FSR_API_KEY", file_env)
    if api_key:
        return FortiSOAR(base, api_key=api_key, verify_ssl=verify)
    sys.exit("reset_lab: set FSR_USERNAME and FSR_PASSWORD (preferred), or FSR_API_KEY")


@dataclass
class Plan:
    users: list[dict[str, Any]] = field(default_factory=list)
    modules: list[dict[str, Any]] = field(default_factory=list)  # {"name", "records": [uuid, ...]}
    collections: list[dict[str, Any]] = field(default_factory=list)
    schedules: list[str] = field(default_factory=list)
    alerts: list[dict[str, Any]] = field(default_factory=list)  # {"uuid", "name"}
    connectors: list[dict[str, Any]] = field(default_factory=list)  # {"name", "version"}
    dashboards: list[dict[str, Any]] = field(default_factory=list)  # {"uuid", "name"}

    def is_empty(self) -> bool:
        return not (self.users or self.modules or self.collections or self.schedules
                    or self.alerts or self.connectors or self.dashboards)


def collect_plan(client) -> Plan:
    plan = Plan()

    for person in client.records("people").iterate(raw=True):
        email = (person.get("email") or "").strip()
        if email.lower().startswith(USER_EMAIL_PREFIX):
            plan.users.append({"uuid": person.get("uuid"), "email": email})

    for mod in client.modules.list():
        name = mod.get("plural") or ""
        if name == MODULE_EXACT or name.startswith(MODULE_PREFIX):
            try:
                uuids = [r.get("uuid") for r in client.records(name).iterate(raw=True) if r.get("uuid")]
            except Exception as exc:
                # A half-published module can 500 on record listing. Still try to
                # delete it (delete_module drops the table), just with no purge.
                print(f"WARN: cannot list records for module {name}: {exc}; will attempt delete anyway")
                uuids = []
            plan.modules.append({"name": name, "records": uuids})

    for col in client.workflow_collections.list():
        name = col.get("name") or ""
        if name.startswith(COLLECTION_PREFIX):
            plan.collections.append({"uuid": col.get("uuid"), "name": name})

    for task in client.schedules.list(typed=False):
        name = task.get("name") or ""
        if name.startswith(SCHEDULE_PREFIXES):
            plan.schedules.append(name)

    for alert in client.records("alerts").iterate(raw=True):
        name = alert.get("name") or ""
        if name.startswith(ALERT_NAME_PREFIX):
            plan.alerts.append({"uuid": alert.get("uuid"), "name": name})

    for dash in client.get("/api/3/dashboard", {"$limit": 500}).get("hydra:member", []):
        if dash.get("displayName") in DASHBOARD_NAMES:
            plan.dashboards.append({"uuid": dash.get("uuid"), "name": dash.get("displayName")})

    for name in CONNECTORS:
        try:
            version = client.connectors.resolve_version(name)
        except Exception:  # resolve can raise on an odd state; treat as not installed
            version = None
        if version:
            plan.connectors.append({"name": name, "version": version})
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
    section("dashboards (delete)", [d["name"] for d in plan.dashboards])
    section("demo alerts (delete)", [a["name"] for a in plan.alerts])
    if plan.connectors:
        section("connectors (uninstall)",
                [f"{c['name']} {c['version']}" for c in plan.connectors])
    else:
        print(f"connectors ({', '.join(CONNECTORS)}): none installed")


def chunks(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


# --- orphan sweep (FortiSOAR 8.0.1) --------------------------------------
# On 8.0.1, delete_module removes a module's metadata and registry entry but
# leaves its physical tables and generated entity files behind (its re-publish
# schema:update exits non-zero on the drop). Those leftovers poison the next
# create of the same name. We sweep them through the appliance console, which
# uses the app's own DB connection (no credentials handled here). 8.0.0 does
# not need this, and the sweep is a safe no-op there.

CONSOLE = "/opt/cyops-api/bin/console"
ENTITY_DIR = "/opt/cyops-api/src/Entity/Custom"


def build_appliance(file_env: dict[str, str], instance_name: str | None):
    try:
        from pyfsr.appliance import Appliance
    except Exception:
        return None
    if instance_name:
        try:
            return Appliance(instance=instance_name)
        except Exception as exc:
            # Fall through: an instance that keeps its SSH target in its env file
            # (FSR_SSH_*) has no [instances.<name>.appliance] block.
            print(f"note: no pyfsr appliance profile for instance {instance_name} ({exc}); trying FSR_SSH_*")
    host = setting("FSR_SSH_HOST", file_env)
    if not host:
        return None
    try:
        return Appliance(
            host=host,
            user=setting("FSR_SSH_USER", file_env, "csadmin"),
            port=int(setting("FSR_SSH_PORT", file_env, "22") or "22"),
            key_path=os.path.expanduser(setting("FSR_SSH_KEY", file_env) or setting("FSR_SSH_KEY_PATH", file_env) or "") or None,
            insecure_skip_host_key_check=True,
        )
    except Exception as exc:
        print(f"WARN: cannot build appliance from FSR_SSH_*: {exc}")
        return None


def _console(ap, *args: str, timeout: float = 120.0) -> str:
    return ap.run(["-u", "nginx", "php", CONSOLE, *args], sudo=True, timeout=timeout)


def sweep_orphans(ap, module_names: list[str]) -> None:
    """Drop leftover tables + entity files for each deleted module, then regenerate."""
    touched = False
    for mod in module_names:
        stripped = mod.replace("_", "")
        probe = (f"SELECT tablename FROM pg_tables WHERE tablename='{mod}' "
                 f"OR tablename LIKE '{stripped}\\_%' ESCAPE '\\'")
        try:
            out = _console(ap, "doctrine:query:sql", probe, timeout=60)
        except Exception as exc:
            print(f"WARN: orphan probe failed for {mod}: {exc}")
            continue
        tables = re.findall(r'string\(\d+\)\s+"([^"]+)"', out)
        for tbl in tables:
            try:
                _console(ap, "doctrine:query:sql", f'DROP TABLE IF EXISTS "{tbl}" CASCADE', timeout=60)
                print(f"  dropped orphan table {tbl}")
                touched = True
            except Exception as exc:
                print(f"  FAILED drop {tbl}: {exc}")
        try:  # a stale staging row blocks the next publish of this name
            _console(ap, "doctrine:query:sql",
                     f"DELETE FROM staging_model_metadatas WHERE type='{mod}'", timeout=60)
        except Exception:
            pass
        try:  # entity classes that reference this table
            found = ap.run(["-u", "nginx", "grep", "-rl", "--", mod, ENTITY_DIR],
                           sudo=True, timeout=60)
            files = [ln.strip() for ln in found.splitlines() if ln.strip().endswith(".php")]
            if files:
                ap.run(["rm", "-f", *files], sudo=True, timeout=30)
                print(f"  removed {len(files)} entity file(s) for {mod}")
                touched = True
        except Exception:
            pass  # grep exits non-zero when nothing matches; that is fine
    if touched:
        try:
            _console(ap, "app:metadata:generate:models", timeout=180)
            _console(ap, "app:metadata:generate:modules", timeout=180)
            _console(ap, "cache:clear", "--env=prod", timeout=120)
            ap.run(["systemctl", "reload", "php-fpm"], sudo=True, timeout=30)
            print("  regenerated models/modules, cleared cache, reloaded php-fpm")
        except Exception as exc:
            print(f"  WARN: post-sweep regenerate failed: {exc}")


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

    if plan.alerts:
        try:
            client.records("alerts").delete_many([a["uuid"] for a in plan.alerts], hard=True)
            print(f"deleted {len(plan.alerts)} demo alert(s)")
        except Exception as exc:
            failures += 1
            print(f"FAILED demo alerts: {exc}")

    for dash in plan.dashboards:
        try:
            client.delete(f"/api/3/dashboard/{dash['uuid']}")
            print(f"deleted dashboard {dash['name']}")
        except Exception as exc:
            failures += 1
            print(f"FAILED dashboard {dash['name']}: {exc}")

    for conn in plan.connectors:
        try:
            client.connectors.uninstall(conn["name"], version=conn["version"])
            print(f"uninstalled connector {conn['name']} {conn['version']}")
        except Exception as exc:
            failures += 1
            print(f"FAILED connector {conn['name']}: {exc}")

    return failures



def restore_agent_mcp_servers(client) -> None:
    """Give every "Agent Lab..." agent configuration the default MCP servers back.

    Chapter 5 saves a custom configuration on Alert Investigation. A custom
    configuration replaces the default server list, so a grant that drops SOC
    Framework silently stops every later investigation from writing its verdict
    to the alert. Dead server references (a deleted registration) are dropped.
    """
    try:
        default = client.get("/api/ai/agent/config/default")["config"]["mcp_server"]
        live = {m["@id"].split("/")[-1] for m in client.get("/api/3/mcp_configurations", params={"$limit": 200}).get("hydra:member", [])}
        agents = client.ai.list_agents()
    except Exception as exc:  # noqa: BLE001 - report, do not abort the reset
        print(f"agent configs: could not read ({exc})")
        return
    for agent in agents:
        name, version = getattr(agent, "name", None), getattr(agent, "version", None)
        if not name or not version:
            continue
        try:
            cur = client.get(f"/api/ai/agent/config/{name}/{version}")
        except Exception:  # noqa: BLE001 - agent without a readable config
            continue
        cfg = dict(cur.get("config") or {})
        if not str(cfg.get("name") or "").startswith("Agent Lab"):
            continue
        servers = [u for u in dict.fromkeys(default + list(cfg.get("mcp_server") or [])) if u in live]
        if servers == list(cfg.get("mcp_server") or []):
            print(f"agent config ok: {name} ({cfg.get('name')})")
            continue
        cfg["mcp_server"] = servers
        client.ai.update_agent_config(name, version, cfg, name=cur.get("name") or None, config_id=cur.get("config_id"))
        print(f"restored default MCP servers on agent {name} ({cfg.get('name')})")

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="LIVE, DESTRUCTIVE: remove the agentlab_ workshop objects from a FortiSOAR box.")
    ap.add_argument("--check-only", action="store_true", help="report what exists and change nothing")
    ap.add_argument("--instance", help="pyfsr instance name in ~/.pyfsr/instances.toml")
    ap.add_argument("--yes", action="store_true",
                    help="skip the RESET prompt (non-interactive; for automated pre-run reset). "
                         "Also enabled by FSR_LAB_RESET_YES=1.")
    ap.add_argument("--sweep-only", nargs="+", metavar="MODULE",
                    help="only run the 8.0.1 orphan-table sweep for these already-deleted module names")
    args = ap.parse_args(argv)

    if args.instance:
        from lab_setup import read_instance  # same tools/ directory
        file_env = read_instance(args.instance)
    else:
        file_env = read_env_file(os.environ.get("FSR_ENV_FILE"))
    if args.sweep_only:
        appliance = build_appliance(file_env, args.instance)
        if appliance is None:
            sys.exit("reset_lab: --sweep-only needs an appliance SSH target (FSR_SSH_* or a pyfsr appliance profile)")
        sweep_orphans(appliance, args.sweep_only)
        return 0
    client = build_client(file_env)

    plan = collect_plan(client)
    print_plan(plan)
    if args.check_only:
        return 0
    # Chapter 3 fills the shipped APPROVED_BACKUP_SYSTEM record; put its placeholder back.
    from lab_setup import cmd_approved_backup  # same tools/ directory
    cmd_approved_backup(client, clear=True)
    restore_agent_mcp_servers(client)
    if plan.is_empty():
        print("nothing to remove")
        return 0

    if args.yes or os.environ.get("FSR_LAB_RESET_YES") == "1":
        print(f"\n--yes: deleting the objects above without the {CONFIRM_WORD} prompt")
    else:
        print()
        typed = input(f"This deletes the objects above on the box. Type {CONFIRM_WORD} to continue: ").strip()
        if typed != CONFIRM_WORD:
            print("aborted; nothing changed")
            return 1

    failures = execute(client, plan)

    # On 8.0.1, delete_module orphans each module's tables and entity files;
    # sweep them so the next run starts clean. Needs an appliance SSH target.
    if plan.modules:
        appliance = build_appliance(file_env, args.instance)
        if appliance is not None:
            print("sweeping orphaned module tables and entity files...")
            sweep_orphans(appliance, [m["name"] for m in plan.modules])
        else:
            print("NOTE: no appliance SSH target (pass --instance, or set FSR_SSH_HOST/"
                  "FSR_SSH_KEY). On 8.0.1 delete_module leaves orphaned tables; clean them "
                  "with the console sweep in tools/LAB_OPERATOR.md, or the next create of the "
                  "same module name will fail.")

    if failures:
        print(f"{failures} step(s) failed; re-run --check-only to see what is left")
        return 1
    print("reset complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
