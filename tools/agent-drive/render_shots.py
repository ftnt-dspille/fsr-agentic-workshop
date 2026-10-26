#!/usr/bin/env python3
"""Render one terminal-style PNG per agent-drive prompt from its saved transcript.

Input: the per-model transcripts run.py writes (tools/agent-drive/.transcripts/<model>/<prompt>.jsonl,
the latest run per prompt), resolved through run.transcript_path so this never drifts
from where run.py saves them. Defaults to the baseline model (run.DEFAULT_MODEL);
--model picks another. Falls back to the legacy top-level .transcripts/<prompt>.jsonl
for transcripts saved before the per-model layout. Output: content/<chapter>/agent-run-<n>.png,
and a collapsed "What the agent did" block appended to each chapter page (between
markers, so reruns replace it).

Shows: the prompt, the tool calls (name and short args), and the trimmed final answer.
Scrubbed: local paths, IPs (except RFC 5737 documentation space), dates and times,
emails other than example.com, host names, usernames, anything key-like.

Run: ~/PycharmProjects/pyfsr/.venv/bin/python tools/agent-drive/render_shots.py
(needs rich, and an SVG-to-PNG backend: rsvg-convert, cairosvg, qlmanage or playwright.
Pillow, if installed, tight-crops the letterbox border a square-thumbnail backend leaves.)
"""

from __future__ import annotations

import argparse
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
    # FortiSOAR API URLs: mask the appliance authority (host:port) but KEEP the
    # /api/... path -- the path is the teaching payload (e.g. a 404 on a missing
    # record's IRI) and carries no host, IP or credential. Runs before IP masking
    # so the authority is replaced cleanly.
    text = re.sub(r"https?://[^\s\"'<>)\]]*?(/api/[^\s\"'<>)\]]*)",
                  r"https://fortisoar.example.com\1", text)
    text = re.sub(r"\b(?!203\.0\.113\.)\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", text)
    # mask any OTHER URLs (e.g. indicator/threat-intel URLs pulled from alert
    # data); keep the example.com placeholder visible.
    text = re.sub(r"https?://(?!(?:[\w.-]*\.)?example\.com\b)[^\s\"'<>)\]]+", "<url>", text)
    text = re.sub(r"\d{4}-\d{2}-\d{2}T[\d:.]+Z?", "<time>", text)
    text = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "<date>", text)
    text = re.sub(r"\b1[67]\d{8}\b", "<epoch>", text)
    text = re.sub(r"\b[\w.+-]+@(?!example\.com)[\w.-]+\b", "<email>", text)
    text = re.sub(r"\b[\w-]+\.local\b", "<host>", text)
    text = re.sub(r"(?i)(api[-_ ]?key|password|token)[\"':= ]+\S+", r"\1=<redacted>", text)
    return text


def demarkdown(text: str) -> str:
    """Strip Markdown syntax so a terminal-style transcript shows clean prose,
    not raw ``**bold**`` or fenced ``` blocks."""
    out: list[str] = []
    for ln in text.splitlines():
        if ln.strip().startswith("```"):
            continue  # drop code fences; keep their contents
        ln = re.sub(r"\*\*(.+?)\*\*", r"\1", ln)   # bold
        ln = re.sub(r"`([^`]+)`", r"\1", ln)        # inline code
        ln = re.sub(r"^\s*#{1,6}\s+", "", ln)       # headings
        out.append(ln)
    return "\n".join(out)


def short(value, limit: int = 70) -> str:
    s = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    # Collapse real newlines AND the literal "\n" escapes that survive json.dumps
    # of a multi-line arg value (e.g. yaml_text), so a tool-call line reads cleanly.
    s = scrub(s).replace("\n", " ").replace("\\n", " ")
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
    answer = demarkdown(scrub(answer)).strip()
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
    _autocrop(out)


def _autocrop(png: Path, pad: int = 16) -> None:
    """Trim the solid letterbox border a square-thumbnail backend (qlmanage -s)
    leaves around the terminal window, so the shot frames its content tightly.
    Best effort: without Pillow, keep the full canvas rather than fail."""
    try:
        from PIL import Image, ImageChops
    except Exception:  # noqa: BLE001 -- Pillow is an optional render-time extra
        return
    im = Image.open(png).convert("RGBA")
    bg = Image.new("RGBA", im.size, im.getpixel((0, 0)))  # the corner = border fill
    bbox = ImageChops.difference(im, bg).convert("L").getbbox()
    if not bbox:
        return
    left, top, right, bottom = bbox
    box = (max(0, left - pad), max(0, top - pad),
           min(im.width, right + pad), min(im.height, bottom + pad))
    im.crop(box).save(png)


def model_label(model: str) -> str:
    """A short, human label for the run tag (e.g. claude-sonnet-5-5 -> Sonnet)."""
    for key, label in (("sonnet", "Sonnet"), ("opus", "Opus"), ("haiku", "Haiku"), ("fable", "Fable")):
        if key in model.lower():
            return label
    return model


def chapter_block(entries: list[tuple[str, str, list[str], str]], model: str) -> str:
    label = model_label(model)
    parts = [MARK_BEGIN, "", "<details><summary>What the agent did</summary>", ""]
    for pid, png, calls, answer in entries:
        parts.append(f"**`{pid.split('/')[-1]}`** ({label} run, sanitized)")
        parts.append("")
        parts.append(f"![{pid}]({png})")
        parts.append("")
        parts.append("```text")
        parts.extend(calls or ["  (no tool calls)"])
        parts.append("```")
        parts.append("")
    parts += ["</details>", "", MARK_END, ""]
    return "\n".join(parts)


def _tool_use_count(path: Path) -> int:
    """How many tool_use blocks a transcript holds -- 0 for a stub (a bare result
    line from a blocked/continuation run, which must not be rendered over a real run)."""
    n = 0
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        for b in (ev.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                n += 1
    return n


def resolve_transcript(pid: str, model: str) -> Path | None:
    """The transcript to render for a prompt. Prefer the model's own file (where
    run.py now writes), but a stub there (no tool calls, e.g. a blocked run) must
    not win over a real legacy top-level transcript saved before the per-model
    layout. So: the model file when it has tool calls, else legacy when it exists,
    else whichever file exists at all, else None."""
    f = run.transcript_path(pid, model)
    legacy = TRANSCRIPTS / (pid.replace("/", "__", 1) + ".jsonl")
    if f.exists() and _tool_use_count(f) > 0:
        return f
    if legacy.exists():
        return legacy
    return f if f.exists() else None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Render agent-drive transcripts to PNGs + chapter blocks.")
    ap.add_argument("--model", default=run.DEFAULT_MODEL,
                    help=f"which model's transcripts to render (default {run.DEFAULT_MODEL})")
    args = ap.parse_args(argv)
    model = args.model

    by_page: dict[Path, list] = {}
    for n, p in enumerate(run.all_prompts(), 1):
        f = resolve_transcript(p.pid, model)
        if f is None:
            print(f"skip {p.pid}: no transcript for model {model}")
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
        page.write_text(text.rstrip() + "\n\n" + chapter_block(entries, model))
        print(f"updated {page.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
