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
import type { Page } from '@playwright/test';
import { expect, test, skipStep } from 'docubot';
import { executeInsight, findAlert, goToModuleList, openInsightBuilder, openTracePanel, openHypothesisQuestion, openQuestionTrace, readInvestigation, readVerdictTab, reinvestigate, selectDetailTab, waitForRecordSettled, addCardCountWidget, addChartWidget, addRow, enterEditMode, gotoDashboards, openOrCreateDashboard, saveDashboard, selectDashboard, type ChartWidgetSpec, type CardCountWidgetSpec, fillChartWidget, fillCardCountWidget, cancelBuilder, openOrgContextRecord, listRecords, readVerdictText, widgetTitles, finishedInvestigationOnAlert } from 'docubot/products/fortisoar';
import { pageVisibleText, discardDashboardEdits } from 'docubot/products/fortisoar';
import { timed, SCRUB } from 'docubot';
import { ensureInvestigation, executeGenerated, generateInsight, openAlertRecord, picklistText, settledReading, widgetRoot } from 'docubot/products/fortisoar';
import { labSeed } from 'docubot/products/fortisoar';
import { anyStepSelected, shouldRunStep } from 'docubot';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
const ALERT_RE = /Agent Lab - beaconing/i;
// Mask only truly sensitive values (the lab URL is caught by the scrub backstop).
// On-screen dates are legitimate content, so the scan skips date-or-time; it still
// refuses a real lab IP, hostname, key or sensitive term.
const SKIP = SCRUB.dates;

// Speed: start every chapter 3 investigation that has none at once (the box runs
// up to three in parallel), so each test below finds its run done or nearly done
// instead of starting it and waiting in turn. Only with SPEND_AI=1, and only when
// a selected step needs an investigation.
const NEEDS_RUN = [
  'fsa03-01-investigation-tab', 'fsa03-02-hypotheses', 'fsa03-02b-next-steps', 'fsa03-03-alert-ai-fields',
  'fsa03-04-trace-steps', 'fsa03-08-benign-rerun', 'fsa03-08b-approved-rerun', 'fsa03-09-sourcedata-check',
  'fsa03-12-hypothesis-question', 'fsa03-13-question-trace',
];
test.beforeAll(() => {
  if (SPEND && anyStepSelected(NEEDS_RUN)) labSeed('start-investigations');
});
// The alert record page shows record/correlation UUIDs, which the backstop reads as
// key-like tokens. They are not secrets and the user wants them left visible, and an
// alert record never renders a real API key, so this one shot also skips that
// category. The lab-URL guards (ip-address, url-or-hostname, sensitive-term) stay on.
const SKIP_RECORD = SCRUB.record;

