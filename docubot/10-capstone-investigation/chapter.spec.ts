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
import * as path from 'path';
import { AGENT_CWD, agentScreen, labSeed, promptFor, shouldRunStep, startAgent, agentTurn, toolkit } from '../lib/agentlab';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. The alert record shows dates and record
// UUIDs (read as key-like tokens but not secrets, and no real key renders on an
// alert record), so those categories are skipped for this shot.
const SKIP_RECORD = { scrubSkip: ['date-or-time', 'key-like-token'] };

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
    labSeed('seed');         // demo alerts ("Agent Lab - ..."), incl. an outbound-beacon alert
    labSeed('org-context');  // TOOL_LIST routing record the investigation reads
  });

  if (shouldRunStep('fsa10-01-stage-alert')) await test.step('fsa10-01-stage-alert', async () => {
    const since = new Date().toISOString();
    let staged = SPEND;
    if (SPEND) {
      // The page's premise is one alert with this name. The seeded demo set has a
      // same-named alert (and reruns leave staged copies); with two, the agent
      // stops to ask which to update. ch07's reset-alerts restores the demo copy.
      labSeed('delete-records', 'alerts', 'name', ALERT_NAME);
      // The page's own staging prompt, driven in a real agent TUI.
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, PAGE, 1));
      await capture.screen('fsa10-01-stage-alert', screen, agentScreen());
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
      await capture.screen('fsa10-02-investigate', screen, agentScreen());
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
    // Open the Alert Details tab, not whatever tab the record last showed: the
    // findings are written into the alert DESCRIPTION, and the AI Investigation
    // tab's empty-state promo also contains the word "verdict" (it would match
    // the locator and capture the wrong panel). On Alert Details the only
    // "verdict" on screen is the agent's write-back.
    await openRecord(soar, 'alerts', alertId!, { tab: 'Alert Details' });
    const findings = soar.locator('#view-panel-content').getByText(/verdict/i).first();
    await expect(findings, 'findings not rendered on the alert: run fsa10-02 with SPEND_AI=1').toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa10-02-investigate-findings-on-alert', {
      highlight: findings,
      ...SKIP_RECORD,
    });
  });

  // fsa10-03-native-compare is a manual step on the page (it needs the native
  // AI Investigation configured and spends credits), so the spec has no step.
});

// The Advanced Labs page: four agent-only labs, each one agent conversation
// captured in the TUI and backed by an effect check on the box (or, for the
// connector review, on the folder ch09 left in the agent's working dir).
// Every lab is an agent turn, so the whole block is behind SPEND_AI=1.
test('chapter 10 - advanced labs', async ({ local, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  test.skip(!SPEND, 'advanced labs are agent turns: set SPEND_AI=1');
  const PAGE = '03-advanced-labs';
  const run = async (n: number, confirm?: string) => {
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    return agentTurn(agent, promptFor('10-capstone-investigation', PAGE, n), { confirm, timeoutMs: 10 * 60 * 1000 });
  };

  if (shouldRunStep('fsa10-04-registered-mcp-tool')) await test.step('fsa10-04-registered-mcp-tool', async () => {
    // Precondition: chapter 5's registration. Fail as setup, not content.
    const listed = toolkit('list_registered_mcp_tools', { server: 'agentlab-deepwiki' });
    expect(listed.tools?.length, 'agentlab-deepwiki is not registered: run chapter 5 page 2 first').toBeGreaterThan(0);
    const screen = await run(1, 'Yes, go ahead and call it.');
    await capture.screen('fsa10-04-registered-mcp-tool', screen, agentScreen());
    // The answer must come from the registered server's own tool, not memory.
    expect(screen).toMatch(/ask_wiki_question/);
    expect(screen).toMatch(/SSE|Server-Sent/i);
    expect(screen).not.toMatch(/couldn't finish|failed|RuntimeError/i);
  });

  if (shouldRunStep('fsa10-05-repair-playbook')) await test.step('fsa10-05-repair-playbook', async () => {
    const screen = await run(2, 'Yes, go ahead.');
    await capture.screen('fsa10-05-repair-playbook', screen, agentScreen());
    // The fix must be repair_playbook's, not a hand edit the agent fell back to.
    expect(screen).toMatch(/repair_playbook/);
    expect(screen).not.toMatch(/by hand|manually|myself|no change made/i);
    // Effect: the practice playbook's newest run finished (the repair held).
    const last = toolkit('last_playbook_run', { playbook: 'Agent Lab Repair Practice' });
    expect(JSON.stringify(last)).toMatch(/finished/i);
  });

  if (shouldRunStep('fsa10-06-review-connector')) await test.step('fsa10-06-review-connector', async () => {
    const conndir = path.join(AGENT_CWD, 'agentlab-dadjoke');
    const screen = await run(3);
    await capture.screen('fsa10-06-review-connector', screen, agentScreen());
    expect(screen).toMatch(/verif/i);
    // Effect: the revert held, so the folder scans clean again.
    expect(toolkit('scan_connector_code', { directory: conndir }).clean).toBe(true);
  });

  if (shouldRunStep('fsa10-07-schedule-and-prove')) await test.step('fsa10-07-schedule-and-prove', async () => {
    // Start from no schedule so "it fired on its own" is this run's evidence.
    try {
      toolkit('delete_schedule', { name: 'Agent Lab heartbeat', confirm: true });
    } catch {
      // absent already: the state this step wants
    }
    // Two turns, as on the page: schedule it, let beat fire it and record the fire
    // (beat saves its counters minutes after firing), then diagnose and delete.
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    await agentTurn(agent, promptFor('10-capstone-investigation', PAGE, 4), { confirm: 'Yes, go ahead.' });
    let fired = false;
    for (let i = 0; i < 36 && !fired; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      fired = Boolean(toolkit('diagnose_schedule', { name: 'Agent Lab heartbeat' }).ever_fired);
    }
    expect(fired, 'beat never recorded a fire within 6 minutes').toBe(true);
    const screen = await agentTurn(agent, promptFor('10-capstone-investigation', PAGE, 5), {
      confirm: 'Yes, delete it.',
      timeoutMs: 10 * 60 * 1000,
    });
    await capture.screen('fsa10-07-schedule-and-prove', screen, agentScreen());
    expect(screen).toMatch(/diagnose_schedule|no problems/i);
    // Effect: the heartbeat ran on its own and finished, and the schedule is gone.
    expect(JSON.stringify(toolkit('last_playbook_run', { playbook: 'Agent Lab Heartbeat' }))).toMatch(/finished/i);
    let gone = '';
    try {
      gone = JSON.stringify(toolkit('diagnose_schedule', { name: 'Agent Lab heartbeat' }));
    } catch (err: any) {
      gone = String(err?.message ?? err);
    }
    expect(gone).toMatch(/No scheduled task|exit|Command failed/);
  });
});
