"use strict";
// Gate for specs that spend FortiAI tokens (investigations, insight runs, the lab
// agent). Nothing spends unless SPEND_AI=1 is set in the environment, and the gate
// fails closed: it refuses to run when it cannot read the token balance, when the
// balance is under the floor, or when the balance cannot be parsed.
//
// The balance is read from System > System Configuration > FortiAI, the page
// LIVE_PASS and the chapter 2 page name. The tokens spent by a spec are the balance
// before minus the balance after; the proof report prints them per spec.
const { test } = require("@playwright/test");

const FLOOR = Number(process.env.SPEND_AI_FLOOR || 100000);

/** True only when the operator opted in for this run. */
function spendEnabled() {
  return process.env.SPEND_AI === "1";
}

/** Parse a token count such as "412,350" or "412k" from the balance text. Returns null if absent. */
function parseBalance(text) {
  const m = /balance[^0-9]{0,40}([\d][\d,.]*)\s*(k|m)?/i.exec(text || "");
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "k" || m[2] === "K" ? 1000 : m[2] === "m" || m[2] === "M" ? 1000000 : 1;
  return Math.round(n * mult);
}

/** Read the balance from the FortiAI page. Returns a number or null. */
async function readBalance(session) {
  const { base, page } = session;
  await page.goto(`${base}/system/system-configuration/ai-features-setup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const text = await page.evaluate(() => document.body.innerText);
  return parseBalance(text);
}

/**
 * Call at the top of a spend test. Skips (visibly, with the reason) unless
 * SPEND_AI=1. When enabled, refuses below the floor. Returns the starting balance.
 */
async function requireAiSpend(session, info = test.info()) {
  if (!spendEnabled()) {
    test.skip(true, "FortiAI spend gated: set SPEND_AI=1 to run (costs tokens)");
    return null;
  }
  const before = await readBalance(session);
  if (before === null) {
    throw new Error("FortiAI spend refused: the token balance could not be read (fails closed)");
  }
  if (before < FLOOR) {
    throw new Error(`FortiAI spend refused: balance is under the ${FLOOR} floor`);
  }
  info.annotations.push({ type: "tokens-before", description: String(before) });
  return before;
}

/** Call at the end of a spend test: records tokens spent for the proof report. */
async function reportSpend(session, before, info = test.info()) {
  if (before === null) return null;
  const after = await readBalance(session);
  const spent = after === null ? null : before - after;
  info.annotations.push({ type: "tokens-spent", description: spent === null ? "unknown" : String(spent) });
  return spent;
}

module.exports = { FLOOR, spendEnabled, parseBalance, requireAiSpend, reportSpend };
