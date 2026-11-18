"""hw_export.py: the client's hardware list is an Excel built from the same plan as the review page.

Budget policy (user, 2026-11-05): the list has no price column unless the plan carries budget_requested (who asked, when, in what words);
then every figure is a reference price taken from its source page, never a quotation.
"""
from __future__ import annotations

import copy
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
import hw_render_plan  # noqa: E402
from test_session_flow import select_design

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "unmanned-gym.plan.json"
MAKE_XLSX = Path(r"D:\Codes\Luz-Design\scripts\make_xlsx.py")
BUDGET = {"requested_by": "客户采购负责人", "requested_at": "2026-11-05", "request_note": "请在硬件清单里给出参考价和总预算"}
PRICE_WORDS = re.compile(r"单价|参考价|小计|合计|报价|预算|金额|¥")


def priced_plan() -> dict:
    plan = pl.load(EXAMPLE)
    plan["budget_requested"] = copy.deepcopy(BUDGET)
    return plan


def session_with_plan(tmp: str, budget: dict | None = None) -> Path:
    session = Path(tmp) / "001-测试"
    (session / "raw" / "04-hardware").mkdir(parents=True)
    shutil.copy(EXAMPLE, session / "raw" / "04-hardware" / "plan.json")
    if budget is not None:
        path = session / "raw" / "04-hardware" / "plan.json"
        plan = json.loads(path.read_text(encoding="utf-8"))
        plan["budget_requested"] = budget
        path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    sys.path.append(str(Path(__file__).resolve().parents[2] / "Luz-Crawl" / "scripts"))
    from test_crawl_preflight import complete_fixture
    complete_fixture(session, "luz-system", "hardware")
    select_design(session, "hardware", "xlsx", session / "硬件选型清单.xlsx")
    return session


def design_knows_reference_prices() -> bool:
    """Luz-Design's make_xlsx releases amount cells for a hardware list only through the spec's allow_quote and quote_evidence."""
    return MAKE_XLSX.is_file() and "allow_quote" in MAKE_XLSX.read_text(encoding="utf-8")


class DefaultListHasNoPrices(unittest.TestCase):
    def test_no_price_column_footer_or_evidence_by_default(self) -> None:
        spec = hw_export.build_spec(pl.load(EXAMPLE))
        sheet = spec["sheets"][0]
        names = [c["name"] for c in sheet["columns"]]
        self.assertEqual(names, ["类别", "设备", "品牌型号", "规格", "数量（台）", "接口与供电", "采购渠道", "类型"])
        self.assertNotIn("footer", sheet)
        self.assertNotIn("subtitle", sheet)
        self.assertNotIn("quote_evidence", spec)
        self.assertNotIn("allow_quote", spec)
        for column in names:
            self.assertNotRegex(column, PRICE_WORDS)
        for row in sheet["rows"]:
            self.assertEqual(len(row), len(names))
            self.assertTrue(row[6], "every device names where to buy it (source page or vendor site), prices or not")

    def test_prices_in_the_plan_do_not_reach_the_list_without_budget_requested(self) -> None:
        plan = pl.load(EXAMPLE)
        self.assertTrue(any(d.get("unit_price") is not None for d in plan["devices"]))     # research data stays in the plan
        errors, warnings = pl.validate(plan)
        self.assertEqual(errors, [])
        self.assertTrue(any("budget_requested" in w for w in warnings), warnings)
        spec = hw_export.build_spec(plan)
        self.assertNotRegex(json.dumps(spec["sheets"][0], ensure_ascii=False), r"参考价|小计|合计")      # the site sheet's electrical totals (合计约 6.5 A) are not money
        for row in spec["sheets"][0]["rows"]:
            self.assertTrue(all(isinstance(v, str) for i, v in enumerate(row) if i != 4), "only the quantity is a number; no price cell")

    def test_review_page_has_no_price_and_no_budget_section_by_default(self) -> None:
        html = hw_render_plan.render(pl.load(EXAMPLE))
        self.assertNotIn("¥", html)
        self.assertNotIn('id="budget"', html)
        self.assertNotRegex(html, r"预算|参考价|参考价合计|需询价")

    def test_columns_follow_the_table_rules(self) -> None:
        for plan in (pl.load(EXAMPLE), priced_plan()):
            sheet = hw_export.build_spec(plan)["sheets"][0]
            names = [c["name"] for c in sheet["columns"]]
            self.assertEqual(names[0], "类别")
            self.assertNotIn("序号", names)
            self.assertEqual(sheet["group_by"], ["类别"])
            # Site items are conditions, not purchases: they never appear as devices.
            devices = {r[1] for r in sheet["rows"]}
            for d in plan["devices"]:
                if d.get("site"):
                    self.assertNotIn(d["name"], devices)
            for row in sheet["rows"]:
                self.assertEqual(len(row), len(names))
                text = re.sub(r"https?://\S+", "", " ".join(map(str, row)))
                self.assertNotRegex(text, r"1[3-9]\d{9}|@", "a personal phone number or e-mail must never reach the client file")


