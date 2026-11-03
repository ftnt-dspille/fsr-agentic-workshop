---
title: AI Insights
linkTitle: AI Insights
weight: 20
description: "Ask FortiSOAR a question in plain language, read the chain of thought and plan before the run, save an insight and schedule it."
---

An AI Insight answers a plain-language question about your FortiSOAR data. You write a question and pick a role. The platform proposes a chain of thought and a plan, runs the plan, and returns a summary card. You can save the insight and give it a schedule. On this page you create one, read its plan before it runs, and run it.

## 1. Know the flow

![AI Insights flow: intent (ask in plain English, pick a role), chain of thoughts (the intent broken into small steps you can review), plan (each step assigned to an agent), execute (agents run the plan on demand or on a schedule) and result (summary, findings and recommended actions on a card)](diagram-ai-insights-flow.png)

1. **Question.** Write it in plain language.
2. **Role.** The persona the answer is written for, such as SOC Analyst or SOC Manager. The role shapes the plan and the summary.
3. **Chain of thought.** The platform's reasoning, as a list of steps. You can read it.
4. **Plan.** The steps the platform will run. Read the plan before you run it.
5. **Execution.** Each step runs through one insight agent. A run stops on an error or on an empty fetch.
6. **Summary card.** A summary, suggested actions and the execution record.

Insight agents are read-only. They have no write tools and no approval step, so an insight cannot change alerts.

## 2. Create an insight

Open **AI Insights** from the AI area of the left navigation. Click **Add Insight**.

<!-- step: fsa03-05-insight-plan -->

1. Optional: choose the template **High Risk Active Alerts**. It fills in example text, which you then replace.
2. In **Intent Title**, enter `Workshop high risk alerts`.
3. In **Role**, choose **SOC Manager**.
4. In **Schedule**, open the section and choose **Weekly** under Schedule Frequency. You cannot run an insight until it has a schedule.
5. In **Intent**, replace the text with your question:

   ```text
   Which active alerts have the highest risk score, and which of them have no assigned owner?
   ```

<!-- capture: fsa03-05-insight-plan -->
![fsa03-05-insight-plan](fsa03-05-insight-plan.png?height=600px)

Do not click Execute yet. The next section generates the plan.

## 3. Generate and read the chain of thought and the plan

<!-- step: fsa03-10-read-plan -->

1. Click **Generate Chain of Thoughts**. Read the list of steps.
2. Click **Generate a Plan**. Read the plan steps.
3. Check that each plan step matches your question. For the example question, the last step should find the high-risk alerts that have no owner.

<!-- capture: fsa03-10-read-plan -->
![fsa03-10-read-plan](fsa03-10-read-plan.png?height=600px)

If a step fetches data you did not ask for, change the question, then generate the chain and the plan again. Do not edit the generated chain of thought by hand.

**You are done when**

- You can say, for each plan step, what data it fetches.
- You can point to one step that would not answer the question, if your plan has one.

## 4. Execute and save

<!-- step: fsa03-06-insight-card -->

1. Click **Execute**. It stays disabled until the chain of thought and the plan both exist.
2. When the summary card appears, read the summary and the suggested actions.
3. Click **Save** to keep the insight.

<!-- capture: fsa03-06-insight-card -->
![fsa03-06-insight-card](fsa03-06-insight-card.png?height=600px)

**You are done when**

- The summary card shows a summary, suggested actions and an execution record.
- The schedule names its creator, and you know that scheduled runs use the creator's access.

{{% notice warning %}}
A schedule runs as the user who created it. If an administrator creates a schedule, it sees what an administrator sees. Create schedules as the least-privileged user who needs the answer.
{{% /notice %}}

{{% notice note %}}
Suggested actions can list record identifiers instead of alert names. Look up the record before you act on it.
{{% /notice %}}

## 5. Accept an empty answer

An insight can return "no data" instead of a guess. That is a valid answer. If the result is empty, check the plan's filters before you change the question. A filter on a status value your box does not use returns nothing and shows no error.

Do not rely on the drill-down chat on the summary card. Start a new insight with a narrower question instead.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The plan returns "no valid alert data" | A filter uses a status value your box does not use | Reword the question, then generate the chain and the plan again |
| The run never finishes | The plan is large, or the LLM is slow | Wait a few minutes. Then cancel and re-run with a narrower question. |
| The schedule is missing after you save | Your user cannot create schedules | Ask an administrator to check your permissions |
