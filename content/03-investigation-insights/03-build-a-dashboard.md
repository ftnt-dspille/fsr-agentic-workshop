---
title: Build a Dashboard
linkTitle: Build a Dashboard
weight: 30
description: "Build your own dashboard over investigation results, and verify its numbers against the alert records before you trust them."
---

You can measure what the investigations are doing, and you should build that view yourself. This page builds a small verdict dashboard over the alert records the investigations write. Then it checks the chart against the records by hand.

## 1. Skip the ROI claims

Some vendor material promotes an AI ROI dashboard, or an "automatically investigated" count with time-saved figures. Do not teach or quote those figures. Your build may not ship them, and the source for the numbers is not something you can check on your box. If you want a time-saved figure, measure it on your own alert queue.

## 2. Build the dashboard

Open the Dashboard page and use the dashboard menu at the top right: choose **New Dashboard**, and give it a name you will recognize, such as `Workshop Verdicts`. Add rows and widgets with the widget builder. Do not hand-write HTML.

Each widget reads the alert records. Set every widget's **Record Assignment** to **All**. The default, **Only Me**, hides alerts nobody is assigned to, and the seed alerts are not assigned to anyone. Set a filter **Name contains `Agent Lab - `** on every widget too, so only the workshop alerts count.

Build the three widgets:

- **Verdict by severity** (Chart, Bar): X-Axis (Categories) is **Severity**, X-Axis (Values) is **AI Verdict**, and View Option is **Chart & Table**.

  <!-- step: fsa03-07b-widget-builder-chart -->
  <!-- capture: fsa03-07b-widget-builder-chart -->
  ![fsa03-07b-widget-builder-chart](fsa03-07b-widget-builder-chart.png?height=600px)

- **Verdict types** (Chart, Bar, View Option **Table Only**): X-Axis (Categories) is **AI Verdict**. The builder has no Top X widget, so this is a list of every verdict value with its count, with no row limit.
- **Investigation funnel** (three Card Count widgets in one row, one per stage): the builder has no funnel widget, so each stage is its own card. The first is `Investigation funnel: new` (Group By **Status**, Status equals **Open**). The second is `Investigation funnel: investigated` (Group By **AI Verdict**, AI Verdict not equals **Not Investigated**). The third is `Investigation funnel: verdict` (Group By **AI Verdict**, AI Verdict is in the list **Benign, Suspicious, Malicious, Inconclusive**). A Card Count also needs a Time Range; enter 365 days.

  <!-- step: fsa03-07c-funnel-card-config -->
  <!-- capture: fsa03-07c-funnel-card-config -->
  ![fsa03-07c-funnel-card-config](fsa03-07c-funnel-card-config.png?height=600px)

The widgets are built in, so no Content Hub package is needed.

<!-- step: fsa03-07-verdict-dashboard -->

Save the dashboard once all three widgets are on it.

<!-- capture: fsa03-07-verdict-dashboard -->
![fsa03-07-verdict-dashboard](fsa03-07-verdict-dashboard.png?height=600px)

**You are done when**

- The dashboard renders all five widgets: the severity chart, the verdict list, and the three funnel cards.
- Each widget is bound to the alert module, with the lab-alert filter on it.

## 3. Verify the numbers

A chart that renders proves only that the page drew it. Check the numbers against the records.

Count the seeded `Agent Lab - ` alerts by hand, grouped by verdict and severity. Write the counts down. Compare them with what each widget shows.

<!-- step: fsa03-11-verify-counts -->

<!-- capture: fsa03-11-verify-counts -->
![fsa03-11-verify-counts](fsa03-11-verify-counts.png?height=600px)

**You are done when**

- Every cell of the verdict-by-severity table matches your hand count.
- The verdict list's counts match your hand count for each verdict.
- The first funnel card equals the number of open lab alerts you seeded. The later cards read **NONE 0** until an investigation writes a verdict.

If a count is off, check the widget's filter first. A filter that drops alerts without source data is the most common cause, and so is a Record Assignment still set to Only Me.

{{% notice tip %}}
Do the counts before you add more widgets. It is much easier to find a wrong filter on a three-widget dashboard than on a ten-widget one.
{{% /notice %}}

## 4. Add token figures only if the trace exposes them

Token totals live in the trace. Whether a dashboard can show them depends on whether your build exposes trace data to widgets. If it does not, leave token figures out of the dashboard, and read the totals in the trace for each run instead.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Widget shows no data, or only some alerts | Record Assignment is Only Me | Set it to All |
| Widget shows no data | Filter excludes all seed alerts | Widen the filter, then narrow it again |
| Counts do not match your hand count | Filter or grouping is on the wrong field | Check which field each widget groups by |
| Card Count will not save | Time Range is empty | Enter a number of days |
| Funnel card reads **NONE 0** | No alert has reached that stage yet | Expected until an investigation writes a verdict |
| Verdict values look odd | Verdict names differ on your build | Compare the values in the alert record and use those names |

