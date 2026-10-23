"use strict";
// Chapter 7 captures: the People grid filtered to the lab analyst (fsa07-01). The grid is
// filtered on the Last Name column to the lab persona, so only the lab row shows. Its
// e-mail and phone cells are painted over; the name, login row and role stay visible.
// fsa07-02 and fsa07-03 belong to the main-checkout agent and are not touched here.
const { test, expect } = require("@playwright/test");
const { openSession } = require("../lib/harness");
const { shotPanel, settle } = require("./lib/shots");

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60 * 1000);

test("07-users-modules-records", async () => {
  const s = await openSession();
  const page = s.page;
  try {
    await page.goto(`${s.base}/iam/people`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("agentlab_analyst", { exact: false }).first()).toBeVisible();

    // Filter the grid to the lab persona by Last Name.
    const lastName = page.locator("input.ng-isolate-scope[placeholder=\"Search\"]").nth(1);
    await lastName.fill("Lab", { timeout: 30000 });
    await lastName.press("Enter");
    await settle(page, 2000);

    // Tag the e-mail and phone cells of the lab row so the mask hides only those.
    const tagged = await page.evaluate(() => {
      const headers = [...document.querySelectorAll(".ui-grid-header-cell")];
      const idx = (re) => headers.findIndex((h) => re.test((h.innerText || "").trim()));
      const cols = [idx(/^Email/i), idx(/^Work P/i)].filter((i) => i >= 0);
      const rows = [...document.querySelectorAll(".ui-grid-row")].filter((r) => /Lab/.test(r.innerText || ""));
      let n = 0;
      rows.forEach((row) => {
        const cells = row.querySelectorAll(".ui-grid-cell");
        cols.forEach((c) => {
          if (cells[c]) {
            cells[c].setAttribute("data-privacy", "mask");
            n += 1;
          }
        });
      });
      return { rows: rows.length, cells: n };
    });
    expect(tagged.rows, "the lab row is on screen after filtering").toBeGreaterThan(0);

    await shotPanel(page, {
      chapter: "07-users-modules-records",
      id: "fsa07-01-user-in-ui",
      locator: page.locator("body"),
      clip: { x: 340, y: 440, width: 1100, height: 300 },
      pad: 0,
    });
  } finally {
    await s.close();
  }
});
