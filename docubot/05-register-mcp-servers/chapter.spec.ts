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
import {
  askFortiSOARAssistant, clearMcpServerFilter, deleteMcpServer, expect, BUILT_IN_MCP_SERVERS, fillAgentConfig, fillConnectMcpServer,
  findAlert, findMcpServerRow, lastChatToolSpans, mcpServerListRow, mcpStatus, openMcpServer, openMcpServers, openRecord,
  readAgentConfig, saveAgentConfig, saveMcpServer, test,
  skipStep,
} from 'docubot';
import { labSeed, pageMd, shellShot, shouldRunStep } from '../lib/agentlab';
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test.describe.configure({ mode: 'serial' });

// Mask only truly sensitive values. These pages show MCP server URLs that are
// localhost (built-ins) or public (deepwiki), which are not lab secrets, so they
// stay visible; the scrub backstop still refuses a real lab IP, hostname, key or
// sensitive term. On-screen dates are legitimate content (scrubSkip date-or-time).
const SKIP = { scrubSkip: ['date-or-time'] };

const NAME = 'agentlab-deepwiki';
const SERVER_URL = 'https://mcp.deepwiki.com/mcp';
const BUILT_IN = ['FortiSOAR Module Management', 'FortiSOAR Playbook Management', 'SOC Framework', 'Utility Tools'];
const AGENT = process.env.DOCUBOT_CH05_AGENT || 'Alert Investigation';
// fsa05-05 proves a granted tool runs, in-domain, through the chat. The chat is
// domain-guarded, so it will not ask an off-domain remote server (DeepWiki); it
// WILL enrich an indicator with the built-in SOC Framework enrich_indicator tool.
// REPUTATION_IP must be an IP FortiGuard currently rates (live IPs de-list).
const REPUTATION_IP = process.env.REPUTATION_IP || '204.168.212.68';
const QUESTION = `What is the reputation of the IP ${REPUTATION_IP}? Use your tools to enrich this indicator.`;

