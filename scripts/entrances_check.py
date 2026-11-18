#!/usr/bin/env python3
"""Validate the System-owned entrances.json handoff without Design installed.

  py -X utf8 scripts/entrances_check.py --schema
  py -X utf8 scripts/entrances_check.py <file or folder> [--features features.json]

Exit 1 for input that violates the contract and 2 for an unreadable file.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import json
import sys
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = SKILL_ROOT / "references" / "entrances-schema.json"
FRONT_SURFACES = {"miniprogram", "website", "mobile-app"}
TAB_MIN, TAB_SOFT_MAX, TAB_MAX = 2, 4, 5
REQUIRED_FIELDS = ("fn", "name", "type", "category", "entry", "destination", "freq")


@lru_cache(maxsize=1)
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def norm_dest(value: Any) -> str:
    text = str(value or "").strip().casefold()
    return "" if text in {"", "#", "none", "null"} else (text.rstrip("/") if len(text) > 1 else text)


def validate_rows(raw_rows: list[dict]) -> tuple[list[dict], list[str]]:
    errors, rows, seen = [], [], set()
    enums = schema()["enums"]
    for index, raw in enumerate(raw_rows, 1):
        where = f"entrances[{index}] {raw.get('fn', '?')}"
        row = {key: raw.get(key) for key in REQUIRED_FIELDS}
        for key, value in row.items():
            if not isinstance(value, str) or not value.strip() or (key == "destination" and not norm_dest(value)):
                errors.append(f"{where} 缺 {key}（须为有效文字）")
            elif key in enums and value not in enums[key]:
                errors.append(f"{where} 的 {key}={value} 不在 {enums[key]}")
        feature = row["fn"]
        if isinstance(feature, str):
            if feature in seen:
                errors.append(f"{where} 的 fn 重复，每个功能一行")
            seen.add(feature)
        for key in ("image", "limited", "summary"):
            if raw.get(key):
                row[key] = True
        rows.append(row)
    return rows, errors


def check_entrances(doc: Any, features: dict | None = None) -> tuple[list[dict], list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(doc, dict) or not isinstance(doc.get("entrances"), list):
        return [], ['entrances.json 的顶层要是 {"entrances": [...], "tabbar": [...]}，entrances 是数组'], warnings
    raw_rows = doc["entrances"]
    if not raw_rows:
        return [], ["entrances 是空的：每个前台功能一行"], warnings
    if any(not isinstance(r, dict) for r in raw_rows):
        return [], ["entrances 的每一项都要是对象"], warnings
    rows, errors = validate_rows(raw_rows)
    if errors:
        return rows, errors, warnings

    summaries = [r for r in rows if r.get("summary")]
    if len(summaries) > 1:
        errors.append(f"summary 只能有一条（首页至多一条账户状态摘要），现在有 {len(summaries)} 条：{'、'.join(r['fn'] for r in summaries)}")
    destinations: dict[str, dict] = {}
    for r in rows:
        where = f"{r['fn']} {r['name']}"
        t, entry = r.get("type"), r.get("entry")
        if entry == "home" and t in schema()["home_exclusions"]:
            errors.append(f"{where}：{schema()['home_exclusions'][t]}")
        if r.get("summary") and t != "account":
            warnings.append(f"{where}：summary 只用于账户类，type 是 {t}")
        if t == "context" and entry != "context":
            warnings.append(f"{where}：全局上下文类默认在上下文栏，entry 现在是 {entry}")
        if t == "search" and entry not in ("home", "in-page"):
            warnings.append(f"{where}：搜索类默认在首页顶部或所属列表页内，entry 现在是 {entry}")
        dest = norm_dest(r.get("destination"))
        if dest and dest in destinations and destinations[dest]["fn"] != r["fn"]:
            warnings.append(f"{where}：目的地 {r['destination']} 与 {destinations[dest]['fn']} 相同；同一目的地在一页只出现一次，请确认是否两个功能")
        elif dest:
            destinations[dest] = r

    tabbar = doc.get("tabbar")
    tab_rows = [r for r in rows if r.get("entry") == "tab"]
    if tabbar is not None:
        if not isinstance(tabbar, list) or any(not isinstance(x, dict) or not x.get("name") or not x.get("destination") for x in tabbar):
            errors.append("tabbar 的每一项要有 name 与 destination")
        else:
            tab_dests = {norm_dest(x["destination"]) for x in tabbar}
            for r in tab_rows:
                if norm_dest(r.get("destination")) not in tab_dests:
                    errors.append(f"{r['fn']} {r['name']}：entry 是 tab，但它的目的地不在 tabbar 里")
            count = len(tabbar)
            if count < TAB_MIN or count > TAB_MAX:
                errors.append(f"标签栏 {count} 项：不少于 {TAB_MIN} 项、不超过 {TAB_MAX} 项")
            elif count > TAB_SOFT_MAX:
                warnings.append(f"标签栏 {count} 项：建议不超过 {TAB_SOFT_MAX} 项，{TAB_MAX} 项要有理由")
    elif tab_rows:
        count = len(tab_rows)
        if count < TAB_MIN or count > TAB_MAX:
            errors.append(f"entry 为 tab 的行有 {count} 行：标签栏不少于 {TAB_MIN} 项、不超过 {TAB_MAX} 项")
        elif count > TAB_SOFT_MAX:
            warnings.append(f"标签栏 {count} 项：建议不超过 {TAB_SOFT_MAX} 项，{TAB_MAX} 项要有理由")

    if features:
        listed = {f.get("id"): f for f in features.get("features", []) if isinstance(f, dict)}
        for r in rows:
            if listed and r["fn"] not in listed:
                warnings.append(f"{r['fn']} {r['name']}：不在功能清单里，请核对功能编号")
        mapped = {r["fn"] for r in rows}
        for fid, f in listed.items():
            if str(f.get("surface", "")).lower() in FRONT_SURFACES and fid not in mapped and f.get("status", "in-scope") == "in-scope":
                warnings.append(f"{fid} {f.get('name', '')}：前台功能没有入口行（页内功能可不写，请确认不是漏了）")
    return rows, errors, warnings


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", nargs="?", type=Path, help="entrances.json, or the folder holding it")
    ap.add_argument("--schema", action="store_true", help="show the canonical contract and an example")
    ap.add_argument("--features", type=Path, help="features.json of the same project, to cross-check function numbers")
    ap.add_argument("--design-scripts", type=Path, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    if args.schema:
        print(json.dumps(schema(), ensure_ascii=False, indent=2))
        return 0
    if args.target is None:
        ap.error("supply an entrances.json path or --schema")
    path = args.target / "entrances.json" if args.target.is_dir() else args.target
    if not path.is_file():
        print(f"ERROR 找不到 {path}")
        return 2
    try:
        doc = load(path)
        features = load(args.features) if args.features else None
    except (OSError, ValueError) as exc:
        print(f"ERROR 读不了文件：{exc}")
        return 2
    _, errors, warnings = check_entrances(doc, features)
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    count = len(doc.get("entrances", [])) if isinstance(doc, dict) and isinstance(doc.get("entrances"), list) else 0
    print(f"{'FAIL' if errors else 'PASS'}: {path.name} {count} 个入口，{len(errors)} 个错误，{len(warnings)} 个提醒")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
