#!/usr/bin/env python3
"""The real fsr-agentic-toolkit MCP server on a stub box, for screenshots only.

Tool calls that get past the approval gate hit this stub, never a network, so a screenshot
session cannot change a real FortiSOAR box. FSR_BASE_URL only labels the target in the prompt.
"""
import asyncio
import os
from types import SimpleNamespace

from fsr_agentic_toolkit.verbs import mcp as M


class Box(SimpleNamespace):
    def __getattr__(self, name):
        raise RuntimeError(f"stub box: {name} is not available")


asyncio.run(M.serve(client=Box(base_url=os.environ.get("FSR_BASE_URL", "https://fortisoar.example.com"))))
