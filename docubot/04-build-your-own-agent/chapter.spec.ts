// Chapter 4 - build your own agent (advanced, optional). Mixed UI + API chapter:
// the Content Hub upload panel, the hello agent (a fixed answer, NO LLM call, so
// it spends no FortiAI tokens), the TOOL_LIST routing record, a test
// investigation, and the two playbook routes.
//
// Opt-in gates (nothing here mutates the box or spends credits by default):
//   DOCUBOT_AGENT_BUILD=1  zip + import the example hello agent (and re-import it
//                          with replace in fsa04-06). Needs the Advanced
//                          Development "Import/Upload Custom AI Agent" toggle on.
//   SPEND_AI=1             run a real FortiAI alert investigation (fsa04-03).
//   DOCUBOT_AGENT_PLAYBOOK  name of a hand-built route-A playbook in the
//                          "Agent Lab" collection (fsa04-04); defaults below.
//
// Steps that need the hello agent skip (with a log line) when it is not
// installed, so a read-only run still captures the upload panel and the
// TOOL_LIST view. Authored OFFLINE from the pre-docubot spec
// tools/e2e/captures/ch04.spec.js; selectors and the /ai/* API paths are
// unverified - run on a box with `docubot run --chapter 04-build-your-own-agent`.
import {
  agentInCatalog, agentUploadAvailable, expect, findAgent, findAlert, openAgentDetail, openAgentUploadPanel,
  openAlertAiInvestigation, openOrgContextRecord, openPlaybook, openTracePanel, readInvestigation,
  runInvestigation, test, triggerAgent, uploadAgentBundle, waitForInvestigation,
  skipStep,
} from 'docubot';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { labSeed, sh, shouldRunStep } from '../lib/agentlab';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. On-screen dates are legitimate content.
// Record/agent/designer pages show record UUIDs, which read as key-like tokens but
// are not secrets (and these pages never show a real key), so they skip that too.
const SKIP = { scrubSkip: ['date-or-time'] };
const SKIP_RECORD = { scrubSkip: ['date-or-time', 'key-like-token'] };

test.describe.configure({ mode: 'serial' });

const AGENT = 'workshop_hello_agent';
const AGENT_LABEL = 'Workshop Hello Agent';
const EXAMPLES = path.join(__dirname, '..', '..', 'static', 'examples');
const PLAYBOOK_COLLECTION = 'Agent Lab';
const PLAYBOOK_NAME = process.env.DOCUBOT_AGENT_PLAYBOOK || 'Agent Lab - Invoke Hello Agent';
const DEFAULT_TOOL_ROWS = [
  'Approved activity', 'Change authorization', 'Detection quality', 'Historical baseline',
  'Asset criticality', 'Identity status', 'IOC reputation', 'Prior disposition', 'Endpoint behavior',
];

const build = () => process.env.DOCUBOT_AGENT_BUILD === '1';

/** Trigger the hello agent and check the documented async shape (task_id first, then the answer). */
async function triggerHello(soar: Page, entity: string): Promise<any> {
  const { trigger, result } = await triggerAgent(soar, AGENT, { entity });
  expect(trigger.answer, 'trigger must return a task_id, not the answer').toBeUndefined();
  return result;
}

const helloListed = (soar: Page, origin: string) => agentInCatalog(soar, origin, AGENT_LABEL);

/** Upload the bundle through the panel (uploads AND activates); fail when the toggle is off. */
async function uploadHello(soar: Page, origin: string, zip: string): Promise<void> {
  if (!(await agentUploadAvailable(soar, origin)).available) {
    throw new Error('Upload AI Agent control is off: enable Advanced Development > Import/Upload Custom AI Agent');
  }
  await uploadAgentBundle(soar, origin, zip, { replace: true });
}

