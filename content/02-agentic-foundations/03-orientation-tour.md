---
title: Orientation Tour
linkTitle: Orientation Tour
weight: 30
description: "A guided walk through the AI screens on your box: create an alert, confirm AI is on, read the agent catalog, the MCP servers and an SOP, and ask the assistant one question."
---

This tour creates one practice alert and asks the AI Assistant a read-only question about it. The goal is to know where things are before chapter 3 starts writing alert fields.

## 1. Create an alert in the UI

<!-- step: fsa02-00-create-alert -->

Open the **Alerts** module and choose **Add**. Fill in the alert form:

- **Name:** a recognizable practice name, such as `Agent Lab - orientation` plus a unique suffix
- **Description:** the JSON source payload from the example below
- **Source:** `edr-sensor-01`
- **Source ID:** `203.0.113.42`
- Leave **Status**, **Severity**, and **Type** at their defaults for this first alert.

Review the fields, choose **Save**, and confirm the new alert appears in the list.

<!-- capture: fsa02-00-create-alert -->
![fsa02-00-create-alert](fsa02-00-create-alert.png?height=600px)

This screenshot shows the form before saving. The example uses the documentation-only `203.0.113.0/24` range, so the value is safe to reproduce in a public workshop.

## 1.1 Create the remaining practice data

Investigations need an alert with source data. Without it, the alert gets the generic `DEFAULT` SOP, and an SOP for its alert type never applies.

{{% notice warning %}}
An alert created by hand, or through the API, with no raw source data always gets the `DEFAULT` SOP. Type-specific SOPs only apply when the alert carries its source JSON. Put the raw payload in the alert's **source data** field when you create it, or the SOP exercise in chapter 3 will not show what you expect.
{{% /notice %}}

Create three to five alerts before chapter 3. Repeat the same **Add** flow and vary the name, type, source, and source ID. Use realistic-looking values like the example below:

```json
{
  "alert_type": "Suspicious Outbound Connection",
  "indicator": "203.0.113.42",
  "source": "edr-sensor-01",
  "severity_raw": "high"
}
```

Vary the values across your alerts (a different indicator and type each time). Include **one** alert with no source data at all: you will use it in chapter 3 to show the `DEFAULT` SOP behavior.

{{% notice note %}}
Chapter 3 also asks you to investigate an alert whose indicator a threat-intel feed will actually rate as malicious. A documentation-range address like the one above will not resolve in any feed, so for that step use a known-bad indicator your instructor supplies, or one from a reputation source your box is configured to query.
{{% /notice %}}

## 2. Confirm AI is on

Open the AI Configurations group of the left navigation and read what it shows. It holds MCP Servers, Prompts, Organizational Context and Insights. The agent catalog is not in this group; it is in the Content Hub (step 3).

<!-- step: fsa02-01-ai-enabled -->

1. Look for the AI Configurations group in the left navigation.
2. Confirm there is no "AI feature not enabled" banner. The enablement switch and the token balance are under **System** > **System Configuration** > **FortiAI**, not in the AI Configurations group.
3. If a token balance is shown there, note it. Do not change any setting.

<!-- capture: fsa02-01-ai-enabled -->
![fsa02-01-ai-enabled](fsa02-01-ai-enabled.png?height=600px)

**What success looks like**

- The AI area opens without an enablement banner.
- You can say where the token balance appears, or that it is not shown on your build.

{{% notice note %}}
Enabling AI features is an administrator task. If the banner appears, ask your instructor or box administrator to enable it. Do not work around it.
{{% /notice %}}

## 3. Read the agent catalog

<!-- step: fsa02-02-agent-catalog manual: the catalog and its AI Agent filter are captured; reading each Triage and Insight agent LLM profile, MCP servers and masking setting is by hand -->

Open the **Content Hub**, go to **Discover**, and tick **AI Agent** under Content Type. The catalog lists the shipped AI agents; the total varies by build. Filter by tag, then open one agent tagged `Triage` and one tagged `Insight`. For each, write down:

