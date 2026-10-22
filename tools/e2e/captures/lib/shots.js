"use strict";
// Capture helper for the workshop screenshots. Every committed capture goes through
// shotPanel(): it crops to a named panel, masks the shared privacy selectors, runs a
// post-shot privacy scan over the pixels it is about to write, and only then saves
// the PNG beside its chapter page (content/<chapter>/<id>.png).
//
// Privacy is built in, not reviewed after:
//  - Screenshots come from a headless browser, so there is no URL bar to show.
//  - SHARED_MASK covers the user menu and avatar, timestamps, API key names and the
//    setup-guide control. Playwright paints these over before the shot is taken.
//  - The scan reads the text that sits inside the crop (outside the mask) and fails
//    the shot on an IPv4 literal, a hostname or URL, an e-mail address, a date or
//    time, a key-like token, or the login name. It reports the category, not the text.
const fs = require("fs");
const path = require("path");
const { REPO_ROOT } = require("../../lib/harness");

/** Selectors painted over in every capture. Extend per capture with `mask`, never remove. */
const SHARED_MASK = [
  "#user-links",            // user menu, avatar and login name
  ".userpic",
  "#onborading-setup-guide-btn",
  "[data-privacy='mask']",  // any element a page wants hidden in its own capture
  ".api-key-name",          // access key names
  ".key-name",
  "time",                   // timestamps
  "[ng-bind*='createDate']",
  "[ng-bind*='modifyDate']",
  "[ng-bind*='lastSeen']",
];

const DATE_RE = new RegExp([
  "\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b",           // 10/22/2026
  "\\b\\d{4}-\\d{2}-\\d{2}\\b",                  // 2026-10-22
  "\\b\\d{1,2}:\\d{2}(:\\d{2})?\\s?(AM|PM|am|pm)?\\b", // 08:00 AM
  "\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2},? \\d{4}\\b",
].join("|"));
const IPV4_RE = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/;
const URL_RE = /https?:\/\/|\bwww\.|[a-z0-9-]+\.(com|net|org|io|local|lan|internal|example)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const SENSITIVE_LEAF = new RegExp([
  "(?<![\\d.])(?:\\d{1,3}\\.){3}\\d{1,3}(?![\\d.])",  // IPv4
  "https?:\\/\\/|\\bwww\\.",                             // URL
  "[^\\s@]+@[^\\s@]+\\.[a-z]{2,}",                        // e-mail
  DATE_RE.source,                                              // date or time
].join("|"), "i");
const KEYISH_RE = /\b(?=[A-Za-z0-9_\-]*\d)(?=[A-Za-z0-9_\-]*[A-Za-z])[A-Za-z0-9_\-]{24,}\b/;

/** Hostnames and login names from the environment that must never appear in a shot. */
function sensitiveTerms() {
  const terms = [];
  const base = (process.env.FSR_BASE_URL || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (base) terms.push(base.split(":")[0]);
  if (process.env.FSR_USERNAME) terms.push(process.env.FSR_USERNAME);
  return terms.filter((t) => t.length >= 4);
}

/**
 * Scan the text inside `box` (viewport coordinates) that is not under a mask.
 * Returns a list of { category } findings; an empty list is a pass.
 */
async function privacyScan(page, box, maskSelector) {
  const texts = await page.evaluate(([b, sel]) => {
    const masked = (node) => {
      const el = node.nodeType === 1 ? node : node.parentElement;
      return !!(el && el.closest(sel));
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue && n.nodeValue.trim() && !masked(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const range = document.createRange();
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const hit = r.right > b.x && r.left < b.x + b.width && r.bottom > b.y && r.top < b.y + b.height;
      if (hit) out.push(n.nodeValue.trim());
    }
    return out;
  }, [box, maskSelector]);
  const text = texts.join("\n");
  const findings = [];
  if (IPV4_RE.test(text)) findings.push({ category: "ip-address" });
  if (URL_RE.test(text)) findings.push({ category: "url-or-hostname" });
  if (EMAIL_RE.test(text)) findings.push({ category: "email" });
  if (DATE_RE.test(text)) findings.push({ category: "date-or-time" });
  if (KEYISH_RE.test(text)) findings.push({ category: "key-like-token" });
  for (const term of sensitiveTerms()) {
    if (text.toLowerCase().includes(term.toLowerCase())) findings.push({ category: "box-identity" });
  }
  return findings;
}

/**
 * Take one capture of `locator` (an element that bounds the panel) into
 * content/<chapter>/<id>.png. Options:
 *   pad      pixels of margin around the element (default 8)
 *   mask     extra selectors to paint over (added to SHARED_MASK)
 *   clip     optional { x, y, width, height } inside the element's box, for a tighter crop
 * Throws, and writes nothing, when the privacy scan finds anything.
 */
async function shotPanel(page, { chapter, id, locator, mask = [], pad = 8, clip = null }) {
  if (!chapter || !id) throw new Error("shotPanel: chapter and id are required");
  await locator.first().waitFor({ state: "visible", timeout: 60000 });
  await locator.first().scrollIntoViewIfNeeded();
  const raw = await locator.first().boundingBox();
  if (!raw) throw new Error(`shotPanel(${id}): the panel has no box`);
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  const box = clip
    ? { x: raw.x + clip.x, y: raw.y + clip.y, width: clip.width, height: clip.height }
    : { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
  // Pad, clamped to the viewport so the clip is valid.
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const crop = {
    x, y,
    width: Math.min(vp.width - x, box.width + 2 * pad),
    height: Math.min(vp.height - y, box.height + 2 * pad),
  };
  const hidden = await autoMaskSensitive(page, crop);
  if (hidden) console.log(`shotPanel(${id}): painted over ${hidden} element(s) holding an address`);
  const selector = [...SHARED_MASK, ...mask].join(", ");
  const findings = await privacyScan(page, crop, selector);
  if (findings.length) {
    const cats = [...new Set(findings.map((f) => f.category))].join(", ");
    throw new Error(`shotPanel(${id}): privacy scan failed (${cats}). Add a mask for the element that shows it, or crop it out. Nothing was written.`);
  }
  const file = path.join(REPO_ROOT, "content", chapter, `${id}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    clip: crop,
    animations: "disabled",
    caret: "hide",
    mask: [page.locator(selector)],
    maskColor: "#2b2b2b",
  });
  return { file, crop };
}

/**
 * Paint over leaf elements whose own text is an IP, URL or e-mail address by tagging them
 * data-privacy="mask" (already in SHARED_MASK). Returns how many were tagged, so the
 * caller can report what was hidden. The scan still runs on whatever remains visible.
 */
async function autoMaskSensitive(page, box) {
  return page.evaluate(([src]) => {
    const re = new RegExp(src, "i");
    let count = 0;
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length === 0 && re.test(el.textContent || "")) {
        el.setAttribute("data-privacy", "mask");
        count += 1;
      }
    });
    return count;
  }, [SENSITIVE_LEAF.source]);
}

/** Wait for the SPA to settle before a capture. */
async function settle(page, ms = 1500) {
  const kit = require(path.join(path.resolve(process.env.SOAR_KIT_DIR), "lib", "soarKit.js"));
  await kit.waitForAngular(page, { timeoutMs: 60000 });
  await page.waitForTimeout(ms);
}

module.exports = { SHARED_MASK, privacyScan, shotPanel, settle, sensitiveTerms, autoMaskSensitive };
