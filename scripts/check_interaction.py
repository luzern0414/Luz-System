#!/usr/bin/env python3
"""Interaction-logic checks for a Luz System architecture and prototype.

Rules: references/ui-standards.html 二、功能架构 “功能闭环” (with “一个动作一个按钮”), 三、信息架构与导航 “页面交互契约”,
五、组件 “操作反馈”; system-design.html “架构的交互字段”; agent-design.html 二、功能架构 “运行状态” for the seven agent
run states a prototype demonstrates. Blocking faults are errors; anything inferred from wording is a warning.
validate_session.py calls architecture_interaction_findings, prototype_interaction_findings,
prototype_agent_state_findings and prototype_behavior_findings (input box state machine, motion, wide tables, two-state
controls: agent-design.html 输入区状态机, ui-standards.html 切换类控件 and 列表变更与动画, admin-design.html 表格列宽、冻结与滚动);
the command line below runs the same checks read-only:

  py -X utf8 scripts/check_interaction.py <会话目录 | 架构.html> [--design 系统设计.html]

Architecture fields (all optional; once any page declares data-entry, data-exit or data-primary-action the
architecture is treated as written to the interaction contract and every page must declare them):
  page   data-entry  data-goal  data-primary-action  data-secondary-actions  data-exit  data-states
  action data-target-page-id  data-navigation-id  data-feedback  data-confirm  data-undo
  nav    data-from
  state  data-values  data-initial  data-terminal  data-transitions  data-page-ids  data-ordered  data-configurable
  entity data-lifecycle
  flow   data-success (data-exception is required by validate_session)
  component data-display
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ID_RE = re.compile(r"(?<![A-Z0-9-])(?:FL|P|A|N|C|S|D|F)-\d{3,}(?![0-9])")
PAGE_ID_RE = re.compile(r"^P-\d{3,}$")
LIST_DELIM_RE = re.compile(r"[,，、;；]")


def split_list(text: str) -> list[str]:
    """Comma, 、 or semicolon lists keep values with spaces ("AI 已润色"); a list without them splits on whitespace."""
    text = (text or "").strip()
    parts = LIST_DELIM_RE.split(text) if LIST_DELIM_RE.search(text) else text.split()
    return [p.strip() for p in parts if p.strip()]
ITEM_SPLIT_RE = re.compile(r"[;；]")
PAIR_SPLIT_RE = re.compile(r"[:：]")
PAREN_RE = re.compile(r"[（(][^）)]*[）)]")
SPACE_RE = re.compile(r"\s+")

# Entry sources that are not page IDs: global navigation, external links, the tab bar itself.
ROOT_SOURCE_RE = re.compile(r"标签栏|底部标签|侧栏|菜单|顶部导航|tab", re.I)
EXTERNAL_SOURCE_RE = re.compile(r"外部|分享|深链接|通知|扫码|全局")
LOGIN_RE = re.compile(r"login|signin|登录")
BACK_LABEL_RE = re.compile(r"^(?:返回|关闭|完成|取消|退出|收起)")
# Actions that only view, switch views or leave: a page with nothing else is read-only and its primary action is 无.
READ_ONLY_ACTION_RE = re.compile(r"^(?:返回|关闭|完成|取消|退出|收起|切换|查看|预览|展开|放大|缩小|全屏|翻页|上一|下一|下载|复制|刷新)")
LEADING_VERB_RE = re.compile(r"^(?:打开|进入|查看|前往|去|点击)\s*")

STATE_KINDS = {"加载": "加载", "载入": "加载", "空": "空", "空状态": "空", "错误": "错误", "失败": "错误", "出错": "错误",
               "成功": "成功", "完成": "成功", "禁用": "禁用", "不可用": "禁用"}
REQUIRED_STATE_KINDS = ("加载", "空", "错误", "成功", "禁用")
FEEDBACK_KINDS = {"进行中": "进行中", "加载": "进行中", "处理中": "进行中", "成功": "成功", "完成": "成功",
                  "失败": "失败", "错误": "失败", "按下": "按下"}
REQUIRED_FEEDBACK_KINDS = ("进行中", "成功", "失败")
LIFECYCLE_KINDS = {"新建": "新建", "新增": "新建", "创建": "新建", "查看": "查看", "详情": "查看", "编辑": "编辑", "修改": "编辑",
                   "删除": "删除", "归档": "删除", "停用": "删除", "状态": "状态", "状态变更": "状态"}
REQUIRED_LIFECYCLE_KINDS = ("查看", "编辑", "删除")

CREATE_VERB_RE = re.compile(r"新建|新增|添加|创建|上传|导入|录入|生成|转为")
VIEW_VERB_RE = re.compile(r"打开|查看|预览|详情|展开|下载")
EDIT_VERB_RE = re.compile(r"编辑|修改|修订|保存|调整|重命名|改名|更新")
DELETE_VERB_RE = re.compile(r"删除|移除|归档|作废|撤销|撤下|停用|下架|注销|清空")
DESTRUCTIVE_RE = re.compile(r"删除|撤销|撤下|停用|作废|清空|移除|注销|退款|重置|下架|冻结|解绑|取消订单")
WRITE_RE = re.compile(r"保存|提交|发送|新建|新增|添加|创建|上传|导入|生成|导出|发布|批准|拒绝|修改|编辑|修订|重试|登录|"
                      r"退出|复制|开始|结束|暂停|继续|润色|调整|转为|初始化|录入|下载|勾选|反馈|有用|重新")
APPROVE_RE = re.compile(r"批准|确认|提交|发布|开始生成")
DISPLAY_COMPONENT_RE = re.compile(r"展示|只读|查看|预览|图表|指标|统计|提示|标识|水印|状态|引用")
ENTITY_SUFFIXES = ("项目", "条目", "记录", "链接", "请求", "配置", "稿")


def _children(node) -> list:
    return [c for c in node.children if not isinstance(c, str)]


def _iter(node):
    for child in _children(node):
        yield child
        yield from _iter(child)


def _text(node) -> str:
    if node.tag in {"script", "style"}:
        return ""
    return "".join(c if isinstance(c, str) else _text(c) for c in node.children)


def _clean(text: str) -> str:
    return SPACE_RE.sub(" ", text).strip()


def _ancestors(node):
    parent = node.parent
    while parent is not None:
        yield parent
        parent = parent.parent


def _norm(text: str) -> str:
    """Name used for comparison: no parenthetical notes, no spaces."""
    return SPACE_RE.sub("", PAREN_RE.sub("", text or "")).strip()


def _cells(node) -> list[str]:
    return [_clean(_text(c)) for c in _children(node) if c.tag in {"td", "th"}]


def _strip_ids(text: str) -> str:
    return _clean(ID_RE.sub(" ", text)).strip(" ：:（）()·")


def _name(node, own_id: str) -> str:
    """Business name of a definition row or card: data-name, the first <strong>, the second table cell, or the text."""
    if node.get("data-name").strip():
        return node.get("data-name").strip()
    strong = next((c for c in _iter(node) if c.tag == "strong"), None)
    if strong is not None and _clean(_text(strong)):
        return _clean(_text(strong))
    if node.tag == "tr":
        cells = _cells(node)
        rest = [c for c in cells if c and c != own_id]
        if rest:
            return rest[0]
    text = _clean(_text(node)).replace(own_id, "", 1)
    return _strip_ids(re.split(r"[：:（(]", text, maxsplit=1)[0])


def _ids(value: str, prefix: str | None = None) -> list[str]:
    found = ID_RE.findall(value or "")
    return [i for i in found if prefix is None or i.startswith(prefix + "-")]


def _items(value: str) -> list[tuple[str, str]]:
    """'返回:来源; 完成:P-012' -> [('返回','来源'), ('完成','P-012')]. Items without a colon have an empty kind."""
    pairs = []
    for raw in ITEM_SPLIT_RE.split(value or ""):
        raw = raw.strip()
        if not raw:
            continue
        parts = PAIR_SPLIT_RE.split(raw, maxsplit=1)
        pairs.append((parts[0].strip(), parts[1].strip()) if len(parts) == 2 else ("", raw))
    return pairs


@dataclass
class Page:
    id: str
    name: str
    route: str
    node: object
    actions: list = field(default_factory=list)


@dataclass
class Action:
    id: str
    label: str
    page: str
    component: str
    functions: set
    node: object


@dataclass
class Nav:
    id: str
    target: str
    source: str
    label: str
    node: object


@dataclass
class Model:
    pages: dict
    actions: dict
    navs: list
    components: dict
    states: list
    entities: list
    flows: list


def _nav_source(node, target: str) -> str:
    declared = node.get("data-from").strip()
    if declared:
        return declared
    if node.tag == "tr":
        cells = _cells(node)
        for cell in cells[1:]:
            if PAGE_ID_RE.fullmatch(cell) and cell != target:
                return cell
        for cell in cells[1:]:
            if cell and len(cell) <= 8 and (ROOT_SOURCE_RE.search(cell) or EXTERNAL_SOURCE_RE.search(cell)):
                return cell
    return ""


def _nav_label(node, nav_id: str) -> str:
    if node.get("data-label").strip():
        return node.get("data-label").strip()
    if node.tag == "tr":
        cells = [c for c in _cells(node) if c and c != nav_id]
        return cells[0] if cells else ""
    return _strip_ids(_clean(_text(node)))


def build_model(root) -> Model:
    pages: dict[str, Page] = {}
    actions: dict[str, Action] = {}
    navs: list[Nav] = []
    components: dict[str, tuple[str, str, object]] = {}
    states, entities, flows = [], [], []
    nodes = list(_iter(root))
    page_rows = [n for n in nodes if n.get("data-page-id").strip() and n.get("data-route").strip()]
    if not page_rows:  # older architectures without routes: the first plain page node of each ID
        page_rows = [n for n in nodes if n.get("data-page-id").strip() and not any(
            n.get(a).strip() for a in ("data-navigation-id", "data-component-id", "data-action-id", "data-state-id"))]
    for node in page_rows:
        pid = node.get("data-page-id").strip()
        if pid not in pages:
            pages[pid] = Page(pid, _name(node, pid), node.get("data-route").strip(), node)
    for node in nodes:
        aid = node.get("data-action-id").strip()
        nid = node.get("data-navigation-id").strip()
        cid = node.get("data-component-id").strip()
        if aid:
            label = node.get("data-label").strip() or _strip_ids(_clean(_text(node)))
            action = Action(aid, label, node.get("data-page-id").strip(), cid,
                            set(_ids(node.get("data-function-ids"), "F")), node)
            actions.setdefault(aid, action)
            if action.page in pages and action not in pages[action.page].actions:
                pages[action.page].actions.append(action)
        elif nid:
            target = node.get("data-page-id").strip()
            navs.append(Nav(nid, target, _nav_source(node, target), _nav_label(node, nid), node))
        elif cid and cid not in components:
            components[cid] = (node.get("data-page-id").strip(), _name(node, cid), node)
        if node.get("data-state-id").strip():
            states.append(node)
        if node.get("data-entity-id").strip():
            entities.append(node)
        if node.get("data-flow-id").strip():
            flows.append(node)
    return Model(pages, actions, navs, components, states, entities, flows)


def _is_opt_in(model: Model) -> bool:
    return any(p.node.get(a).strip() for p in model.pages.values()
               for a in ("data-entry", "data-exit", "data-primary-action"))


def _join(ids) -> str:
    return ", ".join(ids)


def _page_contract(model: Model, page: Page, opt_in: bool, errors: list[str]) -> None:
    node, pid = page.node, page.id
    on_page = {a.id for a in page.actions}
    entry, exit_, primary = (node.get("data-entry").strip(), node.get("data-exit").strip(),
                             node.get("data-primary-action").strip())
    goal, secondary, states = node.get("data-goal").strip(), node.get("data-secondary-actions").strip(), node.get("data-states").strip()
    if opt_in:
        missing = [name for name, value in (("data-entry", entry), ("data-goal", goal), ("data-primary-action", primary),
                                            ("data-exit", exit_), ("data-states", states)) if not value]
        if missing:
            errors.append(f"architecture page {pid} {page.name} must declare {', '.join(missing)} "
                          "(进入方式、页面目标、主操作、离开方式与五类状态)")
    if entry:
        tokens = split_list(entry)
        if not tokens:
            errors.append(f"architecture page {pid} data-entry is empty")
        for token in tokens:
            if token.startswith("N-"):
                nav = next((n for n in model.navs if n.id == token), None)
                if nav is None:
                    errors.append(f"architecture page {pid} data-entry names unknown navigation {token}")
                elif nav.target != pid:
                    errors.append(f"architecture page {pid} data-entry {token} leads to {nav.target or 'no page'}, not to this page")
            elif token.startswith("A-"):
                action = model.actions.get(token)
                if action is None:
                    errors.append(f"architecture page {pid} data-entry names unknown action {token}")
                elif action.node.get("data-target-page-id").strip() not in {"", pid}:
                    errors.append(f"architecture page {pid} data-entry {token} targets {action.node.get('data-target-page-id')}, not this page")
            elif token.startswith("P-") and token not in model.pages:
                errors.append(f"architecture page {pid} data-entry names unknown page {token}")
    if exit_:
        for kind, target in _items(exit_.replace(",", ";").replace("，", ";")):
            for ref in _ids(target, "P"):
                if ref not in model.pages:
                    errors.append(f"architecture page {pid} data-exit {kind or 'target'} names unknown page {ref}")
    if primary:
        refs = _ids(primary, "A")
        if len(refs) > 1:
            errors.append(f"architecture page {pid} has {len(refs)} primary actions ({_join(refs)}); a page has one primary action")
        elif refs:
            if refs[0] not in model.actions:
                errors.append(f"architecture page {pid} data-primary-action names unknown action {refs[0]}")
            elif refs[0] not in on_page:
                errors.append(f"architecture page {pid} primary action {refs[0]} is not an action of this page")
        elif primary not in {"无", "—", "-", "none"}:
            errors.append(f"architecture page {pid} data-primary-action must be one A-ID, or 无 for a read-only page")
        else:
            moving = sorted(a for a in on_page if not READ_ONLY_ACTION_RE.match(model.actions[a].label.strip()))
            if moving:
                errors.append(f"architecture page {pid} declares no primary action but has actions that change data or move "
                              f"the task on: {_join(moving)}; 无 is only for pages whose actions view, switch or leave")
    for ref in _ids(secondary, "A"):
        if ref not in on_page:
            errors.append(f"architecture page {pid} secondary action {ref} is not an action of this page")
        if ref in _ids(primary, "A"):
            errors.append(f"architecture page {pid} lists {ref} as both primary and secondary action")
    if states:
        declared = {}
        for kind, desc in _items(states):
            canonical = STATE_KINDS.get(kind)
            if canonical is None:
                errors.append(f"architecture page {pid} data-states has unknown kind: {kind or desc}")
                continue
            declared[canonical] = desc
        missing_kinds = [k for k in REQUIRED_STATE_KINDS if k not in declared]
        if missing_kinds:
            errors.append(f"architecture page {pid} data-states lacks {'、'.join(missing_kinds)} "
                          "(加载、空、错误、成功、禁用 each need a presentation and copy, or 不适用 with a reason)")
        for kind, desc in declared.items():
            if not desc:
                errors.append(f"architecture page {pid} state {kind} has no presentation or copy")
            elif desc.startswith("不适用") and len(SPACE_RE.sub("", desc).strip("（）()：:")) <= 3:
                errors.append(f"architecture page {pid} state {kind} is 不适用 without a reason")


def _navigation_findings(model: Model, opt_in: bool, errors: list[str], warnings: list[str]) -> None:
    pages = model.pages
    inbound = {pid: set() for pid in pages}
    outbound = {pid: set() for pid in pages}
    roots = set()
    for nav in model.navs:
        if nav.target in inbound:
            inbound[nav.target].add(nav.id)
            if nav.source in pages:
                outbound[nav.source].add(nav.target)
            elif not nav.source or ROOT_SOURCE_RE.search(nav.source) or ROOT_SOURCE_RE.search(nav.label) \
                    or EXTERNAL_SOURCE_RE.search(nav.source):
                roots.add(nav.target)
    for action in model.actions.values():
        target = action.node.get("data-target-page-id").strip()
        if target in inbound and action.page != target:
            inbound[target].add(action.id)
            if action.page in pages:
                outbound[action.page].add(target)
    for page in pages.values():
        for token in split_list(page.node.get("data-entry")):
            if token and not ID_RE.fullmatch(token):
                roots.add(page.id)
            elif token:
                inbound[page.id].add(token)
        for _, target in _items(page.node.get("data-exit")):
            for ref in _ids(target, "P"):
                if ref in inbound and ref != page.id:
                    inbound[ref].add(page.id)
                    outbound[page.id].add(ref)
        if LOGIN_RE.search(page.route.lower()) or "登录" in page.name:
            roots.add(page.id)
    islands = [pid for pid in pages if not inbound[pid] and pid not in roots]
    for pid in islands:
        message = (f"architecture page {pid} {pages[pid].name} is an island: no navigation, action or exit leads to it "
                   "(add an N- entry or data-entry; tab roots, login and external links are exempt)")
        (errors if opt_in else warnings).append(message)
    # Reachability from roots, when navigation sources are known.
    if roots:
        seen, queue = set(roots), list(roots)
        while queue:
            current = queue.pop()
            for nxt in outbound.get(current, ()):
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        known = all(nav.source for nav in model.navs)
        unreachable = [pid for pid in pages if pid not in seen and pid not in islands]
        if known and unreachable:
            warnings.append("architecture pages not reachable from a tab root, login or external entry: "
                            + _join(f"{pid} {pages[pid].name}" for pid in unreachable))
    # Dead ends: no declared exit, no outgoing navigation, no back or close action, and not a root.
    dead = []
    for pid, page in pages.items():
        if page.node.get("data-exit").strip() or outbound[pid] or pid in roots:
            continue
        if any(BACK_LABEL_RE.search(a.label) or a.node.get("data-target-page-id").strip() for a in page.actions):
            continue
        dead.append(f"{pid} {page.name}")
    if dead and not opt_in:  # opt-in pages already fail on a missing data-exit
        warnings.append("architecture pages declare no exit (返回目标与完成后去向, data-exit): " + _join(dead))
    # Two navigation entries from the same page to the same destination.
    seen_pairs: dict[tuple[str, str], str] = {}
    for nav in model.navs:
        if nav.source in pages and nav.target:
            key = (nav.source, nav.target)
            if key in seen_pairs:
                errors.append(f"architecture page {nav.source} has two entries to {nav.target}: {seen_pairs[key]} and {nav.id}")
            else:
                seen_pairs[key] = nav.id
    # Navigation naming: “… → 目标名” must use the target page's name.
    for nav in model.navs:
        if "→" in nav.label and nav.target in pages:
            said = _norm(nav.label.rsplit("→", 1)[1])
            actual = _norm(pages[nav.target].name)
            if said and actual and said != actual and said not in actual and actual not in said:
                warnings.append(f"architecture navigation {nav.id} calls {nav.target} “{said}”, but the page is named "
                                f"“{actual}” (one object, one name)")


def _action_findings(model: Model, errors: list[str], warnings: list[str]) -> None:
    pages = model.pages
    by_page: dict[str, list[Action]] = {}
    for action in model.actions.values():
        by_page.setdefault(action.page, []).append(action)
    for pid, items in by_page.items():
        labels: dict[str, Action] = {}
        targets: dict[str, str] = {}
        for action in items:
            key = _norm(action.label)
            if key and key in labels:
                errors.append(f"architecture page {pid} has two actions with the same text “{action.label}”: "
                              f"{labels[key].id} and {action.id} (same text must be the same action, shown once)")
            labels.setdefault(key, action)
            target = action.node.get("data-target-page-id").strip()
            if target:
                if target in targets:
                    errors.append(f"architecture page {pid} has two entries to {target}: {targets[target]} and {action.id}")
                targets.setdefault(target, action.id)
                linked = action.node.get("data-navigation-id").strip()
                for nav in model.navs:
                    if nav.source == pid and nav.target == target and nav.id != linked:
                        errors.append(f"architecture page {pid} reaches {target} through both {action.id} and {nav.id}; "
                                      f"keep one entry or link them with data-navigation-id=\"{nav.id}\"")
        # Overlapping purposes: one label contained in another with a shared function.
        for a in items:
            for b in items:
                if a.id < b.id and a.functions & b.functions:
                    na, nb = _norm(a.label), _norm(b.label)
                    if len(na) >= 3 and len(nb) >= 3 and na != nb and (na in nb or nb in na):
                        warnings.append(f"architecture page {pid}: {a.id} “{a.label}” and {b.id} “{b.label}” look like "
                                        "the same purpose; keep one button per purpose")
        # Inferred duplicates against navigation entries from the same page.
        for action in items:
            if action.node.get("data-navigation-id").strip() or action.node.get("data-target-page-id").strip():
                continue
            bare = _norm(LEADING_VERB_RE.sub("", action.label))
            for nav in model.navs:
                if nav.source != pid or nav.target not in pages:
                    continue
                nav_label = _norm(LEADING_VERB_RE.sub("", nav.label.split("→")[0].split("·")[-1]))
                page_name = _norm(pages[nav.target].name)
                if bare and (bare == nav_label or bare == page_name or _norm(action.label) == page_name):
                    warnings.append(f"architecture page {pid}: {action.id} “{action.label}” and {nav.id} both lead to "
                                    f"{nav.target} {pages[nav.target].name}; if they are one element add "
                                    f"data-navigation-id=\"{nav.id}\" to the action, otherwise keep one entry")
    # Same text across pages must be the same action.
    by_label: dict[str, list[Action]] = {}
    for action in model.actions.values():
        if _norm(action.label):
            by_label.setdefault(_norm(action.label), []).append(action)
    for label, items in by_label.items():
        groups = {frozenset(a.functions) for a in items}
        if len({a.page for a in items}) > 1 and len(groups) > 1:
            warnings.append(f"architecture actions share the text “{items[0].label}” but serve different functions: "
                            + _join(f"{a.id}@{a.page}({'、'.join(sorted(a.functions)) or '—'})" for a in items))
    # Feedback and confirmation.
    missing_feedback, missing_confirm = [], []
    for action in model.actions.values():
        label = action.label
        feedback = action.node.get("data-feedback").strip()
        if feedback:
            kinds = {}
            for kind, desc in _items(feedback):
                canonical = FEEDBACK_KINDS.get(kind)
                if canonical is None:
                    errors.append(f"architecture action {action.id} data-feedback has unknown kind: {kind or desc}")
                else:
                    kinds[canonical] = desc
            lacking = [k for k in REQUIRED_FEEDBACK_KINDS if not kinds.get(k)]
            if lacking:
                errors.append(f"architecture action {action.id} data-feedback lacks {'、'.join(lacking)} "
                              "(进行中状态、成功结果与去向、失败原因与恢复入口)")
            if APPROVE_RE.search(label) and kinds.get("成功") and not (ID_RE.search(kinds["成功"]) or re.search(
                    r"回到|进入|打开|停留|跳到|返回|下一", kinds["成功"])):
                warnings.append(f"architecture action {action.id} “{label}” success feedback names no destination")
        elif WRITE_RE.search(label) or DESTRUCTIVE_RE.search(label):
            missing_feedback.append(action.id)
        if DESTRUCTIVE_RE.search(label):
            confirm = action.node.get("data-confirm")
            undo = action.node.get("data-undo")
            if "data-confirm" in action.node.attrs and not (confirm or "").strip():
                errors.append(f"architecture action {action.id} has an empty data-confirm")
            if not (confirm or "").strip() and not (undo or "").strip():
                missing_confirm.append(f"{action.id} {label}")
    if missing_feedback:
        warnings.append(f"architecture actions declare no feedback (data-feedback 进行中/成功/失败): {_join(missing_feedback)}")
    if missing_confirm:
        warnings.append("architecture destructive actions declare no confirmation or undo (data-confirm / data-undo): "
                        + _join(missing_confirm))
    # Pages with actions but no interface states.
    bound = set()
    for state in model.states:
        bound.update(_ids(state.get("data-page-ids") + " " + state.get("data-page-id"), "P"))
    bare_pages = [f"{p.id} {p.name}" for p in pages.values()
                  if p.actions and not p.node.get("data-states").strip() and p.id not in bound]
    if bare_pages:
        warnings.append("architecture pages have actions but declare no interface states "
                        "(data-states 加载/空/错误/成功/禁用, or a state with data-page-ids): " + _join(bare_pages))
    # Lists need a next step in the empty state.
    for page in pages.values():
        states = dict((STATE_KINDS.get(k, k), v) for k, v in _items(page.node.get("data-states")))
        has_list = any("列表" in model.components.get(a.component, ("", "", None))[1] for a in page.actions)
        empty = states.get("空", "")
        if has_list and empty and not (ID_RE.search(empty) or re.search(r"去|新建|新增|上传|导入|开始|添加|创建", empty)):
            warnings.append(f"architecture page {page.id} empty state gives no next step: {empty}")
    # Components that do nothing and are not display-only.
    acting = {a.component for a in model.actions.values()}
    for cid, (pid, name, node) in model.components.items():
        if cid not in acting and not node.get("data-display").strip() and not DISPLAY_COMPONENT_RE.search(name):
            warnings.append(f"architecture component {cid} {name} has no action and is not marked display-only (data-display)")


def _parse_values(node) -> list[str]:
    declared = node.get("data-values").strip()
    if declared:
        return split_list(declared)
    if node.tag == "tr":
        cells = _cells(node)
        text = cells[-1] if cells else ""
    else:
        text = _clean(_text(node))
        text = re.split(r"[：:]", text, maxsplit=1)[-1]
    return [v.strip() for v in re.split(r"[、，,;；/]", _strip_ids(text)) if v.strip()]


ORDERED_YES_RE = re.compile(r"^(?:是|有序|true|yes|1|y)$", re.I)
CONFIGURABLE_RE = re.compile(r"^(?:是|否|可|不可|true|false|yes|no|管理员[^;；]*|固定)$", re.I)


def _ordered_findings(node, sid: str, errors: list[str], warnings: list[str]) -> None:
    """A state set with a progress order (stage of a deal, rounds, steps of an order): ``data-ordered`` says the order of ``data-values`` is the order of progress,
    ``data-terminal`` lists the end states (they come last), ``data-configurable`` says whether an administrator may add, stop or reorder values.
    Which colour tells them apart is Luz-Design's (visual-design.html 有序进度状态的色阶); this only checks the function side is written down."""
    if not ORDERED_YES_RE.match(node.get("data-ordered").strip()):
        return
    values = _parse_values(node)
    if len(values) < 2:
        errors.append(f"architecture state {sid} is ordered (data-ordered) but lists {len(values)} value(s): an ordered set has at least two, in the order of progress")
        return
    terminal = split_list(node.get("data-terminal"))
    unknown = [t for t in terminal if t not in values]
    if unknown:
        errors.append(f"architecture state {sid} data-terminal names values that are not in data-values: {'、'.join(unknown)}")
    in_order = [v for v in values if v in terminal]
    first_terminal = min((values.index(v) for v in in_order), default=len(values))
    stray = [v for v in values[first_terminal:] if v not in terminal]
    if stray:
        warnings.append(f"architecture state {sid} is ordered but end states are not last in data-values (after the first end state come: {'、'.join(stray)}): "
                        "list the values in the order of progress with the end states at the end")
    configurable = node.get("data-configurable").strip()
    if not configurable:
        warnings.append(f"architecture state {sid} is ordered but does not say whether an administrator may add, stop or reorder its values (data-configurable 是 / 否)")
    elif not CONFIGURABLE_RE.match(configurable):
        warnings.append(f"architecture state {sid} data-configurable is not 是 / 否 / 管理员可…: {configurable}")


