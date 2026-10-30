// Chapter 7 - users, modules and records (Part 2: the agent WRITES to the box).
// Four documented steps: bulk triage, create a custom module, seed records, read
// the record lifecycle. Each step has two halves:
//   1. the agent half: a real Claude Code TUI turn driven by the page's OWN
//      prompt (promptFor) and captured with capture.screen. It spends credits,
//      so it runs only when DOCUBOT_AGENT_STEPS=1.
//   2. the effect half: fsr-agentic-toolkit calls (the same tools the agent
//      uses) that read the box and prove the write really happened. Always on.
//      When the agent half is off, the effect half first performs the same write
//      itself through the toolkit, so the check still has something to prove.
// The two browser captures (module in the UI, records grid) prove the UI view.
//
// Live-only. Ported from tools/e2e/07-users-modules-records.spec.js (API proof)
// and tools/e2e/captures/ch07.spec.js. Verify on a box with
// `docubot run --chapter 07-users-modules-records`.
//
// Prerequisites: the read-only guard is OFF in DOCUBOT_MCP_CONFIG (no
// FSR_MCP_READONLY); the chapter 2 "Agent Lab" alerts exist and are Open for
// fsa07-01 (the spec seeds two marker alerts itself if none are Open).
import { expect, goToModuleList, test } from 'docubot';
import { agentTurn, promptFor, shouldRunStep, startAgent, toolkit, uiMask } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

const CHAPTER = '07-users-modules-records';
const MODULE = 'agentlab_assets';
const RUN_AGENT = process.env.DOCUBOT_AGENT_STEPS === '1';
const TITLE = { title: 'student@laptop: ~/agent-lab' };

/** First array found in a toolkit result (shape differs between tools). */
function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (!res || typeof res !== 'object') return [];
  for (const key of ['records', 'results', 'items', 'data', 'hydra:member']) {
    if (Array.isArray(res[key])) return res[key];
  }
  for (const v of Object.values(res)) if (Array.isArray(v)) return v as any[];
  return [];
}

const text = (v: unknown) => JSON.stringify(v ?? '');

/** Query a module by one field condition; returns the rows. */
function query(module: string, filters: any[], extra: Record<string, unknown> = {}): any[] {
  return rowsOf(toolkit('query_records', { module, filters, limit: 100, ...extra }));
}

function moduleExists(): boolean {
  try {
    toolkit('describe_module', { module: MODULE });
    return true;
  } catch (err: any) {
    if (!/not found|does not exist|unknown module/i.test(String(err.message))) throw err;
    return false;
  }
}

const SEEDS = [
  { hostname: 'db-server-01', ip_address: '203.0.113.10', owner: 'dba-team', criticality: 'Critical' },
  { hostname: 'web-server-01', ip_address: '203.0.113.20', owner: 'web-team', criticality: 'Medium' },
  { hostname: 'jump-host-01', ip_address: '203.0.113.30', owner: 'secops', criticality: 'High' },
];

