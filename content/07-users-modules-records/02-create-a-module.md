---
title: Create a Custom Module
linkTitle: Custom Module
weight: 20
description: "Have the agent design and publish a custom module with fields, a picklist and permissions."
---

Now the agent changes the schema. It creates a custom module called `agentlab_assets`. This changes the schema for the whole box, so the agent must ask you before it publishes. A new module without role permissions looks created, but it rejects every record write. So the agent also grants permissions and checks the result.

{{% notice note %}}
If the agent confirms the publish without asking you, stop it. Tell it to check with you before any confirmed action.
{{% /notice %}}

## 1. Ask the agent

Give your agent this prompt:

```text
Create a custom module named agentlab_assets (label "Agent Lab Assets") with
these fields: hostname (text, required), ip_address (text), owner (text),
criticality (picklist using the Severity picklist), and notes (rich text).
Then prove it works: create a record with hostname build-server-01,
criticality High, and show me that record.
```

<!-- step: fsa07-02-create-module -->

<!-- capture: fsa07-02-create-module -->
![fsa07-02-create-module](fsa07-02-create-module.png?height=600px)

The agent makes one workflow call, `provision_module`. The first call returns `confirmation_required`. The agent then shows you what will change and waits for your yes. After that it runs again with `confirm: true`. The workflow then does these steps in order:

1. **Create** the module with its fields. The module lands in staging.
2. **Check staging.** The workflow publishes only when your change is the only one staged. If other changes are staged, it stops and tells you.
3. **Publish** and wait for the migration to finish. For a few seconds after a publish, the box can reject record writes. The workflow retries, so you do not need to wait.
4. **Grant** the **Full App Permissions** role read, create, update and delete on `agentlab_assets`.
5. **Verify** that the login can read the module and create a record. The test record comes back in the result.

The agent can then call `describe_module` to show the five fields.

{{% notice warning %}}
The publish ships all staged schema changes on the box, not only yours. On a shared box, check with the other users before you say yes.
{{% /notice %}}

## 2. You are done when

- The workflow reports that the publish finished, and lists each step it checked.
- `describe_module` lists the five fields with the right types. The test record has `hostname` `build-server-01` and `criticality` `High`.
- The login can read `agentlab_assets` after the role grant.

**Verify in the UI:** the new module appears in the left navigation. Open it. The test record is there.

<!-- capture: fsa07-02-create-module-ui -->
![fsa07-02-create-module-ui](fsa07-02-create-module-ui.png?height=600px)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Record create returns 403 after publish | The role grant did not apply | Ask the agent to rerun the workflow and name the role. Or grant it in the UI: **Identity & Access Management** > **Roles** > **Full App Permissions**, with read, create, update and delete on the module. |
| Module is not visible after publish | The workflow stopped because other changes were staged | Read its report. Agree with the other users on the staged changes, then rerun it. |
| `criticality` arrives as plain text | The field was created as text, not as a picklist | Name the Severity picklist in the field spec. For a field that already exists, fix it in the UI under **Settings** > **Application Editor** > **Modules**. |
| Module not in the left nav | Browser cache | Hard-reload the FortiSOAR UI |
