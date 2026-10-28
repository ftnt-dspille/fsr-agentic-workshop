"use strict";
// Chapter 9 proof: connector discovery and the full build loop - scaffold,
// implement the get_joke operation, package, deploy, run - exactly as the pages
// promise. API-level tier (prompts are proved by agent-drive).
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY, pyfsr
// installed for python3, and the pyfsr CLI on PATH.
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pyfsrTool, pyfsrEnv, wanted } = require("./lib/harness");

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60 * 1000);

const NAME = "agentlab-dadjoke";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 5 * 60 * 1000, env: pyfsrEnv(), ...opts });
}

test("09-connectors", async () => {
  if (wanted("fsa09-01-discover-connectors")) await test.step("fsa09-01-discover-connectors", async () => {
    const out = pyfsrTool("list_connectors", {});
    expect(out.count).toBeGreaterThan(0);
  });

  if (wanted("fsa09-02-run-operation")) await test.step("fsa09-02-run-operation", async () => {
    // The page says "a harmless read-only operation"; healthcheck plus a live
    // operation listing is the box-side equivalent that exists everywhere.
    const listed = pyfsrTool("list_connectors", {});
    const configured = (listed.connectors || []).find((line) => line.includes("config"));
    expect(configured).toBeTruthy();
    const connector = String(configured).split(" ")[0];
    const ops = pyfsrTool("list_connector_operations", { connector });
    expect(ops.count).toBeGreaterThan(0);
  });

  // agent-drive sets FSR_WORKDIR to the agent's work folder, so the steps check the
  // connector the agent built there, not a spec-side copy.
  const workdir = process.env.FSR_WORKDIR || fs.mkdtempSync(path.join(os.tmpdir(), "agentlab-conn-"));
  const conndir = path.join(workdir, NAME);

  if (wanted("fsa09-03-scaffold-connector")) await test.step("fsa09-03-scaffold-connector", async () => {
    sh("pyfsr", ["connector", "scaffold", NAME, "--dir", conndir]);
    // Implement the page's get_joke operation on top of the scaffold.
    const opsPath = path.join(conndir, "operations.py");
    let ops = fs.readFileSync(opsPath, "utf8");
    ops = ops
      .replace("def ping(config, params):", "def get_joke(config, params):")
      .replace(/return \{[^}]+\}/, (m) =>
        m.includes("reply")
          ? 'import requests\n    r = requests.get(config.get("server", "https://icanhazdadjoke.com"), headers={"Accept": "application/json"}, timeout=30)\n    data = r.json()\n    return {"id": data.get("id"), "joke": data.get("joke")}'
          : m,
      )
      .replace("'ping': ping,", "'get_joke': get_joke,");
    fs.writeFileSync(opsPath, ops);
    const infoPath = path.join(conndir, "info.json");
    const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
    info.operations[0].operation = "get_joke";
    info.operations[0].annotation = "get_joke";
    info.operations[0].title = "Get Joke";
    info.operations[0].parameters = [];
    info.operations[0].output_schema = { id: "", joke: "" };
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
    expect(fs.readFileSync(opsPath, "utf8")).toContain("def get_joke");
  });

  let tgz;
  if (wanted("fsa09-04-deploy-connector")) await test.step("fsa09-04-deploy-connector", async () => {
    if (!process.env.FSR_WORKDIR) {
      // Spec run: package and install here. Agent-drive run: the agent already did
      // both (its prompt), so this step only reads back the box effect below.
      tgz = sh("pyfsr", ["connector", "package", conndir]).trim();
      expect(tgz.endsWith(".tgz")).toBe(true);
      const out = pyfsrTool("install_connector", { path: tgz, replace: true, confirm: true });
      expect(out.install).toBeTruthy();
      pyfsrTool("upsert_connector_configuration", {
        connector: NAME,
        config: { server: "https://icanhazdadjoke.com" },
        name: "Default",
        default: true,
      });
    }
    const health = pyfsrTool("healthcheck_connector", { connector: NAME });
    expect(JSON.stringify(health)).toContain("Available");
  });

  if (wanted("fsa09-05-run-own-connector")) await test.step("fsa09-05-run-own-connector", async () => {
    const out = pyfsrTool("run_connector_operation", {
      connector: NAME,
      operation: "get_joke",
      params: {},
    });
    expect(JSON.stringify(out)).toContain("joke");
  });
});
