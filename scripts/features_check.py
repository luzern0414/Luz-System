#!/usr/bin/env python3
"""Check the client function list: data/client/features.json (and intake-extra.json, quote.json).

Read the rule card first: py -X utf8 scripts/context.py function-list   (or client-docs)

Luz-Project builds the client files (function list and quote Excel, business-logic confirmation sheet) from these data files;
this check applies the content rules of references/function-list-design.html (客户功能清单, 业务逻辑的写法, 项目专属问题)
before the data goes to Project, so the client never reads an empty verb, a technical word or a rule without a boundary.

  py -X utf8 scripts/features_check.py <features.json | data/client folder> [--intake-extra FILE] [--quote FILE]

ERROR blocks (exit 1); WARN asks for a second look. Structure follows Luz-Project references/client-documents.md section 6.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SURFACES = ("miniprogram", "web-admin", "agent", "website", "mobile-app", "api", "hardware")
TIERS = ("基础", "可选")
STATUSES = ("in-scope", "out-of-scope", "removed")
# Words for the 'tags' field (client-documents.md section 6); tags drive the acceptance evidence.
TAG_VOCABULARY = (
    "会员", "积分", "储值", "优惠券", "商品", "套餐", "订单", "门店", "预约", "核销", "配送", "退款", "支付", "通知", "发票", "售后",
    "分销", "拉新", "抽奖", "活动", "排队", "并发", "定时任务", "风险预警", "规则引擎", "绩效核算", "单据核算", "知识库", "流程编排", "对接",
)
PLACEHOLDER = re.compile(r"待补充|TODO|TBD|占位符|占位文字|xxx|lorem ipsum", re.I)
OTHER_FILES = re.compile(r"《[^》]{2,16}》|配套文件|见功能清单|见系统架构图|见业务逻辑确认表")
INTERNAL_CODE = re.compile(r"\b(?:FN|REQ|ACC|CHG|ARCH|SYS)-\d+\b|\bM\d{2}\b")
EMPTY_VERB = re.compile(r"^(支持|提供|实现|具备|可以|能够|允许)")
VAGUE_RULE = re.compile(r"灵活配置|灵活设置|按需配置|支持配置|可配置即可|根据需要")
# Words a client does not use: stack, tables, calls (client-documents.md section 4 用客户的词).
TECH_WORDS = ("接口", "数据库", "库表", "字段名", "微服务", "中间件", "缓存", "Redis", "MySQL", "API", "SDK", "JSON", "SQL", "回调", "Token", "token", "后端")
BOUNDARY_WORDS = ("必须", "不得", "不能", "只能", "仅", "只", "最多", "最少", "至少", "超过", "不超过", "之前", "之后", "以内", "每", "唯一", "默认", "不再", "才能", "自动", "立即")
GENERIC_INFO = re.compile(r"企业名称|公司名称|单位名称|联系人|联系电话|联系方式|邮箱|云厂商|云服务商|服务器厂商|操作系统|数据库类型|技术栈|开发语言|项目名称|项目负责人")
SECRET_WORDS = re.compile(r"密码|密钥|私钥|AppSecret|secret|Secret|证书私钥|token|Token")
SAFE_CHANNEL = ("已通过安全渠道发送", "尚未发送")


def empty(value) -> bool:
    return value is None or (isinstance(value, (str, list, dict)) and not value) or (isinstance(value, str) and not value.strip())


def client_text(item: dict) -> str:
    return " ".join(str(item.get(k, "")) for k in ("name", "summary", "rules"))


def check_features(spec, quote=None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(spec, dict):
        return ["features.json 必须是对象"], warnings
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
    ids: set[str] = set()
    seen_capability: dict[tuple, str] = {}
    active: list[dict] = []
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
        hours = item.get("hours")
        if hours is not None:
            if isinstance(hours, bool) or not isinstance(hours, (int, float)) or hours <= 0 or (hours * 2) % 1:
                errors.append(f"{label}: hours 须是大于 0、以 0.5 为单位的人天数")
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
        errors.append("没有任何基础功能：基础功能是报价的底，至少要有一项")
    if quote is not None:
        price = quote.get("unit_price") if isinstance(quote, dict) else None
        if isinstance(price, bool) or not isinstance(price, (int, float)) or price <= 0:
            errors.append("quote.json 需含大于 0 的 unit_price（元每人天）")
        missing = [f["id"] for f in active if not isinstance(f.get("hours"), (int, float)) or isinstance(f.get("hours"), bool)]
        if missing:
            errors.append("有报价时每个在范围内的功能都要有 hours: " + "、".join(missing[:8]))
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
    args = ap.parse_args(argv)
    folder = args.target if args.target.is_dir() else args.target.parent
    features_path = args.target / "features.json" if args.target.is_dir() else args.target
    if not features_path.is_file():
        print(f"ERROR 找不到 {features_path}")
        return 2
    quote_path = args.quote or (folder / "quote.json" if (folder / "quote.json").is_file() else None)
    extra_path = args.intake_extra or (folder / "intake-extra.json" if (folder / "intake-extra.json").is_file() else None)
    errors, warnings = check_features(load(features_path), load(quote_path) if quote_path else None)
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
