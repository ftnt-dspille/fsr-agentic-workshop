// Chapter 6, FortiAgent tabs (pages 01a, 02, 03): the desktop app driven over CDP with docubot's FortiagentApp.
//
// The app is launched by FortiagentApp.open({ launch: true }) with --remote-debugging-port, and quit normally at the end.
// One FortiAgent run per machine: phase 1 (read-only: settings, add the server, whoami) holds ~/.docubot/fortiagent-rule.lock
// through withFortiagentLock; phase 2 (the write) runs under withFortiagentApp, which also forces the FortiSOAR Change rule to
// Ask and FortiAI Auto mode off, reads both back and restores them. Both wait for a held lock and never break it.
//
// The MCP server is the toolkit the other tabs use: the command and env come from the same `init --claude-code` snippet
// (writeClaudeMcpJson), so FortiAgent signs in as the workshop login. The approval turn is DECLINED (the "Approval test" alert
// is the scratch target, deleted before and after); "Always" and "Allow for this thread" are never pressed.
//
// Spends FortiAI turns: rides SPEND_AI=1 like the other agent turns.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { expect, test, shouldRunStep, promptFor } from 'docubot';
import { withFortiagentLock, waitForFortiagentLock } from 'docubot/agents';
import { alertsNamed, boxHost, boxIdentity, labSeed, toolkitVenvMasks, writeClaudeMcpJson } from 'docubot/products/fortisoar';
import { FortiagentApp, withFortiagentApp } from 'docubot/agents';

const FA = process.env.FORTIAGENT_BIN || '/Applications/FortiAgent.app/Contents/Resources/bin/fortiagent';
const NAME = 'FortiSOAR';
const SERVER_ID = 'fortisoar';
// Marks a server THIS spec added, so a rerun removes only its own and never the operator's.
const OURS = path.join(os.homedir(), '.docubot', 'fsa06-fortiagent-server.json');
const WHOAMI = 'Who am I logged in as on FortiSOAR, and what version is the box?';
const APPROVAL_NAME = 'Approval test';
const IDS = ['fsa06-14-fortiagent-ready', 'fsa06-15-fortiagent-add-mcp-form', 'fsa06-16-fortiagent-mcp-list', 'fsa06-17-fortiagent-whoami', 'fsa06-18-fortiagent-approval', 'fsa06-19-fortiagent-declined'];
const log = (m: string) => console.log(`[fsa06-fortiagent ${new Date().toISOString().slice(11, 19)}] ${m}`);

