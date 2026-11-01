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
import { LocalSession } from 'docubot';

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

/** Keys the Claude Code TUI needs; named so the driving code reads clearly. */
const KEY = { down: '\x1b[B', up: '\x1b[A', enter: '\r', shiftTab: '\x1b[Z', space: ' ' };

// The server-side write-approval elicitation (toolkit verbs/approval.py, 0.1.9+).
// The caret line while the checkbox is unchecked; U+2610 is replaced by a checked
// glyph once toggled, so "still unchecked" is the robust live-form / tick test.
const APPROVAL_UNCHECKED = /Approve this change:\s*☐/;

// Claude Code's turn-complete status line, e.g. "Cooked for 38s . done" (the verb
// varies: Cooked/Brewed/Churned/...). Counting it over the full scrollback marks
// a turn's end even for a reused session that already shows an earlier "done".
const TURN_DONE = /for \d+s[^\n]*\bdone\b/gi;
const turnDoneCount = (term: LocalSession): number => (term.screen().match(TURN_DONE) || []).length;

/**
 * Answer the MCP write-approval form the toolkit server raises before a write:
 * a boolean "Approve this change" checkbox ABOVE an Accept/Decline row. In the
 * current Claude Code TUI the caret starts on Accept (❯ Accept Decline), not on
 * the checkbox, and the footer navigates with up/down - so move UP to the
 * checkbox, tick it (Space), then DOWN to Accept and submit (Enter). Accepting
 * with the box unticked cancels the write, so the tick is verified (the ☐ glyph
 * must disappear) before Accept is pressed. Self-correcting on the tick.
 */
async function answerApprovalGate(term: LocalSession): Promise<boolean> {
  // Act only on a LIVE form: the unticked checkbox (U+2610) is on screen. If it
  // is not, the "requests your input" text is just lingering in the buffer after
  // an answer already given - do not send stray keystrokes into the chat input.
  if (!APPROVAL_UNCHECKED.test(term.plainScreen())) return false;
  if (process.env.DOCUBOT_DEBUG_APPROVAL === '1') {
    console.log('\n===== APPROVAL FORM (before tick) =====\n' + term.plainScreen() + '\n===== END =====\n');
  }
  // The caret starts on the Accept button; step up to the checkbox row, then tick.
  // Retry the up+space pair so one missed keystroke self-corrects.
  for (let i = 0; i < 4 && APPROVAL_UNCHECKED.test(term.plainScreen()); i++) {
    term.write(KEY.up);
    await settle(300);
    term.write(KEY.space);
    await settle(500);
  }
  if (APPROVAL_UNCHECKED.test(term.plainScreen())) {
    if (process.env.DOCUBOT_DEBUG_APPROVAL === '1') {
      console.log('\n===== APPROVAL FORM (after tick attempts, still unchecked) =====\n' + term.plainScreen() + '\n===== END =====\n');
    }
    throw new Error('write-approval gate: could not tick "Approve this change"');
  }
  term.write(KEY.down); // caret from the checkbox back down to the Accept button
  await settle(500);
  term.write(KEY.enter); // activate Accept
  // Wait for the form to leave the viewport so the next race does not re-match
  // the same prompt (bounded; the model's continued output scrolls it off).
  for (let j = 0; j < 20 && /Accept\s+Decline/.test(term.plainScreen()); j++) await settle(500);
  return true;
}

/**
 * A small bounded real delay. Used ONLY for the trust menu: Ink attaches its
 * key handler a beat after the menu paints, and that readiness emits no output,
 * so there is no screen signal to wait on - waitIdle returns at once because the
 * menu is already quiet. Everywhere else we wait on a real signal, never a sleep.
 */
