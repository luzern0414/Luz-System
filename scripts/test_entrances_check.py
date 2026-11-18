"""The standalone System entrance validator and its published contract."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import entrances_check as ec  # noqa: E402

BASE = {
    "entrances": [
        {"fn": "FN-020", "name": "选择门店", "type": "context", "category": "info", "entry": "context", "destination": "P20", "freq": "high"},
        {"fn": "FN-021", "name": "搜索商品", "type": "search", "category": "core", "entry": "home", "destination": "P21", "freq": "high"},
        {"fn": "FN-006", "name": "去点单", "type": "task", "category": "core", "entry": "tab", "destination": "P03", "freq": "high"},
        {"fn": "FN-030", "name": "我的订单", "type": "order", "category": "core", "entry": "tab", "destination": "P04", "freq": "high"},
        {"fn": "FN-031", "name": "进行中订单", "type": "status", "category": "info", "entry": "home", "destination": "P05", "freq": "high"},
        {"fn": "FN-040", "name": "会员中心", "type": "account", "category": "core", "entry": "mine", "destination": "P40", "freq": "mid", "summary": True},
    ],
    "tabbar": [{"name": "点单", "destination": "P03"}, {"name": "订单", "destination": "P04"}],
}


def run(mutate=None, features=None):
    doc = copy.deepcopy(BASE)
    if mutate:
        mutate(doc)
    _, errors, warnings = ec.check_entrances(doc, features)
    return errors, warnings


def row(doc, fn):
    return next(r for r in doc["entrances"] if r["fn"] == fn)


class EntranceTableTests(unittest.TestCase):
    def test_clean_table_passes(self) -> None:
        self.assertEqual(run(), ([], []))

    def test_missing_field_and_bad_enum_are_errors(self) -> None:
        errors, _ = run(lambda d: (row(d, "FN-006").pop("destination"), row(d, "FN-021").update(entry="unknown-area")))
        self.assertTrue(any("缺 destination" in e for e in errors), errors)
        self.assertTrue(any("entry=unknown-area" in e for e in errors), errors)

    def test_desktop_sidebar_does_not_count_as_a_mobile_tab_bar(self) -> None:
        rows = [
            {"fn": f"FN-{number}", "name": f"管理{number}", "type": "task", "category": "core",
             "entry": "sidebar", "destination": f"/manage/{number}", "freq": "mid"}
            for number in range(1, 9)
        ]
        self.assertEqual(ec.check_entrances({"entrances": rows})[1:], ([], []))

    def test_empty_destination_is_an_error(self) -> None:
        errors, _ = run(lambda d: row(d, "FN-006").update(destination=""))
        self.assertTrue(any("缺 destination" in e for e in errors), errors)

    def test_one_row_per_function(self) -> None:
        errors, _ = run(lambda d: d["entrances"].append(dict(row(d, "FN-021"), entry="mine")))
        self.assertTrue(any("fn 重复" in e for e in errors), errors)

    def test_wallet_never_gets_a_home_entrance_even_with_a_summary(self) -> None:
        errors, _ = run(lambda d: row(d, "FN-040").update(name="我的优惠券", entry="home"))
        self.assertTrue(any("我的优惠券" in e and "摘要" in e for e in errors), errors)
        self.assertEqual(run(lambda d: row(d, "FN-040").update(name="我的优惠券"))[0], [])

    def test_campaign_is_a_distinct_approved_home_action(self) -> None:
        campaign = {"fn": "FN-042", "name": "领取本周活动券", "type": "marketing", "category": "marketing",
                    "entry": "home", "destination": "P42", "freq": "mid"}
        self.assertEqual(run(lambda d: d["entrances"].append(campaign))[0], [])

    def test_order_history_is_distinct_from_a_resume_status(self) -> None:
        errors, _ = run(lambda d: row(d, "FN-030").update(entry="home"))
        self.assertTrue(any("订单模块" in e for e in errors), errors)

    def test_only_one_summary(self) -> None:
        extra = {"fn": "FN-041", "name": "积分", "type": "account", "category": "core", "entry": "mine", "destination": "P41", "freq": "low", "summary": True}
        errors, _ = run(lambda d: d["entrances"].append(extra))
        self.assertTrue(any("summary 只能有一条" in e for e in errors), errors)

    def test_summary_on_other_types_is_a_warning(self) -> None:
        errors, warnings = run(lambda d: (row(d, "FN-040").pop("summary"), row(d, "FN-006").update(summary=True)))
        self.assertEqual(errors, [])
        self.assertTrue(any("summary 只用于账户类" in w for w in warnings), warnings)

    def test_default_placements_are_warnings(self) -> None:
        errors, warnings = run(lambda d: (row(d, "FN-020").update(entry="home"), row(d, "FN-021").update(entry="mine"),
                                          d["entrances"].append({"fn": "FN-050", "name": "发票抬头", "type": "tool", "category": "aux", "entry": "home", "destination": "P50", "freq": "low"})))
        self.assertTrue(any("工具与条款" in e for e in errors), errors)
        for needle in ("全局上下文", "搜索类"):
            self.assertTrue(any(needle in w for w in warnings), (needle, warnings))

    def test_a_shared_destination_is_a_warning(self) -> None:
        errors, warnings = run(lambda d: d["entrances"].append({"fn": "FN-060", "name": "再来一单", "type": "task", "category": "core", "entry": "home", "destination": "p03/", "freq": "mid"}))
        self.assertEqual(errors, [])
        self.assertTrue(any("目的地" in w and "FN-006" in w for w in warnings), warnings)

    def test_tab_rows_must_be_in_the_tabbar(self) -> None:
        errors, _ = run(lambda d: d.update(tabbar=[{"name": "点单", "destination": "P03"}, {"name": "我的", "destination": "P40"}]))
        self.assertTrue(any("FN-030" in e and "tabbar" in e for e in errors), errors)

    def test_tabbar_size_limits(self) -> None:
        tabs = lambda n: [{"name": f"标签{i}", "destination": f"P{i:02d}"} for i in range(n)]
        errors, _ = run(lambda d: d.update(tabbar=tabs(6)))
        self.assertTrue(any("6 项" in e for e in errors), errors)
        errors, _ = run(lambda d: d.update(tabbar=tabs(1)))
        self.assertTrue(any("1 项" in e for e in errors), errors)
        _, warnings = run(lambda d: d.update(tabbar=tabs(5)))
        self.assertTrue(any("5 项" in w or "建议不超过" in w for w in warnings), warnings)

    def test_tabbar_is_derived_from_tab_rows_when_absent(self) -> None:
        errors, _ = run(lambda d: d.pop("tabbar"))
        self.assertEqual(errors, [])
        errors, _ = run(lambda d: (d.pop("tabbar"), row(d, "FN-021").update(entry="tab"), row(d, "FN-020").update(entry="tab"),
                                   row(d, "FN-031").update(entry="tab"), row(d, "FN-040").update(entry="tab", summary=False)))
        self.assertTrue(any("entry 为 tab 的行有 6 行" in e for e in errors), errors)

    def test_features_cross_check(self) -> None:
        features = {"features": [
            {"id": "FN-006", "name": "去点单", "surface": "miniprogram"},
            {"id": "FN-099", "name": "领券", "surface": "miniprogram"},
            {"id": "FN-100", "name": "查看报表", "surface": "web-admin"},
        ]}
        errors, warnings = run(features=features)
        self.assertEqual(errors, [])
        self.assertTrue(any("FN-099" in w and "没有入口行" in w for w in warnings), warnings)
        self.assertFalse(any("FN-100" in w for w in warnings))
        self.assertTrue(any("FN-021" in w and "不在功能清单" in w for w in warnings), warnings)

    def test_wrong_shape_is_reported(self) -> None:
        self.assertEqual(len(ec.check_entrances([])[1]), 1)
        self.assertEqual(len(ec.check_entrances({"entrances": []})[1]), 1)
        self.assertEqual(len(ec.check_entrances({"entrances": ["x"]})[1]), 1)

    def test_the_published_example_passes(self) -> None:
        rows, errors, _ = ec.check_entrances(ec.schema()["example"])
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), len(ec.schema()["example"]["entrances"]))


class CommandLineTests(unittest.TestCase):
    def call(self, args: list[str]) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = ec.main(args)
        return code, out.getvalue()

    def test_file_and_folder_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "entrances.json").write_text(json.dumps(BASE, ensure_ascii=False), encoding="utf-8")
            for target in (folder, folder / "entrances.json"):
                code, out = self.call([str(target)])
                self.assertEqual(code, 0, out)
                self.assertIn("PASS", out)
            bad = copy.deepcopy(BASE)
            bad["entrances"][0]["type"] = "weather"
            (folder / "bad.json").write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
            code, out = self.call([str(folder / "bad.json")])
            self.assertEqual(code, 1)
            self.assertIn("ERROR", out)

    def test_missing_file_exits_2(self) -> None:
        code, out = self.call(["no-such-folder/entrances.json"])
        self.assertEqual(code, 2)

    def test_legacy_design_option_cannot_skip_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "entrances.json"
            path.write_text("{}", encoding="utf-8")
            code, out = self.call([str(path), "--design-scripts", str(Path(temp) / "absent")])
        self.assertEqual(code, 1)
        self.assertIn("ERROR", out)


if __name__ == "__main__":
    unittest.main()
