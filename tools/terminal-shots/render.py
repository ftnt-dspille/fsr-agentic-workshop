#!/usr/bin/env python3
"""Render the workshop's terminal screenshots from scrubbed, deterministic output.

Local tool, no box needed: it monkeypatches pyfsr's `agent init` verification
with demo data, records the real CLI output with rich, and writes an SVG per
shot. With a converter available (rsvg-convert, cairosvg, or playwright) it
also writes the PNG straight into the chapter page bundle and you can remove
the id from tools/pending-captures.txt.

Usage:
    python3 tools/terminal-shots/render.py [--png]

Requires: pip install pyfsr[mcp] rich
"""

from __future__ import annotations

import argparse
import contextlib
import io
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "tools" / "terminal-shots" / "out"

#: shot id -> (chapter dir, argv for pyfsr)
SHOTS = {
    "fsa06-03-agent-init": (
        "06-setup-agent",
        ["agent", "init", "--url", "fortisoar.example.com", "--api-key", "<your-api-key>", "--no-verify-ssl"],
    ),
}


def fake_verify(args):  # noqa: ANN001 - mirrors agent_setup._verify
    return {"loginid": "analyst", "email": "analyst@example.com"}


def render(shot: str, argv: list[str]) -> Path:
    from rich.console import Console

    from pyfsr.cli import agent_setup
    from pyfsr.cli.__main__ import main

    agent_setup._verify = fake_verify  # deterministic demo output, no box

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        main(argv)
    console = Console(record=True, width=100, file=io.StringIO())
    console.print(f"$ pyfsr {' '.join(argv)}", style="bold green")
    console.print(buf.getvalue())
    OUT.mkdir(parents=True, exist_ok=True)
    svg = OUT / f"{shot}.svg"
    svg.write_text(console.export_svg(title="pyfsr"))
    return svg


def to_png(svg: Path, png: Path) -> bool:
    if shutil.which("rsvg-convert"):
        subprocess.run(["rsvg-convert", "-o", str(png), str(svg)], check=True)
        return True
    try:
        import cairosvg

        cairosvg.svg2png(url=str(svg), write_to=str(png), scale=2.0)
        return True
    except (ImportError, OSError):  # OSError: cairo system library missing
        pass
    if sys.platform == "darwin" and shutil.which("qlmanage"):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            subprocess.run(
                ["qlmanage", "-t", "-s", "1600", str(svg), "-o", td],
                check=True,
                capture_output=True,
            )
            thumb = Path(td) / f"{svg.name}.png"
            if thumb.exists():
                shutil.copy(thumb, png)
                return True
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1000, "height": 800})
            page.goto(svg.resolve().as_uri())
            el = page.locator("svg").first
            el.screenshot(path=str(png))
            browser.close()
        return True
    except ImportError:
        return False


def main_cli() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--png", action="store_true", help="also convert into the page bundles")
    args = ap.parse_args()
    missing_converter = False
    for shot, (chapter, argv) in SHOTS.items():
        svg = render(shot, argv)
        print(f"wrote {svg}")
        if args.png:
            png = REPO_ROOT / "content" / chapter / f"{shot}.png"
            if to_png(svg, png):
                print(f"wrote {png} - remove {shot} from tools/pending-captures.txt")
            else:
                missing_converter = True
                print(f"no SVG-to-PNG backend (rsvg-convert, cairosvg or playwright); kept {svg}")
    return 1 if missing_converter else 0


if __name__ == "__main__":
    sys.exit(main_cli())
