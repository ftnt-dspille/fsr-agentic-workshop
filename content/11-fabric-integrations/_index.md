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

Here the agent does what a standalone SOAR cannot show: it turns a live attack into an alert, investigates it with real FortiAnalyzer evidence, and contains it back onto the gates. Then you re-run the attack and watch it get blocked.

{{% children %}}
