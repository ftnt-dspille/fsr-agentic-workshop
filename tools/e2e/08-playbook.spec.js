"use strict";
// Chapter 8 proof: the page's exact YAML compiles, publishes, and an alert
// created with the page's values triggers the run and lands the update.
// API-level tier (prompts are proved by agent-drive).
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY and
// pyfsr[playbooks] installed for python3.
const { test, expect } = require("@playwright/test");
const { apiContext, apiPost, pyfsrTool } = require("./lib/harness");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

// Keep this YAML in lockstep with content/08-playbook/01-author-and-publish.md.
const YAML = `
collection: Agent Lab
visible: true
playbooks:
  - name: Tag Agent Lab Alerts
    steps:
      - name: On Alert Created
        type: start_on_create
        module: alerts
        when:
          logic: AND
          filters:
            - field: name
              op: like
              value: "Agent Lab%"
        next: Tag Alert
      - name: Tag Alert
        type: update_record
        module: alerts
        record: "{{ vars.input.records[0]['@id'] }}"
        fields:
          description: "Triaged automatically by the Agent Lab playbook"
        next: Done
      - name: Done
        type: end
`;

test("08-playbook", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  try {
    await test.step("fsa08-01-compile-yaml", async () => {
      const out = pyfsrTool("compile_playbook_yaml", { yaml_text: YAML });
      expect(out.ok).toBe(true);
      expect(out.playbooks).toEqual(["Tag Agent Lab Alerts"]);
    });

    await test.step("fsa08-02-publish-playbook", async () => {
      const out = pyfsrTool("publish_playbook", { yaml_text: YAML });
      expect(out.published).toBe(true);
    });

    await test.step("fsa08-03-trigger-and-verify", async () => {
      const since = new Date().toISOString();
      const created = pyfsrTool("create_record", {
        module: "alerts",
        data: {
          name: `Agent Lab - suspicious login on jump-host-01 (${Date.now()})`,
          severity: "High",
          source: "Agent Lab Workshop",
        },
      });
      const run = pyfsrTool("wait_for_playbook_run", {
        playbook: "Tag Agent Lab Alerts",
        since,
        timeout: 120,
      });
      expect(JSON.stringify(run)).toContain("finished");
      // The proof is the read-back, not the run status.
      const query = await apiPost(api, "/api/query/alerts", {
        logic: "AND",
        filters: [{ field: "uuid", operator: "eq", value: created.uuid }],
      });
      const alert = (query["hydra:member"] || [])[0];
      expect(alert.description).toContain("Triaged automatically by the Agent Lab playbook");
    });
  } finally {
    await api.dispose();
  }
});