test('chapter 3 - investigation', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  // CONFIGURE: seed the demo alerts (incl. "Agent Lab - beaconing from
  // web-server-01", this chapter's subject) when asked. Idempotent.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => { labSeed('seed'); });
  // Skip the whole test (and its paid run) when --only selects none of its steps.
  if (!anyStepSelected(['fsa03-01-investigation-tab', 'fsa03-02-hypotheses', 'fsa03-02b-next-steps', 'fsa03-03-alert-ai-fields', 'fsa03-04-trace-steps'])) return;
  const soar = await gui('soar');

  // Reruns (and chapter 10) leave same-named copies; the seeded one is the oldest.
  await openAlertRecord(soar, ALERT_RE, {
    search: 'Agent Lab - beaconing', oldest: true, tab: null, detailTab: 'AI Investigation',
    hint: 'stage the chapter 3 lab alert first: tools/lab_setup.py seed',
  });

  // The one paid run for the chapter. Every capture below reuses its result.
  // not-run: start it and wait. running: a prior session's run is still in flight - just wait it out.
  const found = await ensureInvestigation(soar, { spend: SPEND, label: 'investigation lab alert' });
  if (!found) test.skip(true, 'no finished investigation and SPEND_AI is not set');
  const inv = found!;
  expect(inv.state, 'the investigation must reach a verdict before it is captured').toBe('done');
  expect(inv.hypotheses.length, 'a finished investigation lists hypotheses').toBeGreaterThan(0);

  if (shouldRunStep('fsa03-01-investigation-tab')) await test.step('fsa03-01-investigation-tab', async () => {
    await capture.shot(soar, 'fsa03-01-investigation-tab', {
      highlight: soar.locator('#view-panel-content li.uib-tab', { hasText: 'AI Investigation' }),
      ...SKIP,
    });
  });

  // Section 3: the verdict panel beside the map. Next Steps is the run's advice to
  // the analyst; the page tells students to read all three tabs, Next Steps last.
  if (shouldRunStep('fsa03-02b-next-steps')) await test.step('fsa03-02b-next-steps', async () => {
    for (const tab of ['Highlights', 'Key Findings']) {
      const items = await readVerdictTab(soar, tab);
      console.log(`[ch03] ${tab}: ${items.length} item(s): ${items.slice(0, 3).join(' | ').slice(0, 300)}`);
    }
    const steps = await readVerdictTab(soar, 'Next Steps');
    console.log(`[ch03] Next Steps: ${steps.length} item(s): ${steps.join(' | ').slice(0, 600)}`);
    expect(steps.length, 'Next Steps lists at least one action').toBeGreaterThan(0);
    await capture.shot(soar, 'fsa03-02b-next-steps', {
      highlight: soar.locator('#view-panel-content .investigationSections li.uib-tab', { hasText: 'Next Steps' }),
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
    await capture.shot(soar, 'fsa03-04-trace-steps', SKIP);
  });
});

// One paid insight run feeds both insight captures. The template fills the intent,
// chain of thought and plan without spending; only Execute spends. The insight is
// never saved, so nothing is left on the box.
test('chapter 3 - ai insights', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (!anyStepSelected([
    'fsa03-05-insight-plan',
    'fsa03-06-insight-card',
    'fsa03-10-read-plan',
  ])) return;
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
    if (planReady) await executeGenerated(soar, modal, { runMs: 5 * 60 * 1000 });
    else await executeInsight(soar, modal);
    await capture.shot(soar, 'fsa03-06-insight-card', { target: modal, ...SKIP });
  });
});

// Chapter 3 alerts for the benign verdict and the source-data SOP check. They are
// seeded by tools/lab_setup.py investigation-alerts (kept out of the chapter 2 demo
// set). Each run below spends FortiAI tokens only with SPEND_AI=1; otherwise it
// captures a run that already finished and skips the rest.
const BENIGN_RE = /nightly backup push to backup-01/i;
const SOURCE_RE = /C2 callback from dev-laptop-12/i;
const NO_SOURCE_RE = /C2 callback from dev-laptop-13/i;

/** Open a chapter 3 alert's AI Investigation tab and leave a finished run on it. */
async function finishedRun(soar: Page, re: RegExp, search: string, label: string): Promise<void> {
  const run = await finishedInvestigationOnAlert(soar, re, {
    search,
    oldest: true,
    spend: SPEND,
    label: `investigation ${label}`,
    hint: `stage the chapter 3 alerts first: tools/lab_setup.py investigation-alerts (${label})`,
  });
  if (!run) test.skip(true, 'no finished investigation and SPEND_AI is not set');
  expect(run!.state, `${label}: the investigation must reach a verdict`).toBe('done');
}

/** An after-result cites the approved backup the record describes; a before-result cannot. */
const AFTER_RESULT = /CHG-2041|approved (scheduled )?backup/i;

