"""The project-mode expiry waiver of crawl_gate.py: in a Luz-Project project, a Crawl record of a stage the project has completed no longer has to be younger than seven days
(Luz-Project references/runbook.md, section 12). The waiver block is the same text in Luz-Ops, Luz-System, Luz-Dev and Luz-Writing; this test is the sync check."""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT.parent
sys.path.insert(0, str(ROOT / "scripts"))

import crawl_gate  # noqa: E402

GATES = {"Luz-Ops": "scripts/crawl_gate.py", "Luz-System": "scripts/crawl_gate.py", "Luz-Dev": "scripts/crawl_gate.py", "Luz-Writing": "scripts/08-crawl_gate.py"}
BEGIN, END = "# ---- project-mode expiry waiver", "# ---- end of project-mode expiry waiver ----"
EXPIRED = "Crawl 前置检索 luz-system/architecture: 检索记录超过七天，请按当前需求复核"
OTHER = "Crawl 前置检索 luz-system/architecture: 缺少补充信息"


def fake_api(waived: bool, calls: list | None = None) -> types.ModuleType:
    module = types.ModuleType("approval_docs")

    def crawl_expiry_waived(project, stage):
        if calls is not None:
            calls.append((str(project), stage))
        return waived

    module.crawl_expiry_waived = crawl_expiry_waived  # type: ignore[attr-defined]
    return module


class WaiverTests(unittest.TestCase):
    def test_the_four_skills_carry_the_same_waiver_block(self) -> None:
        blocks = {}
        for skill, rel in GATES.items():
            path = SKILLS / skill / rel
            if path.is_file():
                text = path.read_text(encoding="utf-8")
                self.assertIn(BEGIN, text, skill)
                blocks[skill] = text[text.index(BEGIN):text.index(END) + len(END)]
        self.assertIn("Luz-System", blocks)
        self.assertEqual({skill: block == blocks["Luz-System"] for skill, block in blocks.items()}, {skill: True for skill in blocks}, "edit the block in one skill and copy it into the others")

    def test_the_phrase_is_the_one_luz_crawl_writes(self) -> None:
        self.assertEqual(crawl_gate.EXPIRY_MARK, "检索记录超过七天")
        crawl = SKILLS / "Luz-Crawl" / "scripts" / "crawl_preflight.py"
        if crawl.is_file():
            self.assertIn("检索记录超过七天", crawl.read_text(encoding="utf-8"))

    def test_only_the_age_finding_goes_and_only_when_luz_project_waives_the_stage(self) -> None:
        calls: list = []
        with mock.patch.dict(sys.modules, {"approval_docs": fake_api(True, calls)}):
            self.assertEqual(crawl_gate.drop_expired([EXPIRED, OTHER], "state", "architecture"), [OTHER])
        self.assertEqual(calls, [("state", "architecture")])
        with mock.patch.dict(sys.modules, {"approval_docs": fake_api(False)}):
            self.assertEqual(crawl_gate.drop_expired([EXPIRED, OTHER], "state", "architecture"), [EXPIRED, OTHER])

    def test_a_standalone_call_or_a_record_without_the_age_finding_never_asks(self) -> None:
        calls: list = []
        with mock.patch.dict(sys.modules, {"approval_docs": fake_api(True, calls)}):
            self.assertEqual(crawl_gate.drop_expired([EXPIRED, OTHER], "session", None), [EXPIRED, OTHER], "standalone: no project stage, no waiver")
            self.assertEqual(crawl_gate.drop_expired([OTHER], "state", "architecture"), [OTHER])
        self.assertEqual(calls, [])

    def test_without_luz_project_or_when_it_cannot_answer_nothing_is_waived(self) -> None:
        errors = [EXPIRED, OTHER]
        with tempfile.TemporaryDirectory() as empty, mock.patch.dict(os.environ, {"LUZ_PROJECT_SCRIPTS": empty}), mock.patch.dict(sys.modules, {"approval_docs": fake_api(True)}):
            self.assertEqual(crawl_gate.drop_expired(errors, "state", "architecture"), errors)
        broken = types.ModuleType("approval_docs")
        broken.crawl_expiry_waived = mock.Mock(side_effect=RuntimeError("interface changed"))  # type: ignore[attr-defined]
        with mock.patch.dict(sys.modules, {"approval_docs": broken}):
            self.assertEqual(crawl_gate.drop_expired(errors, "state", "architecture"), errors)
        with mock.patch.dict(sys.modules, {"approval_docs": types.ModuleType("approval_docs")}):
            self.assertEqual(crawl_gate.drop_expired(errors, "state", "architecture"), errors)

    def test_the_import_appends_and_sys_path_is_left_as_it_was(self) -> None:
        without_project = [p for p in sys.path if "Luz-Project" not in p]
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "approval_docs.py").write_text("def crawl_expiry_waived(project, stage):\n    return True\n", encoding="utf-8")
            with mock.patch.dict(os.environ, {"LUZ_PROJECT_SCRIPTS": tmp}), mock.patch.dict(sys.modules), mock.patch.object(sys, "path", list(without_project)):
                sys.modules.pop("approval_docs", None)
                self.assertTrue(crawl_gate.expiry_waived("state", "architecture"))
                self.assertEqual(sys.path, without_project)
                sys.modules.pop("approval_docs", None)

    def test_crawl_errors_takes_the_project_stage_and_state_root_of_a_skill_session(self) -> None:
        """A session that is not itself the project passes ``state_root``; a call without a stage keeps the plain result, and so does
        a standalone session whose stage has a name: only a folder that holds project.json is a project to ask."""
        with tempfile.TemporaryDirectory() as tmp:
            scripts = Path(tmp, "scripts")
            scripts.mkdir()
            scripts.joinpath("crawl_preflight.py").write_text(
                f"def validate_preflight(session, caller, stage=None):\n    return [{EXPIRED!r}, {OTHER!r}]\n", encoding="utf-8")
            state, session, standalone = Path(tmp, "state-root"), Path(tmp, "session-folder"), Path(tmp, "standalone-session")
            for folder in (state, session, standalone):
                folder.mkdir()
            for project in (state, session):
                (project / "project.json").write_text("{}", encoding="utf-8")
            asked: list = []
            with mock.patch.dict(os.environ, {"LUZ_CRAWL_ROOT": tmp}), mock.patch.dict(sys.modules, {"approval_docs": fake_api(True, asked)}):
                self.assertEqual(crawl_gate.crawl_errors(str(session), "architecture", "luz-system", state_root=str(state)), [OTHER])
                self.assertEqual(crawl_gate.crawl_errors(str(session), "architecture", "luz-system"), [OTHER], "the session itself is asked when no state root is given")
                self.assertEqual(crawl_gate.crawl_errors(str(session), None, "luz-system", state_root=str(state)), [EXPIRED, OTHER])
                self.assertEqual(crawl_gate.crawl_errors(str(standalone), "architecture", "luz-system"), [EXPIRED, OTHER], "a named stage of a standalone session asks no project")
                self.assertEqual(crawl_gate.crawl_errors(str(standalone), "hardware", "luz-system", state_root=str(standalone)), [EXPIRED, OTHER])
        self.assertEqual(asked, [(str(state), "architecture"), (str(session), "architecture")])


