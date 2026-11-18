/* 第三组页面（通知、导入导出、账号与角色、操作日志、系统配置）的共用件 P3：演示数据的补充与重置、下载、复制、菜单、标签页、离开确认。
   页面在 admin.p3b.js（通知）、p3c（导入导出）、p3d（账号与角色）、p3e（操作日志）、p3f（系统配置）。本文件最先加载。 */
(function () {
  'use strict';
  const { h } = UI;
  const P3 = (window.P3 = {});
  const pad = (n) => String(n).padStart(2, '0');
  P3.pad = pad;

  /* ---------- 时间与数字：演示时钟固定每天 10:30 ---------- */
  P3.stamp = () => B.fmt(B.NOW());
  P3.today = () => P3.stamp().slice(0, 10);
  P3.dayKey = (back) => K.ymd(K.addDays(K.today(), -back));
  P3.md = (at) => (at ? at.slice(5) : '—');
  P3.n = (v) => Number(v).toLocaleString('zh-CN');
  P3.pct = (a, b, dec) => (b ? ((a / b) * 100).toFixed(dec == null ? 1 : dec) + '%' : '0%');
  P3.addMin = (at, m) => { const d = new Date(+at.slice(0, 4), +at.slice(5, 7) - 1, +at.slice(8, 10), +at.slice(11, 13), +at.slice(14, 16)); return B.fmt(new Date(d.getTime() + m * 60000)); };
  P3.mask = (p) => (p && p.length >= 11 ? p.slice(0, 3) + '****' + p.slice(7) : p || '—');
  P3.wait = (ms) => UI.sleep(ms);

  /* ---------- 演示数据：在 B.reset 之后补上本组页面自己的数据，重置演示数据时一起重来 ---------- */
  const seeds = [];
  P3.onSeed = (fn) => { seeds.push(fn); fn(B.db); };
  const baseReset = B.reset;
  B.reset = function () { const db = baseReset.apply(this, arguments); seeds.forEach((f) => f(db)); return db; };

  /* ---------- 审计：A2.audit 之后补上修改前后与原因 ---------- */
  P3.audit = (code, action, target, o) => {
    o = o || {};
    A2.audit(code, action, target, o.result);
    const rec = B.db.audit[0];
    if (o.diff) rec.diff = o.diff;
    if (o.reason) rec.reason = o.reason;
    return rec;
  };

  /* ---------- 新增或改动的行闪一次 ---------- */
  P3.flash = (root, sel) => UI.$$(sel || 'tr.p3-flash', root).forEach((tr) => { tr.classList.remove('p3-flash'); UI.play(tr, [{ backgroundColor: 'var(--brand-line)' }, { backgroundColor: 'transparent' }], { duration: 1400 }); });

  /* ---------- 文件：下载（带 BOM 的 CSV，开头是公式字符的文本加引号前缀防公式注入）与复制 ---------- */
  const cell = (v) => { if (v == null) return ''; let s = String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  P3.csv = (header, rows) => '﻿' + [header].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n');
  P3.download = (name, text) => {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name, hidden: true });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  P3.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 退回旧写法 */ }
    const t = h('textarea', { style: { position: 'fixed', opacity: 0, left: '-999px' }, 'aria-hidden': 'true' }); t.value = text; document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
  };
  P3.randomPassword = (len) => {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'], all = sets.join(''), buf = new Uint32Array(len || 16);
    crypto.getRandomValues(buf);
    const out = Array.from(buf, (v) => all[v % all.length]);
    sets.forEach((s, i) => { out[i] = s[buf[i] % s.length]; });
    for (let i = out.length - 1; i > 0; i--) { const j = buf[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out.join('');
  };

  /* ---------- 小部件 ---------- */
  P3.badge = (text, kind, plain) => h('span.badge' + (kind ? '.badge--' + kind : '') + (plain ? '.badge--plain' : ''), { text });
  P3.alert = (kind, text, actions) => h('div.p3-alert.p3-alert--' + kind, { role: kind === 'bad' ? 'alert' : 'status' }, UI.icon(kind === 'bad' ? 'warn' : kind === 'ok' ? 'check' : 'info', 'icon--sm'), h('span.grow', { text }), actions || null);
  P3.seg = (label, options, value, onChange) => {
    const el = h('div.seg', { role: 'group', 'aria-label': label });
    const paint = (v) => UI.$$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
    options.forEach(([v, l]) => el.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), text: l, on: { click: () => { paint(v); onChange(v); } } })));
    el.set = paint; return el;
  };
  /** 表单项：{el, err, control, setErr(msg)}；label 与控件用 for/id 关联 */
  let fid = 0;
  P3.field = (label, control, o) => {
    o = o || {}; const id = 'p3f' + ++fid, err = h('div.err', { role: 'alert' });
    control.id = id;
    const el = h('div.field', {}, h('label', { for: id }, label, o.required ? h('b', { style: { color: 'var(--bad-ink)' }, text: ' *' }) : null), control, o.hint ? h('div.hint', { text: o.hint }) : null, err);
    return { el, err, control, setErr(m) { err.textContent = m || ''; if (m) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid'); } };
  };
  /** 概览数字：第一项是主角（展示字号），其余 24 号；items: [{label, value, opt:{prefix,suffix,dec}, sub}] */
  P3.stats = (items) => {
    const wrap = h('div.band-stats');
    items.forEach((it, i) => { const v = h('span.stat-value.num', { text: '0' }); wrap.append(h('div.stat' + (i ? '.stat--sm' : ''), {}, h('span.stat-label', { text: it.label }), v, h('span.stat-sub', {}, it.sub || []))); UI.count(v, it.value, it.opt || {}); });
    return wrap;
  };
  /** 提交：转圈等待，断网或失败留在对话框里（返回 false） */
  P3.submit = async (fn, ms) => {
    try { await UI.request(null, ms || 400); return await fn(); } catch (e) { UI.toast(e.offline ? '网络不太稳定，请稍后再试' : String(e.message || '保存失败，请重试'), { kind: 'bad' }); return false; }
  };

  /** 不分页的小表格（对话框里放几行对比或说明用）：columns [{title, cls, render(row)}] */
  P3.simpleTable = (caption, columns, rows) => h('div.table-wrap', {}, h('table.table', { 'aria-label': caption }, h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: c.cls || '', text: c.title })))), h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => { const v = c.render(r); return h('td', { class: c.cls || '', 'data-label': c.title }, v == null || v === '' ? '—' : v); }))))));

  /* ---------- 行内“更多”菜单：每次点开临时生成，关闭即移除；disabled 写不可用的原因 ---------- */
  P3.menuOn = (btn, getItems) => {
    btn.setAttribute('aria-haspopup', 'menu');
    btn.addEventListener('click', () => {
      const items = typeof getItems === 'function' ? getItems() : getItems, real = items.filter((it) => it !== 'hr');
      const m = UI.menu(btn, items.map((it) => (it === 'hr' ? it : { ...it, on: it.disabled ? null : it.on })));
      btn.removeAttribute('popovertarget');
      UI.$$('button', m).forEach((b, i) => { const it = real[i]; if (it && it.disabled) { b.disabled = true; b.title = it.disabled; b.append(h('span.muted', { text: '（' + it.disabled + '）' })); } });
      m.addEventListener('toggle', (e) => { if (e.newState === 'closed') setTimeout(() => m.remove(), 300); });
      if (m.showPopover) m.showPopover();
    });
  };

  /* ---------- 标签页：面板第一次打开时才画；返回 {list, panels, show(i), count(i, n)} ---------- */
  P3.tabs = (defs, o) => {
    o = o || {};
    const uid = 'p3t' + Math.random().toString(36).slice(2, 6), list = h('div.tabs', { role: 'tablist', 'aria-label': o.label || '内容分区' }), panels = h('div'), drawn = new Set();
    const draw = (i) => { if (drawn.has(i)) return; drawn.add(i); UI.$('#' + uid + 'p' + i, panels).append(defs[i].render()); };
    defs.forEach((d, i) => {
      list.append(h('button', { type: 'button', role: 'tab', id: uid + 't' + i, 'aria-controls': uid + 'p' + i, 'aria-selected': String(i === (o.start || 0)), tabindex: i === (o.start || 0) ? 0 : -1 }, d.label, d.count != null ? h('span.count', { text: d.count }) : null));
      panels.append(h('div', { role: 'tabpanel', id: uid + 'p' + i, hidden: i !== (o.start || 0), 'aria-labelledby': uid + 't' + i }));
    });
    const api = UI.tabs(list, (i) => { draw(i); o.onChange && o.onChange(i); });
    draw(o.start || 0);
    return { list, panels, show: api.show, count(i, n) { const c = UI.$$('[role=tab]', list)[i].querySelector('.count'); if (c) c.textContent = n; } };
  };

  /* ---------- 离开确认：有未保存修改时，换页、刷新、关闭标签都先问一次 ----------
     优先用浏览器的 Navigation API 拦住地址栏跳转（菜单、演示控制、前进后退都算）；不支持就拦菜单里的链接点击 */
  P3.leaveGuard = (root, isDirty, text) => {
    let seen = false, bypass = false, asking = false;
    const alive = () => { if (root.isConnected) seen = true; return root.isConnected || !seen; };
    const ask = () => UI.confirm(text ? text() : '有修改还没有保存，现在离开会丢掉它们。', { title: '还有未保存的修改', ok: '放弃修改并离开', danger: true });
    const beforeUnload = (e) => { if (!alive()) return window.removeEventListener('beforeunload', beforeUnload); if (isDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    const go = (hash) => { bypass = true; location.hash = hash; bypass = false; };
    if (window.navigation && navigation.addEventListener) {
      const onNav = (e) => {
        if (!alive()) return navigation.removeEventListener('navigate', onNav);
        if (bypass || !isDirty() || !e.cancelable || asking) return;
        const dest = new URL(e.destination.url);
        if (dest.hash === location.hash || dest.origin + dest.pathname + dest.search !== location.origin + location.pathname + location.search) return;
        e.preventDefault(); asking = true;
        ask().then((ok) => { asking = false; if (ok) go(dest.hash); });
      };
      navigation.addEventListener('navigate', onNav);
    } else {
      const onClick = (e) => {
        if (!alive()) return document.removeEventListener('click', onClick, true);
        const a = e.target.closest && e.target.closest('a[href^="#/"]');
        if (!a || bypass || !isDirty()) return;
        e.preventDefault(); e.stopPropagation(); ask().then((ok) => { if (ok) go(a.getAttribute('href')); });
      };
      document.addEventListener('click', onClick, true);
    }
  };
})();
