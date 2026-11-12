---
title: Invoke an Agent from a Playbook
linkTitle: Invoke from a Playbook
weight: 30
description: "Install the connector that calls agents, call your agent from a playbook, and branch on its answer."
---

A playbook is where an agent's answer turns into action. On this page you build a playbook that calls the hello agent and branches on the answer. Put any change after a manual-input step.

The playbook calls the agent with the Remote FortiSOAR connector's **Invoke AI Agent** step. It triggers the agent, waits for the answer and returns it in one step, signed in as a user. The chat assistant cannot run a named agent on demand: typing the agent's name into the chat does not call it.

## 1. Install the Remote FortiSOAR connector with Invoke AI Agent

The Remote FortiSOAR connector in the Content Hub does not have the **Invoke AI Agent** operation yet. This lab ships a build that does: version 2.1.0, by Mahdi Naili and Priyank Mankad.

1. Download [`remote-fortisoar-2.1.0.tgz`](/examples/connectors/remote-fortisoar-2.1.0.tgz).
2. Open **Content Hub**, then select **Manage**. Click **Upload**, then choose **Upload Connector**, and pick the file.

   <!-- step: fsa04-01b-upload-connector-dialog -->
   <!-- capture: fsa04-01b-upload-connector-dialog -->
   ![fsa04-01b-upload-connector-dialog](fsa04-01b-upload-connector-dialog.png?height=600px)

3. Open the installed **FortiSOAR** connector (Remote FortiSOAR) and add a configuration:
   - **FortiSOAR Endpoint URL**: your box's URL, the same one you open in the browser, for example `https://fortisoar.example.com`. The connector calls your own box.
   - **Authentication Type**: **Basic**. Enter your FortiSOAR login and password. An API key does not work: the AI service rejects it.
   - **Verify SSL**: off.
   - Tick **Mark As Default Configuration**, so playbook steps use it without naming it.

   <!-- step: fsa04-01-remote-fortisoar-config -->
   <!-- capture: fsa04-01-remote-fortisoar-config -->
   ![fsa04-01-remote-fortisoar-config](fsa04-01-remote-fortisoar-config.png?height=600px)

4. Save the configuration. The health check shows **Available**.

**You are done when** the connector's configuration is **Available** and its operations list includes **Invoke AI Agent**.

## 2. Build the playbook

Build the playbook in the playbook designer. Put it in the **Agent Lab** collection, and name it **Agent Lab - Invoke Hello Agent**.

<!-- step: fsa04-04-playbook-branch -->

1. Add the trigger **On Alert Created**, with the condition **Name** starts with `Agent Lab hello`. The playbook then runs only for your test alerts.
2. Add an **Invoke AI Agent** step from the Remote FortiSOAR connector. Pick the connector's configuration in the step, and make sure that configuration logs in as a user (Basic authentication). An API key does not work: the AI service rejects it.
3. In the step's **Inputs**, set:
   - **Agent Name** (the agent_name input): `workshop_hello_agent`
   - **Agent Payload** (the body input): `{"entity": "host-01.example.com"}`

   <!-- step: fsa04-04-invoke-step-config -->
   <!-- capture: fsa04-04-invoke-step-config -->
   ![fsa04-04-invoke-step-config](fsa04-04-invoke-step-config.png?height=600px)

4. Add a **Decision** step named **Confidence Check**. Use the confidence value from the Invoke AI Agent output as its input. That value sits under data in the step output. Add two branches: **High confidence** and **Low confidence**.

   <!-- step: fsa04-04-decision-config -->
   <!-- capture: fsa04-04-decision-config -->
   ![fsa04-04-decision-config](fsa04-04-decision-config.png?height=600px)

5. Add a step to each branch. The example uses **Auto Close** on the High confidence branch and **Needs Review** on the Low confidence branch, so the run log shows which branch it took.
6. Save the playbook. Its status shows **Active**.

If you get stuck, the finished playbook is in [`invoke_hello_agent.yaml`](/examples/playbooks/invoke_hello_agent.yaml).

<!-- capture: fsa04-04-playbook-branch-decision -->
![fsa04-04-playbook-branch-decision](fsa04-04-playbook-branch-decision.png?height=600px)

**Run it.** Create an alert named `Agent Lab hello test` in the Alerts module. The playbook starts on its own. The hello agent always returns **low**, so the run takes the **Low confidence** branch and skips **Auto Close**.

Open the alert's **Executed Playbook Logs**, and select the run of **Agent Lab - Invoke Hello Agent**. The log shows the branch the run took.

<!-- capture: fsa04-04-playbook-branch-run -->
![fsa04-04-playbook-branch-run](fsa04-04-playbook-branch-run.png?height=600px)

Click the **Invoke AI Agent** step to see its output. The agent's answer and its confidence are under data. The step's status shows **Success**.

<!-- capture: fsa04-04-playbook-branch-step-output -->
![fsa04-04-playbook-branch-step-output](fsa04-04-playbook-branch-step-output.png?height=600px)

**You are done when**

- The Invoke AI Agent step returns the agent's answer under data, with a status of **Success**.
- The Decision step takes the branch that matches the confidence value.
- The connection uses a user login.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The Invoke AI Agent step fails to authenticate | The connector uses an API key, not a user login | Reconfigure it with a user login |
| The connector has no invoke_agent operation | The Content Hub version of the connector is installed | Upload the 2.1.0 package from section 1 |
| The branch always takes the same path | The Decision reads a field that is not in the step output | Open the step output and choose the field that is there |
