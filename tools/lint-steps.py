#!/usr/bin/env python3
"""Proof-harness gate: step/capture markers, specs, captures and house rules.

Scans ``content/**/*.md`` for two marker forms::

    <!-- step: <id> -->            a step the reader performs (proved by a spec)
    <!-- step: <id> manual: <reason> -->  a step no spec proves (checked by a human);
                                       the reason is required and says why it is manual
    <!-- capture: <id> -->         a screenshot the e2e harness writes

Rules
-----
ERROR  bad-marker        malformed marker, or a flag other than ``manual: <reason>``
ERROR  manual-no-reason  a ``manual`` step with no reason after the colon
ERROR  pending-no-reason a tools/pending-captures.txt entry with no ``# reason``
ERROR  capture-pending   (--strict only) a capture still listed in pending-captures.txt
ERROR  duplicate-step    the same step id on more than one marker
ERROR  duplicate-capture the same capture id on more than one marker
ERROR  step-no-test      a non-manual step id with no ``test.step('<id>')`` in
                         ``tools/e2e/**/*.spec.js`` or ``docubot/**/*.spec.ts``
ERROR  capture-missing   a capture id with no ``<id>.png`` in the page's own
                         directory and no entry in ``tools/pending-captures.txt``
ERROR  dash              an en or em dash in content (house rule, defense in depth)
ERROR  lab-ip            an IPv4 literal in content (placeholders only)
ERROR  lab-host          a lab hostname in content (placeholders only)
ERROR  lab-credential    FSR_PASSWORD or FSR_API_KEY assigned a literal value
WARN   stale-pending     a pending-captures entry that no capture marker uses

Exit status is 0 when there are no errors (warnings do not fail), 1 otherwise.
With --strict, every pending capture is also an error, so the gate can only pass
once every capture PNG exists.

Usage
-----
    python3 tools/lint-steps.py            # lint the whole repo
    python3 tools/lint-steps.py --quiet    # print only findings, not the summary
    python3 tools/lint-steps.py --strict   # also fail on pending captures
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "content"
E2E_DIR = REPO_ROOT / "tools" / "e2e"
DOCUBOT_DIR = REPO_ROOT / "docubot"
PENDING = REPO_ROOT / "tools" / "pending-captures.txt"

# Dash characters are written as escapes so this file itself stays dash-free.
EN_DASH = "–"
EM_DASH = "—"

MARKER_RE = re.compile(r"<!--\s*(step|capture)\s*:(.*?)-->")
MANUAL_RE = re.compile(r"^\s*(\S+)(?:\s+manual(?::\s*(.*?))?)?\s*$")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]*$")
ALLOWED_FLAGS = {"manual"}
TEST_STEP_RE = re.compile(r"""test\.step\(\s*(['"`])(?P<id>[^'"`]+)\1""")
# A spec helper that wraps test.step(id), called with the step id first:
# ``await gallery('fsa08-06-escalate-critical', ...)``.
HELPER_STEP_RE = re.compile(r"""await\s+\w+\(\s*(['"`])(?P<id>fsa[\w-]+)\1""")
IPV4_RE = re.compile(r"(?<![\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])")


def _is_documentation_ip(octets: list[int]) -> bool:
    """RFC 5737 documentation ranges are safe, intended lab-content addresses."""
    a, b, c, _ = octets
    return (a, b, c) in ((192, 0, 2), (198, 51, 100), (203, 0, 113))
LAB_HOST_RE = re.compile(r"myfortinet\.com", re.IGNORECASE)
CRED_RE = re.compile(r"\b(FSR_PASSWORD|FSR_API_KEY)\s*=\s*(\S*)")
PLACEHOLDER_RE = re.compile(r"^(<.*>|\$\{.*\}|__set_me__|)$|example", re.IGNORECASE)


@dataclass
class Finding:
    level: str  # "error" | "warn"
    rule: str
    path: Path
    line: int
    message: str

    def render(self) -> str:
        try:
            rel = self.path.relative_to(REPO_ROOT)
        except ValueError:
            rel = self.path
        return f"{self.level.upper():5} {self.rule:<18} {rel}:{self.line}: {self.message}"


@dataclass
class Marker:
    kind: str  # "step" | "capture"
    ident: str
    flags: set[str]
    reason: str
    path: Path
    line: int


def read_pending() -> dict[str, str]:
    """Pending capture id -> reason (the text after '#'; empty when none)."""
    if not PENDING.exists():
        return {}
    out: dict[str, str] = {}
    for raw in PENDING.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        entry, _, reason = raw.partition("#")
        out[entry.strip()] = reason.strip()
    return out


def spec_step_ids() -> set[str]:
    ids: set[str] = set()
    specs = [*E2E_DIR.rglob("*.spec.js"), *DOCUBOT_DIR.rglob("*.spec.ts")]
    for spec in specs:
        if "node_modules" in spec.parts:
            continue
        text = spec.read_text(encoding="utf-8")
        for rx in (TEST_STEP_RE, HELPER_STEP_RE):
            ids.update(m.group("id") for m in rx.finditer(text))
    return ids


def content_files() -> list[Path]:
    if not CONTENT.exists():
        return []
    return sorted(CONTENT.rglob("*.md"))


def parse_markers(path: Path, text: str, findings: list[Finding]) -> list[Marker]:
    markers: list[Marker] = []
    for m in MARKER_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        kind = m.group(1)
        body = m.group(2)
        if kind == "capture":
            tokens = body.split()
            if len(tokens) != 1 or not ID_RE.match(tokens[0]):
                findings.append(Finding("error", "bad-marker", path, line,
                                        f"capture marker needs exactly one id: {m.group(0).strip()}"))
                continue
            markers.append(Marker(kind, tokens[0], set(), "", path, line))
            continue
        parsed = MANUAL_RE.match(body)
        if not parsed or not ID_RE.match(parsed.group(1)):
            findings.append(Finding("error", "bad-marker", path, line,
                                    f"step marker has no valid id: {m.group(0).strip()}"))
            continue
        ident, reason = parsed.group(1), (parsed.group(2) or "").strip()
        is_manual = re.match(r"^\s*\S+\s+manual\b", body) is not None
        if not is_manual and body.split()[1:]:
            findings.append(Finding("error", "bad-marker", path, line,
                                    f"unsupported flag on step marker: {m.group(0).strip()}"))
            continue
        if is_manual and not reason:
            findings.append(Finding("error", "manual-no-reason", path, line,
                                    f"manual step '{ident}' needs a reason: "
                                    "<!-- step: id manual: why no spec proves it -->"))
        flags = {"manual"} if is_manual else set()
        markers.append(Marker(kind, ident, flags, reason, path, line))
    return markers


def check_dashes(path: Path, lines: list[str], findings: list[Finding]) -> None:
    for i, line in enumerate(lines, 1):
        if EN_DASH in line or EM_DASH in line:
            findings.append(Finding("error", "dash", path, i,
                                    "en or em dash found; use a plain hyphen"))


def check_lab_strings(path: Path, lines: list[str], findings: list[Finding]) -> None:
    for i, line in enumerate(lines, 1):
        for m in IPV4_RE.finditer(line):
            octets = [int(x) for x in m.group(1).split(".")]
            if all(o <= 255 for o in octets) and not _is_documentation_ip(octets):
                findings.append(Finding("error", "lab-ip", path, i,
                                        f"IPv4 literal {m.group(1)}; use fortisoar.example.com "
                                        "or an RFC 5737 documentation address"))
        if LAB_HOST_RE.search(line):
            findings.append(Finding("error", "lab-host", path, i,
                                    "lab hostname; use fortisoar.example.com"))
        for m in CRED_RE.finditer(line):
            if not PLACEHOLDER_RE.search(m.group(2).strip("\"'`")):
                findings.append(Finding("error", "lab-credential", path, i,
                                        f"{m.group(1)} has a literal value; use <your-api-key>"))


def run(quiet: bool, strict: bool = False) -> int:
    findings: list[Finding] = []
    pending_reasons = read_pending()
    pending = set(pending_reasons)
    specs = spec_step_ids()

    all_markers: list[Marker] = []
    for path in content_files():
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        check_dashes(path, lines, findings)
        check_lab_strings(path, lines, findings)
        all_markers.extend(parse_markers(path, text, findings))

    steps: dict[str, Marker] = {}
    captures: dict[str, Marker] = {}
    for mk in all_markers:
        table = steps if mk.kind == "step" else captures
        rule = "duplicate-step" if mk.kind == "step" else "duplicate-capture"
        if mk.ident in table:
            first = table[mk.ident]
            findings.append(Finding("error", rule, mk.path, mk.line,
                                    f"{mk.kind} id '{mk.ident}' already used at "
                                    f"{first.path.relative_to(REPO_ROOT)}:{first.line}"))
        else:
            table[mk.ident] = mk

    for ident, mk in steps.items():
        if "manual" in mk.flags:
            continue
        if ident not in specs:
            findings.append(Finding("error", "step-no-test", mk.path, mk.line,
                                    f"step '{ident}' has no test.step('{ident}') in tools/e2e "
                                    f"(add the test or mark the step manual)"))

    for ident, reason in pending_reasons.items():
        if not reason:
            findings.append(Finding("error", "pending-no-reason", PENDING, 0,
                                    f"pending capture '{ident}' needs a '# reason' after it"))

    for ident, mk in captures.items():
        png = mk.path.parent / f"{ident}.png"
        if strict and ident in pending:
            findings.append(Finding("error", "capture-pending", mk.path, mk.line,
                                    f"capture '{ident}' is still pending: {pending_reasons[ident] or 'no reason'}"))
            continue
        if png.exists() or ident in pending:
            continue
        findings.append(Finding("error", "capture-missing", mk.path, mk.line,
                                f"capture '{ident}' has no {ident}.png beside the page "
                                f"and is not in tools/pending-captures.txt"))

    used = set(captures)
    for entry in sorted(pending - used):
        findings.append(Finding("warn", "stale-pending", PENDING, 0,
                                f"pending capture '{entry}' is not used by any capture marker"))

    findings.sort(key=lambda f: (f.level != "error", str(f.path), f.line))
    errors = [f for f in findings if f.level == "error"]
    warns = [f for f in findings if f.level == "warn"]
    for f in findings:
        print(f.render())
    if not quiet:
        print(
            f"lint-steps: {len(content_files())} page(s), {len(steps)} step(s), "
            f"{len(captures)} capture(s), {len(specs)} spec step id(s); "
            f"{len(errors)} error(s), {len(warns)} warning(s)"
        )
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--quiet", action="store_true", help="omit the summary line")
    ap.add_argument("--strict", action="store_true", help="also fail on pending captures")
    args = ap.parse_args(argv)
    return run(args.quiet, args.strict)


if __name__ == "__main__":
    sys.exit(main())
