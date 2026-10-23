#!/usr/bin/env python3
"""Agent-drive proof tier: run the pages' exact prompts through Claude Code.

LIVE TOOL, user-run, consumes Claude credits.

Each "Give your agent this prompt" block is one prompt, id ``<chapter>/<page>#<n>``.
A prompt passes only when its BEHAVIOR (the tool calls it made, see MANIFEST) and
its BOX EFFECT (the e2e step(s) in MANIFEST, run as Playwright steps) both hold.
Exit codes of ``claude`` are never the verdict.

Selection (ledger in ``.results.json``, gitignored, keyed by prompt id + box host +
prompt text sha256):
  default          run prompts with no pass recorded for the current text and box
  CHAPTER=<dir>    restrict candidates to one chapter folder
  PROMPT=<id>      run exactly that prompt (always, even if it passed before)
  FORCE=1          run every candidate
  --plan           print what would run and why; makes no calls

Usage:
    python3 tools/agent-drive/run.py --env-file <path> [--plan] [--chapter X] [--prompt ID] [--force]
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTENT = REPO_ROOT / "content"
HERE = Path(__file__).resolve().parent
E2E = REPO_ROOT / "tools" / "e2e"
LEDGER = HERE / ".results.json"
SESSIONS = HERE / ".sessions.json"  # gitignored: session ids of prompts other prompts continue
WORK = HERE / ".work"          # stable work folder: 09's files persist across prompts
TRANSCRIPTS = HERE / ".transcripts"  # gitignored stream-json per prompt

PROMPT_HEADING = re.compile(r"Give your agent this prompt", re.IGNORECASE)
FENCE = re.compile(r"```text\n(.*?)```", re.DOTALL)
# Baseline model for the proof. A run on any other model is recorded but does not
# satisfy the baseline (the selection key includes the model).
DEFAULT_MODEL = "claude-sonnet-5-5"
LAB_SERVER = "fortisoar-lab"
TOOL_PREFIX = f"mcp__{LAB_SERVER}__"

PREAMBLE = (
    "You are running unattended in a disposable FortiSOAR lab as part of a "
    "workshop verification run. Use only the fortisoar MCP tools. When a tool "
    "returns confirmation_required, you may retry it with confirm=true without "
    "asking. Be concise. Task:\n\n"
)

# Behavior + effect per prompt id. "calls" is the required tool-name subsequence
# (names without the server prefix). "effect" names the spec and the e2e steps
# that assert the box state (run with FSR_ONLY_STEPS). "local" is a work-folder
# check for prompts with no box effect. "confirm_ok" lists tools that may carry
# confirm=true (the page says the agent must confirm them); any other gated call
# with confirm=true is a behavior failure.
MANIFEST: dict[str, dict] = {
    "06-setup-agent/02-wire-the-agent#1": {
        "calls": ["whoami"], "confirm_ok": [],
        "answer": ["version", "module"],
        "effect": ("06-setup-agent.spec.js", ["fsa06-04-whoami"]),
    },
    "07-users-modules-records/01-create-a-user#1": {
        "calls": ["create_user", "query_records"], "confirm_ok": ["create_user"],
        "answer": ["agentlab_analyst"],
        "effect": ("07-users-modules-records.spec.js", ["fsa07-01-create-user"]),
    },
    "07-users-modules-records/02-create-a-module#1": {
        "calls": ["create_module", "publish", "describe_module"], "confirm_ok": ["publish"],
        "answer": ["build-server-01"],
        "effect": ("07-users-modules-records.spec.js", ["fsa07-02-create-module"]),
    },
    "07-users-modules-records/03-work-with-records#1": {
        "calls": ["get_or_create_record", "query_records"], "confirm_ok": [],
        "answer": ["db-server-01", "jump-host-01"],
        "effect": ("07-users-modules-records.spec.js", ["fsa07-03-seed-records"]),
    },
    "07-users-modules-records/03-work-with-records#2": {
        "calls": ["record_lifecycle"], "confirm_ok": [],
        "answer": ["create"],
        "effect": ("07-users-modules-records.spec.js", ["fsa07-04-record-lifecycle"]),
    },
    "08-playbook/01-author-and-publish#1": {
        "calls": ["compile_playbook_yaml"], "confirm_ok": [], "forbid": ["publish_playbook"],
        "answer": ["Tag Agent Lab Alerts"],
        "effect": ("08-playbook.spec.js", ["fsa08-01-compile-yaml"]),
    },
    "08-playbook/01-author-and-publish#2": {
        "calls": ["publish_playbook"], "confirm_ok": [],
        "continues": "08-playbook/01-author-and-publish#1",  # the page writes #2 as a follow-up turn
        "answer": ["published"],
        "effect": ("08-playbook.spec.js", ["fsa08-02-publish-playbook"]),
    },
    "08-playbook/02-trigger-and-verify#1": {
        "calls": ["create_record", "wait_for_playbook_run", "get_record"], "confirm_ok": [],
        "answer": ["Triaged automatically"],
        "effect": ("08-playbook.spec.js", ["fsa08-03-trigger-and-verify"]),
    },
    "09-connectors/01-explore-and-run#1": {
        "calls": ["list_connectors", "healthcheck_connector", "list_connector_operations"], "confirm_ok": [],
        "answer": ["Available"],
        "effect": ("09-connectors.spec.js", ["fsa09-01-discover-connectors"]),
    },
    "09-connectors/01-explore-and-run#2": {
        "calls": ["run_connector_operation"], "confirm_ok": [],
        "answer": ["operation"],
        "effect": ("09-connectors.spec.js", ["fsa09-02-run-operation"]),
    },
    # Chapter 9 build prompts are Claude Code work (students have Bash): Bash is
    # allowed only for the pyfsr CLI, and Read/Write/Edit run in the work folder
    # (the runner's cwd). "bash" lists substrings that some Bash call must contain.
    "09-connectors/02-build-a-connector#1": {
        "calls": [], "confirm_ok": [],
        "bash": ["pyfsr connector scaffold"],
        "tools": ["Bash(pyfsr:*)", "Read({work}/**)", "Write({work}/**)", "Edit({work}/**)"],
        "local": "greet",  # work folder agentlab-greeter/operations.py defines greet
        "answer": ["greet"],
    },
    "09-connectors/02-build-a-connector#2": {
        "calls": ["install_connector", "upsert_connector_configuration", "healthcheck_connector"],
        "confirm_ok": ["install_connector"],
        "bash": ["pyfsr connector package"],
        "tools": ["Bash(pyfsr:*)", "Read({work}/**)", "Write({work}/**)", "Edit({work}/**)"],
        "answer": ["Available"],
        "local": "tgz",  # a .tgz exists in the work folder
        "effect": ("09-connectors.spec.js", ["fsa09-04-deploy-connector"]),
    },
    "09-connectors/02-build-a-connector#3": {
        "calls": ["run_connector_operation"], "confirm_ok": [],
        "answer": ["Hello TEC Workshop from FortiSOAR"],
        "effect": ("09-connectors.spec.js", ["fsa09-05-run-own-connector"]),
    },
    "10-capstone-investigation/01-capstone#1": {
        "calls": ["create_record"], "confirm_ok": [],
        "answer": ["beaconing"],
        "effect": ("10-capstone-investigation.spec.js", ["fsa10-01-stage-alert"]),
    },
    "10-capstone-investigation/01-capstone#2": {
        "calls": ["search_records", "update_record"], "confirm_ok": [],
        "forbid": ["close"],
        "answer": ["verdict", "confidence"],
        "effect": ("10-capstone-investigation.spec.js", ["fsa10-02-investigate"]),
    },
}


@dataclass
class Prompt:
    pid: str
    page: Path
    text: str
    sha: str = ""

    def __post_init__(self) -> None:
        self.sha = hashlib.sha256(self.text.encode()).hexdigest()


def prompts_in(page: Path) -> list[str]:
    """Each 'Give your agent this prompt' heading's FIRST following text fence."""
    text = page.read_text()
    out: list[str] = []
    for h in PROMPT_HEADING.finditer(text):
        m = FENCE.search(text, h.end())
        if m:
            out.append(m.group(1).strip())
    return out


