#!/usr/bin/env python3
"""Publish one stage artifact. Standalone task: it becomes the session's summary page <session>/<session-folder>.html (the
deliverable files beside it are listed in it). Project task (the session was made with --project): nothing is published and
nothing is written to the project's docs\\ - the files there are made by Luz-Project (project.py document / client ...), which
asks for the user's approval file by file; this command then only refuses and names the Luz-Project command of the stage."""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

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
        source_stage = manifest.get("source_ui_publications", {}).get(name)
        if isinstance(source_stage, dict) and (item.get("artifact_path") != source_stage.get("path")
                                               or item.get("artifact_sha256") != source_stage.get("sha256")):
            errors.append(f"{name} approval must bind the published complete UI archive, not a legacy placeholder")
    return errors


class ProjectModeError(ValueError):
    """The session belongs to a Luz-Project project: the files in its docs\\ are not published from here."""


def design_module(name: str):
    file = Path(__file__).resolve().parents[2] / "Luz-Design" / "scripts" / f"{name}.py"
    definition = importlib.util.spec_from_file_location(f"_system_publish_design_{name}", file)
    module = importlib.util.module_from_spec(definition)
    definition.loader.exec_module(module)
    return module


def verify_document_template(source: Path, identifier: str) -> None:
    """Keep the registered Design document frame while allowing sourced content."""
    template = Path(__file__).resolve().parents[2] / "Luz-Design" / "templates" / "documents" / "reading" / f"{identifier}.html"
    expected, actual = template.read_text(encoding="utf-8"), source.read_text(encoding="utf-8")
    def head(value):
        match = re.search(r"<head\b[^>]*>(.*?)</head>", value, re.S | re.I)
        if not match:
            raise ValueError("正式文档缺少模板 head")
        body = re.sub(r"<title>.*?</title>", "<title>{{SYSTEM_NAME}}</title>", match[1], flags=re.S | re.I)
        return re.sub(r'(<link\b[^>]*rel="icon"[^>]*href=")[^"]*(")', r'\1{{TAB_ICON}}\2', body)
    if head(actual) != head(expected):
        raise ValueError(f"正式文档没有使用 Luz-Design {identifier} 的真实模板外壳")
    body = actual.split("</head>", 1)[-1]
    if re.search(r"<\s*(style|script|link)\b|\sstyle\s*=|\son[a-z]+\s*=", body, re.I):
        raise ValueError("正式文档正文不能另造样式或脚本；产品 UI 使用来源锁定流程")


