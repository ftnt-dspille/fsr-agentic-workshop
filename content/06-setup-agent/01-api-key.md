---
title: Create a Login
linkTitle: Login
weight: 10
description: "Create the FortiSOAR user login your agent will authenticate with."
---

The agent authenticates to FortiSOAR with a dedicated user login. Create one so you can see the agent's actions in the audit log under its own identity and disable it independently of your own account.

## 1. Create the user

<!-- step: fsa06-01-create-user manual: creates a user in the UI; screenshot pending recapture -->

1. Log in to your FortiSOAR instance at `https://fortisoar.example.com`.
2. Open **System** > **Identity & Access Management** > **Users**. Some versions name the tab or menu differently.
3. Click **Add**, give it a login id like `agentlab`, set a password, and assign a role with enough rights for the whole workshop. The labs do more than read and write records: chapter 7 **creates a module** (a schema change), chapter 9 **installs a connector**, and chapter 8 **publishes a playbook**. **Full App Permissions** alone covers record CRUD but not those, so pair it with **Application Administrator** (module schema and connectors), **Security Administrator** (roles and access), and **Playbook Administrator** (playbook publish) - or use a role your instructor confirms can manage modules, connectors and playbooks. In production, scope this down.

> Operators: `tools/lab_setup.py grant` unions exactly those three roles onto the login's role from an admin account, so you do not have to click through the UI. See `tools/LAB_OPERATOR.md`.
4. Save, then note the login id and password.

<!-- capture: fsa06-01-api-key-page -->
![fsa06-01-api-key-page](fsa06-01-api-key-page.png)

{{% notice warning %}}
Treat the password like any credential. It goes into your agent's MCP configuration and nowhere else: not into a git repo, not into a prompt, not into a chat transcript you might share.
{{% /notice %}}

## 2. What success looks like

The user appears in the Users list with your chosen role. Keep the login id and password handy for the next page.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No Users page under Settings | Your login lacks the Security read permission | Use an admin account or ask your instructor |
| Login works for reads but writes return 403 | The role lacks Create/Update on the module | Edit the role, or assign Full App Permissions for the lab |
| Creating a module returns 403 on `staging_model_metadatas` | The role has record CRUD but not module-schema rights | Add **Application Administrator** (Application Editor rights) to the role; Full App Permissions alone is not enough |
