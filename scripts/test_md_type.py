"""Reading pages carry the shared Markdown type block (Luz-Design references/md-type.css, copied to references/md-type.css here):
the rule stylesheet and the reading-page templates hold the same block text, the hardware list generator reads the Luz-Design master at run
time (the copy here equals it) and keeps no title or body sizes of its own, and the product skeletons keep their own product type scale."""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hw_plan_lib as pl  # noqa: E402
import hw_render_plan as render  # noqa: E402
import validate_skill as vs  # noqa: E402
from new_session import read_template  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
COPY = (ROOT / "references" / "md-type.css").read_text(encoding="utf-8")
BLOCK = vs.md_block(COPY)
GUIDELINES = (ROOT / "references" / "guidelines.css").read_text(encoding="utf-8")
PLAN = ROOT / "examples" / "unmanned-gym.plan.json"
PRODUCT_TEMPLATES = ("interactive-prototype.html", "agent-run-states.html", "visual-board.html")


def outside_block(text: str) -> str:
    block = vs.md_block(text)
    return text.replace(block, "") if block else text


class CopyTest(unittest.TestCase):
    def test_the_copy_has_the_markers_and_the_two_size_sets(self) -> None:
        self.assertIsNotNone(BLOCK)
        self.assertIn("--md-body: 16px", BLOCK)
        self.assertIn("--md-body: 18px", BLOCK)
        self.assertIn("@media (min-width: 768px)", BLOCK)

    def test_the_copy_equals_the_luz_design_master_when_it_is_present(self) -> None:
        if not vs.MD_MASTER.is_file():
            self.skipTest("Luz-Design is not next to this skill")
        self.assertEqual(COPY, vs.MD_MASTER.read_text(encoding="utf-8"))

    def test_the_package_check_finds_no_type_block_problem(self) -> None:
        self.assertEqual(vs.md_type_errors(), [])

    def test_the_rule_stylesheet_carries_the_block_and_no_type_of_its_own(self) -> None:
        self.assertEqual(vs.md_block(GUIDELINES), BLOCK)
        rest = outside_block(GUIDELINES)
        for declaration in re.findall(r"font(?:-size)?\s*:\s*[^;{}]*\d\s*px", rest):
            self.fail(f"guidelines.css sets its own pixel type outside the block: {declaration}")
        self.assertNotRegex(rest, r"line-height\s*:\s*1\.72")
        self.assertRegex(rest, r"h2\s*\{[^}]*border-bottom:\s*0")


class TemplateTest(unittest.TestCase):
    def test_reading_templates_carry_the_block(self) -> None:
        for name in vs.READING_TEMPLATES:
            text = read_template(ROOT, name)
            self.assertEqual(vs.md_block(text), BLOCK, name)
            self.assertNotRegex(outside_block(text), r"h1\s*\{[^}]*font-size", name)
            self.assertNotRegex(outside_block(text), r"body\s*\{[^}]*font:\s*\d", name)

    def test_product_skeletons_keep_their_own_type_scale(self) -> None:
        for name in PRODUCT_TEMPLATES:
            self.assertNotIn("luz-md-type:start", read_template(ROOT, name), name)


class HardwareListTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.page = render.render(pl.load(str(PLAN)))

    def test_the_page_embeds_the_copy_text_unchanged(self) -> None:
        self.assertIn(BLOCK, self.page)
        self.assertNotIn("{md_type}", self.page)

    def test_the_generator_keeps_no_title_or_body_size(self) -> None:
        css = outside_block(re.search(r"<style>(.*?)</style>", self.page, re.S).group(1))
        for selector in ("body", "h1", "h2", "h3", "h4", "p", "table"):
            for rule in re.finditer(r"(?m)^%s\{([^}]*)\}" % selector, css):
                self.assertNotRegex(rule.group(1), r"font-size|line-height", f"{selector} sets its own type")

    def test_other_sizes_are_tokens_or_the_svg_diagram(self) -> None:
        css = outside_block(re.search(r"<style>(.*?)</style>", self.page, re.S).group(1))
        for line in css.splitlines():
            for declaration in re.findall(r"font-size:\s*(\d+)px", line):
                self.assertTrue(line.startswith((".dg-", ".diagram", ".metrics strong")) or ".dg-badge" in line,
                                f"pixel type outside the diagram and the metric figure: {line[:80]}")

    def test_the_phone_layout_starts_where_the_type_sets_change(self) -> None:
        self.assertIn("@media (max-width:767px)", self.page)


if __name__ == "__main__":
    unittest.main()
