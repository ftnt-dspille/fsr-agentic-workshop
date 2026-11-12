---
title: What You Built
linkTitle: What You Built
weight: 20
description: "A wrap-up of Part 2: the artifacts you created, and where to go next."
aliases: [/10-capstone-investigation/02-what-you-built/]
---

Working from plain-English prompts, your coding agent made these changes on the box:

| Chapter | You asked for | The agent produced |
|---|---|---|
| 7 | A module for lab assets | A published agentlab_assets module with typed fields, a picklist, role permissions and a test record |
| 8 | A playbook from a goal | A published playbook that acts on matching alerts, and a test run that proves it |
| 9 | A connector for a service | A connector that is scaffolded, packaged, installed, configured and health-checked |
| 10 | An investigation of an alert | A verdict with cited evidence, written back to the alert |

Each result ends with a check the agent ran against the box. Trust the read-back, not the success message.

Part 1 agents run inside FortiSOAR, for analysts. The Part 2 agent runs on your workstation, and it builds and changes FortiSOAR itself: modules, playbooks and connectors.

## Where to go next

- Harden what you built. Give the Part 2 agent an explicit tool allowlist, keep it read-only except when a lab needs a write, and keep its `.mcp.json` out of version control.
- Chain the pieces. Have the agent wrap a real API in a connector (chapter 9), call it from a playbook (chapter 8), and gate the playbook on an investigation verdict (chapter 3).
- For connector development at production depth, see the separate FortiSOAR Connectors workshop. For playbook authoring in depth, see the references in chapter 11.
