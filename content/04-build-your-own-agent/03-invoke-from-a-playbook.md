---
title: Invoke an Agent from a Playbook
linkTitle: Invoke from a Playbook
weight: 30
description: "Call your agent from a playbook through a supported route, choose the route by the kind of agent, and branch on its answer."
---

A playbook is where an agent's answer turns into action. This page covers the three routes, which one to use, and how to branch on the result. The rule: call an agent through a route that authenticates as a user, and put any write after a manual-input step.

## 1. Know the options

| Route | How it calls the agent | Works for | Notes |
|---|---|---|---|
| A. Remote FortiSOAR connector, **Invoke AI Agent** operation | The connector's `invoke_agent` operation calls the agent with two parameters, `agent_name` and a JSON `body` (the agent's input), and returns its answer synchronously. It authenticates as the connector's configured login. | Reasoning agents and tool-using agents, with that login's rights | This is the supported route on 8.0.1. The shipped **Invoke Agent** sample playbook (tagged `#Remote FortiSOAR`) is a ready template. Configure the connection with a real user login, not an API key. |
| B. Utility API call with HMAC | The "Make FortiSOAR API Call" step calls the agent's trigger route, authenticated with HMAC | Reasoning-only agents, with no MCP tools | The trigger route is asynchronous: a single call returns a `task_id`, not the answer, so you poll for the result. An agent that needs MCP tools gets an authorization failure from the built-in servers. |
| C. Starting a full alert investigation through the HMAC route | The same HMAC call, but it starts an investigation | Nothing reliable | The investigation runs without FortiSOAR tools, and the verdict is never written back. Do not use this route for investigations. |

{{% notice warning %}}
Do not modify a connector package to call an agent. The stock Remote FortiSOAR connector already ships the **Invoke AI Agent** (`invoke_agent`) operation, and a modified package is unsupported and can break on upgrade.
{{% /notice %}}

{{% notice note %}}
**What about the chat assistant?** The FortiAI chat answers by calling its own tools; it has no "run agent X" control, so typing your agent's name into the chat does not invoke it. The chat reaches agents only indirectly: in plan mode it hands the request to the orchestrator, which plans and runs installed agents and pauses for approval on writes; and an alert investigation routes questions to `Triage`-tagged agents through the tool table (previous page). To invoke *your specific* agent on demand, use a playbook (this page) or the trigger API, not the chat box.
{{% /notice %}}

## 2. Follow the teaching path

Work through the routes in this order:

1. Build the call through **route A**, the Remote FortiSOAR connector's **Invoke AI Agent** operation. It returns the agent's answer in one step, so you can branch on it directly. This is the route most agents should use.
2. For a **reasoning-only** agent that has no connector configured, try **route B**, the raw trigger API. Note its shape first: the trigger route is asynchronous, so a single call returns a `task_id`, not the answer, and you poll for the result. Route B also cannot reach an agent that needs MCP tools.
3. Only after that, try an agent that uses a read-only tool, through route A.

## 3. Build the playbook and branch on the answer

Build a playbook in the playbook designer. The trigger is up to you. A common shape is:

1. A trigger that starts on a record event, or a manual trigger while you test.
2. A call to your agent through route A, the **Invoke AI Agent** operation. It takes two parameters:
   - `agent_name`: the agent's `name`, for example `workshop_hello_agent`.
   - `body`: a JSON string of the agent's input, matching its `inputformat`, for example `{"entity": "host-01.example.com"}`. The shipped **Invoke Agent** sample calls `ioc-enrichment` with `{"question": "...", "ioc": [{"value": "203.0.113.42", "type": "IP Address"}]}`, so shape `body` to the agent you are calling.
3. A **Decision** step that branches on the returned value. The operation returns the answer synchronously under `data`, so branch on `{{ vars.steps.<step name>.data.confidence }}` or `data.answer`.
4. A manual-input step before any change, so a person approves it.
5. The change itself, only on the approved branch.

<!-- step: fsa04-04-playbook-branch -->

The playbook below calls the hello agent, then a Decision step routes on its `confidence`. Because the hello agent always returns `low`, the run takes the Low confidence branch (Needs Review) and skips Auto Close.

<!-- capture: fsa04-04-playbook-branch-decision -->
![fsa04-04-playbook-branch-decision](fsa04-04-playbook-branch-decision.png?height=600px)

**You are done when**

- The Invoke AI Agent step returns the agent's answer under `data`, with `status` `Success`.
- The Decision step takes the branch that matches the `confidence` value the agent returned.
- The connection is configured with a user login, not an API key.

## 4. Route B: the raw trigger API

<!-- step: fsa04-05-playbook-route-b -->

Route B calls the agent's trigger route directly from a **Make FortiSOAR API Call** step, authenticated with HMAC. Use it only for a reasoning-only agent that has no connector configured, and that needs no MCP tools.

The trigger route is **asynchronous**. One call to `POST /ai/agents/{agent_name}/trigger` returns `202` with a `task_id`, not the answer. Add two more steps: poll `GET /ai/agents/{task_id}/status` until it reads `completed`, then read `GET /ai/agents/{task_id}/result`. An agent that needs MCP tools fails authorization against the built-in servers on this route, so route A is the better default.

**You are done when**

- The trigger step returns a `task_id`.
- A later step reads the result once the status is `completed`.
- An agent that needs tools fails here, which is the limit route B is meant to show.

## 5. Check the upgrade path

<!-- step: fsa04-06-replace-check -->

An upgrade can keep an agent's configuration but overwrite its code. Test that before you rely on a replaced agent.

Re-import the agent with replace. Note its ID before and after. Check that its allowlist and agent configuration are still in place. Run the playbook again.

**You are done when**

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

