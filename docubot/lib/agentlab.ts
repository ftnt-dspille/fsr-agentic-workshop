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
import { LocalSession, claudeAdapter } from 'docubot';

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
      env: { ...process.env, FSR_SUPPRESS_INSECURE_WARNINGS: 'true' },
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
  return { ...process.env, PATH: bin ? `${bin}${path.delimiter}${process.env.PATH}` : process.env.PATH };
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
];

export function agentScreen(): { title: string; scrub: false; replace: Array<[string | RegExp, string]> } {
  const dir = process.env.DOCUBOT_MCP_CONFIG ? path.dirname(path.resolve(process.env.DOCUBOT_MCP_CONFIG)) : '';
  const home = process.env.HOME || '';
  const tilde = dir && home && dir.startsWith(home) ? '~' + dir.slice(home.length) : '';
  return {
    title: 'student@laptop: ~/agent-lab',
    scrub: false,
    replace: [['/private' + AGENT_CWD, '~/agent-lab'], [AGENT_CWD, '~/agent-lab'], [dir, '~/agent-lab'], [tilde, '~/agent-lab'], ...FOOTER_NOISE].filter(([f]) => f) as Array<[string | RegExp, string]>,
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
  opts: { cols?: number; rows?: number } = {},
): Promise<LocalSession> {
  const mcp = process.env.DOCUBOT_MCP_CONFIG;
  if (!mcp || !fs.existsSync(mcp)) {
    throw new Error(
      'DOCUBOT_MCP_CONFIG must point at a .mcp.json with the box fortisoar server ' +
        '(an env setup problem, not a content failure).',
    );
  }
  fs.mkdirSync(AGENT_CWD, { recursive: true });
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
