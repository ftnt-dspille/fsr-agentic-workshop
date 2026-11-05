// Chapter 8 - playbook: author and publish, trigger and verify, diagnose a failed
// run, run a playbook in one call. Every documented step is automated.
//
// Part 2 chapter: an external coding agent drives the box. Layers:
//   * ALWAYS ON: toolkit(...) effect-checks (the same tools the agent calls)
//     prove the real box effect - the playbook compiled, is published and
//     active, the trigger produced a finished run that changed the alert, the
//     broken run is diagnosed to the right step, the one-call run answered.
//     Browser shots (playbook canvas, run history) are free and always on.
//   * PRIMARY CAPTURE (SPEND_AI=1): the student's prompts, read straight from
//     the pages with promptFor, are driven in a real Claude Code TUI and
//     captured with capture.screen. These spend model credits. With the flag
//     set the agent does the work and the spec only verifies the effect (it
//     does not republish the page YAML, which would collide with the agent's
//     copy). Without it the TUI shots are skipped, not faked.
//   * DOCUBOT_SEED=1: CONFIGURE step seeds the page-1 playbook from the shipped
//     artifact (static/examples/playbooks) when the agent is NOT building it.
//
// Live-only (needs the box; agent steps also need DOCUBOT_MCP_CONFIG).
// Run: DOCUBOT_SEED=1 SPEND_AI=1 docubot run --chapter 08-playbook
import { expect, openPlaybook, openPlaybookLogs, openRecord, skipStep, test, SCRUB } from 'docubot';
import { agentScreen, agentTurn, startAgent } from '../lib/agentlab';
import { approvedTurn, snapFrom, startClaude, type Allowed } from '../lib/approve';
import { labSeed, queryRows, toolkit } from 'docubot';
import { anyStepSelected, shouldRunStep } from 'docubot';
import { pageYaml as pageYamlOf, promptFor, promptYaml as promptYamlOf } from 'docubot';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. Designer/run-history pages show dates and
// record/run UUIDs (read as key-like tokens but not secrets, and no real key
// renders here), so those categories are skipped for these shots.
const SKIP_RECORD = SCRUB.record;

test.describe.configure({ mode: 'serial' });

const CHAPTER = '08-playbook';
const AGENT = process.env.SPEND_AI === '1';

const TAG_PLAYBOOK = 'Tag Agent Lab Alerts';
const COLLECTION = 'Agent Lab';
const PRACTICE_PLAYBOOK = 'Agent Lab Diagnose Practice';
const PROBE_PLAYBOOK = 'Agent Lab Probe';
const TAG_TEXT = 'Triaged automatically by the Agent Lab playbook';
const KEEP_TEXT = 'Repeated failed logins followed by a success.';

const pageYaml = (page: string) => pageYamlOf(CHAPTER, page);
const promptYaml = (page: string, start: string, end: string) => promptYamlOf(CHAPTER, page, start, end);

const query = (module: string, filters: unknown[]): any[] => queryRows(module, filters);
const playbookRows = (name: string) => query('workflows', [{ field: 'name', operator: 'eq', value: name }]);
// query_records returns a projection that omits isActive, so read the active
// state from the full record (get_record returns it).
function wfActive(uuid: string): boolean {
  const r: any = toolkit('get_record', { module: 'workflows', ref: uuid });
  const rec = r?.record ?? r;
  return rec?.isActive === true || rec?.active === true;
}

/** Publish the page-1 playbook only if the box does not already have it. */
function ensureTagPlaybook(): void {
  if (playbookRows(TAG_PLAYBOOK).length === 0) {
    expect(toolkit('publish_playbook', { yaml_text: pageYaml('01-author-and-publish') }).published).toBe(true);
  }
}

