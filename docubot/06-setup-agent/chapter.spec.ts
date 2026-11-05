// Chapter 6 - set up the agent. A MIXED chapter: one FortiSOAR UI page (the login
// the agent authenticates as) plus the coding-agent TUI pages (the write-approval
// prompt in Claude Code, Codex and OpenCode). Both kinds of shot go through the one
// `capture` fixture -- `capture.shot(soar, ...)` for a browser page, and
// `capture.agentShot(id, run)` for a real Terminal screenshot of the agent -- so a
// SOAR page and a TUI page read the same way and interleave in one spec.
//
// The TUI shots are headless: capture.agentShot streams the real agent (claude, codex)
// in a node-pty into an xterm.js in headless Chromium and screenshots that -- no GUI, no
// macOS permissions, no popped window, CI-capable. The agent talks to a stub FortiSOAR
// MCP (AGENT_SHOTS_STUB), so no box is touched by the agent; only the one UI shot needs
// the live box. These shots spend tokens, so they are gated behind DOCUBOT_AGENT_SHOTS=1.
//
// Verify on a box with `docubot run --chapter 06-setup-agent`, and the agent shots with
// DOCUBOT_AGENT_SHOTS=1 AGENT_SHOTS_STUB=... FSR_PYTHON=<python with the toolkit>.
import { expect, goToState, skipStep, test, type AgentShotRun } from 'docubot';
import { SHOWN_LOGIN, agentScreen, agentTurn, codexScreen, codexShell, shellShot, startAgent, startCodex } from '../lib/agentlab';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { alertsNamed, boxHost, boxIdentity, writeClaudeMcpJson, labSeed, pyfsrEnv } from 'docubot';
import { shouldRunStep } from 'docubot';
import { promptFor } from 'docubot';

test.describe.configure({ mode: 'serial' });

// Shared inputs for every agent shot: the stub MCP server, its interpreter, and
// the documented prompt the student runs (pulled from the page, not a spec-only copy).
const STUB = process.env.AGENT_SHOTS_STUB || '';
const agentShotsOn = process.env.DOCUBOT_AGENT_SHOTS === '1';
const prompt = (): string => promptFor('06-setup-agent', '03-approve-every-write');

/** One agent's write-approval run, minus the id. waitFor is that agent's approval wording. */
function approvalRun(tool: AgentShotRun['tool'], waitFor: RegExp): AgentShotRun {
  return { tool, prompt: prompt(), waitFor, stub: STUB };
}

