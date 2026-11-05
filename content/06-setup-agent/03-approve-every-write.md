---
title: Approve Every Write
linkTitle: Approve Writes
weight: 30
description: "Make the agent ask you before it changes anything on the box, in whichever coding agent you use."
---

By default, an agent can change FortiSOAR as freely as you can. It can create records, publish playbooks and change connectors. The check is your coding agent's own approval prompt. The toolkit marks each tool as a read or a write, and the agent asks you before it runs a write. Reads never ask. The toolkit shows no approval form of its own.

## 1. What the prompt shows

When the agent tries to change something, your coding agent's approval prompt appears in your terminal or editor. It shows:

- the **server** that the change goes to,
- the **tool** and what it does,
- the **arguments**, including the module and the values to write.

If you say no, nothing changes. The agent is told you declined. It does not retry, and it asks you what to do instead.

## 2. Try it

Give your agent this prompt:

```text
Create an alert named "Approval test" with severity Low, then tell me whether
you were asked first.
```

The approval prompt appears before the alert is created. Approve it, and the alert is created. Decline it, and the agent reports that nothing was created.

Then:

- Delete the test alert. Ask the agent to delete the alert named `Approval test`. It asks you to approve the delete too.
- Ask the agent to list the alerts. No prompt appears, because reads never ask.

Each agent shows the approval in its own style. Read the prompt before you choose.

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
Claude shows the tool, the module and the arguments. Then it asks **"Do you want to proceed?"** with a numbered list. Choose **1. Yes** to approve. Choose **3. No**, or press Escape, to decline.

<!-- step: fsa06-05-claude-approval manual: triggers a write in Claude Code to show the approval prompt; spends tokens -->
<!-- capture: fsa06-05-claude-approval -->
![fsa06-05-claude-approval](fsa06-05-claude-approval.png?height=600px)

Decline, and Claude reports that the write was interrupted. It asks what to do instead:

<!-- step: fsa06-09-claude-declined manual: declines the Claude Code approval to show the result; spends tokens -->
<!-- capture: fsa06-09-claude-declined -->
![fsa06-09-claude-declined](fsa06-09-claude-declined.png?height=600px)

{{% /tab %}}
{{% tab title="Codex" %}}
Codex asks whether to let the FortiSOAR server run the tool. It shows the server, the tool and the arguments, with a numbered list. **1. Allow** is selected. Press Enter to approve. To decline, choose **4. Cancel**, or press Escape. There is no second prompt.

<!-- step: fsa06-06-codex-approval -->
<!-- capture: fsa06-06-codex-approval -->
![fsa06-06-codex-approval](fsa06-06-codex-approval.png?height=600px)

Decline, and Codex reports that the alert was not created:

<!-- step: fsa06-10-codex-declined -->
<!-- capture: fsa06-10-codex-declined -->
![fsa06-10-codex-declined](fsa06-10-codex-declined.png?height=600px)

{{% /tab %}}
{{% tab title="OpenCode" %}}
OpenCode shows the same approval in its own prompt. Approve it to run the write, or decline it to stop the write. Run the test above to see how your version shows it.

<!-- step: fsa06-07-opencode-approval -->
<!-- capture: fsa06-07-opencode-approval -->
![fsa06-07-opencode-approval](fsa06-07-opencode-approval.png?height=600px)

{{% /tab %}}
{{% tab title="FortiAgent" %}}
FortiAgent shows an approval card above the message box. A grey band names the target and its group, for example **FortiSOAR - Change**. Below it are the question, the exact request (the tool and its arguments), and one answer per row: **Yes**, **Allow for this thread**, **Always**, then **No**. Pick a row, then click **Submit**.

Choose **Yes** to approve, or **No** to decline. Never choose **Allow for this thread** or **Always**: they approve every later write too, without asking.

FortiAgent asks only while Auto mode is off or paused, or when the FortiSOAR **Change** rule is set to **Ask** (**Settings > Permissions > Rules**). With Auto mode on, FortiAI may approve a write for you.

<!-- step: fsa06-18-fortiagent-approval -->
<!-- capture: fsa06-18-fortiagent-approval -->

Choose **No**, and FortiAgent reports that the alert was not created:

<!-- step: fsa06-19-fortiagent-declined -->
<!-- capture: fsa06-19-fortiagent-declined -->

For more on the card and the rules, see the **Approvals and Rules** chapter of the FortiAgent workshop.
{{% /tab %}}
{{% /tabs %}}

## 3. Where the check lives

The approval is your coding agent's setting, not the toolkit's. The toolkit only marks every tool as read-only or as a write, and marks the irreversible ones as destructive. The agent uses those marks to decide what to ask about. Keep your agent's default, which asks before every write. Then nothing changes on the box without your approval.

{{% notice note %}}
If a write runs with no prompt, your agent is set to allow it. Remove the "always allow" rule for the FortiSOAR server in your agent's settings, restart the agent, and run the test in section 2 again.
{{% /notice %}}
