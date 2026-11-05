#!/usr/bin/env python3
"""Hardware list for the client: an Excel file built from raw/04-hardware/plan.json.

Read the rule card first: py -X utf8 scripts/context.py hardware --session "<会话目录>"

Client files are PDF and Excel only; hardware-plan.html (hw_build.py) is the review and development page. This command turns the
same plan into the Excel the client reads: sheet 设备清单 (what to buy, how many, what it costs, where to buy) and sheet 现场条件
(what the site must provide). The layout comes from Luz-Design (make_xlsx.py, 表格文件); the plan is validated first.

  py -X utf8 scripts/hw_export.py "<会话目录>"            writes 硬件选型清单.xlsx beside the summary page (standalone task) or
                                                           docs\\01-需求对接\\NN-硬件选型清单.xlsx in the project directory (project task)
  py -X utf8 scripts/hw_export.py "<会话目录>" --spec-only  writes only the make_xlsx spec (raw/04-hardware/hardware-list.spec.json)

The unit price is the sample taken from the linked source; devices without a price show 询价 and the channel to ask.
A standalone task lists the file in its summary page: run publish.py hardware again after the export.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hw_plan_lib as pl  # noqa: E402
import session_output as so  # noqa: E402
from validate_session import final_html  # noqa: E402

LUZ_DESIGN = Path(r"D:\Codes\Luz-Design")
LEVEL_TAGS = {"必选": "1F3A5F", "推荐": "1F3A5F", "可选": "9A6A1F"}


def channel(device: dict) -> str:
    """Where to buy: the price source first, otherwise the vendor's public website; never a phone number, e-mail or WeChat."""
    if device.get("unit_price") is not None and device.get("url"):
        return str(device["url"])
    contact = device.get("contact") or {}
    if contact.get("website"):
        return str(contact["website"])
    return f"联系{contact['name']}询价" if contact.get("name") else ""


def device_rows(plan: dict) -> list[list]:
    rows = []
    for d in plan["devices"]:
        if not d.get("purchase", True) or d.get("site"):
            continue
        qty = d.get("qty", 1)
        price = d.get("unit_price")
        rows.append([
            d.get("category", "其他"),
            d["name"],
            " ".join(x for x in (d.get("brand"), d.get("model")) if x) or "—",
            d.get("specs") or "—",
            qty,
            price if price is not None else None,
            round(price * qty, 2) if price is not None else None,
            "；".join(x for x in (d.get("interfaces"), f"供电 {d['power']}" if d.get("power") else "") if x) or "—",
            channel(d) or "询价",
            d.get("level", "必选"),
        ])
    return rows


def site_rows(plan: dict) -> list[list]:
    rows = []
    for r in pl.site_requirements(plan):
        rows.append([r["item"], r.get("demand") or r.get("value") or "—", r.get("detail") or "—"])
    for d in plan["devices"]:
        if d.get("site"):
            for item in d.get("requirement_items") or [d.get("requirement", "")]:
                if item:
                    rows.append([d["name"], item, "—"])
    return rows


def build_spec(plan: dict) -> dict:
    rows = device_rows(plan)
    by_level: dict[str, float] = {}
    for r in rows:
        if r[6] is not None:
            by_level[r[9]] = by_level.get(r[9], 0) + r[6]
    unpriced = sum(1 for r in rows if r[6] is None)
    footer = [{"label": f"{lv}小计", "values": {"小计（元）": round(by_level[lv], 2)}} for lv in LEVEL_TAGS if lv in by_level]
    footer.append({"label": "合计", "values": {"小计（元）": round(sum(by_level.values()), 2)}})
    title = plan.get("title") or "硬件选型清单"
    devices_sheet = {
        "sheet": "设备清单",
        "columns": [
            {"name": "类别", "merge": True},
            {"name": "设备", "type": "text"},
            {"name": "品牌型号", "type": "longtext"},
            {"name": "规格", "type": "longtext"},
            {"name": "数量（台）", "type": "number"},
            {"name": "单价（元）", "type": "money"},
            {"name": "小计（元）", "type": "money"},
            {"name": "接口与供电", "type": "longtext"},
            {"name": "采购渠道", "type": "longtext", "muted": True},
            {"name": "类型", "tags": LEVEL_TAGS},
        ],
        "rows": rows,
        "group_by": ["类别"],
        "footer": footer,
    }
    if unpriced:
        devices_sheet["subtitle"] = f"另有 {unpriced} 项设备待询价，未计入合计"
    site_sheet = {
        "sheet": "现场条件",
        "columns": [
            {"name": "项目", "merge": True},
            {"name": "要求", "type": "longtext"},
            {"name": "说明", "type": "longtext", "muted": True},
        ],
        "rows": site_rows(plan),
        "group_by": ["项目"],
    }
    sheets = [devices_sheet]
    if site_sheet["rows"]:
        sheets.append(site_sheet)
    return {"title": title, "theme": "default", "sheets": sheets}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("session", type=Path)
    ap.add_argument("--spec-only", action="store_true")
    args = ap.parse_args(argv)
    session = args.session.resolve()
    raw = session / "raw" / "04-hardware"
    plan = pl.load(raw / "plan.json")
    errors, warnings = pl.validate(plan)
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    if errors:
        print("方案校验有错误，未导出。")
        return 1
    spec = build_spec(plan)
    spec_path = raw / "hardware-list.spec.json"
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"spec: {spec_path}")
    if args.spec_only:
        return 0
    builder = LUZ_DESIGN / "scripts" / "make_xlsx.py"
    if not builder.is_file():
        print("ERROR 找不到 Luz-Design scripts/make_xlsx.py，只写出了描述文件")
        return 1
    manifest = so.read_manifest(session) if (session / "raw" / "99-delivery" / "MANIFEST.json").is_file() else None
    target = so.hardware_list_target(session, manifest)
    target.parent.mkdir(parents=True, exist_ok=True)
    run = subprocess.run([sys.executable, "-X", "utf8", str(builder), str(spec_path), str(target)], capture_output=True, text=True, encoding="utf-8", cwd=str(builder.parent))
    print((run.stdout + run.stderr).strip())
    if run.returncode != 0:
        return run.returncode
    if manifest and manifest.get("project"):
        # Project task: the Excel is a result in the project directory; the summary page lists it.
        so.project_result(manifest, "hardware-list", so.HARDWARE_LIST[0], so.HARDWARE_LIST[1], target)
        so.write_manifest(session, manifest)
        so.refresh_summary(session)
    elif final_html(session).is_file():
        print("NOTICE: 汇总页还没有列出这份 Excel：重新运行 py -X utf8 scripts/publish.py <会话目录> hardware", file=sys.stderr)
    print(f"xlsx: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
