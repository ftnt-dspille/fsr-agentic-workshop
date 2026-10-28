# Agent-drive proof: REPORT

The 15 page prompts, run through `claude -p` against the lab box, one fresh session per prompt.
Baseline model: `claude-sonnet-5-5`. Opus (`claude-opus-4-8`) ran 3 prompts before it was stopped; those rows are kept.

Grading: behavior checks (tool sequence, forbidden or unexpected confirm calls, answer text, Bash allowance,
and the workaround check: built-in tools on a prompt the page answers with MCP tools) plus the box effect (e2e step).
'Run' is the grade recorded at run time. 'Regrade' re-applies the current behavior checks to the saved transcript (no calls).

## Side by side

| Prompt | Opus run | Opus regrade | Sonnet run | Sonnet regrade |
|---|---|---|---|---|
| `06-setup-agent/02-wire-the-agent#1` | pass | n/a | pass | pass |
| `07-users-modules-records/01-create-a-user#1` | pass | pass | pass | fail: workaround:Bash |
| `07-users-modules-records/02-create-a-module#1` | pass | fail: workaround:Bash, workaround:Bash, workaround:Read, workaround:Monitor, workaround:ScheduleWakeup, workaround:Bash, workaround:ScheduleWakeup | pass | fail: workaround:Bash, workaround:Monitor, workaround:Monitor |
| `07-users-modules-records/03-work-with-records#1` | not run | - | pass | pass |
| `07-users-modules-records/03-work-with-records#2` | not run | - | pass | fail: tool-sequence, answer-missing:create |
| `08-playbook/01-author-and-publish#1` | not run | - | pass | fail: workaround:Skill, workaround:Bash, workaround:Bash |
| `08-playbook/01-author-and-publish#2` | not run | - | fail (tool-sequence) | fail: tool-sequence, workaround:Bash, workaround:Bash |
| `08-playbook/02-trigger-and-verify#1` | not run | - | pass | pass |
| `09-connectors/01-explore-and-run#1` | not run | - | pass | pass |
| `09-connectors/01-explore-and-run#2` | not run | - | pass | pass |
| `09-connectors/02-build-a-connector#1` | not run | - | pass | pass |
| `09-connectors/02-build-a-connector#2` | not run | - | fail (local:no-tgz-in-work-folder) | pass |
| `09-connectors/02-build-a-connector#3` | not run | - | pass | pass |
| `10-capstone-investigation/01-capstone#1` | not run | - | fail (tool-sequence) | pass |
| `10-capstone-investigation/01-capstone#2` | not run | - | fail (effect:fsa10-02-investigate) | pass |

Opus 06 transcript was overwritten before it could be preserved (flat transcript names). Its regrade is not available.

## Tool-call sequence (MCP tool names, in order, from the saved transcript)

- `06-setup-agent/02-wire-the-agent#1` (Sonnet): whoami -> list_modules -> appliance_info_identity
- `07-users-modules-records/01-create-a-user#1` (Sonnet): Bash -> create_user -> create_user -> query_records
- `07-users-modules-records/02-create-a-module#1` (Sonnet): create_module -> describe_module -> list_modules -> publish -> publish -> create_record -> Bash -> describe_module -> create_record -> Monitor -> create_record -> Monitor -> create_record -> get_record
- `07-users-modules-records/03-work-with-records#1` (Sonnet): describe_module -> get_or_create_record -> get_or_create_record -> get_or_create_record -> query_records -> resolve_picklist -> resolve_picklist -> query_records -> query_records
- `07-users-modules-records/03-work-with-records#2` (Sonnet): search_records -> list_modules -> query_records -> search_records -> search_records -> search_records -> search_records -> search_records -> query_records -> query_records -> query_records -> search_records -> search_records -> search_records
- `08-playbook/01-author-and-publish#1` (Sonnet): Skill -> Bash -> Bash -> compile_playbook_yaml
- `08-playbook/01-author-and-publish#2` (Sonnet): Bash -> Bash
- `08-playbook/02-trigger-and-verify#1` (Sonnet): create_record -> wait_for_playbook_run -> get_record -> diagnose_run
- `09-connectors/01-explore-and-run#1` (Sonnet): list_connectors -> healthcheck_connector -> list_connector_operations
- `09-connectors/01-explore-and-run#2` (Sonnet): list_connectors -> list_connector_operations -> run_connector_operation
- `09-connectors/02-build-a-connector#1` (Sonnet): Bash -> Bash -> Bash
- `09-connectors/02-build-a-connector#2` (Sonnet): Bash -> Bash -> install_connector -> default_connector_config -> upsert_connector_configuration -> healthcheck_connector
- `09-connectors/02-build-a-connector#3` (Sonnet): run_connector_operation
- `10-capstone-investigation/01-capstone#1` (Sonnet): describe_module -> create_record
- `10-capstone-investigation/01-capstone#2` (Sonnet): search_records -> list_connectors -> search_records -> query_records -> search_records -> record_lifecycle -> search_records -> query_records -> record_lifecycle -> search_records -> query_records -> search_records -> list_connector_operations -> run_connector_operation -> update_record
- `07-users-modules-records/01-create-a-user#1` (Opus): create_user -> query_records
- `07-users-modules-records/02-create-a-module#1` (Opus): whoami -> get_picklist_values -> create_module -> describe_module -> publish -> publish -> Bash -> describe_module -> publish -> Bash -> Read -> publish -> Monitor -> publish -> ScheduleWakeup -> publish -> Bash -> create_record -> ScheduleWakeup -> create_record