- the LLM profile it points to
- the MCP servers it is allowed to use
- its masking setting

<!-- capture: fsa02-02-agent-catalog -->
![fsa02-02-agent-catalog](fsa02-02-agent-catalog.png?height=600px)

**What success looks like**

- You can say which tag routes an agent into an investigation and which routes it into insights.
- You can name the MCP servers one `Triage` agent uses.

## 4. Inspect the MCP servers

<!-- step: fsa02-03-mcp-servers -->

Open the MCP servers list under AI Configurations. Identify the built-in servers and say what each one is for. A fresh 8.0.1 box lists the four built-in families, all active and all on the HTTP transport:

- **FortiSOAR Module Management**: reads and writes records and modules.
- **FortiSOAR Playbook Management**: runs playbooks and reports their status.
- **SOC Framework**: alert and indicator tools.
- **Utility Tools**: helper tools.

Any external or connector-backed server someone has registered (for example a FortiSIEM endpoint, or a public docs server like deepwiki) shows up in this same list. You register one yourself in chapter 5.

<!-- capture: fsa02-03-mcp-servers -->
![fsa02-03-mcp-servers](fsa02-03-mcp-servers.png?height=600px)

**What success looks like**

- You can name the built-in servers and their purpose.
- You can tell which servers are built in and which wrap a connector.

If the names on your build differ, use what the list shows.

## 5. Compare an SOP with the planner

Organization context is your SOC's own knowledge: the SOPs, working hours and approved activity an investigation reads before it calls anything malicious. It is retrieved per investigation, not baked into the model, which is why the same inputs produce the same reasoning on your box.

![Organization context: what goes in (SOPs per alert type, working hours and maintenance windows, approved systems, trusted networks and risk criteria) and how agents use it (retrieved per investigation, the SOP decides which questions get asked, approved activity rules out false positives)](diagram-organization-context.png)

<!-- step: fsa02-04-sop-compare -->

Open the organizational context records for investigation SOPs. Find the `DEFAULT` SOP, and one SOP for an alert type. Read the question lists they contain.

You will compare these with the questions the planner actually writes in chapter 3. Come back to this step then.

**What success looks like**

- You can point to where an SOP's questions are stored.
- You understand that SOP lookups are exact and case-sensitive. A subcategory that differs in case from the alert type does not match.

If you cannot find the SOP records under the AI configuration area, check the list view for the organizational context module.

<!-- capture: fsa02-04-sop-compare -->
![fsa02-04-sop-compare](fsa02-04-sop-compare.png?height=600px)

## 6. Ask the assistant a read-only question

<!-- step: fsa02-05-assistant-readonly manual: a FortiAI chat turn; spends tokens; automated when SPEND_AI=1 -->

Open the alert you created in step 1. Use the AI Assistant on that alert and ask a question that only reads data, such as:

```text
Summarize the source data on this alert and list the indicators it contains.
Do not change anything.
```

Then ask one multi-step read-only question, such as asking for the alert's related records and their status. This is a chat exercise. It is not an orchestrator run.

**What success looks like**

- The assistant answers from the alert's data, without inventing indicators.
- You checked the alert afterward and nothing on it changed.

<!-- capture: fsa02-05-assistant-readonly -->
![fsa02-05-assistant-readonly](fsa02-05-assistant-readonly.png?height=600px)

{{% notice warning %}}
Keep this chapter read-only. Do not ask the assistant to block, close, assign or update anything on a shared box. Chapter 3 is where alerts start to change.
{{% /notice %}}

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| AI area missing from the navigation | Your user lacks AI permissions | Ask your administrator to grant the workshop role AI read access |
| Enablement banner on every AI page | AI features are off | Ask your administrator to enable them |
| SOP looks empty or wrong | The alert has no source data, or the subcategory does not match exactly | Add source JSON to the alert, and check the subcategory spelling and case |
| Assistant invents indicators | The alert has little source data | Add the source payload and ask again |
| Assistant ignores the alert | Question did not name the alert | Name the alert by its title or identifier |

