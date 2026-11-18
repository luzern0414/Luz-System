/* 第二批页面（一）：交易闭环的共用件 Mini.p2（订单、支付、售后的数据与动作）和结算页 checkout。
   订单、支付、售后的数据都读写 B.db：订单 B.db.orders、售后 B.db.refunds、券 B.db.myCoupons、余额 B.db.me.balance 与流水 B.db.walletLogs、
   评价 B.db.reviews、消息 B.db.notices；B.reset 之后在文件末尾的 seed 里自动重做（演示用的订单、售后、评价）。
   页面参数约定：order-detail、refund-apply、review 用 ?id=订单号（refund-apply 还可带 rid=售后单号看进度）；pay-result 用 ?no=订单号。
   订单上我补的字段（都可省）：storeId、pickType（self 自取 / dine 堂食）、slot（取餐时段）、paySplit {balance, wechat}、actDiscount（活动减免，含在 discount 里）、
   couponRef（用掉的券）、deadlineAt（支付截止，毫秒）、attempt（最近一次支付结果）、t（各步时间，与后台同名约定）、log（操作记录）、closeReason / cancelReason、late（迟到支付）、reviewed、hidden（会员删除）。
   售后单上补的字段：stage（REVIEW 待审核 / APPROVED 已通过 / REFUNDING 退款中 / DONE 已到账 / REJECTED 被拒绝 / FAILED 失败转人工 / WITHDRAWN 已撤销）、items、proofs、channel、auto、via。 */
