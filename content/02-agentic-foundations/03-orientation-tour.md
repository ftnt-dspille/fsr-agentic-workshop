---
title: Orientation Tour
linkTitle: Orientation Tour
weight: 30
description: "A guided walk through the AI screens on your box: create an alert, confirm AI is on, read the agent catalog, the MCP servers and an SOP, and ask the assistant one question."
---

This tour creates one practice alert and asks the AI Assistant one read-only question about it. It changes nothing else on the box. Work through the steps in order. Each step shows you where a screen is, so you know where things are before chapter 3.

## 1. Create a practice alert

<!-- step: fsa02-00-create-alert -->

1. Open the **Alerts** module and choose **Add**.
2. In **Name**, enter a name you will recognize. Use `Agent Lab - orientation` and add a unique number at the end.
3. In **Source**, enter `edr-sensor-01`. In **Source ID**, enter `203.0.113.42`.
4. In **Description**, paste the JSON below. Chapter 3 reads the raw event from the alert. An alert with no event data gets only the generic DEFAULT SOP.

   ```json
   {
     "alert_type": "Suspicious Outbound Connection",
     "indicator": "203.0.113.42",
     "source": "edr-sensor-01",
     "severity_raw": "high"
   }
   ```

5. Leave **Status**, **Severity** and the other fields at their defaults.
6. Choose **Save**. Confirm the new alert appears in the list.

The form before you save looks like this:

<!-- capture: fsa02-00-create-alert -->
![fsa02-00-create-alert](fsa02-00-create-alert.png?height=600px)

## 2. Confirm AI is on

<!-- step: fsa02-01-ai-enabled -->

1. Look at the left navigation. Open the **AI Configurations** group.
2. Confirm there is no "AI feature not enabled" banner.
3. If you have permission, open **System** > **System Configuration** > **FortiAI**. The enablement switch and the token balance are there. Change nothing.

<!-- capture: fsa02-01-ai-enabled -->
![fsa02-01-ai-enabled](fsa02-01-ai-enabled.png?height=600px)

**You are done when**

- The AI area opens without an enablement banner.
- You can say where the token balance appears, or that your build does not show it.

{{% notice note %}}
Turning on AI features is an administrator task. If the banner appears, ask your box administrator to turn it on. Do not work around it.
{{% /notice %}}

## 3. Read the agent catalog

<!-- step: fsa02-02-agent-catalog manual: the catalog and its AI Agent filter are captured; reading each Triage and Insight agent LLM profile, MCP servers and masking setting is by hand -->

1. Open **Content Hub**, then **Discover**.
2. Under **Content Type**, tick **AI Agent**.
3. Under **Tags**, find the agents tagged **Triage** (used by investigations) and **Insight** (used by insights).

<!-- capture: fsa02-02-agent-catalog -->
![fsa02-02-agent-catalog](fsa02-02-agent-catalog.png?height=600px)

<!-- step: fsa02-02-agent-settings -->

4. Click **Alert Investigation**, then select its **Configurations** tab.
5. Note three settings:
   - **LLM Provider**: the model the agent reasons with.
   - **MCP Server**: the servers the agent may call.
   - **Masking Agent**: the agent that masks indicators before they reach the model.

<!-- capture: fsa02-02-agent-settings -->
![fsa02-02-agent-settings](fsa02-02-agent-settings.png?height=600px)

**You are done when**

- You can name the tag that routes an agent into an investigation, and the tag that routes it into insights.
- You can name the MCP servers that Alert Investigation uses.

## 4. Inspect the MCP servers

<!-- step: fsa02-03-mcp-servers -->

1. Open **AI Configurations**, then **MCP Servers**.
2. Find the four built-in servers and note what each one is for:
   - **FortiSOAR Module Management**: reads and writes records and modules.
   - **FortiSOAR Playbook Management**: runs playbooks and reports their status.
   - **SOC Framework**: alert and indicator tools.
   - **Utility Tools**: helper tools.

<!-- capture: fsa02-03-mcp-servers -->
![fsa02-03-mcp-servers](fsa02-03-mcp-servers.png?height=600px)

<!-- step: fsa02-03-mcp-server-detail -->

3. Click **SOC Framework**. Read its transport, its URL and its **Discovered Capabilities**. These are the tools the server exposes. Name one tool, such as **get_alert**.

<!-- capture: fsa02-03-mcp-server-detail -->
![fsa02-03-mcp-server-detail](fsa02-03-mcp-server-detail.png?height=600px)

Servers that someone registered also appear in this list. You register one yourself in chapter 5. If the names on your build differ, use the names the list shows.

**You are done when**

- You can name the built-in servers and what each one does.
- You can tell which servers are built in and which wrap a connector.
- You can open a server and name a tool it exposes.

## 5. Find the SOP records

A SOP (standard operating procedure) is the written rule your SOC uses for one alert type. Its **Questions** are what an investigation asks before it decides. Organization context holds the SOPs, the tool table and the approved activity that investigations read.

![Organization context: what goes in (SOPs per alert type, working hours and maintenance windows, approved systems, trusted networks and risk criteria) and how agents use it (retrieved per investigation, the SOP decides which questions get asked, approved activity rules out false positives)](diagram-organization-context.png)

<!-- step: fsa02-04-sop-compare -->

1. Open **AI Configurations**, then **Organizational Context**.
2. In the **Title** filter, type `SOP -`. The list shows the SOP records. Find **SOP - Malware Detection**.

<!-- capture: fsa02-04-sop-compare -->
![fsa02-04-sop-compare](fsa02-04-sop-compare.png?height=600px)

<!-- step: fsa02-04-sop-detail -->

3. Open **SOP - Malware Detection** and read its **Questions** list. These are the questions an investigation of that alert type asks. In chapter 3 you compare them with the questions the investigation actually writes.

<!-- capture: fsa02-04-sop-detail -->
![fsa02-04-sop-detail](fsa02-04-sop-detail.png?height=600px)

**You are done when**

- You can point to the place where an SOP's questions are stored.

## 6. Ask the assistant one read-only question

<!-- step: fsa02-05-assistant-readonly manual: a FortiAI chat turn; spends tokens; automated when SPEND_AI=1 -->

1. Open the alert you created in step 1. Use the AI Assistant on that alert.
2. Ask this question:

   ```text
   Summarize the source data on this alert and list the indicators it contains.
   Do not change anything.
   ```

<!-- capture: fsa02-05-assistant-readonly -->
![fsa02-05-assistant-readonly](fsa02-05-assistant-readonly.png?height=600px)

**You are done when**

- The assistant answers from the alert's data and does not invent indicators.
- You checked the alert afterward, and nothing on it changed.

{{% notice warning %}}
Keep this chapter read-only. Do not ask the assistant to block, close, assign or update anything on a shared box. Those changes come in chapter 3.
{{% /notice %}}

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The AI area is missing from the navigation | Your user has no AI permissions | Ask your administrator to give the workshop role AI read access |
| An enablement banner appears on every AI page | AI features are off | Ask your administrator to turn them on |
| The assistant invents indicators | The alert has little source data | Check that the Description holds the JSON, then ask again |
