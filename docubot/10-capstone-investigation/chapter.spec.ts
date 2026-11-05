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
import { expect, findAlert, forgetModuleCache, openRecord, test, SCRUB } from 'docubot';
import { execFileSync } from 'child_process';
import type { Page } from '@playwright/test';
import * as path from 'path';
import { AGENT_CWD, agentScreen, startAgent, agentTurn } from '../lib/agentlab';
import { approvedTurn, snapFrom, startClaude, type Allowed } from '../lib/approve';
import { labSeed, rows, toolkit } from 'docubot';
import { shouldRunStep } from 'docubot';
import { promptFor } from 'docubot';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. The alert record shows dates and record
// UUIDs (read as key-like tokens but not secrets, and no real key renders on an
// alert record), so those categories are skipped for this shot.
const SKIP_RECORD = SCRUB.record;

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

/**
 * One Claude turn whose page lets the agent make the writes in `allowed`: each is asked by Claude's own prompt, decided by the
 * step's policy, and approved here. Returns the screen text and the held picture; the caller saves it once its effect checks pass.
 */
async function claudeTurn(page: Page, prompt: string, allowed: Allowed[], o: { nudge?: string; timeoutMs?: number; builtins?: string[] } = {}) {
  const run = await startClaude(page, { builtins: o.builtins });
  try {
    await approvedTurn(run, prompt, allowed, { nudge: o.nudge ?? 'Yes, go ahead.', timeoutMs: o.timeoutMs });
    return { held: await snapFrom(run, prompt), plain: run.real.term.plainScreen() };
  } finally {
    run.session.kill();
  }
}

/** The staged capstone alert's uuids, for a check that a call acts on the capstone alert and nothing else. */
const capstoneRefCheck = (what: string): NonNullable<Allowed['check']> => {
  const uuids = stagedAlerts().map((a) => a.uuid).filter((u): u is string => !!u);
  return (a) => (uuids.some((u) => String(a.ref ?? '').includes(u)) ? undefined : `${what} must act on the capstone alert (${uuids.length} staged)`);
};

