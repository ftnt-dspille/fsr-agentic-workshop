---
title: "Capstone: Agent-Led Investigation"
linkTitle: Capstone
weight: 10
description: "One prompt, a full investigation: enrich, correlate, conclude, and write the findings back to the alert."
---

In this investigation the agent takes an alert, gathers evidence with the tools from earlier chapters, reaches a verdict, and writes the findings back to the alert. The next analyst then sees the findings on the record.

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

The playbook from chapter 8 tags the alert within seconds. That is expected. It is the first entry in the alert's history.

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

Let the agent run. The write-back is an update to the alert, so your coding agent's approval prompt asks you before it runs. A good transcript shows each claim with the tool result behind it. It also states gaps, for example "no reputation connector is configured, so the destination is unverified."

<!-- capture: fsa10-02-investigate -->
![fsa10-02-investigate](fsa10-02-investigate.png?height=600px)

## 3. You are done when

- The agent used the asset record from chapter 7 (web-server-01, owner web-team, criticality Medium) in its reasoning.
- The verdict cites its evidence, and it says what the agent could not check.
- The alert's description holds the structured findings. The severity change, if any, is justified.

**Verify in the UI:** open the alert. The description is the agent's write-back.

<!-- capture: fsa10-02-investigate-findings-on-alert -->
![fsa10-02-investigate-findings-on-alert](fsa10-02-investigate-findings-on-alert.png?height=600px)

## 4. Optional: compare with the platform's own AI investigation

If your box has FortiSOAR's native AI Investigation set up (Part 1), run both on the same alert and compare the results. Give your agent this prompt:

```text
Trigger a native FortiSOAR AI investigation of the "Agent Lab - beaconing
from web-server-01" alert, wait for the verdict, and compare it with yours:
where do you agree, where do you differ, and why?
```

Starting the native investigation is a write, so your coding agent's approval prompt asks you first.

<!-- step: fsa10-03-native-compare -->

<!-- capture: fsa10-03-native-compare -->
![fsa10-03-native-compare](fsa10-03-native-compare.png?height=600px)

## 5. Take it further

Chapter 8 showed how to turn a proven investigation into a playbook. As a take-home exercise, ask the agent to build a playbook that repeats the investigation steps in the prompt above for any "Agent Lab" alert, and publish it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent invents enrichment results | No suitable connector, so the model filled the gap | Say so, then ask again with: "only claim what a tool result shows; state gaps explicitly" |
| The write-back replaced the playbook's tag | The write-back overwrites the whole description | Fine for the lab. To keep the tag, ask the agent to append the summary instead |
| `investigate_alert` errors | Native AI investigation is not set up on this box | Expected on a bare lab box. Skip step 4 |
| Investigation stalls on large results | Tool output hit the size cap | Ask the agent to narrow its queries (for example `summary=true` and filters) |
