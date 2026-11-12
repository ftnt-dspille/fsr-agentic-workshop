---
title: Run and Read an AI Investigation
linkTitle: Run an Investigation
weight: 10
description: "Start an AI investigation on an alert, read its hypotheses, questions and verdict, and check what it wrote back to the alert."
---

An AI investigation takes one alert and works through it in a fixed order. It classifies the alert, forms hypotheses, plans questions, gathers evidence, scores the evidence, and writes a verdict back to the alert. On this page you run one, read the result the way an analyst would, and check the write-back before you trust it.

## 1. Know the stages

Think of a run as a small experiment: the hypotheses are the claims, the questions are the tests, and the evidence either supports or weakens each claim. The stages run in the same order every time. Only the answers change.

| Stage | What happens | Calls the LLM | Calls tools |
|---|---|---|---|
| Normalization | The raw alert becomes a normalized card, classified by type | Yes | No |
| Jailbreak check | An LLM check of the raw alert. An unsafe result ends the run with a blocked summary, and the alert is not updated. | Yes | No |
| Insufficient-data check | A code check. An unknown type with no indicators ends as Inconclusive. | No | No |
| Context enrichment | Linked indicators, alerts and assets are pulled in | No | Yes |
| Hypothesis | Several hypotheses, each with supporting and weakening questions | Yes | No |
| Investigation plan | One question per active row of the tool table, each sent to a **Triage** agent | Yes | No |
| Evidence gathering | The assigned agents answer in parallel, each through its allowed tools | Yes | Yes |
| Evidence evaluation | Each answer is scored as supporting or weakening each hypothesis | Yes | No |
| Verdict | The verdict, key findings and next actions are written back | Yes | Write-back only |

A run takes a few minutes and uses tens of thousands of tokens. Each run costs tokens, so open a finished run and read it when one exists.

{{% notice note %}}
The jailbreak check can end a run with a blocked summary, and the run still shows as completed. Read the summary, not only the status.
{{% /notice %}}

## 2. Start an investigation

Open the lab alert **Agent Lab - beaconing from web-server-01**. You created it in [Prepare Your Box](../01-intro/02-prepare-your-box.html). If the list shows more than one alert with that name, use the oldest one.

<!-- step: fsa03-01-investigation-tab -->

1. Open the alert and select the **AI Investigation** tab.
2. If the tab shows no results yet, click **Begin AI-Powered Alert Investigation**.
3. Wait for the run to finish. This takes a few minutes. The tab shows hypotheses when the run is done.

<!-- capture: fsa03-01-investigation-tab -->
![fsa03-01-investigation-tab](fsa03-01-investigation-tab.png?height=600px)

**You are done when**

- The run finishes, and the tab shows hypotheses instead of an error.
- You can say which indicator the run focused on.

## 3. Read the result

<!-- step: fsa03-02-hypotheses -->

Read the result before you decide anything. For each hypothesis, note:

- its status: confirmed, ruled out or inconclusive
- which questions gave supporting evidence and which gave weakening evidence
- which agent answered each question
- which questions had no data at all

<!-- capture: fsa03-02-hypotheses -->
![fsa03-02-hypotheses](fsa03-02-hypotheses.png?height=600px)

Now read the verdict panel on the right. It has three tabs:

- **Highlights**: the verdict and the main reason for it, in a few sentences.
- **Key Findings**: the facts the run found, one per line.
- **Next Steps**: what an analyst should do next, as a list of actions on this alert's host and addresses.

<!-- step: fsa03-02b-next-steps -->

Select **Next Steps**.

<!-- capture: fsa03-02b-next-steps -->
![fsa03-02b-next-steps](fsa03-02b-next-steps.png?height=600px)

Next Steps is advice. Nothing on the list runs by itself. Many items ask for the data the run did not have, such as change records or endpoint telemetry. Read it next to the questions that came back with no data. An action you would take on every alert like this one is a good candidate for a playbook, which you build in chapter 8.

Next, look at one question in detail.

<!-- step: fsa03-12-hypothesis-question -->

1. Click the bubble **#1** to see the hypothesis and its questions.
2. Click one question. The panel beside it shows the agent that answered, the input it used, its response and its evidence. Each question goes to the agent best placed to answer it, such as threat intelligence, organization context, or one of your own agents.

<!-- capture: fsa03-12-hypothesis-question -->
![fsa03-12-hypothesis-question](fsa03-12-hypothesis-question.png?height=600px)

A question answered with "No information available" is not a failure. It tells you which data the platform did not have. That gap is often the reason a verdict is Inconclusive.

<!-- step: fsa03-13-question-trace -->

3. Click the trace icon on the right of the answer panel's title. It shows only that agent's steps for this question, including the searches it ran, its model calls and its tokens. This trace view is available on 8.0.1.

<!-- capture: fsa03-13-question-trace -->
![fsa03-13-question-trace](fsa03-13-question-trace.png?height=600px)

4. Click **Back** to return to the map.

**You are done when**

- You can explain why the verdict came out the way it did, using the evidence.
- You can name one Next Steps item and the missing data it asks for.
- You can name at least one question that had no data, and say what that means for the verdict.

## 4. Check the write-back

The alert card shows the verdict. The alert record is what other automation reads, so check the record too.

<!-- step: fsa03-03-alert-ai-fields -->

