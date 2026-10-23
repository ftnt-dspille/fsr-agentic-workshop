---
title: Create a Custom Module
linkTitle: Custom Module
weight: 20
description: "Have the agent design and publish a custom module with fields, picklists and permissions."
---

Now a schema change: a custom module for lab assets. This is the step where verification discipline starts to matter, because module creation is a two-phase operation (staging, then an appliance-wide publish) and a module without role permissions looks created but rejects every record write.

## 1. Ask the agent

Give your agent this prompt:

```text
Use the provision_module workflow to create a custom module named
agentlab_assets (label "Agent Lab Assets") with these fields: hostname (text,
required), ip_address (text), owner (text), criticality (picklist using the
Severity picklist), and notes (rich text). Grant the Full App Permissions role
access to it, and use a probe record with hostname build-server-01,
criticality High to prove the module works. Show me the record it created and
what the workflow verified.
```

<!-- step: fsa07-02-create-module -->

Expect one workflow call, `provision_module`, that runs the phases below in order. It is confirm-gated because it commits schema changes appliance-wide, so the agent must ask you before confirming.

1. **Create** the module with the field list - it lands in **staging**.
2. **Check staging** - the workflow publishes only when nothing but your change is staged. If other changes are staged, or a publish is already running, it stops or waits and says so instead of shipping someone else's work.
3. **Publish** and wait for the migration to finish. Right after a publish the box can reject record writes for a few seconds; the workflow retries through that window, so the agent does not need to sleep or poll.
4. **Grant** the **Full App Permissions** role read, create, update and delete on `agentlab_assets`.
5. **Verify** that the caller can read the module and create a record in it. The probe record comes back in the result.

The agent can follow up with `describe_module` to show the five fields.

{{% notice warning %}}
The workflow's publish ships ALL staged schema changes on the appliance, not just yours. On a shared lab box, check with your neighbors (or your instructor) before letting the agent confirm it.
{{% /notice %}}

## 2. What success looks like

- The workflow reports the publish finished and each phase it verified; no manual waiting.
- `describe_module` lists your five fields with the right types, and the test record comes back with `hostname: build-server-01` and criticality resolved to the High picklist IRI.
- The key can read `agentlab_assets` after the role grant (the workflow and the spec both check this).

**Verify in the UI:** the new module appears in the left navigation (you may need to reload the browser). Open it; the test record is there.

<!-- capture: fsa07-02-module-in-ui -->
![fsa07-02-module-in-ui](fsa07-02-module-in-ui.png)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Record create returns 403 after publish | The role grant did not apply | Ask the agent to rerun the workflow with the role named, or grant it in the UI: Identity & Access Management > Roles > Full App Permissions, read, create, update and delete on the module |
| Module is not visible to the key after publish | The workflow stopped before publishing because other changes were staged | Read its report, clear or agree on the other staged changes, then rerun it |
| Publish times out | Busy box; publishes poll a job | Ask the agent to rerun the workflow; check System Configuration > Publish status in the UI |
| criticality arrives as plain text | Field was created as text, not a picklist binding | Delete the module (confirm-gated) and recreate; the field spec must name the picklist |
| Module not in the left nav | Browser cache | Hard-reload the FortiSOAR UI |
