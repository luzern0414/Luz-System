"""hw_export.py: the client's hardware list is an Excel built from the same plan as the review page."""
from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hw_export  # noqa: E402
import hw_plan_lib as pl  # noqa: E402

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "unmanned-gym.plan.json"
MAKE_XLSX = Path(r"D:\Codes\Luz-Design\scripts\make_xlsx.py")


def session_with_plan(tmp: str) -> Path:
    session = Path(tmp) / "001-测试"
    (session / "raw" / "04-hardware").mkdir(parents=True)
    shutil.copy(EXAMPLE, session / "raw" / "04-hardware" / "plan.json")
    return session


class HardwareExportTests(unittest.TestCase):
    def test_spec_total_equals_the_plan_budget(self) -> None:
        plan = pl.load(EXAMPLE)
        spec = hw_export.build_spec(plan)
        sheet = spec["sheets"][0]
        total = [f for f in sheet["footer"] if f["label"] == "合计"][0]["values"]["小计（元）"]
        self.assertAlmostEqual(total, pl.budget(plan)["total"], places=2)
        # Site items are conditions, not purchases: they never appear as devices.
        names = {r[1] for r in sheet["rows"]}
        for d in plan["devices"]:
            if d.get("site"):
                self.assertNotIn(d["name"], names)

    def test_columns_follow_the_table_rules(self) -> None:
        spec = hw_export.build_spec(pl.load(EXAMPLE))
        sheet = spec["sheets"][0]
        names = [c["name"] for c in sheet["columns"]]
        self.assertEqual(names[0], "类别")
        self.assertNotIn("序号", names)
        self.assertEqual(sheet["group_by"], ["类别"])
        for row in sheet["rows"]:
            self.assertEqual(len(row), len(names))
            text = re.sub(r"https?://\S+", "", " ".join(map(str, row)))
            self.assertNotRegex(text, r"1[3-9]\d{9}|@", "a personal phone number or e-mail must never reach the client file")

    def test_unpriced_devices_say_so_and_are_not_summed(self) -> None:
        spec = hw_export.build_spec(pl.load(EXAMPLE))
        sheet = spec["sheets"][0]
        unpriced = [r for r in sheet["rows"] if r[6] is None]
        self.assertTrue(unpriced)
        self.assertIn("待询价", sheet["subtitle"])
        for r in unpriced:
            self.assertTrue(r[8], "an unpriced device still names the channel to ask")

    def test_command_writes_spec_and_excel(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = session_with_plan(tmp)
            self.assertEqual(hw_export.main([str(session), "--spec-only"]), 0)
            spec = json.loads((session / "raw" / "04-hardware" / "hardware-list.spec.json").read_text(encoding="utf-8"))
            self.assertEqual([s["sheet"] for s in spec["sheets"]], ["设备清单", "现场条件"])
            if MAKE_XLSX.is_file():
                try:
                    import openpyxl  # noqa: F401
                except ImportError:
                    self.skipTest("openpyxl is not installed")
                self.assertEqual(hw_export.main([str(session)]), 0)
                # A standalone task: the Excel sits beside the summary page, not in raw\.
                self.assertTrue((session / "硬件选型清单.xlsx").is_file())
                self.assertFalse((session / "raw" / "04-hardware" / "client").exists())

    def test_invalid_plan_is_not_exported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = session_with_plan(tmp)
            path = session / "raw" / "04-hardware" / "plan.json"
            plan = json.loads(path.read_text(encoding="utf-8"))
            plan["devices"][0]["id"] = plan["devices"][1]["id"]
            path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(hw_export.main([str(session), "--spec-only"]), 1)


if __name__ == "__main__":
    unittest.main()