test('chapter 4 - build your own agent', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlab-ch04-'));
  const zip = path.join(workdir, `${AGENT}.zip`);

  // CONFIGURE: seed this chapter's prerequisites through the repeatable python
  // seeder (tools/lab_setup.py), the same artifacts students download from
  // static/examples. Idempotent (create-if-absent), gated so a plain read-only
  // capture run never mutates the box. Set DOCUBOT_SEED=1 to seed.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    labSeed('org-context');          // the TOOL_LIST record fsa04-02 reads
    if (build()) labSeed('install-agent'); // the hello agent fsa04-01/05 trigger
  });

  // Page 02 s2: the Content Hub upload panel. Opening it uploads nothing, so it is
  // always safe; skipped (not failed) when the Advanced Development toggle is off.
  if (shouldRunStep('fsa04-00-upload-agent')) await test.step('fsa04-00-upload-agent', async () => {
    if (!(await openAgentUploadPanel(soar, origin))) {
      skipStep('fsa04-00-upload-agent', 'the Import/Upload Custom AI Agent toggle is off');
      return;
    }
    await expect(soar.getByText(/Replace existing version/i).first()).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-00-upload-agent-dialog', SKIP);
    // Package the example bundle exactly as the page tells the student to.
    if (build()) {
      sh('zip', ['-r', zip, AGENT], EXAMPLES);
      expect(fs.existsSync(zip)).toBe(true);
      await uploadHello(soar, origin, zip);
      expect(await helloListed(soar, origin), 'hello agent not in the catalog after upload').toBe(true);
    }
  });

  // Page 02 s3: the hello agent. Detail page capture + the async trigger/poll/result
  // round trip. No LLM call, so no credits.
  if (shouldRunStep('fsa04-01-hello-agent')) await test.step('fsa04-01-hello-agent', async () => {
    if (!(await openAgentDetail(soar, origin, AGENT_LABEL))) {
      skipStep('fsa04-01-hello-agent', 'hello agent not installed (set DOCUBOT_AGENT_BUILD=1)');
      return;
    }
    await expect(soar.getByText(AGENT_LABEL).first()).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-01-hello-agent-detail', SKIP_RECORD);

    const result = await triggerHello(soar, 'host-01.example.com');
    expect(result.answer).toContain('hello from the workshop agent for entity: host-01.example.com');
    expect(result).toHaveProperty('confidence');
    expect(Array.isArray(result.evidence)).toBe(true);
    // The page shows the API exchange; render it as a terminal-style capture with
    // placeholders (no token, host or real task id).
    const shown = [
      `$ curl -X POST https://fortisoar.example.com/ai/agents/${AGENT}/trigger -d '{"entity": "host-01.example.com"}'`,
      '{"task_id": "<task-id>", "status": "pending"}',
      '$ curl https://fortisoar.example.com/ai/agents/<task-id>/status',
      '{"status": "completed"}',
      '$ curl https://fortisoar.example.com/ai/agents/<task-id>/result',
      JSON.stringify({ answer: result.answer, confidence: result.confidence, evidence: result.evidence }, null, 2),
    ].join('\n');
    await capture.screen('fsa04-01-hello-agent-trigger-result', shown, { title: 'api client' });
  });

  // Page 02 s4: the TOOL_LIST record in organizational context. Editing the record
  // is a person's step; here we capture the record and assert the nine defaults are
  // intact (replacing it with a short table silently stops the default questions).
  if (shouldRunStep('fsa04-02-tool-list-row')) await test.step('fsa04-02-tool-list-row', async () => {
    // Seed it first with DOCUBOT_SEED=1 (or `python3 tools/lab_setup.py org-context`).
    const uuid = await openOrgContextRecord(soar, origin, 'TOOL_LIST').catch(() => null);
    expect(uuid, 'no TOOL_LIST org-context record: seed it with DOCUBOT_SEED=1').toBeTruthy();
    for (const label of DEFAULT_TOOL_ROWS) {
      await expect(soar.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    }
    await capture.shot(soar, 'fsa04-02-tool-list-row-record', SKIP_RECORD);
  });

  // Page 02 s5: a real investigation, then the trace shows a question answered by
  // the custom agent. Spends FortiAI credits, so it is opt-in.
  if (shouldRunStep('fsa04-03-route-check')) await test.step('fsa04-03-route-check', async () => {
    if (process.env.SPEND_AI !== '1') {
      skipStep('fsa04-03-route-check', 'set SPEND_AI=1 to run a FortiAI investigation');
      return;
    }
    // A seeded alert no other chapter investigates (ch03 and ch10 own "beaconing from web-server-01").
    const alert = await findAlert(soar, /Agent Lab - Outbound beacon/i, { search: 'Agent Lab - Outbound beacon' });
    expect(alert, 'seed the Agent Lab alerts first: tools/lab_setup.py seed').toBeTruthy();
    await openAlertAiInvestigation(soar, origin, alert!.id);
    // A rerun finds the investigation already finished: read it, do not spend again.
    const inv = (await readInvestigation(soar)).state === 'not-run'
      ? await runInvestigation(soar, { timeoutMs: 15 * 60 * 1000 })
      : await waitForInvestigation(soar, { timeoutMs: 60_000 });
    expect(inv.state).toBe('done');
    const trace = await openTracePanel(soar);
    expect(trace.length).toBeGreaterThan(0);
    // Whether the question reached the custom agent depends on the row wording and
    // the model, so the capture shows the trace and the log says what it found.
    // The capture is proof only if the trace shows the custom agent answering.
    expect(JSON.stringify(trace), `the trace never reached ${AGENT}: tighten the TOOL_LIST row`).toContain(AGENT);
    await capture.shot(soar, 'fsa04-03-route-check-trace', SKIP_RECORD);
  });

  // Page 03 s3: route A, the Invoke AI Agent connector operation, with a Decision
  // on confidence. The playbook is built by hand in the designer (the connector
  // login and step wiring are not scripted); this step opens it and captures the
  // canvas. Skipped when the playbook is not there.
  if (shouldRunStep('fsa04-04-playbook-branch')) await test.step('fsa04-04-playbook-branch', async () => {
    const opened = await openPlaybook(soar, origin, { collectionName: PLAYBOOK_COLLECTION, playbookName: PLAYBOOK_NAME })
      .then(() => true).catch(() => false);
    if (!opened) {
      skipStep('fsa04-04-playbook-branch', `no "${PLAYBOOK_NAME}" playbook in "${PLAYBOOK_COLLECTION}"`);
      return;
    }
    await expect(soar.getByText(/Invoke AI Agent|Decision/i).first()).toBeVisible({ timeout: 20_000 });
    // The designer header carries a "Last Modified <date> by <user>" line; the date
    // is benign content and the user name is a display name, so leave them visible.
    await capture.shot(soar, 'fsa04-04-playbook-branch-decision', SKIP_RECORD);
  });

  // Page 03 s4: route B, the raw async trigger API. The effect is the documented
  // shape: one call returns a task_id (not the answer), then status, then result.
  if (shouldRunStep('fsa04-05-playbook-route-b')) await test.step('fsa04-05-playbook-route-b', async () => {
    if (!(await helloListed(soar, origin)) && !build()) {
      skipStep('fsa04-05-playbook-route-b', 'hello agent not installed');
      return;
    }
    const result = await triggerHello(soar, 'host-01.example.com');
    expect(result.answer).toBeTruthy();
  });

  // Page 03 s5: replace-import, then confirm the agent still runs. Mutates the box,
  // so it rides the same opt-in as the initial import. Records whether the id moved.
  if (shouldRunStep('fsa04-06-replace-check')) await test.step('fsa04-06-replace-check', async () => {
    if (!build()) {
      skipStep('fsa04-06-replace-check', 'set DOCUBOT_AGENT_BUILD=1 to re-import with replace');
      return;
    }
    if (!fs.existsSync(zip)) sh('zip', ['-r', zip, AGENT], EXAMPLES);
    const before = (await findAgent(soar, AGENT))?.id;
    await uploadHello(soar, origin, zip);
    const after = (await findAgent(soar, AGENT))?.id;
    console.log(`[ch04] agent id before=${before} after=${after} changed=${before !== after}`);
    const result = await triggerHello(soar, 'host-01.example.com');
    expect(result.answer).toContain('hello from the workshop agent');
  });
});
