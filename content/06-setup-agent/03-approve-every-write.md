---
title: Approve Every Write
linkTitle: Approve Writes
weight: 30
description: "Make the agent ask you before it changes anything on the box, in whichever coding agent you use."
---

By default an agent can change FortiSOAR as freely as you could: create records, publish playbooks, configure connectors. The toolkit puts a human in that path. Before any write runs, the server asks **you** to approve it, through your coding agent's own interface. Reads never prompt.

## 1. What you will see

When the agent decides to change something, an approval prompt appears in your terminal or editor. It shows:

- the **box** the change will hit,
- the **tool** and what it does,
- the **arguments**, with anything that looks like a password, key or token masked.

Say no, and nothing happens. The agent is told you declined and not to retry the same call, so it asks you what you want instead.

## 2. Try it

Give your agent this prompt:

```text
Create an alert named "Approval test" with severity Low, then tell me whether
you were asked first.
```

A prompt appears before the alert exists. Approve it and the alert is created; decline it and the agent tells you nothing was created. Delete the test alert afterwards. Then ask it to list the alerts: no prompt appears, because reads are never interrupted.

Each agent renders the same approval in its own style. Approving is always "yes" (or the preselected default is "no", so you have to choose):

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
Claude shows the tool, the module and the arguments, then asks **"Do you want to proceed?"** with a numbered list. Choose **1. Yes** to approve; **3. No** or Escape declines.

<!-- step: fsa06-05-claude-approval manual: triggers a write in Claude Code to show the approval prompt; spends tokens -->
<!-- capture: fsa06-05-claude-approval -->
![fsa06-05-claude-approval](fsa06-05-claude-approval.png?height=600px)

Decline, and Claude reports the write was interrupted and asks what to do instead:

<!-- step: fsa06-09-claude-declined manual: declines the Claude Code approval to show the result; spends tokens -->
<!-- capture: fsa06-09-claude-declined -->
![fsa06-09-claude-declined](fsa06-09-claude-declined.png?height=600px)

{{% /tab %}}
{{% tab title="Codex" %}}
Codex shows the box, the tool and the full arguments, then **"Approve this change"** with **1. True** / **2. False** (False preselected). Choose True and press Enter to approve.

<!-- step: fsa06-06-codex-approval manual: triggers a write in Codex to show the approval prompt; spends tokens -->
<!-- capture: fsa06-06-codex-approval -->
![fsa06-06-codex-approval](fsa06-06-codex-approval.png?height=600px)

Decline, and Codex reports that the record was not created:

<!-- step: fsa06-10-codex-declined manual: declines the Codex approval to show the result; spends tokens -->
<!-- capture: fsa06-10-codex-declined -->
![fsa06-10-codex-declined](fsa06-10-codex-declined.png?height=600px)

{{% /tab %}}
{{% tab title="OpenCode" %}}
OpenCode surfaces the same approval through its own prompt. Approve it to let the write run, or decline to stop it. Run the test in section 2 to see exactly how your version renders it.
{{% /tab %}}
{{% /tabs %}}

## 3. The setting

`FSR_MCP_APPROVAL` goes in the same `env` block as the connection settings:

| Value | Behavior |
|---|---|
| `require` (default) | Ask on every write, and refuse the write if your agent cannot show a prompt. No write reaches the box without a person saying yes (or your agent being set to auto-accept the prompt). |
| `auto` | Ask when your coding agent can show a prompt; otherwise run the write and rely on the agent's own tool prompts |
| `off` | Never ask. For unattended runs only. |

If nobody answers within five minutes (`FSR_MCP_APPROVAL_TIMEOUT`, in seconds), the write is refused, so an unattended run can never hang or write by accident.

The default is `require`: a write is prompted for, and refused outright if your agent cannot show the prompt, so nothing changes the box unasked. Switch to `auto` only if your agent cannot show the server's prompt and you would rather fall back to its own tool approvals than have writes refused.

## 4. If your agent does not show the prompt

Coding agents differ in what they support. On the `require` default a write is refused if your agent cannot show the prompt, so you will see a refusal rather than a silent write. If you switch to `auto` and a write runs with no prompt, your agent does not support the server's approval requests. Either way you have two fallbacks:

- **Set `require`.** Writes are then refused rather than run unasked, which is safe but means this agent cannot write.
- **Use the agent's own tool approvals.** Every tool is marked read-only or not, so a client that honors those hints will ask for the writes on its own. In Claude Code you can also generate explicit rules, reads allowed and writes asking:

```bash
fsr-agentic-toolkit permissions --write .claude/settings.json
```

It merges into your existing settings and removes nothing you already have.

{{% notice note %}}
The prompt looks different in each agent. We checked Claude Code 2.1.312, Codex 0.165.0 and OpenCode 2.2.0, and all three show it. Run the test in section 2 with your own agent before relying on it, especially if it is not one of these. On the `require` default a write is refused rather than run when your agent cannot show the prompt, so you never get a silent write; if you have switched to `auto` and a write runs with no prompt, set `FSR_MCP_APPROVAL=require` or fall back to the agent's own tool approvals as described above.
{{% /notice %}}
