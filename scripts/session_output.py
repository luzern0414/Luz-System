"""Where a session's results go and what its summary page lists (publish.py and hw_export.py share this).

Standalone task: the root of the session holds raw\\ and the summary page NNN-名称.html. The published stage page is that summary page;
deliverable files (the hardware list Excel) sit beside it and the page lists them with a link.
Project task (MANIFEST "project"): results are written only to the project directory (docs\\01-需求对接, docs\\02-产品开发), the session
root keeps raw\\ and a summary page built from the results, and nothing else.
"""
from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import make_summary
import project_link
from new_session import tab_icon_href
from validate_session import final_html, root_files, sha256_file, work_dir

# stage -> (name of the page in the project's docs\02-产品开发, what it is for)
STAGE_DOCS = {
    "architecture": ("系统架构", "系统架构：角色、功能、页面、导航、动作、流程与状态"),
    "system_design": ("系统设计", "系统设计页：各模块的介绍与设计"),
    "visual": ("视觉稿", "产品界面视觉稿"),
    "prototype": ("交互原型", "可交互原型，供评审与开发"),
    "hardware": ("硬件方案", "硬件方案页：设备、系统连接图与现场条件，供评审与开发"),
}
HARDWARE_LIST = ("硬件选型清单", "设备清单与现场条件，交给客户")
FILE_PURPOSE = {".xlsx": "表格文件", ".pdf": "PDF 文件", ".docx": "Word 文件", ".pptx": "演示文稿"}
RAW_PURPOSE = (
    ("BRIEF.md", "需求台账、采用的规则、本次沉淀"),
    ("00-rules", "本次用到的规则卡"),
    ("00-crawl", "前置检索记录与结论页"),
    ("01-system", "模块表单、调研记录、系统架构与系统设计原稿"),
    ("02-visual", "视觉稿原稿"),
    ("03-prototype", "交互原型原稿与验收截图"),
    ("04-hardware", "硬件需求、方案数据、网页原稿与导出描述文件"),
    ("99-delivery", "审批记录 APPROVALS.json 与清单 MANIFEST.json"),
)


def read_manifest(folder: Path) -> dict:
    return json.loads((work_dir(folder) / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8"))


def write_manifest(folder: Path, manifest: dict) -> None:
    (work_dir(folder) / "99-delivery" / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def inject_deliverables(page: str, files: list[Path]) -> str:
    """Add the section 成果文件 (one table: name, purpose, location) before the end of the page's main content."""
    if not files:
        return page
    rows = "".join(
        f'<tr><td>{html.escape(p.stem)}</td><td>{html.escape(HARDWARE_LIST[1] if p.stem == HARDWARE_LIST[0] else FILE_PURPOSE.get(p.suffix.lower(), "成品文件"))}</td>'
        f'<td><a href="{html.escape(p.name, quote=True)}">{html.escape(p.name)}</a></td></tr>' for p in files)
    number = len(re.findall(r"<caption\b", page)) + 1
    section = ('<section id="deliverables"><h2>成果文件</h2><div class="table-wrap"><table>'
               f"<caption>表 {number} 成果文件</caption>"
               '<thead><tr><th scope="col">名称</th><th scope="col">用途</th><th scope="col">位置</th></tr></thead>'
               f"<tbody>{rows}</tbody></table></div></section>\n")
    for marker in ("</main>", "</body>"):
        index = page.rfind(marker)
        if index >= 0:
            return page[:index] + section + page[index:]
    return page + section


def project_result(manifest: dict, stage: str, title: str, purpose: str, path: Path) -> None:
    """Record a result written to the project directory (replaces the earlier record of the same stage)."""
    project = manifest["project"]
    rel = Path(path).resolve().relative_to(Path(project["deliver_root"]).resolve()).as_posix()
    entry = {"stage": stage, "title": title, "purpose": purpose, "path": rel, "sha256": sha256_file(path),
             "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    published = [item for item in project.get("published", []) if item.get("stage") != stage]
    project["published"] = published + [entry]


def project_summary_page(folder: Path, manifest: dict) -> str:
    """The summary page of a project task: results (path inside the project), what they rest on, the process files in raw\\."""
    raw = work_dir(folder)
    subject = str(manifest.get("system_name") or manifest.get("title") or folder.name.split("-", 1)[-1])
    results = [[item["title"], item["purpose"], item["path"].replace("/", "\\")] for item in manifest["project"].get("published", [])]
    cards = sorted(p.stem for p in (raw / "00-rules").glob("*.md")) if (raw / "00-rules").is_dir() else []
    basis = []
    if cards:
        basis.append(["规则卡", "、".join(cards)])
    basis.append(["采用的规则与本次沉淀", "raw\\BRIEF.md"])
    if (raw / "00-crawl").is_dir():
        basis.append(["前置检索记录", "raw\\00-crawl"])
    files = [[f"raw\\{name}", purpose] for name, purpose in RAW_PURPOSE if (raw / name).exists()]
    sections = []
    if results:
        sections.append({"title": "成果", "table": {"caption": "表 1 成果清单", "columns": ["名称", "用途", "位置"], "rows": results}})
    sections.append({"title": "依据", "table": {"caption": f"表 {len(sections) + 1} 依据", "columns": ["依据", "内容"], "rows": basis}})
    sections.append({"title": "过程文件", "table": {"caption": f"表 {len(sections) + 1} 过程文件", "columns": ["文件", "用途"], "rows": files}})
    return make_summary.render({"title": subject, "sections": sections}).replace(make_summary.ICON, tab_icon_href(subject))


def write_summary(folder: Path, manifest: dict) -> Path:
    """Write the project task's summary page and return it (bytes, so the line endings are the generator's own)."""
    target = final_html(folder)
    target.write_bytes(project_summary_page(folder, manifest).encode("utf-8"))
    return target


def refresh_summary(folder: Path) -> bool:
    """After a result was added to a published project task: rebuild the summary page and its hash in the manifest."""
    manifest = read_manifest(folder)
    if not manifest.get("project") or not manifest.get("final"):
        return False
    target = write_summary(folder, manifest)
    manifest["final"]["sha256"] = sha256_file(target)
    write_manifest(folder, manifest)
    return True


def hardware_list_target(folder: Path, manifest: dict | None) -> Path:
    """Where the client's hardware list Excel goes: the project's docs\\01-需求对接, or beside the summary page."""
    if manifest and manifest.get("project"):
        return project_link.doc_target(manifest["project"], "requirements", HARDWARE_LIST[0], ".xlsx")
    return folder / f"{HARDWARE_LIST[0]}.xlsx"
