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

    // Same result, two more shots: no second investigation. The hypothesis graph, then
    // the AI fields the investigation wrote onto the Alert Details tab.
    await shotPanel(page, {
      chapter: "03-investigation-insights",
      id: "fsa03-02-hypotheses",
      locator: page.locator("#view-panel-content svg:has(g#Hypo_1)"),
      pad: 8,
    });
    await alertDetail.openTab(page, "Alert Details");
    // Next Steps quotes the case id; hide any leaf that holds a record id.
    await page.evaluate(() => {
      const idRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      for (const el of document.querySelectorAll("#view-panel-content li, #view-panel-content p, #view-panel-content span")) {
        if (idRe.test(el.textContent || "")) el.setAttribute("data-privacy", "mask");
      }
    });
    await shotPanel(page, {
      chapter: "03-investigation-insights",
      id: "fsa03-03-alert-ai-fields",
      locator: page.locator("#view-panel-content").getByText("AI Investigation Overview", { exact: true }).first()
        .locator("xpath=ancestor::*[self::div][3]"),
      pad: 4,
    });
  } finally {
    await reportSpend(s, before);
    await s.close();
    await api.dispose();
  }
});

// One paid insight run feeds both insight captures. The template fills the intent,
// chain of thought and plan without spending; only Execute spends. The insight is
// never saved, so nothing is left on the box.
test("03-ai-insights", async () => {
  test.setTimeout(20 * 60 * 1000);
  const s = await openSession();
  const page = s.page;
  let before = null;
  try {
    before = await requireAiSpend(s);
    await alertDetail.openModuleList(page, s.base, "alerts");
    await page.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((x) => /^AI Insights/.test((x.innerText || "").trim()) && /dashboard/.test(x.getAttribute("href") || ""));
      if (!a) throw new Error("no AI Insights entry in the navigation");
      a.click();
    });
    await page.getByRole("button", { name: /Add Insight/ }).first().click();
    await page.getByText("High Risk Active Alerts", { exact: true }).first().click();
    const modal = page.locator(".edit-insight-modal");
    await modal.locator("#generatePlan").waitFor({ timeout: 60000 });
    await modal.getByText("Retrieve Active Alerts").first().waitFor({ timeout: 60000 });
    await modal.locator("#insightSocRoles").selectOption({ label: "SOC Manager" });
    await settle(page, 1500);
    await shotPanel(page, {
      chapter: "03-investigation-insights",
      id: "fsa03-05-insight-plan",
      locator: modal,
      pad: 0,
    });

    await modal.locator("#executeButton").click({ timeout: 60000 });
    await expect(modal.getByText("No plan has been executed to preview")).toHaveCount(0, { timeout: 8 * 60 * 1000 });
    await settle(page, 8000);
    await shotPanel(page, {
      chapter: "03-investigation-insights",
      id: "fsa03-06-insight-card",
      locator: modal,
      pad: 0,
    });
  } finally {
    await reportSpend(s, before);
    await s.close();
  }
});
