"""Research context for hardware generators; checks are read-only and never run a new crawl."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path


def research_context(session: Path) -> tuple[Path, str | None]:
    """Resolve the same explicit project/session for research and template bindings."""
    session = Path(session).resolve()
    manifest = session / "raw" / "99-delivery" / "MANIFEST.json"
    project = json.loads(manifest.read_text(encoding="utf-8-sig")).get("project") if manifest.is_file() else None
    if project is None:
        reference = session if (session / "project.json").is_file() or (session / "raw" / "project.json").is_file() else os.environ.get("LUZ_PROJECT_ROOT")
        if reference:
            link_spec = importlib.util.spec_from_file_location("_hardware_project_link", Path(__file__).with_name("project_link.py"))
            links = importlib.util.module_from_spec(link_spec)
            link_spec.loader.exec_module(links)
            project = links.load(reference)
    if project is not None:
        if not isinstance(project, dict) or not project.get("state_root"):
            raise ValueError("Crawl 前置检索：硬件会话缺少有效的 project.state_root")
        context = Path(project["state_root"]).resolve()
        if not (context / "project.json").is_file():
            raise ValueError(f"Crawl 前置检索：项目状态根不存在 project.json：{context}")
        return context, "architecture"
    return session, "hardware"


def generation_errors(session: Path) -> list[str]:
    try:
        context, stage = research_context(session)
        spec = importlib.util.spec_from_file_location("_hardware_crawl_gate", Path(__file__).with_name("crawl_gate.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.crawl_errors(context, stage, caller="luz-system", state_root=context)
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        return [f"Crawl 前置检索上下文无效：{exc}"]


def template_binding(session: Path, target: Path, identifier: str, *, post: bool = False, generator: str = ""):
    """A template selection uses exactly the hardware task's resolved context."""
    context, stage = research_context(session)
    if Path(target).resolve().is_relative_to(Path(session).resolve()):
        context = Path(session).resolve()
    file = Path(__file__).resolve().parents[2] / "Luz-Design" / "scripts" / "template_library.py"
    spec = importlib.util.spec_from_file_location("_hardware_design_templates", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if post:
        return module.record_output(context, "luz-system", stage or "hardware", target, identifier, generator=generator)
    return module.require_selected(context, "luz-system", stage or "hardware", target, identifier)


def session_for_plan(path: Path) -> Path:
    """The documented raw/04-hardware/plan.json layout identifies the session."""
    path = Path(path).resolve()
    if path.parent.name != "04-hardware" or path.parent.parent.name != "raw":
        raise ValueError("Crawl 前置检索：计划不在 <会话>/raw/04-hardware 中，请用 --session 指明已完成检索的会话")
    return path.parent.parent.parent
