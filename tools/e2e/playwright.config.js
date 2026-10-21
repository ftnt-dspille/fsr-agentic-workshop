"use strict";
// Browser proof harness config for the workshop. Specs live beside this file, one
// per chapter (<chapter>.spec.js), and drive a live FortiSOAR box. Nothing here
// reaches a box unless FSR_BASE_URL is set (directly or through FSR_ENV_FILE), so
// a bare run without configuration fails at the first spec rather than guessing.
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const envFile = process.env.FSR_ENV_FILE;
if (envFile) {
  require("dotenv").config({ path: path.resolve(envFile), quiet: true });
}

const baseURL = (process.env.FSR_BASE_URL || "").replace(/\/+$/, "");

module.exports = defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.js$/,
  timeout: 120000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: baseURL || undefined,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
  },
});
