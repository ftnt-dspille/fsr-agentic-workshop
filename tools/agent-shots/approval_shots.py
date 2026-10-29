#!/usr/bin/env python3
"""Capture the write-approval prompt, and the MCP connection panel, in Claude Code, Codex and
OpenCode, as scrubbed colored PNGs for the workshop.

Each agent runs in a pty with a throwaway config (flags, a temp dir): nothing in the
operator's own agent configuration is touched, and the toolkit server talks to a stub box
(stub_fortisoar_mcp.py), so no FortiSOAR box is involved. pyte renders the real screen; every
line is scrubbed of the operator's home path and identity, and the image is cropped to the
part a reader needs (no banner, no account details).

    FSR_PYTHON=<python with fsr-agentic-toolkit> python3 tools/agent-shots/approval_shots.py [--only claude|codex|opencode]
"""
from __future__ import annotations

import argparse, fcntl, json, os, pty, re, select, shutil, signal, struct, sys, tempfile, termios, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from capture import BG, FG_DEFAULT, _rgb  # noqa: E402  (same palette as the other agent shots)

OUT = HERE.parents[1] / "content" / "06-setup-agent"
COLS, ROWS = 110, 46
PY = os.environ.get("FSR_PYTHON") or sys.executable
STUB = str(HERE / "stub_fortisoar_mcp.py")
BASE = "https://fortisoar.example.com"
PROMPT = ('Call the fortisoar create_record tool right now with module "alerts" and data '
          '{"name": "Approval test", "severity": "Low"}. Do not call any other tool. Afterwards say in one '
          'short sentence whether the alert was created.')
WORKDIR = os.environ.get("SHOT_CWD") or os.getcwd()  # a folder the agent already trusts

HOME = str(Path.home())
SUBS = [(re.compile(re.escape(HOME)), "~"), (re.compile(r"/private/tmp/\S+|/var/folders/\S+|/tmp/\S+"), "~/lab"),
        (re.compile(r"\b" + re.escape(Path.home().name) + r"\b"), "student"),
        (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "student@example.com")]


class Term:
    """A pty child plus a pyte screen that follows it."""

    def __init__(self, argv, cwd, env=None):
        import pyte
        self.screen = pyte.Screen(COLS, ROWS)
        self.stream = pyte.ByteStream(self.screen)
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(cwd)
            os.execvpe(argv[0], argv, dict(os.environ, TERM="xterm-256color", COLUMNS=str(COLS), LINES=str(ROWS), **(env or {})))
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([self.fd], [], [], 0.2)
            if r:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                self.stream.feed(data)

    def text(self):
        return "\n".join("".join(c.data or " " for c in (self.screen.buffer[y][x] for x in range(COLS))).rstrip()
                         for y in range(ROWS))

    def wait_for(self, pattern, timeout, settle=2.0):
        end = time.time() + timeout
        rx = re.compile(pattern, re.I)
        while time.time() < end:
            self.pump(0.5)
            if rx.search(self.text()):
                self.pump(settle)
                return True
        return False

    def send(self, data: bytes):
        os.write(self.fd, data)

    def close(self):
        """Stop the child without ever blocking: a TUI in raw mode may ignore SIGTERM."""
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.kill(self.pid, sig)
            except ProcessLookupError:
                return
            for _ in range(30):
                try:
                    pid, _ = os.waitpid(self.pid, os.WNOHANG)
                except ChildProcessError:
                    return
                if pid:
                    return
                time.sleep(0.1)


def scrub(line: str) -> str:
    for rx, rep in SUBS:
        line = rx.sub(rep, line)
    return line


def snapshot(term: Term, start_pat: str, end_pat: str, out: Path, lead: int = 0) -> bool:
    """Render the rows from the first match of start_pat (minus ``lead``) through the last match
    of end_pat, with colours, scrubbed."""
    from PIL import Image, ImageDraw, ImageFont
    rows = []
    for y in range(ROWS):
        cells = [term.screen.buffer[y][x] for x in range(COLS)]
        raw = "".join(c.data or " " for c in cells).rstrip()
        rows.append((raw, [(c.data or " ", _rgb(c.fg)) for c in cells[:len(raw)]]))
    srx = re.compile(start_pat, re.I)
    starts = [i for i, (t, _) in enumerate(rows) if srx.search(t)]
    if end_pat == "BOX":  # through the last text row above the input box (or the last row)
        footer = re.compile(r"/effort|for shortcuts|shift\+tab|auto mode|bypass|esc to interrupt|ctrl\+", re.I)
        nonblank = [i for i, (t, _) in enumerate(rows) if t.strip() and not footer.search(t)]
        box = [i for i in nonblank if starts and i > starts[0] and re.match(r"^\s*[─╭┌━]{8,}", rows[i][0])]
        ends = [(box[0] - 1) if box else (nonblank[-1] if nonblank else 0)]
    else:
        erx = re.compile(end_pat, re.I)
        ends = [i for i, (t, _) in enumerate(rows) if erx.search(t)]
    if not starts or not ends:
        print(f"  snapshot {out.name}: markers not on screen (start={bool(starts)} end={bool(ends)}); screen was:")
        print("\n".join("    | " + scrub(t) for t, _ in rows if t.strip()))
        return False
    a, b = max(0, starts[0] - lead), max(e for e in ends if e >= starts[0]) if any(e >= starts[0] for e in ends) else ends[-1]
    chosen = rows[a:b + 1]
    while chosen and not chosen[-1][0].strip():
        chosen.pop()
    for path in ("/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Menlo.ttc"):
        try:
            font = ImageFont.truetype(path, 22)
            break
        except Exception:
            font = None
    font = font or ImageFont.load_default()
    cw, ch, pad = font.getlength("M"), 30, 24
    img = Image.new("RGB", (int(cw * COLS) + pad * 2, ch * len(chosen) + pad * 2), BG)
    d = ImageDraw.Draw(img)
    for yi, (raw, cells) in enumerate(chosen):
        scrubbed = scrub(raw)
        if scrubbed != raw:  # a scrubbed line loses its colours rather than risk leaking
            cells = [(c, FG_DEFAULT) for c in scrubbed]
        for xi, (c, fg) in enumerate(cells):
            if c.strip():
                d.text((pad + int(cw * xi), pad + ch * yi), c, font=font, fill=fg)
    # trim the empty right margin
    width = max((len(scrub(t)) for t, _ in chosen), default=1)
    img = img.crop((0, 0, min(img.width, int(cw * (width + 2)) + pad * 2), img.height))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"  wrote {out.name} ({img.width}x{img.height})")
    return True