class ReferencePricesOnRequest(unittest.TestCase):
    def test_prices_appear_as_reference_prices_with_evidence(self) -> None:
        plan = priced_plan()
        self.assertEqual(pl.validate(plan)[0], [])
        self.assertTrue(pl.show_prices(plan))
        spec = hw_export.build_spec(plan)
        sheet = spec["sheets"][0]
        names = [c["name"] for c in sheet["columns"]]
        self.assertEqual(names[5:7], ["参考价（元）", "小计（元）"])
        self.assertNotIn("单价（元）", names)
        total = [f for f in sheet["footer"] if f["label"] == "参考价合计"][0]["values"]["小计（元）"]
        self.assertAlmostEqual(total, pl.budget(plan)["total"], places=2)
        self.assertNotIn("报价合计", json.dumps(spec, ensure_ascii=False))
        # Luz-Design refuses a subtitle under the table title, so what the client must know is in the data: the column is
        # named 参考价, a device without a price says 待询价, and one summary row counts those devices outside every total.
        self.assertNotIn("subtitle", sheet)
        self.assertNotIn("subtitle", spec)
        unpriced = [r for r in sheet["rows"] if r[6] is None]
        self.assertTrue(unpriced)
        self.assertEqual({r[5] for r in unpriced}, {"待询价"})
        pending = [f for f in sheet["footer"] if f["label"] == "待询价设备小计"]
        self.assertEqual([f["values"] for f in pending], [{"数量（台）": sum(r[4] for r in unpriced)}])
        self.assertEqual(sheet["footer"][-2]["label"], "参考价合计", "the devices still to be quoted come after the total and are not in it")
        self.assertEqual({k: spec["quote_evidence"][k] for k in ("requested_by", "requested_at", "request_note")}, BUDGET)
        self.assertTrue(spec["allow_quote"])
        self.assertIn("非报价", spec["quote_evidence"]["evidence"])
        for row in sheet["rows"]:
            self.assertEqual(len(row), len(names))

    def test_unpriced_devices_say_so_and_are_not_summed(self) -> None:
        sheet = hw_export.build_spec(priced_plan())["sheets"][0]
        unpriced = [r for r in sheet["rows"] if r[5] == "待询价"]
        self.assertTrue(unpriced)
        for r in unpriced:
            self.assertIsNone(r[6])
            self.assertTrue(r[8], "an unpriced device still names the channel to ask")
        self.assertTrue(all(isinstance(r[5], (int, float)) for r in sheet["rows"] if r[6] is not None), "a price cell is a figure or 待询价, never empty")
        plan = priced_plan()
        for device in plan["devices"]:
            device["unit_price"] = device.get("unit_price") or 1
        footer = hw_export.build_spec(plan)["sheets"][0]["footer"]
        self.assertNotIn("待询价设备小计", [f["label"] for f in footer], "no pending row when every device has a reference price")

    def test_every_priced_device_has_its_source_page(self) -> None:
        plan = priced_plan()
        for d in plan["devices"]:
            if d.get("unit_price") is not None and d.get("purchase", True):
                self.assertTrue(d.get("url"), d["id"])
        plan["devices"][0].pop("url")
        errors, _ = pl.validate(plan)
        self.assertTrue(any("价格出处链接" in e for e in errors), errors)

    def test_review_page_shows_the_reference_price_sentence_and_total(self) -> None:
        html = hw_render_plan.render(priced_plan())
        self.assertIn("参考价来自公开页面，非报价", html)
        self.assertIn("参考价合计", html)
        self.assertIn('id="budget"', html)
        self.assertNotIn("报价合计", html)

    def test_budget_evidence_is_required(self) -> None:
        for broken in (True, {"requested_by": "客户"}, dict(BUDGET, request_note=""), dict(BUDGET, requested_at=None), "要预算"):
            plan = pl.load(EXAMPLE)
            plan["budget_requested"] = broken
            errors, _ = pl.validate(plan)
            self.assertTrue(any("budget_requested" in e for e in errors), (broken, errors))
            self.assertFalse(pl.show_prices(plan), broken)
        plan = pl.load(EXAMPLE)
        plan["budget_requested"] = dict(BUDGET, requested_by="智能体")
        errors, _ = pl.validate(plan)
        self.assertTrue(any("不是具体的人" in e for e in errors), errors)
        self.assertFalse(pl.show_prices(plan))
        plan["budget_requested"] = {}
        self.assertEqual(pl.validate(plan)[0], [])                       # empty = nobody asked

    def test_who_may_ask_for_a_budget_comes_from_the_shared_list(self) -> None:
        import estimate_terms
        self.assertIs(pl.et, estimate_terms)                               # one copy of the policy's words, not a list kept here
        for who in ("智能体", "Claude", "default", "暂估"):
            plan = priced_plan()
            plan["budget_requested"] = dict(BUDGET, requested_by=who)
            self.assertFalse(pl.show_prices(plan), who)
        self.assertTrue(pl.show_prices(priced_plan()))

    def test_a_plan_with_broken_evidence_is_not_exported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = session_with_plan(tmp, {"requested_by": "客户"})
            self.assertEqual(hw_export.main([str(session), "--spec-only"]), 1)


