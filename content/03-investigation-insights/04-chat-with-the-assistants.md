---
title: Chat with the Assistants
linkTitle: Chat with the Assistants
weight: 40
description: "FortiSOAR has two chat surfaces on a record: Fortinet's built-in FortiAI assistant for questions, and the Agentic Assistant for conversational triage that stops at an approval before it changes anything."
---

The investigation on page 1 runs as a pipeline: you start it and read the result. FortiSOAR also has two **chat** surfaces. You type, the assistant answers, and you steer the next turn. This page shows both on the same alert, so you can see what each one is for.

| | FortiAI (Fortinet, built in) | Agentic Assistant (this lab's) |
|---|---|---|
| Launcher title | **AI Assistant** | **Agentic Assistant** |
| Ships with | FortiSOAR | The `connector-fsr-agentic-assistant` connector and its widget, installed on the lab box. It uses FortiAI only as its language model |
| Best for | Questions: security concepts, how-to, Jinja, indicator lookups through its tools | Triage of the open record: it searches, enriches, and writes a verdict card with its evidence |
| Can it change data? | Only through the tools its agent is granted (chapter 5) | Never directly: every write stops on an approval card for you to accept or reject |
| Where a lead watches it | The agent's trace (chapter 3, page 1) | The **Agentic Assistant Monitor** dashboard |

Both spend FortiAI tokens: the Agentic Assistant runs its model through the same FortiAI service.

## 1. Find the two launchers

Open the alert **Agent Lab - beaconing from web-server-01**. Two round icons sit on the right edge of the record page. They look alike, so hover over each one and read its title: **AI Assistant** and **Agentic Assistant**.

<!-- step: fsa03-20-assistant-launchers -->

<!-- capture: fsa03-20-assistant-launchers -->
![fsa03-20-assistant-launchers](fsa03-20-assistant-launchers.png?height=600px)

A role without **Widgets: Read** sees neither launcher. Ask your administrator if they are missing.

## 2. Ask the AI Assistant a question

The AI Assistant is the built-in question-and-answer drawer. Its header shows the tokens the conversation has used so far, and **Quick Prompts** offers starter questions. In chapter 5 you used it to run a tool on a registered MCP server.

1. Click the **AI Assistant** launcher.
2. Ask a general question, for example: `What does regular low-volume HTTPS beaconing to one external IP usually indicate, and what should I check first?`
3. Read the answer and the token count in the header.

<!-- step: fsa03-21-ai-assistant-answer manual: a FortiAI chat turn; spends tokens -->

The AI Assistant is good at concepts and how-to. For a verdict on this specific alert, use the Agentic Assistant (next section) or the investigation from page 1.

## 3. Triage the alert with the Agentic Assistant

The Agentic Assistant works on the record it is opened on. The widget sends the record as the conversation's context, so you never paste the alert in.

1. Click the **Agentic Assistant** launcher. Click **New** to start a fresh conversation.
2. Ask: `Triage this alert. Give me a verdict and the evidence behind it.`
3. Watch the steps appear while it works: each tool call is listed with its duration, and a failed call is marked **failed** rather than hidden.

<!-- step: fsa03-22-agentic-assistant-triage -->

<!-- capture: fsa03-22-agentic-assistant-triage -->
![fsa03-22-agentic-assistant-triage](fsa03-22-agentic-assistant-triage.png?height=600px)

Read the verdict card from top to bottom:

- **Disposition, severity and confidence.** For example *Needs more info*, *High severity*, *25% confidence*.
- **Findings.** Each finding carries chips that link it to the tool calls behind it. A claim without a chip has no evidence.
- **Not verified.** What the assistant could not check. Treat this list as your next steps, not as small print.
- **Ready to automate this?** The assistant offers to turn the triage into a playbook (chapter 8 does this by hand).

A low-confidence *Needs more info* verdict is a correct answer when enrichment fails. Open the failed step to see which connector failed, fix the connector, and ask again.

## 4. Ask for a change and decide it

Ask the Agentic Assistant to act, for example: `Contain this: add the source IP of this alert to the block list.`

The assistant never writes on its own. It looks for an action that can do the job. When it finds one, it stages the action on an **approval card** with **Approve** and **Reject** buttons and waits for you. If no connector can do the job, it says so on the card and stages nothing.

<!-- step: fsa03-23-agentic-assistant-approval manual: needs a connected containment connector; spends tokens -->

Reject is always safe: a rejected card writes nothing. Check the effect on the box afterwards instead of trusting the card. Lab 8 in chapter 10 shows the same principle as a playbook approval.

## 5. Watch the assistant as a lead

The **Agentic Assistant Monitor** dashboard shows the assistant's turns, tokens and cost, and everything waiting on an analyst. Its tabs list sessions, pending approvals, users, scheduled tasks, an audit trail of every model call, and the autonomy policy.

<!-- step: fsa03-24-agentic-assistant-monitor -->

<!-- capture: fsa03-24-agentic-assistant-monitor -->
![fsa03-24-agentic-assistant-monitor](fsa03-24-agentic-assistant-monitor.png?height=600px)

**You are done when**

- You can tell the two launchers apart by their titles.
- The Agentic Assistant drew a verdict card for the alert, and you can name one finding, its evidence chip, and one item under **Not verified**.
- The Monitor's **Pending** tab is empty, or every item on it is one you decided.