## Screenshots

Per-prompt terminal shots are NOT yet rendered. Pending.

## Failure classification

Every failure is classified by its cause. The evidence is the saved transcript (tool names and results, not arguments).

| Prompt | Failed check | Cause | Evidence |
|---|---|---|---|
| `07-users-modules-records/03-work-with-records#2` (Sonnet) | tool-sequence, answer-missing | Page prompt did not name the module (contributing) and the `search_records` term search returned 0 for a record that exists in `agentlab_assets` (tool defect). | Transcript: `search_records` with term on `agentlab_assets` returned total 0; a filtered `query_records` on the same module finds the record. Page changed to name the module; rerun on Sonnet PASS. Search defect still open: framework/pyfsr owner. |
| `08-playbook/01-author-and-publish#2` (Sonnet) | tool-sequence, workaround | Harness: each prompt runs in a fresh session, but the page's #2 ("publish that playbook") assumes #1's conversation. The agent had no YAML and searched the work folder with Bash. | Transcript: no YAML in session; Bash `ls`/`find` in the work folder; final answer declines to publish. Not a page wording fix: needs the runner to resume the session for chained prompts. Decision needed. |
| `09-connectors/02-build-a-connector#2` (Sonnet) | local:no-tgz-in-work-folder (plus the install itself) | Box state: a connector named `agentlab-greeter` is already active on the lab box, so `install_connector` returns "Connector with same name is already active". The check was too strict (tgz sits in the connector's `dist` folder). | Transcript: package built the tgz under `agentlab-greeter/dist`; install rejected; configure and healthcheck Available. Check now searches recursively. Install step still unproven until the stale connector is replaced or removed (decision). |
| `10-capstone-investigation/01-capstone#1` (Sonnet) | tool-sequence | Check too strict: the page never asks the agent to wait for the playbook run (the page only says the playbook "will tag it within seconds"). | Transcript: `describe_module`, `create_record`; the effect step still checks the playbook run. Manifest no longer requires `wait_for_playbook_run`; regrade PASS. |
| `10-capstone-investigation/01-capstone#2` (Sonnet) | effect fsa10-02-investigate | Check defect: the effect read the newest duplicate-titled alert, not the one the agent wrote. The page prompt is correct (it asks for the write-back). Duplicates come from repeated runs (box state). | Transcript: `update_record` on alert `e0af...` with VERDICT text; the effect step checked a different duplicate. Effect re-checked read-only: PASS. Effect now accepts any beaconing alert with the write-back. |
| `07-users-modules-records/01-create-a-user#1` (Sonnet regrade) | workaround:Bash | Tool/framework gap: no MCP tool generates a password, so the agent used Bash/python. Run-time grade was PASS. | Transcript: one Bash call with a Python `secrets` command. Left as a workaround fail. |
| `08-playbook/01-author-and-publish#1` (Sonnet regrade) | workaround:Skill, Bash | Tool/framework gap: no MCP reference for playbook YAML authoring; the agent loaded a skill and grepped framework docs. Run-time grade was PASS. | Transcript: Skill `fsr-playbooks` and two Bash greps of the authoring doc. |
| `07-users-modules-records/02-create-a-module#1` (Opus run, regrade; also Sonnet) | workaround:Bash, Monitor, Read, ScheduleWakeup | Tool/framework defect: `publish` returns 503 progress states ("Generating Models", "Clearing Cache", "Cleaning Up Old Backups", "Encrypt Database") as errors and does not wait. The agent waited with Bash sleeps, Monitor and ScheduleWakeup. Run-time grade was PASS. | Transcript: `publish` (x6), 503 progressPercent messages, then `describe_module`. Tool: `publish` in pyfsr-mcp. Owner: toolkit/pyfsr. |

Opus failures: none. The one Opus prompt with a regrade failure (07-02) fails on the publish-wait defect, a framework cause, not a model cause.

## Pending

- Terminal-shot PNG per prompt: not rendered.
- fsa10-02 capture (findings on the alert): not taken.
- Module plural (ch07 "Agent Lab Assets"): not changed on the box.
- fsa03-04 traces on 8.0.1: not checked.
- FortiAI token balance before and after: not recorded (no balance read before the Sonnet run).

## Round 2 (after classification)

| Prompt | Change before rerun | Sonnet result |
|---|---|---|
| `07-users-modules-records/03-work-with-records#2` | page names the agentlab_assets module | pass |
| `08-playbook/01-author-and-publish#1` | rerun to create its session (chained prompt #2 needs it) | fail: workaround (Skill, Bash doc greps; tool gap) |
| `08-playbook/01-author-and-publish#2` | chained: resumes #1's session (`continues`) | pass |
| `09-connectors/02-build-a-connector#2` | stale connector removed; install prompt says what to do on "already active" | fail, then pass after the instruction moved into its own sentence |
| `09-connectors/02-build-a-connector#3` | rerun after #2 | pass |
| `10-capstone-investigation/01-capstone#2` | effect check accepts any beaconing alert with the write-back | effect re-checked read-only: pass (ledger row still records the original fail) |

Opus is unchanged: 06 (transcript lost), 07-01 pass, 07-02 pass at run time with the publish-wait workaround on regrade.

Other round-2 facts:
- Plural: `agentlab_assets` plural staged as "Agent Lab Assets" (was "Agent Lab Assetss", the default-"s" bug). `pending_changes()` held only that module before publish; publish ran; after publish pending is empty and the published plural is "Agent Lab Assets".
- The plural publish overlapped with the Sonnet reruns. Note the 09-02#2 earlier failures came while the box was mid-update (503 "Wait For Update Across Cluster"), and the first 09-02#3 attempt was aborted by preflight on that 503 (preflight now falls back to the config check on any whoami error).
- Stale connector: agentlab-greeter was removed by name, then active again on the next check, so the install path was exercised repeatedly.
- 8.0.1 traces: the live 8.0.1 appliance was unreachable (API port refused connections), so the trace check is BLOCKED (box down).
- FortiAI token balance: 375,567 remaining monthly tokens, before and after the reruns (unchanged; these runs use Claude Code credits, not FortiAI tokens).
- Chained prompts: `continues` resumes the prerequisite prompt's session (session ids in a gitignored .sessions.json). 08-01#1 had no session recorded before this change, so it was rerun to create one.
- fsa10-02 capture: clipped to the Description block in the ui-captures spec; reruns write the cropped image. The image shows the scenario address 203.0.113.99 (RFC 5737 documentation space) and the page's example name web-server-01.

Tool and framework findings to route (toolkit/pyfsr owner), with evidence in the transcripts named in the classification table:
1. `publish`: returns 503 progress states as errors and does not wait (Opus and Sonnet 07-02).
2. `search_records`: term search returns 0 for a record that a filtered query finds in agentlab_assets (Sonnet 07-03#2).
3. No MCP password generator (Sonnet 07-01 used Bash/python).
4. No MCP reference for playbook YAML authoring (Sonnet 08-01#1 used Skill and Bash doc greps).

Pending: per-prompt terminal-shot PNGs and the "What the agent did" blocks are not rendered. Built-in tools (Bash, Monitor, ScheduleWakeup, Skill) are available on MCP-only prompts; the workaround check fails those runs (decision: keep, per the user).

## Shots (Sonnet transcripts)

Rendered by `tools/agent-drive/render_shots.py` from the saved transcripts: the prompt, the tool calls (short args, credential args dropped), and the trimmed final answer. Every image was opened and checked: no IP other than RFC 5737 documentation addresses, no host name, username, date or key. A line that mentions a password is withheld. Each chapter page carries its own collapsed "What the agent did" block.

| Prompt | Shot |
|---|---|
| `06-setup-agent/02#1` | `content/06-setup-agent/fsa06-04-whoami-claude.png` |
| `07-users-modules-records/01#1` | `content/07-users-modules-records/agent-run-01-create-a-user-1.png` |
| `07-users-modules-records/02#1` | `content/07-users-modules-records/agent-run-02-create-a-module-1.png` |
| `07-users-modules-records/03#1` | `content/07-users-modules-records/agent-run-03-work-with-records-1.png` |
| `07-users-modules-records/03#2` | `content/07-users-modules-records/agent-run-03-work-with-records-2.png` |
| `08-playbook/01#1` | `content/08-playbook/agent-run-01-author-and-publish-1.png` |
| `08-playbook/01#2` | `content/08-playbook/agent-run-01-author-and-publish-2.png` |
| `08-playbook/02#1` | `content/08-playbook/agent-run-02-trigger-and-verify-1.png` |
| `09-connectors/01#1` | `content/09-connectors/agent-run-01-explore-and-run-1.png` |
| `09-connectors/01#2` | `content/09-connectors/agent-run-01-explore-and-run-2.png` |
| `09-connectors/02#1` | `content/09-connectors/agent-run-02-build-a-connector-1.png` |
| `09-connectors/02#2` | `content/09-connectors/agent-run-02-build-a-connector-2.png` |
| `09-connectors/02#3` | `content/09-connectors/agent-run-02-build-a-connector-3.png` |
| `10-capstone-investigation/01#1` | `content/10-capstone-investigation/agent-run-01-capstone-1.png` |
| `10-capstone-investigation/01#2` | `content/10-capstone-investigation/agent-run-01-capstone-2.png` |

The shots show the Sonnet transcripts as they were last run. 08-01#1 and 07-03#2 reflect the page and check state at those runs, not the current grade (see the classification table above).

## Fixed upstream, pending rerun

These four tool findings and the plural default are fixed in fsr-agentic-toolkit and pyfsr, not in the pages. The three affected prompts are rerun (only them) once the workshop moves onto the toolkit release:

1. `publish` waits for the schema publish; it no longer returns the 503 progress states as errors. (Opus and Sonnet 07-02.) Rerun: `07-users-modules-records/02-create-a-module#1`.
2. `search_records` falls back to a filtered search when the term search misses a custom-module record. (Sonnet 07-03#2.) Rerun: `07-users-modules-records/03-work-with-records#2`.
3. `create_user` generates a password (no Bash). (Sonnet 07-01.) Rerun: `07-users-modules-records/01-create-a-user#1`.
4. A `playbook_yaml_reference` tool exists for playbook authoring. (Sonnet 08-01#1.) Rerun: `08-playbook/01-author-and-publish#1` and the chained #2.
5. pyfsr's plural default no longer appends "s". (The agentlab_assets plural was set by hand on the box this round; the pyfsr fix is on fix/module-plural-default.)

Strict workaround grading stays: a rerun on the toolkit release is graded the same way.

## Traces (8.0.1)

BLOCKED. The live 8.0.1 appliance was unreachable (API port refused connections). The ch03 page does not yet state that traces need 8.0.1 or later. Retry when an 8.0.1 box is up.

## T5: rerun on the released toolkit (Sonnet, claude-sonnet-5-5)

The lab MCP server is now `fsr-agentic-toolkit mcp` (toolkit 0.1.0, pyfsr 0.27). The e2e effect helper calls the
toolkit CLI (`fsr-agentic-toolkit call --json`) because `pyfsr.agent` no longer exists. One run per prompt.

| Prompt | Behavior | Box effect | Workaround-free |
|---|---|---|---|
| `07-users-modules-records/01-create-a-user#1` | pass | pass | yes (no Bash; earlier run used Bash for a password) |
| `07-users-modules-records/02-create-a-module#1` | fail: workaround:Bash x2 | pass | no |
| `08-playbook/01-author-and-publish#1` | pass | pass | yes (uses `playbook_yaml_reference`, no Skill or Bash) |

07-02: toolkit `publish` still returns the 503 progress states ("Generating Models", "Clearing Cache") as `ok: true`
without waiting, so `create_record` fails until the cache clears and the agent waits with Bash sleeps. The toolkit has
`provision_module`, which waits out a publish in flight; the agent saw it but the page prompt steers it to
`create_module` and `publish`. Open: make `publish` wait, or move the page to `provision_module`.

Known gap: `fsr-agentic-toolkit init` cannot verify with an API key (auth probe unsupported); the page uses `--skip-verify`.
`tools/terminal-shots/render.py` still imports `pyfsr.cli.agent_setup`, which is gone, so `fsa06-03-agent-init` cannot be re-rendered until it is ported.
