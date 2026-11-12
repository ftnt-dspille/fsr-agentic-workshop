"use strict";
// Chapter 10 proof, API-level tier: staging the scenario alert works and the
// chapter 8 playbook picks it up. The investigation itself (fsa10-02) is agent
// work: it is proved by the agent-drive tier (make agent-drive), not here.
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
const { test, expect } = require("@playwright/test");
const { apiContext, apiPost, pyfsrTool, wanted } = require("./lib/harness");

test.setTimeout(5 * 60 * 1000);

test("10-agent-led-investigation", async ({ playwright }) => {
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
      // The investigation alert title is not unique (repeated runs stage duplicates), so the
      // proof is: some staged beaconing alert carries the write-back. Matching the
      // newest duplicate would test the wrong record when the agent picked another.
      const staged = found["hydra:member"] || [];
      expect(staged.length, "stage the investigation alert first (fsa10-01)").toBeGreaterThan(0);
      const written = staged.filter((a) => {
        const text = a.description || "";
        return !/^Triaged automatically/.test(text) && /verdict/i.test(text) && /confidence/i.test(text);
      });
      expect(written.length, "the agent has not written findings to any investigation alert").toBeGreaterThan(0);
    } finally {
      await api.dispose();
    }
  });
});
