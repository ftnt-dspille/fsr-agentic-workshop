"use strict";
// Chapter 6 captures: the access keys page the API key step names. No FortiAI spend.
// fsa06-03 (Claude Code terminal) renders from the terminal shots, not the browser.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("06-setup-agent", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/iam/accessKeys`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Access Keys", { exact: false }).first()).toBeVisible();
    await shotPanel(page, {
      chapter: "06-setup-agent",
      id: "fsa06-01-api-key-page",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
    });
  } finally {
    await s.close();
  }
});
