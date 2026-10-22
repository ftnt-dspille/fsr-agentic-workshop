#!/usr/bin/env python3
"""Workshop proof: one run that proves the pages against a live box and writes a coverage report.

Order (each phase is reported; a failed phase fails the run, except the strict lint):
  1. reset-lab check   read-only (tools/reset_lab.py --check-only). Never the destructive reset.
  2. chapter specs     per chapter: tools/e2e/NN-*.spec.js (API-level proofs) then
                       tools/e2e/captures/chNN.spec.js (UI steps and screenshots)
  3. lint strict       tools/lint-steps.py --strict. Reported, not fatal, while captures are pending.
  4. hugo build        the site builds with every page and capture in place.

Writes tools/proof-report.md (gitignored): per chapter, steps automated vs manual-with-reason,
and captures taken vs pending-with-reason.

Usage
-----
    make workshop-proof FSR_ENV_FILE=/path/to/box.env
    make workshop-proof FSR_ENV_FILE=... CHAPTER=07     # one chapter (cheap rerun)
    make workshop-proof-report                          # rebuild the report from the last run, no box

Environment: FSR_ENV_FILE (required for phases 1-2), SOAR_KIT_DIR (UI specs), SPEND_AI=1 to
allow FortiAI-spending specs (they are gated and skip otherwise; see captures/lib/spend.js).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
E2E = TOOLS / "e2e"
CONTENT = ROOT / "content"
RESULTS = E2E / "test-results" / "proof"
REPORT = TOOLS / "proof-report.md"


def load_lint():
    spec = importlib.util.spec_from_file_location("lint_steps", TOOLS / "lint-steps.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # dataclasses look the module up by name
    spec.loader.exec_module(mod)
    return mod


@dataclass
class Chapter:
    key: str            # "07"
    folder: str         # "07-users-modules-records"
    specs: list[Path] = field(default_factory=list)   # relative to tools/e2e
    phase_status: dict[str, str] = field(default_factory=dict)
    step_status: dict[str, str] = field(default_factory=dict)  # step id -> passed|failed|skipped|not-run


def chapters(only: str | None) -> list[Chapter]:
    out: list[Chapter] = []
    for folder in sorted(p for p in CONTENT.iterdir() if p.is_dir() and re.match(r"^\d\d-", p.name)):
        key = folder.name[:2]
        if only and key != only:
            continue
        ch = Chapter(key=key, folder=folder.name)
        for spec in sorted(E2E.glob(f"{key}-*.spec.js")):
            ch.specs.append(spec.relative_to(E2E))
        cap = E2E / "captures" / f"ch{key}.spec.js"
        if cap.exists():
            ch.specs.append(cap.relative_to(E2E))
        out.append(ch)
    if only and not out:
        raise SystemExit(f"no chapter folder starts with {only}")
    return out


def run_specs(ch: Chapter, env: dict[str, str]) -> str:
    """Run the chapter's specs with the JSON reporter. Returns passed|failed|no-specs|blocked."""
    if not ch.specs:
        return "no-specs"
    npx = shutil.which("npx")
    if not npx:
        return "blocked: npx not installed"
    if not (E2E / "node_modules" / "@playwright" / "test").exists():
        return "blocked: run `make e2e-install` (tools/e2e has no node_modules)"
    RESULTS.mkdir(parents=True, exist_ok=True)
    out_json = RESULTS / f"ch{ch.key}.json"
    run_env = {**os.environ, **env, "PLAYWRIGHT_JSON_OUTPUT_NAME": str(out_json)}
    cmd = [npx, "playwright", "test", *[str(s) for s in ch.specs], "--reporter=json"]
    proc = subprocess.run(cmd, cwd=E2E, env=run_env, capture_output=True, text=True)
    if not out_json.exists():
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-3:]
        return "blocked: no report from playwright: " + " | ".join(tail)[:300]
    collect_steps(ch, out_json)
    return "passed" if proc.returncode == 0 else "failed"


