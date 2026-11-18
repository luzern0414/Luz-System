#!/usr/bin/env python3
"""Check the client function list: data/client/features.json (and intake-extra.json, quote.json).

Read the rule card first: py -X utf8 scripts/context.py function-list   (or client-docs)

Luz-Project builds the client files (function list, business-logic confirmation sheet; workdays and quote only when asked for)
from these data files; this check applies the content rules of references/function-list-design.html (客户功能清单, 业务逻辑的写法,
项目专属问题, 人日与报价) before the data goes to Project, so the client never reads an empty verb, a technical word, a rule
without a boundary, or a workday / price nobody asked for or a human did not give.

  py -X utf8 scripts/features_check.py <features.json | data/client folder> [--intake-extra FILE] [--quote FILE]
                                       [--documents-config <状态根>/config/documents.json]

Estimate policy (user, 2026-11-05): by default a function list has no workdays, budget or price. Two independent switches live in
the project's config/documents.json under "estimate": workdays (hours + hours_basis per function) and quote (unit price; needs
workdays; every number comes from a human quote sheet with evidence). The config path comes from --documents-config, the
environment variable LUZ_DOCUMENTS_CONFIG, or <状态根>/config/documents.json when the target is <状态根>/data/client. Without any
config both switches are off. An old "amounts": false means both off.

ERROR blocks (exit 1); WARN asks for a second look. Structure follows Luz-Project references/client-documents.md section 6.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import estimate_terms as et  # noqa: E402  the policy's words, one copy for every Luz skill (master in Luz-Design, copied by its sync_estimate_terms.py)

SURFACES = ("miniprogram", "web-admin", "agent", "website", "mobile-app", "api", "hardware")
TIERS = ("基础", "可选")
STATUSES = ("in-scope", "out-of-scope", "removed")
# Words for the 'tags' field (client-documents.md section 6); tags drive the acceptance evidence.
TAG_VOCABULARY = (
    "会员", "积分", "储值", "优惠券", "商品", "套餐", "订单", "门店", "预约", "核销", "配送", "退款", "支付", "通知", "发票", "售后",
    "分销", "拉新", "抽奖", "活动", "排队", "并发", "定时任务", "风险预警", "规则引擎", "绩效核算", "单据核算", "知识库", "流程编排", "对接",
)
PLACEHOLDER = re.compile(r"待补充|TODO|TBD|占位符|占位文字|xxx|lorem ipsum", re.I)
OTHER_FILES = et.INTERNAL_DOCUMENT_REFERENCES
INTERNAL_CODE = re.compile(r"\b(?:FN|REQ|ACC|CHG|ARCH|SYS)-\d+\b|\bM\d{2}\b")
EMPTY_VERB = re.compile(r"^(支持|提供|实现|具备|可以|能够|允许)")
VAGUE_RULE = re.compile(r"灵活配置|灵活设置|按需配置|支持配置|可配置即可|根据需要")
# Words a client does not use: stack, tables, calls (client-documents.md section 4 用客户的词).
TECH_WORDS = ("接口", "数据库", "库表", "字段名", "微服务", "中间件", "缓存", "Redis", "MySQL", "API", "SDK", "JSON", "SQL", "回调", "Token", "token", "后端")
BOUNDARY_WORDS = ("必须", "不得", "不能", "只能", "仅", "只", "最多", "最少", "至少", "超过", "不超过", "之前", "之后", "以内", "每", "唯一", "默认", "不再", "才能", "自动", "立即")
GENERIC_INFO = re.compile(r"企业名称|公司名称|单位名称|联系人|联系电话|联系方式|邮箱|云厂商|云服务商|服务器厂商|操作系统|数据库类型|技术栈|开发语言|项目名称|项目负责人")
SECRET_WORDS = re.compile(r"密码|密钥|私钥|AppSecret|secret|Secret|证书私钥|token|Token")
SAFE_CHANNEL = ("已通过安全渠道发送", "尚未发送")

# Estimate policy: words that only belong in the workdays column / quote sheet, never in the text a client reads.
ESTIMATE_WORDS = tuple(et.WORKDAY_WORDS) + tuple(w for w in ("报价", "预算") if w in et.MONEY_WORDS)   # 金额、单价、折扣 are ordinary business words in a function text; these are not
# Fields that are history or amounts: harmless data when the switches are off, but they never reach a client file.
AMOUNT_FIELDS = ("price", "unit_price", "amount", "amounts", "subtotal", "total", "cost", "fee", "discount", "quote")
# Who may give hours or a price: a named person or role (et.not_a_person). Never the agent, a skill, a tool or a placeholder.
SWITCH_EVIDENCE = ("requested_by", "requested_at", "request_note")
QUOTE_EVIDENCE = ("provided_by", "provided_at", "request_note", "evidence")


empty = et.is_blank


def client_text(item: dict) -> str:
    return " ".join(str(item.get(k, "")) for k in ("name", "summary", "rules"))


def estimate_text(item: dict) -> str:
    """Every field of a module or function that a client can read, for the workdays / price word check."""
    return " ".join(json.dumps(item.get(k), ensure_ascii=False) if isinstance(item.get(k), (list, dict)) else str(item.get(k) or "")
                    for k in ("name", "summary", "rules", "acceptance"))


def estimate_word_errors(label: str, item: dict) -> list[str]:
    allowed = {str(w) for w in (item.get("allow_terms") or []) if isinstance(w, str)}
    text = estimate_text(item)
    errors = []
    for word in ESTIMATE_WORDS:
        if word in text and word not in allowed:
            errors.append(f"{label}: 客户文字里出现“{word}”。人日、工时、预算、报价只在开启开关后的列和工作表里出现，不写进功能名、说明、业务逻辑和验收；"
                          f"若“{word}”是系统自身的业务概念（例如询价单、预算管理），在该功能写 allow_terms: [\"{word}\"]")
    return errors


def estimate_from_documents(documents) -> tuple[dict, list[str]]:
    """The 'estimate' object of config/documents.json (or {} = both off), plus warnings about the old 'amounts' switch."""
    warnings: list[str] = []
    if not isinstance(documents, dict):
        return {}, warnings
    estimate = documents.get("estimate")
    if isinstance(estimate, dict):
        return estimate, warnings
    if documents.get("amounts") is True:
        warnings.append("config/documents.json 里是旧的 amounts: true，没有 estimate 开关和要求证据，按人日与报价都关闭处理；"
                        "确实要写，请由用户明确要求后用 project.py 的 estimate 命令打开")
    return {}, warnings


def check_estimate_switches(estimate: dict) -> list[str]:
    """Both switches default to off; turning one on needs who asked, when and in what words; quote needs workdays."""
    errors: list[str] = []
    for key in ("workdays", "quote"):
        if key in estimate and not isinstance(estimate[key], bool):
            errors.append(f"estimate.{key} 须是 true 或 false")
    workdays, quote = estimate.get("workdays") is True, estimate.get("quote") is True
    if quote and not workdays:
        errors.append("estimate.quote 为 true 时 estimate.workdays 必须同时为 true（报价基于人日）")
    if workdays or quote:
        missing = [k for k in SWITCH_EVIDENCE if empty(estimate.get(k))]
        if missing:
            errors.append("estimate 开关已打开但缺 " + "、".join(missing) + "：打开人日或报价必须有谁、何时、用什么原话要求的证据，没有证据的开关打不开")
        elif et.not_a_person(str(estimate.get("requested_by"))):
            errors.append(f"estimate.requested_by“{estimate.get('requested_by')}”不是具体的人：写要求的用户或客户的姓名或角色，不能是智能体、技能、工具、系统")
    return errors


def check_quote(quote) -> list[str]:
    """quote.json when estimate.quote is on: every number comes from a human quote sheet, with the evidence to show it."""
    if quote is None:
        return ["estimate.quote 已开启但没有 quote.json：等待人工报价，把它列为用户待办并停下，不自拟、不暂估、不套用示例值，不生成报价页"]
    if not isinstance(quote, dict):
        return ["quote.json 须是对象"]
    errors: list[str] = []
    price = quote.get("unit_price")
    if isinstance(price, bool) or not isinstance(price, (int, float)) or price <= 0:
        errors.append("quote.json 需含大于 0 的 unit_price（元每人天），且只能来自人工提供的报价单")
    missing = [k for k in QUOTE_EVIDENCE if empty(quote.get(k))]
    if missing:
        errors.append("quote.json 缺人工证据字段 " + "、".join(missing) + "（provided_by 报价的人，provided_at 时间，request_note 要求报价的原话，"
                      "evidence 提供数字的原话或来源文件路径）：缺它们不能渲染也不能批准")
    if not empty(quote.get("provided_by")) and et.not_a_person(str(quote.get("provided_by"))):
        errors.append(f"quote.json 的 provided_by“{quote.get('provided_by')}”不是具体的人：报价只能由人工提供，不能是智能体、技能、工具、系统、示例或暂估")
    evidence = quote.get("evidence")
    if not empty(evidence) and len(json.dumps(evidence, ensure_ascii=False)) <= 10 and et.not_a_person(str(evidence)):
        errors.append("quote.json 的 evidence 只有一个示例、暂估或默认之类的词：写提供数字的原话或来源文件路径（如 uploads/客户报价单.xlsx）")
    return errors


def check_features(spec, quote=None, estimate=None) -> tuple[list[str], list[str]]:
    """estimate: the 'estimate' object of the project's config/documents.json; None or {} = workdays and quote both off."""
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(spec, dict):
        return ["features.json 必须是对象"], warnings
    estimate = estimate if isinstance(estimate, dict) else {}
    errors += check_estimate_switches(estimate)
    workdays = estimate.get("workdays") is True
    quote_on = estimate.get("quote") is True
    modules = spec.get("modules") if isinstance(spec.get("modules"), list) else []
    features = spec.get("features") if isinstance(spec.get("features"), list) else []
    if not modules:
        errors.append("modules 为空")
    if not features:
        errors.append("features 为空")
    module_ids: set[str] = set()
    for module in modules:
        if not isinstance(module, dict) or empty(module.get("id")) or empty(module.get("name")) or empty(module.get("summary")):
            errors.append("每个模块需要 id、name、summary")
            continue
        if module["id"] in module_ids:
            errors.append(f"模块 ID 重复: {module['id']}")
        module_ids.add(module["id"])
        errors += estimate_word_errors(f"模块 {module['id']}", module)
    ids: set[str] = set()
    seen_capability: dict[tuple, str] = {}
    active: list[dict] = []
    legacy_hours: list[str] = []
    legacy_amounts: list[str] = []
    for item in features:
        if not isinstance(item, dict):
            errors.append("功能必须是对象")
            continue
        fid = str(item.get("id", ""))
        label = fid or "(无编号)"
        if not re.fullmatch(r"FN-\d{3,}", fid):
            errors.append(f"{label}: 功能编号须为 FN-001 形式，发布后永不复用")
        if fid in ids:
            errors.append(f"{label}: 功能编号重复")
        ids.add(fid)
        for key in ("module", "name", "surface", "roles", "tier", "summary", "rules"):
            if empty(item.get(key)):
                errors.append(f"{label}: 缺少 {key}")
        if item.get("module") and item["module"] not in module_ids:
            errors.append(f"{label}: 引用不存在的模块 {item['module']}")
        if item.get("surface") and item["surface"] not in SURFACES:
            errors.append(f"{label}: 使用端 {item['surface']} 无效，可选 {'、'.join(SURFACES)}")
        if item.get("tier") and item["tier"] not in TIERS:
            errors.append(f"{label}: 类型须为 基础 或 可选")
        status = item.get("status", "in-scope")
        if status not in STATUSES:
            errors.append(f"{label}: status 须为 {'、'.join(STATUSES)}")
        if status == "removed":
            continue                  # a removed function stays in the file only so that its id is never used again; its text is not read or checked
        roles = item.get("roles")
        if roles is not None and (not isinstance(roles, list) or any(not isinstance(r, str) or not r.strip() for r in roles)):
            errors.append(f"{label}: roles 须为非空文字数组")
        text = client_text(item)
        if PLACEHOLDER.search(text):
            errors.append(f"{label}: 含占位文字，须写成真实内容")
        if OTHER_FILES.search(text):
            errors.append(f"{label}: 每份文件把自己的内容写完整，功能说明里不提及其他文件")
        if INTERNAL_CODE.search(text):
            errors.append(f"{label}: 客户看的文字里不出现内部编号")
        name = str(item.get("name", ""))
        if EMPTY_VERB.match(name):
            errors.append(f"{label}: 功能名“{name}”以空动词开头，写用户能做的事（如“选择月卡或次卡套餐”）")
        if len(name) > 20:
            warnings.append(f"{label}: 功能名超过 20 字，是不是两个功能")
        rules = str(item.get("rules", ""))
        if VAGUE_RULE.search(rules):
            errors.append(f"{label}: 业务逻辑写了“灵活配置”一类说法，写成边界和数字（如“最晚提前 2 小时取消”）")
        elif rules and not re.search(r"\d", rules) and not any(w in rules for w in BOUNDARY_WORDS):
            warnings.append(f"{label}: 业务逻辑没有数字也没有边界词，客户无法确认它")
        if str(item.get("summary", "")).strip() == name.strip() or str(item.get("summary", "")).strip() == rules.strip():
            warnings.append(f"{label}: 功能说明与功能名或业务逻辑完全相同，分别写各自的内容")
        hits = [w for w in TECH_WORDS if w in text]
        if hits:
            warnings.append(f"{label}: 客户文字里出现技术词 {'、'.join(hits)}，换成客户的词")
        errors += estimate_word_errors(label, item)
        hours = item.get("hours")
        if workdays:
            if hours is not None:
                if isinstance(hours, bool) or not isinstance(hours, (int, float)) or hours <= 0 or (hours * 2) % 1:
                    errors.append(f"{label}: hours 须是大于 0、以 0.5 为单位的人天数")
            elif status == "in-scope":
                errors.append(f"{label}: 已开启 estimate.workdays，每个在范围内的功能都要有 hours（人天，最小 0.5）")
            if status == "in-scope":
                basis = item.get("hours_basis")
                if not isinstance(basis, str) or not basis.strip() or re.fullmatch(r"[\d\s.,，。人天日h]*", basis.strip()) or PLACEHOLDER.search(basis):
                    errors.append(f"{label}: 已开启 estimate.workdays，每个在范围内的功能要有 hours_basis"
                                  "（估算依据：功能复杂度、涉及的页面与接口数、参照的同类功能），不能只有数字")
                elif len(basis.strip()) < 8:
                    warnings.append(f"{label}: hours_basis 太短，写清复杂度、页面与接口数或参照的同类功能")
        else:
            if "hours" in item or "hours_basis" in item:
                legacy_hours.append(label)
        if any(k in item for k in AMOUNT_FIELDS):
            legacy_amounts.append(label)
        for tag in item.get("tags", []) or []:
            if tag not in TAG_VOCABULARY:
                warnings.append(f"{label}: 标签“{tag}”不在词表内，标签驱动验收证据，须用词表里的词")
        if status == "in-scope":
            active.append(item)
            key = (item.get("module"), item.get("surface"), name.strip())
            if key in seen_capability:
                errors.append(f"{label}: 与 {seen_capability[key]} 是同一能力（同模块、同使用端、同名），一个能力只写一次")
            else:
                seen_capability[key] = label
    by_id = {f.get("id"): f for f in active}
    for item in active:
        for dep in item.get("depends_on", []) or []:
            if dep not in by_id:
                errors.append(f"{item.get('id')}: depends_on 引用了不在范围内的功能 {dep}")
            elif item.get("tier") == "基础" and by_id[dep].get("tier") == "可选":
                errors.append(f"{item.get('id')}: 基础功能依赖可选功能 {dep}，客户不选它系统就不成立；把它改为基础或拆开")
    used_modules = {f.get("module") for f in active}
    for module in modules:
        if isinstance(module, dict) and module.get("id") and module["id"] not in used_modules:
            errors.append(f"模块 {module['id']} 没有任何在范围内的功能")
    if active and not any(f.get("tier") == "基础" for f in active):
        errors.append("没有任何基础功能：基础功能是系统主流程的底，至少要有一项")
    if legacy_hours:
        warnings.append("未开启 estimate.workdays，hours/hours_basis 是历史字段（" + "、".join(legacy_hours[:8]) + ("等" if len(legacy_hours) > 8 else "")
                        + "）：不会进入客户文件，也不检查其值；确需人日，先由用户明确要求，再按规则打开开关")
    if legacy_amounts:
        warnings.append("功能里有金额类历史字段（" + "、".join(legacy_amounts[:8]) + ("等" if len(legacy_amounts) > 8 else "")
                        + "）：金额只能来自人工提供的 quote.json，这些字段不会进入客户文件，建议删除")
    if quote_on:
        errors += check_quote(quote)
    elif quote is not None:
        warnings.append("未开启 estimate.quote，quote.json 不会用于任何客户文件，也不检查其值")
    return errors, warnings


