---
title: Reference
linkTitle: Reference
weight: 10
description: "Prompt library, safety knobs, cleanup, and credits."
---

## Prompt library

These prompt patterns worked throughout the workshop. Adapt them to your own goals.

| Goal | Prompt pattern |
|---|---|
| Safe start on any box | "List the modules and show me the newest alerts before doing anything else." |
| Idempotent writes | "Create X, skipping anything that already exists (match on <field>)." |
| Honest enrichment | "Only claim what a tool result shows; state gaps explicitly." |
| Effect verification | "After the write, read it back and show me the proof." |
| Failure analysis | "Diagnose the run: which defined steps ran, which failed, and why?" |
| Guardrail hygiene | "Before any confirm-gated call, tell me exactly what will change and wait for my go-ahead." |

## Safety knobs

Set these in the MCP server's env block (see chapter 6):

| Variable | Effect |
|---|---|
| `FSR_MCP_READONLY=1` | Mutating tools are hidden and refused |
| `FSR_MCP_ALLOW_TOOLS` | Only matching tools (names or globs) are exposed |
| `FSR_MCP_DENY_TOOLS` | Matching tools are hidden |
| `FSR_MCP_OUTPUT_CAP` | Max characters per tool result (default 4000) |

These calls ask for confirmation no matter what the settings are: delete_record, delete_schedule, publish, create_user, install_connector.

## Cleaning up a lab box

Everything this workshop creates is prefixed `agentlab` or named "Agent Lab". To remove it, either ask your agent (each delete asks for confirmation), or run the repo's reset tool yourself:

```bash
FSR_BASE_URL=https://fortisoar.example.com FSR_USERNAME='<login-id>' FSR_PASSWORD='<password>' \
  python3 tools/reset_lab.py --check-only
```

`--check-only` lists what exists and changes nothing. Without it, the tool prints the same list and asks you to type `RESET` before it deletes anything. The tool removes:

- modules named `agentlab` or `agentlab_*`, with their records
- alerts whose name starts with "Agent Lab"
- playbook collections whose name starts with "Agent Lab"
- schedules whose name starts with `agentlab_` or "Agent Lab"
- the lab connectors, if installed

It deactivates users whose email starts with `agentlab_`. Run the tool yourself, not through the agent.

## Where to go next

- **fsr-agentic-toolkit (MCP server) and pyfsr SDK:** `pip install fsr-agentic-toolkit==0.2.3`. This also installs pyfsr 0.32.0 and fsr-playbooks 0.10.1. pyfsr is at https://github.com/ftnt-dspille/pyfsr. Its AGENTS.md is the operating guide this workshop follows.
- **Playbook YAML authoring:** the fsr_playbooks package documentation (step types, triggers, Jinja).
- **Connector development in depth:** the FortiSOAR Connectors workshop.
- **Part 1 features in depth:** the FortiSOAR 8.0 product documentation on Agentic AI.

## Credits

Part 1's topic map draws on the FortiSOAR Agentic AI Demo workshop by Mahdi Naili, the original agentic workshop for FortiSOAR. The **Invoke AI Agent** operation that chapter 4 uses comes from Mahdi Naili and Priyank Mankad's build of the Remote FortiSOAR connector. This workshop's text, exercises, harness and screenshots are original. The proof harness design follows the FortiAIGate TEC workshop's step/capture convention.