def collect_steps(ch: Chapter, report: Path) -> None:
    """Map each test.step in the JSON report to passed, failed, skipped or not-run.

    The JSON reporter gives a test status (expected | unexpected | skipped | flaky) and,
    per result, a steps tree. A step with an error failed; a step with no error passed
    when its test passed; otherwise the step did not run to completion.
    """
    data = json.loads(report.read_text(encoding="utf-8"))

    def walk_steps(steps, test_ok: bool):
        for st in steps or []:
            if st.get("category") in (None, "test.step"):
                if st.get("error"):
                    ch.step_status[st.get("title", "")] = "failed"
                elif test_ok:
                    ch.step_status[st.get("title", "")] = "passed"
                else:
                    ch.step_status.setdefault(st.get("title", ""), "not-run")
            walk_steps(st.get("steps"), test_ok)

    def walk_suites(suites):
        for s in suites or []:
            walk_suites(s.get("suites"))
            for spec in s.get("specs", []):
                for t in spec.get("tests", []):
                    status = t.get("status")
                    test_ok = status in ("expected", "flaky")
                    for res in t.get("results", []):
                        walk_steps(res.get("steps"), test_ok)
                    if status == "skipped":
                        ch.step_status.setdefault("(test skipped)", "skipped")

    walk_suites(data.get("suites"))


