---
title: Glossary
linkTitle: Glossary
weight: 20
description: "Plain-English definitions of every term the workshop uses, including the few words that mean more than one thing."
---

Every term the workshop uses, in plain language. If a word has more than one
meaning in this course, this page says so, because a few of them do.

## Core ideas

**Agent.** An LLM (a large language model) running in a loop: it reads a goal,
decides which tool to call next, calls it, reads the result, and repeats until
it is done. The agent is the thing that "decides"; the tools are the things it
can actually do.

**Tool.** A single action an agent can take, described by a name and a typed set
of inputs. The agent picks a tool and fills in its inputs; it gets back a result.
In this workshop "tool" means an MCP tool unless the text says otherwise (see the
two other meanings under *Overloaded words* below).

**MCP (Model Context Protocol).** The plug standard between agents and tools. A
*server* advertises its tools with typed schemas; a *client* lists them, picks
one, sends inputs, and reads the result. The agent product (Claude Code, OpenCode,
Copilot) does not need to know anything about FortiSOAR: it just sees tools like
`search_records` and reads their descriptions.

**MCP server.** A small program that exposes a set of tools over MCP. Which side
calls which matters and changes between the two parts of this workshop:
- In **Part 1, chapter 5**, FortiSOAR is the *client*: it calls out to an
  external MCP server you register (for example, a public docs server).
- In **Part 2**, FortiSOAR is the *target*: the `fsr-agentic-toolkit` MCP server
  runs on your laptop and turns your coding agent's tool calls into FortiSOAR
  REST calls.

**Verification step.** How you know a tool call actually worked. A success
response is a claim, not proof: after any write you read the state back (fetch
the record, watch the run, healthcheck the connector). Every lab ends with one.

## FortiSOAR objects

**Module.** A type of thing FortiSOAR stores, with its own fields: Alerts,
Incidents, Assets, Users and so on. You create a custom module in chapter 7.

**Record.** One entry in a module: a single alert, a single asset.

**Field.** One attribute on a record (its name, severity, status).

**Picklist.** A fixed list of allowed values for a field (for example, a
Severity picklist of Low / Medium / High / Critical). Each value has an **IRI**
(see Acronyms), which is the stable id the API uses to refer to it.

**Connector.** An integration that lets FortiSOAR talk to an outside product (a
firewall, a threat-intel service). Think of connectors as FortiSOAR's hands. A
connector has a **configuration** (the credentials and host for one instance)
and **operations** (the individual actions it can run, such as "block IP").

**Connector operation.** One action a connector can perform. (This is the third
thing the word "tool" can informally mean; see *Overloaded words*.)

**Playbook.** An automation you build once and run forever: a trigger plus a
sequence of steps. Where an agent reasons each time, a playbook does the same
thing the same way every time. You author one in chapter 8.

**Content Hub.** The in-product catalog where you discover and install content
(connectors, agents, solution packs).

**TOOL_LIST (the evidence-source table).** A record in the organizational-context
module that tells a Part 1 agent which data sources it may draw on. It is *not*
an MCP tool list, despite the name.

## Safety

**Read-only mode.** `FSR_MCP_READONLY=1` in the Part 2 server's environment hides
every mutating tool. Start every new box this way; chapter 7 tells you when and
how to turn it off.

**Confirm gate.** A rule on mutating tools (deletes, publishes, user creation,
connector installs): the call refuses to run unless it carries `confirm: true`.
In practice the agent tells you what is about to change and asks before setting
it.

**Tier / approval tier.** FortiSOAR's own rating of how sensitive a tool is.
Higher-tier (mutating) tools pause for a human to approve. This is Part 1's
native equivalent of the confirm gate.

**Staging.** Proposing an action and holding it for approval rather than running
it immediately.

## Part 2: the agent toolkit

**pyfsr.** The open-source FortiSOAR SDK: a typed REST client with auth and
instance handling. No agent code of its own.

**fsr-agentic-toolkit.** The package you install in Part 2. It builds on pyfsr and
adds the agent layer: the verbs plus seven ready-made **workflows**, served as an
MCP server, a CLI, and a Python API. Its MCP server runs on your laptop, your
coding agent starts it, and it translates the agent's tool calls into FortiSOAR
REST calls (it needs the box URL and a user login). It is what makes a
general coding agent competent on FortiSOAR, and it is the heart of Part 2. This
is the one name the chapters use; you do not install a separate MCP server.

**Workflow (toolkit).** One of the seven higher-level operations the toolkit
ships: `orient`, `debug_run`, `repair_playbook`, `build_playbook`,
`verify_effect`, `investigate_alert`, `provision_module`. Each returns a
**WorkflowResult** (findings with evidence ids, unknowns, and next steps with
their tier), and you compose them: provision a module, build a playbook on it,
verify the effect.

**Skill (Part 2).** A Claude Code concept: a packaged set of instructions for a
kind of task. Unrelated to a Part 1 "skill". When an agent run shows
`Skill {"skill": "fsr-playbooks"}`, that is Claude Code loading playbook-authoring
instructions.

## Overloaded words (same word, different things)

**"Tool"** means three things, so the text names which:
1. an **MCP tool** (the default);
2. a row in the **TOOL_LIST** evidence-source table (a Part 1 data source);
3. informally, a **connector operation**.

**"Allowlist"** appears three times for three unrelated mechanisms: the
`memory.yaml` file in a Part 1 agent bundle; the allowlist field on a registered
MCP server in the UI; and `FSR_MCP_ALLOW_TOOLS` in the Part 2 server's
environment.

**"Publish"** means three things: **schema publish** (making a new module or
field live), **playbook publish** (activating a playbook), and **Content Hub
publish** (making installed content available).

**"Agent"** in Part 1 is a code bundle that runs on the appliance (a FortiAI
agent); in Part 2 it is your coding agent (Claude Code, OpenCode, Copilot) on your
laptop.

## Acronyms

- **IOC** - Indicator of Compromise: an observable (an IP, a hash, a domain) that
  suggests malicious activity.
- **IRI** - the stable id the FortiSOAR API uses for a record or picklist value
  (it looks like a path, for example `/api/3/picklists/...`).
- **HMAC** - a signed service-to-service call with no interactive user login.
  Investigations should not be started this way.
- **Idempotent** - safe to run more than once: running it again does not create a
  second copy or change the result.
- **Enrichment** - adding context to an observable by looking it up in another
  source (reputation, geolocation, asset ownership).
- **Verdict** - the investigation's conclusion about an alert (for example
  Malicious, Benign, Inconclusive), with its evidence.
- **JSON-RPC** - the request-and-response format MCP uses on the wire. You rarely
  see it directly; the UI and the SDK handle it.
- **stdio / SSE / streamable HTTP** - the three ways an MCP client and server can
  be connected (a local process over its input and output, or two network
  transports). Pick the one your tool and server both support.