def chapter_pages() -> list[Path]:
    pages = []
    for d in sorted(d for d in CONTENT.iterdir() if d.is_dir()):
        pages.extend(sorted(p for p in d.glob("*.md") if p.name != "_index.md"))
    return pages


def all_prompts() -> list[Prompt]:
    out = []
    for page in chapter_pages():
        for n, text in enumerate(prompts_in(page), 1):
            out.append(Prompt(f"{page.parent.name}/{page.stem}#{n}", page, text))
    return out


def load_env_file(path: str | None) -> None:
    """Load KEY=VALUE pairs into os.environ without overriding set values. Never prints."""
    if not path:
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def box_host() -> str:
    base = os.environ.get("FSR_BASE_URL", "")
    if not base:
        sys.exit("FSR_BASE_URL must be set (use --env-file)")
    return (urlparse(base if "://" in base else f"https://{base}").hostname or "").lower()


# -- ledger -------------------------------------------------------------------
def load_ledger(path: Path = LEDGER) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text()).get("results", [])


def save_ledger(results: list[dict], path: Path = LEDGER) -> None:
    path.write_text(json.dumps({"results": results}, indent=2) + "\n")


def record(results: list[dict], prompt: Prompt, box: str, outcome: str, detail: str, commit: str,
           model: str = DEFAULT_MODEL) -> dict:
    row = {
        "id": prompt.pid,
        "outcome": outcome,  # pass | fail | blocked
        "box": box,
        "date": dt.date.today().isoformat(),
        "prompt_sha256": prompt.sha,
        "page_commit": commit,
        "model": model,
        "detail": detail,
    }
    results.append(row)
    return row


