---
title: How It Fits Together
linkTitle: Architecture
weight: 10
description: "Agents, MCP servers, and the two ways FortiSOAR puts them to work."
---

Before touching anything, get the map straight. Everything in this workshop is one of three things: an **agent** (an LLM in a loop that decides which tool to call next), a **tool surface** (what the agent is allowed to do), and a **verification step** (how you know the tool call actually worked).

## MCP in one paragraph

MCP (Model Context Protocol) is the plug standard between agents and tools. A server advertises tools with typed schemas; the agent lists them, picks one, sends arguments, gets a result. The agent product (Claude Code, Codex, Copilot) does not need to know anything about FortiSOAR: it just sees tools like `search_records` or `run_connector_operation` and reads their descriptions.

An MCP connection always has a caller and a thing being called, and this workshop uses it **both ways**. Keep the direction straight and nothing else is confusing:

- In **Part 1, chapter 5**, FortiSOAR is the caller: you register an outside MCP server and FortiSOAR's agents call out to it.
- In **Part 2**, FortiSOAR is the thing being called: a small program on your laptop (`fsr-agentic-toolkit`) lets your coding agent call into FortiSOAR.

## The FortiSOAR objects you will touch

If FortiSOAR is new to you, four words cover almost everything in this workshop. The glossary in chapter 11 defines the rest.

- A **module** is a type of thing FortiSOAR stores (Alerts, Assets, Users); a **record** is one entry in a module (one alert).
- A **connector** is an integration that lets FortiSOAR talk to an outside product (a firewall, a threat-intel service). Its **operations** are the actions it can run.
- A **playbook** is an automation you build once and run forever: a trigger plus a sequence of steps. An agent reasons freshly each time; a playbook does the same thing the same way every time.

## The two surfaces in this workshop

**Part 1 - inside FortiSOAR.** FortiSOAR 8.0.1 ships its own agentic layer: FortiAI agents run on the platform, reason with the LLM you configure, and reach the platform's own MCP servers (modules, playbooks, SOC tooling) plus any external MCP server you register. You drive all of this from the FortiSOAR UI.

**Part 2 - outside FortiSOAR.** Your coding agent runs on your workstation and connects to the box through the `fsr-agentic-toolkit` MCP server, built on the open-source pyfsr SDK. It needs exactly two values: the box URL and an API key. The agent then has the full REST surface (records, modules, users, connectors, playbook authoring and runs) plus the toolkit's seven higher-level workflows (orient, debug a run, build and repair playbooks, verify an effect, investigate an alert, provision a module) that let a general coding agent do SOC work competently. Part 2 is the agentic toolkit in practice.

{{% notice note %}}
Part 1 features run on the appliance and need AI features enabled plus an LLM configured (your instructor has usually done this). Part 2 needs only network reach to the box and an API key.
{{% /notice %}}

## The safety model

An agent that can write to a SOC platform needs rails. Part 2's server enforces the three below. Part 1's platform has its own controls in the same spirit (approval tiers that pause mutating tools for a human); they are not identical, and chapter 2 shows exactly what each Part 1 path can and cannot change.

1. **Read-only mode.** `FSR_MCP_READONLY=1` in the server's environment hides every mutating tool. Start every new box this way.
2. **Confirm-gated tools.** Deletes, schema publishes, user creation and connector installs refuse to run unless the call carries `confirm: true`. A good agent will tell you what is about to change and ask before setting it.
3. **Verify the effect.** A 200 response is a claim, not proof. After every write the agent (and you) read the state back: fetch the record it created, watch the playbook run it triggered, healthcheck the connector it installed. Nearly every hands-on lab ends with a verification step, usually in the FortiSOAR UI and sometimes by asking the agent to read the state back.

Keep those three in mind and the rest of the workshop is just practice.

## Credits

Part 1's topic structure builds on the FortiSOAR AgenticAI Demo workshop (Fortinet internal); the hands-on steps, text and screenshots here are original to this workshop.
