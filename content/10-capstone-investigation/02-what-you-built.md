---
title: What You Built, and When to Use Which
linkTitle: What You Built
weight: 20
description: "A wrap-up of Part 2: the artifacts you created, and how the in-product agents of Part 1 compare with the external agent of Part 2."
---

You reached the end by doing, not watching. This page steps back so the pieces add up to something you can explain to your team.

## What you built in Part 2

Working only from plain-English prompts, your coding agent produced real, chained artifacts on the box:

| Chapter | You asked for | The agent produced | By hand this is |
|---|---|---|---|
| 7 | "stand up a module for lab assets" | a published `agentlab_assets` module with typed fields, a picklist binding, role permissions, and a verified probe record | schema design, field settings, an appliance publish, a role grant, and a test write - 15+ clicks across several screens |
| 8 | "bottle this into a playbook" | an authored, published, and verified playbook that acts on matching alerts | drafting steps in the designer, wiring the trigger, publishing, and testing |
| 9 | "build and deploy a connector" | a scaffolded, implemented, packaged, installed, configured, and healthchecked connector running inside FortiSOAR | writing boilerplate, packaging, uploading, configuring, and debugging the runtime |
| 10 | "investigate this alert and write back what you find" | a full investigation with a cited verdict written onto the record | pivoting across modules, enriching indicators, and documenting the finding |

Each result ends with a verification the agent performed and showed you: the read-back, not the success message, is the proof.

## Part 1 agents vs. the Part 2 agent

They are two different tools for two different jobs. Neither replaces the other.

| | Part 1: in-product agents | Part 2: your external agent |
|---|---|---|
| Where it runs | on the appliance, as packaged FortiAI agents | on your workstation, as your coding agent over MCP |
| Who drives it | analysts, from the FortiSOAR UI | you, from your terminal, in natural language |
| Best at | repeatable, analyst-facing investigation and triage at scale, with tier-gated actions | building and changing FortiSOAR itself - modules, playbooks, connectors - and ad-hoc automation |
| Guardrails | approval tiers, native to the platform | read-only mode and the confirm gate, plus your own review of what it did |
| When to reach for it | running the SOC day to day | standing things up, wiring integrations, one-off jobs, and prototyping what a playbook should later do forever |

The through-line of the whole workshop: an agent is only as useful as the guardrails and verification around it. Part 1 gives you tier-gated, analyst-approved actions inside the product. Part 2 gives you a general coding agent that can build the product - started read-only, gated on every write, and checked by reading the effect back.

## Where to go next

- Harden what you built: give the Part 2 agent an explicit tool allowlist, keep it read-only except when a lab needs a write, and keep its `.mcp.json` out of version control.
- Chain the pieces: have the agent wrap a real API in a connector (chapter 9), call it from a playbook (chapter 8), and gate the playbook on an investigation verdict (chapter 3).
- For connector development at production depth, see the separate FortiSOAR Connectors workshop. For playbook authoring at depth, see the playbook references in chapter 11.
