---
title: MCP and Server Registration
linkTitle: MCP and Registration
weight: 10
description: "Register an external MCP server with FortiSOAR: fill in the form, test the connection, save, then check its status."
---

The Model Context Protocol (MCP) is how an agent calls tools that live outside it. A server lists its tools, and the agent calls them by name. FortiSOAR agents can use three kinds of MCP server. This chapter registers an external one: a server that another product or person runs, which you add to FortiSOAR by its URL.

## 1. Know the three kinds of server

![Three kinds of MCP server: native FortiSOAR MCP (built in, no setup, records, modules, SOC framework and playbooks), external MCP servers (register any server with an auth type, for example FortiSIEM incidents, assigned per agent) and connector-based MCP (turn any installed connector into a server where each action becomes a tool)](diagram-mcp-three-types.png)

The three kinds are the built-in FortiSOAR servers, external servers that you register, and connector-based servers built from installed connectors. This chapter registers an external server.

## 2. Choose the transport and authentication

- **Transport Type:** **http**. It is the only option on this build.
- **Authentication Type:** **None** for DeepWiki, a public server with no credentials. Other types are for servers that need a token or an OAuth login. Pick the type your server documents.

If a server needs a token, paste it into the form only. Never put a token in a file you commit.

## 3. Register the server

<!-- step: fsa05-01-validate-register -->

Open **AI Configurations** > **MCP Servers**, then click **Connect MCP Server**. The form is titled **Connect New MCP Server**. Fill in:

- **Server Name:** `agentlab-deepwiki`
- **Description:** `Lab: DeepWiki remote server (public, no credentials)`
- **Transport Type:** **http**
- **URL:** `https://mcp.deepwiki.com/mcp`
- **Authentication > Type:** **None**

Leave **Verify SSL** unchecked, as in the picture.

<!-- capture: fsa05-01-validate-register-connect-form -->
![fsa05-01-validate-register-connect-form](fsa05-01-validate-register-connect-form.png?height=600px)

1. Click **Test Connection**. It connects to the server and lists the server's tool names.
2. When **Save** turns on, click **Save**. Save stays off until the test passes.

Do not use **Create MCP Server**. It opens a different dialog, with a configuration selector.

**You are done when**

- The test lists the server's tool names.
- After you save, `agentlab-deepwiki` appears in the MCP Servers list.

## 4. Check the status

<!-- step: fsa05-02-status-check -->

In the MCP Servers list, find `agentlab-deepwiki`. The **Active** column shows a green check when a server is healthy. Check that a built-in server, such as **Utility Tools**, also shows a green check.

<!-- capture: fsa05-02-status-check-servers-page -->
![fsa05-02-status-check-servers-page](fsa05-02-status-check-servers-page.png?height=600px)

**You are done when**

- `agentlab-deepwiki` shows a green check in the Active column.
- The built-in servers still show a green check.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Test Connection says it cannot connect | The URL is wrong, or the box cannot reach the server | Check the URL. The box, not your laptop, makes this call. Check the appliance's proxy settings. |