1. Select the **Alert Details** tab.
2. Find the **AI Investigation Overview** section. It holds the verdict, severity and summary that the investigation wrote.
3. Confirm the values match what the card showed.

<!-- capture: fsa03-03-alert-ai-fields -->
![fsa03-03-alert-ai-fields](fsa03-03-alert-ai-fields.png?height=600px)

**You are done when**

- The verdict, severity and summary on the record match the card.
- Nothing else on the alert changed. Status, owner and closure are untouched.

{{% notice tip %}}
Check the record, not only the card. A card that renders only proves that the page drew it.
{{% /notice %}}

## 5. Test the edges

Run these two checks before you rely on a verdict.

### 5.1 A benign-looking alert

Open the alert whose name contains `nightly backup push to backup-01`. This is a routine backup that the lab treats as approved activity.

<!-- step: fsa03-08-benign-rerun -->

Check the verdict. It is usually Inconclusive. The box has no approved backup record for the agent to check against, so the agent cannot confirm the activity is expected.

<!-- capture: fsa03-08-benign-rerun -->
![fsa03-08-benign-rerun](fsa03-08-benign-rerun.png?height=600px)

Now give the agent the missing fact:

1. Open **AI Configurations**, then **Organizational Context**.
2. Open the record **Organization Context - Approved Backup System**.
3. In its content, replace the placeholder text with the text below. Save the record.

   ```text
   Backup System Name: Agent Lab nightly backup

   Backup Server(s): file-srv-02 (203.0.113.80)

   Backup Destination(s): backup-01.corp.example (203.0.113.81), HTTPS

   Backup Schedule: daily 01:30 UTC, about 45 GB per run

   Authorized Service Account(s): svc-backup

   Additional Notes: Approved under change ticket CHG-2041.
   ```

   <!-- step: fsa03-08a-approved-backup-record -->
   <!-- capture: fsa03-08a-approved-backup-record -->
   ![fsa03-08a-approved-backup-record](fsa03-08a-approved-backup-record.png?height=600px)

4. Go back to the alert. Click **Re-investigate**. Wait for the run to finish.

<!-- step: fsa03-08b-approved-rerun -->

<!-- capture: fsa03-08b-approved-rerun -->
![fsa03-08b-approved-rerun](fsa03-08b-approved-rerun.png?height=600px)

In the lab's reference run, the verdict changed from Inconclusive to Benign. The highlights cite the approved backup and its change ticket. Your run may differ. Report what you see, whether the answer changed or not.

This record is shared by every investigation on the box. When you finish, set its fields back to **No Information Available**.

**You are done when**

- You recorded both verdicts.
- You can say whether the approved-activity record changed the answer to any question.

### 5.2 Source data changes what the agent can see

Compare two alerts of the same type. The lab seeds both:

- **Agent Lab - C2 callback from dev-laptop-12** has the original event as source data. It names the process `updater.exe` and the destination `203.0.113.121`.
- **Agent Lab - C2 callback from dev-laptop-13** has no source data.

<!-- step: fsa03-09-sourcedata-check -->

1. Open the dev-laptop-12 alert. Select **AI Investigation**. If the run has not started, click **Begin AI-Powered Alert Investigation**. Otherwise open the finished run.
2. When the run is done, select the **Key Findings** tab. Its findings name `updater.exe` or `203.0.113.121`, because the agent extracted those indicators from the event and checked them.

<!-- capture: fsa03-09-sourcedata-check -->
![fsa03-09-sourcedata-check](fsa03-09-sourcedata-check.png?height=600px)

3. Open the dev-laptop-13 alert. Run the investigation, or open its finished run. Select **Key Findings**.
4. The findings do not name `updater.exe`. Most of them say that a data source was missing.

<!-- capture: fsa03-09-sourcedata-check-b -->
![fsa03-09-sourcedata-check-b](fsa03-09-sourcedata-check-b.png?height=600px)

**You are done when**

- The alert with source data has findings that name `updater.exe` or `203.0.113.121`.
- The alert without source data has none of those, and its findings say which data was missing.

Source data makes an investigation better. Forward the original event with the alert, not only a summary.

## 6. Read the trace

<!-- step: fsa03-04-trace-steps -->

1. Open the trace for the run from section 2. Click **Traces** in the investigation graph.
2. Find the steps in order. On 8.0.1 the step names are `normalization`, `context_enrichment`, `hypothesis`, `investigation_plan`, `investigation_execution`, `hypothesis_evaluation`, `key_finding`, `verdict` and `next_action`.
3. Open one tool call that returned evidence. Read what it returned, and whether the hypothesis used it.

<!-- capture: fsa03-04-trace-steps -->
![fsa03-04-trace-steps](fsa03-04-trace-steps.png?height=600px)

**You are done when**

- You found normalization, at least one tool call, and the verdict step, in that order.
- You can say what the tool returned and whether the hypothesis used it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The run finishes with no hypotheses | The alert has no source data | Use a lab alert with source data |
| The verdict is Inconclusive for a clear alert | A question had no data | Read the questions that had no data, add the context they need, then re-run |
| The write-back is missing after a run | The run did not finish, or the jailbreak check blocked it | Read the run summary. Re-run if it shows an error. |
| The run fails with a quota error | The LLM account is out of credit | Add credit to the LLM account |
| The run fails with an authorization error | The LLM is not allowed on the box | Check the LLM configuration on the box |
| The trace panel never loads | A burst of trace reads stalled the service | Wait, then reload. |
