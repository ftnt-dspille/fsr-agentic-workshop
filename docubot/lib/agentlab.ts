// Workshop-local helpers layered on docubot's device modules — the agentic
// workshop's equivalent of the FortiAIGate workshop's docubot/lib/faig-lab.ts.
// Everything product-generic (login, nav, capture, pty) comes from docubot; this
// file holds only what is specific to THIS workshop: the fsr-agentic-toolkit CLI
// (the same tools the agent calls, used here for seeding and effect checks),
// pulling an agent prompt out of the page it is documented on, and driving the
// Claude Code TUI for a prompt.
import { execFileSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Capture, LocalSession, TuiSession, claudeAdapter, prepareCodexHome } from 'docubot';

/** The connector the ch09 build lab produces (one source of truth). */
export const DADJOKE = 'agentlab-dadjoke';

const ONLY_STEPS = new Set((process.env.DOCUBOT_ONLY_STEPS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const SKIP_STEPS = new Set((process.env.DOCUBOT_SKIP_STEPS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/** Selective rerun gate shared by chapter specs. Empty means run every step. */
export function shouldRunStep(id: string): boolean {
  const run = (ONLY_STEPS.size === 0 || ONLY_STEPS.has(id)) && !SKIP_STEPS.has(id);
  if (!run && process.env.DOCUBOT_VERBOSE_STEPS === '1') console.log(`[docubot] ${id}: skipped by step selection`);
  return run;
}

/**
 * The selector every FortiSOAR UI capture paints over by default: visible
 * appliance URLs. Pass to capture.shot's `mask`, extending it only when a
 * specific page has another value the author deliberately wants hidden.
 *
 * The user menu, avatar and settings icon are deliberately NOT masked (house
 * rule: never hide them on SOAR captures). docubot's scrub backstop still
 * refuses a shot on an unmasked private value.
 */
export function uiMask(page: any): any[] {
  // Mask the smallest text-bearing nodes. `getByText()` can resolve to a
  // table row/card that contains a URL, producing the broad dark bars seen in
  // captures. The leaf-node XPath keeps the URL mask limited to the URL text.
  return [page.locator('xpath=//*[not(*) and starts-with(normalize-space(.), "http://") or not(*) and starts-with(normalize-space(.), "https://")]')];
}

/**
 * Call an fsr-agentic-toolkit tool and return its parsed JSON result — the box
 * effect-check path. Resolves the CLI the way the agent's MCP server does:
 * beside FSR_PYTHON, then on PATH, then via uvx. Throws on a tool error so a
 * failed effect fails the step. Mirrors tools/e2e/lib/harness.js pyfsrTool.
 */
export function toolkit(name: string, args: Record<string, unknown> = {}): any {
  const py = process.env.FSR_PYTHON;
  const beside = py && py.includes(path.sep) ? path.join(path.dirname(py), 'fsr-agentic-toolkit') : null;
  const onPath = (() => {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      if (dir && fs.existsSync(path.join(dir, 'fsr-agentic-toolkit'))) return path.join(dir, 'fsr-agentic-toolkit');
    }
    return null;
  })();
  const resolved = (beside && fs.existsSync(beside) && beside) || onPath;
  const [exe, pre] = resolved ? [resolved, [] as string[]] : ['uvx', ['--from', 'fsr-agentic-toolkit', 'fsr-agentic-toolkit']];
  let stdout: string;
  try {
    stdout = execFileSync(exe, [...pre, 'call', '--json', name, JSON.stringify(args)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...pyfsrEnv(), FSR_SUPPRESS_INSECURE_WARNINGS: 'true' },
      timeout: 12 * 60 * 1000,
    });
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        'fsr-agentic-toolkit not found: set FSR_PYTHON to the toolkit venv interpreter, ' +
          'put the CLI on PATH, or install uv for the uvx fallback. An env setup problem, not a content failure.',
      );
    }
    throw err;
  }
  const result = JSON.parse(stdout);
  if (result && result.error) throw new Error(`${name}: ${JSON.stringify(result.error).slice(0, 500)}`);
  return result;
}

