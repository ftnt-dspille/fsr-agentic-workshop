---
title: What Else an Outside Agent Can Do
linkTitle: What Else
weight: 30
description: "A menu of high-value tasks the same external agent handles well, with prompts to try next."
---

By now the agent has oriented, triaged in bulk, built a module, authored and published a playbook, built a connector and run an investigation. Those are the spine of the workshop, but they are not the limit. The same agent, the same `.mcp.json`, and the same read-only-then-gated discipline cover a much wider set of day-to-day FortiSOAR work.

This page is a menu, not a lab. Each task below is one prompt away, works with the API-key agent you already set up, and is the kind of thing that is tedious to click through in the UI but natural to describe in a sentence. Try the ones that fit your environment.

{{% notice tip %}}
Keep the agent read-only while you explore. Every task here that only reads (health sweeps, timelines, session reviews) is safe with `FSR_MCP_READONLY=1` on. Turn the guard off only for the ones that write, and let the confirm gate catch the tier-3 actions.
{{% /notice %}}

## Diagnose a failed playbook run

When a run fails, the agent can tell you *why* faster than the run log will. It diffs the playbook's step graph against what actually executed, names the failing step and its error, and cross-references any record changes that happened at the same time.

Try:

```text
The last run of "Tag Agent Lab Alerts" failed. Tell me which step failed and
why, show me the error verbatim, and suggest the smallest fix.
```

This is the break-fix loop from chapter 8, page 3, in a single prompt: `diagnose_run` does the reasoning the UI leaves to you, diffing the step graph against the run and naming the failing step and its error.

## Sweep every connector's health

One prompt, every connector, instead of opening each card.

Try:

```text
Check the health of every configured connector and give me a table: connector,
configuration, status, and for anything not healthy, the error. Sort the broken
ones to the top.
```

The agent lists connectors, health-checks each configuration, and summarizes. It is a read-only task, so leave the guard on.

## Schedule a job and prove it is healthy

Standing up recurring automation, and verifying it will actually fire.

Try:

```text
Schedule "Tag Agent Lab Alerts" to run every day at 6am, then audit the
schedule: confirm it is enabled and that its target playbook still exists.
Tell me the next run time.
```

`schedule_playbook` creates the task (tier-2) and `schedule_audit` checks it is wired correctly, so a schedule that points at a deleted playbook never sits silently broken.

## Reconstruct a record's history

Who touched this record, when, and did a playbook do it?

Try:

```text
Build a timeline for the alert named "Agent Lab - beaconing from web-server-01":
every change, who made it, and whether a playbook or a person did it. Flag
anything that changed in the last hour.
```

`record_lifecycle`, `audit_activities` and `execution_context` turn scattered audit rows into one attributed, timestamped story.

## Review what the in-product assistant has been doing

The Part 1 FortiAI assistant keeps a transcript of every chat. The Part 2 agent can read across them.

Try:

```text
List the FortiAI assistant sessions from the last week and summarize what each
one was asked to do. Call out any that ended without a clear answer.
```

`list_agent_sessions` and `get_agent_session` make the assistant's own activity auditable.

## Map a use case to a FortiSOAR design

Starting from a sentence, not a schema.

Try:

```text
I want to track phishing reports from our mailbox, enrich the sender domain,
and open a case when the domain is malicious. Classify this use case and sketch
the modules, playbook and connector it would need.
```

`map_use_case` classifies free-text intent to a FortiSOAR archetype and fills in the pieces, a fast way to turn "we should automate X" into a concrete plan the agent can then build.

## The pattern behind all of them

Every task here is the same shape: the agent reads the current state, reasons about it, and either reports or writes back under the guardrails. That is the whole value of an outside agent on FortiSOAR. It does not replace the analyst or the platform's own automation. It is the fastest way to build, change, inspect and verify the system itself, in the language you already think in.
