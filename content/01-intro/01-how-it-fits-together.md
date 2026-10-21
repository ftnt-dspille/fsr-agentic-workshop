---
title: How It Fits Together
linkTitle: Architecture
weight: 10
description: "Agents, MCP servers, and the two ways FortiSOAR puts them to work."
---

Before touching anything, get the map straight. Everything in this workshop is one of three things: an **agent** (an LLM in a loop that decides which tool to call next), a **tool surface** (what the agent is allowed to do), and a **verification step** (how you know the tool call actually worked).

## MCP in one paragraph

MCP (Model Context Protocol) is the plug standard between agents and tools. A server advertises tools with typed schemas; the agent lists them, picks one, sends arguments, gets a result. The agent product (Claude Code, OpenCode, Copilot) does not need to know anything about FortiSOAR: it just sees tools like `search_records` or `run_connector_operation` and reads their descriptions.

## The two surfaces in this workshop

**Part 1 - inside FortiSOAR.** FortiSOAR 8.0 ships its own agentic layer: FortiAI agents run on the platform, reason with the LLM you configure, and reach the platform's own MCP servers (modules, playbooks, SOC tooling) plus any external MCP server you register. You drive all of this from the FortiSOAR UI.

**Part 2 - outside FortiSOAR.** Your coding agent runs on your workstation and connects to the box through `pyfsr-mcp`, an MCP server from the open-source pyfsr SDK. It needs exactly two values: the box URL and an API key. The agent then has the full REST surface: records, modules, users, connectors, playbook authoring and runs.

{{% notice note %}}
Part 1 features run on the appliance and need AI features enabled plus an LLM configured (your instructor has usually done this). Part 2 needs only network reach to the box and an API key.
{{% /notice %}}

## The safety model

An agent that can write to a SOC platform needs rails. Part 2's server enforces three, and Part 1's platform has their native equivalents (approval tiers on mutating tools):

1. **Read-only mode.** `FSR_MCP_READONLY=1` in the server's environment hides every mutating tool. Start every new box this way.
2. **Confirm-gated tools.** Deletes, schema publishes, user creation and connector installs refuse to run unless the call carries `confirm: true`. A good agent will tell you what is about to change and ask before setting it.
3. **Verify the effect.** A 200 response is a claim, not proof. After every write the agent (and you) read the state back: fetch the record it created, watch the playbook run it triggered, healthcheck the connector it installed. Every lab in this workshop ends with a verification step in the FortiSOAR UI.

Keep those three in mind and the rest of the workshop is just practice.

## Credits

Part 1's topic structure builds on the FortiSOAR AgenticAI Demo workshop (Fortinet internal); the hands-on steps, text and screenshots here are original to this workshop.
