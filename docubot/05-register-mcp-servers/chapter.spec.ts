// Chapter 5 - register MCP servers. Registers the public DeepWiki remote server
// (auth none) through the Connect MCP Server form, checks its row and status,
// grants it to one agent, and (opt-in, spends FortiAI credits) proves the agent
// can use it. UI shots go through the gui device and capture.shot; box effects
// are read back through the app's own authenticated API (apiViaApp), the same
// routes the page names: /api/3/mcp_configurations and /api/ai/mcp/status.
//
// Manual steps (performed by a person, no test.step here, marked `manual` in the
// Markdown): fsa05-06-handshake (curl against a server you run), fsa05-07-json-trap
// (breaks the box on purpose), fsa05-08-byo-profile (bring-your-own LLM, not GA).
//
// Cleanup: the lab server is removed at the end so the box is left as found,
// unless DOCUBOT_KEEP_LAB=1 (keep it to inspect the registration by hand).
//
// Seeding (DOCUBOT_SEED=1): the CONFIGURE step runs `lab_setup.py mcp-server`
// (static/examples/mcp-servers/agentlab-deepwiki.json) ONLY when fsa05-01 is not
// running, so a selective rerun of fsa05-02..05 has the server it reads. When
// fsa05-01 runs it registers the server itself through the UI (that is the
// capture), so seeding first would be deleted by the leftover cleanup. The
// agent grant stays a UI action (fsa05-04); there is no seeder for it.
//
// Opt-ins (everything else is free and read/registration only):
//   DOCUBOT_CH05_GRANT=1   fsa05-04: save the MCP Server selection on the agent
//                          named by DOCUBOT_CH05_AGENT (default Alert Investigation).
//                          Without it the form is filled and captured, never saved.
//   SPEND_AI=1             fsa05-05: ask the chat for an IP's reputation and prove
//                          the enrich_indicator tool fired (spends FortiAI credits).
//                          Uses the built-in SOC Framework server the chat already
//                          has, so it does NOT need the DeepWiki grant. Point
//                          REPUTATION_IP at an IP your FortiGuard feed currently
//                          rates (default 204.168.212.68 - live IPs age out).
//
// Authored offline from the pre-docubot spec tools/e2e/captures/ch05.spec.js;
// verify on a box with `docubot run --chapter 05-register-mcp-servers`.
import { apiViaApp, askFortiSOARAssistant, expect, test } from 'docubot';
import { labSeed, shouldRunStep } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

// Mask only truly sensitive values. These pages show MCP server URLs that are
// localhost (built-ins) or public (deepwiki), which are not lab secrets, so they
// stay visible; the scrub backstop still refuses a real lab IP, hostname, key or
// sensitive term. On-screen dates are legitimate content (scrubSkip date-or-time).
const SKIP = { scrubSkip: ['date-or-time'] };

const NAME = 'agentlab-deepwiki';
const SERVER_URL = 'https://mcp.deepwiki.com/mcp';
const LIST = '/ai-configuration/mcp-servers';
const BUILT_IN = ['FortiSOAR Module Management', 'FortiSOAR Playbook Management', 'SOC Framework', 'Utility Tools'];
const AGENT = process.env.DOCUBOT_CH05_AGENT || 'Alert Investigation';
// fsa05-05 proves a granted tool runs, in-domain, through the chat. The chat is
// domain-guarded, so it will not ask an off-domain remote server (DeepWiki); it
// WILL enrich an indicator with the built-in SOC Framework enrich_indicator tool.
// REPUTATION_IP must be an IP FortiGuard currently rates (live IPs de-list).
const REPUTATION_IP = process.env.REPUTATION_IP || '204.168.212.68';
const QUESTION = `What is the reputation of the IP ${REPUTATION_IP}? Use your tools to enrich this indicator.`;

interface McpRow { '@id'?: string; uuid?: string; name?: string; active?: boolean }

/** Registered MCP rows, read through the app's own session. */
async function mcpRows(soar: any): Promise<McpRow[]> {
  const res: any = await apiViaApp(soar, 'GET', '/api/3/mcp_configurations?$limit=200');
  return (res && (res['hydra:member'] || res.data || res)) as McpRow[];
}

