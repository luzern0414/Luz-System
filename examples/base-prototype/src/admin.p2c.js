/* 储值：横带分层。读写 B.db.walletLogs / walletPlans / walletDiffs / users.balance；人工调整同步会员余额与流水，对账按日汇总并与会员余额合计核对。 */
(function () {
  'use strict';
  const h = P2.h;
  const { today: TODAY, yuan, signed, dAdd, md, pad, last4, minutesAdd } = P2;

  const KIND_BADGE = { 充值: 'ok', 赠送: 'brand', 消费: '', 退款: 'info', 调整: 'warn' };
  const ledgerBal = (uid) => B.db.walletLogs.reduce((a, l) => (l.userId === uid ? a + l.amount : a), 0);
  P2.ledgerBal = ledgerBal;

  /* ---------- 演示数据：用真实的“储值余额支付”订单推出消费，余额不够时先有充值；最终余额 = 流水合计（两笔差异除外） ---------- */
  P2.onSeed((db) => {
    const r = B.rng(131), today = TODAY(), users = db.users;
    db.walletPlans.forEach((p, i) => { p.status = 'ON'; p.sort = i + 1; });
    db.walletPlans.push({ id: 5, amount: 100000, gift: 20000, status: 'OFF', sort: 5 });
    const plans = db.walletPlans.filter((p) => p.status === 'ON'), pick = (need) => plans.find((p) => p.amount >= need) || plans[plans.length - 1];
    const paid = ['PAID', 'FULFILLED', 'DONE', 'REFUNDING', 'REFUNDED'], byUser = {};
    db.orders.filter((o) => o.pay === 'BALANCE' && paid.includes(o.status)).forEach((o) => (byUser[o.userId] = byUser[o.userId] || []).push(o));
    let rs = 0; const chargeNo = (at) => 'R' + at.slice(0, 10).replace(/-/g, '') + String(1000 + rs++ * 7);
    const rt = (back) => dAdd(today, -back) + ' ' + pad(8 + Math.floor(r() * 12)) + ':' + pad(Math.floor(r() * 60));
    const adj = { 3: [500, dAdd(today, -2) + ' 17:40', '出餐超时补偿'], 8: [-300, dAdd(today, -4) + ' 11:05', '更正重复充值'], 12: [1000, dAdd(today, -6) + ' 15:20', '活动补发储值'] };
    const all = [], fin = {};
    users.forEach((u) => {
      const ev = []; let seq = 0;
      const add = (kind, amount, at, ex) => ev.push(Object.assign({ userId: u.id, userName: u.name, kind, amount, at, seq: seq++ }, ex));
      const charge = (p, at) => { const no = chargeNo(at), cash = r() < 0.3; const ex = { ref: '充值单 ' + no, rechargeNo: no, channel: cash ? '现金' : '微信支付' }; add('充值', p.amount, at, Object.assign({ by: cash ? '陈晓燕' : '会员本人' }, ex)); if (p.gift) add('赠送', p.gift, at, Object.assign({ by: '系统' }, ex)); };
      (byUser[u.id] || []).forEach((o) => {
        const at = o.paidAt || o.createdAt;
        add('消费', -o.amount, at, { ref: '订单 ' + o.no, orderNo: o.no, by: '会员本人' });
        if (o.status === 'REFUNDED') add('退款', o.amount, minutesAdd(at, 90 + Math.floor(r() * 600)), { ref: '订单 ' + o.no, orderNo: o.no, by: '王海燕' });
      });
      if (r() < 0.5) charge(plans[Math.floor(r() * plans.length)], rt(1 + Math.floor(r() * 24)));
      if (adj[u.id]) { const [amt, at, why] = adj[u.id]; add('调整', amt, at, { ref: '调整单 A' + at.slice(5, 10).replace('-', '') + u.id, reason: why, by: '王海燕' }); }
      ev.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq));
      const out = []; let bal = 0, k = 0;
      ev.forEach((e) => {
        if (e.amount < 0 && bal + e.amount < 0) { const p = pick(-(bal + e.amount)), tmp = []; const at = minutesAdd(e.at, -2), no = chargeNo(at); tmp.push({ userId: u.id, userName: u.name, kind: '充值', amount: p.amount, at, seq: -1, ref: '充值单 ' + no, rechargeNo: no, channel: '微信支付', by: '会员本人' }); if (p.gift) tmp.push({ userId: u.id, userName: u.name, kind: '赠送', amount: p.gift, at, seq: -1, ref: '充值单 ' + no, rechargeNo: no, channel: '微信支付', by: '系统' }); tmp.forEach((t) => { bal += t.amount; out.push(t); }); }
        bal += e.amount; out.push(e);
      });
      out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq));
      let run = 0; out.forEach((e) => { run += e.amount; e.balance = run; all.push(e); });
      fin[u.id] = run;
    });
    all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.userId - b.userId || a.seq - b.seq)).forEach((e, i) => { e.id = i + 1; delete e.seq; });
    db.walletLogs = all.reverse();
    users.forEach((u) => (u.balance = fin[u.id]));
    /* 两笔待对账差异：会员余额与流水合计对不上（日期之后一直存在，直到处理） */
    const cand = users.filter((u) => u.status === 'ENABLED' && fin[u.id] >= 3000);
    const d1 = cand[0], d2 = cand[1];
    db.walletDiffs = [];
    if (d1) { u0(d1, 2000, dAdd(today, -3), '疑似线下现金充值，已给会员加了余额但没有录入流水'); }
    if (d2) { u0(d2, -650, dAdd(today, -1), '疑似一笔消费被重复扣款，会员余额比流水少'); }
    function u0(u, amount, date, why) { u.balance = fin[u.id] + amount; db.walletDiffs.push({ id: db.walletDiffs.length + 1, userId: u.id, userName: u.name, date, amount, why, status: 'OPEN' }); }
  });

  window.PAGES2.wallet = {
    title: '储值', group: '会员',
    layout: '横带分层',
    reason: '财务和店长看储值要先知道钱有多少、这个月进出多少、对不对得上，再往下翻流水和对账；所以三条带从余额与差异数字，到 30 天进出走势，再到流水、方案、对账明细，不把它们摊成等大的卡片',
    scenes: [
      { id: 'nodata', label: '所选范围没有储值流水' },
      { id: 'adjust-lock', label: '调整失败：会员有退款在审核，余额已冻结' },
      { id: 'recon-fail', label: '对账失败：支付渠道对账单还没生成' },
      { id: 'plan-fail', label: '保存方案失败：赠送比例超过上限' },
      { id: 'export-busy', label: '导出失败：导出任务排队过多' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有储值流水');
      if (early) return early;
      P2.begin();
      const S = { tab: 'ledger', kind: 'ALL', uid: 'ALL', from: '', to: '', q: '', rdate: TODAY() }, flashIds = new Set();
      const today = TODAY(), monthStart = today.slice(0, 8) + '01';
      const page = h('section.page.p2-page'), root = h('div.l-bands');
      const tgtLog = (l, u) => '储值流水 #' + l.id + '（' + (u ? u.name : l.userName) + '）';
      const flashNew = (tbl) => { if (flashIds.size) { P2.flashRows(tbl.el); flashIds.clear(); } };

      /* ----- 概览数字 ----- */
      const statsBand = h('section.band', { 'aria-label': '储值概览' });
      const openDiffs = () => B.db.walletDiffs.filter((d) => d.status === 'OPEN');
      function paintStats() {
        const logs = B.db.walletLogs, sum = (k, from) => logs.filter((l) => l.kind === k && l.at.slice(0, 10) >= from).reduce((a, l) => a + l.amount, 0);
        const bal = B.db.users.reduce((a, u) => a + u.balance, 0), diffs = openDiffs(), refund = sum('退款', monthStart);
        statsBand.replaceChildren(h('div.band-title', {}, h('h2', { text: '储值概览' }), h('span.muted', { text: '本月指 ' + md(monthStart) + ' 起；截至 ' + md(P2.nowStr()) })), h('div.band-stats', {},
          P2.stat({ label: '会员储值余额合计', value: bal / 100, prefix: '¥', dec: 2, big: true, sub: h('span', { text: B.db.users.filter((u) => u.balance > 0).length + ' 位会员有余额' }) }),
          P2.stat({ label: '本月充值额', value: sum('充值', monthStart) / 100, prefix: '¥', dec: 2, sub: h('span', { text: '不含赠送' }) }),
          P2.stat({ label: '本月赠送额', value: sum('赠送', monthStart) / 100, prefix: '¥', dec: 2, sub: h('span', { text: '随充值方案发放' }) }),
          P2.stat({ label: '本月消费额', value: -sum('消费', monthStart) / 100, prefix: '¥', dec: 2, sub: h('span', { text: '已退回 ' + yuan(refund) }) }),
          P2.stat({ label: '待对账差异', value: diffs.length, suffix: ' 笔', sub: diffs.length ? h('span.badge.badge--bad', { text: '合计 ' + yuan(diffs.reduce((a, d) => a + Math.abs(d.amount), 0)) }) : h('span.badge.badge--ok', { text: '账目一致' }) })));
      }

      /* ----- 近 30 天走势 ----- */
      const trendBand = h('section.band', { 'aria-label': '近 30 天充值与消费' });
      function paintTrend() {
        const days = Array.from({ length: 30 }, (_, i) => dAdd(today, i - 29)), logs = B.db.walletLogs;
        const rec = days.map((d) => logs.filter((l) => l.kind === '充值' && l.at.slice(0, 10) === d).reduce((a, l) => a + l.amount, 0) / 100), con = days.map((d) => -logs.filter((l) => l.kind === '消费' && l.at.slice(0, 10) === d).reduce((a, l) => a + l.amount, 0) / 100);
        const rs = rec.reduce((a, b) => a + b, 0), cs = con.reduce((a, b) => a + b, 0), top = Math.max(...con), topD = days[con.indexOf(top)];
        const el = h('div.p2-chart-line');
        trendBand.replaceChildren(h('div.band-title', {}, h('h2', { text: '近 30 天充值与消费' }), h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--ch-1)' } }), '充值'), h('span', {}, h('i', { style: { background: 'var(--ch-2)' } }), '消费'))), el,
          h('p.muted.p2-chart-note', { text: '近 30 天充值 ' + yuan(rs * 100) + '，消费 ' + yuan(cs * 100) + (top ? '；单日消费最高是 ' + md(topD) + '，' + yuan(top * 100) : '') + '。' }));
        requestAnimationFrame(() => UI.line(el, { labels: days.map((d) => md(d).replace('-', '/')), series: [{ name: '充值', data: rec, color: 'var(--ch-1)' }, { name: '消费', data: con, color: 'var(--ch-2)' }], unit: ' 元', height: 240, aria: '近 30 天充值与消费折线图：充值合计 ' + Math.round(rs) + ' 元，消费合计 ' + Math.round(cs) + ' 元' }));
      }

      /* ----- 明细：三个标签页 ----- */
      const detailBand = h('section.band', { 'aria-label': '储值明细' }), tabsEl = h('div.tabs', { role: 'tablist', 'aria-label': '储值明细' }), panel = h('div.stack');
      const paintTabs = () => tabsEl.replaceChildren(...[['ledger', '流水'], ['plans', '充值方案'], ['recon', '对账']].map(([id, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), on: { click: () => { S.tab = id; paintTabs(); UI.go(paintPanel); } } }, l, id === 'recon' && openDiffs().length ? h('span.count', { text: openDiffs().length }) : null)));
      const paintPanel = () => panel.replaceChildren(S.tab === 'ledger' ? ledgerView() : S.tab === 'plans' ? plansView() : reconView());
      detailBand.append(h('div.band-title', {}, h('h2', { text: '储值明细' })), tabsEl, panel);
      const refresh = () => { paintStats(); paintTabs(); paintPanel(); };

      /* ===== 流水 ===== */
      function ledgerView() {
        const fb = P2.fbar([
          { key: 'kind', label: '类型', type: 'select', options: [['ALL', '全部类型'], ...['充值', '赠送', '消费', '退款', '调整'].map((k) => [k, k])] },
          { key: 'uid', label: '会员', type: 'select', options: [['ALL', '全部会员'], ...B.db.users.map((u) => [String(u.id), u.name + '（尾号 ' + last4(u.phone) + '）'])] },
          { key: 't', label: '时间', type: 'date' },
        ], () => draw());
        const count = h('span.muted.num');
        const rowsNow = () => { const g = fb.get(); return ctx.scene === 'nodata' ? [] : B.db.walletLogs.filter((l) => (g.kind === 'ALL' || l.kind === g.kind) && (g.uid === 'ALL' || String(l.userId) === g.uid) && (!g.tFrom || l.at.slice(0, 10) >= g.tFrom) && (!g.tTo || l.at.slice(0, 10) <= g.tTo) && (!S.q || l.userName.includes(S.q) || l.ref.includes(S.q))); };
        const tbl = A2.table({
          caption: '储值流水', empty: '没有符合条件的储值流水', rowClass: (l) => (flashIds.has(l.id) ? 'p2-flash' : ''),
          columns: [
            { title: '时间', cls: 'c', render: (l) => md(l.at) },
            { title: '会员', render: (l) => l.userName },
            { title: '类型', cls: 'c', render: (l) => P2.badge(l.kind, KIND_BADGE[l.kind]) },
            { title: '金额', cls: 'r', render: (l) => h('b.num' + (l.amount < 0 ? '' : '.p2-pos'), { text: signed(l.amount) }) },
            { title: '变动后余额', cls: 'r', render: (l) => yuan(l.balance) },
            { title: '关联', render: (l) => l.ref },
            { title: '操作人', cls: 'c', render: (l) => l.by || '系统' },
            { title: '操作', cls: 'c', render: (l) => h('button.btn.btn--sm', { type: 'button', text: '查看', on: () => openLog(l.id) }) },
          ],
        });
        const draw = () => { const r = rowsNow(); count.textContent = '共 ' + r.length + ' 条'; tbl.setRows(r); flashNew(tbl); };
        const search = A2.search('搜索会员姓名或订单号', (v) => { S.q = v; draw(); }); search.style.width = '280px';
        fb.addReset(() => { S.q = ''; search.value = ''; });
        const el = h('div.stack', {}, h('div.row.wrap.between', {}, h('div.row.wrap', {}, search, count), h('div.row.wrap', {},
          A2.can('export') ? h('button.btn', { type: 'button', on: () => { if (ctx.scene === 'export-busy') return UI.toast('导出失败：当前已有 3 个导出任务在排队，请稍后再试', { kind: 'bad' }); A2.export('储值流水', '储值', rowsNow().length); } }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : null,
          A2.can('adjust') ? h('button.btn.btn--primary', { type: 'button', on: () => adjust() }, UI.icon('coin', 'icon--sm'), h('span', { text: '人工调整' })) : null)),
          h('div.p2-filterbox', {}, fb.el), tbl.el);
        draw(); return el;
      }

      /* 人工调整：加减、原因必填、二次确认写明金额与会员，同步会员余额与流水，写审计 */
      async function adjust(u0) {
        const users = B.db.users;
        const v = await P2.form({ title: '储值人工调整', size: 'sm', ok: '下一步', lead: '调整会同时改会员余额和储值流水，写入审计。更正只能用反向调整，不改历史流水。',
          fields: [{ name: 'uid', label: '会员', type: 'select', options: users.map((u) => ({ v: String(u.id), l: u.name + '（尾号 ' + last4(u.phone) + '，余额 ' + yuan(u.balance) + '）' })), value: String(u0 ? u0.id : users[0].id) },
            { name: 'dir', label: '方向', type: 'select', options: [{ v: 'add', l: '增加余额' }, { v: 'sub', l: '扣减余额' }], value: 'add' },
            { name: 'amt', label: '金额（元）', type: 'number', required: true, hint: '单次最多调整 ¥500.00', validate: (x) => (x <= 0 ? '金额要大于 0' : Math.abs(Math.round(x * 100) - x * 100) > 1e-6 ? '最多两位小数' : x > 500 ? '单次最多调整 ¥500.00，超过的请分次或走财务流程' : '') },
            { name: 'reason', label: '原因', type: 'textarea', required: true, max: 100 }],
          check: (x) => { const u = P2.userById(+x.uid); return x.dir === 'sub' && Math.round(x.amt * 100) > u.balance ? { amt: '扣减后余额不能为负，' + u.name + ' 当前余额 ' + yuan(u.balance) } : null; } });
        if (!v) return false;
        const u = P2.userById(+v.uid), cents = Math.round(v.amt * 100), delta = v.dir === 'sub' ? -cents : cents;
        if (!(await A2.danger('将为 ' + u.name + '（尾号 ' + last4(u.phone) + '）' + (delta < 0 ? '扣减 ' : '增加 ') + yuan(cents) + ' 储值，调整后余额 ' + yuan(u.balance + delta) + '。原因：' + v.reason + '。会同步写入会员余额和储值流水。', { ok: '确认调整', title: '二次确认' }))) return false;
        let log;
        const r = await P2.act(() => {
          if (ctx.scene === 'adjust-lock') P2.fail('调整失败：' + u.name + ' 有一笔储值退款正在审核，余额已冻结，审核结束后才能调整');
          u.balance += delta;
          const id = Math.max(0, ...B.db.walletLogs.map((l) => l.id)) + 1;
          log = { id, userId: u.id, userName: u.name, kind: '调整', amount: delta, balance: ledgerBal(u.id) + delta, at: P2.nowStr(), ref: '调整单 A' + today.slice(5).replace('-', '') + id, reason: v.reason, by: A2.me().name };
          B.db.walletLogs.unshift(log); flashIds.add(id);
          A2.audit('wallet:adjust', '储值' + (delta < 0 ? '扣减 ' : '增加 ') + yuan(cents) + '：' + v.reason, tgtLog(log, u));
        });
        if (r.ok) { UI.toast('已调整，' + u.name + ' 的余额变为 ' + yuan(u.balance)); S.tab = 'ledger'; refresh(); }
        return r.ok;
      }

      function openLog(id) {
        const l = B.db.walletLogs.find((x) => x.id === id), u = P2.userById(l.userId);
        const order = l.orderNo && B.db.orders.find((o) => o.no === l.orderNo);
        const ORD = { UNPAID: '待支付', PAID: '待履约', FULFILLED: '已出餐', DONE: '已完成', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' };
        const rel = order
          ? h('div.stack', {}, A2.kv([['关联订单', order.no], ['下单时间', order.createdAt], ['订单金额', yuan(order.amount)], ['支付方式', B.PAY[order.pay]], ['订单状态', ORD[order.status]]]), P2.mini([{ title: '商品', render: (i) => i.name + '（' + i.spec + '）' }, { title: '数量', cls: 'r', render: (i) => '× ' + i.qty }, { title: '小计', cls: 'r', render: (i) => yuan(i.price * i.qty) }], order.items))
          : l.rechargeNo ? A2.kv([['充值单', l.rechargeNo], ['支付渠道', l.channel || '—'], ['方案', (() => { const p = B.db.walletPlans.find((x) => x.amount === l.amount || (l.kind === '赠送' && x.gift === l.amount)); return p ? '充 ' + yuan(p.amount) + ' 送 ' + yuan(p.gift) : '自定义金额'; })()], ['本金与赠送', l.kind === '赠送' ? '这是赠送金，随充值单一起到账' : '这是充值本金，永不过期']]) : A2.kv([['调整单', l.ref], ['原因', l.reason || '—'], ['说明', '人工调整同步写入了会员余额和这条流水']]);
        const aud = P2.mini([{ title: '时间', cls: 'c', render: (a) => md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }], B.db.audit.filter((a) => a.target.startsWith('储值流水 #' + l.id + '（')), '这条流水是系统自动产生的，没有人工操作记录');
        A2.detail({ title: '储值流水详情', tabs: [
          { id: 'info', label: '概况', node: h('div.stack', {}, h('div.p2-kpis', {}, h('div', {}, h('span.muted', { text: '类型' }), P2.badge(l.kind, KIND_BADGE[l.kind])), h('div', {}, h('span.muted', { text: '金额' }), h('b.num', { text: signed(l.amount) })), h('div', {}, h('span.muted', { text: '变动后余额' }), h('b.num', { text: yuan(l.balance) }))), A2.kv([['时间', l.at], ['会员', u ? u.name + '（' + B.maskPhone(u.phone) + '）' : l.userName], ['关联', l.ref], ['操作人', l.by || '系统'], ['原因', l.reason || '—'], ['当前会员余额', u ? yuan(u.balance) : '—']])) },
          { id: 'rel', label: l.orderNo ? '关联订单' : l.rechargeNo ? '关联充值单' : '调整依据', node: rel }, { id: 'audit', label: '操作记录', node: aud }] });
      }

      /* ===== 充值方案 ===== */
      function plansView() {
        const plans = () => B.db.walletPlans.slice().sort((a, b) => a.sort - b.sort), bought = (p) => B.db.walletLogs.filter((l) => l.kind === '充值' && l.amount === p.amount).length;
        const tbl = A2.table({
          caption: '充值方案', empty: '还没有充值方案', rowClass: (p) => (flashIds.has('p' + p.id) ? 'p2-flash' : ''),
          columns: [
            { title: '顺序', cls: 'c', render: (p) => { const list = plans(), i = list.indexOf(p); return h('div.row', { style: { justifyContent: 'center', gap: 'var(--s-1)' } }, h('button.btn.btn--sm.btn--icon', { type: 'button', 'aria-label': '上移 ' + yuan(p.amount) + ' 方案', disabled: i === 0, on: () => move(p, -1) }, UI.icon('up', 'icon--sm')), h('span.num', { text: i + 1 }), h('button.btn.btn--sm.btn--icon', { type: 'button', 'aria-label': '下移 ' + yuan(p.amount) + ' 方案', disabled: i === list.length - 1, on: () => move(p, 1) }, UI.icon('down', 'icon--sm'))); } },
            { title: '方案', render: (p) => h('b', { text: '充 ' + yuan(p.amount) + (p.gift ? ' 送 ' + yuan(p.gift) : '') }) },
            { title: '到账', cls: 'r', render: (p) => yuan(p.amount + p.gift) },
            { title: '赠送比例', cls: 'r', render: (p) => Math.round((p.gift / p.amount) * 100) + '%' },
            { title: '已充值次数', cls: 'r', render: (p) => bought(p) + ' 次' },
            { title: '状态', cls: 'c', render: (p) => h('label.row', { style: { justifyContent: 'center', gap: 'var(--s-2)' } }, h('input.switch', { type: 'checkbox', role: 'switch', checked: p.status === 'ON', 'aria-label': (p.status === 'ON' ? '停用' : '启用') + ' ' + yuan(p.amount) + ' 方案', on: { change: (e) => togglePlan(p, e.target) } }), h('span', { text: p.status === 'ON' ? '启用中' : '已停用' })) },
            { title: '操作', cls: 'c', render: (p) => h('button.btn.btn--sm', { type: 'button', text: '编辑', on: () => editPlan(p) }) },
          ],
        });
        tbl.setRows(plans()); flashNew(tbl);
        return h('div.stack', {}, h('div.row.between.wrap', {}, h('p.muted', { text: '小程序按这里的顺序展示启用中的方案；停用后已充值的余额不受影响。' }), h('button.btn.btn--primary', { type: 'button', on: () => editPlan(null) }, UI.icon('plus', 'icon--sm'), h('span', { text: '新建方案' }))), tbl.el);
      }
      async function move(p, dir) {
        const list = B.db.walletPlans.slice().sort((a, b) => a.sort - b.sort), i = list.indexOf(p), o = list[i + dir]; if (!o) return;
        const r = await P2.act(() => { [p.sort, o.sort] = [o.sort, p.sort]; A2.audit('wallet:adjust', (dir < 0 ? '上移' : '下移') + '充值方案 ' + yuan(p.amount), '充值方案 ' + yuan(p.amount)); });
        if (r.ok) { flashIds.add('p' + p.id); paintPanel(); }
      }
      async function togglePlan(p, box) {
        const on = p.status === 'ON';
        const ok = await (on ? A2.danger('停用「充 ' + yuan(p.amount) + ' 送 ' + yuan(p.gift) + '」后，小程序不再展示这个档位；已经充值的余额不受影响。', { ok: '确认停用', title: '停用方案' }) : UI.confirm('启用后小程序会展示「充 ' + yuan(p.amount) + ' 送 ' + yuan(p.gift) + '」。', { ok: '确认启用', title: '启用方案' }));
        if (!ok) { box.checked = on; return; }
        const r = await P2.act(() => { p.status = on ? 'OFF' : 'ON'; A2.audit('wallet:adjust', (on ? '停用' : '启用') + '充值方案 ' + yuan(p.amount), '充值方案 ' + yuan(p.amount)); });
        if (!r.ok) box.checked = on; else { UI.toast(on ? '已停用' : '已启用'); flashIds.add('p' + p.id); paintTabs(); paintPanel(); }
      }
      async function editPlan(p) {
        const isNew = !p;
        const v = await P2.form({ title: isNew ? '新建充值方案' : '编辑充值方案', size: 'sm', ok: isNew ? '创建' : '保存',
          fields: [{ name: 'amt', label: '充值金额（元）', type: 'number', required: true, value: p ? p.amount / 100 : '', validate: (x) => (!Number.isInteger(x) || x < 10 || x > 5000 ? '请填写 10 到 5000 的整数' : '') },
            { name: 'gift', label: '赠送金额（元）', type: 'number', required: true, value: p ? p.gift / 100 : 0, hint: '赠送不超过充值金额的 30%', validate: (x) => (x < 0 || !Number.isInteger(x) ? '请填写不小于 0 的整数' : '') },
            { name: 'status', label: '状态', type: 'select', options: [{ v: 'ON', l: '启用' }, { v: 'OFF', l: '停用' }], value: p ? p.status : 'ON' }],
          check: (x) => (x.gift > x.amt * 0.3 ? { gift: '赠送比例超过 30%，最多赠送 ¥' + Math.floor(x.amt * 0.3) } : B.db.walletPlans.some((o) => o !== p && o.amount === x.amt * 100) ? { amt: '已经有 ¥' + x.amt + ' 的方案了' } : null),
          submit: (x) => { if (ctx.scene === 'plan-fail') P2.fail('保存失败：赠送比例超过了本店的预付规则上限，请降低赠送金额'); const body = { amount: x.amt * 100, gift: x.gift * 100, status: x.status }; if (isNew) { p = Object.assign({ id: Math.max(0, ...B.db.walletPlans.map((o) => o.id)) + 1, sort: Math.max(0, ...B.db.walletPlans.map((o) => o.sort)) + 1 }, body); B.db.walletPlans.push(p); } else Object.assign(p, body); A2.audit('wallet:adjust', (isNew ? '新建' : '修改') + '充值方案 充 ' + yuan(body.amount) + ' 送 ' + yuan(body.gift), '充值方案 ' + yuan(body.amount)); } });
        if (v) { UI.toast(isNew ? '已创建方案' : '已保存'); flashIds.add('p' + p.id); paintPanel(); }
      }

      /* ===== 对账 ===== */
      /** 某一天：当日发生额、期末余额总额（按流水算）、会员余额合计（按会员侧算）和差异 */
      function daily(d) {
        const logs = B.db.walletLogs, day = logs.filter((l) => l.at.slice(0, 10) === d), sum = (k) => day.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0);
        const end = logs.filter((l) => l.at.slice(0, 10) <= d).reduce((a, l) => a + l.amount, 0);
        const live = B.db.walletDiffs.filter((x) => x.date <= d && (x.status === 'OPEN' || d < x.resolvedAt));
        const diff = live.reduce((a, x) => a + x.amount, 0);
        return { d, charge: sum('充值'), gift: sum('赠送'), consume: -sum('消费'), refund: sum('退款'), adjust: sum('调整'), end, member: end + diff, diff, live };
      }
      function reconView() {
        const days = Array.from({ length: 30 }, (_, i) => dAdd(today, -i));
        const res = h('div.stack'), count = h('span.muted.num');
        const tbl = A2.table({
          caption: '按日对账', size: 10, empty: '没有对账数据', rowClass: (x) => (x.d === S.rdate ? 'p2-selrow' : '') + (flashIds.has('d' + x.d) ? ' p2-flash' : ''),
          columns: [
            { title: '日期', cls: 'c', render: (x) => h('button.btn.btn--sm.btn--ghost', { type: 'button', text: md(x.d) + (x.d === today ? '（今天）' : ''), 'aria-label': '查看 ' + x.d + ' 的对账结果', on: () => { S.rdate = x.d; sel.value = x.d; paintRes(); tbl.setRows(rows()); } }) },
            { title: '充值', cls: 'r', render: (x) => yuan(x.charge) },
            { title: '赠送', cls: 'r', render: (x) => yuan(x.gift) },
            { title: '消费', cls: 'r', render: (x) => yuan(x.consume) },
            { title: '退款', cls: 'r', render: (x) => yuan(x.refund) },
            { title: '调整', cls: 'r', render: (x) => (x.adjust ? signed(x.adjust) : yuan(0)) },
            { title: '期末余额总额', cls: 'r', render: (x) => yuan(x.end) },
            { title: '会员余额合计', cls: 'r', render: (x) => yuan(x.member) },
            { title: '差异', cls: 'r', render: (x) => (x.diff ? h('b.num.p2-neg', {}, signed(x.diff)) : h('span.muted', { text: '一致' })) },
          ],
        });
        const rows = () => days.map(daily);
        const sel = h('select.select', { 'aria-label': '对账日期', style: { width: '180px' }, on: { change: (e) => { S.rdate = e.target.value; paintRes(); tbl.setRows(rows()); } } }, days.map((d) => h('option', { value: d, text: d + (d === today ? '（今天）' : ''), selected: d === S.rdate })));
        function paintRes() {
          const x = daily(S.rdate), prev = daily(dAdd(S.rdate, -1)), calc = prev.end + x.charge + x.gift + x.refund + x.adjust - x.consume;
          const diffs = B.db.walletDiffs.filter((d) => d.date <= S.rdate && (d.status === 'OPEN' || S.rdate < d.resolvedAt));
          res.replaceChildren(
            h('div.p2-recon-head' + (x.diff ? '.p2-recon-bad' : ''), {}, h('div', {}, h('b', { text: S.rdate + ' 对账结果' }), h('div.muted', { text: '期末 ' + yuan(x.end) + ' = 上日期末 ' + yuan(prev.end) + ' + 充值 ' + yuan(x.charge) + ' + 赠送 ' + yuan(x.gift) + ' + 退款 ' + yuan(x.refund) + ' + 调整 ' + signed(x.adjust) + ' − 消费 ' + yuan(x.consume) + (calc === x.end ? '，算式成立' : '，算式不成立') })),
              x.diff ? h('span.badge.badge--bad', { text: '会员余额合计比流水' + (x.diff > 0 ? '多 ' : '少 ') + yuan(x.diff) }) : h('span.badge.badge--ok', { text: '会员余额合计与流水一致' })),
            diffs.length ? P2.mini([
              { title: '会员', render: (d) => d.userName }, { title: '发生日期', cls: 'c', render: (d) => md(d.date) }, { title: '差异', cls: 'r', render: (d) => h('b.num.p2-neg', {}, signed(d.amount)) },
              { title: '流水合计 / 会员余额', cls: 'r', render: (d) => { const u = P2.userById(d.userId); return yuan(ledgerBal(d.userId)) + ' / ' + yuan(u.balance); } },
              { title: '可能原因', render: (d) => d.why }, { title: '状态', cls: 'c', render: (d) => P2.badge(d.status === 'OPEN' ? '待处理' : '已处理 ' + md(d.resolvedAt), d.status === 'OPEN' ? 'bad' : 'ok') },
              { title: '处理', cls: 'c', render: (d) => (d.status === 'OPEN' && A2.can('adjust') ? h('div.row', { style: { justifyContent: 'center', gap: 'var(--s-1)' } }, h('button.btn.btn--sm', { type: 'button', text: '校正余额', on: () => resolve(d, 'fixBalance') }), h('button.btn.btn--sm', { type: 'button', text: '补记流水', on: () => resolve(d, 'addLog') })) : '') },
            ], diffs, '') : h('p.muted', { text: '这一天没有差异。' }));
        }
        async function resolve(d, how) {
          const u = P2.userById(d.userId), led = ledgerBal(d.userId);
          const desc = how === 'fixBalance' ? '以流水为准：把 ' + u.name + ' 的会员余额从 ' + yuan(u.balance) + ' 校正为 ' + yuan(led) + '。' : '以会员余额为准：给 ' + u.name + ' 补记一条 ' + signed(d.amount) + ' 的调整流水，使流水合计变为 ' + yuan(u.balance) + '。';
          const v = await P2.form({ title: how === 'fixBalance' ? '校正会员余额' : '补记一条流水', size: 'sm', ok: '确认处理', lead: desc + ' 处理后写入审计。', fields: [{ name: 'reason', label: '处理说明', type: 'textarea', required: true, max: 100 }] });
          if (!v) return;
          const r = await P2.act(() => {
            if (how === 'fixBalance') u.balance = led;
            else { const id = Math.max(0, ...B.db.walletLogs.map((l) => l.id)) + 1, log = { id, userId: u.id, userName: u.name, kind: '调整', amount: d.amount, balance: 0, at: P2.nowStr(), ref: '调整单 C' + today.slice(5).replace('-', '') + id, reason: '对账补记：' + v.reason, by: A2.me().name }; B.db.walletLogs.unshift(log); recomputeBalances(u.id); flashIds.add(id); }
            d.status = 'DONE'; d.resolvedAt = today; d.how = how; A2.audit('wallet:adjust', '对账差异处理（' + (how === 'fixBalance' ? '校正会员余额' : '补记流水') + '）：' + v.reason, '储值对账 ' + u.name + ' ' + signed(d.amount));
          });
          if (r.ok) { UI.toast('差异已处理'); refresh(); }
        }
        /** 补记流水后，该会员之后的“变动后余额”要重新按时间累加 */
        function recomputeBalances(uid) { let run = 0; B.db.walletLogs.filter((l) => l.userId === uid).slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)).forEach((l) => { run += l.amount; l.balance = run; }); }
        const runBtn = h('button.btn.btn--primary', { type: 'button', text: '重新对账', on: async function () {
          const b = this; b.disabled = true; b.replaceChildren(h('span.spin'), ' 对账中');
          const r = await P2.act(() => { if (ctx.scene === 'recon-fail') P2.fail('对账失败：支付渠道 ' + md(S.rdate) + ' 的对账单还没有生成，请 12:00 之后再试'); }, 700);
          b.disabled = false; b.textContent = '重新对账';
          if (r.ok) { UI.toast(S.rdate + ' 对账完成，' + (daily(S.rdate).diff ? '有差异，请看下方明细' : '账目一致')); paintRes(); tbl.setRows(rows()); }
        } });
        tbl.setRows(rows()); paintRes(); count.textContent = '近 30 天按日汇总';
        return h('div.stack', {}, h('div.row.wrap.between', {}, h('div.row.wrap', {}, h('label.row', {}, h('span', { text: '对账日期' }), sel), runBtn), h('div.row.wrap', {}, count, A2.can('export') ? h('button.btn', { type: 'button', on: () => A2.export('储值对账', '储值对账', 30) }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : null)), res, tbl.el);
      }

      root.append(statsBand, trendBand, detailBand);
      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '储值' }), h('p.muted', { text: '余额、进出走势和对账' }))), root);
      return A2.load(() => { paintStats(); paintTrend(); paintTabs(); paintPanel(); return P2.settled(page); });
    },
  };
})();
