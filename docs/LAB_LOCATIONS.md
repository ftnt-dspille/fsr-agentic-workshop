# Where the lab's files live

The workshop lab (Fabric Studio fabric `FortiDemo-FortiSOAR`) is built and operated from
the internal `fabric-studio-terraform` repo. Nothing environment-specific is kept here.

| What | Where |
|---|---|
| Lab folder (start here) | `fabric-studio-terraform/topologies/fsr_agentic_lab/` |
| Topology export (fabric as an intent file) | `.../fsr_agentic_lab/intent.yaml`, `intent.configs/` |
| Saved FMG/FAZ baseline configs | `.../fsr_agentic_lab/configs/` (large files local only; `MANIFEST.json` lists them; refresh with `scripts/fetch_configs.py`) |
| Health check | `.../fsr_agentic_lab/health/check.py` |
| Build/rebuild scripts (conf packer, LXC create, backups, onboarding loop) | `.../fsr_agentic_lab/scripts/` |
| LXC image provision script (Docker + Ansible) | `.../fsr_agentic_lab/lxc-image/` |
| Red-team dashboard (Docker app, scenarios) | `fabric-studio-terraform/devices/redteam/` |
| FMG/FAZ onboarding controller (Ansible) | `fabric-studio-terraform/devices/fmgfaz_onboard/` |
| Ansible extension playbooks fetched at boot | this repo, `fabric-ext/` (branch used by the onboarding config) |
| Outstanding items / plan | this repo, `docs/plans/outstanding-items.md` (local, gitignored) |

Hosts, addresses and passwords are supplied through environment variables
(`FS_POD_HOST`, `FS_DEVICE_PASSWORD`) and are never committed.
