/* 第二组页面（会员、会员卡、储值、优惠券、门店、排班）的共用件与演示数据补充。
   本文件先于 admin.p2b.js 起的各页面文件载入：这里定义 window.P2（工具函数）、往 B.db 里补充本组页面要用的数据（重置时重新生成），以及“会员”页。 */
(function () {
  'use strict';
  const P2 = (window.P2 = {});
  /* UI.h 的 on 要写成对象；这里允许 on 直接给一个函数，等于 click */
  const h = (tag, props, ...kids) => (props && typeof props.on === 'function' ? UI.h(tag, Object.assign({}, props, { on: { click: props.on } }), ...kids) : UI.h(tag, props, ...kids));
  P2.h = h;

  /* ---------- 图标补充（线性 24 栅格） ---------- */
  Object.assign(UI.icons, {
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    swap: 'M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4',
    pause: 'M8 5v14M16 5v14',
    play: 'M7 4l13 8-13 8z',
    ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
    snow: 'M12 3v18M5 7.5l14 9M5 16.5l14-9',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    flag: 'M5 21V4h11l-2 4 2 4H5',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    sort: 'M8 5v14M4 15l4 4 4-4M16 19V5M12 9l4-4 4 4',
    coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 8l3 4 3-4M9 13h6M9 16h6M12 12v6',
    ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    flash: 'M13 2L4 14h7l-1 8 9-12h-7z',
  });

  /* ---------- 日期与金额 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const TODAY = () => K.ymd(B.NOW());
  const NOWHM = () => pad(B.NOW().getHours()) + ':' + pad(B.NOW().getMinutes());
  const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const dAdd = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return K.ymd(d); };
  const dDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const md = (s) => (!s ? '' : s.slice(0, 4) === TODAY().slice(0, 4) ? s.slice(5) : s);
  const minutesAdd = (at, mins) => { const [d, t] = at.split(' '); const [y, mo, da] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number); return B.fmt(new Date(y, mo - 1, da, hh, mm + mins)); };
  const yuan = (c) => '¥' + (Math.abs(c) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (c) => (c < 0 ? '−' : '+') + yuan(c);
  const last4 = (p) => p.slice(-4);
  const weekStart = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return K.ymd(d); };
  Object.assign(P2, { pad, today: TODAY, nowHM: NOWHM, parse, dAdd, dDiff, md, minutesAdd, yuan, signed, last4, weekStart });
  P2.nowStr = () => B.fmt(B.NOW());
  P2.target = {
    member: (u) => '会员 ' + u.name + '（编号 ' + u.id + '）',
    card: (c) => '会员卡 ' + c.no + '（' + c.userName + '）',
  };
  P2.userById = (id) => B.db.users.find((u) => u.id === id);

  /* ---------- 小件：数字块、徽标、业务错误 ---------- */
  /** 横带里的数字：big 为主角（展示字号），其余 24 号 */
  P2.fresh = true;   /* 页面第一次画的时候数字从 0 数到目标值；之后操作引起的重绘直接显示结果，不重播 */
  P2.stat = (o) => {
    const opt = { prefix: o.prefix || '', suffix: o.suffix || '', dec: o.dec || 0 };
    const v = h('span.stat-value.num', { text: '0' });
    const el = h('div.stat' + (o.big ? '' : '.stat--sm'), {}, h('span.stat-label', { text: o.label }), v, o.sub ? h('span.stat-sub', {}, o.sub) : null);
    if (P2.fresh) UI.count(v, o.value, opt);
    else { v.dataset.v = String(o.value); v.textContent = opt.prefix + o.value.toLocaleString('zh-CN', { minimumFractionDigits: opt.dec, maximumFractionDigits: opt.dec }) + opt.suffix; }
    return el;
  };
  /** 页面 render 一开头调用：这一轮是“第一次画” */
  P2.begin = () => { P2.fresh = true; };
  /** 第一次画完以后调用：之后的重绘不再播计数动画 */
  P2.settled = (v) => { setTimeout(() => (P2.fresh = false), 60); return v; };
  P2.badge = (text, kind) => h('span.badge' + (kind ? '.badge--' + kind : ''), { text });
  P2.fail = (msg) => { throw new Error(msg); };
  /** 取数后写入：先走一次“请求”（断网抛错），再执行 fn；fn 里抛出的业务错误显示成提示 */
  P2.act = async (fn, ms) => {
    try { await UI.request(null, ms || 360); } catch (e) { UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); return { ok: false, offline: true }; }
    try { const v = await fn(); return { ok: v !== false, value: v }; } catch (e) { UI.toast(String((e && e.message) || '操作失败，请稍后再试'), { kind: 'bad' }); return { ok: false, error: e }; }
  };
  /** 新增或改动的行闪一次：背景取主色浅阶，150 毫秒淡入，700 毫秒淡去 */
  P2.flash = (els) => (Array.isArray(els) ? els : [els]).filter(Boolean).forEach((el) => UI.play(el, [{ backgroundColor: 'transparent' }, { backgroundColor: 'var(--brand-line)', offset: 0.18 }, { backgroundColor: 'transparent' }], { duration: 850 }));
  P2.flashRows = (root) => { P2._pend = null; const rows = UI.$$('tr.p2-flash', root); P2.flash(rows); return rows.length; };

  /* ---------- 菜单：点到才创建，清掉已经脱离页面的旧菜单 ---------- */
  const menus = [];
  /** 菜单贴着触发器往下开，快到窗口底部放不下时改成往上开（ui.js 的弹出菜单自己不会翻） */
  P2.fixMenu = (m) => { m.addEventListener('toggle', (e) => { if (e.newState !== 'open') return; m.style.positionArea = ''; requestAnimationFrame(() => { const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 8) m.style.positionArea = 'top span-right'; }); }); return m; };
  P2.menuOn = (trigger, itemsFn) => {
    let made = false;
    const make = () => {
      if (made) return; made = true;
      for (let i = menus.length - 1; i >= 0; i--) if (!menus[i].t.isConnected) { menus[i].m.remove(); menus.splice(i, 1); }
      menus.push({ t: trigger, m: P2.fixMenu(UI.menu(trigger, itemsFn())) });
    };
    trigger.addEventListener('pointerdown', make); trigger.addEventListener('focus', make); trigger.addEventListener('keydown', make);
    return trigger;
  };
  P2.moreBtn = (itemsFn, label) => P2.menuOn(h('button.btn.btn--sm.btn--ghost', { type: 'button', 'aria-label': label || '更多操作' }, UI.icon('more', 'icon--sm')), itemsFn);

  /* ---------- 小表格（详情里的记录列表）：最多显示 limit 条 ---------- */
  P2.mini = (columns, rows, emptyText, limit) => {
    const lim = limit || 30;
    if (!rows.length) return h('div.p2-mini-empty', { text: emptyText || '暂无记录' });
    return h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: c.cls || '', text: c.title })))), h('tbody', {}, rows.slice(0, lim).map((r) => h('tr', {}, columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h('td', { class: c.cls || '', 'data-label': c.title }, v == null || v === '' ? '—' : v); }))))), rows.length > lim ? h('div.muted.p2-more', { text: '仅显示最近 ' + lim + ' 条，共 ' + rows.length + ' 条' }) : null);
  };

  /* ---------- 筛选条：defs = [{key,label,type:'select'|'date'|'num', options:[[值,文字]], unit, placeholder}] ----------
     select 一个键；date 与 num 是区间，键为 key+'Min'/'Max'（日期用 From/To）；返回 {el, get(), reset()} */
  P2.fbar = (defs, onChange) => {
    const state = {}, ctrls = [], setters = {};
    let tm;
    const fire = () => { clearTimeout(tm); tm = setTimeout(onChange, 220); };
    const el = h('div.p2-fgrid', {}, defs.map((d) => {
      const wrap = h('div.p2-f', {}, h('span.p2-f-label', { text: d.label }));
      if (d.type === 'select') {
        const s = h('select.select', { 'aria-label': d.label, on: { change: () => { state[d.key] = s.value; onChange(); } } }, d.options.map(([v, l]) => h('option', { value: v, text: l })));
        state[d.key] = d.options[0][0]; ctrls.push(() => { s.value = d.options[0][0]; state[d.key] = d.options[0][0]; }); setters[d.key] = (v) => { s.value = v; state[d.key] = v; }; wrap.append(s);
      } else {
        const t = d.type === 'date' ? 'date' : 'number', k1 = d.key + (d.type === 'date' ? 'From' : 'Min'), k2 = d.key + (d.type === 'date' ? 'To' : 'Max');
        const mk = (k, ph) => { const i = h('input.input', { type: t, 'aria-label': d.label + (ph || ''), placeholder: d.placeholder || '', min: d.type === 'num' ? 0 : null, inputmode: d.type === 'num' ? 'decimal' : null, on: { input: () => { state[k] = i.value; fire(); } } }); state[k] = ''; ctrls.push(() => { i.value = ''; state[k] = ''; }); return i; };
        wrap.append(h('div.p2-range', {}, mk(k1, '（起）'), h('span.muted', { text: '至' }), mk(k2, '（止）'), d.unit ? h('span.muted', { text: d.unit }) : null));
      }
      return wrap;
    }));
    const api = { el, get: () => state, set(k, v) { setters[k] && setters[k](v); }, reset() { ctrls.forEach((f) => f()); onChange(); } };
    /* 重置按钮放进筛选网格的最后一格 */
    api.addReset = (before) => { el.append(h('div.p2-f.p2-f-act', {}, h('button.btn', { type: 'button', text: '重置筛选', on: () => { before && before(); api.reset(); } }))); };
    return api;
  };

  /* ---------- 带校验的表单对话框：可在 check 里做跨字段校验，submit 失败留在对话框里 ----------
     P2.form({title, fields, lead, ok, danger, size, check(values)→{字段名:提示}, submit(values), onBuild(f, body)}) → Promise<值|null> */
  P2.form = (o) => {
    const f = A2.form(o.fields);
    let result = null;
    const body = h('div.stack.p2-dlg', {}, o.lead ? (typeof o.lead === 'string' ? h('p', { text: o.lead }) : o.lead) : null, f.el);
    o.onBuild && o.onBuild(f, body);
    return UI.dialog({ title: o.title, size: o.size, body, actions: [{ label: o.cancel || '取消', value: null }, { label: o.ok || '保存', kind: o.danger ? 'danger.solid' : 'primary', value: 'ok', on: async () => {
      if (!f.validate()) return false;
      const vals = f.values();
      const errs = o.check && o.check(vals);
      if (errs && Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => f.error(k, m)); return false; }
      try { await UI.request(null, 400); if (o.submit) { const r = await o.submit(vals); if (r === false) return false; } result = vals; }
      catch (e) { UI.toast(e && e.offline ? '网络不太稳定，请稍后再试' : String((e && e.message) || '保存失败，请稍后再试'), { kind: 'bad' }); return false; }
    } }] }).then((v) => (v === 'ok' ? result : null));
  };
  /** 字段节点（用来按条件显示或隐藏）：按表单里的顺序取 */
  P2.fieldAt = (f, i) => f.el.children[i];

  /* ---------- 批量结果：成功几条、失败几条和各自原因 ---------- */
  P2.report = (title, ok, fails) => UI.dialog({ title, size: 'sm', body: h('div.stack.p2-dlg', {}, h('div.row.wrap', {}, h('span.badge.badge--ok', { text: '成功 ' + ok + ' 条' }), h('span.badge' + (fails.length ? '.badge--bad' : ''), { text: '失败 ' + fails.length + ' 条' })), fails.length ? h('ul.p2-faillist', { role: 'list' }, fails.map((x) => h('li', {}, h('b', { text: x.name }), h('span', { text: x.reason })))) : h('p.muted', { text: '已全部处理完成' })), actions: [{ label: '知道了', kind: 'primary', value: 'ok' }] });

  /* ---------- 标签页（状态）带数量，下方跟一块面板；返回 {el, set(list,value)} ---------- */
  P2.tabsRow = (label) => h('div.tabs', { role: 'tablist', 'aria-label': label || '分类' });
  P2.paintTabs = (host, list, value, onChange) => host.replaceChildren(...list.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(t.id === value), on: { click: () => onChange(t.id) } }, t.label, h('span.count', { text: t.count }))));
  P2.seg = (label, items, value, onChange) => {
    const box = h('div.seg', { role: 'group', 'aria-label': label });
    const paint = () => box.replaceChildren(...items.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === value), text: l, on: { click: () => { value = v; paint(); onChange(v); } } })));
    paint(); return box;
  };

  /* ---------- 演示数据补充：每次 B.reset 之后重新生成；各页面文件用 P2.onSeed 登记自己的 ---------- */
  const seeders = [];
  P2.onSeed = (fn) => { seeders.push(fn); fn(B.db); };
  const baseReset = B.reset;
  B.reset = function () { const db = baseReset.apply(this, arguments); seeders.forEach((fn) => fn(db)); return db; };

  const LEVELS = ['普通', '银卡', '金卡'];
  P2.LEVELS = LEVELS;

  /* 会员：注册时间偏向近期（折线才有走势）、本月一定有新增；积分记录与余额由下面的储值流水推出 */
  P2.onSeed((db) => {
    const r = B.rng(97), today = TODAY();
    db.users.forEach((u) => { if (u.id === 1) return; if (r() < 0.55) u.joined = dAdd(today, -Math.floor(84 * Math.pow(r(), 1.7))); });
    const dom = parse(today).getDate();
    [5, 11, 23].forEach((id, k) => { const u = db.users.find((x) => x.id === id); if (u) u.joined = dAdd(today, -Math.min(k, dom - 1)); });
    db.users.forEach((u) => { u.joined = u.joined > today ? today : u.joined; });
    /* 积分记录：正向条目之和 = 当前积分 + 兑换扣减，倒推出每条之后的积分 */
    const src = ['下单获得', '下单获得', '签到奖励', '活动奖励'];
    const logs = [];
    db.users.forEach((u) => {
      const redeem = u.points > 400 && r() < 0.5 ? Math.round((u.points * (0.1 + r() * 0.2)) / 10) * 10 : 0;
      const n = 2 + Math.floor(r() * 4), total = u.points + redeem, parts = [];
      let left = total; for (let i = 0; i < n; i++) { const p = i === n - 1 ? left : Math.max(0, Math.round((left * (0.25 + r() * 0.4)) / 10) * 10); parts.push(p); left -= p; }
      const span = Math.max(1, dDiff(today, u.joined)), ev = parts.filter((p) => p > 0).map((p, i) => ({ d: p, why: i === 0 ? '注册赠送' : src[Math.floor(r() * src.length)] }));
      if (redeem) ev.splice(Math.max(1, ev.length - 1), 0, { d: -redeem, why: '积分兑换' });
      ev.forEach((e, i) => { const day = dAdd(u.joined, Math.floor((span * (i + 1)) / (ev.length + 1))); e.at = day + ' ' + pad(9 + Math.floor(r() * 11)) + ':' + pad(Math.floor(r() * 60)); });
      let bal = 0; ev.forEach((e) => { bal += e.d; logs.push({ id: 0, userId: u.id, at: e.at, delta: e.d, balance: bal, reason: e.why, by: '系统' }); });
      if (bal !== u.points) u.points = bal;
    });
    logs.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((l, i) => (l.id = i + 1));
    db.pointLogs = logs.reverse();
  });

  /* ================================================================ 会员 ================================================================ */
  const STATUS = { ENABLED: ['正常', 'ok'], DISABLED: ['已禁用', 'bad'] };
  const lvBadge = (lv) => h('span.badge' + (lv === '金卡' ? '.badge--warn' : lv === '银卡' ? '.badge--info' : ''), { text: lv });
  P2.lvBadge = lvBadge;
  const holdsCard = (uid) => B.db.cards.some((c) => c.userId === uid && ['ACTIVE', 'FROZEN'].includes(P2.cardState ? P2.cardState(c) : c.status));

  window.PAGES2.members = {
    title: '会员', group: '会员',
    layout: '横带分层',
    reason: '运营先看会员盘子有多大、最近有没有增长、等级怎么分布，再去明细里找人处理：三条带从结论走到明细，数字带里只有会员总数用展示字号，其余缩成小数字',
    scenes: [
      { id: 'nodata', label: '所选范围没有会员' },
      { id: 'disable-conflict', label: '禁用失败：会员有支付中的订单' },
      { id: 'points-busy', label: '积分调整失败：积分正被订单锁定' },
      { id: 'coupon-soldout', label: '发券失败：券已发完' },
      { id: 'export-busy', label: '导出失败：导出任务排队过多' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有会员');
      if (early) return early;
      P2.begin();
      const S = { status: 'ALL', q: '', sort: 'joined' }, flashIds = new Set();
      const page = h('section.page.p2-page'), root = h('div.l-bands');
      const today = TODAY();
      const orderOf = (uid) => B.db.orders.filter((o) => o.userId === uid);
      const activeSet = () => { const since = dAdd(today, -7), cnt = {}, set = new Set(); B.db.orders.forEach((o) => { if (['PAID', 'FULFILLED', 'DONE'].includes(o.status) && o.createdAt.slice(0, 10) >= since) cnt[o.userId] = (cnt[o.userId] || 0) + 1; }); Object.keys(cnt).forEach((k) => cnt[k] >= 2 && set.add(Number(k))); return set; };

      /* ----- 第一条带：概览数字 ----- */
      const statsBand = h('section.band', { 'aria-label': '会员概览' });
      const paintStats = () => {
        const us = B.db.users, ms = today.slice(0, 8) + '01', act = activeSet();
        const dis = us.filter((u) => u.status === 'DISABLED').length, newM = us.filter((u) => u.joined >= ms).length, bal = us.reduce((a, u) => a + u.balance, 0), pts = us.reduce((a, u) => a + u.points, 0);
        statsBand.replaceChildren(h('div.band-title', {}, h('h2', { text: '会员概览' }), h('span.muted', { text: '截至 ' + P2.md(P2.nowStr()) })), h('div.band-stats', {},
          P2.stat({ label: '会员总数', value: us.length, suffix: ' 人', big: true, sub: h('span', { text: '其中已禁用 ' + dis + ' 人' }) }),
          P2.stat({ label: '本月新增', value: newM, suffix: ' 人', sub: h('span', { text: ms.slice(5) + ' 起' }) }),
          P2.stat({ label: '活跃会员', value: act.size, suffix: ' 人', sub: h('span', { text: '近 7 天 2 单以上，占 ' + Math.round((act.size / Math.max(1, us.length)) * 100) + '%' }) }),
          P2.stat({ label: '会员余额合计', value: bal / 100, prefix: '¥', dec: 2, sub: h('span', { text: '人均 ' + yuan(bal / Math.max(1, us.length)) }) }),
          P2.stat({ label: '积分合计', value: pts, sub: h('span', { text: '人均 ' + Math.round(pts / Math.max(1, us.length)) + ' 分' }) })));
      };

      /* ----- 第二条带：近 12 周新增折线 + 等级分布 ----- */
      const trendBand = h('section.band', { 'aria-label': '新增与等级' });
      const paintTrend = () => {
        const us = B.db.users, w0 = weekStart(dAdd(today, -77)), weeks = Array.from({ length: 12 }, (_, i) => dAdd(w0, i * 7));
        const data = weeks.map((w) => us.filter((u) => u.joined >= w && u.joined < dAdd(w, 7)).length), sum = data.reduce((a, b) => a + b, 0), top = Math.max(...data), topW = weeks[data.indexOf(top)];
        const lv = LEVELS.map((n, i) => ({ name: n, value: us.filter((u) => u.level === n).length, color: ['var(--ch-3)', 'var(--ch-6)', 'var(--ch-2)'][i] }));
        const line = h('div.p2-chart-line'), dn = h('div');
        trendBand.replaceChildren(h('div.band-title', {}, h('h2', { text: '新增与等级' }), h('span.muted', { text: '近 12 周按周统计' })),
          h('div.p2-trend', {}, h('div', {}, line, h('p.muted.p2-chart-note', { text: '近 12 周共新增 ' + sum + ' 人，最多的一周是 ' + P2.md(topW) + ' 起，新增 ' + top + ' 人。' })),
            h('div.p2-donut', {}, dn, h('ul.p2-legend', { role: 'list' }, lv.map((x) => h('li', {}, h('i', { style: { background: x.color } }), h('span', { text: x.name }), h('b.num', { text: x.value + ' 人' }), h('span.muted.num', { text: Math.round((x.value / Math.max(1, us.length)) * 100) + '%' })))))));
        requestAnimationFrame(() => {
          UI.line(line, { labels: weeks.map((w) => P2.md(w).replace('-', '/')), series: [{ name: '新增会员', data }], unit: ' 人', height: 220, aria: '近 12 周新增会员折线图，合计 ' + sum + ' 人，最多的一周 ' + top + ' 人' });
          UI.donut(dn, lv, { size: 160, center: { value: us.length, label: '会员' }, aria: '会员等级分布：' + lv.map((x) => x.name + ' ' + x.value + ' 人').join('，') });
        });
      };

      /* ----- 第三条带：会员明细 ----- */
      const fb = P2.fbar([
        { key: 'join', label: '注册时间', type: 'date' },
        { key: 'level', label: '等级', type: 'select', options: [['ALL', '全部等级'], ...LEVELS.map((l) => [l, l])] },
        { key: 'spent', label: '累计消费', type: 'num', unit: '元' },
        { key: 'card', label: '会员卡', type: 'select', options: [['ALL', '全部'], ['HAS', '持有有效卡'], ['NONE', '没有卡']] },
        { key: 'bal', label: '储值余额', type: 'num', unit: '元' },
      ], () => draw());
      const tabsHost = P2.tabsRow('会员状态'), batchBar = h('div.p2-batch', { hidden: true }), count = h('span.muted.num');
      const lvSeg = h('div.seg.p2-lvseg', { role: 'group', 'aria-label': '等级' });
      const sortSel = h('select.select', { 'aria-label': '排序', style: { width: '152px' }, on: { change: (e) => { S.sort = e.target.value; draw(); } } }, [['joined', '最近注册'], ['spent', '消费从高到低'], ['balance', '余额从高到低'], ['points', '积分从高到低']].map(([v, l]) => h('option', { value: v, text: l })));
      const search = A2.search('搜索姓名或手机号后四位', (v) => { S.q = v; draw(); }); search.style.width = '280px';
      fb.addReset(() => { S.q = ''; search.value = ''; });
      const tbl = A2.table({
        caption: '会员明细', selectable: A2.can('coupon') || A2.can('disable'), empty: '没有符合条件的会员', rowClass: (u) => (flashIds.has(u.id) ? 'p2-flash' : ''),
        onSelect: (rows) => paintBatch(rows),
        columns: [
          { key: 'name', title: '姓名', render: (u) => h('b', { text: u.name }) },
          { key: 'phone', title: '手机号', cls: 'c', render: (u) => B.maskPhone(u.phone) },
          { key: 'level', title: '等级', cls: 'c', render: (u) => lvBadge(u.level) },
          { key: 'points', title: '积分', cls: 'r' },
          { key: 'balance', title: '余额', cls: 'r', render: (u) => yuan(u.balance) },
          { key: 'spent', title: '累计消费', cls: 'r', render: (u) => yuan(u.spent) },
          { key: 'cards', title: '会员卡', cls: 'c', render: (u) => { const n = B.db.cards.filter((c) => c.userId === u.id && ['ACTIVE', 'FROZEN'].includes(P2.cardState(c))).length; return n ? n + ' 张' : '无'; } },
          { key: 'joined', title: '注册时间', cls: 'c', render: (u) => P2.md(u.joined) },
          { key: 'status', title: '状态', cls: 'c', render: (u) => A2.status(STATUS, u.status) },
          { key: 'act', title: '操作', cls: 'c', render: (u) => h('div.row', { style: { justifyContent: 'center', gap: 'var(--s-1)' } }, h('button.btn.btn--sm', { type: 'button', text: '查看', on: { click: () => openDetail(u.id) } }), rowMenu(u)) },
        ],
      });
      function rowMenu(u) {
        const items = [];
        if (A2.can('coupon')) items.push({ label: '发券', icon: 'ticket', on: () => issueCoupon([u]) });
        if (A2.can('adjust')) items.push({ label: '调整积分', icon: 'star', on: () => adjustPoints(u) });
        if (A2.can('issue')) items.push({ label: '发卡', icon: 'card', on: () => P2.issueCard(u).then((c) => c && afterChange([u.id])) });
        if (A2.can('disable')) items.push('hr', u.status === 'ENABLED' ? { label: '禁用会员', icon: 'ban', danger: true, on: () => toggle(u) } : { label: '启用会员', icon: 'check', on: () => toggle(u) });
        return items.length ? P2.moreBtn(() => items, '更多操作：' + u.name) : h('span');
      }

      const match = (u, skip) => {
        const g = fb.get();
        if (skip !== 'status' && S.status !== 'ALL' && u.status !== S.status) return false;
        if (skip !== 'level' && g.level !== 'ALL' && u.level !== g.level) return false;
        if (g.joinFrom && u.joined < g.joinFrom) return false;
        if (g.joinTo && u.joined > g.joinTo) return false;
        if (g.spentMin !== '' && u.spent < Number(g.spentMin) * 100) return false;
        if (g.spentMax !== '' && u.spent > Number(g.spentMax) * 100) return false;
        if (g.balMin !== '' && u.balance < Number(g.balMin) * 100) return false;
        if (g.balMax !== '' && u.balance > Number(g.balMax) * 100) return false;
        if (g.card === 'HAS' && !holdsCard(u.id)) return false;
        if (g.card === 'NONE' && holdsCard(u.id)) return false;
        if (S.q) { if (/^\d{4}$/.test(S.q)) { if (last4(u.phone) !== S.q) return false; } else if (!u.name.includes(S.q)) return false; }
        return true;
      };
      function rowsNow() {
        const rows = B.db.users.filter((u) => match(u));
        const key = { joined: (u) => u.joined + pad(u.id), spent: (u) => u.spent, balance: (u) => u.balance, points: (u) => u.points }[S.sort];
        rows.sort((a, b) => (key(a) < key(b) ? 1 : -1));
        return ctx.scene === 'nodata' ? [] : rows;
      }
      function paintBatch(sel) {
        sel = sel || tbl.selected();
        batchBar.hidden = !sel.length;
        batchBar.replaceChildren(h('b.num', { text: '已选 ' + sel.length + ' 人' }),
          A2.can('coupon') ? h('button.btn.btn--sm', { type: 'button', text: '批量发券', on: () => issueCoupon(tbl.selected()) }) : null,
          A2.can('disable') ? h('button.btn.btn--sm.btn--danger', { type: 'button', text: '批量禁用', on: () => batchDisable(tbl.selected()) }) : null,
          h('button.btn.btn--sm.btn--ghost', { type: 'button', text: '取消选择', on: () => { tbl.clear(); paintBatch([]); } }));
      }
      function draw() {
        const rows = rowsNow();
        P2.paintTabs(tabsHost, [['ALL', '全部'], ['ENABLED', '正常'], ['DISABLED', '已禁用']].map(([id, l]) => ({ id, label: l, count: B.db.users.filter((u) => match(u, 'status') && (id === 'ALL' || u.status === id)).length })), S.status, (v) => { S.status = v; draw(); });
        lvSeg.replaceChildren(...[['ALL', '全部等级'], ...LEVELS.map((l) => [l, l])].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(fb.get().level === v), on: { click: () => { fb.set('level', v); draw(); } } }, l, ' ', h('span.num.p2-seg-n', { text: B.db.users.filter((u) => match(u, 'level') && (v === 'ALL' || u.level === v)).length }))));
        count.textContent = '共 ' + rows.length + ' 人';
        tbl.setRows(rows); paintBatch([]);
        if (flashIds.size) { P2.flashRows(tbl.el); flashIds.clear(); }
      }
      const exportBtn = A2.can('export') ? h('button.btn', { type: 'button', on: () => { if (ctx.scene === 'export-busy') return UI.toast('导出失败：当前已有 3 个导出任务在排队，请稍后再试', { kind: 'bad' }); A2.export('会员列表_脱敏', '会员', rowsNow().length); } }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : null;
      const listBand = h('section.band', { 'aria-label': '会员明细' }, h('div.band-title', {}, h('h2', { text: '会员明细' }), h('div.row.wrap', {}, count, exportBtn ? h('span.muted', { text: '导出的手机号已脱敏' }) : null, exportBtn)),
        h('div.p2-filterbox', {}, fb.el, h('div.row.wrap', {}, search, sortSel)),
        tabsHost, h('div.row.wrap.between', {}, lvSeg), batchBar, tbl.el);

      /* ----- 操作 ----- */
      function afterChange(ids) { ids.forEach((id) => flashIds.add(id)); paintStats(); draw(); }
      async function toggle(u) {
        if (u.status === 'ENABLED') {
          const pend = orderOf(u.id).filter((o) => ['UNPAID', 'PAID'].includes(o.status)).length;
          const reason = await A2.reason('禁用会员：' + u.name, '禁用后该会员不能下单，也不能领券；已支付的订单照常履约' + (pend ? '（目前有 ' + pend + ' 笔待支付或待履约订单）' : '') + '。请写明原因。');
          if (!reason) return false;
          const r = await P2.act(() => { if (ctx.scene === 'disable-conflict') P2.fail('禁用失败：' + u.name + ' 有 1 笔订单正在支付中，请等支付结果出来后再试'); u.status = 'DISABLED'; A2.audit('member:edit', '禁用会员：' + reason, P2.target.member(u)); });
          if (r.ok) { UI.toast('已禁用 ' + u.name); afterChange([u.id]); }
          return r.ok;
        }
        if (!(await UI.confirm('启用后 ' + u.name + ' 可以正常下单、领券和使用会员卡。', { title: '启用会员', ok: '确认启用' }))) return false;
        const r = await P2.act(() => { u.status = 'ENABLED'; A2.audit('member:edit', '启用会员', P2.target.member(u)); });
        if (r.ok) { UI.toast('已启用 ' + u.name); afterChange([u.id]); }
        return r.ok;
      }
      async function batchDisable(sel) {
        if (!sel.length) return;
        const reason = await A2.reason('批量禁用 ' + sel.length + ' 名会员', '禁用后这些会员不能下单、不能领券；已禁用的会跳过。请写明原因。');
        if (!reason) return;
        const r = await P2.act(() => 0, 500); if (!r.ok) return;
        let ok = 0; const fails = [];
        sel.forEach((u) => {
          if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '本来就是禁用状态' });
          if (ctx.scene === 'disable-conflict' && u.id % 3 === 0) return fails.push({ name: u.name, reason: '有订单正在支付中' });
          u.status = 'DISABLED'; ok++; A2.audit('member:edit', '批量禁用会员：' + reason, P2.target.member(u));
        });
        afterChange(sel.map((u) => u.id)); await P2.report('批量禁用结果', ok, fails);
      }
      async function adjustPoints(u) {
        const v = await P2.form({ title: '调整积分：' + u.name, size: 'sm', ok: '下一步', lead: '当前积分 ' + u.points + ' 分。调整会记入积分记录和操作记录。',
          fields: [{ name: 'dir', label: '方向', type: 'select', options: [{ v: 'add', l: '增加积分' }, { v: 'sub', l: '扣减积分' }], value: 'add' }, { name: 'n', label: '积分数', type: 'number', required: true, hint: '单次最多调整 5000 分', validate: (x) => (!Number.isInteger(x) || x < 1 ? '请填写大于 0 的整数' : x > 5000 ? '单次最多调整 5000 分' : '') }, { name: 'reason', label: '原因', type: 'textarea', required: true, max: 100 }],
          check: (x) => (x.dir === 'sub' && x.n > u.points ? { n: '扣减后积分不能为负，当前只有 ' + u.points + ' 分' } : null) });
        if (!v) return false;
        const delta = (v.dir === 'sub' ? -1 : 1) * v.n;
        if (!(await A2.danger('将为 ' + u.name + '（尾号 ' + last4(u.phone) + '）' + (delta < 0 ? '扣减 ' : '增加 ') + v.n + ' 积分，调整后为 ' + (u.points + delta) + ' 分。原因：' + v.reason + '。', { ok: '确认调整', title: '二次确认' }))) return false;
        const r = await P2.act(() => { if (ctx.scene === 'points-busy') P2.fail('积分调整失败：该会员的积分正被一笔订单锁定，请稍后再试'); u.points += delta; B.db.pointLogs.unshift({ id: B.db.pointLogs.length + 1, userId: u.id, at: P2.nowStr(), delta, balance: u.points, reason: '人工调整：' + v.reason, by: A2.me().name }); A2.audit('member:edit', '积分' + (delta < 0 ? '扣减 ' : '增加 ') + v.n + '：' + v.reason, P2.target.member(u)); });
        if (r.ok) { UI.toast('积分已调整为 ' + u.points); afterChange([u.id]); }
        return r.ok;
      }
      async function issueCoupon(list) {
        const cps = B.db.coupons.filter((c) => P2.couponCol(c) === 'ON');
        if (!cps.length) return UI.toast('现在没有进行中的券可以发', { kind: 'bad' });
        const many = list.length > 1;
        const v = await P2.form({ title: many ? '给 ' + list.length + ' 名会员发券' : '给 ' + list[0].name + ' 发券', size: 'sm', ok: '确认发放',
          fields: [{ name: 'cid', label: '券', type: 'select', options: cps.map((c) => ({ v: String(c.id), l: c.name + '（剩余 ' + (c.stock - c.claimed) + ' 张）' })), value: String(cps[0].id) }, { name: 'n', label: '每人张数', type: 'number', required: true, value: 1, validate: (x) => (!Number.isInteger(x) || x < 1 || x > 5 ? '每人 1 到 5 张' : '') }, { name: 'reason', label: many ? '发放原因' : '发放原因（选填）', type: 'textarea', required: many, max: 100 }],
          check: (x) => { if (many) return null; const cp = cps.find((c) => String(c.id) === x.cid), u = list[0], has = B.db.myCoupons.filter((m) => m.userId === u.id && m.couponId === cp.id).length; if (u.status === 'DISABLED') return { cid: '这位会员已禁用，不能发券' }; if (has + x.n > cp.perUser) return { n: u.name + ' 已领 ' + has + ' 张，超过本券每人限领 ' + cp.perUser + ' 张' }; if (cp.claimed + x.n > cp.stock) return { n: '库存只剩 ' + (cp.stock - cp.claimed) + ' 张' }; return null; },
          submit: (x) => { if (ctx.scene === 'coupon-soldout') P2.fail('发券失败：「' + cps.find((c) => String(c.id) === x.cid).name + '」已经发完了'); } });
        if (!v) return false;
        const cp = cps.find((c) => String(c.id) === v.cid);
        const r = await P2.act(() => {
          let ok = 0; const fails = [];
          list.forEach((u) => {
            const has = B.db.myCoupons.filter((x) => x.userId === u.id && x.couponId === cp.id).length;
            if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '会员已禁用，不能发券' });
            if (has + v.n > cp.perUser) return fails.push({ name: u.name, reason: '已领 ' + has + ' 张，超过每人限领 ' + cp.perUser + ' 张' });
            if (cp.claimed + v.n > cp.stock) return fails.push({ name: u.name, reason: '券的库存不够了' });
            P2.grantCoupon(cp, u, v.n, '后台发放'); ok++;
            A2.audit('coupon:edit', '发券「' + cp.name + '」×' + v.n + (v.reason ? '：' + v.reason : ''), P2.target.member(u));
          });
          return { ok, fails };
        }, many ? 600 : 360);
        if (!r.ok) return false;
        const { ok, fails } = r.value;
        afterChange(list.filter((u) => !fails.some((f) => f.name === u.name)).map((u) => u.id));
        if (many || fails.length) await P2.report('发券结果', ok, fails); else UI.toast('已发放「' + cp.name + '」×' + v.n);
        return true;
      }
      P2.issueCoupon = issueCoupon;

      /* ----- 详情 ----- */
      function openDetail(uid) {
        let revealed = false;
        const u = () => P2.userById(uid), box = (paint) => { const n = h('div'); n.paint = () => n.replaceChildren(paint()); n.paint(); return n; };
        const head = box(() => {
          const x = u(), cards = B.db.cards.filter((c) => c.userId === x.id), pend = orderOf(x.id).filter((o) => ['UNPAID', 'PAID'].includes(o.status)).length;
          const phone = h('span.row', { style: { gap: 'var(--s-2)' } }, h('span.num', { text: revealed ? x.phone : B.maskPhone(x.phone) }), revealed ? h('span.badge.badge--plain', { text: '已记入审计' }) : h('button.btn.btn--sm', { type: 'button', text: '查看完整手机号', on: () => { revealed = true; A2.audit('member:view', '查看完整手机号', P2.target.member(x)); UI.toast('已显示完整手机号，并记入审计'); repaint(); } }, UI.icon('eye', 'icon--sm')));
          const acts = h('div.row.wrap');
          if (A2.can('coupon')) acts.append(h('button.btn.btn--sm', { type: 'button', text: '发券', on: async () => { if (await issueCoupon([x])) repaint(); } }));
          if (A2.can('adjust')) acts.append(h('button.btn.btn--sm', { type: 'button', text: '调整积分', on: async () => { if (await adjustPoints(x)) repaint(); } }));
          if (A2.can('issue')) acts.append(h('button.btn.btn--sm', { type: 'button', text: '发卡', on: async () => { if (await P2.issueCard(x)) { afterChange([x.id]); repaint(); } } }));
          if (A2.can('disable')) acts.append(x.status === 'ENABLED' ? h('button.btn.btn--sm.btn--danger', { type: 'button', text: '禁用会员', on: async () => { if (await toggle(x)) repaint(); } }) : h('button.btn.btn--sm', { type: 'button', text: '启用会员', on: async () => { if (await toggle(x)) repaint(); } }));
          return h('div.stack', {}, h('div.p2-kpis', {}, [['积分', x.points + ' 分'], ['储值余额', yuan(x.balance)], ['累计消费', yuan(x.spent)], ['订单数', x.orders + ' 单']].map(([k, v]) => h('div', {}, h('span.muted', { text: k }), h('b.num', { text: v })))),
            A2.kv([['姓名', x.name], ['手机号', phone], ['等级', lvBadge(x.level)], ['状态', A2.status(STATUS, x.status)], ['注册时间', x.joined], ['持有会员卡', cards.length ? cards.length + ' 张（' + cards.filter((c) => P2.cardState(c) === 'ACTIVE').length + ' 张生效中）' : '无'], ['待处理订单', pend ? pend + ' 笔待支付或待履约' : '无']]),
            acts.children.length ? h('div', {}, h('div.muted', { style: { marginBottom: 'var(--s-2)' }, text: '操作' }), acts) : null);
        });
        const ORD = { UNPAID: ['待支付', 'warn'], PAID: ['待履约', 'info'], FULFILLED: ['已出餐', 'info'], DONE: ['已完成', 'ok'], CANCELLED: ['已取消', ''], REFUNDING: ['退款中', 'warn'], REFUNDED: ['已退款', ''] };
        const tOrders = box(() => P2.mini([{ title: '订单号', render: (o) => o.no }, { title: '下单时间', cls: 'c', render: (o) => P2.md(o.createdAt) }, { title: '金额', cls: 'r', render: (o) => yuan(o.amount) }, { title: '支付', cls: 'c', render: (o) => B.PAY[o.pay] }, { title: '状态', cls: 'c', render: (o) => A2.status(ORD, o.status) }], orderOf(uid), '还没有订单'));
        const tCards = box(() => P2.mini([{ title: '卡号', render: (c) => c.no }, { title: '卡种', render: (c) => c.typeName }, { title: '有效期至', cls: 'c', render: (c) => P2.md(c.expire) }, { title: '剩余', cls: 'c', render: (c) => P2.cardRemain(c) }, { title: '状态', cls: 'c', render: (c) => A2.status(P2.CARD_STATUS, P2.cardState(c)) }], B.db.cards.filter((c) => c.userId === uid), '没有持有会员卡'));
        const WL = { 充值: 'ok', 赠送: 'ok', 消费: '', 退款: 'info', 调整: 'warn' };
        const tWallet = box(() => P2.mini([{ title: '时间', cls: 'c', render: (l) => P2.md(l.at) }, { title: '类型', cls: 'c', render: (l) => P2.badge(l.kind, WL[l.kind]) }, { title: '金额', cls: 'r', render: (l) => signed(l.amount) }, { title: '余额', cls: 'r', render: (l) => yuan(l.balance) }, { title: '关联', render: (l) => l.ref }], B.db.walletLogs.filter((l) => l.userId === uid), '还没有储值流水'));
        const CST = { UNUSED: ['未使用', 'ok'], USED: ['已使用', ''], EXPIRED: ['已过期', 'warn'] };
        const tCoupons = box(() => P2.mini([{ title: '券', render: (c) => c.name }, { title: '来源', cls: 'c', render: (c) => c.source || '领取' }, { title: '领取时间', cls: 'c', render: (c) => P2.md(c.at || '') }, { title: '有效期至', cls: 'c', render: (c) => P2.md(c.expire) }, { title: '状态', cls: 'c', render: (c) => A2.status(CST, c.state) }], B.db.myCoupons.filter((c) => c.userId === uid), '没有领取过优惠券'));
        const tPoints = box(() => P2.mini([{ title: '时间', cls: 'c', render: (l) => P2.md(l.at) }, { title: '变动', cls: 'r', render: (l) => (l.delta > 0 ? '+' : '−') + Math.abs(l.delta) }, { title: '变动后', cls: 'r', render: (l) => l.balance }, { title: '原因', render: (l) => l.reason }, { title: '操作人', cls: 'c', render: (l) => l.by }], B.db.pointLogs.filter((l) => l.userId === uid), '还没有积分记录'));
        const tAudit = box(() => P2.mini([{ title: '时间', cls: 'c', render: (a) => P2.md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }, { title: '结果', cls: 'c', render: (a) => a.result }], B.db.audit.filter((a) => a.target.includes('（编号 ' + uid + '）')), '还没有对这位会员的操作记录'));
        const parts = [head, tOrders, tCards, tWallet, tCoupons, tPoints, tAudit];
        const repaint = () => { parts.forEach((p) => p.paint()); };
        A2.detail({ title: '会员详情：' + u().name, tabs: [['overview', '概况', head], ['orders', '订单', tOrders], ['cards', '会员卡', tCards], ['wallet', '储值流水', tWallet], ['coupons', '优惠券', tCoupons], ['points', '积分记录', tPoints], ['audit', '操作记录', tAudit]].map(([id, label, node]) => ({ id, label, node })) });
      }

      root.append(statsBand, trendBand, listBand);
      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '会员' }), h('p.muted', { text: '会员盘子、增长和明细' }))), root);
      return A2.load(() => { paintStats(); paintTrend(); draw(); return P2.settled(page); });
    },
  };

  /* 给会员券、会员卡复用的小函数 */
  P2.grantCoupon = (cp, u, n, source) => {
    for (let i = 0; i < n; i++) {
      const expire = cp.validType === 'fixed' ? cp.to : P2.dAdd(TODAY(), cp.days);
      B.db.myCoupons.unshift({ id: B.db.myCoupons.length + 1, userId: u.id, couponId: cp.id, name: cp.name, kind: cp.kind, threshold: cp.threshold, value: cp.value, expire, state: 'UNUSED', at: P2.nowStr(), source });
    }
    cp.claimed += n;
  };
})();
