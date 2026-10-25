---
title: Set Up the Agent
linkTitle: 6. Set Up the Agent
weight: 60
description: "Part 2: create a dedicated API key and wire your coding agent to FortiSOAR through the agentic toolkit's MCP server, starting in read-only mode."
---

This chapter connects your coding agent to FortiSOAR. You will create a dedicated API key, wire the agent to the `fsr-agentic-toolkit` MCP server with just the box URL and that key, start it in read-only mode, and confirm it can reach the platform before anything can change data.

{{% notice info %}}
**Why Part 2 is worth your time.** By the end you will have told a coding agent, in plain English, to stand up a custom module with fields and permissions, author and run a playbook, and build and deploy a working connector - each of which is a multi-screen, error-prone job by hand. The agent does the clicking, the waiting, the retrying, and the verifying, and it shows its work so you can check it. Each Part 2 lab takes about 10-15 minutes and a few cents of model usage (or nothing, on a subscription). Setup here is about 10 minutes.
{{% /notice %}}

{{% notice warning %}}
**Sharing a box with other learners?** The Part 2 labs create objects with fixed names (`agentlab_assets`, an "Agent Lab" playbook, an `agentlab-greeter` connector) and a module publish ships everyone's staged schema changes at once. If several of you work on one box, agree on a per-person suffix (for example `agentlab_assets_jdoe`) and coordinate before any publish, or use one box each.
{{% /notice %}}

{{% children %}}
