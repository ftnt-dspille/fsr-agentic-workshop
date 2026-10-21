"use strict";
// UI screenshot pass: writes the pending captures into the chapter page bundles.
// Runs only when SOAR_KIT_DIR + FSR_USERNAME + FSR_PASSWORD are set (the kit
// logs in through the UI). Captures whose navigation is not yet proven on a
// live box remain in tools/pending-captures.txt; take them during the live
// pass and delete their entries.
// Capture through an /etc/hosts alias so the URL bar reads fortisoar.example.com.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openSession, capture, pyfsrTool } = require("./lib/harness");

const ENABLED = process.env.SOAR_KIT_DIR && process.env.FSR_USERNAME && process.env.FSR_PASSWORD;

test.describe(() => {
  test.skip(!ENABLED, "needs SOAR_KIT_DIR + FSR_USERNAME + FSR_PASSWORD");
  test.setTimeout(10 * 60 * 1000);

  test("ui-captures", async () => {
    const kitDir = path.resolve(process.env.SOAR_KIT_DIR);
    const alertDetail = require(path.join(kitDir, "pages", "alertDetail.js"));
    const s = await openSession();
    const base = (process.env.FSR_BASE_URL.startsWith("http") ? "" : "https://") + process.env.FSR_BASE_URL;
    try {
      // fsa10-02: the capstone alert with the agent's findings written back.
      const found = pyfsrTool("query_records", {
        module: "alerts",
        filters: [{ field: "name", operator: "like", value: "Agent Lab - beaconing%" }],
        limit: 1,
        summary: false,
      });
      const alert = (found["hydra:member"] || found.records || [])[0];
      expect(alert, "stage the capstone alert first (chapter 10 spec or agent run)").toBeTruthy();
      await alertDetail.openDetail(s.page, base, "alerts", alert.uuid);
      await capture(s.page, "10-capstone-investigation", "fsa10-02-findings-on-alert");

      // fsa08-03: the tagged chapter 8 alert's detail doubles as run evidence
      // until the run-history list navigation is proven live.
      const tagged = pyfsrTool("query_records", {
        module: "alerts",
        filters: [{ field: "name", operator: "like", value: "Agent Lab - suspicious login%" }],
        limit: 1,
        summary: false,
      });
      const alert8 = (tagged["hydra:member"] || tagged.records || [])[0];
      if (alert8) {
        await alertDetail.openDetail(s.page, base, "alerts", alert8.uuid);
        await capture(s.page, "08-playbook", "fsa08-03-run-history");
      }
    } finally {
      await s.close();
    }
  });
});
