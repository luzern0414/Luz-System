#!/usr/bin/env python3
"""Validate the flattened Luz System skill package and root-level sessions."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from new_session import OUTPUT_ROOT
from validate_session import (
    SESSION_RE,
    first,
    iter_nodes,
    meaningful_nodes,
    normalized_visible_text,
    parse_html,
    split_theme_blocks,
    validate as validate_session,
    validate_html_top_contract,
)

ROOT = Path(__file__).resolve().parents[1]
# Reading pages share one Markdown type block (Luz-Design references/md-type.css; this skill's references/md-type.css is a copy).
# The rule stylesheet and the reading-page templates carry the same text between these markers; hw_render_plan.py reads the Luz-Design master at run time.
MD_START = "/* luz-md-type:start"
MD_END = "/* luz-md-type:end */"
MD_MASTER = ROOT.parent / "Luz-Design" / "references" / "md-type.css"
READING_TEMPLATES = ("module-intake.html", "system-architecture.html", "system-design.html")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
HTML_LINK_RE = re.compile(r'(?:href|src)="([^"]+)"')
REQUIRED = [
    ".gitignore",
    "README.md",
    "LICENSE",
    "NOTICE",
    "SKILL.md",
    "WORKFLOW.md",
    "agents/openai.yaml",
    "references/guidelines.css",
    "references/md-type.css",
    "references/templates.txt",
    "scripts/new_session.py",
    "scripts/add_mode.py",
    "scripts/validate_session.py",
    "scripts/validate_skill.py",
    "scripts/publish.py",
    "scripts/crawl_gate.py",
    "scripts/test_crawl_gate.py",
    "scripts/experience.py",
    "scripts/test_session_flow.py",
    "scripts/test_experience.py",
    "experience/sources.json",
    "experience/patterns.json",
    "experience/notes.json",
    "experience/catalog.md",
    "references/ui-standards.html",
    "references/system-design.html",
    "references/admin-design.html",
    "references/miniprogram-design.html",
    "references/agent-design.html",
    "references/website-design.html",
    "references/function-list-design.html",
    "references/platform-console-design.html",
    "references/hardware-design.html",
    "references/handoff.md",
    "references/handoff.schema.json",
    "references/hardware/plan-schema.md",
    "scripts/hw_build.py",
    "scripts/hw_experience.py",
    "scripts/hw_plan_lib.py",
    "scripts/hw_render_plan.py",
    "scripts/hw_crawl_digest.py",
    "scripts/hw_fetch_images.py",
    "experience/hardware/catalog.json",
    "experience/hardware/suppliers.json",
    "examples/unmanned-gym.plan.json",
    "scripts/context.py",
    "scripts/test_context.py",
    "references/cards.json",
    "scripts/check_interaction.py",
    "scripts/test_check_interaction.py",
    "scripts/features_check.py",
    "scripts/test_features_check.py",
    "scripts/hw_export.py",
    "scripts/test_hw_export.py",
    "scripts/test_md_type.py",
    "scripts/test_rule_visual_lint.py",
    "scripts/entrances_check.py",
    "scripts/test_entrances_check.py",
    "scripts/check_output_layout.py",
    "scripts/make_summary.py",
    "scripts/project_link.py",
    "scripts/session_output.py",
    "scripts/test_output_layout.py",
]
RULE_PAGES = [
    ("ui-standards.html", "ui", "界面通用规范"),
    ("system-design.html", "system", "系统设计规范"),
    ("admin-design.html", "admin", "网页管理后台设计规范"),
    ("miniprogram-design.html", "miniprogram", "小程序设计规范"),
    ("agent-design.html", "agent", "智能体设计规范"),
    ("website-design.html", "website", "网站设计规范"),
    ("function-list-design.html", "flist", "系统功能列表规范"),
    ("commerce-design.html", "commerce", "交易与营销界面规范"),
    ("config-design.html", "config", "远程配置规范"),
    ("platform-console-design.html", "console", "智能体平台配置台设计规范"),
    ("hardware-design.html", "hardware", "硬件设计规范"),
]
TEMPLATE_NAMES = ("brief.md", "research.md", "module-intake.html", "system-architecture.html", "system-design.html", "visual-board.html", "interactive-prototype.html", "approvals.json", "manifest.json",)
REFERENCE_SUBDIRS = {"hardware"}
# The skill keeps five folders (agents, references, scripts, experience, examples); sessions are outputs and live in OUTPUT_ROOT.
ALLOWED_TOP_LEVEL = {".git", ".gitignore", "LICENSE", "NOTICE", "README.md", "SKILL.md", "WORKFLOW.md", "agents", "references", "scripts", "experience", "examples"}
TITLE_SEPARATOR_RE = re.compile(r"[,，:：;；|｜/／·・、\\\-–—]")
RULE_SECTIONS = [
    "scope",
    "workflow",
    "rules",
    "platform-matrix",
    "examples",
    "output-contract",
    "quality-gates",
    "handoff",
]
INLINE_ICON_DRAWING_TAGS = {"path", "circle", "rect", "line", "polyline", "polygon", "ellipse"}
# Rule pages decide what a screen contains and does; its look, composition, motion and sizes are Luz-Design's
# (references/ui-ownership.md there). A paragraph, list item or table cell that names a visual value must carry a pointer to
# the visual standard, so a number or a colour cannot slip back into a rule page. Code samples (<code>, <kbd>, <pre>) are not read.
VISUAL_TERM_RE = re.compile(
    r"圆角|阴影|(?<!逐)渐变|描边|线宽|缓动|字号|字重|(?<![进执运银排流现并平])行高(?!亮)|栅格|色板|配色|品牌色|毛玻璃|发丝线|主色|插画风格"
)
HEX_COLOUR_RE = re.compile(r"#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])")
MOTION_DURATION_RE = re.compile(r"\d+\s*(?:[–-]\s*\d+\s*)?毫秒")
MOTION_WORD_RE = re.compile(r"动画|过渡|淡入|淡出|位移|缩放|展开|收起|滑入|滑出|弹入|回弹|FLIP|上移")
VISUAL_POINTER_RE = re.compile(r"视觉设计规范|文件设计规范|Luz-Design|ui-ownership|视觉技能")
VISUAL_BLOCK_TAGS = {"p", "li", "td", "th"}
VISUAL_SKIP_TAGS = {"script", "style", "code", "kbd", "pre"}
# Pages outside the check: the hardware list and the remote-configuration rules carry no interface look.
VISUAL_LINT_SKIP = {"hardware-design.html", "config-design.html"}
HUMAN_TEXT_ATTRIBUTES = (
    "aria-label",
    "alt",
    "title",
    "placeholder",
    "aria-description",
    "aria-roledescription",
    "aria-valuetext",
)


def title_contains_punctuation(value: str) -> bool:
    """Treat every Unicode punctuation mark as a title separator."""
    return bool(TITLE_SEPARATOR_RE.search(value)) or any(
        unicodedata.category(char).startswith("P") for char in value
    )


def is_linear_icon(icon) -> bool:
    """Require a self-contained, visible inline outline icon."""
    viewbox = icon.get("viewbox").strip()
    stroke_width = icon.get("stroke-width").strip()
    style = icon.get("style").lower()
    drawing_tags = {
        node.tag for node in iter_nodes(icon)
        if node.tag in INLINE_ICON_DRAWING_TAGS
    }
    try:
        stroke_width_value = float(stroke_width.removesuffix("px"))
    except ValueError:
        return False
    return (
        icon.tag == "svg"
        and icon.get("fill").strip().lower() == "none"
        and icon.get("stroke").strip().lower() == "currentcolor"
        and icon.get("aria-hidden").strip().lower() == "true"
        and icon.get("focusable").strip().lower() == "false"
        and bool(re.fullmatch(r"[-.0-9 ]{7,}", viewbox))
        and 0 < stroke_width_value <= 4
        and bool(drawing_tags)
        and not any(node.tag in {"image", "foreignobject"} for node in iter_nodes(icon))
        and not any(name in style for name in ("fill:", "stroke:"))
    )


TOKEN_TAGS = {"code", "kbd"}


def prose_text(node) -> str:
    """Visible text with <code>/<kbd> tokens, scripts and styles removed."""
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        elif child.tag in TOKEN_TAGS:
            parts.append(" ")
        elif child.tag not in {"script", "style"}:
            parts.append(prose_text(child))
    return re.sub(r"\s+", " ", "".join(parts)).strip()


class VisualBlockCollector(HTMLParser):
    """The text of every paragraph, list item and table cell of a page; a nested list item is its own block."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.open_blocks: list[str] = []
        self.parts: list[str] = []
        self.blocks: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in VISUAL_SKIP_TAGS:
            self.skip += 1
        if tag in VISUAL_BLOCK_TAGS:
            self.flush()
            self.open_blocks.append(tag)

    def handle_endtag(self, tag):
        if tag in VISUAL_SKIP_TAGS and self.skip:
            self.skip -= 1
        if tag in VISUAL_BLOCK_TAGS:
            self.flush()
            if self.open_blocks:
                self.open_blocks.pop()

    def handle_data(self, data):
        if self.open_blocks and not self.skip:
            self.parts.append(data)

    def flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.parts)).strip()
        self.parts = []
        if text:
            self.blocks.append(text)


