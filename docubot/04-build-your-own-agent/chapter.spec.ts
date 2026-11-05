// Chapter 4 - build your own agent (advanced, optional). Mixed UI + API chapter:
// the Content Hub upload panel, the hello agent (a fixed answer, NO LLM call, so
// it spends no FortiAI tokens), the TOOL_LIST routing record, a test
// investigation, and the Invoke AI Agent playbook.
//
// Opt-in gates (nothing here mutates the box or spends credits by default):
//   DOCUBOT_AGENT_BUILD=1  zip + import the example hello agent. Needs the Advanced
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
  agentInCatalog, agentUploadAvailable, expect, findAgent, findAlert, openAgentDetail, openAgentUploadPanel, openMcpServers, openPlaybookLogs, openRecord,
  openAlertAiInvestigation, openOrgContextRecord, openPlaybook, openTracePanel, readInvestigation, selectTraceStep,
  runInvestigation, test, triggerAgent, uploadAgentBundle, waitForInvestigation,
  skipStep, openConnector, selectConfig, readFieldAfterLabel, leaveDesigner, openUploadConnector,
} from 'docubot';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { boxHost, labSeed, pyfsrEnv, queryRows, sh, toolkit } from 'docubot';
import { anyStepSelected, shouldRunStep } from 'docubot';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. On-screen dates are legitimate content.
// Record/agent/designer pages show record UUIDs, which read as key-like tokens but
// are not secrets (and these pages never show a real key), so they skip that too.
const SKIP = { scrubSkip: ['date-or-time'] };
const SKIP_RECORD = { scrubSkip: ['date-or-time', 'key-like-token'] };

test.describe.configure({ mode: 'serial' });