test('chapter 8 - playbook', async ({ gui, local, capture, page }) => {
  test.setTimeout(45 * 60 * 1000);
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (!anyStepSelected([
    'fsa08-01-compile-yaml',
    'fsa08-02-publish-playbook',
    'fsa08-03-trigger-and-verify',
    'fsa08-04-diagnose-run',
    'fsa08-05-run-in-one-call',
    'fsa08-06-escalate-critical',
    'fsa08-07-ioc-extract',
    'fsa08-08-sweep',
  ])) return;
  const soar = await gui('soar');

  // CONFIGURE: seed prerequisites (read-only run without the flag). When the agent
  // builds the playbook (SPEND_AI=1) nothing is pre-seeded, so its publish is the
  // real first publish; otherwise the shipped page-1 playbook is installed.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    if (!AGENT) ensureTagPlaybook(); // publishes the page-1 playbook from its YAML (lab_setup.py has no playbooks subcommand)
  });

  // One agent session carries pages 1's two prompts (the second says "you just
  // compiled"); every other step starts fresh because its prompt is self-contained.
  let agent: Awaited<ReturnType<typeof startAgent>> | undefined;
  const freshAgent = async () => startAgent(local, 'laptop', { cols: 100, rows: 40 });

  if (shouldRunStep('fsa08-01-compile-yaml')) await test.step('fsa08-01-compile-yaml', async () => {
    if (AGENT) {
      agent = await freshAgent();
      const screen = await agentTurn(agent, promptFor(CHAPTER, '01-author-and-publish', 1));
      await capture.screen('fsa08-01-compile-yaml', screen, agentScreen());
    }
    // Effect: the page's YAML compiles offline (nothing touches the box).
    const out = toolkit('compile_playbook_yaml', { yaml_text: pageYaml('01-author-and-publish') });
    expect(out.ok).toBe(true);
    expect(out.playbooks).toEqual([TAG_PLAYBOOK]);
  });

  if (shouldRunStep('fsa08-02-publish-playbook')) await test.step('fsa08-02-publish-playbook', async () => {
    if (AGENT) {
      agent = agent ?? (await freshAgent());
      // Publish + read-back to a live box legitimately runs longer than the
      // default 5 min turn budget; give it the same headroom as the diagnose turn.
      const screen = await agentTurn(agent, promptFor(CHAPTER, '01-author-and-publish', 2), { timeoutMs: 10 * 60 * 1000 });
      await capture.screen('fsa08-02-publish-playbook', screen, agentScreen());
    } else {
      ensureTagPlaybook();
    }
    // Effect: read the playbook back from the box; it exists and is active.
    const wf = playbookRows(TAG_PLAYBOOK)[0];
    expect(wf, `${TAG_PLAYBOOK} not found on the box`).toBeTruthy();
    expect(wfActive(wf.uuid)).toBe(true);

    // UI: open the playbook's designer canvas in-app (collection -> playbook); a
    // direct /playbooks/<uuid> deep-link does not load the designer on 8.0.
    await openPlaybook(soar, { collectionName: COLLECTION, playbookName: TAG_PLAYBOOK });
    const canvas = soar.locator('#designer-container');
    await expect(canvas, `designer canvas for ${TAG_PLAYBOOK} did not load`).toBeVisible({ timeout: 40_000 });
    await expect(canvas).toContainText('Tag Alert', { timeout: 30_000 });
    await capture.shot(soar, 'fsa08-02-publish-playbook-canvas', SKIP_RECORD);
  });

  if (shouldRunStep('fsa08-03-trigger-and-verify')) await test.step('fsa08-03-trigger-and-verify', async () => {
    ensureTagPlaybook();
    let alertUuid: string;
    if (AGENT) {
      const a = await freshAgent();
      const screen = await agentTurn(a, promptFor(CHAPTER, '02-trigger-and-verify', 1));
      await capture.screen('fsa08-03-trigger-and-verify', screen, agentScreen());
      // The agent created the alert; find the newest one it made.
      const found = query('alerts', [{ field: 'name', operator: 'like', value: 'Agent Lab - suspicious login%' }])
        .sort((x, y) => String(y.createDate).localeCompare(String(x.createDate)));
      expect(found.length, 'the agent did not create the Agent Lab alert').toBeGreaterThan(0);
      alertUuid = found[0].uuid;
    } else {
      const since = new Date().toISOString();
      const created = toolkit('create_record', {
        module: 'alerts',
        data: {
          name: `Agent Lab - suspicious login on jump-host-01 (${Date.now()})`,
          severity: 'High',
          source: 'Agent Lab Workshop',
          description: KEEP_TEXT,
        },
      });
      alertUuid = created.uuid;
      const run = toolkit('wait_for_playbook_run', { playbook: TAG_PLAYBOOK, since, timeout: 120 });
      expect(JSON.stringify(run)).toContain('finished');
    }
    // Effect: the read-back is the proof, not the run status.
    const alert = toolkit('get_record', { module: 'alerts', ref: alertUuid });
    expect(JSON.stringify(alert)).toContain(TAG_TEXT);
    // The playbook appends; it must not wipe the alert's own description.
    if (!AGENT) expect(JSON.stringify(alert), 'the playbook replaced the description').toContain(KEEP_TEXT);

    // UI: the alert's Executed Playbook Logs (historical) draw the run's step graph.
    await openRecord(soar, 'alerts', alertUuid, { tab: null });
    // The alert's description carries the playbook's appended text (page 02 s2).
    // The record opens on its last tab, so select Alert Details explicitly.
    await soar.getByText('Alert Details', { exact: true }).first().click();
    await expect(soar.getByText(TAG_TEXT).first(), 'the alert description does not show the playbook text').toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa08-03-trigger-and-verify-alert', SKIP_RECORD);
    // A run that just finished is listed under Recent Playbook Logs, not the
    // Historical table (which only holds aged/persisted runs), so read Recent.
    await openPlaybookLogs(soar, { select: 'Tag Agent Lab' });
    await capture.shot(soar, 'fsa08-03-trigger-and-verify-run-history', {
      target: soar.locator('#mySidenav'),
      ...SKIP_RECORD,
    });
  });

  if (shouldRunStep('fsa08-04-diagnose-run')) await test.step('fsa08-04-diagnose-run', async () => {
    const lead = 'collection: Agent Lab\nvisible: true\nplaybooks:\n  - name: Agent Lab Diagnose Practice';
    const practice = promptYaml('03-diagnose-a-failed-run', 'collection: Agent Lab\nvisible: true', '\n\nThen create an alert');
    expect(practice.startsWith(lead)).toBe(true);
    const fixedRef = "{{ vars.input.records[0]['@id'] }}";
    const brokenRef = '/api/3/alerts/00000000-0000-0000-0000-000000000000';
    expect(practice).toContain(brokenRef);

    if (AGENT) {
      // The agent does the whole break-fix loop from one prompt.
      const a = await freshAgent();
      const screen = await agentTurn(a, promptFor(CHAPTER, '03-diagnose-a-failed-run', 1), { timeoutMs: 10 * 60 * 1000 });
      await capture.screen('fsa08-04-diagnose-run', screen, agentScreen());
      // Effect: the agent named the failing step, and the practice playbook is
      // published and active again (the fix landed). The failed run it diagnosed
      // is the agent's own, so the seeded diagnosis below is skipped here.
      expect(screen).toMatch(/Tag Alert/);
      const wf = playbookRows(PRACTICE_PLAYBOOK)[0];
      expect(wf, `${PRACTICE_PLAYBOOK} not found on the box`).toBeTruthy();
      expect(wfActive(wf.uuid)).toBe(true);
      return;
    }

    // Seeded loop: publish broken, trigger, wait for failed, diagnose, publish fixed.
    expect(toolkit('publish_playbook', { yaml_text: practice }).published).toBe(true);
    const since = new Date().toISOString();
    toolkit('create_record', { module: 'alerts', data: { name: `Agent Lab diag test (${Date.now()})`, status: 'Open' } });
    const run = toolkit('wait_for_playbook_run', { playbook: PRACTICE_PLAYBOOK, since, timeout: 120 });
    expect(run.status).toBe('failed');
    const diag = toolkit('diagnose_run', { playbook: PRACTICE_PLAYBOOK, run: String(run.pk) });
    expect(diag.verdict).toBe('failed');
    expect(diag.failing_step).toBe('Tag Alert');
    expect(diag.error_message).toMatch(/404|Not Found/i);
    expect(toolkit('publish_playbook', { yaml_text: practice.replace(brokenRef, fixedRef) }).published).toBe(true);
  });

  if (shouldRunStep('fsa08-05-run-in-one-call')) await test.step('fsa08-05-run-in-one-call', async () => {
    if (AGENT) {
      const a = await freshAgent();
      const screen = await agentTurn(a, promptFor(CHAPTER, '04-run-a-playbook-in-one-call', 1));
      await capture.screen('fsa08-05-run-in-one-call', screen, agentScreen());
    }
    // Effect: the one-call workflow answers, shows the step result, and cleans up.
    // Start without a probe playbook (the agent's turn above may leave its own),
    // so the check proves this call's cleanup, not an earlier run's.
    labSeed('delete-records', 'workflows', 'name', PROBE_PLAYBOOK);
    const probe = promptYaml('04-run-a-playbook-in-one-call', 'collection: Agent Lab Probe', '\n\nTell me the status');
    const out = toolkit('run_playbook_yaml', { yaml_text: probe, cleanup: true });
    const text = JSON.stringify(out);
    expect(text).toContain('answered');
    expect(text).toContain('agent-lab-ok');
    expect(playbookRows(PROBE_PLAYBOOK), `cleanup=true left the probe playbook on the box. Toolkit said: ${text.slice(0, 1500)}`).toHaveLength(0);
  });

  // Page 05: playbooks the agent designs from a sentence. Agent-only (no YAML on
  // the page to fall back on), so these run under SPEND_AI=1 and skip otherwise.
  const GALLERY = '05-playbook-gallery';
  const val = (v: any) => (v && typeof v === 'object' ? v.itemValue ?? v['@id'] : v);
  const alertsLike = (prefix: string): any[] => {
    const out = toolkit('search_records', {
      module: 'alerts', term: prefix, fields: ['name', 'status', 'severity', 'hostIPAddress'], summary: false, limit: 50,
    });
    return (out?.members ?? out?.records ?? out?.['hydra:member'] ?? out ?? []).filter?.((r: any) => String(r?.name ?? '').startsWith(prefix)) ?? [];
  };
  const fresh = (prefix: string, playbook: string) => {
    labSeed('delete-prefix', 'alerts', 'name', prefix);
    labSeed('delete-records', 'workflows', 'name', playbook);
  };
  // What each gallery page lets the agent write: the playbook it builds and the test alerts it names "Agent Lab ...". Claude's own
  // prompt asks before each one; the hook denies any other write. publish_playbook and run_playbook_yaml have no target argument
  // (they act on the box the server is configured for), so their check reads the playbook's name from the YAML.
  const yamlNames = (playbook: string): Allowed['check'] => (a) => (String(a.yaml_text ?? '').includes(playbook) ? undefined : `the YAML is not the "${playbook}" playbook`);
  const labAlert: Allowed = {
    tool: 'create_record', args: { module: 'alerts' },
    check: (a) => (String(a.data?.name ?? '').startsWith('Agent Lab') ? undefined : 'a test alert must be named starting with "Agent Lab"'),
  };
  // Each call site wraps this in a literal test.step(id) so lint can see the step.
  const gallery = async (id: string, n: number, prefix: string, playbook: string, allowed: Allowed[], check: () => void) => {
      if (!AGENT) {
        skipStep(id, 'the agent designs this playbook; set SPEND_AI=1');
        return;
      }
      fresh(prefix, playbook);
      const prompt = promptFor(CHAPTER, GALLERY, n);
      const run = await startClaude(page);
      let held: Awaited<ReturnType<typeof snapFrom>>;
      let plain: string;
      try {
        await approvedTurn(run, prompt, allowed, { nudge: 'Yes, go ahead.', timeoutMs: 15 * 60 * 1000 });
        held = await snapFrom(run, prompt);
        plain = run.real.term.plainScreen();
      } finally {
        run.session.kill();
      }
      expect(plain).not.toMatch(/couldn't (?:finish|complete|publish|build)|could not (?:finish|complete|publish|build)|(?:do|finish|create|publish|run) (?:it|this|that|them) (?:by hand|manually)/i);
      // Triggers run server-side after the agent's last call: give them a moment.
      for (let i = 0; i < 12; i++) {
        try {
          check();
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 5000));
        }
        if (i === 11) check();
      }
      // Checked before the picture is saved: a failed run never lands a PNG in content/.
      await capture.agent(id, held);
  };

  if (shouldRunStep('fsa08-06-escalate-critical')) await test.step('fsa08-06-escalate-critical', () => gallery('fsa08-06-escalate-critical', 1, 'Agent Lab crit', 'Agent Lab Escalate Critical', [{ tool: 'publish_playbook', anyTarget: true, required: true, check: yamlNames('Agent Lab Escalate Critical') }, labAlert], () => {
    const rows = alertsLike('Agent Lab crit');
    const crit = rows.filter((r) => /critical/i.test(String(val(r.severity))));
    const low = rows.filter((r) => /low/i.test(String(val(r.severity))));
    expect(crit.length && low.length, `want a Critical and a Low test alert, got ${JSON.stringify(rows)}`).toBeTruthy();
    // A first failed attempt may leave an earlier Critical Open; the agent reports that on screen.
    expect(crit.some((r) => val(r.status) === 'Investigating'), JSON.stringify(rows)).toBe(true);
    expect(low.every((r) => val(r.status) === 'Open')).toBe(true);
  }));

  if (shouldRunStep('fsa08-07-ioc-extract')) await test.step('fsa08-07-ioc-extract', () => gallery('fsa08-07-ioc-extract', 2, 'Agent Lab ioc', 'Agent Lab IOC Extract', [{ tool: 'publish_playbook', anyTarget: true, required: true, check: yamlNames('Agent Lab IOC Extract') }, labAlert], () => {
    const rows = alertsLike('Agent Lab ioc');
    expect(rows.some((r) => r.hostIPAddress === '198.51.100.23'), JSON.stringify(rows)).toBe(true);
  }));

  if (shouldRunStep('fsa08-08-sweep')) await test.step('fsa08-08-sweep', () => gallery('fsa08-08-sweep', 3, 'Agent Lab sweep', 'Agent Lab Sweep', [labAlert, { tool: 'run_playbook_yaml', anyTarget: true, required: true, check: yamlNames('Agent Lab Sweep') }], () => {
    const rows = alertsLike('Agent Lab sweep');
    expect(rows.length).toBe(3);
    expect(rows.every((r) => val(r.status) === 'Closed'), JSON.stringify(rows)).toBe(true);
    expect(playbookRows('Agent Lab Sweep'), 'run_playbook_yaml left the sweep playbook behind').toHaveLength(0);
  }));
});
