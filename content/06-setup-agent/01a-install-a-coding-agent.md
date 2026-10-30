---
title: Install a Coding Agent
linkTitle: Install an Agent
weight: 15
description: "Install Claude Code, Codex or OpenCode, sign in, and check it runs, before you point it at FortiSOAR."
---

The toolkit works with any coding agent that speaks MCP. This workshop is tested with three: **Claude Code**, **Codex** and **OpenCode**. Install the one you will use; you only need one.

You need a terminal and an account the agent can sign in with (a subscription or an API key for that vendor). The agent itself costs tokens when it works, so use a login you are comfortable spending on.

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
Install:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Check it:

```bash
claude --version
```

Start it in an empty working folder and sign in when asked:

```bash
mkdir fsr-agent-lab && cd fsr-agent-lab
claude
```

The first time you open a folder, Claude Code asks whether you trust it. Choose yes, or it will ignore the project's `.mcp.json` later.
{{% /tab %}}
{{% tab title="Codex" %}}
Install with npm or Homebrew:

```bash
npm install -g @openai/codex
# or: brew install --cask codex
```

Check it:

```bash
codex --version
```

Run `codex` once and sign in when asked. Codex keeps its settings in `~/.codex/config.toml`; the next page adds the FortiSOAR server there.
{{% /tab %}}
{{% tab title="OpenCode" %}}
Install:

```bash
curl -fsSL https://opencode.ai/install | bash
```

Check it:

```bash
opencode --version
```

Run `opencode` in your working folder and connect a model provider when asked. OpenCode reads `opencode.json` from the project folder; the next page adds the FortiSOAR server there.

{{% notice note %}}
OpenCode 2 reaches MCP tools through a code tool, so the FortiSOAR tools appear as `tools.fortisoar.<tool>(...)` inside `execute` rather than as separate tool names. OpenCode 1 and 2 cannot be installed side by side, so check which one you have.
{{% /notice %}}
{{% /tab %}}
{{% /tabs %}}

**You are done when:** the version command prints a version number and the agent starts and answers a plain question such as "what folder are you in?".

## Versions checked

| Agent | Version used for this workshop |
|---|---|
| Claude Code | 2.1.312 |
| Codex | 0.165.0 |
| OpenCode | 2.2.0 |

Newer versions should behave the same. If a prompt looks different on yours, the approval test on the "Approve Every Write" page still tells you whether it works.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `command not found` after install | The install folder is not on your `PATH` | Open a new terminal, or add the folder the installer printed to `PATH` |
| Claude Code ignores `.mcp.json` | You skipped the trust prompt | Re-open the folder and choose to trust it |
| Codex says the MCP server timed out starting | Default startup limit is 10 seconds | Set `startup_timeout_sec = 60` on the server (next page) |
| OpenCode cannot find FortiSOAR tools | v2 names them `tools.fortisoar.<tool>` under `execute` | Ask it to call the tool by that name |

Next, point the agent at FortiSOAR.
