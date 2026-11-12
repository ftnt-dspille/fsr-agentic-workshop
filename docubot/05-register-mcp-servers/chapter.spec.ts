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
//                          REPUTATION_IP at an IP VirusTotal currently rates
//                          (default 204.168.212.68 - live verdicts age out).
//
// Authored offline from the pre-docubot spec tools/e2e/captures/ch05.spec.js.
// Live-only (needs the box). Verify one spec at a time through Playwright
// (never `docubot run`, which starts every spec):
//   DOCUBOT_TARGET=<repo> FSR_ENV_FILE=<repo>/.env.lab \
//   node_modules/.bin/playwright test --config=<kit>/playwright.config.ts \
//   --tsconfig=<kit>/tsconfig.json <repo>/docubot/05-register-mcp-servers/chapter.spec.ts
// Free by default (cleanup leaves the box as found); the opt-ins above
// (DOCUBOT_SEED, DOCUBOT_CH05_GRANT, SPEND_AI, DOCUBOT_KEEP_LAB) decide the rest.
import { env, expect, test, skipStep } from 'docubot';
import { askFortiSOARAssistant, clearMcpServerFilter, BUILT_IN_MCP_SERVERS, FSR_MCP_SERVER_KIND, fsrScratchHandlers, fillAgentConfig, fillConnectMcpServer, findAlert, findMcpServerRow, lastChatToolSpans, mcpServerListRow, mcpServerTools, mcpStatus, openMcpServers, openRecord, readAgentConfig, saveAgentConfig, saveMcpServer, testMcpServerConnection, closeMcpServerModal } from 'docubot/products/fortisoar';
import { shellShot } from '../lib/agentlab';
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SCRUB } from 'docubot';
import { labSeed } from 'docubot/products/fortisoar';
import { anyStepSelected, pollUntil, shouldRunStep } from 'docubot';
import { openAlertRecord } from 'docubot/products/fortisoar';
import { openConnector, openConnectorTab, configOptions, selectConfig, checkConnectorHealth, addConfiguration } from 'docubot/products/fortisoar';
import { pageMd, ScratchRun } from 'docubot';

test.describe.configure({ mode: 'serial' });

// Mask only truly sensitive values. These pages show MCP server URLs that are
// localhost (built-ins) or public (deepwiki), which are not lab secrets, so they
// stay visible; the scrub backstop still refuses a real lab IP, hostname, key or
// sensitive term. On-screen dates are legitimate content (scrubSkip date-or-time).
const SKIP = SCRUB.dates;

const NAME = 'agentlab-deepwiki';
const SERVER_URL = 'https://mcp.deepwiki.com/mcp';
const BUILT_IN = ['FortiSOAR Module Management', 'FortiSOAR Playbook Management', 'SOC Framework', 'Utility Tools'];
const AGENT = process.env.DOCUBOT_CH05_AGENT || 'Alert Investigation';
// fsa05-05 proves a granted tool runs, in-domain, through the chat. The chat is
// domain-guarded, so it will not ask an off-domain remote server (DeepWiki); it
// WILL enrich an indicator with the built-in SOC Framework enrich_indicator tool.
// REPUTATION_IP must be an IP VirusTotal currently rates (live IPs de-list).
const REPUTATION_IP = process.env.REPUTATION_IP || '204.168.212.68';
const QUESTION = `What is the reputation of the IP ${REPUTATION_IP}? Use your tools to enrich this indicator.`;

