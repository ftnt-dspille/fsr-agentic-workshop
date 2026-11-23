# Chapter 11 spec: parked

The pages are live; this spec is not finished. Before the next live run, fix and prove offline:

1. **FortiGate scratch login.** The kit's FortiGate REST scratch handler cannot sign in to the Branch2 GUI
   ("Please Login"; `/logincheck` 404), so the `blocklist-member` kind (docubot `dspille`) is unused here.
2. **Group-check approvals.** The page's group-check prompt makes the agent call both `get_address_groups` and
   `get_list_of_policies`; the step's allowed-tool list held only the first. The agent also tried a shell `ls`,
   which the policy denies. Align the prompt, the allowed read tools and the approval scope (approve only the
   containment write).
3. **Teardown.** The `afterAll` unblock did not run on the last live attempt (no teardown output in the log), and the
   block was removed by hand. Prove the teardown path offline, then let the scratch read-back prove the undo.
4. **Re-take gating.** `FORCE=1` did not re-take a step reused by resume; use `RESUME=0`, and full step ids for `ONLY`.

The RedTeam dashboard has no gui driver, so the scenario is fired over HTTP and has no picture.

## Progress (2026-11-23, later)

Fixed in the spec: read and approval steps may list the folder (`LOOK_AROUND`); the containment is tracked by source IP
before the block call, and the teardown removes every member carrying that IP and logs what it did; the step budget is
12 minutes (agent turns run about 5 minutes each).

Live: steps 01 (fire, alert picture) and 02 (find, FAZ evidence, investigate) passed. `ch11-03-block` failed in 0.5 s:
the toolkit's `search_records` (module alerts, term "Internal port scanning", `fields` + `summary: false`) exited
non-zero, so `requireSource()` never got the scan source. Next: run that exact call by hand, fix the arguments or read
the source another way (for example `findAlert` in the UI or the alert's sourceId), then `FROM=ch11-03-block`.
The blocklist was seed-only after the run.
