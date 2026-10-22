"use strict";
// Chapter 7 captures: the Users list showing the lab analyst (fsa07-01). fsa07-02 and
// fsa07-03 belong to the main-checkout agent and are not touched here.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("07-users-modules-records", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/iam/people`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("agentlab_analyst", { exact: false }).first()).toBeVisible();
    await shotPanel(page, {
      chapter: "07-users-modules-records",
      id: "fsa07-01-user-in-ui",
      locator: page.locator("body"),
      // Names, e-mail and phone numbers of real users are painted over; the crop keeps the
      // Manage Users grid (headers, count and the lab row) and drops the super-admin picker.
      clip: { x: 340, y: 440, width: 1100, height: 460 },
      pad: 0,
      mask: [".ui-grid-cell-contents", ".ui-grid-row .ui-grid-cell"],
    });
  } finally {
    await s.close();
  }
});
