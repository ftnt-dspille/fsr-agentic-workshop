---
title: Explore and Run Connectors
linkTitle: Explore + Run
weight: 10
description: "Discover what connectors the box has, what their operations expect, and run one."
---

A connector links FortiSOAR to an outside product, such as a firewall, a sandbox or a ticket system. In this page the agent lists the connectors on the box and runs one.

## 1. Discover

Give your agent this prompt:

```text
List the connectors installed on this box and tell me how many there are,
then name one that is configured and healthy (confirm it is healthy).
```

<!-- step: fsa09-01-discover-connectors -->

<!-- capture: fsa09-01-discover-connectors -->
![fsa09-01-discover-connectors](fsa09-01-discover-connectors.png?height=600px)

The agent lists the connectors. A configured connector shows a config count. It then runs a health check on the one it picks. `Available` means healthy.

**Verify the count in the UI:** open **Connectors** in the left navigation. The total shown there matches the number the agent reported.

<!-- capture: fsa09-01-discover-connectors-ui-count -->
![fsa09-01-discover-connectors-ui-count](fsa09-01-discover-connectors-ui-count.png?height=600px)

## 2. Run an operation

Give your agent this prompt. The built-in utilities connector is always on the box, so use it if nothing else fits.

```text
Run a harmless read-only operation on that connector and interpret the
result for me. If nothing fits, use the code-snippet or utilities
connector to evaluate 2+2 as a demonstration.
```

<!-- step: fsa09-02-run-operation -->

<!-- capture: fsa09-02-run-operation -->
![fsa09-02-run-operation](fsa09-02-run-operation.png?height=600px)

**You are done when:** the agent names the operation it chose, shows the parameters it sent, and explains the result in plain words. If a call fails, the error shows the HTTP method, the path and the response body. The agent should quote it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Health check says no config | The connector is installed but not configured | Pick a configured connector, or ask the agent to configure this one (next page) |
| Operation fails with a parameter error | Wrong parameter names | Ask the agent to list the operation's parameters with `list_connector_operations` |
