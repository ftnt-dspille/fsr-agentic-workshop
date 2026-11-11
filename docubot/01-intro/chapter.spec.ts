// Chapter 1, page 3 - install the Agentic Assistant solution pack: download the
// pack zip and import it through the Application Editor's Import & Export wizard
// (the only import path that installs a pack's bundled connector and widget tgz
// files - a Content Hub upload registers the pack and installs neither), publish
// the widgets, configure the connector and verify it end to end on a record and
// on the Monitor dashboard.
//
// The import REINSTALLS the pack on the capture box (an approved upgrade: the box
// runs connector 0.6.0, the pack carries 0.6.1). The connector's configuration is
// backed up before the run; the run proves the connector's health after.
//
// Verify on a box with
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=playwright.config.ts 01-intro/chapter
import { expect, pollUntil, test } from 'docubot';
import {
  apiViaApp, findAlert, gotoDashboards, importFromFile, ngGo, openConnector, openImportWizard, openManage, openRecord,
  runImport, selectDashboard, checkConnectorHealth, wizardDump, waitForRecordSettled, labSeed,
} from 'docubot/products/fortisoar';
import { anyStepSelected, shouldRunStep, SCRUB } from 'docubot';
import * as path from 'path';

test.describe.configure({ mode: 'serial' });

// Record pages, the wizard's history list and the dashboards show dates and
// record ids as legitimate content; the scan still refuses a real lab IP or
// hostname, and the pack import must never leak a stored secret.
const SKIP = SCRUB.dates;
const STEPS = [
  'fsa01-05-assistant-present',
  'fsa01-15-dev-features',
  'fsa01-20-import-upload',
  'fsa01-22-import-installed',
  'fsa01-25-widgets-published',
  'fsa01-30-connector-config',
  'fsa01-35-connector-health',
  'fsa01-40-record-launcher',
  'fsa01-45-monitor-dashboard',
] as const;

// The pack the page tells students to download; the spec imports exactly that file.
const PACK = path.resolve(process.env.DOCUBOT_TARGET || '.', 'static/downloads/agentic-assistant-pack-1.1.0.zip');

