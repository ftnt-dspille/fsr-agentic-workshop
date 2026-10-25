"use strict";
// Chapter 7 proof: user creation, custom-module publish, record seeding and the
// audit lifecycle, performed against the box exactly as the pages promise.
// API-level tier (prompts are proved by agent-drive). Requires a box that has
// been reset (tools/reset_lab.py) or tolerates agentlab leftovers.
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
// create_module/publish are slow (schema publish): generous timeout.
const { test, expect } = require("@playwright/test");
const { apiContext, apiGet, apiPost, pyfsrTool, wanted } = require("./lib/harness");

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60 * 1000);

const MODULE = "agentlab_assets";

test("07-users-modules-records", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  try {
    if (wanted("fsa07-01-bulk-triage")) await test.step("fsa07-01-bulk-triage", async () => {
      // Prove the batch mechanism the page promises: query a set of Open alerts and
      // move every one to Investigating. Seed two Open marker alerts, update them, read
      // the status back, then soft-delete them so the box is left as found.
      const marker = `Agent Lab bulktriage e2e ${Date.now()}`;
      const ids = [];
      for (const suffix of ["A", "B"]) {
        const out = pyfsrTool("create_record", { module: "alerts", data: { name: `${marker} ${suffix}`, status: "Open" } });
        const id = out["@id"] || `/api/3/alerts/${out.uuid}`;
        ids.push(id);
      }
      // The agent does query -> update per row; here we drive the writes directly.
      for (const ref of ids) {
        pyfsrTool("update_record", { module: "alerts", ref, data: { status: "Investigating" } });
      }
      // Read the effect back from the box: every seeded alert is now Investigating.
      for (const ref of ids) {
        const uuid = ref.split("/").pop();
        const rec = await apiGet(api, `/api/3/alerts/${uuid}`);
        const status = rec.status && (rec.status.itemValue || rec.status.value || rec.status);
        expect(status).toBe("Investigating");
      }
      // Clean up the marker alerts (delete_record is tier 3, so confirm it).
      for (const ref of ids) {
        pyfsrTool("delete_record", { module: "alerts", ref, confirm: true });
      }
    });

    if (wanted("fsa07-02-create-module")) await test.step("fsa07-02-create-module", async () => {
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

    if (wanted("fsa07-03-seed-records")) await test.step("fsa07-03-seed-records", async () => {
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
      // Critical and High seeds. build-server-01 (High) is the step-02 test record: not required here, so this step runs alone.
      expect(names).toEqual(expect.arrayContaining(["db-server-01", "jump-host-01"]));
    });

    if (wanted("fsa07-04-record-lifecycle")) await test.step("fsa07-04-record-lifecycle", async () => {
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
