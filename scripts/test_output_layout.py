"""Output layout (the Luz output standard): session NNN-名称, root = raw\\ + summary page, results of a project task only in the project."""
from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import check_output_layout  # noqa: E402
import hw_export  # noqa: E402
import hw_plan_lib as pl  # noqa: E402
import hw_render_plan  # noqa: E402
import make_summary  # noqa: E402
import new_session  # noqa: E402
import project_link  # noqa: E402
import session_output  # noqa: E402
import validate_session  # noqa: E402
import validate_skill  # noqa: E402
from new_session import create_session  # noqa: E402
from publish import publish  # noqa: E402
from test_session_flow import (  # noqa: E402
    adopt_rules, approve_artifact, approve_module, make_system, read_json, tool_root, write_architecture, write_json,
    write_requirements, write_research, write_system_design,
)
from validate_session import OUTPUT_LAYOUT, validate  # noqa: E402

EXAMPLE = ROOT / "examples" / "unmanned-gym.plan.json"
MAKE_XLSX = Path(r"D:\Codes\Luz-Design\scripts\make_xlsx.py")


def fake_project(tmp: str, *, old: bool = False) -> tuple[Path, Path, Path]:
    """(Luz-Project output root, project directory, state root). An old project keeps project.json in the project root."""
    output = Path(tmp) / "skill输出" / "Luz-Project"
    deliver = Path(tmp) / "014-示例项目"
    deliver.mkdir(parents=True)
    if old:
        state, data = deliver, {"crawl": {"evidence_index": "raw/00-crawl"}}
    else:
        state = output / "014-示例项目" / "raw"
        state.mkdir(parents=True)
        data = {"deliver_root": str(deliver), "crawl": {"evidence_index": "00-crawl"}}
    (state / "project.json").write_text(json.dumps(data), encoding="utf-8")
    return output, deliver, state


def approved_system(root: Path, project: dict | None = None) -> Path:
    """A system session with approved scope, architecture and system design, ready for publish.py."""
    session = create_session(root, "订餐系统", ["system"], skill_root=ROOT, session_kind="system", system_name="订餐系统",
                             modules=["订单", "支付", "预约", "履约", "库存", "优惠券"], project=project)
    write_requirements(session)
    approve_module(session)
    write_research(session)
    write_architecture(session)
    approve_artifact(session, "architecture", "01-system/03-system-architecture.html")
    write_system_design(session)
    approve_artifact(session, "system_design", "01-system/04-system-design.html")
    adopt_rules(session)
    return session


def approved_hardware(root: Path, project: dict | None = None) -> Path:
    session = create_session(root, "无人健身房硬件选型清单", ["hardware"], skill_root=ROOT, project=project)
    sys.path.insert(0, str(ROOT.parent / "Luz-Crawl" / "scripts"))
    from test_crawl_preflight import complete_fixture
    complete_fixture(session, "luz-system")
    page = session / "raw" / "04-hardware" / "hardware-plan.html"
    page.write_bytes(hw_render_plan.render(pl.load(EXAMPLE)).encode("utf-8"))
    approve_artifact(session, "hardware", "04-hardware/hardware-plan.html")
    adopt_rules(session, "硬件设计规范 › 清单", "按规范出清单")
    return session


