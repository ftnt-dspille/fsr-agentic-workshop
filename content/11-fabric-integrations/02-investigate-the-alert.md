---
title: "Investigate the alert with FortiAnalyzer evidence"
linkTitle: Investigate the alert
weight: 20
description: "Have your agent find the branch alert, read the FortiAnalyzer log lines behind it and report the evidence. Nothing is changed on the gates in this page."
tags: ["fabric"]
---

The alert from the last page is a summary. This page has the agent read the raw evidence: the FortiAnalyzer event behind the alert, and the log lines that matched on Branch2. The agent reads only. You decide whether to contain anything in the next page.

## 1. Find the alert

Give your agent this prompt. It asks for the alert by what it is, not by its ID:

```text
In FortiSOAR, find the open alert for a port scan that came from the red-team host on Branch2. The name starts with "Internal intrusion" or "Internal port scanning". Tell me its name, its source IP, its destination IP and its sourceId.
```

The agent searches the alerts and reports the alert it found. The **sourceId** is the FortiAnalyzer event ID, and it is what ties the alert to the evidence in the next step.

## 2. Pull the FortiAnalyzer evidence

Give your agent this prompt:

```text
Use the faz-branch FortiAnalyzer configuration to get the log lines behind that alert's FortiAnalyzer event. Use the event ID as the alert ID and the branch ADOM. List each log line's time, source and destination IP, destination port, policy ID, IPS profile and the attack name. Then tell me which policy the scan went through.
```

The agent calls the FortiAnalyzer operation for the event's log lines. Read the policy ID in the answer. The lab's scan goes through policy **905**, which is the red-team plumbing on Branch2. Policy 905 accepts the scan to the payroll server, and the IPS profile logs it as an intrusion.

{{% notice note %}}
The FortiAnalyzer event and its log lines change over time. A repeat hit updates the event's last time and count, so the number of log lines can be higher than the number of times you fired. That is expected.
{{% /notice %}}

## 3. Investigate the alert

Give your agent this prompt. It asks for the evidence the investigation gathers, and it asks for no change:

```text
Investigate this alert. Give me a verdict with the evidence behind it, and list anything you could not check. Do not block or change anything.
```

The agent runs the alert investigation workflow. It reports the indicators on the alert, the source address, and the enrichment it could run. It also reports what it could not check, for example reputation data the lab does not have.

**You are done when:** the agent names the alert and its sourceId, lists at least one FortiAnalyzer log line with source IP, destination port, policy ID and attack name, and reports that it changed nothing. You still have no block in place. The next page adds the block.
