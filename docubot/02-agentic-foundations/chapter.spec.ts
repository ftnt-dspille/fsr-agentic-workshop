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
// Live-only (needs the box). Verify one spec at a time through Playwright
// (never `docubot run`, which starts every spec):
//   DOCUBOT_TARGET=<repo> FSR_ENV_FILE=<repo>/.env.lab \
//   node_modules/.bin/playwright test --config=<kit>/playwright.config.ts \
//   --tsconfig=<kit>/tsconfig.json <repo>/docubot/02-agentic-foundations/chapter.spec.ts
// The tour is free and read-only; only fsa02-05's in-product assistant turn
// needs SPEND_AI=1.
import { expect, test, skipStep } from 'docubot';
import { BUILT_IN_MCP_SERVERS, askFortiSOARAssistant, escapeRe, fillRecordForm, findAlert, fsrRecordKind, fsrScratchHandlers, goToModuleList, ngGo, openAgentDetail, openAgentDetailTab, openAiFeaturesSetup, openAiPrompts, openDiscover, openMcpServer, openMcpServers, openNewRecordForm, openOrgContextRecord, openRecord, orgContextRow, selectDetailTab, submitForm, waitForAlert, waitForRecordSettled } from 'docubot/products/fortisoar';
import { anyStepSelected, shouldRunStep, SCRUB, ScratchRun } from 'docubot';

test.describe.configure({ mode: 'serial' });

// Every alert this run creates is tagged with the run id (a scratch ledger entry). The test's start sweeps the ones a
// run that died left behind (only those its ledger names, never anyone else's alert); afterEach deletes this run's own
// and checks they are gone, failing the run when a delete does not take.
let scratch: ScratchRun | undefined;
test.afterEach(async () => { await scratch?.teardown(); });

// On-screen dates are intended content on these tour pages; the scan still
// refuses a real lab IP or hostname.
const SKIP = SCRUB.dates;