def check_intake_extra(raw) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if isinstance(raw, dict):
        questions = raw.get("questions", raw.get("items", []))
    else:
        questions = raw
    if not isinstance(questions, list):
        return ["intake-extra.json 须是问题数组，或带 questions 数组的对象"], warnings
    seen: set[str] = set()
    for i, q in enumerate(questions, 1):
        if not isinstance(q, dict):
            errors.append(f"第 {i} 项须是对象")
            continue
        item = str(q.get("item", "")).strip()
        label = f"第 {i} 项“{item or '(无名)'}”"
        if not item:
            errors.append(f"{label}: 缺少 item")
        if item in seen:
            errors.append(f"{label}: 问题重复")
        seen.add(item)
        category = str(q.get("category", ""))
        if " · " not in category:
            errors.append(f"{label}: category 写成“大类 · 子类”")
        kind = q.get("kind") or ("logic" if q.get("feature_id") else "info")
        if kind not in ("logic", "info"):
            errors.append(f"{label}: kind 须为 logic 或 info")
        if empty(q.get("why")):
            errors.append(f"{label}: 缺少说明与理由（写它决定什么、不答会怎样）")
        example = str(q.get("example") or q.get("hint") or "").strip()
        if empty(example):
            errors.append(f"{label}: 缺少 example（逻辑项写拟定的逻辑，资料项写真实可抄的示例）")
        if PLACEHOLDER.search(json.dumps(q, ensure_ascii=False)):
            errors.append(f"{label}: 含占位文字")
        if OTHER_FILES.search(json.dumps(q, ensure_ascii=False)):
            errors.append(f"{label}: 每份文件写完整，不提及其他文件")
        if kind == "logic":
            if example and not re.search(r"\d", example) and not any(w in example for w in BOUNDARY_WORDS) and len(example) < 12:
                warnings.append(f"{label}: 拟定的逻辑要写成可直接确认的一句话（含时间、数字或明确的选择）")
            if example.endswith(("？", "?")):
                errors.append(f"{label}: 逻辑项先给出方案让客户确认，不要把它写成开放提问")
        else:
            if GENERIC_INFO.search(item):
                errors.append(f"{label}: 每个项目都一样的通用信息不问客户（企业名称、联系人、邮箱、云厂商、操作系统等），只问只有客户才有的定制信息")
            if SECRET_WORDS.search(item + " " + example):
                options = [str(o) for o in q.get("options", []) or []]
                if not all(s in options for s in SAFE_CHANNEL):
                    errors.append(f"{label}: 密钥、密码、证书私钥不进表格，只问“已通过安全渠道发送 / 尚未发送”，options 写这两项")
    return errors, warnings


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", type=Path, help="features.json, or the data/client folder holding features.json, intake-extra.json and quote.json")
    ap.add_argument("--intake-extra", type=Path)
    ap.add_argument("--quote", type=Path)
    ap.add_argument("--documents-config", type=Path,
                    help="项目状态根的 config/documents.json（读其中的 estimate）；也可设环境变量 LUZ_DOCUMENTS_CONFIG；"
                         "目标是 <状态根>/data/client 时自动找 <状态根>/config/documents.json；都没有就按人日与报价都关闭")
    args = ap.parse_args(argv)
    folder = args.target if args.target.is_dir() else args.target.parent
    features_path = args.target / "features.json" if args.target.is_dir() else args.target
    if not features_path.is_file():
        print(f"ERROR 找不到 {features_path}")
        return 2
    quote_path = args.quote or (folder / "quote.json" if (folder / "quote.json").is_file() else None)
    extra_path = args.intake_extra or (folder / "intake-extra.json" if (folder / "intake-extra.json").is_file() else None)
    config_path = args.documents_config or (Path(os.environ["LUZ_DOCUMENTS_CONFIG"]) if os.environ.get("LUZ_DOCUMENTS_CONFIG") else None)
    if config_path is None and folder.name == "client" and folder.parent.name == "data":
        guess = folder.parent.parent / "config" / "documents.json"
        config_path = guess if guess.is_file() else None
    documents = None
    if config_path is not None:
        if not config_path.is_file():
            print(f"ERROR 找不到 documents 配置 {config_path}")
            return 2
        documents = load(config_path)
    estimate, estimate_warnings = estimate_from_documents(documents)
    print(f"估算开关: workdays={'开' if estimate.get('workdays') is True else '关'}，quote={'开' if estimate.get('quote') is True else '关'}"
          f"（{config_path if config_path else '未提供 documents 配置，默认关闭'}）")
    errors, warnings = check_features(load(features_path), load(quote_path) if quote_path else None, estimate)
    warnings = estimate_warnings + warnings
    if extra_path:
        e, w = check_intake_extra(load(extra_path))
        errors += [f"intake-extra: {x}" for x in e]
        warnings += [f"intake-extra: {x}" for x in w]
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{'FAIL' if errors else 'PASS'}: {features_path.name} {len(errors)} 个错误，{len(warnings)} 个提醒")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
