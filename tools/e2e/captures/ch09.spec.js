"use strict";
// Chapter 9 captures: the installed greeter on the Connectors page (fsa09-05). It depends
// on the chapter 9 proof spec having installed the greeter; with no greeter it fails.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("09-connectors", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/connectors`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(
      page.getByText("Agentlab Greeter", { exact: false }).first(),
      "the greeter connector is not installed: run the chapter 9 proof spec first",
    ).toBeVisible();
    await shotPanel(page, {
      chapter: "09-connectors",
      id: "fsa09-05-greeter-installed",
      locator: page.locator("body"),
      // The Agentlab Greeter card in Content Hub > Manage (filtered to Connectors).
      clip: { x: 670, y: 340, width: 265, height: 360 },
      pad: 0,
    });

    // fsa09-02: the connector's detail panel (Configurations tab) in Content Hub > Manage.
    await page.goto(`${s.base}/connectors`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByText("Manage", { exact: true }).first().click();
    await settle(page);
    await page.getByText("Agentlab Greeter", { exact: true }).first().click();
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
