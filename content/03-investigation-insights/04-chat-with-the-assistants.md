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
| Ships with | FortiSOAR | The connector-fsr-agentic-assistant connector and its widget, installed on the lab box. It uses FortiAI only as its language model |
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

<!-- capture: fsa03-23-agentic-assistant-approval -->
![fsa03-23-agentic-assistant-approval](fsa03-23-agentic-assistant-approval.png?height=600px)

Reject is always safe: a rejected card writes nothing. Check the effect on the box afterwards instead of trusting the card. Lab 8 in chapter 10 shows the same principle as a playbook approval.

## 5. Approve the action, then verify and undo it

In the last section you rejected the card. This time approve one, and then hold the assistant to its effect. The same three beats a real containment has: approve, verify, undo.

1. Open the **Agentic Assistant** on the alert again and click **New** to start a fresh conversation. Ask for a triage first: `Triage this alert. Give me a verdict and the evidence behind it.` A containment ask that arrives cold gets deferred: the assistant's evidence guard wants investigation in the conversation before it stages a write.
2. Then ask: `Contain this: block 203.0.113.99 now.` If the assistant answers with another verdict card instead of staging the action, nudge it: reply `Go ahead.` A person would.
3. Read the card before you touch the buttons. The operation line names the exact action that will run: `fortigate-firewall.block_ip_new`, method *Quarantine Based*, with the alert's source IP `203.0.113.99` as the target and a time to live. The title is the assistant's words; the operation line is the truth. Approving the wrong action is a real incident.
4. Click **Approve**. The action runs on the connector while the turn finishes.

<!-- step: fsa03-25-agentic-assistant-approve manual: spends tokens; approves a live containment -->

<!-- capture: fsa03-25-agentic-assistant-approve -->
![fsa03-25-agentic-assistant-approve](fsa03-25-agentic-assistant-approve.png?height=600px)

Do not take the chat's word for the result. The block's effect is the FortiGate's **ban list**, and you can read it through the same connector the action used, from your workstation:

```python
from pyfsr import FortiSOAR

c = FortiSOAR.from_env()   # reads FSR_BASE_URL / FSR_USERNAME / FSR_PASSWORD
r = c.connectors.execute("fortigate-firewall", "get_blocked_ip",
                         config="Enterprise_Core",
                         params={"method": "Quarantine Based"})
print(r.data["result"][0]["results"])   # the ban list
```

The IP is on the list, with an expiry one hour out. If the card had staged the wrong arguments, the operation would still report success, but with an empty list. That is why the check reads the gate, not the chat.

## 6. Watch the assistant as a lead

The **Agentic Assistant Monitor** dashboard shows the assistant's turns, tokens and cost, and everything waiting on an analyst. Its tabs list sessions, pending approvals, users, scheduled tasks, an audit trail of every model call, and the autonomy policy.

<!-- step: fsa03-24-agentic-assistant-monitor -->

<!-- capture: fsa03-24-agentic-assistant-monitor -->
![fsa03-24-agentic-assistant-monitor](fsa03-24-agentic-assistant-monitor.png?height=600px)

Open the **Autonomy** tab. The lab's shadow autonomy policy (seeded by `tools/lab_setup.py prepare`) evaluates every containment action and records what it would have done next to what you actually decided. For an approved action that ran, it offers a one-click **Undo** that runs the paired unblock on the FortiGate.

<!-- step: fsa03-26-agentic-assistant-executed -->

<!-- capture: fsa03-26-agentic-assistant-executed -->
![fsa03-26-agentic-assistant-executed](fsa03-26-agentic-assistant-executed.png?height=600px)

Click **Undo** on the row. The monitor calls the connector's undo, the row reads **Undone by** you, and the ban list is empty again: the same pyfsr check from the last section now prints `[]`.

<!-- step: fsa03-27-agentic-assistant-undo -->

<!-- capture: fsa03-27-agentic-assistant-undo -->
![fsa03-27-agentic-assistant-undo](fsa03-27-agentic-assistant-undo.png?height=600px)

**You are done when**

- You can tell the two launchers apart by their titles.
- The Agentic Assistant drew a verdict card for the alert, and you can name one finding, its evidence chip, and one item under **Not verified**.
- You approved a containment card, read the operation line before clicking, and saw the IP on the FortiGate's ban list.
- You undid the block from the Monitor's **Autonomy** tab and saw the ban list empty again.
- The Monitor's **Pending** tab is empty, or every item on it is one you decided.
