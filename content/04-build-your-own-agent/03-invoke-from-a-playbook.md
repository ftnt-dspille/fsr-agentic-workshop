---
title: Invoke an Agent from a Playbook
linkTitle: Invoke from a Playbook
weight: 30
description: "Call your agent from a playbook through a supported route, choose the route by the kind of agent, and branch on its answer."
---

A playbook is where an agent's answer turns into action, so the way the playbook calls the agent matters. This page explains the three routes, which one to use, and how to branch on the result. The rule is simple: a playbook should call an agent through a route that authenticates as a user, and any write should come after a manual-input step.

## 1. Know the options

| Route | How it calls the agent | Works for | Notes |
|---|---|---|---|
| A. Remote FortiSOAR connector, **Invoke AI Agent** operation | The connector's `invoke_agent` operation calls the agent with two parameters, `agent_name` and a JSON `body` (the agent's input), and returns its answer synchronously. It authenticates as the connector's configured login. | Reasoning agents and tool-using agents, with that login's rights | This is the supported route on 8.0.1. The shipped **Invoke Agent** sample playbook (tagged `#Remote FortiSOAR`) is a ready template. Configure the connection with a real user login, not an API key. |
| B. Utility API call with HMAC | The "Make FortiSOAR API Call" step calls the agent's trigger route, authenticated with HMAC | Reasoning-only agents, with no MCP tools | An agent that needs MCP tools gets an authorization failure from the built-in servers. |
| C. Starting a full alert investigation through the HMAC route | The same HMAC call, but it starts an investigation | Nothing reliable | The investigation runs without FortiSOAR tools, and the verdict is never written back. Do not use this route for investigations. |

{{% notice warning %}}
Do not hand-roll an agent action by modifying a connector package. You do not need to: the stock Remote FortiSOAR connector already ships the **Invoke AI Agent** (`invoke_agent`) operation. A modified package is unsupported and can break on upgrade. Use route A (the stock operation) for most agents, and route B for a reasoning-only agent with no connector configured.
{{% /notice %}}

{{% notice note %}}
**What about the chat assistant?** The FortiAI chat answers by calling its own tools; it has no "run agent X" control, so typing your agent's name into the chat does not invoke it. The chat reaches agents only indirectly: in plan mode it hands the request to the orchestrator, which plans and runs installed agents and pauses for approval on writes; and an alert investigation routes questions to `Triage`-tagged agents through the tool table (previous page). To invoke *your specific* agent on demand, use a playbook (this page) or the trigger API, not the chat box.
{{% /notice %}}

## 2. Follow the teaching path

Work through the routes in this order:

1. Start with a **reasoning-only** agent. It needs no MCP tools, so route B will work for it. Run it through route B to see the limit clearly: route B cannot reach an agent that needs tools.
2. Then call the same agent through route A, the Remote FortiSOAR connector's **Invoke AI Agent** operation.
3. Only after that, try an agent that uses a read-only tool, through route A.

## 3. Build the playbook

Build a playbook in the playbook designer. The trigger is up to you. A common shape is:

1. A trigger that starts on a record event.
2. A call to your agent, through route B for the reasoning-only agent.
3. A branch on the agent's `confidence` or `answer` value.
4. A manual-input step before any change, so a person approves it.
5. The change itself, only on the approved branch.

<!-- step: fsa04-04-playbook-route-b manual: invokes the lab agent from a playbook; spends tokens -->

Build the reasoning-only agent call through route B. Run the playbook against a seeded alert. Open the run and read the agent's returned fields.

<!-- capture: fsa04-03-playbook-branch -->
![fsa04-03-playbook-branch](fsa04-03-playbook-branch.png)

**What success looks like**

- The run completes and the agent's `answer` and `confidence` are visible in the step's output.
- The branch takes the path you set for the confidence value you got.

## 4. Repeat through route A

Now build the same call through the Remote FortiSOAR connector's **Invoke AI Agent** operation. Start from the shipped **Invoke Agent** sample playbook, or add an `invoke_agent` step yourself. It takes two parameters:

- `agent_name`: the agent's `name`, for example `workshop_hello_agent`.
- `body`: a JSON string of the agent's input, matching its `inputformat`, for example `{"entity": "host-01.example.com"}`. The sample playbook calls `ioc-enrichment` with `{"question": "...", "ioc": [{"value": "203.0.113.42", "type": "IP Address"}]}`, so shape `body` to the agent you are calling.

The operation returns the agent's answer synchronously under `data`: `{"answer": ..., "confidence": ..., "evidence": [...]}`. Branch on `data.confidence` or `data.answer`.

<!-- step: fsa04-05-playbook-route-a manual: invokes the lab agent from a playbook; spends tokens -->

**What success looks like**

- The agent's answer comes back in the step's `data`, with `status` `Success`.
- The connection is configured with a user login, not an API key.

## 5. Check the upgrade path

An upgrade can keep an agent's configuration but overwrite its code. Test that before you rely on a replaced agent.

<!-- step: fsa04-06-replace-check manual: re-imports the agent with replace and re-runs the playbook; the re-run may call FortiAI -->

Re-import the agent with replace. Note its ID before and after. Check that its allowlist and agent configuration are still in place. Run the playbook again.

**What success looks like**

- The playbook still calls the agent and gets an answer.
- You recorded whether the agent ID changed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Route B returns an authorization error for an agent | The agent needs MCP tools, and route B cannot authenticate to them | Use route A, or choose a reasoning-only agent for route B |
| Route A rejects the connector | The connector uses an API key, not a user login | Reconfigure it with a user login |
| No `invoke_agent` operation in the connector | The Remote FortiSOAR connector is missing or is an older version | Install or update the Remote FortiSOAR connector (the operation ships in 2.1.0); until then use route B |
| Branch always takes the default path | The branch reads a field that is not in the output | Read the actual output of the step and branch on that field |
| Investigation started from a playbook has no verdict | Started through the HMAC route | Start investigations through a user-authenticated route, and check the write-back |
| Agent gone after replace | The agent was replaced and its ID changed | Re-link the playbook step to the new ID |

