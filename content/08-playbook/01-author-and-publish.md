---
title: Author and Publish a Playbook
linkTitle: Author + Publish
weight: 10
description: "The agent writes playbook YAML, compiles it offline, and publishes it to the box."
---

A playbook is automation that runs on its own, without an agent. In this page the agent writes the playbook as YAML (the fsr_playbooks format), compiles it offline to catch mistakes, and then publishes it to the box.

The toolkit includes the YAML format, so the agent does not need outside docs. It reads the format with the `playbook_yaml_reference` tool.

## 1. Ask the agent

Give your agent this prompt:

```text
Build a FortiSOAR playbook collection named "Agent Lab" with one playbook
"Tag Agent Lab Alerts". Goal: when an alert is created whose name starts with
"Agent Lab", append "Triaged automatically by the Agent Lab playbook" to that
alert's description, keeping the text already there, then end. Name the three steps "On Alert Created" (the
on-create trigger), "Tag Alert" (the update-record step) and "Done" (the end).
Author the playbook YAML, compile it and fix any errors, and show me the
compiled result. Do not publish yet.
```

<!-- step: fsa08-01-compile-yaml -->

<!-- capture: fsa08-01-compile-yaml -->
![fsa08-01-compile-yaml](fsa08-01-compile-yaml.png?height=600px)

The agent writes YAML close to the example below and checks it with `compile_playbook_yaml`. You do not type this YAML. It shows what a correct result looks like.

```yaml
collection: Agent Lab
visible: true
playbooks:
  - name: Tag Agent Lab Alerts
    steps:
      - name: On Alert Created
        type: start_on_create
        module: alerts
        when:
          logic: AND
          filters:
            - field: name
              op: like
              value: "Agent Lab%"
        next: Tag Alert
      - name: Tag Alert
        type: update_record
        module: alerts
        record: "{{ vars.input.records[0]['@id'] }}"
        fields:
          description: "{{ vars.input.records[0].description | default('', true) }} Triaged automatically by the Agent Lab playbook"
        next: Done
      - name: Done
        type: end
```

**You are done when:** `compile_playbook_yaml` returns `ok: true` and lists the playbook name. Compiling is offline, so nothing on the box changed. If it returns errors, each one gives a code, a message and a path. Tell the agent to fix the YAML and compile again.

## 2. Publish

Give your agent this prompt:

```text
Looks good - publish the "Tag Agent Lab Alerts" playbook in the "Agent Lab"
collection you just compiled to the box, then confirm it exists and is active.
```

<!-- step: fsa08-02-publish-playbook -->

<!-- capture: fsa08-02-publish-playbook -->
![fsa08-02-publish-playbook](fsa08-02-publish-playbook.png?height=600px)

**Verify in the UI:** open **Playbooks** in the left navigation. Open the "Agent Lab" collection, then "Tag Agent Lab Alerts". The canvas shows three steps, starting with the on-create trigger.

<!-- capture: fsa08-02-publish-playbook-canvas -->
![fsa08-02-publish-playbook-canvas](fsa08-02-publish-playbook-canvas.png?height=600px)

This page built the playbook with your coding agent, writing YAML outside
FortiSOAR. The **Agentic Assistant** builds from the inside: on the Playbook
Designer, the same launcher you met in chapter 3 compiles a plain-English
request into steps, shows you the plan, and puts it on your canvas -- you
still click **Apply** and publish it yourself. That flow is page 6, "Build
With the Assistant".

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent guesses the YAML shape or reaches for outside docs | It skipped the toolkit's own reference | Tell it to read the `playbook_yaml_reference` tool first |
| Compile error `no_trigger` | The playbook has no start_on_create step | The YAML needs exactly one trigger step per playbook |
| Compile or publish reports a missing Python package | The toolkit is not fully installed where the MCP server runs | Reinstall `fsr-agentic-toolkit==0.2.3` there, then restart the agent |
| Playbook exists but shows inactive | Publish did not activate it | Ask the agent to check it and activate it |
