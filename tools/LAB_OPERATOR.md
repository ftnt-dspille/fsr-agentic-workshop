# Running the lab on a box (operator guide)

Two scripts make a class run repeatable. Both read the connection from a pyfsr
instance (`--instance NAME`, resolved from `~/.pyfsr/instances.toml`), or from
`FSR_ENV_FILE` / the environment (`FSR_BASE_URL`, `FSR_API_KEY`, or
`FSR_USERNAME` + `FSR_PASSWORD`, `FSR_VERIFY_SSL`).

## The rerun cycle

```bash
# 1. Tear down the previous run's objects (DESTRUCTIVE; owner-run, asks for RESET).
#    Removes the agentlab_ modules (dropping their tables), the Agent Lab
#    playbook collection, seeded demo alerts, workshop users and schedules.
python3 tools/reset_lab.py --instance soar143            # or --check-only first

# 2. Re-seed the demo alerts the labs investigate (idempotent).
python3 tools/lab_setup.py --instance soar143 seed

# 3. Confirm the box is ready.
python3 tools/lab_setup.py --instance soar143 check
```

## One-time key setup

The labs do more than read and write records: chapter 7 creates a module
(a schema change), chapter 9 installs a connector, chapter 8 publishes a
playbook. The API key's role needs those rights. Either assign the roles in the
UI (see `content/06-setup-agent/01-api-key.md`), or union them on from an admin
login:

```bash
# Needs admin credentials (FSR_USERNAME/FSR_PASSWORD), not the key.
# FSR_KEY_ROLE names the role the key was created with (default "Full App Permissions").
FSR_KEY_ROLE="Full App Permissions" python3 tools/lab_setup.py --instance soar143 grant
```

## Capturing the agent screenshots

Real Claude Code captures are driven by `tools/agent-shots/capture.py` (pty-forks
`claude`, sends each lab's prompt, renders the terminal to PNG). Seed and seed-check
first so the agent has records to work with. `tools/pending-captures.txt` lists the
capture ids whose PNG does not exist yet; `tools/lint-steps.py --strict` fails while
any remain.

## Notes

- `reset_lab.py` is **destructive** and refuses to run without a typed `RESET`.
  Run it yourself; it is not for CI or an agent.
- If a module was left half-published (a `500` when listing its records), reset
  still attempts `delete_module`, which drops the leftover table. If that too
  fails, delete the module from the UI's module editor before the next run.
- The demo alert names all start with `Agent Lab: ` so seed and reset can find
  exactly what the workshop created and nothing else.
