// Chapter 7 - users, modules and records (Part 2: the agent WRITES to the box).
// Four documented steps: bulk triage, create a custom module, seed records, read
// the record lifecycle. Each step has two halves:
//   1. the agent half (PRIMARY): a real Claude Code TUI turn driven by the
//      page's OWN prompt (promptFor) and captured with capture.screen. It spends
//      credits, so it runs when SPEND_AI=1 (the workshop-wide spend gate). With
//      SPEND_AI unset the TUI captures are skipped (logged, not green) and the
//      toolkit performs the write instead so the effect half still has work.
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
// Env: SPEND_AI=1 for the agent captures; DOCUBOT_SEED=1 seeds the Agent Lab
// alerts (labSeed('seed')); DOCUBOT_MCP_CONFIG for startAgent. The module and
// records are CREATED by the agent in steps 02/03, so they are not pre-seeded.
//
// Prerequisites: the read-only guard is OFF in DOCUBOT_MCP_CONFIG (no
// FSR_MCP_READONLY); the chapter 2 "Agent Lab" alerts exist and are Open for
// fsa07-01 (the spec resets the Agent Lab alerts to the seeded demo set first).
import { clearGridFilter, expect, filterGridRow, goToModuleList, test } from 'docubot';
import { agentScreen, agentTurn, promptFor, startAgent } from '../lib/agentlab';
import { labSeed, queryRows, toolkit } from 'docubot';
import { shouldRunStep } from 'docubot';

// Mask only truly sensitive values; the scrub backstop still refuses a real lab
// IP, hostname, key or sensitive term. These grids show TEST-NET documentation
// IPs (203.0.113.x, which pass), dates, and record UUIDs (read as key-like tokens
// but not secrets, and no real key renders here), so those categories are skipped.
const SKIP_RECORD = { scrubSkip: ['date-or-time', 'key-like-token'] };

test.describe.configure({ mode: 'serial' });

const CHAPTER = '07-users-modules-records';
const MODULE = 'agentlab_assets';
const RUN_AGENT = process.env.SPEND_AI === '1';

const text = (v: unknown) => JSON.stringify(v ?? '');
const query = queryRows;

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

  // CONFIGURE: gated so a plain capture run never mutates the box. Seeds the
  // five "Agent Lab" demo alerts that fsa07-01 triages (idempotent). The custom
  // module and its records are built by the agent itself in 02/03.
  if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
    labSeed('seed');
  });
  if (!RUN_AGENT) console.log('[ch07] agent-TUI captures skipped: set SPEND_AI=1 (spends credits); effect checks still run');

  if (shouldRunStep('fsa07-01-bulk-triage')) await test.step('fsa07-01-bulk-triage', async () => {
    const lab = () => query('alerts', [{ field: 'name', operator: 'like', value: '%Agent Lab%' }], { fields: ['name', 'status'] })
      .filter((r) => String(r.name || '').startsWith('Agent Lab'));
    const isOpen = (r: any) => /\bOpen\b/.test(text(r.status));
    const isInvestigating = (r: any) => /Investigating/.test(text(r.status));

    // Precondition: exactly the seeded demo alerts, all Open. Earlier chapters and
    // reruns leave extra "Agent Lab" alerts behind, which would change what the
    // agent moves; the reset returns the box to the page's starting state.
    labSeed('reset-alerts');
    const openBefore = lab().filter(isOpen);
    expect(openBefore.length, 'the reset should leave every demo alert Open').toBe(lab().length);
    expect(openBefore.length, 'no Open "Agent Lab" alert to triage').toBeGreaterThan(0);

    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '01-bulk-triage', 1));
      await capture.screen('fsa07-01-bulk-triage', screen, agentScreen());
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

  });

  if (shouldRunStep('fsa07-02-create-module')) await test.step('fsa07-02-create-module', async () => {
    if (RUN_AGENT) {
      // provision_module is tier-3 and confirm-gated: agentTurn answers the gate.
      // Skipped when the module already exists (the agent would only re-verify).
      // The page has the agent create build-server-01 as its test record; remove
      // earlier runs' copies so a rerun does not add a duplicate.
      if (moduleExists()) labSeed('delete-records', MODULE, 'hostname', 'build-server-01');
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '02-create-a-module', 1), {
        confirm: 'Yes, go ahead and publish it.',
        timeoutMs: 600_000,
      });
      await capture.screen('fsa07-02-create-module', screen, agentScreen());
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
    const probe = query(MODULE, [{ field: 'hostname', operator: 'eq', value: 'build-server-01' }], { fields: ['hostname', 'criticality'] });
    expect(probe.length, 'build-server-01 probe record missing').toBeGreaterThan(0);
    expect(text(probe[0].criticality)).toContain('High');

    // UI: the new module in the left navigation / list. goToModuleList reloads
    // the app state, so the module appears without a manual browser reload.
    const soar = await gui('soar');
    await goToModuleList(soar, MODULE);
    await filterGridRow(soar, 'build-server-01', { column: 'hostname' }); // the module step created it
    await capture.shot(soar, 'fsa07-02-create-module-ui', SKIP_RECORD);
  });

  if (shouldRunStep('fsa07-03-seed-records')) await test.step('fsa07-03-seed-records', async () => {
    expect(moduleExists(), 'agentlab_assets missing: run fsa07-02 first').toBe(true);
    const hostnames = () => query(MODULE, [{ field: 'hostname', operator: 'like', value: '%-%' }], { fields: ['hostname'] }).map((r) => r.hostname);
    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '03-work-with-records', 1));
      await capture.screen('fsa07-03-seed-records', screen, agentScreen());
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
      { logic: 'OR', sort: [{ field: 'hostname', direction: 'ASC' }], fields: ['hostname', 'criticality'] },
    ).map((r) => r.hostname);
    expect(hi).toEqual(expect.arrayContaining(['db-server-01', 'jump-host-01']));
    expect(hi).not.toContain('web-server-01');

    // UI: the grid. IPs are TEST-NET documentation ranges (safe to show).
    const soar = await gui('soar');
    await goToModuleList(soar, MODULE);
    await filterGridRow(soar, 'db-server-01', { column: 'hostname' }); // run fsa07-03 (agent or toolkit) first
    // Show all the seeded assets, not just the row the filter proved exists.
    await clearGridFilter(soar, { column: 'hostname' });
    await capture.shot(soar, 'fsa07-03-seed-records-grid', SKIP_RECORD);
  });

  if (shouldRunStep('fsa07-04-record-lifecycle')) await test.step('fsa07-04-record-lifecycle', async () => {
    if (RUN_AGENT) {
      const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
      const screen = await agentTurn(agent, promptFor(CHAPTER, '03-work-with-records', 2));
      await capture.screen('fsa07-04-record-lifecycle', screen, agentScreen());
    }

    // Effect: the lifecycle of db-server-01 has a create event.
    const rec = query(MODULE, [{ field: 'hostname', operator: 'eq', value: 'db-server-01' }])[0];
    expect(rec, 'db-server-01 not found').toBeTruthy();
    const life = toolkit('record_lifecycle', { entity_uuid: rec.uuid || String(rec['@id']).split('/').pop() });
    expect(life.summary).toBeTruthy();
    expect(text(life)).toMatch(/creat/i);
  });
});
