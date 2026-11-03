---
title: FortiSOAR Agentic Operations Workshop
linkTitle: Agentic Workshop
weight: 10
description: "Hands-on workshop on running FortiSOAR with AI agents: how agents and MCP servers fit together, how to investigate alerts with an agent, and how to bottle a proven investigation into a playbook."
---

## Workshop Overview

This workshop shows you how to put an AI agent to work on FortiSOAR, two ways: the agentic features that ship inside the product, and an external coding agent that drives FortiSOAR through the `fsr-agentic-toolkit`. Along the way an agent will investigate real alerts with cited verdicts, and you will turn the investigations that work into playbooks that run on their own.

## Two Tracks

The workshop has two parts that share one idea: an agent is only as useful as the guardrails and verification around it.

- **Part 1 - Out of the box (chapters 2-5):** the agentic AI capabilities that ship with FortiSOAR 8.0.1, driven from the FortiSOAR UI: the built-in investigation and insight agents, building your own FortiAI agent, and registering external MCP servers.
- **Part 2 - Do it yourself with the agentic toolkit (chapters 6-10):** point an external coding agent (Claude Code is the primary path; Codex and OpenCode also work) at FortiSOAR and have it automate real SOC work. The agent reaches the platform through the `fsr-agentic-toolkit`, whose ready-made workflows make a general coding agent competent on FortiSOAR (chapter 1 lists them). You will update alerts, create a module and its records, author and publish a playbook, explore and build connectors, and run a full investigation that writes its findings back.

**Do chapter 1 first.** Then:
- **Part 1 is optional** and its chapters stand alone: take the ones that interest you.
- **Part 2 chapters are sequential** (6 then 7 then 8 then 9 then 10). The capstone in chapter 10 builds on the module from chapter 7, the playbook from chapter 8, and the connector from chapter 9, so do them in order.

## Before you start

**Duration:** 6-8 hours. **Difficulty:** intermediate. You do not need any prior experience with AI agents or MCP; chapter 1 teaches those. You do need to be comfortable moving around the FortiSOAR UI.

For **Part 1** (in the FortiSOAR UI):

- A FortiSOAR instance, **version 8.0.1 or later**, with an account that can create users, modules and playbooks. Use 8.0.1 rather than 8.0.0: it adds investigation traceability and improved agentic features that several labs rely on.
- AI features enabled on the instance and an LLM configured. Chapter 2 shows you how to confirm it.

For **Part 2** (on your own workstation), check each of these before chapter 6:

- A FortiSOAR instance (8.0.1 or later), reachable over the network from your workstation, and a FortiSOAR user login for the agent (you create a dedicated one in chapter 6).
- **Python 3.10 or later.** Check: `python3 --version`.
- **A coding agent.** Claude Code is the primary path: install it and sign in with an Anthropic account that has credits or a subscription (Part 2 makes real model calls). Check: `claude --version`. Codex or OpenCode also work if you prefer.
- Basic familiarity with FortiSOAR alerts, records and playbooks. New to these? The glossary in chapter 11 defines every term this workshop uses.

{{% children %}}
