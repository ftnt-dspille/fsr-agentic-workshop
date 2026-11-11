---
title: Register a Remote MCP Server
linkTitle: Register a Remote Server
weight: 20
description: "Check a remote server's tools, grant the server to one agent, and run one of its tools from the AI Assistant."
---

In this page you check the DeepWiki server's tools, grant the server to one agent, and then run a tool from the AI Assistant chat.

## 1. Know the server

The lab uses DeepWiki, a public MCP server that answers questions about GitHub repositories. It needs no credentials. Your box calls the server, so the box needs internet access.

You can register a different remote server, such as a FortiSIEM MCP endpoint, the same way. Use that server's URL and authentication type.

## 2. Check the tools

<!-- step: fsa05-03-register-remote -->

You saved the server on the previous page. Now check the connection a second time, in a dialog with a different name. The name `agentlab-deepwiki` is already taken.

1. Click **Connect MCP Server**.
2. Enter the name `agentlab-deepwiki-validate`. Use the same URL, Transport Type `http` and Authentication > Type `None`.
3. Click **Test Connection**. Wait until **Save** turns on.
4. Click **Cancel**. Do not click **Save**.

<!-- capture: fsa05-03-register-remote-validate -->
![fsa05-03-register-remote-validate](fsa05-03-register-remote-validate.png?height=600px)

Open the MCP Servers list. Find `agentlab-deepwiki`. Its Transport column shows `http`. The validation name does not appear in the list.

<!-- capture: fsa05-03-register-remote-saved -->
![fsa05-03-register-remote-saved](fsa05-03-register-remote-saved.png?height=600px)

Click `agentlab-deepwiki` to open it. Under **Discovered Capabilities**, the panel lists the tools the server returned. For DeepWiki these include `read_wiki_structure`, `read_wiki_contents` and `ask_wiki_question`. You grant the server to an agent in the next section.

<!-- step: fsa05-03-register-remote-tools -->
<!-- capture: fsa05-03-register-remote-tools -->
![fsa05-03-register-remote-tools](fsa05-03-register-remote-tools.png?height=600px)

## 3. Grant it to one agent

<!-- step: fsa05-04-grant-allowlist -->

1. Open **Content Hub** > **AI Agents**, then open an agent that calls tools. For example, use **Alert Investigation**.
2. Open the agent's detail panel and click the **Configurations** tab.
3. Set **Configuration Type** to **Custom Configuration**. Then set:
   - **Name:** `Agent Lab DeepWiki`
   - **LLM Provider:** the profile that answers for this agent, for example `Low Reasoning`.
   - **MCP Server:** keep the four built-in servers selected (**FortiSOAR Module Management**, **FortiSOAR Playbook Management**, **Utility Tools** and **SOC Framework**), and add `agentlab-deepwiki`. A custom configuration replaces the agent's default server list, and the agent can use only the servers selected here.
   - **Masking Agent** (optional): for example `IOC Masking`, which hides indicators before data goes to the LLM.
4. Click **Save**.

The grant gives the agent every tool that the server offers. For anything beyond the lab, pin a tool allowlist in the agent's bundle.

{{% notice warning %}}
Do not leave **SOC Framework** out. Alert Investigation uses it to write its verdict and summary back to the alert. Without it, investigations still finish and show a verdict on the AI Investigation tab, but the alert's **AI Verdict** field stays **Not Investigated**, and no error is shown.
{{% /notice %}}

<!-- capture: fsa05-04-grant-allowlist-agent-config -->
![fsa05-04-grant-allowlist-agent-config](fsa05-04-grant-allowlist-agent-config.png?height=600px)

## 4. Run a tool from the chat

<!-- step: fsa05-05-chat-runs-tool -->

The AI Assistant answers security questions only, and it declines other questions. It already has FortiSOAR's built-in SOC Framework server, whose `enrich_indicator` tool looks up an indicator in threat intelligence. So this check uses that tool, not DeepWiki. This question uses FortiAI credits.

### Before you start: configure the VirusTotal connector

The enrichment playbooks the box ships answer IP questions with VirusTotal, and the VirusTotal connector needs an API key. The key is free.

1. Create a free account at [virustotal.com](https://www.virustotal.com) and copy the API key from your profile.
2. Open **Content Hub**, search **VirusTotal**, open the connector, and select **CONFIGURE**.
3. Paste your API key, leave the server URL as offered, and save. The health check turns **Available**.

<!-- step: fsa05-04b-virustotal-config -->
<!-- capture: fsa05-04b-virustotal-config -->
![fsa05-04b-virustotal-config](fsa05-04b-virustotal-config.png?height=600px)

{{% notice note %}}
Live verdicts age out. If the answer says "no reputation available", pick an IP that VirusTotal currently rates as malicious, for example a known command-and-control address.
{{% /notice %}}

1. Open any alert's detail page.
2. Open the **AI Assistant**.
3. Ask: `What is the reputation of the IP <ip>? Use your tools to enrich this indicator.` Replace `<ip>` with a rated IP, for example a known command-and-control address.
4. Read the answer. It names VirusTotal and gives a verdict.
5. Open the trace for the answer. Find the `enrich_indicator` tool call.

<!-- capture: fsa05-05-chat-runs-tool-answer -->
![fsa05-05-chat-runs-tool-answer](fsa05-05-chat-runs-tool-answer.png?height=600px)

**You are done when**

- The answer names VirusTotal and gives the indicator's verdict.
- The trace shows a `TOOL` call to `enrich_indicator` on the SOC Framework server, and the answer uses its result.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Validation finds no tools | The box cannot reach the URL, or the path is wrong | The path usually ends in `/mcp`. Check that the box can reach `https://mcp.deepwiki.com/mcp`. |
| Agent never calls the server | The server is not selected for that agent | Select it under **MCP Server** in the agent's Configurations tab, then save |
| Calls time out | The public server is slow, or an egress proxy blocks the call | Retry. Check the appliance's proxy settings. |