test('chapter 5 - register MCP servers', async ({ gui, capture }) => {
  test.setTimeout(20 * 60 * 1000);
  // Skip the whole test (and its setup) when --only selects none of its steps.
  if (!anyStepSelected([
    'fsa05-01-validate-register',
    'fsa05-02-status-check',
    'fsa05-03-register-remote',
    'fsa05-03-register-remote-tools',
    'fsa05-04-grant-allowlist',
    'fsa05-05-chat-runs-tool',
  ])) return;
  const soar = await gui('soar');
  const ownsLab = shouldRunStep('fsa05-01-validate-register');
  // The MCP server this run registers is tagged with the run id (a scratch ledger entry); see the sweep and teardown.
  const scratch = new ScratchRun(fsrScratchHandlers(soar));

  try {
    if (env.flag('DOCUBOT_SEED')) await test.step('configure: seed prerequisites', async () => {
      // fsa05-01 builds the server by hand; only seed it for runs that skip that step.
      if (!shouldRunStep('fsa05-01-validate-register')) labSeed('mcp-server');
    });

    // A leftover from an interrupted run would make the name collide: the sweep removes the server a run that died
    // created (tagged in its ledger). A server of that name no run tagged (the lab seed, a student's) is never
    // deleted: fsa05-01 then skips its save and the later steps use the server that is there.
    if (ownsLab) await scratch.sweep();
    const preexisting = ownsLab && !!(await findMcpServerRow(soar, NAME));

    if (shouldRunStep('fsa05-01-validate-register')) await test.step('fsa05-01-validate-register', async () => {
      if (preexisting) {
        skipStep('fsa05-01-validate-register', `${NAME} is already registered (not by this run); left as is`);
        return;
      }
      const modal = await fillConnectMcpServer(soar, {
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
      scratch.track({ kind: FSR_MCP_SERVER_KIND, id: row['@id']!, label: NAME });
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

      await openMcpServers(soar);
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
      const modal = await fillConnectMcpServer(soar, {
        name: `${NAME}-validate`,
        description: 'Lab: DeepWiki remote server (public, no credentials)',
        transport: 'http',
        url: SERVER_URL,
        authType: 'None',
      });
      // Save enables only after the handshake returns a tool list — the same
      // signal saveMcpServer waits on, driven here without saving.
      await testMcpServerConnection(soar, modal);
      await capture.shot(soar, 'fsa05-03-register-remote-validate', { target: modal, ...SKIP });
      await closeMcpServerModal(soar, modal);

      // The saved server, as the MCP Servers list shows it.
      await openMcpServers(soar);
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
      // The kit read: open the panel, wait for the connection to validate, and
      // parse the Discovered Capabilities lists (bold label + sibling names).
      const caps = await mcpServerTools(soar, NAME);
      // Effect: the server's own tool names came back (a real discovery, not an empty list).
      expect(caps.count, 'the server returned at least one tool').toBeGreaterThan(0);
      expect(caps.tools, 'ask_wiki_question is among the discovered tools').toContain('ask_wiki_question');
      await capture.shot(soar, 'fsa05-03-register-remote-tools', {
        highlight: [caps.sectionLabel, caps.toolsNames], ...SKIP,
      });
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
      await fillAgentConfig(soar, AGENT, { name: 'Agent Lab DeepWiki', mcpServer: [...BUILT_IN_MCP_SERVERS, NAME] });
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

    // The stock VirusTotal enrichment playbooks (IP Address > VirusTotal >
    // Enrichment, tag IP_Enrichment) are what enrich_indicator routes IP
    // questions to; they need a VirusTotal API key. The page has the student
    // create the free key and configure the connector; this step drives that
    // same configuration through the UI when the lab env carries the key
    // (FSR_VT_API_KEY), and stays a read-only look once a configuration exists.
    if (shouldRunStep('fsa05-04b-virustotal-config')) await test.step('fsa05-04b-virustotal-config', async () => {
      await openConnector(soar, 'VirusTotal');
      await openConnectorTab(soar, 'Configurations');
      const existing = (await configOptions(soar)).filter((o) => o && !/select/i.test(o));
      if (!existing.length) {
        const key = process.env.FSR_VT_API_KEY || '';
        if (!key) {
          skipStep('fsa05-04b-virustotal-config', 'the VirusTotal connector has no configuration (create the free key per the book, or set FSR_VT_API_KEY to configure it here)');
          return;
        }
        await addConfiguration(soar, {
          name: 'Lab',
          fields: { 'Server URL': 'https://www.virustotal.com', 'API Key': key, 'Verify SSL': false },
          makeDefault: true,
        });
      } else {
        await selectConfig(soar, existing[0]);
      }
      const health = await checkConnectorHealth(soar, existing.length ? existing[0] : 'Lab');
      expect(health.status, 'the VirusTotal configuration health-checks').toBe('Available');
      await capture.shot(soar, 'fsa05-04b-virustotal-config', SKIP);
    });

    if (shouldRunStep('fsa05-05-chat-runs-tool')) await test.step('fsa05-05-chat-runs-tool', async () => {
      // Spends FortiAI credits. Uses the built-in SOC Framework server the chat
      // already carries, so it does NOT need the DeepWiki grant from fsa05-04.
      if (!env.flag('SPEND_AI')) {
        skipStep('fsa05-05-chat-runs-tool', 'set SPEND_AI=1 (spends FortiAI credits)');
        return;
      }
      // The AI Assistant launcher only appears on a record-detail page.
      await openAlertRecord(soar, /./, { tab: 'Alert Details', hint: 'need at least one alert to open the AI Assistant from' });

      const { answer } = await askFortiSOARAssistant(soar, QUESTION);
      // The answer must name the intelligence source and a verdict, not just echo
      // the question. If this fails with "no reputation", the IP has de-listed -
      // refresh REPUTATION_IP to one VirusTotal currently rates malicious.
      // Assert on the ANSWER bubble; the question itself says "reputation".
      expect(answer).toMatch(/virustotal|fortiguard|malicious|phishing|command-and-control|malware|categor/i);
      // The PUBLIC threat IP is deliberately on screen: the question bubble is the
      // page's own example question with <ip> filled in. The scan can't tell a
      // public IP from a lab one, so allow exactly this IP (scrubSkip's categories
      // govern the secret scan, not the OCR gate). The lab box address is still
      // guarded by the sensitive-term category (the base-URL host).
      await capture.shot(soar, 'fsa05-05-chat-runs-tool-answer', {
        scrubSkip: ['ip-address', 'date-or-time'],
        ocrAllow: [new RegExp(REPUTATION_IP.replace(/\./g, '\\.'))],
      });

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
    // A delete that does not take fails the run. DOCUBOT_KEEP_LAB=1 keeps it; the next run's sweep removes it.
    if (ownsLab && !env.flag('DOCUBOT_KEEP_LAB')) await scratch.teardown();
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
      await pollUntil('the weather-lab server', () => {
        const code = (() => { try { return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', LAB_PORT_URL], { encoding: 'utf8' }); } catch { return '000'; } })();
        return code !== '000';
      }, { timeoutMs: 60_000, intervalMs: 500, message: `the weather-lab server did not answer on ${LAB_PORT_URL}: see ${path.join(dir, 'server.log')}` });

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