test('chapter 5 - register MCP servers', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (![
    'fsa05-01-validate-register',
    'fsa05-02-status-check',
    'fsa05-03-register-remote',
    'fsa05-03-register-remote-tools',
    'fsa05-04-grant-allowlist',
    'fsa05-05-chat-runs-tool',
  ].some(shouldRunStep)) return;
  const soar = await gui('soar');
  const origin = new URL(soar.url()).origin;
  const ownsLab = shouldRunStep('fsa05-01-validate-register');

  try {
    if (process.env.DOCUBOT_SEED === '1') await test.step('configure: seed prerequisites', async () => {
      // fsa05-01 builds the server by hand; only seed it for runs that skip that step.
      if (!shouldRunStep('fsa05-01-validate-register')) labSeed('mcp-server');
    });

    // A leftover from an interrupted run would make the name collide.
    if (ownsLab) await deleteMcpServer(soar, NAME);

    if (shouldRunStep('fsa05-01-validate-register')) await test.step('fsa05-01-validate-register', async () => {
      const modal = await fillConnectMcpServer(soar, origin, {
        name: NAME,
        description: 'Lab: DeepWiki remote server (public, no credentials)',
        transport: 'http',
        url: SERVER_URL,
        authType: 'None',
      });
      // The student types this URL, so it MUST be visible. It is the public
      // DeepWiki endpoint, not a lab secret; the backstop stays on and passes it.
      await capture.shot(soar, 'fsa05-01-validate-register-connect-form', {
        target: modal,
        ...SKIP,
      });
      // Validate first: Save stays disabled until the handshake succeeds. Effect:
      // the row was persisted with a UUID.
      const row = await saveMcpServer(soar, modal, NAME);
      expect(row['@id']).toContain('/api/3/mcp_configurations/');
    });

    if (shouldRunStep('fsa05-02-status-check')) await test.step('fsa05-02-status-check', async () => {
      // API ground truth: the status route answers for the whole box (a poisoned
      // authentication row would make it fail for every server) and lists ours.
      const status = JSON.stringify(await mcpStatus(soar));
      expect(status).toContain(NAME);
      expect(status, 'status route lists a built-in server too').toMatch(/Utility Tools|SOC Framework|Module Management/);
      const row = await findMcpServerRow(soar, NAME);
      expect(row, `no ${NAME} row: run fsa05-01 or seed it with DOCUBOT_SEED=1`).toBeTruthy();
      expect(row?.active, 'registered server is active').toBe(true);

      await openMcpServers(soar, origin);
      for (const name of [NAME, ...BUILT_IN]) {
        await mcpServerListRow(soar, name).catch(() => {
          throw new Error(`"${name}" missing from the MCP Servers page (run fsa05-01 / DOCUBOT_SEED=1, or a box without that built-in)`);
        });
      }
      // Leave the grid unfiltered for the capture.
      await clearMcpServerFilter(soar);
      // The Url column shows each server's address: localhost for the built-ins,
      // the public deepwiki host for the lab server. None are lab secrets, so the
      // column stays visible; the backstop still refuses a real lab host.
      await capture.shot(soar, 'fsa05-02-status-check-servers-page', SKIP);
    });

    if (shouldRunStep('fsa05-03-register-remote')) await test.step('fsa05-03-register-remote', async () => {
      // Validate, then show the saved server. Validate runs the real handshake and
      // lists the tools; this dialog is cancelled (never saved), so it leaves no row.
      // A dialog under the registered name cannot test (the name is taken), so the
      // validate-only dialog uses a scratch name and is cancelled, never saved.
      const modal = await fillConnectMcpServer(soar, origin, {
        name: `${NAME}-validate`,
        description: 'Lab: DeepWiki remote server (public, no credentials)',
        transport: 'http',
        url: SERVER_URL,
        authType: 'None',
      });
      await modal.getByRole('button', { name: 'Test Connection' }).click();
      // Save enables only after the handshake returns a tool list (saveMcpServer's signal).
      await expect(modal.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 120_000 });
      await capture.shot(soar, 'fsa05-03-register-remote-validate', { target: modal, ...SKIP });
      const cancel = modal.getByRole('button', { name: /^Cancel$|^Close$/i }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click();
      else await soar.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);

      // The saved server, as the MCP Servers list shows it.
      await openMcpServers(soar, origin);
      const savedRow = await mcpServerListRow(soar, NAME);
      await clearMcpServerFilter(soar);
      await capture.shot(soar, 'fsa05-03-register-remote-saved', { highlight: savedRow, ...SKIP });

      // Registration itself was proven by fsa05-01; this step reads the stored
      // row back and checks it is the remote (external, http) shape.
      const row = await findMcpServerRow(soar, NAME);
      expect(row, `no ${NAME} row: run fsa05-01 or seed it with DOCUBOT_SEED=1`).toBeTruthy();
      expect(row!.type).toBe('external');
      expect(row!.transport).toBe('http');
      // authentication must be stored as a string (the JSON-string rule), never an object.
      expect(typeof row!.authentication === 'string' || row!.authentication == null).toBe(true);
    });

    // Click the saved server: its detail panel lists the tools the server returned.
    if (shouldRunStep('fsa05-03-register-remote-tools')) await test.step('fsa05-03-register-remote-tools', async () => {
      const origin = new URL(soar.url()).origin;
      await openMcpServer(soar, origin, NAME);
      const tools = soar.getByText(/^\s*Tools \(\d+\):?\s*$/).first();
      await tools.waitFor({ timeout: 30_000 });
      // Effect: the server's own tool names came back (a real discovery, not an empty list).
      const n = Number(((await tools.innerText()).match(/\d+/) || ['0'])[0]);
      expect(n, 'the server returned at least one tool').toBeGreaterThan(0);
      const list = soar.getByText(/ask_wiki_question/).first();
      await expect(list).toBeVisible();
      await capture.shot(soar, 'fsa05-03-register-remote-tools', { highlight: [tools, list], ...SKIP });
    });

    if (shouldRunStep('fsa05-04-grant-allowlist')) await test.step('fsa05-04-grant-allowlist', async () => {
      // Content Hub > AI Agents > agent detail > Configurations. The server must
      // already be registered (fsa05-01 or the mcp-server seed). The config form is
      // a set of <select>s (Configuration Type, Name, LLM Provider, MCP Server,
      // Masking Agent); "Custom Configuration" is an <option>, not clickable text.
      expect(await findMcpServerRow(soar, NAME), `no ${NAME} server to grant: run fsa05-01 or seed it with DOCUBOT_SEED=1`).toBeTruthy();
      // A custom configuration REPLACES the default server list: keep the built-in
      // servers selected, or the agent loses SOC Framework and every later
      // investigation silently stops writing its verdict back to the alert.
      await fillAgentConfig(soar, origin, AGENT, { name: 'Agent Lab DeepWiki', mcpServer: [...BUILT_IN_MCP_SERVERS, NAME] });
      await capture.shot(soar, 'fsa05-04-grant-allowlist-agent-config', SKIP);
      if (process.env.DOCUBOT_CH05_GRANT !== '1') {
        console.log('[ch05] fsa05-04 not saved: set DOCUBOT_CH05_GRANT=1 to save the grant on the agent');
        return;
      }
      await saveAgentConfig(soar);
      // Verify the write, not the card: read the saved config back.
      const serverUuid = (await findMcpServerRow(soar, NAME))?.uuid;
      const cfg = await readAgentConfig(soar, AGENT);
      expect(cfg?.config?.config_type, 'the saved config is the custom one').toBe('custom');
      expect(JSON.stringify(cfg?.config?.mcp_server || []), 'the lab server is granted on the agent').toContain(String(serverUuid));
      const soc = (await findMcpServerRow(soar, 'SOC Framework'))?.uuid;
      expect(JSON.stringify(cfg?.config?.mcp_server || []), 'SOC Framework stays granted (it writes the investigation verdict)').toContain(String(soc));
    });

    if (shouldRunStep('fsa05-05-chat-runs-tool')) await test.step('fsa05-05-chat-runs-tool', async () => {
      // Spends FortiAI credits. Uses the built-in SOC Framework server the chat
      // already carries, so it does NOT need the DeepWiki grant from fsa05-04.
      if (process.env.SPEND_AI !== '1') {
        skipStep('fsa05-05-chat-runs-tool', 'set SPEND_AI=1 (spends FortiAI credits)');
        return;
      }
      // The AI Assistant launcher only appears on a record-detail page.
      const alert = await findAlert(soar, /./);
      expect(alert, 'need at least one alert to open the AI Assistant from').toBeTruthy();
      await openRecord(soar, 'alerts', alert!.id, { tab: 'Alert Details' });

      const { answer } = await askFortiSOARAssistant(soar, QUESTION);
      // The answer must name the intelligence source and a verdict, not just echo
      // the question. If this fails with "no reputation", the IP has de-listed -
      // refresh REPUTATION_IP from the FortiGuard feed (see the chapter note).
      // Assert on the ANSWER bubble; the question itself says "reputation".
      expect(answer).toMatch(/fortiguard|malicious|phishing|command-and-control|malware|categor/i);
      // The answer names the PUBLIC threat IP being enriched; the scan can't tell a
      // public IP from a lab one, so skip ip-address here. The lab box address is
      // still guarded by the sensitive-term category (the base-URL host).
      await capture.shot(soar, 'fsa05-05-chat-runs-tool-answer', { scrubSkip: ['ip-address', 'date-or-time'] });

      // Prove the tool actually fired: the latest Chat Assistant trace must carry a
      // TOOL span for enrich_indicator. Read through the app's own session.
      const toolSpans = await lastChatToolSpans(soar);
      const enrich = toolSpans.find((s) => s?.name === 'enrich_indicator');
      expect(enrich, 'the chat called the enrich_indicator tool').toBeTruthy();
      expect(
        JSON.stringify(enrich?.output || {}),
        'the enrich_indicator result came from the SOC Framework server',
      ).toContain('SOC Framework');
    });
  } finally {
    // Leave the box as found, even when a step failed.
    if (ownsLab && process.env.DOCUBOT_KEEP_LAB !== '1') await deleteMcpServer(soar, NAME).catch(() => undefined);
  }
});

