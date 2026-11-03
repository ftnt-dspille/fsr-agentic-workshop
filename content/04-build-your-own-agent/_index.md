---
title: Build Your Own Agent
linkTitle: 4. Build Your Own Agent
weight: 40
description: "Part 1 (advanced, optional): package a FortiAI agent as a code bundle, route questions to it with the tool table, and invoke it from a playbook."
---

{{% notice note %}}
Advanced and optional. This chapter packages a FortiAI agent as a code bundle and wires it into the platform. It is the steepest part of Part 1 and is not needed for the rest of the workshop. Skip it on a first pass if you only want to use the built-in agents.
{{% /notice %}}

This chapter packages a small FortiAI agent, uploads it, routes an investigation to it and calls it from a playbook. The agent itself makes no LLM calls. Only the investigation test on the Package and Route page spends tokens.

{{% children %}}
