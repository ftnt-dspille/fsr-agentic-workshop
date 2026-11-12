"""Fake-run tests for agent-drive selection, behavior checks and the preflight.

No credits, no box: claude, the MCP server and Playwright are replaced by fakes.
Run: python3 -m unittest tools/agent-drive/test_run.py
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run  # noqa: E402

BOX = "box.example.com"


def P(pid: str, text: str = "do the thing") -> run.Prompt:
    return run.Prompt(pid, Path(pid.split("#")[0] + ".md"), text)


class SelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.a = P("07-users-modules-records/01-bulk-triage#1")
        self.b = P("08-playbook/01-author-and-publish#1")
        self.prompts = [self.a, self.b]

    def test_no_results_runs_everything(self) -> None:
        ch = run.select(self.prompts, [], BOX)
        self.assertEqual([c.run for c in ch], [True, True])

    def test_pass_on_same_box_and_text_is_skipped(self) -> None:
        res = []
        run.record(res, self.a, BOX, "pass", "ok", "abc")
        ch = run.select(self.prompts, res, BOX)
        self.assertFalse(ch[0].run)
        self.assertTrue(ch[1].run)

    def test_pass_on_other_box_does_not_skip(self) -> None:
        res = []
        run.record(res, self.a, "other.example.com", "pass", "ok", "abc")
        self.assertTrue(run.select(self.prompts, res, BOX)[0].run)

    def test_changed_prompt_text_reruns(self) -> None:
        res = []
        run.record(res, P(self.a.pid, "old text"), BOX, "pass", "ok", "abc")
        ch = run.select(self.prompts, res, BOX)
        self.assertTrue(ch[0].run)
        self.assertIn("text changed", ch[0].reason)

    def test_failed_result_reruns(self) -> None:
        res = []
        run.record(res, self.a, BOX, "fail", "effect", "abc")
        self.assertTrue(run.select(self.prompts, res, BOX)[0].run)

    def test_prompt_flag_runs_even_if_passed(self) -> None:
        res = []
        run.record(res, self.a, BOX, "pass", "ok", "abc")
        ch = run.select(self.prompts, res, BOX, prompt_id=self.a.pid)
        self.assertEqual([(c.prompt.pid, c.run) for c in ch], [(self.a.pid, True)])

    def test_chapter_and_force(self) -> None:
        res = []
        run.record(res, self.a, BOX, "pass", "ok", "abc")
        self.assertEqual([c.prompt.pid for c in run.select(self.prompts, res, BOX, chapter="08-playbook")],
                         [self.b.pid])
        forced = run.select(self.prompts, res, BOX, force=True)
        self.assertTrue(all(c.run for c in forced))


class BehaviorTests(unittest.TestCase):
    pid = "07-users-modules-records/01-bulk-triage#1"

    def events(self, calls: list[tuple[str, dict]], answer: str) -> list[dict]:
        ev = [{"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": f"mcp__fortisoar-lab__{n}", "input": i}]}} for n, i in calls]
        ev.append({"type": "result", "result": answer})
        return ev

    def test_passing_behavior(self) -> None:
        ev = self.events([("query_records", {}), ("update_record", {}), ("update_record", {})],
                         "Moved 2 Agent Lab alerts to Investigating")
        self.assertEqual(run.check_behavior(self.pid, ev), [])

    def test_wrong_order_fails(self) -> None:
        ev = self.events([("update_record", {}), ("query_records", {})], "Agent Lab")
        self.assertIn("tool-sequence", run.check_behavior(self.pid, ev))

    def test_unexpected_confirm_fails(self) -> None:
        # A tier-2 write carries no confirm; confirm=true here is not in confirm_ok.
        ev = self.events([("query_records", {}), ("update_record", {"confirm": True})], "Agent Lab")
        self.assertIn("unexpected-confirm:update_record", run.check_behavior(self.pid, ev))

    def test_missing_answer_fails(self) -> None:
        ev = self.events([("query_records", {}), ("update_record", {})], "done")
        self.assertIn("answer-missing:Agent Lab", run.check_behavior(self.pid, ev))


class PreflightTests(unittest.TestCase):
    def test_server_ignores_the_instance_registry(self) -> None:
        # Else the toolkit server answers for its registry default box, not the env file's.
        with mock.patch.dict(run.os.environ, {"FSR_BASE_URL": f"https://{BOX}", "FSR_API_KEY": "k"}):
            server = run.fortisoar_lab_server()
        self.assertIn("PYFSR_INSTANCES", server["env"])
        self.assertFalse(Path(server["env"]["PYFSR_INSTANCES"]).exists())

    def test_matching_host_passes(self) -> None:
        with mock.patch.object(run, "mcp_whoami", return_value={"base_url": f"https://{BOX}:443", "user": {}}):
            run.preflight({}, BOX)

    def test_whoami_error_falls_back_to_config_check(self) -> None:
        err = {"error": {"type": "APIError", "message": "publish in progress"}}
        server = {"command": "x", "env": {"FSR_BASE_URL": f"https://{BOX}", "PYFSR_INSTANCES": "/nope"}}
        with mock.patch.object(run, "mcp_whoami", return_value=err):
            run.preflight(server, BOX)
            server["env"]["FSR_BASE_URL"] = "https://other.example.com"
            with self.assertRaises(SystemExit):
                run.preflight(server, BOX)

    def test_other_box_aborts_before_any_prompt(self) -> None:
        with mock.patch.object(run, "mcp_whoami", return_value={"base_url": "https://other.example.com"}):
            with self.assertRaises(SystemExit) as cm:
                run.preflight({}, BOX)
        self.assertIn("no prompt was run", str(cm.exception))


class MainFakeRunTests(unittest.TestCase):
    """main() end to end with claude, preflight and effects faked; no calls leave the process."""

    def test_aborts_and_runs_nothing_when_identity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "env"
            env.write_text(f"FSR_BASE_URL=https://{BOX}\nFSR_API_KEY=k\n")
            ledger = Path(tmp) / "r.json"
            with mock.patch.object(run, "LEDGER", ledger), \
                 mock.patch.object(run, "shutil") as sh, \
                 mock.patch.object(run, "fortisoar_lab_server", return_value={"command": "x", "env": {}}), \
                 mock.patch.object(run, "mcp_whoami", return_value={"base_url": "https://wrong.example.com"}), \
                 mock.patch.object(run, "run_claude") as rc:
                sh.which.return_value = "/bin/claude"
                with self.assertRaises(SystemExit):
                    run.main(["--env-file", str(env), "--chapter", "07-users-modules-records"])
                rc.assert_not_called()
                self.assertFalse(ledger.exists())

    def test_plan_makes_no_calls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "env"
            env.write_text(f"FSR_BASE_URL=https://{BOX}\n")
            with mock.patch.object(run, "LEDGER", Path(tmp) / "r.json"), \
                 mock.patch.object(run, "mcp_whoami") as who, mock.patch.object(run, "run_claude") as rc:
                self.assertEqual(run.main(["--env-file", str(env), "--plan"]), 0)
                who.assert_not_called()
                rc.assert_not_called()


class BashAndEffectTests(unittest.TestCase):
    """Chapter 9 Bash prompts, the effect environment, and manifest/spec consistency."""

    scaffold = "09-connectors/02-build-a-connector#1"
    package = "09-connectors/02-build-a-connector#2"

    def bash_ev(self, command: str, answer: str = "greet") -> list[dict]:
        return [{"type": "assistant", "message": {"content": [
                    {"type": "tool_use", "name": "Bash", "input": {"command": command}}]}},
                {"type": "result", "result": answer}]

    def test_scaffold_needs_the_pyfsr_scaffold_command(self) -> None:
        self.assertIn("bash-missing:pyfsr connector scaffold",
                      run.check_behavior(self.scaffold, self.bash_ev("ls -la")))
        self.assertEqual(run.check_behavior(self.scaffold,
                                            self.bash_ev("pyfsr connector scaffold agentlab-greeter")), [])

    def test_bash_check_is_a_substring_of_some_command(self) -> None:
        # A required command must appear in some Bash call; the match is textual, by design.
        ev = self.bash_ev("echo pyfsr connector scaffold > /dev/null")
        self.assertEqual(run.check_behavior(self.scaffold, ev), [])
        self.assertIn("bash-missing:pyfsr connector package",
                      run.check_behavior(self.package, self.bash_ev("pyfsr connector scaffold x", "Available")))

    def test_bash_tools_only_for_chapter9_build_prompts(self) -> None:
        captured: dict[str, list[str]] = {}

        def fake_run(cmd, **kw):  # noqa: ANN001
            captured["allowed"] = cmd[cmd.index("--allowedTools") + 1].split(",")
            captured["env_path"] = kw["env"].get("PATH", "")
            return mock.Mock(returncode=0, stdout="", stderr="")

        with mock.patch.object(run.subprocess, "run", side_effect=fake_run), \
             mock.patch.dict(run.os.environ, {"FSR_PYTHON": "/venv/bin/python3"}):
            run.run_claude(run.WORK, "x", run.MANIFEST[self.scaffold]["tools"])
            self.assertIn("Bash(pyfsr:*)", captured["allowed"])
            # File tools are confined to the work folder; bare Read/Write/Edit never appear.
            work = str(run.WORK.resolve()).lstrip("/")
            self.assertIn(f"Read(/{work}/**)", captured["allowed"])
            self.assertIn(f"Write(/{work}/**)", captured["allowed"])
            self.assertNotIn("Read", captured["allowed"])
            self.assertNotIn("Write", captured["allowed"])
            self.assertNotIn("Edit", captured["allowed"])
            self.assertTrue(captured["env_path"].startswith("/venv/bin"))
            run.run_claude(Path(tempfile.gettempdir()), "x", None)
            self.assertFalse(any(a.startswith("Bash") for a in captured["allowed"]))

    def test_effect_runs_only_its_steps_in_the_work_folder(self) -> None:
        seen: dict[str, dict] = {}

        def fake_run(cmd, **kw):  # noqa: ANN001
            seen["env"] = kw["env"]
            return mock.Mock(returncode=0)

        with mock.patch.object(run.subprocess, "run", side_effect=fake_run):
            self.assertEqual(run.check_effect("10-agent-led-investigation/01-investigation#2"), [])
        self.assertEqual(seen["env"]["FSR_ONLY_STEPS"], "fsa10-02-investigate")
        self.assertEqual(seen["env"]["FSR_WORKDIR"], str(run.WORK))

    def test_every_manifest_effect_step_exists_and_is_gated(self) -> None:
        import re
        for pid, spec in run.MANIFEST.items():
            if "effect" not in spec:
                continue
            fname, steps = spec["effect"]
            text = (run.E2E / fname).read_text()
            for step in steps:
                self.assertIn(f'wanted("{step}")', text, f"{pid}: {step} is not gated in {fname}")
                self.assertIn(f'"{step}"', text, f"{pid}: {step} not in {fname}")
        for path in (run.E2E / "lib" / "harness.js", *run.E2E.glob("[01]*.spec.js")):
            text = path.read_text()
            for m in re.finditer(r"await test\.step\(\"([^\"]+)\"", text):
                line_start = text.rfind("\n", 0, m.start()) + 1
                self.assertIn("wanted(", text[line_start:m.start()], f"ungated step {m.group(1)} in {path.name}")

    def test_every_manifest_key_is_a_real_prompt(self) -> None:
        ids = {p.pid for p in run.all_prompts()}
        self.assertEqual(sorted(set(run.MANIFEST) - ids), [])


class ModelTests(unittest.TestCase):
    """The baseline model is part of the selection key; a pass on another model never satisfies it."""

    def setUp(self) -> None:
        self.a = P("07-users-modules-records/01-bulk-triage#1")

    def test_default_model_is_the_sonnet_baseline(self) -> None:
        self.assertEqual(run.DEFAULT_MODEL, "claude-sonnet-5-5")

    def test_pass_on_other_model_does_not_skip(self) -> None:
        res = []
        run.record(res, self.a, BOX, "pass", "ok", "abc", model="claude-opus-4-8")
        ch = run.select([self.a], res, BOX, model="claude-sonnet-5-5")
        self.assertTrue(ch[0].run)
        self.assertEqual(res[0]["model"], "claude-opus-4-8")

    def test_pass_on_same_model_skips(self) -> None:
        res = []
        run.record(res, self.a, BOX, "pass", "ok", "abc", model="claude-sonnet-5-5")
        self.assertFalse(run.select([self.a], res, BOX, model="claude-sonnet-5-5")[0].run)

    def test_legacy_row_without_model_is_not_a_baseline_pass(self) -> None:
        legacy = [{"id": self.a.pid, "outcome": "pass", "box": BOX, "date": "2026-10-22",
                   "prompt_sha256": self.a.sha, "page_commit": "abc", "detail": "ok"}]
        self.assertTrue(run.select([self.a], legacy, BOX)[0].run)

    def test_failed_other_model_row_does_not_block_baseline(self) -> None:
        res = []
        run.record(res, self.a, BOX, "fail", "effect", "abc", model="claude-opus-4-8")
        ch = run.select([self.a], res, BOX, model="claude-sonnet-5-5")
        self.assertIn("no result recorded", ch[0].reason)

    def test_run_claude_passes_the_model_flag(self) -> None:
        captured: dict[str, list[str]] = {}

        def fake_run(cmd, **kw):  # noqa: ANN001
            captured["cmd"] = cmd
            return mock.Mock(returncode=0, stdout="", stderr="")

        with mock.patch.object(run.subprocess, "run", side_effect=fake_run):
            run.run_claude(run.WORK, "x")
            cmd = captured["cmd"]
            self.assertEqual(cmd[cmd.index("--model") + 1], "claude-sonnet-5-5")
            run.run_claude(run.WORK, "x", None, "claude-opus-4-8")
            cmd = captured["cmd"]
            self.assertEqual(cmd[cmd.index("--model") + 1], "claude-opus-4-8")

    def test_transcripts_are_kept_per_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(run, "TRANSCRIPTS", Path(tmp)):
                run.save_transcript(self.a.pid, [{"type": "result"}], "claude-opus-4-8")
                run.save_transcript(self.a.pid, [{"type": "result"}], "claude-sonnet-5-5")
                names = sorted(str(p.relative_to(tmp)) for p in Path(tmp).rglob("*.jsonl"))
        self.assertEqual(len(names), 2)
        self.assertTrue(all(n.startswith(("claude-opus-4-8/", "claude-sonnet-5-5/")) for n in names))

    def test_plan_shows_the_model(self) -> None:
        import io
        import contextlib
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "env"
            env.write_text(f"FSR_BASE_URL=https://{BOX}\n")
            buf = io.StringIO()
            with mock.patch.object(run, "LEDGER", Path(tmp) / "r.json"), contextlib.redirect_stdout(buf):
                run.main(["--env-file", str(env), "--plan"])
        self.assertIn("model: claude-sonnet-5-5", buf.getvalue())


class ChainTests(unittest.TestCase):
    """A prompt the page writes as a follow-up turn resumes its prerequisite's session."""

    first = "08-playbook/01-author-and-publish#1"
    second = "08-playbook/01-author-and-publish#2"

    def test_manifest_marks_the_chained_prompt(self) -> None:
        self.assertEqual(run.MANIFEST[self.second]["continues"], self.first)

    def test_session_id_is_read_from_the_stream(self) -> None:
        self.assertEqual(run.session_id([{"type": "system"}, {"session_id": "abc"}]), "abc")
        self.assertIsNone(run.session_id([{"type": "result"}]))

    def test_chained_prompt_without_prerequisite_session_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            res: list[dict] = []
            p = run.Prompt(self.second, Path("x.md"), "publish that playbook")
            with mock.patch.object(run, "SESSIONS", Path(tmp) / "s.json"), \
                 mock.patch.object(run, "run_claude") as rc:
                outcome = run.run_one(run.Choice(p, True, "t"), run.WORK, BOX, res, "claude-sonnet-5-5")
            rc.assert_not_called()
            self.assertEqual(outcome, "blocked")

    def test_chained_prompt_resumes_the_prerequisite_session(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            sess = Path(tmp) / "s.json"
            run.save_sessions({f"{self.first}|claude-sonnet-5-5": "sess-1"}, sess)
            res: list[dict] = []
            p = run.Prompt(self.second, Path("x.md"), "publish that playbook")
            ev = [{"session_id": "sess-2", "type": "result", "result": "published"}]
            with mock.patch.object(run, "SESSIONS", sess), \
                 mock.patch.object(run, "run_claude", return_value=(0, ev, "")) as rc, \
                 mock.patch.object(run, "check_behavior", return_value=[]), \
                 mock.patch.object(run, "check_effect", return_value=[]), \
                 mock.patch.object(run, "check_local", return_value=[]), \
                 mock.patch.object(run, "page_commit", return_value="abc"):
                run.run_one(run.Choice(p, True, "t"), run.WORK, BOX, res, "claude-sonnet-5-5")
            self.assertEqual(rc.call_args.args[-1], "sess-1")
            self.assertEqual(run.load_sessions(sess)[f"{self.second}|claude-sonnet-5-5"], "sess-2")


if __name__ == "__main__":
    unittest.main()
