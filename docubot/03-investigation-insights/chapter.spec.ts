// Chapter 3 - investigation and insights: the built-in FortiAI investigation on a
// lab alert, the AI Insights builder, and the verdict dashboard.
//
// Spend gate: running an investigation or executing an insight spends FortiAI
// tokens. Those steps run only with SPEND_AI=1. Without it the spec still
// captures an investigation that already finished on the lab alert (the common
// case after one paid run), and skips the rest with a log line, never a fake pass.
//
// Migrated from tools/e2e/captures/ch03.spec.js. Verify on a box with
// `docubot run --chapter 03-investigation-insights`.
import type { Locator, Page } from '@playwright/test';
import {
  executeInsight, expect, findAlert, goToModuleList, openInsightBuilder, openRecord, openTracePanel,
  openHypothesisQuestion, openQuestionTrace, readInvestigation, readVerdictTab, reinvestigate, runInvestigation, selectDetailTab, test, waitForInvestigation, waitForRecordSettled,
  skipStep,
  addCardCountWidget, addChartWidget, addRow, apiViaApp, enterEditMode, gotoDashboards,
  openOrCreateDashboard, readWidget, saveDashboard, selectDashboard, type WidgetReading,
  fillChartWidget, cancelBuilder, removeDashboard, isEditing, openOrgContextRecord,
} from 'docubot';
import { labSeed, shouldRunStep } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
const ALERT_RE = /Agent Lab - beaconing/i;
// Mask only truly sensitive values (the lab URL is caught by the scrub backstop).
// On-screen dates are legitimate content, so the scan skips date-or-time; it still
// refuses a real lab IP, hostname, key or sensitive term.
const SKIP = { scrubSkip: ['date-or-time'] };
// The alert record page shows record/correlation UUIDs, which the backstop reads as
// key-like tokens. They are not secrets and the user wants them left visible, and an
// alert record never renders a real API key, so this one shot also skips that
// category. The lab-URL guards (ip-address, url-or-hostname, sensitive-term) stay on.
const SKIP_RECORD = { scrubSkip: ['date-or-time', 'key-like-token'] };