def chapter_coverage(ch: Chapter, lint) -> dict:
    """Markers for one chapter folder: steps and captures, with their proof state."""
    steps, captures = [], []
    folder = CONTENT / ch.folder
    pending = lint.read_pending()
    for path in sorted(folder.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        for mk in lint.parse_markers(path, text, []):
            if mk.kind == "step":
                steps.append(mk)
            else:
                captures.append(mk)
    rows_steps = []
    for mk in steps:
        if "manual" in mk.flags:
            rows_steps.append((mk.ident, "manual", mk.reason))
        else:
            rows_steps.append((mk.ident, ch.step_status.get(mk.ident, "not-run"), ""))
    rows_caps = []
    for mk in captures:
        png = mk.path.parent / f"{mk.ident}.png"
        if mk.ident in pending:
            rows_caps.append((mk.ident, "pending", pending[mk.ident] or "no reason"))
        elif png.exists():
            rows_caps.append((mk.ident, "taken", ""))
        else:
            rows_caps.append((mk.ident, "missing", "no png and not pending"))
    return {"steps": rows_steps, "captures": rows_caps}


def spend_tokens(ch: Chapter) -> list[str]:
    out = []
    path = RESULTS / f"ch{ch.key}.json"
    if not path.exists():
        return out
    data = json.loads(path.read_text(encoding="utf-8"))

    def walk(suites):
        for s in suites or []:
            walk(s.get("suites"))
            for spec in s.get("specs", []):
                for t in spec.get("tests", []):
                    for res in t.get("results", []):
                        for ann in res.get("annotations", []) or []:
                            if ann.get("type", "").startswith("tokens"):
                                out.append(f"{spec.get('title')}: {ann['type']}={ann.get('description')}")
    walk(data.get("suites"))
    return out


def run_reset_check(env: dict[str, str]) -> str:
    if not env.get("FSR_ENV_FILE"):
        return "blocked: FSR_ENV_FILE not set"
    proc = subprocess.run([sys.executable, str(TOOLS / "reset_lab.py"), "--check-only"],
                          cwd=ROOT, env={**os.environ, **env}, capture_output=True, text=True)
    last = (proc.stdout or proc.stderr).strip().splitlines()[-1:] or [""]
    return ("passed: " if proc.returncode == 0 else "failed: ") + last[0][:200]


def run_strict_lint() -> tuple[int, str]:
    proc = subprocess.run([sys.executable, str(TOOLS / "lint-steps.py"), "--strict"],
                          cwd=ROOT, capture_output=True, text=True)
    lines = [ln for ln in (proc.stdout + proc.stderr).splitlines() if ln.strip()]
    return proc.returncode, (lines[-1] if lines else "no output")


def run_hugo() -> tuple[int, str]:
    hugo = os.environ.get("HUGO", "hugo")
    proc = subprocess.run([hugo, "--quiet"], cwd=ROOT, capture_output=True, text=True)
    msg = (proc.stdout + proc.stderr).strip().splitlines()
    return proc.returncode, (msg[-1] if msg else "built")


def write_report(rows: list[dict], phases: dict[str, str], only: str | None) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Workshop proof report",
        "",
        f"Generated {now}" + (f" for chapter {only}" if only else " for all chapters") + ". Gitignored; rerun with `make workshop-proof`.",
        "",
        "## Phases",
        "",
        "| Phase | Result |",
        "|---|---|",
    ]
    for name, res in phases.items():
        lines.append(f"| {name} | {res} |")
    lines += ["", "## Per chapter", ""]
    for row in rows:
        ch = row["chapter"]
        auto = [s for s in row["steps"] if s[1] not in ("manual",)]
        manual = [s for s in row["steps"] if s[1] == "manual"]
        taken = [c for c in row["captures"] if c[1] == "taken"]
        pend = [c for c in row["captures"] if c[1] != "taken"]
        lines += [
            f"### {ch['folder']}",
            "",
            f"- Steps automated: {len(auto)} ({sum(1 for s in auto if s[1] == 'passed')} passed, "
            f"{sum(1 for s in auto if s[1] == 'failed')} failed, {sum(1 for s in auto if s[1] in ('skipped', 'not-run'))} skipped or not run)",
            f"- Steps manual, with reason: {len(manual)}",
            f"- Captures taken: {len(taken)} of {len(row['captures'])}",
        ]
        for s in auto:
            lines.append(f"  - step `{s[0]}`: {s[1]}")
        for s in manual:
            lines.append(f"  - step `{s[0]}`: manual. Reason: {s[2]}")
        for c in pend:
            lines.append(f"  - capture `{c[0]}`: {c[1]}. {c[2]}")
        for c in taken:
            lines.append(f"  - capture `{c[0]}`: taken")
        if row.get("tokens"):
            lines.append("- FortiAI tokens spent:")
            lines += [f"  - {t}" for t in row["tokens"]]
        lines.append("")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--chapter", help="two-digit chapter, e.g. 07 (default: all)")
    ap.add_argument("--report-only", action="store_true", help="rebuild the report from the last run; no box, no build")
    args = ap.parse_args(argv)

    lint = load_lint()
    env = {}
    if os.environ.get("FSR_ENV_FILE"):
        env["FSR_ENV_FILE"] = os.path.realpath(os.environ["FSR_ENV_FILE"])
    if os.environ.get("SOAR_KIT_DIR"):
        env["SOAR_KIT_DIR"] = os.path.realpath(os.path.expanduser(os.environ["SOAR_KIT_DIR"]))

    phases: dict[str, str] = {}
    chs = chapters(args.chapter)
    if not args.report_only:
        phases["reset-lab check (read-only)"] = run_reset_check(env)
        for ch in chs:
            ch.phase_status["specs"] = run_specs(ch, env)
    else:
        for ch in chs:
            if (RESULTS / f"ch{ch.key}.json").exists():
                collect_steps(ch, RESULTS / f"ch{ch.key}.json")
                ch.phase_status["specs"] = "report only (last run)"

    rows = []
    for ch in chs:
        cov = chapter_coverage(ch, lint)
        rows.append({
            "chapter": {"folder": ch.folder, "key": ch.key},
            "steps": cov["steps"],
            "captures": cov["captures"],
            "tokens": spend_tokens(ch),
        })
        phases[f"chapter {ch.key} specs"] = ch.phase_status.get("specs", "report only")

    if not args.report_only:
        rc, msg = run_strict_lint()
        phases["lint-steps --strict (not fatal while captures are pending)"] = f"{'clean' if rc == 0 else 'findings'}: {msg}"
        hrc, hmsg = run_hugo()
        phases["hugo build"] = f"{'passed' if hrc == 0 else 'FAILED'}: {hmsg}"
    write_report(rows, phases, args.chapter)
    print(f"wrote {REPORT.relative_to(ROOT)}")

    failed = [k for k, v in phases.items()
              if v.startswith(("failed", "blocked", "FAILED")) and not k.startswith("lint-steps")]
    for k in failed:
        print(f"FAILED phase: {k}: {phases[k]}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
