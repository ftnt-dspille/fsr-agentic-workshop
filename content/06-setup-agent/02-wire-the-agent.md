---
title: Wire the Agent to FortiSOAR
linkTitle: Wire the Agent
weight: 20
description: "Install your coding agent, point it at FortiSOAR over MCP, and prove the connection."
---

Your agent talks to FortiSOAR through the `fsr-agentic-toolkit` MCP server, which builds on the open-source [pyfsr](https://github.com/ftnt-dspille/pyfsr) SDK. It needs the box URL and the login from the previous page.

## 1. Install the tooling

<!-- step: fsa06-02-install-tooling manual: installs tooling on the learner workstation, not on the box -->

You need Python 3.10+ and [uv](https://docs.astral.sh/uv/) (or pip). Then:

```bash
pip install fsr-agentic-toolkit==0.1.4
```

This also installs `pyfsr` (0.28.0 or newer), whose `pyfsr connector` commands you use in chapter 9.

## 2. Generate your agent's MCP config

<!-- step: fsa06-03-agent-init manual: starts Claude Code on the workstation against the agent; spends tokens -->

`fsr-agentic-toolkit init` checks the box and prints the config snippet for your agent product:

```bash
fsr-agentic-toolkit init --url fortisoar.example.com --username '<login-id>' --password '<password>' --no-verify-ssl --readonly
```

Replace `fortisoar.example.com` with your box's URL and `<login-id>`/`<password>` with the login you created on the previous page. `--readonly` starts the agent with a read-only tool surface for this chapter; chapter 7 has you remove it before the first write.

`init` checks the connection first, then prints the snippet. You should see:

```text
connected: agentlab <agentlab@example.com> @ https://fortisoar.example.com
--- claude-code ---
# .mcp.json (project root), or merge into ~/.claude.json
{ ... }
```

The `connected:` line names the login your agent authenticates as, which is exactly why the audit log will attribute the agent's actions to it.

<!-- capture: fsa06-03-agent-init -->
![fsa06-03-agent-init](fsa06-03-agent-init.png)

{{% notice tip %}}
`--no-verify-ssl` is for lab boxes with self-signed certificates. `--readonly` (included above) starts the agent with a read-only tool surface; chapter 7 removes it before the first write.
{{% /notice %}}

## 3. Install the snippet

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
1. Make a working folder for the lab (`mkdir fsr-agent-lab && cd fsr-agent-lab`).
2. Save the printed snippet as `.mcp.json` in that folder (re-run `init` with `--claude-code` to print it again).
3. Start `claude` in the folder and approve the new MCP server when prompted.
4. Type `/mcp` to confirm the `fortisoar` server is connected and its tools are listed.
{{% /tab %}}
{{% tab title="Codex" %}}
1. Run `fsr-agentic-toolkit init ... --codex` and merge the printed `[mcp_servers.fortisoar]` tables into `~/.codex/config.toml` (or add it with `codex mcp add`).
2. Add `startup_timeout_sec = 60` to the `[mcp_servers.fortisoar]` table: the default is 10 seconds, which a first `uvx` start can exceed.
3. Start `codex` and run `codex mcp list`; `fortisoar` should read `enabled`.
{{% /tab %}}
{{% tab title="OpenCode" %}}
1. Run `fsr-agentic-toolkit init ... --opencode` and merge the printed `mcp` block into your project's `opencode.json`.
2. Restart OpenCode in the project.
3. Ask it to list its tools; the FortiSOAR tools should appear.
{{% /tab %}}
{{% tab title="GitHub Copilot" %}}
1. Run `fsr-agentic-toolkit init ... --copilot` and save the snippet as `.vscode/mcp.json`.
2. In VS Code, open Copilot Chat in agent mode and start the server when prompted.
3. The tool picker should list the FortiSOAR tools.
{{% /tab %}}
{{% /tabs %}}

## 4. First contact

Give your agent this prompt:

```text
List the modules on this box, then show me the few newest alerts, with one
line on what stands out about each.
```

<!-- step: fsa06-04-whoami -->

**What success looks like:** the agent calls a read-only tool like `list_modules`, then queries the recent alerts, and answers with the module count and a short, grounded summary of the latest alerts. That is your first win: the connection works and the agent is already doing useful read-only work, before you grant it a single write.

{{% notice tip %}}
If you ask the agent *who am I*, it calls `whoami` and gets back your login id and the box version. That is the right mental model for the rest of the workshop - every write you are about to allow lands under this login, and the audit log says so. These are read-only tools and nothing on the box changes.
{{% /notice %}}

<!-- capture: fsa06-04-whoami-claude -->
![fsa06-04-whoami-claude](fsa06-04-whoami-claude.png)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `init` fails with a certificate error | Self-signed box certificate | Add `--no-verify-ssl` |
| `init` fails with 401 | Wrong login id or password | Re-check the credentials; watch for trailing whitespace |
| Agent says it has no fortisoar tools | MCP config not loaded | Claude Code: `.mcp.json` must be in the folder you started `claude` in; check `/mcp` |
| Tools listed but every call fails with a connection error | Workstation cannot reach the box | `curl -k https://fortisoar.example.com` from the same machine |
| whoami works but the agent picks odd tools | Tool surface too wide for the task | Add `FSR_MCP_DENY_TOOLS=appliance_*` to the env block |

<!-- agent-drive:begin -->

<details><summary>What the agent did</summary>

**`02-wire-the-agent#1`** (Sonnet run, sanitized)

![06-setup-agent/02-wire-the-agent#1](fsa06-04-whoami-claude.png)

```text
  > list_modules {}
  > query_records {"module": "alerts", "limit": 5, "sort": [{"field": "createDate", "di...
```

</details>

<!-- agent-drive:end -->