def passed(results: list[dict], prompt: Prompt, box: str, model: str = DEFAULT_MODEL) -> dict | None:
    for row in reversed(results):
        if (row["id"] == prompt.pid and row["box"] == box and row["prompt_sha256"] == prompt.sha
                and row.get("model") == model):
            return row if row["outcome"] == "pass" else None
    return None


def page_commit(page: Path) -> str:
    try:
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "log", "-1", "--format=%h", "--", str(page)],
                             capture_output=True, text=True, timeout=20)
        return out.stdout.strip() or "uncommitted"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


# -- selection ----------------------------------------------------------------
@dataclass
class Choice:
    prompt: Prompt
    run: bool
    reason: str


def select(prompts: list[Prompt], results: list[dict], box: str, *, model: str = DEFAULT_MODEL,
           chapter: str | None = None,
           prompt_id: str | None = None, force: bool = False) -> list[Choice]:
    if prompt_id and prompt_id not in {p.pid for p in prompts}:
        sys.exit(f"no prompt with id {prompt_id!r}; ids look like 07-users-modules-records/02-create-a-module#1")
    out: list[Choice] = []
    for p in prompts:
        if prompt_id:
            if p.pid == prompt_id:
                out.append(Choice(p, True, "named with PROMPT"))
            continue
        if chapter and p.page.parent.name != chapter:
            continue
        if force:
            out.append(Choice(p, True, "FORCE=1"))
            continue
        prev_any = [r for r in results if r["id"] == p.pid and r["box"] == box and r.get("model") == model]
        ok = passed(results, p, box, model)
        if ok:
            out.append(Choice(p, False, f"passed {ok['date']} on this box, model {model}, with this prompt text"))
        elif prev_any and prev_any[-1]["prompt_sha256"] != p.sha:
            out.append(Choice(p, True, "prompt text changed since its last result"))
        elif prev_any:
            out.append(Choice(p, True, f"last outcome {prev_any[-1]['outcome']}, no pass recorded"))
        else:
            out.append(Choice(p, True, "no result recorded on this box"))
    return out


# -- box identity preflight ---------------------------------------------------
def fortisoar_lab_server() -> dict:
    """The toolkit's MCP server (fsr-agentic-toolkit mcp), found beside FSR_PYTHON or on PATH."""
    py = os.environ.get("FSR_PYTHON")
    exe = None
    if py:
        cand = Path(py).parent / "fsr-agentic-toolkit"
        if cand.exists():
            exe = str(cand)
    exe = exe or shutil.which("fsr-agentic-toolkit")
    server = ({"command": exe, "args": ["mcp"]} if exe else
              {"command": "uvx", "args": ["--from", "fsr-agentic-toolkit", "fsr-agentic-toolkit", "mcp"]})
    server["env"] = {
        # the server prefers ~/.pyfsr/instances.toml (its default alias can be another
        # box). Point it at a path that does not exist so it uses the env file's box.
        "PYFSR_INSTANCES": str(WORK / "no-instances.toml"),
        "FSR_BASE_URL": os.environ["FSR_BASE_URL"],
        "FSR_API_KEY": os.environ["FSR_API_KEY"],
        "FSR_VERIFY_SSL": os.environ.get("FSR_VERIFY_SSL", "false"),
        "FSR_SUPPRESS_INSECURE_WARNINGS": "true",
    }
    return server