test('chapter 1 - install the Agentic Assistant', async ({ gui, capture }) => {
  test.setTimeout(40 * 60 * 1000);
  if (!anyStepSelected([...STEPS])) return;
  const soar = await gui('soar');

  if (shouldRunStep('fsa01-05-assistant-present')) await test.step('fsa01-05-assistant-present', async () => {
    await openManage(soar, { type: 'widget' });
    await expect(soar.getByText('Agentic Assistant', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa01-05-assistant-present', SKIP);
  });

  if (shouldRunStep('fsa01-15-dev-features')) await test.step('fsa01-15-dev-features', async () => {
    // A goto of the deep URL bounces to root during the SPA's boot; the app is
    // already booted here (login or fsa01-05), so navigate by state name.
    await ngGo(soar, 'main.system.configuration.advancedDevelopment');
    await expect(soar.getByText(/development/i).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa01-15-dev-features', SKIP);
  });

  if (shouldRunStep('fsa01-20-import-upload')) await test.step('fsa01-20-import-upload', async () => {
    await openImportWizard(soar);
    await importFromFile(soar, PACK);
    // The screen after the upload moved between builds; log what it offers so a
    // changed flow is readable in the run log, then photograph it.
    const offered = await wizardDump(soar);
    console.log('[fsa01-20] wizard offers:', JSON.stringify(offered, null, 1));
    // Shoot the wizard dialog itself (the dimmed importer page behind it is
    // noise), and skip the key-like-token category for this picture: the dialog
    // legitimately displays the pack's own file name on every configuration row
    // ("agentic-assistant-pack-1.1.0.zip" reads as a 24-char token), and it is
    // the student's downloaded file, not a secret. IPs/hosts/emails still scan.
    const dialog = soar.locator('.modal-content, [role=dialog]').first();
    await capture.shot(soar, 'fsa01-20-import-upload', SCRUB.with(SCRUB.dates, 'key-like-token'), { target: dialog });
  });

  // The real install (user-approved on this box: connector 0.6.0 -> 0.6.1). The
  // wizard's own steps are Upload File -> Configurations -> Options -> Run
  // Import; completion is polled from the API, not the wizard's wording: the
  // connector's version flips to the version the pack carries.
  if (shouldRunStep('fsa01-22-import-installed')) await test.step('fsa01-22-import-installed', async () => {
    await runImport(soar);
    await pollUntil('fsa01-22 connector upgraded to the packed version', async () => {
      // An API hiccup mid-import (the SPA reboots around the system publish)
      // must not end the poll: swallow it and keep polling.
      try {
        const res = await apiViaApp(soar, 'GET', '/api/integration/connectors/?page_size=1000&active=true') as
          { data?: Array<{ name?: string; version?: string }> } | null;
        const c = (res?.data ?? []).find((r) => r.name === 'connector-fsr-agentic-assistant');
        return c && c.version === '0.6.1' ? c : null;
      } catch { return null; }
    }, { timeoutMs: 15 * 60 * 1000, intervalMs: 15_000 });
    // Same dialog-target rule as fsa01-20; if the wizard closed itself on
    // completion, fall back to the page and skip the key-like-token category for
    // this one picture: the tokens in play are the pack's own file names in the
    // recent-uploads list (identifiers, not secrets) -- IPs/hosts still scan.
    const dialog = soar.locator('.modal-content, [role=dialog]').first();
    // key-like-token skip: same reason as fsa01-20 (the pack's own file name is
    // displayed throughout the wizard).
    if (await dialog.isVisible()) {
      await capture.shot(soar, 'fsa01-22-import-installed', SCRUB.with(SCRUB.dates, 'key-like-token'), { target: dialog });
    } else {
      await capture.shot(soar, 'fsa01-22-import-installed', SCRUB.with(SCRUB.dates, 'key-like-token'));
    }
  });

  if (shouldRunStep('fsa01-25-widgets-published')) await test.step('fsa01-25-widgets-published', async () => {
    await openManage(soar, { type: 'widget' });
    await expect(soar.getByText('Agentic Assistant', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa01-25-widgets-published', SKIP);
  });

  if (shouldRunStep('fsa01-30-connector-config')) await test.step('fsa01-30-connector-config', async () => {
    await openConnector(soar, 'FSR Agentic Assistant');
    await expect(soar.getByText('Configurations', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await capture.shot(soar, 'fsa01-30-connector-config', SKIP);
  });

  if (shouldRunStep('fsa01-35-connector-health')) await test.step('fsa01-35-connector-health', async () => {
    const { status } = await checkConnectorHealth(soar, 'agentic-assistant');
    expect(status, 'the connector health check passes').toMatch(/Available|Connected/i);
    await capture.shot(soar, 'fsa01-35-connector-health', SKIP);
  });

  if (shouldRunStep('fsa01-40-record-launcher')) await test.step('fsa01-40-record-launcher', async () => {
    labSeed('seed');
    const alert = await findAlert(soar, /Agent Lab - beaconing from web-server-01/i, { search: 'Agent Lab - beaconing', oldest: true });
    expect(alert, 'an alert to show the launcher on').toBeTruthy();
    await openRecord(soar, 'alerts', alert!.id, { tab: 'Alert Details' });
    await waitForRecordSettled(soar);
    await expect(soar.locator('img[title="Agentic Assistant"]').first()).toBeVisible({ timeout: 60_000 });
    await soar.locator('img[title="Agentic Assistant"]').first().hover();
    await capture.shot(soar, 'fsa01-40-record-launcher', SKIP);
  });

  if (shouldRunStep('fsa01-45-monitor-dashboard')) await test.step('fsa01-45-monitor-dashboard', async () => {
    await gotoDashboards(soar);
    await selectDashboard(soar, 'Agentic Assistant Monitor');
    await capture.shot(soar, 'fsa01-45-monitor-dashboard', SKIP);
  });
});