const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Launch a Claude Code TUI against the box and return a session ready for a
 * prompt. Points the agent at the box over MCP (DOCUBOT_MCP_CONFIG, a
 * .mcp.json with the fortisoar server), pins the model so captures never show
 * the operator's own default, clears the first-run "trust the files" prompt,
 * and switches on auto-accept so only the connector's own tier gate pauses a
 * turn (agentTurn answers that). cols/rows fix the capture width.
 *
 * The launch is deliberately explicit rather than relying on repo-local config:
 * --strict-mcp-config so only this file's servers load (never the operator's
 * user-level MCP servers). --dangerously-skip-permissions is NOT passed; the
 * auto-mode classifier blocks it. Keystroke sends are separated from Enter:
 * under the TUI's bracketed-paste a combined "text\r" submits as a newline, not
 * a return, so the prompt would never send.
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
  const model = process.env.DOCUBOT_AGENT_MODEL || 'claude-sonnet-5-5';
  // Run from a folder outside any git repo, so the footer shows no repo state
  // (open merge request, project agents) from wherever docubot is checked out.
  fs.mkdirSync(AGENT_CWD, { recursive: true });
  const term = await local(name, {
    file: 'claude',
    args: ['--mcp-config', path.resolve(mcp), '--strict-mcp-config', '--model', model],
    cwd: AGENT_CWD,
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 40,
  });
  // First launch in a new folder shows the trust gate ("Is this a project you
  // created or one you trust? ... Yes, I trust this folder"). The menu opens on
  // "No, exit", so the trust row is one Down, then Enter. Signal-based, never a
  // fixed sleep. If no gate shows (folder already trusted), skip.
  const trusted = await term
    .waitFor(/trust this folder|safety check|a project you (created|trust)/i, { timeoutMs: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (trusted) {
    // Position the caret on "Yes, I trust this folder" and only then confirm.
    // The menu opens on "No, exit" (confirming it blind quits), and the Ink menu
    // IGNORES arrow keys until it has finished its first paint, so settle before
    // the first Down and after each one. Match on the PLAIN screen (the menu
    // draws CUF escapes between characters). Self-correcting: Down toggles the
    // two rows, so press until the caret line is the trust row.
    const caretOnTrust = () =>
      /trust this folder/i.test(
        term.plainScreen().split('\n').find((l) => /❯/.test(l)) || '',
      );
    await settle(1200);
    for (let i = 0; i < 4 && !caretOnTrust(); i++) {
      term.write(KEY.down);
      await settle(700);
    }
    if (!caretOnTrust()) {
      throw new Error('trust gate: could not move the caret to "Yes, I trust this folder"');
    }
    term.write(KEY.enter);
  }
  // Wait for the READY screen: the version banner, the input-box placeholder, or
  // the mode footer. Match on these, never on the bare caret (the trust gate
  // drew one too). Auto mode is already ON in this harness ("auto mode on
  // (shift+tab to cycle)"), so do NOT send shift+tab - that would toggle it OFF
  // and make every routine tool call stop for approval.
  await term.waitFor(/Claude Code v\d|auto mode on|Try "|for shortcuts/i, {
    timeoutMs: 120_000,
  });
  return term;
}

/**
 * Drive one agent turn in a Claude Code TUI session and return its final screen.
 * Types the prompt, submits it (type then Enter, separated — see startAgent),
 * optionally answers a tier-gated confirm, waits for the turn to go idle, then
 * returns the screen for capture.screen().
 */
export async function agentTurn(
  term: LocalSession,
  prompt: string,
  opts: { confirm?: string; quietMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  term.type(prompt);
  await term.waitFor(new RegExp(prompt.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), {
    timeoutMs: 15_000,
  }).catch(() => {});
  term.enter();
  if (opts.confirm) {
    // The go-ahead can arrive three ways, so race them instead of blocking on one:
    //  - a PROSE yes/no question the agent typed in chat  -> answer it with text;
    //  - the MCP write-approval CHECKBOX form             -> the gate loop below
    //    ticks it (do not type a sentence into a checkbox), so just stop waiting;
    //  - no approval at all (the tool was not gated, or the agent finished)
    //    -> the turn completes, so stop waiting rather than hang to timeout.
    // "Approve this change" belongs to the checkbox form, so it is NOT in the
    // prose pattern (that is the gate loop's job).
    const base0 = turnDoneCount(term);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await settle(500);
      const scr = term.plainScreen();
      if (APPROVAL_UNCHECKED.test(scr)) break; // checkbox form -> gate loop handles it
      if (/\bproceed\b|\(y\/n\)|\byes,|go ahead\b|shall i\b|should i\b|\bconfirm\b|would you like\b/i.test(scr)) {
        term.type(opts.confirm);
        term.enter();
        break;
      }
      if (turnDoneCount(term) > base0) break; // turn finished with no approval to answer
    }
  }
  // Wait for the turn to actually COMPLETE, not merely go quiet: a fresh agent's
  // initial thinking gap is quiet but not done (that returned the bare startup
  // banner), and a write pauses on the approval form while the spinner animates
  // (never idle). The reliable completion signal is Claude Code's status line
  // "<verb> for <N>s . done"; count it against a baseline so a reused agent's
  // earlier "done" does not false-trigger. A live approval form (unticked box)
  // is answered as it appears; after the last answer the turn's own "done"
  // ends the wait.
  const base = turnDoneCount(term);
  const deadline = Date.now() + timeoutMs;
  gate: for (let guard = 0; guard < 12; guard++) {
    while (Date.now() < deadline) {
      await settle(600);
      if (APPROVAL_UNCHECKED.test(term.plainScreen())) {
        await answerApprovalGate(term);
        continue gate; // re-enter the wait for the next approval or completion
      }
      if (turnDoneCount(term) > base) break gate;
    }
    break; // timeout
  }
  return term.screen();
}
