// Chapter 3, page 4 - chat with the assistants: the two chat surfaces FortiSOAR
// shows on a record, side by side.
//   - AI Assistant (built in, launcher "AI Assistant"): read-only Q&A about the
//     page it is opened on.
//   - Agentic Assistant (launcher "Agentic Assistant", the fsr-agentic-assistant
//     connector): conversational triage that ends in a verdict card, and that
//     parks any write on an approval card for the analyst.
//   - Agentic Assistant Monitor: the lead's dashboard over the Agentic Assistant.
//
// Spend gate: every chat turn spends FortiAI tokens, so those steps run only with
// SPEND_AI=1. Without it the spec captures the launchers and the monitor only.
// The containment request is always REJECTED (decline is the default for a
// capture) and the step proves no indicator was written.
//
// Verify on a box with
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=playwright.config.ts 03-investigation-insights/assistants
import { expect, test, skipStep } from 'docubot';
import {
  apiViaApp, askFortiSOARAssistant, askAgenticAssistant, closeAgenticAssistant, decideAgenticCard, findAlert,
  newAgenticConversation, openMonitor, openMonitorTab, openRecord, openAgenticAssistant, pendingDecisions,
  tapChatFeed, verdictCards, waitForRecordSettled, waitForIndicatorsExtracted, labSeed,
} from 'docubot/products/fortisoar';
import { anyStepSelected, shouldRunStep, SCRUB } from 'docubot';

test.describe.configure({ mode: 'serial' });

const SPEND = process.env.SPEND_AI === '1';
// Record pages and the monitor show dates and record UUIDs as legitimate content.
const SKIP = SCRUB.dates;
const STEPS = [
  'fsa03-20-assistant-launchers',
  'fsa03-21-ai-assistant-answer',
  'fsa03-22-agentic-assistant-triage',
  'fsa03-23-agentic-assistant-approval',
  'fsa03-24-agentic-assistant-monitor',
] as const;

