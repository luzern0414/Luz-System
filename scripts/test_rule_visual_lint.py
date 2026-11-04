"""Rule pages state what a screen contains and does; a visual value (radius, shadow, type size, colour, animation time) in a
paragraph, list item or table cell must point to the visual standard instead of being written out (validate_skill.py)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_skill as vs  # noqa: E402
from test_session_flow import minimal_rule_page  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def page(body: str) -> str:
    return f"<!doctype html><html><body><main>{body}</main></body></html>"


def terms(body: str) -> list[str]:
    return [what for what, _ in vs.visual_value_findings(page(body))]


class VisualValueTests(unittest.TestCase):
    def test_a_radius_without_a_pointer_is_reported(self) -> None:
        self.assertEqual(terms("<p>卡片圆角 12，下方留白。</p>"), ["圆角"])

    def test_a_pointer_in_the_same_block_clears_it(self) -> None:
        self.assertEqual(terms("<p>卡片圆角见视觉设计规范“界面组件的外观”。</p>"), [])
        self.assertEqual(terms("<p>阴影的层级由视觉技能决定。</p>"), [])
        # A pointer in the next paragraph does not count: the value and its pointer share a block.
        self.assertEqual(terms("<p>卡片圆角 12。</p><p>见视觉设计规范。</p>"), ["圆角"])

    def test_code_is_not_read(self) -> None:
        self.assertEqual(terms("<p>样式写 <code>border-radius: 12px</code>，圆角 <code>12</code> 不在正文里。</p>"), ["圆角"])
        self.assertEqual(terms("<p>属性 <code>圆角阴影字号配色</code> 与 <kbd>#FF0000</kbd> 只是示例。</p>"), [])
        self.assertEqual(terms("<pre>圆角 12 阴影 #FF0000</pre><p>说明。</p>"), [])

    def test_row_highlight_is_not_row_height(self) -> None:
        self.assertEqual(terms("<p>有差异的行高亮显示。</p>"), [])
        self.assertEqual(terms("<p>进行高风险写入前必须审批；执行高频任务要限流。</p>"), [])
        self.assertEqual(terms("<p>表格的行高 44。</p>"), ["行高"])

    def test_a_gradual_change_is_not_a_gradient(self) -> None:
        self.assertEqual(terms("<p>数量逐渐变化时不闪烁。</p>"), [])
        self.assertEqual(terms("<p>按钮用渐变填充。</p>"), ["渐变"])

    def test_a_six_digit_colour_is_reported(self) -> None:
        self.assertEqual(terms("<p>价格用 #D9001B 显示。</p>"), ["色值"])
        self.assertEqual(terms("<p>路由写 #/orders 与 #12345 都不是色值。</p>"), [])

    def test_an_animation_time_is_reported_only_with_an_animation_word(self) -> None:
        self.assertEqual(terms("<p>新增一行时淡入 150 毫秒。</p>"), ["动画时长"])
        self.assertEqual(terms("<p>展开用 200–300 毫秒。</p>"), ["动画时长"])
        # Behaviour times belong to the system rules.
        self.assertEqual(terms("<p>加载超过 300 毫秒才出骨架屏，提示 3 秒后消失，删除后 5 秒内可撤销。</p>"), [])

    def test_list_items_and_table_cells_are_blocks_of_their_own(self) -> None:
        body = ("<ul><li>外层说明<ul><li>字号 14</li></ul>继续说明</li></ul>"
                "<table><tr><th>项目</th><th>标准</th></tr><tr><td>标签</td><td>圆角 4，高 20</td></tr>"
                "<tr><td>按钮</td><td>样式见视觉设计规范“界面组件的外观”，圆角 8</td></tr></table>")
        found = vs.visual_value_findings(page(body))
        self.assertEqual([what for what, _ in found], ["字号", "圆角"])
        self.assertEqual([block for _, block in found], ["字号 14", "圆角 4，高 20"])

    def test_headings_are_not_blocks(self) -> None:
        self.assertEqual(terms("<h4>配色</h4><p>见视觉设计规范。</p>"), [])

    def test_a_rule_page_with_a_visual_value_fails_the_package_check(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "admin-design.html"
            path.write_text(minimal_rule_page().replace("</main>", "<p>卡片圆角 12。</p></main>", 1), encoding="utf-8")
            errors: list[str] = []
            vs.validate_rule_page(path, "visual", 0, "视觉设计规范", errors)
            self.assertTrue(any("visual value without a pointer" in e and "圆角" in e for e in errors), errors)
            # The pages outside the check are not read.
            for name in vs.VISUAL_LINT_SKIP:
                skipped = Path(temp) / name
                skipped.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
                errors = []
                vs.validate_rule_page(skipped, "visual", 0, "视觉设计规范", errors)
                self.assertFalse(any("visual value" in e for e in errors), (name, errors))

    def test_the_rule_pages_of_the_skill_state_no_visual_value(self) -> None:
        for name, _, _ in vs.RULE_PAGES:
            if name in vs.VISUAL_LINT_SKIP:
                continue
            with self.subTest(page=name):
                found = vs.visual_value_findings((ROOT / "references" / name).read_text(encoding="utf-8"))
                self.assertEqual(found, [], [f"[{what}] {block[:50]}" for what, block in found])


if __name__ == "__main__":
    unittest.main()
