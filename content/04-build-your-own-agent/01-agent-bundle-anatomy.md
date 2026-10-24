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
| `agent.py` | A class that subclasses the base agent and implements `act()` | Must call `self.initialize()` first. Its class name must be unique across installed agents. |
| `prompt.yaml` | Prompts keyed by UUID. Each has a name, a system instruction, a user instruction and a response format. | Every prompt UUID your code uses must exist in this file. |
| `config/memory.yaml` | The per-MCP-server tool allowlist, keyed by server UUID | The folder must be named exactly `config`. A missing file means every tool from every server is allowed. |
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
The exact names of the base class and helper methods depend on your build's agent SDK. Copy them from a shipped sample agent on your box rather than from memory, and confirm the import rules on your build.
{{% /notice %}}

## 4. Read a sample manifest

The shape below is illustrative. It shows the keys a manifest carries, with placeholder values. Check the exact fields against your build's packaging tool.

```json
{
  "name": "workshop_hello_agent",
  "label": "Workshop Hello Agent",
  "agentclass": "WorkshopHelloAgent",
  "version": "1.0.0",
  "description": "<one sentence the router can match>",
  "tags": ["Triage"],
  "publisher": "<your-team>",
  "category": "<your-category>",
  "fsrMinCompatibility": "<minimum-version>",
  "inputformat": {"entity": "<entity-name>"},
  "outputformat": {},
  "configuration": {}
}
```

## What success looks like

- You can name the job of each file in the bundle.
- You can say why a missing `config/memory.yaml` gives an agent too much access, and why a missing manifest key can break lists for every user.
- You can point to the rule that stops a custom agent from being routed by its tag alone. It needs a row in the tool table, which the next page covers.

