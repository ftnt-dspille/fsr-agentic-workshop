# Connectors — explore, run, build, and install from the hub

Step-ID prefix: `fsa09`
Devices: `soar` (box UI), `laptop` (local Claude Code agent).
Goal: the student uses the agent to discover and run connectors, build and
deploy their own (agentlab-dadjoke), and install one from the Content Hub.

## Student actions (all automated)

1. fsa09-01-discover-connectors — agent lists connectors; effect-check list_connectors.
2. fsa09-02-run-operation — agent runs a read-only op; capture the connector
   detail panel in the UI (`fsa09-02-run-operation`).
3. fsa09-03-scaffold-connector — scaffold + implement get_joke (pyfsr CLI).
4. fsa09-04-deploy-connector — package, install (confirm-gated), configure, health.
5. fsa09-05-run-own-connector — run get_joke; capture the installed card
   (`fsa09-05-run-own-connector`).
6. fsa09-06-install-from-hub — agent installs a Content Hub connector; capture
   the agent screen (`fsa09-06-install-from-hub`); effect-check it is installed.
7. fsa09-07-configure-and-health — agent configures + health-checks it; effect-
   check Available.

## Prerequisites

- A healthy, configured connector must exist for fsa09-01/-02 to read. The
  built-in utilities/code-snippet connector is always present, so no seeding.
- fsa09-06/-07 depend on the box's Content Hub inventory; the spec picks a
  connector that is present (not a fixed name) so it is box-portable.

## Automation note

fsa09-06/-07 were `manual` (agent-driven, box-inventory-specific). Now automated:
the agent is driven in a local Claude Code TUI (docubot `local` + capture.screen)
and the result is confirmed with an API effect-check, not by eye.

## Cleanup

- Remove agentlab-dadjoke and any hub connector the run installed
  (tools/reset_lab.py).
