---
title: Build Playbooks From a Sentence
linkTitle: Playbook Gallery
weight: 50
description: "Three playbooks the agent designs from a plain-language goal: no YAML handed to it, each proven with a test record."
---

So far you handed the agent most of the YAML. Here you hand it only the goal. Each prompt names a different playbook shape: a conditional trigger, Python inside a playbook, and a sweep over many records. The agent picks the steps, compiles, publishes and then proves the result on a test record.

Each playbook only acts on alerts whose names start with its own prefix, so they do not step on each other or on the chapter's tagging playbook.

## 1. Escalate critical alerts

Give your agent this prompt:

```text
Build and publish a playbook "Agent Lab Escalate Critical" in the "Agent Lab"
collection. When an alert is created whose name starts with "Agent Lab crit"
and whose severity is Critical, set its status to Investigating. Alerts of any
other severity must be left alone. Then prove it: create one Critical and one
Low alert with that name prefix and show me both statuses afterwards.
```

<!-- step: fsa08-06-escalate-critical -->

<!-- capture: fsa08-06-escalate-critical -->
![fsa08-06-escalate-critical](fsa08-06-escalate-critical.png?height=600px)

The trap the agent has to avoid: a trigger that compares severity to the text "Critical" compiles and publishes, then never fires, because a picklist only matches by its value or its ID. The run above shows the agent hitting it and fixing it.

**You are done when:** the Critical alert is Investigating and the Low one is still Open.

## 2. Pull an indicator out of free text

Give your agent this prompt:

```text
Build and publish a playbook "Agent Lab IOC Extract" in the "Agent Lab"
collection. When an alert is created whose name starts with "Agent Lab ioc",
use a Python code step to find the first IPv4 address in the alert's
description and write it to the alert's hostIPAddress field. If there is no
address, leave the field empty. Then prove it with a test alert whose
description is "Beacon to 198.51.100.23 every hour".
```

<!-- step: fsa08-07-ioc-extract -->

<!-- capture: fsa08-07-ioc-extract -->
![fsa08-07-ioc-extract](fsa08-07-ioc-extract.png?height=600px)

A code step's output is whatever its code prints, not a variable it sets, and the sandbox refuses some ordinary Python names. The compile check catches both before anything reaches the box.

**You are done when:** the test alert's **Host IP Address** reads `198.51.100.23`.

## 3. Sweep a batch of records

Give your agent this prompt:

```text
Create three Low-severity alerts named "Agent Lab sweep 1" to "Agent Lab sweep 3".
Then write a playbook "Agent Lab Sweep" that finds every open alert whose name
starts with "Agent Lab sweep" and closes each one. Test-run it with
run_playbook_yaml (it cleans the playbook up afterwards), and show me the
three alerts' statuses before and after.
```

<!-- step: fsa08-08-sweep -->

<!-- capture: fsa08-08-sweep -->
![fsa08-08-sweep](fsa08-08-sweep.png?height=600px)

A find-record step returns the list of rows itself. Reading `hydra:member` from it gives an empty list, so a sweep built that way runs clean and changes nothing. The compile check flags that too.

**You are done when:** all three sweep alerts went from Open to Closed, and no "Agent Lab Sweep" playbook is left on the box.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The Critical alert stays Open and no run appears | The trigger compares severity to the text "Critical" | Ask the agent to compare the picklist value (`severity.itemValue`) or its ID |
| The code step finishes but the field stays empty | The code never prints its result | Ask the agent to `print()` the value |
| The sweep finishes but nothing closed | The loop reads `hydra:member` from the find step | Loop over the find step's result directly |
| The Low alert was escalated too | The trigger condition only checks the name | Ask the agent to add the severity condition to the trigger |
