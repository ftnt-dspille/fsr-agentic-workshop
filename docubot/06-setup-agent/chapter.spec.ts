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
import { expect, goToState, test, type AgentShotRun } from 'docubot';
import { promptFor, shouldRunStep } from '../lib/agentlab';

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

  // claude + codex each capture the write-approval card and, from the SAME session,
  // the declined state after Esc (declineWaitFor/declineId). opencode's MCP tools
  // did not surface reliably headlessly, so it gets a SETUP shot (a benign no-tool
  // question), not a write-approval.
  const DECLINED = /Interrupted|What should Claude do instead|not completed|was not created|declin|not approve/i;

  if (shouldRunStep('fsa06-05-claude-approval')) await test.step('fsa06-05-claude-approval', async () => {
    await capture.agentShot('fsa06-05-claude-approval', {
      ...approvalRun('claude', /requests your input|Do you want to proceed/i),
      declineWaitFor: DECLINED, declineId: 'fsa06-09-claude-declined',
    });
  });

  if (shouldRunStep('fsa06-06-codex-approval')) await test.step('fsa06-06-codex-approval', async () => {
    await capture.agentShot('fsa06-06-codex-approval', {
      ...approvalRun('codex', /Approve this change|Do you want to proceed/i),
      stableMs: 30_000, timeoutMs: 90_000,
      declineWaitFor: DECLINED, declineId: 'fsa06-10-codex-declined',
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
