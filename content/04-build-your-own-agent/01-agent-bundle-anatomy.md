---
title: Agent Bundle Anatomy
linkTitle: Bundle Anatomy
weight: 10
description: "What an agent is in FortiSOAR: a code bundle with a manifest, a class, prompts and an allowlist, and the rules that make it import cleanly."
---

A FortiSOAR agent is a code bundle: a folder of files that you zip and upload. After the upload you configure the agent in the UI, with its LLM profile, its MCP servers and its masking. This page explains the files in a bundle. The next page uses the example bundle.

## 1. Know the bundle layout

| File or folder | What it does | Rules |
|---|---|---|
| `info.json` | The manifest: name, label, agent class, version, description, tags, publisher, input format and output format | Every key must be present. |
| `agent.py` | A class that subclasses `BaseAgent` (`from agents.base_agent import BaseAgent`) and has an `act(self, input_data)` method | Call `self.initialize()` first. The class name must be unique and must match `agentclass` in the manifest. |
| `prompt.yaml` | Prompts under a top-level `prompts:` key. Each prompt has a name, a system instruction, a user instruction and a response format. | Every prompt UUID that the code uses must exist in this file. |
| `config/memory.yaml` | The tool allowlist. It maps each tool source UUID to the operations the agent may call. | The folder must be named `config`. If the file is missing, every tool from every source is allowed. |
| `images/` | The icons named in the manifest | A missing icon fails validation. |
| `requirements.txt` (optional) | PyPI packages and version pins only | Index URLs, git URLs and direct URLs are rejected. |

## 2. Fill in the manifest

Most import failures come from one missing or mistyped manifest key.

- `name` must match the name of the top folder in the zip.
- `agentclass` must match the class in `agent.py`. It must be unique, so do not reuse a built-in class name.
- Declare every key, even when its value is empty. Use `""` for an empty text value and `[]` for an empty list. A missing key is stored as null, and a null can break agent lists for every user.
- `tags` route the agent. Use `Triage` for an agent that investigations should route to, and `Insight` for one that insight planning should use. Do not tag a custom agent `Assistant`. That tag is reserved for designer widgets.

## 3. Follow the code rules

- Call `self.initialize()` at the start of `act()`. Without it, the agent fails during output validation with a null-reference error.
- Every prompt UUID that the code uses must exist in `prompt.yaml`. Otherwise the agent raises an error at runtime.
- Return a result with `answer`, `confidence` and `evidence`. Tool results use an envelope with `status`, `result` and `error`.

FortiSOAR ships its own agents as open source, at `github.com/fortinet-fortisoar/ai-agent-alert-investigation` and `github.com/fortinet-fortisoar/ai-agent-ioc-masking`. Read one before you write your own.

## 4. Read the example manifest

These are the key lines from the example bundle's `info.json`. Open the full file in the next page's download list to see every key.

```json
{
  "name": "workshop_hello_agent",
  "label": "Workshop Hello Agent",
  "agentclass": "WorkshopHelloAgent",
  "tags": ["Triage"],
  "inputformat": {"entity": "Host to look up"}
}
```

The `inputformat` tells callers what to send. The hello agent expects an `entity`, such as a host name.

## You are done when

- You can name the job of each file in the bundle.
- You can explain why a missing `config/memory.yaml` gives an agent too much access, and why a missing manifest key can break lists for every user.
