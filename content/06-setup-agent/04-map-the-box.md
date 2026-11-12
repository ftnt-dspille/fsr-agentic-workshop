---
title: Ask Your First Question
linkTitle: Map the Box
weight: 40
description: "Ask the agent to describe the box without changing anything, then check its answer against the box."
---

A good first question changes nothing and shows that the agent can see the box. Ask the agent to map the box.

## 1. Ask

Give your agent this prompt:

```text
I'm new to this FortiSOAR box. Map it for me without changing anything:
the version, whether FortiAI is on, which MCP servers are registered, which
connectors have a configuration and whether they are healthy, and the custom
modules. Finish with a short list of anything that looks misconfigured or
broken, citing the tool result for each. End with one line: the version,
whether FortiAI is on, and how many MCP servers are registered.
```

<!-- step: fsa06-11-map-the-box -->

<!-- capture: fsa06-11-map-the-box -->
![fsa06-11-map-the-box](fsa06-11-map-the-box.png?height=600px)

The agent calls survey_box first. That one call returns the version, the FortiAI state, the MCP servers and the configured connectors. The agent then checks each connector's health and lists the modules. Every claim in the answer should point to one of those results.

## 2. You are done when

- The version and the FortiAI state match **Settings** > **System** on the box.
- Each "looks wrong" item names the tool result behind it, such as a health check that returned **Disconnected**.
- The agent asked for no approvals. Nothing on the box changed.
