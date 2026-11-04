"""Rule cards: every card resolves, carries the user's preferences, and sessions cannot publish without one or without a dated note."""
from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import context  # noqa: E402
import validate_session  # noqa: E402
from validate_session import adopted_rules, rule_card_errors, rule_cards_required, sediment_errors  # noqa: E402

SECTIONS = ["## 1 用户偏好", "## 2 相关教训与有效做法", "## 3 规则", "## 4 用什么做", "## 5 交付前必须通过", "## 6 收尾"]
VISUAL_DESIGN = Path(r"D:\Codes\Luz-Design\references\visual-design.html")


def rule_text(kind: str) -> str:
    text, _ = context.make_card(kind, [])
    return text.split("## 3 规则", 1)[1].split("## 4 用什么做", 1)[0]


class RuleCardTests(unittest.TestCase):
    def test_every_card_resolves_to_rule_sections(self) -> None:
        self.assertEqual(context.check_cards(), [])

    def test_every_card_has_the_six_parts_and_real_rule_text(self) -> None:
        for kind in context.card_kinds():
            text, digest = context.make_card(kind, [])
            for heading in SECTIONS:
                self.assertIn(heading, text, f"{kind}: {heading}")
            self.assertRegex(digest, r"^[0-9a-f]{12}$")
            rules = rule_text(kind)
            self.assertGreater(len(rules), 800, f"{kind}: rule text too short")
            # Markup is flattened; only code samples quoted by the rules may contain tags.
            self.assertNotRegex(rules, r"<(p|td|th|tr|li|ul|div|section|h[1-6])[\s>]", f"{kind}: HTML left in the card")
            # Saved cards live under raw/ where Markdown links are checked; rule text carries none.
            self.assertNotIn("](", text, f"{kind}: Markdown link in the card")

    def test_rule_text_stays_readable_in_one_sitting(self) -> None:
        # Roughly 8–35 KB of rule text per card: long enough to carry the rules, short enough to be read in full.
        for kind in context.card_kinds():
            size = len(rule_text(kind).encode("utf-8"))
            self.assertLessEqual(size, 35 * 1024, f"{kind}: {size} bytes of rule text; split the card or set max_chars")
            if VISUAL_DESIGN.is_file():
                self.assertGreaterEqual(size, 8 * 1024, f"{kind}: {size} bytes of rule text is too thin")

    def test_preferences_are_always_on_the_card(self) -> None:
        notes = context.load_json(context.NOTES_FILE, {"notes": []})["notes"]
        moved = set(context.load_json(context.CARDS_FILE, {}).get("moved_preferences", []))
        prefs = [n["key"] for n in notes if n["kind"] == "preference" and n["key"] not in moved]
        self.assertTrue(prefs)
        for kind in ("admin-list", "hardware"):
            text, _ = context.make_card(kind, [])
            for key in prefs:
                self.assertIn(f"（{key}）", text, f"{kind}: {key}")

    def test_preferences_about_how_things_look_moved_to_luz_design(self) -> None:
        """Visual preferences stay in the store, so older sessions that cite them still validate, but no card prints them."""
        moved = context.load_json(context.CARDS_FILE, {}).get("moved_preferences", [])
        keys = {n["key"] for n in context.load_json(context.NOTES_FILE, {"notes": []})["notes"]}
        self.assertTrue(moved)
        self.assertTrue(set(moved) <= keys, sorted(set(moved) - keys))
        for kind in ("admin-list", "miniprogram", "commerce", "prototype"):
            text, _ = context.make_card(kind, [])
            for key in moved:
                self.assertNotIn(f"（{key}）", text, f"{kind}: {key}")

    def test_admin_list_card_carries_the_list_rules(self) -> None:
        text, _ = context.make_card("admin-list", [])
        for phrase in ("默认视图", "20 条", "导出", "网页管理后台设计规范 › 核心规则 › 五、组件 › 分页",
                       "网页管理后台设计规范 › 核心规则 › 五、组件 › 表格列宽、冻结与滚动", "冻结", "data-col-strategy",
                       "validate_session.py", "check_document.py"):
            self.assertIn(phrase, text)

    def test_surface_cards_pair_the_common_layer_with_the_surface_page(self) -> None:
        pairs = {
            "miniprogram": ("界面通用规范 › 核心规则 › 二、功能架构 › 入口与内容分层", "小程序设计规范 › 核心规则"),
            "agent-ui": ("界面通用规范 › 核心规则 › 二、功能架构 › 状态体系", "智能体设计规范 › 核心规则"),
            "website": ("界面通用规范 › 核心规则 › 三、信息架构与导航 › 页头与品牌标识", "网站设计规范 › 核心规则"),
            "admin-dashboard": ("界面通用规范 › 核心规则 › 四、页面内容与优先级 › 数据驾驶舱：重点信息与计算后的信息", "网页管理后台设计规范 › 核心规则 › 五、组件 › 数据驾驶舱"),
            "system-design": ("界面通用规范 › 核心规则 › 二、功能架构", "系统设计规范 › 核心规则"),
        }
        for kind, labels in pairs.items():
            text, _ = context.make_card(kind, [])
            for label in labels:
                self.assertIn(f"### {label}", text, f"{kind}: {label}")

    def test_platform_console_cards_carry_their_rules(self) -> None:
        # platform-console-design.html is cut into one card per capability; each card must carry its own rules and contracts.
        expected = {
            "platform-console": ["配置与运行参数的边界", "基础与可选", "平台配置台的架构清单"],
            "queue-capacity": ["公平调度", "Retry-After", "死信与重放", "预计等待"],
            "scheduler-ui": ["run_as", "misfire", "fire_id", "cron"],
            "alert-loop": ["恢复载荷", "ALERT_EXPIRED", "STALE_VERSION", "request_id"],
            "rule-engine-ui": ["黄金样例", "calculate_by_rule", "get_rule_config", "分档累计"],
            "multi-agent": ["拆分判断", "交接", "委派深度"],
            "kb-console": ["命中测试", "预过滤", "未命中回流"],
            "workflow-canvas": ["校验规则", "高风险写入", "max_iterations", "版本策略"],
        }
        for kind, phrases in expected.items():
            self.assertIn(kind, context.card_kinds())
            text = rule_text(kind)
            for phrase in phrases:
                self.assertIn(phrase, text, f"{kind}: {phrase}")
        listed = {kind for kind in context.card_kinds()}
        self.assertTrue(set(expected) <= listed)

    def test_interaction_and_agent_runtime_rules_reach_their_cards(self) -> None:
        # The closed-loop rules (ui-standards.html) and the agent runtime contract (agent-design.html) are on the cards
        # that produce architectures, prototypes and agent interfaces.
        expected = {
            "system-design": ("### 系统设计规范 › 核心规则 › 架构的交互字段", "### 系统设计规范 › 核心规则 › 系统架构清单",
                              "智能体运行时与底座", "### 界面通用规范 › 核心规则 › 三、信息架构与导航 › 页面交互契约",
                              "一个动作一个按钮"),
            "interaction": ("页面交互契约", "一个动作一个按钮", "### 界面通用规范 › 核心规则 › 五、组件 › 操作反馈",
                            "### 界面通用规范 › 核心规则 › 二、功能架构 › 功能闭环",
                            "check_interaction.py"),
            "agent-ui": ("能力清单", "运行状态", "耗时与进度", "错误、降级与恢复的呈现", "data-state"),
            "agent-runtime-ui": ("### 智能体设计规范 › 核心规则 › 运行时与可靠性", "`run.completed`", "`Last-Event-ID`",
                                 "`Retry-After`", "agent-foundation.md", "### 智能体设计规范 › 核心规则 › 依据",
                                 "运行方案：模型只做决策，程序控制运行", "单一结果", "权限控制", "工具参数错误的返回"),
            "admin-form": ("### 界面通用规范 › 核心规则 › 五、组件 › 操作反馈",),
        }
        for kind, phrases in expected.items():
            text, _ = context.make_card(kind, [])
            for phrase in phrases:
                self.assertIn(phrase, text, f"{kind}: {phrase}")

    def test_client_document_content_reaches_the_cards_project_calls(self) -> None:
        # Luz-Project reads `function-list` for the client function list and business logic; the architecture atlas and the
        # proposal content come from `client-docs`. Both must say what the client files are and how the data is checked.
        function_list = rule_text("function-list")
        for phrase in ("客户功能清单", "业务逻辑的写法", "项目专属问题", "工时估算", "features.json", "intake-extra.json", "没有序号列"):
            self.assertIn(phrase, function_list, f"function-list: {phrase}")
        text, _ = context.make_card("function-list", [])
        self.assertIn("features_check.py", text)
        client_docs = rule_text("client-docs")
        for phrase in ("需求的写法", "方案说明书的内容来源", "架构图的画法", "客户文件与开发文件", "个人信息与隐私", "七、客户文件",
                       "先分析客户的需求，再给出解决方案", "每条线是单向的关系"):
            self.assertIn(phrase, client_docs, f"client-docs: {phrase}")
        self.assertIn("client-docs", [kind for kind in context.card_kinds()])

    def test_privacy_and_accessibility_rules_are_on_the_cards_that_design_screens(self) -> None:
        ui_cards = {"system-design": "个人信息与隐私", "client-docs": "个人信息与隐私", "miniprogram": "隐私保护指引", "hardware": "单独同意"}
        for kind, phrase in ui_cards.items():
            self.assertIn(phrase, rule_text(kind), f"{kind}: {phrase}")

    def test_interface_cards_point_to_luz_design_and_print_no_visual_rules(self) -> None:
        # What a screen contains and does is Luz-System's; its look is Luz-Design's (references/ui-ownership.md there).
        cards = context.load_json(context.CARDS_FILE, {})["cards"]
        pointed = ("system-design", "function-list", "admin-list", "admin-dashboard", "admin-form", "miniprogram", "commerce", "agent-ui",
                   "agent-composer", "website", "prototype", "interaction", "interaction-patterns", "nav-levels", "platform-console",
                   "workflow-canvas", "alert-loop")
        for kind in pointed:
            lines = [t for t in cards[kind]["tools"] if t.startswith("视觉读 Luz-Design 的规则卡 `interface-visual`")]
            self.assertEqual(len(lines), 1, kind)
            for name in ("interface-components", "interface-layout", "interface-pattern", "interface-motion", "interface-icons",
                         "不决定颜色、字号、圆角阴影、图标图形、配图、栅格间距、动画时长"):
                self.assertIn(name, lines[0], kind)
        for kind, card in cards.items():
            self.assertFalse([s["path"] for s in card["sections"] if s.get("root")], f"{kind}: a section is cut from another skill's page")
            text, _ = context.make_card(kind, [])
            self.assertNotIn("### 视觉设计规范（Luz-Design）", text, kind)
            self.assertNotIn("### 文件设计规范（Luz-Design）", text, kind)

    def test_cards_moved_to_luz_design_are_retired_everywhere(self) -> None:
        retired = ("layout-grid", "icon-card-title", "table-layout", "ui-recipes")
        self.assertFalse(set(retired) & set(context.card_kinds()))
        pattern = re.compile(r"(?<![\w-])(?:layout-grid|icon-card-title|table-layout|ui-recipes(?!\.html))(?![\w:-])")
        for rel in ("SKILL.md", "WORKFLOW.md", "README.md", "agents/openai.yaml", "references/cards.json", "scripts/add_mode.py", "scripts/new_session.py"):
            text = (context.SKILL_ROOT / rel).read_text(encoding="utf-8")
            self.assertEqual(pattern.findall(text), [], rel)

    def test_default_entrance_positions_are_on_the_cards_that_place_features(self) -> None:
        # ui-standards.html 二、功能架构 › 入口与内容分层 › 功能类型的默认入口位置: where each type of function lives, the input of the home page design.
        for kind in ("system-design", "function-list", "miniprogram", "interaction", "nav-levels"):
            self.assertIn("功能类型的默认入口位置", rule_text(kind), kind)

    def test_the_size_limit_is_kept_by_moving_sections_not_by_cutting_text(self) -> None:
        cards = context.load_json(context.CARDS_FILE, {})
        self.assertFalse([k for k, c in cards["cards"].items() for s in c["sections"] if s.get("max_chars")])

    def test_missing_cross_skill_page_falls_back_to_its_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            cards = Path(temp) / "cards.json"
            cards.write_text(json.dumps({"skill": "luz-system", "always": [], "cards": {"probe": {
                "title": "探针", "summary": "跨技能引用", "tools": ["无"], "checks": ["无"], "sections": [
                    {"page": "ui-standards.html", "title": "界面通用规范", "path": ["核心规则", "五、组件", "筛选"]},
                    {"root": str(Path(temp) / "absent"), "page": "visual-design.html", "title": "视觉设计规范（Luz-Design）",
                     "path": ["核心规则"], "url": "https://github.com/luzern0414/Luz-Design/blob/master/references/visual-design.html"}]}}},
                ensure_ascii=False), encoding="utf-8")
            saved = context.CARDS_FILE
            context.CARDS_FILE = cards
            try:
                self.assertEqual(context.check_cards(), [])
                text, _ = context.make_card("probe", [])
                self.assertIn("https://github.com/luzern0414/Luz-Design/blob/master/references/visual-design.html", text)
                self.assertIn("常用筛选外露最多 4 个", text)
            finally:
                context.CARDS_FILE = saved

    def test_markdown_rule_files_resolve_by_heading_or_whole(self) -> None:
        text, _ = context.make_card("hardware", [])
        self.assertIn("### 通信方式与协议 › 3 设备连到后台的四种接入模式", text)
        self.assertIn("模式 D：本地闭环", text)
        protocols = context.SKILL_ROOT / "references" / "hardware" / "protocols.md"
        whole = context.section_text(protocols, [])
        self.assertIn("1 物理层与信号", whole)
        self.assertNotIn("1 物理层与信号", context.section_text(protocols, ["5 网络与安全规则"]))

    def test_section_ends_at_the_next_heading_of_the_same_level(self) -> None:
        page = context.SKILL_ROOT / "references" / "ui-standards.html"
        filters = context.section_text(page, ["核心规则", "五、组件", "筛选"])
        self.assertIn("常用筛选外露最多 4 个", filters)
        self.assertNotIn("导出的是给人看的数据", filters)  # first line of 导出, the next h4

    def test_saved_card_records_its_hash_and_goes_stale(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            card = context.save_card(Path(temp), "hardware")
            self.assertEqual(card, Path(temp) / "00-rules" / "hardware.md")
            self.assertTrue(context.card_is_current(card))
            first, rest = card.read_text(encoding="utf-8").split("\n", 1)
            card.write_text(first.replace(first[first.index(":") + 2:first.index(":") + 14], "000000000000") + "\n" + rest, encoding="utf-8")
            self.assertFalse(context.card_is_current(card))

    def test_adopted_rules_ignore_header_separator_and_comment(self) -> None:
        brief = "# Brief\n\n## 采用的规则\n\n<!-- | 示例 | 示例 | -->\n\n| 规则（规范页 › 小节 或 偏好 key） | 本次怎么落实 |\n|---|---|\n"
        self.assertEqual(adopted_rules(brief), [])
        self.assertEqual(adopted_rules(brief + "| 表格居中 | 表头居中、金额右对齐 |\n"), [("表格居中", "表头居中、金额右对齐")])
        self.assertIsNone(adopted_rules("# Brief\n"))
        # The next section ends the table.
        self.assertEqual(adopted_rules(brief + "\n## 本次沉淀\n\n| a | b |\n|---|---|\n| k | lesson |\n"), [])

    def test_session_without_card_or_adopted_rules_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            (work / "BRIEF.md").write_text("# Brief\n\n## 采用的规则\n\n| 规则 | 落实 |\n|---|---|\n", encoding="utf-8")
            errors = rule_card_errors(work, require_adopted=True, check_current=True)
            self.assertTrue(any("00-rules" in e for e in errors))
            self.assertTrue(any("采用的规则 is empty" in e for e in errors))
            context.save_card(work, "admin-list")
            (work / "BRIEF.md").write_text("# Brief\n\n## 采用的规则\n\n| 界面通用规范 › 核心规则 › 五、组件 › 筛选 | 外露 4 个筛选 |\n", encoding="utf-8")
            self.assertEqual(rule_card_errors(work, require_adopted=True, check_current=True), [])

    def test_every_session_leaves_a_dated_note_behind(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            notes = work / "notes.json"
            notes.write_text(json.dumps({"notes": [
                {"key": "fresh", "kind": "fact", "text": "有效做法", "last_confirmed": "2026-10-29"},
                {"key": "old", "kind": "lesson", "text": "旧教训", "last_confirmed": "2026-10-01"},
            ]}, ensure_ascii=False), encoding="utf-8")
            saved = validate_session.NOTES_FILE
            validate_session.NOTES_FILE = notes
            try:
                (work / "BRIEF.md").write_text("# Brief\n", encoding="utf-8")
                self.assertIn("no 本次沉淀", sediment_errors(work, "2026-10-29")[0])
                base = "# Brief\n\n## 本次沉淀\n\n| 经验 key | 类型 | 一句话 |\n|---|---|---|\n"
                (work / "BRIEF.md").write_text(base, encoding="utf-8")
                self.assertIn("is empty", sediment_errors(work, "2026-10-29")[0])
                (work / "BRIEF.md").write_text(base + "| missing | fact | 不存在 |\n", encoding="utf-8")
                self.assertIn("not in experience/notes.json", sediment_errors(work, "2026-10-29")[0])
                (work / "BRIEF.md").write_text(base + "| old | lesson | 旧教训 |\n", encoding="utf-8")
                self.assertIn("before this session", sediment_errors(work, "2026-10-29")[0])
                (work / "BRIEF.md").write_text(base + "| `fresh` | fact | 有效做法 |\n", encoding="utf-8")
                self.assertEqual(sediment_errors(work, "2026-10-29"), [])
            finally:
                validate_session.NOTES_FILE = saved

    def test_card_tells_what_to_sediment(self) -> None:
        text, _ = context.make_card("prototype", [])
        for phrase in ("本次沉淀", "preference", "lesson", "fact", "调研来源与范围", "同一 key", "experience.py note"):
            self.assertIn(phrase, text)

    def test_sessions_before_rule_cards_are_exempt_by_creation_date(self) -> None:
        self.assertFalse(rule_cards_required({"created_at": "2026-10-28T15:33:59+08:00"}))
        self.assertTrue(rule_cards_required({"created_at": "2026-10-29T00:00:01+08:00"}))
        self.assertTrue(rule_cards_required({"created_at": "not a date"}))


class ExperienceStoreOverrideTests(unittest.TestCase):
    """LUZ_EXPERIENCE_STORE (tests and rehearsals only) takes note writes and feeds the rule card; the skill's own files stay untouched."""

    def test_override_store_takes_writes_and_feeds_the_card(self) -> None:
        import os
        import subprocess
        skill_root = Path(__file__).resolve().parents[1]
        experience = {p: p.read_bytes() for p in (skill_root / "experience").iterdir() if p.is_file()}
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp) / "notes.json"
            env = {**os.environ, "LUZ_EXPERIENCE_STORE": str(store)}

            def run(*args: str) -> subprocess.CompletedProcess:
                return subprocess.run([sys.executable, "-X", "utf8", *args], cwd=skill_root, env=env, text=True,
                                      capture_output=True, encoding="utf-8", errors="replace", check=False)

            noted = run("scripts/experience.py", "note", "--kind", "preference", "--key", "override-probe", "--text", "探针偏好，只写测试库")
            self.assertEqual(noted.returncode, 0, noted.stderr)
            self.assertTrue(store.is_file())
            card = run("scripts/context.py", "system-design")
            self.assertEqual(card.returncode, 0, card.stderr)
            self.assertIn("探针偏好", card.stdout)
        self.assertEqual({p: p.read_bytes() for p in (skill_root / "experience").iterdir() if p.is_file()}, experience)


if __name__ == "__main__":
    unittest.main()