def mcp_whoami(server: dict, timeout: int = 120) -> dict:
    """One whoami call over stdio to the same server config claude will load (no LLM)."""
    proc = subprocess.Popen([server["command"], *server.get("args", [])], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                            env={**os.environ, **server["env"]})
    timer = threading.Timer(timeout, proc.kill)
    timer.start()

    def send(msg: dict) -> None:
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()

    def await_id(req_id: int) -> dict:
        while True:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP server closed before answering")
            msg = json.loads(line)
            if msg.get("id") == req_id:
                return msg

    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "agent-drive-preflight", "version": "1"}}})
        await_id(1)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "whoami", "arguments": {}}})
        resp = await_id(2)
    finally:
        timer.cancel()
        proc.kill()
    if "error" in resp or resp.get("result", {}).get("isError"):
        raise RuntimeError(f"whoami failed: {str(resp)[:300]}")
    res = resp["result"]
    if res.get("structuredContent"):
        return res["structuredContent"]
    return json.loads(res["content"][0]["text"])


def preflight(server: dict, expected_host: str) -> None:
    who = mcp_whoami(server)
    if "error" in who:
        # whoami can fail for reasons that say nothing about the target (its auth probe is
        # unsupported with an API key; the box can answer 503 mid-publish). The server env is
        # built from the env file and the registry is pinned off, so check that config instead.
        got = (urlparse(server["env"]["FSR_BASE_URL"]).hostname or "").lower()
        if got != expected_host or "PYFSR_INSTANCES" not in server["env"]:
            raise SystemExit("ABORT: the fortisoar-lab server config does not target the env file's box; "
                             "no prompt was run.")
        print(f"preflight (config-level; whoami auth is unsupported with an API key): "
              f"fortisoar-lab targets the env file's box ({expected_host})")
        return
    got = (urlparse(who.get("base_url") or "").hostname or "").lower()
    if got != expected_host:
        raise SystemExit("ABORT: the fortisoar-lab server answered for a different box than the env file; "
                         "no prompt was run. Check the server config before rerunning.")
    print(f"preflight: fortisoar-lab server identifies the env file's box ({expected_host}); "
          f"user {who.get('user', {}).get('loginid', '?')}")


# -- running ------------------------------------------------------------------
def make_workdir(server: dict) -> Path:
    WORK.mkdir(exist_ok=True)
    cfg = WORK / ".mcp.json"
    cfg.write_text(json.dumps({"mcpServers": {LAB_SERVER: server}}, indent=2))
    cfg.chmod(0o600)
    return WORK


def run_env() -> dict:
    """Environment for claude and its Bash calls: the pyfsr CLI sits beside FSR_PYTHON."""
    env = dict(os.environ)
    py = os.environ.get("FSR_PYTHON", "")
    if py and os.sep in py:
        env["PATH"] = f"{Path(py).parent}{os.pathsep}{env.get('PATH', '')}"
    return env


def session_id(events: list[dict]) -> str | None:
    for ev in events:
        if ev.get("session_id"):
            return str(ev["session_id"])
    return None


def load_sessions(path: Path = SESSIONS) -> dict[str, str]:
    return json.loads(path.read_text()) if path.exists() else {}


def save_sessions(sessions: dict[str, str], path: Path = SESSIONS) -> None:
    path.write_text(json.dumps(sessions, indent=2) + "\n")


