---
title: Triage Records in Bulk
linkTitle: Bulk Triage
weight: 10
description: "Have the agent find a set of records by query and act on all of them in one prompt."
---

Part 2 is where the agent stops reading and starts writing. The first thing worth doing is the thing the UI makes slow: find a set of records that share a condition, and change all of them at once. One prompt, a query, and a write per match. This is where an outside agent earns its place: you describe the outcome, and it does the loop.

{{% notice warning %}}
This is the first chapter that writes to the box, so the read-only guard from chapter 6 must come off first. In your `.mcp.json`, remove `FSR_MCP_READONLY` from the env block (or set it to `0`) and restart the agent. Leave it on and every write in Part 2 fails with `ToolDisabled: read-only mode`.
{{% /notice %}}

## 1. Ask the agent

The lab alerts from chapter 2 are a ready-made batch. Give your agent this prompt:

```text
Find every alert whose name starts with "Agent Lab" and whose status is
Open. For each one, set its status to Investigating. Do not touch alerts
with any other status. When you are done, tell me how many you moved and
list their names.
```

<!-- step: fsa07-01-bulk-triage -->

Watch the shape of the work: one `query_records` to find the batch, then one `update_record` per match. The agent reports the count and the names, so you can check its arithmetic against the grid.

{{% notice note %}}
Updating a record is a tier-2 write: the agent can do it once the read-only guard is off, without a per-record confirmation. You meet the confirm gate in the next lab, where creating a module is a heavier, tier-3 action. The lesson here is leverage: the agent did ten updates from one sentence. The lesson there is control: some actions it must ask about first.
{{% /notice %}}

## 2. What success looks like

- The agent reports the number of alerts it moved and names each one.
- Re-running the same prompt moves zero: the alerts are already Investigating, so the query returns nothing. The task is safely repeatable.
- The agent left alerts in any other status alone.

**Verify in the UI:** open the **Alerts** module and filter the name to `Agent Lab`. The matching alerts read **Investigating**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ToolDisabled: read-only mode` | You left `FSR_MCP_READONLY=1` in the MCP config from chapter 6 | Remove it from the env block and restart the agent |
| The agent updated zero alerts | No alert matches the query | Seed the chapter 2 lab alerts first, or widen the name filter |
| "status value not found" | The status picklist differs on your build | Ask the agent to read the AlertStatus picklist first, then use a value it lists |
| The agent changed alerts it should not have | The query was too broad | Name the exact starts-with string and the exact source status in the prompt |
| It did one update and stopped | The agent treated the batch as a single record | Tell it to query first, then update every row the query returned |

<!-- agent-drive:begin -->

<details><summary>What the agent did</summary>

**`01-bulk-triage#1`** (Sonnet run, sanitized)

![07-users-modules-records/01-bulk-triage#1](agent-run-01-bulk-triage-1.png)

```text
  > query_records {"module": "alerts", "filters": [{"field": "name", "operator": "like"...
  > update_record {"module": "alerts", "ref": "0292e2d2-2a2b-4982-9208-3f82a568dc09", "...
  > update_record {"module": "alerts", "ref": "946f181a-8404-4f43-9c3a-1376ba8696f5", "...
  > update_record {"module": "alerts", "ref": "c2ddcdfb-7e72-45e5-a746-87b9bd277c69", "...
  > update_record {"module": "alerts", "ref": "f7701d74-e15e-4caf-915d-462ea3ce1750", "...
  > update_record {"module": "alerts", "ref": "da65b688-3081-4ff6-ab8a-c72c2553e121", "...
  > update_record {"module": "alerts", "ref": "495e9da6-86a3-4d22-8075-6f558f4b75a6", "...
```

</details>

<!-- agent-drive:end -->
