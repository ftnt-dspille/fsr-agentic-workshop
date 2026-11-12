// Chapter 8, page 6 - build with the assistant: the Agentic Assistant on the
// Playbook Designer compiles a plain-English request into steps on the canvas,
// and a follow-up change arrives as an offer the student accepts. The playbook
// is a scratch record: the mid-chapter save exists so the follow-up's Apply has
// a saved base, and the teardown deletes the record; nothing is published.
//
// Spend gate: the build and the follow-up each spend FortiAI tokens; those steps
// run only with SPEND_AI=1. The launcher capture (fsa08-60) is free and always
// runs.
//
// Chapter 8, page 3 - diagnose with the assistant: the same diagnosis the
// terminal agent makes on page 3, asked from the in-product Agentic Assistant
// on the trigger alert. The test seeds its OWN failed run (it never depends on
// a run an earlier step or session left behind), the diagnose turn spends
// FortiAI tokens, and the restore step always republishes the fixed practice
// YAML, so the box never keeps the deliberately broken playbook after this test.
//
// Verify on a box with
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=playwright.config.ts 08-playbook/assistant
import { env, expect, promptYaml, skipStep, test } from 'docubot';
import { ScratchRun, anyStepSelected, shouldRunStep, SCRUB } from 'docubot';
import {
  FSR_WORKFLOW_KIND, askAgenticAssistant, buildPlaybookWithAgentic, followUpWithAgentic, fsrScratchHandlers, labSeed,
  minimizeAgentic, newAgenticConversation, openAgenticAssistant, openOrCreatePlaybook, queryRows, savePlaybook,
  savedPlaybook, tapChatFeed, toolkit,
} from 'docubot/products/fortisoar';

test.describe.configure({ mode: 'serial' });

const SPEND = env.flag('SPEND_AI');
// The designer and the assistant's transcript show dates and record ids as
// legitimate content; the scan still refuses a real lab IP or hostname.
const SKIP = SCRUB.dates;
const STEPS = [
  'fsa08-60-designer-assistant',
  'fsa08-61-build-request',
  'fsa08-62-built-canvas',
  'fsa08-63-followup-offer',
  'fsa08-64-followup-canvas',
] as const;

const BUILD = 'Build a playbook with a manual trigger on alerts: a set_variable step that sets '
  + 'greeting to "hello", then a record step with action update that adds a comment with that '
  + 'greeting to the alert.';
const FOLLOWUP = 'Now add one more step after the comment that sets a variable named done to true.';

