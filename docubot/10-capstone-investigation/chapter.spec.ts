// Chapter 10 - capstone investigation: stage an alert, have the agent investigate
// it, and prove the findings were written BACK to the alert.
//
// Spend gate: both agent turns spend model credits. They run only with
// SPEND_AI=1. Without it the spec stays useful: the alert is seeded through the
// toolkit (free) and the write-back effect-check runs against whatever
// investigation already finished on the box, so the always-on proof is the
// record itself, never a card. Skipped captures log a line, never a fake pass.
//
// Needs the ch07 module (agentlab_assets) and ch08 playbook ("Tag Agent Lab
// Alerts") on the box. Ported from tools/e2e/10-capstone-investigation.spec.js.
// Verify live with `docubot run --chapter 10-capstone-investigation`.
import { expect, findAlert, test } from 'docubot';
import { promptFor, shouldRunStep, startAgent, agentTurn, toolkit, uiMask } from '../lib/agentlab';
import { openDetail } from '../lib/alertDetail';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
const ALERT_NAME = 'Agent Lab - beaconing from web-server-01';
const ALERT_RE = /Agent Lab - beaconing from web-server-01/i;
const CHAPTER = '10-capstone-investigation';
const PAGE = '01-capstone';

interface StagedAlert { name?: string; severity?: unknown; description?: string }

/** Every staged capstone alert, read back through the toolkit (not the card). */
function stagedAlerts(): StagedAlert[] {
  const out = toolkit('search_records', {
    module: 'alerts',
    term: 'Agent Lab - beaconing',
    fields: ['name', 'severity', 'description'],
    summary: false,
  });
  // The result envelope is not pinned: collect every object that looks like an alert.
  const found: StagedAlert[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.name === 'string' && /Agent Lab - beaconing/.test(v.name)) found.push(v);
      else Object.values(v).forEach(walk);
    }
  };
  walk(out);
  return found;
}

/** True once an alert description carries the agent's structured write-back. */
function hasFindings(a: StagedAlert): boolean {
  const text = String(a.description || '');
  return !/^Triaged automatically/.test(text) && /verdict/i.test(text) && /confidence/i.test(text);
}

test('chapter 10 - capstone investigation', async ({ gui, local, capture }) => {
  test.setTimeout(45 * 60 * 1000);

  if (shouldRunStep('fsa10-01-stage-alert')) await test.step('fsa10-01-stage-alert', async () => {
    const since = new Date().toISOString();
    if (SPEND) {
      // The page's own staging prompt, driven in a real agent TUI.
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, PAGE, 1));
      await capture.screen('fsa10-01-stage-alert', screen, { title: 'student@laptop: ~/agent-lab' });
    } else {
      console.log('[ch10] fsa10-01-stage-alert: seeding via the toolkit; the agent capture needs SPEND_AI=1');
      if (stagedAlerts().length === 0) {
        const created = toolkit('create_record', {
          module: 'alerts',
          data: {
            name: ALERT_NAME,
            severity: 'Critical',
            source: 'Agent Lab Workshop',
            description: 'Hourly HTTPS beacons from web-server-01 to 203.0.113.99 since 02:00 UTC.',
          },
        });
        expect(created.uuid || JSON.stringify(created)).toBeTruthy();
      }
    }
    // Effect-check: the alert exists, and the chapter 8 playbook picked it up.
    expect(stagedAlerts().length, 'the capstone alert was not staged').toBeGreaterThan(0);
    const run = toolkit('wait_for_playbook_run', { playbook: 'Tag Agent Lab Alerts', since, timeout: 120 });
    expect(JSON.stringify(run)).toContain('finished');
  });

  if (shouldRunStep('fsa10-02-investigate')) await test.step('fsa10-02-investigate', async () => {
    if (SPEND) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, PAGE, 2), {
        confirm: 'Yes, go ahead.',
        timeoutMs: 20 * 60 * 1000,
        quietMs: 8_000,
      });
      await capture.screen('fsa10-02-investigate', screen, { title: 'student@laptop: ~/agent-lab' });
    } else {
      console.log('[ch10] fsa10-02-investigate: agent run skipped (spends credits); set SPEND_AI=1');
    }

    // Always-on proof: the findings were written BACK to a capstone alert. This
    // proves the write-back is present, not that the verdict is right. The title
    // is not unique across reruns, so any staged alert carrying findings counts.
    const written = stagedAlerts().filter(hasFindings);
    expect(written.length, 'no capstone alert carries the agent findings; run with SPEND_AI=1').toBeGreaterThan(0);
    // The prompt says never close the alert: severity must still be a real value.
    expect(written.some((a) => a.severity != null)).toBe(true);

    // UI view of the write-back: the description on the alert detail panel.
    const soar = await gui('soar');
    const alert = await findAlert(soar, ALERT_RE, { search: 'Agent Lab - beaconing' });
    expect(alert, 'capstone alert not found in the UI').toBeTruthy();
    await openDetail(soar, new URL(soar.url()).origin, 'alerts', alert!.id);
    const findings = soar.locator('#view-panel-content').getByText(/verdict/i).first();
    await expect(findings).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa10-02-investigate-findings-on-alert', {
      highlight: findings,
      mask: uiMask(soar),
      scrub: false,
    });
  });

  // fsa10-03-native-compare is a manual step on the page (it needs the native
  // AI Investigation configured and spends credits), so the spec has no step.
});
