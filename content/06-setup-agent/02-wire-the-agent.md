---
title: Wire the Agent to FortiSOAR
linkTitle: Wire the Agent
weight: 20
description: "Install the FortiSOAR toolkit, add it to your agent as an MCP server, and check that the agent can reach FortiSOAR."
---

Your agent connects to FortiSOAR through the fsr-agentic-toolkit MCP server. The server signs in with the box you registered with `pyfsr instances add lab` in chapter 1, so no agent config on this page holds a URL, a login or a key.

## 1. Install the toolkit

<!-- step: fsa06-02-install-tooling manual: installs tooling on the learner workstation, not on the box -->

You need Python 3.10 or later, and [uv](https://docs.astral.sh/uv/) or pip. Then run:

```bash
pip install "fsr-agentic-toolkit==0.2.3" "pyfsr>=0.35.0"
```

## 2. Check the box registration

Check that pyfsr still reaches the box you registered in chapter 1:

```bash
pyfsr instances check lab
```

<!-- step: fsa06-02-instances-check -->
<!-- capture: fsa06-02-instances-check -->
![fsa06-02-instances-check](fsa06-02-instances-check.png)

The **status** column should read **ok**, with your box version. If you skipped chapter 1, or this is another machine, register the box first with `pyfsr instances add lab` (see [Prepare Your Box](../../01-intro/02-prepare-your-box/)). The first box you add is the default, and the MCP server signs in to the default box.

Then find the toolkit's full path. Every agent config below starts it by this path:

```bash
which fsr-agentic-toolkit
```

The examples show it as `/your/venv/bin/fsr-agentic-toolkit`; use yours.

## 3. Add the toolkit to your agent

You do not start the toolkit yourself. Each agent's config tells it how: command is the toolkit program in your Python environment, and args (`mcp`) makes it run as an MCP server. When the agent starts, it launches that program in the background and talks to it directly. The server reads your box and its login from pyfsr, so the config has nothing secret in it and is safe to keep in the lab folder.

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
Claude Code reads its MCP servers from `.mcp.json` in the folder where you start `claude`.

1. In the folder you made on the previous page, save this as `.mcp.json`, with your toolkit path:

   ```json
   {
     "mcpServers": {
       "fortisoar": {
         "command": "/your/venv/bin/fsr-agentic-toolkit",
         "args": ["mcp"]
       }
     }
   }
   ```

2. Still in your shell, run `claude mcp list`. It also checks the file: if the JSON is broken, it prints **[Failed to parse]** with the file name. A good file shows **fortisoar** as **Pending approval**.

   <!-- step: fsa06-03-claude-mcp-list -->
   <!-- capture: fsa06-03-claude-mcp-list -->
   ![fsa06-03-claude-mcp-list](fsa06-03-claude-mcp-list.png)

3. Start `claude` in that folder. Approve the **fortisoar** server when asked.
4. Type `/mcp`. The **fortisoar** server should show as connected, with its tools listed.

<!-- step: fsa06-03-agent-init -->
<!-- capture: fsa06-03-agent-init -->
![fsa06-03-agent-init](fsa06-03-agent-init.png?height=600px)

{{% /tab %}}
{{% tab title="Codex" %}}
Codex reads its MCP servers from `~/.codex/config.toml`.

1. Add this table to `~/.codex/config.toml`, with your toolkit path. Create the file if it does not exist.

   ```toml
   [mcp_servers.fortisoar]
   command = "/your/venv/bin/fsr-agentic-toolkit"
   args = ["mcp"]
   startup_timeout_sec = 60
   ```

   `startup_timeout_sec = 60` is there because a first start can take longer than Codex's 10-second default.
2. Still in your shell, not inside Codex, run `codex mcp list`. It also checks the file: if the TOML is broken, it prints the line and column to fix instead of the table. The **fortisoar** row should read **enabled**. For a full check of the Codex setup, run `codex doctor` and look for **✓ config loaded**.

<!-- step: fsa06-12-codex-mcp-list -->
<!-- capture: fsa06-12-codex-mcp-list -->
![fsa06-12-codex-mcp-list](fsa06-12-codex-mcp-list.png)

3. In the lab folder, start `codex`. If it shows an update prompt, press **Esc** to skip it. Do not press Enter there. Its first choice is "Update now".
4. In Codex, type `/mcp`. Wait for **fortisoar: connected (N tools)**. Then type `/new` to start a fresh chat. Codex gives a chat the server's tools only when that chat starts.

   <!-- step: fsa06-12b-codex-mcp-connected -->
   <!-- capture: fsa06-12b-codex-mcp-connected -->
   ![fsa06-12b-codex-mcp-connected](fsa06-12b-codex-mcp-connected.png?height=600px)

{{% /tab %}}
{{% tab title="OpenCode" %}}
1. Merge this block into the `opencode.json` file in your project folder, with your toolkit path:

   ```json
   {
     "mcp": {
       "fortisoar": {
         "type": "local",
         "command": ["/your/venv/bin/fsr-agentic-toolkit", "mcp"],
         "enabled": true
       }
     }
   }
   ```

2. Restart OpenCode in the project.
3. Ask it to list its tools. The FortiSOAR tools should appear. In OpenCode 2 they appear inside execute as `tools.fortisoar.<tool>`.
{{% /tab %}}
{{% tab title="FortiAgent" %}}
FortiAgent keeps its MCP servers in its own settings. FortiAgent searches only the standard folders for a bare program name, so give it the full toolkit path from section 2.

1. Open **Settings > MCP servers** and click **Add an MCP server**. Pick **Local command**.
2. **Name:** `FortiSOAR`.
3. **Command:** the full toolkit path from section 2.
4. **Arguments:** `mcp` on the first line.
5. **Environment variables:** none. The toolkit reads the box from pyfsr.
6. Click **Add server**.

<!-- step: fsa06-15-fortiagent-add-mcp-form -->
<!-- capture: fsa06-15-fortiagent-add-mcp-form -->
![fsa06-15-fortiagent-add-mcp-form](fsa06-15-fortiagent-add-mcp-form.png)

From a shell, the same thing is:

```bash
fortiagent mcp add FortiSOAR -- /your/venv/bin/fsr-agentic-toolkit mcp
```

7. Open a **New chat**, so the engine starts the server. Back in **Settings > MCP servers**, the `FortiSOAR` row shows a green dot when it is connected. Hover over a dot that is not green for the reason. In a shell, `fortiagent mcp list` shows **connected**.

<!-- step: fsa06-16-fortiagent-mcp-list -->
<!-- capture: fsa06-16-fortiagent-mcp-list -->
![fsa06-16-fortiagent-mcp-list](fsa06-16-fortiagent-mcp-list.png?height=600px)

For the status dots and reloading, see the **MCP Servers** chapter of the FortiAgent workshop.
{{% /tab %}}
{{% /tabs %}}

## 4. Install the skills

The toolkit ships short skills. They teach the agent good habits, such as checking a playbook before it publishes, reading every write back, and keeping secrets out of the chat. Install them in the lab folder.

{{% tabs groupid="agent" %}}
{{% tab title="Claude Code" %}}
```bash
fsr-agentic-toolkit skills --install
```

Restart `claude`. The skills load from `.claude/skills`.
{{% /tab %}}
{{% tab title="Codex / OpenCode" %}}
```bash
fsr-agentic-toolkit skills --install --agents-md AGENTS.md
```

This adds a block to `AGENTS.md` that points the agent at each skill.
{{% /tab %}}
{{% tab title="FortiAgent" %}}
Skip this step. FortiAgent does not read `.claude/skills` or `AGENTS.md`, so `fsr-agentic-toolkit skills --install` changes nothing for it. FortiAgent's own **Skills** (in the sidebar) come from its skills marketplace, and none ship for this toolkit. The toolkit's tool descriptions still steer FortiAgent, and its approval card still guards every write.
{{% /tab %}}
{{% /tabs %}}

## 5. First contact

<!-- step: fsa06-04-whoami-claude -->

Give your agent this prompt:

```text
In one short paragraph: who am I on this FortiSOAR box, and what can you help
me do here?
```

The agent calls whoami. It answers with your login id and the box version. whoami only reads, so nothing on the box changes. Every write that you allow later runs under this login, and the audit log records it under this login.

<!-- capture: fsa06-04-whoami-claude -->
![fsa06-04-whoami-claude](fsa06-04-whoami-claude.png?height=600px)

Codex answers the same way. It shows the whoami call as it runs, then the answer:

<!-- step: fsa06-13-codex-whoami -->
<!-- capture: fsa06-13-codex-whoami -->
![fsa06-13-codex-whoami](fsa06-13-codex-whoami.png?height=600px)

In FortiAgent, open a **New chat** and ask in plain words:

```text
Who am I logged in as on FortiSOAR, and what version is the box?
```

FortiAgent picks the whoami tool on its own and answers with your login id and the box version. A tool that only reads runs with no approval card.

<!-- step: fsa06-17-fortiagent-whoami -->
<!-- capture: fsa06-17-fortiagent-whoami -->
![fsa06-17-fortiagent-whoami](fsa06-17-fortiagent-whoami.png?height=600px)

OpenCode works the same way:

<!-- step: fsa06-08-opencode-setup manual: runs a read-only whoami turn in OpenCode; spends tokens -->
<!-- capture: fsa06-08-opencode-setup -->
![fsa06-08-opencode-setup](fsa06-08-opencode-setup.png?height=600px)

Now give it real work. Give your agent this prompt:

```text
List the modules on this box, then show me the few newest alerts, with one
line on what stands out about each.
```

The agent calls list_modules, reads the newest alerts, and gives a short summary. The agent now reads the box, and nothing has changed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The agent says it has no fortisoar tools | The MCP config is not loaded. In Claude Code, `.mcp.json` must be in the folder where you started `claude`. Run `/mcp` to check. |
| Tools are listed, but every call fails to connect | Your workstation cannot reach the box. Run `curl -k https://fortisoar.example.com` from the same machine. |
| whoami answers with a different box or login | The server signs in to the default pyfsr box. Run `pyfsr instances list`: the default is marked `*`. If `FSR_BASE_URL` is set in the shell that starts your agent, it wins over pyfsr, so unset it. |
| Codex says the fortisoar tools are not available | Codex started the chat before the server connected. Type `/mcp` and wait for **fortisoar: connected**. Then type `/new` and ask again. |