test('chapter 7 - users, modules and records', async ({ gui, local, capture }) => {
  test.setTimeout(30 * 60 * 1000);

  if (shouldRunStep('fsa07-01-bulk-triage')) await test.step('fsa07-01-bulk-triage', async () => {
    const lab = () => query('alerts', [{ field: 'name', operator: 'like', value: 'Agent Lab' }])
      .filter((r) => String(r.name || '').startsWith('Agent Lab'));
    const isOpen = (r: any) => /\bOpen\b/.test(text(r.status));
    const isInvestigating = (r: any) => /Investigating/.test(text(r.status));

    // Precondition: there is an Open batch to move (seed two markers if the
    // chapter 2 alerts are not Open). Marker alerts are removed again below.
    const markers: string[] = [];
    if (!lab().some(isOpen)) {
      for (const suffix of ['A', 'B']) {
        const out = toolkit('create_record', { module: 'alerts', data: { name: `Agent Lab bulk triage marker ${suffix}`, status: 'Open' } });
        markers.push(out['@id'] || `/api/3/alerts/${out.uuid}`);
      }
    }
    const openBefore = lab().filter(isOpen);
    expect(openBefore.length, 'no Open "Agent Lab" alert to triage').toBeGreaterThan(0);

    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '01-bulk-triage', 1));
      await capture.screen('fsa07-01-bulk-triage', screen, TITLE);
    } else {
      // Same mechanism without the agent: one update per matching alert.
      for (const r of openBefore) {
        toolkit('update_record', { module: 'alerts', ref: r['@id'] || `/api/3/alerts/${r.uuid}`, data: { status: 'Investigating' } });
      }
    }

    // Effect: nothing named "Agent Lab..." is still Open; the batch is Investigating.
    const after = lab();
    expect(after.filter(isOpen), 'Open Agent Lab alerts remain').toHaveLength(0);
    expect(after.filter(isInvestigating).length).toBeGreaterThanOrEqual(openBefore.length);

    for (const ref of markers) toolkit('delete_record', { module: 'alerts', ref, confirm: true });
  });

  if (shouldRunStep('fsa07-02-create-module')) await test.step('fsa07-02-create-module', async () => {
    if (RUN_AGENT) {
      // provision_module is tier-3 and confirm-gated: agentTurn answers the gate.
      // Skipped when the module already exists (the agent would only re-verify).
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '02-create-a-module', 1), {
        confirm: 'Yes, go ahead and publish it.',
        timeoutMs: 600_000,
      });
      await capture.screen('fsa07-02-create-module', screen, TITLE);
    } else if (!moduleExists()) {
      toolkit('provision_module', {
        module: MODULE,
        label: 'Agent Lab Assets',
        fields: [
          { name: 'hostname', type: 'text', required: true },
          { name: 'ip_address', type: 'text' },
          { name: 'owner', type: 'text' },
          { name: 'criticality', type: 'picklist', picklist: 'Severity' },
          { name: 'notes', type: 'richtext' },
        ],
        confirm: true,
      });
    }

    // Effect: the module has the five fields and the key can write to it.
    const schema = text(toolkit('describe_module', { module: MODULE }));
    for (const f of ['hostname', 'ip_address', 'owner', 'criticality', 'notes']) expect(schema).toContain(f);
    toolkit('get_or_create_record', { module: MODULE, data: { hostname: 'build-server-01', criticality: 'High' }, key: 'hostname' });
    const probe = query(MODULE, [{ field: 'hostname', operator: 'eq', value: 'build-server-01' }]);
    expect(probe.length, 'build-server-01 probe record missing').toBeGreaterThan(0);
    expect(text(probe[0].criticality)).toContain('High');

    // UI: the new module in the left navigation / list. goToModuleList reloads
    // the app state, so the module appears without a manual browser reload.
    const soar = await gui('soar');
    await goToModuleList(soar, MODULE);
    await expect(soar.getByText('build-server-01').first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa07-02-create-module-ui', { mask: uiMask(soar), scrub: false });
  });

  if (shouldRunStep('fsa07-03-seed-records')) await test.step('fsa07-03-seed-records', async () => {
    const hostnames = () => query(MODULE, [{ field: 'hostname', operator: 'like', value: '-' }]).map((r) => r.hostname);
    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '03-work-with-records', 1));
      await capture.screen('fsa07-03-seed-records', screen, TITLE);
    } else {
      for (const data of SEEDS) toolkit('get_or_create_record', { module: MODULE, data, key: 'hostname' });
    }

    // Effect: all three seeds exist exactly once (upsert, not blind create).
    const names = hostnames();
    for (const s of SEEDS) expect(names.filter((n) => n === s.hostname), `${s.hostname} count`).toHaveLength(1);

    // Effect: the page's query. High or Critical, sorted by hostname.
    const hi = query(
      MODULE,
      [
        { field: 'criticality.itemValue', operator: 'eq', value: 'Critical' },
        { field: 'criticality.itemValue', operator: 'eq', value: 'High' },
      ],
      { logic: 'OR', sort: [{ field: 'hostname', direction: 'ASC' }] },
    ).map((r) => r.hostname);
    expect(hi).toEqual(expect.arrayContaining(['db-server-01', 'jump-host-01']));
    expect(hi).not.toContain('web-server-01');

    // UI: the grid. IPs are TEST-NET documentation ranges, so the scrub backstop
    // is relaxed for this shot only.
    const soar = await gui('soar');
    await goToModuleList(soar, MODULE);
    await expect(soar.getByText('db-server-01').first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa07-03-seed-records-grid', { mask: uiMask(soar), scrub: false });
  });

  if (shouldRunStep('fsa07-04-record-lifecycle')) await test.step('fsa07-04-record-lifecycle', async () => {
    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '03-work-with-records', 2));
      await capture.screen('fsa07-04-record-lifecycle', screen, TITLE);
    }

    // Effect: the lifecycle of db-server-01 has a create event.
    const rec = query(MODULE, [{ field: 'hostname', operator: 'eq', value: 'db-server-01' }])[0];
    expect(rec, 'db-server-01 not found').toBeTruthy();
    const life = toolkit('record_lifecycle', { entity_uuid: rec.uuid || String(rec['@id']).split('/').pop() });
    expect(life.summary).toBeTruthy();
    expect(text(life)).toMatch(/creat/i);
  });
});