// Page 01 s5.1, in page order: the verdict BEFORE the approved-backup record exists
// (08), the record filled (08a), the verdict AFTER (08b), then the record restored.
// Finished runs are reused whenever they show the right state; an investigation
// is started only when the state on the box cannot produce the shot.
test('chapter 3 - benign verdict', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => { labSeed('investigation-alerts'); });
  if (!anyStepSelected(['fsa03-08-benign-rerun', 'fsa03-08a-approved-backup-record', 'fsa03-08b-approved-rerun'])) return;
  const soar = await gui('soar');
  const alert = await findAlert(soar, BENIGN_RE, { search: 'nightly backup push', oldest: true });
  expect(alert, 'stage the chapter 3 alerts first: tools/lab_setup.py prepare').toBeTruthy();

  // 08: the "before" shot. Reuses the alert's finished run unless that run is an
  // after-result (it cites the approved backup); then it skips instead of spending.
  if (shouldRunStep('fsa03-08-benign-rerun')) await test.step('fsa03-08-benign-rerun', async () => {
    // A first run here must not see the approved record; 08a fills it next.
    labSeed('approved-backup', '--clear');
    await finishedRun(soar, BENIGN_RE, 'nightly backup push', 'benign alert');
    if (AFTER_RESULT.test(await readVerdictText(soar))) {
      skipStep('fsa03-08-benign-rerun', 'the alert holds the after-result; clear the record (lab_setup approved-backup --clear) and re-investigate to retake it');
      return;
    }
    await readVerdictTab(soar, 'Highlights');
    await capture.shot(soar, 'fsa03-08-benign-rerun', SKIP);
  });

  // 08a: fill the record (the text the page tells the reader to paste) and show it.
  if (shouldRunStep('fsa03-08a-approved-backup-record')) await test.step('fsa03-08a-approved-backup-record', async () => {
    labSeed('approved-backup');
    const id = await openOrgContextRecord(soar, 'Approved Backup System', 'Organization Context - Approved Backup System');
    expect(id, 'the Approved Backup System record opens').toBeTruthy();
    // Checked before the capture: the record holds the filled text, not the placeholder.
    await expect.poll(async () => pageVisibleText(soar), { timeout: 30_000 }).toMatch(/CHG-2041/);
    const body = await pageVisibleText(soar);
    expect(body, 'the record names the approved backup system').toMatch(/Agent Lab nightly backup/);
    expect(body, 'the placeholder is gone').not.toMatch(/No Information Available/);
    await capture.shot(soar, 'fsa03-08a-approved-backup-record', SKIP);
  });

  // 08b: the "after" shot. Reuse the alert's result when it was written after the
  // record was filled; otherwise Re-investigate once.
  if (shouldRunStep('fsa03-08b-approved-rerun')) await test.step('fsa03-08b-approved-rerun', async () => {
    labSeed('approved-backup');
    await finishedRun(soar, BENIGN_RE, 'nightly backup push', 'benign alert');
    const current = await readInvestigation(soar);
    if (current.state === 'done' && AFTER_RESULT.test(await readVerdictText(soar))) {
      console.log(`[ch03] benign alert: reusing the after-result (${current.verdict}); no new investigation`);
      // ensureInvestigation/readInvestigation record their own reuse timing.
    } else {
      if (!SPEND) test.skip(true, 'the alert has no after-result and SPEND_AI is not set');
      const after = await reinvestigate(soar);   // the driver records the run's timing
      expect(after.state, 'the re-run must reach a verdict').toBe('done');
      console.log(`[ch03] benign alert: before=${current.verdict} after=${after.verdict}`);
    }
    await readVerdictTab(soar, 'Highlights');
    await capture.shot(soar, 'fsa03-08b-approved-rerun', SKIP);
  });

  // The page tells students to restore the record when done. Every investigation on
  // the box reads it, so leaving it filled leaks backup context into later runs.
  if (shouldRunStep('fsa03-08b-approved-rerun')) labSeed('approved-backup', '--clear');
});

// The verdict text read-back is the kit's readVerdictText (Highlights + Key
// Findings + Next Steps, joined) — where a source-data IOC can surface.

/** The source-data IOCs (process and destination) that only the with-source alert carries. */
const SOURCE_IOC = /updater\.exe|203\.0\.113\.121/;

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
    const withSource = await readVerdictText(soar);
    expect(withSource, 'with source data, the verdict names updater.exe or 203.0.113.121').toMatch(SOURCE_IOC);
    await readVerdictTab(soar, 'Key Findings');
    await capture.shot(soar, 'fsa03-09-sourcedata-check', SKIP);

    await finishedRun(soar, NO_SOURCE_RE, 'dev-laptop-13', 'alert without source data');
    const bare = await readVerdictText(soar);
    expect(bare, 'without source data, the verdict names neither updater.exe nor 203.0.113.121').not.toMatch(SOURCE_IOC);
    await readVerdictTab(soar, 'Key Findings');
    await capture.shot(soar, 'fsa03-09-sourcedata-check-b', SKIP);
  });
});

