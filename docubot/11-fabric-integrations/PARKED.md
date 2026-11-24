# Chapter 11 spec: what is left

Every step passes live. Two chapter 02 pictures are not on the pages yet:

- `ch11-02-faz-evidence` (page 02, section 2) and `ch11-02-investigate` (section 3).

**Why:** the picture for section 2 has to show policy 905 letting the scan through before the block. FortiAnalyzer keeps
one event per scan source and device and keeps adding to it, and FortiSOAR raises one alert per event. The first scan of a
day, fired while the containment group is clean, makes the alert whose logs start with policy 905. Any block earlier in that
event's life puts policy 20 denies at the start of the same event, and the agent then (correctly) answers that no policy let
the scan through. The `faz-evidence` verify requires the answer to name 905 and fails otherwise.

**To capture them:** from a lab where the open Branch2 port-scan alert comes from a scan fired with the group clean, run
`make chapter T=<this repo> CH=11-fabric-integrations FROM=ch11-02-find-alert FORCE=1 RESUME=0`. The three chapter 02 steps
share one chat, so they run together, starting at find-alert. Then copy the two pictures next to the page and add their
embeds back to `02-investigate-the-alert.md`.

**Other facts the next run should know:**

- Steps that need the block in place (`group-check`, `refire`, `denies`, `undo`) arrange it themselves, so they run alone.
- The agent reads the gate before it blocks, through either FortiGate connector. The steps allow any `get_`/`list_` read.
  A declined call used to hang the step for the full call budget; the helper now gives up on a decline after 20 seconds.
- Observe mode (`DOCUBOT_OBSERVE=1`) writes its breadcrumbs to `.docubot/last-run.log`, not to the terminal.
