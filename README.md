# FortiSOAR Agentic Operations Workshop

A hands-on TEC workshop on running FortiSOAR with AI agents. Readers connect an
agent to the platform through MCP (Model Context Protocol) servers, have it
investigate alerts and cite the evidence behind each verdict, and bottle the
investigations that work into playbooks that run on their own.

- Duration: 6-8 hours. Difficulty: Intermediate.
- Two tracks, native and DIY, share one safety model. Chapter 1 explains both.
- Part 1 (chapters 2-5): agentic foundations, investigation insights, building your
  own agent, registering MCP servers.
- Part 2 (chapters 6-11): setting up the agent, users, modules and records,
  playbooks, connectors, a capstone investigation, and reference.

This repo is a standalone Hugo site built from the TEC builder template
(`hugo-builder/`, with the `hugo-theme-relearn` theme vendored under `themes/`).
Do not edit the theme or the builder files. Update them by copying the latest
`hugo-builder/` over this repo, as the template README describes.

## Preview

Requires Hugo (extended). The site uses the vendored theme, so no other install
is needed for the site itself.

```shell
make serve      # hugo server -D, then open the printed local URL
make build      # hugo, output in public/ (gitignored)
```

## Proof harness

Each step a reader performs is proved on a live FortiSOAR box, and each screenshot
in the chapters is written by that proof, not by hand:

1. A chapter page marks steps and captures: `<!-- step: <id> -->` (or
   `<!-- step: <id> manual -->` for a step a person checks) and
   `<!-- capture: <id> -->`.
2. One spec per chapter in `tools/e2e/` runs each non-manual step inside
   `test.step('<id>')` and writes captures to `content/<chapter>/<id>.png`.
3. `tools/lint-steps.py` (run by `make lint`) fails when a step has no matching
   `test.step`, when a capture has neither a `.png` beside its page nor an entry in
   `tools/pending-captures.txt`, or when content breaks a house rule below.

The browser tier needs a live box, so `make e2e` refuses to run without
`FSR_ENV_FILE`. See `tools/e2e/README.md` for the spec convention and the login
pattern. `tools/reset_lab.py` (`make reset-lab`) is a live, destructive tool that
removes the `agentlab_` objects a session creates. It asks you to type RESET and
is meant to be run by the lab owner, never by CI.

## House rules for contributors

- Placeholders only. Use `fortisoar.example.com` for a host, `<your-api-key>` and
  `<your-password>` for credentials. No lab IP addresses, internal hostnames,
  real credentials, or capture dates in any file in this repo.
- No en or em dashes anywhere. Use a plain hyphen. A git hook rejects them in
  commits, and `make lint` checks content.
- Keep environment files (`.env*`) and captured login state out of git. The
  `.gitignore` already covers them.
- Commits are authored as the contributor. Do not add tool or AI attribution lines.

## Credits

Part 1 topics draw on the FortiSOAR AgenticAI Demo workshop (Fortinet internal),
which is prior art for the agentic foundations, investigation and DIY agent
material.

## Layout

```
content/          chapters (Hugo pages, one folder per chapter)
tools/            lint-steps.py, reset_lab.py, pending-captures.txt
tools/e2e/        browser proof harness (specs, lib/harness.js, playwright config)
layouts/, assets/, static/, themes/, archetypes/, i18n/   from hugo-builder/ (do not edit)
config.toml       site config (local)
config.github.toml  GitHub Pages overrides (CI)
```
