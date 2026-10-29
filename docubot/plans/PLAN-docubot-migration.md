# PLAN: migrate the agentic workshop onto docubot

Status: DRAFT for review. No code changed yet.

Goal: standardize the workshop's screenshots and automated testing on the shared
`docubot` framework (`~/PycharmProjects/TEC/docubot`), following
`docubot/docs/orchestration.md` (CONFIGURE -> CAPTURE -> VALIDATE, one driver,
reuse don't rebuild), so this workshop uses the same capture engine, device
modules and marker contract as the sibling `secure_use_ai_empowering_soc_noc`
workshop.

## Why this is mostly consolidation, not a rewrite

Three facts make the migration smaller than it looks:

1. **Markers already fit docubot's grammar.** Our ids are `fsaNN-NN-kebab`
   (`fsa07-01-bulk-triage`), which match docubot's
   `^[a-z]+\d{2}-\d{2}(-[a-z0-9]+)+$`. We already use `<!-- step: -->` /
   `<!-- capture: -->` and `manual`. docubot reads the same markers.
2. **The terminal renderer is already shared.** docubot's
   `python/terminal_png.py` was vendored verbatim from our
   `tools/terminal-shots/render.py`. Terminal and agent PNGs rendered through
   docubot's `capture.terminal` come out visually identical to today's.
3. **SOAR-kit coupling is one call.** The only soarKit dependency is
   `launchReproSession` for authenticated UI login. docubot's
   `src/devices/fortisoar.ts` already has the equivalent
   (`launchSoarContext` + `soarLogin`, WAF-safe UA, 8.0 EULA gate, stale-token
   detection) plus `ngGo`/`waitForAngular`/`appClick`/`apiViaApp`/`inDetail` and
   page flows (`waitForAlert`, `hubSearch`, the ingestion wizard, `askAgentic`).

So the browser specs lose their bespoke login/kit layer and ride docubot's
FortiSOAR device module instead. The genuinely new work is the agent-run capture
phase (below), which docubot cannot do natively.

## Current state (inventory, 2026-10-28)

52 step markers (33 manual), 29 capture markers across ch02-ch10. ch01 and ch11
have no markers.

Capture producers today:

| Producer | Count | Becomes |
|---|---|---|
| `tools/e2e/captures/chNN.spec.js` (browser, `shots.js`) | 15 | docubot `capture.shot` in `chapter.spec.ts` |
| `tools/terminal-shots/render.py` (deterministic transcripts) | 2 | docubot `capture.terminal` (transcript source stays) |
| `tools/agent-shots` + `tools/agent-drive` (Claude Code TUI) | 1 | agent-capture phase (new), writes docubot-named PNGs |
| ORPHAN captures (marker + PNG, no regenerating tool) | 11 | must grow a producer or lose the marker |
| pending (no PNG yet) | 2 | produced by the migrated specs |

Validation (API-proof) specs exist only for ch06-ch10 (`tools/e2e/NN-*.spec.js`),
and ch06 proves 1 of its 4 steps. ch02-ch05 steps are all manual and unproven.

Data-hygiene defects the migration must fix (docubot lint will reject the first
two):

- **Duplicate step ids** in ch05: two `fsa05-03-*`, two `fsa05-05-*`. Must be
  renamed unique.
- **Produced-but-unreferenced** shot `fsa07-01-user-in-ui.png` (no marker).
- **Double-produced** `fsa06-04-whoami-claude` (both agent-shots and agent-drive).
- **11 orphan captures** are effectively hand-taken box-sweep shots with no
  regeneration path. Migration is the moment to either give each a spec step or
  drop the marker; we should not carry silent manual captures into the new harness.

## Target layout (mirrors the sibling workshop)

```
fsr-agentic-workshop/
  docubot/
    labconfig.yaml            # one product: fortisoar GUI device; env overrides
    _template-plan.md
    lib/agentlab.ts           # workshop-local helpers on top of docubot exports
    plans/PLAN-docubot-migration.md   # this file
    02-agentic-foundations/
      plan.md
      chapter.spec.ts
    03-investigation-insights/ ...     # one dir per chapter with markers (02-10)
    automation/
      orchestrate.py          # CONFIGURE -> CAPTURE -> AGENT-CAPTURE -> VALIDATE
      agent_capture.py         # the local Claude Code capture phase (see below)
  content/                    # unchanged location; docubot writes PNGs here
```

`chapter.spec.ts` dir basenames must equal the `content/<chapter>` basenames
(they do: `02-agentic-foundations`, etc.). docubot runs via
`npx tsx src/cli.ts run <repo> --chapter <dir>` from the local framework dir (the
npm name `docubot` is an unrelated package), exactly as the reference
`automation/orchestrate.py` does.

## Local-agent captures: now a docubot capability (built 2026-10-28)

Originally docubot's only process capability was SSH, so the local Claude Code
TUI was out of scope. That gap is now closed in docubot itself, all-TypeScript:

- **`local` device + `local(name)` fixture + `LocalSession`** (`src/local.ts`):
  node-pty forks a program on the student's machine in a real pty;
  `@xterm/headless` + `addon-serialize` replay its output into a screen buffer so
  a full-screen TUI's redraws are reconstructed (not a stripped transcript).
  `waitFor`/`waitIdle` are the settle signals; `screen()` returns the
  reconstructed SGR screen.
- **`capture.screen(id, screen, opts)`** renders that screen to
  `content/<chapter>/<id>.png` through docubot's existing TS terminal renderer,
  so an agent shot looks identical to a terminal shot. (Fixed a pre-existing
  fallback bug that stripped SGR color.)
- Proven end-to-end by `docubot/test/local-capture.smoke.mts` (no lab, no
  credits): in-place redraw reconstructed, SGR preserved, PNG rendered.

So **UI screenshots, terminal/CLI captures, AND local-agent TUI captures all now
run through one docubot engine** — the "one main good tool" goal. Install note:
node-pty is native; on a very new Node, `npm rebuild node-pty` once.

What stays workshop-owned is **behavior proof for the agent chapters**, not
capture: `agent-drive/run.py` runs the pages' real prompts through `claude -p`
and validates the tool-call MANIFEST. That is VALIDATE evidence and keeps its
Python engine; docubot now owns the *screenshots* it used to also produce.

- Agent chapter specs capture via `local(...)` + `capture.screen(...)` with
  docubot-legal ids and real `<!-- capture: -->` markers, so `docubot lint` sees
  them as present-on-disk captures (today `agent-run-*.png` are loose
  illustrations outside the marker contract).
- The orchestrator sequences the `claude -p` MANIFEST validation (from
  `agent-drive`) in the VALIDATE phase; the TUI screenshots are now part of
  CAPTURE (docubot), not a separate agent-shots phase.

## Phase split (orchestrate.py)

| Phase | Owner | Tool |
|---|---|---|
| CONFIGURE | API, idempotent | `tools/lab_setup.py seed`/`grant` (+ `reset_lab.py` teardown) |
| CAPTURE (browser + terminal) | docubot | `docubot run --chapter <dir>` |
| AGENT-CAPTURE | workshop | `automation/agent_capture.py` (wraps agent-shots/agent-drive) |
| VALIDATE | read-only API | per-chapter checks + `agent-drive` MANIFEST results |

Each phase skippable (`--skip-*`), keyed to the `fsaNN-NN` ids.

## Open decisions (need your call before I build)

1. **Privacy scrub.** Our `shots.js` refuses to write a PNG if a post-shot text
   scan finds an IP, hostname, email, date or key-like token. docubot's
   `capture.shot` has `mask`/`highlight` but **no refuse-on-leak scan**. This is
   a public-repo-hygiene guarantee we should not lose. Options:
   (a) upstream the scan into docubot's `Capture.shot` (touches the shared
   framework; benefits every workshop), or (b) keep a thin workshop wrapper that
   re-scans committed PNGs. I recommend (a).
