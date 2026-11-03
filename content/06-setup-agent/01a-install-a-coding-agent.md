---
title: Install a Coding Agent
linkTitle: Install an Agent
weight: 15
description: "Install Claude Code, Codex or OpenCode, sign in, and check that it runs before you connect it to FortiSOAR."
---

The toolkit works with coding agents that support MCP. This workshop is tested with **Claude Code**, **Codex** and **OpenCode**. Install one of them. You need only one.

You need a terminal, and an account that the agent can sign in with, such as a subscription or an API key from the vendor. The agent uses tokens while it works.

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

The first time you open a folder, Claude Code asks whether you trust it. Choose yes. Otherwise it ignores the `.mcp.json` file that you add on the next page.
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

Run `codex` once and sign in when asked. Codex keeps its settings in `~/.codex/config.toml`. The next page adds FortiSOAR there.
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

Run `opencode` in your working folder and connect a model provider when asked. OpenCode reads `opencode.json` from the project folder. The next page adds FortiSOAR there.

In OpenCode 2, the FortiSOAR tools appear as `tools.fortisoar.<tool>` inside `execute`, not as separate tool names.
{{% /tab %}}
{{% /tabs %}}

**You are done when:** the version command prints a version number, and the agent starts and answers a plain question such as "what folder are you in?".

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `command not found` after install | The install folder is not on your `PATH` | Open a new terminal, or add the folder that the installer printed to `PATH` |

Next, point the agent at FortiSOAR.
