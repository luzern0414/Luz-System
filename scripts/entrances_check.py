#!/usr/bin/env python3
"""Check the entrance table: entrances.json, the file System hands to Luz-Design with the function list.

Read the rule card first: py -X utf8 scripts/context.py system-design   (the architecture checklist row 入口表)

One row per front-end function: fn, name, type, category, entry, destination, freq (optional image, limited, summary), and an
optional tabbar. System decides the entry of every function; Luz-Design lays the home page out from this table and never adds or
removes an entrance (references/ui-ownership.md in Luz-Design). The field, enum and one-row-per-function rules are the ones
Luz-Design's page_pattern.py applies (show entrances_schema); this check imports its validator so the two cannot drift. When the
Luz-Design checkout cannot be found the check says so and exits 0 without blocking.

  py -X utf8 scripts/entrances_check.py <entrances.json | folder holding it> [--features features.json] [--design-scripts DIR]

ERROR blocks (exit 1): a missing or invalid field, a repeated function, an empty destination, an account entrance on the home page
without summary, more than one summary, a tab row missing from the tabbar, a tabbar outside 2 to 5 items.
WARN asks for a second look: a destination used by two rows, a context entrance outside the context bar, a search entrance outside
the home page, a tool entrance on the home page, summary on a non-account row, five tabs, a front-end function without a row.
Exit 2: the file cannot be read.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
DESIGN_SCRIPTS = SKILL_ROOT.parent / "Luz-Design" / "scripts"
FALLBACK_DESIGN_SCRIPTS = Path("D:/Codes/Luz-Design/scripts")
MODULE_NAME = "luz_design_page_pattern"
# Surfaces whose functions have a screen with an entrance; admin, agent and platform consoles use the sidebar instead.
FRONT_SURFACES = {"miniprogram", "website", "mobile-app"}
TAB_MIN, TAB_SOFT_MAX, TAB_MAX = 2, 4, 5


def find_design_scripts(explicit: Path | None = None) -> Path | None:
    for folder in (explicit, DESIGN_SCRIPTS, FALLBACK_DESIGN_SCRIPTS):
        if folder and (Path(folder) / "page_pattern.py").is_file():
            return Path(folder)
    return None


def load_design_module(folder: Path | None = None):
    """Import Luz-Design's page_pattern without leaving its folder on sys.path or its helper modules in sys.modules.

    Both skills have scripts with the same names (context, experience, validate_session); a leftover path entry would make a later
    import in this process read Luz-Design's copy."""
    folder = find_design_scripts(folder)
    if folder is None:
        return None
    saved_path = list(sys.path)
    before = set(sys.modules)
    try:
        sys.path.insert(0, str(folder))
        spec = importlib.util.spec_from_file_location(MODULE_NAME, folder / "page_pattern.py")
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules[MODULE_NAME] = module
        spec.loader.exec_module(module)
        if not callable(getattr(module, "validate_entrances", None)):
            return None
        return module
    except Exception:
        return None
    finally:
        sys.path[:] = saved_path
        for name in set(sys.modules) - before:
            origin = str(getattr(sys.modules[name], "__file__", "") or "")
            if name == MODULE_NAME or (origin and Path(origin).resolve().parent == Path(folder).resolve()):
                del sys.modules[name]


def norm_dest(module: Any, value: Any) -> str:
    fn = getattr(module, "norm_dest", None)
    if callable(fn):
        return fn(value)
    text = str(value or "").strip().lower()
    return "" if text in {"", "#", "none", "null"} else (text.rstrip("/") if len(text) > 1 else text)


def check_entrances(doc: Any, module: Any, features: dict | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(doc, dict) or not isinstance(doc.get("entrances"), list):
        return ['entrances.json 的顶层要是 {"entrances": [...], "tabbar": [...]}，entrances 是数组'], warnings
    raw_rows = doc["entrances"]
    if not raw_rows:
        return ["entrances 是空的：每个前台功能一行"], warnings
    if any(not isinstance(r, dict) for r in raw_rows):
        return ["entrances 的每一项都要是对象"], warnings
    rows, row_errors = module.validate_entrances(raw_rows)
    errors += row_errors
    raw_by_fn = {}
    for raw in raw_rows:
        raw_by_fn.setdefault(raw.get("fn"), raw)

    summaries = [r for r in rows if r.get("summary")]
    if len(summaries) > 1:
        errors.append(f"summary 只能有一条（首页至多一条账户状态摘要），现在有 {len(summaries)} 条：{'、'.join(r['fn'] for r in summaries)}")
    destinations: dict[str, dict] = {}
    for r in rows:
        where = f"{r['fn']} {r['name']}"
        t, entry = r.get("type"), r.get("entry")
        if t == "account" and entry == "home" and not r.get("summary"):
            errors.append(f"{where}：账户类不得把 entry 标成 home 且没有 summary；账户与个人资产归我的，首页最多一条状态摘要（加 summary: true），否则改标 mine")
        if r.get("summary") and t != "account":
            warnings.append(f"{where}：summary 只用于账户类，type 是 {t}")
        if t == "context" and entry != "context":
            warnings.append(f"{where}：全局上下文类默认在上下文栏，entry 现在是 {entry}")
        if t == "search" and entry not in ("home", "in-page"):
            warnings.append(f"{where}：搜索类默认在首页顶部或所属列表页内，entry 现在是 {entry}")
        if t == "tool" and entry == "home":
            warnings.append(f"{where}：低频工具与合规类归我的或页内，entry 标成 home 会被退回")
        dest = norm_dest(module, r.get("destination"))
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
            tab_dests = {norm_dest(module, x["destination"]) for x in tabbar}
            for r in tab_rows:
                if norm_dest(module, r.get("destination")) not in tab_dests:
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
    return errors, warnings


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", type=Path, help="entrances.json, or the folder holding it")
    ap.add_argument("--features", type=Path, help="features.json of the same project, to cross-check function numbers")
    ap.add_argument("--design-scripts", type=Path, help="Luz-Design scripts folder (default: the sibling checkout, then D:/Codes/Luz-Design/scripts)")
    args = ap.parse_args(argv)
    path = args.target / "entrances.json" if args.target.is_dir() else args.target
    if not path.is_file():
        print(f"ERROR 找不到 {path}")
        return 2
    module = load_design_module(args.design_scripts)
    if module is None:
        print("找不到视觉技能的校验器（Luz-Design 的 scripts/page_pattern.py）：本次没有检查入口表，不阻塞；放好视觉技能后重跑。")
        return 0
    try:
        doc = load(path)
        features = load(args.features) if args.features else None
    except (OSError, ValueError) as exc:
        print(f"ERROR 读不了文件：{exc}")
        return 2
    errors, warnings = check_entrances(doc, module, features)
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
