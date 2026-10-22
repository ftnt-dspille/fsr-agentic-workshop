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
Create a custom module named agentlab_assets (label "Agent Lab Assets") with
these fields: hostname (text, required), ip_address (text), owner (text),
criticality (picklist using the Severity picklist), and notes (rich text).
Publish the change, then prove the module works by describing it and creating
one test record in it with hostname build-server-01, criticality High. Show me
the record you created. Do not try to grant permissions on it: that is a UI
step I will do myself.
```

<!-- step: fsa07-02-create-module -->

Expect the phases below, in order:

1. `create_module` with the field list - the module lands in **staging**. Do not pass `grant_to`: on 8.0 the grant runs through the bulk routes, which reject API-key auth, so the call fails.
2. `publish` - confirm-gated (it commits every staged schema change appliance-wide). The agent must ask you before confirming.
3. **Grant the role (UI, your step).** Open **Identity & Access Management** > **Roles**, choose **Full App Permissions**, and give it read, create, update and delete on `agentlab_assets`. The agent cannot do this with its tools.
4. `describe_module` + `create_record` + `get_record` - the proof the schema is live and writable. Before this, the agent can confirm the key reads the module; a 403 here means step 3 is not done.

{{% notice warning %}}
`publish` ships ALL staged schema changes on the appliance, not just yours. On a shared lab box, check with your neighbors (or your instructor) before letting the agent confirm it.
{{% /notice %}}

## 2. What success looks like

- `publish` reports success after a minute or two of polling.
- `describe_module` lists your five fields with the right types, and the test record comes back with `hostname: build-server-01` and criticality resolved to the High picklist IRI.
- The key can read `agentlab_assets` after the role grant (the spec checks this).

**Verify in the UI:** the new module appears in the left navigation (you may need to reload the browser). Open it; the test record is there.

<!-- capture: fsa07-02-module-in-ui -->
![fsa07-02-module-in-ui](fsa07-02-module-in-ui.png)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Record create returns 403 after publish | The role has no permission on the new module | Run the sequence in order: create_module, then publish, then grant the role (Identity & Access Management > Roles > Full App Permissions) read, create, update and delete on the module. Check that the key reads it before you create records. `grant_to` does not work with an API key on 8.0 (the bulk routes reject API keys), so the grant is a UI step |
| Module is not visible to the key after publish | The module was staged but never published | `publish` ships every staged change. Check `describe_module` after it; if it reports the module as missing, publish again and wait a minute |
| Publish times out | Busy box; publishes poll a job | Ask the agent to retry publish; check System Configuration > Publish status in the UI |
| criticality arrives as plain text | Field was created as text, not a picklist binding | Delete the module (confirm-gated) and recreate; the field spec must name the picklist |
| Module not in the left nav | Browser cache | Hard-reload the FortiSOAR UI |
