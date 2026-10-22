"use strict";
// Chapter 5 captures: the MCP servers list the register page points at. No FortiAI
// spend. The allowlist capture (fsa05-02) needs an agent run and stays pending.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("05-register-mcp-servers", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/ai-configuration/mcp-servers`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Connect MCP Server").first()).toBeVisible();
    await shotPanel(page, {
      chapter: "05-register-mcp-servers",
      id: "fsa05-01-mcp-servers-page",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
      // The Url column is the server address: painted over, never shown.
      mask: ["[ng-bind*='url']", "[ng-bind*='Url']", "[ng-bind*='description']"],
    });
  } finally {
    await s.close();
  }
});
