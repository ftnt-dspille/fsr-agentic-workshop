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
import { apiViaApp, expect, findAlert, openAlertAiInvestigation, openTracePanel, runInvestigation, test } from 'docubot';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { labSeed, sh, shouldRunStep, uiMask } from '../lib/agentlab';

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

/** Open the Content Hub AI Agent catalog, optionally narrowed by a search string. */
async function openCatalog(soar: Page, origin: string, search = ''): Promise<void> {
  const url = `${origin}/content-hub/my-content/?contentType=ai_agent${search ? `&searchText=${encodeURIComponent(search)}` : ''}`;
  await soar.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await soar
    .waitForSelector('marketplace-tile-view-component, .mp-tile-container, text=No Results', { timeout: 30_000 })
    .catch(() => undefined);
}

/** Open the Upload dropdown; true when the gated "Upload AI Agent" item exists and was clicked. */
async function openUploadPanel(soar: Page, origin: string): Promise<boolean> {
  await openCatalog(soar, origin);
  await soar.locator('#upload-btn').click();
  const item = soar.locator('#upload-ai_agent');
  const present = await item.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  if (!present) return false;
  await item.click();
  await soar.getByText(/Drag and Drop/i).first().waitFor({ timeout: 20_000 });
  return true;
}

/** Is the hello agent in the catalog (the UI-installed path lists it)? */
async function agentListed(soar: Page, origin: string): Promise<boolean> {
  await openCatalog(soar, origin, AGENT_LABEL);
  return soar.locator('.mp-tile-container').filter({ hasText: AGENT_LABEL }).first()
    .waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
}

