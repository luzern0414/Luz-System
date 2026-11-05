#!/usr/bin/env python3
"""Publish one stage artifact. Standalone task: it becomes the session's summary page <session>/<session-folder>.html (the
deliverable files beside it are listed in it). Project task: it is written to the project's docs\\02-产品开发 and the session
root gets a summary page that lists it; nothing but raw\\ and that page stays in the session root."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import project_link
import session_output
from validate_session import (
    ARCHITECTURE_PATH,
    OUTPUT_LAYOUT,
    PROTOTYPE_PATH,
    SYSTEM_DESIGN_PATH,
    VISUAL_PATH,
    final_html,
    layout_findings,
    root_files,
    rule_card_errors,
    sediment_errors,
    sha256_file,
    tab_icon_errors,
    validate_approval_record,
    validate_light_html,
    work_dir,
)

STAGE_PATHS = {
    "architecture": ARCHITECTURE_PATH,
    "system_design": SYSTEM_DESIGN_PATH,
    "visual": VISUAL_PATH,
    "prototype": PROTOTYPE_PATH,
    "hardware": "04-hardware/hardware-plan.html",
}
# The rule card each stage is built from (references/cards.json), named in the refusal message.
STAGE_CARDS = {
    "architecture": "system-design",
    "system_design": "system-design",
    "visual": "admin-list | miniprogram | website | agent-ui",
    "prototype": "prototype",
    "hardware": "hardware",
}
# A stage belongs to a mode, and add_mode.py adds a mode only after the stages before it are approved by a person.
# Publishing checks the same chain, so a stage written without its approvals is never delivered.
STAGE_MODES = {"architecture": "system", "system_design": "system", "visual": "visual", "prototype": "prototype", "hardware": "hardware"}
UPSTREAM_APPROVALS = {
    "architecture": ("module_scope", "architecture"),
    "system_design": ("module_scope", "architecture"),
    "visual": ("module_scope", "architecture", "system_design"),
    "prototype": ("module_scope", "architecture", "system_design", "visual"),
    # The hardware list has no downstream stage, so its own approval by the person is the gate.
    "hardware": ("hardware",),
}


def approval_gate_errors(work: Path, stage: str) -> list[str]:
    """The stage's mode is declared and every upstream approval is a person's, on the file as it is now."""
    delivery = work / "99-delivery"
    manifest = json.loads((delivery / "MANIFEST.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    mode = STAGE_MODES[stage]
    if mode not in manifest.get("modes", []):
        errors.append(f"stage {stage} belongs to mode {mode}, which this session has not declared: add it with "
                      f"`py -X utf8 scripts/add_mode.py <会话> {mode}`, which checks the approvals before it")
    upstream = UPSTREAM_APPROVALS[stage]
    if stage == "visual" and manifest.get("session_kind") == "standalone_poster":
        upstream = ()
    if not upstream:
        return errors
    try:
        approvals = json.loads((delivery / "APPROVALS.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return errors + ["raw/99-delivery/APPROVALS.json is missing or unreadable"]
    for name in upstream:
        item = approvals.get(name)
        if not isinstance(item, dict) or item.get("status") != "approved":
            errors.append(f"{name} is not approved yet: show it to the person and record their approval in APPROVALS.json "
                          "(scripts and the model never approve)")
            continue
        validate_approval_record(work, name, item, errors)
    return errors


def publish(folder: Path, stage: str, name: str | None = None) -> Path:
    """Publish `stage`; `name` (名称 or NN-名称) is the file name of the page in the project's docs\\02-产品开发 (project task)."""
    folder = folder.resolve()
    work = work_dir(folder)
    if stage not in STAGE_PATHS:
        raise ValueError(f"stage must be one of: {', '.join(STAGE_PATHS)}")
    source = work / STAGE_PATHS[stage]
    if not source.is_file():
        raise FileNotFoundError(f"missing stage artifact: raw/{STAGE_PATHS[stage]}")
    approval_errors = approval_gate_errors(work, stage)
    if approval_errors:
        raise PermissionError("publish refused, approval gate: " + "; ".join(approval_errors))
    from crawl_gate import crawl_errors
    from validate_session import validate_research
    research_errors = crawl_errors(folder, caller="luz-system")
    ledger_path = work / "99-delivery" / "APPROVALS.json"
    selected = json.loads(ledger_path.read_text(encoding="utf-8")).get("module_scope", {}).get("selected_modules", []) if ledger_path.is_file() else []
    validate_research(work, selected, research_errors)
    if research_errors:
        raise ValueError("publish refused, research gate: " + "; ".join(research_errors))
    # Work starts from a current rule card and the BRIEF names the rules it applied (scripts/context.py).
    rule_errors = rule_card_errors(work, require_adopted=True, check_current=True)
    if rule_errors:
        raise ValueError(f"publish refused, rule card gate (`py -X utf8 scripts/context.py {STAGE_CARDS[stage]} --session <会话>`, then fill BRIEF 采用的规则): " + "; ".join(rule_errors))
    # Every call leaves experience behind (SKILL.md 每次调用后沉淀): notes written or confirmed for this session.
    created = json.loads((work / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8")).get("created_at", "")
    note_errors = sediment_errors(work, str(created)[:10])
    if note_errors:
        raise ValueError("publish refused, sediment gate (`py -X utf8 scripts/experience.py note --kind preference|lesson|fact --key <主题> --text \"<一句话原则>\"`, then list the key in BRIEF 本次沉淀): " + "; ".join(note_errors))
    errors: list[str] = []
    # Visual boards and prototypes render real interfaces with a 12px floor for auxiliary text (Luz-Design
    # visual-design.html 字体与字号); a standalone poster and reading pages keep 14px.
    poster = json.loads((work / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8")).get("session_kind") == "standalone_poster"
    interface = stage == "prototype" or (stage == "visual" and not poster)
    root = validate_light_html(source, errors, min_px=12.0 if interface else 14.0)
    # Every published page carries its own browser-tab icon (Luz-Design visual-design.html 网页图标与品牌标识).
    if root is not None:
        errors.extend(tab_icon_errors(root, source.name))
    if errors:
        raise ValueError("stage artifact fails the HTML contract: " + "; ".join(errors))
    # The root of the session is checked before anything is written: only raw\ and, beside the summary page, deliverable files.
    manifest_path = work / "99-delivery" / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("output_layout") == OUTPUT_LAYOUT:
        root_errors, _ = layout_findings(folder, manifest, check_listed=False)
        if root_errors:
            raise ValueError("publish refused, session root: " + "; ".join(root_errors))
    else:                                    # an older session: its root is not held to the new layout, but no second HTML may sit there
        for item in folder.iterdir():
            if item.is_file() and item.suffix.lower() == ".html" and item != final_html(folder):
                raise ValueError(f"unexpected HTML at the session root: {item.name}")
    target = final_html(folder)
    record = {"stage": stage, "source": STAGE_PATHS[stage], "source_sha256": sha256_file(source)}
    if manifest.get("project"):
        # Project task: the page goes to the project directory only; the session root gets a summary page that lists it.
        project = manifest["project"]
        if not Path(project["deliver_root"]).is_dir():
            raise FileNotFoundError(f"the project directory does not exist: {project['deliver_root']}")
        doc_name, purpose = session_output.STAGE_DOCS[stage]
        page = project_link.doc_target(project, "development", name or doc_name, ".html")
        page.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, page)
        session_output.project_result(manifest, stage, page.stem.split("-", 1)[-1], purpose, page)
        session_output.write_summary(folder, manifest)
    else:
        text = source.read_bytes().decode("utf-8")
        target.write_bytes(session_output.inject_deliverables(text, root_files(folder)).encode("utf-8"))
    manifest["final"] = {
        "path": target.name,
        **record,
        "sha256": sha256_file(target),
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", help="Numbered session folder in the output root")
    parser.add_argument("stage", choices=sorted(STAGE_PATHS), help="Stage artifact to publish")
    parser.add_argument("--as", dest="name", help="Project task: the page's file name in docs\\02-产品开发, 名称 or NN-名称 "
                        "(default: the stage's name; a page with the same name is replaced and keeps its number)")
    args = parser.parse_args(argv)
    try:
        target = publish(Path(args.session), args.stage, args.name)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PUBLISHED: {target}")
    if args.stage == "hardware":
        # The page is for review and development; the client reads an Excel (SKILL.md 客户文件与上下游衔接).
        folder = Path(args.session).resolve()
        excel, plan = session_output.hardware_list_target(folder, session_output.read_manifest(folder)), work_dir(folder) / "04-hardware" / "plan.json"
        if not excel.is_file() or (plan.is_file() and excel.stat().st_mtime < plan.stat().st_mtime):
            print("NOTICE: 客户拿到的是 Excel，不是这个网页：先运行 py -X utf8 scripts/hw_export.py <会话目录>，再重新发布本页把它列进去"
                  "（硬件选型清单.xlsx 缺失或早于 plan.json）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