def _state_findings(model: Model, errors: list[str], warnings: list[str]) -> None:
    undeclared = []
    for node in model.states:
        sid = node.get("data-state-id").strip()
        _ordered_findings(node, sid, errors, warnings)
        raw = node.get("data-transitions").strip()
        if not raw:
            undeclared.append(sid)
            continue
        values = _parse_values(node)
        edges = []
        for item in ITEM_SPLIT_RE.split(raw):
            item = item.strip()
            if not item:
                continue
            match = re.fullmatch(r"(.+?)\s*(?:>|→|->)\s*(.+?)\s*(?:@|：|:)\s*(.+)", item)
            if not match:
                errors.append(f"architecture state {sid} transition is not 'from>to@event': {item}")
                continue
            edges.append((match.group(1).strip(), match.group(2).strip(), match.group(3).strip()))
        known = set(values) or {v for e in edges for v in e[:2]}
        for src, dst, _ in edges:
            for value in (src, dst):
                if value != "*" and value not in known:
                    errors.append(f"architecture state {sid} transition names unknown value: {value}")
        initial = node.get("data-initial").strip() or (values[0] if values else "")
        terminal = set(split_list(node.get("data-terminal")))
        wildcard_out = any(src == "*" for src, _, _ in edges)
        for value in values:
            has_in = any(dst == value for _, dst, _ in edges)
            has_out = wildcard_out or any(src == value for src, _, _ in edges)
            if value != initial and not has_in:
                errors.append(f"architecture state {sid} value {value} has no entering event")
            if value not in terminal and not has_out:
                errors.append(f"architecture state {sid} value {value} is a dead state: no leaving event "
                              "(add a transition or list it in data-terminal)")
    if undeclared:
        warnings.append("architecture states declare no transitions (data-transitions 'from>to@event', "
                        "data-terminal for end states): " + _join(undeclared))


