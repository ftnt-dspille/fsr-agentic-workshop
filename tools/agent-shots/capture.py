#!/usr/bin/env python3
"""Capture REAL Claude Code sessions against the lab box and render them to
faithful, SCRUBBED colored PNGs -- what a student actually sees on screen.

Unlike tools/agent-drive (which runs `claude -p` headless and re-renders the JSONL
into a synthetic card), this drives the interactive Claude Code TUI in a pty,
captures the real rendered output with pyte, scrubs every box detail, and renders
the real interface to PNG. The agent-drive specs still PROVE the labs work; these
shots just show them honestly.

Env (same as agent-drive): FSR_BASE_URL, FSR_API_KEY, FSR_VERIFY_SSL, FSR_PYTHON.
Needs: claude on PATH, pyte + Pillow, a monospace system font.

    python3 tools/agent-shots/capture.py --env-file <path> [--only <pid>] [--list]

Pids and output paths mirror tools/agent-drive: the shot for a page's Nth
"Give your agent this prompt" lands at agent-run-<page-stem>-<N>.png beside it
(or the SHOT_NAME override). Multi-prompt pages run one session, snapshotting
after each turn. Confirm-gated prompts get a follow-up "yes" so the shot shows the
completed action.
"""
from __future__ import annotations
import argparse, fcntl, json, os, pty, re, select, signal, struct, sys, termios, time
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[2]
CONTENT = REPO / "content"
COLS, ROWS = 100, 240
MODEL = "claude-sonnet-5-5"

# page-stem#N -> override output filename (matches tools/agent-drive/render_shots SHOT_NAME)
SHOT_NAME = {"06-setup-agent/02-wire-the-agent#1": "fsa06-04-whoami-claude.png"}
# pids whose prompt trips the tier-3 confirm gate -> send a confirmation follow-up
CONFIRM = {"07-users-modules-records/02-create-a-module#1"}
FOLLOW_UP = "Yes, go ahead and confirm it."
PROMPT_HEADING = re.compile(r"Give your agent this prompt", re.IGNORECASE)
FENCE = re.compile(r"```[a-zA-Z0-9]*\n(.*?)```", re.DOTALL)


# ---- prompt discovery (mirrors agent-drive) ---------------------------------
def pages() -> list[Path]:
    out = []
    for d in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
        out.extend(sorted(p for p in d.glob("*.md") if p.name != "_index.md"))
    return out

def prompts_in(page: Path) -> list[str]:
    text = page.read_text(); out = []
    for h in PROMPT_HEADING.finditer(text):
        m = FENCE.search(text, h.end())
        if m: out.append(m.group(1).strip())
    return out

def shots() -> list[dict]:
    """One entry per agent-session shot: {pid, prompts(up to this turn), out}."""
    out = []
    for page in pages():
        ps = prompts_in(page)
        for n in range(1, len(ps) + 1):
            pid = f"{page.parent.name}/{page.stem}#{n}"
            name = SHOT_NAME.get(pid) or f"agent-run-{page.stem}-{n}.png"
            out.append({"pid": pid, "prompts": ps[:n], "out": page.parent / name})
    return out


# ---- scrub ------------------------------------------------------------------
def box_host() -> str:
    return (urlparse(os.environ.get("FSR_BASE_URL", "")).hostname or "")

