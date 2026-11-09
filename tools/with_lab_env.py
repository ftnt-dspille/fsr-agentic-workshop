#!/usr/bin/env python3
"""Run a command with .env.lab loaded into its environment (parsed, not sourced, so '$' in a value stays literal).

  python tools/with_lab_env.py <command> [args...]

Also sets FSR_ENV_FILE to .env.lab, so docubot and tools/lab_setup.py reach the same box.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_lab_env import OUT, read_env  # noqa: E402

if len(sys.argv) < 2:
    sys.exit(__doc__)
if not OUT.exists():
    sys.exit(f"{OUT} is missing: run tools/make_lab_env.py first")
env = {**os.environ, **read_env(OUT), "FSR_ENV_FILE": str(OUT)}
os.execvpe(sys.argv[1], sys.argv[1:], env)
