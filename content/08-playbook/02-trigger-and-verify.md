---
title: Trigger It and Verify the Run
linkTitle: Trigger + Verify
weight: 20
description: "Create an alert that fires the playbook, then prove the run happened and did the right thing."
---

A playbook is not proven until it runs on a real record. This page creates an alert that triggers the playbook. Then it checks two things: the run finished, and the alert changed.

## 1. Ask the agent

Give your agent this prompt:

```text
Create an alert named "Agent Lab - suspicious login on jump-host-01" with
severity High and source "Agent Lab Workshop". Then wait for the
"Tag Agent Lab Alerts" playbook run that it triggers, tell me whether the
run finished cleanly (diagnose it if not), and finally fetch the alert
again to prove its description was updated by the playbook.
```

<!-- step: fsa08-03-trigger-and-verify -->

<!-- capture: fsa08-03-trigger-and-verify -->
![fsa08-03-trigger-and-verify](fsa08-03-trigger-and-verify.png?height=600px)

The agent creates the alert, waits for the playbook run, and reads the alert back.

## 2. You are done when

- The run reaches **finished** within a few seconds.
- The alert's description has changed. Check the alert itself, not only the run status.

**Verify in the UI:** open the alert. Its description shows the playbook's text. Then open the **Playbook Logs** panel from the header bar and select the **Tag Agent Lab Alerts** run.

<!-- capture: fsa08-03-trigger-and-verify-alert -->
![fsa08-03-trigger-and-verify-alert](fsa08-03-trigger-and-verify-alert.png?height=600px)

<!-- capture: fsa08-03-trigger-and-verify-run-history -->
![fsa08-03-trigger-and-verify-run-history](fsa08-03-trigger-and-verify-run-history.png?height=600px)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wait_for_playbook_run` times out | The alert name does not match the trigger filter | The alert name must start with "Agent Lab". Ask the agent to check the playbook's trigger filter |
| Run failed at Tag Alert | The record reference in the update step is wrong | `diagnose_playbook_run` names the failing step and error. A common cause is a broken Jinja reference |
| Nothing in Playbook Logs | The playbook is not active, or the alert was created before it | Activate the playbook, then create a new alert. Triggers do not fire for old records |