test('chapter 3 - chat with the assistants', async ({ gui, capture }) => {
  test.setTimeout(30 * 60 * 1000);
  if (!anyStepSelected([...STEPS])) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;
  const feed = tapChatFeed(soar);

  // The lab's beaconing demo alert. The seeder is idempotent (create-if-absent), the same
  // `lab_setup.py prepare` step students run before chapter 3.
  labSeed('seed');
  const alert = await findAlert(soar, /Agent Lab - beaconing from web-server-01/i, { search: 'Agent Lab - beaconing', oldest: true });
  expect(alert, 'an alert to open the assistants on').toBeTruthy();
  const alertId = alert!.id;
  // A new alert shows "Please wait while Indicators are being extracted" until its state reads
  // "Indicator Extracted"; every capture below opens this alert, so wait once here.
  await waitForIndicatorsExtracted(soar, alertId);

  if (shouldRunStep('fsa03-20-assistant-launchers')) await test.step('fsa03-20-assistant-launchers', async () => {
    await openRecord(soar, 'alerts', alertId, { tab: 'Alert Details' });
    await waitForRecordSettled(soar);
    // Both launchers are on the right edge of the record page; they look alike and differ only by title.
    await expect(soar.locator('img[title="AI Assistant"]').first()).toBeVisible({ timeout: 60_000 });
    await expect(soar.locator('img[title="Agentic Assistant"]').first()).toBeVisible({ timeout: 60_000 });
    await soar.locator('img[title="Agentic Assistant"]').first().hover();
    await capture.shot(soar, 'fsa03-20-assistant-launchers', SKIP);
  });

  if (shouldRunStep('fsa03-21-ai-assistant-answer')) await test.step('fsa03-21-ai-assistant-answer', async () => {
    if (!SPEND) { skipStep('fsa03-21-ai-assistant-answer', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // Alert Details is the context behind the drawer. askFortiSOARAssistant opens the drawer itself: clicking the
    // launcher directly is intercepted by the record dialog that openRecord opens.
    await openRecord(soar, 'alerts', alertId, { tab: 'Alert Details' });
    // The lab alert carries only a documentation-range IP and a fictional host, so the answer may repeat them.
    const { answer } = await askFortiSOARAssistant(soar,
      'What is this alert about, how severe is it, and what should I check first? Do not change anything.');
    // Grounded, not generic: the answer has to talk about THIS alert's beaconing / C2 and its severity.
    expect(String(answer), 'the answer is about this alert').toMatch(/beacon|command.and.control|C2/i);
    expect(String(answer), 'the answer states the severity').toMatch(/high/i);
    await waitForRecordSettled(soar);
    await capture.shot(soar, 'fsa03-21-ai-assistant-answer', SKIP);
  });

  if (shouldRunStep('fsa03-22-agentic-assistant-triage')) await test.step('fsa03-22-agentic-assistant-triage', async () => {
    if (!SPEND) { skipStep('fsa03-22-agentic-assistant-triage', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    await openAgenticAssistant(soar, origin, 'alerts', alertId);
    await newAgenticConversation(soar);
    await askAgenticAssistant(soar, feed, 'Triage this alert. Give me a verdict and the evidence behind it.');
    const cards = await verdictCards(soar);
    expect(cards.length, 'the Agentic Assistant drew a verdict card').toBeGreaterThan(0);
    await capture.shot(soar, 'fsa03-22-agentic-assistant-triage', SKIP);
  });

  if (shouldRunStep('fsa03-23-agentic-assistant-approval')) await test.step('fsa03-23-agentic-assistant-approval', async () => {
    if (!SPEND) { skipStep('fsa03-23-agentic-assistant-approval', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    if (!(await soar.locator('[data-testid="chat-input"]').isVisible().catch(() => false))) {
      await openAgenticAssistant(soar, origin, 'alerts', alertId);
    }
    const before = await apiViaApp<{ 'hydra:member'?: unknown[] } | null>(soar, 'GET', '/api/3/threat_intel_feeds?$limit=1&$orderby=-createDate');
    const newestBefore = JSON.stringify(before?.['hydra:member']?.[0] || null);
    await askAgenticAssistant(soar, feed, 'Contain this: add the source IP of this alert to the block list.');
    // The assistant sometimes announces the action and ends the turn without staging it (a product finding). A
    // person would just say go ahead, so do that once, with no hint about tools.
    if ((await pendingDecisions(soar)) === 0) await askAgenticAssistant(soar, feed, 'Go ahead.');
    if ((await pendingDecisions(soar)) === 0) {
      skipStep('fsa03-23-agentic-assistant-approval', 'the assistant did not stage a write for approval on this turn (read the transcript)');
      return;
    }
    await decideAgenticCard(soar, feed, 'reject', {
      // The connector's own help text on the card's argument form uses 1.1.1.1 / 2.2.2.2 as examples: mask only
      // those help lines. Never mask the inputs (or use maskText, which also caught the input through its example
      // placeholder): IP Addresses is one of them, and masking it hid the staged IP, so the card looked empty.
      onCard: async () => {
        await capture.shot(soar, 'fsa03-23-agentic-assistant-approval', {
          ...SKIP,
          mask: [soar.locator('.arg-desc', { hasText: /1\.1\.1\.1|2\.2\.2\.2/ })],
        });
      },
    });
    const after = await apiViaApp<{ 'hydra:member'?: unknown[] } | null>(soar, 'GET', '/api/3/threat_intel_feeds?$limit=1&$orderby=-createDate');
    expect(JSON.stringify(after?.['hydra:member']?.[0] || null), 'a rejected card writes nothing').toBe(newestBefore);
    await closeAgenticAssistant(soar);
  });

  if (shouldRunStep('fsa03-24-agentic-assistant-monitor')) await test.step('fsa03-24-agentic-assistant-monitor', async () => {
    await openMonitor(soar, origin);
    await openMonitorTab(soar, 'pending');
    await capture.shot(soar, 'fsa03-24-agentic-assistant-monitor', SKIP);
  });
});
