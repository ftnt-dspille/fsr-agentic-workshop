---
title: Register a Remote MCP Server
linkTitle: Register a Remote Server
weight: 20
description: "Prove remote MCP end to end: register a public server, allowlist it to one agent, and watch the agent use it."
---

This is the chapter's main lab: take a genuinely remote MCP server, register it with FortiSOAR, grant it to one agent with an explicit allowlist, and prove the agent can use it. In production the remote server is something like FortiSIEM's MCP endpoint; for the lab we use a public server that needs no credentials, so the whole loop runs against nothing but your box and the internet.

## 1. Pick the remote server

| Option | URL | Auth | Use when |
|---|---|---|---|
| DeepWiki (GitHub repo Q&A) | `https://mcp.deepwiki.com/mcp` | `none` | The box has internet reach - the default for this lab |
| A weather MCP server | your instructor provides one | varies | Classes that prefer a weather demo |
| FortiSIEM MCP endpoint | your FortiSIEM's MCP URL | `oauth2` | Your lab has a FortiSIEM - the production shape |

{{% notice note %}}
The box itself makes the MCP calls, so the URL must be reachable from the appliance, not from your laptop. A quick reachability check from the appliance CLI: `curl -sI https://mcp.deepwiki.com/mcp` should answer.
{{% /notice %}}

## 2. Validate, then register

<!-- step: fsa05-03-register-remote -->

Use the same validate-then-persist flow as the previous page: validation performs the real MCP handshake and lists the server's tools without saving anything; only then do you persist the row.

1. Open the AI configuration area and add an MCP server (kind: external).
2. Enter the name (`agentlab-deepwiki`), transport (`http`), the URL, and authentication type `none`.
3. Run **Validate** first. It must come back listing the server's tools (for DeepWiki: `read_wiki_structure`, `ask_question` and similar).
4. Save, note the server's UUID, and check its status shows healthy.

## 3. Grant it to one agent

<!-- step: fsa05-04-grant-allowlist -->

Pick one agent that calls tools. Open it from **Content Hub** > **AI Agents**, open the agent's detail panel, and switch to the **Configurations** tab. Under a **Custom Configuration** the UI gives that one agent three settings that decide how it behaves:

- **LLM Provider** - the reasoning profile the agent thinks with (for example `Low Reasoning`). This is where you choose the model that answers for this agent.
- **MCP Server** - the servers this agent may reach. Select the one you registered (`agentlab-deepwiki`) so this agent can call it. Agents can only use servers selected here.
- **Masking Agent** (optional) - a masking agent such as `IOC Masking` that scrubs indicators before data leaves for the LLM.

Select the server, pick an LLM Provider, and **Save**.

The grant is at the server level. An agent that does not list a server in the MCP Server field cannot call it, however healthy that server is. Which tools from a selected server the agent may call is set by the agent's own tool allowlist in its bundle, not in this panel. An agent with no allowlist in its bundle gets every tool from every server selected here, so for anything beyond a lab, pin an explicit allowlist in the bundle.

<!-- capture: fsa05-04-grant-allowlist-agent-config -->
![fsa05-04-grant-allowlist-agent-config](fsa05-04-grant-allowlist-agent-config.png?height=600px)

## 4. Prove a granted tool actually runs

Registration and validation already proved the remote server end to end: validation ran the real MCP handshake and listed the server's tools without saving anything. The last thing to see is a granted tool firing from a real question, with the trace to prove it.

Do this with an **in-domain** question. The AI Assistant chat runs on a domain-guarded agent: it answers security questions and declines anything off-domain before it ever reaches a tool, so a general-purpose remote server like DeepWiki is the wrong thing to ask it about. (That server is still proven, by the validation handshake above.) The chat already carries FortiSOAR's built-in SOC Framework server, whose `enrich_indicator` tool looks an indicator up against configured threat intelligence such as FortiGuard. Asking for an indicator's reputation is squarely in-domain, so the guard lets it through and you get to watch a real tool call.

<!-- step: fsa05-05-chat-runs-tool -->

Open any alert's detail page, open the AI Assistant, and ask for the reputation of an IP your box's FortiGuard feed currently rates (one tagged Malware CnC works well): "What is the reputation of the IP `<ip>`? Use your tools to enrich this indicator." The chat answers with the FortiGuard verdict, then open the trace to see the `enrich_indicator` tool call behind it.

<!-- capture: fsa05-05-chat-runs-tool-answer -->
![fsa05-05-chat-runs-tool-answer](fsa05-05-chat-runs-tool-answer.png?height=600px)

{{% notice note %}}
Live indicators age out. FortiGuard can de-list an IP, after which the chat will answer "no reputation available" for it. Refresh the example with a currently-rated IP from your own FortiGuard feed (Fortinet FortiGuard Threat Intelligence connector, Fetch Threat Intel Feeds) before running the lab.
{{% /notice %}}

**You are done when**

- The answer names the intelligence source (FortiGuard) and the indicator's verdict.
- The trace shows a `TOOL` call to the SOC Framework server's `enrich_indicator`, and the answer uses its result.
- Asking for a tool the agent was not granted, or an off-domain question, is refused.
- Every registered server's status page still shows healthy after the calls.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Validation finds no tools | The box cannot reach the URL, or the path is wrong | curl the URL from the appliance CLI; the path usually ends in /mcp |
| Validation ok, status failing | `authentication` stored as an object | Rewrite it as a JSON string (previous page) |
| Agent never calls the server | Server not selected for that agent | Select the server in the agent's Configurations tab (MCP Server) and save |
| Calls time out | Slow public server or egress proxy | Retry; check the appliance's proxy settings |

