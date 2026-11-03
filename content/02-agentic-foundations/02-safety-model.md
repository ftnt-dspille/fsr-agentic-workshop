---
title: Who Can Change Data
linkTitle: Who Can Change Data
weight: 20
description: "Which AI paths can read, which can recommend, and which can change data, and why playbooks with manual-input steps make the decisions."
---

An agent that can read your alerts is useful. An agent that can change them needs more trust. Before you run anything, learn which paths only read, which only recommend, and which can write.

Four controls keep agents in bounds. They run as a real user with that user's permissions. Indicators are masked before they reach the model. Actions go through playbooks where people approve them. Every agent, tool and model call is logged.

![Staying in control: agents run as a user (real identity and permissions, no superuser), masked data (indicators masked before anything is sent to the model), people decide (actions go through playbooks with approval steps you define) and fully traceable (every agent, tool and model call is logged)](diagram-staying-in-control.png)

## 1. Read the table

| Path | Can it change data? | What it can change |
|---|---|---|
| Alert investigation | Writes three AI fields only | The verdict, severity and summary on the alert. Next steps are text. Status, owner and closure are not changed. |
| Orchestrator | Yes, through agents | Whatever the agents it calls can do. Writes you did not ask for pause for approval. |
| AI Assistant (chat) | Yes, directly | Whatever its tools can do. Treat chat-driven writes as unconfirmed until you test them on your build. |
| AI Insights | No write tools | The insight agents are read-only. |
| Playbooks you build | Whatever the playbook does | Anything you wire it to do, including changes an analyst should approve. |

## 2. Apply the rule

**AI recommends. Playbooks with manual-input steps decide.**

An investigation can say that an address looks malicious and that it should be blocked. That is a recommendation. The verdict and summary are text on the alert. The block itself belongs in a playbook, after a manual-input step where a person confirms it.

{{% notice warning %}}
Do not assume every AI surface asks for confirmation before it writes. The orchestrator and the chat assistant can reach write tools. Test any write path in a sandbox first, and keep approvals in the playbook, not in the prompt.
{{% /notice %}}

## 3. Know whose identity a call uses

Tool calls run as an identity. For built-in servers, and for servers registered with the `fsr` authentication type, the call carries your FortiSOAR token. For a server that uses a static bearer token, an API key or no authentication, every call uses one fixed identity.

Before you give an agent write tools, answer two questions:

- Whose identity does this agent's call carry?
- Would that identity be allowed to make the change by hand?

If you cannot answer both, keep the agent read-only.

## You are done when

- You can say, for each path in the table, whether it reads, recommends or writes.
- You can state the rule without looking at this page: AI recommends, playbooks with manual-input steps decide.