class RealLuzProjectTests(unittest.TestCase):
    """The real ``approval_docs`` on a project made by Luz-Project; only the verdict "stage complete" is forced."""

    def setUp(self) -> None:
        self.scripts = SKILLS / "Luz-Project" / "scripts"
        if not (self.scripts / "approval_docs.py").is_file():
            self.skipTest("Luz-Project is not here")

    def make_project(self, tmp: str) -> Path:
        """A project made by Luz-Project itself. Its code imports ``crawl_gate`` by name and means its own module (the one that takes ``waive_expiry``), so that one is
        in sys.modules while the project is made; afterwards the name is this skill's again, as in a real run."""
        spec = importlib.util.spec_from_file_location("project_crawl_gate", self.scripts / "project_crawl_gate.py")
        module = importlib.util.module_from_spec(spec)
        with mock.patch.dict(sys.modules, {"project_crawl_gate": module}):
            sys.path.append(str(self.scripts))
            spec.loader.exec_module(module)
            from project_core import create_project  # type: ignore[import-not-found]

            return create_project("豁免", Path(tmp) / "项目" / "001-豁免", Path(tmp) / "luz-project", workflow="legacy")

    def test_the_real_interface_answers_a_bool_for_a_real_project_and_for_a_missing_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"LUZ_PROJECT_OUTPUT": str(Path(tmp) / "luz-project")}), mock.patch.object(sys, "path", list(sys.path)):
            state = self.make_project(tmp)
            self.assertFalse(crawl_gate.expiry_waived(state, "architecture"), "a stage that is being worked on keeps the seven days")
            self.assertFalse(crawl_gate.expiry_waived(state, "no-such-stage"))
            self.assertFalse(crawl_gate.expiry_waived(Path(tmp) / "没有的项目", "architecture"), "not a project: nothing is waived")
            import approval_docs  # type: ignore[import-not-found]

            with mock.patch.object(approval_docs, "stage_complete", return_value=True):
                self.assertTrue(crawl_gate.expiry_waived(state, "architecture"))
                self.assertTrue(crawl_gate.expiry_waived(Path(state).parent, "architecture"), "the Luz-Project session folder names the project as well")
                self.assertEqual(crawl_gate.drop_expired([EXPIRED, OTHER], state, "architecture"), [OTHER])
            sys.modules.pop("approval_docs", None)


if __name__ == "__main__":
    unittest.main()
