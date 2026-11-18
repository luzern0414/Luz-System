/* 第一组页面（r1）续：履约看板（看板分列）、售后（主区加右侧窄栏）。共用件在 admin.p1.js 的 window.P1。 */
(function () {
  'use strict';
  const { h } = UI;
  const money = (c) => UI.money(c), short = (s) => P1.short(s), dayOf = (s) => P1.dayOf(s), nowStr = () => P1.nowStr();
  const bad = (t) => UI.toast(t, { kind: 'bad' });
  const hhmm = (s) => (s || '').slice(11);

  /* ====================== 履约看板：看板分列 ====================== */
  const COLS = [['UNPAID', '待支付'], ['PAID', '待出餐'], ['FULFILLED', '已出餐'], ['DONE', '已完成']];
  const SLOW = 15;
  const fmtMin = (m) => (m < 120 ? m + ' 分钟' : Math.floor(m / 60) + ' 小时' + (m % 60 ? ' ' + (m % 60) + ' 分钟' : ''));
  /** 现在这一步已经等了多少分钟：待支付从下单算，待出餐从付款算，已出餐从出餐算，已完成不算 */
  const waitOf = (o) => { const T = P1.times(o); return o.status === 'UNPAID' ? P1.minsSince(o.createdAt) : o.status === 'PAID' ? P1.minsSince(T.paid || o.createdAt) : o.status === 'FULFILLED' ? P1.minsSince(T.fulfilled || o.createdAt) : 0; };
  /** 看板规则：返回不能这样移动的原因，空串表示可以 */
  const moveRule = (o, from, to) => {
    if (from === 'DONE') return '已完成的订单不能再移动';
    if (to === 'UNPAID') return '已付款的订单不能退回待支付';
    if (from === 'FULFILLED' && to === 'PAID') return '已出餐的订单不能退回待出餐，需要处理请走退款';
    if (from === 'UNPAID' && (to === 'FULFILLED' || to === 'DONE')) return '待支付的订单要先确认收款，再出餐';
    if (from === 'PAID' && to === 'DONE') return '请先出餐，再标记完成';
    return '';
  };

  window.PAGES2.fulfil = {
    title: '履约看板', group: '交易',
    layout: '看板分列',
    reason: '前台盯的是今天每一单走到了哪一步，订单天然按“待支付、待出餐、已出餐、已完成”流转，所以用看板分列，把最需要动手的“待出餐”列做成视觉重心，超过 15 分钟的卡片标橙',
    scenes: [
      { id: 'nodata', label: '今天还没有订单' },
      { id: 'fulfil-conflict', label: '移动失败：订单已被同事处理' },
      { id: 'pay-notfound', label: '确认收款失败：渠道没查到这笔付款' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '今天还没有订单'); if (early) return early;
      const fresh = new Set(); let K = null, timer = null;
      const today = () => dayOf(nowStr());
      const list = () => B.db.orders.filter((o) => dayOf(o.createdAt) === today() && COLS.some((c) => c[0] === o.status) && (ctx.scene !== 'nodata' || fresh.has(o.no)));
      const page = h('section.page.p1-fulfil');
      const auto = h('input.switch', { type: 'checkbox', role: 'switch', id: 'p1f-auto', 'aria-label': '自动刷新示意' });
      auto.addEventListener('change', () => {
        clearInterval(timer); timer = null;
        if (auto.checked) { timer = setInterval(() => { if (!page.isConnected) { clearInterval(timer); return; } newOrder(); }, 20000); UI.toast('已开启自动刷新示意：每 20 秒来一张新订单'); } else UI.toast('已关闭自动刷新');
      });
      page.append(A2.heading('履约看板', '今天的订单走到哪一步一目了然；拖动卡片，或点卡片右上角的菜单移到别的列', [
        h('label.row.p1-auto', { for: 'p1f-auto' }, auto, h('span', { text: '自动刷新示意（每 20 秒来一张新订单）' })),
        h('button.btn', { type: 'button', text: '模拟来一单', on: { click: () => newOrder() } }),
        h('button.btn', { type: 'button', text: '刷新', on: { click: () => ctx.refresh() } }),
      ]));
      const strip = h('div.p1-strip', { role: 'group', 'aria-label': '今日履约摘要' });
      const board = h('section.p1-board', { 'aria-label': '订单看板' });
      page.append(strip, board);

      const cardBody = (o) => {
        const w = waitOf(o), slow = o.status !== 'DONE' && w > SLOW;
        return h('div.p1-kc', {},
          h('div.row.between', { style: { paddingRight: '32px' } }, h('strong', { text: '取餐号 ' + o.pickup }), h('span.num', { text: money(o.amount) })),
          h('div.p1-kc-items', { text: P1.itemsText(o), title: P1.itemsText(o) }),
          h('div.row.between.wrap', { style: { gap: 'var(--s-1) var(--s-3)' } },
            o.status === 'DONE' ? h('span.muted.num', { text: '已完成 ' + hhmm(P1.times(o).done) }) : h('span.badge' + (slow ? '.badge--warn' : '.badge--plain'), { text: '已等 ' + fmtMin(w) + (slow ? '，超时' : '') }),
            h('span.muted', { text: o.userName + ' · ' + hhmm(o.createdAt) + ' 下单' })));
      };
      const sorted = (arr, st) => arr.slice().sort((a, b) => (st === 'DONE' ? (a.createdAt < b.createdAt ? 1 : -1) : (a.createdAt < b.createdAt ? -1 : 1)));
      function drawBoard() {
        const l = list(), cols = COLS.map(([id, title]) => ({ id, title, cards: sorted(l.filter((o) => o.status === id), id).map((o) => ({ id: o.no, o })) }));
        K = UI.kanban(board, { columns: cols, card: (c) => cardBody(c.o), onMove: (id, from, to) => go(id, from, to) });
        board.querySelectorAll('.kcard').forEach(decorate);
        const hot = board.querySelector('.kcol[data-id="PAID"]'); if (hot) hot.classList.add('p1-hot');
        board.querySelectorAll('.kcol').forEach((c) => { const t = c.querySelector('.kcol-head strong'); c.setAttribute('aria-label', t.textContent + ' ' + c.querySelectorAll('.kcard').length + ' 单'); });
        paintStrip(); P1.sweep();
      }
      function paintStrip() {
        const l = list(), paid = l.filter((o) => o.status === 'PAID'), done = l.filter((o) => o.status === 'DONE').length;
        const slow = l.filter((o) => (o.status === 'PAID' || o.status === 'FULFILLED') && waitOf(o) > SLOW).length;
        const avg = paid.length ? Math.round(paid.reduce((s, o) => s + waitOf(o), 0) / paid.length) : null;
        const it = (label, id, sub, cls) => h('div.p1-strip-i' + (cls || ''), {}, h('span.stat-label', { text: label }), h('span.stat-value.num', { id, text: '0' }), sub);
        strip.replaceChildren(
          it('待出餐', 'p1f-wait', h('span.muted', { text: paid.length ? '最久的已等 ' + fmtMin(Math.max(...paid.map(waitOf))) : '没有积压' }), '.p1-strip-i--main'),
          it('平均等待', 'p1f-avg', h('span.muted', { text: '只算待出餐的订单' })),
          it('超时（超过 ' + SLOW + ' 分钟）', 'p1f-slow', slow ? h('span.badge.badge--warn', { text: '待出餐与已出餐里的超时单' }) : h('span.muted', { text: '没有超时' })),
          it('今天已完成', 'p1f-done', h('span.muted', { text: '今天共 ' + l.length + ' 单在看板上' })));
        const set = (id, v) => { const el = strip.querySelector('#' + id); el && UI.count(el, v); };
        set('p1f-wait', paid.length); strip.querySelector('#p1f-avg').textContent = avg == null ? '—' : fmtMin(avg); set('p1f-slow', slow); set('p1f-done', done);
      }
      const open = (o) => P1.openOrder(o, { ctx, onChange: () => { drawBoard(); } });
      function items(o) {
        const out = [];
        if (o.status === 'UNPAID') out.push({ label: '移到 待出餐（确认收款）', on: () => go(o.no, o.status, 'PAID') });
        if (o.status === 'PAID') out.push({ label: '移到 已出餐', on: () => go(o.no, o.status, 'FULFILLED') });
        if (o.status === 'FULFILLED') out.push({ label: '移到 已完成', on: () => go(o.no, o.status, 'DONE') });
        out.push({ label: '查看详情', icon: 'list', on: () => open(o) }, { label: '打印小票', icon: 'print', on: () => P1.printPreview(o, ctx) });
        if (A2.can('cancel') && ['UNPAID', 'PAID'].includes(o.status)) out.push('hr', { label: '取消订单', icon: 'x', danger: true, on: async () => { if (await P1.op.cancel(o, ctx)) drawBoard(); } });
        return out;
      }
      /** 换掉 UI.kanban 自带的菜单（它列出所有列，包括不能去的）：只留合法的去处，再加详情、小票、取消 */
      function decorate(el) {
        const o = P1.byNo(el.dataset.id), old = el.querySelector(':scope > button');
        if (old) { const pid = old.getAttribute('popovertarget'), pop = pid && document.getElementById(pid); if (pop) pop.remove(); old.remove(); }
        const more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：取餐号 ' + o.pickup }, UI.icon('more', 'icon--sm'));
        el.append(more); P1.menu(more, items(o));
        el.setAttribute('aria-label', '取餐号 ' + o.pickup + '，' + P1.OSTAT[o.status][0] + '，点击查看详情');
        el.addEventListener('click', (e) => { if (!e.target.closest('button')) open(P1.byNo(el.dataset.id)); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) open(P1.byNo(el.dataset.id)); });
        if (o.status === 'DONE') el.title = '已完成，不能再移动';
      }
      function refreshCard(o) {
        const el = board.querySelector('.kcard[data-id="' + o.no + '"]'); if (!el) return;
        el.querySelector('.p1-kc').replaceWith(cardBody(o)); const m = el.querySelector(':scope > button'); if (m) m.remove();
        const more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：取餐号 ' + o.pickup }, UI.icon('more', 'icon--sm')); el.append(more); P1.menu(more, items(o));
        el.title = o.status === 'DONE' ? '已完成，不能再移动' : ''; P1.flash(el); P1.sweep();
      }
      /** 一次移动（拖动或菜单）：先过规则，再按需要弹确认，再改订单；最后让卡片落到订单真正所在的那一列（失败就回到原位） */
      async function go(id, from, to) {
        const o = P1.byNo(id); if (!o) return;
        const settle = () => { K.move(id, o.status); refreshCard(o); paintStrip(); };
        const why = moveRule(o, from, to);
        if (why) { bad(why); K.move(id, from); return; }
        if (from === 'UNPAID' && to === 'PAID') { if (!(await confirmPay(o))) { K.move(id, from); return; } await P1.op.pay(o, ctx); }
        else if (from === 'PAID' && to === 'FULFILLED') await P1.op.fulfil(o, ctx);
        else if (from === 'FULFILLED' && to === 'DONE') await P1.op.done(o, ctx);
        settle();
      }
      function confirmPay(o) {
        const chk = h('input', { type: 'checkbox', id: 'p1f-chk' }), err = h('div.err', { role: 'alert' });
        return P1.dlg(() => UI.dialog({ title: '确认收款', size: 'sm', body: h('div.stack', {}, h('p', { text: '取餐号 ' + o.pickup + ' · ' + o.userName }), h('div.p1-pay', {}, h('span.muted', { text: '应收金额' }), h('b.num', { text: money(o.amount) }), h('span.muted', { text: B.PAY[o.pay] })), h('label.row', { for: 'p1f-chk' }, chk, h('span', { text: '我已核实收到这笔款项' })), err, h('p.muted', { text: '确认后订单进入“待出餐”，不能撤销；系统会先向支付渠道查一次这笔付款。' })), actions: [{ label: '取消', value: null }, { label: '确认收款', kind: 'primary', value: 'ok', on: () => { if (!chk.checked) { err.textContent = '请先勾选“我已核实收到这笔款项”'; return false; } } }] }).then((v) => v === 'ok'));
      }
      /** 模拟新订单进门：70% 已付款进待出餐，30% 在待支付 */
      function newOrder() {
        const db = B.db, r = Math.random, prods = db.products.filter((p) => p.status === 'ON'), n = 1 + Math.floor(r() * 2), its = [];
        for (let i = 0; i < n; i++) { const p = prods[Math.floor(r() * prods.length)], sp = p.specs[0].opts[Math.floor(r() * p.specs[0].opts.length)], q = 1 + Math.floor(r() * 2); its.push({ pid: p.id, name: p.name, spec: sp.n, qty: q, price: p.price + sp.d, img: p.img }); }
        const u = db.users[Math.floor(r() * db.users.length)], sub = its.reduce((s, x) => s + x.price * x.qty, 0), paid = r() < 0.7, used = new Set(db.orders.filter((o) => dayOf(o.createdAt) === today()).map((o) => o.pickup));
        let pk; do { pk = 'A' + String(10 + Math.floor(r() * 80)); } while (used.has(pk) && used.size < 80);
        let seq = 1, no; do { no = '26' + today().replace(/-/g, '').slice(2) + String(500000 + seq++ * 137); } while (db.orders.some((o) => o.no === no));
        const o = { no, userId: u.id, userName: u.name, items: its, subtotal: sub, discount: 0, amount: sub, pay: ['WECHAT', 'WECHAT', 'BALANCE', 'CARD'][Math.floor(r() * 4)], status: paid ? 'PAID' : 'UNPAID', createdAt: nowStr(), paidAt: paid ? nowStr() : '', remark: '', pickup: pk, coupon: '' };
        db.orders.unshift(o); fresh.add(no);
        if (paid) { u.orders++; u.spent += sub; }
        drawBoard();
        const el = board.querySelector('.kcard[data-id="' + no + '"]');
        if (el) { UI.play(el, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0,0,0,1)' }); P1.flash(el); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
        UI.toast('新订单 ' + pk + ' 进入「' + (paid ? '待出餐' : '待支付') + '」');
      }
      return A2.load(() => { drawBoard(); return page; });
    },
  };

  /* ====================== 售后：主区加右侧窄栏 ====================== */
  const RST = { PENDING: ['待处理', 'warn'], APPROVED: ['已同意', 'info'], REJECTED: ['已拒绝', ''], DONE: ['已完成', 'ok'] };
  const RTABS = [['PENDING', '待处理'], ['APPROVED', '已同意'], ['REJECTED', '已拒绝'], ['DONE', '已完成']];
  const rno = (r) => 'RF' + String(r.id).padStart(5, '0');
  const waitText = (s) => { const hrs = Math.floor(P1.minsSince(s) / 60); return hrs >= 48 ? Math.floor(hrs / 24) + ' 天' : hrs + ' 小时'; };
  const overdue = (r) => r.status === 'PENDING' && P1.minsSince(r.appliedAt) > 24 * 60;
  const payTo = (o) => (o ? '原路退回到' + B.PAY[o.pay] : '原路退回');
  const trailOf = (r) => {
    const o = P1.byNo(r.orderNo), T = [];
    if (!r.by) T.push({ at: r.appliedAt, who: r.userName + '（会员）', text: '提交退款申请 ' + money(r.amount) + '（' + r.kind + '，' + r.reason + '）' });
    if (!r.trail && r.status === 'DONE') T.push({ at: B.fmt(new Date(Math.min(B.NOW().getTime(), P1.parse(r.appliedAt).getTime() + 125 * 60000))), who: r.handler || '系统', text: '同意退款 ' + money(r.amount) + '，' + payTo(o) });
    (r.trail || []).forEach((t) => T.push(t));
    return T.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).reverse();
  };

  window.PAGES2.refunds = {
    title: '售后', group: '交易',
    layout: '主区加右侧窄栏',
    reason: '售后的主工作是逐条审批退款单，所以左边三分之二给表格与批量审批；右边窄栏固定不动，放“哪些单快超时、退款都因为什么、今天退了多少”这三样随时要瞟一眼的辅助信息',
    scenes: [
      { id: 'nodata', label: '没有退款单' },
      { id: 'channel-fail', label: '同意后退款失败：支付渠道没有受理' },
      { id: 'approve-conflict', label: '审批失败：会员刚撤销了申请' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有退款单'); if (early) return early;
      const S = { tab: 'PENDING', kind: '', reason: '', time: 'all', over: false, q: '' }, touched = new Set();
      const src = () => (ctx.scene === 'nodata' ? [] : B.db.refunds);
      let rows = [], shown = -1;
      const page = h('section.page.p1-refunds');
      page.append(A2.heading('售后', '逐条审批退款单；同意后原路退回，订单标记为已退款', [h('button.btn', { type: 'button', text: '刷新', on: { click: () => ctx.refresh() } }), A2.can('export') ? h('button.btn.btn--primary', { type: 'button', text: '导出结果', on: { click: () => doExport() } }) : null]));

      const tabsBox = h('div.p1-tabs'), batch = h('div.p1-batch', { hidden: true, role: 'region', 'aria-label': '批量审批' }), sumEl = h('span.muted.num');
      const reasons = () => [...new Set(src().map((r) => r.reason))];
      const reasonSel = h('select.select', { 'aria-label': '退款原因', style: { width: '148px' }, on: { change: (e) => { S.reason = e.target.value; refresh(); } } });
      const fill = () => { reasonSel.replaceChildren(h('option', { value: '', text: '全部原因' }), ...reasons().map((x) => h('option', { value: x, text: x, selected: S.reason === x }))); };
      const kindSel = h('select.select', { 'aria-label': '退款类型', style: { width: '136px' }, on: { change: (e) => { S.kind = e.target.value; refresh(); } } }, [['', '全部类型'], ['仅退款', '仅退款'], ['退货退款', '退货退款']].map(([v, l]) => h('option', { value: v, text: l })));
      const timeSel = h('select.select', { 'aria-label': '申请时间', style: { width: '136px' }, on: { change: (e) => { S.time = e.target.value; refresh(); } } }, [['all', '全部时间'], ['today', '今天申请'], ['7', '近 7 天'], ['30', '近 30 天']].map(([v, l]) => h('option', { value: v, text: l })));
      const overChk = h('input', { type: 'checkbox', id: 'p1r-over', on: { change: (e) => { S.over = e.target.checked; refresh(); } } });
      const overBox = h('label.row.p1-chk', { for: 'p1r-over' }, overChk, h('span', { text: '只看超 24 小时未处理' }));
      const search = A2.search('退款单号、订单号或会员', (v) => { S.q = v; refresh(); });
      const filters = h('div.row.wrap.p1-filters', {}, kindSel, reasonSel, timeSel, overBox, search);
      const tbl = A2.table({
        selectable: true, caption: '退款单', rows: [], empty: '没有符合条件的退款单', rowClass: (r) => 'p1-rf' + r.id, onSelect: () => paintBatch(),
        columns: [
          { title: '退款单号', cls: 'num', render: (r) => h('button.p1-link.num', { type: 'button', text: rno(r), on: { click: () => open(r) } }) },
          { title: '订单号', cls: 'num', render: (r) => r.orderNo },
          { title: '会员', render: (r) => r.userName },
          { title: '金额', cls: 'r', render: (r) => money(r.amount) },
          { title: '类型', render: (r) => r.kind },
          { title: '原因', ell: true, render: (r) => r.reason + (r.desc ? '：' + r.desc : '') },
          { title: '状态', render: (r) => h('span.row', { style: { gap: 'var(--s-1)' } }, A2.status(RST, r.status), r.manual && r.status !== 'DONE' ? h('span.badge.badge--info.badge--plain', { text: '人工处理中' }) : null) },
          { title: '申请时间', cls: 'num', render: (r) => h('div', {}, h('div', { text: short(r.appliedAt) }), r.status === 'PENDING' ? h('span.badge' + (overdue(r) ? '.badge--warn' : '.badge--plain'), { text: (overdue(r) ? '超时 ' : '已等 ') + waitText(r.appliedAt) }) : null) },
          { title: '操作', cls: 'c', render: (r) => acts(r) },
        ],
      });
      const main = h('div.main', {}, h('div.card.card--tight.stack', {}, h('div.row.between.wrap', {}, h('h2', { text: '退款单' }), sumEl), tabsBox, filters), batch, tbl.el);
      const rail = h('aside.rail', { 'aria-label': '待审批提醒与统计' });
      page.append(h('div.l-rail', {}, main, rail));

      const open = (r) => detail(r);
      function acts(r) {
        const box = h('div.p1-acts'), live = r.status === 'PENDING' || r.status === 'APPROVED';
        if (r.status === 'PENDING') box.append(h('button.btn.btn--soft.btn--sm', { type: 'button', text: '同意', on: { click: () => approve(r) } }));
        if (r.status === 'APPROVED') box.append(h('button.btn.btn--soft.btn--sm', { type: 'button', text: '重试退款', on: { click: () => retry(r) } }));
        if (!live) box.append(h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '详情', on: { click: () => open(r) } }));
        if (live) {
          const more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + rno(r) }, UI.icon('more', 'icon--sm')); box.append(more);
          P1.menu(more, [{ label: '查看详情', icon: 'list', on: () => open(r) }, r.status === 'PENDING' ? { label: '拒绝退款', icon: 'x', danger: true, on: () => reject(r) } : null, { label: '转人工处理', icon: 'users', on: () => manual(r) }].filter(Boolean));
        }
        return box;
      }

      /* ---- 处理动作 ---- */
      const finish = (r) => { touched.add(r.id); refreshAll(); };
      const conflict = (r) => { if (ctx.scene === 'approve-conflict' && r.status === 'PENDING') { r.status = 'REJECTED'; r.handler = '会员本人'; r.note = '会员撤销了申请'; (r.trail = r.trail || []).push({ at: nowStr(), who: r.userName + '（会员）', text: '撤销了退款申请' }); const o = P1.byNo(r.orderNo); if (o && o.status === 'REFUNDING') P1.setStatus(o, o.prev || 'DONE', 'reverted', '会员撤销退款，订单恢复', r.userName + '（会员）'); bad('审批失败：会员刚刚撤销了这条申请，列表已刷新'); finish(r); return true; } return false; };
      /** 同意的内核：校验金额与状态、走渠道、本地补偿；返回 {ok, why}，不弹窗，批量与单条共用 */
      async function approveCore(r, cents, note) {
        const o = P1.byNo(r.orderNo);
        if (r.status !== 'PENDING' && r.status !== 'APPROVED') return { ok: false, why: '现在是' + RST[r.status][0] + '，不能再同意' };
        const max = o ? P1.refundable(o, r) : r.amount;
        if (cents <= 0 || cents > max) return { ok: false, why: '金额超出可退上限 ' + money(max) };
        if (!(await P1.net(600))) return { ok: false, why: '网络不太稳定', net: true };
        if (conflict(r)) return { ok: false, why: '会员刚撤销了申请' };
        r.handler = A2.me().name; if (note) r.note = note;
        if (ctx.scene === 'channel-fail') {
          r.status = 'APPROVED'; r.amount = cents; (r.trail = r.trail || []).push({ at: nowStr(), who: A2.me().name, text: '同意退款 ' + money(cents) + '，但支付渠道没有受理，等待重试' });
          A2.audit('refund:approve', '同意退款（渠道未受理）', rno(r) + '，订单 ' + r.orderNo + '，' + money(cents)); return { ok: false, why: '支付渠道没有受理，已转为“已同意”，稍后重试退款' };
        }
        P1.settle(r, cents, '同意退款 ' + money(cents) + '，' + payTo(o) + (note ? '；意见：' + note : ''));
        A2.audit('refund:approve', '同意退款', rno(r) + '，订单 ' + r.orderNo + '，' + money(cents)); return { ok: true };
      }
      function approveDlg(r) {
        const o = P1.byNo(r.orderNo), max = o ? P1.refundable(o, r) : r.amount, again = r.status === 'APPROVED';
        const f = A2.form([
          { name: 'amount', label: '同意退款金额（元）', type: 'number', required: true, value: (r.amount / 100).toFixed(2), hint: '申请金额 ' + money(r.amount) + '，最多可退 ' + money(max) + '（实付 ' + money(o ? o.amount : r.amount) + ' 减去其他退款）', validate: (v) => (v <= 0 ? '退款金额要大于 0' : !P1.isMoney(v) ? '金额最多两位小数' : P1.parseYuan(v) > max ? '超出可退上限 ' + money(max) : '') },
          { name: 'note', label: '处理意见（可不填）', type: 'textarea', max: 200 },
        ]);
        const msg = h('p.p1-confirm'), upd = () => { const v = Number(f.values().amount); msg.replaceChildren('将向 ', h('strong', { text: r.userName }), ' 退款 ', h('strong.num', { text: isNaN(v) ? '—' : money(Math.round(v * 100)) }), '，', payTo(o), '；订单 ', h('span.num', { text: r.orderNo }), ' 标记为已退款，无法撤销。'); };
        f.el.addEventListener('input', upd); upd();
        let out = null;
        return P1.dlg(() => UI.dialog({ title: again ? '重试退款' : '同意退款', size: 'sm', body: h('div.stack', {}, msg, f.el, r.kind === '退货退款' ? h('p.muted', { text: '这是一笔退货退款，请确认商品已经退回。' }) : null), actions: [{ label: '取消', value: null }, { label: '确认同意并退款', kind: 'primary', value: 'ok', on: () => { if (!f.validate()) return false; out = f.values(); } }] }).then((v) => (v === 'ok' ? out : null)));
      }
      async function approve(r) {
        const v = await approveDlg(r); if (!v) return false;
        const res = await approveCore(r, P1.parseYuan(v.amount), v.note);
        if (res.ok) { UI.toast('已同意，' + money(P1.parseYuan(v.amount)) + ' 原路退回'); finish(r); } else if (!res.net && !/撤销/.test(res.why)) { bad(res.why); finish(r); }
        return res.ok;
      }
      const retry = (r) => approve(r);
      async function reject(r) {
        if (r.status !== 'PENDING') { bad('现在是' + RST[r.status][0] + '，不能再拒绝'); return false; }
        const why = await P1.dlg(() => A2.reason('拒绝退款', '拒绝原因会展示给会员，请写清楚。')); if (!why) return false;
        if (!(await P1.net(500))) return false;
        if (conflict(r)) return false;
        const o = P1.byNo(r.orderNo);
        r.status = 'REJECTED'; r.handler = A2.me().name; r.note = why; (r.trail = r.trail || []).push({ at: nowStr(), who: A2.me().name, text: '拒绝退款：' + why });
        if (o && o.status === 'REFUNDING') P1.setStatus(o, o.prev || 'DONE', 'reverted', '退款被拒绝，订单恢复');
        A2.audit('refund:approve', '拒绝退款', rno(r) + '，订单 ' + r.orderNo + '，原因：' + why);
        UI.toast('已拒绝，原因会展示给会员'); finish(r); return true;
      }
      async function manual(r) {
        const v = await P1.dlg(() => A2.edit({ title: '转人工处理', size: 'sm', ok: '确认转交', fields: [{ name: 'to', label: '转给', type: 'select', options: ['店长 周敏', '财务 赵建国'], value: '店长 周敏' }, { name: 'note', label: '说明', type: 'textarea', max: 200, required: true, hint: '写清为什么需要人工，比如要联系顾客核实' }], submit: (vals) => {
          if (conflict(r)) return false;
          r.manual = { to: vals.to, at: nowStr() }; (r.trail = r.trail || []).push({ at: nowStr(), who: A2.me().name, text: '转人工处理，转给 ' + vals.to + '：' + vals.note });
          A2.audit('refund:approve', '退款转人工', rno(r) + '，订单 ' + r.orderNo + '，转给 ' + vals.to);
        } }));
        if (v) { UI.toast('已转给 ' + v.to.split(' ')[1] + ' 人工处理'); finish(r); }
        return !!v;
      }
      /* 售后详情：概况、凭证、处理记录 */
      const metaOf = (k, v) => h('div.p1-m', {}, h('span.muted', { text: k }), h('strong', {}, v));
      function ovPanel(r) {
        const o = P1.byNo(r.orderNo), u = o && P1.user(o.userId);
        return h('div.stack-lg', {},
          h('div.p1-meta', {}, metaOf('退款单号', h('span.num', { text: rno(r) })), metaOf('状态', A2.status(RST, r.status)), metaOf('类型', r.kind), metaOf('申请时间', h('span.num', { text: short(r.appliedAt) })), metaOf('会员', r.userName + (u ? ' · ' + B.maskPhone(u.phone) : '')), metaOf('退款去向', payTo(o))),
          h('div.p1-refund-amt', {}, h('span.muted', { text: '申请退款' }), h('strong.num', { text: money(r.amount) }), o ? h('span.muted', { text: '订单实付 ' + money(o.amount) + '，最多可退 ' + money(P1.refundable(o, r)) }) : null, r.status === 'PENDING' ? h('span.badge' + (overdue(r) ? '.badge--warn' : '.badge--plain'), { text: '已等 ' + waitText(r.appliedAt) + (overdue(r) ? '，超过 24 小时' : '') }) : null),
          A2.kv([['退款原因', r.reason], ['补充说明', r.desc || '会员没有补充'], ['处理人', r.handler || '尚未处理'], ['处理意见', r.note || '—']]),
          o ? h('section.stack', {}, h('div.row.between', {}, h('h3', { text: '订单信息' }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '查看订单 ' + o.no, on: { click: () => A2.orderDetail(o, { ctx, onChange: () => refreshAll() }) } })), A2.kv([['订单状态', P1.badge(o.status)], ['下单时间', o.createdAt], ['支付方式', B.PAY[o.pay]], ['取餐号', o.pickup]]), h('div.p1-items', {}, o.items.map((i) => h('div.p1-item', {}, P1.thumb(i.img, 'p1-thumb--sm', i.name), h('div', {}, h('strong', { text: i.name }), h('div.muted', { text: i.spec + ' · ' + money(i.price) + ' × ' + i.qty })), h('span.num', { text: money(i.price * i.qty) }))))) : null);
      }
      function proofPanel(r) {
        const o = P1.byNo(r.orderNo), imgs = o ? o.items.map((i) => i.img).filter(Boolean).slice(0, 3) : [];
        if (!imgs.length) return A2.empty('会员没有上传凭证');
        return h('div.stack', {}, h('p.muted', { text: '会员上传的凭证（演示用商品图占位），共 ' + imgs.length + ' 张' }), h('div.p1-proofs', {}, imgs.map((s, i) => h('figure.p1-proof', {}, h('img', { src: s, alt: '凭证 ' + (i + 1) + '：' + r.reason, loading: 'lazy' }), h('figcaption.muted', { text: '凭证 ' + (i + 1) })))));
      }
      const recPanel = (r) => h('div.list.p1-rec', {}, trailOf(r).map((t) => h('div', {}, h('span.muted.num.p1-rec-t', { text: short(t.at) }), h('span.p1-rec-w', { text: t.who }), h('span.grow', { text: t.text }))));
      async function detail(r) {
        let dirty = false;
        const acts2 = [{ label: '关闭', value: null }];
        if (r.status === 'PENDING' || r.status === 'APPROVED') acts2.push({ label: '转人工', value: 'manual', on: async () => { await manual(r); dirty = true; return false; } });
        if (r.status === 'PENDING') { acts2.push({ label: '拒绝', kind: 'danger', value: 'reject', on: async () => { if (!(await reject(r))) return r.status === 'PENDING' ? false : undefined; dirty = false; } }); acts2.push({ label: '同意退款', kind: 'primary', value: 'approve', on: async () => { const ok = await approve(r); if (!ok && r.status === 'PENDING') return false; dirty = false; } }); }
        if (r.status === 'APPROVED') acts2.push({ label: '重试退款', kind: 'primary', value: 'retry', on: async () => { const ok = await approve(r); if (!ok) return false; dirty = false; } });
        await P1.dlg(() => A2.detail({ title: '退款单 ' + rno(r), tabs: [{ id: 'ov', label: '概况', node: ovPanel(r) }, { id: 'proof', label: '凭证', node: proofPanel(r) }, { id: 'rec', label: '处理记录', node: recPanel(r) }], actions: acts2 }));
        if (dirty) refreshAll();
      }

      /* ---- 批量审批 ---- */
      function paintBatch() {
        const l = tbl.selected(); batch.hidden = !l.length; batch.replaceChildren(); if (!l.length) return;
        const pend = l.filter((r) => r.status === 'PENDING');
        batch.append(h('span.num', { text: '已选 ' + l.length + ' 条，待处理 ' + pend.length + ' 条，合计 ' + money(pend.reduce((s, r) => s + r.amount, 0)) }), h('span.grow'), h('button.btn.btn--primary.btn--sm', { type: 'button', text: '批量同意', on: { click: () => runBatch('approve') } }), h('button.btn.btn--danger.btn--sm', { type: 'button', text: '批量拒绝', on: { click: () => runBatch('reject') } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '取消选择', on: { click: () => { tbl.clear(); paintBatch(); } } }));
      }
      async function runBatch(kind) {
        const l = tbl.selected(), pend = l.filter((r) => r.status === 'PENDING'), tot = pend.reduce((s, r) => s + r.amount, 0), skip = l.length - pend.length;
        if (!pend.length) return bad('选中的退款单里没有待处理的');
        let why = '';
        if (kind === 'approve') {
          const yes = await P1.dlg(() => A2.danger('将同意 ' + pend.length + ' 条退款，合计 ' + money(tot) + '，款项原路退回给会员，订单标记为已退款，无法撤销。' + (skip ? '另有 ' + skip + ' 条不是待处理状态，会被跳过并写明原因。' : ''), { title: '批量同意退款', ok: '确认同意 ' + pend.length + ' 条' }));
          if (!yes) return;
        } else { why = await P1.dlg(() => A2.reason('批量拒绝退款', '将拒绝 ' + pend.length + ' 条退款（合计 ' + money(tot) + '），同一条原因会展示给这些会员。')); if (!why) return; }
        const badList = []; let ok = 0;
        l.forEach((r) => { if (r.status !== 'PENDING') badList.push({ label: rno(r), why: '现在是' + RST[r.status][0] + '，已处理过' }); });
        for (const r of pend) {
          if (kind === 'approve') { const res = await approveCore(r, r.amount); if (res.ok) ok++; else { badList.push({ label: rno(r), why: res.why }); if (res.net) break; } }
          else { const o = P1.byNo(r.orderNo); r.status = 'REJECTED'; r.handler = A2.me().name; r.note = why; (r.trail = r.trail || []).push({ at: nowStr(), who: A2.me().name, text: '批量拒绝：' + why }); if (o && o.status === 'REFUNDING') P1.setStatus(o, o.prev || 'DONE', 'reverted', '退款被拒绝，订单恢复'); A2.audit('refund:approve', '拒绝退款', rno(r) + '，订单 ' + r.orderNo + '，原因：' + why); ok++; }
          touched.add(r.id);
        }
        refreshAll(); P1.report(kind === 'approve' ? '批量同意' : '批量拒绝', ok, badList);
      }
      async function doExport() { const n = rows.length; if (!n) return bad('当前筛选没有退款单可导出'); await A2.export('售后_' + (RTABS.find((t) => t[0] === S.tab) || [])[1], '售后', n); }

      /* ---- 列表与右侧窄栏 ---- */
      function calc() {
        const lo = { today: 0, 7: 6, 30: 29 }[S.time], q = S.q.toLowerCase(), cut = lo == null ? '' : dayOf(B.fmt(new Date(B.NOW().getTime() - lo * 864e5)));
        const base = src().filter((r) => (!S.kind || r.kind === S.kind) && (!S.reason || r.reason === S.reason) && (!cut || dayOf(r.appliedAt) >= cut) && (!S.over || overdue(r)) && (!q || rno(r).toLowerCase().includes(q) || r.orderNo.includes(q) || r.userName.toLowerCase().includes(q)));
        const counts = {}; base.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
        const rs = base.filter((r) => r.status === S.tab).sort((a, b) => (S.tab === 'PENDING' ? (a.appliedAt < b.appliedAt ? -1 : 1) : a.appliedAt < b.appliedAt ? 1 : -1));
        return { base, counts, rows: rs };
      }
      function refresh(keep) {
        const c = calc(); rows = c.rows;
        tabsBox.replaceChildren(A2.statusTabs(RTABS.map(([id, l]) => ({ id, label: l, count: c.counts[id] || 0 })), S.tab, (id) => { S.tab = id; refresh(); }));
        sumEl.textContent = '当前标签 ' + c.rows.length + ' 条，金额合计 ' + money(c.rows.reduce((s, r) => s + r.amount, 0));
        overBox.hidden = S.tab !== 'PENDING' && !S.over;
        if (keep && shown === c.rows.length) tbl.clear(); else tbl.setRows(c.rows);
        shown = c.rows.length; paintBatch(); P1.sweep();
        if (touched.size) requestAnimationFrame(() => { touched.forEach((id) => P1.flash(tbl.el.querySelector('.p1-rf' + id))); touched.clear(); });
      }
      function paintRail() {
        const all = src(), pend = all.filter((r) => r.status === 'PENDING').sort((a, b) => (a.appliedAt < b.appliedAt ? -1 : 1)), over = pend.filter(overdue), today = dayOf(nowStr());
        const doneToday = all.filter((r) => r.status === 'DONE' && dayOf(r.doneAt || r.appliedAt) === today), sum = doneToday.reduce((s, r) => s + r.amount, 0);
        /* 待审批提醒 */
        const remind = h('section.card.card--tight', { 'aria-label': '待审批提醒' }, h('div.card-head', {}, h('h3', { text: '待审批提醒' }), h('span.badge' + (over.length ? '.badge--warn' : ''), { text: pend.length + ' 条待审批' })),
          pend.length ? h('div.stack', {}, h('p.muted', {}, '其中 ', h('b.num', { text: over.length }), ' 条已超过 24 小时，',
            over.length ? h('button.p1-link', { type: 'button', text: '只看这些', on: { click: () => { S.tab = 'PENDING'; S.over = true; overChk.checked = true; refresh(); } } }) : '都在时限内'),
            h('div.list', {}, pend.slice(0, 5).map((r) => h('button.p1-remind', { type: 'button', 'aria-label': '处理 ' + rno(r), on: { click: () => open(r) } }, h('span.grow', {}, h('div', {}, h('strong.num', { text: rno(r) }), ' ' + r.userName), h('div.muted.num', { text: money(r.amount) + ' · ' + r.kind })), h('span.badge' + (overdue(r) ? '.badge--warn' : '.badge--plain'), { text: (overdue(r) ? '超时 ' : '已等 ') + waitText(r.appliedAt) }))))) : h('p.muted', { text: '没有待审批的退款，都处理完了。' }));
        /* 退款原因分布 */
        const by = {}; all.forEach((r) => { by[r.reason] = (by[r.reason] || 0) + 1; });
        const items = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: UI.chartColors[i % 6] })), tot = all.length;
        const pieBox = h('div.p1-donut');
        const dist = h('section.card.card--tight', { 'aria-label': '退款原因分布' }, h('div.card-head', {}, h('h3', { text: '退款原因分布' }), h('span.muted', { text: '全部 ' + tot + ' 笔' })), tot ? h('div.stack', {}, pieBox,
          h('ul.p1-legend', { role: 'list' }, items.map((x) => h('li', {}, h('i', { style: { background: x.color } }), h('span.grow', { text: x.name }), h('span.num', { text: x.value + ' 笔 · ' + Math.round((x.value / tot) * 100) + '%' })))),
          h('p.muted', { text: '最多的原因是“' + items[0].name + '”，占 ' + Math.round((items[0].value / tot) * 100) + '%。' })) : h('p.muted', { text: '还没有退款单' }));
        /* 今日退款额 */
        const td = h('section.card.card--tight.stat.stat--sm', { 'aria-label': '今日退款额' }, h('span.stat-label', { text: '今日退款额' }), h('span.stat-value.num', { id: 'p1r-today', text: '0' }), h('span.stat-sub', {}, h('span.muted', { text: '今日已退款 ' + doneToday.length + ' 笔；全部待处理金额 ' + money(pend.reduce((s, r) => s + r.amount, 0)) })));
        rail.replaceChildren(remind, dist, td);
        if (tot) UI.donut(pieBox, items, { size: 152, center: { value: String(tot), label: '笔' }, aria: '退款原因分布：' + items.map((x) => x.name + ' ' + x.value + ' 笔').join('，') });
        UI.count(td.querySelector('#p1r-today'), sum / 100, { prefix: '¥', dec: 2 });
      }
      function refreshAll() { fill(); refresh(true); paintRail(); }
      return A2.load(() => { fill(); refresh(); paintRail(); return page; });
    },
  };
})();
