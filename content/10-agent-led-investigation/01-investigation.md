---
title: "Run the Investigation"
linkTitle: Run the investigation
weight: 10
description: "One prompt, a full investigation: enrich, correlate, conclude, write the findings back -- then contain the threat across every gateway at once."
tags: ["fabric"]
aliases: [/10-capstone-investigation/01-capstone/]
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

## 3. Review the investigation result

Before containing, confirm the investigation itself held up:

- The agent used the asset record from chapter 7 (web-server-01, owner web-team, criticality Medium) in its reasoning.
- The verdict cites its evidence, and it says what the agent could not check.
- The alert's description holds the structured findings. The severity change, if any, is justified.

**Verify in the UI:** open the alert. The description is the agent's write-back.

<!-- capture: fsa10-02-investigate-findings-on-alert -->
![fsa10-02-investigate-findings-on-alert](fsa10-02-investigate-findings-on-alert.png?height=600px)

## 4. Contain across the whole fleet

Investigation reaches a verdict; containment acts on it. In a real SOC you do not
log into each firewall. You publish the indicator **once** to FortiSOAR, and every
gateway picks it up on its own.

That is already wired in this lab. FortiSOAR runs a native **TAXII 2.1 server** that
publishes a "Block List (IP Address)" collection, and all three FortiGates
(Branch1, Branch2, Enterprise_Core) subscribe to it as a threat feed with a deny
policy. Adding the C2 to that block list is the "block it everywhere" action, with
no per-gate push.

Give your agent this prompt:

```text
Contain the destination from the investigation. Add 203.0.113.99 to our
FortiSOAR block list so the firewalls drop it: create a threat_intel_feeds
record with value 203.0.113.99, type of feed "IP Address", reputation
"Malicious", and confidence 90, sourced "Agent Lab investigation". Then confirm
it is being served on the Block List (IP Address) TAXII collection.
```

The record has to clear the collection's own filter, **IP Address, confidence ≥ 70,
Malicious**, or it is created but never served. That filter is also the expiry: an
indicator ages out of the feed 24 hours after it is added, so containment is
self-cleaning.

The gates refresh on a 5-minute timer, so the block is not instant. A minute or two
after the record is served, the indicator appears in each gate's feed address table
and the deny policy in front of the accept rules starts dropping it.

## 5. You are done when

- The agent used the asset record from chapter 7 in its reasoning, cited its
  evidence, and said what it could not check.
- The alert's description holds the structured findings, and any severity change is
  justified.
- 203.0.113.99 is served on the Block List (IP Address) collection, and within a
  refresh interval it shows up in the gates' feed and is denied. Blocking on
  FortiSOAR reached the whole fleet without touching a single firewall.

> **If the block list is empty or the gates never pick it up:** the feed is a
> post-install step (the gates' subscription key is minted when the feed is set up,
> so a fabric reinstall drops it). Re-run
> `topologies/fsr_agentic_lab/config/soar_taxii_feed.yml` to re-establish it. That
> play also verifies, end to end, that every gate builds the indicator into its
> address table.

## 6. Optional: compare with the platform's own AI investigation

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

The box has a third investigator: the **Agentic Assistant** you installed in
chapter 1, and watched triage this same scenario in chapter 3 ("Chat with the
Assistants"). It investigates on the record itself. Open the investigation alert,
launch the assistant, and hold it to the same bar you held your coding agent:

```text
Investigate this alert like a SOC analyst: read the record and its history,
use the tools you have, and give me a verdict that cites the evidence behind
every claim -- and says what you could not check.
```

The three surfaces differ in shape, not in goal. The native AI Investigation
runs one phased trace you read afterwards. Your coding agent works from a
full transcript you can audit line by line, and reaches every tool in the
toolkit. The Agentic Assistant holds the conversation on the record: every
answer carries its evidence chips, every write arrives as an approval card
you accept or reject, and every turn lands in the **Agentic Assistant
Monitor** dashboard's audit trail. Run all three on the same alert: the
verdicts should agree, and where they differ is exactly the conversation a
SOC team has about how much to trust each surface.

## 7. Take it further

Chapter 8 built playbooks from an investigation two ways: your coding agent
wrote the YAML outside FortiSOAR and published it (pages 1-5), and the
Agentic Assistant compiled a plain-English request into steps on the
Playbook Designer (page 6). As a take-home exercise, do the investigation both
ways: ask the agent to build and publish a playbook that repeats the
investigation steps above for any "Agent Lab" alert. Then open the designer,
launch the Agentic Assistant, and ask it for the same playbook. Compare the
two canvases: the same trigger and enrichment order means the investigation
survived the translation, and whatever the two authors disagree on is the
interesting part.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent invents enrichment results | No suitable connector, so the model filled the gap | Say so, then ask again with: "only claim what a tool result shows; state gaps explicitly" |
| The write-back replaced the playbook's tag | The write-back overwrites the whole description | Fine for the lab. To keep the tag, ask the agent to append the summary instead |
| investigate_alert errors | Native AI investigation is not set up on this box | Expected on a bare lab box. Skip step 4 |
| Investigation stalls on large results | Tool output hit the size cap | Ask the agent to narrow its queries (for example `summary=true` and filters) |