def verify_ui_source(reference: dict) -> dict:
    """Use Design's read-only CLI in its own import context, never trust a receipt label."""
    if not isinstance(reference, dict) or set(reference) != {"session", "package", "entrypoint"}:
        raise ValueError("UI 来源须提供 session、package、entrypoint，或 --source-session/--source-package/--source-entry")
    session, package = Path(reference["session"]).resolve(), Path(reference["package"]).resolve()
    if not package.is_relative_to(session / "raw"):
        raise ValueError("UI 来源包必须位于其 Design 会话 raw 内")
    entry_name = str(reference["entrypoint"])
    entry_url = urlsplit(entry_name)
    if entry_url.scheme or entry_url.netloc or not entry_url.path or Path(entry_url.path).is_absolute():
        raise ValueError("UI 来源入口必须是包内的登记相对 URL")
    entry = (package / unquote(entry_url.path)).resolve()
    if not entry.is_relative_to(package) or not entry.is_file():
        raise ValueError("UI 来源入口不存在或越界")
    cli = Path(__file__).resolve().parents[2] / "Luz-Design" / "scripts" / "ui_package.py"
    result = subprocess.run([sys.executable, "-X", "utf8", str(cli), "check", str(package), "--session", str(session)],
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise ValueError("UI 来源重建或浏览器审计未通过：" + (result.stderr or result.stdout)[-1000:])
    proof = json.loads(result.stdout)
    # component_ui.py lists its entries as entrypoints; a frontend.py package lists them in entry_files only.
    registered = proof.get("entrypoints") or list((proof.get("entry_files") or {}).values())
    if entry_name not in registered:
        raise ValueError("所选 UI 文件不是来源包登记入口")
    return proof


def ui_package_template(proof: dict) -> str:
    """The Luz-Design template of the audited package's real type. Design's ui_package.py names the type (``mode``) and the
    template the package was built from; references/template-library.json registers it. A type or template that Design
    has not registered is refused here, never replaced by a guessed identifier."""
    mode, identifier = proof.get("mode"), str(proof.get("template_id") or "")
    fits = identifier == "ui-component-output" if mode == "component-reuse" else mode == "frontend" and identifier.startswith("frontend-")
    library = design_module("template_library")
    entry = library.read(library.CATALOG)["templates"].get(identifier) if fits else None
    if not entry or entry.get("kind") in {"reference-only", "source-catalog"}:
        raise ValueError(f"完整 UI 包的类型没有在 Luz-Design 模板库登记，不能发布：mode={mode!r}，template_id={identifier!r}。"
                         "已登记的类型：component-reuse（模板 ui-component-output，component_ui.py 构建）与 frontend"
                         "（模板 frontend-*，frontend.py 构建）；先用 Luz-Design 的 ui_package.py check 确认这个包")
    return identifier


def verify_ui_publication(folder: Path, manifest: dict, stage: str, *, return_proof: bool = False) -> dict:
    """Recheck the audited source, both complete archives and their binding."""
    publication = manifest.get("source_ui_publications", {}).get(stage)
    if not isinstance(publication, dict):
        raise ValueError(f"{stage} 缺少完整 UI 发布记录")
    reference = manifest.get("source_ui_sources", {}).get(stage)
    if reference != publication.get("reference"):
        raise ValueError(f"{stage} 来源引用与发布时不同")
    proof = verify_ui_source(reference)
    if proof.get("template_id") != publication.get("template_id"):
        raise ValueError(f"{stage} 来源模板与发布时不同")
    stored = work_dir(folder) / str(publication.get("path", ""))
    archive = folder / f"{stage}-source.zip"
    if (publication.get("path") != f"99-delivery/{stage}-source.zip" or publication.get("archive") != archive.name
            or not stored.is_file() or not archive.is_file()
            or sha256_file(stored) != publication.get("sha256") or sha256_file(archive) != publication.get("sha256")):
        raise ValueError(f"{stage} 完整 UI 包缺失或哈希不符")
    design_module("template_library").require_selected(folder, "luz-system", stage, archive, ui_package_template(proof), phase="post")
    package = Path(reference["package"])
    expected = {file.relative_to(package).as_posix(): file for file in package.rglob("*") if file.is_file()}
    with zipfile.ZipFile(archive) as zipped:
        if len(zipped.namelist()) != len(expected) or set(zipped.namelist()) != set(expected):
            raise ValueError(f"{stage} ZIP 不包含完整来源文件")
        if any(zipped.read(name) != file.read_bytes() for name, file in expected.items()):
            raise ValueError(f"{stage} ZIP 与当前已核验来源包不同")
    return {"publication": publication, "proof": proof} if return_proof else publication


def publish_ui_source(folder: Path, stage: str, manifest: dict, reference: dict) -> Path:
    """Deliver the complete audited package as ZIP and a Design reading summary."""
    folder = Path(folder).resolve()
    if stage not in {"visual", "prototype"}:
        raise ValueError("完整 UI 来源仅用于 visual / prototype 阶段")
    # The direct Python API is a publication boundary too. Never trust a
    # caller's stale/missing project or approval fields instead of disk state.
    manifest = json.loads((work_dir(folder) / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8"))
    publication_gate(folder, stage, manifest)
    proof = verify_ui_source(reference)
    library = design_module("template_library")
    target = final_html(folder)
    archive = folder / f"{stage}-source.zip"
    package_template = ui_package_template(proof)
    library.require_selected(folder, "luz-system", stage, archive, package_template)
    library.require_selected(folder, "luz-system", stage, target, "reading-html")
    source_session, package = Path(reference["session"]).resolve(), Path(reference["package"]).resolve()
    exported = source_session / "raw" / "99-delivery" / "system-exports" / f"{uuid.uuid4().hex}.zip"
    _, export_context = design_module("crawl_gate")._context(source_session, exported)
    library.select(export_context["template_root"], "luz-design", export_context["stage"], package_template, str(exported))
    cli = Path(__file__).resolve().parents[2] / "Luz-Design" / "scripts" / "ui_package.py"
    result = subprocess.run([sys.executable, "-X", "utf8", str(cli), "export", str(package), "--session", str(source_session), "--out", str(exported)],
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode or not exported.is_file():
        raise ValueError("UI 完整来源包导出失败：" + (result.stderr or result.stdout)[-1000:])
    stored = work_dir(folder) / "99-delivery" / f"{stage}-source.zip"
    shutil.copyfile(exported, stored)
    spec = {"title": str(manifest.get("system_name") or manifest.get("title") or folder.name), "sections": [
        {"title": "成果", "table": {"caption": "表 1 完整 UI 来源包", "columns": ["文件", "使用方式", "入口"],
                                    "rows": [[archive.name, "解压完整包并按原来源说明运行，保留全部资源", str(reference["entrypoint"])]]}},
        {"title": "依据", "table": {"caption": "表 2 来源与检查", "columns": ["项目", "依据"],
                                    "rows": [["模板", str(proof["template_id"])], ["检查", "ui_package check 与完整 ZIP export 已通过"]]}}]}
    page = design_module("make_summary").render(spec)
    # The summary links to the complete archive; it never republishes a detached UI page.
    page = re.sub(r'(<td\b[^>]*>)' + re.escape(html.escape(archive.name)) + r'(</td>)',
                  lambda match: match[1] + f'<a href="{html.escape(archive.name, quote=True)}">{html.escape(archive.name)}</a>' + match[2],
                  page, count=1)
    page = session_output.inject_deliverables(page, [p for p in root_files(folder) if p != archive])
    candidate = stored.with_name(f"{stage}-summary.html")
    candidate.write_text(page, encoding="utf-8")
    checker = Path(__file__).resolve().parents[2] / "Luz-Design" / "scripts" / "check_document.py"
    checked = subprocess.run([sys.executable, "-X", "utf8", str(checker), str(candidate)], capture_output=True,
                             text=True, encoding="utf-8", errors="replace")
    if checked.returncode:
        raise ValueError("UI 汇总页未通过 Design 文档检查：" + (checked.stderr or checked.stdout)[-1000:])
    shutil.copyfile(stored, archive)
    target.write_text(page, encoding="utf-8")
    library.record_output(folder, "luz-system", stage, archive, package_template, generator="Luz-Design/scripts/ui_package.py:export")
    library.record_output(folder, "luz-system", stage, target, "reading-html", generator="Luz-System/scripts/publish.py:source-summary")
    manifest.setdefault("source_ui_sources", {})[stage] = reference
    source_record = {"path": stored.relative_to(work_dir(folder)).as_posix(), "sha256": sha256_file(stored),
                     "archive": archive.name, "template_id": str(proof["template_id"]),
                     "reference": dict(reference)}
    manifest.setdefault("source_ui_publications", {})[stage] = source_record
    staged = manifest.setdefault("stages", {}).setdefault(stage, {})
    staged.update({"path": source_record["path"], "sha256": source_record["sha256"]})
    if "approval" not in staged:
        staged["approval"] = "pending"
    manifest["final"] = {"stage": stage, "kind": "source-ui-summary", "path": target.name,
                         "source": stored.relative_to(work_dir(folder)).as_posix(), "source_sha256": sha256_file(stored),
                         "sha256": sha256_file(target), "template_id": "reading-html", "template_stage": stage,
                         "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    session_output.write_manifest(folder, manifest)
    return target


# stage -> (Luz-Project stage, what Luz-Project makes of it in docs\\02-产品开发, whose rule card the spec follows)
PROJECT_STAGE_DOCS = {
    "architecture": ("architecture", "01-系统架构.html", "本技能的 system-design 卡"),
    "system_design": ("architecture", "01-系统架构.html", "本技能的 system-design 卡"),
    "visual": ("design", "02-前端界面设计.html", "Luz-Design 的 design-path 卡"),
    "prototype": ("design", "02-前端界面设计.html 与各前端原型（03-…原型.html）", "Luz-Design 的 design-path 卡"),
}


def project_refusal(stage: str, project: dict) -> str:
    """Why a project session does not publish, and the Luz-Project command that makes the file of this stage."""
    target = project.get("state_root") or "<项目>"
    head = ("publish refused, project mode: 项目任务不由 publish.py 写 docs（也不再要求会话里的 APPROVALS.json）；docs 里的文件由 Luz-Project 生成，"
            "用户在那里逐个审批（project.py next / approve --doc）。")
    if stage in PROJECT_STAGE_DOCS:
        project_stage, document, owner = PROJECT_STAGE_DOCS[stage]
        extra = "Project 没有单独的系统设计页：系统设计并入 01-系统架构 的「功能与技术方案」页签，每个功能一张功能卡。" if stage == "system_design" else ""
        return (f"{head}{stage} 对应 Luz-Project 的 {project_stage} 阶段，文件 {document}：先 project.py context \"{target}\" {project_stage} --skill luz-system 取交接，"
                f"按 {owner} 与 Luz-Project 的 references/dev-documents.md 写 spec（tabs 与 sources），再运行 "
                f"py -X utf8 D:\\Codes\\Luz-Project\\scripts\\project.py document \"{target}\" {project_stage} --file <spec.json>。{extra}会话里的 {STAGE_PATHS[stage]} 只是起草参考。")
    return (f"{head}硬件方案页在 Luz-Project 的 docs 里没有对应文件：把设备、接口、协议和现场条件写进 architecture 的 spec（技术栈、部署页签）与功能清单（surface: hardware）；"
            "硬件选型清单 Excel 仍由 hw_export.py 导出。独立会话（没有 --project）照常发布。")


def publication_gate(folder: Path, stage: str, manifest: dict) -> None:
    """The same read-only gates guard CLI publishing and direct UI publishing."""
    if stage not in STAGE_PATHS:
        raise ValueError(f"stage must be one of: {', '.join(STAGE_PATHS)}")
    if manifest.get("project"):
        raise ProjectModeError(project_refusal(stage, manifest["project"]))
    work = work_dir(folder)
    approval_errors = approval_gate_errors(work, stage)
    if approval_errors:
        raise PermissionError("publish refused, approval gate: " + "; ".join(approval_errors))
    definition = importlib.util.spec_from_file_location("_system_publish_crawl_gate", Path(__file__).with_name("crawl_gate.py"))
    own_gate = importlib.util.module_from_spec(definition)
    definition.loader.exec_module(own_gate)
    from validate_session import validate_research
    research_errors = own_gate.crawl_errors(folder, stage.replace("_", "-"), caller="luz-system")
    ledger_path = work / "99-delivery" / "APPROVALS.json"
    selected = json.loads(ledger_path.read_text(encoding="utf-8")).get("module_scope", {}).get("selected_modules", []) if ledger_path.is_file() else []
    validate_research(work, selected, research_errors)
    if research_errors:
        raise ValueError("publish refused, research gate: " + "; ".join(research_errors))
    rule_errors = rule_card_errors(work, require_adopted=True, check_current=True)
    if rule_errors:
        raise ValueError(f"publish refused, rule card gate (`py -X utf8 scripts/context.py {STAGE_CARDS[stage]} --session <会话>`, then fill BRIEF 采用的规则): " + "; ".join(rule_errors))
    note_errors = sediment_errors(work, str(manifest.get("created_at", ""))[:10])
    if note_errors:
        raise ValueError("publish refused, sediment gate: " + "; ".join(note_errors))
    if manifest.get("output_layout") == OUTPUT_LAYOUT:
        root_errors, _ = layout_findings(folder, manifest, check_listed=False)
        if root_errors:
            raise ValueError("publish refused, session root: " + "; ".join(root_errors))
    else:
        for item in folder.iterdir():
            if item.is_file() and item.suffix.lower() == ".html" and item != final_html(folder):
                raise ValueError(f"unexpected HTML at the session root: {item.name}")


def publish(folder: Path, stage: str, *, source_reference: dict | None = None) -> Path:
    """Publish `stage` as the summary page of a standalone session. A session made for a Luz-Project project refuses (ProjectModeError)."""
    folder = folder.resolve()
    work = work_dir(folder)
    if stage not in STAGE_PATHS:
        raise ValueError(f"stage must be one of: {', '.join(STAGE_PATHS)}")
    manifest = json.loads((work / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8"))
    project = manifest.get("project")
    if project:
        raise ProjectModeError(project_refusal(stage, project))
    source = work / STAGE_PATHS[stage]
    interface = stage == "prototype" or (stage == "visual" and manifest.get("session_kind") != "standalone_poster")
    if not interface and not source.is_file():
        raise FileNotFoundError(f"missing stage artifact: raw/{STAGE_PATHS[stage]}")
    template_stage = stage.replace("_", "-")
    if interface:
        reference = source_reference or manifest.get("source_ui_sources", {}).get(stage)
        return publish_ui_source(folder, stage, manifest, reference)
    publication_gate(folder, stage, manifest)
    errors: list[str] = []
    # Interfaces left above as complete UI packages; what is published here is a reading page (14px floor).
    root = validate_light_html(source, errors, min_px=14.0)
    # Every published page carries its own browser-tab icon (Luz-Design visual-design.html 网页图标与品牌标识).
    if root is not None:
        errors.extend(tab_icon_errors(root, source.name))
    if errors:
        raise ValueError("stage artifact fails the HTML contract: " + "; ".join(errors))
    manifest_path = work / "99-delivery" / "MANIFEST.json"
    target = final_html(folder)
    library = design_module("template_library")
    identifier = {"architecture": "system-architecture", "system_design": "system-design", "hardware": "hardware-plan"}.get(stage)
    if identifier is None:
        raise ValueError("海报由 Luz-Design 生成；System 不发布自造视觉外壳")
    library.require_selected(folder, "luz-system", template_stage, source, identifier)
    library.require_selected(folder, "luz-system", template_stage, target, identifier)
    if stage == "hardware":
        import hw_plan_lib
        import hw_render_plan
        plan = work / "04-hardware" / "plan.json"
        if not plan.is_file() or source.read_text(encoding="utf-8") != hw_render_plan.render(hw_plan_lib.load(plan)):
            raise ValueError("硬件来源页不是当前 plan 经 Luz-Design 模板生成的真实成品；重新运行 hw_build.py")
    else:
        verify_document_template(source, identifier)
    library.record_output(folder, "luz-system", template_stage, source, identifier, generator="Luz-System/scripts/publish.py:verified-source")
    record = {"stage": stage, "source": STAGE_PATHS[stage], "source_sha256": sha256_file(source)}
    text = source.read_bytes().decode("utf-8")
    target.write_bytes(session_output.inject_deliverables(text, root_files(folder)).encode("utf-8"))
    library.record_output(folder, "luz-system", template_stage, target, identifier, generator="Luz-System/scripts/publish.py")
    manifest["final"] = {
        "path": target.name,
        **record,
        "sha256": sha256_file(target),
        "template_id": identifier,
        "template_stage": template_stage,
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", help="Numbered session folder in the output root")
    parser.add_argument("stage", choices=sorted(STAGE_PATHS), help="Stage artifact to publish")
    parser.add_argument("--source-session", help="已完成 build/audit/check 的 Luz-Design 会话")
    parser.add_argument("--source-package", help="该 Design 会话 raw 内的完整来源包")
    parser.add_argument("--source-entry", help="来源包已登记入口，相对包目录")
    parser.add_argument("--check-ui", action="store_true", help="只读重验已发布 UI 包及当前 Design 证据，输出 JSON")
    args = parser.parse_args(argv)
    try:
        if args.check_ui:
            folder=Path(args.session).resolve()
            manifest=json.loads((work_dir(folder)/'99-delivery/MANIFEST.json').read_text(encoding='utf-8'))
            print(json.dumps(verify_ui_publication(folder,manifest,args.stage,return_proof=True),ensure_ascii=False))
            return 0
        supplied = [args.source_session, args.source_package, args.source_entry]
        if any(supplied) and not all(supplied):
            raise ValueError("三个 --source-* 参数必须一起提供")
        reference = {"session": args.source_session, "package": args.source_package, "entrypoint": args.source_entry} if all(supplied) else None
        target = publish(Path(args.session), args.stage, source_reference=reference)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PUBLISHED: {target}")
    if args.stage == "hardware":
        # The page is for review and development; the client reads an Excel (SKILL.md 客户文件).
        folder = Path(args.session).resolve()
        excel, plan = session_output.hardware_list_target(folder, session_output.read_manifest(folder)), work_dir(folder) / "04-hardware" / "plan.json"
        if not excel.is_file() or (plan.is_file() and excel.stat().st_mtime < plan.stat().st_mtime):
            print("NOTICE: 客户拿到的是 Excel，不是这个网页：先运行 py -X utf8 scripts/hw_export.py <会话目录>，再重新发布本页把它列进去"
                  "（硬件选型清单.xlsx 缺失或早于 plan.json）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
