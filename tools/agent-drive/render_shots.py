#!/usr/bin/env python3
"""Render one terminal-style PNG per agent-drive prompt from its saved transcript.

Input: the Sonnet transcripts (tools/agent-drive/.transcripts/<prompt>.jsonl, the latest
run per prompt). Output: content/<chapter>/agent-run-<n>.png, and a collapsed
"What the agent did" block appended to each chapter page (between markers, so reruns
replace it).

Shows: the prompt, the tool calls (name and short args), and the trimmed final answer.
Scrubbed: local paths, IPs (except RFC 5737 documentation space), dates and times,
emails other than example.com, host names, usernames, anything key-like.

Run: ~/PycharmProjects/pyfsr/.venv/bin/python tools/agent-drive/render_shots.py
(needs rich, and an SVG-to-PNG backend: rsvg-convert, cairosvg, qlmanage or playwright.)
"""

from __future__ import annotations

import importlib.util
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
import run  # noqa: E402

_spec = importlib.util.spec_from_file_location("ts_render", REPO / "tools" / "terminal-shots" / "render.py")
_ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ts)  # provides to_png()

TRANSCRIPTS = HERE / ".transcripts"
MARK_BEGIN = "<!-- agent-drive:begin -->"
MARK_END = "<!-- agent-drive:end -->"

#: prompt id -> shot number inside its chapter (fsa06-04 is the page's whoami shot).
SHOT_NAME = {
    "06-setup-agent/02-wire-the-agent#1": "fsa06-04-whoami-claude.png",
}


def scrub(text: str) -> str:
    text = re.sub(r"/Users/[^/\s\"']+", "~", text)
    text = re.sub(r"~/PycharmProjects/[^\s\"']*", "<repo>", text)
    text = re.sub(r"\bdylanspille\b", "<user>", text, flags=re.I)
    text = re.sub(r"\b(?!203\.0\.113\.)\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", text)
    text = re.sub(r"\d{4}-\d{2}-\d{2}T[\d:.]+Z?", "<time>", text)
    text = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "<date>", text)
    text = re.sub(r"\b1[67]\d{8}\b", "<epoch>", text)
    text = re.sub(r"\b[\w.+-]+@(?!example\.com)[\w.-]+\b", "<email>", text)
    text = re.sub(r"\b[\w-]+\.local\b", "<host>", text)
    text = re.sub(r"(?i)(api[-_ ]?key|password|token)[\"':= ]+\S+", r"\1=<redacted>", text)
    return text


def short(value, limit: int = 70) -> str:
    s = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    s = scrub(s).replace("\n", " ")
    return s if len(s) <= limit else s[: limit - 1] + "..."


def transcript_lines(events: list[dict], tool_limit: int = 14) -> tuple[list[str], str]:
    calls: list[str] = []
    for ev in events:
        for b in (ev.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                name = b["name"].replace("mcp__fortisoar-lab__", "")
                if name == "ToolSearch":
                    continue
                args = {k: v for k, v in (b.get('input') or {}).items()
                        if not re.search(r'pass|token|key|secret|cred', k, re.I)}
                calls.append(f"  > {name} {short(args)}")
    if len(calls) > tool_limit:
        calls = calls[:tool_limit] + [f"  ... {len(calls) - tool_limit} more tool calls"]
    answer = ""
    for ev in reversed(events):
        if ev.get("type") == "result":
            answer = str(ev.get("result") or "")
            break
    answer = scrub(answer).strip()
    # A line that mentions a password or secret is dropped whole: the value may sit in backticks.
    lines = ["<line withheld: credential>" if re.search(r"password|passwd|secret", ln, re.I) else ln
             for ln in answer.splitlines()]
    if len(lines) > 12:
        lines = lines[:12] + ["..."]
    return calls, "\n".join(lines)


def render_png(pid: str, prompt_text: str, calls: list[str], answer: str, out: Path) -> None:
    from rich.console import Console
    from rich.text import Text

    console = Console(record=True, width=100, file=io.StringIO())
    head = "\n".join(scrub(prompt_text).splitlines()[:6])
    console.print(Text("$ agent prompt", style="bold green"))
    console.print(Text(head, style="white"))
    console.print(Text("tool calls", style="bold yellow"))
    console.print(Text("\n".join(calls) or "  (none)", style="cyan"))
    console.print(Text("final answer", style="bold yellow"))
    console.print(Text(answer or "(none)", style="white"))
    svg = out.with_suffix(".svg")
    svg.write_text(console.export_svg(title="agent-drive"))
    if not _ts.to_png(svg, out):
        raise SystemExit(f"no SVG-to-PNG backend for {out.name}")
    svg.unlink()


def chapter_block(entries: list[tuple[str, str, list[str], str]]) -> str:
    parts = [MARK_BEGIN, "", "<details><summary>What the agent did</summary>", ""]
    for pid, png, calls, answer in entries:
        parts.append(f"**`{pid.split('/')[-1]}`** (Sonnet run, sanitized)")
        parts.append("")
        parts.append(f"![{pid}]({png})")
        parts.append("")
        parts.append("```text")
        parts.extend(calls or ["  (no tool calls)"])
        parts.append("```")
        parts.append("")
    parts += ["</details>", "", MARK_END, ""]
    return "\n".join(parts)


def main() -> int:
    by_page: dict[Path, list] = {}
    for n, p in enumerate(run.all_prompts(), 1):
        f = TRANSCRIPTS / (p.pid.replace("/", "__", 1) + ".jsonl")
        if not f.exists():
            print(f"skip {p.pid}: no transcript")
            continue
        events = [json.loads(line) for line in f.read_text().splitlines() if line.strip()]
        calls, answer = transcript_lines(events)
        name = SHOT_NAME.get(p.pid) or f"agent-run-{p.page.stem}-{p.pid.split('#')[-1]}.png"
        out = p.page.parent / name
        render_png(p.pid, p.text, calls, answer, out)
        print(f"wrote {out.relative_to(REPO)}")
        by_page.setdefault(p.page, []).append((p.pid, name, calls, answer))
    for page, entries in by_page.items():
        text = page.read_text()
        if MARK_BEGIN in text:
            text = re.sub(re.escape(MARK_BEGIN) + r".*?" + re.escape(MARK_END) + r"\n?", "", text, flags=re.S)
        page.write_text(text.rstrip() + "\n\n" + chapter_block(entries))
        print(f"updated {page.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
