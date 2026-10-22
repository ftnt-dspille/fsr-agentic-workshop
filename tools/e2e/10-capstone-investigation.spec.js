"use strict";
// Chapter 10 proof, API-level tier: staging the scenario alert works and the
// chapter 8 playbook picks it up. The investigation itself (fsa10-02) is agent
// work: it is proved by the agent-drive tier (make agent-drive), not here.
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
const { test, expect } = require("@playwright/test");
const { apiContext, apiPost, pyfsrTool, wanted } = require("./lib/harness");

test.setTimeout(5 * 60 * 1000);

test("10-capstone-investigation", async ({ playwright }) => {
  if (wanted("fsa10-01-stage-alert")) await test.step("fsa10-01-stage-alert", async () => {
    const since = new Date().toISOString();
    const created = pyfsrTool("create_record", {
      module: "alerts",
      data: {
        name: `Agent Lab - beaconing from web-server-01 (${Date.now()})`,
        severity: "Critical",
        source: "Agent Lab Workshop",
        description: "Hourly HTTPS beacons from web-server-01 to 203.0.113.99 since 02:00 UTC.",
      },
    });
    expect(created.uuid).toBeTruthy();
    // The chapter 8 playbook should tag it - the "first piece of history".
    const run = pyfsrTool("wait_for_playbook_run", {
      playbook: "Tag Agent Lab Alerts",
      since,
      timeout: 120,
    });
    expect(JSON.stringify(run)).toContain("finished");
  });

  // fsa10-02 proves the write-back is present, not that the findings are right:
  // the marker stays `manual` on the page.
  if (wanted("fsa10-02-investigate")) await test.step("fsa10-02-investigate", async () => {
    const api = await apiContext(playwright.request);
    try {
      const found = await apiPost(api, "/api/query/alerts", {
        logic: "AND",
        filters: [{ field: "name", operator: "like", value: "Agent Lab - beaconing%" }],
      });
      // Newest staged capstone alert first: the one the prompt investigates.
      const alert = [...(found["hydra:member"] || [])].sort((a, b) =>
        String(b.createDate).localeCompare(String(a.createDate)))[0];
      expect(alert, "stage the capstone alert first (fsa10-01)").toBeTruthy();
      const text = alert.description || "";
      expect(text, "the agent has not written findings to the alert").not.toMatch(/^Triaged automatically/);
      expect(text).toMatch(/verdict/i);
      expect(text).toMatch(/confidence/i);
    } finally {
      await api.dispose();
    }
  });
});
