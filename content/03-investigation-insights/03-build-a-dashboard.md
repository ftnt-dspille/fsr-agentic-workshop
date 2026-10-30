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

Open the dashboards module and start a new dashboard. Use the widget builder. Do not hand-write HTML.

Build three widgets over the alert records:

- **Verdict by severity**: a breakdown of verdicts, grouped by severity.
- **Verdict types**: a Top X list of verdict values.
- **Investigation funnel**: alerts that are new, then investigated, then carrying a verdict.

Some widgets come from the Content Hub. Check that they are installed before you start.

<!-- step: fsa03-07-verdict-dashboard manual: builds a dashboard by hand in the UI; no spec yet -->

Give the dashboard a name you will recognize, such as `Workshop Verdicts`, and add the three widgets. Filter the alert widgets to the seed alerts you created in chapter 2, so you can count them.

<!-- capture: fsa03-07-verdict-dashboard -->
![fsa03-07-verdict-dashboard](fsa03-07-verdict-dashboard.png?height=600px)

**You are done when**

- The dashboard renders all three widgets.
- Each widget is bound to the alert module, not to a static sample.

## 3. Verify the numbers

A chart that renders proves only that the page drew it. Check the numbers against the records.

<!-- step: fsa03-11-verify-counts manual: checks dashboard numbers against records; needs the dashboard from fsa03-10 -->

Count the seed alerts by hand, grouped by verdict and severity. Write the counts down. Compare them with what each widget shows.

**You are done when**

- The verdict-by-severity counts match your hand count for every cell.
- The funnel totals match the number of alerts you seeded.

If a count is off, check the widget's filter first. A filter that drops alerts without source data is the most common cause.

{{% notice tip %}}
Do the counts before you add more widgets. It is much easier to find a wrong filter on a three-widget dashboard than on a ten-widget one.
{{% /notice %}}

## 4. Add token figures only if the trace exposes them

Token totals live in the trace. Whether a dashboard can show them depends on whether your build exposes trace data to widgets. If it does not, leave token figures out of the dashboard, and read the totals in the trace for each run instead.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Widget shows no data | Filter excludes all seed alerts | Widen the filter, then narrow it again |
| Counts do not match your hand count | Filter or grouping is on the wrong field | Check which field each widget groups by |
| Widget missing from the list | Content Hub package not installed | Install the widget package, or build the chart from the alert module view |
| Verdict values look odd | Verdict names differ on your build | Compare the values in the alert record and use those names |