def visual_value_findings(html: str) -> list[tuple[str, str]]:
    """(what was found, the block) for every block that states a visual value and has no pointer to the visual standard."""
    collector = VisualBlockCollector()
    collector.feed(html)
    collector.flush()
    found = []
    for block in collector.blocks:
        if VISUAL_POINTER_RE.search(block):
            continue
        hits = sorted(set(VISUAL_TERM_RE.findall(block)))
        if HEX_COLOUR_RE.search(block):
            hits.append("色值")
        if MOTION_DURATION_RE.search(block) and MOTION_WORD_RE.search(block):
            hits.append("动画时长")
        if hits:
            found.append(("、".join(hits), block))
    return found


def local_targets(text: str, html: bool = False) -> list[str]:
    """Local link targets. In HTML only href and src attributes link; script and style bodies and comments are code, so
    a `](` in a prototype script is not a Markdown link. In Markdown, code spans and fences are skipped."""
    if html:
        text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
        text = re.sub(r"(<(script|style)\b[^>]*>).*?(</\2\s*>)", r"\1\3", text, flags=re.S | re.I)
        found = HTML_LINK_RE.findall(text)
    else:
        text = re.sub(r"^(`{3,}|~{3,}).*?^\1", "", text, flags=re.S | re.M)
        text = re.sub(r"`[^`\n]+`", "", text)
        found = LINK_RE.findall(text) + HTML_LINK_RE.findall(text)
    targets = []
    for raw in found:
        target = raw.strip()
        if not target or target.startswith(("<", "'")):
            continue
        target = target.split()[0].strip("<>")
        parsed = urlparse(target)
        if parsed.scheme in {"http", "https", "mailto", "data"} or target.startswith("#"):
            continue
        clean = unquote(target.split("#", 1)[0])
        if clean:
            targets.append(clean)
    return targets


