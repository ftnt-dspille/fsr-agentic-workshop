// Chapter 2 - agentic foundations: a read-only orientation tour of the AI
// screens. Every capture is a UI screenshot (the typed FortiSOAR session's shot);
// nothing here drives the agent, spends FortiAI tokens, or writes to the box,
// except the opt-in alert create (fsa02-00, DOCUBOT_CREATE_ALERT=1) and the
// opt-in assistant turn (fsa02-05, spend 'ai': DOCUBOT_SPEND_AI=1). The tour
// also opens one agent's settings, one MCP server and one SOP record so the
// reader sees the detail, not just the lists.
//
// Captures show the box's own URLs (the built-in MCP servers are on localhost,
// the public server is deepwiki) - these are not lab hosts, so they are left
// visible. The content policy is declared once below (fortisoarPolicy: on-screen
// dates are UI content, e-mails are masked); the gate still refuses a real lab
// IP or hostname.
//
// Built with chapter(): one test, steps in declaration order. The FortiSOAR
// session opens on the first step that runs. fsa02-00's alert goes on the
// scratch ledger the moment it exists: teardown deletes it and reads back that
// it is gone; a run that died leaves its ledger, and the next run's sweep
// removes exactly that alert.
//
// Live-only (needs the box). Verify one spec at a time through Playwright
// (never `docubot run`, which starts every spec):
//   DOCUBOT_TARGET=<repo> DOCUBOT_FSR_ENV_FILE=<repo>/.env.lab \
//   node_modules/.bin/playwright test --config=<kit>/playwright.config.ts \
//   --tsconfig=<kit>/tsconfig.json <repo>/docubot/02-agentic-foundations/chapter.spec.ts
import { chapter, env, expect, skipStep, type StepCtx } from 'docubot';
import { BUILT_IN_MCP_SERVERS, askFortiSOARAssistant, escapeRe, fillRecordForm, findAlert, fortisoar, fortisoarPolicy, goToModuleList, ngGo, openAgentDetail, openAgentDetailTab, openAiFeaturesSetup, openAiPrompts, openDiscover, openMcpServer, openMcpServers, openOrgContextRecord, openRecord, orgContextRow, selectDetailTab, submitForm, waitForAlert, waitForRecordSettled, type FortisoarSession } from 'docubot/products/fortisoar';

const ASSISTANT_ANSWER = /critical|high|medium|low/i;

const open = (ctx: StepCtx): Promise<FortisoarSession> => ctx.open(fortisoar, 'soar');

interface AssistantEvidence { alert: string | null; answer: string }

