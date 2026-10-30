---
title: Create a Login
linkTitle: Login
weight: 10
description: "Create the FortiSOAR user login your agent will authenticate with."
---

The agent authenticates to FortiSOAR with a dedicated user login. Create one so you can see the agent's actions in the audit log under its own identity and disable it independently of your own account.

## 1. Create the user

<!-- step: fsa06-01-create-user manual: creates a user in the UI -->

1. Log in to your FortiSOAR instance at `https://fortisoar.example.com`.
2. Open **System** > **Identity & Access Management** > **Users**.
3. Click **Add**, give it a login id like `agentlab`, and set a password.
4. Assign a role with enough rights for the whole workshop (next section), then **Save** and note the login id and password.

<!-- capture: fsa06-01-create-user -->
![fsa06-01-create-user](fsa06-01-create-user.png?height=600px)

{{% notice warning %}}
Treat the password like any credential. It goes into your agent's MCP configuration and nowhere else: not into a git repo, not into a prompt, not into a chat transcript you might share.
{{% /notice %}}

## 2. Give the role enough rights

The labs do more than read and write records. Chapter 7 **creates a module** (a schema change), chapter 8 **publishes a playbook**, and chapter 9 **installs a connector** - none of which **Full App Permissions** covers on its own. Pair it with three administrator roles:

| Role | Covers |
|---|---|
| Application Administrator | module schema and connectors |
| Security Administrator | roles and access |
| Playbook Administrator | playbook publish |

Or use any role your instructor confirms can manage modules, connectors and playbooks. In production, scope this down.

> Operators: `tools/lab_setup.py grant` unions exactly those three roles onto the login's role from an admin account, so you do not have to click through the UI. See `tools/LAB_OPERATOR.md`.

The user now appears in the Users list with your chosen role. Keep the login id and password handy for the next page.
