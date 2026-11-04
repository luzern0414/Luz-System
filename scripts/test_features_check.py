"""features_check.py: the client function list follows the content rules before Project builds the client files."""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import features_check as fc  # noqa: E402

BASE = {
    "modules": [{"id": "M01", "name": "预约", "summary": "顾客预约时段"}, {"id": "M02", "name": "后台", "summary": "门店管理预约"}],
    "features": [
        {"id": "FN-001", "module": "M01", "name": "选择时段并预约", "surface": "miniprogram", "roles": ["顾客"], "tier": "基础",
         "summary": "顾客在可约时段里选一个并提交", "rules": "最晚提前 2 小时预约；同一顾客同一时段只能约一次", "tags": ["预约"], "hours": 1},
        {"id": "FN-002", "module": "M02", "name": "查看当天预约", "surface": "web-admin", "roles": ["店长"], "tier": "基础",
         "summary": "店长按时段查看当天的预约名单", "rules": "只显示本门店数据；默认按开始时间排序", "hours": 0.5},
        {"id": "FN-003", "module": "M02", "name": "导出预约名单", "surface": "web-admin", "roles": ["店长"], "tier": "可选",
         "summary": "把当前筛选结果导出成表格", "rules": "导出范围等于当前筛选结果；单次最多 5000 行", "hours": 1, "depends_on": ["FN-002"]},
    ],
}


def run(mutate=None, quote=None):
    spec = copy.deepcopy(BASE)
    if mutate:
        mutate(spec)
    return fc.check_features(spec, quote)


class FeatureListTests(unittest.TestCase):
    def test_clean_list_passes(self) -> None:
        errors, warnings = run(quote={"unit_price": 500})
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_empty_verb_name_is_an_error(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(name="支持预约"))
        self.assertTrue(any("空动词" in e for e in errors), errors)

    def test_vague_rule_is_an_error(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(rules="支持灵活配置"))
        self.assertTrue(any("灵活配置" in e for e in errors), errors)

    def test_rule_without_number_or_boundary_is_a_warning(self) -> None:
        errors, warnings = run(lambda s: s["features"][0].update(rules="显示预约结果"))
        self.assertEqual(errors, [])
        self.assertTrue(any("没有数字也没有边界词" in w for w in warnings), warnings)

    def test_client_text_has_no_internal_codes_files_or_stack_words(self) -> None:
        errors, warnings = run(lambda s: s["features"][0].update(summary="详见《功能清单》，对应 FN-009，调用数据库"))
        self.assertTrue(any("其他文件" in e for e in errors), errors)
        self.assertTrue(any("内部编号" in e for e in errors), errors)
        self.assertTrue(any("数据库" in w for w in warnings), warnings)

    def test_structure_errors(self) -> None:
        def broken(s):
            s["features"][0].update(id="F1", surface="web", tier="高级", roles=[])
        errors, _ = run(broken)
        text = "\n".join(errors)
        for needle in ("FN-001 形式", "使用端 web 无效", "基础 或 可选", "缺少 roles"):
            self.assertIn(needle, text)

    def test_same_capability_twice_is_an_error(self) -> None:
        def twice(s):
            dup = copy.deepcopy(s["features"][1])
            dup["id"] = "FN-004"
            s["features"].append(dup)
        errors, _ = run(twice)
        self.assertTrue(any("同一能力" in e for e in errors), errors)

    def test_basic_cannot_depend_on_optional(self) -> None:
        errors, _ = run(lambda s: s["features"][1].update(depends_on=["FN-003"]))
        self.assertTrue(any("基础功能依赖可选功能" in e for e in errors), errors)

    def test_module_without_features_and_no_basic_feature(self) -> None:
        errors, _ = run(lambda s: s["modules"].append({"id": "M03", "name": "空模块", "summary": "没有功能"}))
        self.assertTrue(any("M03" in e for e in errors), errors)
        errors, _ = run(lambda s: [f.update(tier="可选") for f in s["features"]])
        self.assertTrue(any("没有任何基础功能" in e for e in errors), errors)

    def test_hours_are_half_days_and_required_with_a_quote(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(hours=1.3))
        self.assertTrue(any("0.5" in e for e in errors), errors)
        errors, _ = run(lambda s: s["features"][0].pop("hours"), quote={"unit_price": 500})
        self.assertTrue(any("每个在范围内的功能都要有 hours" in e for e in errors), errors)
        errors, _ = run(quote={"unit_price": 0})
        self.assertTrue(any("unit_price" in e for e in errors), errors)

    def test_removed_features_are_not_counted(self) -> None:
        def drop(s):
            s["features"][2]["status"] = "removed"
            s["features"][2].pop("hours")
        errors, _ = run(drop, quote={"unit_price": 500})
        self.assertEqual(errors, [])

    def test_unknown_tag_is_a_warning(self) -> None:
        _, warnings = run(lambda s: s["features"][0].update(tags=["外卖"]))
        self.assertTrue(any("词表" in w for w in warnings), warnings)


class IntakeExtraTests(unittest.TestCase):
    GOOD = [
        {"category": "业务规则 · 供餐", "item": "午餐的报餐和取餐时间", "kind": "logic",
         "example": "午餐：前一天 15:00 开始报餐，当天 09:30 截止，11:30–13:00 取餐", "why": "决定报餐截止与备餐时间"},
        {"category": "上线资料 · 微信小程序", "item": "小程序 AppID", "kind": "info", "example": "wx3f8a7c2d91b04e56", "why": "小程序上线需要挂在客户主体下"},
    ]

    def test_good_questions_pass(self) -> None:
        errors, warnings = fc.check_intake_extra(self.GOOD)
        self.assertEqual((errors, warnings), ([], []))

    def test_generic_information_is_not_asked(self) -> None:
        bad = [{"category": "基础信息 · 企业", "item": "联系人邮箱", "kind": "info", "example": "a@b.cn", "why": "联系用"}]
        errors, _ = fc.check_intake_extra(bad)
        self.assertTrue(any("通用信息" in e for e in errors), errors)

    def test_secrets_only_ask_whether_sent_through_a_safe_channel(self) -> None:
        bad = [{"category": "上线资料 · 支付", "item": "商户 API 密钥", "kind": "info", "example": "请填写密钥", "why": "支付开通"}]
        errors, _ = fc.check_intake_extra(bad)
        self.assertTrue(any("安全渠道" in e for e in errors), errors)
        ok = [dict(bad[0], example="已通过安全渠道发送", options=["已通过安全渠道发送", "尚未发送"])]
        self.assertEqual(fc.check_intake_extra(ok)[0], [])

    def test_logic_question_proposes_an_answer_and_every_row_has_a_reason(self) -> None:
        bad = [{"category": "业务规则 · 取消", "item": "取消规则", "kind": "logic", "example": "几点前可以取消？"}]
        errors, _ = fc.check_intake_extra({"questions": bad})
        text = "\n".join(errors)
        self.assertIn("开放提问", text)
        self.assertIn("说明与理由", text)

    def test_cli_reads_a_data_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "features.json").write_text(json.dumps(BASE, ensure_ascii=False), encoding="utf-8")
            (folder / "quote.json").write_text(json.dumps({"unit_price": 500}), encoding="utf-8")
            (folder / "intake-extra.json").write_text(json.dumps(IntakeExtraTests.GOOD, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(fc.main([str(folder)]), 0)
            (folder / "features.json").write_text("{}", encoding="utf-8")
            self.assertEqual(fc.main([str(folder)]), 1)


if __name__ == "__main__":
    unittest.main()