test('chapter 10 - capstone investigation', async ({ gui, local, capture, page }) => {
  test.setTimeout(45 * 60 * 1000);

  // CONFIGURE: repeatable seed (idempotent, create-if-absent) of the box state
  // this chapter reads. Investigation SOPs already ship on the box; demo alerts
  // give the correlation step (search for related alerts) something to find.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    labSeed('seed');         // demo alerts ("Agent Lab - ..."), incl. an outbound-beacon alert
    labSeed('org-context');  // TOOL_LIST routing record the investigation reads
    labSeed('mcp-server');   // agentlab-deepwiki for fsa10-04 (chapter 5's spec removes its own copy)
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
    let held: Awaited<ReturnType<typeof snapFrom>> | undefined;
    if (SPEND) {
      // The write-back is one update_record on the capstone alert; Claude's own prompt asks before it. Any other write is denied.
      const refCheck = capstoneRefCheck('the write-back');
      ({ held } = await claudeTurn(page, promptFor(CHAPTER, PAGE, 2), [{
        tool: 'update_record', args: { module: 'alerts' }, required: true,
        check: (a) => refCheck(a) ?? (/closed/i.test(JSON.stringify(a.data?.status ?? '')) ? 'the page says never close the alert' : undefined),
      }], { timeoutMs: 20 * 60 * 1000 }));
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
    if (held) await capture.agent('fsa10-02-investigate', held);

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

  if (shouldRunStep('fsa10-03-native-compare')) await test.step('fsa10-03-native-compare', async () => {
    if (!SPEND) {
      console.log('[ch10] fsa10-03-native-compare skipped (spends credits); set SPEND_AI=1');
      return;
    }
    // Starting the native investigation is one write (run_fortiai_investigation on the capstone alert); Claude's own prompt asks.
    const { held, plain: screen } = await claudeTurn(page, promptFor(CHAPTER, PAGE, 3), [
      { tool: 'run_fortiai_investigation', anyTarget: true, required: true, check: capstoneRefCheck('the investigation') },
    ], { timeoutMs: 25 * 60 * 1000 });
    // The comparison must rest on a native run the agent actually started.
    expect(screen).toMatch(/agree|differ/i);
    // A comparison against a verdict that never arrived is not the page's result.
    expect(screen).not.toMatch(/provisional|returned early|Tooling problems|keep polling|404/i);
    await capture.agent('fsa10-03-native-compare', held);
  });
});

// The Advanced Labs page: four agent-only labs, each one agent conversation
// captured in the TUI and backed by an effect check on the box (or, for the
// connector review, on the folder ch09 left in the agent's working dir).
// Every lab is an agent turn, so the whole block is behind SPEND_AI=1.
test('chapter 10 - advanced labs', async ({ local, gui, capture, page }) => {
  test.setTimeout(90 * 60 * 1000);
  test.skip(!SPEND, 'advanced labs are agent turns: set SPEND_AI=1');
  const PAGE = '03-advanced-labs';
  // The read-only labs (3, 6, 7): nothing to approve, so the plain agent turn.
  const run = async (n: number) => {
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    return agentTurn(agent, promptFor('10-capstone-investigation', PAGE, n), { timeoutMs: 10 * 60 * 1000 });
  };
  // The labs that write: the calls the page lets the agent make, each asked by Claude's own prompt.
  const yamlOf = (playbook: string): NonNullable<Allowed['check']> => (a) => (String(a.yaml_text ?? '').includes(playbook) ? undefined : `the YAML is not the "${playbook}" playbook`);
  const alertNamed = (prefix: string): Allowed => ({
    tool: 'create_record', args: { module: 'alerts' },
    check: (a) => (String(a.data?.name ?? '').startsWith(prefix) ? undefined : `a test alert must be named starting with "${prefix}"`),
  });

  if (shouldRunStep('fsa10-04-registered-mcp-tool')) await test.step('fsa10-04-registered-mcp-tool', async () => {
    // Precondition: chapter 5's registration. Fail as setup, not content.
    const listed = toolkit('list_registered_mcp_tools', { server: 'agentlab-deepwiki' });
    expect(listed.tools?.length, 'agentlab-deepwiki is not registered: run chapter 5 page 2 first').toBeGreaterThan(0);
    // The page: calling a registered tool needs the student's go-ahead. Claude's own prompt asks before call_registered_mcp_tool,
    // for this server and its question tool only.
    const { held, plain: screen } = await claudeTurn(page, promptFor('10-capstone-investigation', PAGE, 1), [
      { tool: 'call_registered_mcp_tool', args: { server: 'agentlab-deepwiki', tool: 'ask_wiki_question', confirm: true }, required: true },
    ], { nudge: 'Yes, go ahead and call it.', timeoutMs: 10 * 60 * 1000 });
    // The answer must come from the registered server's own tool, not memory.
    expect(screen).toMatch(/ask_wiki_question/);
    expect(screen).toMatch(/SSE|Server-Sent/i);
    expect(screen).not.toMatch(/couldn't finish|failed|RuntimeError/i);
    await capture.agent('fsa10-04-registered-mcp-tool', held);
  });

  if (shouldRunStep('fsa10-05-repair-playbook')) await test.step('fsa10-05-repair-playbook', async () => {
    // Save the YAML, publish it, trigger it with a test alert, repair it, publish the repair, trigger again.
    const { held, plain: screen } = await claudeTurn(page, promptFor('10-capstone-investigation', PAGE, 2), [
      { tool: 'publish_playbook', anyTarget: true, required: true, check: yamlOf('Agent Lab Repair Practice') },
      alertNamed('Agent Lab repair'),
    ], { builtins: ['Write', 'Edit'], timeoutMs: 10 * 60 * 1000 });
    // The fix must be repair_playbook's, not a hand edit the agent fell back to.
    expect(screen).toMatch(/repair_playbook/);
    expect(screen).not.toMatch(/by hand|manually|myself|no change made/i);
    // Effect: the practice playbook's newest run finished (the repair held).
    const last = toolkit('last_playbook_run', { playbook: 'Agent Lab Repair Practice' });
    expect(JSON.stringify(last)).toMatch(/finished/i);
    await capture.agent('fsa10-05-repair-playbook', held);
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
    // (beat saves its counters minutes after firing), then diagnose and delete. One session, so the second prompt keeps its context.
    const run = await startClaude(page, { builtins: ['Write', 'Edit'] });
    const createPrompt = promptFor('10-capstone-investigation', PAGE, 4);
    const deletePrompt = promptFor('10-capstone-investigation', PAGE, 5);
    let createdShot: Awaited<ReturnType<typeof snapFrom>>;
    let created: string;
    let deletedShot: Awaited<ReturnType<typeof snapFrom>>;
    try {
      // Turn 1: publish the heartbeat playbook and schedule it. trigger_schedule_now is never declared, so a manual fire is denied.
      await approvedTurn(run, createPrompt, [
        { tool: 'publish_playbook', anyTarget: true, required: true, check: yamlOf('Agent Lab Heartbeat') },
        { tool: 'schedule_playbook', args: { name: 'Agent Lab heartbeat' }, required: true },
      ], { nudge: 'Yes, go ahead.' });
      createdShot = await snapFrom(run, createPrompt);
      created = run.real.term.plainScreen();
      expect(created).toMatch(/schedule/i);
      // Only an admission counts: an agent often says it did NOT call trigger_schedule_now.
      expect(created).not.toMatch(/(?<!not |n't )\b(fired|triggered|ran) it (by hand|manually|now)\b/i);
      let fired = false;
      for (let i = 0; i < 36 && !fired; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        fired = Boolean(toolkit('diagnose_schedule', { name: 'Agent Lab heartbeat' }).ever_fired);
      }
      expect(fired, 'beat never recorded a fire within 6 minutes').toBe(true);
      // Turn 2: diagnose (a read), then delete the schedule: the one write, asked by Claude's own prompt.
      await approvedTurn(run, deletePrompt, [
        { tool: 'delete_schedule', args: { name: 'Agent Lab heartbeat', confirm: true }, required: true },
      ], { nudge: 'Yes, delete it.', timeoutMs: 10 * 60 * 1000 });
      deletedShot = await snapFrom(run, deletePrompt);
    } finally {
      run.session.kill();
    }
    // Effect: the heartbeat ran on its own and finished, and the schedule is gone.
    expect(JSON.stringify(toolkit('last_playbook_run', { playbook: 'Agent Lab Heartbeat' }))).toMatch(/finished/i);
    let gone = '';
    try {
      gone = JSON.stringify(toolkit('diagnose_schedule', { name: 'Agent Lab heartbeat' }));
    } catch (err: any) {
      gone = String(err?.message ?? err);
    }
    expect(gone).toMatch(/No scheduled task|exit|Command failed/);
    await capture.agent('fsa10-07-schedule-and-prove-create', createdShot);
    await capture.agent('fsa10-07-schedule-and-prove', deletedShot);
  });

  if (shouldRunStep('fsa10-08-plan-and-build')) await test.step('fsa10-08-plan-and-build', async () => {
    // Start from no module, playbook or lab alerts, so the build is this run's.
    labSeed('delete-records', 'workflows', 'name', 'Agent Lab Lost Device Alert');
    labSeed('delete-prefix', 'alerts', 'name', 'Agent Lab lost device');
    try {
      // Records outlive a module delete: a rebuilt module still showed the last
      // run's LT-0042 row. Clear them first (every uuid starts with '').
      labSeed('delete-prefix', 'agentlab_lost_devices', 'uuid', '');
    } catch {
      // no module, so no records
    }
    try {
      toolkit('delete_module', { module: 'agentlab_lost_devices', confirm: true });
    } catch {
      // absent already
    }
    // The build is a module (provision_module, or create_module and publish_module_changes), the playbook on it and a test record.
    // Each write is asked by Claude's own prompt; the page's alert is raised by the playbook, so no alert write is declared.
    const recordIn = (tool: string): Allowed => ({ tool, args: { module: 'agentlab_lost_devices' }, required: 'record' });
    const { held, plain: screen } = await claudeTurn(page, promptFor('10-capstone-investigation', PAGE, 6), [
      { tool: 'provision_module', args: { module: 'agentlab_lost_devices', confirm: true }, required: 'module' },
      { tool: 'create_module', args: { module: 'agentlab_lost_devices' }, required: 'module' },
      { tool: 'publish_module_changes', args: { confirm: true }, anyTarget: true },
      { tool: 'publish_playbook', anyTarget: true, required: true, check: yamlOf('Agent Lab Lost Device Alert') },
      recordIn('create_record'), recordIn('upsert_record'), recordIn('get_or_create_record'),
    ], { timeoutMs: 30 * 60 * 1000 });
    expect(screen).not.toMatch(/couldn't (?:finish|complete|publish|build)|could not (?:finish|complete|publish|build)|(?:do|finish|create|publish|run) (?:it|this|that|them) (?:by hand|manually)/i);
    // Effect: the test record exists, and the playbook raised its alert.
    const devices = rows(toolkit('search_records', { module: 'agentlab_lost_devices', term: 'LT-0042' }));
    expect(devices.length, 'no LT-0042 record in agentlab_lost_devices').toBeGreaterThan(0);
    let alerts: any[] = [];
    for (let i = 0; i < 12 && !alerts.length; i++) {
      alerts = rows(toolkit('find_records', { module: 'alerts', where: 'name=Agent Lab lost device LT-0042' }));
      if (!alerts.length) await new Promise((r) => setTimeout(r, 5000));
    }
    expect(alerts.length, 'the playbook raised no alert for LT-0042').toBeGreaterThan(0);
    // Proof in the product itself: the module the agent built, showing its record.
    const newest = devices.reduce((a: any, b: any) => (Number(b.createDate) > Number(a.createDate) ? b : a));
    const soar = await gui('soar');
    // The saved session's cached module list predates the agent's module.
    await forgetModuleCache(soar);
    await openRecord(soar, 'agentlab_lost_devices', String(newest.uuid ?? newest['@id']).split('/').pop()!);
    await expect(soar.getByText('LT-0042').first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa10-08-plan-and-build-module', { scrubSkip: ['date-or-time', 'key-like-token'] });
    await capture.agent('fsa10-08-plan-and-build', held);
  });

  if (shouldRunStep('fsa10-09-record-forensics')) await test.step('fsa10-09-record-forensics', async () => {
    // Precondition: the capstone alert (page 1) with its history.
    expect(stagedAlerts().length, 'stage the capstone alert first (fsa10-01)').toBeGreaterThan(0);
    const screen = await run(7);
    await capture.screen('fsa10-09-record-forensics', screen, agentScreen());
    expect(screen).toMatch(/Tag Agent Lab Alerts|playbook/i);
    expect(screen).not.toMatch(/couldn't|could not read/i);
  });

  if (shouldRunStep('fsa10-10-staging-vs-production')) await test.step('fsa10-10-staging-vs-production', async () => {
    // Two real boxes under the page's aliases. The lab box is "staging"; the
    // second comes from the author's own instances file (DOCUBOT_PROD_ALIAS), and
    // the file written here holds env_file paths and copied tables, never printed.
    const alias = process.env.DOCUBOT_PROD_ALIAS;
    const stagingEnv = process.env.DOCUBOT_STAGING_ENV;
    if (!alias || !stagingEnv) {
      console.log('[ch10] fsa10-10 skipped: set DOCUBOT_PROD_ALIAS and DOCUBOT_STAGING_ENV');
      return;
    }
    const py = process.env.FSR_PYTHON || 'python3';
    const out = execFileSync(py, ['-c', INSTANCES_PY, path.resolve(stagingEnv), alias], { encoding: 'utf8' });
    const { file, urls } = JSON.parse(out);
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40, mcpEnv: { PYFSR_INSTANCES: file } });
    const screen = await agentTurn(agent, promptFor('10-capstone-investigation', PAGE, 8), { timeoutMs: 15 * 60 * 1000 });
    const shown = agentScreen();
    // The real box addresses never reach the picture.
    shown.replace.push(...(urls as string[]).flatMap((u, i) => {
      const host = new URL(u).host;
      const name = i === 0 ? 'staging.example.com' : 'production.example.com';
      return [[u, `https://${name}`], [host, name]] as Array<[string, string]>;
    }));
    await capture.screen('fsa10-10-staging-vs-production', screen, shown);
    expect(screen).toMatch(/staging/i);
    expect(screen).toMatch(/production/i);
    expect(screen).not.toMatch(/could not reach|unknown instance|couldn't/i);
  });
});

// Writes a private instances file: "staging" = the lab box's env file, "production"
// = a copy of the author's own alias. Prints only the path and the two base URLs.
const INSTANCES_PY = String.raw`
import json, os, sys, tempfile, tomllib
from pathlib import Path
staging_env, alias = sys.argv[1], sys.argv[2]
src = Path(os.environ.get("PYFSR_INSTANCES_SOURCE", "~/.pyfsr/instances.toml")).expanduser()
prod = tomllib.loads(src.read_text())["instances"][alias]
if "env_file" in prod and not Path(prod["env_file"]).expanduser().is_absolute():
    prod["env_file"] = str(src.parent / prod["env_file"])
prod.pop("appliance", None)
def val(v):
    return json.dumps(v) if isinstance(v, str) else ("true" if v is True else "false" if v is False else str(v))
lines = ["default = \"staging\"", "", "[instances.staging]", f"env_file = {json.dumps(staging_env)}", "", "[instances.production]"]
lines += [f"{k} = {val(v)}" for k, v in prod.items() if not isinstance(v, dict)]
for k, v in prod.items():
    if isinstance(v, dict):
        lines += ["", f"[instances.production.{k}]"] + [f"{kk} = {val(vv)}" for kk, vv in v.items()]
fd, path = tempfile.mkstemp(prefix="fsa-instances-", suffix=".toml")
os.write(fd, ("\n".join(lines) + "\n").encode()); os.close(fd); os.chmod(path, 0o600)
def url_of(env_path=None, table=None):
    if table and table.get("base_url"):
        return table["base_url"]
    for line in Path(env_path).expanduser().read_text().splitlines():
        if line.startswith("FSR_BASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    return ""
u1 = url_of(staging_env)
u2 = url_of(prod.get("env_file"), prod)
fix = lambda u: u if "://" in u else ("https://" + u if u else u)
print(json.dumps({"file": path, "urls": [fix(u1), fix(u2)]}))
`;