function fa(args: string[]): string {
  const r = spawnSync(FA, args, { encoding: 'utf8', input: '', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`fortiagent ${args[0]} ${args[1] ?? ''}: ${r.stderr || r.stdout}`);
  return r.stdout;
}
const servers = (): { id: string; label: string }[] => (JSON.parse(fa(['mcp', 'list', '--json'])) as { id: string; label: string }[]).filter((s) => s.label === NAME);

/** The toolkit command and env the other tabs use, from the init snippet. */
function toolkitServer(): { command: string; env: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.homedir(), '.docubot-fsa06-'));
  try {
    const j = JSON.parse(fs.readFileSync(writeClaudeMcpJson(dir), 'utf8')) as { mcpServers: { fortisoar: { command: string; env: Record<string, string> } } };
    return j.mcpServers.fortisoar;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Remove the FortiSOAR server only when an earlier run of this spec added it; refuse to touch the operator's own. */
function clearOurServer(): void {
  const mine: string[] = fs.existsSync(OURS) ? JSON.parse(fs.readFileSync(OURS, 'utf8')).ids ?? [] : [];
  for (const s of servers()) {
    if (!mine.includes(s.id)) throw new Error(`FortiAgent already has a "${NAME}" server (${s.id}) this spec did not add; not removing it`);
    log(`removing the "${NAME}" server an earlier run added (${s.id})`);
    fa(['mcp', 'remove', s.id, '--yes']);
  }
  fs.rmSync(OURS, { force: true });
}

test.describe.configure({ mode: 'serial' });

test('chapter 6 - fortiagent', async ({ capture }) => {
  test.skip(process.env.SPEND_AI !== '1', 'FortiAgent turns: set SPEND_AI=1');
  test.skip(!IDS.some((id) => shouldRunStep(id)), 'no FortiAgent step selected');
  test.setTimeout(40 * 60_000);
  const host = boxHost();
  const who = boxIdentity();
  // The host label is masked too: the model's prose may shorten the host to its
  // first dot-label (seen in a live whoami answer). Same guard as the kit's mask
  // builders -- a short generic label ("soar") must never become a mask, or the
  // product name disappears from every capture.
  const hostLabel = host.split('.')[0];
  const labelMask = hostLabel !== host && (hostLabel.includes('-') ? hostLabel.length >= 6 : hostLabel.length >= 8)
    ? { [hostLabel]: 'fortisoar.example.com' } : {};
  // The venv pair goes FIRST: the venv dir sits under the home dir, and rewriteText
  // applies pairs in insertion order -- the home rewrite would destroy the venv match.
  // The mcp-list row then reads /your/venv/bin/fsr-agentic-toolkit, the placeholder the
  // page's own snippet teaches.
  const showAs = { ...Object.fromEntries(toolkitVenvMasks()), [os.homedir()]: '/Users/student',
    [host]: 'fortisoar.example.com', ...labelMask, [who.loginid]: 'agentlab', [who.name]: 'Agent Lab' };
  const shot = (app: FortiagentApp, id: string, o: Record<string, unknown> = {}) =>
    capture.shot(app.page, id, { showAs, scrubSkip: ['date-or-time'], ...o });

  // Phase 1: read-only. Lock held, rules untouched.
  await waitForFortiagentLock(() => withFortiagentLock(async () => {
    const app = await FortiagentApp.open({ launch: true, dismissUpdateNotice: true, log });
    try {
      if (shouldRunStep('fsa06-14-fortiagent-ready')) await test.step('fsa06-14-fortiagent-ready', async () => {
        await app.settings('FortiAI');
        const ready = app.page.getByText(/^ready$/i).first();
        await expect(ready, 'the FortiAI card reads ready').toBeVisible({ timeout: 60_000 });
        await shot(app, 'fsa06-14-fortiagent-ready', { highlight: [ready] });
        await app.closeSettings();
      });

      if (shouldRunStep('fsa06-15-fortiagent-add-mcp-form')) await test.step('fsa06-15-fortiagent-add-mcp-form', async () => {
        clearOurServer();
        const tk = toolkitServer();
        const w = app.page;
        await app.settings('MCP servers');
        await w.getByRole('button', { name: 'Add an MCP server' }).click();
        await w.getByRole('button', { name: 'Local command' }).click();
        await w.getByPlaceholder('e.g. Jira').fill(NAME);
        // The student's path in the picture (an input value is out of showAs's reach); the real one is added below.
        await w.getByPlaceholder('/path/to/server or npx').fill(tk.command.replace(os.homedir(), '/Users/student'));
        // The form's Arguments box (one per line). Its label was not read from a live window yet: verify on the first run.
        await w.getByLabel(/Arguments/i).fill('mcp');
        await shot(app, 'fsa06-15-fortiagent-add-mcp-form', { highlight: [w.getByRole('button', { name: 'Add server' })], ocrAllow: ['/Users/student'] });
        // The picture shows the form; the add itself goes through the CLI (same values, stored as secrets), so no
        // password is ever typed into the window that is being photographed.
        await w.keyboard.press('Escape');
        await app.closeSettings();
        const envArgs = Object.entries(tk.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
        fa(['mcp', 'add', NAME, ...envArgs, '--', tk.command, 'mcp']);
        const ids = servers().map((s) => s.id);
        fs.mkdirSync(path.dirname(OURS), { recursive: true });
        fs.writeFileSync(OURS, JSON.stringify({ ids }));
        expect(ids, 'the server id the Change rule names').toEqual([SERVER_ID]);
      });

      // Whoami before the list: FortiAgent shows a status only once a chat has started the server.
      if (shouldRunStep('fsa06-17-fortiagent-whoami')) await test.step('fsa06-17-fortiagent-whoami', async () => {
        await app.newChat();
        // Read-only: any card that shows is declined (the default), and a card at all fails the step.
        const state = await app.turn(WHOAMI, { decision: 'decline', timeoutMs: 6 * 60_000 });
        expect(state).toBe('idle');
        const text = await app.windowText();
        // Effect, not the tool's name: FortiAgent's transcript shows "Ran 1
        // Fortisoar call" and never the tool name, so a /whoami/ word match can
        // never pass. The page promises the login id and the version, which only
        // the whoami call returns.
        expect(text, 'the answer names the box login').toContain(who.loginid);
        expect(text, 'a read never asks').not.toMatch(/Allow FortiAgent to run/i);
        expect(await app.lastReply(), 'the answer names the box version').toMatch(/8\.\d+\.\d+/);
        await shot(app, 'fsa06-17-fortiagent-whoami');
      });

      if (shouldRunStep('fsa06-16-fortiagent-mcp-list')) await test.step('fsa06-16-fortiagent-mcp-list', async () => {
        expect(fa(['mcp', 'list']), 'the engine reads the server connected').toMatch(/FortiSOAR[^\n]*connected/i);
        await app.settings('MCP servers');
        // Our row is the one running the toolkit binary (the operator's own rows
        // carry their endpoints and home paths -- barred: a public capture shows
        // the app's shape, not this machine's servers).
        const rows = app.page.getByRole('listitem').filter({ has: app.page.getByRole('button', { name: 'Remove MCP server' }) });
        const row = rows.filter({ hasText: 'fsr-agentic-toolkit' }).first();
        await row.waitFor({ timeout: 120_000 });
        const others = await rows.filter({ hasText: /\/Users\/|https?:\/\// }).filter({ hasNotText: 'fsr-agentic-toolkit' }).all();
        await shot(app, 'fsa06-16-fortiagent-mcp-list', { highlight: [row], mask: others });
        await app.closeSettings();
      });
    } finally {
      await app.cleanup();
      await app.close();
    }
  }, { log }), { log });

  // Phase 2: the write, declined. The rule is Ask and Auto mode off for the turn, both restored after.
  if (!shouldRunStep('fsa06-18-fortiagent-approval') && !shouldRunStep('fsa06-19-fortiagent-declined')) return;
  labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);
  try {
    await waitForFortiagentLock(() => withFortiagentApp(SERVER_ID, 'prompt', async (app, proof) => {
      try {
        await app.newChat();
        await proof.assertManual();
        await test.step('fsa06-18-fortiagent-approval', async () => {
          const state = await app.turn(promptFor('06-setup-agent', '03-approve-every-write'), { timeoutMs: 6 * 60_000 });
          expect(state, 'the write stopped at an approval card').toBe('sheet');
          const sheet = (await app.approvalSheet())!;
          expect(sheet.tool, 'FortiAgent picked create_record').toMatch(/create_record/);
          expect(sheet.command).toContain(APPROVAL_NAME);
          expect(sheet.options.map((o) => o.label).join('|')).toMatch(/Always/);   // shown, never pressed
          await shot(app, 'fsa06-18-fortiagent-approval');
        });
        await test.step('fsa06-19-fortiagent-declined', async () => {
          await app.decide('decline', { server: SERVER_ID, tool: 'create_record', args: { module: 'alerts' } });
          // The model's reply after the decline; any further card is declined too.
          for (let s = await app.waitTurn(4 * 60_000); s !== 'idle'; s = await app.waitTurn(4 * 60_000)) {
            if (s === 'sheet') await app.decide('decline'); else await app.declineQuestion();
          }
          expect(alertsNamed(APPROVAL_NAME).length, 'the declined write created nothing').toBe(0);
          expect(await app.lastReply()).toMatch(/not (been )?created|declin|wasn.t created|did not create/i);
          await shot(app, 'fsa06-19-fortiagent-declined');
        });
      } finally {
        await app.cleanup();
      }
    }, { launch: true, dismissUpdateNotice: true, log, rule: { log } }), { log });
  } finally {
    labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);
    await FortiagentApp.quitApp();   // the normal Quit; never a kill
  }
});
