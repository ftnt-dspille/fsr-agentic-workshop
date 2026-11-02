---
title: "Capstone: Agent-Led Investigation"
linkTitle: Capstone
weight: 10
description: "One prompt, a full investigation: enrich, correlate, conclude, and write the findings back to the alert."
---

Everything so far was a drill. Now the agent runs a real investigation shape: take an alert, gather evidence with the tools it has learned, reach a conclusion, and - the part that matters - write the findings back to the record so the next analyst sees them where they work.

## 1. Stage the scenario

Give your agent this prompt:

```text
Set the stage for an investigation drill: create an alert named
"Agent Lab - beaconing from web-server-01" with severity Critical, source
"Agent Lab Workshop", and this description: "Hourly HTTPS beacons from
web-server-01 to 203.0.113.99 since 02:00 UTC."
```

<!-- step: fsa10-01-stage-alert -->

<!-- capture: fsa10-01-stage-alert -->
![fsa10-01-stage-alert](fsa10-01-stage-alert.png?height=600px)

(The chapter 8 playbook will tag it within seconds - that is expected, and the first piece of history on the record.)

## 2. Run the investigation

Give your agent this prompt:

```text
Investigate the "Agent Lab - beaconing from web-server-01" alert like a SOC
analyst and narrate your reasoning:
1. Read the alert and its full lifecycle so far.
2. Check our asset inventory (agentlab_assets) for the host involved: who
   owns it, how critical is it?
3. Enrich the destination with whatever configured connector fits
   (reputation lookup if available; otherwise note the gap explicitly).
4. Search alerts for other records mentioning the same host or destination.
5. Reach a verdict with your confidence and cite which tool result supports
   each claim.
Then write the findings back: update the alert's description with a
structured summary (verdict, evidence, recommended next steps) and raise
its severity if your verdict warrants it. Do not close the alert.
```

<!-- step: fsa10-02-investigate -->

Let it run. A good transcript reads like an analyst's notebook: each claim traceable to a tool result, gaps stated honestly ("no reputation connector is configured, so the destination is unverified"), and a verdict that distinguishes evidence from inference.

## 3. You are done when

- The agent correlated across modules: the asset record from chapter 7 (web-server-01, owner web-team, criticality Medium) appears in its reasoning.
- The verdict cites evidence, including what it could NOT check.
- The alert's description now carries the structured findings, and the severity change (if any) is justified.

**Verify in the UI:** open the alert. The description is the agent's write-back; the audit timeline shows the whole investigation imprint.

<!-- capture: fsa10-02-investigate -->
![fsa10-02-investigate](fsa10-02-investigate.png?height=600px)

<!-- capture: fsa10-02-investigate-findings-on-alert -->
![fsa10-02-investigate-findings-on-alert](fsa10-02-investigate-findings-on-alert.png?height=600px)

## 4. Optional: hand it to the platform

If your box has FortiSOAR's native AI Investigation configured (Part 1), run both on the same alert and compare. Give your agent this prompt:

```text
Trigger a native FortiSOAR AI investigation of the "Agent Lab - beaconing
from web-server-01" alert, wait for the verdict, and compare it with yours:
where do you agree, where do you differ, and why?
```

<!-- step: fsa10-03-native-compare -->

<!-- capture: fsa10-03-native-compare -->
![fsa10-03-native-compare](fsa10-03-native-compare.png?height=600px)

## 5. Bottle it

The investigation worked once; chapter 8 showed you how to make it permanent. As a take-home exercise, have the agent author a playbook that automates steps 1-4 for any "Agent Lab" alert and publishes it. That is the full arc: AI finds the pattern, a playbook runs it forever.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent invents enrichment results | No suitable connector, model filled the gap | Call it out; re-prompt with "only claim what a tool result shows; state gaps explicitly" |
| Write-back overwrote the playbook's tag | Full description replace | Fine for the lab; for surgical edits, ask it to append instead |
| investigate_alert errors | Native AI investigation not configured on this box | Expected on a bare lab box; skip step 4 |
| Investigation stalls on huge results | Tool outputs hit the size cap | The truncation envelope tells the agent to narrow; nudge it to use summary=true and filters |
