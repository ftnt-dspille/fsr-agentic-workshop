// Chapter 2 - agentic foundations: a read-only orientation tour of the AI
// screens. Every capture is a UI screenshot (gui device + capture.shot); nothing
// here drives the agent, spends FortiAI tokens, or writes to the box. The manual
// steps (reading the catalog, the token-spending assistant turn) are performed by
// a person; their on-screen views are still captured here.
//
// Migrated from the pre-docubot spec tools/e2e/captures/ch02.spec.js (routes and
// the Content Hub AI-Agent filter come from there). Verify on a box with
// `docubot run --chapter 02-agentic-foundations`.
import { askFortiSOARAssistant, expect, fillRecordForm, findAlert, goToModuleList, ngGo, openNewRecordForm, submitForm, test, waitForAlert } from 'docubot';
import { shouldRunStep, uiMask } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

test('chapter 2 - agentic foundations', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;

  if (shouldRunStep('fsa02-00-create-alert')) await test.step('fsa02-00-create-alert', async () => {
    if (process.env.DOCUBOT_CREATE_ALERT !== '1') {
      console.log('[ch02] fsa02-00-create-alert skipped: set DOCUBOT_CREATE_ALERT=1 to create an alert in the UI');
      return;
    }
    const name = `Agent Lab - orientation ${Date.now()}`;
    await goToModuleList(soar, 'alerts');
    await openNewRecordForm(soar, /Add\s+Alert/i);
    await fillRecordForm(soar, {
      name,
      source: 'edr-sensor-01',
      sourceId: '203.0.113.42',
    }, { richText: [JSON.stringify({
        alert_type: 'Suspicious Outbound Connection',
        indicator: '203.0.113.42',
        source: 'edr-sensor-01',
        severity_raw: 'high',
      }, null, 2)] });
    await capture.shot(soar, 'fsa02-00-create-alert', { mask: uiMask(soar), scrub: false });
    await submitForm(soar);
    const created = await waitForAlert(soar, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      attempts: 30,
      intervalMs: 1_000,
    });
    await ngGo(soar, 'viewPanel.modulesDetail', { module: 'alerts', id: created.id });
    await expect(soar.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  if (shouldRunStep('fsa02-01-ai-enabled')) await test.step('fsa02-01-ai-enabled', async () => {
    await soar.goto(`${origin}/ai-configuration/prompts`, { waitUntil: 'domcontentloaded' });
    // The AI area opens with no enablement banner (enablement itself lives under
    // System > FortiAI, an admin screen, not here).
    await expect(soar.locator('text=AI feature not enabled')).toHaveCount(0);
    // The AI area loaded (the Prompts page under AI Configurations). Match loosely:
    // 8.0.1 shows "Prompts" as the title with "AI Configurations" in the breadcrumb.
    await expect(soar.getByText(/AI Configuration/i).first()).toBeVisible({ timeout: 30_000 });

    await soar.goto(`${origin}/system/system-configuration/ai-features-setup`, { waitUntil: 'domcontentloaded' });
    await expect(soar.getByText('Unlock AI-powered investigation and analysis')).toBeVisible({ timeout: 30_000 });
    // This page intentionally shows FortiSOAR's audit sentence with the
    // enablement date. Keep that useful UI text visible; URL masking remains on.
    await capture.shot(soar, 'fsa02-01-ai-enabled', { mask: uiMask(soar), scrub: false });
  });

  // Manual step fsa02-02-agent-catalog: the analyst reads each Triage/Insight
  // agent's profile by hand; the catalog view (Content Hub > Discover, filtered to
  // AI Agent) is captured here. The Discover route presets the Connectors filter,
  // so untick it and tick AI Agent.
  if (shouldRunStep('fsa02-02-agent-catalog')) await test.step('fsa02-02-agent-catalog', async () => {
    await soar.goto(`${origin}/connectors`, { waitUntil: 'domcontentloaded' });
    await soar.getByText('Discover', { exact: true }).first().click();
    const contentType = (label: string) =>
      soar.evaluate((text: string) => {
        const box = [...document.querySelectorAll('div, section')].find(
          (el) =>
            /Content Type/.test((el as HTMLElement).innerText || '') &&
            el.querySelector('input[type=checkbox]') &&
            (el as HTMLElement).innerText.length < 400,
        );
        const hit =
          box &&
          [...box.querySelectorAll('label, span, div')].find(
            (el) => el.children.length === 0 && (el as HTMLElement).innerText.trim() === text,
          );
        if (!hit) throw new Error(`Content Type filter "${text}" not found`);
        (hit as HTMLElement).click();
      }, label);
    await contentType('Connectors');
    await contentType('AI Agent');
    await expect(soar.getByText('Filtered by:').first()).toBeVisible({ timeout: 30_000 });
    // Gate the shot on the grid actually re-rendering to AI agents: wait for a
    // shipped AI agent card (Alert Investigation) so a slow grid never leaves
    // connector/solution-pack cards in the capture.
    await expect(soar.getByText('Alert Investigation', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-02-agent-catalog', {
      mask: uiMask(soar),
    });
  });

  if (shouldRunStep('fsa02-03-mcp-servers')) await test.step('fsa02-03-mcp-servers', async () => {
    await soar.goto(`${origin}/ai-configuration/mcp-servers`, { waitUntil: 'domcontentloaded' });
    // Assert the four built-in families that ship on every 8.0.1 box. Any
    // externally registered server (FortiSIEM, deepwiki) is box-specific, so it
    // is not asserted here; it still appears in the capture when present.
    for (const name of [
      'FortiSOAR Module Management',
      'FortiSOAR Playbook Management',
      'SOC Framework',
      'Utility Tools',
    ]) {
      await expect(soar.getByText(name).first()).toBeVisible({ timeout: 30_000 });
    }
    // The Url column shows each server's endpoint, which on a real box carries the
    // appliance host/IP. Mask those cells; the page names the servers, not URLs.
    await capture.shot(soar, 'fsa02-03-mcp-servers', {
      mask: uiMask(soar),
    });
  });

  if (shouldRunStep('fsa02-04-sop-compare')) await test.step('fsa02-04-sop-compare', async () => {
    await soar.goto(`${origin}/ai-configuration/organizational-context`, { waitUntil: 'domcontentloaded' });
    // 66 org-context records span several pages, so the investigation SOPs are
    // not on the first page. Filter the Title column (the grid's own column
    // filter, not the top-bar search) to "SOP -" so the SOP records render at the
    // top, then confirm the Malware SOP is among them. This replaces a
    // filter-debounce sleep with a wait on the matched row.
    await soar.locator('input[name="title"][placeholder="Search" i]').first().fill('SOP -');
    await expect(
      soar.locator('.ui-grid-row').filter({ hasText: 'SOP - Malware Detection' }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-04-sop-compare', { mask: uiMask(soar) });
  });

  if (shouldRunStep('fsa02-05-assistant-readonly')) await test.step('fsa02-05-assistant-readonly', async () => {
    // FortiAI spend is opt-in. The page keeps this as a manual exercise unless
    // SPEND_AI=1 explicitly authorizes a real assistant turn and its capture.
    if (process.env.SPEND_AI !== '1') {
      console.log('[ch02] fsa02-05-assistant-readonly skipped: set SPEND_AI=1 to spend FortiAI tokens');
      return;
    }
    const alert = (await findAlert(soar, /Agent Lab/i, { search: 'Agent Lab' })) || (await findAlert(soar, /./));
    expect(alert, 'create at least one alert before asking the assistant').toBeTruthy();
    await ngGo(soar, 'viewPanel.modulesDetail', { module: 'alerts', id: alert!.id });
    const { drawer } = await askFortiSOARAssistant(
      soar,
      'Summarize this alert\'s severity and source. Do not repeat IP addresses, hostnames, usernames, dates, or record identifiers. Do not change anything.',
    );
    await expect(drawer).toContainText(/severity|source/i);
    // Keep the alert detail behind the drawer so the answer has context. The
    // lesson's alert indicators remain visible; only default URL masking applies.
    await capture.shot(soar, 'fsa02-05-assistant-readonly', {
      mask: uiMask(soar),
      scrub: false,
    });
  });
});
