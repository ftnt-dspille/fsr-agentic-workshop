# Live verification pass (user-run)

Everything local is green (lint, hugo, JS syntax, terminal shots). The
following needs a live 8.0 box and, for the agent tier, a Claude Code login.
Run from the repo root in this order.

## 0. Environment

```bash
export FSR_BASE_URL=<box>            # the lab box
export FSR_API_KEY=<key>             # Full App Permissions key
export FSR_USERNAME=<ui-user>        # for UI captures (soarKit logs in via the UI)
export FSR_PASSWORD=<ui-pass>
export SOAR_KIT_DIR=~/PycharmProjects/Miscellaneous/fortisoar/repro/js
```

For published screenshots, alias the box in /etc/hosts as
`fortisoar.example.com` and set FSR_BASE_URL to that name so URL bars need no
blurring.

## 1. Baseline

```bash
make reset-lab-check        # see what agentlab leftovers exist
make reset-lab              # clean them (destructive, prompts RESET)
```

## 2. API-level proof (specs, in chapter order)

```bash
cd tools/e2e && npm install && npx playwright install chromium && cd ../..
make e2e FSR_ENV_FILE=<env file with the vars above>
```

Chapter 7's module publish takes minutes. Specs marked "unrun until the live
pass" in their headers: expect first-run fixes; each failure names the step id
from the page it proves.

## 3. Prompt proof (agent-drive; consumes Claude credits)

```bash
make agent-drive-plan       # review the 15 prompts first
make agent-drive            # or CHAPTER=07-users-modules-records per chapter
make e2e ...                # re-assert box effects after the agent ran
```

## 4. Screenshots

- UI captures: the `ui-captures` spec writes two; the rest of
  `tools/pending-captures.txt` are taken by hand (or extend the spec with the
  navigation proven in step 2) and dropped into the chapter folders, then
  their pending entries removed.
- Part 1 chapters: every step is `manual` and each page ends with an
  `<!-- NLV: ... -->` list; verify those claims on the box as you capture.

## 5. Close out

```bash
make lint && make build
```

Then commit the captures and any page corrections, and decide the vendored
theme commit (customer-guard false positives; see the repo status).
