---
title: Build With the Assistant
linkTitle: Build With the Assistant
weight: 60
description: "The Agentic Assistant on the Playbook Designer turns a plain-English request into compiled playbook steps, and every later change arrives as an offer you accept."
---

Page 5 used your coding agent, outside FortiSOAR. The Agentic Assistant is inside FortiSOAR: the same launcher you met in chapter 3 also lives on the **Playbook Designer**. You describe what the playbook should do; the assistant compiles the steps, shows you the plan, and puts the result on your canvas. It never saves or runs anything on its own: the playbook reaches the box only through the **Apply** you click, and it is not published until you do that yourself (page 1).

Two rules make this safe to watch:

- **Every write is a card.** When the assistant wants to change the playbook after the first build, it does not rewrite the canvas. It shows an **offer** with what it would change, and the canvas moves only when you accept the offer.
- **The canvas is the contract.** Read the canvas after every turn. What you see there is exactly what Apply would push.

The assistant spends FortiAI tokens per turn, like every chat surface in this workshop.

## 1. Open the assistant on a fresh playbook

Create a new playbook in the **Agent Lab** collection and open it on the Playbook Designer. An empty canvas is fine: the assistant builds onto the playbook you have open.

<!-- step: fsa08-60-designer-assistant -->
<!-- capture: fsa08-60-designer-assistant -->
![fsa08-60-designer-assistant](fsa08-60-designer-assistant.png?height=600px)

Click the **Agentic Assistant** launcher on the right edge and start a new chat. Two look-alike launchers sit on that edge: the platform's **AI Assistant** below is the read-only one from chapter 3, and this chapter wants **Agentic Assistant**, the top one.

## 2. Ask for the playbook

Describe the playbook in one sentence. Keep it to steps you could name yourself: a trigger, a variable, an action.

```text
Build a playbook with a manual trigger on alerts: a set_variable step that
sets greeting to "hello", then a record step with action update that adds a
comment with that greeting to the alert.
```

<!-- step: fsa08-61-build-request -->

<!-- capture: fsa08-61-build-request -->
![fsa08-61-build-request](fsa08-61-build-request.png?height=600px)

The assistant answers with its plan and compiles the steps. When it finishes, the canvas shows the playbook it built.

<!-- step: fsa08-62-built-canvas -->

<!-- capture: fsa08-62-built-canvas -->
![fsa08-62-built-canvas](fsa08-62-built-canvas.png?height=600px)

**You are done when:** the canvas shows a manual trigger, a **Set Variable** step for `greeting`, and a comment step, in that order.

## 3. Change it by conversation

Save what the assistant built before asking for more: click **Save** on the designer toolbar. The next change replaces the canvas with the edited playbook, and the assistant refuses to apply it while your canvas holds unsaved work it did not stage itself -- it will not throw away edits you have not kept.

Then ask for one more change in the same chat. The assistant edits the playbook that is already on your canvas: it does not start over.

```text
Now add one more step after the comment that sets a variable named done to true.
```

<!-- step: fsa08-63-followup-offer -->

<!-- capture: fsa08-63-followup-offer -->
![fsa08-63-followup-offer](fsa08-63-followup-offer.png?height=600px)

The change arrives as an **offer**. Read it, then accept it and watch the canvas gain the step.

<!-- step: fsa08-64-followup-canvas -->

<!-- capture: fsa08-64-followup-canvas -->
![fsa08-64-followup-canvas](fsa08-64-followup-canvas.png?height=600px)

**You are done when:** the canvas shows four steps and the assistant's transcript shows an accepted offer, not a rewrite.

## 4. Take it from here

The playbook on your canvas is unsaved again -- accepting the offer put the edited steps back as unsaved changes. Save it, publish it, and trigger it with the flows from pages 1 and 2. If the assistant built something you want to keep growing by hand, just keep editing the YAML: the canvas is the same one you used all chapter.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The assistant says it built the playbook but the canvas is empty | The build never applied to the open playbook | Ask it to apply the playbook to the canvas; then read the canvas again |
| The assistant rewrites the whole playbook instead of offering a change | The request was ambiguous about what to keep | Name what must stay ("keep the trigger and the comment step, only add ...") |
| A step is missing from the canvas | The build stopped at an approval card | Answer the card first; the transcript shows what it is waiting on |
| The assistant refuses a change: "Save or discard your changes in the designer first" | The canvas holds unsaved edits, and applying would replace them | Click **Save** (or discard) on the designer toolbar, then accept the offer again |
| The launcher is missing on the designer | The widget is not published, or the pack is not installed | Chapter 1, page 3 installs the pack; chapter 2's tour shows where the launcher lives |