test('chapter 6 - set up the agent', async ({ gui, capture }) => {
  test.setTimeout(15 * 60 * 1000);

  // --- SOAR page: the Users list, where the agent's login is created (System > IAM
  // > People). The list is the ui-router state main.iam.people (URL /iam/people);
  // a hard goto to a bare path bootstraps only the app chrome, so navigate in-app. ---
  if (shouldRunStep('fsa06-01-create-user')) await test.step('fsa06-01-create-user', async () => {
    const soar = await gui('soar');
    await goToState(soar, 'main.iam.people');
    // Anchor on a VISIBLE People/Users element: a bare text match hits a hidden
    // nav <li> and never becomes visible.
    await expect(soar.getByText(/People|Users/i).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    // The People grid lists user email addresses; these are not lab secrets, so
    // leave them visible (the scan skips email/date). The backstop still refuses a
    // real lab IP, hostname, key or sensitive term.
    await capture.shot(soar, 'fsa06-01-create-user', { scrubSkip: ['email', 'date-or-time'] });
  });

  // --- TUI pages: the write-approval prompt in each agent (real screenshots). ---
  // Same `capture` object, same chapter dir -- just capture.agentShot instead of .shot.
  if (!agentShotsOn) {
    console.log('[ch06] agent TUI shots skipped: set DOCUBOT_AGENT_SHOTS=1 (and AGENT_SHOTS_STUB, FSR_PYTHON) to capture them');
    return;
  }

  // claude captures the write-approval card and, from the SAME session, the declined
  // state after Esc (declineWaitFor/declineId). Codex is captured below, through its
  // own driver. opencode's MCP tools did not surface reliably headlessly, so it gets
  // a SETUP shot (a benign no-tool question), not a write-approval.
  const DECLINED = /Interrupted|What should Claude do instead|not completed|was not created|declin|not approve/i;

  if (shouldRunStep('fsa06-05-claude-approval')) await test.step('fsa06-05-claude-approval', async () => {
    await capture.agentShot('fsa06-05-claude-approval', {
      ...approvalRun('claude', /requests your input|Do you want to proceed/i),
      declineWaitFor: DECLINED, declineId: 'fsa06-09-claude-declined',
    });
  });

  // OpenCode's write-approval prompt, one try: its MCP tools did not reliably surface
  // headless before, so a miss here is reported, not worked around.
  if (shouldRunStep('fsa06-07-opencode-approval')) await test.step('fsa06-07-opencode-approval', async () => {
    // Same pinned model as fsa06-08: the user's default tier thinks longer and varies.
    await capture.agentShot('fsa06-07-opencode-approval', {
      ...approvalRun('opencode', /is requesting input/i), model: 'frank/coding-b200/eco', timeoutMs: 180_000,
    });
  });

  if (shouldRunStep('fsa06-08-opencode-setup')) await test.step('fsa06-08-opencode-setup', async () => {
    await capture.agentShot('fsa06-08-opencode-setup', {
      tool: 'opencode', stub: STUB, model: 'frank/coding-b200/eco', rows: 40,
      prompt: 'In one short paragraph, who are you and what can you help me do with this FortiSOAR box?',
      waitFor: /tok\/s/i,
    });
  });
});

// Page 04: the first real question, against the live box (not the stub). Read-only,
// but it spends model credits, so it rides SPEND_AI.
test('chapter 6 - map the box', async ({ local, capture }) => {
  test.setTimeout(15 * 60 * 1000);
  test.skip(process.env.SPEND_AI !== '1', 'agent turn: set SPEND_AI=1');
  if (shouldRunStep('fsa06-11-map-the-box')) await test.step('fsa06-11-map-the-box', async () => {
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    const screen = await agentTurn(agent, promptFor('06-setup-agent', '04-map-the-box'), { timeoutMs: 5 * 60 * 1000 });
    // Check BEFORE capturing, so a failed run never lands a PNG in content/.
    expect(screen).toMatch(/8\.\d+\.\d+/);
    expect(screen).toMatch(/MCP/);
    // Read-only: the agent must not have asked to change anything.
    expect(screen).not.toMatch(/Do you want to proceed|approve this/i);
    await capture.screen('fsa06-11-map-the-box', screen, agentScreen());
  });
});

// Page 02 s5: first contact in Claude Code, the same prompt the Codex step uses.
test('chapter 6 - claude whoami', async ({ local, capture }) => {
  test.setTimeout(8 * 60 * 1000);
  test.skip(process.env.SPEND_AI !== '1', 'agent turn: set SPEND_AI=1');
  if (shouldRunStep('fsa06-04-whoami-claude')) await test.step('fsa06-04-whoami-claude', async () => {
    const who = boxIdentity();
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    const screen = await agentTurn(agent, promptFor('06-setup-agent', '02-wire-the-agent'), { timeoutMs: 5 * 60 * 1000 });
    const plain = screen.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ' ');
    // Effect: the agent really called whoami and names the box's own login and version.
    expect(plain).toMatch(/whoami/i);
    expect(plain).toContain(who.loginid);
    expect(plain).toMatch(/8\.\d+\.\d+/);
    expect(plain).not.toMatch(/Do you want to proceed|approve this/i);
    await capture.screen('fsa06-04-whoami-claude', screen, agentScreen());
  });
});

// Page 02 s3: the MCP check. Start the agent against the box (no prompt, so no
// model turn), type /mcp, and capture the server list with fortisoar connected.
test('chapter 6 - agent init', async ({ local, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (shouldRunStep('fsa06-03-agent-init')) await test.step('fsa06-03-agent-init', async () => {
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    agent.type('/mcp');
    agent.enter();
    await agent.waitFor(/fortisoar/i, { timeoutMs: 120_000 });
    await agent.waitIdle({ quietMs: 2_500, timeoutMs: 60_000 });
    await capture.screen('fsa06-03-agent-init', agent.screen(), agentScreen());
  });
});

// Page 02 s2 and s3, Claude Code tab: the toolkit's init output and the MCP check
// in a shell. Both are plain commands in a pty, so no model turn and no tokens.
// The init command reads the password from FSR_PASSWORD (never argv), and the
// shot masks it to the page's placeholder. The mcp list runs in a throwaway folder
// with an isolated CLAUDE_CONFIG_DIR, so a user-level fortisoar server cannot
// shadow the project file the page tells the student to save.
test('chapter 6 - install and check', async ({ capture }) => {
  test.setTimeout(10 * 60 * 1000);
  const login = pyfsrEnv().FSR_USERNAME ?? '';
  if (shouldRunStep('fsa06-02-init-output')) await test.step('fsa06-02-init-output', async () => {
    await shellShot(capture, 'fsa06-02-init-output', {
      command: `fsr-agentic-toolkit init --url ${boxHost()} --username '${login}' --no-verify-ssl`,
      secrets: [['FSR_PASSWORD', '<your-password>']],
      // The connected line, then the Claude Code snippet up to its closing brace.
      from: /^connected: /,
      to: /^\}\s*$/,
      // Checked on the masked output: the login connected and the password is the placeholder.
      expect: [/^connected: agentlab </m, /"FSR_PASSWORD": "<your-password>"/],
    });
  });

  if (shouldRunStep('fsa06-03-claude-mcp-list')) await test.step('fsa06-03-claude-mcp-list', async () => {
    const folder = process.env.FSA_MCP_FOLDER || path.join(os.tmpdir(), 'fsa-workshop', 'mcp-folder');
    const isolated = path.join(folder, 'claude-config');
    // A clean folder each run: the saved .mcp.json and an empty Claude config dir.
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(isolated, { recursive: true });
    writeClaudeMcpJson(folder);
    await shellShot(capture, 'fsa06-03-claude-mcp-list', {
      command: 'claude mcp list',
      cwd: folder,
      env: { CLAUDE_CONFIG_DIR: isolated },
      timeoutMs: 3 * 60 * 1000,
      // The line the page says a good file shows.
      expect: [/fortisoar[^\n]*Pending approval/],
    });
  });
});

