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
        self.a = P("07-users-modules-records/01-create-a-user#1")
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
    pid = "07-users-modules-records/01-create-a-user#1"

    def events(self, calls: list[tuple[str, dict]], answer: str) -> list[dict]:
        ev = [{"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": f"mcp__fortisoar-lab__{n}", "input": i}]}} for n, i in calls]
        ev.append({"type": "result", "result": answer})
        return ev

    def test_passing_behavior(self) -> None:
        ev = self.events([("create_user", {"confirm": True}), ("query_records", {})], "agentlab_analyst created")
        self.assertEqual(run.check_behavior(self.pid, ev), [])

    def test_wrong_order_fails(self) -> None:
        ev = self.events([("query_records", {}), ("create_user", {})], "agentlab_analyst")
        self.assertIn("tool-sequence", run.check_behavior(self.pid, ev))

    def test_unexpected_confirm_fails(self) -> None:
        ev = self.events([("create_user", {}), ("query_records", {})], "agentlab_analyst")
        ev[0]["message"]["content"][0]["input"] = {"confirm": True}
        ev2 = self.events([("create_module", {"confirm": True}), ("create_user", {}), ("query_records", {})],
                          "agentlab_analyst")
        self.assertIn("unexpected-confirm:create_module", run.check_behavior(self.pid, ev2))

    def test_missing_answer_fails(self) -> None:
        ev = self.events([("create_user", {}), ("query_records", {})], "done")
        self.assertIn("answer-missing:agentlab_analyst", run.check_behavior(self.pid, ev))


class PreflightTests(unittest.TestCase):
    def test_matching_host_passes(self) -> None:
        with mock.patch.object(run, "mcp_whoami", return_value={"base_url": f"https://{BOX}:443", "user": {}}):
            run.preflight({}, BOX)

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


if __name__ == "__main__":
    unittest.main()
