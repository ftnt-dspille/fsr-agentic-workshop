"use strict";
// Shared helpers for the workshop specs: the FortiSOAR UI kit, a logged-in session,
// and the capture writer that puts screenshots beside their chapter page.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Load lib/soarKit.js from the FortiSOAR UI kit (SOAR_KIT_DIR = the kit's repro/js). */
function loadKit() {
  const dir = process.env.SOAR_KIT_DIR;
  if (!dir) {
    throw new Error("SOAR_KIT_DIR must point at the FortiSOAR UI kit (its repro/js directory)");
  }
  return require(path.join(path.resolve(dir), "lib", "soarKit.js"));
}

/**
 * Open a logged-in session. Reads FSR_BASE_URL, FSR_USERNAME and FSR_PASSWORD.
 * The kit logs in through the UI, so it needs a username and password, not an
 * API key. statePath caches the login under tools/e2e/.state (gitignored).
 */
async function openSession(opts = {}) {
  const kit = loadKit();
  const env = {
    FSR_BASE_URL: process.env.FSR_BASE_URL,
    FSR_USERNAME: process.env.FSR_USERNAME,
    FSR_PASSWORD: process.env.FSR_PASSWORD,
  };
  const session = { statePath: opts.statePath || path.join(__dirname, "..", ".state", "session.json") };
  // A fresh login can find the password field hidden while the SPA is still
  // booting (the kit waits for it to be visible). Retry once from a clean state.
  try {
    return await kit.launchReproSession(env, session);
  } catch (err) {
    if (!/#login_password|login_password/.test(String(err && err.message))) throw err;
    fs.rmSync(session.statePath, { force: true });
    await new Promise((r) => setTimeout(r, 15000));
    return kit.launchReproSession(env, session);
  }
}

/**
 * Write a screenshot to content/<chapter>/<captureId>.png. `chapter` is the chapter
 * folder name (for example "01-intro"). Matches <!-- capture: id --> markers.
 */
async function capture(page, chapter, captureId) {
  const file = path.join(REPO_ROOT, "content", chapter, `${captureId}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/**
 * A Playwright APIRequestContext authenticated with the API key, for the
 * REST side of each proof (create the record, read the effect back).
 * Reads FSR_BASE_URL + FSR_API_KEY.
 */
async function apiContext(playwrightRequest) {
  const base = process.env.FSR_BASE_URL;
  const key = process.env.FSR_API_KEY;
  if (!base || !key) {
    throw new Error("FSR_BASE_URL and FSR_API_KEY must be set for the API-level proofs");
  }
  const baseURL = base.startsWith("http") ? base : `https://${base}`;
  return playwrightRequest.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Authorization: `API-KEY ${key}`,
      "Content-Type": "application/json",
    },
  });
}

/** GET a JSON API path and fail loudly on a non-2xx status. */
async function apiGet(ctx, path) {
  const res = await ctx.get(path);
  if (!res.ok()) {
    throw new Error(`GET ${path} -> ${res.status()}: ${(await res.text()).slice(0, 400)}`);
  }
  return res.json();
}

/** POST a JSON body and fail loudly on a non-2xx status. */
async function apiPost(ctx, path, data) {
  const res = await ctx.post(path, { data });
  if (!res.ok()) {
    throw new Error(`POST ${path} -> ${res.status()}: ${(await res.text()).slice(0, 400)}`);
  }
  return res.json();
}

/**
 * Run one toolkit tool (the same registry the MCP server serves) from a spec,
 * via the `fsr-agentic-toolkit call` CLI. Proves the exact code path the
 * workshop's agent uses. Throws on a tool error envelope. The CLI is found
 * beside FSR_PYTHON, else on PATH; FSR_BASE_URL/FSR_API_KEY come from the
 * environment, and PYFSR_INSTANCES is pointed at a missing file so the box is
 * the env file's, never a registry default.
 */
function pyfsrTool(name, args) {
  const { execFileSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");
  // Resolve the toolkit CLI the same way the agent-drive MCP server does, so the
  // effect check runs wherever the agent itself runs: beside FSR_PYTHON, then on
  // PATH, then via uvx. A bare ENOENT here otherwise reads as a content failure
  // when the real cause is an unset FSR_PYTHON (see the message below).
  const py = process.env.FSR_PYTHON;
  const beside = py && py.includes(path.sep) ? path.join(path.dirname(py), "fsr-agentic-toolkit") : null;
  const onPath = (() => {
    for (const dir of (process.env.PATH || "").split(path.delimiter)) {
      if (dir && fs.existsSync(path.join(dir, "fsr-agentic-toolkit"))) return path.join(dir, "fsr-agentic-toolkit");
    }
    return null;
  })();
  const resolved = (beside && fs.existsSync(beside) && beside) || onPath;
  const [exe, pre] = resolved ? [resolved, []]
    : ["uvx", ["--from", "fsr-agentic-toolkit", "fsr-agentic-toolkit"]];
  const callEnv = { ...process.env, PYFSR_INSTANCES: path.join(__dirname, "no-instances.toml"), FSR_SUPPRESS_INSECURE_WARNINGS: "true" };
  let stdout;
  try {
    stdout = execFileSync(exe, [...pre, "call", "--json", name, JSON.stringify(args)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: callEnv,
      timeout: 12 * 60 * 1000,
    });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error(
        "fsr-agentic-toolkit not found: set FSR_PYTHON to the interpreter in the " +
        "toolkit's venv (its bin dir holds the fsr-agentic-toolkit CLI), or put the " +
        "CLI on PATH, or install uv so the uvx fallback can run it. This is an env " +
        "setup problem, not a workshop content failure.");
    }
    throw err;
  }
  const result = JSON.parse(stdout);
  if (result && result.error) {
    throw new Error(`${name}: ${JSON.stringify(result.error).slice(0, 500)}`);
  }
  return result;
}

/**
 * Environment for the pyfsr CLI (the `pyfsr` entry point). It lives beside the
 * interpreter named by FSR_PYTHON, so that directory is put first on PATH.
 */
function pyfsrEnv() {
  const py = process.env.FSR_PYTHON;
  const bin = py && py.includes(path.sep) ? path.dirname(py) : null;
  return { ...process.env, PATH: bin ? `${bin}${path.delimiter}${process.env.PATH}` : process.env.PATH };
}

/**
 * Step gating. FSR_ONLY_STEPS (comma-separated step ids, set by the agent-drive runner)
 * restricts a spec to those steps, so a prompt's effect check never re-runs a whole
 * spec's publishes or writes. Unset means every step runs.
 */
function wanted(stepId) {
  const only = (process.env.FSR_ONLY_STEPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return only.length === 0 || only.includes(stepId);
}

module.exports = { wanted, REPO_ROOT, loadKit, openSession, capture, apiContext, apiGet, apiPost, pyfsrTool, pyfsrEnv };