test('chapter 3 - investigation', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  // CONFIGURE: seed the demo alerts (incl. "Agent Lab - beaconing from
  // web-server-01", this chapter's subject) when asked. Idempotent.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => { labSeed('seed'); });
  // Skip the whole test (and its paid run) when --only selects none of its steps.
  if (!['fsa03-01-investigation-tab', 'fsa03-02-hypotheses', 'fsa03-03-alert-ai-fields', 'fsa03-04-trace-steps'].some(shouldRunStep)) return;
  const soar = await gui('soar');

  // Reruns (and chapter 10) leave same-named copies; the seeded one is the oldest.
  const alert = await findAlert(soar, ALERT_RE, { search: 'Agent Lab - beaconing', oldest: true });
  expect(alert, 'stage the chapter 3 lab alert first: tools/lab_setup.py seed').toBeTruthy();
  await openRecord(soar, 'alerts', alert!.id, { tab: null });
  await selectDetailTab(soar, 'AI Investigation');

  // The one paid run for the chapter. Every capture below reuses its result.
  let inv = await readInvestigation(soar);
  if (inv.state !== 'done') {
    if (!SPEND) {
      console.log(`[ch03] investigation is "${inv.state}" on the lab alert; set SPEND_AI=1 to run/finish one`);
      test.skip(true, 'no finished investigation and SPEND_AI is not set');
    }
    // not-run: start it and wait. running: a prior session's run is still
    // in flight (no Begin button, no verdict yet) - just wait it out.
    inv = inv.state === 'not-run'
      ? await runInvestigation(soar, { wait: true })
      : await waitForInvestigation(soar);
  }
  expect(inv.state, 'the investigation must reach a verdict before it is captured').toBe('done');
  expect(inv.hypotheses.length, 'a finished investigation lists hypotheses').toBeGreaterThan(0);

  if (shouldRunStep('fsa03-01-investigation-tab')) await test.step('fsa03-01-investigation-tab', async () => {
    await soar.waitForTimeout(2000);
    await capture.shot(soar, 'fsa03-01-investigation-tab', {
      highlight: soar.locator('#view-panel-content li.uib-tab', { hasText: 'AI Investigation' }),
      ...SKIP,
    });
  });

  if (shouldRunStep('fsa03-02-hypotheses')) await test.step('fsa03-02-hypotheses', async () => {
    await expect(soar.locator('#view-panel-content svg:has(g#Hypo_1)')).toBeVisible();
    await capture.shot(soar, 'fsa03-02-hypotheses', {
      target: soar.locator('#view-panel-content svg:has(g#Hypo_1)'),
      ...SKIP,
    });
  });

  if (shouldRunStep('fsa03-03-alert-ai-fields')) await test.step('fsa03-03-alert-ai-fields', async () => {
    // Reload the page: right after a run finishes, the open page still holds the
    // pre-run record, so the AI Investigation Overview section is not drawn yet.
    // (openRecord to the record already on screen is an in-app no-op that leaves the
    // panel blank, so this has to be a real browser reload.)
    await soar.reload({ waitUntil: 'domcontentloaded' });
    await waitForRecordSettled(soar, { timeoutMs: 90_000 });
    await selectDetailTab(soar, 'Alert Details');
    // Effect, not card: the record itself carries the AI fields the card shows.
    await expect(soar.locator('#view-panel-content').getByText('AI Investigation Overview', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa03-03-alert-ai-fields', SKIP_RECORD);
  });

  if (shouldRunStep('fsa03-04-trace-steps')) await test.step('fsa03-04-trace-steps', async () => {
    // The trace view ships in 8.0.1 (absent on 8.0.0). The Traces node in the
    // swarm graph opens the Trace Flow panel.
    await selectDetailTab(soar, 'AI Investigation');
    // openTracePanel waits for the Traces node (the graph draws after the tab
    // opens) and throws when it never appears, i.e. a pre-8.0.1 box.
    const steps = await openTracePanel(soar, { timeout: 60_000 });
    expect(steps.length, 'the trace panel lists steps').toBeGreaterThan(0);
    await expect(soar.getByText('Alert Investigation', { exact: true }).first()).toBeVisible();
    await soar.waitForTimeout(2000);
    await capture.shot(soar, 'fsa03-04-trace-steps', SKIP);
  });
});

// One paid insight run feeds both insight captures. The template fills the intent,
// chain of thought and plan without spending; only Execute spends. The insight is
// never saved, so nothing is left on the box.
test('chapter 3 - ai insights', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  const soar = await gui('soar');

  await goToModuleList(soar, 'alerts');
  // Title and Schedule are required; Execute stays disabled until the form is valid.
  const modal = await openInsightBuilder(soar, {
    template: /High Risk Active Alerts/,
    planAnchor: 'Retrieve Active Alerts',
    role: 'SOC Manager',
    title: 'Workshop high risk alerts',
    schedule: 'Weekly',
    // The page's own example question, so the generated plan matches the text.
    intent: 'Which active alerts have the highest risk score, and which of them have no assigned owner?',
  });

  if (shouldRunStep('fsa03-05-insight-plan')) await test.step('fsa03-05-insight-plan', async () => {
    await capture.shot(soar, 'fsa03-05-insight-plan', { target: modal, ...SKIP });
  });

  // fsa03-10 generates the chain of thought and plan (LLM calls, so SPEND_AI=1).
  // fsa03-06 then executes that same plan instead of generating a second one.
  let planReady = false;
  if (shouldRunStep('fsa03-10-read-plan')) await test.step('fsa03-10-read-plan', async () => {
    if (!SPEND) {
      skipStep('fsa03-10-read-plan', 'generating the chain of thought and plan spends FortiAI tokens; set SPEND_AI=1');
      return;
    }
    await generateInsight(soar, modal);
    planReady = true;
    await capture.shot(soar, 'fsa03-10-read-plan', { target: modal, ...SKIP });
  });

  if (shouldRunStep('fsa03-06-insight-card')) await test.step('fsa03-06-insight-card', async () => {
    if (!SPEND) {
      skipStep('fsa03-06-insight-card', 'Execute spends FortiAI tokens; set SPEND_AI=1');
      return;
    }
    if (planReady) await executeGenerated(soar, modal);
    else await executeInsight(soar, modal);
    await capture.shot(soar, 'fsa03-06-insight-card', { target: modal, ...SKIP });
  });
});

