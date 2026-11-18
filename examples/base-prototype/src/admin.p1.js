/* 第一组页面（r1）：订单、履约看板、售后、商品、素材库。
   本文件放共用件 window.P1（订单状态、时间、退款结算、对话框与菜单整理、批量结果）、订单详情 window.A2.orderDetail，以及订单页。
   履约看板与售后在 admin.p1b.js，商品与素材库在 admin.p1c.js；三个文件按文件名顺序合进同一个页面。 */
(function () {
  'use strict';
  const { h } = UI;
  const P1 = (window.P1 = {});
  UI.icons.print = 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z';
  UI.icons.pack = 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8';
  UI.icons.drag = 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01';

  /* ---------- 基础：状态名、金额、时间 ---------- */
  P1.OSTAT = { UNPAID: ['待支付', 'info'], PAID: ['待履约', 'warn'], FULFILLED: ['已出餐', 'brand'], DONE: ['已完成', 'ok'], CANCELLED: ['已取消', ''], REFUNDING: ['退款中', 'bad'], REFUNDED: ['已退款', ''] };
  const OST = P1.OSTAT, COUNTED = ['PAID', 'FULFILLED', 'DONE'];
  const money = (c) => UI.money(c);
  const nowStr = () => B.fmt(B.NOW());
  const short = (s) => (s || '').slice(5);
  const dayOf = (s) => (s || '').slice(0, 10);
  P1.money = money; P1.short = short; P1.dayOf = dayOf; P1.nowStr = nowStr;
  P1.parse = (s) => new Date(s.replace(' ', 'T') + ':00');
  P1.minsSince = (s) => Math.max(0, Math.round((B.NOW().getTime() - P1.parse(s).getTime()) / 60000));
  P1.itemsText = (o) => o.items.map((i) => i.name + ' ×' + i.qty).join('、');
  P1.pickup = (o) => o.pickup;
  P1.byNo = (no) => B.db.orders.find((o) => o.no === no);
  P1.user = (id) => B.db.users.find((u) => u.id === id);
  P1.badge = (key) => A2.status(OST, key);
  P1.cap = (n, t) => h('span.badge.badge--plain', { text: t });

  /* 弹出菜单只增不减：重绘后清掉触发器已经不在页面上的菜单 */
  P1.menu = (trigger, items) => UI.menu(trigger, items);
  P1.sweep = () => setTimeout(() => document.querySelectorAll('[popover].menu').forEach((m) => { if (!document.querySelector('[popovertarget="' + m.id + '"]')) m.remove(); }), 0);
  /* UI.dialog 每个对话框的标题都叫同一个名字；叠着打开时给每个换一个，并打上 p1-dlg 好让底部按钮在窄屏换行 */
  let dn = 0;
  P1.dlg = (fn) => {
    const before = new Set(document.querySelectorAll('dialog.dlg')), p = fn(), d = [...document.querySelectorAll('dialog.dlg')].find((x) => !before.has(x));
    if (d) { d.classList.add('p1-dlg'); const t = d.querySelector('#dlg-t'); if (t) { t.id = 'p1t' + ++dn; d.setAttribute('aria-labelledby', t.id); } }
    return p;
  };
  /* 改动过的行闪一次（背景色淡入淡出）；减少动态效果时只留一个极短的淡入 */
  P1.flash = (el) => { if (el) UI.play(el, [{ backgroundColor: 'var(--brand-soft)', opacity: 1 }, { backgroundColor: 'var(--brand-soft)', opacity: 1, offset: 0.35 }, { backgroundColor: 'transparent', opacity: 1 }], { duration: 1400, easing: 'ease-out' }); };
  /* 模拟一次请求：断网时提示并返回 false */
  P1.net = async (ms) => { try { await UI.request(null, ms || 300); return true; } catch (e) { UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); return false; } };
  /* 批量结果：成功几条、失败几条，失败的逐条写原因 */
  P1.report = (verb, ok, bad) => {
    if (!bad.length) { UI.toast(verb + ' ' + ok + ' 条'); return Promise.resolve(); }
    UI.toast(verb + '：成功 ' + ok + ' 条，失败 ' + bad.length + ' 条', { kind: ok ? undefined : 'bad' });
    return P1.dlg(() => UI.dialog({ title: verb + '结果', size: 'sm', body: h('div.stack', {}, h('p', { text: '成功 ' + ok + ' 条，失败 ' + bad.length + ' 条。失败的原因：' }), h('div.list', {}, bad.map((b) => h('div', {}, h('span.grow', { text: b.label }), h('span.muted', { text: b.why }))))), actions: [{ label: '知道了', kind: 'primary', value: 'ok' }] }));
  };
  P1.thumb = (src, cls, alt) => (src ? h('img.p1-thumb' + (cls ? '.' + cls : ''), { src, alt: alt || '', loading: 'lazy' }) : h('span.p1-thumb.p1-thumb--empty' + (cls ? '.' + cls : ''), { role: 'img', 'aria-label': alt || '没有图片' }, UI.icon('image')));
  P1.parseYuan = (v) => Math.round(Number(v) * 100);
  P1.isMoney = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

  /* ---------- 订单：时间、状态改动、退款 ---------- */
  /** 每个状态的发生时间：本页操作过的取 o.t，没有的按下单与付款时间推一个不晚于现在的合理值 */
  P1.times = (o) => {
    const t = o.t || {}, n = +o.no.slice(-3), end = B.NOW().getTime(), base = P1.parse(o.paidAt || o.createdAt).getTime(), s = o.status;
    const at = (m) => B.fmt(new Date(Math.min(end, base + m * 60000)));
    return {
      created: o.createdAt, paid: o.paidAt || '',
      fulfilled: t.fulfilled || (s === 'FULFILLED' || s === 'DONE' ? at(9 + (n % 6)) : ''),
      done: t.done || (s === 'DONE' ? at(16 + (n % 9)) : ''),
      cancelled: t.cancelled || (s === 'CANCELLED' ? (o.paidAt ? at(4 + (n % 5)) : B.fmt(new Date(Math.min(end, P1.parse(o.createdAt).getTime() + 30 * 60000)))) : ''),
      refunding: t.refunding || (s === 'REFUNDING' || s === 'REFUNDED' ? at(60 + (n % 40)) : ''),
      refunded: t.refunded || (s === 'REFUNDED' ? at(120 + (n % 60)) : ''),
    };
  };
  /** 改状态：记发生时间与操作记录，并维护会员的下单数与消费额（只算待履约、已出餐、已完成） */
  P1.log = (o, who, text) => { (o.log = o.log || []).push({ at: nowStr(), who, text }); };
  P1.setStatus = (o, to, key, text, who) => {
    const from = o.status, was = COUNTED.includes(from), will = COUNTED.includes(to);
    o.status = to; (o.t = o.t || {})[key] = nowStr();
    if (to === 'PAID' && !o.paidAt) o.paidAt = nowStr();
    if (to === 'REFUNDING') o.prev = from;
    if (was !== will) { const u = P1.user(o.userId); if (u) { u.orders += will ? 1 : -1; u.spent += will ? o.amount : -o.amount; } }
    P1.log(o, who || A2.me().name, text);
  };
  P1.refundable = (o, except) => o.amount - B.db.refunds.filter((r) => r.orderNo === o.no && r.status !== 'REJECTED' && r !== except).reduce((s, r) => s + r.amount, 0);
  P1.createRefund = (o, cents, kind, reason, desc, first) => {
    const db = B.db, r = { id: db.refunds.reduce((m, x) => Math.max(m, x.id), 0) + 1, orderNo: o.no, userName: o.userName, amount: cents, reason, kind, status: 'PENDING', appliedAt: nowStr(), handler: '', note: '', desc: desc || '', by: A2.me().name, trail: [{ at: nowStr(), who: A2.me().name, text: first || '后台代会员提交退款申请 ' + money(cents) + '（' + kind + '，' + reason + '）' }] };
    db.refunds.unshift(r); return r;
  };
  /** 退款成功后的本地补偿：退款单置已完成；储值支付的把钱加回会员余额并记一条退款流水；是演示会员本人的发一条通知 */
  P1.settle = (r, cents, text) => {
    const db = B.db, o = P1.byNo(r.orderNo);
    r.amount = cents; r.status = 'DONE'; r.handler = A2.me().name; r.doneAt = nowStr();
    (r.trail = r.trail || []).push({ at: nowStr(), who: A2.me().name, text: text || '同意退款 ' + money(cents) + '，原路退回' });
    if (!o) return;
    if (o.status === 'REFUNDING') P1.setStatus(o, 'REFUNDED', 'refunded', '退款完成 ' + money(cents) + '，原路退回');
    const u = P1.user(o.userId);
    if (u && o.pay === 'BALANCE') {
      u.balance += cents;
      db.walletLogs.unshift({ id: db.walletLogs.reduce((m, x) => Math.max(m, x.id), 0) + 1, userId: u.id, userName: u.name, kind: '退款', amount: cents, balance: u.balance, at: nowStr(), ref: '订单 ' + o.no });
    }
    if (u && db.me && u.id === db.me.id) db.notices.unshift({ id: db.notices.reduce((m, x) => Math.max(m, x.id), 0) + 1, kind: '订单', title: '退款已到账', body: '订单退款 ' + money(cents) + ' 已原路退回。', at: nowStr(), read: false });
  };
  P1.canRefund = (o) => ['PAID', 'FULFILLED', 'DONE'].includes(o.status) && P1.refundable(o) > 0;

  /* ---------- 订单操作：订单页、详情、履约看板共用 ---------- */
  const bad = (t) => UI.toast(t, { kind: 'bad' });
  P1.op = {
    async fulfil(o, ctx) {
      if (o.status !== 'PAID') { bad('订单现在是' + OST[o.status][0] + '，不能出餐'); return false; }
      if (!(await P1.net(300))) return false;
      if (ctx && ctx.scene === 'fulfil-conflict') { P1.setStatus(o, 'FULFILLED', 'fulfilled', '同事已出餐', '其他同事'); bad('这单刚被其他同事出餐了，已刷新为最新状态'); return false; }
      P1.setStatus(o, 'FULFILLED', 'fulfilled', '出餐');
      A2.audit('order:fulfil', '订单出餐', '订单 ' + o.no); UI.toast('已出餐，取餐号 ' + o.pickup); return true;
    },
    async done(o, ctx) {
      if (o.status !== 'FULFILLED') { bad('订单现在是' + OST[o.status][0] + '，不能标记完成'); return false; }
      if (!(await P1.net(300))) return false;
      if (ctx && ctx.scene === 'fulfil-conflict') { P1.setStatus(o, 'DONE', 'done', '同事已完成', '其他同事'); bad('这单刚被其他同事处理完成了，已刷新为最新状态'); return false; }
      P1.setStatus(o, 'DONE', 'done', '顾客取餐，订单完成');
      A2.audit('order:fulfil', '订单完成', '订单 ' + o.no); UI.toast('订单已完成'); return true;
    },
    async pay(o, ctx) {
      if (o.status !== 'UNPAID') { bad('订单现在是' + OST[o.status][0] + '，不能确认收款'); return false; }
      if (!(await P1.net(500))) return false;
      if (ctx && ctx.scene === 'pay-notfound') { bad('没有在支付渠道查到这笔付款，订单仍是待支付，请让顾客重新支付或稍后再查'); return false; }
      P1.setStatus(o, 'PAID', 'paid', '前台确认收款 ' + money(o.amount));
      A2.audit('order:fulfil', '确认收款', '订单 ' + o.no + '，' + money(o.amount)); UI.toast('已确认收款，订单进入待出餐'); return true;
    },
    async cancel(o, ctx) {
      if (!A2.can('cancel')) { bad('当前角色没有取消订单的权限'); return false; }
      if (!['UNPAID', 'PAID'].includes(o.status)) { bad('订单现在是' + OST[o.status][0] + '，不能取消'); return false; }
      const paid = o.status === 'PAID';
      const why = await P1.dlg(() => A2.reason('取消订单', paid ? '订单已付款，取消后会同时生成一笔 ' + money(o.amount) + ' 的退款，原路退回给会员。' : '订单还没有付款，取消后不会产生退款。'));
      if (!why) return false;
      if (!(await P1.net(400))) return false;
      if (ctx && ctx.scene === 'cancel-fail') { bad('取消失败：网络异常，订单状态没有变化，请稍后再试'); return false; }
      P1.setStatus(o, 'CANCELLED', 'cancelled', '取消订单：' + why);
      if (paid) { const r = P1.createRefund(o, o.amount, '仅退款', '商家取消', why, '商家取消订单，系统生成退款单 ' + money(o.amount)); r.note = '订单取消，系统自动原路退回'; r.by = '系统'; P1.settle(r, o.amount, '订单取消，系统自动退款 ' + money(o.amount) + '，原路退回'); }
      A2.audit('order:cancel', '取消订单' + (paid ? '并生成退款' : ''), '订单 ' + o.no + (paid ? '，退款 ' + money(o.amount) : ''));
      UI.toast(paid ? '订单已取消，退款 ' + money(o.amount) + ' 已原路退回' : '订单已取消'); return true;
    },
    async refund(o, ctx) {
      if (!P1.canRefund(o)) { bad('这笔订单现在不能发起退款'); return false; }
      const max = P1.refundable(o);
      const f = A2.form([
        { name: 'amount', label: '退款金额（元）', type: 'number', required: true, value: (max / 100).toFixed(2), hint: '最多可退 ' + money(max) + '（实付 ' + money(o.amount) + '，减去已退与退款中的金额）', validate: (v) => (v <= 0 ? '退款金额要大于 0' : !P1.isMoney(v) ? '金额最多两位小数' : P1.parseYuan(v) > max ? '超出可退金额 ' + money(max) : '') },
        { name: 'kind', label: '退款类型', type: 'select', options: ['仅退款', '退货退款'], value: '仅退款' },
        { name: 'reason', label: '退款原因', type: 'select', options: ['点错了', '菜品有问题', '重复下单', '送达太慢', '其他'], value: '点错了' },
        { name: 'desc', label: '补充说明', type: 'textarea', max: 200, placeholder: '选“其他”时必须填写，会展示给审批人', validate: () => '' },
      ]);
      let out = null;
      const ok = await P1.dlg(() => UI.dialog({ title: '发起退款', size: 'sm', body: h('div.stack', {}, h('p.muted', { text: '订单 ' + o.no + ' · ' + o.userName + ' · 实付 ' + money(o.amount) }), f.el), actions: [{ label: '取消', value: null }, { label: '提交申请', kind: 'primary', value: 'ok', on: async () => {
        if (!f.validate()) return false; const v = f.values();
        if (v.reason === '其他' && !v.desc) { f.error('desc', '原因选“其他”时请写明情况'); return false; }
        if (!(await P1.net(500))) return false;
        if (ctx && ctx.scene === 'refund-fail') { bad('提交失败：支付渠道暂时不可用，订单状态没有变化，请稍后再试'); return false; }
        out = v;
      } }] }));
      if (ok !== 'ok' || !out) return false;
      const cents = P1.parseYuan(out.amount), r = P1.createRefund(o, cents, out.kind, out.reason, out.desc);
      P1.setStatus(o, 'REFUNDING', 'refunding', '发起退款 ' + money(cents) + '（' + out.reason + '）');
      A2.audit('order:refund', '发起退款', '订单 ' + o.no + '，' + money(cents));
      UI.toast('已提交退款申请 ' + money(cents) + '，等待审批'); return r;
    },
    async note(o) {
      let changed = false;
      const v = await P1.dlg(() => A2.edit({ title: '订单备注', size: 'sm', fields: [{ name: 'note', label: '店内备注', type: 'textarea', max: 100, value: o.note || '', hint: '只有店里的同事看得到，顾客看不到' }], submit: async (vals) => { if (vals.note === (o.note || '')) return; changed = true; o.note = vals.note; P1.log(o, A2.me().name, vals.note ? '修改备注：' + vals.note : '清空备注'); A2.audit('order:fulfil', '修改订单备注', '订单 ' + o.no); } }));
      if (v && changed) UI.toast('备注已保存');
      return !!(v && changed);
    },
  };

  /* ---------- 小票预览 ---------- */
  P1.ticket = (o) => {
    const row = (a, b, cls) => h('div.p1-tk-row' + (cls ? '.' + cls : ''), {}, h('span', { text: a }), h('span.num', { text: b }));
    const sum = o.items.reduce((s, i) => s + i.qty, 0);
    return h('div.p1-ticket', { 'aria-label': '小票预览' },
      h('div.p1-tk-head', {}, h('strong', { text: B.shop.name }), h('span.muted', { text: B.shop.phone })),
      h('div.p1-tk-no', {}, h('span', { text: '取餐号' }), h('b.num', { text: o.pickup })),
      h('div.p1-tk-meta', {}, row('订单号', o.no), row('下单时间', o.createdAt), row('会员', o.userName)),
      h('div.p1-tk-items', {}, o.items.map((i) => h('div.p1-tk-item', {}, h('span', { text: i.name + '（' + i.spec + '）' }), h('span.num', { text: '×' + i.qty }), h('span.num', { text: money(i.price * i.qty) })))),
      h('div.p1-tk-meta', {}, row('商品合计 ' + sum + ' 件', money(o.subtotal)), o.discount ? row('优惠（' + (o.coupon || '优惠') + '）', '−' + money(o.discount)) : null, row('实付（' + B.PAY[o.pay] + '）', money(o.amount), 'p1-tk-total')),
      o.remark ? h('div.p1-tk-note', { text: '顾客备注：' + o.remark }) : null, o.note ? h('div.p1-tk-note', { text: '店内备注：' + o.note }) : null,
      h('div.p1-tk-foot.muted', { text: '谢谢惠顾，欢迎再来' }));
  };
  P1.printPreview = (o, ctx) => P1.dlg(() => UI.dialog({ title: '小票预览', size: 'sm', body: h('div.stack', {}, P1.ticket(o), h('p.muted', { text: '将发送到前台小票打印机' })), actions: [{ label: '关闭', value: null }, { label: '打印', kind: 'primary', value: 'ok', on: async () => {
    if (!(await P1.net(500))) return false;
    if (ctx && ctx.scene === 'print-fail') { bad('打印失败：前台小票打印机没有连接，请检查打印机后重试'); return false; }
    A2.audit('order:fulfil', '打印小票', '订单 ' + o.no); UI.toast('已发送到小票打印机');
  } }] }));

  /* ---------- 订单详情：概况、状态时间线、支付信息、操作记录 ---------- */
  const meta = (k, v) => h('div.p1-m', {}, h('span.muted', { text: k }), h('strong', {}, v));
  P1.ovPanel = (o) => {
    const u = P1.user(o.userId);
    return h('div.stack-lg', {},
      h('div.p1-meta', {}, meta('订单号', h('span.num', { text: o.no })), meta('状态', P1.badge(o.status)), meta('取餐号', h('span.num', { text: o.pickup })), meta('下单时间', h('span.num', { text: short(o.createdAt) })), meta('会员', o.userName + (u ? ' · ' + B.maskPhone(u.phone) : '')), meta('支付方式', B.PAY[o.pay])),
      h('section.stack', {}, h('h3', { text: '商品明细' }), h('div.p1-items', {}, o.items.map((i) => h('div.p1-item', {}, P1.thumb(i.img, 'p1-thumb--sm', i.name), h('div', {}, h('strong', { text: i.name }), h('div.muted', { text: i.spec + ' · ' + money(i.price) + ' × ' + i.qty })), h('span.num', { text: money(i.price * i.qty) }))))),
      h('section.p1-sum', {}, h('div', {}, h('span.muted', { text: '商品小计' }), h('span.num', { text: money(o.subtotal) })), h('div', {}, h('span.muted', { text: '优惠' + (o.coupon ? '（' + o.coupon + '）' : '') }), h('span.num', { text: o.discount ? '−' + money(o.discount) : '无' })), h('div.p1-sum-total', {}, h('strong', { text: '实付金额' }), h('strong.num', { text: money(o.amount) }))),
      h('section.stack', {}, h('h3', { text: '备注' }), A2.kv([['顾客备注', o.remark || '无'], ['店内备注', o.note || '暂无，可在下方“备注”里添加']])));
  };
  P1.flow = (o) => {
    const T = P1.times(o), s = o.status, N = [];
    const add = (label, at, note, reached, tone) => N.push({ label, at, note, reached, tone });
    const lastLog = (o.log || []).filter((l) => /^取消订单/.test(l.text)).pop();
    add('下单', T.created, o.userName + ' 提交订单', true);
    if (s === 'CANCELLED') {
      if (T.paid) add('支付', T.paid, B.PAY[o.pay] + ' ' + money(o.amount), true);
      add('取消', T.cancelled, lastLog ? lastLog.text.replace(/^取消订单：/, '原因：') : o.paidAt ? '订单取消' : '超时未支付，自动关闭', true, 'plain');
      if (T.paid) add('退款到账', T.cancelled, money(o.amount) + ' 原路退回', true);
    } else if (s === 'REFUNDING' || s === 'REFUNDED') {
      add('支付', T.paid, B.PAY[o.pay] + ' ' + money(o.amount), true);
      if (T.fulfilled) add('出餐', T.fulfilled, '取餐号 ' + o.pickup, true);
      if (T.done) add('完成', T.done, '顾客已取餐', true);
      add('申请退款', T.refunding, '退款审批中', true, 'bad');
      add('退款到账', T.refunded, s === 'REFUNDED' ? '原路退回' : '审批通过后原路退回', s === 'REFUNDED');
    } else {
      add('支付', T.paid, T.paid ? B.PAY[o.pay] + ' ' + money(o.amount) : '等待顾客支付，超时自动关闭', !!T.paid);
      add('出餐', T.fulfilled, T.fulfilled ? '取餐号 ' + o.pickup : '等待前台出餐', !!T.fulfilled);
      add('完成', T.done, T.done ? '顾客已取餐' : '等待顾客取餐', !!T.done);
    }
    let cur = -1; N.forEach((n, i) => { if (n.reached) cur = i; });
    return N.map((n, i) => Object.assign(n, { state: !n.reached ? 'todo' : i === cur ? 'current' : 'done' }));
  };
  P1.flowPanel = (o) => h('ol.p1-tl', { 'aria-label': '订单状态时间线' }, P1.flow(o).map((n) => {
    const end = o.status === 'DONE' || o.status === 'REFUNDED', mark = n.state === 'todo' ? '' : n.tone === 'plain' ? 'x' : n.state === 'done' || end ? 'check' : '';
    return h('li.p1-tl-i', { 'data-state': n.state, 'data-tone': n.tone || '', 'aria-current': n.state === 'current' ? 'step' : null },
      h('span.p1-tl-mk', { 'aria-hidden': 'true' }, mark ? UI.icon(mark, 'icon--sm') : null),
      h('div.p1-tl-b', {}, h('div.row.wrap', { style: { gap: 'var(--s-2)' } }, h('strong', { text: n.label }), n.state === 'current' ? h('span.badge.badge--brand', { text: '当前' }) : n.state === 'todo' ? h('span.muted', { text: '未到这一步' }) : null, n.at ? h('span.muted.num', { text: short(n.at) }) : null), h('div.muted', { text: n.note || '' })));
  }));
  P1.payPanel = (o) => {
    const refunds = B.db.refunds.filter((r) => r.orderNo === o.no), paid = !!o.paidAt;
    const state = { UNPAID: '未支付', CANCELLED: paid ? '已支付，取消后已退回' : '未支付，订单已取消', REFUNDING: '已支付，退款处理中', REFUNDED: '已支付，已退款' }[o.status] || '已支付';
    const u = P1.user(o.userId);
    return h('div.stack-lg', {}, A2.kv([['支付状态', state], ['支付方式', B.PAY[o.pay]], ['支付时间', paid ? o.paidAt : '—'], ['订单金额', money(o.subtotal)], ['优惠', o.discount ? '−' + money(o.discount) + '（' + o.coupon + '）' : '无'], ['实付金额', h('strong.num', { text: money(o.amount) })], ['支付单号', paid ? (o.pay === 'WECHAT' ? '4200' : o.pay === 'BALANCE' ? 'BAL' : 'CARD') + o.no.slice(-10) : '—'], o.pay === 'BALANCE' && u ? ['储值余额', money(u.balance)] : null].filter(Boolean)),
      h('section.stack', {}, h('h3', { text: '退款记录' }), refunds.length ? h('div.list', {}, refunds.map((r) => h('div', {}, h('span.grow', {}, h('strong.num', { text: 'RF' + String(r.id).padStart(5, '0') }), h('span.muted', { text: ' · ' + r.kind + ' · ' + r.reason + ' · ' + short(r.appliedAt) })), h('span.num', { text: money(r.amount) }), A2.status({ PENDING: ['待处理', 'warn'], APPROVED: ['已同意', 'info'], REJECTED: ['已拒绝', ''], DONE: ['已完成', 'ok'] }, r.status)))) : h('p.muted', { text: '这笔订单没有退款记录' })));
  };
  P1.records = (o) => {
    const T = P1.times(o), logged = new Set(Object.keys(o.t || {})), R = [{ at: T.created, who: o.userName + '（会员）', text: '提交订单' + (o.coupon ? '，使用 ' + o.coupon : '') }];
    if (T.paid) R.push({ at: T.paid, who: '系统', text: '收到' + B.PAY[o.pay] + '付款 ' + money(o.amount) });
    [['fulfilled', '出餐'], ['done', '顾客取餐，订单完成'], ['cancelled', o.paidAt ? '取消订单' : '超时未支付，自动关闭'], ['refunding', '申请退款'], ['refunded', '退款完成，原路退回']].forEach(([k, t]) => { if (T[k] && !logged.has(k)) R.push({ at: T[k], who: k === 'cancelled' && !o.paidAt ? '系统' : k === 'refunded' ? '系统' : k === 'refunding' ? o.userName + '（会员）' : '前台', text: t }); });
    (o.log || []).forEach((l) => R.push(l));
    R.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return R.reverse();
  };
  P1.recPanel = (o) => h('div.list.p1-rec', {}, P1.records(o).map((r) => h('div', {}, h('span.muted.num.p1-rec-t', { text: short(r.at) }), h('span.p1-rec-w', { text: r.who }), h('span.grow', { text: r.text }))));

  /** 订单详情对话框（订单页、履约看板共用）：opts = {ctx, onChange(o)}，对话框关闭后如果动过订单就调 onChange */
  P1.openOrder = (o, opts) => {
    opts = opts || {}; const ctx = opts.ctx || {}; let dirty = false;
    const panels = () => [P1.ovPanel(o), P1.flowPanel(o), P1.payPanel(o), P1.recPanel(o)];
    const repaint = (body) => { const p = panels(); body.querySelectorAll('[role=tabpanel]').forEach((el, i) => el.replaceChildren(p[i])); };
    const acts = [{ label: '关闭', value: null }];
    acts.push({ label: '备注', value: 'note', on: async (body) => { if (await P1.op.note(o)) { dirty = true; repaint(body); } return false; } });
    acts.push({ label: '打印小票', value: 'print', on: async () => { await P1.printPreview(o, ctx); return false; } });
    if (P1.canRefund(o)) acts.push({ label: '发起退款', value: 'refund', on: async () => { const r = await P1.op.refund(o, ctx); if (!r) return false; dirty = true; } });
    if (A2.can('cancel') && ['UNPAID', 'PAID'].includes(o.status)) acts.push({ label: '取消订单', kind: 'danger', value: 'cancel', on: async () => { const ok = await P1.op.cancel(o, ctx); if (!ok) return false; dirty = true; } });
    if (o.status === 'PAID') acts.push({ label: '出餐', kind: 'primary', value: 'fulfil', on: async () => { const ok = await P1.op.fulfil(o, ctx); dirty = true; if (!ok) return o.status !== 'PAID' ? undefined : false; } });
    if (o.status === 'FULFILLED') acts.push({ label: '标记完成', kind: 'primary', value: 'done', on: async () => { const ok = await P1.op.done(o, ctx); dirty = true; if (!ok) return o.status !== 'FULFILLED' ? undefined : false; } });
    const p = P1.dlg(() => A2.detail({ title: '订单 ' + o.no, tabs: [{ id: 'ov', label: '概况', node: P1.ovPanel(o) }, { id: 'flow', label: '状态时间线', node: P1.flowPanel(o) }, { id: 'pay', label: '支付信息', node: P1.payPanel(o) }, { id: 'rec', label: '操作记录', node: P1.recPanel(o) }], actions: acts }));
    return p.then((v) => { if (dirty && opts.onChange) opts.onChange(o); return v; });
  };
  A2.orderDetail = P1.openOrder;

  /* ====================== 订单页：横带分层 ====================== */
  const TABS = [['ALL', '全部'], ['UNPAID', '待支付'], ['PAID', '待履约'], ['FULFILLED', '已出餐'], ['DONE', '已完成'], ['CANCELLED', '已取消'], ['REFUNDING', '退款中'], ['REFUNDED', '已退款']];
  const RANGES = [['today', '今天'], ['3', '近 3 天'], ['7', '近 7 天'], ['30', '近 30 天'], ['all', '全部时间'], ['custom', '自定义']];
  const GROUPS = [
    { n: '已完成', c: 'var(--ch-1)', f: (o) => o.status === 'DONE' },
    { n: '履约中（待履约、已出餐）', c: 'var(--ch-2)', f: (o) => o.status === 'PAID' || o.status === 'FULFILLED' },
    { n: '退款（退款中、已退款）', c: 'var(--ch-3)', f: (o) => o.status === 'REFUNDING' || o.status === 'REFUNDED' },
    { n: '未成交（待支付、已取消）', c: 'var(--text-4)', f: (o) => o.status === 'UNPAID' || o.status === 'CANCELLED' },
  ];

  window.PAGES2.orders = {
    title: '订单', group: '交易',
    layout: '横带分层',
    reason: '订单中心的工作顺序是先看今天的结论、再看近两周的走势、最后处理具体订单，所以三条通栏横带自上而下排开：数字不套卡片，用发丝线分开；明细表格占最大的面积，是真正动手的地方',
    scenes: [
      { id: 'nodata', label: '所选范围没有订单' },
      { id: 'cancel-fail', label: '取消失败：网络异常' },
      { id: 'fulfil-conflict', label: '出餐失败：订单已被同事处理' },
      { id: 'refund-fail', label: '发起退款失败：支付渠道暂时不可用' },
      { id: 'print-fail', label: '打印失败：小票打印机没有连接' },
      { id: 'export-fail', label: '导出失败：结果超过 5000 条' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有订单'); if (early) return early;
      const S = { tab: 'ALL', range: '30', from: '', to: '', pay: '', min: '', max: '', q: '' }, touched = new Set();
      const src = () => (ctx.scene === 'nodata' ? [] : B.db.orders), users = new Map(B.db.users.map((u) => [u.id, u]));
      let rows = [], shown = -1, dateErr = false;
      const page = h('section.page.p1-orders');
      const expBtn = A2.can('export') ? h('button.btn.btn--primary', { type: 'button', text: '导出结果', on: { click: () => doExport() } }) : null;
      page.append(A2.heading('订单', '先看今天的结论，再看近两周走势，最后处理明细', [h('button.btn', { type: 'button', text: '刷新', on: { click: () => ctx.refresh() } }), expBtn]));

      /* 第一条带：概览数字 */
      const sv = (cls, label, id, sub) => h('div.stat' + cls, {}, h('span.stat-label', { text: label }), h('span.stat-value.num', { id: 'p1o-' + id, text: '0' }), h('span.stat-sub', { id: 'p1o-' + id + '-s' }, sub || ''));
      const stats = h('div.band-stats.p1-stats', {}, sv('', '今日订单', 'n'), sv('.stat--sm', '今日营业额', 'rev'), sv('.stat--sm', '待履约', 'wait'), sv('.stat--sm', '退款中', 'ref'), sv('.stat--sm', '客单价', 'avg'));
      const bandStats = h('section.band', { 'aria-label': '概览数字' }, stats);
      /* 第二条带：近 14 天走势 */
      const chartBox = h('div.p1-chart'), chartNote = h('p.muted');
      const legend = h('div.legend', {}, GROUPS.map((g) => h('span', {}, h('i', { style: { background: g.c } }), g.n)));
      const bandTrend = h('section.band', { 'aria-label': '近 14 天订单走势' }, h('div.band-title', {}, h('h2', { text: '近 14 天订单走势' }), legend), chartBox, chartNote);
      /* 第三条带：订单明细 */
      const tabsBox = h('div.p1-tabs'), sumEl = h('span.muted.num'), batch = h('div.p1-batch', { hidden: true, role: 'region', 'aria-label': '批量操作' });
      const sel = (id, label, opts, w) => h('select.select', { id, 'aria-label': label, style: { width: w + 'px' }, on: { change: (e) => { S[id.replace('p1of-', '')] = e.target.value; if (id === 'p1of-range') customBox.hidden = S.range !== 'custom'; refreshList(); } } }, opts.map(([v, l]) => h('option', { value: v, text: l, selected: S[id.replace('p1of-', '')] === v })));
      const customBox = h('div.row.wrap.p1-custom', { hidden: true }, h('input.input', { type: 'date', 'aria-label': '开始日期', style: { width: '152px' }, on: { change: (e) => { S.from = e.target.value; refreshList(); } } }), h('span.muted', { text: '至' }), h('input.input', { type: 'date', 'aria-label': '结束日期', style: { width: '152px' }, on: { change: (e) => { S.to = e.target.value; refreshList(); } } }), h('span.err.p1-err', { id: 'p1o-daterr', role: 'alert', style: { color: 'var(--bad-ink)' } }));
      const money2 = (key, label) => h('input.input', { type: 'number', min: '0', step: '0.01', placeholder: label, 'aria-label': label, style: { width: '152px' }, inputmode: 'decimal', on: { input: (e) => { S[key] = e.target.value; refreshList(); } } });
      const search = A2.search('会员、订单号或取餐号', (v) => { S.q = v; refreshList(); });
      const resetBtn = h('button.btn.btn--ghost', { type: 'button', text: '重置筛选', hidden: true, on: { click: () => { Object.assign(S, { range: '30', from: '', to: '', pay: '', min: '', max: '', q: '' }); filters.querySelectorAll('select').forEach((s, i) => { s.value = i ? '' : '30'; }); filters.querySelectorAll('input').forEach((i) => { i.value = ''; }); customBox.hidden = true; refreshList(); } } });
      const filters = h('div.row.wrap.p1-filters', {}, sel('p1of-range', '时间范围', RANGES, 132), customBox, sel('p1of-pay', '支付方式', [['', '全部支付方式'], ...Object.entries(B.PAY)], 148), h('div.row', { style: { gap: 'var(--s-2)' } }, money2('min', '最低金额（元）'), h('span.muted', { text: '至' }), money2('max', '最高金额（元）')), search, resetBtn);
      const tbl = A2.table({
        selectable: true, caption: '订单明细', rows: [], empty: '所选范围没有订单', rowClass: (r) => 'p1-r' + r.no,
        onSelect: () => paintBatch(),
        columns: [
          { title: '订单号', cls: 'num', render: (r) => r.no },
          { title: '会员', render: (r) => { const u = users.get(r.userId); return h('div', {}, h('div', { text: r.userName }), u ? h('div.muted.num', { text: B.maskPhone(u.phone) }) : null); } },
          { title: '商品', ell: true, render: (r) => P1.itemsText(r) },
          { title: '金额', cls: 'r', render: (r) => money(r.amount) },
          { title: '支付方式', render: (r) => B.PAY[r.pay] },
          { title: '状态', render: (r) => P1.badge(r.status) },
          { title: '下单时间', cls: 'num', render: (r) => short(r.createdAt) },
          { title: '操作', cls: 'c', render: (r) => acts(r) },
        ],
      });
      const bandList = h('section.band', { 'aria-label': '订单明细' }, h('div.band-title', {}, h('h2', { text: '订单明细' }), sumEl), tabsBox, filters, batch, tbl.el);
      page.append(h('div.l-bands', {}, bandStats, bandTrend, bandList));

      const open = (o) => P1.openOrder(o, { ctx, onChange: (x) => { touched.add(x.no); refreshAll(); } });
      function acts(o) {
        const box = h('div.p1-acts'), more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：订单 ' + o.no }, UI.icon('more', 'icon--sm'));
        box.append(h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '详情', on: { click: () => open(o) } }));
        if (o.status === 'PAID') box.append(h('button.btn.btn--soft.btn--sm', { type: 'button', text: '出餐', on: { click: () => one('fulfil', o) } }));
        if (o.status === 'FULFILLED') box.append(h('button.btn.btn--soft.btn--sm', { type: 'button', text: '完成', on: { click: () => one('done', o) } }));
        box.append(more);
        const items = [{ label: '打印小票', icon: 'print', on: () => P1.printPreview(o, ctx) }, { label: '修改备注', icon: 'edit', on: async () => { if (await P1.op.note(o)) { touched.add(o.no); refreshList(true); } } }];
        if (P1.canRefund(o)) items.push({ label: '发起退款', icon: 'undo', on: async () => { if (await P1.op.refund(o, ctx)) { touched.add(o.no); refreshAll(); } } });
        if (A2.can('cancel') && ['UNPAID', 'PAID'].includes(o.status)) items.push('hr', { label: '取消订单', icon: 'x', danger: true, on: async () => { if (await P1.op.cancel(o, ctx)) { touched.add(o.no); refreshAll(); } } });
        P1.menu(more, items);
        return box;
      }
      async function one(kind, o) { const ok = await P1.op[kind](o, ctx); touched.add(o.no); if (ok || o.status !== (kind === 'fulfil' ? 'PAID' : 'FULFILLED')) refreshAll(); }

      /* 计算：非状态筛选后的集合、各状态数量、当前标签页的行 */
      function calc() {
        const n = { today: 1, 3: 3, 7: 7, 30: 30 }[S.range], today = dayOf(nowStr());
        let lo = '', hi = '';
        if (n) lo = dayOf(B.fmt(new Date(B.NOW().getTime() - (n - 1) * 864e5)));
        else if (S.range === 'custom') { lo = S.from; hi = S.to; }
        dateErr = S.range === 'custom' && lo && hi && lo > hi;
        const min = S.min === '' ? null : Math.round(S.min * 100), max = S.max === '' ? null : Math.round(S.max * 100), q = S.q.toLowerCase();
        const base = dateErr ? [] : src().filter((o) => {
          const d = dayOf(o.createdAt);
          if (lo && d < lo) return false; if (hi && d > hi) return false; if (S.pay && o.pay !== S.pay) return false;
          if (min != null && o.amount < min) return false; if (max != null && o.amount > max) return false;
          if (q) { const u = users.get(o.userId); if (!(o.no.includes(q) || o.userName.toLowerCase().includes(q) || o.pickup.toLowerCase().includes(q) || (u && u.phone.includes(q)))) return false; }
          return true;
        });
        const counts = { ALL: base.length }; base.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
        return { base, counts, rows: S.tab === 'ALL' ? base : base.filter((o) => o.status === S.tab), today };
      }
      function rangeLabel() { return (RANGES.find((r) => r[0] === S.range) || [])[1] + (S.range === 'custom' ? '（' + (S.from || '起') + ' 至 ' + (S.to || '今') + '）' : ''); }
      function paintBatch() {
        const list = tbl.selected();
        batch.hidden = !list.length; batch.replaceChildren();
        if (!list.length) return;
        batch.append(h('span.num', { text: '已选 ' + list.length + ' 单' }), h('span.grow'), h('button.btn.btn--primary.btn--sm', { type: 'button', text: '批量出餐', on: { click: () => runBatch('fulfil') } }), h('button.btn.btn--sm', { type: 'button', text: '批量完成', on: { click: () => runBatch('done') } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '取消选择', on: { click: () => { tbl.clear(); paintBatch(); } } }));
      }
      async function runBatch(kind) {
        const list = tbl.selected(), verb = kind === 'fulfil' ? '出餐' : '完成', from = kind === 'fulfil' ? 'PAID' : 'FULFILLED', fit = list.filter((o) => o.status === from).length;
        const yes = await P1.dlg(() => UI.confirm('将 ' + list.length + ' 单批量标记为“' + (kind === 'fulfil' ? '已出餐' : '已完成') + '”。其中 ' + fit + ' 单可以处理，' + (list.length - fit) + ' 单状态不符，会被跳过并写明原因。', { title: '批量' + verb, ok: '确认' + verb }));
        if (!yes) return;
        if (!(await P1.net(600))) return;
        const badList = []; let ok = 0;
        for (const o of list) {
          if (o.status !== from) { badList.push({ label: '订单 ' + o.no, why: '现在是' + OST[o.status][0] + '，不能' + verb }); continue; }
          if (ctx.scene === 'fulfil-conflict' && ok === 0 && fit > 1) { P1.setStatus(o, kind === 'fulfil' ? 'FULFILLED' : 'DONE', kind === 'fulfil' ? 'fulfilled' : 'done', '同事已' + verb, '其他同事'); badList.push({ label: '订单 ' + o.no, why: '刚被其他同事处理过' }); touched.add(o.no); ok = -1; continue; }
          P1.setStatus(o, kind === 'fulfil' ? 'FULFILLED' : 'DONE', kind === 'fulfil' ? 'fulfilled' : 'done', '批量' + verb); touched.add(o.no); ok = Math.max(ok, 0) + 1;
        }
        ok = Math.max(ok, 0); A2.audit('order:fulfil', '批量' + verb, ok + ' 单');
        refreshAll(); P1.report('批量' + verb, ok, badList);
      }
      async function doExport() {
        if (ctx.scene === 'export-fail') return UI.toast('导出失败：结果超过 5000 条，请缩小日期或筛选范围', { kind: 'bad' });
        const n = rows.length; if (!n) return UI.toast('当前筛选没有订单可导出', { kind: 'bad' });
        await A2.export('订单_' + rangeLabel().replace(/[（）]/g, '').replace(/\s/g, ''), '订单', n);
      }
      function refreshList(keep) {
        const c = calc(); rows = c.rows;
        tabsBox.replaceChildren(A2.statusTabs(TABS.map(([id, l]) => ({ id, label: l, count: c.counts[id] || 0 })), S.tab, (id) => { S.tab = id; refreshList(); }));
        const valid = c.base.filter((o) => COUNTED.includes(o.status)), total = valid.reduce((s, o) => s + o.amount, 0);
        sumEl.textContent = '筛选结果 ' + c.base.length + ' 单，其中有效订单 ' + valid.length + ' 单，实付合计 ' + money(total);
        const de = page.querySelector('#p1o-daterr'); if (de) de.textContent = dateErr ? '开始日期不能晚于结束日期' : '';
        resetBtn.hidden = !(S.range !== '30' || S.pay || S.min !== '' || S.max !== '' || S.q);
        if (expBtn) expBtn.textContent = '导出结果（共 ' + c.rows.length + ' 条）';
        if (keep && shown === c.rows.length) tbl.clear(); else tbl.setRows(c.rows);
        shown = c.rows.length; paintBatch(); P1.sweep();
        if (touched.size) { requestAnimationFrame(() => { touched.forEach((no) => P1.flash(tbl.el.querySelector('.p1-r' + no))); touched.clear(); }); }
      }
      function refreshOverview() {
        const all = src(), today = dayOf(nowStr()), yday = dayOf(B.fmt(new Date(B.NOW().getTime() - 864e5)));
        const td = all.filter((o) => dayOf(o.createdAt) === today), yd = all.filter((o) => dayOf(o.createdAt) === yday), paid = td.filter((o) => COUNTED.includes(o.status)), rev = paid.reduce((s, o) => s + o.amount, 0);
        const wait = all.filter((o) => o.status === 'PAID'), slow = wait.filter((o) => P1.minsSince(P1.times(o).paid || o.createdAt) > 15).length, ref = all.filter((o) => o.status === 'REFUNDING');
        const pend = B.db.refunds.filter((r) => r.status === 'PENDING').length;
        const set = (id, v, o) => { const el = page.querySelector('#p1o-' + id); el && UI.count(el, v, o); };
        set('n', td.length); set('rev', rev / 100, { prefix: '¥', dec: 2 }); set('wait', wait.length); set('ref', ref.length); set('avg', paid.length ? rev / paid.length / 100 : 0, { prefix: '¥', dec: 2 });
        const sub = (id, ...kids) => { const el = page.querySelector('#p1o-' + id + '-s'); el && el.replaceChildren(...kids); };
        sub('n', h('span.muted', { text: '昨日全天 ' + yd.length + ' 单；今天已取消 ' + td.filter((o) => o.status === 'CANCELLED').length + ' 单' }));
        sub('rev', h('span.muted', { text: '今日已付款 ' + paid.length + ' 单' }));
        sub('wait', slow ? h('button.p1-link', { type: 'button', text: slow + ' 单超时 · 去处理', on: { click: () => { S.tab = 'PAID'; refreshList(); tabsBox.scrollIntoView({ block: 'start' }); } } }) : h('span.muted', { text: '没有积压' }));
        sub('ref', ctx.role === 'A' ? h('button.p1-link', { type: 'button', text: '待审批 ' + pend + ' 条 · 去售后', on: { click: () => ctx.go('refunds') } }) : h('span.muted', { text: '待审批 ' + pend + ' 条' }));
        sub('avg', h('span.muted', { text: '今日已付款订单平均' }));
        /* 走势：每次换一个新的容器，旧图的尺寸监听随旧容器作废 */
        const days = []; for (let i = 13; i >= 0; i--) days.push(dayOf(B.fmt(new Date(B.NOW().getTime() - i * 864e5))));
        const per = days.map((d) => all.filter((o) => dayOf(o.createdAt) === d)), series = GROUPS.map((g) => ({ name: g.n.replace(/（.*/, ''), color: g.c, data: per.map((l) => l.filter(g.f).length) }));
        const total = per.reduce((s, l) => s + l.length, 0), peak = per.reduce((b, l, i) => (l.length > per[b].length ? i : b), 0), done = per.reduce((s, l) => s + l.filter(GROUPS[0].f).length, 0), rf = per.reduce((s, l) => s + l.filter(GROUPS[2].f).length, 0);
        const box = h('div'); chartBox.replaceChildren(box);
        if (!total) { box.append(A2.empty('近 14 天没有订单')); chartNote.textContent = ''; return; }
        UI.bars(box, { labels: days.map((d) => d.slice(5).replace('-', '/')), series, stacked: true, unit: ' 单', height: 240, aria: '近 14 天订单分状态堆叠柱图：共 ' + total + ' 单，已完成 ' + done + ' 单，退款 ' + rf + ' 单' });
        chartNote.textContent = '近 14 天共 ' + total + ' 单，最多的一天是 ' + days[peak].slice(5).replace('-', '/') + '（' + per[peak].length + ' 单）；已完成占 ' + Math.round((done / total) * 100) + '%，退款占 ' + Math.round((rf / total) * 100) + '%。把鼠标放到柱子上可以看每个状态的单数。';
      }
      function refreshAll() { refreshOverview(); refreshList(true); }
      return A2.load(() => { refreshOverview(); refreshList(); return page; });
    },
  };
})();