class ChannelAndCommand(unittest.TestCase):
    def test_a_purchased_device_needs_a_source_page_or_a_contact(self) -> None:
        plan = pl.load(EXAMPLE)
        victim = next(d for d in plan["devices"] if d.get("id") == "ctrl")
        victim.pop("unit_price", None)
        errors, _ = pl.validate(plan)
        self.assertEqual(errors, [], "a source page alone is a channel")
        victim.pop("url")
        errors, _ = pl.validate(plan)
        self.assertTrue(any("没有采购渠道" in e for e in errors), errors)

    def test_command_writes_spec_and_excel(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = session_with_plan(tmp)
            self.assertEqual(hw_export.main([str(session), "--spec-only"]), 0)
            spec = json.loads((session / "raw" / "04-hardware" / "hardware-list.spec.json").read_text(encoding="utf-8"))
            self.assertEqual([s["sheet"] for s in spec["sheets"]], ["设备清单", "现场条件"])
            self.assertNotIn("quote_evidence", spec)
            self.assertNotIn("allow_quote", spec)
            if MAKE_XLSX.is_file():
                try:
                    import openpyxl  # noqa: F401
                except ImportError:
                    self.skipTest("openpyxl is not installed")
                self.assertEqual(hw_export.main([str(session)]), 0)
                # A standalone task: the Excel sits beside the summary page, not in raw\.
                self.assertTrue((session / "硬件选型清单.xlsx").is_file())
                self.assertFalse((session / "raw" / "04-hardware" / "client").exists())

    def test_priced_command_writes_the_excel_when_design_accepts_the_evidence(self) -> None:
        if not design_knows_reference_prices():
            self.skipTest("Luz-Design make_xlsx.py does not read allow_quote yet")
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            self.skipTest("openpyxl is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            session = session_with_plan(tmp, BUDGET)
            self.assertEqual(hw_export.main([str(session)]), 0)
            self.assertTrue((session / "硬件选型清单.xlsx").is_file())
            # What the client sees: the title row, then the table; reference prices, 待询价 cells and the summary rows are all in the table.
            import openpyxl
            cells = [[c for c in row] for row in openpyxl.load_workbook(session / "硬件选型清单.xlsx")["设备清单"].iter_rows(values_only=True)]
            header = next(i for i, row in enumerate(cells) if row[0] == "类别")
            self.assertEqual([row for row in cells[1:header] if any(v is not None for v in row)], [], "nothing between the title and the header")
            self.assertIn("参考价（元）", cells[header])
            price = cells[header].index("参考价（元）")
            self.assertIn("待询价", [row[price] for row in cells[header + 1:]])
            labels = [row[0] for row in cells[header + 1:]]
            self.assertLess(labels.index("参考价合计"), labels.index("待询价设备小计"))

    def test_priced_spec_without_evidence_cannot_slip_through(self) -> None:
        # The spec of a plan with a budget carries allow_quote and its evidence; a plan without one never writes an amount cell.
        spec = hw_export.build_spec(priced_plan())
        self.assertIn("quote_evidence", spec)
        self.assertTrue(spec["allow_quote"])
        plain = hw_export.build_spec(pl.load(EXAMPLE))
        self.assertNotIn("参考价（元）", json.dumps(plain, ensure_ascii=False))

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
