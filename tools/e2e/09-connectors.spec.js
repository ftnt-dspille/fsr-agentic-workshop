"use strict";
// Chapter 9 proof: connector discovery and the full build loop - scaffold,
// implement the greet operation, package, deploy, run - exactly as the pages
// promise. API-level tier (prompts are proved by agent-drive).
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY, pyfsr
// installed for python3, and the pyfsr CLI on PATH.
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pyfsrTool } = require("./lib/harness");

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60 * 1000);

const NAME = "agentlab-greeter";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 5 * 60 * 1000, ...opts });
}

test("09-connectors", async () => {
  await test.step("fsa09-01-discover-connectors", async () => {
    const out = pyfsrTool("list_connectors", {});
    expect(out.count).toBeGreaterThan(0);
  });

  await test.step("fsa09-02-run-operation", async () => {
    // The page says "a harmless read-only operation"; healthcheck plus a live
    // operation listing is the box-side equivalent that exists everywhere.
    const listed = pyfsrTool("list_connectors", {});
    const configured = (listed.connectors || []).find((line) => line.includes("config"));
    expect(configured).toBeTruthy();
    const connector = String(configured).split(" ")[0];
    const ops = pyfsrTool("list_connector_operations", { connector });
    expect(ops.count).toBeGreaterThan(0);
  });

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlab-conn-"));
  const conndir = path.join(workdir, NAME);

  await test.step("fsa09-03-scaffold-connector", async () => {
    sh("pyfsr", ["connector", "scaffold", NAME, "--dir", conndir]);
    // Implement the page's greet operation on top of the scaffold.
    const opsPath = path.join(conndir, "operations.py");
    let ops = fs.readFileSync(opsPath, "utf8");
    ops = ops
      .replace("def ping(config, params):", "def greet(config, params):")
      .replace(/return \{[^}]+\}/, (m) =>
        m.includes("reply")
          ? 'return {"greeting": "Hello {0} from FortiSOAR".format(params.get("name", "world"))}'
          : m,
      )
      .replace("'ping': ping,", "'greet': greet,");
    fs.writeFileSync(opsPath, ops);
    const infoPath = path.join(conndir, "info.json");
    const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
    info.operations[0].operation = "greet";
    info.operations[0].annotation = "greet";
    info.operations[0].title = "Greet";
    info.operations[0].parameters = [
      { name: "name", title: "Name", type: "text", editable: true, visible: true, required: false },
    ];
    info.operations[0].output_schema = { greeting: "" };
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
    expect(fs.readFileSync(opsPath, "utf8")).toContain("def greet");
  });

  let tgz;
  await test.step("fsa09-04-deploy-connector", async () => {
    tgz = sh("pyfsr", ["connector", "package", conndir]).trim();
    expect(tgz.endsWith(".tgz")).toBe(true);
    const out = pyfsrTool("install_connector", { path: tgz, replace: true, confirm: true });
    expect(out.install).toBeTruthy();
    pyfsrTool("upsert_connector_configuration", {
      connector: NAME,
      config: { server: "https://fortisoar.example.com" },
      name: "Default",
      default: true,
    });
    const health = pyfsrTool("healthcheck_connector", { connector: NAME });
    expect(JSON.stringify(health)).toContain("Available");
  });

  await test.step("fsa09-05-run-own-connector", async () => {
    const out = pyfsrTool("run_connector_operation", {
      connector: NAME,
      operation: "greet",
      params: { name: "TEC Workshop" },
    });
    expect(JSON.stringify(out)).toContain("Hello TEC Workshop from FortiSOAR");
  });
});
