---
title: Author and Publish a Playbook
linkTitle: Author + Publish
weight: 10
description: "The agent writes playbook YAML, compiles it offline, and publishes it to the box."
---

Playbooks are where agent work becomes durable: the agent investigates once, then bottles the procedure into automation that runs forever. The agent authors the playbook as YAML (the fsr_playbooks format), compiles it offline to catch mistakes, and only then pushes it to the box.

## 1. Ask the agent

Give your agent this prompt:

```text
Author a FortiSOAR playbook collection named "Agent Lab" with one playbook
"Tag Agent Lab Alerts". Trigger: when an alert is created whose name starts
with "Agent Lab". Steps: update that alert's description to
"Triaged automatically by the Agent Lab playbook", then end.
Compile the YAML first and show me the result. Fix any compile errors.
Do not publish yet.
```

<!-- step: fsa08-01-compile-yaml -->

The agent should produce YAML along these lines and run `compile_playbook_yaml` on it:

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
          description: "Triaged automatically by the Agent Lab playbook"
        next: Done
      - name: Done
        type: end
```

**What success looks like:** `compile_playbook_yaml` returns `ok: true` with the playbook name listed. The compile is fully offline - nothing touched the box yet. If it returns errors, each one carries a code, message and path; let the agent fix the YAML and recompile.

## 2. Publish

Give your agent this prompt:

```text
Looks good - publish that playbook to the box, then confirm it exists
and is active.
```

<!-- step: fsa08-02-publish-playbook -->

**Verify in the UI:** open **Playbooks** in the left navigation. The "Agent Lab" collection holds "Tag Agent Lab Alerts"; open it and check the canvas shows the three steps with the on-create trigger.

<!-- capture: fsa08-02-playbook-canvas -->
![fsa08-02-playbook-canvas](fsa08-02-playbook-canvas.png)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "pip install pyfsr[playbooks]" error | The MCP server's environment lacks the compile extra | Reinstall `fsr-agentic-toolkit` where the MCP server runs, then restart the agent |
| Compile error no_trigger | Missing the start_on_create step | The YAML needs exactly one trigger step per playbook |
| Compile ok but publish fails | Collection name collision on the box | Rename the collection or ask the agent to list existing collections first |
| Playbook exists but shows inactive | Push did not activate it | Ask the agent to verify and activate it, or toggle it in the UI |

<!-- agent-drive:begin -->

<details><summary>What the agent did</summary>

**`01-author-and-publish#1`** (Sonnet run, sanitized)

![08-playbook/01-author-and-publish#1](agent-run-01-author-and-publish-1.png)

```text
  > Skill {"skill": "fsr-playbooks"}
  > compile_playbook_yaml {"yaml_text": "collection: Agent Lab\nplaybooks:\n  - name: Tag Agent...
  > compile_playbook_yaml {"yaml_text": "collection: Agent Lab\nplaybooks:\n  - name: Tag Agent...
  > Bash {"command": "cd <repo> && grep -n -B3 -A25 \"type: start\" docs/AUTHO...
  > Bash {"command": "cd <repo> && grep -n -A14 \"start_on_create\" docs/AUTHO...
  > compile_playbook_yaml {"yaml_text": "collection: Agent Lab\nplaybooks:\n  - name: Tag Agent...
```

**`01-author-and-publish#2`** (Sonnet run, sanitized)

![08-playbook/01-author-and-publish#2](agent-run-01-author-and-publish-2.png)

```text
  > Bash {"command": "ls -la <repo>"}
  > Bash {"command": "cd <repo> && find . -newer tools/agent-drive/run.py \\( ...
```

</details>

<!-- agent-drive:end -->
