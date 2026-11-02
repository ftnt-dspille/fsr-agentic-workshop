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
pip install fsr-agentic-toolkit
```

This also installs `pyfsr`, whose `pyfsr connector` commands you use in chapter 9.

## 2. Generate your agent's MCP config

`fsr-agentic-toolkit init` checks the box and prints the config snippet for your agent. Omit `--password` and it prompts for it, so the password never lands in your shell history:

```bash
fsr-agentic-toolkit init --url fortisoar.example.com --username '<login-id>' --no-verify-ssl --readonly
```

Use your box's URL and the login id from the previous page. Two flags matter here:

- `--no-verify-ssl` trusts a lab box's self-signed certificate.
- `--readonly` starts the agent with a read-only tool surface. Chapter 7 has you drop it before the first write.

`init` verifies the connection, then prints the snippet:

```text
connected: agentlab <agentlab@example.com> @ https://fortisoar.example.com
--- claude-code ---
# .mcp.json (project root), or merge into ~/.claude.json
{ ... }
```

The `connected:` line names the login the agent authenticates as; that is why the audit log attributes the agent's actions to it. If this line fails, the credentials or URL are wrong and no snippet is printed.

## 3. Install the snippet

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
1. Make a working folder for the lab (`mkdir fsr-agent-lab && cd fsr-agent-lab`).
2. Save the printed snippet as `.mcp.json` in that folder (re-run `init` with `--claude-code` to print it again).
3. Start `claude` in the folder and approve the new MCP server when prompted.
4. Type `/mcp` to confirm the `fortisoar` server is connected and its tools are listed.

<!-- step: fsa06-03-agent-init manual: starts the coding agent against the box; spends tokens -->
<!-- capture: fsa06-03-agent-init -->
![fsa06-03-agent-init](fsa06-03-agent-init.png?height=600px)

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

## 4. Install the skills

The toolkit ships short skills that teach your agent how to use it well: check a playbook before publishing it, repair a failed run with the toolkit's own fix, read every write back, keep secrets out of the chat. Install them into the lab folder:

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
```bash
fsr-agentic-toolkit skills --install
```

Restart `claude`; the skills load from `.claude/skills`.
{{% /tab %}}
{{% tab title="Codex / OpenCode" %}}
```bash
fsr-agentic-toolkit skills --install --agents-md AGENTS.md
```

This adds a block to `AGENTS.md` that points the agent at each skill.
{{% /tab %}}
{{% /tabs %}}

## 5. First contact

<!-- step: fsa06-04-whoami manual: runs a read-only whoami turn in the agent; spends tokens -->

Ask the agent who it is:

```text
In one short paragraph, who are you and what can you help me do with this FortiSOAR box?
```

It calls `whoami`, gets back your login id and the box version, and answers in its own words. Nothing on the box changes; `whoami` is read-only. This is the right mental model for the rest of the workshop: every write you are about to allow lands under this login, and the audit log says so.

<!-- capture: fsa06-04-whoami-claude -->
![fsa06-04-whoami-claude](fsa06-04-whoami-claude.png?height=600px)

Any wired-up agent answers the same way. OpenCode, for example:

<!-- step: fsa06-08-opencode-setup manual: runs a read-only whoami turn in OpenCode; spends tokens -->
<!-- capture: fsa06-08-opencode-setup -->
![fsa06-08-opencode-setup](fsa06-08-opencode-setup.png?height=600px)

Now give it real work:

```text
List the modules on this box, then show me the few newest alerts, with one
line on what stands out about each.
```

The agent calls `list_modules`, queries the recent alerts, and answers with a short, grounded summary. That is your first win: the connection works and the agent is doing useful read-only work before you grant it a single write.

If the agent says it has no `fortisoar` tools, the MCP config is not loaded. In Claude Code, `.mcp.json` must be in the folder you started `claude` in; run `/mcp` to check. If tools are listed but every call fails to connect, your workstation cannot reach the box: try `curl -k https://fortisoar.example.com` from the same machine.
