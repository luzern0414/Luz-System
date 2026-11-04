"""Verifies a built prototype in a real Edge: every page (or --only), every scene, at desktop and phone width.

    py -X utf8 scripts/verify.py <admin|mini> --html <built file> [--only id,id] [--audit] [--shots <dir>]

Per page and scene it reports console errors, horizontal page scroll, an empty page area and text that is too small (see SMALL below). Besides the
two main widths every page's default scene is opened at 768, 1024 and 1920 (--sweep), so the layout is checked where it adapts. With --audit it also runs Luz-Design's
audit_rendered.py on every page at both widths with --library (element-plus for admin, vant for mini): hand-written controls and
text rules are reported. Exit code 1 when anything is found.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

DESIGN = Path(__file__).resolve().parents[4] / "Luz-Design" / "scripts"
LIB = {"admin": "element-plus", "mini": "vant"}
AREA = {"admin": ".shell-main", "mini": "#screen"}
EXTRA = {"admin": ", .shell-aside", "mini": ", .van-tabbar"}   # the menu and the tab bar are outside the page area but carry text too
HEIGHT = {390: 844, 768: 1024, 1024: 768, 1920: 1080}
# Text people read and tap is never in the smallest step (visual standard, 字阶: "正文、表格、按钮、表单永远不用最小档"): the text of a control, a field label, a table cell,
# a title or a menu entry is at least FLOOR px (admin 14; mini-program 16, with the 14 px steps of its ladder for the caption under an icon and the small buttons).
# Annotations (a second line, tags, badges, units, deltas, card descriptions) may be 12.
FLOOR = {"admin": 14, "mini": 16}
SMALL = r"""
([sel, floor]) => {
  const LOW = '.van-tabbar-item, .van-grid-item, .van-action-bar-icon, .van-button--small, .van-button--mini';
  const ROLE = 'button, a, input, textarea, select, label, th, td, h1, h2, h3, h4, h5, h6, [role=button], [role=tab], [role=menuitem], .el-button, .van-button, .van-cell__title, .van-card__title, .van-field__label, .van-tab, .van-tabbar-item, .el-menu-item, .el-tabs__item, .el-form-item__label, .el-dialog__title, .el-checkbox__label, .el-radio__label, .van-checkbox__label, .van-radio__label';
  const NOTE = '.small, small, time, sup, .el-tag, .van-tag, .el-badge, .van-badge, .van-info, .lz-kpi-delta, .el-statistic__suffix, .van-card__desc, .van-card__price, .van-card__origin-price, .van-card__num, .van-cell__label, .van-submit-bar__tip, .van-submit-bar__price, .van-field__word-limit, .van-uploader__upload-text, .el-pagination__total';
  const bad = new Map(), texts = [];
  for (const root of document.querySelectorAll(sel)) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(n); }
  for (const n of texts) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest('[data-luz-demo-panel], script, style')) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const px = parseFloat(cs.fontSize); if (px >= (el.closest(LOW) ? 14 : floor)) continue;
    const role = el.closest(ROLE), note = el.closest(NOTE);
    if (!role || (note && role.contains(note))) continue;
    const key = `${px}px in ${role.tagName.toLowerCase()}.${[...role.classList].slice(0, 2).join('.')} "${t.slice(0, 12)}"`;
    bad.set(key, (bad.get(key) || 0) + 1);
  }
  return [...bad.keys()].slice(0, 5);
}"""
# A button, tab or tick label whose text is wider than the box that holds it (the larger text sizes): the text would be cut or pushed out.
CLIPPED = """() => [...document.querySelectorAll('#screen .van-button, .van-tabbar-item, #screen .van-tab')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && b.scrollWidth > b.clientWidth + 1 }).map((b) => (b.innerText || '').trim().slice(0, 10)).slice(0, 5)"""
# Style-sheet rules that belong to the library itself (selector starts with .van- / .el-): the page cannot change them, so they are not reported.
LIBRARY_RULE = re.compile(r"(?:transition: all|will-change|italic|transition on layout property \w+) in \.(?:van|el)-")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", choices=["admin", "mini"])
    ap.add_argument("--html", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--audit", action="store_true")
    ap.add_argument("--shots", default="")
    ap.add_argument("--widths", default="1440,390")
    ap.add_argument("--theme", default="enterprise-navy", help="theme id of Luz-Design themes.json: with --audit every page is also checked for hues outside it (audit_palette.py)")
    ap.add_argument("--dark", type=int, default=1, help="1: also open every page in the dark scheme (0 to skip)")
    ap.add_argument("--care", type=int, default=1, help="1: also open the mini-program pages at the care mode font size (0 to skip)")
    ap.add_argument("--sweep", default="768,1024,1920", help="more widths where only each page's default scene is opened ('' for none)")
    a = ap.parse_args()
    html = Path(a.html).resolve()
    widths = [int(w) for w in a.widths.split(",")]
    sweep = [int(w) for w in a.sweep.split(",") if w and int(w) not in widths]
    # the mini-program is also opened at the care mode (1.4 times the text, WeChat 适老化指南) at phone width: its default scenes only
    # the dark scheme (Luz-Design: every front end has a light and a dark theme): every page's default scene again, at the main width of the target
    variants = [(w, "std") for w in widths + sweep] + ([(390, "care")] if a.target == "mini" and a.care else []) + ([(widths[0] if a.target == "admin" else 390, "dark")] if a.dark else [])
    only = {x for x in a.only.split(",") if x}
    problems: list[str] = []
    shots = Path(a.shots) if a.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge")
        for width, level in variants:
            page = browser.new_page(viewport={"width": width, "height": HEIGHT.get(width, 900 if width > 700 else 844)}, locale="zh-CN")
            errors: list[str] = []
            page.on("console", lambda m: errors.append(f"console {m.type}: {m.text[:200]}") if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
            url = html.as_uri() + "?skip-login"
            page.goto(url)
            page.wait_for_function("window.__LUZ__ !== undefined", timeout=15000)
            pages = page.evaluate("window.__LUZ__.pages")
            if level == "care":
                page.evaluate("(l) => { window.__LUZ__.state.fontLevel = l }", level)
            elif level == "dark":
                page.evaluate("() => { window.__LUZ__.state.scheme = 'dark' }")
            for p in pages:
                if only and p["id"] not in only:
                    continue
                for scene in ([None] + [s["id"] for s in p["scenes"]]) if width in widths and level == "std" else [None]:
                    errors.clear()
                    page.evaluate("(a) => { window.__LUZ__.state.scenes = {}; if (a[1]) window.__LUZ__.setScene(a[0], a[1]) }", [p["id"], scene])
                    page.evaluate("location.hash = '#/__blank'")
                    page.wait_for_timeout(120)
                    page.evaluate("(id) => { location.hash = '#/' + id }", p["id"])
                    page.wait_for_timeout(1100)
                    info = page.evaluate("(sel) => { const el = document.querySelector(sel); return { text: el ? el.innerText.trim().length : -1, over: document.documentElement.scrollWidth > innerWidth + 1 || (!!el && el.scrollWidth > el.clientWidth + 1) } }", AREA[a.target])
                    label = f"{a.target}:{p['id']}@{width}" + (f"/{level}" if level != "std" else "") + (f" [{scene}]" if scene else "")
                    found = list(errors)
                    small = page.evaluate(SMALL, [AREA[a.target] + EXTRA[a.target], FLOOR[a.target]])
                    if small:
                        found.append(f"text under {FLOOR[a.target]} px in a control, label, cell or title: " + "; ".join(small))
                    if info["text"] < 12:
                        found.append(f"the page area is empty ({info['text']} characters)")
                    if info["over"]:
                        found.append("horizontal page scroll")
                    clipped = page.evaluate(CLIPPED)
                    if clipped:
                        found.append("a button or tab is too narrow for its text: " + "; ".join(clipped))
                    if found:
                        problems += [f"{label}: {f}" for f in found]
                    if shots and scene is None:
                        page.screenshot(path=str(shots / f"{a.target}-{p['id']}-{width}.png"))
            page.close()
        browser.close()

    if a.audit:
        if not (DESIGN / "audit_rendered.py").is_file():
            raise SystemExit(f"ERROR audit_rendered.py not found at {DESIGN}")
        pages_to_audit = [p for p in (pages if pages else []) if not only or p["id"] in only]
        for width in widths:
            for p in pages_to_audit:
                target = html.as_uri() + f"?skip-login#/{p['id']}"
                run = subprocess.run([sys.executable, "-X", "utf8", str(DESIGN / "audit_rendered.py"), target, "--width", str(width), "--library", LIB[a.target], "--min-components", "1", "--min-font", "12"],
                                     capture_output=True, text=True, encoding="utf-8")
                if run.returncode != 0:
                    lines = [line.strip() for line in run.stdout.splitlines() if line.strip() not in ("[", "]", "")]
                    lines = [line for line in lines if not LIBRARY_RULE.search(line)]
                    if not run.stdout.strip():  # the audit itself failed to run: never read that as a pass
                        lines = ["audit did not run: " + (run.stderr.strip().splitlines() or ["no output"])[-1]]
                    problems += [f"audit {a.target}:{p['id']}@{width}: {line}" for line in lines]

        # the colours a page really shows come from the theme: no decorative extra hue, no letter avatar (Luz-Design audit_palette.py)
        if not (DESIGN / "audit_palette.py").is_file():
            raise SystemExit(f"ERROR audit_palette.py not found at {DESIGN}")
        width = widths[0] if a.target == "admin" else 390
        schemes = ["light"] + (["dark"] if a.dark else [])
        for scheme in schemes:
            for p in pages_to_audit:
                run = subprocess.run([sys.executable, "-X", "utf8", str(DESIGN / "audit_palette.py"), str(html), "--theme", a.theme, "--hash", f"#/{p['id']}", "--width", str(width), "--scheme", scheme],
                                     capture_output=True, text=True, encoding="utf-8")
                if run.returncode != 0:
                    lines = [line.strip().strip(",").strip('"') for line in run.stdout.splitlines() if line.strip() not in ("[", "]", "")] or ["palette audit did not run: " + (run.stderr.strip().splitlines() or ["no output"])[-1]]
                    problems += [f"palette {a.target}:{p['id']}@{width}/{scheme}: {line}" for line in lines]
        # the dark scheme through the rendered audit too (contrast, sizes, targets, focus frames) and stable display (no layout shift, no flash, no scroll-bar jump)
        if a.dark:
            for p in pages_to_audit:
                run = subprocess.run([sys.executable, "-X", "utf8", str(DESIGN / "audit_rendered.py"), html.as_uri() + f"?skip-login#/{p['id']}", "--width", str(width), "--library", LIB[a.target], "--min-components", "1", "--min-font", "12", "--scheme", "dark"],
                                     capture_output=True, text=True, encoding="utf-8")
                if run.returncode != 0:
                    lines = [line.strip() for line in run.stdout.splitlines() if line.strip() not in ("[", "]", "")]
                    lines = [line for line in lines if not LIBRARY_RULE.search(line)] or ([] if run.stdout.strip() else ["audit did not run: " + (run.stderr.strip().splitlines() or ["no output"])[-1]])
                    problems += [f"audit {a.target}:{p['id']}@{width}/dark: {line}" for line in lines]
        if (DESIGN / "audit_stability.py").is_file():
            for scheme in schemes:
                cmd = [sys.executable, "-X", "utf8", str(DESIGN / "audit_stability.py"), str(html), "--width", str(width), "--scheme", scheme]
                for p in pages_to_audit:
                    cmd += ["--hash", f"#/{p['id']}"]
                run = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
                if run.returncode != 0:
                    lines = [line.strip().strip(",").strip('"') for line in run.stdout.splitlines() if line.strip() not in ("[", "]", "")] or ["stability audit did not run: " + (run.stderr.strip().splitlines() or ["no output"])[-1]]
                    problems += [f"stability {a.target}@{width}/{scheme}: {line}" for line in lines]

    print("verify: ok" if not problems else "\n".join(problems[:80]) + (f"\n... {len(problems)} problems in all" if len(problems) > 80 else ""))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
