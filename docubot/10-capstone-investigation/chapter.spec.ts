// Chapter 10 - capstone investigation: stage an alert, have the agent investigate
// it, and prove the findings were written BACK to the alert.
//
// Spend gate: both agent turns spend model credits. They run only with
// SPEND_AI=1. Without it the spec stays useful: the alert is seeded through the
// toolkit (free) and the write-back effect-check runs against whatever
// investigation already finished on the box, so the always-on proof is the
// record itself, never a card. Skipped captures log a line, never a fake pass.
//
// Gates (all opt-in; a bare run is read-only and spends nothing):
//   DOCUBOT_SEED=1  CONFIGURE step: lab_setup.py seed (demo alerts) + org-context.
//                   The capstone alert itself is staged below (agent prompt under
//                   SPEND_AI, else the free toolkit), never by the seeder.
//   SPEND_AI=1      agent-TUI turns (stage prompt + investigation). PRIMARY capture.
//
// Needs the ch07 module (agentlab_assets) and ch08 playbook ("Tag Agent Lab
// Alerts") on the box. Ported from tools/e2e/10-capstone-investigation.spec.js.
// Verify live with `docubot run --chapter 10-capstone-investigation`.
import { expect, findAlert, openRecord, test } from 'docubot';
import { labSeed, promptFor, shouldRunStep, startAgent, agentTurn, toolkit, uiMask } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
const ALERT_NAME = 'Agent Lab - beaconing from web-server-01';
const ALERT_RE = /Agent Lab - beaconing from web-server-01/i;
const CHAPTER = '10-capstone-investigation';
const PAGE = '01-capstone';

interface StagedAlert { uuid?: string; name?: string; severity?: unknown; description?: string }

/** Every staged capstone alert, read back through the toolkit (not the card). */
function stagedAlerts(): StagedAlert[] {
  const out = toolkit('search_records', {
    module: 'alerts',
    term: 'Agent Lab - beaconing',
    fields: ['uuid', 'name', 'severity', 'description'],
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

  // CONFIGURE: repeatable seed (idempotent, create-if-absent) of the box state
  // this chapter reads. Investigation SOPs already ship on the box; demo alerts
  // give the correlation step (search for related alerts) something to find.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    labSeed('seed');         // demo alerts ("Agent Lab: ..."), incl. an outbound-beacon alert
    labSeed('org-context');  // TOOL_LIST routing record the investigation reads
  });

  if (shouldRunStep('fsa10-01-stage-alert')) await test.step('fsa10-01-stage-alert', async () => {
    const since = new Date().toISOString();
    let staged = SPEND;
    if (SPEND) {
      // The page's own staging prompt, driven in a real agent TUI.
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, PAGE, 1));
      await capture.screen('fsa10-01-stage-alert', screen, { title: 'student@laptop: ~/agent-lab' });
    } else {
      console.log('[ch10] fsa10-01-stage-alert: seeding via the toolkit; the agent capture needs SPEND_AI=1');
      if (stagedAlerts().length === 0) {
        staged = true;
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
    // Only a freshly staged alert triggers the ch08 playbook; a reused alert has
    // no new run to wait for, so that check is reported as not run.
    if (staged) {
      let run: any;
      try {
        run = toolkit('wait_for_playbook_run', { playbook: 'Tag Agent Lab Alerts', since, timeout: 120 });
      } catch (err) {
        throw new Error(`ch08 playbook "Tag Agent Lab Alerts" did not run (publish it first, chapter 8): ${err}`);
      }
      expect(JSON.stringify(run)).toContain('finished');
    } else {
      console.log('[ch10] fsa10-01-stage-alert: alert already staged; playbook-pickup check NOT run');
    }
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
    // The title is not unique across reruns, so open the exact alert the toolkit
    // read back with findings (live state); fall back to the grid search by name.
    const soar = await gui('soar');
    let alertId = written.find((a) => a.uuid)?.uuid;
    if (!alertId) {
      const alert = await findAlert(soar, ALERT_RE, { search: 'Agent Lab - beaconing' });
      expect(alert, 'capstone alert not found in the UI: stage it (fsa10-01) first').toBeTruthy();
      alertId = alert!.id;
    }
    await openRecord(soar, 'alerts', alertId!, { tab: null });
    const findings = soar.locator('#view-panel-content').getByText(/verdict/i).first();
    await expect(findings, 'findings not rendered on the alert: run fsa10-02 with SPEND_AI=1').toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa10-02-investigate-findings-on-alert', {
      highlight: findings,
      mask: uiMask(soar),
      scrub: false,
    });
  });

  // fsa10-03-native-compare is a manual step on the page (it needs the native
  // AI Investigation configured and spends credits), so the spec has no step.
});
