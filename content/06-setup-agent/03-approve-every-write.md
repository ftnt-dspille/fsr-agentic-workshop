---
title: Approve Every Write
linkTitle: Approve Writes
weight: 30
description: "Make the agent ask you before it changes anything on the box, in whichever coding agent you use."
---

By default, an agent can change FortiSOAR as freely as you can. It can create records, publish playbooks and change connectors. The toolkit adds a check. Before a write runs, the server asks you to approve it in your coding agent's interface. Reads never ask.

## 1. What the prompt shows

When the agent tries to change something, an approval prompt appears in your terminal or editor. It shows:

- the **box** that the change hits,
- the **tool** and what it does,
- the **arguments**. Anything that looks like a password, key or token is masked.

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

Each agent shows the approval in its own style. Codex and OpenCode preselect "no", so choose "yes" yourself.

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
1. Codex asks whether to let the FortiSOAR server run the tool. **1. Allow** is selected. Press Enter.
2. The toolkit then shows the change: the box, the tool and the full arguments. It asks **Approve this change** with **1. True** and **2. False**. False is selected by default. Press Up, then Enter, to approve. To decline, press Enter on False, or press Escape at the first prompt.

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
{{% /tabs %}}

## 3. The setting

The setting `FSR_MCP_APPROVAL` is in the `env` block of the server config. Its default is `require`. The agent then asks before every write, and if the prompt cannot be shown, the write is refused. If nobody answers within five minutes, the write is also refused.

Keep the default. Then nothing changes on the box without your approval.

{{% notice note %}}
If a write runs with no prompt, set `FSR_MCP_APPROVAL=require` in the `env` block, restart the agent, and run the test in section 2 again.
{{% /notice %}}