/** SPENDS FortiAI tokens: generate the chain of thought, then the plan. Execute enables once both exist. */
async function generateInsight(page: Page, modal: Locator): Promise<void> {
  await modal.getByRole('button', { name: 'Generate Chain of Thoughts' }).click();
  await waitEnabled(page, modal.locator('#generatePlan'), 3 * 60 * 1000, 'Generate Plan');
  await modal.locator('#generatePlan').click();
  await waitEnabled(page, modal.locator('#executeButton'), 3 * 60 * 1000, 'Execute');
}

/** Execute an insight whose chain of thought and plan are already generated. SPENDS FortiAI tokens. */
async function executeGenerated(page: Page, modal: Locator): Promise<void> {
  await modal.locator('#executeButton').click({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await waitEnabled(page, modal.locator('#executeButton'), 5 * 60 * 1000, 'Execute (after run)');
  await modal.getByText(/Summary/).first().waitFor({ timeout: 2 * 60 * 1000 });
  await page.waitForTimeout(3000);
}

async function waitEnabled(page: Page, loc: Locator, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await loc.isEnabled().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`AI Insight: ${what} never enabled`);
    await page.waitForTimeout(1000);
  }
}

// Chapter 3 alerts for the benign verdict and the source-data SOP check. They are
// seeded by tools/lab_setup.py investigation-alerts (kept out of the chapter 2 demo
// set). Each run below spends FortiAI tokens only with SPEND_AI=1; otherwise it
// captures a run that already finished and skips the rest.
const BENIGN_RE = /nightly backup push to backup-01/i;
const SOURCE_RE = /C2 callback from dev-laptop-12/i;
const NO_SOURCE_RE = /C2 callback from dev-laptop-13/i;

/** The GUI device's base URL, read from the page's own origin. */
async function gui_base(soar: Page): Promise<string> {
  return soar.evaluate(() => location.href);
}

/** Open a chapter 3 alert's AI Investigation tab and leave a finished run on it. */
async function finishedRun(soar: Page, re: RegExp, search: string, label: string): Promise<void> {
  const alert = await findAlert(soar, re, { search, oldest: true });
  expect(alert, `stage the chapter 3 alerts first: tools/lab_setup.py investigation-alerts (${label})`).toBeTruthy();
  // A fresh load of the record's own URL, so the previous record's panel cannot
  // leave this one unsettled. The alert page is read from the same origin as the GUI.
  const origin = new URL(soar.url() || (await gui_base(soar))).origin;
  await soar.goto(`${origin}/modules/view-panel/alerts/${alert!.id}`, { waitUntil: 'domcontentloaded' });
  await soar.waitForTimeout(6000);
  await waitForRecordSettled(soar, { timeoutMs: 90_000 });
  await selectDetailTab(soar, 'AI Investigation');
  const inv = await readInvestigation(soar);
  if (inv.state === 'done') return;
  if (!SPEND) {
    console.log(`[ch03] ${label}: investigation is "${inv.state}"; set SPEND_AI=1 to run one`);
    test.skip(true, 'no finished investigation and SPEND_AI is not set');
  }
  const run = inv.state === 'not-run'
    ? await runInvestigation(soar, { wait: true })
    : await waitForInvestigation(soar);
  expect(run.state, `${label}: the investigation must reach a verdict`).toBe('done');
}

