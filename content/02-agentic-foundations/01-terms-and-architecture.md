---
title: Terms and Architecture
linkTitle: Terms and Architecture
weight: 10
description: "The vocabulary of FortiSOAR Agentic AI: what each part does, what it does not do, and how a question flows through it."
---

FortiSOAR Agentic AI has many parts, and some words name more than one thing. This page defines the words the rest of the workshop uses. It also shows how a request flows through the parts.

Four building blocks carry most of the vocabulary: the agents that do the work, the skills that instruct them, the organization context that grounds them in your environment, and the MCP tools they reach data through.

![The four building blocks: agents (specialists that each own one job), skills (each agent's instructions), organization context (your SOPs, hours and approved activity) and MCP tools (connections to FortiSOAR data and external servers)](diagram-building-blocks.png)

## 1. Learn the vocabulary

| Term | What it means | Watch out for |
|---|---|---|
| FortiSOAR Agentic AI | The whole feature: agents, MCP servers, LLM routing and investigations | The settings sometimes say "FortiAI". Both names mean the same feature. |
| AI features enablement | A system-level switch. Until it is on, the AI services refuse work. | An administrator turns it on. Chapter 2's tour checks that it is on. |
| Agent | A packaged unit: a manifest, a Python class, prompts and an optional tool allowlist | Agents are code bundles, not a point-and-click designer. Chapter 4 covers them. |
| Agent tag | A routing gate. **Triage** lets the investigation planner use an agent. **Insight** lets insight planning use it. **Assistant** is reserved for designer widgets. | An agent with no matching tag is never used by the planner. |
| MCP server | A server that exposes tools to agents over the Model Context Protocol | Built-in servers come with FortiSOAR. You register external ones in chapter 5. |
| LLM profile | A named model configuration that agents point to | Profile names can differ on your build. |
| Prompt | A named record (system instruction, user instruction, response format) that an agent calls by UUID | Prompts that ship in code are re-imported on upgrade, which reverts your edits. |
| Skill | Instructions an agent follows | Not a separate screen. In this workshop it only shows up in prompt names, such as `Skills - <persona> - <task>`. |
| Organization context | Records that shape investigations: SOPs, the tool table, risk criteria, approved activity, role profiles | Check that the record exists before you rely on it. |
| SOP | An organization context record for one alert type, or for DEFAULT | Lookups are exact and case-sensitive. working_hours does not match WORKING_HOURS. |
| Plan | The ordered question list the planner writes before evidence is gathered | The planner writes it once. Answers do not change the plan. |
| Hypothesis | A candidate explanation, such as benign, malicious or suspicious, with questions that support or weaken it | Hypothesis statuses are confirmed, ruled out or inconclusive. |
| Verdict | The alert-level result: Malicious, Suspicious, Benign, False Positive or Inconclusive | "Confirmed" is a hypothesis status, not a verdict. |
| Trace | The step-by-step record of one run: agent steps, LLM calls, tool calls and token counts | Prompts in a trace are masked. |
| Masking | Regex masking of indicators such as URLs, IP addresses, hashes and emails before LLM calls, reversed afterwards | Masking covers LLM messages only. It is not a privacy guarantee. |
| Orchestrator | A request engine that plans tasks from installed agents and pauses for approval before writes | It is not the alert investigation. Learn the two separately. |

{{% notice note %}}
Some product walkthroughs call the alert investigation agent "the orchestrator". They are different things. The investigation runs a fixed sequence for an alert. The orchestrator plans work from a question.
{{% /notice %}}

## 2. Follow a request through the stack

An agent asks its MCP servers which tools exist. It loads its skills and your organization context, then sends the question and the tool list to the model. The model only picks a tool. The agent makes the call through MCP, and every step goes into the trace.

![Under the hood: an analyst or playbook asks the agent to investigate an alert; the agent lists tools from its MCP server, retrieves skills and organization context, sends the prompt plus tool list to the LLM, the model selects a tool, and the agent invokes it through MCP to reach your tools](diagram-agent-mcp-llm-loop.png)

Every request starts with an intent: an analyst clicks a button, types a question, or a playbook calls an API. The path depends on the kind of intent:

1. **Intent.** An alert investigation, an AI Assistant question, an insight, or a direct agent call.
2. **Control.** An alert investigation runs a fixed sequence of stages. The orchestrator and the insight planner decide which agents to run, so their path changes with the question.
3. **Agents.** Reasoning agents call the LLM. Tool-using agents call the MCP tools they are allowed to use.
4. **Context.** Organization context and the linked records shape the questions and the answers.
5. **Results.** A verdict and summary are written back to the alert, or an insight card is updated. The trace records every step.

{{% notice note %}}
Menu names and labels can differ between 8.0.x builds. Start from the AI area of the left navigation and look for the item name.
{{% /notice %}}

## 3. Know where the settings are

You will change four things during the workshop. Find each one before you need it:

- **Organization context**: SOPs, the tool table and risk criteria, under AI Configurations.
- **Agents**: the agent catalog. Each agent shows its LLM profile, its MCP servers and its masking setting.
- **Prompts**: the prompt records that agents call by UUID. Editing them in the UI may be limited on your build.
- **MCP servers**: the built-in and registered servers. Chapter 5 covers registration.

The next page covers which paths can change data. The tour after it walks through the screens on your box.
