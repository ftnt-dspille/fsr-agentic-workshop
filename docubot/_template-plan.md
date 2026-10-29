# <chapter title>

Step-ID prefix: `fsaNN`
Devices: `soar` (box UI), `laptop` (local agent), as needed.
Goal: <one line>.

## Student actions

1. <action> — capture `<id>` if it has a screenshot.
2. ...

## Prerequisites (decide per step: CONFIGURE seeds it, or the student creates it)

- <record / key / config / ingested data the step only READS> -> CONFIGURE.
- <state the student creates on screen> -> captured in the spec.

## Automation note

Every documented step is automated (see docubot/plans/PLAN-docubot-migration.md,
"Full automation"). A step kept `manual` needs a written reason here (spends
tokens -> gate with SPEND_AI=1; destructive -> guard to a throwaway box).

## Cleanup

- <objects to remove before repeating> (tools/reset_lab.py).