const AGENT = 'workshop_hello_agent';
const BEACON_ALERT = 'Agent Lab - Outbound beacon to known C2 range from 10-net host';
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
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (!anyStepSelected([
    'fsa04-00-advanced-toggle',
    'fsa04-00-upload-agent',
    'fsa04-01-hello-agent',
    'fsa04-02-tool-list-row',
    'fsa04-03-route-check',
    'fsa04-04-playbook-branch',
  ])) return;
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
    if (build()) labSeed('install-agent'); // the hello agent fsa04-01 checks
    // The page-03 playbook, from the shipped "working version" YAML, when absent.
    if (queryRows('workflows', [{ field: 'name', operator: 'eq', value: PLAYBOOK_NAME }]).length === 0) {
      const yaml = fs.readFileSync(path.join(EXAMPLES, 'playbooks', 'invoke_hello_agent.yaml'), 'utf8');
      expect(toolkit('publish_playbook', { yaml_text: yaml }).published).toBe(true);
    }
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

  // Page 02 s2 note: where the Import/Upload Custom AI Agent toggle lives. Opens the
  // AI Configurations page, then its System > System Configuration screen, and shows
  // the Advanced Development section. Read-only: the toggle is looked at, not changed.
  if (shouldRunStep('fsa04-00-advanced-toggle')) await test.step('fsa04-00-advanced-toggle', async () => {
    await openMcpServers(soar, origin);
    await soar.getByText('System Configuration', { exact: true }).first().click();
    await soar.getByText('Advanced Development Features', { exact: true }).first().click();
    const toggle = soar.getByText(/Import\/Upload Custom AI Agent/i).first();
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa04-00-advanced-toggle', { highlight: toggle, ...SKIP });
  });

  // Page 02 s4: the hello agent's detail page. The API round trip below only proves
  // the upload worked; students call it from a playbook on page 03. No LLM call.
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
    // The learner's tenth TOOL_LIST row (page 02 s4); without it no question targets the agent.
    labSeed('tool-list-row');
    // A seeded alert no other chapter investigates (ch03 and ch10 own "beaconing from web-server-01").
    // The trace names the agent by its label.
    const reached = (trace: unknown) => /workshop_hello_agent|Workshop Hello Agent/.test(JSON.stringify(trace));
    const openTrace = async () => {
      const alert = await findAlert(soar, /Agent Lab - Outbound beacon/i, { search: 'Agent Lab - Outbound beacon' });
      expect(alert, 'seed the Agent Lab alerts first: tools/lab_setup.py seed').toBeTruthy();
      await openAlertAiInvestigation(soar, origin, alert!.id);
      // A finished investigation is read, not run again.
      const inv = (await readInvestigation(soar)).state === 'not-run'
        ? await runInvestigation(soar)
        : await waitForInvestigation(soar, { timeoutMs: 60_000 });
      expect(inv.state).toBe('done');
      return openTracePanel(soar);
    };
    let trace = await openTrace();
    if (!reached(trace)) {
      // A finished investigation from before the row existed never reaches the
      // agent: reseed the alert and investigate it fresh.
      labSeed('delete-records', 'alerts', 'name', BEACON_ALERT);
      labSeed('seed');
      trace = await openTrace();
    }
    expect(trace.length).toBeGreaterThan(0);
    // The capture is proof only if the trace shows the custom agent answering.
    expect(reached(trace), `the trace never reached ${AGENT}: tighten the TOOL_LIST row`).toBe(true);
    // Open the agent's own step so the capture shows it, not just the top of the list.
    const step = await selectTraceStep(soar, 'Workshop Hello Agent');
    await capture.shot(soar, 'fsa04-03-route-check-trace', { ...SKIP_RECORD, highlight: step });
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

    // The run's own output: fire the playbook with a test alert, then open that run's
    // Executed Playbook Logs. The Invoke AI Agent step's data is what the page branches on.
    const since = new Date().toISOString();
    const created = toolkit('create_record', {
      module: 'alerts',
      data: { name: `Agent Lab hello test (${Date.now()})`, severity: 'Low', source: 'Agent Lab Workshop', description: 'route A check' },
    });
    const run = toolkit('wait_for_playbook_run', { playbook: PLAYBOOK_NAME, since, timeout: 180 });
    expect(run.status, 'the route-A run did not finish').toBe('finished');
    await openRecord(soar, 'alerts', created.uuid, { tab: null });
    await openPlaybookLogs(soar, { select: PLAYBOOK_NAME });
    await capture.shot(soar, 'fsa04-04-playbook-branch-run', { target: soar.locator('#mySidenav'), ...SKIP_RECORD });
    // Open the Invoke AI Agent step to see its returned data (the page branches on it).
    await soar.getByText('Invoke AI Agent', { exact: true }).first().click();
    await soar.waitForTimeout(2000);
    // Expand the output's data node so its fields (what the Decision reads) show.
    // The tree's expand arrow for the data row (the label itself only moves the breadcrumb).
    const arrow = soar.getByText('data', { exact: true }).last();
    const box = await arrow.boundingBox();
    if (box) await soar.mouse.click(box.x - 14, box.y + box.height / 2);
    await soar.waitForTimeout(1500);
    const dataFields = await soar.getByText('confidence', { exact: true }).count();
    console.log(`[ch04] fsa04-04: confidence key shown in the step output: ${dataFields > 0}`);
    await capture.shot(soar, 'fsa04-04-playbook-branch-step-output', SKIP_RECORD);
  });
});

// Page 03 s1 (the Remote FortiSOAR configuration form): read-only. The Lab
// configuration is the default and is only looked at; its values are not changed.
// The endpoint and login are shown under the names the page uses (showAs), and the
// password field is masked.
test('chapter 4 - remote fortisoar config', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa04-01-remote-fortisoar-config')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  await test.step('fsa04-01-remote-fortisoar-config', async () => {
    await openConnector(soar, origin, 'FortiSOAR');
    await soar.getByText('Configurations', { exact: true }).first().click();
    expect(await selectConfig(soar, 'Lab'), 'the Lab configuration loads').toBe(true);
    // Checked before the capture: the values the page describes.
    const endpoint = await readFieldAfterLabel(soar, 'FortiSOAR Endpoint URL');
    expect(endpoint.kind, 'the form has an Endpoint URL field').toBe('input');
    expect(endpoint.value, 'the endpoint is the box').toContain(boxHost());
    expect((await readFieldAfterLabel(soar, 'Authentication Type')).value, 'Authentication Type is Basic').toBe('Basic');
    expect((await readFieldAfterLabel(soar, 'Verify SSL')).checked, 'Verify SSL is off').toBe(false);
    expect((await readFieldAfterLabel(soar, 'Mark As Default Configuration')).checked, 'the default-configuration checkbox is ticked').toBe(true);
    await soar.waitForTimeout(1500);
    const hostPort = boxHost();
    const hostname = hostPort.replace(/:\d+$/, '');
    const login = pyfsrEnv().FSR_USERNAME ?? '';
    await capture.shot(soar, 'fsa04-01-remote-fortisoar-config', {
      mask: [soar.locator('input[type=password]')],
      showAs: { [hostPort]: 'fortisoar.example.com', [hostname]: 'fortisoar.example.com', ...(login ? { [login]: 'agentlab' } : {}) },
      scrubSkip: ['date-or-time'],
    });
  });
});

