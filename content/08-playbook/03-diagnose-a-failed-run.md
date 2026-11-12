---
title: Diagnose a Failed Run
linkTitle: Diagnose a Failure
weight: 30
description: "Break the playbook on purpose, then have the agent find the failing step and fix it."
---

When a run fails, you need two answers: which step failed, and why. This page publishes a practice playbook that is broken on purpose, has the agent diagnose the failed run, and then has the agent fix it.

The practice playbook has its own name. The "Tag Agent Lab Alerts" playbook from page 1 is not changed.

## 1. Ask the agent

The Tag Alert step in this practice playbook points at a record that does not exist. Give your agent this prompt. It includes the practice YAML.

```text
Let's practice diagnosing a failure. Publish this practice playbook
(deliberately broken: the Tag Alert step updates a record that does not exist):

collection: Agent Lab
visible: true
playbooks:
  - name: Agent Lab Diagnose Practice
    steps:
      - name: On Alert Created
        type: start_on_create
        module: alerts
        when:
          logic: AND
          filters:
            - field: name
              op: like
              value: "Agent Lab diag%"
        next: Tag Alert
      - name: Tag Alert
        type: update_record
        module: alerts
        record: "/api/3/alerts/00000000-0000-0000-0000-000000000000"
        fields:
          description: "{{ vars.input.records[0].description | default('', true) }} Triaged automatically by the Agent Lab playbook"
        next: Done
      - name: Done
        type: end

Then create an alert named "Agent Lab diag test" to trigger it, and wait for
the run. Diagnose that run and tell me which step failed and the error
verbatim. Finally, fix it: republish the same practice playbook with the Tag
Alert record set back to "{{ vars.input.records[0]['@id'] }}", and confirm it
published.
```

<!-- step: fsa08-04-diagnose-run -->

<!-- capture: fsa08-04-diagnose-run -->
![fsa08-04-diagnose-run](fsa08-04-diagnose-run.png?height=600px)

Your agent publishes the broken playbook, triggers it, waits for the failure, diagnoses it, and then republishes the fixed version.

## 2. What the diagnosis tells you

Look for these three things in the diagnosis:

- **`failing_step`**: `Tag Alert`, the step that failed.
- **`error_message`**: **404 Not Found**. The update step tried to write to a record that does not exist.
- **Step statuses**: `On Alert Created` finished, `Tag Alert` failed, and `Done` never ran.

The error message names the record the step tried to write. That is the detail you need to fix the step.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wait_for_playbook_run` never returns **failed** | The broken playbook is not active | Ask the agent to confirm the practice playbook is active, then create a new "Agent Lab diag" alert |
| `diagnose_playbook_run` says the run was not found | The run is still going, or the agent diagnosed an older run | Wait for the run to finish, then diagnose the newest run of the practice playbook |
| The fix did not take | The restored YAML still has the broken record reference | The Tag Alert record must be `{{ vars.input.records[0]['@id'] }}`, not the all-zeros placeholder |