test('chapter 3 - benign verdict', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => { labSeed('investigation-alerts'); });
  if (!['fsa03-08a-approved-backup-record', 'fsa03-08-benign-rerun', 'fsa03-08b-approved-rerun'].some(shouldRunStep)) return;
  const soar = await gui('soar');

  // Page 01 s5.1 steps 1-3: fill the approved-backup record (lab_setup approved-backup,
  // the same content the page tells the reader to paste) and show it. Not cleared.
  if (shouldRunStep('fsa03-08a-approved-backup-record')) await test.step('fsa03-08a-approved-backup-record', async () => {
    labSeed('approved-backup');
    const origin = new URL(soar.url()).origin;
    const id = await openOrgContextRecord(soar, origin, 'Approved Backup System', 'Organization Context - Approved Backup System');
    expect(id, 'the Approved Backup System record opens').toBeTruthy();
    // Checked before the capture: the record holds the filled text, not the placeholder.
    await expect.poll(async () => soar.evaluate(() => document.body.innerText + Array.from(document.querySelectorAll('textarea')).map((t) => t.value).join('\n')),
      { timeout: 30_000 }).toMatch(/CHG-2041/);
    const body = await soar.evaluate(() => document.body.innerText + Array.from(document.querySelectorAll('textarea')).map((t) => t.value).join('\n'));
    expect(body, 'the record names the approved backup system').toMatch(/Agent Lab nightly backup/);
    expect(body, 'the placeholder is gone').not.toMatch(/No Information Available/);
    await soar.waitForTimeout(1500);
    await capture.shot(soar, 'fsa03-08a-approved-backup-record', SKIP);
  });
  if (!['fsa03-08-benign-rerun', 'fsa03-08b-approved-rerun'].some(shouldRunStep)) return;

  // Open the finished run either way; the 08b re-run starts from it.
  await test.step('configure: open the benign alert', async () => {
    await finishedRun(soar, BENIGN_RE, 'nightly backup push', 'benign alert');
    await soar.waitForTimeout(2000);
  });
  if (shouldRunStep('fsa03-08-benign-rerun')) {
    await test.step('fsa03-08-benign-rerun', async () => {
      await capture.shot(soar, 'fsa03-08-benign-rerun', SKIP);
    });
  }

  // The same alert again, after the approved-backup record is filled in. The
  // before verdict is read first so the comparison is in the log either way.
  if (!shouldRunStep('fsa03-08b-approved-rerun')) return;
  await test.step('fsa03-08b-approved-rerun', async () => {
    const before = (await readInvestigation(soar)).verdict;
    labSeed('approved-backup');
    if (!SPEND) test.skip(true, 'SPEND_AI is not set');
    const after = await reinvestigate(soar);
    expect(after.state, 'the re-run must reach a verdict').toBe('done');
    console.log(`[ch03] benign alert: before=${before} after=${after.verdict}`);
    await soar.waitForTimeout(2000);
    await capture.shot(soar, 'fsa03-08b-approved-rerun', SKIP);
  });
});

/**
 * Read a finished run's Key Findings as text. The verdict panel is open after
 * finishedRun, so this only switches its tab. The lines are what the investigation
 * found, so a source-data IOC shows up here (and a bare alert does not).
 */
async function keyFindings(soar: Page): Promise<string> {
  return (await readVerdictTab(soar, 'Key Findings')).join('\n');
}

test('chapter 3 - source data check', async ({ gui, capture }) => {
  test.setTimeout(45 * 60 * 1000);
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => { labSeed('investigation-alerts'); });
  if (!shouldRunStep('fsa03-09-sourcedata-check')) return;
  const soar = await gui('soar');

  // Same alert type, two alerts. Source JSON adds IOCs the bare alert does not have:
  // the with-source run names updater.exe and its destination; the bare run does not.
  // The expectations run before each capture, so a failed check writes no PNG.
  await test.step('fsa03-09-sourcedata-check', async () => {
    await finishedRun(soar, SOURCE_RE, 'dev-laptop-12', 'alert with source data');
    const withSource = await keyFindings(soar);
    expect(withSource, 'with source data, the findings name the source-data IOC updater.exe').toMatch(/updater\.exe/);
    await soar.waitForTimeout(1500);
    await capture.shot(soar, 'fsa03-09-sourcedata-check', SKIP);

    await finishedRun(soar, NO_SOURCE_RE, 'dev-laptop-13', 'alert without source data');
    const bare = await keyFindings(soar);
    expect(bare, 'without source data, the findings do not name updater.exe').not.toMatch(/updater\.exe/);
    await soar.waitForTimeout(1500);
    await capture.shot(soar, 'fsa03-09-sourcedata-check-b', SKIP);
  });
});