// Page 01a: each agent's version check, the "it installed" proof the page asks
// for. Local commands only; nothing touches the box and no tokens are spent.
test('chapter 6 - install a coding agent', async ({ capture }) => {
  test.setTimeout(5 * 60 * 1000);
  const version = async (id: string, command: string, expected: RegExp) =>
    shellShot(capture, id, { command, cols: 100, timeoutMs: 60_000, expect: [expected] });
  if (shouldRunStep('fsa06-01a-claude-version')) await test.step('fsa06-01a-claude-version', () =>
    version('fsa06-01a-claude-version', 'claude --version', /\d+\.\d+\.\d+.*Claude Code/i));
  if (shouldRunStep('fsa06-01a-codex-version')) await test.step('fsa06-01a-codex-version', () =>
    version('fsa06-01a-codex-version', 'codex --version', /codex-cli \d+\.\d+/i));
  if (shouldRunStep('fsa06-01a-opencode-version')) await test.step('fsa06-01a-opencode-version', () =>
    version('fsa06-01a-opencode-version', 'opencode --version', /opencode v?\d+\.\d+\.\d+/i));
});

// Page 01 s1-2, the user form's roles: the workshop login's existing record, opened
// and read only. Nothing is saved; the form is closed. If the login does not exist the
// step fails rather than creating it (page 01 creates it by hand).
test('chapter 6 - user roles', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa06-01b-user-roles')) return;
  const soar = await gui('soar');

  await test.step('fsa06-01b-user-roles', async () => {
    await goToState(soar, 'main.iam.people');
    await expect(soar.getByText(/People|Users/i).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    // The page's login is "agentlab" (the masked name the shots show). The box's own login
    // is not the workshop user, so only the page's name is looked for.
    // The list shows names and emails, not login ids: match the login itself or an
    // email that starts with it (agentlab_user@...).
    const row = soar.getByText(new RegExp(`^${SHOWN_LOGIN}(\\b|_)`, 'i')).filter({ visible: true }).first();
    if (!(await row.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false))) {
      // Not created here: a missing login is reported, so the capture is skipped, not faked.
      skipStep('fsa06-01b-user-roles', `no ${SHOWN_LOGIN} login on this box: page 01 creates it by hand`);
      return;
    }
    await row.click();
    // Checked before the capture: the roles the page says the login holds.
    for (const role of ['Full App Permissions', 'Application Administrator', 'Security Administrator', 'Playbook Administrator']) {
      await expect(soar.getByText(role, { exact: true }).filter({ visible: true }).first(), `role ${role} is assigned`).toBeVisible({ timeout: 30_000 });
    }
    await capture.shot(soar, 'fsa06-01b-user-roles', {
      scrubSkip: ['email', 'date-or-time'],
    });
  });
});

