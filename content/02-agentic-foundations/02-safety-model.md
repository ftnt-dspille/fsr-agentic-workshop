---
title: Who Can Change Data
linkTitle: Who Can Change Data
weight: 20
description: "Which AI paths can read, which can recommend, and which can change data, and why playbooks with manual-input steps make the decisions."
---

An agent that can read your alerts is useful. An agent that can change them needs a different level of trust. Before you run anything, learn which paths in this feature only read, which only recommend, and which can write.

Four controls keep agents in bounds: they run as a real user with that user's permissions, indicators are masked before anything reaches the model, actions go through playbooks where people approve them, and every agent, tool and model call is traceable.

![Staying in control: agents run as a user (real identity and permissions, no superuser), masked data (indicators masked before anything is sent to the model), people decide (actions go through playbooks with approval steps you define) and fully traceable (every agent, tool and model call is logged)](diagram-staying-in-control.png)

## 1. Read the table

| Path | Can it change data? | What it can change |
|---|---|---|
| Alert investigation | Writes three AI fields only | The verdict, severity and summary on the alert. Next steps are advisory text. It does not change status, owner or closure. |
| Orchestrator | Yes, through agents | Whatever the agents it calls are allowed to do. Writes you did not ask for pause for approval. |
| AI Assistant (chat) | Yes, directly | Whatever the tools it can call are allowed to do. Treat chat-driven writes as unconfirmed until you have tested them on your build. |
| AI Insights | No write tools | The insight-tagged agents are read-only. |
| Playbooks you build | Whatever the playbook does | Anything you wire it to do, including changes that an analyst should approve. |

## 2. Apply the rule

**AI recommends. Playbooks with manual-input steps decide.**

An investigation can tell you that an address looks malicious and that the next step is to block it. That is a recommendation, and the verdict and summary are text on the alert. The action itself belongs in a playbook, with a manual-input step before the write, so that a person confirms it.

{{% notice warning %}}
Do not assume that every AI surface asks for confirmation before it writes. The orchestrator and the chat assistant can reach write tools. Test any write path in a sandbox first, and keep approvals in the playbook, not in the prompt.
{{% /notice %}}

## 3. Know whose identity a call uses

Tool calls run with an identity. For built-in servers, and for servers registered with the `fsr` authentication type, the call carries the caller's FortiSOAR token. For a server that uses a static bearer token, an API key or no authentication, every call uses one fixed identity.

Before you grant an agent write tools, answer two questions:

- Whose token does this agent's call carry?
- Would that identity be allowed to make the change by hand?

If you cannot answer both, keep the agent read-only.

## You are done when

- You can name, for each path in the table, whether it reads, recommends or writes.
- You can state the rule without looking at this page: AI recommends, playbooks with manual-input steps decide.