2. **Content-hygiene lint.** `lint-steps.py` also enforces no en/em dash, no IPv4
   literal, no lab hostname, no secret literals in content. `docubot lint` only
   checks the marker contract. Keep a slim `content-hygiene` lint (ours, trimmed
   to the non-structural rules) and let docubot own structure. Agree?
3. **Orphan captures (11).** Migrate-and-cover (write a spec step for each) or
   migrate-and-prune (drop markers we won't automate)? This is real coverage
   debt; I lean toward covering the browser-reachable ones and pruning the rest
   with a note.
4. **ch02-ch05 proof.** DECIDED: full automation is the goal — every documented
   step gets automated, not left manual. See "Full automation" below.

## Full automation (target: 52/52, decided 2026-10-28)

The 33 steps that are "manual" today are not hand-work the author owes; they are
steps nobody has written automation for yet. Each class has an automation path:

| Class | Automation | Gate |
|---|---|---|
| Agent-driven TUI (prompt Claude Code, read reply) | docubot `local` + `capture.screen` drives the real TUI; `agent-drive` proves the tool-call MANIFEST | none |
| "Read / verify the result" judgment | reframe as an API effect-check (status changed, record written, verdict cites evidence) — stronger than eyeballing, matches "verify the write, not the card" | none |
| Reach/inventory-dependent prerequisite | seed it in the CONFIGURE phase (orchestration.md), then the step is deterministic | none |
| Spends LLM tokens | automated behind `SPEND_AI=1` (as `spend.js` already does) | opt-in spend |
| Destructive / throwaway-box-only (JSON-trap) | automated, guarded to a disposable box via an env flag | opt-in box |

Two classes stay automated-but-gated (paid, destructive) so they never fire by
accident — this honors the workshop's own rules ("no paid batch runs", "never on
a shared box"), and is automation, not a manual carve-out. The only thing never
asserted is subjective prose quality; the structured effects are asserted and the
narrative is captured as a screenshot for review.

A step kept as a `manual` marker is therefore the exception that needs a written
reason, not the default. docubot now supports the `manual` annotation (added
2026-10-28) for those few.

## Proposed sequencing (each a reviewable commit)

0. Fix the two blocking data defects: rename duplicate ch05 step ids; delete/own
   the unreferenced `fsa07-01-user-in-ui` shot.
1. Scaffold `docubot/` (labconfig.yaml, `_template-plan.md`, `lib/agentlab.ts`
   with the ported `pyfsrTool` CLI wrapper and effect-readback helpers). Install
   docubot locally; `docubot lint` the empty tree.
2. Migrate one browser chapter end-to-end as the pattern (propose **ch09
   connectors**: has both a proof spec and capture spec, modest size). Prove:
   `docubot run --chapter 09-connectors` reproduces today's PNGs and the API
   proofs, lint clean.
3. Settle the privacy-scrub decision (#1) and land it, since every later chapter
   depends on it.
4. Migrate the remaining browser chapters (02, 03, 05, 06, 07, 08, 10).
5. Build `automation/agent_capture.py` + wire `agent-drive`/`agent-shots` PNGs to
   docubot capture ids and the shared renderer (ch04, ch06 agent shots).
6. Fold `terminal-shots` transcripts into `capture.terminal` (ch04, ch06).
7. Write `automation/orchestrate.py`; make `make workshop-proof` call it. Keep
   `make`'s existing front-door target names.
8. Retire the superseded bits: `tools/e2e/captures/*`, `tools/e2e/lib/harness.js`
   (kit login), `lint-steps.py` structural checks. Keep `lab_setup.py`,
   `reset_lab.py`, `agent-drive/run.py`, the trimmed content-hygiene lint.
9. Update README + Makefile + `tools/e2e/README.md` to the new model.

## What is NOT changing

- `lab_setup.py` / `reset_lab.py` (CONFIGURE/teardown) stay.
- `agent-drive/run.py` behavior-proof engine stays (re-homed under `automation/`).
- The fsr-agentic-toolkit / pyfsr CLIs stay the API surface for seeding and
  effect readback.
- Content prose and the `fsaNN-NN` id scheme (minus the dup fixes) stay.
