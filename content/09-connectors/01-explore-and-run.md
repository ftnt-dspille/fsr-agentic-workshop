---
title: Explore and Run Connectors
linkTitle: Explore + Run
weight: 10
description: "Discover what connectors the box has, what their operations expect, and run one."
---

Connectors are FortiSOAR's hands: every firewall, sandbox and ticket system is reached through one. An agent that can discover and run them can chain real enrichment and response actions - which is exactly what the capstone needs.

## 1. Discover

Give your agent this prompt:

```text
List the connectors installed on this box and tell me how many there are,
then name one that is configured and healthy (confirm it is healthy).
```

<!-- step: fsa09-01-discover-connectors -->

The agent walks `list_connectors` (configured connectors show a config count) and `healthcheck_connector` (green is `Available`). The count it reports is read live from the box, so it is the real total - not a guess.

<!-- capture: fsa09-01-discover-connectors -->
![fsa09-01-discover-connectors](fsa09-01-discover-connectors.png?height=600px)

**Verify the count in the UI:** open **Connectors** in the left navigation (it opens Content Hub on the Connectors filter). The total shown there matches the number the agent reported.

<!-- capture: fsa09-01-discover-connectors-ui-count -->
![fsa09-01-discover-connectors-ui-count](fsa09-01-discover-connectors-ui-count.png?height=600px)

## 2. Run an operation

Give your agent this prompt (adapt the connector to what your box has - the built-in utilities connector is always there):

```text
Run a harmless read-only operation on that connector and interpret the
result for me. If nothing fits, use the code-snippet or utilities
connector to evaluate 2+2 as a demonstration.
```

<!-- step: fsa09-02-run-operation -->

**You are done when:** the agent names the operation it chose, shows the params it sent, and interprets the `data` payload rather than dumping it. A failed call is also a success for learning: the error dict carries the HTTP method, path and response body, which the agent should quote when explaining what went wrong.

<!-- capture: fsa09-02-run-operation -->
![fsa09-02-run-operation](fsa09-02-run-operation.png?height=600px)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| healthcheck says no-config | Connector installed but never configured | Pick another, or configure it (the agent can: default_connector_config then upsert_connector_configuration) |
| Operation fails with a params error | Wrong parameter names | list_connector_operations shows each operation's exact parameter names and types |
| run_connector_operation returns empty data | Some connectors are fire-and-forget | Not a failure; check the connector's own logs or pick a synchronous operation |