/** Delete the lab server by exact name (never anything else). No-op if absent. */
async function removeLabServer(soar: any): Promise<void> {
  for (const row of await mcpRows(soar)) {
    if (row.name === NAME && row['@id']) await apiViaApp(soar, 'DELETE', row['@id']);
  }
}

test('chapter 5 - register MCP servers', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  const soar = await gui('soar');
  soar.setDefaultTimeout(30_000);
  const origin = new URL(soar.url()).origin;
  const ownsLab = shouldRunStep('fsa05-01-validate-register');

  const openList = async () => {
    await soar.goto(`${origin}${LIST}`, { waitUntil: 'domcontentloaded' });
    await expect(soar.getByText(/MCP Servers?/i).first()).toBeVisible({ timeout: 30_000 });
  };

  const listRow = (name: string) => soar.locator('.ui-grid-row, tr').filter({ hasText: name }).first();

  /** Narrow the servers grid by its Name column when the grid has one, then wait on the matched row. */
  const expectServerRow = async (name: string, why: string) => {
    const search = soar.locator('input[name="name"][placeholder="Search" i]').first();
    if (await search.isVisible().catch(() => false)) await search.fill(name);
    await expect(listRow(name), why).toBeVisible({ timeout: 30_000 });
  };

  try {
    if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
      // fsa05-01 builds the server by hand; only seed it for runs that skip that step.
      if (!shouldRunStep('fsa05-01-validate-register')) labSeed('mcp-server');
    });

    // A leftover from an interrupted run would make the name collide.
    if (ownsLab) await removeLabServer(soar);

    if (shouldRunStep('fsa05-01-validate-register')) await test.step('fsa05-01-validate-register', async () => {
      await openList();
      await soar.getByRole('button', { name: /Connect MCP Server/ }).click();
      const modal = soar.locator('.modal-content');
      await modal.locator('input[type=text]').first().fill(NAME);
      await modal.locator('textarea[name=description]').fill('Lab: DeepWiki remote server (public, no credentials)');
      await modal.locator('select[name=transport]').selectOption('http');
      await modal.locator('input[type=url]').fill(SERVER_URL);
      // After transport=http a required Auth Type select appears; DeepWiki takes None.
      const auth = modal.locator('select[name=auth_type]');
      await expect(auth).toBeVisible();
      await auth.selectOption({ label: 'None' });
      // The student types this URL, so it MUST be visible. It is the public
      // DeepWiki endpoint, not a lab secret; the backstop stays on and passes it.
      await capture.shot(soar, 'fsa05-01-validate-register-connect-form', {
        target: modal,
        ...SKIP,
      });
      // Validate first: Save stays disabled until the handshake succeeds, so its
      // enabled state is the proof that the tool list came back.
      const testConnection = modal.getByRole('button', { name: 'Test Connection' });
      await expect(testConnection).toBeEnabled();
      await testConnection.click();
      const save = modal.getByRole('button', { name: 'Save' });
      await expect(save).toBeEnabled({ timeout: 120_000 });
      await save.click();
      // Effect: the row was persisted, active, with a UUID.
      await expect
        .poll(async () => (await mcpRows(soar)).find((r) => r.name === NAME)?.['@id'] ?? '', { timeout: 30_000 })
        .toContain('/api/3/mcp_configurations/');
    });

    if (shouldRunStep('fsa05-02-status-check')) await test.step('fsa05-02-status-check', async () => {
      // API ground truth: the status route answers for the whole box (a poisoned
      // authentication row would make it fail for every server) and lists ours.
      const status = JSON.stringify(await apiViaApp(soar, 'GET', '/api/ai/mcp/status'));
      expect(status).toContain(NAME);
      expect(status, 'status route lists a built-in server too').toMatch(/Utility Tools|SOC Framework|Module Management/);
      const row = (await mcpRows(soar)).find((r) => r.name === NAME);
      expect(row, `no ${NAME} row: run fsa05-01 or seed it with DOCUBOT_SEED=1`).toBeTruthy();
      expect(row?.active, 'registered server is active').toBe(true);

      await openList();
      await expectServerRow(NAME, `no ${NAME} row on the MCP Servers page: run fsa05-01 or seed it with DOCUBOT_SEED=1`);
      for (const builtIn of BUILT_IN) {
        await expectServerRow(builtIn, `built-in server "${builtIn}" missing from the list (box build without it?)`);
      }
      // Leave the grid unfiltered for the capture.
      const nameFilter = soar.locator('input[name="name"][placeholder="Search" i]').first();
      if (await nameFilter.isVisible().catch(() => false)) await nameFilter.fill('');
      // The Url column shows each server's address: localhost for the built-ins,
      // the public deepwiki host for the lab server. None are lab secrets, so the
      // column stays visible; the backstop still refuses a real lab host.
      await capture.shot(soar, 'fsa05-02-status-check-servers-page', SKIP);
    });

    if (shouldRunStep('fsa05-03-register-remote')) await test.step('fsa05-03-register-remote', async () => {
      // Registration itself was proven by fsa05-01; this step reads the stored
      // row back and checks it is the remote (external, http) shape.
      const row: any = (await mcpRows(soar)).find((r) => r.name === NAME);
      expect(row, `no ${NAME} row: run fsa05-01 or seed it with DOCUBOT_SEED=1`).toBeTruthy();
      expect(row.type).toBe('external');
      expect(row.transport).toBe('http');
      // authentication must be stored as a string (the JSON-string rule), never an object.
      expect(typeof row.authentication === 'string' || row.authentication == null).toBe(true);
    });

    if (shouldRunStep('fsa05-04-grant-allowlist')) await test.step('fsa05-04-grant-allowlist', async () => {
      // Content Hub > AI Agents > agent detail > Configurations. The server must
      // already be registered (fsa05-01 or the mcp-server seed). The config form is
      // a set of <select>s (Configuration Type, Name, LLM Provider, MCP Server,
      // Masking Agent); "Custom Configuration" is an <option>, not clickable text.
      expect(
        (await mcpRows(soar)).some((r) => r.name === NAME),
        `no ${NAME} server to grant: run fsa05-01 or seed it with DOCUBOT_SEED=1`,
      ).toBe(true);
      await soar.goto(`${origin}/content-hub/my-content/?contentType=ai_agent&searchText=${encodeURIComponent(AGENT)}`, {
        waitUntil: 'domcontentloaded',
      });
      const tile = soar.locator('.mp-tile-container').filter({ hasText: AGENT }).first();
      await expect(tile, `agent "${AGENT}" is in the catalog`).toBeVisible({ timeout: 30_000 });
      await tile.click();
      // The detail panel loads async; wait for the Configurations tab before clicking.
      const configTab = soar.getByText(/^Configurations$/i).last();
      await configTab.waitFor({ state: 'visible', timeout: 30_000 });
      await configTab.click();
      const configType = soar.locator('#csForm-config_type');
      await configType.waitFor({ state: 'visible', timeout: 20_000 });
      await configType.selectOption({ label: 'Custom Configuration' });
      // Custom reveals the required fields. Fill them so the grant is valid and the
      // capture shows a complete form.
      const mcpSelect = soar.locator('#csForm-mcp_server');
      await mcpSelect.waitFor({ state: 'visible', timeout: 20_000 });
      await soar.locator('#csForm-name').fill('Agent Lab DeepWiki');
      await soar.locator('#csForm-llm_provider').selectOption({ index: 1 }).catch(() => undefined);
      await expect(
        mcpSelect.locator('option', { hasText: NAME }),
        `${NAME} not offered in the MCP Server field: register it (fsa05-01) or seed with DOCUBOT_SEED=1`,
      ).toHaveCount(1, { timeout: 20_000 });
      await mcpSelect.selectOption({ label: NAME });
      await soar.locator('#csForm-masking_agent').selectOption({ index: 1 }).catch(() => undefined);
      await capture.shot(soar, 'fsa05-04-grant-allowlist-agent-config', SKIP);
      if (process.env.DOCUBOT_CH05_GRANT !== '1') {
        console.log('[ch05] fsa05-04 not saved: set DOCUBOT_CH05_GRANT=1 to save the grant on the agent');
        return;
      }
      // Save stays disabled until every required field (name, LLM provider, MCP
      // server, masking agent) is set; wait for it to enable before clicking. The
      // button carries a leading icon, so match it by its primary class + text,
      // not an exact accessible name.
      const saveBtn = soar.locator('button.btn-primary').filter({ hasText: /^\s*Save\s*$/ }).filter({ visible: true }).first();
      await expect(saveBtn, 'the config form is invalid: a required field is unset').toBeEnabled({ timeout: 30_000 });
      await saveBtn.click();
      await soar.waitForTimeout(2_000);
      // Verify the write, not the card: read the saved config back through the app
      // API. The config route keys on the agent's INTERNAL name (e.g.
      // alert-investigation), which the agent list carries beside the display label.
      const serverUuid = (await mcpRows(soar)).find((r) => r.name === NAME)?.uuid;
      const agents = await apiViaApp<any[]>(soar, 'GET', '/ai/agent/');
      const row = (agents || []).find((a: any) => a?.label === AGENT || a?.name === AGENT);
      expect(row, `agent "${AGENT}" not found in /ai/agent/`).toBeTruthy();
      const cfg = await apiViaApp<any>(soar, 'GET', `/ai/agent/config/${encodeURIComponent(row.name)}/${row.version}`);
      expect(cfg?.config?.config_type, 'the saved config is the custom one').toBe('custom');
      expect(JSON.stringify(cfg?.config?.mcp_server || []), 'the lab server is granted on the agent').toContain(String(serverUuid));
    });

    if (shouldRunStep('fsa05-05-chat-runs-tool')) await test.step('fsa05-05-chat-runs-tool', async () => {
      // Spends FortiAI credits. Uses the built-in SOC Framework server the chat
      // already carries, so it does NOT need the DeepWiki grant from fsa05-04.
      if (process.env.SPEND_AI !== '1') {
        console.log('[ch05] fsa05-05 skipped: set SPEND_AI=1 (spends FortiAI credits)');
        return;
      }
      // The AI Assistant launcher only appears on a record-detail page, so open
      // one alert's detail. query_records through the app's own session.
      const alerts = await apiViaApp<any>(soar, 'GET', '/api/3/alerts?$limit=1');
      const alertIri = (alerts && (alerts['hydra:member'] || alerts.data || [])[0]?.['@id']) as string | undefined;
      expect(alertIri, 'need at least one alert to open the AI Assistant from').toBeTruthy();
      const alertUuid = alertIri!.split('/').pop();
      await soar.goto(`${origin}/modules/view-panel/alerts/${alertUuid}`, { waitUntil: 'domcontentloaded' });

      const { drawer } = await askFortiSOARAssistant(soar, QUESTION);
      // The answer must name the intelligence source and a verdict, not just echo
      // the question. If this fails with "no reputation", the IP has de-listed -
      // refresh REPUTATION_IP from the FortiGuard feed (see the chapter note).
      await expect(drawer).toContainText(/reputation|fortiguard|malicious|phishing|command-and-control|malware/i);
      // The answer names the PUBLIC threat IP being enriched; the scan can't tell a
      // public IP from a lab one, so skip ip-address here. The lab box address is
      // still guarded by the sensitive-term category (the base-URL host).
      await capture.shot(soar, 'fsa05-05-chat-runs-tool-answer', { scrubSkip: ['ip-address', 'date-or-time'] });

      // Prove the tool actually fired: the latest Chat Assistant trace must carry a
      // TOOL span for enrich_indicator. Read through the app's own session.
      const traces = await apiViaApp<any>(soar, 'GET', '/ai/traces/?limit=5');
      const chat = ((traces?.traces || []) as any[]).find((t) => t?.name === 'Chat Assistant');
      expect(chat?.trace_id, 'a Chat Assistant trace was recorded for the turn').toBeTruthy();
      const spans = await apiViaApp<any>(soar, 'GET', `/ai/traces/${chat.trace_id}/spans`);
      const toolSpans = ((spans?.spans || spans || []) as any[]).filter(
        (s) => String(s?.span_type).toUpperCase() === 'TOOL',
      );
      const enrich = toolSpans.find((s) => s?.name === 'enrich_indicator');
      expect(enrich, 'the chat called the enrich_indicator tool').toBeTruthy();
      expect(
        JSON.stringify(enrich?.output || {}),
        'the enrich_indicator result came from the SOC Framework server',
      ).toContain('SOC Framework');
    });
  } finally {
    // Leave the box as found, even when a step failed.
    if (ownsLab && process.env.DOCUBOT_KEEP_LAB !== '1') await removeLabServer(soar).catch(() => undefined);
  }
});
