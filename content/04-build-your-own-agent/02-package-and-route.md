---
title: Package, Upload and Route an Agent
linkTitle: Package and Route
weight: 20
description: "Package a small agent, upload it, check it is active, then make an investigation route questions to it through the tool table."
---

On this page you package the example agent, upload it, check that it is active, and route an investigation to it. A tag alone does not send questions to an agent. The `TOOL_LIST` record does, so you add a row to it.

## 1. Download the example files

Download each file below. Keep the folder layout: put the files in a folder named `workshop_hello_agent`, and put `memory.yaml` in a `config` folder and the two icons in an `images` folder.

- [info.json](/examples/workshop_hello_agent/info.json)
- [agent.py](/examples/workshop_hello_agent/agent.py)
- [prompt.yaml](/examples/workshop_hello_agent/prompt.yaml)
- [__init__.py](/examples/workshop_hello_agent/__init__.py)
- `config/memory.yaml`: [memory.yaml](/examples/workshop_hello_agent/config/memory.yaml)
- `images/small.png` and `images/large.png`: [small.png](/examples/workshop_hello_agent/images/small.png), [large.png](/examples/workshop_hello_agent/images/large.png)

Then zip the folder. Run this in the folder that contains `workshop_hello_agent`:

```bash
zip -r workshop_hello_agent.zip workshop_hello_agent
```

## 2. Turn on the upload toggle

The upload control stays hidden until an administrator turns on the **Import/Upload Custom AI Agent** setting. The setting lets users upload code that runs on the box, so it is an administrator decision. If the toggle is already on, skip this section.

1. Open **System** > **System Configuration**.
2. Select the **Advanced Development Features** tab.
3. Find the **Import/Upload Custom AI Agent** section. Open its **Important Notice** and **Risk** panels and read them.
4. Click **Edit**. Tick the accept checkbox in that section, then click **Submit**.

<!-- capture: fsa04-00-advanced-toggle -->
![fsa04-00-advanced-toggle](fsa04-00-advanced-toggle.png?height=600px)

## 3. Upload the bundle

<!-- step: fsa04-00-upload-agent -->

1. Open **Content Hub**, then select **Manage**.
2. Click **Upload**, then choose **Upload AI Agent**. The panel that opens is the upload panel.
3. If an agent with the same name already exists, tick **Replace existing version** before you choose the file.
4. Click **Browse File** and choose `workshop_hello_agent.zip`. Choosing the file uploads it and activates the agent.
5. Confirm that the **Workshop Hello Agent** card appears in the AI Agent catalog.

<!-- capture: fsa04-00-upload-agent-dialog -->
![fsa04-00-upload-agent-dialog](fsa04-00-upload-agent-dialog.png?height=600px)

## 4. Check that the agent is active

<!-- step: fsa04-01-hello-agent -->

The hello agent returns a fixed answer built from its input. It makes no LLM call, so it is a cheap way to prove the upload worked.

1. In the AI Agent catalog, open **Workshop Hello Agent**.
2. Check that the detail page shows the agent as active. This agent has no configuration fields.

<!-- capture: fsa04-01-hello-agent-detail -->
![fsa04-01-hello-agent-detail](fsa04-01-hello-agent-detail.png?height=600px)

You call the agent from a playbook on the [next page](../03-invoke-from-a-playbook/). A playbook step handles the login and waits for the answer for you.

**You are done when**

- The detail page shows **Workshop Hello Agent** as active.

## 5. Add a row to the TOOL_LIST record

<!-- step: fsa04-02-tool-list-row -->

An investigation plans one question for each row of the `TOOL_LIST` record. It sends each question to the agent in that row. The record already holds nine default rows. You add a tenth row for your agent.

{{% notice warning %}}
`TOOL_LIST` replaces the built-in tool table for every investigation on the box. Do not delete or change the nine default rows. Do not replace the record. Only add a line. A setting of No stops the row's questions too.
{{% /notice %}}

1. Open **AI Configurations**, then **Organizational Context**. Find the record **TOOL_LIST**.
2. Open the record. The **Content** field holds a markdown table with the nine default rows.

<!-- capture: fsa04-02-tool-list-row-record -->
![fsa04-02-tool-list-row-record](fsa04-02-tool-list-row-record.png?height=600px)

3. Click at the end of the last row, `| Endpoint behavior | EDR | process | Yes |`. Press **Enter**, then type a new row in the same format:

   ```text
   | <Avenue> | <Source> | <Required field> | Yes |
   ```

   - **Avenue**: a short name for the row, such as `Workshop hello`.
   - **Source**: the source the agent reads. For the hello agent, use `Workshop Hello Agent`.
   - **Required field**: the field the agent needs from the alert. For the hello agent, use `entity`.
   - **Active**: `Yes`.

4. Click **Save**.

**You are done when**

- All nine default rows are still there, and your row is the tenth.
- The record saves without an error.

## 6. Test the route with an investigation

<!-- step: fsa04-03-route-check -->

This test runs a FortiAI investigation, which spends tokens. Use the lab alert **Agent Lab - Outbound beacon to known C2 range from 10-net host**.

1. Open the alert and select **AI Investigation**. Click **Begin AI-Powered Alert Investigation**, or open the finished run if one exists.
2. Wait for the run to finish.
3. Click **Traces** and find the question your row produced. Then open the step for your agent, **Workshop Hello Agent**.

<!-- capture: fsa04-03-route-check-trace -->
![fsa04-03-route-check-trace](fsa04-03-route-check-trace.png?height=600px)

**You are done when**

- The trace shows a question for your row.
- Your agent answered that question.

If the question goes to a built-in agent instead, make your row's **Avenue** and **Required field** more specific, then run the test again.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The upload fails with `CS-AI-AGENT-11` | An agent with the same name exists | Tick **Replace existing version**, then upload again |
| Every later upload fails with "File exists" | A failed upload left its folder on the box | Delete the leftover agent folder on the box, then upload again |
| The agent runs, but no investigation question reaches it | No `TOOL_LIST` row, or the row is set to No | Add the row, and keep the nine default rows |
| The investigation stops asking its default questions | `TOOL_LIST` was replaced with a short table | Restore all nine default rows |
