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
