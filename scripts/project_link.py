"""Find the project a session belongs to: its state root, its delivery directory and where its deliverables go.

A project task is one that runs under a Luz-Project project context (`--project <路径>` or the environment variable
LUZ_PROJECT_ROOT). The context points at the project's state root, the folder that holds project.json; for a project that
was never migrated, project.json sits in the project root and the project root is the state root as well.

  deliver_root       the project directory: only results go there (docs\\01-需求对接, docs\\02-产品开发, docs\\03-验收交付)
  crawl.evidence_index   the project's Crawl evidence index, relative to the state root

Given any path: a folder holding project.json is the state root; a Luz-Project session folder holds it in raw\\; otherwise the
path is the project directory and the state root is <Luz-Project 输出根>\\<目录名>\\raw.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

PROJECT_OUTPUT_ROOT = Path(os.environ.get("LUZ_PROJECT_OUTPUT") or r"E:\Skill输出\Luz-Project")
ENV_VAR = "LUZ_PROJECT_ROOT"
DOC_AREAS = {"requirements": "01-需求对接", "development": "02-产品开发", "acceptance": "03-验收交付"}
NUMBERED = re.compile(r"^(\d{2})-(.+)$")


def state_root(path: str | Path, output_root: Path = PROJECT_OUTPUT_ROOT) -> Path:
    """The state root for a project path, in the order of the standard: project.json here, in raw\\, or under the output root."""
    folder = Path(path).resolve()
    if (folder / "project.json").is_file():
        return folder
    if (folder / "raw" / "project.json").is_file():
        return folder / "raw"
    candidate = Path(output_root) / folder.name / "raw"
    if (candidate / "project.json").is_file():
        return candidate
    raise ValueError(f"找不到项目状态根（没有 project.json）: {path}")


def load(path: str | Path | None = None, output_root: Path = PROJECT_OUTPUT_ROOT) -> dict | None:
    """The project record for `path`, or for LUZ_PROJECT_ROOT when `path` is None; None when neither is given."""
    path = path or os.environ.get(ENV_VAR)
    if not path:
        return None
    root = state_root(path, output_root)
    project = json.loads((root / "project.json").read_text(encoding="utf-8"))
    deliver = Path(project["deliver_root"]) if project.get("deliver_root") else root
    evidence = (project.get("crawl") or {}).get("evidence_index")
    commercial = project.get("workflow") == "commercial-v1"
    return {
        **({"workflow": project["workflow"], "stage": project.get("current_stage") or "scope"} if commercial else {}),
        "state_root": str(root),
        "deliver_root": str(deliver),
        "evidence_index": str(root / evidence) if evidence else None,
    }


def doc_target(info: dict, area: str, stem: str, suffix: str) -> Path:
    """docs\\<area>\\NN-名称<suffix> in the project directory. `stem` is either 名称 or a full NN-名称; a file with the same
    name keeps its number, a new name takes the next free two-digit number (numbers are never reused)."""
    areas = ({"development": "03-开发资料", "requirements": "02-对接资料", "acceptance": "02-对接资料"}
             if info.get("workflow") == "commercial-v1" else DOC_AREAS)
    folder = Path(info["deliver_root"]) / "docs" / areas[area]
    if NUMBERED.match(stem):
        return folder / f"{stem}{suffix}"
    numbers = []
    if folder.is_dir():
        for item in sorted(folder.iterdir()):
            match = NUMBERED.match(item.stem)
            if not match or not item.is_file():
                continue
            numbers.append(int(match.group(1)))
            if match.group(2) == stem and item.suffix.lower() == suffix.lower():
                return item
    return folder / f"{max(numbers, default=0) + 1:02d}-{stem}{suffix}"


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Show the state root, delivery directory and evidence index of a project.")
    parser.add_argument("project", nargs="?", help=f"project path (state root, project directory or Luz-Project session); default {ENV_VAR}")
    args = parser.parse_args(argv)
    try:
        info = load(args.project)
    except (OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1
    if info is None:
        print(f"FAIL: no project path and {ENV_VAR} is not set")
        return 1
    print(json.dumps(info, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
