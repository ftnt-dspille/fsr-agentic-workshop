---
title: Ask Your First Question
linkTitle: Map the Box
weight: 40
description: "Before the agent changes anything, have it tell you what this FortiSOAR box is and what looks wrong."
---

A good first question is one that changes nothing and proves the agent can see the box. Ask it to map the box. A person new to an appliance would spend half an hour clicking through settings pages for this.

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

The agent starts with `survey_box`, which returns the version, the FortiAI state, the registered MCP servers and the configured connectors in one call. It then healthchecks the connectors one by one and lists the modules. Every claim in the answer should point at one of those results.

## 2. You are done when

- The version and the FortiAI state match **Settings** > **System** on the box.
- Each "looks wrong" item names the tool result behind it, such as a healthcheck that came back `Disconnected`.
- The agent asked for no approvals: nothing on the box changed.