// Page 03 s2: the curl handshake against the weather-lab example, on localhost. The
// example is copied to a scratch folder, its own venv and server commands run from
// the page (the first two lines are setup, the last line serves it), and the page's
// four curl commands run as a script: the same commands, with the protocol version
// and the session ID filled in from the first response. The shot is the terminal
// output of that script (bash -v shows each command as it runs). The server is
// stopped afterwards. FSA_LAB_SCRATCH picks the scratch root (default: a temp folder).
const WEATHER_LAB = path.join(__dirname, '..', '..', 'static', 'examples', 'mcp-servers', 'weather-lab');
const LAB_PORT_URL = 'http://localhost:8000/mcp';

/** The bash fence on a page whose text matches `marker`. */
function bashFence(md: string, marker: RegExp): string {
  for (const m of md.matchAll(/```bash\n([\s\S]*?)```/g)) if (marker.test(m[1])) return m[1].replace(/\n+$/, '');
  throw new Error(`no bash fence matching ${marker} on the page`);
}

test('chapter 5 - curl handshake', async ({ capture }) => {
  test.setTimeout(15 * 60 * 1000);
  if (!shouldRunStep('fsa05-06-handshake')) return;

  await test.step('fsa05-06-handshake', async () => {
    const md = pageMd('05-register-mcp-servers', '03-advanced-build-your-own');
    const serve = bashFence(md, /python3 -m venv/).split('\n');
    const handshake = bashFence(md, /# 1\. initialize/);
    const dir = path.join(process.env.FSA_LAB_SCRATCH || path.join(os.tmpdir(), 'fsa-workshop'), 'weather-lab');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(WEATHER_LAB, dir, { recursive: true });

    // Setup: the page's venv and install lines, in the scratch copy.
    execFileSync('bash', ['-c', serve.slice(0, -1).join('\n')], { cwd: dir, encoding: 'utf8', timeout: 5 * 60 * 1000 });
    // Serve: the page's uvicorn line, in its own process group so it can be stopped.
    const log = fs.openSync(path.join(dir, 'server.log'), 'w');
    const server = spawn('bash', ['-c', `. .venv/bin/activate && ${serve[serve.length - 1]}`], { cwd: dir, detached: true, stdio: ['ignore', log, log] });
    try {
      const deadline = Date.now() + 60_000;
      for (;;) {
        const code = (() => { try { return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', LAB_PORT_URL], { encoding: 'utf8' }); } catch { return '000'; } })();
        if (code !== '000') break;
        if (Date.now() > deadline) throw new Error(`the weather-lab server did not answer on ${LAB_PORT_URL}: see ${path.join(dir, 'server.log')}`);
        await new Promise((r) => setTimeout(r, 500));
      }

      // The protocol version the SDK supports, from the server's own venv (the page's instruction).
      const version = execFileSync(path.join(dir, '.venv', 'bin', 'python'), ['-c', 'from mcp.types import LATEST_PROTOCOL_VERSION as v; print(v)'], { encoding: 'utf8' }).trim();
      // The four curl commands as the page writes them, one script. Command 1's headers go to init.txt,
      // and the session ID it returns is read from there for commands 2 to 4.
      const chunks = handshake.split('\n\n');
      if (chunks.length !== 4) throw new Error(`the page's handshake fence has ${chunks.length} commands, expected 4`);
      const script = [
        chunks[0] + ' | tee init.txt',
        "SID=$(tr -d '\\r' < init.txt | awk -F': ' 'tolower($1)==\"mcp-session-id\"{print $2}')",
        ...chunks.slice(1).map((c) => c.split('<session-id-from-step-1>').join('$SID')),
      ].join('\n\n').split('<protocol-version-your-sdk-supports>').join(version);
      fs.writeFileSync(path.join(dir, 'handshake.sh'), script + '\n', { mode: 0o600 });

      await shellShot(capture, 'fsa05-06-handshake-curl', {
        command: 'bash -v handshake.sh',
        cwd: dir,
        from: /^# 1\. initialize/,
        // Checked on the masked output: the session ID came back, the tool list names get_forecast, and the forecast returned.
        expect: [/mcp-session-id/i, /"name":"get_forecast"/, /Sunny, 24 C/],
        timeoutMs: 3 * 60 * 1000,
      });
    } finally {
      try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* already stopped */ }
      fs.closeSync(log);
    }
  });
});
