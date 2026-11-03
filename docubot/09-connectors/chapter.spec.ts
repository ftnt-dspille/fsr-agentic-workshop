// Chapter 9 — connectors: discover and run, build and deploy agentlab-dadjoke,
// and install one from the Content Hub. Every documented step is automated.
// API effect-checks use the fsr-agentic-toolkit (the same tools the agent
// calls); every agent step is driven in a real Claude Code TUI via docubot's
// local device and captured with capture.screen.
//
// Live-only (needs the box + the agent). Authored against the pre-docubot specs
// tools/e2e/09-connectors.spec.js and tools/e2e/captures/ch09.spec.js; verify on
// a box with `docubot run --chapter 09-connectors`.
import { connectorResultsCount, expect, openConnector, removeConnectorConfiguration, selectConfig, test } from 'docubot';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_CWD, agentScreen, DADJOKE, agentTurn, labSeed, promptFor, shouldRunStep, startAgent, toolkit } from '../lib/agentlab';

// The Content Hub connector the install page names.
const HUB = 'whois-rdap';
const hubInstalled = (): boolean =>
  (toolkit('list_connectors', {}).connectors || []).some((l: string) => String(l).startsWith(`${HUB} `));

test.describe.configure({ mode: 'serial' });

test('chapter 9 — connectors', async ({ gui, local, capture }) => {
  // fsa09-06 and -07 are one conversation (the second prompt says "this connector").
  let hubAgent: Awaited<ReturnType<typeof startAgent>> | undefined;
  test.setTimeout(20 * 60 * 1000);

  if (shouldRunStep('fsa09-01-discover-connectors')) await test.step('fsa09-01-discover-connectors', async () => {
    // Page §1 has two captures: the agent discovering connectors in the TUI, and
    // the Content Hub count that proves the number the agent reported is real.
    // API ground truth first: the live connector count the agent must match.
    const listed = toolkit('list_connectors', {});
    expect(listed.count).toBeGreaterThan(0);

    // TUI capture, driven by the page's OWN discover prompt (promptFor reads the
    // first prompt fence), so the picture matches the words on the page.
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    const screen = await agentTurn(agent, promptFor('09-connectors', '01-explore-and-run', 1));
    await capture.screen('fsa09-01-discover-connectors', screen, agentScreen());

    // UI proof: the Content Hub results count, highlighted. Only the lab URL and
    // keys are ever masked (house rule); the scrub backstop refuses any other leak.
    const soar = await gui('soar');
    const countEl = await connectorResultsCount(soar, new URL(soar.url()).origin);
    await capture.shot(soar, 'fsa09-01-discover-connectors-ui-count', { highlight: countEl });
  });

  if (shouldRunStep('fsa09-02-run-operation')) await test.step('fsa09-02-run-operation', async () => {
    // Page §2 is the agent running a harmless read-only operation and
    // interpreting the result, captured in the TUI with the page's own prompt.
    const agent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    const screen = await agentTurn(agent, promptFor('09-connectors', '01-explore-and-run', 2));
    await capture.screen('fsa09-02-run-operation', screen, agentScreen());

    // Effect-check: a configured connector exists and exposes operations to run.
    const listed = toolkit('list_connectors', {});
    const configured = (listed.connectors || []).find((line: string) => String(line).includes('config'));
    expect(configured, 'no configured connector to run an operation on').toBeTruthy();
    const connector = String(configured).split(' ')[0];
    const ops = toolkit('list_connector_operations', { connector });
    expect(ops.count).toBeGreaterThan(0);
  });

  // §1-§3 of the build page are one agent conversation: the agent scaffolds and
  // implements the connector in its own folder, packages and installs it (the
  // confirm-gated step), then runs it. Each turn's screen is the page's proof.
  let buildAgent: Awaited<ReturnType<typeof startAgent>> | undefined;
  const conndir = path.join(AGENT_CWD, DADJOKE);

  if (shouldRunStep('fsa09-03-scaffold-connector')) await test.step('fsa09-03-scaffold-connector', async () => {
    // The page's premise is a fresh build: no folder from a previous run, and no
    // copy on the box (a same-version replace-install can leave connector workers
    // running the old code, so the health check reads stale).
    fs.rmSync(conndir, { recursive: true, force: true });
    labSeed('reset-connector', DADJOKE);
    const agent = buildAgent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    const screen = await agentTurn(agent, promptFor('09-connectors', '02-build-a-connector', 1));
    await capture.screen('fsa09-03-scaffold-connector', screen, agentScreen());
    // Effect-check: info.json and operations.py agree on get_joke.
    const info = JSON.parse(fs.readFileSync(path.join(conndir, 'info.json'), 'utf8'));
    expect(info.operations.map((o: any) => o.operation)).toContain('get_joke');
    expect(fs.readFileSync(path.join(conndir, 'operations.py'), 'utf8')).toContain('get_joke');
  });

  if (shouldRunStep('fsa09-04-deploy-connector')) await test.step('fsa09-04-deploy-connector', async () => {
    if (!buildAgent) throw new Error('fsa09-04 continues the fsa09-03 conversation; run both steps together');
    const screen = await agentTurn(buildAgent, promptFor('09-connectors', '02-build-a-connector', 2), {
      confirm: 'Yes, go ahead and install it.',
    });
    await capture.screen('fsa09-04-deploy-connector', screen, agentScreen());
    const health = toolkit('healthcheck_connector', { connector: DADJOKE });
    expect(JSON.stringify(health)).toContain('Available');
  });

  if (shouldRunStep('fsa09-05-run-own-connector')) await test.step('fsa09-05-run-own-connector', async () => {
    if (!buildAgent) throw new Error('fsa09-05 continues the fsa09-03 conversation; run the build steps together');
    // Right after a reinstall, connector workers can keep serving the previous
    // code for a few minutes. Wait until a run returns exactly what the agent's
    // code returns ({joke} only) so the capture shows the agent's own code.
    for (let i = 0; i < 24; i++) {
      const data = toolkit('run_connector_operation', { connector: DADJOKE, operation: 'get_joke', params: {} }).data ?? {};
      if (data.joke && Object.keys(data).length === 1) break;
      await new Promise((r) => setTimeout(r, 10_000));
    }
    const screen = await agentTurn(buildAgent, promptFor('09-connectors', '02-build-a-connector', 3));
    await capture.screen('fsa09-05-run-own-connector-joke', screen, agentScreen());
    const out = toolkit('run_connector_operation', { connector: DADJOKE, operation: 'get_joke', params: {} });
    expect(JSON.stringify(out)).toContain('joke');

    // UI proof the agent's code is a real installed, healthy connector.
    const soar = await gui('soar');
    await openConnector(soar, new URL(soar.url()).origin, 'AgentLab Dad Joke');
    await capture.shot(soar, 'fsa09-05-run-own-connector');
  });

  // fsa09-06/-07 were manual (agent-driven Content Hub install, box-inventory
  // specific). Now automated: drive the agent in a real TUI, capture its screen,
  // and confirm the box effect.
  if (shouldRunStep('fsa09-06-install-from-hub')) await test.step('fsa09-06-install-from-hub', async () => {
    const agent = hubAgent = await startAgent(local, 'laptop', { cols: 100, rows: 40 });
    // The page's premise is that the box does not have this connector yet, so
    // return the box to that state first; otherwise a rerun proves nothing.
    labSeed('reset-connector', HUB);
    expect(hubInstalled(), `${HUB} is still installed after the reset`).toBe(false);
    const screen = await agentTurn(agent, promptFor('09-connectors', '01b-install-from-content-hub', 1), {
      // Covers both a plain go-ahead and the agent asking which version (the
      // toolkit cannot list Content Hub versions, so it may ask first).
      confirm: 'Yes, go ahead and install the latest version.',
    });
    await capture.screen('fsa09-06-install-from-hub', screen, agentScreen());
    // Effect-check: the agent's install landed. The hub install is async on the
    // appliance, so poll a short window.
    let installed = false;
    for (let i = 0; i < 20 && !installed; i++) {
      installed = hubInstalled();
      if (!installed) await new Promise((r) => setTimeout(r, 5000));
    }
    expect(installed, `${HUB} is not installed after the hub install (polled 100s)`).toBe(true);
  });

  if (shouldRunStep('fsa09-07-configure-and-health')) await test.step('fsa09-07-configure-and-health', async () => {
    // The page's second prompt continues the install conversation ("this
    // connector"), so it goes to the same agent session fsa09-06 opened.
    if (!hubAgent) throw new Error('fsa09-07 continues the fsa09-06 conversation; run both steps together');
    const agent = hubAgent;
    const screen = await agentTurn(agent, promptFor('09-connectors', '01b-install-from-content-hub', 2), {
      confirm: 'Yes, configure it.',
    });
    await capture.screen('fsa09-07-configure-and-health', screen, agentScreen());
    // Effect-check: the hub connector now has a configuration (polled; the
    // connector list can lag the agent's save).
    let line = '';
    for (let i = 0; i < 12 && !/\(\d+ configs?\)/.test(line); i++) {
      line = String((toolkit('list_connectors', {}).connectors || []).find((l: string) => String(l).startsWith(`${HUB} `)) || '');
      if (!/\(\d+ configs?\)/.test(line)) await new Promise((r) => setTimeout(r, 5000));
    }
    expect(line, `${HUB} has no configuration. Agent screen:\n${agent.plainScreen().trim().slice(-3000)}`).toMatch(/\(\d+ configs?\)/);
  });

  if (shouldRunStep('fsa09-08-configure-safely')) await test.step('fsa09-08-configure-safely', async () => {
    // The page's premise is a real key in the server's env, referenced by name. With
    // DOCUBOT_VT_API_KEY set the run is a full pass (healthcheck Available). Without
    // it a dummy key still exercises the reference path and the masked key field;
    // the healthcheck expectation then does not apply (the dummy is rejected).
    const realKey = process.env.DOCUBOT_VT_API_KEY;
    const key = realKey || 'lab-dummy-key-not-a-secret';
    const agent = await startAgent(local, 'laptop', {
      cols: 100,
      rows: 40,
      mcpEnv: { FSR_SECRET_VIRUSTOTAL__API_KEY: key },
    });
    const screen = await agentTurn(agent, promptFor('09-connectors', '01c-configure-without-sharing-secrets', 1), {
      confirm: 'Yes, go ahead and install it if it is missing.',
    });
    // The point of the page: the key never reaches the chat.
    expect(screen.includes(key), 'the API key appeared on the agent screen').toBe(false);
    await capture.screen('fsa09-08-configure-safely', screen, agentScreen());
    expect(screen).toMatch(/FSR_SECRET_VIRUSTOTAL__API_KEY/);
    if (realKey) {
      const health = toolkit('healthcheck_connector', { connector: 'virustotal', config: 'Lab' });
      expect(JSON.stringify(health)).toContain('Available');
    }
    // UI proof: the saved Lab configuration shows its API key as a masked password.
    const soar = await gui('soar');
    const origin = new URL(soar.url()).origin;
    await openConnector(soar, origin, 'VirusTotal');
    await soar.getByText('Configurations', { exact: true }).first().click();
    expect(await selectConfig(soar, 'Lab'), 'the Lab configuration did not load').toBe(true);
    // The API key is write-only: the form shows a "Set API Key" link, never the value.
    const keyField = soar.getByRole('link', { name: 'Set API Key' }).first();
    await expect(keyField).toBeVisible({ timeout: 20_000 });
    await capture.shot(soar, 'fsa09-08-configure-safely-masked-key', {
      highlight: keyField,
      scrubSkip: ['date-or-time'],
    });
    // A dummy-key run leaves no configuration behind: remove the Lab config it wrote.
    if (!realKey) {
      await removeConnectorConfiguration(soar);
      console.log('[ch09] fsa09-08: removed the dummy-key Lab configuration');
    }
  });
});