def _entity_core_names(name: str) -> list[str]:
    names = [_norm(name)]
    for suffix in ENTITY_SUFFIXES:
        if names[0].endswith(suffix) and len(names[0]) - len(suffix) >= 2:
            names.append(names[0][: -len(suffix)])
    cjk = re.sub(r"[^一-鿿]", "", names[0])
    if len(cjk) >= 4 and cjk == names[0]:
        names.append(cjk[-2:])  # head noun: 项目文件 → 文件
    return [n for n in dict.fromkeys(names) if n]


def _entity_findings(model: Model, errors: list[str], warnings: list[str]) -> None:
    entities = []
    for node in model.entities:
        eid = node.get("data-entity-id").strip()
        name = node.get("data-name").strip()
        if not name:
            cells = _cells(node) if node.tag == "tr" else []
            name = cells[1] if len(cells) > 1 else _name(node, eid)
        entities.append((eid, name, node))
    # Match each action to the entity whose name (or core name) is the longest match in its label, else its component.
    matched: dict[str, list[Action]] = {eid: [] for eid, _, _ in entities}
    for action in model.actions.values():
        label = _norm(action.label)
        component = _norm(model.components.get(action.component, ("", "", None))[1])
        best = None
        for source in (label, component):
            for eid, name, _ in entities:
                for core in _entity_core_names(name):
                    if core in source and (best is None or len(core) > best[1]):
                        best = (eid, len(core))
            if best:
                break
        if best:
            matched[best[0]].append(action)
    for eid, name, node in entities:
        lifecycle = node.get("data-lifecycle").strip()
        if lifecycle:
            declared = {}
            for kind, value in _items(lifecycle):
                canonical = LIFECYCLE_KINDS.get(kind)
                if canonical is None:
                    errors.append(f"architecture entity {eid} data-lifecycle has unknown kind: {kind or value}")
                    continue
                declared[canonical] = value
                for ref in _ids(value, "A"):
                    if ref not in model.actions:
                        errors.append(f"architecture entity {eid} lifecycle {canonical} names unknown action {ref}")
                if not _ids(value, "A") and value.startswith("不提供") and len(SPACE_RE.sub("", value).strip("（）()：:")) <= 3:
                    errors.append(f"architecture entity {eid} lifecycle {canonical} is 不提供 without a reason")
            lacking = [k for k in REQUIRED_LIFECYCLE_KINDS if not declared.get(k)]
            if lacking:
                errors.append(f"architecture entity {eid} {name} data-lifecycle lacks {'、'.join(lacking)} "
                              "(an action ID or 不提供 with a reason)")
            continue
        actions = matched[eid]
        verbs = {"create": [a.id for a in actions if CREATE_VERB_RE.search(a.label)],
                 "view": [a.id for a in actions if VIEW_VERB_RE.search(a.label) or EDIT_VERB_RE.search(a.label)],
                 "edit": [a.id for a in actions if EDIT_VERB_RE.search(a.label)],
                 "delete": [a.id for a in actions if DELETE_VERB_RE.search(a.label)]}
        if not verbs["create"]:
            continue
        lacking = [word for word, key in (("查看", "view"), ("编辑", "edit"), ("删除或归档", "delete")) if not verbs[key]]
        if any(_norm(p.name).find(_entity_core_names(name)[-1]) >= 0 for p in model.pages.values()) and "查看" in lacking:
            lacking.remove("查看")
        if lacking:
            warnings.append(f"architecture entity {eid} {name} can be created ({_join(verbs['create'])}) but has no "
                            f"{'、'.join(lacking)} path; add the action or write data-lifecycle with the reason")