def validate_rule_page(
    path: Path,
    prefix: str,
    source_count: int,
    expected_h1: str,
    errors: list[str],
) -> None:
    text = path.read_text(encoding="utf-8")
    # Tests check pages in the system temp folder, so a page outside the skill is named by its file name.
    rel = path.relative_to(ROOT) if path.resolve().is_relative_to(ROOT) else Path(path.name)
    if "<!doctype html>" not in text.lower():
        errors.append(f"HTML missing doctype: {rel}")
    if not re.search(r'<link\s+rel="stylesheet"\s+href="guidelines\.css"', text, re.I):
        errors.append(f"rule page must use rules/guidelines.css: {rel}")
    if re.search(r"color-scheme\s*:\s*dark", text, re.I):
        errors.append(f"dark color scheme is not allowed: {rel}")

    root_node = parse_html(path, errors)
    if root_node is None:
        return
    validate_html_top_contract(root_node, str(rel), errors)
    body = first(root_node, "body")
    if body is None:
        errors.append(f"{rel} is missing body")
        return
    # Prose stays Chinese; technical tokens (99+, Esc, YYYY-MM-DD, API names) are allowed only inside <code> or <kbd>.
    visible = prose_text(body)
    latin = re.search(r"[A-Za-z]", visible)
    if latin:
        start = max(0, latin.start() - 18)
        end = min(len(visible), latin.end() + 34)
        errors.append(f"visible Latin letters outside <code>/<kbd> are not allowed in {rel}: {visible[start:end]!r}")

    if path.name not in VISUAL_LINT_SKIP:
        for hits, block in visual_value_findings(text):
            errors.append(f"visual value without a pointer to the visual standard in {rel} [{hits}]: {block[:60]!r}; "
                          "write 见视觉设计规范某节 instead (Luz-Design references/ui-ownership.md)")

    for node in iter_nodes(body):
        for attr in HUMAN_TEXT_ATTRIBUTES:
            attr_text = (node.get(attr) or "").strip()
            if attr_text and re.search(r"[A-Za-z]", attr_text):
                errors.append(f"accessible text in {rel} contains Latin letters: {attr_text}")

    title_node = first(root_node, "title")
    browser_title = normalized_visible_text(title_node) if title_node is not None else ""
    if browser_title != expected_h1:
        errors.append(f"{rel} browser title must be exactly {expected_h1}")
    if title_contains_punctuation(browser_title):
        errors.append(f"{rel} browser title contains a separator or punctuation mark")

    h1s = [node for node in iter_nodes(body) if node.tag == "h1"]
    if len(h1s) != 1:
        errors.append(f"{rel} must have exactly one h1 outside the sidebar")
    elif normalized_visible_text(h1s[0]) != expected_h1:
        errors.append(f"{rel} h1 must be exactly {expected_h1}")
    elif title_contains_punctuation(normalized_visible_text(h1s[0])):
        errors.append(f"{rel} h1 contains a separator or punctuation mark")

    main = first(root_node, "main")
    if main is None:
        errors.append(f"{rel} is missing main")
    else:
        if main.get("aria-label").strip() != expected_h1:
            errors.append(f"{rel} main aria-label must exactly match the page title")
        children = meaningful_nodes(main.children)
        if len(children) < 2 or not hasattr(children[0], "tag") or children[0].tag != "h1":
            errors.append(f"{rel} main must begin directly with its unique h1")
        elif not hasattr(children[1], "tag") or children[1].tag != "section":
            errors.append(f"{rel} h1 must be followed directly by the first section")
        else:
            first_section_children = meaningful_nodes(children[1].children)
            if not first_section_children or not hasattr(first_section_children[0], "tag") or first_section_children[0].tag != "h2":
                errors.append(f"{rel} first section must begin directly with its h2")
            near_title_copy = normalized_visible_text(children[1])
            for banned in ("日期", "无需构建", "可直接编辑", "入口", "说明"):
                if banned in near_title_copy:
                    errors.append(f"{rel} first section contains title-adjacent copy: {banned}")

        all_section_nodes = [node for node in iter_nodes(main) if node.tag == "section"]
        for section_node in all_section_nodes:
            section_children = meaningful_nodes(section_node.children)
            section_label = section_node.get("id") or "without-id"
            if (not section_children
                    or not hasattr(section_children[0], "tag")
                    or section_children[0].tag != "h2"):
                errors.append(f"{rel} section {section_label} must begin directly with its h2")

        section_icon_count = 0
        formal_section_nodes = [
            node for node in all_section_nodes if node.get("id") in RULE_SECTIONS
        ]
        for section_node in formal_section_nodes:
            section_children = meaningful_nodes(section_node.children)
            if (not section_children
                    or not hasattr(section_children[0], "tag")
                    or section_children[0].tag != "h2"):
                continue
            section_h2 = section_children[0]
            h2_children = meaningful_nodes(section_h2.children)
            if (not h2_children
                    or not hasattr(h2_children[0], "tag")
                    or h2_children[0].tag != "svg"):
                errors.append(f"{rel} section {section_node.get('id')} h2 must begin with its linear SVG icon")
            icons = [node for node in iter_nodes(section_h2) if node.tag == "svg"]
            if len(icons) != 1:
                errors.append(
                    f"{rel} section {section_node.get('id')} h2 must contain exactly one inline linear SVG icon"
                )
            for icon in icons:
                if not is_linear_icon(icon):
                    errors.append(
                        f"{rel} section {section_node.get('id')} h2 needs a valid linear SVG icon"
                    )
                else:
                    section_icon_count += 1
        if len(formal_section_nodes) < len(RULE_SECTIONS):
            errors.append(f"{rel} must contain all eight formal sections")
        if section_icon_count < len(RULE_SECTIONS):
            errors.append(f"{rel} needs one linear icon for every formal section; found {section_icon_count}")

    ids = re.findall(r'\bid="([^"]+)"', text)
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates:
        errors.append(f"duplicate HTML ids in {rel}: {', '.join(duplicates)}")
    for section in RULE_SECTIONS:
        if f'<section id="{section}" data-rule-id="{prefix}-{section}"' not in text:
            errors.append(f"{rel} missing stable section contract: {section}")
        if f"<!-- SECTION:{section}:START" not in text or f"<!-- SECTION:{section}:END -->" not in text:
            errors.append(f"{rel} missing section edit boundaries: {section}")


