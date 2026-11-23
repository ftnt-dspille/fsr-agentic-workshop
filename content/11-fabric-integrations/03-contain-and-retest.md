---
title: "Contain the source on Branch2 and retest"
linkTitle: Contain and retest
weight: 30
description: "Block the red-team source address on Branch2 with the fortigatev2 policy-based block, then fire the scan again and check that the gate denies it."
tags: ["fabric"]
---

Now the agent contains the attacker. It adds the source address to the **SOAR-Blocklist** address group on Branch2. Branch2 has a deny policy, **SOAR-contain-deny** (policy 20), that matches that group. The block changes only the group. It does not change the policy list, so the payroll policies stay as they are.

The block is reversible, and the next page removes it.

## 1. Block the source

Give your agent this prompt. It names the exact connector operation and its parameters:

```text
Block the source IP of the port scan alert from the red-team host on the Branch2 gate. The alert's name starts with "Internal port scanning" or "Internal intrusion". Use the fortigatev2 connector, configuration Branch2, operation block_ip_new with these parameters: method "Policy Based", ip as a list with the one source IP of the alert, ip_group_name "SOAR-Blocklist", ip_block_policy "SOAR-contain-deny", ip_type "IPv4", is_new true. Before you run it, show me the parameters and wait for my yes. After it runs, tell me the newly_blocked list it returned.
```

Read the parameters the agent shows before you answer yes. The source IP must be the one from the alert, and the group must be **SOAR-Blocklist**. Approve only then.

**You are done when:** the operation returns the source IP in **newly_blocked**, and the agent reports it.

## 2. Check the group and the policy

Give your agent this prompt:

```text
On the Branch2 gate, read the SOAR-Blocklist address group and tell me its members. Then read the policy named SOAR-contain-deny and tell me its action and the group it matches.
```

**You are done when:** the members list holds the **SOAR-blocklist-seed** member that was already there and the source IP you blocked. The policy shows action **deny** and matches the SOAR-Blocklist group.

## 3. Fire the scan again

Return to the red-team dashboard, open the **Red team** tab, and click **Fire** on **Port scan** once more. Wait for the run to finish.

The scan now starts from a source Branch2 denies. Branch2 drops it under policy 20, so the scan does not reach the payroll server, and FortiAnalyzer logs the denies as traffic. The dashboard still reports the run, because the scanner does not know the gate dropped it.

## 4. Check the denies

Give your agent this prompt:

```text
Use the faz-branch FortiAnalyzer configuration. Find the source IP of the port scan alert from the red-team host, the one named Internal port scanning or Internal intrusion. Then tell me whether that source is still reaching the payroll server on Branch2. Check the policy 20 hits or deny logs in the branch ADOM for that IP, and tell me which evidence you used.
```

The branch traffic logs live in the **branch** ADOM, under the **faz-branch** configuration. The default FortiAnalyzer configuration sees only the lab's root ADOM, which holds no Branch2 traffic. If your agent answers from the default configuration and reports no logs, ask it again and name **faz-branch** and the **branch** ADOM.

The newest deny rows for the source under policy 20 are the answer for this scan. Check the time on the rows: a session from before the block (policy 905) is older than the denies from the scan you fired after the block. Your agent reports the deny rows it read and the time of the newest one.

**You are done when:** the scan has finished and the agent reports that the source is denied on Branch2 under policy 20, with the time of the newest deny row.
