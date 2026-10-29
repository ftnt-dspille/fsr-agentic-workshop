---
title: Run a Playbook in One Call
linkTitle: Run in One Call
weight: 40
description: "Check, publish, run and read back a playbook with a single tool, and read the failure modes it reports."
---

Pages 1 to 3 walked the loop one tool at a time: compile, publish, trigger, wait, read the result. That is five calls, and every gap between them is a place for an agent to guess wrong - publish a playbook that never compiled, wait on a playbook name that did not match, call a green run done when it did nothing.

`run_playbook_yaml` closes the gaps. You give it the playbook YAML; it checks the playbook, publishes it, triggers it, waits, and returns every step's result - one call, one evidence-backed answer.

{{% notice tip %}}
This is the rule the rest of the lab follows: **if the toolkit has a workflow for the job, use the workflow, not its parts.** Chaining the primitives by hand is how a run gets published without being checked. Tell your agent so up front.
{{% /notice %}}

## 1. Ask the agent

Use a throwaway playbook that touches no records, so the test run leaves nothing behind:

```text
Use run_playbook_yaml to test-run this probe and clean up after it. Do not
chain compile, publish and wait yourself.

collection: Agent Lab Probe
visible: true
playbooks:
  - name: Agent Lab Probe
    steps:
      - name: Start
        type: start
        next: Capture
      - name: Capture
        type: set_variable
        vars:
          probe_marker: "agent-lab-ok"
        next: Done
      - name: Done
        type: end

Tell me the status, each step's result, and whether anything was left on the box.
```

**What success looks like:**

- `status: answered`.
- A finding for each stage: the playbook passed the check, it was published, it ran to completion, and cleanup removed what the call created.
- All three steps listed with a status and a duration, and `probe_marker` visible in the `Capture` step's result.

**Verify in the UI:** open **Playbooks**. The "Agent Lab Probe" collection is gone, because `cleanup=true` deleted the playbook and collection that this one call created.

{{% notice note %}}
Cleanup only removes what the call itself created. If a collection with that name already held playbooks, nothing is deleted and the result says so. Your "Agent Lab" collection from page 1 is never at risk.
{{% /notice %}}

## 2. Read the result, not just the status

The result has the same shape as every other workflow: `findings` (each citing evidence), `unknowns`, and `next`. The status is a summary of those, and it is honest about what it does not know.

| Status | Meaning | What you do |
|---|---|---|
| `answered` | Every stage ran and nothing is unresolved | Done. Read the step results. |
| `partial` | It ran, but something needs you: a timeout, a failed run, or a green run that did nothing | Read `unknowns` and take the first `next` |
| `blocked` | It stopped before running anything | Fix what the findings name and call again |

**Treat `partial` as not done.** The most useful thing the tool does is refuse to call a green run a success when it was not.

## 3. How it fails, and what it tells you

These are the failure modes the tool is built to name. Each one is a case worth reproducing, so you see the recovery hint rather than only read about it.

| You give it | What comes back | The recovery |
|---|---|---|
| YAML that does not parse, or is empty | `blocked`, with the parser's message and line | Fix the YAML and call again. Nothing was published. |
| A step type or connector that does not exist | `blocked`, naming the step path and the compiler's "did you mean" suggestion; for a connector, a pointer to `list_connectors()` | Use the suggested name, or pick an installed connector verbatim |
| A reference to a step that is not in the playbook | `blocked`, naming the missing step key | Correct the step name in the Jinja reference |
| A `{{ vars.input.params.x }}` with no declared parameter | `blocked`, telling you to declare `x` | Add it to the playbook's `parameters:` |
| Several playbooks in one YAML | `blocked`, listing the names | Pass `playbook=<name>` |
| A `manual_input` or approval step | `partial` after the timeout, naming the pending prompt title, and the playbook is **kept** | Call again with `answers={"<prompt title>": "<button label>"}` |
| A run that fails | `partial`, naming the failing step and error, with the diagnosis attached and a ready `repair_playbook` call | Apply the repair, call again |
| A run that finishes green but a variable it sets is empty | `partial`, naming the step and variable | Check the path that reference reads; a record-scoped trigger needs `record_uuid` and `module` |
| `cleanup=true` on a run that never finished | The cleanup is skipped and says why | Deleting the playbook would orphan the waiting run; call again once it finishes |

Try two of them on purpose. Ask the agent to test-run the probe again with the step type changed to `teleport`, and note that nothing reached the box. Then add a `manual_input` step to the probe and run it with a 15 second timeout: the result names the prompt, and the playbook is still there to answer.

## 4. What to ask your agent to do

Put these in your agent's standing instructions so they hold across sessions:

1. **Test-run every new playbook with `run_playbook_yaml` before wiring its real trigger.** A start-on-create trigger only proves itself on a real record, but the check, the publish and the step logic all prove out on a probe.
2. **Read `unknowns` before reporting done.** An empty `unknowns` list is the signal; a green status alone is not.
3. **Never discard a diagnosis.** When a run fails, the result already carries one; start `repair_playbook` from its id instead of re-reading the logs.
4. **Use `cleanup=true` for probes, never for the real playbook.** A real playbook should be published, not run-and-removed.
5. **Do not set `overwrite_changed` without asking.** It discards steps someone edited in the UI. The tool fails closed so a person decides.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The agent chains `compile_playbook_yaml`, `publish_playbook` and `wait_for_playbook_run` anyway | It did not see the workflow, or your prompt named the parts | Name `run_playbook_yaml` in the prompt, and check it appears in the tool list |
| `run_playbook_yaml` is not in the tool list | The MCP server predates the tool | Update `fsr-agentic-toolkit` where the MCP server runs, then restart the agent |
| `partial`: no terminal state within the timeout | A `manual_input` or approval gate is waiting, or the playbook is genuinely slow | Read the named prompt and pass `answers`, or raise `timeout` |
| Publish refused because the live playbook has UI edits | Someone changed steps in the designer that the YAML lacks | Pull the live playbook, merge the edits, and only then consider `overwrite_changed` |
| A record-triggered playbook finishes but changed nothing | A test run has no record context | Pass `record_uuid` and `module`, or test it with a real record as on page 2 |