def build_subs():
    subs = [(re.compile(r"\S*(?:capwork|ptywork)\b"), "~/fortisoar-agent")]
    hb = box_host()
    if hb:
        e = re.escape(hb)
        subs.append((re.compile(rf"https?://{e}(?::\d+)?(/\S*)?"),
                     lambda m: "https://fortisoar.example.com" + (m.group(1) or "")))
        subs.append((re.compile(rf"\b{e}(?::\d+)?\b"), "fortisoar.example.com"))
    # bare FQDN indicators (e.g. a phishing domain in alert data) -> <domain>,
    # keeping example.com and a safelist of product/vendor names visible.
    _SAFE = ("example.com", "example.org", "fortinet.com", "anthropic.com", "claude.com", "claude.ai")
    # Jinja/code roots: a dotted token starting with one of these is an expression
    # (vars.input.records, steps.X.data), NOT a domain -- never mask it.
    _CODE = {"vars", "input", "inputs", "steps", "data", "output", "outputs", "params",
             "env", "item", "self", "this", "result", "results", "record", "records",
             "request", "response", "global", "resource", "arguments"}
    def _dom(m):
        d = m.group(0)
        if d.split(".")[0].lower() in _CODE: return d
        return d if (d.lower().endswith(_SAFE) or d.lower() in ("e.g", "i.e")) else "<domain>"
    subs += [
        (re.compile(r"https?://(?!(?:[\w.-]*\.)?example\.com\b)[^\s\"'<>)\]]+"), "<url>"),
        (re.compile(r"\b(?!203\.0\.113\.)(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b"), "<ip>"),
        (re.compile(r"\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b"), _dom),
        (re.compile(r"\bF[A-Z]{1,3}\d[A-Z0-9]{8,}\b"), "<device-serial>"),
        (re.compile(r"/Users/[^\s/\"']+"), "~"),
        (re.compile(r"\bdylanspille\b", re.I), "user"),
        (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"),
         "00000000-0000-0000-0000-000000000000"),
        (re.compile(r"\d{4}-\d{2}-\d{2}T[\d:.]+Z?"), "<time>"),
        (re.compile(r"\b[\w.+-]+@(?!example\.com)[\w.-]+\.\w+\b"), "analyst@example.com"),
        (re.compile(r"(?i)(api[-_ ]?key|token)([\"':=\s]+)\S+"), r"\1\2<redacted>"),
    ]
    return subs

def scrub_line(s: str, subs) -> tuple[str, bool]:
    out = s; hit = False
    for rx, rep in subs:
        new = rx.sub(rep, out)
        if new != out: hit = True; out = new
    return out, hit


# ---- capture ----------------------------------------------------------------
def child_env() -> dict:
    env = dict(os.environ)
    for k in list(env):
        if k.startswith("CLAUDE_CODE") or k in ("CLAUDECODE", "CLAUDE_SESSION_ID"):
            env.pop(k, None)
    env["TERM"] = "xterm-256color"
    py = env.get("FSR_PYTHON", "")
    if py and os.sep in py:
        env["PATH"] = f"{Path(py).parent}{os.pathsep}{env.get('PATH','')}"
    return env

def auth_env() -> dict:
    """FSR auth for the lab server: prefer a user (JWT) login, else an API key.

    The lab authenticates as a user because Content Hub / solution-pack /
    connector installs are not supported with an API key (the import stalls at
    Draft). Fall back to an API key only when no user creds are set.
    """
    user, password = os.environ.get("FSR_USERNAME"), os.environ.get("FSR_PASSWORD")
    if user and password:
        return {"FSR_USERNAME": user, "FSR_PASSWORD": password}
    key = os.environ.get("FSR_API_KEY")
    if key:
        return {"FSR_API_KEY": key}
    raise SystemExit("set FSR_USERNAME + FSR_PASSWORD (preferred) or FSR_API_KEY (use --env-file)")

def write_cfg(work: Path) -> None:
    py = os.environ.get("FSR_PYTHON", "")
    exe = str(Path(py).parent / "fsr-agentic-toolkit") if py else "fsr-agentic-toolkit"
    cfg = {"mcpServers": {"fortisoar-lab": {"command": exe, "args": ["mcp"], "env": {
        "PYFSR_INSTANCES": str(work / "no-instances.toml"),
        "FSR_BASE_URL": os.environ["FSR_BASE_URL"], **auth_env(),
        "FSR_VERIFY_SSL": os.environ.get("FSR_VERIFY_SSL", "false"),
        "FSR_SUPPRESS_INSECURE_WARNINGS": "true"}}}}
    (work / ".mcp.json").write_text(json.dumps(cfg, indent=2)); (work / ".mcp.json").chmod(0o600)