/** Env with the FSR_PYTHON venv bin first on PATH, for shelling the pyfsr CLI. */
export function pyfsrEnv(): NodeJS.ProcessEnv {
  const py = process.env.FSR_PYTHON;
  const bin = py && py.includes(path.sep) ? path.dirname(py) : null;
  // The box coordinates live in FSR_ENV_FILE; load them so every child (pyfsr,
  // the toolkit CLI) reaches the same box without the caller exporting FSR_*.
  // Values already in the environment win.
  const fromFile: Record<string, string> = {};
  const envFile = process.env.FSR_ENV_FILE;
  if (envFile && fs.existsSync(envFile)) {
    for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      fromFile[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...fromFile, ...process.env, PATH: bin ? `${bin}${path.delimiter}${process.env.PATH}` : process.env.PATH };
}

/** Run a shell command (pyfsr CLI etc.) and return stdout; throws on nonzero. */
export function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5 * 60 * 1000, env: pyfsrEnv(), cwd });
}

/**
 * Drive the repeatable python seeder (tools/lab_setup.py) from a docubot spec's
 * CONFIGURE phase, so one `docubot run` seeds the box and then captures. The
 * seeder is idempotent (create-if-absent), so this is safe to call every run.
 * It installs the SAME artifacts students download from static/examples, so the
 * seed path and the student import path never drift.
 *
 * Box connection comes from the FSR_* env the run already sets (FSR_BASE_URL,
 * FSR_USERNAME, FSR_PASSWORD, FSR_VERIFY_SSL). Mutating, so gate it behind the
 * chapter's build flag; it is a no-op worth skipping on a read-only run.
 *
 * @param cmd a lab_setup.py subcommand: 'seed' | 'org-context' | 'install-agent'
 *   | 'mcp-server' | 'records' (and chapter seeders as they are added)
 */
/**
 * Capture options for an agent TUI screen: the student's window title, and the
 * agent's real working folder (the folder holding DOCUBOT_MCP_CONFIG) shown as
 * the ~/agent-lab folder the pages tell the student to work in.
 */
/** Working folder for the TUI agent: outside every repo. */
export const AGENT_CWD = path.join(os.tmpdir(), 'fsa-workshop', 'agent-lab');

// Agent sessions are shown unmasked (scrub off); only the temp folder is
// renamed to the folder the pages use.
// Footer items that come from the capturing machine, not the lab: Claude Code's
// count of other local sessions and the checkout's open merge request. Gaps
// between words are serialized as cursor-forward escapes, and colour codes can
// sit between them, so both count as space.
const GAP = String.raw`(?:\s|\x1b\[[\d;]*[Cm])*`;
const FOOTER_NOISE: Array<[RegExp, string]> = [
  [new RegExp(`${GAP}[·•]${GAP}←${GAP}\\d+${GAP}agents?`, 'g'), ''],
  [new RegExp(`${GAP}[·•]${GAP}MR${GAP}!\\d+`, 'g'), ''],
  // Claude Code's self-update notice on the capturing machine.
  [new RegExp(`(?:\x1b\\[[\\d;]*m)*✔${GAP}Update${GAP}installed${GAP}[·•]${GAP}/restart${GAP}to${GAP}apply(?:\x1b\\[[\\d;]*m)*`, 'g'), ''],
];

export function agentScreen(): { title: string; scrub: false; replace: Array<[string | RegExp, string]> } {
  const dir = process.env.DOCUBOT_MCP_CONFIG ? path.dirname(path.resolve(process.env.DOCUBOT_MCP_CONFIG)) : '';
  const home = process.env.HOME || '';
  const tilde = dir && home && dir.startsWith(home) ? '~' + dir.slice(home.length) : '';
  return {
    title: 'student@laptop: ~/agent-lab',
    scrub: false,
    // boxMasks: show the login and box the pages tell students to use (agentlab at
    // fortisoar.example.com), the same as codexScreen, whichever login captured it.
    replace: [['/private' + AGENT_CWD, '~/agent-lab'], [AGENT_CWD, '~/agent-lab'], [dir, '~/agent-lab'], [tilde, '~/agent-lab'], ...FOOTER_NOISE, ...boxMasks()].filter(([f]) => f) as Array<[string | RegExp, string]>,
  };
}

