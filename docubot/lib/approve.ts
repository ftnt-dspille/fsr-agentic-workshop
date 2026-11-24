// Claude Code under docubot's ClaudeApproval, for the chapters whose page has the agent make several writes the student
// approves (chapters 7 to 10). The client's own prompt is the only gate: the toolkit adds no approval form of its own, and
// nothing here decides an answer from screen text. A step declares the calls its page lets the agent make (`Allowed`); the
// hook denies every other write, ClaudeApproval reports each declared call from Claude's own events, and the step approves it
// (its `check` first reads the call's arguments). The picture is the real terminal's screenshot (`capture.agent`).
import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { buildExpect, type Expect, type PendingCall } from 'docubot/agents';
import { escapeRe, toolkitSkills } from 'docubot/products/fortisoar';
import { env } from 'docubot';
import { AGENT_CWD, startClaudeApproval } from './agentlab';

/** Argument names that name a target on the FortiSOAR toolkit, beside `module` and `instance`. */
const TOOLKIT_TARGET_KEYS = ['module', 'connector', 'server', 'name'];
/** Claude's own tools that never change anything on the box or the machine; every other built-in is denied unless the step lists it. */
export const READ_BUILTINS = ['Read', 'Glob', 'Grep', 'TodoWrite', 'ToolSearch', 'Skill'];

export type Args = Record<string, any>;

/** Observe mode: see the builtinRules note in startClaude and the event log in approvedTurn. */
const OBSERVE = process.env.DOCUBOT_OBSERVE === '1';

