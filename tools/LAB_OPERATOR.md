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
### Required after reset on FortiSOAR 8.0.1: sweep orphaned module tables

On 8.0.1, `delete_module` removes the module's metadata and registry entry but
does **not** drop its physical tables or generated entity files - its own
re-publish step hits a `doctrine:schema:update` that exits non-zero on the
table it is trying to drop. (8.0.0 dropped them cleanly; this is an 8.0.1
regression worth filing.) The leftovers then poison the next create of the same
module name: every `schema:update` sees `The table ... already exists`, the
publish aborts before registering the module, and records return `500` (no
entity normalizer) or `Access Denied` (no RBAC).

So after `reset_lab.py` deletes the `agentlab_*` modules, sweep their leftover
tables and entity files through FortiSOAR's own console (it uses the app's DB
connection - no credentials to handle), on the box over SSH. For a module
`agentlab_assets`, the leftovers are the table `agentlab_assets`, the relation
tables `agentlabassets_team` and `agentlabassets_actor` (the relation name drops
the underscore), and `src/Entity/Custom/AgentLabAsset*.php`:

```bash
B="sudo -u nginx php /opt/cyops-api/bin/console"
# drop the module table and its team/actor relation tables
for t in agentlab_assets agentlabassets_team agentlabassets_actor; do
  $B doctrine:query:sql "DROP TABLE IF EXISTS $t CASCADE"
done
# remove the stale staging row, if any
$B doctrine:query:sql "DELETE FROM staging_model_metadatas WHERE type='agentlab_assets'"
# remove generated entity classes, then regenerate the model/module code clean
sudo rm -f /opt/cyops-api/src/Entity/Custom/AgentLabAsset*.php
$B app:metadata:generate:models
$B app:metadata:generate:modules
$B cache:clear --env=prod
sudo systemctl reload php-fpm
```

Verify nothing is left: `doctrine:query:sql "SELECT tablename FROM pg_tables
WHERE tablename LIKE '%agentlab%'"` should return no rows. Owner-run. Skip this
whole step on 8.0.0, where `delete_module` is clean.
- The demo alert names all start with `Agent Lab: ` so seed and reset can find
  exactly what the workshop created and nothing else.