def run_session(prompts: list[str], confirm: bool, work: Path) -> list[bytes]:
    """Drive one interactive session through the prompts; return the raw byte
    buffer snapshot AFTER each prompt (so prompts[:k] -> snapshots[k-1])."""
    write_cfg(work)
    cmd = ["claude", "--mcp-config", str(work / ".mcp.json"), "--strict-mcp-config",
           "--allowedTools", "mcp__fortisoar-lab__*", "--model", MODEL]
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(work); env = child_env()
        os.environ.clear(); os.environ.update(env)
        os.execvp(cmd[0], cmd); os._exit(127)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    raw = bytearray(); snaps = []
    def send(b):
        try: os.write(fd, b if isinstance(b, bytes) else b.encode())
        except OSError: pass
    def drain(timeout):
        end = time.time() + timeout; got = b""
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.3)
            if r:
                try: chunk = os.read(fd, 65536)
                except OSError: break
                if not chunk: break
                raw.extend(chunk); got += chunk; end = time.time() + timeout
                if b"\x1b[c" in chunk or b"[>0q" in chunk: send(b"\x1b[?1;2c")
                if b"\x1b[6n" in chunk: send(b"\x1b[1;1R")
        return got
    drain(10); send("\x1b[B"); drain(1); send("\r"); drain(6)   # trust dialog
    for i, p in enumerate(prompts):
        # Bracketed paste so a blank line inside a prompt (e.g. a pasted YAML
        # block) stays literal instead of submitting the prompt early.
        send("\x1b[200~"); send(p); send("\x1b[201~"); drain(1); send("\r")
        start = time.time()
        while time.time() - start < 240:
            if not drain(10): break
        if confirm:                       # tier-3 gate: approve so the shot shows completion
            send(FOLLOW_UP); drain(1); send("\r")
            start = time.time()
            while time.time() - start < 240:
                if not drain(10): break
        snaps.append(bytes(raw))
    send("\x03"); drain(1)
    try: os.kill(pid, signal.SIGTERM)
    except ProcessLookupError: pass
    return snaps


# ---- render -----------------------------------------------------------------
NAMED = {"black": (40,42,54), "red": (255,85,85), "green": (80,250,123), "brown": (241,250,140),
         "yellow": (241,250,140), "blue": (98,114,164), "magenta": (255,121,198), "cyan": (139,233,253),
         "white": (248,248,242), "brightblack": (120,130,160), "brightred": (255,110,110),
         "brightgreen": (105,255,150), "brightyellow": (255,255,165), "brightblue": (130,145,190),
         "brightmagenta": (255,150,220), "brightcyan": (165,255,255), "brightwhite": (255,255,255)}
FG_DEFAULT = (220,223,228); BG = (13,14,18)
def _rgb(c):
    if c in ("default", None): return FG_DEFAULT
    if c in NAMED: return NAMED[c]
    try: return tuple(int(c[i:i+2],16) for i in (0,2,4))
    except Exception: return FG_DEFAULT

