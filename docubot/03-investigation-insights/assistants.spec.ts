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
// The containment request in fsa03-23 is always REJECTED (decline is the default
// for a capture) and the step proves nothing was written. The approve lab
// (fsa03-25..27) asks the same thing again in a fresh conversation, this time
// with a triage ahead of it (the evidence guard defers a containment card that
// arrives cold), approves the FortiGate block card, reads the effect back from
// the gate's ban list -- never off the chat -- and undoes it with one click of
// the Undo the Monitor's autonomy tab offers on the executed action.
//
// Verify on a box with
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=playwright.config.ts 03-investigation-insights/assistants
import { expect, test, skipStep } from 'docubot';
import {
  apiViaApp, askFortiSOARAssistant, askAgenticAssistant, closeAgenticAssistant, decideAgenticCard, findAlert,
  newAgenticConversation, openMonitor, openMonitorTab, openRecord, openAgenticAssistant, pendingDecisions,
  sh, tapChatFeed, verdictCards, waitForRecordSettled, waitForIndicatorsExtracted, labSeed,
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
  'fsa03-25-agentic-assistant-approve',
  'fsa03-26-agentic-assistant-executed',
  'fsa03-27-agentic-assistant-undo',
] as const;

// The approve lab works on the FortiGate the lab connector is configured for
// (Enterprise_Core): the staged action is fortigate-firewall.block_ip_new,
// "Quarantine Based", whose effect is the gate's ban list (user/banned). The
// effect is read through the same connector configuration the action ran on --
// never off the chat. The `clear` mode is the self-heal for a run that died
// between approve and undo.
const LAB_IP = '203.0.113.99';

const FGT_STATE_PY = `
import json, os, sys
from pyfsr import FortiSOAR
IP = "${LAB_IP}"
c = FortiSOAR.from_env_file(os.environ["FSR_ENV_FILE"])
params = {"method": "Quarantine Based"}
r = c.connectors.execute("fortigate-firewall", "get_blocked_ip", config="Enterprise_Core", params=params)
if not r.ok:
    sys.exit("get_blocked_ip failed: %s" % r.status)
present = IP in json.dumps(r.data, default=str)
if sys.argv[1] == "clear" and present:
    c.connectors.execute("fortigate-firewall", "unblock_ip", config="Enterprise_Core",
                         params={"method": "Quarantine Based", "ip_addresses": IP})
    r = c.connectors.execute("fortigate-firewall", "get_blocked_ip", config="Enterprise_Core", params=params)
    if not r.ok:
        sys.exit("get_blocked_ip failed: %s" % r.status)
    present = IP in json.dumps(r.data, default=str)
print("present" if present else "absent")
`;

