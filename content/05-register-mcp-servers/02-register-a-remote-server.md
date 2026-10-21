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

<!-- step: fsa05-03-register-remote manual -->

Registration is a validate-then-persist flow: validation performs the real MCP handshake and lists the server's tools without saving anything; only then do you persist the row.

1. Open the AI configuration area and add an MCP server (kind: external).
2. Enter the name (`deepwiki`), transport (`http`), the URL, and authentication type `none`.
3. Run **Validate** first. It must come back listing the server's tools (for DeepWiki: `read_wiki_structure`, `ask_question` and similar).
4. Save, note the server's UUID, and check its status shows healthy.

{{% notice warning %}}
If your build takes the registration over the API, the `authentication` field must be a JSON string, not an object - an object corrupts the status route for every registered server. The previous page covers the rule and the repair.
{{% /notice %}}

## 3. Grant it to one agent with an allowlist

<!-- step: fsa05-04-grant-allowlist manual -->

Pick one agent that can call tools. Add the server to that agent's allowlist and name only the read tools you want it to have. Save the agent configuration.

The allowlist behaves in three ways. Know them before you rely on it:

- A server that no agent lists is not filtered for any agent that can see it. A new server is not restricted by existing allowlists, so grant it explicitly (NLV-05-10).
- An agent with no allowlist gets every tool from every server it is configured with. Always write an explicit allowlist.
- An empty tool list for a server means the agent gets no tools from it.

<!-- capture: fsa05-02-agent-allowlist -->
![fsa05-02-agent-allowlist](fsa05-02-agent-allowlist.png)

## 4. Prove it through the agent

<!-- step: fsa05-05-agent-uses-remote manual -->

Ask the granted agent a question only the remote server can answer (for DeepWiki: "Using your tools, what does the modelcontextprotocol/python-sdk repository say FastMCP is called in v2?"). Then open the agent's trace.

**What success looks like**

- The trace shows a tool call routed to the registered server, and the answer uses its result.
- Asking for a tool the allowlist does not name is refused.
- The server's status page still shows healthy after the calls.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Validation finds no tools | The box cannot reach the URL, or the path is wrong | curl the URL from the appliance CLI; the path usually ends in /mcp |
| Validation ok, status failing | `authentication` stored as an object | Rewrite it as a JSON string (previous page) |
| Agent never calls the server | Not in that agent's allowlist | Grant the server and tools explicitly to the agent you are testing |
| Calls time out | Slow public server or egress proxy | Retry; check the appliance's proxy settings |

<!-- NLV: NLV-05-01, NLV-05-04, NLV-05-05, NLV-05-10 -->
