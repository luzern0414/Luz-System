/* 第二批页面（二）：订单流程的共用动作（取消、再来一单、取餐码卡）、支付结果 pay-result、订单列表 orders。
   共用件在 mini.p2.js 的 Mini.p2（M2）；订单详情、申请售后、评价在 mini.p2c.js。 */
(function () {
  'use strict';
  const { h } = UI;
  const M2 = Mini.p2, fill = M2.fill, money = Mini.money;
  const $ = (s, r) => (r || document).querySelector(s);

  /* =====================================================================================
     共用动作
     ===================================================================================== */
  M2.REASONS = ['不想要了', '点错了', '想换门店', '想改取餐时间', '信息填错了', '其他'];
  /** 取消订单：待支付的直接取消并退回券；已支付但还没出餐的走整单退款（写清退回路径和到账时间）；已出餐的不能取消 →
      Promise<'cancelled' | 'refunding' | 'conflict' | null>；o.scene 为详情页的演示场景（cancel-fail 网络异常、cancel-paid 刚好被支付） */
  M2.cancelFlow = (ctx, o, opt) => {
    opt = opt || {}; M2.sweep();
    if (o.status === 'CANCELLED') { Mini.toast('订单已经关闭了'); return Promise.resolve('conflict'); }
    if (o.status !== 'UNPAID' && o.status !== 'PAID') return Mini.dialog({ title: '现在不能取消', body: o.status === 'FULFILLED' ? '餐品已经做好，不能再取消订单。如果餐品有问题，可以申请退款。' : '订单已经完成，不能取消。如果餐品有问题，可以在 7 天内申请退款。', actions: [{ label: '知道了', value: null }, { label: '申请退款', kind: 'primary', value: 'refund' }] }).then((v) => { if (v === 'refund') ctx.push('refund-apply', { id: o.no }); return null; });
    const paid = o.status === 'PAID', ch = paid ? M2.channelOf(o, o.amount) : null; let reason = '', other = '', result = null;
    return Mini.sheet({ title: paid ? '取消订单并退款' : '取消订单', tall: true,
      body: (api) => {
        const box = h('div.m2-cancel'), err = h('div.err.m2-cerr', { role: 'alert' });
        const paint = () => fill(box,
          paid ? h('div.m2-alert.m2-alert--info', {}, UI.icon('info', 'icon--sm'), h('div', {}, h('b', { text: '将全额退款 ' + money(o.amount) }), h('p', { text: '门店还没出餐，取消后' + (ch.balance ? '储值余额 ' + money(ch.balance) + ' 即时退回钱包' : '') + (ch.balance && ch.wechat ? '，' : '') + (ch.wechat ? '微信支付 ' + money(ch.wechat) + ' 原路退回，预计 1–3 个工作日到账' : '') + '。' + (o.couponRef ? '用掉的优惠券会退回（未过期的）。' : '') }))) : h('p.muted', { text: '取消后订单关闭' + (o.couponRef ? '，用掉的优惠券会退回' : '') + '，购物车里的商品不会恢复，可以用“再来一单”重新加入。' }),
          h('h3.m2-label', { text: '取消原因（必选）' }), h('div.m2-opts', { role: 'radiogroup', 'aria-label': '取消原因' }, M2.REASONS.map((r) => h('label.m2-opt', {}, h('input.m2-radio', { type: 'radio', name: 'm2why', checked: reason === r, on: { change: () => { reason = r; err.textContent = ''; paint(); } } }), h('span.grow', { text: r })))),
          reason === '其他' ? h('textarea.textarea', { rows: 2, maxlength: 100, placeholder: '请简单说明原因（2–100 字）', 'aria-label': '其他原因', text: other, on: { input: (e) => { other = e.target.value; } } }) : null, err);
        paint(); return box;
      },
      actions: [{ label: '再想想', value: null }, { label: paid ? '确认取消并退款' : '确认取消订单', kind: 'danger.solid', value: 'ok', on: async (body) => {
        const err = $('.m2-cerr', body);
        if (!reason) { err.textContent = '请先选一个取消原因'; return false; }
        if (reason === '其他' && other.trim().length < 2) { err.textContent = '选了“其他”，请写下具体原因（至少 2 个字）'; return false; }
        try { await UI.request(null, 450); if (opt.scene === 'cancel-fail') { const e = new Error('offline'); e.offline = true; throw e; } } catch (e) { err.textContent = '网络不太稳定，订单没有取消，请稍后再试。已取消不了的订单会继续为你保留'; return false; }
        M2.sweep();
        if (opt.scene === 'cancel-paid' && o.status === 'UNPAID') { o.attempt = { outcome: 'success' }; M2.settle(o); }
        if (o.status === 'CANCELLED') { result = 'conflict'; Mini.toast('订单已超时关闭，无需再取消'); return; }
        if (!paid && o.status !== 'UNPAID') { result = 'conflict'; Mini.toast('订单刚刚已经支付成功，不能直接取消。可在订单里申请退款', { kind: 'bad' }); return; }
        const why = reason === '其他' ? '其他：' + other.trim() : reason;
        if (paid) { M2.cancelPaid(o, why); result = 'refunding'; Mini.toast('已提交取消，' + money(o.amount) + ' 将原路退回'); } else { M2.close(o, 'user', why); result = 'cancelled'; Mini.toast(o.couponRef ? '订单已取消，优惠券已退回' : '订单已取消'); }
      } }] }).then(() => result);
  };
  /** 再来一单：把明细加回购物车，说明哪些商品已下架、售罄或超过购买上限没加进去 */
  M2.reorderFlow = async (ctx, o) => {
    const r = await M2.reorder(o);
    if (!r.added.length) return Mini.dialog({ title: '这单的商品现在都买不了', left: true, body: h('div.m2-prose', {}, r.skipped.map((x) => h('p', { text: '「' + x.name + '」' + x.why }))), actions: [{ label: '去点单', kind: 'primary', value: 'menu' }, { label: '知道了', value: null }] }).then((v) => { if (v === 'menu') ctx.switchTab('menu'); });
    if (!r.skipped.length) { Mini.toast('已把 ' + r.added.length + ' 种商品加入购物车'); return ctx.push('cart'); }
    return Mini.dialog({ title: '已加入 ' + r.added.length + ' 种商品', left: true, body: h('div.m2-prose', {}, h('p', { text: '另有商品没能加入：' }), r.skipped.map((x) => h('p', {}, h('b', { text: '「' + x.name + '」' }), x.why))), actions: [{ label: '继续逛', value: null }, { label: '去购物车', kind: 'primary', value: 'cart' }] }).then((v) => { if (v === 'cart') ctx.push('cart'); });
  };
  /** 取餐码卡：二维码示意加 4-4 数字码；核销后换成“已取餐”并写核销时间；取消、关闭后置灰 */
  M2.pickCard = (o) => {
    const k = M2.kind(o), live = k === 'making' || k === 'ready', t = M2.times(o), code = M2.code(o);
    const mask = k === 'done' ? '已取餐' : '已失效';
    return h('div.m2-pick' + (live ? '' : '.is-dead'), { 'data-kind': k },
      h('div.m2-pick-qr', {}, M2.qr(code.replace(' ', ''), 132), live ? null : h('div.m2-pick-mask', {}, h('span', { text: mask }))),
      h('div.m2-pick-info', {},
        h('p.muted', { text: '取餐码' }), h('b.m2-code.num', { text: code, 'aria-label': '取餐码 ' + code.split('').join(' ') }),
        o.pickup ? h('p', {}, h('span.muted', { text: '取餐号 ' }), h('b.num', { text: o.pickup })) : null,
        live ? h('p.m2-bright', {}, UI.icon('sun', 'icon--sm'), '展示时已调亮屏幕，请向店员出示') : k === 'done' ? h('p.muted', { text: '已于 ' + M2.when(t.done) + ' 核销取餐' + ((o.log || []).some((x) => /核销/.test(x.text) && x.who) ? '（' + ((o.log.filter((x) => /核销/.test(x.text)).pop() || {}).who || '前台') + '）' : '') }) : h('p.muted', { text: k === 'refunded' || k === 'refunding' ? '订单已申请退款，取餐码已失效' : '订单已' + (k === 'closed' ? '关闭' : '取消') + '，取餐码已失效' })));
  };
  M2.pickupSheet = (ctx, o) => Mini.sheet({ title: '取餐码', body: () => h('div.m2-pickwrap', {}, M2.pickCard(o), h('div.mini-list', {}, h('div', {}, h('span.muted', { text: '取餐门店' }), h('span.grow.right', { text: M2.store(o.storeId).name })), h('div', {}, h('span.muted', { text: '取餐时间' }), h('span.grow.right', { text: o.slot || '尽快取餐' })))),
    actions: [{ label: '订单详情', value: 'detail' }, { label: '我知道了', kind: 'primary', value: null }] }).then((v) => { if (v === 'detail') ctx.push('order-detail', { id: o.no }); });
  M2.thumbs = (o, n) => { const it = o.items.slice(0, n || 4); return h('div.m2-thumbs', {}, it.map((i) => h('img', { src: i.img, alt: i.name, loading: 'lazy' })), o.items.length > it.length ? h('span.m2-thumb-more', { text: '+' + (o.items.length - it.length) }) : null); };
  M2.itemsText = (o) => o.items.map((i) => i.name + ' ×' + i.qty).join('、');
  /** 去支付：选方式 → 收银 → 到支付结果页 */
  M2.payNow = async (ctx, o, method, mode) => {
    M2.sweep(); if (o.status === 'CANCELLED') { Mini.toast('订单已超时关闭，请重新下单', { kind: 'bad' }); return; }
    const m = method || (await M2.pickMethod(o)); if (!m) return;
    const r = await M2.pay(o, m); if (r === 'closed') { Mini.toast('订单已超时关闭，请重新下单', { kind: 'bad' }); return; }
    const arg = { no: o.no, s: UI.state.scene['pay-result'] || 'normal' }; if (mode === 'replace') ctx.replace('pay-result', arg); else ctx.push('pay-result', arg);
  };

  /* =====================================================================================
     支付结果 pay-result：模拟支付调起之后，按 1、2、4、6、8 秒的节奏查结果
     ===================================================================================== */
  const DELAYS = [1000, 2000, 4000, 6000, 8000];
  const FAIL = {
    cancel: { icon: 'x', title: '你取消了支付', text: '订单还为你保留着，倒计时结束前可以继续支付，没有扣款。' },
    nofund: { icon: 'wallet', title: '储值余额不够', text: '支付时余额不足，这笔订单没有扣款。可以充值后再付，或改用微信支付。' },
    channel: { icon: 'warn', title: '微信支付暂时不可用', text: '支付渠道繁忙，这笔订单没有扣款。稍等一会儿重新支付，或改用储值余额。' },
  };
  const SIM = ['success', 'pending', 'slow', 'cancel', 'nofund', 'channel', 'late'];
  const methodOf = (o) => (o.pay === 'BALANCE' ? 'balance' : o.pay === 'MIX' ? 'mix' : 'wechat');
  const checkSvg = () => h('div', { html: '<svg class="check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><path d="M20 33l8 8 17-18"/></svg>', style: { display: 'contents' } }).firstChild;

  window.PAGES_MINI['pay-result'] = {
    title: '支付结果', tab: null, from: 'orders', auth: true, nav: { title: '支付结果' },
    layout: '主次布局', reason: '用户这时只想知道一件事：钱付成功没有。所以结果（成功、处理中、失败、迟到）是占满首屏的主角，订单信息和取餐码是配角；每种失败只给一两个一步到位的出路，不让人猜',
    scenes: [{ id: 'success', label: '支付成功' }, { id: 'pending', label: '处理中，超时后稍后在订单里查看' }, { id: 'slow', label: '处理中，第 3 次查询后成功' }, { id: 'cancel', label: '失败：用户取消支付' }, { id: 'nofund', label: '失败：储值余额不足' },
      { id: 'channel', label: '失败：支付渠道故障' }, { id: 'late', label: '迟到支付：订单已关闭，款项原路退回' }],
    skeleton: () => M2.skel([208, 'rows']),
    render(ctx) {
      if (SIM.includes(ctx.scene) && ctx.params.s !== ctx.scene && ctx._simFor !== ctx.scene) { const d = M2.demoOrder(ctx.scene); ctx.params.no = d.no; ctx._simFor = ctx.scene; }
      let o = ctx.params.no && M2.byNo(ctx.params.no);
      if (!o && !ctx.params.no) o = M2.mine().find((x) => ['PAID', 'FULFILLED', 'DONE'].includes(x.status)) || M2.mine()[0];
      if (!o) return h('section.mini-page', {}, Mini.empty('没有找到这笔订单', { label: '查看订单', on: () => ctx.replace('orders') }, { sub: '订单可能已被删除' }));
      const box = h('section.mini-page.m2-res', { 'aria-live': 'polite' });
      const S = (ctx._pr = ctx._pr || {}); if (S.no !== o.no) { Object.assign(S, { no: o.no, n: 0, state: 'processing', reason: '', err: false, paused: false, timer: 0, method: methodOf(o), rt: S.rt || 0 }); }
      const my = ++S.rt;
      const cd = h('span.m2-cdv.num');
      let tick = 0;
      /* 订单概要：门店、订单号、金额、支付方式 */
      const brief = () => h('div.mini-card.m2-brief', {}, h('div.m2-brief-top', {}, M2.thumbs(o, 4), h('div.grow', {}, h('b', { text: M2.store(o.storeId).name }), h('p.muted', { text: '共 ' + M2.count(o) + ' 件 · ' + M2.itemsText(o) }))),
        h('div.mini-list', {}, h('div', {}, h('span.muted', { text: '订单号' }), h('span.grow.right.num', { text: o.no }), h('button.m2-copy', { type: 'button', 'aria-label': '复制订单号', on: { click: () => M2.copy(o.no, '订单号已复制') } }, UI.icon('copy', 'icon--sm'))), h('div', {}, h('span.muted', { text: '应付金额' }), h('span.grow.right.num', { text: money(o.amount) })),
          o.paySplit && (o.paySplit.balance || o.paySplit.wechat) && o.status !== 'CANCELLED' ? h('div', {}, h('span.muted', { text: '支付方式' }), h('span.grow.right', { text: M2.methodName(S.method) })) : null));
      const hero = (icon, tone, title, text, extra) => h('div.m2-hero.m2-hero--' + tone, {}, h('div.m2-hero-ic', {}, icon), h('h2', { text: title }), text ? h('p.m2-hero-t', { text }) : null, extra || null);
      const btn = (label, kind, on, icon) => h('button.btn' + (kind ? '.btn--' + kind : '') + '.btn--block', { type: 'button', on: { click: on } }, icon ? UI.icon(icon, 'icon--sm') : null, label);
      const doPay = async (method) => {
        const r = await M2.pay(o, method); if (r === 'closed') { Mini.toast('订单已超时关闭', { kind: 'bad' }); }
        S.method = methodOf(o); restart();
      };
      const paintCd = () => { const ms = M2.leftMs(o); cd.textContent = M2.mmss(ms); return ms; };
      function paint() {
        clearInterval(tick); const st = S.state, parts = [];
        if (st === 'paid') {
          const sp = M2.split(o), left = B.db.me.balance;
          parts.push(hero(checkSvg(), 'ok', '支付成功', '门店已收到订单，正在为你备餐', h('div.m2-hero-amt', {}, Mini.price(o.amount, { size: 'xl', trim: false }), sp.balance ? h('p.muted', { text: '其中储值余额 ' + money(sp.balance) + '，剩余 ' + money(left) }) : null)), h('div.mini-card.m2-card', {}, M2.pickCard(o)), brief(),
            h('div.m2-acts', {}, btn('查看订单', 'primary', () => ctx.replace('order-detail', { id: o.no })), btn('继续点单', '', () => ctx.switchTab('menu'))));
        } else if (st === 'processing') {
          const dots = h('div.m2-dots', { 'aria-hidden': 'true' }, DELAYS.map((_, i) => h('i', { class: i < S.n ? 'on' : '' })));
          parts.push(hero(h('span.m2-ring'), 'info', '正在确认支付结果', S.err ? '网络不太稳定，正在重试…' : '请稍候，不要重复支付', h('div', {}, dots, h('p.muted', { text: S.n ? '已向微信查询 ' + S.n + ' 次（最多 ' + DELAYS.length + ' 次）' : '马上开始查询' }))), brief(), h('p.muted.m2-foot', { text: '支付结果以微信返回的为准，页面会自动更新。' }));
        } else if (st === 'timeout') {
          parts.push(hero(UI.icon('clock', 'icon--lg'), 'warn', '支付结果确认中', '暂时还没查到结果，款项可能还在处理。请不要重复支付，结果出来后会通知你。'), brief(),
            h('div.m2-acts', {}, btn('刷新结果', 'primary', () => { S.n = 0; S.state = 'processing'; S.err = false; restart(); }, 'refresh'), btn('稍后在订单里查看', '', () => ctx.replace('orders'))));
        } else if (st === 'failed') {
          const f = FAIL[S.reason] || FAIL.cancel, ms = paintCd();
          parts.push(hero(UI.icon(f.icon, 'icon--lg'), 'bad', f.title, f.text, h('p.m2-keep', {}, UI.icon('clock', 'icon--sm'), '订单为你保留 ', cd)), brief());
          const acts = [];
          if (S.reason === 'nofund') acts.push(btn('去充值', 'primary', () => ctx.push('wallet'), 'wallet'), btn('改用微信支付', '', () => doPay('wechat'), 'wechat'));
          else if (S.reason === 'channel') acts.push(btn('重新支付', 'primary', () => doPay(S.method), 'refresh'), btn('改用其他方式', '', async () => { const m = await M2.pickMethod(o, S.method); if (m) doPay(m); }));
          else acts.push(btn('继续支付 ' + money(o.amount), 'primary', () => doPay(S.method), 'wechat'), btn('改用其他方式', '', async () => { const m = await M2.pickMethod(o, S.method); if (m) doPay(m); }));
          acts.push(h('button.m2-text.m2-center', { type: 'button', text: '暂不支付，去订单查看', on: { click: () => ctx.replace('orders') } }));
          parts.push(h('div.m2-acts', {}, acts));
          tick = setInterval(() => { if (paintCd() <= 0) { clearInterval(tick); M2.sweep(); S.state = 'closed'; paint(); } }, 1000);
        } else if (st === 'closed') {
          parts.push(hero(UI.icon('clock', 'icon--lg'), 'warn', '订单已超时关闭', '超过 30 分钟没有完成支付，订单已自动关闭，用掉的优惠券已退回。没有扣款。'), brief(), h('div.m2-acts', {}, btn('重新下单', 'primary', () => ctx.replace('cart')), btn('查看订单', '', () => ctx.replace('order-detail', { id: o.no }))));
        } else if (st === 'late') {
          const r = M2.refundsOf(o)[0], stage = r ? M2.stageOf(r) : 'REFUNDING', done = stage === 'DONE';
          parts.push(hero(UI.icon('info', 'icon--lg'), 'warn', done ? '款项已原路退回' : '订单已关闭，款项将原路退回', '订单超时未支付已自动关闭，你在关闭后完成了支付 ' + money(o.late ? o.late.amount : o.amount) + '，系统已自动发起全额退款。', h('p.m2-keep', {}, UI.icon('clock', 'icon--sm'), done ? '已于 ' + M2.when(r.doneAt) + ' 到账' : '预计 1–3 个工作日退回支付账户')),
            h('div.mini-card.m2-brief', {}, h('div.mini-sec', {}, h('h3', { text: '退款进度' }), r ? h('span.mini-tag' + (M2.STAGE[stage][1] ? '.mini-tag--' + M2.STAGE[stage][1] : ''), { text: { REVIEW: '处理中', APPROVED: '处理中' }[stage] || M2.STAGE[stage][0] }) : null),
              h('ol.m2-mini-steps', {}, [['订单关闭', true], ['收到支付', true], ['发起退款', stage !== 'REVIEW'], ['退款到账', done]].map(([t, on]) => h('li' + (on ? '.on' : ''), {}, h('i'), h('span', { text: t }))))), brief(),
            h('div.m2-acts', {}, btn('查看订单', 'primary', () => ctx.replace('order-detail', { id: o.no })), btn('重新点单', '', () => ctx.switchTab('menu'))));
        }
        fill(box, parts);
      }
      /* ---- 轮询：1、2、4、6、8 秒；页面隐藏时暂停，回来接着查；减少动态效果时节奏相同，只是没有转圈动画 ---- */
      function restart() { clearTimeout(S.timer); S.n = 0; S.err = false; const r0 = o.status !== 'UNPAID' ? M2.query(o, 0) : null; if (r0) { S.state = r0.state; S.reason = r0.reason || ''; paint(); return; } S.state = 'processing'; paint(); schedule(); }
      function schedule() { clearTimeout(S.timer); if (S.state !== 'processing' || S.paused || my !== S.rt) return; const bal = o.paySplit && !o.paySplit.wechat; S.timer = setTimeout(run, S.n === 0 && bal ? 400 : DELAYS[Math.min(S.n, DELAYS.length - 1)]); }
      async function run() {
        if (S.state !== 'processing' || my !== S.rt) return; S.n++;
        try { const r = await UI.request(() => M2.query(o, S.n), 120); if (my !== S.rt) return; S.err = false; if (r.state !== 'processing') { S.state = r.state; S.reason = r.reason || ''; paint(); return; } } catch (e) { S.err = true; }
        if (S.n >= DELAYS.length) { S.state = 'timeout'; paint(); return; }
        paint(); schedule();
      }
      ctx.cleanup(() => { clearTimeout(S.timer); clearInterval(tick); });
      ctx.cleanup(Mini.on('order', () => { if (S.state === 'late' && ctx.isTop()) paint(); }));
      ctx.onHide(() => { S.paused = true; clearTimeout(S.timer); });
      ctx.onShow(() => { if (S.paused) { S.paused = false; schedule(); } });
      if (S.state === 'processing' && S.n === 0) restart(); else { paint(); schedule(); }
      return box;
    },
  };

  /* =====================================================================================
     订单 orders（一级标签页）：分段（全部、待支付、待取餐、已完成、退款与售后）带数量，卡片按状态给操作，分页加载更多
     ===================================================================================== */
  const OSDEF = () => ({ seg: 'all', shown: 10, loaded: false, at: '', failMore: true, failRefresh: true, exp: false, err: '' });
  const OS = OSDEF();   // 一级标签页用这份（回到本页分段、加载条数都保留）；被别的页 push 打开的那一份各自独立
  const SEGKEY = { all: 'all', unpaid: 'unpaid', pickup: 'pickup', done: 'done', after: 'after', refund: 'after' };
  Mini.on('auth', () => { OS.seg = 'all'; OS.shown = 10; OS.loaded = false; });
  const EMPTY = { all: ['还没有订单', '去点一份喜欢的吧', '去点单'], unpaid: ['没有待支付的订单', '下单后没支付的订单会为你保留 30 分钟', '去点单'], pickup: ['没有待取餐的订单', '支付成功后，取餐码会出现在这里', '去点单'], done: ['还没有已完成的订单', '取餐后的订单会放在这里', '去点单'], after: ['没有退款或售后记录', '申请过退款的订单会在这里显示进度', ''] };

  window.PAGES_MINI.orders = {
    title: '订单', tab: 'orders', auth: true, nav: { title: '我的订单' },
    layout: '横带分层', reason: '订单列表的价值是“有哪些事要办”：顶上一条分段带数量，下面每张订单卡自上而下是门店与状态、商品缩略图、实付与进度、按状态给的操作；要办的（待支付、待取餐）排最前，已取消和已退款排最后',
    scenes: [{ id: 'expiring', label: '待支付订单快到期（还剩 8 秒）' }, { id: 'refresh-fail', label: '刷新失败：网络异常' }, { id: 'more-fail', label: '加载更多失败（点重试后成功）' }],
    skeleton: () => M2.skel(['tabs', 'order', 'order', 'order']),
    render(ctx) {
      const OS_ = ctx.isRoot ? OS : (ctx._os = ctx._os || OSDEF());
      if (ctx.params.seg && !ctx._segDone) { ctx._segDone = true; OS_.seg = SEGKEY[ctx.params.seg] || 'all'; OS_.shown = 10; }
      if (ctx.scene === 'expiring' && !OS_.exp) { OS_.exp = true; const u = M2.mine().find((x) => x.status === 'UNPAID'); if (u) u.deadlineAt = Date.now() + 8000; } if (ctx.scene !== 'expiring') OS_.exp = false;
      if (ctx.scene === 'more-fail' && OS_.seg === 'all') OS_.shown = Math.min(OS_.shown, 10);
      const build = () => {
        const page = h('section.mini-page.m2-orders'), tabs = h('div.tabs.m2-tabs', { role: 'tablist', 'aria-label': '订单分类' }), info = h('div.m2-oinfo'), list = h('div.m2-olist', { role: 'list' }), more = h('div.m2-loadbox');
        const head = h('div.m2-ohead', {}, tabs, info); page.append(head, list, more);
        const all = () => (ctx.scene === 'empty' ? [] : M2.mine());
        const paintTabs = () => fill(tabs, M2.SEG.map(([k, t]) => { const n = all().filter((o) => M2.inSeg(o, k)).length; return h('button', { type: 'button', role: 'tab', 'aria-selected': String(OS_.seg === k), 'data-seg': k, on: { click: () => { OS_.seg = k; OS_.shown = 10; OS_.err = ''; paintTabs(); paintList(); } } }, t, h('span.m2-n' + (n ? '.on' : ''), { text: String(n) })); }));
        tabs.addEventListener('keydown', (e) => { const b = [...tabs.children], i = b.indexOf(document.activeElement), n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: b.length - 1 }[e.key]; if (i < 0 || n == null) return; e.preventDefault(); const t = b[Math.max(0, Math.min(b.length - 1, n))]; t.click(); const nb = [...tabs.children][b.indexOf(t)]; nb && nb.focus(); });
        const spin = h('span.spin');
        const refresh = async (btn) => {
          btn.disabled = true; fill(btn, spin.cloneNode(), '刷新中');
          try { await UI.request(null, 600); if (ctx.scene === 'refresh-fail' && OS_.failRefresh) { OS_.failRefresh = false; const e = new Error('offline'); e.offline = true; throw e; } OS_.at = M2.stamp(); OS_.err = ''; M2.sweep(); paintTabs(); paintList(); Mini.toast('订单已更新'); } catch (e) { OS_.err = '刷新失败：网络不太稳定，当前显示的是上次的内容'; Mini.toast('刷新没有成功，请稍后再试', { kind: 'bad' }); OS_.failRefresh = true; }
          paintInfo();
        };
        const paintInfo = () => { const n = all().filter((o) => M2.inSeg(o, OS_.seg)).length; const b = h('button.btn.btn--sm.btn--ghost.m2-refresh', { type: 'button', 'aria-label': '刷新订单', on: { click: () => refresh(b) } }, UI.icon('refresh', 'icon--sm'), '刷新'); fill(info, h('span.muted', { text: '共 ' + n + ' 单 · 更新于 ' + M2.hm(OS_.at || M2.stamp()) }), OS_.err ? h('span.m2-oerr', { role: 'alert', text: OS_.err }) : null, b); };
        /* ---- 一张订单卡 ---- */
        const card = (o) => {
          const k = M2.kind(o), st = M2.store(o.storeId), recs = M2.refundsOf(o), act = M2.activeRefunds(o)[0];
          const line = k === 'unpaid' ? h('p.m2-line', {}, UI.icon('clock', 'icon--sm'), '剩余支付时间 ', h('b.m2-cd.num', { 'data-no': o.no, text: M2.mmss(M2.leftMs(o)) }))
            : k === 'making' ? h('p.m2-line', {}, UI.icon('dish', 'icon--sm'), '制作中 · 取餐号 ', h('b.num', { text: o.pickup }), ' · ' + (o.slot || '尽快取餐'))
            : k === 'ready' ? h('p.m2-line.m2-line--ok', {}, UI.icon('bell', 'icon--sm'), '餐品已做好 · 取餐号 ', h('b.num', { text: o.pickup }))
            : k === 'done' ? h('p.m2-line', {}, UI.icon('check', 'icon--sm'), '已取餐 ' + M2.when(M2.times(o).done), o.reviewed ? h('span.mini-tag.mini-tag--ok', { text: '已评价' }) : null, recs.length ? h('span.mini-tag', { text: '有售后' }) : null)
            : k === 'refunding' ? h('p.m2-line.m2-line--warn', {}, UI.icon('refresh', 'icon--sm'), act ? '退款' + M2.STAGE[M2.stageOf(act)][0] + ' ' + money(act.amount) : '退款处理中')
            : k === 'refunded' ? h('p.m2-line', {}, UI.icon('wallet', 'icon--sm'), '已原路退回 ' + money(recs.filter((r) => r.status === 'DONE').reduce((s, r) => s + r.amount, 0) || o.amount))
            : k === 'closed' ? h('p.m2-line', {}, UI.icon('clock', 'icon--sm'), o.late ? '超时关闭 · 迟到支付已退回' : '超时未支付，已自动关闭') : h('p.m2-line', {}, UI.icon('x', 'icon--sm'), '你已取消 · ' + (o.cancelReason || '不想要了'));
          const acts = [], B1 = (label, kind, on) => h('button.btn.btn--sm' + (kind ? '.btn--' + kind : ''), { type: 'button', text: label, on: { click: on } });
          const del = async () => { if (await Mini.confirm('删除订单 ' + o.no.slice(-6) + '（' + st.name + '，' + money(o.amount) + '）。删除后列表里不再显示，不影响已有的退款和发票。', { title: '删除这条订单记录', ok: '删除', danger: true })) { o.hidden = true; M2.touch(); Mini.toast('订单已删除'); paintTabs(); paintInfo(); paintList(); } };
          const moreSheet = () => Mini.sheet({ title: '更多操作', body: (api) => h('div.mini-list', {}, M2.canRefund(o) ? h('button', { type: 'button', on: { click: () => { api.close(); ctx.push('refund-apply', { id: o.no }); } } }, UI.icon('undo'), h('span.grow', { text: '申请退款' })) : null, h('button', { type: 'button', on: { click: () => { api.close(); ctx.push('order-detail', { id: o.no }); } } }, UI.icon('receipt'), h('span.grow', { text: '订单详情' })), ['done', 'cancelled', 'closed', 'refunded'].includes(k) ? h('button', { type: 'button', on: { click: () => { api.close(); del(); } } }, UI.icon('trash'), h('span.grow', { text: '删除订单' })) : null) });
          if (k === 'unpaid') acts.push(B1('取消订单', '', async () => { const r = await M2.cancelFlow(ctx, o); if (r) { paintTabs(); paintInfo(); paintList(); } }), B1('去支付', 'primary', () => M2.payNow(ctx, o)));
          else if (k === 'making') acts.push(B1('取消订单', '', async () => { const r = await M2.cancelFlow(ctx, o); if (r) { paintTabs(); paintInfo(); paintList(); } }), B1('查看取餐码', 'primary', () => M2.pickupSheet(ctx, o)));
          else if (k === 'ready') { if (M2.canRefund(o)) acts.push(B1('申请退款', '', () => ctx.push('refund-apply', { id: o.no }))); acts.push(B1('查看取餐码', 'primary', () => M2.pickupSheet(ctx, o))); }
          else if (k === 'done') { if (!o.reviewed) acts.push(B1('去评价', 'primary', () => ctx.push('review', { id: o.no })), B1('再来一单', '', () => M2.reorderFlow(ctx, o))); else acts.push(B1('再来一单', 'primary', () => M2.reorderFlow(ctx, o))); acts.unshift(B1('更多', '', moreSheet)); }
          else if (k === 'refunding') acts.push(B1('查看进度', 'primary', () => ctx.push('refund-apply', { id: o.no, rid: act ? act.id : undefined })));
          else { acts.unshift(B1('删除订单', '', del)); acts.push(B1('再来一单', 'primary', () => M2.reorderFlow(ctx, o))); }
          return h('article.mini-card.m2-oc' + (['cancelled', 'closed', 'refunded'].includes(k) ? '.is-end' : ''), { role: 'listitem', 'data-no': o.no },
            h('button.m2-hit', { type: 'button', 'aria-label': '查看订单详情 ' + o.no.slice(-6), on: { click: () => ctx.push('order-detail', { id: o.no }) } }),
            h('div.m2-oc-h', {}, UI.icon('shop', 'icon--sm'), h('b', { text: st.name }), h('span.mini-tag', { text: o.pickType === 'dine' ? '堂食' : '自取' }), h('span.grow'), M2.tag(o)),
            h('div.m2-oc-b', {}, M2.thumbs(o, 4), h('div.m2-oc-sum', {}, h('span.muted', { text: M2.when(o.createdAt) + ' · ' + M2.count(o) + ' 件' }), h('div', {}, h('span.muted', { text: o.status === 'UNPAID' ? '应付 ' : '实付 ' }), h('b.num.m2-oc-amt', { text: money(o.amount) })))),
            line, h('div.m2-oc-acts', {}, acts));
        };
        const paintList = () => {
          const rows = all().filter((o) => M2.inSeg(o, OS_.seg)), part = rows.slice(0, OS_.shown);
          if (!rows.length) { const e = EMPTY[OS_.seg]; fill(list, Mini.empty(e[0], e[2] ? { label: e[2], on: () => ctx.switchTab('menu') } : null, { sub: e[1] })); fill(more); return; }
          fill(list, part.map(card));
          if (rows.length > OS_.shown) { const b = h('button.btn.btn--block', { type: 'button', on: { click: () => loadMore(b, rows.length) } }, '加载更多（还有 ' + (rows.length - OS_.shown) + ' 单）'); fill(more, b); } else fill(more, h('p.muted.m2-end', { text: rows.length > 10 ? '没有更多了' : '已显示全部 ' + rows.length + ' 单' }));
        };
        const loadMore = async (b) => {
          b.disabled = true; fill(b, h('span.spin'), '加载中');
          try { await UI.request(null, 500); if (ctx.scene === 'more-fail' && OS_.failMore) { OS_.failMore = false; const e = new Error('offline'); e.offline = true; throw e; } OS_.shown += 10; paintList(); }
          catch (e) { OS_.failMore = true; fill(more, h('div.m2-moreerr', { role: 'alert' }, UI.icon('warn', 'icon--sm'), h('span.grow', { text: '没有加载出来，网络不太稳定' }), h('button.btn.btn--sm', { type: 'button', text: '重试', on: { click: () => loadMore(b) } }))); }
        };
        /* 倒计时：每秒更新所有待支付卡的剩余时间；订单到期被关掉后重绘 */
        const timer = setInterval(() => { list.querySelectorAll('.m2-cd').forEach((el) => { const o = M2.byNo(el.dataset.no); if (o) el.textContent = M2.mmss(M2.leftMs(o)); }); }, 1000);
        ctx.cleanup(() => clearInterval(timer));
        ctx.cleanup(Mini.on('order', () => { if (ctx.isTop()) { paintTabs(); paintInfo(); paintList(); } }));
        ctx.onRetap(() => { ctx.scroller.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' }); });
        paintTabs(); paintInfo(); paintList(); if (!OS_.at) OS_.at = M2.stamp();
        return page;
      };
      if (!OS_.loaded) return Mini.load(() => { OS_.loaded = true; OS_.at = M2.stamp(); }).then(build);
      return build();
    },
  };
})();
