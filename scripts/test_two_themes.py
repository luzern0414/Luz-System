"""Two themes (Luz-Design visual-design.html 深色与浅色两套主题): product interfaces ship a light and a dark theme with a 跟随系统 / 浅色 / 深色 switch,
reading pages stay light. The page validator, the product skeletons and the rule text agree on it."""
from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from new_session import fill_icon_slots, insert_agent_part, read_template  # noqa: E402
from validate_session import (  # noqa: E402
    has_appearance_switch,
    is_appearance_radio,
    iter_nodes,
    parse_html,
    split_theme_blocks,
    validate_light_html,
)

ROOT = Path(__file__).resolve().parents[1]
PAGE = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>页</title><link rel="icon" href="data:,">'
        "<style>{css}</style></head><body><main><h1>标题</h1><section><h2>区块</h2><p>正文</p></section></main></body></html>")
DARK_BLOCKS = ('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--c:#0d101a}}'
               ':root[data-theme="dark"]{color-scheme:dark;--c:#0d101a}html.dark body{background:#0d101a}')


def check(css: str, min_px: float, *, warn: bool = False) -> tuple[list[str], list[str]]:
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "page.html"
        path.write_text(PAGE.format(css=css), encoding="utf-8")
        errors: list[str] = []
        warnings: list[str] = []
        validate_light_html(path, errors, min_px=min_px, warnings=warnings if warn else None)
        return errors, warnings


class SplitTest(unittest.TestCase):
    def test_dark_theme_blocks_are_told_apart_from_the_light_sheet(self) -> None:
        css = (':root{color-scheme:light;--a:#fff}@media (max-width:700px){.x{color:red}:root[data-theme="dark"] .y{background:#000}}'
               + DARK_BLOCKS + ".darkroom{background:#fff}.card.dark-edge{border:0}@layer a, b;")
        light, dark = split_theme_blocks(css)
        self.assertIn(":root{color-scheme:light;--a:#fff}", light)
        self.assertIn(".darkroom{background:#fff}", light, "a class that only starts with dark is not a dark theme")
        self.assertIn(".card.dark-edge", light)
        self.assertIn("@layer a, b;", light)
        self.assertNotIn("color-scheme:dark", light)
        self.assertNotIn("background:#000", light)
        for selector in ('[data-theme="dark"]', "html.dark", "prefers-color-scheme:dark"):
            self.assertIn(selector, dark)

    def test_other_dark_selectors(self) -> None:
        for selector in ("[data-scheme=dark] .a", '[data-theme="dark"] .a', ".dark .a", "html.dark .a", "[data-bs-theme=dark] .a"):
            self.assertEqual(split_theme_blocks(selector + "{background:#000}")[0], "", selector)
        self.assertEqual(split_theme_blocks(".a{background:#000}")[1], "")


class PageValidatorTest(unittest.TestCase):
    def test_product_interface_may_carry_a_dark_theme(self) -> None:
        errors, warnings = check("body{background:#f7f9fc;color:#172033}" + DARK_BLOCKS, 12.0, warn=True)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_reading_page_stays_light_only(self) -> None:
        errors, _ = check("body{background:#fff}" + DARK_BLOCKS, 14.0)
        self.assertTrue(any("light color scheme" in e for e in errors), errors)

    def test_the_light_sheet_of_a_product_interface_is_still_judged(self) -> None:
        errors, _ = check("body{background:#f7f9fc}.hero{background:#0d101a;padding:32px}" + DARK_BLOCKS, 12.0)
        self.assertTrue(any("dark background color" in e for e in errors), errors)
        errors, _ = check("body{background:#f7f9fc}:root{color-scheme:dark}", 12.0)
        self.assertTrue(any("outside its dark theme blocks" in e for e in errors), errors)

    def test_a_product_interface_without_a_dark_theme_gets_a_warning(self) -> None:
        errors, warnings = check("body{background:#f7f9fc}", 12.0, warn=True)
        self.assertEqual(errors, [])
        self.assertTrue(any("no dark theme block" in w for w in warnings), warnings)
        self.assertEqual(check("body{background:#f7f9fc}", 12.0)[1], [], "no warning list asked, none given")

    def test_dark_variables_do_not_leak_into_the_light_body_check(self) -> None:
        errors, _ = check(":root{--bg:#f7f9fc}body{background:var(--bg)}" + ':root[data-theme="dark"]{--bg:#0d101a}', 12.0)
        self.assertEqual(errors, [])