def _flow_findings(model: Model, errors: list[str], warnings: list[str]) -> None:
    missing = []
    for node in model.flows:
        fid = node.get("data-flow-id").strip()
        success = node.get("data-success").strip()
        if not success:
            missing.append(fid)
        for ref in _ids(success, "P"):
            if ref not in model.pages:
                errors.append(f"architecture flow {fid} data-success names unknown page {ref}")
    if missing:
        warnings.append("architecture flows declare no success end (data-success: the page or state where the flow "
                        "ends well): " + _join(missing))


def _design_naming(model: Model, design_root, warnings: list[str]) -> None:
    """The system design must call pages and actions by their architecture names."""
    for node in _iter(design_root):
        pid = node.get("data-page-id").strip()
        aid = node.get("data-action-id").strip()
        if pid and pid in model.pages and not aid and not node.get("data-navigation-id").strip():
            cell = next((a for a in [node, *_ancestors(node)] if a.tag == "td"), None)
            row = cell.parent if cell is not None else None
            if row is None:
                continue
            cells = [c for c in _children(row) if c.tag in {"td", "th"}]
            if cell in cells and cells.index(cell) + 1 < len(cells) and _clean(_text(cell)) == pid:
                said = _norm(_clean(_text(cells[cells.index(cell) + 1])))
                actual = _norm(model.pages[pid].name)
                if said and not ID_RE.search(said) and said != actual:
                    warnings.append(f"system design names {pid} “{said}” but the architecture calls it “{actual}”")
        if aid and aid in model.actions:
            holder = node if _clean(_text(node)) != aid else node.parent
            said = _norm(_clean(_text(holder)).replace(aid, "", 1)) if holder is not None else ""
            actual = _norm(model.actions[aid].label)
            if said and actual and said != actual and not ID_RE.search(said):
                warnings.append(f"system design labels {aid} “{said}” but the architecture calls it “{actual}”")


