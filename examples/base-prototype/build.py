"""Builds the base prototypes as two single, self-contained HTML files on the Luz UI kit.

    py -X utf8 build.py                  # admin.html and mini.html next to this file
    py -X utf8 build.py admin            # one
    LUZ_PROTO_OUT=<dir> py -X utf8 build.py   # write somewhere else

Sources: the pinned demo kit in ``src/legacy-kit`` (or an explicit compatible LUZ_KIT), ``src/bdata.js``
(generic demo data), and per target the page files ``src/<target>.p*.css`` / ``src/<target>.p*.js`` with ``src/<target>.boot.js`` last.
Images are the webp files in ``src/images``. Nothing is fetched from the network.
"""
import base64
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
KIT = Path(os.environ["LUZ_KIT"]) if os.environ.get("LUZ_KIT") else SRC / "legacy-kit"
OUT = Path(os.environ["LUZ_PROTO_OUT"]) if os.environ.get("LUZ_PROTO_OUT") else HERE

TARGETS = {
    "admin": ("示例门店管理后台", "admin.html"),
    "mini": ("示例门店小程序", "mini.html"),
}
ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232f6b4f'/%3E"
        "%3Cpath d='M7 14l2-5h14l2 5M8 14a3 3 0 0 0 4 1.6 3 3 0 0 0 4 0 3 3 0 0 0 4 0A3 3 0 0 0 24 14M9 17v6h14v-6' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")


def images() -> str:
    out = [f'"{f.stem}":"data:image/webp;base64,{base64.b64encode(f.read_bytes()).decode()}"' for f in sorted((SRC / "images").glob("*.webp"))]
    return "window.IMG={" + ",".join(out) + "};"


def build(which: str) -> Path:
    if not all((KIT / name).is_file() for name in ("ui.css", "ui.js")):
        raise SystemExit(f"UI kit not found at {KIT}; restore src/legacy-kit or point LUZ_KIT at a compatible kit")
    title, name = TARGETS[which]
    read = lambda p: p.read_text(encoding="utf-8") if p.exists() else ""
    parts = lambda pattern: "\n".join(f.read_text(encoding="utf-8") for f in sorted(SRC.glob(pattern)) if ".boot." not in f.name)
    css = read(KIT / "ui.css") + "\n@layer project {\n" + read(SRC / f"{which}.css") + "\n" + parts(f"{which}.p*.css") + "\n}\n"
    sources = [images(), read(KIT / "ui.js"), read(SRC / "bdata.js")]
    if which == "admin":
        sources.append((HERE.parent / "demo-account.js").read_text(encoding="utf-8"))
    js = "\n".join([*sources, parts(f"{which}.p*.js"), read(SRC / f"{which}.boot.js")])
    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<link rel="icon" href="{ICON}">
<style>
{css}
</style>
</head>
<body>
<h1 class="sr-only">{title}</h1>
<div id="root"></div>
<script>
{js}
</script>
</body>
</html>
"""
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(page, encoding="utf-8")
    return path


if __name__ == "__main__":
    for w in (sys.argv[1:] or list(TARGETS)):
        p = build(w)
        print(p.name, p.stat().st_size)
