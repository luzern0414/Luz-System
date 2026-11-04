"""Visits every page of a built prototype (each page adds its own demo data on first visit), then checks the numbers the pages must agree on.

    py -X utf8 scripts/check_data.py <admin|mini> --html <built file>

Checks on state.db: an order's amount is subtotal minus discount; a refund never exceeds what the order paid (all open and done refunds of one
order together); a card's used count stays within its total and equals the 核销扣次 rows minus the 撤销扣次 rows; no balance is negative.
Exit code 1 when anything is found.
"""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

CHECK = r"""
() => {
  const db = window.__LUZ__.state.db, bad = [];
  const orders = new Map((db.orders || []).map((o) => [o.no, o]));
  for (const o of db.orders || []) if (o.amount !== o.subtotal - o.discount) bad.push(`order ${o.no}: amount ${o.amount} != subtotal ${o.subtotal} - discount ${o.discount}`);
  const refunded = new Map();
  for (const r of db.refunds || []) {
    const o = orders.get(r.orderNo);
    if (!o) { bad.push(`refund ${r.id}: order ${r.orderNo} does not exist`); continue; }
    if (r.status === 'REJECTED') continue;
    refunded.set(r.orderNo, (refunded.get(r.orderNo) || 0) + r.amount);
  }
  for (const [no, sum] of refunded) if (sum > orders.get(no).amount) bad.push(`order ${no}: refunds ${sum} exceed the paid ${orders.get(no).amount}`);
  const logs = new Map();
  for (const l of db.cardLogs || []) { const d = l.action === '核销扣次' ? 1 : l.action === '撤销扣次' ? -1 : 0; if (d) logs.set(l.cardNo, (logs.get(l.cardNo) || 0) + d); }
  for (const c of db.cards || []) {
    if (c.total > 0 && (c.used < 0 || c.used > c.total)) bad.push(`card ${c.no}: used ${c.used} outside 0..${c.total}`);
    if ((logs.get(c.no) || 0) !== c.used) bad.push(`card ${c.no}: used ${c.used} but the deduction rows say ${logs.get(c.no) || 0}`);
  }
  for (const u of db.users || []) if (u.balance < 0) bad.push(`user ${u.id}: balance ${u.balance} is negative`);
  if (db.me && db.me.balance < 0) bad.push(`me: balance ${db.me.balance} is negative`);
  return bad;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", choices=["admin", "mini"])
    ap.add_argument("--html", required=True)
    a = ap.parse_args()
    html = Path(a.html).resolve()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440 if a.target == "admin" else 390, "height": 900}, locale="zh-CN")
        page.goto(html.as_uri() + "?skip-login")
        page.wait_for_function("window.__LUZ__ !== undefined", timeout=15000)
        for p in page.evaluate("window.__LUZ__.pages"):
            page.evaluate("(id) => { location.hash = '#/' + id }", p["id"])
            page.wait_for_timeout(900)
        bad = page.evaluate(CHECK)
        browser.close()
    print("check_data: ok" if not bad else "\n".join(bad[:60]) + (f"\n... {len(bad)} problems in all" if len(bad) > 60 else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