test('chapter 2 - agentic foundations', async ({ gui, capture }) => {
  test.setTimeout(10 * 60 * 1000);
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (!anyStepSelected([
    'fsa02-00-create-alert',
    'fsa02-01-ai-enabled',
    'fsa02-02-agent-catalog',
    'fsa02-02-agent-settings',
    'fsa02-03-mcp-server-detail',
    'fsa02-03-mcp-servers',
    'fsa02-04-sop-compare',
    'fsa02-04-sop-detail',
    'fsa02-05-assistant-readonly',
  ])) return;
  const soar = await gui('soar');
  const tags = scratch = new ScratchRun(fsrScratchHandlers(soar, ['alerts']));
  await tags.sweep();

  if (shouldRunStep('fsa02-00-create-alert')) await test.step('fsa02-00-create-alert', async () => {
    if (process.env.DOCUBOT_CREATE_ALERT !== '1') {
      skipStep('fsa02-00-create-alert', 'set DOCUBOT_CREATE_ALERT=1 to create an alert in the UI');
      return;
    }
    // Alerts dedupe on Source + Source ID and the page's documented values are fixed: an earlier run's alert is
    // removed by the sweep (tagged ones only) and this run's own by the teardown.
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
    const created = await waitForAlert(soar, new RegExp(escapeRe(name)), {
      attempts: 30,
      intervalMs: 1_000,
    });
    tags.track({ kind: fsrRecordKind('alerts'), id: created.id, label: name });
    await ngGo(soar, 'viewPanel.modulesDetail', { module: 'alerts', id: created.id });
    await selectDetailTab(soar, 'Alert Details');
    await expect(soar.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  if (shouldRunStep('fsa02-01-ai-enabled')) await test.step('fsa02-01-ai-enabled', async () => {
    await openAiPrompts(soar);   // /ai-configuration/prompts, settles on the AI Configuration header
    // The AI area opens with no enablement banner (enablement itself lives under
    // System > FortiAI, an admin screen, not here).
    await expect(soar.locator('text=AI feature not enabled')).toHaveCount(0);

    await openAiFeaturesSetup(soar);   // /system/system-configuration/ai-features-setup, settles on the headline
    // This page shows FortiSOAR's audit sentence with the enablement date; that
    // date is intended content, so the scan skips date-or-time (not the host/IP).
    // A box whose FortiAI token balance is spent renders a "Failed to load token
    // data ... Connector :: <name>" banner here; mask that transient error (its
    // connector name reads as a key-like token) so the picture shows the page's
    // own content. On a recharged box the banner is absent, the mask matches
    // nothing, and the same capture is clean.
    await capture.shot(soar, 'fsa02-01-ai-enabled', {
      ...SKIP,
      maskText: [/Insufficient tokens remaining/],
    });
  });

  // Manual step fsa02-02-agent-catalog: the analyst reads each Triage/Insight
  // agent's profile by hand; the catalog view (Content Hub > Discover, filtered to
  // AI Agent) is captured here.
  if (shouldRunStep('fsa02-02-agent-catalog')) await test.step('fsa02-02-agent-catalog', async () => {
    await openDiscover(soar, { only: ['AI Agent'] });
    await expect(soar.getByText('Alert Investigation', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-02-agent-catalog', SKIP);
  });

  // Open one agent's settings so the reader sees the LLM profile, the MCP servers
  // it may use, and its masking agent - not just the catalog card.
  if (shouldRunStep('fsa02-02-agent-settings')) await test.step('fsa02-02-agent-settings', async () => {
    const uuid = await openAgentDetail(soar, 'Alert Investigation');
    expect(uuid, 'Alert Investigation agent is in the catalog').toBeTruthy();
    await openAgentDetailTab(soar, 'Configurations');
    await expect(soar.getByText(/LLM Provider/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(soar.getByText(/MCP Server/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-02-agent-settings', SKIP);
  });

  if (shouldRunStep('fsa02-03-mcp-servers')) await test.step('fsa02-03-mcp-servers', async () => {
    await openMcpServers(soar);
    // The four built-ins are the kit's list (aiAgents.ts) — one source of truth,
    // so a build that adds a server updates every consumer.
    for (const name of BUILT_IN_MCP_SERVERS) {
      await expect(soar.getByText(name).first()).toBeVisible({ timeout: 30_000 });
    }
    // The Url column shows each server's endpoint; on 8.0.1 the built-ins are on
    // localhost (not a lab host), so they are left visible.
    await capture.shot(soar, 'fsa02-03-mcp-servers', SKIP);
  });

  // Open one MCP server so the reader sees its transport, URL and the tools it
  // exposes (Discovered Capabilities), not just the server's name in a list.
  if (shouldRunStep('fsa02-03-mcp-server-detail')) await test.step('fsa02-03-mcp-server-detail', async () => {
    await openMcpServer(soar, 'SOC Framework');
    await expect(soar.getByText(/Discovered Capabilities/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-03-mcp-server-detail', SKIP);
  });

  if (shouldRunStep('fsa02-04-sop-compare')) await test.step('fsa02-04-sop-compare', async () => {
    // The org-context grid paginates, so filter the Title column to "SOP -" and
    // confirm the Malware SOP is among the matched rows.
    await orgContextRow(soar, 'SOP -', 'SOP - Malware Detection');
    await capture.shot(soar, 'fsa02-04-sop-compare', SKIP);
  });

  // Open one SOP record so the reader sees its question list, which chapter 3
  // compares against the questions the planner actually writes.
  if (shouldRunStep('fsa02-04-sop-detail')) await test.step('fsa02-04-sop-detail', async () => {
    const uuid = await openOrgContextRecord(soar, 'SOP -', 'SOP - Malware Detection');
    expect(uuid, 'the Malware SOP record opened').toBeTruthy();
    await expect(soar.getByText(/Questions/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa02-04-sop-detail', SKIP);
  });

  if (shouldRunStep('fsa02-05-assistant-readonly')) await test.step('fsa02-05-assistant-readonly', async () => {
    // FortiAI spend is opt-in. The page keeps this as a manual exercise unless
    // SPEND_AI=1 explicitly authorizes a real assistant turn and its capture.
    if (process.env.SPEND_AI !== '1') {
      skipStep('fsa02-05-assistant-readonly', 'set SPEND_AI=1 to spend FortiAI tokens');
      return;
    }
    // A settled seeded alert (the oldest beaconing one), not one fsa02-00 just
    // created while the chapter 8 playbook may still be rewriting it.
    const alert = (await findAlert(soar, /Agent Lab - beaconing/i, { search: 'Agent Lab - beaconing', oldest: true }))
      || (await findAlert(soar, /./));
    expect(alert, 'create at least one alert before asking the assistant').toBeTruthy();
    // Alert Details is the right context behind the drawer; the record can open on
    // a remembered tab (e.g. AI Investigation), so select it explicitly.
    await openRecord(soar, 'alerts', alert!.id, { tab: 'Alert Details' });
    const { answer } = await askFortiSOARAssistant(
      soar,
      'Summarize this alert\'s severity and source. Do not repeat IP addresses, hostnames, usernames, dates, or record identifiers. Do not change anything.',
    );
    // Assert on the ANSWER bubble; the question itself contains these words.
    expect(answer, 'the assistant answered with the severity').toMatch(/critical|high|medium|low/i);
    await waitForRecordSettled(soar);
    await capture.shot(soar, 'fsa02-05-assistant-readonly', SKIP);
  });
});