// Page 01 s3: drill into one hypothesis, then one of its questions, so the shot
// shows which agent answered it and with what evidence. Reuses the finished
// source-data run, so it spends nothing.
test('chapter 3 - hypothesis question', async ({ gui, capture }) => {
  test.setTimeout(5 * 60 * 1000);
  const want = ['fsa03-12-hypothesis-question', 'fsa03-13-question-trace'].filter((id) => anyStepSelected([id]));
  if (!want.length) return;
  const soar = await gui('soar');
  await finishedRun(soar, SOURCE_RE, 'dev-laptop-12', 'alert with source data');
  const { question, panel } = await openHypothesisQuestion(soar, 1, 1);

  if (shouldRunStep('fsa03-12-hypothesis-question')) await test.step('fsa03-12-hypothesis-question', async () => {
    expect(question.length, 'hypothesis #1 has at least one investigation question').toBeGreaterThan(10);
    expect(panel, 'the answer panel names the agent that answered').toMatch(/Provider|Agent/);
    const agentName = soar.locator('.questions-details-block').getByText(panel).filter({ visible: true }).first();
    await capture.shot(soar, 'fsa03-12-hypothesis-question', { highlight: agentName, ...SKIP });
  });

  // 8.0.1: each question has its own trace (the answering agent's steps and tokens).
  if (shouldRunStep('fsa03-13-question-trace')) await test.step('fsa03-13-question-trace', async () => {
    const tr = await openQuestionTrace(soar);
    expect(tr.steps, 'the question trace has steps').toBeGreaterThan(0);
    await expect(soar.getByText(`${panel} Trace Flow`).first(), 'the trace is the answering agent\'s own').toBeVisible();
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
      const modal = await fillChartWidget(soar, SEVERITY_SPEC);
      // Checked before the capture: the builder holds what the page says to set.
      const picked = (sel: string) => modal.locator(`${sel} option:checked`).first().textContent().then((t) => (t ?? '').trim());
      expect(await modal.locator('input#title').first().inputValue(), 'the widget is titled Verdict by severity').toBe(SEVERITY);
      expect(await picked('select#firstGrouping'), 'Categories is Severity').toBe('Severity');
      expect(await picked('select#secondGrouping'), 'Values is AI Verdict').toBe('AI Verdict');
      expect(await picked('select#chart'), 'the chart type is Bar').toBe('Bar');
      expect(await picked('select#assignedToSetting'), 'Record Assignment is All').toBe('All');
      await capture.shot(soar, 'fsa03-07b-widget-builder-chart', { target: modal, ...SKIP });
      await cancelBuilder(soar);
    } finally {
      // Discard the scratch edits, then remove the scratch dashboard. Nothing was saved.
      await discardDashboardEdits(soar, SCRATCH_DASHBOARD);
    }
  });
});

