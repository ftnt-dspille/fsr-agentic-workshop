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
import {
  executeInsight, expect, findAlert, goToModuleList, openInsightBuilder, openRecord, openTracePanel,
  readInvestigation, runInvestigation, selectDetailTab, test, waitForInvestigation,
  skipStep,
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
  });

  if (shouldRunStep('fsa03-05-insight-plan')) await test.step('fsa03-05-insight-plan', async () => {
    await capture.shot(soar, 'fsa03-05-insight-plan', { target: modal, ...SKIP });
  });

  if (shouldRunStep('fsa03-06-insight-card')) await test.step('fsa03-06-insight-card', async () => {
    if (!SPEND) {
      skipStep('fsa03-06-insight-card', 'Execute spends FortiAI tokens; set SPEND_AI=1');
      return;
    }
    await executeInsight(soar, modal);
    await capture.shot(soar, 'fsa03-06-insight-card', { target: modal, ...SKIP });
  });
});