export function labSeed(cmd: string, ...args: string[]): string {
  const py = process.env.FSR_PYTHON || process.env.DOCUBOT_PYTHON || 'python3';
  const script = path.join(__dirname, '..', '..', 'tools', 'lab_setup.py');
  let out: string;
  try {
    out = execFileSync(py, [script, cmd, ...args], {
      encoding: 'utf8',
      timeout: 5 * 60 * 1000,
      env: { ...pyfsrEnv(), FSR_SUPPRESS_INSECURE_WARNINGS: 'true' },
      cwd: path.join(__dirname, '..', '..'),
    });
  } catch (e: any) {
    throw new Error(`lab_setup ${cmd} ${args.join(' ')} failed:\n${String(e.stdout || '')}${String(e.stderr || '')}`);
  }
  console.log(`[labSeed ${cmd}] ${out.trim().split('\n').pop()}`);
  return out;
}

/**
 * The Nth "Give your agent this prompt" fenced block on a content page — the
 * SAME prompt the student is told to run, so the spec proves the documented
 * text, never a spec-only copy. `page` is a content page stem in this chapter,
 * e.g. '01-explore-and-run'. n is 1-based.
 */
export function promptFor(chapter: string, page: string, n = 1): string {
  const file = path.join(__dirname, '..', '..', 'content', chapter, `${page}.md`);
  const md = fs.readFileSync(file, 'utf8');
  const re = /Give your agent this prompt[^\n]*\n+```[a-z]*\n([\s\S]*?)```/gi;
  const found: string[] = [];
  for (let m = re.exec(md); m; m = re.exec(md)) found.push(m[1].trim());
  const prompt = found[n - 1];
  if (!prompt) throw new Error(`no prompt #${n} on content/${chapter}/${page}.md (found ${found.length})`);
  return prompt;
}

/** Raw Markdown of a content page (`content/<chapter>/<page>.md`). */
export function pageMd(chapter: string, page: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'content', chapter, `${page}.md`), 'utf8');
}

/** The first ```yaml fence on a content page: the YAML the page tells the agent to produce. */
export function pageYaml(chapter: string, page: string): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(pageMd(chapter, page));
  if (!m) throw new Error(`no yaml fence on content/${chapter}/${page}.md`);
  return m[1];
}

/** YAML embedded in a prompt, from a literal start marker up to (not incl.) an end marker. */
export function promptYaml(chapter: string, page: string, startMarker: string, endMarker: string): string {
  const md = pageMd(chapter, page);
  const start = md.indexOf(startMarker);
  const end = md.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`prompt YAML markers not found on content/${chapter}/${page}.md`);
  return md.slice(start, end).trim() + '\n';
}

/** The record list out of a toolkit result, whatever envelope key the tool used. */
export function rows(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (!res || typeof res !== 'object') return [];
  for (const key of ['records', 'members', 'hydra:member', 'items', 'results', 'data']) {
    if (Array.isArray(res[key])) return res[key];
  }
  for (const v of Object.values(res)) if (Array.isArray(v)) return v as any[];
  return [];
}

/**
 * toolkit query_records -> rows. Pass `fields` in `extra` to get a custom
 * module's own field values (the default projection returns identity fields
 * only). FortiSOAR `like` needs SQL wildcards: pass `%value%`.
 */
export function queryRows(module: string, filters: unknown[], extra: Record<string, unknown> = {}): any[] {
  return rows(toolkit('query_records', { module, filters, limit: 100, ...extra }));
}

/**
 * Launch a Claude Code TUI against the box and return a session ready for a
 * prompt. How claude is launched, trusted and readied is docubot's
 * claudeAdapter; this adds only the workshop's choices: the box .mcp.json
 * (DOCUBOT_MCP_CONFIG) and a working folder outside any git repo, so the footer
 * shows no repo state (open merge request, project agents).
 */
