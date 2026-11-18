"""把 plan.json 渲染成硬件选型清单 HTML（含系统连接图）。

用法：
  py -X utf8 scripts/hw_render_plan.py <plan.json> <out.html> [--force]

生成前检查会话或项目 architecture 阶段的 Crawl；--force 只跳过方案结构校验，不能跳过前置检索。
先运行 hw_plan_lib.validate；有错误时停止（--force 仅用于调试，交付前必须零错误）。
版式遵循 Luz-Design references/file-design.html 的网页文件规则：
唯一 h1、各节以 h2 开头、单字体族、浅色、一个主色、字重 400/600（22 像素以上的标题 700）。
文字层级（h1–h6、正文、表格、辅助字的字号、行高、间距）读取 Luz-Design 母本 references/md-type.css 的文本直接拼进页面：
桌面（768 像素及以上）正文 18，手机 16；不在这里另写标题与正文的字号。
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hw_plan_lib as pl  # noqa: E402
from new_session import pick_icon, tab_icon_href  # noqa: E402
from hw_crawl_gate import generation_errors, session_for_plan, template_binding  # noqa: E402

E = lambda s: html.escape(str(s if s is not None else ""), quote=True)  # noqa: E731

ACCENT = {"brand": "#0958D9", "hover": "#003EB3", "tint": "#E6F4FF", "line": "#91CAFF"}
MD_TYPE = Path(__file__).resolve().parents[2] / "Luz-Design" / "references" / "md-type.css"


def md_type_css() -> str:
    """Markdown 层级样式，读 Luz-Design 母本（与硬件方案模板同属模板 hardware-plan）。整段文本作为 format 的参数传入，不经过花括号加倍。"""
    return MD_TYPE.read_text(encoding="utf-8")


REFERENCE_PRICE_NOTE = "参考价来自公开页面，非报价；下单前以供应商报价为准。"


# ---------------------------------------------------------------- 连接图

def text_w(s: str) -> float:
    return sum(14 if ord(c) > 0x2E80 else 8 for c in str(s))


def build_diagram(plan: dict) -> str:
    devs = pl.device_map(plan)
    zones = {z["id"]: z for z in plan["zones"]}
    by_tier: dict[str, list] = defaultdict(list)
    for d in plan["devices"]:
        by_tier[d["tier"]].append(d)

    node_h, gap_y, zone_head, zone_pad = 56, 12, 34, 12
    top = 48

    # 现场设备按区域分组，分到 1–2 列
    field = by_tier.get("field", [])
    groups: dict[str, list] = defaultdict(list)
    order = []
    for d in field:
        z = d.get("zone") or "_"
        if z not in groups:
            order.append(z)
        groups[z].append(d)
    ncols = 1  # 单列：跨列连线不会穿过其他节点
    col_groups = [[] for _ in range(ncols)]
    col_h = [0] * ncols

    def group_h(n: int) -> int:
        return zone_head + n * (node_h + gap_y) - gap_y + zone_pad

    for z in order:
        i = col_h.index(min(col_h))
        col_groups[i].append(z)
        col_h[i] += group_h(len(groups[z])) + 20

    def label_lines(d):
        sub = " ".join(x for x in (d.get("brand"), d.get("model")) if x) or d.get("specs", "")
        name = d["name"] + (f" ×{d['qty']}" if d.get("qty", 1) != 1 else "")
        return name, sub

    def col_width(nodes):
        w = 200
        for d in nodes:
            a, b = label_lines(d)
            w = max(w, text_w(a) + 28, text_w(b) + 28)
        return int(w)

    columns = []  # (tier, width, nodes)
    for i in range(ncols):
        nodes = [d for z in col_groups[i] for d in groups[z]]
        columns.append(("field", col_width(nodes), nodes, col_groups[i]))
    # 右侧各列按相邻节点的平均行序排序（重心法），减少交叉
    rank = {d["id"]: i for i, d in enumerate(columns[0][2])}
    nbrs: dict[str, list] = defaultdict(list)
    for l in plan["links"]:
        if l.get("diagram", True):
            nbrs[l["from"]].append(l["to"])
            nbrs[l["to"]].append(l["from"])
    for tier in ("edge", "cloud", "client"):
        nodes = by_tier.get(tier)
        if not nodes:
            continue
        def bary(d):
            ys = [rank[n] for n in nbrs[d["id"]] if n in rank]
            return sum(ys) / len(ys) if ys else 1e9
        nodes = sorted(nodes, key=bary)
        rank.update({d["id"]: (bary(d) if bary(d) < 1e9 else 1e6) + i * 1e-3 for i, d in enumerate(nodes)})
        columns.append((tier, col_width(nodes), nodes, None))

    gap_x, left = 170, 120
    pos = {}
    col_x, col_w, col_bottom = [], [], []
    x = left
    svg_parts = []
    heads = []
    max_y = 0
    for ci, (tier, w, nodes, zlist) in enumerate(columns):
        title = pl.TIER_NAMES[tier] if not (tier == "field" and ci > 0) else ""
        if title:
            heads.append(f'<text class="dg-head" x="{x}" y="24">{E(title)}</text>')
        y = top
        if tier == "field":
            for z in zlist:
                members = groups[z]
                gh = group_h(len(members))
                zname = zones.get(z, {}).get("name", "") if z != "_" else ""
                svg_parts.append(f'<rect class="dg-zone" x="{x - 10}" y="{y}" width="{w + 20}" height="{gh}" rx="8"/>')
                svg_parts.append(f'<text class="dg-zname" x="{x}" y="{y + 23}">{E(zname)}</text>')
                ny = y + zone_head
                for d in members:
                    pos[d["id"]] = (x, ny, w, ci)
                    ny += node_h + gap_y
                y += gh + 20
        else:
            for d in nodes:
                pos[d["id"]] = (x, y, w, ci)
                y += node_h + gap_y + 8
        max_y = max(max_y, y)
        col_x.append(x); col_w.append(w); col_bottom.append(y)
        x += w + gap_x
    width = x - gap_x + 40
    height = max_y + 24

    # 边
    edge_parts, badge_parts = [], []
    badges: list[tuple[float, float]] = []
    side_count: dict[tuple, int] = defaultdict(int)
    max_lane = [0.0]

    def bez(p0, p1, p2, p3, t):
        mt = 1 - t
        return (mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1])

    for link in plan["links"]:
        if not link.get("diagram", True):
            continue
        a, b = pos.get(link["from"]), pos.get(link["to"])
        if not a or not b:
            continue
        ax, ay, aw, ac = a
        bx, by, bw, bc = b
        acy, bcy = ay + node_h / 2, by + node_h / 2
        span = abs(bc - ac)
        if span > 1:
            # 跨列：沿列间空隙走，绕过中间列底部，避免穿过节点
            lo, hi = sorted((ac, bc))
            k = side_count[("lane", lo, hi)]
            side_count[("lane", lo, hi)] += 1
            lane = max(col_bottom[lo + 1:hi]) + 14 + k * 12
            sx, ex = (ax + aw, bx) if ac < bc else (ax, bx + bw)
            g1 = (col_x[lo] + col_w[lo] + col_x[lo + 1]) / 2 + (k % 3) * 8 if ac < bc else (col_x[hi - 1] + col_w[hi - 1] + col_x[hi]) / 2 - (k % 3) * 8
            g2 = (col_x[hi - 1] + col_w[hi - 1] + col_x[hi]) / 2 - (k % 3) * 8 if ac < bc else (col_x[lo] + col_w[lo] + col_x[lo + 1]) / 2 + (k % 3) * 8
            pts = [(sx, acy), (g1, acy), (g1, lane), (g2, lane), (g2, bcy), (ex, bcy)]
            d = "M" + " L".join(f"{px:.1f},{py:.1f}" for px, py in pts)
            cls = {"data": "dg-data", "signal": "dg-signal", "power": "dg-power"}[link["kind"]]
            mk = ' marker-end="url(#arr)"'
            if link.get("direction") == "↔":
                mk += ' marker-start="url(#arr)"'
            elif link.get("direction") == "←":
                mk = ' marker-start="url(#arr)"'
            edge_parts.append(f'<path class="{cls} dg-route" d="{d}"{mk}><title>{E(link["no"])}</title></path>')
            bx_, by_ = (g1 + g2) / 2, lane
            for dx in (0, 30, -30, 60, -60):
                if all((bx_ + dx - x0) ** 2 + (by_ - y0) ** 2 > 24 ** 2 for x0, y0 in badges):
                    bx_ += dx
                    break
            badges.append((bx_, by_))
            badge_parts.append(f'<g class="dg-badge"><circle cx="{bx_:.1f}" cy="{by_:.1f}" r="11"/>'
                               f'<text x="{bx_:.1f}" y="{by_ + 5:.1f}">{E(link["no"])}</text></g>')
            max_lane[0] = max(max_lane[0], lane)
            continue
        if ac == bc:
            k = side_count[(ac, "L")]
            side_count[(ac, "L")] += 1
            off = 16 + (k % 5) * 9
            p0, p3 = (ax, acy), (bx, bcy)
            p1, p2 = (ax - off * 2, acy), (bx - off * 2, bcy)
        elif ac < bc:
            p0, p3 = (ax + aw, acy), (bx, bcy)
            dx = (p3[0] - p0[0]) * 0.5
            p1, p2 = (p0[0] + dx, p0[1]), (p3[0] - dx, p3[1])
        else:
            p0, p3 = (ax, acy), (bx + bw, bcy)
            dx = (p0[0] - p3[0]) * 0.5
            p1, p2 = (p0[0] - dx, p0[1]), (p3[0] + dx, p3[1])
        cls = {"data": "dg-data", "signal": "dg-signal", "power": "dg-power"}[link["kind"]]
        mk = ' marker-end="url(#arr)"'
        if link.get("direction") == "↔":
            mk += ' marker-start="url(#arr)"'
        elif link.get("direction") == "←":
            mk = ' marker-start="url(#arr)"'
        d = f"M{p0[0]:.1f},{p0[1]:.1f} C{p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f}"
        edge_parts.append(f'<path class="{cls}" d="{d}"{mk}><title>{E(link["no"])}</title></path>')
        for t in (0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.45, 0.55, 0.35, 0.65):
            bx_, by_ = bez(p0, p1, p2, p3, t)
            if all((bx_ - x0) ** 2 + (by_ - y0) ** 2 > 24 ** 2 for x0, y0 in badges):
                break
        badges.append((bx_, by_))
        badge_parts.append(f'<g class="dg-badge"><circle cx="{bx_:.1f}" cy="{by_:.1f}" r="11"/>'
                           f'<text x="{bx_:.1f}" y="{by_ + 5:.1f}">{E(link["no"])}</text></g>')

    height = max(height, int(max_lane[0]) + 30)
    node_parts = []
    for did, (x0, y0, w, ci) in pos.items():
        d = devs[did]
        name, sub = label_lines(d)
        cls = "dg-node" + (" dg-opt" if d.get("level") == "可选" else "") + (" dg-site" if d.get("site") else "")
        if d.get("site"):
            sub = "现场提供"
        node_parts.append(
            f'<g class="{cls}"><rect x="{x0}" y="{y0}" width="{w}" height="{node_h}" rx="6"/>'
            f'<text class="dg-name" x="{x0 + 12}" y="{y0 + 23}">{E(name)}</text>'
            f'<text class="dg-sub" x="{x0 + 12}" y="{y0 + 44}">{E(sub)}</text></g>')

    svg = (f'<svg class="diagram" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" '
           f'aria-label="{E(plan["title"])}系统连接图">'
           '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
           'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-arrow"/></marker></defs>'
           + "".join(heads) + "".join(svg_parts) + "".join(edge_parts) + "".join(node_parts)
           + "".join(badge_parts) + "</svg>")
    legend = ('<div class="legend"><span><i class="lg-data"></i>网络数据</span>'
              '<span><i class="lg-signal"></i>信号线（韦根、485、干接点、继电器）</span>'
              '<span><i class="lg-power"></i>供电</span><span><i class="lg-opt"></i>可选设备</span><span><i class="lg-site"></i>现场提供（不在采购范围）</span>'
              '<span><b class="lg-badge">1</b>链路编号，对应下表</span></div>')
    return f'<div class="scroll">{svg}</div>{legend}'


# ---------------------------------------------------------------- 表格

def table(headers, rows, cls=None, align=None) -> str:
    """align: 每列 'c'（居中）或 'l'（左对齐，长文本）。"""
    align = align or ["c"] * len(headers)
    th = "".join(f"<th>{E(h)}</th>" for h in headers)
    body = []
    for r in rows:
        tds = []
        for i, cell in enumerate(r):
            if isinstance(cell, tuple):  # (html, rowspan)
                content, span = cell
                if span == 0:
                    continue
                tds.append(f'<td class="{align[i]}" rowspan="{span}">{content}</td>')
            else:
                tds.append(f'<td class="{align[i]}">{cell}</td>')
        body.append("<tr>" + "".join(tds) + "</tr>")
    c = f' class="{cls}"' if cls else ""
    return f'<div class="scroll"><table{c}><thead><tr>{th}</tr></thead><tbody>{"".join(body)}</tbody></table></div>'


def conclusion(plan, key) -> str:
    text = plan["conclusions"].get(key)
    return f'<div class="conclusion">{E(text)}</div>' if text else ""


def dev_names(plan, ids) -> str:
    devs = pl.device_map(plan)
    return "、".join(E(devs[i]["name"]) for i in ids if i in devs)


SKILL_DIR = Path(__file__).resolve().parent.parent

# 模块：清单按业务模块分组；每个模块一个线性图标（内联 SVG，描边用主色）
MODULE_ORDER = ["门禁通行", "人流监控", "动火离人", "视频感知", "求助广播", "智能电控", "业务终端", "边缘网关", "控制模块"]
ICONS = {
    "门禁通行": '<rect x="5" y="3" width="14" height="18" rx="1.5"/><circle cx="15" cy="12" r="1"/>',
    "人流监控": '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M12 20c0-3.3 1.8-6 4-6s6 2.7 6 6"/>',
    "动火离人": '<path d="M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 3 3 3 5"/>',
    "视频感知": '<rect x="2" y="7" width="14" height="10" rx="2"/><path d="M16 11l6-3v8l-6-3"/>',
    "求助广播": '<path d="M4 10v4h4l6 4V6L8 10H4z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
    "智能电控": '<path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z"/>',
    "业务终端": '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M8 10h1M15 10h1"/>',
    "边缘网关": '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h.01M11 12h.01M15 12h4"/>',
    "控制模块": '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
}
DEFAULT_ICON = '<circle cx="12" cy="12" r="8"/>'


def icon(name: str, size: int = 24) -> str:
    return (f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true">'
            f'{ICONS.get(name, DEFAULT_ICON)}</svg>')


_IMG_CACHE: dict = {}


def image_data(d: dict, size: int | None = None) -> str | None:
    """设备图：plan 里的 image，否则经验库 images/<experience_id>.jpg；内嵌为 base64。size 给缩略图（像素边长）。"""
    import base64
    import io
    cands = []
    if d.get("image"):
        cands.append(Path(d["image"]))
    if d.get("experience_id"):
        cands.append(SKILL_DIR / "experience" / "hardware" / "images" / f"{d['experience_id']}.jpg")
    for p in cands:
        if p.exists():
            key = (str(p), size)
            if key not in _IMG_CACHE:
                raw = p.read_bytes()
                if size:
                    from PIL import Image
                    im = Image.open(io.BytesIO(raw)).convert("RGB")
                    im.thumbnail((size, size))
                    buf = io.BytesIO()
                    im.save(buf, "JPEG", quality=80)
                    raw = buf.getvalue()
                _IMG_CACHE[key] = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
            return _IMG_CACHE[key]
    return None


THUMB = {"pic": None, "tp": 96, "tm": 72}


def photo(d: dict, cls: str) -> str:
    """卡片用原图（480），系统方案与对照表用 96/72 像素缩略图，避免重复内嵌大图。"""
    data = image_data(d, THUMB.get(cls))
    if data:
        return f'<img class="{cls} ph" src="{data}" alt="{E(d["name"])}实物图">'
    return f'<span class="{cls} ph none">{icon(d.get("category", ""), 32)}</span>'


def chips(items, cls="chip") -> str:
    return "".join(f'<span class="{cls}">{E(x)}</span>' for x in items if x)


def highlights(d: dict) -> list[str]:
    if d.get("highlights"):
        return d["highlights"][:4]
    return [x.strip() for x in str(d.get("specs", "")).replace("；", "，").split("，") if x.strip()][:4]


def ports(d: dict) -> list[str]:
    if d.get("ports"):
        return d["ports"]
    return [x.strip() for x in str(d.get("interfaces", "")).replace("；", "、").split("、") if x.strip()][:5]


def channel_links(d: dict) -> str:
    out = []
    if d.get("url"):
        out.append(f'<a class="btn" href="{E(d["url"])}">{E(d.get("url_label") or ("1688" if "1688.com" in d["url"] else "出处页面"))}</a>')
    c = d.get("contact") or {}
    if c.get("website"):
        out.append(f'<a class="btn" href="{E(c["website"])}">{E(c.get("website_label") or "官网")}</a>')
    if c.get("phone"):
        out.append(f'<a class="btn" href="tel:{E(c["phone"].replace("-", "").replace(" ", ""))}">{E(c["phone"])}</a>')
    if c.get("wechat"):
        out.append(f'<span class="btn">微信 {E(c["wechat"])}</span>')
    if c.get("name") and not out:
        out.append(f'<span class="btn">{E(c["name"])}</span>')
    qr = f'<img class="qr" src="{E(c["qr"])}" alt="{E(c.get("name") or d["name"])}微信二维码">' if c.get("qr") else ""
    return '<div class="links">' + "".join(out) + "</div>" + qr


def card(d: dict, prices: bool = False) -> str:
    """prices: only when the user asked for a budget (pl.show_prices); then the figure is a reference price taken from the linked page, not a quotation."""
    pic = photo(d, "pic")
    price = "询价" if d.get("unit_price") is None else f'¥{d["unit_price"]:,.0f}' if float(d["unit_price"]).is_integer() else f'¥{d["unit_price"]:,.2f}'
    qty = d.get("qty", 1)
    level = d.get("level", "")
    price_row = (f'<div class="price"><strong>{E(price)}</strong>{f"<span>× {E(qty)}</span>" if qty != 1 else ""}</div>' if prices
                 else (f'<div class="price"><span>× {E(qty)}</span></div>' if qty != 1 else ""))
    duty = f'<div class="duty">{E(d["duty"])}</div>' if d.get("duty") else ""
    return (f'<article class="card">{pic}<div class="body">'
            f'<div class="top"><h4>{E(d["name"])}</h4><span class="lv lv-{E(level)}">{E(level)}</span></div>'
            f'<div class="model">{E(" ".join(x for x in (d.get("brand"), d.get("model")) if x))}</div>'
            f'{duty}'
            f'{price_row}'
            f'<div class="chips">{chips(highlights(d))}</div>'
            f'<div class="chips">{chips(ports(d), "port")}<span class="port pw">{E(d.get("power", ""))}</span></div>'
            f'{channel_links(d)}</div></article>')


def flow_row(plan: dict, f: dict) -> str:
    """一行一个流程：左侧流程名，右侧步骤链（步骤短句 + 参与设备简称）。"""
    devs = pl.device_map(plan)
    steps = []
    for i, st in enumerate(f["steps"], 1):
        who = [devs[x].get("short") or devs[x]["name"] for x in st.get("devices", []) if x in devs and devs[x]["tier"] in ("field", "edge")]
        steps.append(f'<li><span class="act"><b>{i}</b>{E(st.get("short") or st.get("action", ""))}</span>'
                     f'<span class="who">{chips(who, "dv")}</span></li>')
    return f'<div class="flow"><h4>{E(f["name"])}</h4><ol class="fsteps">{"".join(steps)}</ol></div>'


def scenario_section(plan: dict) -> str:
    """系统方案：按阶段与角色的完整操作故事板 + 硬件与功能对照。"""
    devs = pl.device_map(plan)
    out = ['<section id="scenario"><h2>系统方案</h2>', conclusion(plan, "scenario")]
    for si, stg in enumerate(plan["scenario"], 1):
        rows = []
        for i, st in enumerate(stg["steps"], 1):
            used = [devs[x] for x in st.get("devices", []) if x in devs and devs[x]["tier"] in ("field", "edge")]
            thumbs = "".join(f'<span class="th">{photo(d, "tp")}<span>{E(d.get("short") or d["name"])}</span></span>' for d in used)
            if not thumbs:
                thumbs = '<span class="th cloud">小程序 / 云端</span>'
            exc = f'<div class="exc"><b>异常</b>{E(st["exception"])}</div>' if st.get("exception") else ""
            rows.append(f'<li class="sc"><span class="no">{si}.{i}</span>'
                        f'<div class="what"><div class="act">{E(st["action"])}</div><div class="res">{E(st["response"])}</div>{exc}</div>'
                        f'<div class="thumbs">{thumbs}</div><span class="fn">{E(st["function"])}</span></li>')
        when = " · " + E(stg["when"]) if stg.get("when") else ""
        out.append(f'<div class="stage"><h3><span class="role">{E(stg.get("role", ""))}</span>{E(stg["stage"])}'
                   f'<span class="msum">{len(stg["steps"])} 步{when}</span></h3>'
                   f'<ol class="story">{"".join(rows)}</ol></div>')
    out.append(matrix(plan))
    out.append("</section>")
    return "".join(out)


def matrix(plan: dict) -> str:
    """设备 × 阶段：每格列出该设备参与的步骤编号，最后一列汇总它承担的功能。"""
    devs = [d for d in plan["devices"] if d.get("purchase", True) and d["tier"] in ("field", "edge")]
    head = "".join(f"<th>{E(stg['stage'])}</th>" for stg in plan["scenario"])
    body = []
    for d in devs:
        cells, fns = [], []
        for si, stg in enumerate(plan["scenario"], 1):
            nos = [f"{si}.{i}" for i, st in enumerate(stg["steps"], 1) if d["id"] in st.get("devices", [])]
            fns += [st["function"] for st in stg["steps"] if d["id"] in st.get("devices", [])]
            cells.append('<td class="c">' + "".join(f'<span class="dot">{n}</span>' for n in nos) + "</td>")
        fn = "、".join(dict.fromkeys(fns))
        body.append(f'<tr><td class="l"><span class="dvc">{photo(d, "tm")}<span>{E(d.get("short") or d["name"])}</span></span></td>'
                    f'{"".join(cells)}<td class="l">{E(fn)}</td></tr>')
    return ('<h3>硬件与功能对照</h3><div class="scroll"><table class="mx"><thead><tr><th>设备</th>' + head +
            '<th>承担的功能</th></tr></thead><tbody>' + "".join(body) + "</tbody></table></div>")


def bars(rows: list[tuple[str, float]], total: float) -> str:
    """参考价：单系列横向条形图（一种主色，按金额降序，条端标数值，悬停提示）。"""
    mx = max(v for _, v in rows) if rows else 1
    out = []
    for name, v in rows:
        pct = v / total * 100 if total else 0
        out.append(f'<div class="bar" tabindex="0" data-tip="{E(name)}：¥{v:,.2f}（{pct:.1f}%）">'
                   f'<span class="bl">{E(name)}</span><span class="track"><span class="bar-fill" style="width:{v / mx * 100:.1f}%"></span></span>'
                   f'<span class="bv">¥{v:,.0f}</span></div>')
    return '<div class="bars" role="img" aria-label="各模块硬件参考价">' + "".join(out) + '<div class="tip" hidden></div></div>'


def render(plan: dict) -> str:
    devs = pl.device_map(plan)
    buy = [d for d in plan["devices"] if d.get("purchase", True) and d["tier"] in ("field", "edge")]
    b = pl.budget(plan)
    prices = pl.show_prices(plan)
    req = pl.site_requirements(plan)
    out = []

    # 1 方案总览：指标 + 动线
    mods = sorted({d.get("category") for d in buy}, key=lambda m: MODULE_ORDER.index(m) if m in MODULE_ORDER else 99)
    qty = sum(int(d.get("qty", 1)) for d in buy)
    tiles = [(str(qty), "设备台数"), (str(len(mods)), "业务模块")]
    if prices:        # reference prices only when a budget was asked for
        tiles = [(f"¥{b['total']:,.0f}", "参考价合计")] + tiles + [(str(len(b["unpriced"])), "需询价设备")]
    s = ['<section id="overview"><h2>方案总览</h2>', conclusion(plan, "ops"),
         '<div class="metrics">' + "".join(f'<div><strong>{E(v)}</strong><span>{E(k)}</span></div>' for v, k in tiles) + "</div>"]
    for chain in plan.get("journeys", []):
        steps = "".join(f'<li><b>{i}</b><span>{E(st)}</span></li>' for i, st in enumerate(chain["steps"], 1))
        s.append(f'<h3>{E(chain["name"])}</h3><ol class="chain">{steps}</ol>')
    s.append("</section>")
    out.append("".join(s))
    if plan.get("scenario"):
        out.append(scenario_section(plan))

    # 2 连接图
    s = ['<section id="topology"><h2>系统连接图</h2>', conclusion(plan, "topology"), build_diagram(plan)]
    rows = [[E(l["no"]), E(devs[l["from"]]["name"]), E(l.get("direction", "→")), E(devs[l["to"]]["name"]),
             E(l.get("medium", "")), E(l.get("protocol", "—")), E(l.get("note", ""))] for l in plan["links"]]
    s.append('<details><summary>链路说明（' + str(len(rows)) + ' 条）</summary>' +
             table(["编号", "起点", "方向", "终点", "介质与接口", "协议", "传输内容"], rows, align=["c", "c", "c", "c", "c", "c", "l"]) + "</details>")
    s.append("</section>")
    out.append("".join(s))

    # 3 设备清单：按模块分组的图文卡片
    s = ['<section id="devices"><h2>设备清单</h2>', conclusion(plan, "bom")]
    if prices:
        s.append(f'<p class="note-line">{E(REFERENCE_PRICE_NOTE)}</p>')
    for m in mods:
        items = [d for d in buy if d.get("category") == m]
        sub = sum(pl.subtotal(d) or 0 for d in items)
        amount = f" · ¥{sub:,.0f}" if prices else ""
        s.append(f'<div class="mod"><h3>{icon(m)}{E(m)}<span class="msum">{len(items)} 种{amount}</span></h3>'
                 f'<div class="cards">{"".join(card(d, prices) for d in items)}</div></div>')
    s.append("</section>")
    out.append("".join(s))

    # 4 关键流程
    if plan["flows"] and not plan.get("scenario"):
        s = ['<section id="flows"><h2>关键流程</h2>', conclusion(plan, "flows"), '<div class="flows">']
        s += [flow_row(plan, f) for f in plan["flows"]]
        s.append("</div></section>")
        out.append("".join(s))

    # 5 现场条件
    s = ['<section id="site"><h2>现场条件</h2>', conclusion(plan, "site")]
    if req:
        s.append('<div class="metrics">' + "".join(
            f'<div><strong>{E(r.get("value") or r["demand"].split("，")[0])}</strong><span>{E(r["item"])}</span></div>' for r in req[:4]) + "</div>")
    sites = [d for d in plan["devices"] if d.get("site")]
    if sites:
        s.append('<div class="sites">' + "".join(
            f'<div class="site"><h4>{E(d["name"])}</h4><ul>' + "".join(f"<li>{E(x)}</li>" for x in (d.get("requirement_items") or [d.get("requirement", "")])) + "</ul></div>"
            for d in sites) + "</div>")
    s.append("</section>")
    out.append("".join(s))

    # 6 参考价：只在用户明确要求预算（budget_requested 证据齐全）时才有
    if prices:
        s = ['<section id="budget"><h2>参考价</h2>', conclusion(plan, "budget"), f'<p class="note-line">{E(REFERENCE_PRICE_NOTE)}</p>']
        lv = b["by_level"]
        s.append('<div class="metrics">' + "".join(
            f'<div><strong>¥{lv.get(k, 0):,.0f}</strong><span>{k}</span></div>' for k in pl.LEVELS) +
            f'<div><strong>¥{b["total"]:,.0f}</strong><span>参考价合计</span></div></div>')
        s.append(bars(sorted(b["by_category"].items(), key=lambda x: -x[1]), b["total"]))
        if b["unpriced"]:
            s.append(f'<p class="note-line">询价：{dev_names(plan, b["unpriced"])}</p>')
        s.append("</section>")
        out.append("".join(s))

    # 7 附录（折叠）
    apx = []
    if plan["flows"] and plan.get("scenario"):
        rows = [[E(f["name"]), E(i), E(st.get("trigger", "")), dev_names(plan, st.get("devices", [])), E(st.get("protocol", "")), E(st.get("action", ""))]
                for f in plan["flows"] for i, st in enumerate(f["steps"], 1)]
        apx.append("<details><summary>通信时序（开发对接）</summary>" + table(["流程", "步骤", "触发", "设备", "通信", "动作与结果"], rows, align=["c", "c", "l", "l", "c", "l"]) + "</details>")
    if plan["access_modes"]:
        rows = []
        for m in plan["access_modes"]:
            ids = [d["id"] for d in plan["devices"] if d.get("access_mode") == m["mode"] and d["tier"] in ("field", "edge")]
            rows.append([E(pl.ACCESS_MODES.get(m["mode"], m["mode"])), E(m.get("path", "")), dev_names(plan, ids), E(m.get("detail", ""))])
        apx.append("<details><summary>设备接入方式</summary>" + table(["方式", "通路", "设备", "要点"], rows, align=["c", "l", "l", "l"]) + "</details>")
    if plan["placements"]:
        rows = [[E(p["zone"]), E(p.get("position", "")), dev_names(plan, p.get("devices", [])), E(p.get("install", ""))] for p in plan["placements"]]
        apx.append("<details><summary>安装点位</summary>" + table(["区域", "位置", "设备", "安装"], rows, align=["c", "l", "l", "l"]) + "</details>")
    if plan["risks"]:
        rows = [[E(r["item"]), E(r.get("risk", "")), E(r.get("measure", ""))] for r in plan["risks"]]
        apx.append("<details><summary>风险与合规</summary>" + table(["事项", "风险", "措施"], rows, align=["c", "l", "l"]) + "</details>")
    if plan.get("capacity"):
        rows = [[E(r["item"]), E(r.get("calc", "")), E(r.get("result", ""))] for r in plan["capacity"]]
        apx.append("<details><summary>容量计算</summary>" + table(["项目", "计算", "结论"], rows, align=["c", "l", "l"]) + "</details>")
    if apx:
        out.append('<section id="appendix"><h2>附录</h2>' + "".join(apx) + "</section>")

    # Tab icon: the system's pictogram in its theme colour; a hardware plan with no subject keyword gets the chip.
    pictogram = pick_icon(plan["title"])
    tab_icon = tab_icon_href(plan["title"], icon="chip" if pictogram == "grid" else pictogram)
    return DESIGN_TEMPLATE.read_text(encoding="utf-8").format(title=E(plan["title"]), tab_icon=E(tab_icon), body="".join(out), md_type=md_type_css(), **ACCENT)


DESIGN_TEMPLATE = Path(__file__).resolve().parents[2] / "Luz-Design" / "references" / "hardware-plan.template.html"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("out")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--session", type=Path, help="已完成 Crawl 的会话；默认从 raw/04-hardware/plan.json 解析")
    a = ap.parse_args()
    try:
        research_errors = generation_errors(a.session or session_for_plan(Path(a.plan)))
    except ValueError as exc:
        research_errors = [str(exc)]
    if research_errors:
        for error in research_errors:
            print("  ERROR", error, file=sys.stderr)
        return 1
    plan = pl.load(a.plan)
    errors, warnings = pl.validate(plan)
    for w in warnings:
        print("  WARN ", w)
    for e in errors:
        print("  ERROR", e)
    if errors and not a.force:
        print(f"{len(errors)} 个错误，未生成。")
        return 1
    output = Path(a.out).resolve()
    session = (a.session or session_for_plan(Path(a.plan))).resolve()
    # Hardware plans are formal reading documents.  Bind the actual target to
    # a real Luz-Design template before creating its parent directory, then
    # register the resulting bytes after the renderer succeeds.
    try:
        template_binding(session, output, "hardware-plan")
    except (OSError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(plan), encoding="utf-8")
    template_binding(session, output, "hardware-plan", post=True, generator="Luz-System/scripts/hw_render_plan.py")
    print(f"已生成 {output}（{len(plan['devices'])} 台设备，{len(plan['links'])} 条链路）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