// Page 03 s2 (steps 2-3): the Invoke AI Agent step's config in the designer. Opened
// and read only; the designer is left without saving. DOCUBOT_SEED=1 publishes the
// playbook from static/examples when it is missing.
test('chapter 4 - invoke step config', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa04-04-invoke-step-config')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    if (queryRows('workflows', [{ field: 'name', operator: 'eq', value: PLAYBOOK_NAME }]).length === 0) {
      const yaml = fs.readFileSync(path.join(EXAMPLES, 'playbooks', 'invoke_hello_agent.yaml'), 'utf8');
      expect(toolkit('publish_playbook', { yaml_text: yaml }).published).toBe(true);
    }
  });

  await test.step('fsa04-04-invoke-step-config', async () => {
    await openPlaybook(soar, origin, { collectionName: PLAYBOOK_COLLECTION, playbookName: PLAYBOOK_NAME });
    // The canvas node (not the palette entry of the same name), then its config panel.
    await soar.locator('#designer-container .step-container').filter({ hasText: 'Invoke AI Agent' }).first().dblclick({ timeout: 15000 });
    await soar.getByText('Agent Name', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
    // Checked before the capture: the two inputs the page tells the student to set.
    // The panel's labels are "Agent Name" (the YAML key agent_name) and "Agent Payload" (body).
    expect((await readFieldAfterLabel(soar, 'Agent Name')).value, 'Agent Name is the hello agent').toBe('workshop_hello_agent');
    // The payload is an ACE code editor, not an input: read its text inside the field's own group.
    const payloadText = await soar.evaluate(() => {
      const l = Array.from(document.querySelectorAll('label')).find((x) => (x.innerText || '').trim().startsWith('Agent Payload') && (x as HTMLElement).offsetParent);
      return ((l?.closest('.form-group') as HTMLElement | null)?.innerText) ?? '';
    });
    expect(payloadText, 'Agent Payload holds the entity JSON').toContain('"entity": "host-01.example.com"');
    await soar.waitForTimeout(1500);
    await capture.shot(soar, 'fsa04-04-invoke-step-config', SKIP_RECORD);
    // Leave without saving: nothing was changed.
    await leaveDesigner(soar, origin);
  });
});

// Page 03 s1 step 2: the Content Hub upload panel for a connector, opened with no
// file chosen. Opening it uploads nothing; the panel is only looked at.
test('chapter 4 - upload connector dialog', async ({ gui, capture }) => {
  test.setTimeout(5 * 60 * 1000);
  if (!shouldRunStep('fsa04-01b-upload-connector-dialog')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  await test.step('fsa04-01b-upload-connector-dialog', async () => {
    await openUploadConnector(soar, origin);
    // Checked before the capture: the connector panel is open and no file is chosen.
    const chosen = await soar.locator('input[type=file]').first().evaluate((el) => (el as HTMLInputElement).files?.length ?? 0);
    expect(chosen, 'no file is chosen').toBe(0);
    await expect(soar.getByText(/Drag and Drop/i).first(), 'the upload panel is open').toBeVisible({ timeout: 20_000 });
    await soar.waitForTimeout(1000);
    await capture.shot(soar, 'fsa04-01b-upload-connector-dialog', SKIP);
  });
});

// Page 03 s2 step 4: the Confidence Check decision in the designer. Opened and read
// only; the designer is left without saving.
test('chapter 4 - decision config', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa04-04-decision-config')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  await test.step('fsa04-04-decision-config', async () => {
    await openPlaybook(soar, origin, { collectionName: PLAYBOOK_COLLECTION, playbookName: PLAYBOOK_NAME });
    await soar.locator('#designer-container .step-container').filter({ hasText: 'Confidence Check' }).first().dblclick({ timeout: 15000 });
    // Checked before the capture: the two branches the page names are the decision's conditions.
    await expect(soar.getByText('High confidence', { exact: false }).first(), 'the High confidence branch shows').toBeVisible({ timeout: 30_000 });
    await expect(soar.getByText('Low confidence', { exact: false }).first(), 'the Low confidence branch shows').toBeVisible();
    await soar.waitForTimeout(1500);
    await capture.shot(soar, 'fsa04-04-decision-config', SKIP_RECORD);
    // Leave without saving: nothing was changed.
    await leaveDesigner(soar, origin);
  });
});

