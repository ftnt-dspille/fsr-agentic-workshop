---
title: Reference
linkTitle: Reference
weight: 10
description: "Prompt library, safety knobs, cleanup, and credits."
---

## Prompt library

Patterns that worked throughout the workshop, generalized:

| Goal | Prompt pattern |
|---|---|
| Safe start on any box | "List the modules and show me the newest alerts before doing anything else." |
| Idempotent writes | "Create X, skipping anything that already exists (match on <field>)." |
| Honest enrichment | "Only claim what a tool result shows; state gaps explicitly." |
| Effect verification | "After the write, read it back and show me the proof." |
| Failure analysis | "Diagnose the run: which defined steps ran, which failed, and why?" |
| Guardrail hygiene | "Before any confirm-gated call, tell me exactly what will change and wait for my go-ahead." |

## Safety knobs

Set these in the MCP server's `env` block (see chapter 6):

| Variable | Effect |
|---|---|
| `FSR_MCP_READONLY=1` | Mutating tools are hidden and refused |
| `FSR_MCP_ALLOW_TOOLS` | Only matching tools (names or globs) are exposed |
| `FSR_MCP_DENY_TOOLS` | Matching tools are hidden |
| `FSR_MCP_OUTPUT_CAP` | Max characters per tool result (default 4000) |

Confirm-gated regardless of settings: `delete_record`, `delete_module`, `delete_schedule`, `publish`, `create_user`, `install_connector`.

## Cleaning up a lab box

Everything this workshop creates is prefixed `agentlab` or named "Agent Lab". Either ask your agent to remove it (each delete is confirm-gated), or run the repo's reset tool:

```bash
FSR_BASE_URL=fortisoar.example.com FSR_API_KEY='<your-api-key>' \
  python3 tools/reset_lab.py --check-only   # see what exists
```

Drop `--check-only` to delete.

## Where to go next

- **fsr-agentic-toolkit (MCP server) and pyfsr SDK:** `pip install fsr-agentic-toolkit==0.1.2` (pulls pyfsr 0.28.0+); pyfsr is at https://github.com/ftnt-dspille/pyfsr (its AGENTS.md is the operating guide this workshop follows)
- **Playbook YAML authoring:** the fsr_playbooks package documentation (step types, triggers, Jinja)
- **Connector development in depth:** the FortiSOAR Connectors workshop
- **Part 1 features in depth:** the FortiSOAR 8.0 product documentation on Agentic AI

## Credits

Part 1's topic map draws on the FortiSOAR AgenticAI Demo workshop (Fortinet internal); this workshop's text, exercises, harness and screenshots are original. The proof harness design follows the FortiAIGate TEC workshop's step/capture convention.