class OutputLayoutTests(unittest.TestCase):
    def tearDown(self) -> None:
        validate_session.NOTES_FILE = ROOT / "experience" / "notes.json"  # adopt_rules points it at a temporary store

    # ---- new session: NNN-名称, root holds raw\ only until the summary page is published
    def test_new_session_is_numbered_and_its_root_holds_only_raw(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = tool_root(tmp)
            (root / "09-旧格式").mkdir()
            (root / "010_下划线").mkdir()
            first = make_system(root)
            second = create_session(root, "第二个", ["hardware"], skill_root=ROOT)
            self.assertEqual(first.name, "011-订餐系统")            # older two-digit and underscore names count: numbers are never reused
            self.assertEqual(second.name, "012-第二个")
            self.assertEqual([p.name for p in first.iterdir()], ["raw"])
            manifest = read_json(first / "raw" / "99-delivery" / "MANIFEST.json")
            self.assertEqual(manifest["output_layout"], OUTPUT_LAYOUT)
            self.assertNotIn("project", manifest)
            self.assertEqual(validate(first), [])                     # no summary page yet is fine while the session is in progress
            errors, _ = check_output_layout.check_session(first, False)
            self.assertEqual(errors, ["缺少与目录同名的汇总页 011-订餐系统.html（成品本身是 HTML 时它就是汇总页）"])

    def test_standalone_system_design_page_is_the_summary_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = approved_system(tool_root(tmp))
            final = publish(session, "system_design")
            self.assertEqual(final.name, "001-订餐系统.html")
            self.assertEqual(sorted(p.name for p in session.iterdir()), sorted(["raw", final.name]))
            self.assertEqual(check_output_layout.check_session(session, False), ([], []))
            page = final.read_text(encoding="utf-8")
            self.assertIn('<html lang="zh-CN">', page)
            self.assertNotRegex(page, r"user-scalable|maximum-scale")
            self.assertEqual(validate_skill.md_block(page), validate_skill.md_block(validate_skill.md_type_copy_text()))
            self.assertEqual(final.read_bytes(), (session / "raw" / "01-system" / "04-system-design.html").read_bytes())  # nothing beside it: a verbatim copy
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])

    # ---- standalone: the Excel beside the summary page, listed in it
    def test_hardware_excel_beside_the_summary_page_is_listed_in_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = approved_hardware(tool_root(tmp))
            excel = session / "硬件选型清单.xlsx"
            excel.write_bytes(b"PK\x03\x04 test workbook")
            final = publish(session, "hardware")
            page = final.read_text(encoding="utf-8")
            self.assertIn('href="硬件选型清单.xlsx"', page)
            self.assertIn("<h2>成果文件</h2>", page)
            self.assertEqual(sorted(p.name for p in session.iterdir()), sorted(["raw", final.name, excel.name]))
            self.assertEqual(check_output_layout.check_session(session, False), ([], []))
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])
            publish(session, "hardware")                               # publishing again changes nothing
            self.assertEqual(final.read_text(encoding="utf-8"), page)
            # A deliverable that is not listed is reported until the page is published again.
            (session / "附件.pdf").write_bytes(b"%PDF-1.4")
            self.assertTrue(any("附件.pdf" in e and "没有列在汇总页里" in e for e in validate(session, allow_live_crawl_offline=True)))
            publish(session, "hardware")
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])
            # Process files do not belong to the root.
            (session / "说明.md").write_text("x", encoding="utf-8")
            self.assertTrue(any("说明.md" in e for e in validate(session, allow_live_crawl_offline=True)))
            with self.assertRaises(ValueError) as caught:
                publish(session, "hardware")
            self.assertIn("session root", str(caught.exception))

    # ---- older sessions: hints only
    def test_older_session_layout_is_only_a_hint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = make_system(tool_root(tmp))
            manifest_path = session / "raw" / "99-delivery" / "MANIFEST.json"
            manifest = read_json(manifest_path)
            del manifest["output_layout"]
            write_json(manifest_path, manifest)
            (session / "BRIEF.md").write_text("an older session kept its brief at the root", encoding="utf-8")
            (session / "scratch").mkdir()
            warnings: list[str] = []
            self.assertEqual(validate(session, warnings=warnings), [])
            self.assertTrue(any(w.startswith("older output layout, only a hint") and "BRIEF.md" in w for w in warnings), warnings)
            # The same root in a session of the new layout is an error.
            manifest["output_layout"] = OUTPUT_LAYOUT
            write_json(manifest_path, manifest)
            errors = validate(session)
            self.assertTrue(any("output layout" in e and "BRIEF.md" in e for e in errors), errors)
            self.assertTrue(any("output layout" in e and "scratch" in e for e in errors), errors)

    def test_validate_skill_fails_new_sessions_and_hints_at_older_ones(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = tool_root(tmp)
            older = make_system(root)
            manifest_path = older / "raw" / "99-delivery" / "MANIFEST.json"
            manifest = read_json(manifest_path)
            del manifest["output_layout"]
            write_json(manifest_path, manifest)
            (older / "BRIEF.md").write_text("x", encoding="utf-8")
            newer = create_session(root, "新会话", ["hardware"], skill_root=ROOT)
            original = validate_skill.OUTPUT_ROOT
            validate_skill.OUTPUT_ROOT = root
            try:
                buffer = io.StringIO()
                with contextlib.redirect_stdout(buffer):
                    code = validate_skill.main([])
                out = buffer.getvalue()
                self.assertEqual(code, 0, out)
                self.assertIn(f"WARN {older.name}: older output layout, only a hint", out)
                self.assertNotIn("ERROR", out)
                (newer / "notes.txt").write_text("x", encoding="utf-8")
                buffer = io.StringIO()
                with contextlib.redirect_stdout(buffer):
                    code = validate_skill.main([])
                self.assertEqual(code, 1)
                self.assertIn(f"ERROR {newer.name}: output layout:", buffer.getvalue())
            finally:
                validate_skill.OUTPUT_ROOT = original

    # ---- project task
    def test_project_state_root_and_delivery_directory_are_found_from_any_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output, deliver, state = fake_project(tmp)
            for path in (state, deliver, output / "014-示例项目"):
                info = project_link.load(path, output)
                self.assertEqual(Path(info["state_root"]), state.resolve(), path)
                self.assertEqual(Path(info["deliver_root"]), deliver)
                self.assertEqual(Path(info["evidence_index"]), state.resolve() / "00-crawl")
            with self.assertRaises(ValueError):
                project_link.load(Path(tmp) / "没有的项目", output)
        with tempfile.TemporaryDirectory() as tmp:               # an old project: project.json in the project root, results stay there
            output, deliver, state = fake_project(tmp, old=True)
            info = project_link.load(deliver, output)
            self.assertEqual((Path(info["state_root"]), Path(info["deliver_root"])), (deliver.resolve(), deliver.resolve()))
            self.assertEqual(Path(info["evidence_index"]), deliver.resolve() / "raw" / "00-crawl")
        if not os.environ.get(project_link.ENV_VAR):
            self.assertIsNone(project_link.load(None))                 # no project context: a standalone task

    def test_docs_file_names_take_the_next_number_and_keep_their_own(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _, deliver, state = fake_project(tmp)
            info = project_link.load(state)
            docs = deliver / "docs" / "02-产品开发"
            self.assertEqual(project_link.doc_target(info, "development", "系统设计", ".html"), docs / "01-系统设计.html")
            docs.mkdir(parents=True)
            (docs / "01-系统设计.html").write_text("x", encoding="utf-8")
            (docs / "03-后台原型.html").write_text("x", encoding="utf-8")
            self.assertEqual(project_link.doc_target(info, "development", "系统设计", ".html"), docs / "01-系统设计.html")
            self.assertEqual(project_link.doc_target(info, "development", "视觉稿", ".html"), docs / "04-视觉稿.html")
            self.assertEqual(project_link.doc_target(info, "development", "05-手机原型", ".html"), docs / "05-手机原型.html")
            self.assertEqual(project_link.doc_target(info, "requirements", "硬件选型清单", ".xlsx"), deliver / "docs" / "01-需求对接" / "01-硬件选型清单.xlsx")

    def test_new_session_cli_links_a_project_from_the_option_or_the_environment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _, deliver, state = fake_project(tmp)
            root = tool_root(tmp)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(new_session.main(["--name", "项目任务", "--modes", "hardware", "--root", str(root), "--project", str(state)]), 0)
            manifest = read_json(root / "001-项目任务" / "raw" / "99-delivery" / "MANIFEST.json")
            self.assertEqual(Path(manifest["project"]["deliver_root"]), deliver)
            self.assertEqual(manifest["project"]["published"], [])
            previous = os.environ.get(project_link.ENV_VAR)
            os.environ[project_link.ENV_VAR] = str(state)
            try:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(new_session.main(["--name", "环境变量", "--modes", "hardware", "--root", str(root)]), 0)
                os.environ[project_link.ENV_VAR] = str(Path(tmp) / "不存在")
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(new_session.main(["--name", "坏路径", "--modes", "hardware", "--root", str(root)]), 1)
            finally:
                if previous is None:
                    os.environ.pop(project_link.ENV_VAR, None)
                else:
                    os.environ[project_link.ENV_VAR] = previous
            self.assertTrue(read_json(root / "002-环境变量" / "raw" / "99-delivery" / "MANIFEST.json")["project"])
            self.assertFalse(list(root.glob("003-*")))

    def test_project_results_go_only_to_the_project_and_the_session_keeps_a_summary_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _, deliver, state = fake_project(tmp)
            session = approved_system(tool_root(tmp), project_link.load(state))
            final = publish(session, "system_design")
            page = deliver / "docs" / "02-产品开发" / "01-系统设计.html"
            self.assertTrue(page.is_file())
            self.assertEqual(sorted(p.name for p in session.iterdir()), sorted(["raw", final.name]))
            self.assertEqual(check_output_layout.check_session(session, True), ([], []))
            self.assertEqual(check_output_layout.check_project(deliver)[0], [])
            summary = final.read_text(encoding="utf-8")
            self.assertTrue(summary.startswith("<!doctype html>"))
            self.assertIn("<h1>订餐系统</h1>", summary)
            self.assertIn("docs\\02-产品开发\\01-系统设计.html", summary)
            self.assertIn("<h2>成果</h2>", summary)
            self.assertNotIn("user-scalable", summary)
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])
            # The architecture page is another result with the next number; publishing the design again replaces its own page.
            self.assertEqual(publish(session, "architecture"), final)
            publish(session, "system_design")
            self.assertEqual(sorted(p.name for p in (deliver / "docs" / "02-产品开发").iterdir()), ["01-系统设计.html", "02-系统架构.html"])
            self.assertEqual(check_output_layout.check_project(deliver)[0], [])
            self.assertEqual([item["stage"] for item in read_json(session / "raw" / "99-delivery" / "MANIFEST.json")["project"]["published"]],
                             ["architecture", "system_design"])
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])
            # The project's directory holds results only: nothing of raw\ was written there.
            self.assertEqual(sorted(p.name for p in deliver.iterdir()), ["docs"])
            # A file left in the root of a project session is an error.
            (session / "附件.pdf").write_bytes(b"%PDF-1.4")
            errors = validate(session, allow_live_crawl_offline=True)
            self.assertTrue(any("成品已写入项目目录" in e for e in errors), errors)
            (session / "附件.pdf").unlink()
            publish(session, "system_design", "04-系统设计说明")
            self.assertTrue((deliver / "docs" / "02-产品开发" / "04-系统设计说明.html").is_file())

    def test_project_hardware_excel_goes_to_the_requirements_folder(self) -> None:
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            self.skipTest("openpyxl is not installed")
        if not MAKE_XLSX.is_file():
            self.skipTest("Luz-Design make_xlsx.py is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            _, deliver, state = fake_project(tmp)
            session = approved_hardware(tool_root(tmp), project_link.load(state))
            (session / "raw" / "04-hardware" / "plan.json").write_bytes(EXAMPLE.read_bytes())
            final = publish(session, "hardware")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(hw_export.main([str(session)]), 0)
            excel = deliver / "docs" / "01-需求对接" / "01-硬件选型清单.xlsx"
            self.assertTrue(excel.is_file())
            self.assertEqual(sorted(p.name for p in session.iterdir()), sorted(["raw", final.name]))
            summary = final.read_text(encoding="utf-8")
            self.assertIn("docs\\01-需求对接\\01-硬件选型清单.xlsx", summary)         # the summary page was rebuilt to list it
            self.assertIn("docs\\02-产品开发\\01-硬件方案.html", summary)
            self.assertEqual(check_output_layout.check_project(deliver)[0], [])
            self.assertEqual(validate(session, allow_live_crawl_offline=True), [])

    # ---- the shared generator
    def test_summary_generator_passes_the_layout_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp) / "007-汇总页示例"
            spec = Path(tmp) / "spec.json"
            spec.write_text(json.dumps({"title": "汇总页示例", "sections": [
                {"title": "成果", "table": {"caption": "表 1 成果清单", "columns": ["名称", "用途", "位置"], "rows": [["清单", "给客户", "清单.xlsx"]]}}]},
                ensure_ascii=False), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(make_summary.main([str(spec), str(session), "--check"]), 0)
            self.assertTrue((session / "007-汇总页示例.html").is_file())
            self.assertIn(validate_skill.md_block(validate_skill.md_type_copy_text()), make_summary.MD_TYPE)


if __name__ == "__main__":
    unittest.main()
