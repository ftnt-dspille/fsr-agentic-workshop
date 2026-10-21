#!/usr/bin/env python3
"""Agent-drive proof tier: run the pages' exact prompts through Claude Code.

LIVE TOOL, user-run, consumes Claude credits. For each chapter page (in order),
every "Give your agent this prompt" block is sent to ``claude -p`` headless in
a work folder whose .mcp.json points pyfsr-mcp at the lab box. Box effects are
then asserted by the chapter specs (``make e2e``), so this tier proves the
PROMPTS, the specs prove the box-side path.

Usage:
    FSR_BASE_URL=fortisoar.example.com FSR_API_KEY=<your-api-key> \
        python3 tools/agent-drive/run.py [--chapter 07-users-modules-records] [--dry-run]

--dry-run lists the prompts it would send without calling claude.
Confirm-gated tools: the prompt preamble tells the agent it is running
unattended in a disposable lab and may confirm gated calls itself. Never use
this preamble outside a disposable lab box.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTENT = REPO_ROOT / "content"

PROMPT_HEADING = re.compile(r"Give your agent this prompt", re.IGNORECASE)
FENCE = re.compile(r"```text\n(.*?)```", re.DOTALL)

PREAMBLE = (
    "You are running unattended in a disposable FortiSOAR lab as part of a "
    "workshop verification run. Use only the fortisoar MCP tools. When a tool "
    "returns confirmation_required, you may retry it with confirm=true without "
    "asking. Be concise. Task:\n\n"
)


def prompts_in(page: Path) -> list[str]:
    """Each 'Give your agent this prompt' heading's FIRST following text fence."""
    text = page.read_text()
    out: list[str] = []
    for h in PROMPT_HEADING.finditer(text):
        m = FENCE.search(text, h.end())
        if m:
            out.append(m.group(1).strip())
    return out


def chapter_pages(chapter: str | None) -> list[Path]:
    dirs = sorted(d for d in CONTENT.iterdir() if d.is_dir())
    if chapter:
        dirs = [d for d in dirs if d.name == chapter]
        if not dirs:
            sys.exit(f"no chapter named {chapter!r} under content/")
    pages = []
    for d in dirs:
        pages.extend(sorted(p for p in d.glob("*.md") if p.name != "_index.md"))
    return pages


def make_workdir() -> Path:
    base = os.environ.get("FSR_BASE_URL")
    key = os.environ.get("FSR_API_KEY")
    if not base or not key:
        sys.exit("FSR_BASE_URL and FSR_API_KEY must be set")
    exe = shutil.which("pyfsr-mcp")
    server = {"command": exe} if exe else {"command": "uvx", "args": ["--from", "pyfsr[mcp]", "pyfsr-mcp"]}
    server["env"] = {
        "FSR_BASE_URL": base,
        "FSR_API_KEY": key,
        "FSR_VERIFY_SSL": os.environ.get("FSR_VERIFY_SSL", "false"),
        "FSR_SUPPRESS_INSECURE_WARNINGS": "true",
    }
    work = Path(tempfile.mkdtemp(prefix="agent-drive-"))
    (work / ".mcp.json").write_text(json.dumps({"mcpServers": {"fortisoar": server}}, indent=2))
    return work


def run_claude(work: Path, prompt: str) -> int:
    cmd = [
        "claude",
        "-p",
        PREAMBLE + prompt,
        "--allowedTools",
        "mcp__fortisoar__*",
    ]
    print(f"\n=== claude -p ({len(prompt)} chars) ===")
    proc = subprocess.run(cmd, cwd=work, text=True, capture_output=True, timeout=1800)
    sys.stdout.write(proc.stdout[-4000:])
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr[-2000:])
    return proc.returncode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chapter", help="one chapter folder name (default: every Part 2 chapter)")
    ap.add_argument("--dry-run", action="store_true", help="list prompts, call nothing")
    args = ap.parse_args()

    pages = chapter_pages(args.chapter)
    plan = [(p, pr) for p in pages for pr in prompts_in(p)]
    if not plan:
        sys.exit("no prompts found (pages mark them with 'Give your agent this prompt')")
    print(f"{len(plan)} prompt(s) across {len({p for p, _ in plan})} page(s)")
    if args.dry_run:
        for page, prompt in plan:
            first = prompt.splitlines()[0]
            print(f"  {page.relative_to(REPO_ROOT)}: {first}")
        return 0

    if not shutil.which("claude"):
        sys.exit("claude (Claude Code CLI) is not on PATH")
    work = make_workdir()
    print(f"work folder: {work}")
    failures = 0
    for page, prompt in plan:
        print(f"\n### {page.relative_to(REPO_ROOT)}")
        if run_claude(work, prompt) != 0:
            failures += 1
    print(f"\nagent-drive done: {len(plan) - failures}/{len(plan)} prompts completed")
    print("now assert the box effects: make e2e")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
