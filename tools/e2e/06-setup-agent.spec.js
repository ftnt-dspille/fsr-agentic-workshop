"use strict";
// Chapter 6 proof: the box answers the whoami handshake the page promises.
// API-level tier: proves the box-side path of each step; the published prompts
// themselves are proved by the agent-drive tier (make agent-drive).
// NOTE: unrun until the live pass; needs FSR_BASE_URL + FSR_API_KEY.
const { test, expect } = require("@playwright/test");
const { apiContext, apiGet } = require("./lib/harness");

test("06-setup-agent", async ({ playwright }) => {
  const api = await apiContext(playwright.request);
  try {
    await test.step("fsa06-04-whoami", async () => {
      const actor = await apiGet(api, "/api/3/actors/current");
      expect(actor.userId).toBeTruthy();
      const meta = await apiGet(api, "/api/3/staging_model_metadatas?$limit=500&$orderby=type");
      const rows = meta["hydra:member"] || meta;
      expect(rows.length).toBeGreaterThan(10);
    });
  } finally {
    await api.dispose();
  }
});