// Page 03 s2, the first funnel card: the Card Count builder filled and shot BEFORE
// Save, on the same throwaway dashboard as fsa03-07b. Nothing is saved; the builder
// is cancelled and the scratch dashboard removed.
test('chapter 3 - funnel card config', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa03-07c-funnel-card-config')) return;
  const soar = await gui('soar');

  await test.step('fsa03-07c-funnel-card-config', async () => {
    await openOrCreateDashboard(soar, SCRATCH_DASHBOARD);
    try {
      await enterEditMode(soar);
      await addRow(soar, 3);
      const modal = await fillCardCountWidget(soar, FUNNEL_OPEN_SPEC);
      // Checked before the capture: the builder holds what the page says to set.
      expect(await modal.locator('input#title').first().inputValue(), 'the card is titled Investigation funnel: new').toBe(FUNNEL[0]);
      expect(await modal.locator('select#fieldName option:checked').first().textContent(), 'Group By is Status').toBe('Status');
      expect(await modal.locator('input#dayRange').first().inputValue(), 'Time Range is 365 days').toBe('365');
      expect(await modal.innerText(), 'the Status = Open condition shows').toMatch(/Status[\s\S]*Equals[\s\S]*Open/);
      await capture.shot(soar, 'fsa03-07c-funnel-card-config', { target: modal, ...SKIP });
      await cancelBuilder(soar);
    } finally {
      // Discard the scratch edits, then remove the scratch dashboard. Nothing was saved.
      await discardDashboardEdits(soar, SCRATCH_DASHBOARD);
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
// The two shared widget specs, verbatim: the builder flow FILLS them (fsa03-07b/07c)
// and the dashboard build ADDS them (fsa03-07) — one definition, both consumers.
const SEVERITY_SPEC: ChartWidgetSpec = { title: SEVERITY, dataSource: 'Alerts', chartType: 'Bar', categories: 'Severity', values: 'AI Verdict', view: 'Chart & Table', assignedTo: 'All', filters: [LAB_FILTER] };
const FUNNEL_OPEN_SPEC: CardCountWidgetSpec = { title: FUNNEL[0], dataSource: 'Alerts', groupBy: 'Status', filters: [LAB_FILTER, { field: 'Status', operator: 'Equals', value: 'Open' }] };

/** The lab alerts as the API returns them. */
async function labAlerts(page: Page): Promise<Array<Record<string, unknown>>> {
  return (await listRecords(page, 'alerts', '$limit=1000')).filter((a) => String(a.name ?? '').startsWith(LAB_PREFIX));
}

/** The two dashboard captures want a taller viewport; the session's default is 1500x1100. */
async function withTallViewport(page: Page, fn: () => Promise<void>): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1500 });
  try { await fn(); } finally { await page.setViewportSize({ width: 1500, height: 1100 }); }
}

test('chapter 3 - verdict dashboard', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  if (!shouldRunStep('fsa03-07-verdict-dashboard')) return;
  const soar = await gui('soar');

  await test.step('fsa03-07-verdict-dashboard', async () => {
    await openOrCreateDashboard(soar, DASHBOARD);
    await enterEditMode(soar);
    if (!(await widgetTitles(soar)).includes(SEVERITY)) {
      await addRow(soar, 1);
      await addChartWidget(soar, SEVERITY_SPEC);
    }
    if (!(await widgetTitles(soar)).includes(VERDICT_TYPES)) {
      await addRow(soar, 1);
      await addChartWidget(soar, {
        title: VERDICT_TYPES, dataSource: 'Alerts', chartType: 'Bar', categories: 'AI Verdict',
        view: 'Table Only', assignedTo: 'All', filters: [LAB_FILTER],
      });
    }
    if (!(await widgetTitles(soar)).includes(FUNNEL[0])) {
      await addRow(soar, 3);
      await addCardCountWidget(soar, FUNNEL_OPEN_SPEC);
      await addCardCountWidget(soar, { title: FUNNEL[1], dataSource: 'Alerts', groupBy: 'AI Verdict', filters: [LAB_FILTER, { field: 'AI Verdict', operator: 'Not Equals', value: 'Not Investigated' }] });
      await addCardCountWidget(soar, { title: FUNNEL[2], dataSource: 'Alerts', groupBy: 'AI Verdict', filters: [LAB_FILTER, { field: 'AI Verdict', operator: 'Is In List', value: REAL_VERDICTS }] });
    }
    await saveDashboard(soar);
    // Expectations before the capture: all five widgets render their data.
    for (const t of [SEVERITY, VERDICT_TYPES, ...FUNNEL]) {
      const r = await settledReading(soar, t);
      expect(r.kind === 'table' ? r.rows.length : r.cards.length, `${t} renders data`).toBeGreaterThan(0);
    }
    await withTallViewport(soar, async () => {
      await capture.shot(soar, 'fsa03-07-verdict-dashboard', {
        highlight: [SEVERITY, VERDICT_TYPES, ...FUNNEL].map((t) => soar.locator('h5', { hasText: t }).first()),
        highlightFit: 'text',
        ...SKIP,
      });
    });
  });
});

test('chapter 3 - verify counts', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  if (!shouldRunStep('fsa03-11-verify-counts')) return;
  const soar = await gui('soar');

  await test.step('fsa03-11-verify-counts', async () => {
    // Open the dashboard that fsa03-07 built; a missing one fails here, it is not rebuilt.
    await timed('open dashboards', () => gotoDashboards(soar));
    await timed(`select dashboard "${DASHBOARD}"`, () => selectDashboard(soar, DASHBOARD));
    const alerts = await timed('read lab alerts', () => labAlerts(soar));
    expect(alerts.length, 'the lab alerts are seeded (tools/lab_setup.py seed)').toBeGreaterThan(0);
    const verdictOf = (a: Record<string, unknown>) => picklistText(a.aIVerdict);
    const severityOf = (a: Record<string, unknown>) => picklistText(a.severity);
    const statusOf = (a: Record<string, unknown>) => picklistText(a.status);
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
    await withTallViewport(soar, async () => {
      await capture.shot(soar, 'fsa03-11-verify-counts', {
        highlight: [
          // The table splits each severity by verdict, so mark the High row label, not a total.
          widgetRoot(soar, SEVERITY).locator('td, th').filter({ hasText: /^High$/ }).first(),
          cellCount(VERDICT_TYPES, expectedTypes[apiVerdicts[0]] ?? 0).first(),
          widgetRoot(soar, FUNNEL[0]).getByText(String(newTotal), { exact: true }).first(),
        ],
        highlightFit: 'text',
        ...SKIP,
      });
    });
  });
});
