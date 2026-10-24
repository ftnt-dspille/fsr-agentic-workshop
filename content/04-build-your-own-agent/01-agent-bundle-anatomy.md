---
title: Agent Bundle Anatomy
linkTitle: Bundle Anatomy
weight: 10
description: "What an agent is in FortiSOAR: a code bundle with a manifest, a class, prompts and an allowlist, and the rules that make it import cleanly."
---

An agent in FortiSOAR is a code bundle, not a point-and-click designer. You write a small package on your laptop, upload it, and then configure it in the UI: its LLM profile, its MCP servers and its masking. This page explains what goes in the bundle and which rules stop it from importing cleanly. The next page packages, uploads and routes one.

## 1. Know the bundle layout

| File or folder | What it does | Rules |
|---|---|---|
| `info.json` | The manifest: name, label, the agent class, version, description, tags, publisher, category, minimum FortiSOAR version, input and output formats, and the configuration form | Required fields must be present. Publisher and category are required. |
| `agent.py` | A class that subclasses `BaseAgent` (`from agents.base_agent import BaseAgent`) and implements `act(self, input)` | Call `self.initialize()` before doing work. Its class name must be unique across installed agents and must match `agentclass` in the manifest. |
| `prompt.yaml` | Prompts under a top-level `prompts:` key. Each has a name, a system instruction, a user instruction and a response format. | Every prompt UUID your code uses must exist in this file. |
| `config/memory.yaml` | The tool allowlist (`allowed_tools`): a map of tool-source UUID to the list of operations the agent may call | The folder must be named exactly `config`. A missing file means every tool from every source is allowed. |
| `images/` | Icons named in the manifest | A missing icon fails validation. |
| `requirements.txt` (optional) | PyPI packages and pins only | Index URLs, find-links, git URLs, direct URLs and FTP are rejected at import. |

## 2. Write the manifest carefully

A manifest is short, and most import failures come from one missing or mistyped key.

- The `name` must equal the name of the top folder in the zip.
- `agentclass` must match a class in `agent.py`, and be unique across every installed agent. Do not reuse a built-in class name.
- Declare every key, even when its value is empty. A key you leave out is stored as null, and a null can break list calls for every user, not only your agent. Use an empty list for `tags` and an empty string for an unused field, rather than omitting them.
- Tags are routing. Use `Triage` for an agent that investigations should route to, and `Insight` for one that insight planning should use. Do not tag a custom agent `Assistant`. That tag is reserved for designer and connector widgets.
- A `Test` tag makes the agent reachable only by a direct trigger.

## 3. Follow the code rules

- Call `self.initialize()` at the start of `act()`. Without it, execution fails during output validation with a null-reference error.
- Every prompt UUID referenced in code must exist in `prompt.yaml`. Otherwise the agent raises at runtime.
- Return a structured result with `answer`, `confidence` and `evidence`. A tool result should use an envelope with `status`, `result` and `error`. A bare dictionary breaks some agents that expect the envelope.
- Keep `requirements.txt` to plain PyPI names and pins.

Prompts that ship in code are re-imported on upgrade, and that reverts any edits you made to them. Keep your own prompts in your own bundle.

{{% notice note %}}
Read a real one before you write yours. FortiSOAR ships its agents as open source: see `github.com/fortinet-fortisoar/ai-agent-alert-investigation` and `ai-agent-ioc-masking`. On an 8.0.1 appliance they are installed under `/opt/fsr-ai/ai-agents/<name>_<version>/`. Each is a working example of the exact base class, the `act()` entrypoint, `prompt.yaml` and `config/memory.yaml`. Copy the structure from one of these rather than from memory.
{{% /notice %}}

## 4. Read a sample manifest

The shape below is a real 8.0.1 manifest with team-specific values left as placeholders. Declare every key, even when its value is empty.

```json
{
  "name": "workshop_hello_agent",
  "label": "Workshop Hello Agent",
  "agentclass": "WorkshopHelloAgent",
  "version": "1.0.0",
  "description": "<one sentence the router can match>",
  "publisher": "<your-team>",
  "cs_approved": false,
  "cs_compatible": true,
  "category": ["<your-category>"],
  "tags": ["Triage"],
  "fsrMinCompatibility": "8.0.1",
  "icon_small_name": "small.png",
  "icon_large_name": "large.png",
  "inputformat": {"entity": "<entity-name>"},
  "outputformat": {}
}
```

## What success looks like

- You can name the job of each file in the bundle.
- You can say why a missing `config/memory.yaml` gives an agent too much access, and why a missing manifest key can break lists for every user.
- You can point to the rule that stops a custom agent from being routed by its tag alone. It needs a row in the tool table, which the next page covers.