def claude(work: Path) -> None:
    cfg = work / "mcp.json"
    cfg.write_text(json.dumps({"mcpServers": {"fortisoar": {"command": PY, "args": [STUB], "env": {"FSR_BASE_URL": BASE}}}}))
    argv = ["claude", "--mcp-config", str(cfg), "--strict-mcp-config", "--allowedTools", "mcp__fortisoar"]
    t = Term(argv, WORKDIR)
    try:
        t.pump(9)
        t.send(b"/mcp"); t.pump(1); t.send(b"\r")
        if t.wait_for(r"fortisoar.*connected|connected", 20):
            snapshot(t, r"Manage MCP servers|MCP Servers|fortisoar", r"fortisoar|Esc|esc", OUT / "fsa06-08-claude-mcp-panel.png", lead=1)
        t.send(b"\x1b"); t.pump(2)
        t.send(PROMPT.encode()); t.pump(1); t.send(b"\r")
        ok = t.wait_for(r"Approve this change", 150)
        print("claude prompt:", ok)
        if ok:
            snapshot(t, r"requests your input", r"Esc to cancel", OUT / "fsa06-05-claude-approval.png", lead=1)
            t.send(b"\x1b")
            if t.wait_for(r"declin|not created|wasn.t created|not approve", 75, settle=4):
                snapshot(t, r"Called fortisoar|wasn.t created|not created|declin", "BOX", OUT / "fsa06-09-claude-declined.png")
    finally:
        t.close()


def listing(argv, cwd, out: Path, start_pat: str, env=None) -> None:
    """Screenshot a short non-interactive command (the MCP server list). ``env`` points the
    agent at an empty config home so the operator's own MCP servers never appear."""
    t = Term(argv, cwd, env)
    try:
        t.pump(9)
        snapshot(t, start_pat, r"fortisoar", out, lead=0)
    finally:
        t.close()


def codex(work: Path) -> None:
    argv = ["codex", "-s", "read-only", "-c", 'approval_policy="on-request"',
            "-c", f'mcp_servers.fortisoar.command="{PY}"', "-c", f'mcp_servers.fortisoar.args=["{STUB}"]',
            "-c", f'mcp_servers.fortisoar.env={{FSR_BASE_URL="{BASE}"}}']
    t = Term(argv, WORKDIR)
    try:
        t.pump(10)
        t.send(PROMPT.encode()); t.pump(1); t.send(b"\r")
        ok = t.wait_for(r"Approve this change", 150)
        print("codex prompt:", ok)
        if not ok:
            print("\n".join("    | " + scrub("".join(c.data or " " for c in (t.screen.buffer[y][x] for x in range(COLS))).rstrip()) for y in range(ROWS) if t.screen.buffer[y][0].data is not None))
        if ok:
            snapshot(t, r"Field 1/1", r"esc to cancel", OUT / "fsa06-06-codex-approval.png", lead=1)
            t.send(b"\x1b")
            if t.wait_for(r"declin|not created|wasn.t created|not approve", 75, settle=4):
                snapshot(t, r"not created|wasn.t created|not approve|declin", r"Worked for", OUT / "fsa06-10-codex-declined.png", lead=1)
    finally:
        t.close()


def opencode(work: Path) -> None:
    (work / "opencode.json").write_text(json.dumps({"$schema": "https://opencode.ai/config.json", "mcp": {"fortisoar": {
        "type": "local", "command": [PY, STUB], "environment": {"FSR_BASE_URL": BASE}, "enabled": True}}}))
    prompt = ("Using the execute tool, call tools.fortisoar.create_record with module 'alerts' and data "
              "{\"name\": \"Approval test\", \"severity\": \"Low\"}. Do not call anything else.")
    t = Term(["opencode", "--standalone", "--prompt", prompt], str(work))
    try:
        ok = t.wait_for(r"Approve this change", 120)
        print("opencode prompt:", ok)
        if ok:
            snapshot(t, r"is requesting input", r"esc dismiss", OUT / "fsa06-07-opencode-approval.png", lead=1)
            t.send(b"\x1b")
            if t.wait_for(r"declin|not created|wasn.t created|not approve", 75, settle=4):
                snapshot(t, r"declin|not created|wasn.t created|not approve|cancel", "BOX", OUT / "fsa06-11-opencode-declined.png", lead=1)
    finally:
        t.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["claude", "codex", "opencode"])
    args = ap.parse_args()
    for name, fn in (("claude", claude), ("codex", codex), ("opencode", opencode)):
        if args.only and args.only != name:
            continue
        work = Path(tempfile.mkdtemp(prefix=f"shots-{name}-"))
        try:
            fn(work)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
