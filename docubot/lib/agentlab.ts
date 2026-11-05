// Workshop-local helpers layered on docubot's device modules. Everything product-generic (the toolkit CLI, the
// lab seeder, the agent launcher, login, nav, capture, pty) comes from docubot; this file holds only what is
// specific to THIS workshop: the persona the shots show, the connector the ch09 lab builds, pulling an agent
// prompt out of the page it is documented on, and the terminal shots.
import * as fs from 'fs';
import * as path from 'path';
import { Capture, LocalSession, boxMasks as boxMasksFor, createAgentLab, pyfsrEnv, toolkitSkills, toolkitVenvMasks } from 'docubot';

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

/** The login the captures show, as the page names it (`connected: agentlab`). The box's real login is masked. */
export const SHOWN_LOGIN = 'agentlab';
/** The box URL the captures show. */
export const SHOWN_BOX_URL = 'https://fortisoar.example.com';

/** Replace the box's real URL, host, login and display name with the page's placeholders. */
export const boxMasks = () => boxMasksFor({ login: SHOWN_LOGIN, name: 'Agent Lab', url: SHOWN_BOX_URL });

// The agent lab: this workshop's temp folder name, box masks, and how the toolkit's skills install.
const lab = createAgentLab({ name: 'fsa-workshop', masks: boxMasks, skills: toolkitSkills });
export const { AGENT_CWD, CODEX_HOME, agentScreen, codexScreen, startAgent, agentTurn, startCodex, codexShell } = lab;

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
      // The toolkit's venv (FSR_PYTHON's root) is a local path: the page shows the
      // command as /your/venv/bin/fsr-agentic-toolkit, so it is masked first.
      ...toolkitVenvMasks(),
      ...(home ? [[home, '~'] as [string, string]] : []),
      ...boxMasks(),
      ...secretMasks(opts),
      ...(opts.replace ?? []),
    ];
    const maskedPlain = applyMasks(plainLines.slice(first, last + 1).join('\n'), masks);
    for (const [v] of secretMasks(opts)) {
      if (maskedPlain.includes(v)) throw new Error(`shellShot ${id}: a secret still shows in the output. Nothing was written.`);
    }
    // A local machine path is never shown: refuse the shot rather than publish it.
    const localPath = /\/(?:Users|home)\/[^\s/]+\/|\/private\/(?:var|tmp)\/|\/var\/folders\//.exec(maskedPlain);
    if (localPath) throw new Error(`shellShot ${id}: a local path shows in the output (${localPath[0]}). Nothing was written.`);
    for (const re of opts.expect ?? []) {
      if (!re.test(maskedPlain)) throw new Error(`shellShot ${id}: expected ${re} in the output. Nothing was written.\n${maskedPlain.slice(-1200)}`);
    }
    const shown = sh.colouredRows(start + first, start + last + 1);
    return capture.terminal(id, shown, { title: 'student@laptop: ~/agent-lab', cols: 110, replace: masks });
  } finally {
    sh.kill();
  }
}

