"""Tests for render_shots transcript resolution.

The bug these pin: run.py writes transcripts to .transcripts/<model>/<pid>.jsonl,
but render_shots used to read the legacy top-level .transcripts/<pid>.jsonl, so it
silently rendered a stale transcript. The resolver now goes through
run.transcript_path (one source of truth) and must also not let a stub model file
(a blocked run, no tool calls) win over a real legacy transcript.

Run: python3 -m unittest tools/agent-drive/test_render_shots.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_shots as rs  # noqa: E402
import run  # noqa: E402

PID = "07-users-modules-records/02-create-a-module#1"
MODEL = "claude-sonnet-5-5"


def _tool_use_jsonl() -> str:
    return json.dumps({"message": {"content": [
        {"type": "tool_use", "name": "mcp__fortisoar-lab__provision_module", "input": {"module": "m"}},
    ]}}) + "\n"


def _stub_jsonl() -> str:
    # a bare result line, the shape a blocked/continuation run leaves
    return json.dumps({"session_id": "sess-2", "type": "result", "result": "published"}) + "\n"


class TranscriptPathTests(unittest.TestCase):
    def test_render_and_run_agree_on_the_path(self) -> None:
        # render_shots must resolve the model file to exactly where run.py saves it.
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                run.save_transcript(PID, [{"message": {"content": []}}], MODEL)
                saved = run.transcript_path(PID, MODEL)
                self.assertTrue(saved.exists())
                self.assertEqual(rs.resolve_transcript(PID, MODEL), saved)
                # the model file sits under a per-model folder, not top-level
                self.assertEqual(saved.parent.name, MODEL)


class ResolveTests(unittest.TestCase):
    def test_prefers_model_file_when_it_has_tool_calls(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            model_f = run.transcript_path(PID, MODEL)
            model_f = root / model_f.relative_to(run.TRANSCRIPTS)
            model_f.parent.mkdir(parents=True, exist_ok=True)
            model_f.write_text(_tool_use_jsonl())
            legacy = root / (PID.replace("/", "__", 1) + ".jsonl")
            legacy.write_text(_tool_use_jsonl())
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                self.assertEqual(rs.resolve_transcript(PID, MODEL), run.transcript_path(PID, MODEL))

    def test_stub_model_file_falls_back_to_real_legacy(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                model_f = run.transcript_path(PID, MODEL)
                model_f.parent.mkdir(parents=True, exist_ok=True)
                model_f.write_text(_stub_jsonl())  # no tool calls
                legacy = root / (PID.replace("/", "__", 1) + ".jsonl")
                legacy.write_text(_tool_use_jsonl())
                self.assertEqual(rs.resolve_transcript(PID, MODEL), legacy)

    def test_legacy_only_is_used(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                legacy = root / (PID.replace("/", "__", 1) + ".jsonl")
                legacy.write_text(_tool_use_jsonl())
                self.assertEqual(rs.resolve_transcript(PID, MODEL), legacy)

    def test_nothing_resolves_to_none(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                self.assertIsNone(rs.resolve_transcript(PID, MODEL))

    def test_stub_only_still_renders_something(self) -> None:
        # if the stub is all we have, use it rather than skip the prompt entirely
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with mock.patch.object(run, "TRANSCRIPTS", root), mock.patch.object(rs, "TRANSCRIPTS", root):
                model_f = run.transcript_path(PID, MODEL)
                model_f.parent.mkdir(parents=True, exist_ok=True)
                model_f.write_text(_stub_jsonl())
                self.assertEqual(rs.resolve_transcript(PID, MODEL), run.transcript_path(PID, MODEL))


class ToolUseCountTests(unittest.TestCase):
    def test_counts_tool_use_and_ignores_stub(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.jsonl"
            p.write_text(_tool_use_jsonl() + _stub_jsonl())
            self.assertEqual(rs._tool_use_count(p), 1)
            p.write_text(_stub_jsonl())
            self.assertEqual(rs._tool_use_count(p), 0)


class ModelLabelTests(unittest.TestCase):
    def test_known_and_unknown(self) -> None:
        self.assertEqual(rs.model_label("claude-sonnet-5-5"), "Sonnet")
        self.assertEqual(rs.model_label("claude-opus-4-8"), "Opus")
        self.assertEqual(rs.model_label("some-other-model"), "some-other-model")


if __name__ == "__main__":
    unittest.main()
