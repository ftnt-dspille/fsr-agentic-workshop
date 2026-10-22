"use strict";
// Shared helpers for the workshop specs: the FortiSOAR UI kit, a logged-in session,
// and the capture writer that puts screenshots beside their chapter page.
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
  return kit.launchReproSession(
    {
      FSR_BASE_URL: process.env.FSR_BASE_URL,
      FSR_USERNAME: process.env.FSR_USERNAME,
      FSR_PASSWORD: process.env.FSR_PASSWORD,
    },
    { statePath: opts.statePath || path.join(__dirname, "..", ".state", "session.json") },
  );
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
 * Run one pyfsr agent tool (the same registry the MCP server serves) from a
 * spec, via python3. Proves the exact code path the workshop's agent uses.
 * Throws on a tool error envelope. Requires pyfsr installed for the interpreter
 * (FSR_PYTHON, default python3) and FSR_BASE_URL/FSR_API_KEY in the environment.
 */
function pyfsrTool(name, args) {
  const { execFileSync } = require("child_process");
  const code =
    "import json, sys\n" +
    "from pyfsr.agent.tools import dispatch\n" +
    "from pyfsr.config import EnvConfig\n" +
    "client = EnvConfig.from_env().client()\n" +
    "name, args = json.loads(sys.argv[1]), json.loads(sys.argv[2])\n" +
    "out = dispatch(client, name, args)\n" +
    "import dataclasses\n" +
    "def _plain(o):\n" +
    "    if dataclasses.is_dataclass(o): return dataclasses.asdict(o)\n" +
    "    if hasattr(o, 'model_dump'): return o.model_dump()\n" +
    "    if hasattr(o, '__dict__'): return vars(o)\n" +
    "    return str(o)\n" +
    "json.dump(out, sys.stdout, default=_plain)\n";
  const stdout = execFileSync(process.env.FSR_PYTHON || "python3", ["-c", code, JSON.stringify(name), JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 12 * 60 * 1000,
  });
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

module.exports = { REPO_ROOT, loadKit, openSession, capture, apiContext, apiGet, apiPost, pyfsrTool, pyfsrEnv };