// Page 01 s3: drill into one hypothesis, then one of its questions, so the shot
// shows which agent answered it and with what evidence. Reuses the finished
// source-data run, so it spends nothing.
test('chapter 3 - hypothesis question', async ({ gui, capture }) => {
  test.setTimeout(5 * 60 * 1000);
  const want = ['fsa03-12-hypothesis-question', 'fsa03-13-question-trace'].filter(shouldRunStep);
  if (!want.length) return;
  const soar = await gui('soar');
  await finishedRun(soar, SOURCE_RE, 'dev-laptop-12', 'alert with source data');
  const { question, panel } = await openHypothesisQuestion(soar, 1, 1);

  if (shouldRunStep('fsa03-12-hypothesis-question')) await test.step('fsa03-12-hypothesis-question', async () => {
    expect(question.length, 'hypothesis #1 has at least one investigation question').toBeGreaterThan(10);
    expect(panel, 'the answer panel names the agent that answered').toMatch(/Provider|Agent/);
    const agentName = soar.locator('.questions-details-block').getByText(panel).filter({ visible: true }).first();
    await soar.waitForTimeout(1000);
    await capture.shot(soar, 'fsa03-12-hypothesis-question', { highlight: agentName, ...SKIP });
  });

  // 8.0.1: each question has its own trace (the answering agent's steps and tokens).
  if (shouldRunStep('fsa03-13-question-trace')) await test.step('fsa03-13-question-trace', async () => {
    const tr = await openQuestionTrace(soar);
    expect(tr.steps, 'the question trace has steps').toBeGreaterThan(0);
    await expect(soar.getByText(`${panel} Trace Flow`).first(), 'the trace is the answering agent\'s own').toBeVisible();
    await soar.waitForTimeout(1000);
    await capture.shot(soar, 'fsa03-13-question-trace', SKIP);
  });
});

// Page 03 s2: the chart widget builder, filled and shot BEFORE Save. The shot goes
// on a throwaway dashboard, so the chapter 3 dashboard ("Workshop Verdicts") is never
// opened here. Nothing is saved: the builder is cancelled, the scratch edits are
// reverted, and the scratch dashboard is removed.
const SCRATCH_DASHBOARD = 'Widget Builder Shot';
test('chapter 3 - widget builder chart', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa03-07b-widget-builder-chart')) return;
  const soar = await gui('soar');

  await test.step('fsa03-07b-widget-builder-chart', async () => {
    await openOrCreateDashboard(soar, SCRATCH_DASHBOARD);
    try {
      await enterEditMode(soar);
      await addRow(soar, 1);
      const modal = await fillChartWidget(soar, {
        title: SEVERITY, dataSource: 'Alerts', chartType: 'Bar', categories: 'Severity', values: 'AI Verdict',
        view: 'Chart & Table', assignedTo: 'All', filters: [LAB_FILTER],
      });
      // Checked before the capture: the builder holds what the page says to set.
      const picked = (sel: string) => modal.locator(`${sel} option:checked`).first().textContent().then((t) => (t ?? '').trim());
      expect(await modal.locator('input#title').first().inputValue(), 'the widget is titled Verdict by severity').toBe(SEVERITY);
      expect(await picked('select#firstGrouping'), 'Categories is Severity').toBe('Severity');
      expect(await picked('select#secondGrouping'), 'Values is AI Verdict').toBe('AI Verdict');
      expect(await picked('select#chart'), 'the chart type is Bar').toBe('Bar');
      expect(await picked('select#assignedToSetting'), 'Record Assignment is All').toBe('All');
      await soar.waitForTimeout(1000);
      await capture.shot(soar, 'fsa03-07b-widget-builder-chart', { target: modal, ...SKIP });
      await cancelBuilder(soar);
    } finally {
      // Discard the scratch edits, then remove the scratch dashboard. Nothing was saved.
      if (await isEditing(soar)) await soar.locator('#revert-view-template').first().click().catch(() => undefined);
      await removeDashboard(soar, SCRATCH_DASHBOARD).catch(() => false);
    }
  });
});