test('chapter 8 - build with the assistant', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  if (!anyStepSelected([...STEPS])) return;
  const soar = await gui('soar');
  const scratch = new ScratchRun(fsrScratchHandlers(soar));
  await scratch.sweep();

  // The assistant builds onto the playbook that is open on the designer; a scratch
  // playbook keeps the run's writes deletable.
  const state = await openOrCreatePlaybook(soar, { collection: 'Agent Lab', playbook: 'Agent Lab Assistant Build' });
  expect(state, 'a scratch playbook is open on the designer').toMatch(/opened|created/);
  // Register the scratch playbook for teardown. The collection stays (it is
  // standing lab infrastructure other chapters use); only the playbook is
  // scratch. openOrCreatePlaybook tracks nothing on either path, and the run
  // after a save leaves a REAL saved record behind -- found live: a pass run's
  // teardown deleted nothing and the playbook survived on the box.
  const saved = await savedPlaybook(soar, 'Agent Lab', 'Agent Lab Assistant Build');
  const wfId = saved?.['@id'] ? String(saved['@id']).split('/').pop() : null;
  expect(wfId, 'the scratch playbook resolved for teardown').toBeTruthy();
  if (wfId) scratch.track({ kind: FSR_WORKFLOW_KIND, id: wfId, label: 'Agent Lab Assistant Build' });

  if (shouldRunStep('fsa08-60-designer-assistant')) await test.step('fsa08-60-designer-assistant', async () => {
    await expect(soar.locator('img[title="Agentic Assistant"]').first()).toBeVisible({ timeout: 60_000 });
    await capture.shot(soar, 'fsa08-60-designer-assistant', SKIP);
  });

  if (shouldRunStep('fsa08-61-build-request')) await test.step('fsa08-61-build-request', async () => {
    if (!SPEND) { skipStep('fsa08-61-build-request', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // askAgentic opens the drawer (only when closed) and starts a fresh chat
    // itself; clicking the launcher with the panel already open fails.
    const steps = await buildPlaybookWithAgentic(soar, BUILD, {
      until: (names) => names.length >= 3,
      onPrompt: () => capture.shot(soar, 'fsa08-61-build-request', SKIP),
    });
    expect(steps.length, 'the assistant built the requested steps').toBeGreaterThanOrEqual(3);
  });

  if (shouldRunStep('fsa08-62-built-canvas')) await test.step('fsa08-62-built-canvas', async () => {
    if (!SPEND) { skipStep('fsa08-62-built-canvas', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // The build leaves the drawer docked over the designer; minimize so the
    // picture shows the canvas the student would read.
    await minimizeAgentic(soar);
    await capture.shot(soar, 'fsa08-62-built-canvas', SKIP);
  });

  if (shouldRunStep('fsa08-63-followup-offer')) await test.step('fsa08-63-followup-offer', async () => {
    if (!SPEND) { skipStep('fsa08-63-followup-offer', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // The build's steps sit on the canvas as UNSAVED edits (the assistant never
    // saves on its own), and the widget refuses an Apply over unsaved canvas
    // work -- "Save or discard your changes in the designer first". Save now,
    // so the follow-up's Apply starts from a saved base (and gets a Versions
    // restore point).
    expect(await savePlaybook(soar), 'the built playbook saved').toBe(true);
    // The follow-up reopens the drawer itself (the input is gone after the
    // minimize), asks for one more step, and accepts the offer; the shot rides
    // on the answer that carries it.
    const steps = await followUpWithAgentic(soar, FOLLOWUP, {
      until: (names) => names.length >= 4,
      onAnswer: () => capture.shot(soar, 'fsa08-63-followup-offer', SKIP),
    });
    expect(steps.length, 'the accepted offer reached the canvas').toBeGreaterThanOrEqual(4);
  });

  if (shouldRunStep('fsa08-64-followup-canvas')) await test.step('fsa08-64-followup-canvas', async () => {
    if (!SPEND) { skipStep('fsa08-64-followup-canvas', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // followUpWithAgentic minimized the drawer before returning; the canvas now
    // shows four steps.
    await capture.shot(soar, 'fsa08-64-followup-canvas', SKIP);
  });

  await scratch.teardown();
});

// --- page 3, section 3: diagnose with the in-product assistant --------------

const DIAG_STEPS = [
  'fsa08-04b-seed-failure',
  'fsa08-04b-diagnose-assistant',
  'fsa08-04b-restore-fix',
] as const;

// The page's own words (03-diagnose-a-failed-run.md, section 3), backtick for
// backtick. No tool names: the assistant picks the diagnosis tool itself.
const DIAGNOSE_PROMPT = 'Diagnose the latest failed run of Agent Lab Diagnose Practice. '
  + 'Which step failed, and what is the error verbatim?';

const PRACTICE_PLAYBOOK = 'Agent Lab Diagnose Practice';
const BROKEN_REF = '/api/3/alerts/00000000-0000-0000-0000-000000000000';
const FIXED_REF = "{{ vars.input.records[0]['@id'] }}";
const TRIGGER_PREFIX = 'Agent Lab diag test';

const playbookRows = (name: string): Array<Record<string, unknown>> =>
  queryRows('workflows', [{ field: 'name', operator: 'eq', value: name }]);

// query_records omits isActive, so read the active state from the full record.
function wfActive(uuid: string): boolean {
  const r = toolkit('get_record', { module: 'workflows', ref: uuid }) as Record<string, unknown> | null;
  const rec = (r?.record ?? r) as Record<string, unknown> | null;
  return rec?.isActive === true || rec?.active === true;
}

test('chapter 8 - diagnose with the assistant', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  if (!anyStepSelected([...DIAG_STEPS])) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;
  const feed = tapChatFeed(soar);

  // The page's practice YAML is deliberately broken; the restore publishes it
  // with the fixed record reference, the same replace section 1 asks the agent for.
  const practice = promptYaml('08-playbook', '03-diagnose-a-failed-run',
    'collection: Agent Lab\nvisible: true', '\n\nThen create an alert');
  expect(practice, 'the page no longer carries the broken practice YAML').toContain(BROKEN_REF);

  // Seed also runs for a diagnose-only selection: the diagnose turn needs the
  // failed run and the trigger alert THIS invocation made, not an older one.
  let alertId = '';
  let broke = false;
  try {
    if (shouldRunStep('fsa08-04b-seed-failure') || shouldRunStep('fsa08-04b-diagnose-assistant')) {
      await test.step('fsa08-04b-seed-failure', async () => {
        // A rerun starts clean: drop earlier trigger alerts, then make THIS
        // run's failure (the page's broken YAML, a fresh trigger alert, a
        // finished failed run).
        labSeed('delete-prefix', 'alerts', 'name', TRIGGER_PREFIX);
        expect(toolkit('publish_playbook', { yaml_text: practice }).published).toBe(true);
        broke = true;
        const since = new Date().toISOString();
        const created = toolkit('create_record', {
          module: 'alerts',
          data: { name: `${TRIGGER_PREFIX} (${Date.now()})`, status: 'Open' },
        }) as Record<string, unknown>;
        alertId = String(created.uuid);
        expect(alertId, 'the trigger alert was created').toMatch(/^[0-9a-f-]{36}$/);
        const run = toolkit('wait_for_playbook_run', {
          playbook: PRACTICE_PLAYBOOK, since, timeout: 120,
        }) as Record<string, unknown>;
        expect(run.status).toBe('failed');
      });
    }

    if (shouldRunStep('fsa08-04b-diagnose-assistant')) await test.step('fsa08-04b-diagnose-assistant', async () => {
      if (!SPEND) { skipStep('fsa08-04b-diagnose-assistant', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
      expect(alertId, 'the seed step did not produce a trigger alert').toMatch(/^[0-9a-f-]{36}$/);
      // The drawer opens on the alert that triggered the failed run, the way an
      // analyst would work. The turn is a plain question with no tool names.
      await openAgenticAssistant(soar, origin, 'alerts', alertId);
      await newAgenticConversation(soar);
      const { transcript } = await askAgenticAssistant(soar, feed, DIAGNOSE_PROMPT);
      expect(transcript, 'the assistant named the failing step').toMatch(/Tag Alert/);
      expect(transcript, 'the assistant quoted the failing step error').toMatch(/404|Not Found/i);
      await capture.shot(soar, 'fsa08-04b-diagnose-assistant', { ...SKIP, expect: [/Tag Alert/] });
    });
  } finally {
    // Restore runs whenever this invocation broke the playbook, selected or
    // not: the box must never keep the deliberately broken practice YAML. The
    // failed run itself stays in run history; it is the diagnosis target.
    if (shouldRunStep('fsa08-04b-restore-fix') || broke) {
      await test.step('fsa08-04b-restore-fix', async () => {
        expect(toolkit('publish_playbook', { yaml_text: practice.replace(BROKEN_REF, FIXED_REF) }).published).toBe(true);
        const rowsFound = playbookRows(PRACTICE_PLAYBOOK);
        expect(rowsFound.length, `${PRACTICE_PLAYBOOK} not found on the box`).toBeGreaterThan(0);
        expect(wfActive(String(rowsFound[0]!.uuid))).toBe(true);
        // The trigger alert did its job; drop it with its timestamped name.
        labSeed('delete-prefix', 'alerts', 'name', TRIGGER_PREFIX);
      });
    }
  }
});
