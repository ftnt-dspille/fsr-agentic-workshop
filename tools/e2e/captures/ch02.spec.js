"use strict";
// Chapter 2 proof and captures (UI, read-only). Steps prove the AI area the page
// describes; the captures are cropped through shotPanel(). Nothing here spends
// FortiAI tokens or writes to the box. fsa02-05 (the assistant question) stays
// manual because it is a FortiAI chat turn.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("02-agentic-foundations", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await test.step("fsa02-01-ai-enabled", async () => {
      await page.goto(`${s.base}/ai-configuration/prompts`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await expect(page.locator("text=AI feature not enabled")).toHaveCount(0);
      await expect(page.getByText("AI Configurations", { exact: true }).first()).toBeVisible();
      // The enablement switch and token balance live under System > FortiAI, not here.
      await page.goto(`${s.base}/system/system-configuration/ai-features-setup`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await expect(page.getByText("Unlock AI-powered investigation and analysis")).toBeVisible();
    });

    await page.goto(`${s.base}/ai-configuration/prompts`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await shotPanel(page, {
      chapter: "02-agentic-foundations",
      id: "fsa02-01-ai-area",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
    });

    await test.step("fsa02-03-mcp-servers", async () => {
      await page.goto(`${s.base}/ai-configuration/mcp-servers`, { waitUntil: "domcontentloaded" });
      await settle(page);
      for (const name of ["FortiSOAR Module Management", "SOC Framework", "FortiSOAR Playbook Management", "Utility Tools", "AWSEC2"]) {
        await expect(page.getByText(name).first()).toBeVisible();
      }
    });

    await shotPanel(page, {
      chapter: "02-agentic-foundations",
      id: "fsa02-03-mcp-list",
      locator: page.locator("body"),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
      pad: 0,
    });

    await test.step("fsa02-04-sop-compare", async () => {
      await page.goto(`${s.base}/ai-configuration/organizational-context`, { waitUntil: "domcontentloaded" });
      await settle(page);
      // The DEFAULT investigation SOP is one of 44 records; the list shows SOP titles
      // with INVESTIGATION_SOP as their category.
      await expect(page.getByText("INVESTIGATION_SOP").first()).toBeVisible();
      await expect(page.getByText("SOP - Malware Detection", { exact: true }).first()).toBeVisible();
    });
  } finally {
    await s.close();
  }
});