/** One call a step lets the agent make, and approves when it is asked. */
export interface Allowed {
  tool: string;
  /** Arguments the call must carry (deep equality per declared key). A confirm tool states `confirm: true`. */
  args?: Expect['args'];
  /** The tool acts on the one box the server is configured for and has no argument naming a narrower target. */
  anyTarget?: true;
  /** The turn is not done until this was approved: `true` keys it by tool, a string is a group (any member satisfies it). */
  required?: boolean | string;
  /** Read the captured call before it is approved. A complaint declines the call and fails the step. */
  check?: (args: Args) => string | undefined;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const matches = (declared: Expect['args'], actual: Args): boolean => Object.entries(declared).every(([k, v]) => same(actual[k], v));
const keyOf = (a: Allowed): string | undefined => (a.required === true ? a.tool : a.required || undefined);

export type ClaudeRun = Awaited<ReturnType<typeof startClaudeApproval>> & {
  /** Where the agent works (the lab folder). */
  cwd: string;
};

/**
 * Start Claude Code in a real terminal under the policy hook, on the operator's own login. The working folder is wiped first
 * unless `keepCwd`. `bash` and `writeFiles` open the narrow built-in rules described below (a step that works on what an earlier step built). The page's skills are installed as the page has a student do it.
 * `mcpEnv` adds server env (a page's FSR_SECRET_* reference) to a private copy of the box's .mcp.json.
 */
export async function startClaude(page: Page, o: { bash?: Array<string | { matches?: string; segments?: string[] }>; writeFiles?: boolean; mcpEnv?: Record<string, string>; keepCwd?: boolean; cols?: number; rows?: number } = {}): Promise<ClaudeRun> {
  const mcp = process.env.DOCUBOT_MCP_CONFIG;
  if (!mcp || !fs.existsSync(mcp)) throw new Error('DOCUBOT_MCP_CONFIG must point at a .mcp.json with the box fortisoar server (an env setup problem, not a content failure).');
  // The operator's subscription login only: an API key in the environment would be used instead and bill the wrong account.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const cwd = AGENT_CWD;
  if (!o.keepCwd) fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const skills = path.join(cwd, '.claude', 'skills');
  fs.rmSync(skills, { recursive: true, force: true });
  if (!env.flag('DOCUBOT_NO_SKILLS')) toolkitSkills.claude?.(skills);
  let config = path.resolve(mcp);
  if (o.mcpEnv) {
    const conf = JSON.parse(fs.readFileSync(config, 'utf8'));
    for (const server of Object.values<any>(conf.mcpServers ?? {})) server.env = { ...server.env, ...o.mcpEnv };
    config = path.join(fs.mkdtempSync(path.join(path.dirname(cwd), 'mcp-')), '.mcp.json');
    fs.writeFileSync(config, JSON.stringify(conf, null, 2), { mode: 0o600 });
  }
  // Built-ins that change the machine are allowed only in the shape the step names: a Bash command that fits one of the given
  // shapes (a string is a whole-command shape; an object with `segments` lets the agent join the allowed commands any which
  // way -- the kit's segment mode), and Write/Edit only on a path inside the lab folder (both spellings of a temp path).
  const dirs = [...new Set([cwd, fs.realpathSync(cwd)])];
  const builtinRules = [
    // Observe mode (DOCUBOT_OBSERVE=1, for building a step by hand): any shell command fits, so the trial shows what the
    // agent does instead of where the step's rule stops it. Never set in a capture run.
    ...(OBSERVE ? [{ tool: 'Bash', key: 'command', matches: '[\\s\\S]*' }] : []),
    ...(o.bash ?? []).map((b) => (typeof b === 'string' ? { tool: 'Bash', key: 'command', matches: b } : { tool: 'Bash', key: 'command', ...b })),
    ...(o.writeFiles ? ['Write', 'Edit'].map((tool) => ({ tool, key: 'file_path', under: dirs })) : []),
  ];
  if (OBSERVE) console.log('[docubot observe] startClaude: launching');
  const run = await startClaudeApproval(page, {
    mcpConfig: config, cwd, isolation: 'operator-login', callRunMs: 15 * 60 * 1000, cols: o.cols ?? 100, rows: o.rows ?? 90,
    policyExtra: { noConfirm: true, targetKeys: TOOLKIT_TARGET_KEYS, builtins: READ_BUILTINS, builtinRules },
  });
  if (OBSERVE) console.log('[docubot observe] startClaude: launched');
  return { ...run, cwd };
}

/**
 * Decline a call, but do not wait out the client: a declined Claude dialog can take the full call-resolve budget (15 min) to settle,
 * and every caller of this throws right after (or, in observe mode, moves on). The decision is written at once; a bounded wait
 * is enough to let it land.
 */
async function declineQuickly(approval: ClaudeRun['approval'], call: PendingCall): Promise<void> {
  await Promise.race([approval.answer(call, 'decline').catch(() => undefined), new Promise((r) => setTimeout(r, 20_000))]);
}

/**
 * One turn: send the prompt, then approve each declared call as Claude asks, until the turn ends. A write that is not declared is
 * denied by the hook and fails the wait with the policy's reason. When the turn ends before a required call was asked (the
 * model previewed and asked in chat), `nudge` is sent as the student's own reply, up to twice; it decides nothing, the dialog does.
 * Returns the approved calls, in order.
 */
export async function approvedTurn(run: ClaudeRun, prompt: string, allowed: Allowed[], o: { nudge?: string; timeoutMs?: number } = {}): Promise<PendingCall[]> {
  const { approval, policy, session } = run;
  const timeoutMs = o.timeoutMs ?? 10 * 60 * 1000;
  approval.setExpects(allowed.map((a): Expect => buildExpect(policy, { tool: a.tool, args: a.args ?? {}, decision: 'approve', ...(a.anyTarget ? { anyTarget: true as const } : {}) })));
  const need = new Set(allowed.map(keyOf).filter((k): k is string => !!k));
  const got = new Set<string>();
  const approved: PendingCall[] = [];
  if (OBSERVE) console.log('[docubot observe] approvedTurn: sending the prompt');
  await session.send(prompt);
  if (OBSERVE) console.log('[docubot observe] approvedTurn: prompt sent');
  for (let nudges = 0; ;) {
    const call = await approval.pendingAny(timeoutMs);
    if (OBSERVE) {
      const tail = run.real.term.plainScreen().split('\n').filter((r) => r.trim()).slice(-12).join('\n');
      console.log(`[docubot observe] ${call ? `call ${call.tool} ${JSON.stringify(call.args).slice(0, 200)}` : 'no call (turn ended or wait timed out)'}\n${tail}`);
    }
    if (call) {
      // Several entries can share a tool and its target (a block and a read on the same connector): take the first one whose
      // check accepts these arguments, and complain with the first match's reason only when none does.
      const fits = allowed.filter((a) => a.tool === call.tool && matches(a.args ?? {}, call.args));
      const entry = fits.find((a) => !a.check?.(call.args)) ?? fits[0] ?? allowed.find((a) => a.tool === call.tool);
      if (!entry) {
        // Only reachable in observe mode's wider net or a policy gap: a call the step never listed is declined, never approved.
        await declineQuickly(approval, call);
        if (OBSERVE) { console.log(`[docubot observe] declined unlisted ${call.tool} ${JSON.stringify(call.args).slice(0, 300)}`); continue; }
        throw new Error(`${call.tool} is not a call this step allows. Arguments: ${JSON.stringify(call.args).slice(0, 600)}`);
      }
      const complaint = entry.check?.(call.args);
      if (complaint) {
        await declineQuickly(approval, call);
        throw new Error(`${call.tool} was declined: ${complaint}. Arguments: ${JSON.stringify(call.args).slice(0, 600)}`);
      }
      await approval.answer(call, 'approve');   // the row named "Yes", never "always"
      approved.push(call);
      const key = keyOf(entry);
      if (key) got.add(key);
      continue;
    }
    const missing = [...need].filter((k) => !got.has(k));
    if (!missing.length) break;
    if (nudges++ >= 2) throw new Error(`the turn ended without an approved call for: ${missing.join(', ')}`);
    await session.send(o.nudge ?? 'Yes, go ahead.');
  }
  await approval.turnDone(timeoutMs);
  // A denied call is on the screen the picture would show (and the agent's answer is about it): that is a finding, not a picture.
  const denied = approval.events().filter((e) => e.hook_event_name === 'PreToolUse' && e.verdict?.effect === 'deny');
  if (OBSERVE) {
    const dir = path.join(process.env.DOCUBOT_TARGET ?? '.', '.docubot', 'observe');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `observe-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(approval.events().filter((e) => e.hook_event_name === 'PreToolUse')
      .map((e) => ({ tool: e.tool_name, input: e.tool_input, verdict: e.verdict })), null, 1));
    console.log(`[docubot observe] ${approval.events().length} hook events, ${denied.length} denied: ${out}`);
    return approved;
  }
  if (denied.length) throw new Error(`the policy denied ${denied.length} call(s): ${denied.map((e) => `${e.tool_name} ${JSON.stringify(e.tool_input).slice(0, 200)} (${e.verdict.reason})`).join('; ')}`);
  return approved;
}

/**
 * Claude Code's finished-turn status row: "Baked for 57s . done 9:21 AM" (the verb varies, past a minute
 * "Worked for 4m 0s . done"; docubot's own turn-done detection counts the same shape). The picture ends at the
 * last row matching it, so the empty rows and the idle input box below a short answer drop out of the clip.
 * No `g` flag: a global RegExp keeps lastIndex across `test` calls and would skip every other row.
 */
const TURN_DONE_ROW = /for (?:\d+h )?(?:\d+m )?\d+s.*\bdone\b/i;

/**
 * The terminal now, held until the step's effect checks pass: hand it to `capture.agent(id, held)`. The picture starts at the
 * student's prompt (the row that starts with the page's first words), so a second turn in the same session shows only itself,
 * and ends at the turn's done row, so trailing blank rows and the idle input box are not in the clip.
 */
export function snapFrom(run: ClaudeRun, prompt: string) {
  const first = escapeRe(prompt.split('\n')[0].trim().slice(0, 24));
  return run.real.snap({ startAt: new RegExp(`^\\s*[>❯]\\s+${first}`), lastMatch: true, endAt: TURN_DONE_ROW, terms: [path.dirname(AGENT_CWD), AGENT_CWD] });
}

/** The agent's visible text, for a check that something never reached the screen. */
export const plainScreen = (run: ClaudeRun): string => run.real.term.plainScreen();

/**
 * startClaude -> one approvedTurn -> snapFrom -> plainScreen -> kill: the shape
 * most agent steps use, one turn in a throwaway session. `o` passes straight
 * through to startClaude (bash, writeFiles, mcpEnv, keepCwd) beside the turn's
 * nudge/timeout. For a session that must continue across steps, or several
 * turns in one session, drive startClaude/approvedTurn directly.
 */
export async function approvedTurnOnce(
  page: Page,
  prompt: string,
  allowed: Allowed[],
  o: { nudge?: string; timeoutMs?: number } & Parameters<typeof startClaude>[1] = {},
) {
  const run = await startClaude(page, o);
  try {
    await approvedTurn(run, prompt, allowed, { nudge: o.nudge, timeoutMs: o.timeoutMs });
    return { run, held: await snapFrom(run, prompt), plain: run.real.term.plainScreen() };
  } finally {
    run.session.kill();
  }
}
