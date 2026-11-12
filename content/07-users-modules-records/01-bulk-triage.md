---
title: Triage Records in Bulk
linkTitle: Bulk Triage
weight: 10
description: "Have the agent find alerts that match a condition and update all of them from one prompt."
---

In the UI, changing a set of records means opening each one. Here the agent finds the matching records with a query, then updates each one. You describe the result, and the agent does the loop.

## 1. Ask the agent

The batch is the **Agent Lab** alerts that `lab_setup.py prepare` put on your box ([Prepare Your Box](../01-intro/02-prepare-your-box.html)): six demo alerts and three chapter 3 alerts, all Open unless you changed one. If none show in **Incidents** > **Alerts** with a search for `Agent Lab`, run `prepare` again first. Give your agent this prompt:

```text
Find every alert whose name starts with "Agent Lab" and whose status is
Open. For each one, set its status to Investigating. Do not touch alerts
with any other status. When you are done, tell me how many you moved and
list their names.
```

<!-- step: fsa07-01-bulk-triage -->

<!-- capture: fsa07-01-bulk-triage -->
![fsa07-01-bulk-triage](fsa07-01-bulk-triage.png?height=600px)

The agent makes one `query_records` call to find the batch, then one `update_record` call for each match. It reports the count and the names. Check the count against the grid.

Each update is a write, so your agent asks you to approve it, as on the approval page in chapter 6. Approve each one.

## 2. You are done when

- The agent reports how many alerts it moved, and names each one.
- Run the same prompt again. It moves zero, because no alert is Open any more. The task is safe to repeat.
- The agent left alerts with other statuses alone.

**Verify in the UI:** open the **Alerts** module and filter the name to `Agent Lab`. The matching alerts show **Investigating**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **ToolDisabled: read-only mode** | `FSR_MCP_READONLY=1` is set in the agent's MCP config | Remove it from the `env` block, then restart the agent |
| The agent updated zero alerts | No Open alert starts with "Agent Lab" | Seed the lab alerts from the earlier chapters, or check that they are Open |
