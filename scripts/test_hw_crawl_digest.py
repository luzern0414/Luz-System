"""hw_crawl_digest.py reads a Luz-Crawl task folder in the current layout (task_folder_v2) and in the older one."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hw_crawl_digest as digest  # noqa: E402
import hw_fetch_images  # noqa: E402

BODY = "页面正文" * 100  # longer than the 300 characters that count as a read page
SEARCH = {"query": "门禁", "platform": "1688", "candidates": [
    {"url": "https://detail.1688.com/offer/111.html?x=1", "text": "门禁一体机\n¥\n199\n.00\n全网1000件\n某某电子有限公司"}]}


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def make_task(root: Path, v2: bool) -> Path:
    """v2: <task>\\raw\\search-*.json and <task>\\raw\\NNNN_标题\\content.json; older: search-*.json beside raw\\ and content.json in <archive>\\raw."""
    task = root / "001_硬件调研"
    write(task / ("raw" if v2 else ".") / "search-1.json", SEARCH)
    for number, (title, status) in enumerate((("读到的页面", "captured"), ("失败的页面", "failed")), 1):
        archive = task / "raw" / f"{number:04d}_{title}"
        write((archive if v2 else archive / "raw") / "content.json",
              {"title": title, "text": BODY if status == "captured" else "", "status": status, "resolved_url": f"https://example.org/{number}"})
    return task


class DigestLayoutTests(unittest.TestCase):
    def test_reads_both_layouts(self) -> None:
        for v2 in (True, False):
            with self.subTest(v2=v2), tempfile.TemporaryDirectory() as temporary:
                task = make_task(Path(temporary), v2)
                result = digest.collect(task)
                self.assertEqual([c["url"] for c in result["candidates"]], ["https://detail.1688.com/offer/111.html"])
                self.assertEqual([s["title"] for s in result["sources"]], ["读到的页面"])
                self.assertEqual([s["title"] for s in result["failures"]], ["失败的页面"])
                self.assertEqual(Path(result["sources"][0]["folder"]), task / "raw" / "0001_读到的页面")

    def test_a_task_without_pages_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = digest.collect(Path(temporary))
            self.assertEqual((result["candidates"], result["sources"], result["failures"]), ([], [], []))


class SnapshotLocationTests(unittest.TestCase):
    def test_image_urls_come_from_snapshots_in_either_place(self) -> None:
        html = '<a m="{&quot;murl&quot;:&quot;https://img.alicdn.com/a.jpg&quot;}">'
        for v2 in (True, False):
            with self.subTest(v2=v2), tempfile.TemporaryDirectory() as temporary:
                archive = Path(temporary) / "0001_图片搜索"
                snapshots = (archive if v2 else archive / "raw") / "snapshots"
                snapshots.mkdir(parents=True)
                (snapshots / "0001.html").write_text(html, encoding="utf-8")
                self.assertEqual(hw_fetch_images.image_urls(archive), ["https://img.alicdn.com/a.jpg"])


if __name__ == "__main__":
    unittest.main()
