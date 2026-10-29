// Alert detail-panel helpers for the workshop specs: the detail tabs, the built-in
// AI Investigation (8.0), the Execute menu, Executed Playbook Logs and the
// Comments (Workspace) panel. Ported from the UI kit's pages/alertDetail.js onto
// docubot's FortiSOAR primitives so the specs no longer depend on the kit.
//
// Selectors verified on 8.0.x:
//   - Detail tabs are `li.uib-tab` under #view-panel-content.
//   - AI Investigation not yet run: one button #showTriagId; already run: #re-investigate.
//   - Verdict: `.verdictContainer .verdictLabel`; hypotheses are SVG groups g#Hypo_1..5.
//   - Bottom-bar Execute button is duplicated by the list page: scope to #viewPanelBottomBar.
//   - Playbook logs icon: a[title="Click to see Executed Playbook Logs"].
import type { Page } from '@playwright/test';
import { appClick, waitForAngular, waitOrDump } from 'docubot';

/** Open a record's detail panel by module + uuid and wait for its bottom bar. */
export async function openDetail(page: Page, origin: string, module: string, uuid: string, settleMs = 3000): Promise<void> {
  await page.goto(`${origin}/modules/view-panel/${module}/${uuid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#viewPanelBottomBar').waitFor({ timeout: 60_000 });
  await waitForAngular(page);
  await page.waitForTimeout(settleMs);
}

/** Click a detail-panel tab by its visible title ("AI Investigation", ...). */
export async function openTab(page: Page, title: string, settleMs = 3000): Promise<void> {
  await page.evaluate((t) => {
    const li = [...document.querySelectorAll('#view-panel-content li.uib-tab')].find((e) => (e as HTMLElement).innerText.trim() === t);
    if (!li) throw new Error(`no detail tab "${t}"`);
    ((li.querySelector('a') as HTMLElement) || (li as HTMLElement)).click();
  }, title);
  await waitForAngular(page);
  await page.waitForTimeout(settleMs);
}

export interface Hypothesis { n: number; title: string; question: string | null; outcome: string | null }
export interface Investigation { state: 'not-run' | 'running' | 'done'; verdict: string | null; hypotheses: Hypothesis[] }

/** Read the AI Investigation tab as data. Call after openTab(page, 'AI Investigation'). */
export async function readInvestigation(page: Page): Promise<Investigation> {
  return page.evaluate(() => {
    const root = document.querySelector('#view-panel-content') || document;
    if (root.querySelector('#showTriagId')) return { state: 'not-run', verdict: null, hypotheses: [] } as any;
    const label = root.querySelector('.verdictContainer .verdictLabel');
    const hypotheses = [...root.querySelectorAll('g[id^=Hypo_]')]
      .filter((g) => /^Hypo_\d$/.test(g.id))
      .map((g) => {
        const parts = [...g.querySelectorAll('div.hypothesisText div')].map((d) => (d.textContent || '').trim()).filter(Boolean);
        const qi = parts.findIndex((p) => /\?$/.test(p));
        return {
          n: Number(g.id.split('_')[1]),
          title: parts.slice(1, qi < 0 ? undefined : qi).join(' '),
          question: qi < 0 ? null : parts[qi],
          outcome: qi < 0 ? null : parts[qi + 1] || null,
        };
      })
      .sort((a, b) => a.n - b.n);
    const verdict = label ? (label.textContent || '').trim() : null;
    return { state: verdict ? 'done' : 'running', verdict, hypotheses } as any;
  });
}

/** Start the investigation (Begin AI-Powered Alert Investigation) and optionally wait for the verdict. SPENDS TOKENS. */
export async function runInvestigation(page: Page, { wait = true, timeoutMs = 600_000 } = {}): Promise<Investigation> {
  await appClick(page, '#view-panel-content #showTriagId');
  await waitOrDump(page, () => !document.querySelector('#view-panel-content #showTriagId'), { label: 'ai-investigation-started', timeoutMs: 60_000 });
  if (!wait) return readInvestigation(page);
  await waitOrDump(page, () => !!document.querySelector('#view-panel-content .verdictContainer .verdictLabel'), {
    label: 'ai-investigation-verdict', timeoutMs, pollMs: 5_000,
  });
  await page.waitForTimeout(3_000);
  return readInvestigation(page);
}

/** Open the bottom-bar Execute menu and type into its playbook search. */
export async function openExecuteMenu(page: Page, search = ''): Promise<void> {
  await appClick(page, () => [...document.querySelectorAll('#viewPanelBottomBar button')].find((b) => /Execute/.test((b as HTMLElement).innerText)) as Element);
  const filter = page.locator('#playbookFilter').first();
  await filter.waitFor({ timeout: 20_000 });
  if (search) await filter.fill(search);
  await page.waitForTimeout(1_500);
}

/** Click a playbook in the open Execute menu by its exact label (runs it). */
export async function runFromExecuteMenu(page: Page, label: string): Promise<void> {
  await page.locator('#playbookFilter').first().fill(label);
  await page.waitForTimeout(1_500);
  await page.getByText(label, { exact: true }).last().click();
}

/**
 * Open the Executed Playbook Logs panel for the current record. The panel lists
 * RECENT runs only; `historical` switches to the historical table, `select`
 * clicks the first run whose name starts with that text to draw its step graph.
 */
export async function openPlaybookLogs(page: Page, { historical = false, select = null as string | null, settleMs = 4_000 } = {}): Promise<void> {
  await appClick(page, () => {
    const all = [...document.querySelectorAll('a[title="Click to see Executed Playbook Logs"]')];
    return (all.find((a) => a.closest('#view-panel-content')) || all[0]) as Element;
  });
  await page.getByText('Executed Playbook Logs').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(settleMs);
  if (historical) {
    await page.locator('#mySidenav select').first().selectOption({ label: 'Historical Playbook Logs' });
    await waitForAngular(page);
    await page.waitForTimeout(settleMs);
  }
  if (select) {
    await page.locator('#mySidenav').getByText(select, { exact: false }).first().click();
    await waitForAngular(page);
    await page.waitForTimeout(settleMs);
  }
}
