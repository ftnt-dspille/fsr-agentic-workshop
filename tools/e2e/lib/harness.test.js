"use strict";
// Hermetic test for openSession's login retry. A stub kit stands in for the UI kit:
// the first launch fails the way the kit does when the login field stays hidden while
// the SPA boots; the second launch succeeds. Run: node --test tools/e2e/lib/harness.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const kitDir = fs.mkdtempSync(path.join(os.tmpdir(), "wsp-kit-"));
fs.mkdirSync(path.join(kitDir, "lib"));
const calls = [];
fs.writeFileSync(
  path.join(kitDir, "lib", "soarKit.js"),
  `module.exports = { launchReproSession: async (env, opts) => globalThis.__launch(env, opts) };`,
);
process.env.SOAR_KIT_DIR = kitDir;
process.env.FSR_BASE_URL = "https://box.example.com";
process.env.FSR_USERNAME = "user";
process.env.FSR_PASSWORD = "pass";
const { openSession } = require("./harness");

test("openSession retries once from a clean state when the login field is hidden", async () => {
  const statePath = path.join(kitDir, "session.json");
  fs.writeFileSync(statePath, "{}"); // a cached state that the retry must drop
  globalThis.__launch = async (env, opts) => {
    calls.push({ exists: fs.existsSync(opts.statePath) });
    if (calls.length === 1) {
      throw new Error('waitForSelector: #login_password resolved to hidden');
    }
    return { ok: true };
  };
  const s = await openSession({ statePath });
  assert.deepStrictEqual(s, { ok: true });
  assert.strictEqual(calls.length, 2, "one retry after the failed launch");
  assert.strictEqual(calls[1].exists, false, "the retry starts from a clean state");
});

test("openSession does not retry an unrelated failure", async () => {
  globalThis.__launch = async () => {
    calls.length = 0;
    calls.push(1);
    throw new Error("network down");
  };
  await assert.rejects(openSession({ statePath: path.join(kitDir, "x.json") }), /network down/);
  assert.strictEqual(calls.length, 1);
});
