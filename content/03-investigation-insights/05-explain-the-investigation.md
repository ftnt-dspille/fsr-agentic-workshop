---
title: Explain It on a Call
linkTitle: Explain It on a Call
weight: 50
description: "A presenter talk track for the AI investigation: the words to say and the screens to click, so you can explain specialists, grounding, MCP, agent config, organization context and SOPs without hand-waving."
---

The hardest part of this feature is not running it. It is explaining it to someone who has heard "AI" oversold. This page is a talk track: for each idea, the line to say and the screen to show. Every claim here maps to something you can click on your own box, so you are never describing a diagram -- you are pointing at the real thing.

Run one investigation first (the previous page) so a finished run is on screen before you start. Open the alert **Agent Lab - beaconing from web-server-01** and keep it in front of you.

## 1. Open with the frame

Before any screen, set the mental model. The failure mode is letting the room picture a chatbot.

> "This isn't a chatbot answering from what it read on the internet. It's a small team of specialists -- each one owns a narrow job and a specific set of tools -- coordinated by a lead that breaks the alert into questions. It triages the way your Tier-1 team does, with the access you give it, and it shows its work on every step."

That one paragraph contains the whole page. Everything after it is proof.

## 2. Show the stages -- the investigation has a shape

**Click:** open the alert, select the **AI Investigation** tab, then **Traces** in the investigation graph.

**Point to:** the step list -- normalization, context_enrichment, hypothesis, investigation_plan, investigation_execution, hypothesis_evaluation, key_finding, verdict, next_action.

> "It runs the same shape every time: normalize the alert, pull context, form hypotheses, plan one question per tool it has, gather the evidence in parallel, score it, and write a verdict. The shape is fixed -- plan, enrich, correlate, conclude -- but *what* it checks depends on the alert. A phishing email gets different questions than a brute-force."

The point that lands: it is a method, not a guess. An analyst can predict the stages, which is what makes the output reviewable.

## 3. Show the specialists -- who answered each question

**Click:** back on the **AI Investigation** tab, click a hypothesis bubble, click one question. The panel names the agent that answered.

**Point to:** the agent name on the answer panel, and the **trace icon** that opens just that agent's steps.

> "Each question went to the specialist best placed to answer it -- threat intelligence for a reputation lookup, an organization-context agent for 'is this expected', the SIEM specialist for related activity. They work in parallel, each only inside its own toolbox."

**Click (optional):** the agent catalog under the AI area of the left navigation.

**Point to:** that each agent shows its **LLM profile**, its **MCP servers** and its **masking** setting; and that an agent carries a tag -- **Triage** to be used by the investigation planner, **Insight** for insight planning.

> "These are packaged units -- a role, its instructions, and an allowlist of tools. The tag is a gate: an agent the planner can't see is never used. So the set of specialists on a given box is something you control, not a black box."

## 4. Show that they don't make things up

This is the objection under every "AI" conversation. Answer it with the architecture, not a promise.

**Click:** open one question whose answer has evidence, then its trace. Then open a question that came back **No information available**.

**Point to:** the tool call and its returned data on the first; the stated gap on the second.

> "A specialist can't answer a factual question from memory -- it can only answer by calling a tool. It *requests* the data, FortiSOAR runs the call against the real system, and the specialist reasons over what comes back. You're looking at the actual tool result its claim rests on. And when no tool fits, it says 'No information available' instead of inventing one -- that honest gap is often why a verdict is **Inconclusive**."

Stay honest, because overclaiming is what makes you sound like you are overselling:

> "I won't tell you it can never be wrong -- it's a model. I'll tell you something stronger: it's grounded in live tool results, it states what it couldn't check, and every step is on the record. A wrong conclusion here is visible and traceable, not hidden."

{{% notice note %}}
If the room pushes on hallucination, show the troubleshooting reality: when no connector fits a question, the model can fill the gap. The guardrail is "cite the tool result, state the gap" plus the trace -- not a guarantee of omniscience. Saying this out loud builds more trust than dodging it.
{{% /notice %}}

