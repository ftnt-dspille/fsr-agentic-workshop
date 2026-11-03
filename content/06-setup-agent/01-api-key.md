---
title: Create a Login
linkTitle: Login
weight: 10
description: "Create the FortiSOAR user login that your agent signs in with."
---

The agent signs in to FortiSOAR with its own user login. Its actions then show in the audit log under that login. You can also disable the login without touching your own account.

## 1. Create the user

<!-- step: fsa06-01-create-user manual: creates a user in the UI -->

1. Log in to your FortiSOAR instance at `https://fortisoar.example.com`.
2. Open **System** > **Identity & Access Management** > **Users**.
3. Click **Add**. Enter a login id, such as `agentlab`, and a password.
4. Assign the **Full App Permissions** role and the three roles in section 2. Click **Save**. Write down the login id and password.

<!-- capture: fsa06-01-create-user -->
![fsa06-01-create-user](fsa06-01-create-user.png?height=600px)

{{% notice warning %}}
Treat the password like any credential. It goes into your agent's MCP configuration and nowhere else: not into a git repo, not into a prompt, and not into a chat that you might share.
{{% /notice %}}

## 2. Add the administrator roles

Chapter 7 creates a module, chapter 8 publishes a playbook, and chapter 9 installs a connector. **Full App Permissions** does not cover these on its own. Add these three roles as well:

| Role | Needed for |
|---|---|
| Application Administrator | Module schema and connectors |
| Security Administrator | Roles and access |
| Playbook Administrator | Playbook publish |

Or use any role that can manage modules, connectors and playbooks. In production, give the login only the rights it needs.

The login now appears in the **Users** list with its roles.