def md_block(text: str) -> str | None:
    """The text from the start marker to the end marker, or None when a marker is missing."""
    start, end = text.find(MD_START), text.find(MD_END)
    if start < 0 or end < start:
        return None
    return text[start:end + len(MD_END)]


def md_type_copy_text() -> str:
    copy = ROOT / "references" / "md-type.css"
    return copy.read_text(encoding="utf-8") if copy.is_file() else ""


def md_type_errors() -> list[str]:
    """references/md-type.css is the master's copy, and the rule stylesheet carries the same block between the markers."""
    errors: list[str] = []
    copy_path = ROOT / "references" / "md-type.css"
    if not copy_path.is_file():
        return ["references/md-type.css is missing (a copy of Luz-Design references/md-type.css)"]
    copy = copy_path.read_text(encoding="utf-8")
    block = md_block(copy)
    if block is None:
        return ["references/md-type.css has no luz-md-type markers"]
    if MD_MASTER.is_file() and MD_MASTER.read_text(encoding="utf-8") != copy:
        errors.append("references/md-type.css differs from Luz-Design references/md-type.css; run "
                      "py -X utf8 D:/Codes/Luz-Design/scripts/sync_md_type.py --only Luz-System --write")
    css_path = ROOT / "references" / "guidelines.css"
    if css_path.is_file() and md_block(css_path.read_text(encoding="utf-8")) != block:
        errors.append("references/guidelines.css must carry the Markdown type block of references/md-type.css between its luz-md-type markers; run "
                      "py -X utf8 D:/Codes/Luz-Design/scripts/sync_md_type.py --only Luz-System --write")
    summary_path = ROOT / "scripts" / "make_summary.py"
    if summary_path.is_file() and block not in summary_path.read_text(encoding="utf-8"):
        errors.append("scripts/make_summary.py (the summary page generator, a mirror shared by the seven skills) must carry the Markdown type block of "
                      "references/md-type.css; run py -X utf8 D:/Codes/Luz-Design/scripts/sync_md_type.py --only Luz-System --write")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the flattened Luz System skill and root-level sessions.")
    parser.add_argument("--strict-production", action="store_true", help="Require strict session structure and live source verification")
    parser.add_argument("--package-only", action="store_true",
                        help="Check only the skill package; skip the sessions in the output folder")
    args = parser.parse_args(argv)
    errors: list[str] = []
    for rel in REQUIRED:
        if not (ROOT / rel).is_file():
            errors.append(f"missing required file: {rel}")
    for item in ROOT.iterdir():
        if item.name not in ALLOWED_TOP_LEVEL and item.name not in {"__pycache__", ".pytest_cache"}:
            errors.append(f"unexpected top-level item in the skill: {item.name} (the skill keeps only LICENSE, NOTICE, README.md, SKILL.md, WORKFLOW.md, agents, references, scripts, experience, examples)")
    for item in (ROOT / "references").iterdir() if (ROOT / "references").is_dir() else []:
        if item.is_dir() and item.name not in REFERENCE_SUBDIRS:
            errors.append(f"references must stay flat: {item.name}/")

    skill = ROOT / "SKILL.md"
    if skill.is_file():
        text = skill.read_text(encoding="utf-8")
        normalized = text.replace("\r\n", "\n")
        if not normalized.startswith("---\n"):
            errors.append("SKILL.md must start with YAML frontmatter")
        if "\nname: luz-system" not in normalized:
            errors.append("SKILL.md name must be luz-system")
        if "description:" not in text:
            errors.append("SKILL.md description is missing")
        if re.search(r"\b(?:TODO|TBD|FIXME)\b", text):
            errors.append("SKILL.md contains an unfinished marker")
        for expected in [f"references/{f}" for f, _, _ in RULE_PAGES]:
            if expected not in text:
                errors.append(f"SKILL.md missing route: {expected}")
        # The invocation protocol is the first section and starts from the rule card (scripts/context.py).
        sections = re.findall(r"(?m)^## (.+)$", normalized)
        if not sections or not sections[0].startswith("调用协议"):
            errors.append("SKILL.md must open with the section 调用协议 (invocation protocol) before any other section")
        protocol_text = normalized.split("\n## ", 2)[1] if "\n## " in normalized else ""
        if "scripts/context.py" not in protocol_text:
            errors.append("SKILL.md 调用协议 must start from scripts/context.py (the rule card)")
        # Agents choose skills from the parsed frontmatter; an unquoted ": " inside the description breaks it silently.
        try:
            import yaml
            front = yaml.safe_load(normalized.split("---", 2)[1])
            if not isinstance(front, dict) or not isinstance(front.get("description"), str):
                errors.append("SKILL.md frontmatter does not parse to a name and a description string")
        except ImportError:
            if re.search(r"(?m)^description: [^\n]*: ", normalized):
                errors.append("SKILL.md description contains ': ' which breaks YAML; use a dash instead")
        except Exception as exc:
            errors.append(f"SKILL.md frontmatter is not valid YAML: {exc}")
        description = re.search(r"(?m)^description: (.+)$", normalized)
        if not description or "context.py" not in description.group(1):
            errors.append("SKILL.md description must tell agents to start with scripts/context.py")
        if len(description.group(1) if description else "") > 1024:
            errors.append("SKILL.md description exceeds 1024 characters")

    json_files = ["references/handoff.schema.json", "examples/unmanned-gym.plan.json", "references/cards.json"]
    for rel in json_files:
        path = ROOT / rel
        if path.is_file():
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                errors.append(f"invalid JSON in {rel}: {exc}")

    for file_name, prefix, title in RULE_PAGES:
        validate_rule_page(ROOT / "references" / file_name, prefix, 0, title, errors)
    # Every rule card resolves to existing rule-page sections, so renaming a heading cannot silently empty a card.
    import context
    errors.extend(f"rule card: {e}" for e in context.check_cards())
    head = (ROOT / "references" / "templates.txt").read_text(encoding="utf-8").splitlines()[:4]
    if not any("context.py" in line for line in head):
        errors.append("references/templates.txt must say at the top that templates are skeletons and point to scripts/context.py")

    guidelines_css = ROOT / "references/guidelines.css"
    if guidelines_css.is_file():
        css_body = guidelines_css.read_text(encoding="utf-8")
        for value in re.findall(r"(?:font-size|font)\s*:\s*[^;{}]*?([0-9.]+)px", css_body):
            if float(value) < 14:
                errors.append(f"rule stylesheet contains a font size below 14px: {value}px")
        icon_style = re.search(r"\.icon-linear\s*\{([^}]*)\}", css_body, re.S)
        if not icon_style:
            errors.append("rule stylesheet is missing .icon-linear")
        else:
            icon_rules = icon_style.group(1)
            for token in ("width:", "height:", "fill:none", "stroke:currentcolor"):
                compact = re.sub(r"\s+", "", icon_rules).lower()
                if token not in compact:
                    errors.append(f"rule stylesheet icon style missing {token}")
        # The Markdown type block also sets a plain h2; the rule that aligns the section icon is a later h2 rule.
        heading_rules = ["".join(re.sub(r"\s+", "", m.group(1)).lower().split())
                         for m in re.finditer(r"(?<![\w.#-])h2\s*\{([^}]*)\}", css_body, re.S)]
        if not any("display:flex" in rules and "align-items:center" in rules for rules in heading_rules):
            errors.append("rule stylesheet must align h2 icons and text vertically")
        if not re.search(r"(?<![\w.#-])h2\s*\{[^}]*border-bottom:\s*0", css_body, re.S):
            errors.append("rule stylesheet must turn off the h2 bottom line of the Markdown type block (each section already has a section line)")

    errors.extend(md_type_errors())

    # An engineering project inside examples/ (package.json: its node_modules, its build output and its Vite entry pages) is not a document of the skill.
    skip_parts = {".git", "__pycache__", ".pytest_cache", "node_modules", "dist"}
    entry_page = lambda path: path.suffix.lower() == ".html" and (path.parent / "package.json").is_file()  # noqa: E731
    for path in ROOT.rglob("*"):
        if any(part in skip_parts for part in path.parts) or entry_page(path):
            continue
        if path.is_file() and path.suffix.lower() in {".md", ".html"}:
            text = path.read_text(encoding="utf-8")
            for target in local_targets(text, html=path.suffix.lower() == ".html"):
                if not (path.parent / target).resolve().exists():
                    errors.append(f"broken local link in {path.relative_to(ROOT)}: {target}")
            if path.suffix.lower() == ".html" and "<!doctype html>" not in text.lower():
                errors.append(f"HTML missing doctype: {path.relative_to(ROOT)}")
            if path.suffix.lower() == ".html" and re.search(r"color-scheme\s*:\s*dark", text, re.I):
                # Reading pages stay light. An example prototype is a product interface: its dark theme blocks may declare the dark scheme,
                # the rest of its style sheet may not (Luz-Design visual-design.html 深色与浅色两套主题).
                inline_css = chr(10).join(re.findall(r"<style[^>]*>(.*?)</style>", text, re.S | re.I))
                outside_dark_blocks = split_theme_blocks(inline_css)[0]
                if "examples" not in path.relative_to(ROOT).parts or re.search(r"color-scheme\s*:\s*dark", outside_dark_blocks, re.I):
                    errors.append(f"dark color scheme is not allowed: {path.relative_to(ROOT)}")
            if path.suffix.lower() == ".html" and "{{" not in text:
                root = parse_html(path, errors)
                if root is not None:
                    validate_html_top_contract(root, str(path.relative_to(ROOT)), errors)

    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in skip_parts for part in path.parts):
            continue
        if path.suffix.lower() not in {".md", ".txt", ".json", ".py", ".html", ".yaml", ".yml"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if re.search(r"(?<![A-Za-z0-9-])sk-(?:proj-)?[A-Za-z0-9_]{20,}", text):
            errors.append(f"possible API key in {path.relative_to(ROOT)}")

    from new_session import read_template
    templates: dict[str, str] = {}
    for name in TEMPLATE_NAMES:
        try:
            templates[name] = read_template(ROOT, name)
        except (KeyError, OSError) as exc:
            errors.append(str(exc))
    for name in ("approvals.json", "manifest.json"):
        if name in templates:
            try:
                json.loads(templates[name])
            except json.JSONDecodeError as exc:
                errors.append(f"invalid JSON in template {name}: {exc}")
    for name in [n for n in ("module-intake.html", "system-design.html") if n in TEMPLATE_NAMES]:
        for value in re.findall(r"font-size:\s*([0-9.]+)px", templates.get(name, "")):
            if float(value) < 14:
                errors.append(f"{name} contains a font size below 14px")
    master = md_block(md_type_copy_text())
    for name in READING_TEMPLATES:
        if name in templates and md_block(templates[name]) != master:
            errors.append(f"template {name} must carry the Markdown type block of references/md-type.css (reading page: body 18 on a desktop, 16 on a phone)")
    if "module-intake.html" in templates and "{{MODULE_ITEMS}}" not in templates["module-intake.html"]:
        errors.append("module-intake.html must contain a copyable module placeholder")
    if "visual-board.html" in templates and 'data-artifact="visual-board"' not in templates["visual-board.html"]:
        errors.append("visual-board.html must declare its artifact type")

    from experience import check as check_experience
    errors.extend(f"experience: {e}" for e in check_experience())

    # The package result comes first, so a session problem (an output, not the skill) never hides it.
    if errors:
        print(f"PACKAGE FAIL: {len(errors)} skill package issue(s)")
    else:
        print("PACKAGE PASS: skill package has no errors")
    sessions = [] if args.package_only else (
        [path for path in OUTPUT_ROOT.iterdir() if path.is_dir() and SESSION_RE.match(path.name)] if OUTPUT_ROOT.is_dir() else [])
    warnings: list[str] = []
    for session in sorted(sessions):
        session_warnings: list[str] = []
        errors.extend(
            f"{session.name}: {error}"
            for error in validate_session(
                session, strict=args.strict_production, live_sources=args.strict_production, warnings=session_warnings
            )
        )
        warnings.extend(f"{session.name}: {warning}" for warning in dict.fromkeys(session_warnings))

    for warning in warnings:
        print("WARN", warning)
    if errors:
        print(f"FAIL: {len(errors)} issue(s)")
        for error in errors:
            print("ERROR", error)
        return 1
    if not Path("D:/Codes/Imagegen/src/imagegen.py").is_file():
        print("WARN: Imagegen was not found at D:\\Codes\\Imagegen")
    session_label = f"{len(sessions)} production session(s)" if args.strict_production else f"{len(sessions)} session(s)"
    validation_label = "sessions production-validated" if args.strict_production else "sessions not production-validated"
    if args.package_only:
        session_label, validation_label = "0 session(s)", "sessions skipped (--package-only)"
    print(
        f"PASS: Luz System skill validated with {len(REQUIRED)} required files, "
        f"{session_label}, 3 rule entrances, and {validation_label}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
