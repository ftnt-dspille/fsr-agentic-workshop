---
title: Wide-Fabric Agentic Labs
linkTitle: 11. Wide-Fabric Agentic
weight: 105
description: "Optional advanced track: the agent closes the loop across a live Fortinet fabric (FortiGate, FortiAnalyzer, FortiManager and a red-team host), not just inside FortiSOAR."
tags: ["fabric"]
---

Everything up to here runs against **any FortiSOAR box**. This track is different: it needs the full lab fabric (FortiGate branch gates, FortiAnalyzer, FortiManager and a red-team host) wired together. If you are on a standalone SOAR instance, the workshop is complete at the previous chapter; come back to this track when you have the fabric.

{{% notice warning %}}
**Prerequisites:** the lab fabric (gates + FAZ + FMG + red-team LXC) built and onboarded, with FortiSOAR's FAZ and FMG connector configurations and the FAZ→alert ingestion already in place (they ship in the lab's SOAR baseline). These labs generate real attack traffic and change device policy.
{{% /notice %}}

Here the agent does what a standalone SOAR cannot show: it works from a live attack that FortiAnalyzer logged, investigates the alert FortiSOAR ingests from it with the FortiAnalyzer evidence behind it, and contains the source on the Branch2 gate. Then you re-fire the attack and watch the gate deny it. The pages are in order:

1. Fire an attack from the red-team dashboard.
2. Investigate the alert with the FortiAnalyzer log lines behind it.
3. Contain the source on Branch2 and retest.
4. Undo the containment.

Each lab page ends with a check you can see. The alerts you work on are shared with the rest of your class, so the pages do not ask you to delete anything.

{{% children %}}