export default chapter('02-agentic-foundations', {
  devices: ['soar'],
  scratch: ['alerts'],
  policy: {
    ...fortisoarPolicy,
    // A box whose FortiAI token balance is spent renders a "Failed to load token
    // data ... Connector :: <name>" banner on the AI features page (fsa02-01);
    // mask that transient error so the picture shows the page's own content. On a
    // recharged box the banner is absent and the mask matches nothing.
    maskText: [...(fortisoarPolicy.maskText ?? []), /Insufficient tokens remaining/],
  },
  steps: {
    'fsa02-00-create-alert': async (ctx) => {
      if (!env.flag('DOCUBOT_CREATE_ALERT')) {
        skipStep('fsa02-00-create-alert', 'set DOCUBOT_CREATE_ALERT=1 to create an alert in the UI');
        return;
      }
      const soar = await open(ctx);
      // Alerts dedupe on Source + Source ID and the page's documented values are fixed: an earlier run's alert is
      // removed by the sweep (ledger entries only) and this run's own by the teardown.
      const name = `Agent Lab - orientation ${Date.now()}`;
      await goToModuleList(soar.page, 'alerts');
      await soar.openNewRecordForm(/Add\s+Alert/i);
      await fillRecordForm(soar.page, {
        name,
        source: 'edr-sensor-01',
        sourceId: '203.0.113.42',
      }, { richText: [JSON.stringify({
          alert_type: 'Suspicious Outbound Connection',
          indicator: '203.0.113.42',
          source: 'edr-sensor-01',
          severity_raw: 'high',
        }, null, 2)] });
      // The picture IS the open form panel.
      await soar.shot('fsa02-00-create-alert', { panel: true, expect: /Source/ });
      await submitForm(soar.page);
      const created = await waitForAlert(soar.page, new RegExp(escapeRe(name)), {
        attempts: 30,
        intervalMs: 1_000,
      });
      ctx.scratch.track({ kind: 'alerts', id: created.id, label: name });
      await ngGo(soar.page, 'viewPanel.modulesDetail', { module: 'alerts', id: created.id });
      await selectDetailTab(soar.page, 'Alert Details');
      await expect(soar.page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      // The record panel survives ui-router navigation: clear it before the tour moves on.
      await soar.reloadAppRoot();
    },

    'fsa02-01-ai-enabled': async (ctx) => {
      const soar = await open(ctx);
      await openAiPrompts(soar.page);   // /ai-configuration/prompts, settles on the AI Configuration header
      // The AI area opens with no enablement banner (enablement itself lives under
      // System > FortiAI, an admin screen, not here).
      await expect(soar.page.locator('text=AI feature not enabled')).toHaveCount(0);

      await openAiFeaturesSetup(soar.page);   // /system/system-configuration/ai-features-setup, settles on the headline
      // This page shows FortiSOAR's audit sentence with the enablement date; that
      // date is intended content (the policy's date-or-time skip).
      await soar.shot('fsa02-01-ai-enabled', { expect: /Enable AI Features/i });
    },

    // Manual step fsa02-02-agent-catalog: the analyst reads each Triage/Insight
    // agent's profile by hand; the catalog view (Content Hub > Discover, filtered to
    // AI Agent) is captured here.
    'fsa02-02-agent-catalog': async (ctx) => {
      const soar = await open(ctx);
      await openDiscover(soar.page, { only: ['AI Agent'] });
      await expect(soar.page.getByText('Alert Investigation', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await soar.shot('fsa02-02-agent-catalog', { expect: 'Alert Investigation' });
    },

    // Open one agent's settings so the reader sees the LLM profile, the MCP servers
    // it may use, and its masking agent - not just the catalog card.
    'fsa02-02-agent-settings': async (ctx) => {
      const soar = await open(ctx);
      const uuid = await openAgentDetail(soar.page, 'Alert Investigation');
      expect(uuid, 'Alert Investigation agent is in the catalog').toBeTruthy();
      await openAgentDetailTab(soar.page, 'Configurations');
      await expect(soar.page.getByText(/LLM Provider/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(soar.page.getByText(/MCP Server/i).first()).toBeVisible({ timeout: 30_000 });
      await soar.shot('fsa02-02-agent-settings', { expect: /LLM Provider/i });
    },

    'fsa02-03-mcp-servers': async (ctx) => {
      const soar = await open(ctx);
      await openMcpServers(soar.page);
      // The four built-ins are the kit's list (aiAgents.ts) - one source of truth,
      // so a build that adds a server updates every consumer.
      for (const name of BUILT_IN_MCP_SERVERS) {
        await expect(soar.page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
      }
      // The Url column shows each server's endpoint; on 8.0.1 the built-ins are on
      // localhost (not a lab host), so they are left visible.
      await soar.shot('fsa02-03-mcp-servers', { expect: BUILT_IN_MCP_SERVERS[0] });
    },

    // Open one MCP server so the reader sees its transport, URL and the tools it
    // exposes (Discovered Capabilities), not just the server's name in a list.
    'fsa02-03-mcp-server-detail': async (ctx) => {
      const soar = await open(ctx);
      await openMcpServer(soar.page, 'SOC Framework');
      await expect(soar.page.getByText(/Discovered Capabilities/i).first()).toBeVisible({ timeout: 30_000 });
      await soar.shot('fsa02-03-mcp-server-detail', { expect: /Discovered Capabilities/i });
    },

    'fsa02-04-sop-compare': async (ctx) => {
      const soar = await open(ctx);
      // The org-context grid paginates, so filter the Title column to "SOP -" and
      // confirm the Malware SOP is among the matched rows.
      await orgContextRow(soar.page, 'SOP -', 'SOP - Malware Detection');
      await soar.shot('fsa02-04-sop-compare', { expect: 'SOP - Malware Detection' });
    },

    // Open one SOP record so the reader sees its question list, which chapter 3
    // compares against the questions the planner actually writes.
    'fsa02-04-sop-detail': async (ctx) => {
      const soar = await open(ctx);
      const uuid = await openOrgContextRecord(soar.page, 'SOP -', 'SOP - Malware Detection');
      expect(uuid, 'the Malware SOP record opened').toBeTruthy();
      await expect(soar.page.getByText(/Questions/i).first()).toBeVisible({ timeout: 30_000 });
      await soar.shot('fsa02-04-sop-detail', { expect: /Questions/i });
      // The record panel survives ui-router navigation: clear it before the next step.
      await soar.reloadAppRoot();
    },

    // FortiAI spend is opt-in (spend 'ai'): the page keeps this as a manual
    // exercise unless DOCUBOT_SPEND_AI=1 authorizes a real assistant turn. The
    // answer is saved as evidence and judged by verify, so `make replay` re-checks
    // it offline without a second turn.
    'fsa02-05-assistant-readonly': {
      spend: 'ai',
      run: async (ctx): Promise<AssistantEvidence> => {
        const soar = await open(ctx);
        // A settled seeded alert (the oldest beaconing one), not one fsa02-00 just
        // created while the chapter 8 playbook may still be rewriting it.
        const alert = (await findAlert(soar.page, /Agent Lab - beaconing/i, { search: 'Agent Lab - beaconing', oldest: true }))
          || (await findAlert(soar.page, /./));
        expect(alert, 'create at least one alert before asking the assistant').toBeTruthy();
        // Alert Details is the right context behind the drawer; the record can open on
        // a remembered tab (e.g. AI Investigation), so select it explicitly.
        await openRecord(soar.page, 'alerts', alert!.id, { tab: 'Alert Details' });
        const { answer } = await askFortiSOARAssistant(
          soar.page,
          'Summarize this alert\'s severity and source. Do not repeat IP addresses, hostnames, usernames, dates, or record identifiers. Do not change anything.',
        );
        await waitForRecordSettled(soar.page);
        await soar.shot('fsa02-05-assistant-readonly', { expect: ASSISTANT_ANSWER });
        return { alert: alert?.id ?? null, answer };
      },
      // Judge the ANSWER bubble; the question itself contains these words.
      verify: (e) => (ASSISTANT_ANSWER.test(e.answer ?? '') ? [] : ['the assistant did not answer with the severity']),
    },
  },
});
