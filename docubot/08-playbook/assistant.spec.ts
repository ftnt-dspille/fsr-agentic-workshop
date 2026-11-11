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
// Verify on a box with
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=playwright.config.ts 08-playbook/assistant
import { expect, skipStep, test } from 'docubot';
import { ScratchRun, anyStepSelected, shouldRunStep, SCRUB } from 'docubot';
import {
  FSR_WORKFLOW_KIND, buildPlaybookWithAgentic, followUpWithAgentic, fsrScratchHandlers, minimizeAgentic,
  openOrCreatePlaybook, savePlaybook, savedPlaybook,
} from 'docubot/products/fortisoar';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
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
