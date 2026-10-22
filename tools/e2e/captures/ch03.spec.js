"use strict";
// Chapter 3 captures. The investigation screenshots show a FortiAI investigation on a
// lab alert, so this spec spends tokens: it is gated by captures/lib/spend.js and skips
// unless SPEND_AI=1 (balance check, floor, tokens spent reported). It is NOT run by the
// workshop proof without SPEND_AI=1. Without a finished investigation the capture
// refuses to run rather than photographing an empty tab.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openSession, apiContext, apiPost } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");
const { requireAiSpend, reportSpend } = require("./lib/spend");

const alertDetail = require(path.join(path.resolve(process.env.SOAR_KIT_DIR || "."), "pages", "alertDetail.js"));

test.describe.configure({ mode: "serial" });
test.setTimeout(30 * 60 * 1000);

test("03-investigation-insights", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  const s = await openSession();
  const page = s.page;
  let before = null;
  try {
    before = await requireAiSpend(s);
    const found = await apiPost(api, "/api/query/alerts", {
      logic: "AND",
      filters: [{ field: "name", operator: "like", value: "Agent Lab - beaconing%" }],
    });
    const alert = (found["hydra:member"] || [])[0];
    expect(alert, "stage a chapter 3 lab alert first").toBeTruthy();

    await alertDetail.openDetail(page, s.base, "alerts", alert.uuid);
    await alertDetail.openTab(page, "AI Investigation");
    let inv = await alertDetail.readInvestigation(page);
    if (inv.state === "not-run") {
      // The one paid run for chapter 3. Every chapter 3 capture reuses this result.
      inv = await alertDetail.runInvestigation(page, { wait: true });
    }
    expect(inv.state, "the investigation must reach a verdict before the capture").toBe("done");
    await settle(page, 2000);
    await shotPanel(page, {
      chapter: "03-investigation-insights",
      id: "fsa03-01-investigation-tab",
      locator: page.locator("#view-panel-content"),
      pad: 0,
    });
  } finally {
    await reportSpend(s, before);
    await s.close();
    await api.dispose();
  }
});
