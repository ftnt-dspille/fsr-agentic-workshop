---
title: Advanced Agentic Labs
linkTitle: Advanced Labs
weight: 30
description: "Four more agent jobs with proof: call a FortiSOAR-registered MCP server, let the agent repair a playbook, security-review your connector, and schedule automation that proves it fires."
---

By now the agent has oriented, triaged in bulk, built a module, authored and published a playbook, built a connector and run an investigation. These labs push further. Each one is a job that is slow or impossible to do by clicking, each ends in evidence you can check, and each uses the same agent and `.mcp.json` you already set up.

Run them in any order. Turn the read-only guard off (`FSR_MCP_READONLY` unset) for labs 1, 2 and 4; lab 3 only reads.

## 1. Call a tool on an MCP server registered in FortiSOAR

In chapter 5 you registered `agentlab-deepwiki` with FortiSOAR so its built-in agents could use it. Your coding agent can use that same registration: the toolkit reads the server's URL and authentication from FortiSOAR and calls the tool directly. FortiSOAR stays the single place where MCP servers and their credentials are managed, and every agent, inside the product or outside it, reaches the same servers.

{{% notice note %}}
This lab needs the `agentlab-deepwiki` registration from chapter 5, page 2. If you skipped it, register it first, or point the prompt at one of the built-in servers (for example `Utility Tools` and its `get_current_datetime` tool).
{{% /notice %}}

Give your agent this prompt:

```text
List the MCP servers registered in FortiSOAR. Then list the tools that
agentlab-deepwiki advertises, and use its question tool to ask the repository
modelcontextprotocol/python-sdk: "Which transport does streamable HTTP
replace?" Tell me the server and tool that answered, and the answer.
```

<!-- step: fsa10-04-registered-mcp-tool -->

<!-- capture: fsa10-04-registered-mcp-tool -->
![fsa10-04-registered-mcp-tool](fsa10-04-registered-mcp-tool.png?height=600px)

Watch the tool sequence: `list_ai_config` finds the registrations, `list_registered_mcp_tools` opens a real MCP `tools/list` against the server, and `call_registered_mcp_tool` runs the tool. The call is confirm-gated, because a registered tool can do anything on its server: the agent names the server and tool and waits for your go-ahead.

**You are done when:** the agent reports an answer from `agentlab-deepwiki` and names the tool it called (`ask_wiki_question`).

## 2. Let the agent repair a playbook on its own

In chapter 8 you told the agent what the fix was. Here you do not. The playbook below carries one of the most common mistakes in FortiSOAR playbooks: a record reference built as `/api/3/alerts/` plus the record's `@id`, which is already a full `/api/3/alerts/<uuid>` reference, so the path is doubled and the update 404s. The agent runs it, reads the failed run, has `repair_playbook` produce the fix, and proves it with a second run.

Give your agent this prompt:

```text
Save this playbook to ./repair-practice.yaml and publish it. Create an alert
named "Agent Lab repair test" to trigger it and wait for the run. Run
debug_playbook_run on that run with the YAML, then pass its result id and
the YAML to repair_playbook. Do not edit the YAML yourself: save and publish
exactly what repair_playbook returns, trigger it again with an alert named
"Agent Lab repair retest", and prove the second run finished. Show me the
line repair_playbook changed.

collection: Agent Lab
visible: true
playbooks:
  - name: Agent Lab Repair Practice
    steps:
      - name: On Alert Created
        type: start_on_create
        module: alerts
        when:
          logic: AND
          filters:
            - field: name
              op: like
              value: "Agent Lab repair%"
        next: Tag Alert
      - name: Tag Alert
        type: update_record
        module: alerts
        record: "/api/3/alerts/{{ vars.input.records[0]['@id'] }}"
        fields:
          description: "Repaired by the Agent Lab repair practice playbook"
        next: Done
      - name: Done
        type: end
```

<!-- step: fsa10-05-repair-playbook -->