// --- Verdict dashboard (page 03, sections 2 and 3) --------------------------
// fsa03-07 builds "Workshop Verdicts" in the widget builder. A rerun opens the
// existing dashboard and adds only the widgets that are missing. fsa03-11 reads
// the widgets back as data, queries the lab alerts over the API, and expects the
// two to agree before it captures. Scope: alerts named "Agent Lab - ...".
const DASHBOARD = 'Workshop Verdicts';
const LAB_PREFIX = 'Agent Lab - ';
const LAB_FILTER = { field: 'Name', operator: 'Contains', value: LAB_PREFIX };
// The verdict values the page's third stage counts (anything but "Not Investigated").
const REAL_VERDICTS = ['Benign', 'Suspicious', 'Malicious', 'Inconclusive'];
const SEVERITY = 'Verdict by severity';
const VERDICT_TYPES = 'Verdict types';
const FUNNEL = ['Investigation funnel: new', 'Investigation funnel: investigated', 'Investigation funnel: verdict'];

/** The picklist text of an API field (an object with itemValue, or a plain value). */
function picklist(x: unknown): string {
  if (x && typeof x === 'object') return String((x as { itemValue?: unknown; display?: unknown }).itemValue ?? (x as { display?: unknown }).display ?? '');
  return x == null ? '' : String(x);
}

/** A widget's reading, once it has rendered its rows or cards (or the timeout passes). */
async function settledReading(page: Page, title: string, timeoutMs = 60_000): Promise<WidgetReading> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await readWidget(page, title);
      const filled = r.kind === 'table' ? r.rows.length > 0 : r.cards.length > 0;
      if (filled || Date.now() > deadline) return r;
    } catch (err) {
      if (Date.now() > deadline) throw err;
    }
    await page.waitForTimeout(1000);
  }
}

/** The widget's root block on the dashboard (its title sits inside it). */
function widgetRoot(page: Page, title: string): Locator {
  // The nearest widget block around the title; an outer block also holds the other widgets.
  return page.locator('h5', { hasText: title }).first().locator('xpath=ancestor::*[contains(@class,"widget-placement")][1]');
}

/** The lab alerts as the API returns them. */
async function labAlerts(page: Page): Promise<Array<Record<string, unknown>>> {
  const body = await apiViaApp<{ 'hydra:member': Array<Record<string, unknown>> }>(page, 'GET', '/api/3/alerts?$limit=1000');
  return body['hydra:member'].filter((a) => String(a.name ?? '').startsWith(LAB_PREFIX));
}