const fgtState = (mode: 'check' | 'clear'): string =>
  sh(process.env.FSR_PYTHON || 'python3', ['-c', FGT_STATE_PY, mode]).trim();

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

  // ---- Approve, verify, undo --------------------------------------------
  // The gate poll. The action runs during the resumed turn, so the ban list is
  // usually set by the time decideAgenticCard returns; poll anyway.
  const waitForFgt = async (want: boolean, seconds = 90): Promise<boolean> => {
    const deadline = Date.now() + seconds * 1000;
    for (;;) {
      if (fgtState('check') === (want ? 'present' : 'absent')) return true;
      if (Date.now() > deadline) return false;
      await soar.waitForTimeout(5000);
    }
  };
  // The executed block's row in the Monitor's autonomy tab. Undoable rows can
  // only ever be this lab's kind of action (the undo spec exists only for the
  // FortiGate block pair); prefer the one that names the lab IP or operation.
  const undoableRow = async () => {
    const rows = soar.locator('[data-testid="sm-autonomy-decision"]')
      .filter({ has: soar.locator('[data-testid="sm-autonomy-undo"]') });
    const lab = rows.filter({ hasText: new RegExp(`${LAB_IP}|block_ip_new`, 'i') });
    return (await lab.count()) ? lab.first() : rows.first();
  };

  if (shouldRunStep('fsa03-25-agentic-assistant-approve')) await test.step('fsa03-25-agentic-assistant-approve', async () => {
    if (!SPEND) { skipStep('fsa03-25-agentic-assistant-approve', 'set SPEND_AI=1 to spend FortiAI tokens'); return; }
    // Self-heal a run that died between approve and undo: lift the leftover block first.
    fgtState('clear');
    if (fgtState('check') === 'present') {
      skipStep('fsa03-25-agentic-assistant-approve', 'the FortiGate still holds the block from an earlier run; lift it first');
      return;
    }
    if (!(await soar.locator('[data-testid="chat-input"]').isVisible().catch(() => false))) {
      await openAgenticAssistant(soar, origin, 'alerts', alertId);
    }
    await newAgenticConversation(soar);
    // The evidence guard defers a containment card that arrives cold: triage
    // first, in the same conversation, then ask for the containment.
    await askAgenticAssistant(soar, feed, 'Triage this alert. Give me a verdict and the evidence behind it.');
    // Naming the IP and the verb keeps the ask unambiguous: "the block list"
    // alone once read as a record write, and the model answered with a fresh
    // verdict card instead of staging the action.
    await askAgenticAssistant(soar, feed, `Contain this: block ${LAB_IP} now.`);
    // The assistant sometimes answers a containment ask with another verdict
    // card instead of staging the action: the enrichment rates the lab IP
    // clean while the alert's C2 feed says malicious, and the model oscillates
    // between re-verdicting and acting, promising the block in the card's
    // summary but never staging it. A person would nudge. Each reply is more
    // decisive than the last; none names a tool.
    for (const nudge of [
      'Go ahead.',
      'Yes, block that IP now. Do not re-analyze.',
      'The C2 evidence is conclusive. Block the IP and stage it for my approval.',
    ]) {
      if ((await pendingDecisions(soar)) > 0) break;
      await askAgenticAssistant(soar, feed, nudge);
    }
    if ((await pendingDecisions(soar)) === 0) {
      skipStep('fsa03-25-agentic-assistant-approve', 'the assistant did not stage a write for approval on this turn (read the transcript)');
      return;
    }
    // Approving the wrong action would be a real incident: assert the operation
    // before the click. The kit's pendingActionCard is not exported yet, so read
    // the card the same way it does: the bare `connector.operation` line.
    const card = soar.locator('[data-testid^="action-card-"]:visible').last();
    const hasCard = (await card.count()) > 0;
    const op = hasCard
      ? (await card.innerText()).split('\n').map((l) => l.trim()).find((l) => /^[a-z0-9_.-]+\.[a-z0-9_]+$/i.test(l)) || ''
      : '';
    expect(op, hasCard ? 'the staged action is the FortiGate block' : 'the assistant staged an approval card, not a connector action')
      .toBe('fortigate-firewall.block_ip_new');
    await decideAgenticCard(soar, feed, 'approve', {
      onCard: async () => {
        await capture.shot(soar, 'fsa03-25-agentic-assistant-approve', {
          ...SKIP,
          mask: [soar.locator('.arg-desc', { hasText: /1\.1\.1\.1|2\.2\.2\.2/ })],
        });
      },
    });
    // The card proves nothing: read the effect back from the gate, never off the chat.
    expect(await waitForFgt(true), 'the approved block reached the FortiGate ban list').toBeTruthy();
  });

  if (shouldRunStep('fsa03-26-agentic-assistant-executed')) await test.step('fsa03-26-agentic-assistant-executed', async () => {
    // The lead's view of the same event: the Monitor's autonomy tab lists what ran.
    await openMonitor(soar, origin);
    await openMonitorTab(soar, 'autonomy');
    const row = await undoableRow();
    if (!(await row.isVisible().catch(() => false))) {
      skipStep('fsa03-26-agentic-assistant-executed', 'no executed FortiGate block in the Monitor (run fsa03-25 first)');
      return;
    }
    await capture.shot(soar, 'fsa03-26-agentic-assistant-executed', SKIP);
  });

  if (shouldRunStep('fsa03-27-agentic-assistant-undo')) await test.step('fsa03-27-agentic-assistant-undo', async () => {
    // The reverse is one click: the Undo on the executed action runs the paired unblock.
    if (!(await soar.locator('[data-testid="sm-tab-autonomy"]').isVisible().catch(() => false))) {
      await openMonitor(soar, origin);
      await openMonitorTab(soar, 'autonomy');
    }
    const row = await undoableRow();
    if (!(await row.isVisible().catch(() => false))) {
      skipStep('fsa03-27-agentic-assistant-undo', 'no executed FortiGate block to undo (run fsa03-25 first)');
      return;
    }
    await row.locator('[data-testid="sm-autonomy-undo"]').click();
    // A successful undo clears canUndo, so the row loses its Undo button and the
    // undoable-row locator above matches nothing afterwards. The widget sets
    // undone_at locally on success and the Undone note renders beside the
    // reviewer cell; the table lists oldest first, so the newest decision row
    // is the one this step just undid.
    await expect(
      soar.locator('[data-testid="sm-autonomy-decision"]').last().locator('[data-testid="sm-autonomy-undone"]'),
      'the row reads Undone',
    ).toBeVisible({ timeout: 30_000 });
    expect(await waitForFgt(false), 'the undo lifted the block on the FortiGate').toBeTruthy();
    await capture.shot(soar, 'fsa03-27-agentic-assistant-undo', SKIP);
  });
});
