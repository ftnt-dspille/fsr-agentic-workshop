"use strict";
// Chapter 9 captures: the installed dad-joke connector on the Connectors page
// (fsa09-05). It depends on the chapter 9 build lab having installed
// agentlab-dadjoke; with it absent, this fails.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("09-connectors", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    // fsa09-05 (the dad-joke card in the Connectors grid) is still pending: the
    // grid tile's position and container class vary by install set, so the clip
    // needs dialing in on the target box. fsa09-02 below (the connector's detail
    // panel, ACTIVE + HEALTH CHECK: AVAILABLE) already proves the install.

    // fsa09-02: the connector's detail panel (Configurations tab) in Content Hub > Manage.
    await page.goto(`${s.base}/connectors`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByText("Manage", { exact: true }).first().click();
    await settle(page);
    await page.getByText("AgentLab Dad Joke", { exact: true }).first().click();
    await settle(page, 2000);
    await expect(page.getByText("HEALTH CHECK:", { exact: false }).first()).toBeVisible();
    await shotPanel(page, {
      chapter: "09-connectors",
      id: "fsa09-02-connector-page",
      locator: page.locator("body"),
      clip: { x: 560, y: 0, width: 935, height: 900 },
      pad: 0,
    });
  } finally {
    await s.close();
  }
});
