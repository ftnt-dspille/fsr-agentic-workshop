#!/usr/bin/env python3
"""LIVE TOOL. Prepares a FortiSOAR box for the workshop so a rerun is one command.

Three jobs, each a subcommand:

    check    report whether the box is ready: demo alerts present, and whether
             the API key's role can manage modules, connectors and playbooks.
    seed     create the demo alerts the labs investigate (idempotent: skips any
             that already exist by name). Uses the API key.
    grant    give the key's role the module-schema / connector / playbook rights
             the labs need. Privileged: needs admin credentials, not the key.

Pair with ``reset_lab.py`` (the destructive teardown). A full rerun is::

    python3 tools/reset_lab.py            # remove last run's objects
    python3 tools/lab_setup.py seed       # re-create the demo alerts

Connection comes from, in order of precedence: ``--instance NAME`` (a pyfsr
instance in ``~/.pyfsr/instances.toml``), then ``FSR_ENV_FILE`` (a KEY=VALUE
file), then the process environment:

    FSR_BASE_URL      https://fortisoar.example.com
    FSR_API_KEY       <api-key>                 (seed, check)
    FSR_USERNAME      <admin-login>             (grant; or for check/seed)
    FSR_PASSWORD      <admin-password>
    FSR_VERIFY_SSL    1 (default) or 0 for a self-signed appliance certificate

Requires the pyfsr package.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# What the labs need. Change these in one place.

ALERT_NAME_PREFIX = "Agent Lab - "  # reset_lab.py removes alerts with this prefix; matches the chapters' "Agent Lab - ..." names

# Repeatable lab artifacts. These are the same files students download and import
# (the "working version"); the seeders below install them so a rerun is one
# command. Paths are relative to the workshop repo root (this file's parent's
# parent).
REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = REPO_ROOT / "static" / "examples"
ORG_CONTEXT_DIR = EXAMPLES / "org-context"   # *.json org-context records (TOOL_LIST, ...)
AGENT_BUNDLE = EXAMPLES / "workshop_hello_agent"  # chapter 4 custom agent bundle
AGENT_NAME = "workshop_hello_agent"
MCP_DIR = EXAMPLES / "mcp-servers"           # *.json external MCP server registrations (ch5)
PLAYBOOK_DIR = EXAMPLES / "playbooks"        # *.yaml fsr_playbooks definitions (ch8)
MODULE_DIR = EXAMPLES / "modules"            # *.json custom module definitions (ch7)
RECORDS_DIR = EXAMPLES / "records"           # *.json record seeds per module (ch7)

# The demo alerts chapter 6 onward investigate. Picklist fields (type, status,
# severity, source) are given by name; pyfsr resolves them to IRIs on create.
DEMO_ALERTS: list[dict[str, Any]] = [
    {
        "name": "Suspicious PowerShell download cradle on FIN-WRKSTN-07",
        "type": "Phishing",
        "severity": "High",
        "source": "EDR",
        "description": "Encoded PowerShell spawned by a macro-enabled document "
                       "reached out to a newly registered domain and staged a "
                       "second-stage binary. Endpoint isolated pending triage.",
        "sourceIp": "203.0.113.24",
    },
    {
        "name": "Impossible-travel sign-in for j.okafor",
        "type": "Concurrent Login",
        "severity": "High",
        "source": "Identity Provider",
        "description": "Two successful sign-ins 40 minutes apart from cities "
                       "4,000 km apart. MFA satisfied on both. Session tokens "
                       "not yet revoked.",
        "sourceIp": "203.0.113.58",
    },
    {
        # The AI-investigation subject for chapters 3 and 10. The name and the C2
        # address match what those chapters search for and assert on; keep them in
        # step if you rename it.
        "name": "beaconing from web-server-01",
        "type": "Malware",
        "severity": "High",
        "source": "Firewall",
        "description": "Hourly HTTPS beacons from web-server-01 to 203.0.113.99 "
                       "since 02:00 UTC. Regular interval, low data volume, "
                       "destination in a feed-flagged command-and-control range.",
        "sourceIp": "203.0.113.99",
    },
    {
        "name": "Outbound beacon to known C2 range from 10-net host",
        "type": "Malware",
        "severity": "Medium",
        "source": "Firewall",
        "description": "Regular 60-second outbound connections to an address in "
                       "a feed-flagged command-and-control range. Low data "
                       "volume, consistent interval.",
        "sourceIp": "203.0.113.102",
    },
    {
        "name": "Mass file rename burst on the finance share",
        "type": "Malware",
        "severity": "Critical",
        "source": "File Server",
        "description": "Several thousand files on a single share renamed with a "
                       "uniform extension inside two minutes, by one account. "
                       "Possible ransomware staging.",
        "sourceIp": "203.0.113.17",
    },
    {
        "name": "Credential-stuffing spray against the VPN portal",
        "type": "Brute Force Attempts",
        "severity": "Low",
        "source": "VPN",
        "description": "High rate of failed logins across many usernames from a "
                       "small set of addresses, no successes yet. Rate limiting "
                       "engaged.",
        "sourceIp": "203.0.113.200",
    },
]

# Roles whose combined rights cover the whole workshop (module schema changes,
# connector install, playbook publish). Named, not UUID'd, so this stays
# box-independent. "grant" unions these onto the key's role.
WORKSHOP_RIGHT_ROLES = (
    "Application Administrator",
    "Security Administrator",
    "Playbook Administrator",
)


# ---------------------------------------------------------------------------
# Connection

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


def read_instance(name: str) -> dict[str, str]:
    """Resolve FSR_* settings from a pyfsr instance in ~/.pyfsr/instances.toml."""
    try:
        import tomllib
    except ModuleNotFoundError:  # py<3.11
        import tomli as tomllib  # type: ignore
    path = Path.home() / ".pyfsr" / "instances.toml"
    if not path.exists():
        sys.exit(f"lab_setup: {path} not found; --instance needs a pyfsr instances file")
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    inst = (data.get("instances") or data).get(name)
    if not inst:
        have = ", ".join((data.get("instances") or data).keys())
        sys.exit(f"lab_setup: instance '{name}' not in {path} (have: {have})")
    auth = inst.get("auth", {})
    out = {"FSR_BASE_URL": inst.get("base_url", "")}
    if auth.get("type") == "api_key" and auth.get("key"):
        out["FSR_API_KEY"] = auth["key"]
    if auth.get("username"):
        out["FSR_USERNAME"] = auth["username"]
    if auth.get("password"):
        out["FSR_PASSWORD"] = auth["password"]
    verify = inst.get("verify_ssl", inst.get("appliance", {}).get("verify_ssl"))
    out["FSR_VERIFY_SSL"] = "0" if verify is False else "1"
    return out


def setting(name: str, env: dict[str, str], default: str | None = None) -> str | None:
    return env.get(name) or os.environ.get(name) or default


def resolve_env(args) -> dict[str, str]:
    if getattr(args, "instance", None):
        return read_instance(args.instance)
    return read_env_file(os.environ.get("FSR_ENV_FILE"))


def build_client(env: dict[str, str], *, require_admin: bool = False):
    from pyfsr import FortiSOAR

    base = setting("FSR_BASE_URL", env)
    if not base:
        sys.exit("lab_setup: FSR_BASE_URL is required")
    verify = (setting("FSR_VERIFY_SSL", env, "1") or "1").lower() not in ("0", "false", "no")
    if not verify or (setting("FSR_SUPPRESS_INSECURE_WARNINGS", env) or "").lower() in ("1", "true", "yes"):
        try:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        except Exception:
            pass
    user = setting("FSR_USERNAME", env)
    password = setting("FSR_PASSWORD", env)
    if require_admin:
        if not (user and password):
            sys.exit("lab_setup: grant needs FSR_USERNAME and FSR_PASSWORD (admin)")
        return FortiSOAR(base, username=user, password=password, verify_ssl=verify)
    # Prefer a user (JWT) login: it is required for install labs (Content Hub /
    # solution-pack / connector installs are not supported with an API key).
    # Fall back to an API key only when no user creds are set.
    if user and password:
        return FortiSOAR(base, username=user, password=password, verify_ssl=verify)
    api_key = setting("FSR_API_KEY", env)
    if api_key:
        return FortiSOAR(base, api_key=api_key, verify_ssl=verify)
    sys.exit("lab_setup: set FSR_USERNAME and FSR_PASSWORD (preferred), or FSR_API_KEY")


# ---------------------------------------------------------------------------
# seed

def existing_alert_names(client) -> set[str]:
    out: set[str] = set()
    for rec in client.records("alerts").iterate(raw=True):
        name = rec.get("name") or ""
        if name.startswith(ALERT_NAME_PREFIX):
            out.add(name)
    return out


def cmd_seed(client) -> int:
    have = existing_alert_names(client)
    created = skipped = failed = 0
    for spec in DEMO_ALERTS:
        full = ALERT_NAME_PREFIX + spec["name"]
        if full in have:
            print(f"skip (exists): {full}")
            skipped += 1
            continue
        payload = dict(spec, name=full)
        try:
            client.alerts.create(resolve_picklists=True, **payload)
            print(f"created: {full}")
            created += 1
        except Exception as exc:  # keep going; report at the end
            print(f"FAILED: {full}: {exc}")
            failed += 1
    print(f"\nseed: {created} created, {skipped} already present, {failed} failed")
    return 1 if failed else 0


# ---------------------------------------------------------------------------
# org-context (TOOL_LIST and any other records the labs need)

def existing_org_context(client) -> dict[tuple[str, str], dict]:
    """Map (category, subCategory) -> record for every org-context record."""
    out: dict[tuple[str, str], dict] = {}
    res = client.get("/api/3/organizational_contexts", params={"$limit": 500})
    members = res.get("hydra:member", res) if isinstance(res, dict) else res
    for rec in members or []:
        out[(rec.get("category"), rec.get("subCategory"))] = rec
    return out


def org_context_artifacts() -> list[dict]:
    """Load every org-context record definition shipped under static/examples."""
    if not ORG_CONTEXT_DIR.is_dir():
        return []
    specs = []
    for path in sorted(ORG_CONTEXT_DIR.glob("*.json")):
        specs.append(json.loads(path.read_text(encoding="utf-8")))
    return specs


# The learner's row from chapter 4 page 02 (fsa04-02): the tenth line of TOOL_LIST,
# naming the hello agent so the investigation planner asks it a question.
HELLO_TOOL_ROW = "| Workshop host lookup | Workshop Hello Agent | host | Yes |"


def cmd_tool_list_row(client) -> int:
    """Append the hello agent's row to TOOL_LIST, keeping every other row (idempotent).

    Without it no investigation question targets the custom agent, so the
    fsa04-03 route check cannot pass.
    """
    rec = existing_org_context(client).get(("INFRA_INFO", "TOOL_LIST"))
    if rec is None:
        print("tool-list-row: no TOOL_LIST record; run org-context first")
        return 1
    content = (rec.get("content") or "").rstrip()
    if HELLO_TOOL_ROW in content:
        print("skip (exists): TOOL_LIST hello row")
        return 0
    client.put(rec["@id"], data={"content": f"{content}\n{HELLO_TOOL_ROW}\n"})
    print("added: TOOL_LIST hello row")
    return 0


def cmd_org_context(client) -> int:
    """Create the shipped org-context records (idempotent by category+subCategory).

    Create-only: an existing record is left untouched, so a hand-edited TOOL_LIST
    is never clobbered. Delete it first if you want the shipped version back.
    """
    specs = org_context_artifacts()
    if not specs:
        print(f"org-context: no artifacts in {ORG_CONTEXT_DIR}")
        return 0
    have = existing_org_context(client)
    created = skipped = failed = 0
    for spec in specs:
        key = (spec.get("category"), spec.get("subCategory"))
        label = f"{key[0]}/{key[1]}"
        if key in have:
            print(f"skip (exists): {label}")
            skipped += 1
            continue
        try:
            client.post("/api/3/organizational_contexts", data=spec)
            print(f"created: {label}")
            created += 1
        except Exception as exc:
            print(f"FAILED: {label}: {exc}")
            failed += 1
    print(f"\norg-context: {created} created, {skipped} already present, {failed} failed")
    return 1 if failed else 0


# ---------------------------------------------------------------------------
# install-agent (chapter 4 custom AI agent bundle)

def agent_installed(client, name: str) -> bool:
    try:
        return any(a.name == name for a in client.ai.list_agents())
    except Exception:
        return False


def zip_bundle(bundle_dir: Path) -> Path:
    """Zip a bundle folder so the archive's top folder == the folder name."""
    import tempfile, zipfile
    out = Path(tempfile.mkdtemp(prefix="labseed-")) / f"{bundle_dir.name}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in bundle_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(bundle_dir.parent))
    return out