// Page 02 Codex tab, step 4: Codex's /mcp screen with the fortisoar server connected.
// Starting Codex and typing /mcp is not a model turn, so no tokens are spent.
test('chapter 6 - codex mcp connected', async ({ capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa06-12b-codex-mcp-connected')) return;
  await test.step('fsa06-12b-codex-mcp-connected', async () => {
    const session = await startCodex('codex-mcp');
    try {
      // Type the command, let Codex's slash popup settle, then submit it with its own Enter.
      session.write('/mcp');
      await new Promise((r) => setTimeout(r, 2000));
      session.write('\r');
      await session.waitFor(/fortisoar: connected/, { timeoutMs: 120_000 });
      await session.waitScreen(/fortisoar: connected/, { settleMs: 1500, timeoutMs: 30_000 });
      // Checked before the capture: the server reads connected, with its tools.
      expect(session.plainScreen()).toMatch(/fortisoar: connected \(\d+ tools?\)/);
      await capture.screen('fsa06-12b-codex-mcp-connected', session.screen(), codexScreen());
    } finally {
      session.kill();
    }
  });
});

// --- Codex (page 02 Codex tab, page 03 Codex tab) -------------------------------
// Driven through docubot's Codex driver on the student's own config.toml (an
// isolated CODEX_HOME, see lib/agentlab.ts startCodex). Each turn spends tokens, so
// the group rides SPEND_AI. A capture is written only after its effect check passes.
const APPROVAL_NAME = 'Approval test';
const APPROVAL_STAGE = /Allow the \S+ MCP server to run tool|Approve this change/;

test.describe('chapter 6 - codex', () => {
  test.skip(process.env.SPEND_AI !== '1', 'codex turns: set SPEND_AI=1');
  test.setTimeout(20 * 60 * 1000);

  test('chapter 6 - codex first contact', async ({ capture }) => {
    if (shouldRunStep('fsa06-12-codex-mcp-list')) await test.step('fsa06-12-codex-mcp-list', async () => {
      // Page 02 Codex tab, step 2: a SHELL check, not inside codex.
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
        await capture.screen('fsa06-12-codex-mcp-list', sh.screen(), codexScreen());
      } finally {
        sh.kill();
      }
    });

    if (shouldRunStep('fsa06-13-codex-whoami')) await test.step('fsa06-13-codex-whoami', async () => {
      const who = boxIdentity();
      const session = await startCodex('codex-whoami');
      try {
        const screen = await session.turn(promptFor('06-setup-agent', '02-wire-the-agent'), { timeoutMs: 10 * 60 * 1000 });
        const plain = session.plainScreen();
        // Effect: the answer names the login the box reports and the box version.
        expect(plain).toContain(who.loginid);
        expect(plain).toMatch(/8\.\d+\.\d+/);
        // Read-only: nothing was asked to be approved.
        expect(plain).not.toMatch(APPROVAL_STAGE);
        await capture.screen('fsa06-13-codex-whoami', screen, codexScreen());
      } finally {
        session.kill();
      }
    });
  });

  test('chapter 6 - codex approval', async ({ capture }) => {
    test.setTimeout(20 * 60 * 1000);
    const prompt = promptFor('06-setup-agent', '03-approve-every-write');

    if (shouldRunStep('fsa06-06-codex-approval')) await test.step('fsa06-06-codex-approval', async () => {
      labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);
      const session = await startCodex('codex-approve');
      try {
        // Stage 1 is codex's own MCP prompt; allowing it reveals the toolkit's form.
        await session.promptUntil(prompt, APPROVAL_STAGE, { timeoutMs: 4 * 60 * 1000 });
        await session.answer('approve');
        await session.waitFor(/Approve this change/, { timeoutMs: 2 * 60 * 1000 });
        // Shot: the paused approval form (box, tool, arguments, True/False).
        const paused = session.screen();
        expect(session.plainScreen()).toMatch(/1\. True/);
        await session.answer('approve');
        await session.waitFor(/Worked for \d+s/, { timeoutMs: 4 * 60 * 1000 });
        // Effect: the approved write landed.
        expect(alertsNamed(APPROVAL_NAME).length).toBe(1);
        await capture.screen('fsa06-06-codex-approval', paused, codexScreen());
      } finally {
        session.kill();
        labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);
      }
    });

    if (shouldRunStep('fsa06-10-codex-declined')) await test.step('fsa06-10-codex-declined', async () => {
      labSeed('delete-records', 'alerts', 'name', APPROVAL_NAME);
      const session = await startCodex('codex-decline');
      try {
        await session.promptUntil(prompt, APPROVAL_STAGE, { timeoutMs: 4 * 60 * 1000 });
        await session.answer('decline');
        await session.waitFor(/Worked for \d+s/, { timeoutMs: 4 * 60 * 1000 });
        // Effect: the declined write created nothing, and the agent says so.
        expect(alertsNamed(APPROVAL_NAME).length).toBe(0);
        expect(session.plainScreen()).toMatch(/not created|wasn.t created|cancel/i);
        await capture.screen('fsa06-10-codex-declined', session.screen(), codexScreen());
      } finally {
        session.kill();
      }
    });
  });
});