def run_claude(work: Path, prompt: str, extra_tools: list[str] | None = None,
                model: str = DEFAULT_MODEL, resume: str | None = None) -> tuple[int, list[dict], str]:
    """Run claude -p with stream-json; returns (rc, events, stderr tail)."""
    # {work} in a rule is the work folder. These rules PRE-APPROVE file tools under that
    # folder; they are not a sandbox, and built-in tools not listed here can still run.
    # Absolute rule paths take the // prefix. Bare Read/Write/Edit are never pre-approved.
    scoped = [t.replace("{work}", "/" + str(work.resolve()).lstrip("/")) for t in (extra_tools or [])]
    allowed = [f"{TOOL_PREFIX}*", *scoped]
    cmd = ["claude", "-p", PREAMBLE + prompt, "--model", model, "--output-format", "stream-json", "--verbose",
           *(["--resume", resume] if resume else []),
           "--mcp-config", str(work / ".mcp.json"), "--strict-mcp-config",
           "--allowedTools", ",".join(allowed)]
    proc = subprocess.run(cmd, cwd=work, text=True, capture_output=True, timeout=1800, env=run_env())
    events = []
    for line in proc.stdout.splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return proc.returncode, events, proc.stderr[-2000:]


def tool_calls(events: list[dict]) -> list[dict]:
    calls = []
    for ev in events:
        for block in (ev.get("message") or {}).get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                calls.append({"name": block.get("name", "").removeprefix(TOOL_PREFIX),
                              "input": block.get("input") or {}})
    return calls


def final_answer(events: list[dict]) -> str:
    for ev in reversed(events):
        if ev.get("type") == "result":
            return str(ev.get("result") or "")
    return ""


def check_behavior(pid: str, events: list[dict]) -> list[str]:
    """Returns failed check names; empty list means behavior holds."""
    spec = MANIFEST.get(pid, {})
    calls = tool_calls(events)
    names = [c["name"] for c in calls]
    failed = []
    want = spec.get("calls", [])
    it = iter(names)
    if not all(any(n == w for n in it) for w in want):  # ordered subsequence
        failed.append("tool-sequence")
    for c in calls:
        if c["name"] in spec.get("forbid", []):
            failed.append(f"forbidden-call:{c['name']}")
        if c["input"].get("confirm") is True and c["name"] not in spec.get("confirm_ok", []):
            failed.append(f"unexpected-confirm:{c['name']}")
    # A prompt the page answers with MCP tools fails if the agent needed built-in tools
    # (Bash, sleep, Monitor, ScheduleWakeup, Read...) to get there: a workaround.
    # Built-in names are capitalized; MCP names are snake_case. ToolSearch is loading, not a workaround.
    if not spec.get("tools") and not spec.get("bash"):
        for c in calls:
            if c["name"][:1].isupper() and c["name"] != "ToolSearch":
                failed.append(f"workaround:{c['name']}")
    bash_cmds = [str(c["input"].get("command", "")) for c in calls if c["name"] == "Bash"]
    for needle in spec.get("bash", []):
        if not any(needle in cmd for cmd in bash_cmds):
            failed.append(f"bash-missing:{needle}")
    answer = final_answer(events).lower()
    for needle in spec.get("answer", []):
        if needle.lower() not in answer:
            failed.append(f"answer-missing:{needle}")
    return failed


def check_local(pid: str, work: Path) -> list[str]:
    kind = MANIFEST.get(pid, {}).get("local")
    if kind == "greet":
        f = work / "agentlab-greeter" / "operations.py"
        return [] if f.exists() and "def greet" in f.read_text() else ["local:greet-not-in-work-folder"]
    if kind == "tgz":
        return [] if any(work.rglob("*.tgz")) else ["local:no-tgz-in-work-folder"]
    return []


def check_effect(pid: str) -> list[str]:
    eff = MANIFEST.get(pid, {}).get("effect")
    if not eff:
        return []
    spec, steps = eff
    # Only this prompt's steps run (FSR_ONLY_STEPS, see lib/harness.js wanted()).
    # FSR_WORKDIR points the chapter 9 steps at the agent's work folder.
    env = {**run_env(), "FSR_ONLY_STEPS": ",".join(steps), "FSR_WORKDIR": str(WORK)}
    proc = subprocess.run(["npx", "playwright", "test", spec], cwd=E2E, env=env, capture_output=True,
                          text=True, timeout=1800)
    return [] if proc.returncode == 0 else [f"effect:{steps[0]}"]


def save_transcript(pid: str, events: list[dict], model: str = DEFAULT_MODEL) -> None:
    # One folder per model, so a later run never overwrites another model's transcripts.
    folder = TRANSCRIPTS / re.sub(r"[^A-Za-z0-9_.-]", "_", model)
    folder.mkdir(parents=True, exist_ok=True)
    name = re.sub(r"[^A-Za-z0-9_.#-]", "_", pid.replace("/", "__"))
    with (folder / f"{name}.jsonl").open("w") as fh:
        for ev in events:
            fh.write(json.dumps(ev) + "\n")


