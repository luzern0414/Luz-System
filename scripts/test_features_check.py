"""features_check.py: the client function list follows the content rules before Project builds the client files."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import estimate_terms as et  # noqa: E402
import features_check as fc  # noqa: E402

BASE = {
    "modules": [{"id": "M01", "name": "预约", "summary": "顾客预约时段"}, {"id": "M02", "name": "后台", "summary": "门店管理预约"}],
    "features": [
        {"id": "FN-001", "module": "M01", "name": "选择时段并预约", "surface": "miniprogram", "roles": ["顾客"], "tier": "基础",
         "summary": "顾客在可约时段里选一个并提交", "rules": "最晚提前 2 小时预约；同一顾客同一时段只能约一次", "tags": ["预约"]},
        {"id": "FN-002", "module": "M02", "name": "查看当天预约", "surface": "web-admin", "roles": ["店长"], "tier": "基础",
         "summary": "店长按时段查看当天的预约名单", "rules": "只显示本门店数据；默认按开始时间排序"},
        {"id": "FN-003", "module": "M02", "name": "导出预约名单", "surface": "web-admin", "roles": ["店长"], "tier": "可选",
         "summary": "把当前筛选结果导出成表格", "rules": "导出范围等于当前筛选结果；单次最多 5000 行", "depends_on": ["FN-002"]},
    ],
}


# A project that asked for workdays: who asked, when, and in what words (policy of 2026-11-05).
WORKDAYS_ON = {"workdays": True, "quote": False, "requested_by": "客户采购负责人", "requested_at": "2026-11-05", "request_note": "请在功能清单里给出人日"}
QUOTE_ON = dict(WORKDAYS_ON, quote=True)
HUMAN_QUOTE = {"unit_price": 1000, "provided_by": "商务经理", "provided_at": "2026-11-05", "request_note": "请按报价单给价",
               "evidence": "uploads/客户报价单.xlsx 第 2 行"}


def with_hours(spec):
    for item, hours in zip(spec["features"], (1, 0.5, 1)):
        item["hours"] = hours
        item["hours_basis"] = "一个页面加两个接口，参照同类预约功能"


def run(mutate=None, quote=None, estimate=None):
    spec = copy.deepcopy(BASE)
    if mutate:
        mutate(spec)
    return fc.check_features(spec, quote, estimate)


class FeatureListTests(unittest.TestCase):
    def test_clean_list_passes(self) -> None:
        errors, warnings = run()
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_a_removed_function_is_not_read_again(self) -> None:
        def drop(spec):
            spec["features"].append({"id": "FN-004", "module": "M02", "name": "额度提醒", "surface": "web-admin", "roles": ["店长"], "tier": "基础",
                                     "summary": "额度提醒", "rules": "用完前提醒", "status": "removed", "version": 2, "history": ["CHG-001", "CHG-002"]})
        errors, warnings = run(drop)
        self.assertEqual((errors, warnings), ([], []))          # no hours, no numbers in the rule: nobody needs them for a removed function

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

    def test_a_citation_is_distinct_from_an_internal_project_document(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(
            summary="个人信息处理按《中华人民共和国个人信息保护法》执行。"))
        self.assertEqual(errors, [])

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

    def test_default_has_no_workdays_and_no_quote_and_needs_neither(self) -> None:
        errors, warnings = run()                                 # no estimate config at all = both switches off
        self.assertEqual((errors, warnings), ([], []))
        errors, warnings = run(estimate={"workdays": False, "quote": False})
        self.assertEqual((errors, warnings), ([], []))

    def test_hours_are_not_required_when_workdays_are_off(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(hours=1.3, hours_basis=""))       # history: not read, only reminded
        self.assertEqual(errors, [])

    def test_historical_hours_and_amount_fields_get_a_reminder_not_an_error(self) -> None:
        def old(s):
            with_hours(s)
            s["features"][1]["price"] = 800
        errors, warnings = run(old)
        self.assertEqual(errors, [])
        text = "\n".join(warnings)
        self.assertIn("历史字段", text)
        self.assertIn("FN-001", text)
        self.assertIn("金额类历史字段", text)

    def test_workdays_on_requires_hours_in_half_days_and_a_basis(self) -> None:
        errors, warnings = run(with_hours, estimate=WORKDAYS_ON)
        self.assertEqual((errors, warnings), ([], []))
        errors, _ = run(lambda s: (with_hours(s), s["features"][0].update(hours=1.3)), estimate=WORKDAYS_ON)
        self.assertTrue(any("0.5" in e for e in errors), errors)
        errors, _ = run(lambda s: (with_hours(s), s["features"][0].pop("hours")), estimate=WORKDAYS_ON)
        self.assertTrue(any("FN-001" in e and "都要有 hours" in e for e in errors), errors)
        errors, _ = run(estimate=WORKDAYS_ON)                                               # no hours at all
        self.assertEqual(len([e for e in errors if "都要有 hours" in e]), 3, errors)

    def test_workdays_on_requires_hours_basis_not_just_numbers(self) -> None:
        for basis in (None, "", "   ", "3", "3 人天", "待补充"):
            def mutate(s, basis=basis):
                with_hours(s)
                if basis is None:
                    s["features"][0].pop("hours_basis")
                else:
                    s["features"][0]["hours_basis"] = basis
            errors, _ = run(mutate, estimate=WORKDAYS_ON)
            self.assertTrue(any("FN-001" in e and "hours_basis" in e for e in errors), (basis, errors))
        _, warnings = run(lambda s: (with_hours(s), s["features"][0].update(hours_basis="两个页面")), estimate=WORKDAYS_ON)
        self.assertTrue(any("hours_basis 太短" in w for w in warnings), warnings)

    def test_removed_and_out_of_scope_functions_need_no_hours(self) -> None:
        def drop(s):
            with_hours(s)
            s["features"][2]["status"] = "removed"
            s["features"][2].pop("hours")
            s["features"][2].pop("hours_basis")
            s["features"].append({"id": "FN-004", "module": "M01", "name": "预约提醒", "surface": "miniprogram", "roles": ["顾客"], "tier": "可选",
                                  "summary": "预约前一天提醒顾客", "rules": "提前 1 天提醒", "status": "out-of-scope"})
        errors, _ = run(drop, estimate=WORKDAYS_ON)
        self.assertEqual(errors, [])

    def test_switches_need_evidence_and_quote_needs_workdays(self) -> None:
        errors, _ = run(estimate={"workdays": True})
        self.assertTrue(any("没有证据的开关打不开" in e and "requested_by" in e for e in errors), errors)
        errors, _ = run(with_hours, estimate=dict(WORKDAYS_ON, request_note=""))
        self.assertTrue(any("request_note" in e for e in errors), errors)
        errors, _ = run(with_hours, estimate=dict(WORKDAYS_ON, requested_by="智能体"))
        self.assertTrue(any("不是具体的人" in e for e in errors), errors)
        errors, _ = run(estimate={"workdays": False, "quote": True, "requested_by": "客户", "requested_at": "2026-11-05", "request_note": "要报价"})
        self.assertTrue(any("workdays 必须同时为 true" in e for e in errors), errors)
        errors, _ = run(estimate={"workdays": "yes"})
        self.assertTrue(any("true 或 false" in e for e in errors), errors)

    def test_quote_on_without_a_human_quote_stops(self) -> None:
        errors, _ = run(with_hours, estimate=QUOTE_ON)
        self.assertTrue(any("等待人工报价" in e for e in errors), errors)

    def test_quote_on_with_human_evidence_passes(self) -> None:
        errors, warnings = run(with_hours, quote=HUMAN_QUOTE, estimate=QUOTE_ON)
        self.assertEqual((errors, warnings), ([], []))

    def test_quote_must_carry_human_evidence_and_a_positive_unit_price(self) -> None:
        for key in ("provided_by", "provided_at", "request_note", "evidence"):
            quote = {k: v for k, v in HUMAN_QUOTE.items() if k != key}
            errors, _ = run(with_hours, quote=quote, estimate=QUOTE_ON)
            self.assertTrue(any(key in e and "人工证据" in e for e in errors), (key, errors))
        for price in (0, -1, True, "1000", None):
            errors, _ = run(with_hours, quote=dict(HUMAN_QUOTE, unit_price=price), estimate=QUOTE_ON)
            self.assertTrue(any("unit_price" in e for e in errors), (price, errors))
        errors, _ = run(with_hours, quote={"unit_price": 500}, estimate=QUOTE_ON)            # the old bare quote.json is refused
        self.assertTrue(any("人工证据" in e for e in errors), errors)

    def test_quote_cannot_come_from_the_agent_or_be_an_estimate(self) -> None:
        for who in ("智能体", "Claude", "agent", "示例", "暂估", "系统", "default"):
            errors, _ = run(with_hours, quote=dict(HUMAN_QUOTE, provided_by=who), estimate=QUOTE_ON)
            self.assertTrue(any("provided_by" in e and "不是具体的人" in e for e in errors), (who, errors))
        for who in ("商务经理", "Zhang Wei", "客户采购负责人"):                               # a person or a role passes the shared list (estimate_terms.not_a_person)
            errors, _ = run(with_hours, quote=dict(HUMAN_QUOTE, provided_by=who), estimate=QUOTE_ON)
            self.assertEqual(errors, [], (who, errors))
        errors, _ = run(with_hours, quote=dict(HUMAN_QUOTE, evidence="uploads/客户报价单.xlsx 第 2 行，商务经理微信原话"), estimate=QUOTE_ON)
        self.assertEqual(errors, [])                                                        # a long, real evidence is never read as a placeholder word
        for evidence in ("暂估", "示例数据", "default", "默认值"):
            errors, _ = run(with_hours, quote=dict(HUMAN_QUOTE, evidence=evidence), estimate=QUOTE_ON)
            self.assertTrue(any("evidence" in e for e in errors), (evidence, errors))

    def test_quote_json_is_ignored_with_a_reminder_when_quote_is_off(self) -> None:
        errors, warnings = run(with_hours, quote={"unit_price": 500}, estimate=WORKDAYS_ON)
        self.assertEqual(errors, [])
        self.assertTrue(any("quote.json 不会用于任何客户文件" in w for w in warnings), warnings)

    def test_estimate_words_in_client_text_are_errors_even_with_the_switches_on(self) -> None:
        for field, text in (("summary", "共 3 人日，含报价"), ("name", "查看预算"), ("rules", "工时按 2 天计"), ("acceptance", "预算不超过"),
                            ("summary", "约 5 人天")):
            errors, _ = run(lambda s, f=field, t=text: s["features"][0].update({f: t}))
            self.assertTrue(any("FN-001" in e and "客户文字里出现" in e for e in errors), (field, text, errors))
        errors, _ = run(lambda s: (with_hours(s), s["features"][0].update(summary="共 3 人日")), estimate=WORKDAYS_ON)
        self.assertTrue(any("人日" in e for e in errors), errors)
        errors, _ = run(lambda s: s["modules"][0].update(summary="含报价清单"))
        self.assertTrue(any("模块 M01" in e and "报价" in e for e in errors), errors)

    def test_a_business_concept_can_be_allowed_per_function(self) -> None:
        errors, _ = run(lambda s: s["features"][0].update(name="提交询价单并查看报价", allow_terms=["报价"]))
        self.assertEqual(errors, [])
        errors, _ = run(lambda s: s["features"][0].update(name="提交询价单并查看报价预算", allow_terms=["报价"]))
        self.assertTrue(any("预算" in e for e in errors), errors)                           # allowing one word does not allow the others

    def test_a_removed_function_text_is_not_read_for_estimate_words(self) -> None:
        def drop(s):
            s["features"].append({"id": "FN-009", "module": "M02", "name": "查看人日", "surface": "web-admin", "roles": ["店长"], "tier": "基础",
                                  "summary": "报价", "rules": "预算", "status": "removed"})
        self.assertEqual(run(drop)[0], [])

    def test_removed_features_are_not_counted(self) -> None:
        def drop(s):
            with_hours(s)
            s["features"][2]["status"] = "removed"
            s["features"][2].pop("hours")
            s["features"][2].pop("hours_basis")
        errors, _ = run(drop, quote=HUMAN_QUOTE, estimate=QUOTE_ON)
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
            (folder / "intake-extra.json").write_text(json.dumps(IntakeExtraTests.GOOD, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(fc.main([str(folder)]), 0)
            (folder / "features.json").write_text("{}", encoding="utf-8")
            self.assertEqual(fc.main([str(folder)]), 1)

    def test_cli_reads_the_estimate_switches_from_the_project_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)                                     # a state root: config/documents.json beside data/client
            client = root / "data" / "client"
            client.mkdir(parents=True)
            (root / "config").mkdir()
            (client / "features.json").write_text(json.dumps(BASE, ensure_ascii=False), encoding="utf-8")
            config = root / "config" / "documents.json"
            self.assertEqual(fc.main([str(client)]), 0)                                      # no config: both off
            config.write_text(json.dumps({"amounts": False}), encoding="utf-8")
            self.assertEqual(fc.main([str(client)]), 0)                                      # old switch: both off
            config.write_text(json.dumps({"estimate": WORKDAYS_ON}), encoding="utf-8")
            self.assertEqual(fc.main([str(client)]), 1)                                      # found by the folder layout: hours missing
            spec = copy.deepcopy(BASE)
            with_hours(spec)
            (client / "features.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(fc.main([str(client)]), 0)
            config.write_text(json.dumps({"estimate": QUOTE_ON}), encoding="utf-8")
            self.assertEqual(fc.main([str(client)]), 1)                                      # quote on, nobody gave a number
            (client / "quote.json").write_text(json.dumps(HUMAN_QUOTE, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(fc.main([str(client)]), 0)
            other = root / "elsewhere.json"                                                  # explicit path beats the folder layout
            other.write_text(json.dumps({"estimate": {}}), encoding="utf-8")
            self.assertEqual(fc.main([str(client), "--documents-config", str(other)]), 0)
            self.assertEqual(fc.main([str(client), "--documents-config", str(root / "missing.json")]), 2)

    def test_cli_reads_the_config_from_the_environment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "features.json").write_text(json.dumps(BASE, ensure_ascii=False), encoding="utf-8")
            config = folder / "documents.json"
            config.write_text(json.dumps({"estimate": WORKDAYS_ON}), encoding="utf-8")
            old = os.environ.get("LUZ_DOCUMENTS_CONFIG")
            os.environ["LUZ_DOCUMENTS_CONFIG"] = str(config)
            try:
                self.assertEqual(fc.main([str(folder)]), 1)
            finally:
                if old is None:
                    os.environ.pop("LUZ_DOCUMENTS_CONFIG")
                else:
                    os.environ["LUZ_DOCUMENTS_CONFIG"] = old

    def test_old_amounts_true_without_evidence_does_not_turn_anything_on(self) -> None:
        estimate, warnings = fc.estimate_from_documents({"amounts": True})
        self.assertEqual(estimate, {})
        self.assertTrue(any("amounts: true" in w for w in warnings), warnings)
        self.assertEqual(fc.estimate_from_documents({"amounts": False}), ({}, []))
        self.assertEqual(fc.estimate_from_documents(None), ({}, []))


class SharedTermsTests(unittest.TestCase):
    """The words of the estimate policy are one copy for every Luz skill: this copy must match Luz-Design's master."""

    def test_estimate_terms_copy_matches_the_master(self) -> None:
        master = Path(r"D:\Codes\Luz-Design\scripts\estimate_terms.py")
        if not master.is_file():
            self.skipTest("Luz-Design scripts/estimate_terms.py is not installed: nothing to compare the copy with")
        spec = importlib.util.spec_from_file_location("luz_design_estimate_terms", master)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(et.terms_digest(), module.terms_digest(), "run Luz-Design scripts/sync_estimate_terms.py --write")

    def test_the_checks_use_the_shared_list_not_a_local_one(self) -> None:
        for name in ("NOT_A_PERSON", "NOT_EVIDENCE"):
            self.assertFalse(hasattr(fc, name), f"features_check must not keep its own {name}")
        self.assertIs(fc.et, et)
        self.assertTrue(et.not_a_person("智能体") and not et.not_a_person("商务经理"))


if __name__ == "__main__":
    unittest.main()
