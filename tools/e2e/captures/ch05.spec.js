"use strict";
// Chapter 5 steps and captures: register the lab's remote MCP server through the Connect MCP
// Server form (validate, then save), check its row, capture the list, then remove it so the
// box is left as found. The server is the public DeepWiki endpoint with no authentication,
// under a lab-only name. No FortiAI spend: nothing here runs an agent. The agent allowlist
// steps (fsa05-04/05) stay manual because they need the chapter 4 agent.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

const NAME = "agentlab-deepwiki";
const URL = "https://mcp.deepwiki.com/mcp";
const LIST = "/ai-configuration/mcp-servers";

async function openList(page, base) {
  await page.goto(`${base}${LIST}`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

/** Delete the lab server through the grid selection and the Delete toolbar button. No-op if absent. */
async function removeLabServer(page, base) {
  await openList(page, base);
  // The grid fills after the page settles; give a present row time to render before concluding it is absent.
  const present = await page.getByText(NAME, { exact: true }).first()
    .waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!present) return false;
  // ui-grid renders a pinned selection column (header box first, then one box per row) apart
  // from the data rows, so the row's box is its data-row index plus one.
  const rows = page.locator(".ui-grid-row");
  const names = await rows.evaluateAll((rs) => rs.map((r) => r.innerText));
  const dataRows = names.filter((t) => t.trim());
  const idx = dataRows.findIndex((t) => t.includes(NAME));
  expect(idx, "the lab server is in the grid").toBeGreaterThanOrEqual(0);
  await page.locator(".ui-grid-selection-row-header-buttons").nth(idx + 1).click();
  // Refuse to delete anything but the lab server: exactly one data row may be selected.
  const selectedRows = () => page.locator(".ui-grid-row-selected").evaluateAll((rs) => rs.map((r) => r.innerText.trim()).filter(Boolean));
  await expect.poll(async () => (await selectedRows()).length, { message: `row ${idx} of ${dataRows.length} selected`, timeout: 10000 }).toBe(1);
  expect((await selectedRows())[0]).toContain(NAME);
  await page.locator("button", { hasText: /^\s*Delete\s*$/ }).first().click({ timeout: 15000 });
  const confirm = page.locator(".modal-content").getByRole("button", { name: /^(Yes|Confirm|Delete|OK)$/ });
  await confirm.last().click({ timeout: 15000 });
  await settle(page, 2000);
  await openList(page, base);
  await expect(page.getByText(NAME, { exact: true })).toHaveCount(0, { timeout: 20000 });
  return true;
}

test("05-register-mcp-servers", async () => {
  const s = await openSession();
  const page = s.page;
  // A Playwright action on a control that never enables waits forever without a timeout.
  page.setDefaultTimeout(30000);
  try {
    // A leftover from an interrupted run would make the name collide ("already exists").
    await removeLabServer(page, s.base);

    await test.step("fsa05-01-validate-register", async () => {
      await openList(page, s.base);
      await page.getByRole("button", { name: /Connect MCP Server/ }).click();
      const modal = page.locator(".modal-content");
      await modal.locator("input[type=text]").first().fill(NAME);
      await modal.locator("textarea[name=description]").fill("Lab: DeepWiki remote server (public, no credentials)");
      await modal.locator("select[name=transport]").selectOption("http");
      await modal.locator("input[type=url]").fill(URL);
      // After transport=http the form shows a required auth_type select; DeepWiki takes None.
      const auth = modal.locator("select[name=auth_type]");
      await expect(auth).toBeVisible();
      await auth.selectOption({ label: "None" });
      // Capture the filled form so a learner sees exactly which fields to set. The server
      // address is visible in the url input, so paint that input over (it is a hostname).
      await shotPanel(page, {
        chapter: "05-register-mcp-servers",
        id: "fsa05-03-connect-form",
        locator: modal,
        pad: 4,
        mask: ["input[type=url]"],
      });
      const test_ = modal.getByRole("button", { name: "Test Connection" });
      await expect(test_).toBeEnabled();
      await test_.click();
      // Save stays disabled until the handshake succeeds, so its enabled state is the proof.
      const save = modal.getByRole("button", { name: "Save" });
      await expect(save).toBeEnabled({ timeout: 120000 });
      await save.click();
      await settle(page, 2000);
    });

    await test.step("fsa05-02-status-check", async () => {
      await openList(page, s.base);
      await expect(page.getByText(NAME, { exact: true }).first()).toBeVisible({ timeout: 30000 });
    });

    await test.step("fsa05-03-register-remote", async () => {
      // Registration was proven by fsa05-01; this step reads the stored row back from the list.
      await expect(page.getByText(NAME, { exact: true }).first()).toBeVisible();
    });

    await shotPanel(page, {
      chapter: "05-register-mcp-servers",
      id: "fsa05-01-mcp-servers-page",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
      // The Url column is the server address: painted over, never shown.
      mask: ["[ng-bind*='url']", "[ng-bind*='Url']", "[ng-bind*='description']"],
    });
  } finally {
    // Always leave the box as found, even when a step failed.
    try { await removeLabServer(page, s.base); } finally { await s.close(); }
  }
});
