---
title: FortiSOAR Agentic Operations Workshop
linkTitle: Agentic Workshop
weight: 10
description: "Hands-on workshop on running FortiSOAR with AI agents: how agents and MCP servers fit together, how to investigate alerts with an agent, and how to bottle a proven investigation into a playbook."
---

## Workshop Overview

This workshop shows you how to put an AI agent to work on FortiSOAR. You will connect an agent to the platform through MCP (Model Context Protocol) servers, have it investigate real alerts with cited verdicts, and turn the investigations that work into playbooks that run on their own.

**Duration:** 6-8 hours

**Difficulty:** Intermediate

## Two Tracks

The workshop has two parts that share one idea: an agent is only as useful as the guardrails and verification around it.

- **Part 1 - Out of the box (chapters 2-5):** the agentic AI capabilities that ship with FortiSOAR 8.0, driven from the FortiSOAR UI: the orchestrator agent, AI Investigations and Insights, building your own FortiAI agent, and registering external MCP servers.
- **Part 2 - Do it yourself (chapters 6-10):** connect an external coding agent (Claude Code is the primary path; OpenCode and GitHub Copilot work too) to FortiSOAR over MCP and have it do real work: create users, modules and records, author and publish a playbook, explore and build connectors, and run a full investigation that writes its findings back.

Work through the introduction first, then follow the chapters in order. The parts are independent: jump straight to Part 2 if you came for the coding-agent lab.

## Prerequisites

- Access to a FortiSOAR instance (version 8.0 or later) with an account that can create users, modules and playbooks.
- A FortiSOAR API key for the account you will use.
- Basic familiarity with FortiSOAR alerts, records and playbooks.

{{% children %}}
