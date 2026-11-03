---
title: Set Up the Agent
linkTitle: 6. Set Up the Agent
weight: 60
description: "Part 2: create a login for the agent, connect your coding agent to FortiSOAR over MCP, and check that it can read the box before it can change anything."
---

In this chapter you create a FortiSOAR login for the agent. You connect your coding agent to FortiSOAR through the `fsr-agentic-toolkit` MCP server, using the box URL and that login. The agent starts in read-only mode. You confirm that it can read the box. Writes start in chapter 7.

{{% notice info %}}
**Time:** setup takes about 10 minutes. Each Part 2 lab takes about 10 to 15 minutes. The coding agent uses model credits while it works.
{{% /notice %}}

{{% notice warning %}}
**Sharing a box?** The Part 2 labs create objects with fixed names: `agentlab_assets`, an "Agent Lab" playbook and an `agentlab-greeter` connector. A module publish also ships everyone's staged schema changes at once. If several people share a box, agree on a per-person suffix, such as `agentlab_assets_jdoe`, and coordinate before any publish. Otherwise, use one box each.
{{% /notice %}}

{{% children %}}
