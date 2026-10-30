// Chapter 2 - agentic foundations: a read-only orientation tour of the AI
// screens. Every capture is a UI screenshot (gui device + capture.shot); nothing
// here drives the agent, spends FortiAI tokens, or writes to the box, except the
// opt-in assistant turn (fsa02-05, SPEND_AI=1). The tour also opens one agent's
// settings, one MCP server and one SOP record so the reader sees the detail, not
// just the lists.
//
// Captures show the box's own URLs (the built-in MCP servers are on localhost,
// the public server is deepwiki) - these are not lab hosts, so they are left
// visible. On-screen dates are legitimate UI content, so the backstop scan skips
// the date-or-time category (scrubSkip); it still refuses a real lab IP/hostname.
//
// Verify on a box with `docubot run --chapter 02-agentic-foundations`.
import {
  askFortiSOARAssistant, expect, fillRecordForm, findAlert, goToModuleList, ngGo,
  openAgentDetail, openAgentDetailTab, openMcpServer, openNewRecordForm, openOrgContextRecord,
  selectDetailTab, submitForm, test, waitForAlert,
} from 'docubot';
import { shouldRunStep } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

// On-screen dates are intended content on these tour pages; the scan still
// refuses a real lab IP or hostname.
const SKIP = { scrubSkip: ['date-or-time'] };

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
    await capture.shot(soar, 'fsa02-00-create-alert', SKIP);
    await submitForm(soar);
    const created = await waitForAlert(soar, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      attempts: 30,
      intervalMs: 1_000,
    });
    await ngGo(soar, 'viewPanel.modulesDetail', { module: 'alerts', id: created.id });
    await selectDetailTab(soar, 'Alert Details');
    await expect(soar.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  if (shouldRunStep('fsa02-01-ai-enabled')) await test.step('fsa02-01-ai-enabled', async () => {
    await soar.goto(`${origin}/ai-configuration/prompts`, { waitUntil: 'domcontentloaded' });
    // The AI area opens with no enablement banner (enablement itself lives under
    // System > FortiAI, an admin screen, not here).
    await expect(soar.locator('text=AI feature not enabled')).toHaveCount(0);
    await expect(soar.getByText(/AI Configuration/i).first()).toBeVisible({ timeout: 30_000 });

    await soar.goto(`${origin}/system/system-configuration/ai-features-setup`, { waitUntil: 'domcontentloaded' });
    await expect(soar.getByText('Unlock AI-powered investigation and analysis')).toBeVisible({ timeout: 30_000 });
    // This page shows FortiSOAR's audit sentence with the enablement date; that
    // date is intended content, so the scan skips date-or-time (not the host/IP).
    await capture.shot(soar, 'fsa02-01-ai-enabled', SKIP);
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
    await expect(soar.getByText('Alert Investigation', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-02-agent-catalog', SKIP);
  });

  // Open one agent's settings so the reader sees the LLM profile, the MCP servers
  // it may use, and its masking agent - not just the catalog card.
  if (shouldRunStep('fsa02-02-agent-settings')) await test.step('fsa02-02-agent-settings', async () => {
    const uuid = await openAgentDetail(soar, origin, 'Alert Investigation');
    expect(uuid, 'Alert Investigation agent is in the catalog').toBeTruthy();
    await openAgentDetailTab(soar, 'Configurations');
    await expect(soar.getByText(/LLM Provider/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(soar.getByText(/MCP Server/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-02-agent-settings', SKIP);
  });

  if (shouldRunStep('fsa02-03-mcp-servers')) await test.step('fsa02-03-mcp-servers', async () => {
    await soar.goto(`${origin}/ai-configuration/mcp-servers`, { waitUntil: 'domcontentloaded' });
    for (const name of [
      'FortiSOAR Module Management',
      'FortiSOAR Playbook Management',
      'SOC Framework',
      'Utility Tools',
    ]) {
      await expect(soar.getByText(name).first()).toBeVisible({ timeout: 30_000 });
    }
    // The Url column shows each server's endpoint; on 8.0.1 the built-ins are on
    // localhost (not a lab host), so they are left visible.
    await capture.shot(soar, 'fsa02-03-mcp-servers', SKIP);
  });

  // Open one MCP server so the reader sees its transport, URL and the tools it
  // exposes (Discovered Capabilities), not just the server's name in a list.
  if (shouldRunStep('fsa02-03-mcp-server-detail')) await test.step('fsa02-03-mcp-server-detail', async () => {
    await openMcpServer(soar, origin, 'SOC Framework');
    await expect(soar.getByText(/Discovered Capabilities/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-03-mcp-server-detail', SKIP);
  });

  if (shouldRunStep('fsa02-04-sop-compare')) await test.step('fsa02-04-sop-compare', async () => {
    await soar.goto(`${origin}/ai-configuration/organizational-context`, { waitUntil: 'domcontentloaded' });
    // 66 org-context records span several pages, so filter the Title column to
    // "SOP -" and confirm the Malware SOP is among the matched rows.
    await soar.locator('input[name="title"][placeholder="Search" i]').first().fill('SOP -');
    await expect(
      soar.locator('.ui-grid-row').filter({ hasText: 'SOP - Malware Detection' }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-04-sop-compare', SKIP);
  });

  // Open one SOP record so the reader sees its question list, which chapter 3
  // compares against the questions the planner actually writes.
  if (shouldRunStep('fsa02-04-sop-detail')) await test.step('fsa02-04-sop-detail', async () => {
    const uuid = await openOrgContextRecord(soar, origin, 'SOP -', 'SOP - Malware Detection');
    expect(uuid, 'the Malware SOP record opened').toBeTruthy();
    await expect(soar.getByText(/Questions/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-04-sop-detail', SKIP);
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
    // Alert Details is the right context behind the drawer; the record can open on
    // a remembered tab (e.g. AI Investigation), so select it explicitly.
    await selectDetailTab(soar, 'Alert Details');
    const { drawer } = await askFortiSOARAssistant(
      soar,
      'Summarize this alert\'s severity and source. Do not repeat IP addresses, hostnames, usernames, dates, or record identifiers. Do not change anything.',
    );
    await expect(drawer).toContainText(/severity|source/i);
    await capture.shot(soar, 'fsa02-05-assistant-readonly', SKIP);
  });
});