def cmd_install_agent(client) -> int:
    """Import the chapter-4 hello agent via POST /ai/agent/import (idempotent).

    Uses ?replace=true so a rerun refreshes the bundle. The bundle is the same
    folder students download and zip, so the seed path and the student path never
    drift.
    """
    if not AGENT_BUNDLE.is_dir():
        print(f"install-agent: bundle not found at {AGENT_BUNDLE}")
        return 1
    if agent_installed(client, AGENT_NAME):
        print(f"skip (installed): {AGENT_NAME}")
        return 0
    try:
        # pyfsr posts the multipart upload straight to fsr-ai (the /api/ai gateway
        # drops multipart bodies), then activates the agent.
        rec = client.ai.install_agent(str(AGENT_BUNDLE), replace=True, activate=True)
        print(f"install-agent: {AGENT_NAME} installed (active={getattr(rec, 'active', '?')})")
        return 0
    except Exception as exc:
        print(f"install-agent FAILED: {exc}")
        return 1


# ---------------------------------------------------------------------------
# mcp-server (ch5: register external MCP servers), records (ch7 record seeds)

def cmd_mcp_server(client) -> int:
    """Register the shipped external MCP servers (idempotent by name).

    Reads static/examples/mcp-servers/*.json and POSTs /api/3/mcp_configurations
    via pyfsr. `authentication` must be a JSON STRING (an object is stored as the
    text "Array" and breaks the status route for every server), so serialize it
    if the artifact left it as an object. Create-only. Does not grant the server
    to an agent; that stays a ch5 UI step.
    """
    if not MCP_DIR.is_dir():
        print(f"mcp-server: no artifacts in {MCP_DIR}")
        return 0
    res = client.get("/api/3/mcp_configurations", params={"$limit": 200})
    members = res.get("hydra:member", res) if isinstance(res, dict) else res
    have = {r.get("name") for r in (members or [])}
    created = skipped = failed = 0
    for path in sorted(MCP_DIR.glob("*.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(spec.get("authentication"), str):
            spec["authentication"] = json.dumps(spec.get("authentication") or {"type": "none"})
        if spec.get("name") in have:
            print(f"skip (exists): {spec['name']}")
            skipped += 1
            continue
        try:
            client.post("/api/3/mcp_configurations", data=spec)
            print(f"created: {spec['name']}")
            created += 1
        except Exception as exc:
            print(f"FAILED: {spec.get('name')}: {exc}")
            failed += 1
    print(f"\nmcp-server: {created} created, {skipped} already present, {failed} failed")
    return 1 if failed else 0


def cmd_lab_records(client) -> int:
    """Seed records from static/examples/records/*.json (idempotent by key field).

    Each artifact gives {module, key, records}. Uses pyfsr's generic record
    create with picklist resolution. Create-only: an existing key is skipped.
    Requires the record's module to exist (seed it first).
    """
    if not RECORDS_DIR.is_dir():
        print(f"records: no artifacts in {RECORDS_DIR}")
        return 0
    created = skipped = failed = 0
    for path in sorted(RECORDS_DIR.glob("*.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        mod, key = spec["module"], spec["key"]
        try:
            res = client.get(f"/api/3/{mod}", params={"$limit": 500})
            members = res.get("hydra:member", res) if isinstance(res, dict) else res
            have = {r.get(key) for r in (members or [])}
        except Exception as exc:
            print(f"FAILED: list {mod}: {exc} (does the module exist? seed lab-module first)")
            failed += 1
            continue
        for rec in spec["records"]:
            if rec.get(key) in have:
                print(f"skip (exists): {mod}/{rec[key]}")
                skipped += 1
                continue
            try:
                client.records(mod).create(resolve_picklists=True, **rec)
                print(f"created: {mod}/{rec[key]}")
                created += 1
            except Exception as exc:
                print(f"FAILED: {mod}/{rec.get(key)}: {exc}")
                failed += 1
    print(f"\nrecords: {created} created, {skipped} already present, {failed} failed")
    return 1 if failed else 0


# ---------------------------------------------------------------------------
# reset-alerts (ch7: bulk triage starts from exactly the seeded demo set, Open)

def cmd_reset_alerts(client) -> int:
    """Return the "Agent Lab" alerts to the seeded demo set, every one Open.

    Earlier chapters and reruns leave extra alerts behind (ch2's orientation
    alert, ch7 markers, duplicate seeds). Deletes every alert whose name starts
    with "Agent Lab" and is not a demo alert, keeps the OLDEST copy of each demo
    alert (the one earlier chapters investigated) and deletes the rest, seeds any
    that are missing, then sets the demo alerts' status to Open.
    """
    demo = {ALERT_NAME_PREFIX + s["name"] for s in DEMO_ALERTS}
    rows = [r for r in client.records("alerts").iterate(raw=True)
            if (r.get("name") or "").startswith("Agent Lab")]
    rows.sort(key=lambda r: r.get("createDate") or 0)
    kept: dict[str, dict] = {}
    doomed: list[dict] = []
    for r in rows:
        name = r.get("name") or ""
        if name in demo and name not in kept:
            kept[name] = r
        else:
            doomed.append(r)
    failed = 0
    for r in doomed:
        try:
            client.records("alerts").delete(r["uuid"], hard=True)
            print(f"deleted: {r.get('name')}")
        except Exception as exc:
            print(f"FAILED delete: {r.get('name')}: {exc}")
            failed += 1
    if len(kept) < len(demo) and cmd_seed(client):
        failed += 1
    alerts = client.records("alerts")
    for r in alerts.iterate(raw=True):
        if (r.get("name") or "") in demo:
            try:
                spec = next(d for d in DEMO_ALERTS if ALERT_NAME_PREFIX + d["name"] == r.get("name"))
                # Restore the seeded description too: a playbook may have edited it.
                alerts.update(r["uuid"], {"status": "Open", "description": spec["description"]})
            except Exception as exc:
                print(f"FAILED reopen: {r.get('name')}: {exc}")
                failed += 1
    print(f"reset-alerts: {len(doomed)} removed, {len(demo)} demo alerts Open, {failed} failed")
    return 1 if failed else 0


# ---------------------------------------------------------------------------
# delete-records (a page that has the agent create a record starts without it)

def cmd_delete_records(client, module: str, field: str, value: str) -> int:
    """Delete every record in `module` whose `field` equals `value` (exact).

    A page that asks the agent to create a named record would otherwise add a
    duplicate on every rerun. A no-op when none match. Hard delete: a soft-deleted
    playbook sits in the recycle bin and the agent's next publish restores it, so
    the run reports an existing playbook overwritten instead of a new one.
    """
    recs = client.records(module)
    hits = [r for r in recs.iterate(raw=True) if r.get(field) == value]
    for r in hits:
        recs.delete(r["uuid"], hard=True)
    print(f"delete-records: {len(hits)} {module} with {field}={value} removed")
    return 0


def cmd_delete_prefix(client, module: str, field: str, prefix: str) -> int:
    """Delete every record in `module` whose `field` starts with `prefix`.

    For pages where the agent names its own test records under a prefix. Hard
    delete, as in cmd_delete_records.
    """
    recs = client.records(module)
    hits = [r for r in recs.iterate(raw=True) if str(r.get(field) or "").startswith(prefix)]
    for r in hits:
        recs.delete(r["uuid"], hard=True)
    print(f"delete-prefix: {len(hits)} {module} with {field} starting {prefix!r} removed")
    return 0


# ---------------------------------------------------------------------------
# reset-connector (ch9: a hub-install page starts from "not installed yet")

def cmd_reset_connector(client, name: str) -> int:
    """Uninstall every installed version of a connector, then wait until it is gone.

    The ch9 Content Hub page has the agent install a connector the box does not
    have, so a rerun first returns the box to that state. A no-op when absent.
    """
    import time

    def installed():
        return [c for c in client.connectors.list_configured(refresh=True) if c.name == name]

    for c in installed():
        try:
            client.connectors.uninstall(name, version=c.version)
            print(f"uninstalled: {name} {c.version}")
        except Exception as exc:
            print(f"reset-connector FAILED: {name} {c.version}: {exc}")
            return 1
    for _ in range(90):
        if not installed():
            print(f"reset-connector: {name} not installed")
            return 0
        time.sleep(2)
    print(f"reset-connector FAILED: {name} still listed after 180s")
    return 1


# ---------------------------------------------------------------------------
# check

# code-snippet (ch8: a Python code step fails at run time without a configuration)

CODE_SNIPPET_CONFIG = "Agent Lab"


def cmd_code_snippet(client) -> int:
    """Give code-snippet a default configuration (only json importable), idempotently.

    Python code steps run through the code-snippet connector. With no
    configuration on the box every such step fails at run time with
    INTEGRATION-12, after the playbook compiled and published cleanly; with
    Custom Code Execution off they fail with "Custom Code Execution is disabled".
    """
    try:
        client.system_settings.set_custom_code_execution(True)
    except Exception as exc:  # noqa: BLE001 - report and fail the step
        print(f"code-snippet FAILED: could not enable Custom Code Execution: {exc}")
        return 1
    print("code-snippet: Custom Code Execution is on")
    try:
        client.connectors.ensure_configured(
            "code-snippet", {"allow_imports": False, "restrict_imports": "json"}, config_name=CODE_SNIPPET_CONFIG, default=True)
    except Exception as exc:  # noqa: BLE001 - report and fail the step
        print(f"code-snippet FAILED: {exc}")
        return 1
    print(f"code-snippet: configuration {CODE_SNIPPET_CONFIG!r} is the default")
    return 0


def cmd_check(client) -> int:
    print("connection: ok" if client else "connection: FAILED")
    have = existing_alert_names(client)
    print(f"demo alerts: {len(have)}/{len(DEMO_ALERTS)} present")
    for spec in DEMO_ALERTS:
        full = ALERT_NAME_PREFIX + spec["name"]
        print(f"  [{'x' if full in have else ' '}] {spec['name']}")
    if len(have) < len(DEMO_ALERTS):
        print("  -> run: python3 tools/lab_setup.py seed")
    try:
        has = bool(client.connectors.configurations("code-snippet"))
    except Exception:  # noqa: BLE001 - not installed reads the same as unconfigured
        has = False
    try:
        code_on = client.system_settings.get_development_mode().get("connectors", False)
    except Exception:  # noqa: BLE001 - unreadable reads the same as off
        code_on = False
    print(f"custom code execution: {'on' if code_on else 'OFF'}")
    print(f"code-snippet configuration: {'present' if has else 'MISSING'}")
    if not has or not code_on:
        print("  -> run: python3 tools/lab_setup.py code-snippet")
    # Permission probe: can this principal see the module-schema module?
    try:
        mods = {m.get("plural") or m.get("name") for m in client.modules.list()}
        schema_visible = "staging_model_metadatas" in mods or any(
            "model_metadata" in (m or "") for m in mods)
        print(f"module-schema access: {'likely' if schema_visible else 'unknown (probe at seed time)'}")
    except Exception as exc:
        print(f"module list failed: {exc}")
    return 0


# ---------------------------------------------------------------------------
# grant

def cmd_grant(admin_client, env: dict[str, str]) -> int:
    """Union the workshop-rights roles' permissions onto the key's role.

    Needs the key's role name; the simplest portable input is the role the key
    was created with. We read it from FSR_KEY_ROLE (set it to the role you named
    the key with, e.g. 'Full App Permissions').
    """
    target = setting("FSR_KEY_ROLE", env, "Full App Permissions")
    roles = admin_client.roles
    try:
        target_uuid = roles.role_uuid_by_name(target)
    except Exception as exc:
        sys.exit(f"lab_setup: cannot resolve role '{target}': {exc}")
    print(f"target role: {target} ({target_uuid})")
    granted = 0
    for src in WORKSHOP_RIGHT_ROLES:
        try:
            perms = roles.module_permissions(roles.role_uuid_by_name(src))
            roles.grant_module_permissions(target_uuid, perms)
            print(f"  unioned rights from: {src}")
            granted += 1
        except Exception as exc:
            print(f"  FAILED from {src}: {exc}")
    try:
        roles.invalidate_module_cache()
    except Exception:
        pass
    print(f"grant: unioned {granted}/{len(WORKSHOP_RIGHT_ROLES)} role(s) onto {target}")
    print("note: role changes take effect on the key's next request.")
    return 0


# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Prepare a FortiSOAR box for the workshop (seed, check, grant).")
    ap.add_argument("--instance", help="pyfsr instance name in ~/.pyfsr/instances.toml")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="report readiness, change nothing")
    sub.add_parser("seed", help="create the demo alerts (idempotent)")
    sub.add_parser("org-context", help="create the shipped org-context records, e.g. TOOL_LIST (idempotent)")
    sub.add_parser("tool-list-row", help="add the hello agent's row to TOOL_LIST, keeping the defaults (idempotent)")
    sub.add_parser("install-agent", help="import the chapter-4 hello agent bundle (idempotent)")
    sub.add_parser("mcp-server", help="register the shipped external MCP servers (idempotent)")
    sub.add_parser("records", help="seed records from static/examples/records (idempotent)")
    sub.add_parser("code-snippet", help="turn on Custom Code Execution and give code-snippet a default configuration (idempotent)")
    sub.add_parser("grant", help="union workshop rights onto the key's role (needs admin creds)")
    sub.add_parser("reset-alerts", help="return the Agent Lab alerts to the demo set, all Open")
    dr = sub.add_parser("delete-records", help="delete records whose field equals a value")
    dr.add_argument("module"); dr.add_argument("field"); dr.add_argument("value")
    dp = sub.add_parser("delete-prefix", help="delete records whose field starts with a prefix")
    dp.add_argument("module"); dp.add_argument("field"); dp.add_argument("prefix")
    rc = sub.add_parser("reset-connector", help="uninstall a connector so a hub-install lab starts clean")
    rc.add_argument("name")
    args = ap.parse_args(argv)

    env = resolve_env(args)
    if args.cmd == "grant":
        client = build_client(env, require_admin=True)
        return cmd_grant(client, env)
    client = build_client(env)
    if args.cmd == "seed":
        return cmd_seed(client)
    if args.cmd == "org-context":
        return cmd_org_context(client)
    if args.cmd == "tool-list-row":
        return cmd_tool_list_row(client)
    if args.cmd == "install-agent":
        return cmd_install_agent(client)
    if args.cmd == "mcp-server":
        return cmd_mcp_server(client)
    if args.cmd == "records":
        return cmd_lab_records(client)
    if args.cmd == "delete-records":
        return cmd_delete_records(client, args.module, args.field, args.value)
    if args.cmd == "delete-prefix":
        return cmd_delete_prefix(client, args.module, args.field, args.prefix)
    if args.cmd == "reset-alerts":
        return cmd_reset_alerts(client)
    if args.cmd == "code-snippet":
        return cmd_code_snippet(client)
    if args.cmd == "reset-connector":
        return cmd_reset_connector(client, args.name)
    return cmd_check(client)


if __name__ == "__main__":
    sys.exit(main())
