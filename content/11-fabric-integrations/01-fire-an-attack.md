---
title: "Fire an attack from the red-team dashboard"
linkTitle: Fire an attack
weight: 10
description: "Start a live port scan from the lab's red-team host. The scan crosses Branch2, so FortiAnalyzer records it and FortiSOAR ingests it as an alert."
tags: ["fabric"]
---

The lab has an attacker: a red-team host behind Branch2 that runs real scans and exploits against the payroll server. This page fires one attack, a port scan. The scan is a good first attack for this track for two reasons. Branch2 inspects it with an IPS sensor, so FortiAnalyzer logs it as an intrusion event. And it comes from one source address, so you can block that address in the next page.

## 1. Open the dashboard

Open the red-team dashboard in your browser:

```text
https://<pod-host>:<dashboard-port>/
```

Replace `<pod-host>` and `<dashboard-port>` with the pod host and port your instructor gave you. Sign in with the dashboard login from the same handout.

The dashboard opens on the **Red team** tab. Four tabs run across the top: **Red team**, **Lab health**, **Onboarding** and **SOAR demo**. Under **Scenarios** each attack has its own row with a **Fire** button on the left, its name, the time of its last run and the result code of that run (`rc=0` means the scenario ran clean). **Port scan** is the first row.

![ch11-01-dashboard-tabs](ch11-01-dashboard-tabs.png?height=600px)

## 2. Fire the port scan

1. Stay on the **Red team** tab. It opens first.
2. Find the row **Port scan**. It runs an nmap SYN and service scan against the payroll server.
3. Click **Fire** at the left of that row.

The row shows **Running** while the scan runs.

![ch11-01-dashboard-running](ch11-01-dashboard-running.png?height=600px)

When the scan finishes, the row shows the time of the run and its result code again.

![ch11-01-dashboard-finished](ch11-01-dashboard-finished.png?height=600px)

{{% notice note %}}
The scan takes about a minute. Do not fire it again while it runs: the dashboard runs one scenario at a time and answers a second fire with a busy message.
{{% /notice %}}

## 3. Wait for FortiAnalyzer and FortiSOAR

FortiAnalyzer groups repeated hits from the same source and signature into one event. That event gets a new time each time the scan hits it, and FortiSOAR ingests events on a five-minute schedule. The alert for this scan appears in FortiSOAR within about five minutes of the fire. If it is not there after one cycle, wait one more cycle before you ask for help.

Every student who fires this scenario in a class shares the same alert. You do not get a private copy, and you do not need one: the alert is the scenario's record, and the next page works on it.

**You are done when:** the dashboard shows **Port scan** with a finished result, and within five minutes the FortiSOAR alerts list shows an alert named like **Internal intrusion Port.Scanning detected by IPS**, or **Internal port scanning from: ... detected**, whose source IP is the red-team host. The next page starts from that alert.

![ch11-01-alert-in-fortisoar](ch11-01-alert-in-fortisoar.png?height=600px)