class SkeletonTest(unittest.TestCase):
    PRODUCT = ("interactive-prototype.html",)
    READING = ("module-intake.html", "system-architecture.html", "system-design.html")

    def test_product_skeletons_carry_both_themes_and_the_switch(self) -> None:
        for name in self.PRODUCT:
            text = read_template(ROOT, name)
            with self.subTest(template=name):
                self.assertIn("@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"])", text)
                self.assertIn(':root[data-theme="dark"]{color-scheme:dark', text)
                self.assertIn(':root[data-theme="light"]{color-scheme:light}', text)
                self.assertIn('role="radiogroup" aria-label="外观"', text)
                self.assertEqual(len(re.findall(r'<button type="button" role="radio"', text)), 3)
                for label in ("跟随系统", "浅色", "深色"):
                    self.assertIn(f">{label}</button>", text)
                self.assertIn('"luz-theme"', text)
                self.assertIn("window.luzTheme", text)
                # the script runs before the style sheet, and the storage is guarded
                self.assertLess(text.index("luz-theme"), text.index("<style>"))
                self.assertRegex(text, r"try \{[^}]*localStorage")

    def test_the_two_blocks_hold_the_same_variables(self) -> None:
        for name in self.PRODUCT:
            text = read_template(ROOT, name)
            media = re.search(r'@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{(.*?)\}\}', text, re.S).group(1)
            attr = re.search(r':root\[data-theme="dark"\]\{(.*?)\}', text, re.S).group(1)
            self.assertEqual(media, attr, name)

    def test_dark_values_are_the_theme_library_values(self) -> None:
        import json
        themes = ROOT.parent / "Luz-Design" / "references" / "themes.json"
        if not themes.is_file():
            self.skipTest("Luz-Design is not next to this skill")
        data = json.loads(themes.read_text(encoding="utf-8"))
        proto = read_template(ROOT, "interactive-prototype.html")
        dark = data["themes"]["ai-agent"]["dark"]
        for key in ("canvas", "surface", "action", "actionText", "actionTint", "line"):
            self.assertIn(dark[key].lower(), proto.lower(), key)
        self.assertIn(data["shared"]["dark"]["ink"].lower(), proto.lower())

    def test_skeleton_styles_have_no_hard_coded_colours_outside_the_token_blocks(self) -> None:
        # Colours live in the token blocks; a literal white or pale tint elsewhere would stay light in the dark theme.
        for name in ("interactive-prototype.html", "agent-run-states.html"):
            css = "\n".join(re.findall(r"<style>(.*?)</style>", read_template(ROOT, name), re.S))
            css = re.sub(r"@media \(prefers-color-scheme:dark\)\{.*?\}\}\n", "", css, flags=re.S)
            css = re.sub(r":root[^{\n]*\{[^}]*\}", "", css)
            self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,6}\b", css), [], name)

    def test_reading_templates_stay_light_only(self) -> None:
        for name in self.READING:
            text = read_template(ROOT, name)
            with self.subTest(template=name):
                self.assertNotIn("prefers-color-scheme", text)
                self.assertNotRegex(text, r"color-scheme\s*:\s*dark")
                self.assertNotIn("luz-theme", text)

    def test_filled_prototype_validates_and_has_the_switch(self) -> None:
        text = insert_agent_part(fill_icon_slots(read_template(ROOT, "interactive-prototype.html"), "订单助手"), ROOT)
        text = text.replace("{{ACTION_ID}}", "A-001").replace("{{PAGE_ID}}", "P-001")
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "interactive-prototype.html"
            path.write_text(text, encoding="utf-8")
            errors: list[str] = []
            warnings: list[str] = []
            root = validate_light_html(path, errors, min_px=12.0, warnings=warnings)
            self.assertEqual((errors, warnings), ([], []))
            self.assertTrue(has_appearance_switch(root))

    def test_a_prototype_without_the_switch_is_not_recognised(self) -> None:
        text = read_template(ROOT, "interactive-prototype.html")
        stripped = re.sub(r'<section id="prototype-config".*?</section>\n', "", text, flags=re.S)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "p.html"
            path.write_text(fill_icon_slots(stripped, "订单助手"), encoding="utf-8")
            self.assertFalse(has_appearance_switch(parse_html(path, [])))


class AppearanceRadioTest(unittest.TestCase):
    def test_only_radios_in_the_appearance_group_are_exempt_from_action_ids(self) -> None:
        html = ('<!doctype html><html><body><main><div role="radiogroup" aria-label="外观"><button role="radio">浅色</button></div>'
                '<div role="radiogroup" aria-label="排序"><button role="radio">时间</button></div><button>保存</button></main></body></html>')
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "p.html"
            path.write_text(html, encoding="utf-8")
            root = parse_html(path, [])
            flags = [is_appearance_radio(node) for node in iter_nodes(root) if node.tag == "button"]
            self.assertEqual(flags, [True, False, False])


class RuleTextTest(unittest.TestCase):
    def test_the_old_title_is_gone_and_the_new_one_is_used(self) -> None:
        old = "用户明确要求深色时"
        for path in list((ROOT / "references").glob("*.html")) + [ROOT / "SKILL.md", ROOT / "references" / "cards.json"]:
            self.assertNotIn(old, path.read_text(encoding="utf-8"), path.name)
        text = (ROOT / "references" / "system-design.html").read_text(encoding="utf-8")
        self.assertIn("外观（跟随系统、浅色、深色）", text)
        self.assertIn('aria-label="外观"', text)
        ui = (ROOT / "references" / "ui-standards.html").read_text(encoding="utf-8")
        self.assertIn("深色与浅色两套主题", ui)

    def test_every_product_card_checks_both_themes(self) -> None:
        import json
        cards = json.loads((ROOT / "references" / "cards.json").read_text(encoding="utf-8"))["cards"]
        for kind in ("prototype", "admin-list", "admin-dashboard", "admin-form", "miniprogram", "agent-ui", "website", "commerce"):
            joined = "\n".join(cards[kind]["checks"])
            self.assertIn("--scheme dark", joined, kind)
            self.assertIn("三选一", joined, kind)


if __name__ == "__main__":
    unittest.main()