export async function startAgent(
  local: (name: string, opts?: any) => Promise<LocalSession>,
  name: string,
  opts: { cols?: number; rows?: number; mcpEnv?: Record<string, string> } = {},
): Promise<LocalSession> {
  let mcp = process.env.DOCUBOT_MCP_CONFIG;
  if (!mcp || !fs.existsSync(mcp)) {
    throw new Error(
      'DOCUBOT_MCP_CONFIG must point at a .mcp.json with the box fortisoar server ' +
        '(an env setup problem, not a content failure).',
    );
  }
  fs.mkdirSync(AGENT_CWD, { recursive: true });
  // The page has students install the toolkit's skills; captures run with them
  // too. DOCUBOT_NO_SKILLS=1 runs without, for a with/without comparison.
  const skillsDir = path.join(AGENT_CWD, '.claude', 'skills');
  fs.rmSync(skillsDir, { recursive: true, force: true });
  if (process.env.DOCUBOT_NO_SKILLS !== '1') {
    const py = process.env.FSR_PYTHON;
    const cli = py ? path.join(path.dirname(py), 'fsr-agentic-toolkit') : 'fsr-agentic-toolkit';
    execFileSync(cli, ['skills', '--install', '--dir', skillsDir], { encoding: 'utf8' });
  }
  if (opts.mcpEnv) {
    // Extra server env (a page's FSR_SECRET_* reference) goes into a private copy
    // of the config, never into the shared one.
    const cfg = JSON.parse(fs.readFileSync(mcp, 'utf8'));
    for (const server of Object.values<any>(cfg.mcpServers ?? {})) server.env = { ...server.env, ...opts.mcpEnv };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsa-mcp-'));
    mcp = path.join(dir, '.mcp.json');
    fs.writeFileSync(mcp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  }
  const { file, args } = claudeAdapter.launchArgv({ type: 'agent', tool: 'claude' } as any, path.resolve(mcp));
  const term = await local(name, { file, args, cwd: AGENT_CWD, cols: opts.cols ?? 100, rows: opts.rows ?? 40 });
  await claudeAdapter.clearStartupGates(term);
  await term.waitFor(claudeAdapter.readyPattern, { timeoutMs: 120_000 });
  return term;
}

/**
 * Drive one agent turn and return its final screen for capture.screen(). The
 * turn logic (approval forms, prose go-aheads answered with `confirm`, waiting
 * for the turn's own completion line) is docubot's claudeAdapter.turn.
 */
export async function agentTurn(
  term: LocalSession,
  prompt: string,
  opts: { confirm?: string; quietMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  return claudeAdapter.turn!(term, prompt, opts);
}

// ---------------------------------------------------------------------------
// Codex. The captures run Codex on the student's own config.toml, written into an
// isolated CODEX_HOME under the gitignored .agent-lab/ (auth.json is linked from
// ~/.codex, which is never edited). Every Codex capture passes an effect check
// (toolkit whoami / the alerts module) before its PNG is written.

/** The isolated CODEX_HOME the Codex captures launch with. */
export const CODEX_HOME = path.join(__dirname, '..', '..', '.agent-lab', 'codex-home');

/** The login the captures show, as the page names it (`connected: agentlab`). The box's real login is masked. */
export const SHOWN_LOGIN = 'agentlab';
/** The box URL the captures show. */
export const SHOWN_BOX_URL = 'https://fortisoar.example.com';

/** Write the skills block and the student config.toml, as the page's steps do. */
function prepareCodexLab(): string {
  const mcp = process.env.DOCUBOT_MCP_CONFIG;
  if (!mcp || !fs.existsSync(mcp)) {
    throw new Error('DOCUBOT_MCP_CONFIG must point at a .mcp.json with the box fortisoar server (an env setup problem, not a content failure).');
  }
  fs.mkdirSync(AGENT_CWD, { recursive: true });
  if (process.env.DOCUBOT_NO_SKILLS !== '1') {
    const py = process.env.FSR_PYTHON;
    const cli = py ? path.join(path.dirname(py), 'fsr-agentic-toolkit') : 'fsr-agentic-toolkit';
    // The page's Codex/OpenCode skills step: a block in AGENTS.md that points at the skills.
    execFileSync(cli, ['skills', '--install', '--agents-md', path.join(AGENT_CWD, 'AGENTS.md')], { encoding: 'utf8' });
  }
  prepareCodexHome(CODEX_HOME, path.resolve(mcp));
  return path.resolve(mcp);
}

/** Start the Codex TUI on the box the way a student runs `codex` in the lab folder. */
export async function startCodex(name: string, opts: { cols?: number; rows?: number } = {}): Promise<TuiSession> {
  const mcp = prepareCodexLab();
  return TuiSession.start(name, { type: 'agent', tool: 'codex', mcpConfig: mcp, cwd: AGENT_CWD, codexHome: CODEX_HOME }, {
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 40,
  });
}

/** A shell in the lab folder with CODEX_HOME set, for the `codex mcp list` check. */
export async function codexShell(name: string, opts: { cols?: number; rows?: number } = {}): Promise<LocalSession> {
  prepareCodexLab();
  return LocalSession.spawn(name, { type: 'local' } as any, {
    file: '/bin/bash',
    args: ['--noprofile', '--norc', '-i'],
    cwd: AGENT_CWD,
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 40,
    env: { PS1: 'student@laptop:~/agent-lab$ ', CODEX_HOME },
  });
}

/** The box host the pages type (no scheme), from the lab env. */
export function boxHost(): string {
  const base = pyfsrEnv().FSR_BASE_URL || '';
  try { return new URL(base).host; } catch { return base.replace(/^https?:\/\//, '').replace(/\/+$/, ''); }
}

/** The toolkit CLI the shots run: beside FSR_PYTHON, else on PATH. */
function toolkitCli(): string {
  const py = process.env.FSR_PYTHON;
  return py && py.includes(path.sep) ? path.join(path.dirname(py), 'fsr-agentic-toolkit') : 'fsr-agentic-toolkit';
}

/**
 * Write the project .mcp.json that the Claude Code page step has the student
 * save, generated by the toolkit's own `init --claude-code` (the same snippet the
 * page prints). The file holds the password, so it is written 0600 into a
 * throwaway folder. Returns the file path.
 */
export function writeClaudeMcpJson(folder: string): string {
  const env = pyfsrEnv();
  const out = execFileSync(toolkitCli(), [
    'init', '--url', boxHost(), '--username', env.FSR_USERNAME ?? '', '--no-verify-ssl', '--readonly', '--claude-code',
  ], { encoding: 'utf8', env: { ...env, FSR_SUPPRESS_INSECURE_WARNINGS: 'true' } as NodeJS.ProcessEnv, timeout: 2 * 60 * 1000 });
  const m = /^# \.mcp\.json[^\n]*\n([\s\S]*?\n\})/m.exec(out);
  if (!m) throw new Error('writeClaudeMcpJson: init printed no .mcp.json snippet');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, '.mcp.json');
  fs.writeFileSync(file, m[1] + '\n', { mode: 0o600 });
  return file;
}

/** The prompt the terminal shots show (the student's shell, as the pages name it). */
const SHELL_PROMPT = 'student@laptop:~/agent-lab$ ';

export interface ShellShotOptions {
  /** The command the student types into the shell. */
  command: string;
  /** The shell's working folder (default AGENT_CWD). */
  cwd?: string;
  /** Extra environment for the shell. Secrets go here, never into the command line. */
  env?: Record<string, string>;
  /** Env names whose values must not show: [name, placeholder], e.g. ['FSR_PASSWORD', '<your-password>']. */
  secrets?: Array<[string, string]>;
  /** Keep the output from the first line matching `from` through the first line matching `to` (inclusive). */
  from?: RegExp;
  to?: RegExp;
  /** Checks on the MASKED output. A failed check throws before any PNG is written. */
  expect?: RegExp[];
  /** Extra text swaps, applied after the box masks and the secrets. */
  replace?: Array<[string | RegExp, string]>;
  /** Pty width (default 150: a long command line must not wrap). */
  cols?: number;
  /** Longest the command may run (default 5 minutes). */
  timeoutMs?: number;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The value of an env name for a shot's shell: the shot's own env, then the lab env file, then the process. */
function envValue(name: string, opts: ShellShotOptions): string | undefined {
  return opts.env?.[name] ?? pyfsrEnv()[name] ?? process.env[name];
}

/** Literal swaps for each secret: the value and its JSON-escaped form (a snippet's copy of it). */
function secretMasks(opts: ShellShotOptions): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [name, placeholder] of opts.secrets ?? []) {
    const v = envValue(name, opts);
    if (!v) continue;
    out.push([v, placeholder]);
    const esc = JSON.stringify(v).slice(1, -1);
    if (esc !== v) out.push([esc, placeholder]);
  }
  return out;
}

/** Apply literal and regex swaps in order. */
function applyMasks(text: string, masks: Array<[string | RegExp, string]>): string {
  let out = text;
  for (const [from, to] of masks) {
    if (from instanceof RegExp) out = out.replace(from, to);
    else if (from) out = out.split(from).join(to);
  }
  return out;
}

/** Index range [first, last] of the lines from the first line matching `from` through the first matching `to`. */
function cropRange(lines: string[], from?: RegExp, to?: RegExp): [number, number] {
  const first = from ? lines.findIndex((l) => from.test(l)) : 0;
  if (from && first < 0) throw new Error(`shellShot: no output line matches ${from}`);
  let last = lines.length - 1;
  if (to) {
    const hit = lines.findIndex((l, i) => i >= first && to.test(l));
    if (hit < 0) throw new Error(`shellShot: no output line after the start matches ${to}`);
    last = hit;
  }
  return [first, last];
}

/** Start a bash shell in a pty at the lab folder, with the student's prompt, and wait for that prompt. */
async function spawnShell(name: string, opts: ShellShotOptions): Promise<LocalSession> {
  const cwd = opts.cwd ?? AGENT_CWD;
  fs.mkdirSync(cwd, { recursive: true });
  const sh = LocalSession.spawn(name, { type: 'local' } as any, {
    file: '/bin/bash',
    args: ['--noprofile', '--norc', '-i'],
    cwd,
    cols: opts.cols ?? 150,
    rows: 60,
    env: { ...(pyfsrEnv() as Record<string, string>), ...(opts.env ?? {}), PS1: SHELL_PROMPT },
  });
  const readyBy = Date.now() + 30_000;
  while (!sh.transcript().includes(SHELL_PROMPT)) {
    if (sh.exited || Date.now() > readyBy) {
      sh.kill();
      throw new Error(`shellShot ${name}: the shell never showed its prompt`);
    }
    await delay(200);
  }
  return sh;
}

/**
 * Type `command` into the shell and wait for the shell's next prompt. Returns the
 * absolute buffer rows the command used: [start, end). Rows come from the emulated
 * screen, so a spinner or a redraw resolves to what a terminal shows at the end.
 */
async function runCommand(sh: LocalSession, opts: ShellShotOptions): Promise<{ start: number; end: number }> {
  // The prompt's row: the command is echoed on it, and its output starts below.
  const start = sh.cursorLine();
  sh.send(opts.command);
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000);
  // Done when the cursor is on a later row that shows the shell's next prompt.
  for (;;) {
    const at = sh.cursorLine();
    if (at > start && sh.plainRows(at, at + 1).startsWith(SHELL_PROMPT.trimEnd())) return { start, end: at };
    if (sh.exited) return { start, end: sh.cursorLine() };
    if (Date.now() > deadline) {
      const tail = sh.plainScreen().split('\n').filter((l) => l.trim()).slice(-20).join('\n');
      throw new Error(`shellShot: "${opts.command}" did not finish in time. Last screen:\n${tail}`);
    }
    await delay(250);
  }
}

/**
 * A terminal PNG of a command a student runs in the lab folder: a shell in a pty,
 * the command typed and finished, the rows read from the emulated screen, then the
 * crop (`from`/`to`), the masks, the checks, and capture.terminal. The box URL,
 * login and display name are masked as boxMasks() does; each `secrets` value is
 * replaced by its placeholder, and the shot is REFUSED if a secret still shows.
 * `expect` runs on the masked text, so a wrong state writes no PNG. Returns the PNG path.
 */
export async function shellShot(capture: Capture, id: string, opts: ShellShotOptions): Promise<string> {
  const sh = await spawnShell(id, opts);
  try {
    const { start, end } = await runCommand(sh, opts);
    const plainLines = sh.plainRows(start, end).split('\n');
    const [first, last] = opts.from || opts.to ? cropRange(plainLines, opts.from, opts.to) : [0, plainLines.length - 1];
    const home = process.env.HOME || '';
    const masks: Array<[string | RegExp, string]> = [
      ...(home ? [[home, '~'] as [string, string]] : []),
      ...boxMasks(),
      ...secretMasks(opts),
      ...(opts.replace ?? []),
    ];
    const maskedPlain = applyMasks(plainLines.slice(first, last + 1).join('\n'), masks);
    for (const [v] of secretMasks(opts)) {
      if (maskedPlain.includes(v)) throw new Error(`shellShot ${id}: a secret still shows in the output. Nothing was written.`);
    }
    for (const re of opts.expect ?? []) {
      if (!re.test(maskedPlain)) throw new Error(`shellShot ${id}: expected ${re} in the output. Nothing was written.\n${maskedPlain.slice(-1200)}`);
    }
    const shown = sh.colouredRows(start + first, start + last + 1);
    return capture.terminal(id, shown, { title: 'student@laptop: ~/agent-lab', cols: 110, replace: masks });
  } finally {
    sh.kill();
  }
}

/** The box login and display name, from the toolkit (the effect check's source of truth). */
export function boxIdentity(): { loginid: string; name: string; version: string } {
  const who = toolkit('whoami');
  return { loginid: who.user.loginid, name: who.user.name ?? '', version: who.version };
}

/** Rows of the alerts module named exactly `name` (the approval test's effect). */
export function alertsNamed(name: string): any[] {
  return queryRows('alerts', [{ field: 'name', operator: 'eq', value: name }], { fields: ['name', 'severity'] }).filter((r) => r.name === name);
}

/** Replace the box's real URL, host, login and display name with the page's placeholders. */
export function boxMasks(): Array<[string | RegExp, string]> {
  const env = pyfsrEnv();
  const base = env.FSR_BASE_URL || '';
  const out: Array<[string | RegExp, string]> = [];
  if (base) {
    let host = base;
    try { host = new URL(base).hostname; } catch { /* keep as is */ }
    const who = (() => { try { return boxIdentity(); } catch { return null; } })();
    // A multi-word display name: the gaps can be serialized as cursor-forward or
    // colour escapes, so match each gap as GAP, not a literal space.
    if (who?.name) {
      const words = who.name.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      out.push([new RegExp(words.join(GAP), 'g'), 'Agent Lab']);
    }
    if (who?.loginid) out.push([who.loginid, SHOWN_LOGIN]);
    // host:port first, so the port does not survive the hostname swap.
    let hostPort = host;
    try { hostPort = new URL(base).host; } catch { /* keep as is */ }
    out.push([base, SHOWN_BOX_URL], [hostPort, 'fortisoar.example.com'], [host, 'fortisoar.example.com']);
  }
  return out;
}

/** agentScreen() for a Codex capture: the same folder and footer handling, plus the box masks, scrub kept on. */
export function codexScreen(): { title: string; replace: Array<[string | RegExp, string]> } {
  const a = agentScreen();
  const home = process.env.HOME || '';
  // The student's home folder shows as ~ (a path under it is a local detail, not a lab one).
  const homeMask: Array<[string, string]> = home ? [[home, '~']] : [];
  // Codex's footer shows the cwd, cut short; the temp root it sits under is local too.
  const tempFolder: Array<[RegExp, string]> = [[/(?:\/private)?\/var\/folders\/\S*?fsa-workshop\/agent\S*/g, '~/agent-lab']];
  return { title: a.title, replace: [...a.replace, ...homeMask, ...tempFolder] };
}

