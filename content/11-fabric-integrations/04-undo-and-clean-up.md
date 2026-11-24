---
title: "Undo the containment"
linkTitle: Undo the containment
weight: 40
description: "Remove the red-team source from SOAR-Blocklist on Branch2 and confirm the group is back to its seed member. Leave the alerts in place for the next run."
tags: ["fabric"]
---

Containment is only useful for the exercise. This page removes the block you added, so the red-team host can reach the lab again. The lab's other workshop objects do not change, and you leave the shared alerts in place for the next student.

## 1. Remove the source from the group

Give your agent this prompt:

```text
On the Branch2 gate, remove the source IP of the port scan alert from the red-team host from the SOAR-Blocklist address group. Use the fortigatev2 connector, configuration Branch2, operation unblock_ip with method "Policy Based", ip as a list with that one source IP, ip_group_name "SOAR-Blocklist", ip_block_policy "SOAR-contain-deny" and ip_type "IPv4". Show me the parameters first and wait for my yes. Then tell me the newly_unblocked list it returned.
```

**You are done when:** the operation returns the source IP in **newly_unblocked**.

![ch11-04-undo](ch11-04-undo.png?height=600px)

## 2. Confirm the group is back to its seed

Give your agent this prompt:

```text
On the Branch2 gate, read the SOAR-Blocklist address group and tell me its members. Tell me whether the SOAR-blocklist-seed member is still there.
```

**You are done when:** the members list is **SOAR-blocklist-seed** only, and the agent confirms the seed member is still there.

![ch11-04-group-seed](ch11-04-group-seed.png?height=600px)

## 3. Check the scan reaches the server again

Fire **Port scan** once more from the red-team dashboard, as on the first page. The scan now reaches the payroll server, and FortiAnalyzer logs new intrusion events for it. Those events update the same shared event for this scenario, so no new alert is needed.

**You are done when:** the dashboard run finishes and the group still holds only the seed member.

## 4. Leave the alerts for the next run

Do not delete the alert you investigated. It is the scenario's shared record, and the next student who fires the port scan works on it. Nothing else in this track needs to be cleaned up.