// Page 02 s2 step 4: the Advanced Development section in edit mode, with the accept
// checkbox showing. Nothing is submitted: Cancel leaves the toggle as it was, and the
// checkbox state is read before and after to prove it.
/** A visible action in the section's bottom bar (Edit, Cancel, ...), matched by its text. */
const barAction = (page: Page, label: string) =>
  page.locator('button, a').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).filter({ visible: true }).first();

test('chapter 4 - advanced toggle edit', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa04-00-advanced-toggle-edit')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  await test.step('fsa04-00-advanced-toggle-edit', async () => {
    await openMcpServers(soar, origin);
    await soar.getByText('System Configuration', { exact: true }).first().click();
    await soar.getByText('Advanced Development Features', { exact: true }).first().click();
    await expect(soar.getByText(/Import\/Upload Custom AI Agent/i).first()).toBeVisible({ timeout: 30_000 });
    const before = await readFieldAfterLabel(soar, 'Import/Upload Custom AI Agent');
    await barAction(soar, 'Edit').click();
    await expect(barAction(soar, 'Cancel'), 'edit mode is open').toBeVisible({ timeout: 20_000 });
    // The accept checkbox sits below the fold: scroll it into view, then shoot it.
    const accept = soar.getByText(/accept responsibility for enabling Import\/Export and Upload of AI Agent/i).first();
    await expect(accept, 'the Import/Upload accept checkbox shows in edit mode').toBeVisible({ timeout: 20_000 });
    await accept.scrollIntoViewIfNeeded();
    await soar.waitForTimeout(1000);
    await capture.shot(soar, 'fsa04-00-advanced-toggle-edit', { highlight: accept, ...SKIP });
    // Cancel, never Submit: the section goes back to read-only with its state unchanged.
    await barAction(soar, 'Cancel').click();
    await expect(barAction(soar, 'Edit'), 'back to read-only').toBeVisible({ timeout: 20_000 });
    const after = await readFieldAfterLabel(soar, 'Import/Upload Custom AI Agent');
    expect(JSON.stringify(after), 'the toggle is unchanged after Cancel').toBe(JSON.stringify(before));
  });
});

// Page 02 s5 step 4: the TOOL_LIST record after the learner's row is saved. The row
// is added by tools/lab_setup.py tool-list-row (idempotent); this step only shows it.
test('chapter 4 - tool list row saved', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa04-02-tool-list-row-saved')) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  await test.step('fsa04-02-tool-list-row-saved', async () => {
    const uuid = await openOrgContextRecord(soar, origin, 'TOOL_LIST').catch(() => null);
    expect(uuid, 'no TOOL_LIST org-context record: seed it with DOCUBOT_SEED=1').toBeTruthy();
    for (const label of DEFAULT_TOOL_ROWS) {
      await expect(soar.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    }
    // The hello row, the tenth line: no row, no capture (run tools/lab_setup.py tool-list-row).
    await expect(soar.getByText('Workshop Hello Agent', { exact: false }).first(), 'the hello row is saved: run tools/lab_setup.py tool-list-row').toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa04-02-tool-list-row-saved', SKIP_RECORD);
  });
});
