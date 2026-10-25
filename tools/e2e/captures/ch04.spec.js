"use strict";
// Chapter 4 capture: the Content Hub "Upload AI Agent" slide-in panel (drop zone and
// the Replace existing version checkbox), so a learner sees the upload control before
// they use it. This only opens the panel; it uploads nothing, so it spends no tokens
// and changes nothing on the box.
//
// The control is gated: the "Upload AI Agent" dropdown item appears only when the
// Advanced Development "Import/Upload Custom AI Agent" setting is on. The test skips
// (not fails) when the item is absent, so a box without the toggle does not break CI.
const path = require("path");
const { test } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel } = require("./lib/shots");

const aiAgents = require(path.join(path.resolve(process.env.SOAR_KIT_DIR || "."), "pages", "aiAgents.js"));

test.describe.configure({ mode: "serial" });
test.setTimeout(5 * 60 * 1000);

test("04-build-your-own-agent", async () => {
  const s = await openSession();
  const page = s.page;
  page.setDefaultTimeout(30000);
  try {
    const { available } = await aiAgents.agentUploadAvailable(page, s.base);
    test.skip(!available, "Advanced Development 'Import/Upload Custom AI Agent' toggle is off");

    await aiAgents.openAgentCatalog(page, s.base, {});
    await page.locator("#upload-btn").click();
    await page.waitForTimeout(1000);
    await page.locator("#upload-ai_agent").click();
    // Wait for the slide-in panel's drop zone to render.
    await page.getByText(/Drag and Drop/i).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);

    // The panel is a right-side sheet; crop to it so the dimmed catalog behind it is
    // left out. body is the locator; the clip is absolute viewport coordinates.
    await shotPanel(page, {
      chapter: "04-build-your-own-agent",
      id: "fsa04-04-upload-dialog",
      locator: page.locator("body"),
      clip: { x: 540, y: 0, width: 960, height: 500 },
      pad: 0,
    });
  } finally {
    await s.close();
  }
});
