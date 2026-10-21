# Browser proof harness

The workshop is proved, not just written. Every step a reader performs is marked
in the chapter page, a spec performs the same step on a live FortiSOAR box, and
the screenshots the page shows are written by that spec. `tools/lint-steps.py`
checks that the three sides agree.

## Markers in the chapter pages

```markdown
<!-- step: create-analyst-user -->          a step a spec proves (test.step must exist)
<!-- step: check-verdict-card manual -->    a step a person checks; no spec needed
<!-- capture: verdict-card -->              a screenshot written to content/<chapter>/verdict-card.png
```

Step and capture ids are kebab-case and unique across the content tree.

## One spec per chapter

Each chapter has one spec file in this folder, named after the chapter folder
(`01-intro.spec.js` for `content/01-intro/`). Each step the page marks gets a
`test.step()` with the same id:

```js
"use strict";
const { test } = require("@playwright/test");
const { openSession, capture } = require("./lib/harness");

test("01-intro", async () => {
  const s = await openSession();
  try {
    await test.step("create-analyst-user", async () => {
      // drive the UI, then assert the effect on the box
    });
    await capture(s.page, "01-intro", "verdict-card");
  } finally {
    await s.close();
  }
});
```

Run `python3 tools/lint-steps.py` after changing a page or a spec. It fails when a
non-manual step has no `test.step()`, when a capture has neither a `.png` beside
its page nor an entry in `tools/pending-captures.txt`, or when content contains an
en or em dash, an IPv4 literal, a lab hostname, or a literal `FSR_PASSWORD` or
`FSR_API_KEY` value.

## UI kit and login

`lib/harness.js` loads the FortiSOAR UI kit (`lib/soarKit.js` in the kit). Set
`SOAR_KIT_DIR` to the kit's `repro/js` directory, for example
`~/PycharmProjects/Miscellaneous/fortisoar/repro/js`. The kit's
`launchReproSession(env, { statePath })` launches a Chrome that the appliance's
web filter accepts, logs in as `FSR_USERNAME` with `FSR_PASSWORD`, accepts the
EULA gate if it appears, and caches the session in `statePath`. The kit's page
objects and DOM notes are documented in that repo's README.

Open issue: the kit's README warns that `@playwright/test` imported from two
separate installs throws ("imported twice"). This folder pins
`@playwright/test` 1.59.1, the kit's version, but the two installs are still
separate directories. Until that is verified against a live box, the e2e tier
is unrun.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `FSR_ENV_FILE` | playwright config, reset tool | KEY=VALUE file holding the variables below (keep it out of git) |
| `FSR_BASE_URL` | specs, reset tool | `https://fortisoar.example.com` |
| `FSR_USERNAME` / `FSR_PASSWORD` | specs (UI login) | the account the UI logs in as, `<your-password>` |
| `FSR_API_KEY` | reset tool | `<your-api-key>`, used for the pyfsr API calls |
| `SOAR_KIT_DIR` | specs | path to the kit's `repro/js` directory |

Run the specs with `make e2e FSR_ENV_FILE=/path/to/your.env`. Without
`FSR_ENV_FILE` the target prints the placeholder message and exits 2, so a
missing box is never reported as a pass.

## Captures

`capture(page, "<chapter>", "<capture-id>")` writes
`content/<chapter>/<capture-id>.png`, the same folder as the chapter page, so Hugo
serves it beside the page. The kit's `docShot()` also writes a `manifest.json`
into its target folder, which is why this harness uses its own writer.
