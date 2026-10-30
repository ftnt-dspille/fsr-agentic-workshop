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
import * as fs from 'fs';
import * as path from 'path';
import { expect, openPlaybookLogs, openRecord, test } from 'docubot';
import { agentTurn, labSeed, promptFor, shouldRunStep, startAgent, toolkit, uiMask } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

const CHAPTER = '08-playbook';
const AGENT = process.env.SPEND_AI === '1';
const TITLE = 'student@laptop: ~/agent-lab';

const TAG_PLAYBOOK = 'Tag Agent Lab Alerts';
const PRACTICE_PLAYBOOK = 'Agent Lab Diagnose Practice';
const PROBE_PLAYBOOK = 'Agent Lab Probe';
const TAG_TEXT = 'Triaged automatically by the Agent Lab playbook';

/** Read a content page of this chapter. */
function pageMd(page: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'content', CHAPTER, `${page}.md`), 'utf8');
}

/** The first ```yaml fence on a page - the YAML the page tells the agent to produce. */
function pageYaml(page: string): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(pageMd(page));
  if (!m) throw new Error(`no yaml fence on content/${CHAPTER}/${page}.md`);
  return m[1];
}

/** YAML embedded in a prompt fence, between two literal markers of the prompt text. */
function promptYaml(page: string, startMarker: string, endMarker: string): string {
  const md = pageMd(page);
  const start = md.indexOf(startMarker);
  const end = md.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`prompt YAML markers not found on content/${CHAPTER}/${page}.md`);
  return md.slice(start, end).trim() + '\n';
}

/** Records out of a query_records result, whatever envelope key the toolkit used. */
function members(res: any): any[] {
  if (Array.isArray(res)) return res;
  for (const key of ['records', 'members', 'hydra:member', 'items', 'results', 'data']) {
    if (Array.isArray(res?.[key])) return res[key];
  }
  return [];
}

const query = (module: string, filters: unknown[]): any[] => members(toolkit('query_records', { module, filters }));
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

test('chapter 8 - playbook', async ({ gui, local, capture }) => {
  test.setTimeout(45 * 60 * 1000);
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  // CONFIGURE: seed prerequisites (read-only run without the flag). When the agent
  // builds the playbook (SPEND_AI=1) nothing is pre-seeded, so its publish is the
  // real first publish; otherwise the shipped page-1 playbook is installed.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    if (!AGENT) labSeed('playbooks');
  });

  // One agent session carries pages 1's two prompts (the second says "you just
  // compiled"); every other step starts fresh because its prompt is self-contained.
  let agent: Awaited<ReturnType<typeof startAgent>> | undefined;
  const freshAgent = async () => startAgent(local, 'laptop', { cols: 100, rows: 40 });

  if (shouldRunStep('fsa08-01-compile-yaml')) await test.step('fsa08-01-compile-yaml', async () => {
    if (AGENT) {
      agent = await freshAgent();
      const screen = await agentTurn(agent, promptFor(CHAPTER, '01-author-and-publish', 1));
      await capture.screen('fsa08-01-compile-yaml', screen, { title: TITLE });
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
      await capture.screen('fsa08-02-publish-playbook', screen, { title: TITLE });
    } else {
      ensureTagPlaybook();
    }
    // Effect: read the playbook back from the box; it exists and is active.
    const wf = playbookRows(TAG_PLAYBOOK)[0];
    expect(wf, `${TAG_PLAYBOOK} not found on the box`).toBeTruthy();
    expect(wfActive(wf.uuid)).toBe(true);

    // UI: open the playbook's designer canvas by the uuid just read back (live
    // state, not a click path through the collection list), then check the steps.
    await soar.goto(`${origin}/playbooks/${wf.uuid}`, { waitUntil: 'domcontentloaded' });
    const canvas = soar.locator('#designer-container');
    await expect(canvas, `designer canvas for ${TAG_PLAYBOOK} did not load`).toBeVisible({ timeout: 40_000 });
    await expect(canvas).toContainText('Tag Alert', { timeout: 30_000 });
    await capture.shot(soar, 'fsa08-02-publish-playbook-canvas', { mask: uiMask(soar), scrub: false });
  });

  if (shouldRunStep('fsa08-03-trigger-and-verify')) await test.step('fsa08-03-trigger-and-verify', async () => {
    ensureTagPlaybook();
    let alertUuid: string;
    if (AGENT) {
      const a = await freshAgent();
      const screen = await agentTurn(a, promptFor(CHAPTER, '02-trigger-and-verify', 1));
      await capture.screen('fsa08-03-trigger-and-verify', screen, { title: TITLE });
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
        },
      });
      alertUuid = created.uuid;
      const run = toolkit('wait_for_playbook_run', { playbook: TAG_PLAYBOOK, since, timeout: 120 });
      expect(JSON.stringify(run)).toContain('finished');
    }
    // Effect: the read-back is the proof, not the run status.
    const alert = toolkit('get_record', { module: 'alerts', ref: alertUuid });
    expect(JSON.stringify(alert)).toContain(TAG_TEXT);

    // UI: the alert's Executed Playbook Logs (historical) draw the run's step graph.
    await openRecord(soar, 'alerts', alertUuid, { tab: null });
    // A run that just finished is listed under Recent Playbook Logs, not the
    // Historical table (which only holds aged/persisted runs), so read Recent.
    await openPlaybookLogs(soar, { select: 'Tag Agent Lab' });
    await capture.shot(soar, 'fsa08-03-trigger-and-verify-run-history', {
      target: soar.locator('#mySidenav'),
      mask: uiMask(soar),
      scrub: false,
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
      await capture.screen('fsa08-04-diagnose-run', screen, { title: TITLE });
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
      await capture.screen('fsa08-05-run-in-one-call', screen, { title: TITLE });
    }
    // Effect: the one-call workflow answers, shows the step result, and cleans up.
    const probe = promptYaml('04-run-a-playbook-in-one-call', 'collection: Agent Lab Probe', '\n\nTell me the status');
    const out = toolkit('run_playbook_yaml', { yaml_text: probe, cleanup: true });
    const text = JSON.stringify(out);
    expect(text).toContain('answered');
    expect(text).toContain('agent-lab-ok');
    expect(playbookRows(PROBE_PLAYBOOK), 'cleanup=true left the probe playbook on the box').toHaveLength(0);
  });
});