test('chapter 3 - verdict dashboard', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  if (!shouldRunStep('fsa03-07-verdict-dashboard')) return;
  const soar = await gui('soar');

  await test.step('fsa03-07-verdict-dashboard', async () => {
    await openOrCreateDashboard(soar, DASHBOARD);
    await enterEditMode(soar);
    const has = (t: string) => soar.evaluate((x) => document.body.innerText.includes(x), t);
    if (!(await has(SEVERITY))) {
      await addRow(soar, 1);
      await addChartWidget(soar, {
        title: SEVERITY, dataSource: 'Alerts', chartType: 'Bar', categories: 'Severity', values: 'AI Verdict',
        view: 'Chart & Table', assignedTo: 'All', filters: [LAB_FILTER],
      });
    }
    if (!(await has(VERDICT_TYPES))) {
      await addRow(soar, 1);
      await addChartWidget(soar, {
        title: VERDICT_TYPES, dataSource: 'Alerts', chartType: 'Bar', categories: 'AI Verdict',
        view: 'Table Only', assignedTo: 'All', filters: [LAB_FILTER],
      });
    }
    if (!(await has(FUNNEL[0]))) {
      await addRow(soar, 3);
      await addCardCountWidget(soar, { title: FUNNEL[0], dataSource: 'Alerts', groupBy: 'Status', filters: [LAB_FILTER, { field: 'Status', operator: 'Equals', value: 'Open' }] });
      await addCardCountWidget(soar, { title: FUNNEL[1], dataSource: 'Alerts', groupBy: 'AI Verdict', filters: [LAB_FILTER, { field: 'AI Verdict', operator: 'Not Equals', value: 'Not Investigated' }] });
      await addCardCountWidget(soar, { title: FUNNEL[2], dataSource: 'Alerts', groupBy: 'AI Verdict', filters: [LAB_FILTER, { field: 'AI Verdict', operator: 'Is In List', value: REAL_VERDICTS }] });
    }
    await saveDashboard(soar);
    // Expectations before the capture: all five widgets render their data.
    for (const t of [SEVERITY, VERDICT_TYPES, ...FUNNEL]) {
      const r = await settledReading(soar, t);
      expect(r.kind === 'table' ? r.rows.length : r.cards.length, `${t} renders data`).toBeGreaterThan(0);
    }
    await soar.setViewportSize({ width: 1500, height: 1500 });
    await soar.waitForTimeout(1500);
    try {
      await capture.shot(soar, 'fsa03-07-verdict-dashboard', {
        highlight: [SEVERITY, VERDICT_TYPES, ...FUNNEL].map((t) => soar.locator('h5', { hasText: t }).first()),
        highlightFit: 'text',
        ...SKIP,
      });
    } finally {
      await soar.setViewportSize({ width: 1500, height: 1100 });
    }
  });
});

