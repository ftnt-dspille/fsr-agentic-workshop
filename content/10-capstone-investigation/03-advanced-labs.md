---
title: Advanced Agentic Labs
linkTitle: Advanced Labs
weight: 30
description: "Four more agent jobs with proof: call a FortiSOAR-registered MCP server, let the agent repair a playbook, security-review your connector, and schedule automation that proves it fires."
---

These labs give the agent larger jobs. Each job ends with evidence you can check. Each lab uses the same agent and `.mcp.json` you set up earlier.

Turn the read-only guard off (`FSR_MCP_READONLY` unset) for labs 1, 2, 4 and 5. Labs 3, 6 and 7 only read. Lab 3 needs the `agentlab-dadjoke` folder from chapter 9. Lab 6 needs the capstone alert from page 1.

## 1. Call a tool on an MCP server registered in FortiSOAR

In chapter 5 you registered `agentlab-deepwiki` with FortiSOAR. Your coding agent can use the same registration. The toolkit reads the server's URL and login from FortiSOAR and calls the tool.

{{% notice note %}}
This lab needs the `agentlab-deepwiki` registration from chapter 5, page 2. If you skipped it, point the prompt at a built-in server instead, for example `Utility Tools` and its `get_current_datetime` tool.
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

The agent lists the registrations, lists the server's tools, and then calls the question tool. The call needs your go-ahead, because a registered tool can do anything on its server.

**You are done when:** the agent reports an answer from `agentlab-deepwiki` and names the tool it called (`ask_wiki_question`).

## 2. Let the agent repair a playbook on its own

In chapter 8 you told the agent the fix. Here the agent finds the fix itself. The playbook below has a common mistake. The record reference is `/api/3/alerts/` plus the record's `@id`. The `@id` already starts with `/api/3/alerts/`, so the path is doubled and the update fails with a 404.

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

`debug_playbook_run` names the failing step and the doubled reference. `repair_playbook` removes the extra `/api/3/alerts/` prefix and checks the result. It applies only fixes it can make mechanically. Anything else, it reports as a change for you to make by hand.

**You are done when:** the first run is `failed` at Tag Alert, the second run is `finished`, and the change shown is the one `repair_playbook` made.

## 3. Security-review the connector you built

The agent wrote `agentlab-dadjoke` in chapter 9. Before code like that goes on a production box, it should pass the same checks a reviewer would apply. This lab runs the checks, then adds a deliberate security flaw to confirm the checks catch it.

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

Both checks read the connector folder only, so nothing on the box changes. Turning off TLS certificate verification (`verify=False`) is a common shortcut in connector code. The scan flags it.

**You are done when:** the first and last scans are clean, and the middle scan reports the disabled TLS verification.

## 4. Schedule automation and prove it fires

A schedule has no triggering record, so this lab uses a small heartbeat playbook. It counts the open Agent Lab alerts on each run. You prove the schedule fired on its own, with no manual run.

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

<!-- capture: fsa10-07-schedule-create -->
![fsa10-07-schedule-create](fsa10-07-schedule-create.png?height=600px)

Now wait about three minutes. The scheduler fires the playbook on the minute, but it records the fire a little later. If the next prompt says the schedule has not fired yet, wait a few more minutes and run it again.

Give your agent this prompt:

```text
Run diagnose_schedule on "Agent Lab heartbeat" and tell me whether it has
fired on its own, whether it has any problems, and what the last run did.
Then delete the schedule.
```

<!-- step: fsa10-07-schedule-and-prove -->

<!-- capture: fsa10-07-schedule-and-prove -->
![fsa10-07-schedule-and-prove](fsa10-07-schedule-and-prove.png?height=600px)

**You are done when:** `diagnose_schedule` reports that the schedule has fired, its runs finish, and it has no problems. The schedule is gone afterwards.

## 5. Plan a use case and build it end to end

One sentence in, a working use case out: a custom module, a playbook on it, and a test record that proves both.

Give your agent this prompt:

```text
I want to track lost or stolen laptops. Plan it with plan_use_case, then
build it: a custom module "agentlab_lost_devices" (singular "Lost Device")
with an asset tag, the owner's email, the date it was reported and a status,
and a playbook "Agent Lab Lost Device Alert" in the "Agent Lab" collection
that raises a Critical alert named "Agent Lab lost device <asset tag>" when a
device is reported. Prove it with one test report for asset tag LT-0042,
reported 2026-03-14, and show me the alert it raised.
```

<!-- step: fsa10-08-plan-and-build -->

<!-- capture: fsa10-08-plan-and-build -->
![fsa10-08-plan-and-build](fsa10-08-plan-and-build.png?height=600px)

The module in FortiSOAR, with the test record the agent created:

<!-- capture: fsa10-08-module-in-soar -->
![fsa10-08-module-in-soar](fsa10-08-module-in-soar.png?height=600px)

Publishing a module takes a few minutes. Let the agent finish.

**You are done when:** the LT-0042 record exists with its reported date, and a Critical "Agent Lab lost device LT-0042" alert was raised by the playbook.

## 6. Record forensics

Every record keeps an audit trail and a list of the playbook runs that touched it. The agent can combine them into a timeline.

Give your agent this prompt:

```text
Build a timeline for the alert "Agent Lab - beaconing from web-server-01":
every change, when it happened, which fields changed, and whether a person,
an API user or a playbook made it. Mark anything you cannot attribute.
```

<!-- step: fsa10-09-record-forensics -->

<!-- capture: fsa10-09-record-forensics -->
![fsa10-09-record-forensics](fsa10-09-record-forensics.png?height=600px)

**You are done when:** the timeline shows the creation, the playbook's tag and the investigation's write-back in order, and each change is attributed.

## 7. Optional: compare staging and production

If you have access to two FortiSOAR boxes, the agent can compare them. Name both boxes in `~/.pyfsr/instances.toml`. Each entry points at an env file that holds that box's `FSR_*` login, so no credential goes in the TOML file:

```toml
[instances.staging]
env_file = "~/agent-lab/.env.staging"

[instances.production]
env_file = "~/agent-lab/.env.production"
```

Restart the agent. Then give it this prompt:

```text
Compare the FortiSOAR instances "staging" and "production" without changing
anything: version, installed connectors and their versions, playbook
collections, and custom modules. Give me one table of the differences, and
say which differences would break a playbook copied from staging to
production.
```

<!-- step: fsa10-10-staging-vs-production -->

<!-- capture: fsa10-10-staging-vs-production -->
![fsa10-10-staging-vs-production](fsa10-10-staging-vs-production.png?height=600px)

**You are done when:** the table lists real differences from both boxes, and the agent names at least one difference that would break a promoted playbook. If there is none, it says so.

## More one-prompt jobs

- **Connector health sweep.** "Check the health of every configured connector and give me a table of connector, configuration, status and error, broken ones first." This is read-only.
