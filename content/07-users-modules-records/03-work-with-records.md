---
title: Work with Records
linkTitle: Records
weight: 30
description: "Add several records, query them back, and read the history of one record."
---

The module is live. Now the agent adds several assets, queries them, and shows the history of one record.

## 1. Add the records

Give your agent this prompt:

```text
In agentlab_assets, create these records (skip any that already exist,
matching on hostname):
- db-server-01, 203.0.113.10, owner dba-team, criticality Critical
- web-server-01, 203.0.113.20, owner web-team, criticality Medium
- jump-host-01, 203.0.113.30, owner secops, criticality High
Then query the module for criticality High or Critical, sorted by hostname,
and show me a table of what you found.
```

<!-- step: fsa07-03-seed-records -->

<!-- capture: fsa07-03-seed-records -->
![fsa07-03-seed-records](fsa07-03-seed-records.png?height=600px)

The agent should match on hostname before it adds a record. An upsert or get-or-create call does that, so a re-run does not add duplicates. A plain create call adds a new copy each time. The IP addresses are documentation examples, not real hosts.

## 2. You are done when

- The first run creates three records. A re-run creates none, and the agent reports that they already exist.
- The query returns **db-server-01** and **jump-host-01**, and also **build-server-01** from the previous page, because it is also High. It does not return `web-server-01`.

**Verify in the UI:** open the **Agent Lab Assets** module and check the grid.

<!-- capture: fsa07-03-seed-records-grid -->
![fsa07-03-seed-records-grid](fsa07-03-seed-records-grid.png?height=600px)

## 3. Read the history

Give your agent this prompt:

```text
Take the db-server-01 record in the agentlab_assets module and show me its
full lifecycle: every create/update event, who did it, and when. Use the
record's uuid.
```

<!-- step: fsa07-04-record-lifecycle -->

<!-- capture: fsa07-04-record-lifecycle -->
![fsa07-04-record-lifecycle](fsa07-04-record-lifecycle.png?height=600px)

**You are done when:** the timeline shows a create event for `db-server-01`, and the login that made it is your agent's login.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Picklist error that lists valid values | The value has the wrong case, such as `critical` | The error lists the valid values. The agent should retry with the exact one. |
| Query returns every record | The filter used the display text, not the item value | Ask the agent to filter on criticality.itemValue |
| Duplicate records after re-runs | The agent used create, not upsert | Delete the extra records. The agent asks you to approve each delete. Then ask it to redo the seed step with "skip any that already exist". |