/** Upload a bundle through the panel. Uploads AND activates in one step. */
async function uploadBundle(soar: Page, origin: string, zip: string, replace: boolean): Promise<void> {
  if (!(await openUploadPanel(soar, origin))) throw new Error('Upload AI Agent control is off: enable Advanced Development > Import/Upload Custom AI Agent');
  if (replace) {
    await soar.evaluate(() => {
      const cb = (Array.from(document.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[]).find((c) =>
        /Replace existing version/i.test((c.closest('label') as HTMLElement)?.innerText || (c.parentElement as HTMLElement)?.innerText || ''));
      if (cb && !cb.checked) cb.click();
    });
  }
  await soar.locator('input[type=file][accept*="zip"]').first().setInputFiles(zip);
  await soar.waitForFunction(() => /successfully/i.test(document.body.innerText) || !document.querySelector('input[type=file][accept*="zip"]'), null, { timeout: 30_000 });
}

/** Trigger the agent, poll to completion, return the result (the documented async shape). */
async function triggerHello(soar: Page, entity: string): Promise<{ taskId: string; result: any }> {
  const trig: any = await apiViaApp(soar, 'POST', `/ai/agents/${AGENT}/trigger`, { entity });
  const taskId = String(trig.task_id);
  expect(taskId).toBeTruthy();
  let status = String(trig.status);
  for (let i = 0; i < 30 && status !== 'completed'; i++) {
    await soar.waitForTimeout(2_000);
    status = String(((await apiViaApp(soar, 'GET', `/ai/agents/${taskId}/status`)) as any).status);
    expect(['pending', 'running', 'in_progress', 'completed']).toContain(status);
  }
  expect(status).toBe('completed');
  const result: any = await apiViaApp(soar, 'GET', `/ai/agents/${taskId}/result`);
  return { taskId, result };
}

/** Read the agent's id from the agent list (used to record whether replace changes it). */
async function agentId(soar: Page): Promise<string | null> {
  const list: any = await apiViaApp(soar, 'GET', '/ai/agents');
  const rows: any[] = Array.isArray(list) ? list : list?.items || list?.agents || list?.['hydra:member'] || [];
  const hit = rows.find((a) => a && (a.name === AGENT || a.agent_name === AGENT));
  return hit ? String(hit.id ?? hit.uuid ?? hit.agent_id ?? '') || null : null;
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
    if (!(await openUploadPanel(soar, origin))) {
      console.log('[ch04] fsa04-00-upload-agent skipped: the Import/Upload Custom AI Agent toggle is off');
      return;
    }
    await expect(soar.getByText(/Replace existing version/i).first()).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-00-upload-agent-dialog', { mask: uiMask(soar) });
    // Package the example bundle exactly as the page tells the student to.
    if (build()) {
      sh('zip', ['-r', zip, AGENT], EXAMPLES);
      expect(fs.existsSync(zip)).toBe(true);
      await uploadBundle(soar, origin, zip, true);
      expect(await agentListed(soar, origin), 'hello agent not in the catalog after upload').toBe(true);
    }
  });

  // Page 02 s3: the hello agent. Detail page capture + the async trigger/poll/result
  // round trip. No LLM call, so no credits.
  if (shouldRunStep('fsa04-01-hello-agent')) await test.step('fsa04-01-hello-agent', async () => {
    if (!(await agentListed(soar, origin))) {
      console.log('[ch04] fsa04-01-hello-agent skipped: hello agent not installed (set DOCUBOT_AGENT_BUILD=1)');
      return;
    }
    await soar.locator('.mp-tile-container').filter({ hasText: AGENT_LABEL }).first().click();
    await soar.waitForFunction(() => /[?&]uuid=/i.test(location.href), null, { timeout: 15_000 }).catch(() => undefined);
    await expect(soar.getByText(AGENT_LABEL).first()).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-01-hello-agent-detail', { mask: uiMask(soar) });

    const { result } = await triggerHello(soar, 'host-01.example.com');
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
    await soar.goto(`${origin}/ai-configuration/organizational-context`, { waitUntil: 'domcontentloaded' });
    // The org-context grid paginates (60+ records), so TOOL_LIST is not on the
    // first page. Filter the Title column (the grid's own column filter) to find
    // it, then open it. Seed it first with: DOCUBOT_SEED=1 (or
    // `python3 tools/lab_setup.py org-context`).
    await soar.locator('input[name="title"][placeholder="Search" i]').first().fill('TOOL_LIST');
    const row = soar.locator('.ui-grid-row').filter({ hasText: 'TOOL_LIST' }).first();
    await expect(row, 'no TOOL_LIST org-context record: seed it with DOCUBOT_SEED=1').toBeVisible({ timeout: 30_000 });
    await row.click();
    for (const label of DEFAULT_TOOL_ROWS) {
      await expect(soar.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    }
    await capture.shot(soar, 'fsa04-02-tool-list-row-record', { mask: uiMask(soar) });
  });

  // Page 02 s5: a real investigation, then the trace shows a question answered by
  // the custom agent. Spends FortiAI credits, so it is opt-in.
  if (shouldRunStep('fsa04-03-route-check')) await test.step('fsa04-03-route-check', async () => {
    if (process.env.SPEND_AI !== '1') {
      console.log('[ch04] fsa04-03-route-check skipped: set SPEND_AI=1 to run a FortiAI investigation');
      return;
    }
    const alert = await findAlert(soar, /Agent Lab/i, { search: 'Agent Lab' });
    expect(alert, 'seed an Agent Lab alert that carries the entity the agent needs').toBeTruthy();
    await openAlertAiInvestigation(soar, origin, alert!.id);
    const inv = await runInvestigation(soar, { timeoutMs: 15 * 60 * 1000 });
    expect(inv.state).toBe('done');
    const trace = await openTracePanel(soar);
    expect(trace.length).toBeGreaterThan(0);
    // Whether the question reached the custom agent depends on the row wording and
    // the model; the person reads the trace. The page has no capture for this step.
  });

  // Page 03 s3: route A, the Invoke AI Agent connector operation, with a Decision
  // on confidence. The playbook is built by hand in the designer (the connector
  // login and step wiring are not scripted); this step opens it and captures the
  // canvas. Skipped when the playbook is not there.
  if (shouldRunStep('fsa04-04-playbook-branch')) await test.step('fsa04-04-playbook-branch', async () => {
    await soar.goto(`${origin}/playbooks`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await soar.waitForSelector('text=Collections', { timeout: 30_000 });
    const coll = soar.locator(`text=${PLAYBOOK_COLLECTION}`).first();
    if (!(await coll.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) {
      console.log(`[ch04] fsa04-04-playbook-branch skipped: no "${PLAYBOOK_COLLECTION}" collection`);
      return;
    }
    await coll.click();
    const pb = soar.locator(`text=${PLAYBOOK_NAME}`).first();
    if (!(await pb.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) {
      console.log(`[ch04] fsa04-04-playbook-branch skipped: no "${PLAYBOOK_NAME}" playbook`);
      return;
    }
    await pb.click();
    await soar.waitForSelector('.jsplumb-draggable, [class*="workflow-step"], #designer-container', { timeout: 30_000 });
    await expect(soar.getByText(/Invoke AI Agent|Decision/i).first()).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-04-playbook-branch-decision', { mask: uiMask(soar) });
  });

  // Page 03 s4: route B, the raw async trigger API. The effect is the documented
  // shape: one call returns a task_id (not the answer), then status, then result.
  if (shouldRunStep('fsa04-05-playbook-route-b')) await test.step('fsa04-05-playbook-route-b', async () => {
    if (!(await agentListed(soar, origin)) && !build()) {
      console.log('[ch04] fsa04-05-playbook-route-b skipped: hello agent not installed');
      return;
    }
    const trig: any = await apiViaApp(soar, 'POST', `/ai/agents/${AGENT}/trigger`, { entity: 'host-01.example.com' });
    expect(trig.task_id, 'trigger must return a task_id, not the answer').toBeTruthy();
    expect(trig.answer).toBeUndefined();
    const { result } = await triggerHello(soar, 'host-01.example.com');
    expect(result.answer).toBeTruthy();
  });

  // Page 03 s5: replace-import, then confirm the agent still runs. Mutates the box,
  // so it rides the same opt-in as the initial import. Records whether the id moved.
  if (shouldRunStep('fsa04-06-replace-check')) await test.step('fsa04-06-replace-check', async () => {
    if (!build()) {
      console.log('[ch04] fsa04-06-replace-check skipped: set DOCUBOT_AGENT_BUILD=1 to re-import with replace');
      return;
    }
    if (!fs.existsSync(zip)) sh('zip', ['-r', zip, AGENT], EXAMPLES);
    const before = await agentId(soar);
    await uploadBundle(soar, origin, zip, true);
    const after = await agentId(soar);
    console.log(`[ch04] agent id before=${before} after=${after} changed=${before !== after}`);
    const { result } = await triggerHello(soar, 'host-01.example.com');
    expect(result.answer).toContain('hello from the workshop agent');
  });
});
