# FortiSOAR Agentic Operations Workshop: common targets. Run from the repo root.

HUGO ?= hugo
PYTHON ?= python3

.PHONY: help serve build lint lint-strict e2e e2e-install workshop-proof workshop-proof-report agent-drive agent-drive-plan shots-terminal reset-lab reset-lab-check

help:
	@echo "serve            preview the site with drafts (hugo server -D)"
	@echo "build            build the site into public/"
	@echo "lint             proof-harness gate, plus the borrowed lint scripts if present"
	@echo "e2e              run the browser specs on a live box (FSR_ENV_FILE=..., optional SPEC=<file>)"
	@echo "agent-drive      LIVE + credits: run the pages' prompts through claude -p (user runs it)"
	@echo "agent-drive-plan list the prompts agent-drive would send (no calls)"
	@echo "shots-terminal   render the deterministic terminal screenshots locally"
	@echo "reset-lab        LIVE + DESTRUCTIVE: remove agentlab_ objects (user runs it, types RESET)"
	@echo "reset-lab-check  LIVE, read-only: report what reset-lab would remove"
	@echo "lint-strict      lint-steps --strict: also fails on pending captures"
	@echo "e2e-install      install the browser proof harness (tools/e2e) dependencies"
	@echo "workshop-proof   LIVE: reset-lab check, chapter specs, strict lint, hugo; writes tools/proof-report.md"
	@echo "                 optional CHAPTER=07 (one chapter). SPEND_AI=1 enables FortiAI specs (costs tokens)"
	@echo "workshop-proof-report  rebuild tools/proof-report.md from the last run (no box)"

agent-drive:
	$(PYTHON) tools/agent-drive/run.py $(if $(CHAPTER),--chapter $(CHAPTER))

agent-drive-plan:
	$(PYTHON) tools/agent-drive/run.py --dry-run

shots-terminal:
	$(PYTHON) tools/terminal-shots/render.py --png

serve:
	$(HUGO) server -D

build:
	$(HUGO)

lint:
	$(PYTHON) tools/lint-steps.py
	@if [ -f scripts/lint-docs-contract.py ]; then $(PYTHON) scripts/lint-docs-contract.py; fi
	@if [ -f scripts/lint-code-snippets.py ]; then $(PYTHON) scripts/lint-code-snippets.py; fi

lint-strict:
	$(PYTHON) tools/lint-steps.py --strict

e2e-install:
	cd tools/e2e && pnpm install
	@if [ -n "$(SOAR_KIT_DIR)" ]; then \
	  ln -sfn "$$(cd "$(SOAR_KIT_DIR)/node_modules/@playwright/test" && pwd -P)" tools/e2e/node_modules/@playwright/test; \
	  echo "linked @playwright/test to the UI kit's install (one module instance; see tools/e2e/README.md)"; \
	else echo "set SOAR_KIT_DIR to the UI kit's repro/js to link its @playwright/test"; fi

workshop-proof:
	@if [ -z "$(FSR_ENV_FILE)" ]; then echo "needs a live box: FSR_ENV_FILE=... make workshop-proof"; exit 2; fi
	$(PYTHON) tools/workshop_proof.py $(if $(CHAPTER),--chapter $(CHAPTER))

workshop-proof-report:
	$(PYTHON) tools/workshop_proof.py --report-only $(if $(CHAPTER),--chapter $(CHAPTER))

e2e:
	@if [ -z "$(FSR_ENV_FILE)" ]; then echo "needs a live box: FSR_ENV_FILE=... npx playwright test"; exit 2; fi
	cd tools/e2e && FSR_ENV_FILE="$(realpath $(FSR_ENV_FILE))" SOAR_KIT_DIR="$${SOAR_KIT_DIR}" npx playwright test $(SPEC)

reset-lab:
	$(PYTHON) tools/reset_lab.py

reset-lab-check:
	$(PYTHON) tools/reset_lab.py --check-only
