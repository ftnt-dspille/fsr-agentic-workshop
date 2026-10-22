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
      // list_modules truncates on a box with many modules, so probe the module itself.
      let exists = true;
      try {
        pyfsrTool("describe_module", { module: MODULE });
      } catch (err) {
        if (!/not found|does not exist|unknown module/i.test(String(err.message))) throw err;
        exists = false;
      }
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
          // grant_to is not sent: on 8.0 it runs through the bulk routes, which reject
          // API-key auth. The role grant is a UI step (see the page), checked below.
        });
        pyfsrTool("publish", { confirm: true });
      }
      const schema = pyfsrTool("describe_module", { module: MODULE });
      expect(JSON.stringify(schema)).toContain("hostname");

      // Proof the key can use the module: the role grant (Full App Permissions) must
      // be in place. This spec does not grant; a 403 here names the step to do.
      const read = await api.get(`/api/3/${MODULE}?$limit=1`);
      expect(read.status(), "the key cannot read agentlab_assets: grant Full App Permissions read/create/update/delete on it in the UI, then rerun").toBe(200);

      // The page's test record: hostname build-server-01, criticality High.
      pyfsrTool("get_or_create_record", {
        module: MODULE,
        data: { hostname: "build-server-01", criticality: "High" },
        key: "hostname",
      });
      const probe = await apiGet(api, `/api/3/${MODULE}?hostname=build-server-01`);
      expect((probe["hydra:member"] || []).length).toBeGreaterThan(0);
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
      expect(names).toEqual(["build-server-01", "db-server-01", "jump-host-01"]); // build-server-01 is the step-02 test record (High)
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
