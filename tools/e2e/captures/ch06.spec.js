"use strict";
// Chapter 6 captures: the Users list, where the "Create a Login" step makes the
// agent's user. No FortiAI spend. fsa06-03/04/05/06/08/09/10 (agent terminals)
// render from the headless terminal shots, not the browser.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("06-setup-agent", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    // The Users list route is /iam/people on 8.0.1 (/iam/users redirects to Dashboard).
    await page.goto(`${s.base}/iam/people`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Manage Users", { exact: false }).first()).toBeVisible();
    await shotPanel(page, {
      chapter: "06-setup-agent",
      id: "fsa06-01-create-user",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
    });
  } finally {
    await s.close();
  }
});
