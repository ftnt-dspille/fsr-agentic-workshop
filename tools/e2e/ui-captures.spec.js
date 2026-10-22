"use strict";
// UI screenshot pass: writes the pending captures into the chapter page bundles.
// Runs only when SOAR_KIT_DIR + FSR_USERNAME + FSR_PASSWORD are set (the kit
// logs in through the UI). Captures whose navigation is not yet proven on a
// live box remain in tools/pending-captures.txt; take them during the live
// pass and delete their entries.
// Capture through an /etc/hosts alias so the URL bar reads fortisoar.example.com.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openSession, capture, apiContext, apiPost, REPO_ROOT } = require("./lib/harness");

const ENABLED = process.env.SOAR_KIT_DIR && process.env.FSR_USERNAME && process.env.FSR_PASSWORD;

test.describe(() => {
  test.skip(!ENABLED, "needs SOAR_KIT_DIR + FSR_USERNAME + FSR_PASSWORD");
  test.setTimeout(10 * 60 * 1000);

  test("ui-captures", async ({ playwright }) => {
    const kitDir = path.resolve(process.env.SOAR_KIT_DIR);
    const alertDetail = require(path.join(kitDir, "pages", "alertDetail.js"));
    const api = await apiContext(playwright.request);
    const s = await openSession();
    const base = (process.env.FSR_BASE_URL.startsWith("http") ? "" : "https://") + process.env.FSR_BASE_URL;
    try {
      // fsa10-02: the capstone alert with the agent's findings written back.
      const found = await apiPost(api, "/api/query/alerts", {
        logic: "AND",
        filters: [{ field: "name", operator: "like", value: "Agent Lab - beaconing%" }],
      });
      // Titles repeat across runs: capture the duplicate the agent wrote to, if any.
      const alert = (found["hydra:member"] || []).find((a) =>
        /verdict/i.test(a.description || "") && !/^Triaged automatically/.test(a.description || "")) ||
        (found["hydra:member"] || [])[0];
      expect(alert, "stage the capstone alert first (chapter 10 spec or agent run)").toBeTruthy();
      // Only the agent's write-back is the page's picture. Until chapter 10's
      // prompt has written findings, the description is still the playbook's tag.
      const wroteBack = /verdict/i.test(alert.description || "") && !/^Triaged automatically/.test(alert.description || "");
      if (wroteBack) {
        await alertDetail.openDetail(s.page, base, "alerts", alert.uuid);
        // Clipped to the Description block: no header (it carries the editing user and a
        // date), no SLA panel, no URL bar. Viewport 1500x1100 at scale 1.
        await s.page.screenshot({
          path: path.join(REPO_ROOT, "content", "10-capstone-investigation", "fsa10-02-findings-on-alert.png"),
          clip: { x: 110, y: 440, width: 1380, height: 185 },
        });
      } else {
        console.log("SKIP fsa10-02: the agent has not written findings to the capstone alert yet");
      }

      // fsa08-03: the Executed Playbook Logs run graph for the tagged chapter 8
      // alert. Cropped to the graph (no run dates, no user identity in frame).
      const tagged = await apiPost(api, "/api/query/alerts", {
        logic: "AND",
        filters: [{ field: "name", operator: "like", value: "Agent Lab - suspicious login%" }],
      });
      // Oldest first: a run that finished earlier is already in the historical logs;
      // the newest alert's run can take a while to show there.
      const alert8 = [...(tagged["hydra:member"] || [])].sort((a, b) => String(a.createDate).localeCompare(String(b.createDate)))[0];
      expect(alert8, "stage the chapter 8 alert first (chapter 8 spec)").toBeTruthy();
      await s.page.setViewportSize({ width: 1440, height: 900 });
      await alertDetail.openDetail(s.page, base, "alerts", alert8.uuid);
      await alertDetail.openPlaybookLogs(s.page, { historical: true, select: "Tag Agent Lab" });
      await s.page.screenshot({
        path: path.join(REPO_ROOT, "content", "08-playbook", "fsa08-03-run-history.png"),
        clip: { x: 481, y: 230, width: 960, height: 330 },
      });
    } finally {
      await s.close();
      await api.dispose();
    }
  });
});