VISUAL_TERM_RE = re.compile(r"圆角|阴影|渐变|描边|线宽|缓动|字号|字重|行高|栅格|色板|配色|品牌色|毛玻璃")
VISUAL_COLOUR_RE = re.compile(r"#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|(?<![A-Za-z])rgba?\(")


def function_visual_findings(root, label: str) -> list[str]:
    """Warn when a function document (architecture, system design) states visual values: colour, type, radius, shadow,
    stroke, grid and motion belong to Luz-Design (Luz-Design references/ui-ownership.md); the function side writes what
    is needed ("商品卡要有封面图"), not how it looks."""
    hits: list[tuple[list[str], str]] = []
    for node in _iter(root):
        if node.tag in {"script", "style", "code", "pre"}:
            continue
        own = _clean("".join(c for c in node.children if isinstance(c, str)))
        found = sorted(set(VISUAL_TERM_RE.findall(own)))
        if VISUAL_COLOUR_RE.search(own):
            found.append("色值")
        if found:
            hits.append((found, own[:40]))
    if not hits:
        return []
    terms = "、".join(dict.fromkeys(term for found, _ in hits for term in found))
    samples = "；".join(f"“{text}”" for _, text in hits[:3])
    return [f"{label} states visual values ({terms}) in {len(hits)} place(s), which Luz-Design decides "
            f"(Luz-Design references/ui-ownership.md): write what is needed, not how it looks: {samples}"]