(function () {
  'use strict';
  const { h } = UI;
  const K = window.K;
  const $ = (s, r) => (r || document).querySelector(s);
  const M2 = (Mini.p2 = {});
  const money = Mini.money;
  const IMGS = () => Object.keys(window.IMG || {});
  /** 清空再放入子节点（null 和 false 跳过，避免 replaceChildren 把它们写成文字） */
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
  M2.fill = fill;

  Object.assign(UI.icons, {
    thumbup: 'M7 11v9H4v-9zM7 11l3.5-7.5c1.6 0 2.6 1.3 2.2 2.8L12 9h6.5a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7',
    thumbdown: 'M7 13V4H4v9zM7 13l3.5 7.5c1.6 0 2.6-1.3 2.2-2.8L12 15h6.5a2 2 0 0 0 2-2.4l-1.3-7a2 2 0 0 0-2-1.6H7',
    camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
    service: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1zM17 19c0 1.5-2 2-5 2',
  });
  if (B.PAY) B.PAY.MIX = '余额加微信';

  /* =====================================================================================
     时间：演示时钟从 10:30 起按真实时间往前走（支付倒计时、取餐时段、核销时间都用它）
     ===================================================================================== */
  M2.t0 = Date.now();
  M2.now = () => new Date(B.NOW().getTime() + (Date.now() - M2.t0));
  M2.stamp = () => B.fmt(M2.now());
  M2.parse = (s) => new Date(String(s).replace(' ', 'T') + ':00');
  M2.hm = (s) => (s || '').slice(11, 16);
  /** 今天 10:12 / 昨天 12:05 / 11-01 12:05 */
  M2.when = (s) => {
    if (!s) return '';
    const d = s.slice(0, 10), now = M2.now();
    return d === K.ymd(now) ? '今天 ' + s.slice(11, 16) : d === K.ymd(K.addDays(now, -1)) ? '昨天 ' + s.slice(11, 16) : s.slice(5, 16);
  };
  M2.mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return K.pad(Math.floor(s / 60)) + ':' + K.pad(s % 60); };
  const uid = () => 'k' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  M2.uid = uid;
  /** 加载中的骨架：按真实内容的形状画灰块。'order' 是订单卡（门店行、缩略图行、按钮行），'rows' 是带标题的三行商品，数字是整块高度，'tabs' 是顶部分段 */
  const sk = (w, ht, r) => h('div.skel', { style: { width: w, height: ht + 'px', flex: 'none', borderRadius: r || 'var(--r-sm)' } });
  M2.skel = (list) => h('div', { style: { padding: '12px 0 0' } }, h('div.mini-skel', { 'aria-busy': 'true', 'aria-label': '加载中' }, list.map((x) => (x === 'order'
    ? h('div.mini-card.m2-skcard', {}, h('div.m2-skrow', {}, sk('36%', 16), sk('52px', 22)), h('div.m2-skrow', {}, sk('56px', 56), sk('56px', 56), h('div.grow'), h('div.m2-skcol', {}, sk('90px', 14), sk('72px', 20))), sk('55%', 14), h('div.m2-skrow.end', {}, sk('84px', 40), sk('96px', 40)))
    : x === 'rows' ? h('div.mini-card.m2-skcard', {}, sk('30%', 18), [0, 1, 2].map(() => h('div.m2-skrow', {}, sk('56px', 56), h('div.m2-skcol.grow', {}, sk('60%', 16), sk('40%', 14)), sk('52px', 18))))
      : x === 'tabs' ? h('div.m2-skrow', { style: { justifyContent: 'space-between' } }, [0, 1, 2, 3, 4].map(() => sk('60px', 20)))
        : h('div.skel', { style: { height: x + 'px', borderRadius: 'var(--r-md)' } })))));
  M2.copy = (text, done) => {
    const ok = () => Mini.toast(done || '已复制');
    try { navigator.clipboard.writeText(text).then(ok, ok); } catch (e) { ok(); }
  };

  /* =====================================================================================
     订单：查询、状态、时间轴、金额拆分
     ===================================================================================== */
  M2.me = () => B.db.me;
  M2.byNo = (no) => B.db.orders.find((o) => o.no === no && o.userId === B.db.me.id);
  M2.store = (id) => B.db.stores.find((s) => s.id === (id || 1)) || B.db.stores[0];
  const dbx = () => (B.db._m2 = B.db._m2 || { seq: 440, pickup: 30, lastPay: 'wechat' });
  M2.log = (o, who, text) => { (o.log = o.log || []).push({ at: M2.stamp(), who, text }); };
  const KIND = { UNPAID: 'unpaid', PAID: 'making', FULFILLED: 'ready', DONE: 'done', REFUNDING: 'refunding', REFUNDED: 'refunded' };
  /** 页面上用的状态键：unpaid 待支付、making 制作中、ready 待取餐、done 已完成、cancelled 已取消、closed 已关闭（超时）、refunding、refunded */
  M2.kind = (o) => (o.status === 'CANCELLED' ? (o.closeReason ? 'closed' : 'cancelled') : KIND[o.status]);
  M2.KIND = { unpaid: ['待支付', 'warn'], making: ['制作中', 'brand'], ready: ['待取餐', 'ok'], done: ['已完成', ''], cancelled: ['已取消', ''], closed: ['已关闭', ''], refunding: ['退款中', 'warn'], refunded: ['已退款', ''] };
  M2.tag = (o) => { const [t, tone] = M2.KIND[M2.kind(o)]; return h('span.mini-tag' + (tone ? '.mini-tag--' + tone : ''), { text: t }); };
  M2.SEG = [['all', '全部'], ['unpaid', '待支付'], ['pickup', '待取餐'], ['done', '已完成'], ['after', '退款与售后']];
  M2.inSeg = (o, seg) => seg === 'all' || (seg === 'unpaid' && o.status === 'UNPAID') || (seg === 'pickup' && (o.status === 'PAID' || o.status === 'FULFILLED')) || (seg === 'done' && o.status === 'DONE')
    || (seg === 'after' && (o.status === 'REFUNDING' || o.status === 'REFUNDED' || M2.refundsOf(o).length > 0));
  const RANK = { unpaid: 0, ready: 1, making: 1, refunding: 2, done: 3, refunded: 4, cancelled: 5, closed: 5 };
  /** 我的订单：没被我删除的，要办的排前面，已取消和已退款排最后，同级按下单时间倒序 */
  M2.mine = () => B.db.orders.filter((o) => o.userId === B.db.me.id && !o.hidden).sort((a, b) => RANK[M2.kind(a)] - RANK[M2.kind(b)] || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  M2.methodName = (m) => ({ wechat: '微信支付', balance: '储值余额', mix: '储值余额 + 微信支付' }[m] || '微信支付');
  M2.payText = (o) => (o.status === 'UNPAID' ? '待支付' : !o.paidAt && !o.late ? '未支付' : o.pay === 'MIX' ? '储值余额 + 微信支付' : (B.PAY[o.pay] || '微信支付'));
  M2.times = (o) => { const t = o.t || {}; return { created: o.createdAt, paid: o.paidAt || '', making: t.making || o.paidAt || '', ready: t.fulfilled || '', done: t.done || '', cancelled: t.cancelled || '', refunding: t.refunding || '', refunded: t.refunded || '' }; };
  /** 状态时间轴：已下单、已支付、制作中、待取餐、已完成 / 已取消 / 已关闭；终态里没有发生的步骤不显示 */
  M2.timeline = (o) => {
    const t = M2.times(o), k = M2.kind(o), L = [], add = (label, at, state) => L.push({ label, at: at || '', state });
    add('已下单', t.created, 'done');
    if (k === 'unpaid') { add('待支付', '', 'now'); add('制作中', '', 'todo'); add('待取餐', '', 'todo'); add('已完成', '', 'todo'); return L; }
    if (t.paid) add('已支付', t.paid, 'done');
    if (k === 'cancelled' || k === 'closed') { add(k === 'closed' ? '已关闭' : '已取消', t.cancelled, 'bad'); if (o.late) add('迟到支付，款项退回', o.late.at, 'done'); return L; }
    const rf = k === 'refunding' || k === 'refunded';
    if (!rf || t.ready || t.done) add('制作中', t.making, k === 'making' ? 'now' : 'done');
    if (!rf || t.ready || t.done) add('待取餐', t.ready, k === 'ready' ? 'now' : k === 'making' ? 'todo' : 'done');
    if (!rf || t.done) add('已完成', t.done, k === 'done' ? 'done' : k === 'making' || k === 'ready' ? 'todo' : 'done');
    if (rf) { add('退款中', t.refunding, k === 'refunding' ? 'now' : 'done'); if (k === 'refunded') add('已退款', t.refunded, 'done'); }
    return L;
  };
  /** 金额拆分：商品小计、活动、优惠券、储值余额、微信支付（或会员卡），各项和为实付 */
  M2.split = (o) => {
    const act = o.actDiscount || 0, coupon = Math.max(0, (o.discount || 0) - act);
    const p = o.paySplit || (o.pay === 'BALANCE' ? { balance: o.amount } : o.pay === 'CARD' ? { card: o.amount } : { wechat: o.amount });
    return { subtotal: o.subtotal, act, coupon, balance: p.balance || 0, wechat: p.wechat || 0, card: p.card || 0, amount: o.amount };
  };
  M2.count = (o) => o.items.reduce((s, i) => s + i.qty, 0);
  M2.code = (o) => { let n = 0; for (const c of o.no) n = (n * 31 + c.charCodeAt(0)) >>> 0; const s = String(10000000 + ((n * 7919 + 4096) % 90000000)); return s.slice(0, 4) + ' ' + s.slice(4, 8); };
  M2.nextPickup = () => { const d = dbx(); d.pickup += 1; return 'A' + (d.pickup % 100 < 10 ? '0' + (d.pickup % 100) : d.pickup % 100); };
  M2.touch = () => { Mini.emit('order'); Mini.frames().forEach((f) => { if (f !== Mini.top()) f.stale = true; }); };
  M2.walletLog = (kind, amount, ref) => { const db = B.db, me = db.me; db.walletLogs.unshift({ id: db.walletLogs.reduce((m, x) => Math.max(m, x.id), 0) + 1, userId: me.id, userName: me.name, kind, amount, balance: me.balance, at: M2.stamp(), ref }); };
  M2.notice = (kind, title, body) => { const n = B.db.notices; n.unshift({ id: n.reduce((m, x) => Math.max(m, x.id), 0) + 1, kind, title, body, at: M2.stamp(), read: false }); };
  M2.avail = () => { const b = B.db.me.balance; return UI.state.scene.checkout === 'balance-short' ? Math.min(b, 520) : b; };

  /* ---------- 二维码示意：按取餐码生成固定的方块图（内容只含订单号和签名，不含个人信息） ---------- */
  M2.qr = (text, px) => {
    const N = 25; let seed = 0; for (const c of text) seed = (seed * 131 + c.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const m = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.52));
    const finder = (x, y) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const a = x + i, b = y + j; if (a < 0 || b < 0 || a >= N || b >= N) continue; const edge = i === 0 || j === 0 || i === 6 || j === 6, core = i >= 2 && i <= 4 && j >= 2 && j <= 4; m[b][a] = i >= 0 && j >= 0 && i <= 6 && j <= 6 && (edge || core); } };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    let d = ''; m.forEach((row, y) => { let x = 0; while (x < N) { if (!row[x]) { x++; continue; } let w = 1; while (x + w < N && row[x + w]) w++; d += 'M' + x + ' ' + y + 'h' + w + 'v1h-' + w + 'z'; x += w; } });
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '-1 -1 ' + (N + 2) + ' ' + (N + 2)); s.setAttribute('role', 'img'); s.setAttribute('aria-label', '取餐二维码'); s.setAttribute('class', 'm2-qr'); s.style.width = s.style.height = (px || 148) + 'px';
    p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); s.append(p); return s;
  };

  /* =====================================================================================
     关单、取消、支付
     ===================================================================================== */
  const closeMin = () => ((B.db.config.runtime.find((c) => c.key === 'order.unpaid_close_minutes') || {}).value) || 30;
  M2.leftMs = (o) => (o.deadlineAt ? o.deadlineAt - Date.now() : 0);
  /** 把锁在待支付订单上的券放回（已过期的记为已过期，不放回可用） */
  M2.releaseCoupon = (o) => {
    const c = o.couponRef && B.db.myCoupons.find((x) => x.id === o.couponRef);
    if (c && c.state === 'USED' && c.usedOrder === o.no) { c.state = c.expire < K.ymd(M2.now()) ? 'EXPIRED' : 'UNUSED'; delete c.usedOrder; delete c.orderNo; delete c.usedAt; }
  };
  /** 关单：timeout 超时自动关闭，user 会员取消（只对待支付）；先放回券，名额随状态自动退回 */
  M2.close = (o, why, reason) => {
    if (o.status !== 'UNPAID') return false;
    o.status = 'CANCELLED'; (o.t = o.t || {}).cancelled = M2.stamp(); delete o.deadlineAt;
    if (why === 'timeout') { o.closeReason = '超时未支付'; M2.log(o, '系统', '超过 ' + closeMin() + ' 分钟未支付，订单自动关闭'); } else { o.cancelReason = reason || '不想要了'; M2.log(o, B.db.me.name, '取消订单（' + o.cancelReason + '）'); }
    M2.releaseCoupon(o); M2.touch(); return true;
  };
  /** 到期的待支付订单自动关闭；渠道还在处理中（pending）的先不关，等结果 */
  M2.sweep = () => {
    B.db.orders.forEach((o) => { if (o.status === 'UNPAID' && o.deadlineAt && o.deadlineAt <= Date.now() && !(o.attempt && o.attempt.outcome === 'pending')) M2.close(o, 'timeout'); });
    B.db.refunds.forEach((r) => { if (r.auto) M2.advance(r); });
  };
  setInterval(M2.sweep, 1000);

  /** 支付到账（等于收到渠道的支付成功通知）：储值余额部分此时才扣；余额不够返回 nofund */
  M2.settle = (o) => {
    const db = B.db, me = db.me, sp = o.paySplit || M2.split(o);
    if (o.status !== 'UNPAID') return { ok: o.status !== 'CANCELLED' };
    if ((sp.balance || 0) > me.balance) return { ok: false, reason: 'nofund' };
    if (sp.balance) {
      const w = Mini.wallet ? Mini.wallet.spend(sp.balance, '订单 ' + o.no) : null;
      if (w && !w.ok) return { ok: false, reason: 'nofund' };
      if (w) o.walletSplit = { principal: w.principal, gift: w.gift }; else { me.balance -= sp.balance; M2.walletLog('消费', -sp.balance, '订单 ' + o.no); }
    }
    const t = M2.stamp(); o.status = 'PAID'; o.paidAt = t; (o.t = o.t || {}).making = t; o.pickup = o.pickup || M2.nextPickup(); delete o.deadlineAt;
    M2.log(o, '系统', '支付成功 ' + money(o.amount) + '（' + M2.payText(o) + '）'); M2.log(o, '门店', '已接单，开始制作');
    me.orders++; me.spent += o.amount;
    M2.notice('订单', '订单已支付', '您的订单已支付成功，正在备餐，取餐号 ' + o.pickup + '。');
    M2.touch(); return { ok: true };
  };
  /** 选支付方式的底部弹层（订单列表、详情、支付失败后“改用其他方式”用）→ 'wechat' | 'balance' | 'mix' | null */
  M2.pickMethod = (o, cur) => {
    const bal = M2.avail(), amt = o.amount; let pick = cur || dbx().lastPay || 'wechat';
    const opts = [['wechat', '微信支付', 'wechat', '推荐，支付 ' + money(amt)], ['balance', '储值余额', 'wallet', bal >= amt ? '余额 ' + money(bal) + '，支付后剩 ' + money(bal - amt) : '余额 ' + money(bal) + '，不够支付'], ['mix', '储值余额 + 微信支付', 'card', bal > 0 && bal < amt ? '余额抵扣 ' + money(bal) + '，再微信支付 ' + money(amt - bal) : bal >= amt ? '余额足够，不需要组合' : '没有可用余额']];
    const ok = { wechat: true, balance: bal >= amt, mix: bal > 0 && bal < amt };
    if (!ok[pick]) pick = 'wechat';
    return Mini.sheet({ title: '选择支付方式', body: (api) => { const box = h('div.m2-opts', { role: 'radiogroup', 'aria-label': '支付方式' }); const paint = () => box.replaceChildren(...opts.map(([k, t, ic, sub]) => h('label.m2-opt' + (ok[k] ? '' : '.is-off'), {}, h('input.m2-radio', { type: 'radio', name: 'm2pm', checked: pick === k, disabled: !ok[k], on: { change: () => { pick = k; paint(); } } }), UI.icon(ic), h('span.grow', {}, h('b', { text: t }), h('span.muted', { text: sub }))))); paint(); return box; },
      actions: [{ label: '取消', value: null }, { label: '确认支付 ' + money(amt), kind: 'primary', value: 'go' }] }).then((v) => (v === 'go' ? pick : null));
  };
  /** 微信收银台示意（真实环境是 wx.requestPayment）→ 'success' | 'cancel' */
  M2.wxSheet = (o, sp) => Mini.sheet({ title: '微信支付', dismiss: true,
    body: h('div.m2-wx', {}, h('div.m2-wx-amt', {}, h('span', { text: '示例门店' }), Mini.price(sp.wechat, { size: 'xl', trim: false })), h('div.mini-list', {}, h('div', {}, h('span.muted', { text: '付款方式' }), h('span.grow.right', { text: '零钱' })), h('div', {}, h('span.muted', { text: '订单' }), h('span.grow.right.num', { text: o.no })), sp.balance ? h('div', {}, h('span.muted', { text: '已用储值余额' }), h('span.grow.right', { text: money(sp.balance) })) : null)),
    actions: [{ label: '取消支付', value: 'cancel' }, { label: '立即支付', kind: 'primary', value: 'success', on: async () => { try { await UI.request(null, 500); } catch (e) { Mini.toast('网络不太稳定，支付没有发起，请稍后再试', { kind: 'bad' }); return false; } } }] }).then((v) => v || 'cancel');
  /** 去支付：写支付方式，需要微信的先弹收银台；结果写在 o.attempt，由支付结果页向“服务端”查询后落账 → 'success' | 'cancel' | 'closed' | 'paid' */
  M2.pay = async (o, method) => {
    M2.sweep();
    if (o.status === 'CANCELLED') return 'closed';
    if (o.status !== 'UNPAID') return 'paid';
    const bal = M2.avail(), amt = o.amount, sp = method === 'balance' ? { balance: amt } : method === 'mix' ? { balance: Math.min(bal, amt), wechat: amt - Math.min(bal, amt) } : { wechat: amt };
    o.paySplit = sp; o.pay = method === 'balance' ? 'BALANCE' : method === 'mix' ? 'MIX' : 'WECHAT'; dbx().lastPay = method;
    let outcome = 'success';
    if (sp.balance > bal) outcome = 'nofund'; else if (sp.wechat) outcome = await M2.wxSheet(o, sp);
    o.attempt = { outcome, at: Date.now() }; return outcome;
  };
  /** 向“服务端”查支付结果（第 n 次轮询）→ {state:'paid'|'processing'|'failed'|'late'|'closed', reason} */
  M2.query = (o, n) => {
    M2.sweep();
    if (o.status === 'PAID' || o.status === 'FULFILLED' || o.status === 'DONE') return { state: 'paid' };
    if (o.status === 'CANCELLED') return o.late ? { state: 'late' } : { state: 'closed' };
    const a = o.attempt || {};
    if (a.outcome === 'success' || (a.outcome === 'pending' && a.okAfter && n >= a.okAfter)) { const r = M2.settle(o); return r.ok ? { state: 'paid' } : { state: 'failed', reason: r.reason }; }
    if (a.outcome === 'cancel' || a.outcome === 'nofund' || a.outcome === 'channel') return { state: 'failed', reason: a.outcome };
    return { state: 'processing' };
  };

  /** 生成订单（提交订单）：锁券、写价格快照；pay 还没付 */
  M2.createOrder = (p) => {
    const db = B.db, me = db.me, now = M2.now(), items = p.lines.map((l) => ({ pid: l.pid, name: l.name, spec: l.spec, qty: l.qty, price: l.unit, img: l.img }));
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0), seq = ++dbx().seq, no = '26' + K.ymd(now).replace(/-/g, '').slice(2) + String(100000 + seq * 137);
    const o = { no, userId: me.id, userName: me.name, items, subtotal, discount: p.discount || 0, amount: subtotal - (p.discount || 0), pay: 'WECHAT', status: 'UNPAID', createdAt: B.fmt(now), paidAt: '', remark: p.remark || '', pickup: '', coupon: p.coupon ? p.coupon.name : '',
      couponRef: p.coupon ? p.coupon.id : null, storeId: p.store.id, pickType: p.pickType || 'self', slot: p.slot || '尽快取餐', deadlineAt: Date.now() + closeMin() * 60000, t: {}, log: [] };
    M2.log(o, me.name, '提交订单' + (p.coupon ? '，使用 ' + p.coupon.name : ''));
    if (p.coupon) { const c = db.myCoupons.find((x) => x.id === p.coupon.id); if (c) { c.state = 'USED'; c.usedOrder = no; c.orderNo = no; c.usedAt = B.fmt(now); } }
    db.orders.unshift(o); M2.touch(); return o;
  };

  /** 支付结果页用的演示订单：按场景造一张待支付单并写好“渠道结果”，迟到支付造一张已超时关闭的单 */
  M2.demoOrder = (kind) => {
    const old = ['pending', 'cancel', 'nofund', 'channel'].includes(kind) && B.db.orders.find((x) => x.demo === kind && x.status === 'UNPAID' && x.userId === B.db.me.id && x.deadlineAt > Date.now() + 60000);
    if (old) { old.attempt = { outcome: kind, at: Date.now() }; return old; }
    const lines = [{ pid: 2, name: '红烧鸡腿饭' }, { pid: 10, name: '粥品早餐' }].map((x) => { const p = Mini.product(x.pid), sp = Mini.defaultSpecs(p); return { pid: p.id, name: p.name, spec: Mini.specText(sp), unit: Mini.specPrice(p, sp), qty: 1, img: p.img }; });
    const o = M2.createOrder({ lines, store: M2.store(B.db.curStore), discount: 0, slot: '尽快取餐' }); o.demo = kind;
    if (kind === 'late') {
      o.status = 'CANCELLED'; o.closeReason = '超时未支付'; o.t.cancelled = M2.stamp(); o.deadlineAt = 0; M2.log(o, '系统', '超过 ' + closeMin() + ' 分钟未支付，订单自动关闭');
      o.late = { amount: o.amount, at: M2.stamp() }; M2.log(o, '系统', '关单后收到支付 ' + money(o.amount) + '，已记为迟到支付并发起全额原路退款');
      M2.makeRefund(o, { full: true, via: 'late', reason: '迟到支付', auto: true, desc: '订单已超时关闭，晚到的支付款自动原路退回' });
    } else o.attempt = { outcome: { success: 'success', pending: 'pending', slow: 'pending', cancel: 'cancel', nofund: 'nofund', channel: 'channel' }[kind] || 'success', okAfter: kind === 'slow' ? 3 : 0, at: Date.now() };
    if (kind === 'nofund') { o.pay = 'BALANCE'; o.paySplit = { balance: o.amount }; }
    M2.touch(); return o;
  };

  /* =====================================================================================
     售后：可退试算、提交、进度、到账
     ===================================================================================== */
  M2.refundsOf = (o) => B.db.refunds.filter((r) => r.orderNo === o.no);
  const ACTIVE = ['REVIEW', 'APPROVED', 'REFUNDING', 'FAILED'];
  /** 售后阶段：后台处理过的（status 为 DONE / REJECTED）以后台为准 */
  M2.stageOf = (r) => (r.status === 'DONE' ? 'DONE' : r.status === 'REJECTED' ? (r.stage === 'WITHDRAWN' ? 'WITHDRAWN' : 'REJECTED') : ACTIVE.includes(r.stage) ? r.stage : 'REVIEW');
  M2.STAGE = { REVIEW: ['待审核', 'warn'], APPROVED: ['已通过', 'brand'], REFUNDING: ['退款中', 'brand'], DONE: ['已到账', 'ok'], REJECTED: ['被拒绝', 'bad'], FAILED: ['转人工处理', 'bad'], WITHDRAWN: ['已撤销', ''] };
  M2.activeRefunds = (o) => M2.refundsOf(o).filter((r) => ACTIVE.includes(M2.stageOf(r)));
  M2.rno = (r) => r.no || 'R' + String(2600000 + r.id * 37);
  /** 按行试算：每行实付分摊（含券和活动，最后一行补差），已退、申请中、还能退几件和多少钱 */
  M2.lines = (o) => {
    const sub = o.items.reduce((s, i) => s + i.price * i.qty, 0) || 1; let acc = 0;
    const L = o.items.map((it, i) => { const raw = i === o.items.length - 1 ? o.amount - acc : Math.round((it.price * it.qty * o.amount) / sub); acc += raw; return { i, it, share: raw, usedQty: 0, usedAmt: 0, locked: false }; });
    M2.refundsOf(o).forEach((r) => {
      const st = M2.stageOf(r); if (st === 'REJECTED' || st === 'WITHDRAWN') return;
      const rows = r.items && r.items.length ? r.items : L.map((l) => ({ idx: l.i, qty: l.it.qty, amount: l.share }));
      rows.forEach((x) => { const l = L[x.idx]; if (!l) return; l.usedQty += x.qty; l.usedAmt += x.amount; if (ACTIVE.includes(st)) l.locked = true; });
    });
    L.forEach((l) => { l.leftQty = Math.max(0, l.it.qty - l.usedQty); l.leftAmt = Math.max(0, l.share - l.usedAmt); });
    return L;
  };
  M2.lineAmt = (l, k) => (k >= l.leftQty ? l.leftAmt : Math.round((l.leftAmt * k) / Math.max(1, l.leftQty)));
  M2.refundWindow = (o) => { const base = M2.parse((o.t && o.t.done) || o.paidAt || o.createdAt); return new Date(base.getTime() + 7 * 864e5); };
  M2.canRefund = (o) => ['PAID', 'FULFILLED', 'DONE', 'REFUNDING'].includes(o.status) && o.amount > 0 && M2.lines(o).some((l) => l.leftQty > 0 && !l.locked) && M2.now() <= M2.refundWindow(o);
  /** 退回路径：按原支付比例，储值余额部分即时回钱包，微信部分原路退回 */
  M2.channelOf = (o, cents) => { const sp = M2.split(o), tot = sp.balance + sp.wechat + sp.card || 1, b = Math.round((cents * sp.balance) / tot); return { balance: b, wechat: cents - b }; };
  const STAY = { REVIEW: 15000, APPROVED: 6000, REFUNDING: 9000 }, STAY_AUTO = { REVIEW: 4000, APPROVED: 3000, REFUNDING: 6000 };
  /** 提交售后：lines [{i, qty}] 或 full 整单；写售后单、订单进入退款中 */
  M2.makeRefund = (o, p) => {
    const db = B.db, L = M2.lines(o), rows = p.full ? L.filter((l) => l.leftQty > 0).map((l) => ({ idx: l.i, qty: l.leftQty, amount: l.leftAmt })) : p.lines.map((x) => ({ idx: x.i, qty: x.qty, amount: M2.lineAmt(L[x.i], x.qty) }));
    const amount = rows.reduce((s, x) => s + x.amount, 0), id = db.refunds.reduce((m, x) => Math.max(m, x.id), 0) + 1, at = M2.stamp();
    const r = { id, no: 'R' + String(2600000 + id * 37), orderNo: o.no, userId: o.userId, userName: o.userName, amount, reason: p.reason || '点错了', kind: '仅退款', status: 'PENDING', appliedAt: at, handler: '', note: '', desc: p.desc || '', by: o.userName, items: rows, proofs: p.proofs || [], channel: M2.channelOf(o, amount), stage: 'REVIEW', stageAt: Date.now(), auto: p.auto !== false, via: p.via || 'apply', trail: [{ at, who: o.userName + '（会员）', text: p.via === 'late' ? '系统发起全额原路退款（迟到支付）' : p.via === 'cancel' ? '取消订单，申请全额退款 ' + money(amount) : '提交退款申请 ' + money(amount) + '（' + (p.reason || '点错了') + '）' }] };
    db.refunds.unshift(r);
    if (o.status !== 'REFUNDING' && o.status !== 'CANCELLED') { o.prev = o.status; o.status = 'REFUNDING'; }
    (o.t = o.t || {}).refunding = at; M2.log(o, o.userName + '（会员）', r.trail[0].text); M2.touch(); return r;
  };
  /** 演示里的“审核人”：按时间推进自动流转的售后单（会员提交的约 30 秒走完，取消订单和迟到支付的更快）；人工放着不动的（auto 为 false）不走 */
  M2.advance = (r) => {
    if (!r.auto || r.status !== 'PENDING') return;
    const tbl = r.via === 'apply' ? STAY : STAY_AUTO; let st = M2.stageOf(r);
    while (tbl[st] && Date.now() - r.stageAt >= tbl[st]) {
      const next = { REVIEW: 'APPROVED', APPROVED: 'REFUNDING', REFUNDING: 'DONE' }[st], at = M2.stamp();
      r.stageAt += tbl[st]; r.stage = next; st = next;
      if (next === 'APPROVED') { r.handler = '门店'; r.trail.push({ at, who: '门店', text: r.via === 'apply' ? '审核通过，金额 ' + money(r.amount) : '系统自动通过' }); }
      if (next === 'REFUNDING') r.trail.push({ at, who: '系统', text: '已向支付渠道发起退款' });
      if (next === 'DONE') M2.refundDone(r);
      Mini.emit('order');
    }
  };
  /** 退款到账后的本地补偿：已退计入、储值余额部分冲回钱包、订单置已退款（或回到退款前的状态）、全退的放回未过期的券、发消息 */
  M2.refundDone = (r) => {
    const db = B.db, o = db.orders.find((x) => x.no === r.orderNo), me = db.me, at = M2.stamp();
    r.status = 'DONE'; r.stage = 'DONE'; r.doneAt = at; r.trail.push({ at, who: '系统', text: '退款到账 ' + money(r.amount) + (r.channel && r.channel.balance ? '（含储值余额 ' + money(r.channel.balance) + ' 已回到钱包）' : '，原路退回') });
    if (!o) return;
    if (r.channel && r.channel.balance && o.userId === me.id) {
      const b = r.channel.balance, ws = o.walletSplit;
      if (Mini.wallet) { const gift = ws ? Math.round((b * ws.gift) / Math.max(1, ws.principal + ws.gift)) : 0; Mini.wallet.log('退款', b - gift, gift, '订单 ' + o.no); } else { me.balance += b; M2.walletLog('退款', b, '订单 ' + o.no); }
    }
    const left = M2.lines(o).reduce((s, l) => s + l.leftAmt, 0), full = left <= 0;
    if (o.status === 'CANCELLED') { /* 迟到支付：订单保持已关闭 */ } else if (full) { o.status = 'REFUNDED'; (o.t = o.t || {}).refunded = at; me.orders = Math.max(0, me.orders - 1); me.spent = Math.max(0, me.spent - o.amount); M2.releaseCouponAfterRefund(o); }
    else if (o.status === 'REFUNDING' && !M2.activeRefunds(o).length) { o.status = o.prev || 'DONE'; me.spent = Math.max(0, me.spent - r.amount); }
    M2.log(o, '系统', '退款到账 ' + money(r.amount)); M2.notice('订单', '退款已到账', '订单退款 ' + money(r.amount) + ' 已原路退回。'); M2.touch();
  };
  M2.releaseCouponAfterRefund = (o) => { const c = o.couponRef && B.db.myCoupons.find((x) => x.id === o.couponRef); if (c && c.state === 'USED') { c.state = c.expire < K.ymd(M2.now()) ? 'EXPIRED' : 'UNUSED'; delete c.usedOrder; delete c.orderNo; delete c.usedAt; } };
  /** 驳回、撤销：释放额度，订单回到退款前的状态 */
  M2.endRefund = (r, stage, who, text) => {
    const o = B.db.orders.find((x) => x.no === r.orderNo), at = M2.stamp();
    r.status = 'REJECTED'; r.stage = stage; r.handler = who; r.note = text; r.trail.push({ at, who, text: stage === 'WITHDRAWN' ? '撤销了退款申请' : '驳回：' + text });
    if (o && o.status === 'REFUNDING' && !M2.activeRefunds(o).length) o.status = o.prev || 'DONE';
    if (o) M2.log(o, who, stage === 'WITHDRAWN' ? '撤销退款申请' : '退款申请被驳回：' + text); M2.touch();
  };
  /** 取消已支付的订单：走整单退款（门店还没出餐，系统自动通过） */
  M2.cancelPaid = (o, reason) => { o.cancelReason = reason; return M2.makeRefund(o, { full: true, via: 'cancel', reason, auto: true }); };

  /* =====================================================================================
     再来一单、评价
     ===================================================================================== */
  /** 把订单明细加回购物车 → {added:[名称], skipped:[{name, why}]}：下架、售罄、达到购买上限的不加 */
  M2.reorder = async (o) => {
    const added = [], skipped = [];
    for (const it of o.items) {
      const p = Mini.product(it.pid); if (!p) { skipped.push({ name: it.name, why: '已下架' }); continue; }
      const st = Mini.pstate(p); if (st !== 'ok') { skipped.push({ name: it.name, why: st === 'off' ? '已下架' : '已售罄' }); continue; }
      const specs = Mini.defaultSpecs(p), parts = String(it.spec || '').split(' / '); (p.specs || []).forEach((g) => { const hit = g.opts.find((x) => parts.includes(x.n)); if (hit) specs[g.name] = hit.n; });
      const room = Mini.cart.room(p), qty = Math.min(it.qty, room); if (qty < 1) { skipped.push({ name: it.name, why: Mini.rules.left(p) <= 0 ? '已达购买上限' : '库存不够' }); continue; }
      const r = await Mini.cart.add(p, { specs, qty }); if (!r.ok) { skipped.push({ name: it.name, why: r.reason }); continue; }
      added.push(it.name); if (qty < it.qty) skipped.push({ name: it.name, why: '只加入了 ' + qty + ' 件（购买上限）' });
    }
    return { added, skipped };
  };
  M2.addReview = (o, d) => {
    const db = B.db, at = M2.stamp().slice(5, 10), user = d.anon ? '匿名用户' : db.me.name.slice(0, 1) + '**';
    const pids = [...new Set(o.items.map((i) => i.pid))];
    pids.forEach((pid) => { const like = d.likes[pid]; db.reviews.push({ id: db.reviews.reduce((m, x) => Math.max(m, x.id), 0) + 1, pid, user, rating: like === true ? Math.max(d.rating, 4) : like === false ? Math.min(d.rating, 2) : d.rating, text: d.text, at, orderNo: o.no, tags: d.tags, imgs: d.imgs }); });
    o.reviewed = true; o.review = { rating: d.rating, text: d.text, tags: d.tags, imgs: d.imgs, likes: d.likes, anon: d.anon, at: M2.stamp() };
    M2.log(o, db.me.name, '评价了订单（' + d.rating + ' 星）'); M2.touch();
  };
  /** 选图片（演示：从相册里挑 window.IMG 里的图）→ Promise<图片键数组 | null> */
  M2.pickImage = (limit, have) => {
    const sel = new Set(have || []);
    return Mini.sheet({ title: '选择图片（最多 ' + limit + ' 张）', tall: true, body: () => {
      const box = h('div.m2-imgpick'), hint = h('p.muted.m2-pickhint');
      const paint = () => { fill(box, IMGS().map((k) => { const on = sel.has(k); return h('button.m2-imgcell', { type: 'button', 'aria-pressed': String(on), 'aria-label': '图片 ' + k.slice(4) + (on ? '，已选' : ''), on: { click: () => { if (on) sel.delete(k); else if (sel.size >= limit) { Mini.toast('最多选 ' + limit + ' 张', { kind: 'bad' }); return; } else sel.add(k); paint(); } } }, h('img', { src: window.IMG[k], alt: '' }), on ? h('i.m2-imgck', {}, UI.icon('check', 'icon--sm')) : null); })); hint.textContent = '已选 ' + sel.size + ' / ' + limit + ' 张（演示：从相册里挑选）'; };
      paint(); return h('div', {}, hint, box); },
      actions: [{ label: '取消', value: null }, { label: '完成', kind: 'primary', value: 'ok' }] }).then((v) => (v === 'ok' ? [...sel] : null));
  };

  /* ---------- 打电话、导航（订单详情、门店联系用） ---------- */
  M2.call = (s) => Mini.dialog({ title: '拨打电话', body: s.name + '\n' + s.phone, actions: [{ label: '取消', value: null }, { label: '拨打', kind: 'primary', value: 'ok', on: () => Mini.toast('正在呼叫（模拟）') }] });
  M2.navigate = (s) => Mini.sheet({ title: '导航到 ' + s.name, body: (api) => h('div.mini-list', {}, h('p.muted', { style: { padding: '0 16px 8px' }, text: s.addr }), ['腾讯地图', '高德地图', '苹果地图'].map((n) => h('button', { type: 'button', on: { click: () => { api.close(); Mini.toast('已打开' + n + '（模拟）'); } } }, UI.icon('navigate'), h('span.grow', { text: n })))) });
  /** 营业状态：演示场景 rest / closed / paused 用全店的，其余按门店自己的营业时间和是否暂停 */
  M2.shopState = (ctx, store) => (['rest', 'closed', 'paused'].includes(ctx.scene) ? Mini.shop.state(ctx.scene) : Mini.shop.state(ctx.scene, store.hours, store.status === 'PAUSED'));
  M2.prepMin = (s) => 8 + (s.queue || 0) * 3;
  const mins = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; }, hm = (m) => K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60);
  /** 取餐时段：营业时间内每 15 分钟一个，开始时间早于“现在加出餐时间”的不可选 */
  M2.slots = (store) => {
    const [o, c] = store.hours.split(/[–-]/).map((x) => x.trim()), now = M2.now(), earliest = now.getHours() * 60 + now.getMinutes() + M2.prepMin(store), L = [];
    for (let m = mins(o); m + 15 <= mins(c); m += 15) L.push({ from: m, label: hm(m) + '–' + hm(m + 15), past: m < earliest });
    return { list: L, asap: hm(earliest) };
  };

  /* =====================================================================================
     结算页 checkout：取餐（方式、门店、时段）→ 订单摘要 → 优惠券 → 费用 → 备注 → 支付方式 → 底部提交
     ===================================================================================== */
  const SEL = (lines) => lines.filter((l) => l.selected);
  /** 用同一个 Mini.cart.quote 算指定的券（null 为不用）：临时只留这一张可用，算完还原 */
  M2.quoteWith = (lines, couponId) => {
    const cs = B.db.myCoupons, saved = cs.map((c) => c.state);
    cs.forEach((c) => { if (c.state === 'UNUSED' && (couponId == null || c.id !== couponId)) c.state = '__off'; });
    try { return Mini.cart.quote(lines); } finally { cs.forEach((c, i) => { c.state = saved[i]; }); }
  };
  const couponFace = (c) => (c.kind === '折扣' ? c.value / 10 + ' 折' : '减 ' + money(c.value, 0));
  M2.couponFace = couponFace;
  const stockIssues = (lines) => lines.filter((l) => { const p = Mini.product(l.pid); return p && p.stock > 0 && l.qty > p.stock; }).map((l) => ({ key: l.key, name: l.name, text: l.name + '只剩 ' + Mini.product(l.pid).stock + ' 件', fix: { label: '改为 ' + Mini.product(l.pid).stock + ' 件', qty: Mini.product(l.pid).stock } }));
  /** 价格有没有变：购物车行里的单价和商品当前价比，变了就更新购物车并返回变化列表 */
  const syncPrices = (lines) => {
    const ch = [];
    lines.forEach((l) => { const p = Mini.product(l.pid); if (!p) return; const now = Mini.specPrice(p, l.specs); if (now !== l.unit) { ch.push({ name: l.name, from: l.unit, to: now }); l.unit = now; l.orig = Math.max(l.orig || 0, now); } });
    if (ch.length) Mini.emit('cart');
    return ch;
  };

  window.PAGES_MINI.checkout = {
    title: '确认订单', tab: null, from: 'menu', auth: true, bar: true, nav: { title: '确认订单' },
    layout: '横带分层', reason: '结算是一条单向的决策链：先定“在哪取、什么时候取”，再核对“买了什么、优惠多少”，最后选“怎么付”；一条一条从上往下读，实付金额和提交按钮钉在底部拇指区，上面没处理完的问题会拦住提交并给出路',
    scenes: [{ id: 'rule', label: '商品不满足购买规则（逐条出路）' }, { id: 'no-coupon', label: '没有可用的优惠券' }, { id: 'balance-short', label: '储值余额不足（可充值或组合支付）' }, { id: 'price-change', label: '提交时价格有变化（商家调价）' },
      { id: 'token-expired', label: '报价超过 10 分钟，重新试算' }, { id: 'stock-out', label: '提交时库存不足（刚被抢光）' }, { id: 'coupon-gone', label: '提交时优惠券刚失效' }, { id: 'slot-past', label: '所选取餐时段已过' }, { id: 'rest', label: '营业状态：休息中' }, { id: 'closed', label: '营业状态：已打烊' }, { id: 'paused', label: '营业状态：暂停营业（不能下单）' }],
    skeleton: () => M2.skel([112, 'rows', 96, 132, 150]),
    render(ctx) {
      const db = B.db, me = db.me, dx = dbx();
      const S = (ctx._ck = ctx._ck || { storeId: db.curStore, pick: 'self', slot: 'asap', coupon: undefined, pay: dx.lastPay || 'wechat', remark: '', cutlery: false, agree: false, busy: false, key: uid(), tokenAt: Date.now(), err: '', note: '', termsErr: '', expand: false, bumped: false });
      if (ctx.scene === 'rule' && !Mini.cart.lines().some((l) => l.pid === 9 && l.qty === 1)) { const p = Mini.product(9), sp = Mini.defaultSpecs(p), l = Mini.cart.lines().find((x) => x.pid === 9); if (l) { l.qty = 1; l.selected = true; } else db.cart.push({ key: Mini.cart.keyOf(9, sp), pid: 9, name: p.name, img: p.img, unit: Mini.specPrice(p, sp), orig: p.orig, qty: 1, specs: sp, spec: Mini.specText(sp), selected: true }); }
      if (ctx.scene === 'token-expired' && !S.tokenSet) { S.tokenSet = true; S.tokenAt = Date.now() - 601000; }
      if (ctx.scene === 'slot-past' && !S.slotSet) { S.slotSet = true; const p = M2.slots(M2.store(S.storeId)).list.find((x) => x.past); if (p) S.slot = p.label; }
      const lines0 = () => Mini.cart.valid().filter((l) => l.selected);
      if (!lines0().length) return h('section.mini-page', {}, Mini.empty(Mini.cart.lines().length ? '还没有选中要结算的商品' : '购物车是空的', { label: '去选购', on: () => ctx.switchTab('menu') }, { sub: '选好商品后再来结算' }));
      const first = syncPrices(lines0()); if (first.length) S.note = '价格有变化，已更新：' + first.map((c) => c.name + ' ' + money(c.from, 0) + ' → ' + money(c.to, 0)).join('；');
      const storeNow = () => M2.store(S.storeId), stNow = () => M2.shopState(ctx, storeNow());
      const noCoupon = ctx.scene === 'no-coupon';
      const calc = () => {
        const lines = lines0(), best = noCoupon ? M2.quoteWith(lines, null) : Mini.cart.quote(lines);
        const q = noCoupon ? best : S.coupon === undefined ? best : M2.quoteWith(lines, S.coupon);
        const issues = Mini.rules.problems(lines).concat(stockIssues(lines));
        return { lines, best, q, issues };
      };
      let C = calc();

      const page = h('section.mini-page.m2-checkout'), wrap = h('div.m2-wrap', {}, page);
      const noteBox = h('div', { role: 'status' }), issueBox = h('div'), pickBox = h('div.mini-card.m2-card'), itemBox = h('div.mini-card.m2-card'), cpBox = h('div.mini-card.m2-card'), feeBox = h('div.mini-card.m2-card'), remarkBox = h('div.mini-card.m2-card'), payBox = h('div.mini-card.m2-card'), termBox = h('div.m2-terms');
      const errBox = h('div.m2-err', { role: 'alert', hidden: true });
      const total = h('span.m2-btotal.num'), sub = h('div.m2-bsub'), go = h('button.btn.btn--primary.m2-bgo', { type: 'button', on: { click: () => submit() } });
      const bar = h('div.m2-bar.m2-bar--col', {}, errBox, h('div.m2-barrow', {}, h('div.m2-bsum', {}, h('div', {}, h('span.muted', { text: '实付 ' }), total), sub), go));
      page.append(noteBox, issueBox, pickBox, itemBox, cpBox, feeBox, payBox, remarkBox, termBox);
      wrap.append(bar);

      /* ---- 营业状态与价格提示 ---- */
      const paintTop = () => {
        const st = stNow(), kids = [];
        if (!st.canOrder) kids.push(h('div.m2-alert.m2-alert--warn', {}, UI.icon(st.icon || 'clock', 'icon--sm'), h('div', {}, h('b', { text: storeNow().name + st.label }), h('p', { text: st.hint + '。商品可以先留在购物车，营业后再来结算。' }))));
        if (S.note) kids.push(h('div.m2-alert.m2-alert--info', {}, UI.icon('info', 'icon--sm'), h('div', {}, h('b', { text: S.note.split('：')[0] }), S.note.includes('：') ? h('p', { text: S.note.split('：')[1] }) : null), h('button.m2-x', { type: 'button', 'aria-label': '知道了', on: { click: () => { S.note = ''; paintTop(); } } }, UI.icon('x', 'icon--sm'))));
        fill(noteBox, kids);
      };
      /* ---- 购买规则问题：逐条列出，每条一个一步出路 ---- */
      const paintIssues = () => {
        fill(issueBox);
        if (!C.issues.length) return;
        issueBox.append(h('div.m2-issues', { role: 'alert' }, h('div.m2-issues-h', {}, UI.icon('warn', 'icon--sm'), h('b', { text: '有 ' + C.issues.length + ' 项需要先处理，处理完才能提交' })),
          C.issues.map((x) => h('div.m2-issue', {}, h('span.grow', { text: x.text }), h('button.btn.btn--sm.btn--tint', { type: 'button', text: x.fix.label, on: { click: async () => { await (x.fix.qty ? Mini.cart.setQty(x.key, x.fix.qty) : Mini.cart.remove(x.key)); } } })))));
      };
      /* ---- 取餐：方式、门店、时段 ---- */
      const slotText = () => { const sl = M2.slots(storeNow()); return S.slot === 'asap' ? '尽快取餐 · 约 ' + sl.asap + ' 可取' : S.slot; };
      const paintPick = () => {
        const s = storeNow(), st = stNow();
        fill(pickBox,
          h('div.mini-sec', {}, h('h2', { text: '取餐' }), h('div.seg', { role: 'group', 'aria-label': '取餐方式' }, [['self', '到店自取'], ['dine', '堂食']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(S.pick === k), text: t, on: { click: () => { S.pick = k; paintPick(); } } })))),
          h('button.m2-row', { type: 'button', on: { click: pickStore } }, UI.icon('shop'), h('span.grow', {}, h('b', { text: s.name }), h('span.muted', { text: Mini.fmtDist(s.dist) + (st.canOrder ? (s.queue ? ' · 前方 ' + s.queue + ' 单制作中' : ' · 现在下单马上做') : ' · ' + st.hint) })), Mini.shop.badge(st), h('span.m2-go', { text: '换店' }), UI.icon('right', 'icon--sm')),
          h('button.m2-row', { type: 'button', disabled: !st.canOrder, on: { click: pickSlot } }, UI.icon('clock'), h('span.grow', {}, h('b', { text: S.pick === 'dine' ? '到店用餐时间' : '取餐时间' }), h('span', { text: st.canOrder ? slotText() : '营业后可选' })), UI.icon('right', 'icon--sm')));
      };
      const pickStore = async () => {
        const cur = S.storeId; const v = await Mini.sheet({ title: '选择取餐门店', body: (api) => h('div.m2-opts', {}, db.stores.map((s) => { const st = M2.shopState(ctx, s); return h('button.m2-opt' + (st.canOrder ? '' : '.is-off') + (s.id === cur ? '.on' : ''), { type: 'button', disabled: !st.canOrder, 'aria-pressed': String(s.id === cur), on: { click: () => api.close(s.id) } }, UI.icon('shop'), h('span.grow', {}, h('b', { text: s.name }), h('span.muted', { text: Mini.fmtDist(s.dist) + ' · ' + (st.canOrder ? (s.queue ? '前方 ' + s.queue + ' 单' : '现在下单马上做') : st.label + '，' + st.hint) })), s.id === cur ? UI.icon('check') : null); })) });
        if (v && v !== cur) { S.storeId = v; db.curStore = v; S.slot = 'asap'; Mini.toast('已换到 ' + M2.store(v).name); paintAll(); }
      };
      const pickSlot = async () => {
        const sl = M2.slots(storeNow());
        const v = await Mini.sheet({ title: '选择取餐时间', tall: true, body: (api) => h('div', {}, h('button.m2-slot.m2-slot--asap', { type: 'button', 'aria-pressed': String(S.slot === 'asap'), on: { click: () => api.close('asap') } }, h('b', { text: '尽快取餐' }), h('span.muted', { text: '约 ' + sl.asap + ' 可取，出餐约 ' + M2.prepMin(storeNow()) + ' 分钟' })),
          h('p.muted.m2-slot-h', { text: '或选一个今天的时段（已过的时间不可选）' }), h('div.m2-slots', {}, sl.list.map((x) => h('button.m2-slot', { type: 'button', disabled: x.past, 'aria-pressed': String(S.slot === x.label), 'aria-label': x.label + (x.past ? '，已过' : ''), on: { click: () => api.close(x.label) } }, x.label)))) });
        if (v) { S.slot = v; paintPick(); }
      };
      /* ---- 订单摘要 ---- */
      const paintItems = () => {
        const L = C.lines, fold = L.length > 3 && !S.expand, show = fold ? L.slice(0, 3) : L;
        fill(itemBox,
          h('div.mini-sec', {}, h('h2', { text: '订单摘要' }), h('span.muted', { text: '共 ' + C.q.count + ' 件' })),
          h('div.m2-items', {}, show.map((l) => h('div.m2-item', {}, h('img', { src: l.img, alt: '', loading: 'lazy' }), h('div.grow', {}, h('b.m2-name', { text: l.name }), h('p.muted', { text: (l.spec || '默认规格') + ' × ' + l.qty })), h('div.m2-iprice', {}, Mini.price(l.unit * l.qty, { trim: false }), l.orig > l.unit ? h('span.mini-strike', { text: money(l.orig * l.qty, 0) }) : null)))),
          L.length > 3 ? h('button.m2-more', { type: 'button', 'aria-expanded': String(!fold), text: fold ? '展开全部 ' + L.length + ' 种商品' : '收起', on: { click: () => { S.expand = !S.expand; paintItems(); } } }) : null,
          h('button.mini-link', { type: 'button', on: { click: () => ctx.back() } }, '返回修改商品', UI.icon('right')));
      };
      /* ---- 优惠券 ---- */
      const couponRows = () => {
        const today = K.ymd(M2.now()), list = noCoupon ? [] : db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today);
        return list.map((c) => { const ok = C.q.subtotal >= c.threshold && C.q.subtotal > 0, d = ok ? M2.quoteWith(C.lines, c.id).discount : 0; return { c, ok, d, need: ok ? 0 : c.threshold - C.q.subtotal }; }).sort((a, b) => b.d - a.d || a.need - b.need);
      };
      const paintCoupon = () => {
        const rows = couponRows(), cur = C.q.coupon, usable = rows.filter((r) => r.ok).length;
        const main = cur ? h('span.grow', {}, h('b', { text: cur.name }), h('span.muted', { text: (S.coupon === undefined ? '已自动选择最优券' : '已选择') + '，立减 ' + money(C.q.discount) })) : h('span.grow', {}, h('b', { text: '优惠券' }), h('span.muted', { text: rows.length ? (usable ? '不使用优惠券' : '有 ' + rows.length + ' 张券，还差一点才能用') : '暂无可用优惠券' }));
        fill(cpBox, h('button.m2-row', { type: 'button', disabled: !rows.length, on: { click: pickCoupon } }, UI.icon('tag'), main, cur ? h('b.m2-minus.num', { text: '-' + money(C.q.discount) }) : usable ? h('span.mini-tag.mini-tag--price', { text: usable + ' 张可用' }) : null, rows.length ? UI.icon('right', 'icon--sm') : null),
          C.q.next && !noCoupon ? h('button.m2-nudge', { type: 'button', on: { click: () => ctx.switchTab('menu') } }, UI.icon('tag', 'icon--sm'), h('span.grow', { text: '再买 ' + money(C.q.next.need, 0) + ' 可用「' + C.q.next.name + '」，立减 ' + money(C.q.next.value, 0) }), h('span.m2-go', { text: '去凑单' }), UI.icon('right', 'icon--sm')) : null);
      };
      const pickCoupon = async () => {
        const rows = couponRows(), cur = C.q.coupon ? C.q.coupon.id : null;
        const v = await Mini.sheet({ title: '选择优惠券', tall: rows.length > 3, body: (api) => h('div.m2-opts', {},
          h('button.m2-opt' + (cur == null ? '.on' : ''), { type: 'button', 'aria-pressed': String(cur == null), on: { click: () => api.close('none') } }, UI.icon('x'), h('span.grow', {}, h('b', { text: '不使用优惠券' }), h('span.muted', { text: '本单按原价结算' })), cur == null ? UI.icon('check') : null),
          rows.map((r) => h('button.m2-opt.m2-cp' + (r.ok ? '' : '.is-off') + (r.c.id === cur ? '.on' : ''), { type: 'button', disabled: !r.ok, 'aria-pressed': String(r.c.id === cur), on: { click: () => api.close(r.c.id) } },
            h('span.m2-cpface', {}, h('b.num', { text: r.c.kind === '折扣' ? r.c.value / 10 + '折' : money(r.c.value, 0) }), h('span', { text: r.c.threshold ? '满' + money(r.c.threshold, 0) + '可用' : '无门槛' })),
            h('span.grow', {}, h('b', { text: r.c.name }), h('span.muted', { text: r.ok ? '本单可抵 ' + money(r.d) + ' · ' + r.c.expire.slice(5) + ' 到期' : '还差 ' + money(r.need) + ' 可用 · ' + r.c.expire.slice(5) + ' 到期' })), r.c.id === cur ? UI.icon('check') : null))) });
        if (v == null) return; S.coupon = v === 'none' ? null : v; recalc();
      };
      /* ---- 费用 ---- */
      const row = (k, v, cls) => h('div.m2-fee' + (cls ? '.' + cls : ''), {}, h('span', { text: k }), h('span.num', { text: v }));
      const paintFee = () => {
        const q = C.q;
        fill(feeBox, h('div.mini-sec', {}, h('h2', { text: '费用明细' })), row('商品金额', money(q.subtotal)), q.saved > 0 ? row('较划线价已省', money(q.saved), 'muted') : null, q.coupon ? row('优惠券（' + q.coupon.name + '）', '-' + money(q.discount), 'minus') : null,
          h('div.m2-fee.m2-fee--note', {}, h('span', { text: '到店自取，无配送费、无包装费' })), row('合计', money(q.pay), 'sum'));
      };
      /* ---- 备注 ---- */
      const paintRemark = () => {
        const ta = h('textarea.textarea', { rows: 2, maxlength: 200, placeholder: '口味、忌口等要求，门店会尽量满足', 'aria-label': '备注', text: S.remark }), cnt = h('span.muted.num', { text: S.remark.length + '/200' });
        ta.addEventListener('input', () => { S.remark = ta.value; cnt.textContent = ta.value.length + '/200'; });
        fill(remarkBox, h('div.mini-sec', {}, h('h2', { text: '备注' }), cnt), ta,
          h('div.mini-chips', {}, ['不要香菜', '少盐', '少辣', '不要葱'].map((t) => h('button.mini-chip', { type: 'button', 'aria-pressed': String(S.remark.includes(t)), on: { click: () => { if (S.remark.includes(t)) S.remark = S.remark.replace(t, '').replace(/^[，、\s]+|[，、\s]+$/g, ''); else if (S.remark.length + t.length < 195) S.remark = (S.remark ? S.remark + '，' : '') + t; paintRemark(); } } }, h('span', { text: t })))),
          h('label.m2-switch', {}, h('span.grow', {}, h('b', { text: '需要餐具' }), h('span.muted', { text: '默认不提供，减少浪费' })), h('input.switch', { type: 'checkbox', checked: S.cutlery, role: 'switch', on: { change: (e) => { S.cutlery = e.target.checked; } } })));
      };
      /* ---- 支付方式 ---- */
      const payAmt = () => C.q.pay;
      const methodOk = () => { const bal = M2.avail(), a = payAmt(); return { wechat: true, balance: bal >= a && a > 0, mix: bal > 0 && bal < a }; };
      const paintPay = () => {
        const bal = M2.avail(), a = payAmt(), ok = methodOk(); if (!ok[S.pay]) S.pay = 'wechat';
        if (a === 0) { fill(payBox, h('div.mini-sec', {}, h('h2', { text: '支付方式' })), h('p.muted', { text: '本单优惠后为 0 元，提交即成交，不需要支付。' })); return; }
        const opt = (k, t, ic, sub, extra) => h('label.m2-opt' + (ok[k] ? '' : '.is-off'), {}, h('input.m2-radio', { type: 'radio', name: 'm2pay', checked: S.pay === k, disabled: !ok[k], on: { change: () => { S.pay = k; paintPay(); paintBar(); } } }), UI.icon(ic), h('span.grow', {}, h('b', { text: t }), h('span.' + (ok[k] ? 'muted' : 'm2-short'), { text: sub })), extra || null);
        const short = bal < a, recharge = h('button.btn.btn--sm.btn--tint', { type: 'button', text: '去充值', on: { click: (e) => { e.preventDefault(); ctx.push('wallet'); } } });
        fill(payBox, h('div.mini-sec', {}, h('h2', { text: '支付方式' })), h('div.m2-opts', { role: 'radiogroup', 'aria-label': '支付方式' },
          opt('wechat', '微信支付', 'wechat', '推荐，支付 ' + money(a)),
          opt('balance', '储值余额', 'wallet', short ? '余额 ' + money(bal) + '，还差 ' + money(a - bal) : '余额 ' + money(bal) + '，支付后剩 ' + money(bal - a), short ? recharge : null),
          ok.mix ? opt('mix', '储值余额 + 微信支付', 'card', '余额抵扣 ' + money(bal) + '，再微信支付 ' + money(a - bal)) : null));
        if (S.pay === 'mix') payBox.append(h('p.m2-nudge', {}, UI.icon('info', 'icon--sm'), '储值余额抵扣 ' + money(bal) + '，微信支付 ' + money(a - bal) + '；订单取消时按原路分别退回'));
      };
      /* ---- 条款：默认不勾选，必须用户主动勾选；勾选框只建一次（重绘会丢焦点） ---- */
      const termErr = h('div.err', { id: 'm2-agree-err', role: 'alert' }), cb = h('input', { type: 'checkbox', id: 'm2-agree', checked: S.agree, 'aria-describedby': 'm2-agree-err', on: { change: () => { S.agree = cb.checked; if (S.agree) { S.termsErr = ''; paintTerms(); } } } });
      const paintTerms = () => { termErr.textContent = S.termsErr; };
      termBox.append(h('div.m2-agree', {}, h('label.mini-check', {}, cb), h('p', {}, h('label', { for: 'm2-agree', text: '我已阅读并同意' }), h('button.m2-text', { type: 'button', text: '《购买须知》', on: { click: () => Mini.dialog({ title: '购买须知', left: true, body: h('div.m2-prose', {}, h('p', { text: '1. 餐品现点现做，出餐后不支持无理由退换；餐品有问题请在收到后 7 天内申请售后。' }), h('p', { text: '2. 待支付订单为你保留 ' + closeMin() + ' 分钟，超时自动关闭，已用的优惠券会退回。' }), h('p', { text: '3. 到店取餐请出示取餐码，逾时未取的餐品由门店处理，不另行退款。' }), h('p', { text: '4. 已支付订单取消后，款项原路退回：微信支付 1–3 个工作日，储值余额即时。' })), actions: [{ label: '知道了', kind: 'primary' }] }) } }))), termErr);
      /* ---- 底部栏与错误条 ---- */
      const paintBar = () => {
        const st = stNow(), q = C.q, a = q.pay, weak = ctx.net === 'weak';
        total.textContent = money(a); const saved = q.saved + q.discount;
        sub.textContent = !st.canOrder ? storeNow().name + st.label : saved > 0 ? '已优惠 ' + money(saved) : '到店自取，无配送费';
        go.disabled = S.busy || !st.canOrder || C.issues.length > 0;
        fill(go, S.busy ? h('span.spin') : null, S.busy ? (weak ? ' 网络较慢，请稍等' : ' 提交中') : !st.canOrder ? '暂停营业' : C.issues.length ? '还有 ' + C.issues.length + ' 项需处理' : a === 0 ? '提交订单' : S.pay === 'balance' ? '余额支付 ' + money(a) : S.pay === 'mix' ? '组合支付 ' + money(a) : '微信支付 ' + money(a));
        errBox.hidden = !S.err; fill(errBox, S.err ? [UI.icon('warn', 'icon--sm'), h('span.grow', { text: S.err })] : []);
      };
      const paintAll = () => { paintTop(); paintIssues(); paintPick(); paintItems(); paintCoupon(); paintFee(); paintPay(); paintBar(); };
      /** 重新试算（改数量、换券、换门店后）：保留用户已做的选择，只刷新金额相关块 */
      const recalc = () => { C = calc(); if (C.q.coupon === null && S.coupon != null) S.coupon = undefined; paintIssues(); paintItems(); paintCoupon(); paintFee(); paintPay(); paintBar(); };
      ctx.cleanup(Mini.on('cart', () => { if (S.done) return; if (!lines0().length) { ctx.refresh(); return; } recalc(); }));

      /* ---- 提交：重复点击保护 → 服务端校验（营业、库存、规则、价格令牌、时段、券）→ 生成订单 → 支付 → 结果页 ---- */
      const fail = (text, newKey) => { S.busy = false; S.err = text; if (newKey) S.key = uid(); paintBar(); };
      async function submit() {
        if (S.busy) return;
        const st = stNow(); if (!st.canOrder) return;
        if (C.issues.length) { issueBox.scrollIntoView({ block: 'center', behavior: UI.rm ? 'auto' : 'smooth' }); return; }
        if (!S.agree) { S.termsErr = '请先阅读并同意《购买须知》'; paintTerms(); termBox.scrollIntoView({ block: 'center', behavior: UI.rm ? 'auto' : 'smooth' }); return; }
        S.busy = true; S.err = ''; paintBar();
        try { await UI.request(null, 500); } catch (e) { fail('网络不太稳定，订单没有提交。请检查网络后再点一次，不会重复下单'); return; }
        /* 1 营业状态（下单时再校一次） */
        if (!stNow().canOrder) return fail(storeNow().name + stNow().label + '，暂时不能下单', false);
        /* 2 库存 */
        if (ctx.scene === 'stock-out' && !S.bumped) { S.bumped = true; const p = Mini.product(C.lines[0].pid); p.stock = 0; }
        const gone = C.lines.filter((l) => !Mini.cart.state(l).ok);
        if (gone.length) { Mini.emit('cart'); return fail('「' + gone[0].name + '」刚刚售罄，已从本单移除，请核对后再提交', true); }
        /* 3 价格令牌：商家调价或报价超过 10 分钟 */
        if (ctx.scene === 'price-change' && !S.priceOnce) { S.priceOnce = true; const p = Mini.product(C.lines[0].pid); p.price += 200; }
        const ch = syncPrices(C.lines);
        if (ch.length || Date.now() - S.tokenAt > 600000) { S.tokenAt = Date.now(); S.note = ch.length ? '价格有变化，已更新：' + ch.map((c) => c.name + ' ' + money(c.from, 0) + ' → ' + money(c.to, 0)).join('；') + '。请确认后再提交' : '报价已过期，已重新试算：金额没有变化，请再点一次提交'; C = calc(); paintAll(); S.busy = false; paintBar(); noteBox.scrollIntoView({ block: 'center', behavior: UI.rm ? 'auto' : 'smooth' }); S.key = uid(); return; }
        /* 3.5 券：提交时才发现失效 → 按当前可用的券重新计价，请用户确认 */
        if (ctx.scene === 'coupon-gone' && !S.cgone && C.q.coupon) { S.cgone = true; const cp = db.myCoupons.find((x) => x.id === C.q.coupon.id); const nm = cp.name; cp.state = 'EXPIRED'; S.coupon = undefined; C = calc(); S.note = '优惠券「' + nm + '」已失效：本单已按当前可用的券重新计价，请确认后再提交'; paintAll(); S.busy = false; paintBar(); S.key = uid(); noteBox.scrollIntoView({ block: 'center', behavior: UI.rm ? 'auto' : 'smooth' }); return; }
        /* 4 取餐时段 */
        if (S.slot !== 'asap' && (M2.slots(storeNow()).list.find((x) => x.label === S.slot) || { past: true }).past) { S.slot = 'asap'; paintPick(); return fail('所选取餐时段已过，已改为尽快取餐，请确认后再提交', true); }
        /* 5 券 */
        const q = C.q, method = payAmt() === 0 ? 'none' : S.pay;
        if (method === 'balance' && M2.avail() < q.pay) { paintPay(); return fail('储值余额不足，请改用微信支付或先去充值', true); }
        const o = M2.createOrder({ lines: C.lines, store: storeNow(), pickType: S.pick, slot: S.slot === 'asap' ? '尽快取餐' : S.slot, remark: [S.remark, S.cutlery ? '需要餐具' : ''].filter(Boolean).join('；'), coupon: q.coupon, discount: q.discount });
        o.idemKey = S.key; S.done = true; await Mini.cart.clearSelected();
        if (method === 'none') { o.paySplit = {}; M2.settle(o); } else await M2.pay(o, method);
        ctx.replace('pay-result', { no: o.no, s: UI.state.scene['pay-result'] || 'normal' });
      }
      paintAll(); paintRemark();
      /* 页面停留中，把“报价”时间之外的变化也同步：演示时钟走过取餐时段时，选中的时段变为不可选，提交时会提示 */
      return wrap;
    },
  };

  /* =====================================================================================
     演示数据：订单、售后、评价（B.reset 之后重做）。会员本人的订单全部重写，保证各种状态都有、金额前后对得上
     ===================================================================================== */
  const seed = (db) => {
    const me = db.me, P = (id) => db.products.find((p) => p.id === id), at = (d, hh, mm) => { const x = K.addDays(K.today(), -d); x.setHours(hh, mm, 0, 0); return B.fmt(x); };
    const item = (pid, sp, qty) => { const p = P(pid), s = Object.assign(Mini.defaultSpecs(p), sp || {}); return { pid, name: p.name, spec: Mini.specText(s), qty: qty || 1, price: Mini.specPrice(p, s), img: p.img }; };
    const keep = db.orders.filter((o) => o.userId !== me.id); db.orders.splice(0, db.orders.length, ...keep);
    db.refunds = db.refunds.filter((r) => db.orders.some((x) => x.no === r.orderNo));
    db._m2 = { seq: 440, pickup: 30, lastPay: 'wechat' };
    let n = 0; const mk = (c) => {
      const items = c.items.map((a) => item(a[0], a[1], a[2])), subtotal = items.reduce((s, i) => s + i.price * i.qty, 0), act = c.act ? c.act[1] : 0, cp = c.cp ? c.cp[1] : 0, amount = subtotal - act - cp, split = c.split || (c.pay === 'BALANCE' ? { balance: amount } : { wechat: amount });
      const o = { no: '26' + c.created.slice(2, 10).replace(/-/g, '') + String(100000 + (++n) * 137 + 11), userId: me.id, userName: me.name, items, subtotal, discount: act + cp, amount, pay: c.pay || 'WECHAT', status: c.status, createdAt: c.created, paidAt: c.paid || '', remark: c.remark || '', pickup: c.pickup || '', coupon: c.cp ? c.cp[0] : '',
        couponRef: c.ref || null, actDiscount: act, actName: c.act ? c.act[0] : '', storeId: c.store || 1, pickType: 'self', slot: c.slot || '尽快取餐', t: {}, log: [], paySplit: c.status === 'UNPAID' || c.status === 'CANCELLED' && !c.paid ? undefined : split };
      const L = (t, who, text) => o.log.push({ at: t, who, text });
      L(c.created, me.name, '提交订单' + (c.cp ? '，使用 ' + c.cp[0] : ''));
      if (c.paid) { L(c.paid, '系统', '支付成功 ' + money(amount) + '（' + M2.payText(o) + '）'); L(c.paid, '门店', '已接单，开始制作'); o.t.making = c.paid; }
      if (c.ready) { o.t.fulfilled = c.ready; L(c.ready, '门店', '餐品已做好，通知取餐'); }
      if (c.done) { o.t.done = c.done; L(c.done, c.who || '前台', '核销取餐码，顾客已取餐'); }
      if (c.status === 'UNPAID') o.deadlineAt = Date.now() + c.left * 60000;
      if (c.cancelled) { o.t.cancelled = c.cancelled; if (c.close) { o.closeReason = '超时未支付'; L(c.cancelled, '系统', '超过 30 分钟未支付，订单自动关闭'); } else { o.cancelReason = c.cancelReason || '不想要了'; L(c.cancelled, me.name, '取消订单（' + o.cancelReason + '）'); } }
      if (c.reviewed) o.reviewed = true;
      if (c.ref) { const cpn = db.myCoupons.find((x) => x.id === c.ref); if (cpn && c.status !== 'CANCELLED') { cpn.state = 'USED'; cpn.usedOrder = o.no; } }
      db.orders.push(o); return o;
    };
    const ago = (m) => B.fmt(new Date(M2.now().getTime() - m * 60000));
    /* 0 待支付：还剩 24 分钟 */ mk({ status: 'UNPAID', created: ago(6), left: 24, items: [[2, 0, 1], [10, 0, 1]] });
    /* 1 制作中：余额加微信，有活动减免 */ mk({ status: 'PAID', created: ago(20), paid: ago(18), pickup: 'A27', pay: 'MIX', split: { balance: 1100, wechat: 2000 }, act: ['午市立减', 200], slot: ago(-15).slice(11, 16) + '–' + ago(-30).slice(11, 16), remark: '少放辣', items: [[6, { 份量: '加大', 口味: '微辣' }, 1], [10, 0, 1]] });
    /* 2 待取餐 */ mk({ status: 'FULFILLED', created: ago(28), paid: ago(27), ready: ago(14), pickup: 'A23', items: [[8, 0, 1], [4, 0, 1]] });
    /* 3 已完成（没评价，用过一张券，在万象店） */ mk({ status: 'DONE', created: at(1, 12, 5), paid: at(1, 12, 6), ready: at(1, 12, 18), done: at(1, 12, 21), pickup: 'B08', store: 2, ref: 4, cp: ['满 30 减 3', 300], items: [[5, 0, 1], [4, 0, 1]] });
    /* 4 已完成（已评价，储值支付） */ const o4 = mk({ status: 'DONE', created: at(2, 18, 20), paid: at(2, 18, 21), ready: at(2, 18, 36), done: at(2, 18, 44), pickup: 'A41', pay: 'BALANCE', reviewed: true, items: [[3, 0, 1], [2, 0, 1]] });
    /* 5 已取消（再来一单会遇到售罄和下架） */ mk({ status: 'CANCELLED', created: at(3, 11, 40), cancelled: at(3, 11, 43), cancelReason: '点错了', items: [[7, 0, 1], [12, 0, 1]] });
    /* 6 退款中：部分退款待审核 */ const o6 = mk({ status: 'REFUNDING', created: at(4, 8, 30), paid: at(4, 8, 31), ready: at(4, 8, 42), done: at(4, 8, 48), pickup: 'A05', items: [[10, 0, 2], [5, 0, 1]] });
    /* 7 已退款（余额加微信，已到账） */ const o7 = mk({ status: 'REFUNDED', created: at(5, 19, 5), paid: at(5, 19, 6), ready: at(5, 19, 20), done: at(5, 19, 26), pickup: 'A66', pay: 'MIX', split: { balance: 1400, wechat: 3000 }, items: [[6, 0, 2]] });
    /* 8 已关闭（超时关单后收到支付，自动原路退回中） */ const o8 = mk({ status: 'CANCELLED', created: at(1, 19, 0), cancelled: at(1, 19, 30), close: true, items: [[2, 0, 1]] });
    /* 更早的：十来单已完成或取消，凑够分页 */
    const old = [[7, 12, 20, 'DONE', [[2, 0, 1]]], [8, 18, 5, 'DONE', [[4, 0, 1], [10, 0, 1]]], [9, 8, 40, 'DONE', [[10, 0, 1], [9, 0, 2]]], [11, 12, 15, 'CLOSED', [[8, 0, 1]]], [13, 18, 30, 'DONE', [[6, 0, 1]]], [15, 12, 50, 'DONE', [[3, { 份量: '加大' }, 1]]], [18, 9, 10, 'DONE', [[9, 0, 2]]], [21, 19, 10, 'DONE', [[5, 0, 1], [8, 0, 1]]], [24, 12, 5, 'CANCELLED', [[4, 0, 2]]], [27, 18, 15, 'DONE', [[2, 0, 1], [10, 0, 1]]]];
    old.forEach(([d, hh, mm, st, items], i) => { const c = at(d, hh, mm), p = at(d, hh, mm + 1); mk(st === 'CLOSED' ? { status: 'CANCELLED', created: c, cancelled: at(d, hh, mm + 30), close: true, items } : st === 'DONE' ? { status: 'DONE', created: c, paid: p, ready: at(d, hh, mm + 12), done: at(d, hh, mm + 18), pickup: 'B' + (10 + i), pay: i % 3 === 0 ? 'BALANCE' : 'WECHAT', items, reviewed: i % 2 === 0 } : { status: 'CANCELLED', created: c, cancelled: at(d, hh, mm + 2), cancelReason: '不想要了', items }); });
    db.orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    /* 售后：6 待审核（部分退款），7 已到账，8 迟到支付退回中 */
    const rid = () => db.refunds.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const addR = (o, p) => { const id = rid(), r = Object.assign({ id, no: 'R' + String(2600000 + id * 37), orderNo: o.no, userId: me.id, userName: me.name, kind: '仅退款', status: 'PENDING', handler: '', note: '', desc: '', by: me.name, proofs: [], stage: 'REVIEW', stageAt: Date.now(), auto: false, via: 'apply', trail: [] }, p); r.channel = M2.channelOf(o, r.amount); db.refunds.unshift(r); return r; };
    const r6 = addR(o6, { amount: 700, reason: '菜品有问题', desc: '粥里有一小块不明异物，拍了照片', appliedAt: at(1, 15, 2), items: [{ idx: 0, qty: 1, amount: 700 }], proofs: IMGS().slice(1, 2), trail: [{ at: at(1, 15, 2), who: me.name + '（会员）', text: '提交退款申请 ¥7.00（菜品有问题）' }] });
    o6.prev = 'DONE'; o6.t.refunding = r6.appliedAt; o6.log.push({ at: r6.appliedAt, who: me.name + '（会员）', text: '提交退款申请 ¥7.00（菜品有问题）' });
    const r7 = addR(o7, { amount: o7.amount, reason: '点错了', appliedAt: at(5, 20, 0), status: 'DONE', stage: 'DONE', handler: '王海燕', doneAt: at(4, 9, 12), items: o7.items.map((it, i) => ({ idx: i, qty: it.qty, amount: o7.amount })), trail: [{ at: at(5, 20, 0), who: me.name + '（会员）', text: '提交退款申请 ' + money(o7.amount) + '（点错了）' }, { at: at(5, 20, 20), who: '王海燕', text: '同意退款 ' + money(o7.amount) }, { at: at(4, 9, 12), who: '系统', text: '退款到账 ' + money(o7.amount) + '（含储值余额 ¥14.00 已回到钱包）' }] });
    o7.t.refunding = r7.appliedAt; o7.t.refunded = r7.doneAt; o7.prev = 'DONE'; o7.log.push({ at: r7.appliedAt, who: me.name + '（会员）', text: '提交退款申请' }, { at: r7.doneAt, who: '系统', text: '退款到账 ' + money(o7.amount) });
    o8.late = { amount: o8.amount, at: at(1, 19, 41) }; o8.log.push({ at: o8.late.at, who: '系统', text: '关单后收到支付 ' + money(o8.amount) + '，已记为迟到支付并发起全额原路退款' });
    addR(o8, { amount: o8.amount, reason: '迟到支付', appliedAt: o8.late.at, via: 'late', auto: false, stage: 'REFUNDING', desc: '订单已超时关闭，晚到的支付款自动原路退回', items: [{ idx: 0, qty: 1, amount: o8.amount }], trail: [{ at: o8.late.at, who: '系统', text: '系统发起全额原路退款（迟到支付）' }, { at: o8.late.at, who: '系统', text: '已向支付渠道发起退款' }] });
    /* 评价：4 号订单 */
    const o4i = o4.items.map((i) => i.pid); o4.review = { rating: 5, text: '鱼很新鲜，米饭也热，取餐不用等。', tags: ['味道很好', '出餐很快'], imgs: IMGS().slice(2, 3), likes: { [o4i[0]]: true, [o4i[1]]: true }, anon: false, at: at(2, 19, 10) };
    o4i.forEach((pid) => db.reviews.push({ id: db.reviews.reduce((m, x) => Math.max(m, x.id), 0) + 1, pid, user: me.name.slice(0, 1) + '**', rating: 5, text: o4.review.text, at: at(2, 19, 10).slice(5, 10), orderNo: o4.no, tags: o4.review.tags, imgs: o4.review.imgs }));
    const counted = db.orders.filter((o) => o.userId === me.id && ['PAID', 'FULFILLED', 'DONE'].includes(o.status)); me.orders = counted.length; me.spent = counted.reduce((s, o) => s + o.amount, 0);
  };
  const baseReset = B.reset;
  B.reset = function () { const db = baseReset.call(B); seed(db); return db; };
  seed(B.db);
})();
