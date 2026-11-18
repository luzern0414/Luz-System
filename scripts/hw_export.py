#!/usr/bin/env python3
"""Hardware list for the client: an Excel file built from raw/04-hardware/plan.json.

Read the rule card first: py -X utf8 scripts/context.py hardware --session "<会话目录>"

Client files are PDF and Excel only; hardware-plan.html (hw_build.py) is the review and development page. This command turns the
same plan into the Excel the client reads: sheet 设备清单 (what to buy, how many, where to buy) and sheet 现场条件 (what the site
must provide). The layout comes from Luz-Design (make_xlsx.py, 表格文件); the plan is validated first.

Budget policy (user, 2026-11-05): the list carries no price column by default (no unit price, subtotal or total). Only when the plan
has budget_requested (who asked, when, in what words) does the sheet add 参考价（元）, subtotals and a 参考价合计; every figure is the
sample on its linked source page (a reference price, not a quotation); the spec then carries allow_quote and quote_evidence for Luz-Design's check.
Luz-Design allows no subtitle or note under a table title, so everything the client must know is a field of the table: the column is
named 参考价, every priced row links its source page, a device without a price says 待询价 and one summary row counts those devices.

  py -X utf8 scripts/hw_export.py "<会话目录>"            writes 硬件选型清单.xlsx beside the summary page (standalone task) or
                                                           docs\\01-需求对接\\NN-硬件选型清单.xlsx in the project directory (project task)
  py -X utf8 scripts/hw_export.py "<会话目录>" --spec-only  writes only the make_xlsx spec (raw/04-hardware/hardware-list.spec.json)

With prices on, a device without one shows 待询价 and the channel to ask. A quotation a person supplied separately follows the project policy
(estimate.quote, quote.json), never this plan.
A standalone task lists the file in its summary page: run publish.py hardware again after the export.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hw_plan_lib as pl  # noqa: E402
import session_output as so  # noqa: E402
from validate_session import final_html  # noqa: E402
from hw_crawl_gate import generation_errors, template_binding, research_context  # noqa: E402

LUZ_DESIGN = Path(r"D:\Codes\Luz-Design")
LEVEL_TAGS = {"必选": "1F3A5F", "推荐": "1F3A5F", "可选": "9A6A1F"}
UNPRICED = "待询价"  # the price cell of a device that has no reference price; such a device is in no subtotal or total


def channel(device: dict) -> str:
    """Where to buy: the price source first, otherwise the vendor's public website; never a phone number, e-mail or WeChat."""
    if device.get("unit_price") is not None and device.get("url"):
        return str(device["url"])
    contact = device.get("contact") or {}
    if contact.get("website"):
        return str(contact["website"])
    return f"联系{contact['name']}询价" if contact.get("name") else ""


def device_rows(plan: dict, prices: bool = False) -> list[list]:
    """Row layout: 类别, 设备, 品牌型号, 规格, 数量 [, 参考价, 小计 when prices], 接口与供电, 采购渠道, 类型."""
    rows = []
    for d in plan["devices"]:
        if not d.get("purchase", True) or d.get("site"):
            continue
        qty = d.get("qty", 1)
        price = d.get("unit_price")
        row = [
            d.get("category", "其他"),
            d["name"],
            " ".join(x for x in (d.get("brand"), d.get("model")) if x) or "—",
            d.get("specs") or "—",
            qty,
        ]
        if prices:
            row += [price if price is not None else UNPRICED, round(price * qty, 2) if price is not None else None]
        row += [
            "；".join(x for x in (d.get("interfaces"), f"供电 {d['power']}" if d.get("power") else "") if x) or "—",
            channel(d) or "询价",
            d.get("level", "必选"),
        ]
        rows.append(row)
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
    prices = pl.show_prices(plan)
    rows = device_rows(plan, prices)
    title = plan.get("title") or "硬件选型清单"
    columns = [
        {"name": "类别", "merge": True},
        {"name": "设备", "type": "text"},
        {"name": "品牌型号", "type": "longtext"},
        {"name": "规格", "type": "longtext"},
        {"name": "数量（台）", "type": "number"},
    ]
    if prices:
        columns += [{"name": "参考价（元）", "type": "money"}, {"name": "小计（元）", "type": "money"}]
    columns += [
        {"name": "接口与供电", "type": "longtext"},
        {"name": "采购渠道", "type": "longtext", "muted": True},
        {"name": "类型", "tags": LEVEL_TAGS},
    ]
    devices_sheet = {"sheet": "设备清单", "columns": columns, "rows": rows, "group_by": ["类别"]}
    spec: dict = {"title": title, "theme": "default"}
    if prices:
        # sub = index of 小计, level = index of 类型 in a priced row
        by_level: dict[str, float] = {}
        for r in rows:
            if r[6] is not None:
                by_level[r[-1]] = by_level.get(r[-1], 0) + r[6]
        footer = [{"label": f"{lv}小计", "values": {"小计（元）": round(by_level[lv], 2)}} for lv in LEVEL_TAGS if lv in by_level]
        footer.append({"label": "参考价合计", "values": {"小计（元）": round(sum(by_level.values()), 2)}})
        # No subtitle (Luz-Design make_xlsx.py refuses one): the devices still to be quoted are counted in a row of their own, outside every total.
        pending = sum(r[4] for r in rows if r[6] is None)
        if pending:
            footer.append({"label": f"{UNPRICED}设备小计", "values": {"数量（台）": pending}})
        devices_sheet["footer"] = footer
        req = plan["budget_requested"]
        # Luz-Design's xlsx check (make_xlsx.py "allow_quote") releases the amount cells only with this evidence: who asked for a budget,
        # in what words, and that every figure is a reference price taken from the source page named in its row.
        spec["allow_quote"] = True
        spec["quote_evidence"] = {"requested_by": req["requested_by"], "requested_at": req["requested_at"], "request_note": req["request_note"],
                                  "evidence": "每项参考价取自设备行采购渠道中的来源页面，非报价"}
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
    spec["sheets"] = sheets
    return spec


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("session", type=Path)
    ap.add_argument("--spec-only", action="store_true")
    args = ap.parse_args(argv)
    session = args.session.resolve()
    research_errors = generation_errors(session)
    if research_errors:
        for error in research_errors:
            print("ERROR", error, file=sys.stderr)
        return 1
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
    try:
        template_binding(session, target, "xlsx")
    except (OSError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1
    target.parent.mkdir(parents=True, exist_ok=True)
    # The System entry point already checked this task's research. Reuse Design's
    # pure renderer and output check, without starting another business session.
    original_path = list(sys.path)
    try:
        sys.path.insert(0, str(builder.parent))
        definition = importlib.util.spec_from_file_location("_hardware_design_xlsx", builder)
        renderer = importlib.util.module_from_spec(definition)
        definition.loader.exec_module(renderer)
        from design_output_gate import verified_output_context
        evidence_root, stage = research_context(session)
        context = verified_output_context(evidence_root, "luz-system", stage, target, "xlsx")
        allow = renderer.estimate_allow(spec)
        renderer.build(spec, target, context=context)
        code = renderer.verify_output(target, "xlsx", bool(spec.get("sheets")), allow)
    except (OSError, ValueError, ImportError) as exc:
        print(f"ERROR 硬件清单排版失败：{exc}", file=sys.stderr)
        return 1
    finally:
        sys.path[:] = original_path
    if code:
        return code
    template_binding(session, target, "xlsx", post=True, generator="Luz-System/scripts/hw_export.py")
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
