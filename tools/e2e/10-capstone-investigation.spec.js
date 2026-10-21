"use strict";
// Chapter 10 proof, API-level tier: staging the scenario alert works and the
// chapter 8 playbook picks it up. The investigation itself (fsa10-02) is agent
// work: it is proved by the agent-drive tier (make agent-drive), not here.
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
const { test, expect } = require("@playwright/test");
const { pyfsrTool } = require("./lib/harness");

test.setTimeout(5 * 60 * 1000);

test("10-capstone-investigation", async () => {
  await test.step("fsa10-01-stage-alert", async () => {
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
});
