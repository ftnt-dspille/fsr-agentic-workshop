---
title: Triage Records in Bulk
linkTitle: Bulk Triage
weight: 10
description: "Have the agent find alerts that match a condition and update all of them from one prompt."
---

In the UI, changing a set of records means opening each one. Here the agent finds the matching records with a query, then updates each one. You describe the result, and the agent does the loop.

## Before you start: turn off read-only mode

This is the first chapter that writes to the box. Chapter 6 started the agent in read-only mode, so turn that off first:

1. Open the `fortisoar` entry in your agent's MCP config. For Claude Code, that is `.mcp.json` in your lab folder.
2. Remove `FSR_MCP_READONLY` from the `env` block, or set it to `0`.
3. Restart the agent.

## 1. Ask the agent

The Agent Lab alerts from the earlier chapters are a ready-made batch. Give your agent this prompt:

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

The agent updates records without asking first. Creating a module does ask first, on the next page.

## 2. You are done when

- The agent reports how many alerts it moved, and names each one.
- Run the same prompt again. It moves zero, because no alert is Open any more. The task is safe to repeat.
- The agent left alerts with other statuses alone.

**Verify in the UI:** open the **Alerts** module and filter the name to `Agent Lab`. The matching alerts show **Investigating**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ToolDisabled: read-only mode` | The read-only guard is still on | Do the steps in "Before you start", then restart the agent |
| The agent updated zero alerts | No Open alert starts with "Agent Lab" | Seed the lab alerts from the earlier chapters, or check that they are Open |
