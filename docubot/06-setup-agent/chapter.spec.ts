// Chapter 6 - set up the agent. A MIXED chapter: one FortiSOAR UI page (the login
// the agent authenticates as) plus the coding-agent TUI pages (the write-approval
// prompt in Claude Code, Codex and OpenCode). Built with chapter(): one test, steps in
// declaration order. SOAR pictures go through the typed session (`soar.shot`); TUI
// pictures go through the capture object (`capture.agent` / `capture.screen`), so a SOAR
// page and a TUI page read the same way and interleave in one spec.
//
// The TUI shots run in a real terminal (the kit's RealTerminal: ttyd + Playwright -- no
// GUI, no macOS permissions, no popped window, CI-capable), and the claude shot goes
// through the governed driver (ClaudeApproval's hook). The agent talks to a stub FortiSOAR
// MCP (AGENT_SHOTS_STUB, default tools/agent-shots/stub_fortisoar_mcp.py), so no box is
// touched by the agent; only the UI shots need the live box.
//
// Spend gates (declared per step; a bare run is read-only and spends nothing):
//   spend 'subscription'  DOCUBOT_SPEND_SUBSCRIPTION=1 or DOCUBOT_SPEND_AI=1: the Claude and Codex
//                         turn steps (the first contact, the map-the-box turn, the approval steps).
//   spend 'frank-eco'     opencode on Frank's eco model: free, logged, runs when reached.
// Independently, the TUI approval and setup shots need DOCUBOT_AGENT_SHOTS=1 (and
// DOCUBOT_PYTHON=<python with the toolkit>): they are pictures of an agent, not a spend.
//
// Verify one spec at a time through Playwright (never `docubot run`, which starts every spec):
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=<kit>/playwright.config.ts \
//     --tsconfig=<kit>/tsconfig.json <repo>/docubot/06-setup-agent/chapter.spec.ts
// The LIVE agent turns need three more facts, each diagnosed the hard way:
//   - a PATH-pinned claude 2.1.321: 2.1.322 stalls big multi-tool turns (thinking_drop prefix_mismatch,
//     then a hung request; reproduced 4/4, small stub turns were unaffected);
//   - ENABLE_TOOL_SEARCH=false: deferring the lab server's 74 tools behind ToolSearch triggers the same stall;
//   - DOCUBOT_CLAUDE_ALLOW="mcp__fortisoar-lab__*": a plain agentTurn has no permission driver, so an MCP tool
//     prompt would just sit until the timeout; the write-approval prompts themselves are captured on page 03
//     through the governed drivers, which answer their own prompts.
//
// Scratch: the alert the Codex write-approval step creates goes on the run's ledger as soon as the box
// shows it. Teardown deletes it and reads back that it is gone; a crashed run's leftover is swept by the next run.
import { chapter, env, expect, promptFor, skipStep, type Capture, type StepCtx } from 'docubot';
import { buildExpect, startOpencodeTui, type Expect } from 'docubot/agents';
import { openPeopleList, fortisoar, fortisoarPolicy, alertsNamed, boxHost, boxIdentity, escapeRe, writeClaudeMcpJson, labSeed, pyfsrEnv, queryRows } from 'docubot/products/fortisoar';
import { AGENT_CWD, SHOWN_LOGIN, agentScreen, agentTurn, codexScreen, codexShell, shellShot, startClaudeApproval, startCodex, startCodexApproval } from '../lib/agentlab';
import { READ_BUILTINS } from '../lib/approve';
import { laptopAgent } from '../lib/fsr-lab';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Shared inputs for every agent shot: the stub MCP server (default: this repo's, so a
// shot run needs no extra env), its interpreter, and the documented prompt the student
// runs (pulled from the page, not a spec-only copy).
const STUB = env.value('AGENT_SHOTS_STUB', path.join(env.value('DOCUBOT_TARGET', process.cwd()), 'tools', 'agent-shots', 'stub_fortisoar_mcp.py'));
const PY = (): string => env.value('DOCUBOT_PYTHON', 'python3');
const agentShotsOn = env.flag('DOCUBOT_AGENT_SHOTS');
const prompt = (): string => promptFor('06-setup-agent', '03-approve-every-write');

/** The alert the Codex write-approval step creates (the page's one change). */
const APPROVAL_NAME = 'Approval test';
/** Codex's own MCP prompt. Used only to prove a read-only turn never asked. */
const CODEX_PROMPT = /Allow the \S+ MCP server to run tool/;
/** The one change the page's prompt makes: an alert in the alerts module. The record's name is checked on the
 *  captured call (not declared), since the model chooses the other fields. */
const APPROVAL_CALL: Omit<Expect, 'decision'> = { tool: 'create_record', args: { module: 'alerts' } };
/** The claude approval's declined state, as the agent words it after the student's "No". */
const DECLINED = /Interrupted|What should Claude do instead|not completed|was not created|declin|not approve/i;

/** A .mcp.json pointing claude at the stub server (strict scoping: it loads nothing else). */
function stubMcpJson(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsa06-stub-')), '.mcp.json');
  fs.writeFileSync(file, JSON.stringify({
    mcpServers: { fortisoar: { command: PY(), args: [STUB], env: { FSR_BASE_URL: 'https://fortisoar.example.com' } } },
  }));
  return file;
}

/** The real paths under the shot's feet (the lab folder), boxed in the PNG like every governed shot. */
const agentTerms = (): string[] => [path.dirname(AGENT_CWD), AGENT_CWD];

/** The full Capture behind ctx.capture (agent / screen / shellShot pictures; soar.shot is the policy path for UI shots). */
const cap = (ctx: StepCtx): Capture => ctx.capture as unknown as Capture;

/** The approval's created alerts, by uuid, for the ledger. */
function alertUuidsNamed(name: string): string[] {
  return queryRows('alerts', [{ field: 'name', operator: 'eq', value: name }], { fields: ['uuid', 'name'] })
    .filter((r) => r.name === name && typeof r.uuid === 'string')
    .map((r) => r.uuid as string);
}

/** Codex's write-approval turn: send the page's prompt, go ahead once if the model answers in prose first. */
type ApprovalRun = Awaited<ReturnType<typeof startCodexApproval>>;
async function askForCall(run: ApprovalRun, prompt: string, expected: Expect) {
  await run.session.send(prompt);
  let call = await run.approval.pendingOrEnd(expected, 4 * 60 * 1000);
  for (let i = 0; i < 2 && !call; i++) {
    await run.session.send('Yes, go ahead.');
    call = await run.approval.pendingOrEnd(expected, 4 * 60 * 1000);
  }
  if (!call) throw new Error('Codex never asked to run create_record');
  // Checked before any picture: this is the call the page describes, for the record the page names.
  expect((call.args.data as { name?: string } | undefined)?.name, 'the call creates the page\'s alert').toBe(APPROVAL_NAME);
  return call;
}

export default chapter('06-setup-agent', {
  devices: ['soar', 'laptop'],
  scratch: ['alerts'],
  policy: {
    ...fortisoarPolicy,
    // The People grid shows the lab login's e-mail address; the page shows it on purpose, so e-mails are a scrub
    // category this chapter skips and the kit's e-mail mask is cleared (the gate still refuses IPs, hosts and secrets).
    scrubSkip: [...(fortisoarPolicy.scrubSkip ?? []), 'email'],
    maskText: [],
  },
  // The agent turns run for minutes; the codex approval step budgets three asks plus the turn's own wait.
  stepTimeoutMs: 20 * 60 * 1000,
  steps: {
    // --- SOAR page: the Users list, where the agent's login is created (System > IAM
    // > People). The list is the ui-router state main.iam.people (URL /iam/people);
    // a hard goto to a bare path bootstraps only the app chrome, so navigate in-app. ---
    'fsa06-01-create-user': async (ctx) => {
      const soar = await ctx.open(fortisoar, 'soar');
      // Navigates in-app (main.iam.people) and waits for a VISIBLE People/Users
      // anchor: a bare text match hits a hidden nav <li> and never becomes visible.
      await openPeopleList(soar.page);
      await soar.shot('fsa06-01-create-user', { expect: /People|Users/i });
    },

    // --- TUI pages: the write-approval prompt in each agent (real screenshots). ---
    // claude captures the write-approval card and, from the SAME session, the declined
    // state after the student's "No" (one governed session, two shots). Codex is
    // captured below, through its own driver. opencode's MCP tools did not surface
    // reliably headlessly, so it gets a SETUP shot (a benign no-tool question), not a
    // write-approval -- its approval shot only waits for the dialog, unanswered.
    'fsa06-05-claude-approval': {
      spend: 'subscription',
      run: async (ctx) => {
        if (!agentShotsOn) return skipStep('fsa06-05-claude-approval', 'set DOCUBOT_AGENT_SHOTS=1 (and DOCUBOT_PYTHON) to capture the agent TUI pages');
        // The governed claude path: ClaudeApproval's hook holds the ask on screen
        // (quietDialog: false -- the dialog is visible and the answer is the student's own
        // keys), the step photographs it, answers "No" by keys and photographs the declined
        // state. The stub MCP server means the call never touches a box; the expect makes
        // THIS the one call the turn may ask about.
        const page = (await ctx.open(fortisoar, 'soar')).page;
        const run = await startClaudeApproval(page, {
          mcpConfig: stubMcpJson(), cwd: AGENT_CWD, quietDialog: false, cols: 100, rows: 90,
          policyExtra: { noConfirm: true, builtins: READ_BUILTINS },
        });
        try {
          const expected = buildExpect(run.policy, { ...APPROVAL_CALL, decision: 'decline' });
          run.approval.setExpect(expected);
          await run.session.send(prompt());
          const call = await run.approval.pendingOrNudge(run.session, expected, { timeoutMs: 4 * 60 * 1000 });
          // The dialog as the student sees it (checked to be THIS call's), held until the step's checks pass.
          const dialog = await run.approval.snapDialog(call, run.real, {
            terms: agentTerms(), startAt: new RegExp(`^\\s*[>❯]\\s+${escapeRe(prompt().split('\n')[0].trim().slice(0, 24))}`),
          });
          await cap(ctx).agent('fsa06-05-claude-approval', dialog);
          await run.approval.answer(call, 'decline');   // the "No" row, by keys -- the student's decline
          await run.approval.turnDone(4 * 60 * 1000);
          await run.approval.settled(DECLINED);
          await cap(ctx).agent('fsa06-09-claude-declined', run.real, { terms: agentTerms() });
        } finally {
          run.session.kill();
        }
      },
    },

    // OpenCode's write-approval prompt, one try: its MCP tools did not reliably surface
    // headless before, so a miss here is reported, not worked around. The TUI runs on a
    // private server with the shot's own config (the kit's startOpencodeTui); nothing
    // answers the ask, the shot is OF the pending dialog.
    'fsa06-07-opencode-approval': {
      spend: 'frank-eco',
      run: async (ctx) => {
        if (!agentShotsOn) return skipStep('fsa06-07-opencode-approval', 'set DOCUBOT_AGENT_SHOTS=1 (and DOCUBOT_PYTHON) to capture the agent TUI pages');
        // Same pinned model as fsa06-08: the user's default tier thinks longer and varies.
        // The ask rule is explicit: a global V1 `permission` block normalizes unspecified
        // tools to allow, so an unqualified ask never fires -- and a blanket ask would ask
        // for the READS too (whoami first, observed), which contradicts the page's "reads
        // never ask". Allow every fortisoar tool, then ask for the write (last match wins).
        // This build's dialog reads "Permission required" (older ones said "is requesting
        // input"), so the wait accepts both wordings.
        const page = (await ctx.open(fortisoar, 'soar')).page;
        const shot = await startOpencodeTui(page, {
          id: 'fsa06-07-opencode-approval', stub: STUB, model: 'frank/coding-b200/eco', timeoutMs: 180_000,
          prompt: prompt(),
          waitFor: /permission required|is requesting input/i,
          permissions: [
            { action: 'fortisoar_*', resource: '*', effect: 'allow' },
            { action: 'fortisoar_create_record', resource: '*', effect: 'ask' },
          ],
        });
        try {
          // The turn keeps running behind the dialog (the call row spins, thought counters
          // tick): judge stability with digits and spinner glyphs ignored, like every other
          // mid-turn dialog picture.
          await cap(ctx).agent('fsa06-07-opencode-approval', shot.real, { ticking: true });
        } finally {
          shot.kill();
        }
      },
    },

    'fsa06-08-opencode-setup': {
      spend: 'frank-eco',
      run: async (ctx) => {
        if (!agentShotsOn) return skipStep('fsa06-08-opencode-setup', 'set DOCUBOT_AGENT_SHOTS=1 (and DOCUBOT_PYTHON) to capture the agent TUI pages');
        // Same pinned model as the opencode approval step above.
        const page = (await ctx.open(fortisoar, 'soar')).page;
        const shot = await startOpencodeTui(page, {
          id: 'fsa06-08-opencode-setup', stub: STUB, model: 'frank/coding-b200/eco', rows: 40,
          prompt: 'In one short paragraph, who are you and what can you help me do with this FortiSOAR box?',
          waitFor: /tok\/s/i,
        });
        try {
          // The tok/s counter is the turn's own live figure; it is left out of the stability key.
          await cap(ctx).agent('fsa06-08-opencode-setup', shot.real, { volatile: /tok\/s/i });
        } finally {
          shot.kill();
        }
      },
    },

    // Page 04: the first real question, against the live box (not the stub). Read-only,
    // but it spends model credits, so it rides the subscription spend.
    'fsa06-11-map-the-box': {
      spend: 'subscription',
      run: async (ctx) => {
        const agent = await laptopAgent(ctx.local);
        const screen = await agentTurn(agent, promptFor('06-setup-agent', '04-map-the-box'), { timeoutMs: 5 * 60 * 1000 });
        // Check BEFORE capturing, so a failed run never lands a PNG in content/.
        expect(screen).toMatch(/8\.\d+\.\d+/);
        expect(screen).toMatch(/MCP/);
        // Read-only: the agent must not have asked to change anything.
        expect(screen).not.toMatch(/Do you want to proceed|approve this/i);
        await cap(ctx).screen('fsa06-11-map-the-box', screen, agentScreen());
      },
    },

    // Page 02 s5: first contact in Claude Code, the same prompt the Codex step uses.
    'fsa06-04-whoami-claude': {
      spend: 'subscription',
      run: async (ctx) => {
        const who = boxIdentity();
        const agent = await laptopAgent(ctx.local);
        const screen = await agentTurn(agent, promptFor('06-setup-agent', '02-wire-the-agent'), { timeoutMs: 5 * 60 * 1000 });
        const plain = agent.plainScreen();   // the session strips ANSI itself
        // Effect: the agent really answered from whoami -- the box's own login and
        // version appear only in its output. (Not a /whoami/ word match: the prompt
        // must not name the tool, so the word may not appear on screen at all.)
        expect(plain).toContain(who.loginid);
        expect(plain).toMatch(/8\.\d+\.\d+/);
        expect(plain).not.toMatch(/Do you want to proceed|approve this/i);
        await cap(ctx).screen('fsa06-04-whoami-claude', screen, agentScreen());
      },
    },

    // Page 02 s3: the MCP check. Start the agent against the box (no prompt, so no
    // model turn), type /mcp, and capture the server list with fortisoar connected.
    'fsa06-03-agent-init': async (ctx) => {
      const agent = await laptopAgent(ctx.local);
      agent.type('/mcp');
      agent.enter();
      await agent.waitFor(/fortisoar/i, { timeoutMs: 120_000 });
      await agent.waitIdle({ quietMs: 2_500, timeoutMs: 60_000 });
      // The account's own usage banner ("You've used N% of your weekly limit, resets ...")
      // is the capturing account's, not the lab's: the kit's FOOTER_NOISE strips it.
      await cap(ctx).screen('fsa06-03-agent-init', agent.screen(), agentScreen());
    },

    // Page 02 s2 and s3, Claude Code tab: the toolkit's init output and the MCP check
    // in a shell. Both are plain commands in a pty, so no model turn and no tokens.
    // The init command reads the password from FSR_PASSWORD (never argv), and the
    // shot masks it to the page's placeholder. The mcp list runs in a throwaway folder
    // with an isolated CLAUDE_CONFIG_DIR, so a user-level fortisoar server cannot
    // shadow the project file the page tells the student to save.
    'fsa06-02-init-output': async (ctx) => {
      const login = pyfsrEnv().FSR_USERNAME ?? '';
      await shellShot(cap(ctx), 'fsa06-02-init-output', {
        command: `fsr-agentic-toolkit init --url ${boxHost()} --username '${login}' --no-verify-ssl`,
        secrets: [['FSR_PASSWORD', '<your-password>']],
        // The connected line, then the Claude Code snippet up to its closing brace.
        from: /^connected: /,
        to: /^\}\s*$/,
        // Checked on the masked output: the login connected and the password is the placeholder.
        expect: [/^connected: agentlab </m, /"FSR_PASSWORD": "<your-password>"/],
      });
    },

    'fsa06-03-claude-mcp-list': async (ctx) => {
      const folder = env.value('FSA_MCP_FOLDER', path.join(os.tmpdir(), 'fsa-workshop', 'mcp-folder'));
      const isolated = path.join(folder, 'claude-config');
      // A clean folder each run: the saved .mcp.json and an empty Claude config dir.
      fs.rmSync(folder, { recursive: true, force: true });
      fs.mkdirSync(isolated, { recursive: true });
      writeClaudeMcpJson(folder);
      await shellShot(cap(ctx), 'fsa06-03-claude-mcp-list', {
        command: 'claude mcp list',
        cwd: folder,
        env: { CLAUDE_CONFIG_DIR: isolated },
        timeoutMs: 3 * 60 * 1000,
        // The line the page says a good file shows.
        expect: [/fortisoar[^\n]*Pending approval/],
      });
    },

    // Page 01a: each agent's version check, the "it installed" proof the page asks
    // for. Local commands only; nothing touches the box and no tokens are spent.
    'fsa06-01a-claude-version': async (ctx) => {
      await shellShot(cap(ctx), 'fsa06-01a-claude-version', { command: 'claude --version', cols: 100, timeoutMs: 60_000, expect: [/\d+\.\d+\.\d+.*Claude Code/i] });
    },
    'fsa06-01a-codex-version': async (ctx) => {
      await shellShot(cap(ctx), 'fsa06-01a-codex-version', { command: 'codex --version', cols: 100, timeoutMs: 60_000, expect: [/codex-cli \d+\.\d+/i] });
    },
    'fsa06-01a-opencode-version': async (ctx) => {
      await shellShot(cap(ctx), 'fsa06-01a-opencode-version', { command: 'opencode --version', cols: 100, timeoutMs: 60_000, expect: [/opencode v?\d+\.\d+\.\d+/i] });
    },

    // Page 01 s1-2, the user form's roles: the workshop login's existing record, opened
    // and read only. Nothing is saved; the form is closed. If the login does not exist the
    // step is skipped rather than creating it (page 01 creates it by hand).
    'fsa06-01b-user-roles': async (ctx) => {
      const soar = await ctx.open(fortisoar, 'soar');
      await openPeopleList(soar.page);
      // The page's login is "agentlab" (the masked name the shots show). The box's own login
      // is not the workshop user, so only the page's name is looked for.
      // The list shows names and emails, not login ids: match the login itself or an
      // email that starts with it (agentlab_user@...).
      const row = soar.page.getByText(new RegExp(`^${SHOWN_LOGIN}(\\b|_)`, 'i')).filter({ visible: true }).first();
      if (!(await row.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false))) {
        // Not created here: a missing login is reported, so the capture is skipped, not faked.
        skipStep('fsa06-01b-user-roles', `no ${SHOWN_LOGIN} login on this box: page 01 creates it by hand`);
        return;
      }
      await row.click();
      // Checked before the capture: the roles the page says the login holds.
      for (const role of ['Full App Permissions', 'Application Administrator', 'Security Administrator', 'Playbook Administrator']) {
        await expect(soar.page.getByText(role, { exact: true }).filter({ visible: true }).first(), `role ${role} is assigned`).toBeVisible({ timeout: 30_000 });
      }
      await soar.shot('fsa06-01b-user-roles', { expect: /Full App Permissions/ });
    },

    // Page 02 Codex tab, step 4: Codex's /mcp screen with the fortisoar server connected.
    // Starting Codex and typing /mcp is not a model turn, so no tokens are spent.
    'fsa06-12b-codex-mcp-connected': async (ctx) => {
      const session = await startCodex('codex-mcp');
      try {
        // The slash helper types the command and presses Enter until the input box lets it go.
        await session.slash('/mcp', { timeoutMs: 30_000 });
        await session.waitFor(/fortisoar: connected/, { timeoutMs: 120_000 });
        await session.waitScreen(/fortisoar: connected/, { settleMs: 1500, timeoutMs: 30_000 });
        // Checked before the capture: the server reads connected, with its tools.
        expect(session.plainScreen()).toMatch(/fortisoar: connected \(\d+ tools?\)/);
        await cap(ctx).screen('fsa06-12b-codex-mcp-connected', session.screen(), codexScreen());
      } finally {
        session.kill();
      }
    },

    // --- Codex (page 02 Codex tab, page 03 Codex tab) -------------------------------
    // Driven through docubot's Codex driver on the student's own config.toml (an
    // isolated CODEX_HOME, see lib/agentlab.ts startCodex). The toolkit adds no approval
    // form of its own (0.3.0): the client's prompt is the only gate. The approval steps use
    // docubot's CodexApproval, which classifies the server's tools from its tools/list, lets a
    // step declare the one call it expects (tool and target), applies the decision itself, and
    // takes the picture from Codex's own MCP approval prompt.
    'fsa06-12-codex-mcp-list': async (ctx) => {
      // Page 02 Codex tab, step 2: a SHELL check, not inside codex (no model turn, no tokens).
      // Wide enough that the table does not wrap its row.
      const sh = await codexShell('codex-mcp-list', { cols: 170, rows: 30 });
      try {
        await sh.waitFor(/student@laptop:~\/agent-lab\$ /, { timeoutMs: 30_000 });
        // Clear the shell's login notice so the shot starts at the command.
        sh.send('clear');
        await sh.waitFor(/^student@laptop:~\/agent-lab\$ \s*$/m, { timeoutMs: 15_000 });
        sh.type('codex mcp list');
        await sh.waitFor(/codex mcp list/, { timeoutMs: 15_000 });
        sh.enter();
        await sh.waitFor(/fortisoar/, { timeoutMs: 60_000 });
        await sh.waitIdle({ quietMs: 2_000, timeoutMs: 60_000 });
        // Effect: the fortisoar row reads enabled (the Status column).
        expect(sh.plainScreen()).toMatch(/fortisoar[\s\S]{0,400}?\benabled\b/);
        await cap(ctx).screen('fsa06-12-codex-mcp-list', sh.screen(), codexScreen());
      } finally {
        sh.kill();
      }
    },

    'fsa06-13-codex-whoami': {
      spend: 'subscription',
      run: async (ctx) => {
        const who = boxIdentity();
        const session = await startCodex('codex-whoami');
        try {
          const screen = await session.turn(promptFor('06-setup-agent', '02-wire-the-agent'), { timeoutMs: 10 * 60 * 1000 });
          const plain = session.plainScreen();
          // Effect: the answer names the login the box reports and the box version.
          expect(plain).toContain(who.loginid);
          expect(plain).toMatch(/8\.\d+\.\d+/);
          // Read-only: nothing was asked to be approved.
          expect(plain).not.toMatch(CODEX_PROMPT);
          await cap(ctx).screen('fsa06-13-codex-whoami', screen, codexScreen());
        } finally {
          session.kill();
        }
      },
    },

    'fsa06-06-codex-approval': {
      spend: 'subscription',
      run: async (ctx) => {
        const prompt = promptFor('06-setup-agent', '03-approve-every-write');
        // The page's prompt, sent as the student types it. The model may answer in prose before calling; a go-ahead is sent then.
        // Codex runs in a real terminal (ttyd + Playwright); the picture is the browser's own screenshot, with only secrets and
        // machine paths boxed over. Approvals are still decided and answered by CodexApproval's hooks and adapter.
        labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);   // a stale copy from an earlier run would fail the count below
        const page = (await ctx.open(fortisoar, 'soar')).page;
        const run = await startCodexApproval(page);
        try {
          const expected = buildExpect(run.policy, { ...APPROVAL_CALL, decision: 'approve' });
          run.approval.setExpect(expected);
          const call = await askForCall(run, prompt, expected);
          // Shot: Codex's own MCP approval prompt for this call (server, tool, arguments), checked to be this call's dialog.
          await run.approval.capture(call);   // checks the screen is this call's dialog before anything is photographed
          const dialog = await run.real.snap();   // the dialog as it is now, held until the effect check passes
          await run.approval.answer(call, 'approve');   // "1. Allow", the highlighted row; never "always"
          await run.approval.turnDone(4 * 60 * 1000);
          // Effect: the approved write landed.
          expect(alertsNamed(APPROVAL_NAME).length).toBe(1);
          await cap(ctx).agent('fsa06-06-codex-approval', dialog);
        } finally {
          // On the ledger as soon as the box shows it, even when the turn or its capture failed.
          for (const uuid of alertUuidsNamed(APPROVAL_NAME)) ctx.scratch.track({ kind: 'alerts', id: uuid, label: APPROVAL_NAME });
          run.session.kill();
        }
      },
    },

    'fsa06-10-codex-declined': {
      spend: 'subscription',
      run: async (ctx) => {
        const prompt = promptFor('06-setup-agent', '03-approve-every-write');
        labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);   // a stale copy from an earlier run would fail the count below
        const page = (await ctx.open(fortisoar, 'soar')).page;
        const run = await startCodexApproval(page);
        try {
          const expected = buildExpect(run.policy, { ...APPROVAL_CALL, decision: 'decline' });
          run.approval.setExpect(expected);
          const call = await askForCall(run, prompt, expected);
          await run.approval.answer(call, 'decline');   // "4. Cancel" by Esc
          await run.approval.turnDone(4 * 60 * 1000);
          // Effect: the declined write created nothing, and the agent says so.
          expect(alertsNamed(APPROVAL_NAME).length).toBe(0);
          await run.approval.settled(/not created|wasn.t created|cancel|declin/i);
          await cap(ctx).agent('fsa06-10-codex-declined', run.real);
        } finally {
          // A declined write that landed anyway is still on the ledger, so teardown removes it.
          for (const uuid of alertUuidsNamed(APPROVAL_NAME)) ctx.scratch.track({ kind: 'alerts', id: uuid, label: APPROVAL_NAME });
          run.session.kill();
        }
      },
    },
  },
});
