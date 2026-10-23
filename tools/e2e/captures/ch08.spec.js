"use strict";
// Chapter 8 captures: the Agent Lab playbook canvas (fsa08-02) and the run history of the
// tagged alert (fsa08-03). The run-history navigation moved here from ui-captures.spec.js.
// No FortiAI spend.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openSession, apiContext, apiPost } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

const kitDir = path.resolve(process.env.SOAR_KIT_DIR || ".");
const alertDetail = require(path.join(kitDir, "pages", "alertDetail.js"));

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("08-playbook", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/playbooks`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByText("Agent Lab", { exact: false }).first().click();
    await settle(page);
    await page.getByText("Tag Agent Lab Alerts", { exact: false }).first().click();
    await settle(page);
    await shotPanel(page, {
      chapter: "08-playbook",
      id: "fsa08-02-playbook-canvas",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
    });

    // fsa08-03: the Executed Playbook Logs graph for the oldest tagged alert.
    const tagged = await apiPost(api, "/api/query/alerts", {
      logic: "AND",
      filters: [{ field: "name", operator: "like", value: "Agent Lab - suspicious login%" }],
    });
    const alert8 = [...(tagged["hydra:member"] || [])].sort((a, b) => String(a.createDate).localeCompare(String(b.createDate)))[0];
    expect(alert8, "stage the chapter 8 alert first (the chapter 8 proof spec)").toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await alertDetail.openDetail(page, s.base, "alerts", alert8.uuid);
    await alertDetail.openPlaybookLogs(page, { historical: true, select: "Tag Agent Lab" });
    await shotPanel(page, {
      chapter: "08-playbook",
      id: "fsa08-03-run-history",
      locator: page.locator("body"),
      clip: { x: 481, y: 230, width: 960, height: 330 },
      pad: 0,
    });
  } finally {
    await s.close();
    await api.dispose();
  }
});
