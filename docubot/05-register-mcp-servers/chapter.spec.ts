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
//   SPEND_AI=1             fsa05-05: ask the granted agent the DeepWiki question
//                          (spends FortiAI credits). Needs DOCUBOT_CH05_GRANT=1.
//
// Authored offline from the pre-docubot spec tools/e2e/captures/ch05.spec.js;
// verify on a box with `docubot run --chapter 05-register-mcp-servers`.
import { apiViaApp, askFortiSOARAssistant, expect, test } from 'docubot';
import { labSeed, shouldRunStep, uiMask } from '../lib/agentlab';

test.describe.configure({ mode: 'serial' });

const NAME = 'agentlab-deepwiki';
const SERVER_URL = 'https://mcp.deepwiki.com/mcp';
const LIST = '/ai-configuration/mcp-servers';
const BUILT_IN = ['FortiSOAR Module Management', 'FortiSOAR Playbook Management', 'SOC Framework', 'Utility Tools'];
const AGENT = process.env.DOCUBOT_CH05_AGENT || 'Alert Investigation';
const QUESTION =
  'Using your tools, what does the modelcontextprotocol/python-sdk repository say FastMCP is called in v2?';

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
      // The student types this URL, so it MUST be visible (do not mask or scrub
      // it). The URL is the public DeepWiki endpoint, not a lab secret, and the
      // connect-form panel shows no appliance host, so this leaks nothing.
      await capture.shot(soar, 'fsa05-01-validate-register-connect-form', {
        target: modal,
        scrub: false,
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
      // The Url column is the server address: masked by uiMask (leaf URL text).
      await capture.shot(soar, 'fsa05-02-status-check-servers-page', { mask: uiMask(soar) });
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
      await soar.getByText(/^Configurations$/i).last().click();
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
      await capture.shot(soar, 'fsa05-04-grant-allowlist-agent-config', { mask: uiMask(soar) });
      if (process.env.DOCUBOT_CH05_GRANT !== '1') {
        console.log('[ch05] fsa05-04 not saved: set DOCUBOT_CH05_GRANT=1 to save the grant on the agent');
        return;
      }
      await soar.getByRole('button', { name: /^Save$/ }).first().click();
      await soar.waitForTimeout(2_000);
      // Effect: reopen the agent, switch to Custom, and confirm the server stuck.
      await soar.reload({ waitUntil: 'domcontentloaded' });
      await soar.getByText(/^Configurations$/i).last().click();
      await soar.locator('#csForm-config_type').selectOption({ label: 'Custom Configuration' }).catch(() => undefined);
      await expect(soar.locator('#csForm-mcp_server')).toHaveValue(/.+/, { timeout: 20_000 });
    });

    if (shouldRunStep('fsa05-05-agent-uses-remote')) await test.step('fsa05-05-agent-uses-remote', async () => {
      // Spends FortiAI credits and needs the grant saved by fsa05-04.
      if (process.env.SPEND_AI !== '1' || process.env.DOCUBOT_CH05_GRANT !== '1') {
        console.log('[ch05] fsa05-05 skipped: set SPEND_AI=1 and DOCUBOT_CH05_GRANT=1 (spends FortiAI credits)');
        return;
      }
      // UNVERIFIED flow: asked through the FortiSOAR AI assistant. If the granted
      // agent has its own run surface the lead should swap this for it, and add
      // an openTracePanel assertion that the trace shows a call to the lab server.
      await soar.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' });
      const { drawer } = await askFortiSOARAssistant(soar, QUESTION);
      await expect(drawer).toContainText(/FastMCP|MCPServer/i);
      await capture.shot(soar, 'fsa05-05-agent-uses-remote-answer', { mask: uiMask(soar), scrub: false });
      // The server must still be healthy after the calls.
      expect(JSON.stringify(await apiViaApp(soar, 'GET', '/api/ai/mcp/status'))).toContain(NAME);
    });
  } finally {
    // Leave the box as found, even when a step failed.
    if (ownsLab && process.env.DOCUBOT_KEEP_LAB !== '1') await removeLabServer(soar).catch(() => undefined);
  }
});
