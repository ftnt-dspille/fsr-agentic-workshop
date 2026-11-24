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

Give your agent this prompt:

```text
Contain the source of the port scan alert from the red-team host (the one named Internal port scanning or Internal intrusion). Block it on the Branch2 gate through our Branch2 FortiGate connector configuration in FortiSOAR, in our SOAR-Blocklist group, which the SOAR-contain-deny policy denies. Before you change anything, show me exactly what you will run and wait for my yes. Then tell me what it changed.
```

Read the parameters the agent shows before you answer yes. The source IP must be the one from the alert, and the group must be **SOAR-Blocklist**. Approve only then.

**You are done when:** the agent reports the source IP as blocked in **SOAR-Blocklist**.

![ch11-03-block](ch11-03-block.png?height=600px)

## 2. Check the group and the policy

Give your agent this prompt:

```text
On the Branch2 gate, read the SOAR-Blocklist address group and tell me its members. Then read the policy named SOAR-contain-deny and tell me its action and the group it matches.
```

**You are done when:** the members list holds the **SOAR-blocklist-seed** member that was already there and the source IP you blocked. The policy shows action **deny** and matches the SOAR-Blocklist group.

![ch11-03-group-check](ch11-03-group-check.png?height=600px)

## 3. Fire the scan again

Return to the red-team dashboard, open the **Red team** tab, and click **Fire** on **Port scan** once more. Wait for the run to finish.

The scan now starts from a source Branch2 denies. Branch2 drops it under policy 20, so the scan does not reach the payroll server, and FortiAnalyzer logs the denies as traffic. The dashboard still reports the run, because the scanner does not know the gate dropped it.

## 4. Check the denies

Give your agent this prompt:

```text
We blocked the source of the port scan alert from the red-team host (the one named Internal port scanning or Internal intrusion). Is that source still reaching the payroll server on Branch2? Check FortiAnalyzer through our faz-branch connector configuration in FortiSOAR, branch ADOM: look for policy 20 hits or deny logs from that IP, and tell me which evidence you used.
```

The branch traffic logs live in the **branch** ADOM, under the **faz-branch** configuration. The default FortiAnalyzer configuration sees only the lab's root ADOM, which holds no Branch2 traffic. If your agent answers from the default configuration and reports no logs, ask it again and name **faz-branch** and the **branch** ADOM.

The newest deny rows for the source under policy 20 are the answer for this scan. Check the time on the rows: a session from before the block (policy 905) is older than the denies from the scan you fired after the block. Your agent reports the deny rows it read and the time of the newest one.

**You are done when:** the scan has finished and the agent reports that the source is denied on Branch2 under policy 20, with the time of the newest deny row.

![ch11-03-denies](ch11-03-denies.png?height=600px)
