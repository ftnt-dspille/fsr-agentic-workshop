"use strict";
// Chapter 8 proof: the page's exact YAML compiles, publishes, and an alert
// created with the page's values triggers the run and lands the update.
// API-level tier (prompts are proved by agent-drive).
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY and
// pyfsr[playbooks] installed for python3.
const { test, expect } = require("@playwright/test");
const { apiContext, apiPost, pyfsrTool, wanted } = require("./lib/harness");

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
    if (wanted("fsa08-01-compile-yaml")) await test.step("fsa08-01-compile-yaml", async () => {
      const out = pyfsrTool("compile_playbook_yaml", { yaml_text: YAML });
      expect(out.ok).toBe(true);
      expect(out.playbooks).toEqual(["Tag Agent Lab Alerts"]);
    });

    if (wanted("fsa08-02-publish-playbook")) await test.step("fsa08-02-publish-playbook", async () => {
      // Verify by reading back the agent's published playbook, NOT by
      // re-publishing: a second publish of the same name from a different YAML
      // collides with the agent's copy (soft-deleted uuid reuse) and gives a
      // false effect failure. Assert the playbook exists and is active.
      const query = await apiPost(api, "/api/query/workflows", {
        logic: "AND",
        filters: [{ field: "name", operator: "eq", value: "Tag Agent Lab Alerts" }],
      });
      const wf = (query["hydra:member"] || [])[0];
      expect(wf, "Tag Agent Lab Alerts playbook not found on the box").toBeTruthy();
      const active = wf.isActive !== undefined ? wf.isActive : wf.active;
      expect(active).toBe(true);
    });

    if (wanted("fsa08-03-trigger-and-verify")) await test.step("fsa08-03-trigger-and-verify", async () => {
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

    if (wanted("fsa08-04-diagnose-run")) await test.step("fsa08-04-diagnose-run", async () => {
      // Diagnose lab uses its OWN practice playbook (a distinct name), so it never
      // collides with or clobbers the good "Tag Agent Lab Alerts" the earlier pages
      // published - which the agent authors freely, so its step structure is unknown
      // here. Publish the broken practice copy, trigger it, prove diagnose_run names
      // the failing step and error, then publish the fixed copy.
      const PRACTICE = `
collection: Agent Lab
visible: true
playbooks:
  - name: Agent Lab Diagnose Practice
    steps:
      - name: On Alert Created
        type: start_on_create
        module: alerts
        when:
          logic: AND
          filters:
            - field: name
              op: like
              value: "Agent Lab diag%"
        next: Tag Alert
      - name: Tag Alert
        type: update_record
        module: alerts
        record: "RECORD_REF"
        fields:
          description: "Triaged automatically by the Agent Lab playbook"
        next: Done
      - name: Done
        type: end
`;
      const broken = PRACTICE.replace("RECORD_REF", "/api/3/alerts/00000000-0000-0000-0000-000000000000");
      const good = PRACTICE.replace("RECORD_REF", "{{ vars.input.records[0]['@id'] }}");
      expect(pyfsrTool("publish_playbook", { yaml_text: broken }).published).toBe(true);
      const since = new Date().toISOString();
      pyfsrTool("create_record", { module: "alerts", data: { name: `Agent Lab diag test (${Date.now()})`, status: "Open" } });
      const run = pyfsrTool("wait_for_playbook_run", { playbook: "Agent Lab Diagnose Practice", since, timeout: 120 });
      expect(run.status).toBe("failed");
      const diag = pyfsrTool("diagnose_run", { playbook: "Agent Lab Diagnose Practice", run: String(run.pk) });
      expect(diag.verdict).toBe("failed");
      expect(diag.failing_step).toBe("Tag Alert");
      expect(diag.error_message).toMatch(/404|Not Found/i);
      // Publish the fixed copy (same practice playbook) to close the break-fix loop.
      expect(pyfsrTool("publish_playbook", { yaml_text: good }).published).toBe(true);
    });
  } finally {
    await api.dispose();
  }
});
