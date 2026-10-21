# FortiSOAR Agentic Operations Workshop: common targets. Run from the repo root.

HUGO ?= hugo
PYTHON ?= python3

.PHONY: help serve build lint e2e reset-lab reset-lab-check

help:
	@echo "serve            preview the site with drafts (hugo server -D)"
	@echo "build            build the site into public/"
	@echo "lint             proof-harness gate, plus the borrowed lint scripts if present"
	@echo "e2e              run the browser specs on a live box (needs FSR_ENV_FILE=...)"
	@echo "reset-lab        LIVE + DESTRUCTIVE: remove agentlab_ objects (user runs it, types RESET)"
	@echo "reset-lab-check  LIVE, read-only: report what reset-lab would remove"

serve:
	$(HUGO) server -D

build:
	$(HUGO)

lint:
	$(PYTHON) tools/lint-steps.py
	@if [ -f scripts/lint-docs-contract.py ]; then $(PYTHON) scripts/lint-docs-contract.py; fi
	@if [ -f scripts/lint-code-snippets.py ]; then $(PYTHON) scripts/lint-code-snippets.py; fi

e2e:
	@if [ -z "$(FSR_ENV_FILE)" ]; then echo "needs a live box: FSR_ENV_FILE=... npx playwright test"; exit 2; fi
	cd tools/e2e && FSR_ENV_FILE="$(realpath $(FSR_ENV_FILE))" npx playwright test

reset-lab:
	$(PYTHON) tools/reset_lab.py

reset-lab-check:
	$(PYTHON) tools/reset_lab.py --check-only
