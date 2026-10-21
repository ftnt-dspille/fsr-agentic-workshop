"use strict";
// Chapter 7 proof: user creation, custom-module publish, record seeding and the
// audit lifecycle, performed against the box exactly as the pages promise.
// API-level tier (prompts are proved by agent-drive). Requires a box that has
// been reset (tools/reset_lab.py) or tolerates agentlab leftovers.
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
// create_module/publish are slow (schema publish): generous timeout.
const { test, expect } = require("@playwright/test");
const { apiContext, apiGet, apiPost, pyfsrTool } = require("./lib/harness");

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60 * 1000);

const MODULE = "agentlab_assets";

test("07-users-modules-records", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  try {
    await test.step("fsa07-01-create-user", async () => {
      const out = pyfsrTool("create_user", {
        loginid: "agentlab_analyst",
        password: `Lab-${Date.now()}-x!`,
        firstname: "Agent",
        lastname: "Lab",
        email: "agentlab_analyst@example.com",
        roles: ["Security Analyst"],
        confirm: true,
      });
      expect(out.user.email).toBe("agentlab_analyst@example.com");
      const people = await apiGet(api, "/api/3/people?email=agentlab_analyst%40example.com");
      expect((people["hydra:member"] || []).length).toBe(1);
    });

    await test.step("fsa07-02-create-module", async () => {
      const described = pyfsrTool("list_modules", {});
      const exists = (described.modules || []).some((m) => m.type === MODULE);
      if (!exists) {
        pyfsrTool("create_module", {
          module: MODULE,
          label: "Agent Lab Assets",
          fields: [
            { name: "hostname", type: "text", required: true },
            { name: "ip_address", type: "text" },
            { name: "owner", type: "text" },
            { name: "criticality", type: "picklist", picklist: "Severity" },
            { name: "notes", type: "richtext" },
          ],
          grant_to: ["Full App Permissions"],
        });
        pyfsrTool("publish", { confirm: true });
      }
      const schema = pyfsrTool("describe_module", { module: MODULE });
      expect(JSON.stringify(schema)).toContain("hostname");
    });

    await test.step("fsa07-03-seed-records", async () => {
      const rows = [
        { hostname: "db-server-01", ip_address: "203.0.113.10", owner: "dba-team", criticality: "Critical" },
        { hostname: "web-server-01", ip_address: "203.0.113.20", owner: "web-team", criticality: "Medium" },
        { hostname: "jump-host-01", ip_address: "203.0.113.30", owner: "secops", criticality: "High" },
      ];
      for (const data of rows) {
        pyfsrTool("get_or_create_record", { module: MODULE, data, key: "hostname" });
      }
      const query = await apiPost(api, `/api/query/${MODULE}`, {
        logic: "OR",
        filters: [
          { field: "criticality.itemValue", operator: "eq", value: "Critical" },
          { field: "criticality.itemValue", operator: "eq", value: "High" },
        ],
      });
      const names = (query["hydra:member"] || []).map((r) => r.hostname).sort();
      expect(names).toEqual(["db-server-01", "jump-host-01"]);
    });

    await test.step("fsa07-04-record-lifecycle", async () => {
      const query = await apiPost(api, `/api/query/${MODULE}`, {
        logic: "AND",
        filters: [{ field: "hostname", operator: "eq", value: "db-server-01" }],
      });
      const rec = (query["hydra:member"] || [])[0];
      expect(rec).toBeTruthy();
      const life = pyfsrTool("record_lifecycle", { entity_uuid: rec.uuid });
      expect(life.summary).toBeTruthy();
    });
  } finally {
    await api.dispose();
  }
});
