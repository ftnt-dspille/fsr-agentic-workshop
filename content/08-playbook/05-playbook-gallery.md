---
title: Build Playbooks From a Sentence
linkTitle: Playbook Gallery
weight: 50
description: "Three playbooks the agent designs from a plain-language goal: no YAML handed to it, each proven with a test record."
---

Here you give the agent a goal, not YAML. Each prompt describes a different kind of playbook: a conditional trigger, Python inside a playbook, and a sweep over many records. The agent picks the steps, compiles and publishes the playbook, and then proves it with a test record.

Every write the agent makes (publishing the playbook, creating a test alert) is a call your coding agent's approval prompt asks you about. Read each one, then approve it.

Each playbook acts only on alerts whose names start with its own prefix, so the three do not affect each other or the tagging playbook from page 1. If the agent creates extra test alerts, they must also start with "Agent Lab". The lab reset removes alerts with that name.

## 1. Escalate critical alerts

Give your agent this prompt:

```text
Build and publish a playbook "Agent Lab Escalate Critical" in the "Agent Lab"
collection. When an alert is created whose name starts with "Agent Lab crit"
and whose severity is Critical, set its status to Investigating. Alerts of any
other severity must be left alone. Then prove it: create one Critical and one
Low alert with that name prefix and show me both statuses afterwards. Name any
other test alerts you create starting with "Agent Lab".
```

<!-- step: fsa08-06-escalate-critical -->

<!-- capture: fsa08-06-escalate-critical -->
![fsa08-06-escalate-critical](fsa08-06-escalate-critical.png?height=600px)

A trigger filter that compares severity to the text "Critical" may not fire on this build. The reliable filter matches the picklist value's IRI (an ID that starts with `/api/3/picklists/`). If the agent does not know the IRI, it can look it up with resolve_picklist. The compile check refuses a filter on severity.itemValue outright, so that form never reaches the box.

**You are done when:** the Critical alert is Investigating and the Low alert is still Open.

## 2. Pull an indicator out of free text

Give your agent this prompt:

```text
Build and publish a playbook "Agent Lab IOC Extract" in the "Agent Lab"
collection. When an alert is created whose name starts with "Agent Lab ioc",
use a Python code step to find the first IPv4 address in the alert's
description and write it to the alert's hostIPAddress field. If there is no
address, leave the field empty. Then prove it with a test alert whose
description is "Beacon to 198.51.100.23 every hour". Name any other test
alerts you create starting with "Agent Lab".
```

<!-- step: fsa08-07-ioc-extract -->

<!-- capture: fsa08-07-ioc-extract -->
![fsa08-07-ioc-extract](fsa08-07-ioc-extract.png?height=600px)

**You are done when:** the test alert's **Host IP Address** reads **198.51.100.23**.

## 3. Sweep a batch of records

Give your agent this prompt:

```text
Create three Low-severity alerts named "Agent Lab sweep 1" to "Agent Lab sweep 3".
Then write a playbook "Agent Lab Sweep" that finds every open alert whose name
starts with "Agent Lab sweep" and closes each one. Give it a test run that
cleans up after itself: I want no leftover playbook or schedule when it is
done. Show me the three alerts' statuses before and after.
```

<!-- step: fsa08-08-sweep -->

<!-- capture: fsa08-08-sweep -->
![fsa08-08-sweep](fsa08-08-sweep.png?height=600px)

**You are done when:** all three sweep alerts went from Open to Closed, and no "Agent Lab Sweep" playbook is left on the box.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The Critical alert stays Open and no run appears | The trigger compares severity to the text "Critical" | Ask the agent to filter severity on the Critical picklist IRI from resolve_picklist |
| The code step finishes but the field stays empty | The code does not print its result | Ask the agent to `print()` the value |
| The sweep finishes but nothing closed | The loop reads `hydra:member` from the find step | Ask the agent to loop over the find step's result directly |