<!-- capture: fsa10-05-repair-playbook -->
![fsa10-05-repair-playbook](fsa10-05-repair-playbook.png?height=600px)

`debug_playbook_run` names the failing step and the doubled reference, and `repair_playbook` takes that diagnosis plus the YAML, drops the extra `/api/3/alerts/` prefix, and re-validates the result. It only applies fixes it can make mechanically; anything else it reports as needing a hand edit rather than guessing. The second `wait_for_playbook_run` is the proof.

**You are done when:** the first run is `failed` at Tag Alert, the second run is `finished`, and the change shown is `repair_playbook`'s.

## 3. Security-review the connector you built

The agent wrote `agentlab-dadjoke` in chapter 9. Before code like that goes on a production box, it should pass the same gates a reviewer would apply. This lab runs them and then proves they catch a bad change.

Give your agent this prompt:

```text
Run validate_connector and scan_connector_code on ./agentlab-dadjoke and
report the result. Then add verify=False to its requests.get call, scan it
again and show me what the scan reports. Finally, revert that change and
scan once more to confirm it is clean.
```

<!-- step: fsa10-06-review-connector -->

<!-- capture: fsa10-06-review-connector -->
![fsa10-06-review-connector](fsa10-06-review-connector.png?height=600px)

Nothing here touches the box: both gates read the connector folder. Disabling TLS verification is a classic shortcut in connector code, and the scan flags it.

**You are done when:** the first and last scans are clean and the middle one reports the disabled TLS verification.

## 4. Schedule automation and prove it fires

A schedule that points at a deleted playbook, or never fires, fails silently. Have the agent stand one up, let the scheduler fire it on its own, and prove it from the run history. A scheduled run has no triggering record, so this lab uses a small heartbeat playbook that counts the open Agent Lab alerts.

Give your agent this prompt:

```text
Publish this playbook, then schedule it to run every minute as a schedule
named "Agent Lab heartbeat". Do not fire it by hand.

collection: Agent Lab
visible: true
playbooks:
  - name: Agent Lab Heartbeat
    steps:
      - name: Start
        type: start
        next: Count Open Lab Alerts
      - name: Count Open Lab Alerts
        type: find_record
        module: alerts
        logic: AND
        filters:
          - field: name
            operator: like
            value: "Agent Lab%"
        limit: 50
        next: Done
      - name: Done
        type: end
```

Now wait about three minutes. The scheduler fires the playbook on the minute, and it records that it fired a little later. Then give your agent this prompt:

```text
Run diagnose_schedule on "Agent Lab heartbeat" and tell me whether it has
fired on its own, whether it has any problems, and what the last run did.
Then delete the schedule.
```

<!-- step: fsa10-07-schedule-and-prove -->

<!-- capture: fsa10-07-schedule-and-prove -->
![fsa10-07-schedule-and-prove](fsa10-07-schedule-and-prove.png?height=600px)

`schedule_playbook` creates the task, `diagnose_schedule` reads the scheduler's own record (has it fired, how often) next to the playbook's run history, and `delete_schedule` cleans up behind a confirm.

**You are done when:** `diagnose_schedule` reports that the schedule has fired and its runs finish, with no problems, and the schedule is gone afterwards.

## More one-prompt jobs

These need nothing beyond the agent you already set up:

- **Connector health sweep.** "Check the health of every configured connector and give me a table of connector, configuration, status and error, broken ones first." Read-only.
- **Record forensics.** "Build a timeline for the alert named Agent Lab diag repair: every change, who made it, and whether a playbook or a person did it." `get_record_history` merges audit rows and playbook runs into one story.
- **Use case to design.** "I want to track phishing reports, enrich the sender domain and open a case when it is malicious. Classify this and sketch the modules, playbook and connector it needs." `plan_use_case` turns a sentence into a buildable plan.

## The pattern behind all of them

Every lab is the same shape: the agent reads the current state, acts under the guardrails, and then checks its own work against the box. That last step is what makes an outside agent trustworthy on FortiSOAR: it does not just say it did something, it shows you the evidence.