def render(raw: bytes, out: Path) -> None:
    import pyte
    from PIL import Image, ImageDraw, ImageFont, ImageChops
    subs = build_subs()
    screen = pyte.Screen(COLS, ROWS); pyte.ByteStream(screen).feed(raw)
    rows = []
    for y in range(ROWS):
        line = "".join((screen.buffer[y][x].data or " ") for x in range(COLS)).rstrip()
        scrubbed, hit = scrub_line(line, subs)
        if hit:
            rows.append([(ch, FG_DEFAULT) for ch in scrubbed])
        else:
            rows.append([((screen.buffer[y][x].data or " "), _rgb(screen.buffer[y][x].fg))
                         for x in range(len(line))])
    def text_of(r): return "".join(ch for ch, _ in r)
    # cut at the agent's completion line; else at the footer's horizontal rule
    done_i = None
    for i, r in enumerate(rows):
        if re.search(r"·\s*done\s+\d", text_of(r)): done_i = i
    if done_i is not None:
        rows = rows[:done_i + 1]
    else:
        for i in range(len(rows) - 1, 5, -1):
            t = text_of(rows[i]).strip()
            if t and set(t) <= {"─"}: rows = rows[:i]; break
    def blank(r): return not any(ch.strip() for ch, _ in r)
    while rows and blank(rows[-1]): rows.pop()
    collapsed = []; run = 0
    for r in rows:
        if blank(r):
            run += 1
            if run <= 1: collapsed.append(r)
        else:
            run = 0; collapsed.append(r)
    rows = collapsed
    for path in ("/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Menlo.ttc"):
        try: font = ImageFont.truetype(path, 22); break
        except Exception: font = None
    if font is None: font = ImageFont.load_default()
    cw = font.getlength("M"); ch = 30; pad = 24
    img = Image.new("RGB", (int(cw*COLS)+pad*2, ch*len(rows)+pad*2), BG)
    d = ImageDraw.Draw(img)
    for yi, r in enumerate(rows):
        for xi, (chx, fg) in enumerate(r):
            if chx != " ": d.text((pad+int(cw*xi), pad+ch*yi), chx, font=font, fill=fg)
    bbox = ImageChops.difference(img, Image.new("RGB", img.size, BG)).convert("L").getbbox()
    if bbox:
        l,t,rr,b = bbox
        img = img.crop((max(0,l-pad), max(0,t-pad), min(img.width,rr+pad), min(img.height,b+pad)))
    img.save(out)


# ---- cli --------------------------------------------------------------------
def load_env_file(path: str | None) -> None:
    if not path: return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Capture real Claude Code UI for the lab shots.")
    ap.add_argument("--env-file"); ap.add_argument("--only", help="one pid or page-stem prefix")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--rerender", action="store_true", help="re-render from saved .bin streams; no live capture")
    args = ap.parse_args(argv)
    load_env_file(args.env_file)
    allshots = shots()
    if args.list:
        for s in allshots: print(f"{s['pid']:48} -> {s['out'].relative_to(REPO)}")
        return 0
    work = REPO / "tools" / "agent-shots" / ".capwork"; work.mkdir(parents=True, exist_ok=True)
    raws = work / "raw"; raws.mkdir(exist_ok=True)
    def binpath(pid): return raws / (pid.replace("/", "__").replace("#", "-") + ".bin")
    want = [s for s in allshots if (not args.only or s["pid"] == args.only
                                    or s["pid"].startswith(args.only))]
    if args.rerender:
        for s in want:
            bp = binpath(s["pid"])
            if bp.exists():
                render(bp.read_bytes(), s["out"]); print(f"  re-rendered {s['out'].relative_to(REPO)}", flush=True)
            else:
                print(f"  skip {s['pid']}: no saved stream", flush=True)
        return 0
    if not os.environ.get("FSR_BASE_URL"): raise SystemExit("missing FSR_BASE_URL (use --env-file)")
    auth_env()  # validates FSR_USERNAME+FSR_PASSWORD (preferred) or FSR_API_KEY is set
    by_page: dict[Path, list[dict]] = {}
    for s in want: by_page.setdefault(s["out"].parent, []).append(s)
    for page_dir, group in by_page.items():
        group.sort(key=lambda s: s["pid"])
        prompts = group[-1]["prompts"]         # longest prefix = all page prompts
        confirm = any(g["pid"] in CONFIRM for g in group)
        print(f"capturing {group[0]['pid'].rsplit('#',1)[0]} ({len(prompts)} turn(s))...", flush=True)
        snaps = run_session(prompts, confirm, work)
        for s in group:
            n = int(s["pid"].rsplit("#", 1)[1])
            if n - 1 < len(snaps):
                binpath(s["pid"]).write_bytes(snaps[n - 1])   # persist for offline re-render
                render(snaps[n - 1], s["out"])
                print(f"  wrote {s['out'].relative_to(REPO)}", flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