test('chapter 3 - verify counts', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa03-11-verify-counts')) return;
  const soar = await gui('soar');

  await test.step('fsa03-11-verify-counts', async () => {
    // Open the dashboard that fsa03-07 built; a missing one fails here, it is not rebuilt.
    await gotoDashboards(soar);
    await selectDashboard(soar, DASHBOARD);
    const alerts = await labAlerts(soar);
    expect(alerts.length, 'the lab alerts are seeded (tools/lab_setup.py seed)').toBeGreaterThan(0);
    const verdictOf = (a: Record<string, unknown>) => picklist(a.aIVerdict);
    const severityOf = (a: Record<string, unknown>) => picklist(a.severity);
    const statusOf = (a: Record<string, unknown>) => picklist(a.status);
    const apiVerdicts = [...new Set(alerts.map(verdictOf))].sort();

    // Verdict by severity: columns are the verdicts, rows the severities.
    const sev = await settledReading(soar, SEVERITY);
    expect(sev.kind, 'verdict by severity is a table').toBe('table');
    const sevRows = (sev as { rows: string[][] }).rows;
    const sevHeader = sevRows.find((r) => r[0] === 'Severity') ?? [];
    const columns = sevHeader.slice(1).filter(Boolean);
    expect([...columns].sort(), 'the severity chart has a column per verdict on the box').toEqual(apiVerdicts);
    const shown: Record<string, Record<string, number>> = {};
    for (const r of sevRows) {
      if (!r[0] || r[0] === 'Severity' || r.length !== columns.length + 1) continue;
      shown[r[0]] = Object.fromEntries(columns.map((c, i) => [c, Number(r[i + 1])]));
    }
    const expectedSev: Record<string, Record<string, number>> = {};
    for (const s of new Set([...Object.keys(shown), ...alerts.map(severityOf)])) {
      expectedSev[s] = Object.fromEntries(columns.map((c) => [c, alerts.filter((a) => severityOf(a) === s && verdictOf(a) === c).length]));
    }
    expect(shown, 'verdict by severity matches the alert records').toEqual(expectedSev);

    // Verdict types: one row per verdict value.
    const types = await settledReading(soar, VERDICT_TYPES);
    expect(types.kind, 'verdict types is a table').toBe('table');
    const typeRows = (types as { rows: string[][] }).rows.filter((r) => r.length === 2 && r[0] && r[0] !== 'AI Verdict');
    const shownTypes = Object.fromEntries(typeRows.map((r) => [r[0], Number(r[1])]));
    const expectedTypes = Object.fromEntries(apiVerdicts.map((v) => [v, alerts.filter((a) => verdictOf(a) === v).length]));
    expect(shownTypes, 'verdict types matches the alert records').toEqual(expectedTypes);

    // Funnel: each card is one stage. New = Open; investigated = any verdict but
    // "Not Investigated"; verdict = one of the real verdict values.
    const newCards = await settledReading(soar, FUNNEL[0]) as { kind: 'cards'; cards: Array<{ label: string; value: number }> };
    const invCards = await settledReading(soar, FUNNEL[1]) as { kind: 'cards'; cards: Array<{ label: string; value: number }> };
    const verdictCards = await settledReading(soar, FUNNEL[2]) as { kind: 'cards'; cards: Array<{ label: string; value: number }> };
    const groupCards = (xs: Array<Record<string, unknown>>, label: (a: Record<string, unknown>) => string) => {
      const m: Record<string, number> = {};
      for (const a of xs) m[label(a)] = (m[label(a)] ?? 0) + 1;
      return Object.keys(m).length ? m : { NONE: 0 };
    };
    const cardMap = (cs: Array<{ label: string; value: number }>) => Object.fromEntries(cs.map((c) => [c.label, c.value]));
    const openAlerts = alerts.filter((a) => statusOf(a) === 'Open');
    const investigated = alerts.filter((a) => verdictOf(a) !== 'Not Investigated');
    const withVerdict = alerts.filter((a) => REAL_VERDICTS.includes(verdictOf(a)));
    expect(cardMap(newCards.cards), 'funnel "new" matches the open lab alerts').toEqual(groupCards(openAlerts, statusOf));
    expect(cardMap(invCards.cards), 'funnel "investigated" matches the alert records').toEqual(groupCards(investigated, verdictOf));
    expect(cardMap(verdictCards.cards), 'funnel "verdict" matches the alert records').toEqual(groupCards(withVerdict, verdictOf));
    const newTotal = newCards.cards.reduce((n, c) => n + c.value, 0);
    const invTotal = invCards.cards.reduce((n, c) => n + c.value, 0);
    const verdictTotal = verdictCards.cards.reduce((n, c) => n + c.value, 0);
    expect(newTotal, 'the funnel starts with every seeded alert that is open').toBe(openAlerts.length);
    expect(invTotal, 'investigated never exceeds new').toBeLessThanOrEqual(newTotal);
    expect(verdictTotal, 'with-verdict never exceeds investigated').toBeLessThanOrEqual(invTotal);
    console.log(`[ch03] verified ${alerts.length} lab alerts: funnel ${newTotal} > ${invTotal} > ${verdictTotal}`);

    // Only now capture. The highlights are the counts that were just checked.
    const cellCount = (t: string, n: number) => widgetRoot(soar, t).locator('td').filter({ hasText: new RegExp(`^${n}$`) });
    const highCount = alerts.filter((a) => severityOf(a) === 'High').length;
    await soar.setViewportSize({ width: 1500, height: 1500 });
    await soar.waitForTimeout(1500);
    try {
      await capture.shot(soar, 'fsa03-11-verify-counts', {
        highlight: [
          cellCount(SEVERITY, highCount).first(),
          cellCount(VERDICT_TYPES, expectedTypes[apiVerdicts[0]] ?? 0).first(),
          widgetRoot(soar, FUNNEL[0]).getByText(String(newTotal), { exact: true }).first(),
        ],
        highlightFit: 'text',
        ...SKIP,
      });
    } finally {
      await soar.setViewportSize({ width: 1500, height: 1100 });
    }
  });
});