def architecture_interaction_findings(root, design_root=None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings) for the interaction logic of a parsed architecture (and optional system design)."""
    errors: list[str] = []
    warnings: list[str] = function_visual_findings(root, "architecture")
    if design_root is not None:
        warnings.extend(function_visual_findings(design_root, "system design"))
    model = build_model(root)
    if not model.pages:
        return errors, list(dict.fromkeys(warnings))
    opt_in = _is_opt_in(model)
    for page in model.pages.values():
        _page_contract(model, page, opt_in, errors)
    missing_contract = [f"{p.id}" for p in model.pages.values()
                        if not any(p.node.get(a).strip() for a in ("data-entry", "data-exit", "data-primary-action"))]
    if missing_contract and not opt_in:
        warnings.append("architecture pages do not yet declare the interaction contract (data-entry, data-goal, "
                        "data-primary-action, data-exit, data-states): " + _join(missing_contract))
    _navigation_findings(model, opt_in, errors, warnings)
    _action_findings(model, errors, warnings)
    _state_findings(model, errors, warnings)
    _entity_findings(model, errors, warnings)
    _flow_findings(model, errors, warnings)
    if design_root is not None:
        _design_naming(model, design_root, warnings)
    return list(dict.fromkeys(errors)), list(dict.fromkeys(warnings))


PARAM_ATTRS = ("data-arg", "data-param", "data-target", "data-value", "data-key", "data-mod-key", "data-id", "aria-controls", "value", "href")
OPTION_ROLES = {"tab", "option", "radio", "switch", "checkbox", "menuitemradio", "menuitemcheckbox"}
ROW_CLASS_RE = re.compile(r"(?:^|[-_\s])(row|item|card|cell|entry|line)(?:$|[-_\s])", re.I)

# The seven run states an agent prototype demonstrates (agent-design.html 二、功能架构 “运行状态”), each marked with
# data-state on its own block; the aliases are the names older pages and the run events use.
AGENT_RUN_STATES = ("排队", "执行中", "等待审批", "失败可重试", "断线重连", "已停止", "完成")
AGENT_STATE_ALIASES = {
    "排队": "排队", "排队中": "排队", "queued": "排队",
    "执行中": "执行中", "运行中": "执行中", "running": "执行中",
    "等待审批": "等待审批", "待审批": "等待审批", "approval": "等待审批",
    "失败可重试": "失败可重试", "失败": "失败可重试", "failed": "失败可重试",
    "断线重连": "断线重连", "重连恢复": "断线重连", "断线重连恢复": "断线重连", "reconnecting": "断线重连",
    "已停止": "已停止", "已取消": "已停止", "cancelled": "已停止",
    "完成": "完成", "已完成": "完成", "completed": "完成",
}
ELAPSED_RE = re.compile(r"(?:^|[-_\s])elapsed(?:$|[-_\s])", re.I)


def _agent_state(node) -> str:
    return AGENT_STATE_ALIASES.get(node.get("data-state").strip().casefold(), "") if node.get("data-state").strip() else ""


def prototype_interaction_findings(root) -> tuple[list[str], list[str]]:
    """One visible entry per action and page: the same data-action-id twice on one page is an error unless the copies
    sit in repeated list rows or in alternative scenario states (data-state-kind, data-scenario, or one of the agent
    run states in data-state); two different actions with the same text on one page are a warning (the DOM cannot
    tell which dialogs are open). A button inside a dialog (<dialog>, role=dialog or alertdialog) is a step of the
    action that opened it, such as the 保存 of an edit dialog bound to the edit action: it is counted within its
    dialog, not as a second entry on the page."""
    errors: list[str] = []
    warnings: list[str] = []
    per_page: dict[tuple, int] = {}
    labels: dict[tuple[str, str], set[str]] = {}
    for node in _iter(root):
        aid = node.get("data-action-id").strip()
        pid = node.get("data-page-id").strip()
        if not aid or not pid or node.tag not in {"button", "a"} and node.get("role") != "button":
            continue
        chain = [node, *_ancestors(node)]
        if any(a.tag in {"template", "script"} or "hidden" in a.attrs or a.get("aria-hidden") == "true"
               or a.get("data-state-kind").strip() or a.get("data-scenario").strip() or _agent_state(a) for a in chain):
            continue
        if any(a.tag in {"tr", "li"} or a.get("data-row-id").strip() or a.get("data-item-id").strip()
               or ROW_CLASS_RE.search(a.get("class")) for a in chain[1:]):
            continue
        text = _norm(_clean(_text(node)) or node.get("aria-label"))
        # One action with a parameter per option (tabs, segmented options, switch lists) is one entry per parameter.
        param = next((node.get(a).strip() for a in PARAM_ATTRS if node.get(a).strip()), "")
        if not param and node.get("role") in OPTION_ROLES:
            param = text
        dialog = next((a for a in chain[1:] if a.tag == "dialog" or a.get("role") in {"dialog", "alertdialog"}), None)
        scope = id(dialog) if dialog is not None else 0
        per_page[(pid, aid, param, scope)] = per_page.get((pid, aid, param, scope), 0) + 1
        if text and dialog is None:
            labels.setdefault((pid, text), set()).add(aid)
    for (pid, aid, param, scope), count in sorted(per_page.items()):
        if count > 1:
            errors.append(f"interactive-prototype shows {aid}{' (' + param + ')' if param else ''} {count} times on {pid}"
                          f"{' in one dialog' if scope else ''}; one visible entry per action (list rows excepted)")
    for (pid, text), ids in sorted(labels.items()):
        if len(ids) > 1:
            warnings.append(f"interactive-prototype {pid} has buttons with the same text “{text}” for different actions: "
                            + _join(sorted(ids)))
    return errors, warnings


def is_agent_prototype(root) -> bool:
    """A prototype shows an agent when it marks a block data-surface="agent" / data-agent-run or uses run-state blocks."""
    return any(node.get("data-surface").strip().casefold() == "agent" or "data-agent-run" in node.attrs or _agent_state(node)
               for node in _iter(root))


def prototype_agent_state_findings(root, expected: bool = False) -> list[str]:
    """Warnings for an agent prototype (agent-design.html 运行状态, 耗时与进度, 错误、降级与恢复): each of the seven run
    states is demonstrated in its own data-state block; 执行中 shows per-step elapsed time and a stop control; 排队 can
    be cancelled; 等待审批 offers more than one decision; 失败可重试 offers a retry and a copyable request number.
    ``expected`` is True when the session works from the agent rule cards even if the page carries no marker yet."""
    if not expected and not is_agent_prototype(root):
        return []
    blocks: dict[str, list] = {}
    for node in _iter(root):
        state = _agent_state(node)
        if state:
            blocks.setdefault(state, []).append(node)
    warnings: list[str] = []
    missing = [s for s in AGENT_RUN_STATES if s not in blocks]
    if missing:
        warnings.append("interactive-prototype agent part does not demonstrate the run states "
                        + "、".join(missing) + " (mark one block per state with data-state; agent-design.html 运行状态)")

    def buttons(state: str) -> list:
        return [n for b in blocks.get(state, []) for n in _iter(b) if n.tag == "button" or n.get("role") == "button"]

    def text(state: str) -> str:
        return "".join(_clean(_text(b)) for b in blocks.get(state, []))

    if "执行中" in blocks:
        timed = any(n.get("data-elapsed").strip() or "data-elapsed" in n.attrs or ELAPSED_RE.search(n.get("class"))
                    for b in blocks["执行中"] for n in [b, *_iter(b)])
        if not timed:
            warnings.append("interactive-prototype agent state 执行中 shows no elapsed time (each step, each stage and the "
                            "total carry a timer marked data-elapsed; agent-design.html 耗时与进度)")
        if not any("停止" in _clean(_text(n)) for n in buttons("执行中")):
            warnings.append("interactive-prototype agent state 执行中 has no 停止 control")
    if "排队" in blocks and not buttons("排队"):
        warnings.append("interactive-prototype agent state 排队 has no cancel control")
    if "等待审批" in blocks and len(buttons("等待审批")) < 2:
        warnings.append("interactive-prototype agent state 等待审批 offers fewer than two decisions (批准、修改、拒绝、我来处理)")
    if "失败可重试" in blocks:
        if not buttons("失败可重试"):
            warnings.append("interactive-prototype agent state 失败可重试 has no retry control")
        if "请求编号" not in text("失败可重试"):
            warnings.append("interactive-prototype agent state 失败可重试 shows no copyable 请求编号")
    return warnings


# ---------------------------------------------------------------------------------------------------------------------
# Front-end behaviour checks on a prototype (warnings only: they are inferred from markup, scripts and CSS).
# Rules: agent-design.html 五、组件 “输入区状态机”; ui-standards.html 五、组件 “切换类控件”“列表变更与动画”“卡片交互动画”;
# admin-design.html 五、组件 “表格列宽、冻结与滚动”; visual-design.html “动效细则”“表格列宽与行高”.
# ---------------------------------------------------------------------------------------------------------------------
COMPOSER_CLASS_RE = re.compile(r"(?:^|[-_\s])composer(?:$|[-_\s])", re.I)
# data-composer-state -> the actions the single primary button may carry in that state (data-composer-action).
COMPOSER_STATES = {
    "idle": {"voice", "send"},           # nothing typed, nothing running: the voice entry, or a disabled send
    "draft": {"send"},                    # text or an attachment is ready
    "running": {"stop"},                  # a run is going and the box is empty
    "running-draft": {"queue", "send"},   # a run is going and something new is typed: send joins the queue
    "uploading": {"send"},                # a file is uploading: send stays disabled until it ends
    "composing": {"send", "voice", "stop", "queue"},  # IME composition: the button keeps the state it had
}
COMPOSER_ACTION_LABEL = {"send": "发送", "queue": "发送", "stop": "停止", "voice": "语音"}
MAIN_LABEL_RE = re.compile(r"^(?:发送|停止)(?:生成|回复|运行|任务)?$")
KEY_HANDLER_RE = re.compile(r"keydown|keypress|onkeydown|onkeypress", re.I)
IME_GUARD_RE = re.compile(r"isComposing|compositionstart|compositionend|\b229\b|composing", re.I)
COMPOSER_CSS_RE = re.compile(r"composer|send|stop|primary", re.I)
TIME_RE = re.compile(r"(\d*\.?\d+)\s*(ms|s)\b")
LAYOUT_PROPS = ("width", "min-width", "max-width", "left", "right", "top", "bottom", "margin", "margin-left", "margin-right",
                "margin-top", "margin-bottom", "padding", "padding-left", "padding-right", "padding-top", "padding-bottom")
SCROLL_CLASS_RE = re.compile(r"scroll|table-wrap|overflow|x-auto", re.I)
WIDE_TABLE_COLUMNS = 6


def _hidden(node) -> bool:
    return any(a.tag in {"template", "script"} or "hidden" in a.attrs or a.get("aria-hidden") == "true"
               or re.search(r"display\s*:\s*none", a.get("style"), re.I) is not None for a in [node, *_ancestors(node)])


def _name_of(node) -> str:
    return _clean(node.get("aria-label")) or _clean(_text(node))


def _buttons(scope) -> list:
    return [n for n in _iter(scope) if (n.tag == "button" or n.get("role") == "button") and not _hidden(n)]


def _seconds(value: str) -> list[float]:
    return [float(n) / (1000 if unit == "ms" else 1) for n, unit in TIME_RE.findall(value)]


def _is_text_field(node) -> bool:
    return node.tag in {"textarea", "input"} or node.get("contenteditable") in {"", "true"}


def prototype_composer_findings(root) -> list[str]:
    """Warnings for an input box that sends messages (agent-design.html 输入区状态机): the send, stop and voice entries share
    ONE primary button in one place (data-composer-primary) that changes with the box state (data-composer-state: idle,
    draft, running, running-draft, uploading, composing) instead of two buttons side by side; its label and action agree
    (data-composer-action: send, queue, stop, voice); a status region (aria-live or role=status) announces the change;
    Enter handlers ignore IME composition; the button swap takes no longer than 150 ms; the prototype shows more than one
    state. Silent unless a block is marked data-composer (or has a composer class) and holds a text input."""
    from validate_session import _css_rules, css_text, text_content_direct
    composers = [n for n in _iter(root) if ("data-composer" in n.attrs or COMPOSER_CLASS_RE.search(n.get("class")))
                 and not _hidden(n) and any(_is_text_field(c) for c in _iter(n))]
    if not composers:
        return []
    warnings: list[str] = []
    states: set[str] = set()
    live_anywhere = any(n.get("aria-live").strip() or n.get("role") == "status" for n in _iter(root))
    for composer in composers:
        state = composer.get("data-composer-state").strip()
        if state:
            states.add(state)
        if state and state not in COMPOSER_STATES:
            warnings.append(f"interactive-prototype composer state “{state}” is not one of {', '.join(COMPOSER_STATES)}")
        primaries = [b for b in _buttons(composer) if "data-composer-primary" in b.attrs]
        if len(primaries) != 1:
            warnings.append(f"interactive-prototype composer has {len(primaries)} primary buttons (data-composer-primary); "
                            "send, stop and voice share exactly one button in one place")
        main_labels = [b for b in _buttons(composer) if MAIN_LABEL_RE.match(_clean(_text(b)) or b.get("aria-label").strip())]
        if len(main_labels) > 1:
            warnings.append("interactive-prototype composer shows " + "、".join(_name_of(b) for b in main_labels)
                            + " as separate buttons at the same time; merge them into one same-position button that switches by state")
        for primary in primaries[:1]:
            action = primary.get("data-composer-action").strip()
            name = _name_of(primary)
            if not name:
                warnings.append("interactive-prototype composer primary button has no accessible name (aria-label or text)")
            if action not in COMPOSER_ACTION_LABEL:
                warnings.append("interactive-prototype composer primary button has no data-composer-action (send, queue, stop or voice)")
            elif name and COMPOSER_ACTION_LABEL[action] not in name:
                warnings.append(f"interactive-prototype composer primary button carries {action} but is labelled “{name}”: label and action must agree")
            if state in COMPOSER_STATES and action in COMPOSER_ACTION_LABEL and action not in COMPOSER_STATES[state]:
                warnings.append(f"interactive-prototype composer state {state} cannot carry the {action} action "
                                f"(allowed: {', '.join(sorted(COMPOSER_STATES[state]))})")
            if state == "uploading" and primary.get("aria-disabled") != "true" and "disabled" not in primary.attrs:
                warnings.append("interactive-prototype composer state uploading must disable send (aria-disabled or disabled)")
        field = next((c for c in _iter(composer) if _is_text_field(c)), None)
        if field is not None and not (field.get("aria-label").strip() or field.get("aria-labelledby").strip()
                                      or field.get("placeholder").strip()):
            warnings.append("interactive-prototype composer input has no accessible name (aria-label or placeholder)")
        if not live_anywhere:
            warnings.append("interactive-prototype composer has no status region (aria-live or role=status) that announces the send/stop change")
            live_anywhere = True
    scripts = "\n".join(text_content_direct(n) for n in _iter(root) if n.tag == "script")
    if KEY_HANDLER_RE.search(scripts) and re.search(r"Enter|\b13\b", scripts) and not IME_GUARD_RE.search(scripts):
        warnings.append("interactive-prototype composer handles Enter without checking IME composition "
                        "(isComposing / compositionstart / compositionend): the Enter that confirms a candidate must not send")
    if len(states) < 2 and not re.search(r"composerState|data-composer-state", scripts):
        warnings.append("interactive-prototype composer shows one state only; demonstrate the switch (idle, draft, running, "
                        "running-draft) with a script that sets data-composer-state or one marked block per state")
    for selector, declarations, _ in _css_rules(css_text(root)):
        if COMPOSER_CSS_RE.search(selector):
            for m in re.finditer(r"transition(?:-duration)?\s*:\s*([^;}{]+)", declarations, re.I):
                if any(s > 0.15 for s in _seconds(m.group(1))):
                    warnings.append(f"interactive-prototype composer rule “{selector.strip()[:40]}” has a transition longer than 150 ms")
                    break
    return list(dict.fromkeys(warnings))


def prototype_motion_findings(root) -> list[str]:
    """Warnings for motion in a prototype (visual-design.html 动效细则; ui-standards.html 列表变更与动画): any transition or
    animation needs a prefers-reduced-motion branch; no `transition: all`; entering, hovering and pressing move with
    transform and opacity, not with width, margin, padding or position (height and grid rows may animate a collapse);
    an interface animation stays within 1.2 s (endless spinners and skeleton shimmer excepted)."""
    from validate_session import _css_rules, css_text
    style = css_text(root)
    if not style.strip():
        return []
    warnings: list[str] = []
    motion = (re.search(r"(?<![-\w])(?:transition|animation)(?:-[a-z]+)?\s*:\s*(?!none\b|0s?\b)[^;}{]*\S", style, re.I)
              or "@keyframes" in style)
    if motion and "prefers-reduced-motion" not in style:
        warnings.append("interactive-prototype uses transition or animation without a prefers-reduced-motion branch "
                        "(@media (prefers-reduced-motion: reduce) turns moves into fades or plain switches)")
    for selector, declarations, _ in _css_rules(style):
        for m in re.finditer(r"(?<![-\w])transition(?:-property)?\s*:\s*([^;}{]+)", declarations, re.I):
            value = re.sub(r"\([^)]*\)", "", m.group(1).lower())
            names = set(re.findall(r"(?<![-\w.])([a-z][a-z-]*)(?![\w-])", value))
            if "all" in names:
                warnings.append(f"interactive-prototype “{selector.strip()[:40]}” uses transition: all; list the properties (transform, opacity, colours)")
            bad = [p for p in LAYOUT_PROPS if p in names]
            if bad:
                warnings.append(f"interactive-prototype “{selector.strip()[:40]}” animates {', '.join(bad)} (triggers layout); "
                                "move with transform and opacity")
        for m in re.finditer(r"(?<![-\w])animation(?:-duration)?\s*:\s*([^;}{]+)", declarations, re.I):
            value = m.group(1)
            if "infinite" in value.lower():
                continue
            if any(s > 1.2 for s in _seconds(value)[:1]):
                warnings.append(f"interactive-prototype “{selector.strip()[:40]}” runs an animation longer than 1.2 s")
    return list(dict.fromkeys(warnings))


def prototype_table_findings(root) -> list[str]:
    """Warnings for wide tables (admin-design.html 表格列宽、冻结与滚动; visual-design.html 表格列宽与行高): a table with six or
    more columns declares how its columns take width (colgroup widths, data-col-strategy, or CSS table-layout / column
    widths), and a table with eight or more columns sits in a horizontal scroll container."""
    from validate_session import css_text
    style = css_text(root)
    css_strategy = re.search(r"table-layout\s*:", style, re.I) is not None or re.search(
        r"(?:^|[\s,}])(?:th|td|col)(?:[\s.#:\[,{][^{}]*)?\{[^{}]*(?:min-width|max-width|width)\s*:", style, re.I) is not None
    warnings: list[str] = []
    for table in _iter(root):
        if table.tag != "table" or _hidden(table):
            continue
        rows = [r for r in _iter(table) if r.tag == "tr"]
        columns = max((len(_cells(r)) for r in rows), default=0)
        if columns < WIDE_TABLE_COLUMNS:
            continue
        label = _clean(_text(rows[0]))[:20] if rows else "table"
        chain = [table, *_ancestors(table)]
        declared = (any(n.get("data-col-strategy").strip() for n in chain)
                    or any(c.tag == "col" and (c.get("width").strip() or "width" in c.get("style") or c.get("data-col").strip())
                           for c in _iter(table))
                    or "table-layout" in table.get("style") or css_strategy)
        if not declared:
            warnings.append(f"interactive-prototype table “{label}” has {columns} columns but no column-width strategy "
                            "(colgroup widths, data-col-strategy, table-layout or column widths)")
        if columns >= WIDE_TABLE_COLUMNS + 2:
            scrolls = any(SCROLL_CLASS_RE.search(n.get("class")) or re.search(r"overflow(?:-x)?\s*:\s*(?:auto|scroll)", n.get("style"), re.I)
                          or n.get("data-scroll").strip() for n in chain[1:])
            if not scrolls:
                warnings.append(f"interactive-prototype table “{label}” has {columns} columns and no horizontal scroll container")
    return list(dict.fromkeys(warnings))


def prototype_toggle_findings(root) -> list[str]:
    """Warnings for two-state controls (ui-standards.html 切换类控件): a role=switch carries aria-checked; a button that
    shows its state with aria-pressed keeps one name (a pair such as 收藏 / 取消收藏 on the same control is a rename)."""
    warnings: list[str] = []
    for node in _iter(root):
        if _hidden(node):
            continue
        if node.get("role") == "switch" and node.get("aria-checked") not in {"true", "false"}:
            warnings.append(f"interactive-prototype switch “{_name_of(node)[:20]}” has no aria-checked")
        if "aria-pressed" in node.attrs and not _name_of(node):
            warnings.append("interactive-prototype toggle button with aria-pressed has no accessible name")
        if node.get("aria-pressed") in {"true", "false"} and re.search(r"取消|已", node.get("aria-label")):
            warnings.append(f"interactive-prototype toggle “{node.get('aria-label')[:20]}” renames itself and also sets aria-pressed; "
                            "keep one label with aria-pressed, or name the next action and drop aria-pressed")
    return list(dict.fromkeys(warnings))


def prototype_behavior_findings(root) -> list[str]:
    """All front-end behaviour warnings of a prototype (composer, motion, wide tables, two-state controls)."""
    return [*prototype_composer_findings(root), *prototype_motion_findings(root),
            *prototype_table_findings(root), *prototype_toggle_findings(root)]


def main(argv: list[str] | None = None) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from validate_session import ARCHITECTURE_PATH, PROTOTYPE_PATH, SYSTEM_DESIGN_PATH, parse_html

    parser = argparse.ArgumentParser(description="Check the interaction logic of a Luz System session (read-only).")
    parser.add_argument("target", help="session folder, or an architecture HTML file")
    parser.add_argument("--design", help="system design HTML to compare names with")
    args = parser.parse_args(argv)
    target = Path(args.target).resolve()
    raw = target / "raw" if (target / "raw").is_dir() else target
    architecture = raw / ARCHITECTURE_PATH if target.is_dir() else target
    design = Path(args.design) if args.design else (raw / SYSTEM_DESIGN_PATH if target.is_dir() else None)
    prototype = raw / PROTOTYPE_PATH if target.is_dir() else None
    parse_errors: list[str] = []
    root = parse_html(architecture, parse_errors) if architecture.is_file() else None
    if root is None and not (prototype and prototype.is_file()):
        print(f"FAIL: no readable architecture at {architecture}")
        return 1
    errors: list[str] = []
    warnings: list[str] = []
    if root is not None:
        design_root = parse_html(design, parse_errors) if design and design.is_file() else None
        errors, warnings = architecture_interaction_findings(root, design_root)
    if prototype and prototype.is_file():
        proto_root = parse_html(prototype, parse_errors)
        if proto_root is not None:
            p_errors, p_warnings = prototype_interaction_findings(proto_root)
            errors += p_errors
            warnings += p_warnings
            agent_cards = any((raw / "00-rules" / f"{kind}.md").is_file() for kind in ("agent-ui", "agent-runtime-ui"))
            warnings += prototype_agent_state_findings(proto_root, expected=agent_cards)
            warnings += prototype_behavior_findings(proto_root)
    for warning in warnings:
        print("WARN", warning)
    for error in errors:
        print("ERROR", error)
    print(f"{'FAIL' if errors else 'PASS'}: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
