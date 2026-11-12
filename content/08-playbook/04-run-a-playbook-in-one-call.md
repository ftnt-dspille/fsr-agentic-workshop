---
title: Run a Playbook in One Call
linkTitle: Run in One Call
weight: 40
description: "Check, publish, run and read back a playbook with a single tool, and read the failure modes it reports."
---

Pages 1 to 3 used one tool call per step: compile, publish, trigger, wait, and read the result. run_playbook_yaml does all of these in one call. You give it the playbook YAML. It checks the playbook, publishes it, runs it, waits for the run, and returns each step's result.

{{% notice tip %}}
Use a workflow when the toolkit has one. Chaining the separate tools by hand is how a playbook gets published without being checked. Tell your agent this at the start.
{{% /notice %}}

## 1. Ask the agent

Give your agent this prompt. The probe playbook touches no records, so the test run leaves nothing behind.

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

<!-- step: fsa08-05-run-in-one-call -->

<!-- capture: fsa08-05-run-in-one-call -->
![fsa08-05-run-in-one-call](fsa08-05-run-in-one-call.png?height=600px)

**You are done when:**

- **status: answered**.
- Each stage shows a finding: the check passed, the playbook was published, the run completed, and cleanup removed what the call created.
- All three steps are listed with a status and a duration, and **probe_marker** appears in the Capture step's result.

**Verify in the UI:** open **Playbooks**. The "Agent Lab Probe" collection is gone, because `cleanup=true` deleted the playbook and collection that the call created.

## 2. Read the result

The result has findings, unknowns and next. The status summarizes them.

| Status | Meaning | What you do |
|---|---|---|
| **answered** | Every stage ran and nothing is unresolved | Done. Read the step results. |
| **partial** | It ran, but something needs you: a timeout, a failed run, or a green run that did nothing | Read unknowns and take the first next |
| **blocked** | It stopped before running anything | Fix what the findings name and call again |

**Treat **partial** as not done.**

## 3. Optional: try the failure cases

The tool reports these failures and says what to do about each one.

| You give it | What comes back | What to do |
|---|---|---|
| YAML that does not parse | **blocked**, with the parser's message and line. Nothing was published. | Fix the YAML and call again |
| A step type or connector that does not exist | **blocked**, with the step path and a suggested name | Use the suggested name, or an installed connector |
| A manual_input or approval step | **partial** after the timeout. The playbook is kept. | Call again with `answers={"<prompt title>": "<button label>"}` |
| A run that fails | **partial**, with the failing step, the error and a ready repair_playbook call | Apply the repair, then call again |

Try two of these on purpose:

- Ask the agent to test-run the probe again with the step type changed to teleport. Nothing reaches the box.
- Ask the agent to add a manual_input step to the probe and run it with a 15 second timeout. The result names the prompt, and the playbook stays on the box so you can answer it.

## 4. Standing rules for your agent

Put these in your agent's standing instructions so they hold across sessions:

1. Test-run each new playbook with run_playbook_yaml before you wire its real trigger.
2. Read unknowns before you report done. An empty list is the signal, not a green status alone.
3. Do not set overwrite_changed without asking. It discards steps that someone edited in the UI.
4. Use `cleanup=true` for probes only, never for a real playbook.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The agent chains compile_playbook_yaml, publish_playbook and wait_for_playbook_run anyway | It did not use the workflow | Name run_playbook_yaml in the prompt, and check it appears in the tool list |
| run_playbook_yaml is not in the tool list | The MCP server predates the tool | Update fsr-agentic-toolkit where the MCP server runs, then restart the agent |
| **partial**: no terminal state within the timeout | A manual_input or approval step is waiting, or the playbook is slow | Read the named prompt and pass answers, or raise timeout |