def run_one(choice: Choice, work: Path, box: str, results: list[dict], model: str = DEFAULT_MODEL) -> str:
    p = choice.prompt
    print(f"\n### {p.pid}  ({choice.reason})")
    spec = MANIFEST.get(p.pid, {})
    sessions = load_sessions(SESSIONS)
    resume = None
    if spec.get("continues"):
        resume = sessions.get(f"{spec['continues']}|{model}")
        if not resume:
            row = record(results, p, box, "blocked", f"no session for {spec['continues']}: run that prompt first", "n/a", model)
            return row["outcome"]
    rc, events, err = run_claude(work, p.text, spec.get("tools"), model, resume)
    if session_id(events):
        sessions[f"{p.pid}|{model}"] = session_id(events)
        save_sessions(sessions, SESSIONS)
    save_transcript(p.pid, events, model)
    commit = page_commit(p.page)
    if rc != 0 or not events:
        row = record(results, p, box, "blocked", f"claude exit {rc}: {err[-300:]}", commit, model)
        return row["outcome"]
    failed = check_behavior(p.pid, events) + check_local(p.pid, work) + check_effect(p.pid)
    outcome = "fail" if failed else "pass"
    row = record(results, p, box, outcome, ",".join(failed) or "all checks held", commit, model)
    print(f"  {outcome}: {row['detail']}")
    return outcome


def regrade_dir(folder: Path) -> dict[str, list[str]]:
    """Re-grade saved transcripts with the behavior checks. Reads files only; no calls, no ledger."""
    out: dict[str, list[str]] = {}
    for f in sorted(folder.glob("*.jsonl")):
        pid = f.stem.replace("__", "/", 1)
        events = [json.loads(line) for line in f.read_text().splitlines() if line.strip()]
        out[pid] = check_behavior(pid, events)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env-file", default=os.environ.get("FSR_ENV_FILE"))
    ap.add_argument("--chapter")
    ap.add_argument("--prompt")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--regrade", metavar="DIR", help="re-grade saved transcripts in DIR; no calls")
    ap.add_argument("--model", default=os.environ.get("MODEL") or DEFAULT_MODEL,
                    help=f"claude model for the prompt runs (default {DEFAULT_MODEL}; or MODEL=...)")
    ap.add_argument("--plan", action="store_true", help="show what would run and why; no calls")
    args = ap.parse_args(argv)

    if args.regrade:
        for pid, failed in regrade_dir(Path(args.regrade)).items():
            print(f"{pid}: {'pass' if not failed else 'fail ' + ','.join(failed)}")
        return 0
    load_env_file(args.env_file)
    if not args.plan:
        for k in ("FSR_API_KEY",):
            if not os.environ.get(k):
                sys.exit(f"{k} must be set (use --env-file)")
    box = box_host()
    results = load_ledger()
    model = args.model
    choices = select(all_prompts(), results, box, model=model, chapter=args.chapter,
                     prompt_id=args.prompt, force=args.force)
    print(f"box: {box}  |  model: {model}  |  {sum(c.run for c in choices)} to run, {sum(not c.run for c in choices)} skipped")
    for c in choices:
        print(f"  {'RUN ' if c.run else 'SKIP'} {c.prompt.pid}: {c.reason}")
    if args.plan:
        return 0
    todo = [c for c in choices if c.run]
    if not todo:
        print("nothing to run")
        return 0
    if not shutil.which("claude"):
        sys.exit("claude (Claude Code CLI) is not on PATH")
    server = fortisoar_lab_server()
    preflight(server, box)
    work = make_workdir(server)
    outcomes: dict[str, int] = {}
    for c in todo:
        o = run_one(c, work, box, results, model)
        outcomes[o] = outcomes.get(o, 0) + 1
        save_ledger(results)  # persist per prompt, so an interrupted run keeps its results
    print(f"\nagent-drive done: {outcomes}")
    print("results: tools/agent-drive/.results.json (gitignored); transcripts: tools/agent-drive/.transcripts/")
    return 1 if outcomes.get("fail") or outcomes.get("blocked") else 0


if __name__ == "__main__":
    sys.exit(main())