## 5. Show the tools are MCP servers you configure

**Click:** the MCP servers screen (the built-in and registered servers; chapter 5 covers registration).

**Point to:** a built-in server and a registered one, and the fact that each agent's config lists which servers it may reach.

> "The specialists reach your systems over MCP -- a standard plug. Each server we add is a capability we hand to specific specialists, under credentials we set. On this box the SIEM specialist reaches FortiSIEM over an MCP server we registered, scoped to the triage specialists only -- the chat agent can't touch it. It's governed access, not an open door into your environment."

That sentence answers the security question -- "is your AI poking around everything?" -- before it is asked. You decide which agents get which servers, and the agent inherits exactly the access the credential grants.

## 6. Show the organization context -- what grounds it in *your* SOC

This is the part that turns a generic model into *your* analyst, and it is the most underused screen.

**Click:** **AI Configurations**, then **Organizational Context**.

**Point to:** the records -- SOPs, the tool table, risk criteria, approved activity, role profiles.

> "This is where the investigation learns your environment. SOPs tell it how you handle each alert type. The tool table decides which questions get asked. Approved-activity records tell it what's normal here, so routine behavior doesn't get flagged as an incident."

Then run the proof that always lands -- the approved-activity demo from the previous page:

**Click:** open **Organization Context - Approved Backup System**, show it empty, and the matching alert's verdict (**Inconclusive**). Fill the record, **Save**, then **Re-investigate** the alert.

**Point to:** the verdict changing to **Benign**, with the highlights citing the approved backup and its change ticket.

> "Nothing about the model changed. I gave it one fact from our environment, and the verdict went from 'I can't tell' to 'this is expected, here's the ticket.' That's the difference between a generic model and one that knows your SOC."

{{% notice tip %}}
The approved-backup record is shared by every investigation on the box. Set its fields back to **No Information Available** when you finish the demo.
{{% /notice %}}

## 7. Show the prompts and SOPs -- the instructions behind each specialist

**Click:** the prompt records that agents call (the prompts area; editing may be limited on your build).

**Point to:** that a prompt is a named record -- a system instruction, a user instruction and a response format -- and that an SOP is an organization-context record for one alert type, or for DEFAULT.

> "Each specialist follows instructions you can read: a prompt that sets how it reasons, and an SOP that sets how your team handles that alert type. These aren't hidden model internals -- they're records. You can see exactly what the agent was told to do, which is why the output is defensible in a review."

One caution worth saying, because it saves a support call later:

> "Prompts and SOPs that ship with the product are re-imported on upgrade. If you customize one in place, treat the edit as something to re-apply after an upgrade."

## 8. Close the loop -- the verdict is evidence, not a decision

**Click:** the verdict panel -- **Highlights**, **Key Findings**, **Next Steps** -- then the **Alert Details** tab and the **AI Investigation Overview** section.

**Point to:** the same verdict on the card and on the record.

> "The verdict and its evidence are written back to the alert, so the next analyst sees a packaged case, not a raw alert. Next Steps is advice -- nothing runs by itself. The AI did the first fifteen minutes and left perfect notes. Your senior analysts still decide; they just start from a case instead of a blank alert."

## The one-sentence version

If you have ten seconds, say this and stop:

> "A lead agent breaks the alert into questions, hands each to a specialist, each specialist answers only by calling tools we've configured -- like FortiSIEM over MCP -- grounded in our SOPs and approved-activity records, and every call is on the record. It triages like your team does, with the access you give it, and shows its work."

## Pre-empt the three objections

| They're thinking | Say | Then click |
|---|---|---|
| "It's a black box." | "Every step is a trace -- the tool it called, what came back, how it concluded." | The trace on one question |
| "It's just a rigid script." | "The shape is fixed; the questions adapt to the alert and to our SOPs." | Two different alert types, different questions |
| "Is it loose in my environment?" | "Each specialist reaches only the MCP servers we grant it, under credentials we set." | The MCP servers screen and an agent's server list |
