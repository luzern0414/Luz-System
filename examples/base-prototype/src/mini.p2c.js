/* 第二批页面（三）：订单详情 order-detail、申请售后与退款进度 refund-apply、评价 review。共用件在 mini.p2.js（Mini.p2）和 mini.p2b.js。 */
(function () {
  'use strict';
  const { h } = UI;
  const K = window.K;
  const M2 = Mini.p2, fill = M2.fill, money = Mini.money;
  const scrollTo = (el) => el && el.scrollIntoView({ block: 'center', behavior: UI.rm ? 'auto' : 'smooth' });
  const sec = (title, right) => h('div.mini-sec', {}, h('h2', { text: title }), right || null);
  const kv = (k, v, cls) => h('div.m2-kv' + (cls ? '.' + cls : ''), {}, h('span.muted', { text: k }), typeof v === 'string' ? h('span.num', { text: v }) : v);
  const doneAt = (o) => M2.times(o).done || o.createdAt;
  const EXPLAIN = { REVIEW: ['申请已提交，等待门店审核', '门店通常会在 1 个工作日内处理，请耐心等待。审核期间可以撤销申请。', 'clock'], APPROVED: ['审核通过，正在发起退款', '门店已同意退款，系统正在向支付渠道提交退款。', 'check'], REFUNDING: ['退款已发起，正在退回', '款项正在退回你的支付账户，到账时间以渠道为准。', 'refresh'], DONE: ['退款已到账', '', 'check'], REJECTED: ['申请被驳回', '', 'x'], FAILED: ['退款没有成功，已转人工处理', '支付渠道退款失败，客服会在 1 个工作日内联系你，不需要重复申请。', 'warn'], WITHDRAWN: ['你已撤销申请', '订单恢复到申请前的状态，需要时可以重新申请。', 'undo'] };

  /* =====================================================================================
     订单详情 order-detail（?id=订单号）
     ===================================================================================== */
  const pickByScene = (sc) => {
    const L = M2.mine(), k = M2.kind;
    const f = { unpaid: (o) => k(o) === 'unpaid', 'cancel-fail': (o) => k(o) === 'unpaid', 'cancel-paid': (o) => k(o) === 'unpaid', paid: (o) => k(o) === 'making', ready: (o) => k(o) === 'ready', done: (o) => k(o) === 'done' && !o.reviewed, 'done-reviewed': (o) => k(o) === 'done' && o.reviewed,
      cancelled: (o) => k(o) === 'cancelled', closed: (o) => k(o) === 'closed' && !o.late, late: (o) => k(o) === 'closed' && o.late, refunding: (o) => k(o) === 'refunding', refunded: (o) => k(o) === 'refunded' }[sc];
    return f ? L.find(f) : null;
  };
  window.PAGES_MINI['order-detail'] = {
    title: '订单详情', tab: null, from: 'orders', auth: true, bar: true, nav: { title: '订单详情' },
    layout: '主次布局', reason: '进来的人最想知道“我的订单现在怎么样了、怎么取”：首屏主角是状态头和取餐码，后面依次是进度、商品与金额拆分、门店、订单信息、操作记录；底部固定栏只放当前状态下最该做的一两件事',
    scenes: [{ id: 'unpaid', label: '状态：待支付（倒计时）' }, { id: 'paid', label: '状态：制作中' }, { id: 'ready', label: '状态：待取餐（已出餐）' }, { id: 'done', label: '状态：已完成，未评价' }, { id: 'done-reviewed', label: '状态：已完成，已评价' }, { id: 'cancelled', label: '状态：已取消' },
      { id: 'closed', label: '状态：已关闭（超时未支付）' }, { id: 'late', label: '状态：已关闭，迟到支付退回中' }, { id: 'refunding', label: '状态：退款中（部分退款）' }, { id: 'refunded', label: '状态：已退款' }, { id: 'cancel-fail', label: '取消订单失败：网络异常' }, { id: 'cancel-paid', label: '取消订单失败：刚好被支付' }],
    skeleton: () => M2.skel([96, 160, 'rows', 168]),
    render(ctx) {
      let o = ctx.params.id ? M2.byNo(ctx.params.id) : pickByScene(ctx.scene) || M2.mine()[0], miss = false;
      if (!ctx.params.id && ctx.scene !== 'normal' && !pickByScene(ctx.scene) && o) miss = true;
      if (!o || o.hidden) return h('section.mini-page', {}, Mini.empty('没有找到这笔订单', { label: '回到订单', on: () => ctx.back() }, { sub: '订单可能已被删除，或不是你的订单' }));
      const page = h('section.mini-page.m2-detail'), wrap = h('div.m2-wrap', {}, page), barBox = h('div.m2-bar.m2-bar--acts'); wrap.append(barBox);
      let tick = 0, logOpen = false;
      const store = () => M2.store(o.storeId), kind = () => M2.kind(o);
      const hero = () => {
        const k = kind(), t = M2.times(o), acts = M2.activeRefunds(o)[0], ms = M2.leftMs(o);
        const H = { unpaid: ['待支付', h('span', {}, '请在 ', h('b.m2-cdv.num', { text: M2.mmss(ms) }), ' 内完成支付，超时订单将自动关闭'), 'warn'], making: ['制作中', '已支付成功，门店正在为你备餐' + (o.slot && o.slot !== '尽快取餐' ? '，预约 ' + o.slot + ' 取餐' : ''), 'brand'], ready: ['待取餐', '餐品已做好，请凭取餐码到店领取', 'ok'], done: ['已完成', '已取餐，感谢光临' + (o.reviewed ? '' : '，说说这顿的感受吧'), 'plain'],
          cancelled: ['已取消', '你已取消订单（' + (o.cancelReason || '不想要了') + '）' + (o.couponRef ? '，优惠券已退回' : ''), 'plain'], closed: ['已关闭', o.late ? '订单超时关闭后收到了你的支付，' + money(o.late.amount) + ' 将原路退回' : '超时未支付，订单已自动关闭' + (o.couponRef ? '，优惠券已退回' : ''), 'plain'],
          refunding: ['退款中', acts ? '退款' + M2.STAGE[M2.stageOf(acts)][0] + '：' + money(acts.amount) : '退款处理中', 'warn'], refunded: ['已退款', '款项已原路退回，订单已关闭', 'plain'] }[k];
        return h('div.m2-ohero.m2-ohero--' + H[2], {}, h('div.m2-ohero-top', {}, h('h2', { text: H[0] }), h('span.muted', { text: M2.when(t.created) + ' 下单' })), h('p', {}, H[1]));
      };
      const timeline = () => { const T = M2.timeline(o); return h('div.mini-card.m2-card', {}, sec('订单进度'), h('ol.m2-tl', {}, T.map((s) => h('li.m2-tl-' + s.state, {}, h('i', {}, s.state === 'done' ? UI.icon('check', 'icon--sm') : s.state === 'bad' ? UI.icon('x', 'icon--sm') : null), h('span.grow', { text: s.label }), h('span.muted.num', { text: s.at ? M2.when(s.at) : s.state === 'now' ? '进行中' : '' }))))); };
      const items = () => {
        const sp = M2.split(o), paid = o.paidAt || o.late, pay = (k, v) => v ? kv(k, money(v)) : null;
        return h('div.mini-card.m2-card', {}, sec('商品明细', h('span.muted', { text: '共 ' + M2.count(o) + ' 件' })),
          h('div.m2-items', {}, o.items.map((i) => h('div.m2-item', {}, h('img', { src: i.img, alt: '', loading: 'lazy' }), h('div.grow', {}, h('b.m2-name', { text: i.name }), h('p.muted', { text: (i.spec || '默认规格') + ' × ' + i.qty })), h('div.m2-iprice', {}, Mini.price(i.price * i.qty, { trim: false }), i.qty > 1 ? h('span.muted', { text: money(i.price, 2) + ' / 件' }) : null)))),
          h('div.m2-split', {}, kv('商品小计', money(sp.subtotal)), sp.act ? kv('活动优惠' + (o.actName ? '（' + o.actName + '）' : ''), '-' + money(sp.act), 'minus') : null, sp.coupon ? kv('优惠券' + (o.coupon ? '（' + o.coupon + '）' : ''), '-' + money(sp.coupon), 'minus') : null,
            paid ? [pay('储值余额', sp.balance), pay('微信支付', sp.wechat), pay('会员卡抵扣', sp.card)] : null,
            kv(paid ? '实付' : '应付', h('b.num.m2-total', { text: money(o.amount) }), 'sum'), paid ? h('p.muted.m2-sumnote', { text: '优惠后实付 ' + money(o.amount) + '，由' + [sp.balance ? '储值余额 ' + money(sp.balance) : '', sp.wechat ? '微信支付 ' + money(sp.wechat) : '', sp.card ? '会员卡抵扣 ' + money(sp.card) : ''].filter(Boolean).join(' + ') + '付清' }) : null));
      };
      const storeCard = () => { const s = store(); return h('div.mini-card.m2-card', {}, sec('取餐门店'), h('div.m2-store', {}, h('div.grow', {}, h('b', { text: s.name }), h('p.muted', { text: s.addr }), h('p.muted', { text: '营业时间 ' + s.hours }), h('p.muted.num', { style: { whiteSpace: 'nowrap' }, text: s.phone })), h('button.m2-round', { type: 'button', 'aria-label': '拨打电话：' + s.name, on: { click: () => M2.call(s) } }, UI.icon('handset')), h('button.m2-round', { type: 'button', 'aria-label': '导航到：' + s.name, on: { click: () => M2.navigate(s) } }, UI.icon('navigate')))); };
      const info = () => {
        const t = M2.times(o), ended = ['done', 'cancelled', 'closed', 'refunded'].includes(kind());
        return h('div.mini-card.m2-card', {}, sec('订单信息'), kv('订单号', h('span.m2-copyrow', {}, h('span.num', { text: o.no }), h('button.m2-copy', { type: 'button', 'aria-label': '复制订单号', on: { click: () => M2.copy(o.no, '订单号已复制') } }, UI.icon('copy', 'icon--sm')))), kv('下单时间', t.created.slice(5)), t.paid ? kv('支付时间', t.paid.slice(5)) : null,
          kv('支付方式', M2.payText(o)), kv('取餐方式', o.pickType === 'dine' ? '堂食' : '到店自取'), kv('取餐时间', o.slot || '尽快取餐'), o.pickup ? kv('取餐号', o.pickup) : null, kv('备注', h('span', { text: o.remark || '无' })),
          ended ? h('button.m2-text.m2-dangertext', { type: 'button', text: '删除这条订单记录', on: { click: async () => { if (await Mini.confirm('删除订单 ' + o.no.slice(-6) + '（' + money(o.amount) + '）。删除后列表里不再显示，不影响已有的退款和发票。', { title: '删除这条订单记录', ok: '删除', danger: true })) { o.hidden = true; M2.touch(); Mini.toast('订单已删除'); ctx.back(); } } } }) : null);
      };
      const refunds = () => { const R = M2.refundsOf(o); if (!R.length) return null; return h('div.mini-card.m2-card', {}, sec('售后记录', h('span.muted', { text: R.length + ' 条' })), h('div.mini-list', {}, R.map((r) => { const st = M2.stageOf(r); return h('button', { type: 'button', on: { click: () => ctx.push('refund-apply', { id: o.no, rid: r.id }) } }, h('span.grow', {}, h('b', { text: '退款 ' + money(r.amount) }), h('span.muted', { text: ' ' + r.reason + ' · ' + M2.when(r.appliedAt) })), h('span.mini-tag' + (M2.STAGE[st][1] ? '.mini-tag--' + M2.STAGE[st][1] : ''), { text: M2.STAGE[st][0] }), UI.icon('right', 'icon--sm')); }))); };
      const logCard = () => { const L = (o.log || []).slice().reverse(), show = logOpen ? L : L.slice(0, 4); return h('div.mini-card.m2-card', {}, sec('操作记录', h('span.muted', { text: L.length + ' 条' })), h('ol.m2-log', {}, show.map((x) => h('li', {}, h('span.muted.num', { text: x.at.slice(5) }), h('span.grow', {}, h('b', { text: x.who }), ' ' + x.text)))), L.length > 4 ? h('button.m2-more', { type: 'button', 'aria-expanded': String(logOpen), text: logOpen ? '收起' : '展开全部 ' + L.length + ' 条', on: { click: () => { logOpen = !logOpen; paint(); } } }) : null); };
      const reviewCard = () => !o.reviewed || !o.review ? null : h('div.mini-card.m2-card.m2-rvcard', {}, h('div.mini-sec', {}, h('h2', { text: '我的评价' }), h('button.mini-link', { type: 'button', on: { click: () => ctx.push('review', { id: o.no }) } }, '查看', UI.icon('right'))), h('div.m2-stars-sm', { role: 'img', 'aria-label': o.review.rating + ' 星' }, [1, 2, 3, 4, 5].map((i) => UI.icon('star', 'icon--sm' + (i <= o.review.rating ? ' on' : '')))), h('p.m2-clamp', { text: o.review.text || '（没有文字评价）' }));
      const contact = () => Mini.sheet({ title: '联系门店', body: (api) => h('div.mini-list', {}, h('button', { type: 'button', on: { click: () => { api.close(); M2.call(store()); } } }, UI.icon('handset'), h('span.grow', {}, h('b', { text: '拨打门店电话' }), h('span.muted', { text: ' ' + store().phone }))), h('button', { type: 'button', on: { click: () => { api.close(); M2.copy(store().phone, '电话已复制'); } } }, UI.icon('copy'), h('span.grow', { text: '复制电话号码' })), h('button', { type: 'button', on: { click: () => { api.close(); ctx.push('feedback'); } } }, UI.icon('send'), h('span.grow', { text: '在线反馈或投诉' })), h('p.muted', { style: { padding: '8px 16px' }, text: '门店营业时间 ' + store().hours + '，订单号 ' + o.no.slice(-6) + ' 可以报给店员' })) });
      /* ---- 底部栏：按状态给最该做的事 ---- */
      const bar = () => {
        const k = kind(), B2 = (label, kindc, on, icon) => h('button.btn.grow' + (kindc ? '.btn--' + kindc : ''), { type: 'button', on: { click: on } }, icon ? UI.icon(icon, 'icon--sm') : null, label);
        const done = async (r) => { if (r) { paint(); } };
        const act = [];
        if (k === 'unpaid') act.push(B2('取消订单', '', async () => done(await M2.cancelFlow(ctx, o, { scene: ctx.scene }))), h('button.btn.btn--primary.grow', { type: 'button', on: { click: () => M2.payNow(ctx, o) } }, '去支付 ', h('span.num.m2-cdv', { text: M2.mmss(M2.leftMs(o)) })));
        else if (k === 'making') act.push(B2('联系门店', '', contact, 'handset'), B2('取消订单', 'tint', async () => done(await M2.cancelFlow(ctx, o, {}))));
        else if (k === 'ready') { act.push(B2('联系门店', '', contact, 'handset')); if (M2.canRefund(o)) act.push(B2('申请退款', 'tint', () => ctx.push('refund-apply', { id: o.no }))); }
        else if (k === 'done') { act.push(B2('联系门店', '', contact)); if (M2.canRefund(o)) act.push(B2('申请退款', '', () => ctx.push('refund-apply', { id: o.no }))); act.push(o.reviewed ? B2('再来一单', 'primary', () => M2.reorderFlow(ctx, o)) : B2('去评价', 'primary', () => ctx.push('review', { id: o.no }))); if (!o.reviewed) act.splice(act.length - 1, 0, B2('再来一单', '', () => M2.reorderFlow(ctx, o))); }
        else if (k === 'refunding') { const a = M2.activeRefunds(o)[0]; act.push(B2('联系门店', '', contact), B2('查看退款进度', 'primary', () => ctx.push('refund-apply', { id: o.no, rid: a ? a.id : undefined }))); }
        else act.push(B2('联系门店', '', contact), B2('再来一单', 'primary', () => M2.reorderFlow(ctx, o)));
        fill(barBox, act);
        barBox.dataset.n = String(act.length);
      };
      function paint() {
        const k = kind(), pickLive = ['making', 'ready', 'done'].includes(k), pk = pickLive ? h('div.mini-card.m2-card.m2-pickcard', {}, sec('取餐码', h('span.muted', { text: store().name })), M2.pickCard(o)) : null;
        fill(page, miss ? h('div.m2-alert.m2-alert--info', {}, UI.icon('info', 'icon--sm'), h('p', { text: '没有这种状态的订单，先显示最近的一单' })) : null, hero(), pk, timeline(), items(), refunds(), reviewCard(), storeCard(), info(), logCard());
        bar();
      }
      /* 待支付的倒计时、关单后重绘 */
      clearInterval(tick);
      tick = setInterval(() => { M2.sweep(); const k = kind(); if (k === 'unpaid') wrap.querySelectorAll('.m2-cdv').forEach((e) => { e.textContent = M2.mmss(M2.leftMs(o)); }); }, 1000);
      ctx.cleanup(() => clearInterval(tick));
      ctx.cleanup(Mini.on('order', () => { if (ctx.isTop()) paint(); }));
      paint();
      return wrap;
    },
  };

  /* =====================================================================================
     申请售后 refund-apply（?id=订单号；rid=售后单 id 时看退款进度）
     ===================================================================================== */
  const WHY = ['点错了', '菜品有问题', '重复下单', '出餐太慢', '其他'];
  const STAGE_SCENE = { 's-review': 'REVIEW', 's-approved': 'APPROVED', 's-refunding': 'REFUNDING', 's-done': 'DONE', 's-rejected': 'REJECTED', 's-failed': 'FAILED' };
  const stageTag = (st) => h('span.mini-tag' + (M2.STAGE[st][1] ? '.mini-tag--' + M2.STAGE[st][1] : ''), { text: M2.STAGE[st][0] });

  /* ---- 退款进度 ---- */
  function progressView(ctx, o, r0, forced) {
    const r = forced ? Object.assign({}, r0, { status: forced === 'DONE' ? 'DONE' : forced === 'REJECTED' ? 'REJECTED' : 'PENDING', stage: forced, note: forced === 'REJECTED' ? '凭证看不出餐品有问题，请补充清晰的照片后重新申请' : r0.note, doneAt: forced === 'DONE' ? (r0.doneAt || M2.stamp()) : r0.doneAt }) : r0;
    const st = M2.stageOf(r), wrap = h('div.m2-wrap'), page = h('section.mini-page.m2-prog'), barBox = h('div.m2-bar.m2-bar--acts');
    wrap.append(page, barBox);
    const E = EXPLAIN[st], ch = r.channel || M2.channelOf(o, r.amount);
    const hero = h('div.m2-ohero.m2-ohero--' + ({ DONE: 'ok', REJECTED: 'bad', FAILED: 'bad', WITHDRAWN: 'plain' }[st] || 'warn'), {}, h('div.m2-ohero-top', {}, h('h2', { text: E[0] }), stageTag(st)),
      h('p', { text: st === 'DONE' ? money(r.amount) + ' 已' + (ch.wechat ? '原路退回微信支付' : '') + (ch.balance && ch.wechat ? '，' : '') + (ch.balance ? (ch.wechat ? '' : '退回') + '储值余额' : '') + '，' + M2.when(r.doneAt) + ' 到账' : st === 'REJECTED' ? '驳回原因：' + (r.note || '门店未说明原因') + '。你可以补充材料后重新申请。' : E[1] }));
    /* 步骤条：正常四步；被拒绝、转人工、撤销是分支 */
    const P = [['已提交', r.appliedAt]], S4 = ['REVIEW', 'APPROVED', 'REFUNDING', 'DONE'], idx = S4.indexOf(st);
    const trailAt = (kw) => ((r.trail || []).find((x) => x.text.includes(kw)) || {}).at || '';
    let steps;
    if (st === 'REJECTED' || st === 'WITHDRAWN') steps = [['已提交', r.appliedAt, 'done'], ['门店审核', trailAt('驳回') || trailAt('撤销'), 'done'], [st === 'REJECTED' ? '被拒绝' : '已撤销', '', 'bad']];
    else if (st === 'FAILED') steps = [['已提交', r.appliedAt, 'done'], ['审核通过', trailAt('同意') || trailAt('通过'), 'done'], ['退款失败', '', 'bad'], ['人工处理', '', 'now']];
    else steps = [['已提交', r.appliedAt, 'done'], ['门店审核', st === 'REVIEW' ? '' : trailAt('审核通过') || trailAt('同意') || trailAt('通过'), idx > 0 ? 'done' : 'now'], ['退款中', idx >= 2 ? trailAt('发起退款') : '', idx > 2 ? 'done' : idx === 2 ? 'now' : 'todo'], ['已到账', st === 'DONE' ? r.doneAt : '', st === 'DONE' ? 'done' : 'todo']];
    if (st === 'APPROVED') steps[1][2] = 'done';
    const stepper = h('div.mini-card.m2-card', {}, sec('退款进度', h('span.muted', { text: st === 'DONE' || st === 'REJECTED' || st === 'WITHDRAWN' ? '' : '约 1–3 个工作日到账' })), h('ol.m2-tl', {}, steps.map((s) => h('li.m2-tl-' + s[2], {}, h('i', {}, s[2] === 'done' ? UI.icon('check', 'icon--sm') : s[2] === 'bad' ? UI.icon('x', 'icon--sm') : null), h('span.grow', { text: s[0] }), h('span.muted.num', { text: s[1] ? M2.when(s[1]) : s[2] === 'now' ? '进行中' : '' })))));
    const L = M2.lines(o), rows = (r.items && r.items.length ? r.items : L.map((l) => ({ idx: l.i, qty: l.it.qty, amount: l.share })));
    const detail = h('div.mini-card.m2-card', {}, sec('退款明细'),
      h('div.m2-items', {}, rows.map((x) => { const it = o.items[x.idx]; return it ? h('div.m2-item', {}, h('img', { src: it.img, alt: '', loading: 'lazy' }), h('div.grow', {}, h('b.m2-name', { text: it.name }), h('p.muted', { text: (it.spec || '默认规格') + ' × ' + x.qty })), h('div.m2-iprice', {}, h('b.num', { text: money(x.amount) }))) : null; })),
      kv('退款金额', h('b.num.m2-total', { text: money(r.amount) })), kv('退款方式', '仅退款'), kv('申请原因', r.reason + (r.desc ? '（' + r.desc + '）' : '')), kv('申请编号', h('span.m2-copyrow', {}, h('span.num', { text: M2.rno(r) }), h('button.m2-copy', { type: 'button', 'aria-label': '复制申请编号', on: { click: () => M2.copy(M2.rno(r), '申请编号已复制') } }, UI.icon('copy', 'icon--sm')))), kv('申请时间', M2.when(r.appliedAt)),
      r.proofs && r.proofs.length ? h('div.m2-proofs', {}, r.proofs.map((k) => h('img', { src: window.IMG[k], alt: '凭证图片' }))) : null);
    const path = h('div.mini-card.m2-card', {}, sec('退回路径'), ch.balance ? kv('储值余额', money(ch.balance) + ' · 即时退回钱包') : null, ch.wechat ? kv('微信支付', money(ch.wechat) + ' · 原路退回，1–3 个工作日') : null,
      ch.balance ? h('p.muted.m2-sumnote', { text: '储值余额部分按原消费比例退回本金和赠送金，赠送金回到赠送余额，不折现。' }) : null, h('p.muted.m2-sumnote', { text: '退款不会退到积分或代金券；订单有未过期的优惠券时，全部商品退完后会退回。' }));
    const trail = h('div.mini-card.m2-card', {}, sec('处理记录'), h('ol.m2-log', {}, (r.trail || []).slice().reverse().map((x) => h('li', {}, h('span.muted.num', { text: x.at.slice(5) }), h('span.grow', {}, h('b', { text: x.who }), ' ' + x.text)))));
    fill(page, hero, stepper, detail, path, trail);
    const B2 = (label, kind, on) => h('button.btn.grow' + (kind ? '.btn--' + kind : ''), { type: 'button', text: label, on: { click: on } });
    const withdraw = async () => { if (await Mini.confirm('撤销这笔 ' + money(r.amount) + ' 的退款申请（订单 ' + o.no.slice(-6) + '）。撤销后订单恢复原状，需要时可以重新申请。', { title: '撤销退款申请', ok: '撤销申请', danger: true })) { try { await UI.request(null, 400); } catch (e) { Mini.toast('网络不太稳定，没有撤销成功', { kind: 'bad' }); return; } M2.endRefund(r, 'WITHDRAWN', o.userName + '（会员）', '会员撤销了申请'); Mini.toast('申请已撤销'); ctx.refresh(); } };
    const acts = st === 'REVIEW' ? [B2('撤销申请', '', withdraw), B2('联系门店', 'primary', () => M2.call(M2.store(o.storeId)))]
      : st === 'REJECTED' || st === 'WITHDRAWN' ? [B2('查看订单', '', () => ctx.replace('order-detail', { id: o.no })), B2('重新申请', 'primary', () => ctx.replace('refund-apply', { id: o.no }))]
        : st === 'FAILED' ? [B2('查看订单', '', () => ctx.replace('order-detail', { id: o.no })), B2('联系客服', 'primary', () => ctx.push('feedback'))]
          : [B2('联系门店', '', () => M2.call(M2.store(o.storeId))), B2('查看订单', 'primary', () => ctx.replace('order-detail', { id: o.no }))];
    fill(barBox, acts);
    return wrap;
  }

  window.PAGES_MINI['refund-apply'] = {
    title: '申请售后', tab: null, from: 'orders', auth: true, bar: true, nav: { title: '申请售后' },
    layout: '横带分层', reason: '申请售后是一条从上往下的流程：先选退哪几样、退多少（金额当场试算），再说原因、传凭证，最后提交；提交后同一页换成退款进度，一眼看到现在走到哪一步、钱会从哪里退回',
    scenes: [{ id: 'has-active', label: '该订单已有进行中的申请' }, { id: 'window-closed', label: '超出申请期限，不能在线申请' }, { id: 'exceed', label: '提交被拒：金额超过可退上限' }, { id: 'conflict', label: '提交被拒：商品刚被另一笔申请占用' }, { id: 'zero', label: '0 元订单：没有可退款项' },
      { id: 's-review', label: '进度：待审核' }, { id: 's-approved', label: '进度：已通过' }, { id: 's-refunding', label: '进度：退款中' }, { id: 's-done', label: '进度：已到账' }, { id: 's-rejected', label: '进度：被拒绝（写明原因）' }, { id: 's-failed', label: '进度：退款失败，转人工' }],
    skeleton: () => M2.skel([132, 'rows', 156, 132]),
    render(ctx) {
      const sc = ctx.scene, forced = STAGE_SCENE[sc], L = M2.mine();
      let o = ctx.params.id ? M2.byNo(ctx.params.id) : null;
      if (!o) o = forced || sc === 'has-active' ? L.find((x) => M2.refundsOf(x).length && M2.kind(x) === 'refunding') || L.find((x) => M2.refundsOf(x).length) : sc === 'window-closed' ? L.find((x) => x.status === 'DONE' && M2.now() > M2.refundWindow(x)) : L.find((x) => M2.kind(x) === 'done' && M2.canRefund(x)) || L.find((x) => M2.canRefund(x));
      if (!o) return h('section.mini-page', {}, Mini.empty('没有可以申请售后的订单', { label: '回到订单', on: () => ctx.back() }, { sub: '已完成或已支付的订单才能申请退款' }));
      /* 进度 */
      const rid = ctx.params.rid ? Number(ctx.params.rid) : null;
      let rec = rid ? B.db.refunds.find((x) => x.id === rid && x.orderNo === o.no) : null;
      if (forced) rec = rec || M2.refundsOf(o)[0];
      if (rec) { ctx.setTitle('退款进度'); const v = progressView(ctx, o, rec, forced); ctx.cleanup(Mini.on('order', () => { if (ctx.isTop()) ctx.refresh(); })); return v; }
      ctx.setTitle('申请售后');
      const active = M2.activeRefunds(o)[0], Ls = M2.lines(o);
      const page = h('section.mini-page.m2-apply'), wrap = h('div.m2-wrap', {}, page);
      const back = () => ctx.back();
      const stop = (title, text, extra) => { fill(page, Mini.empty(title, { label: '返回订单', kind: 'tint', on: back }, { sub: text }), extra); return wrap; };
      if (sc === 'zero' || o.amount === 0) return stop('这是 0 元订单，没有可退款项', '优惠后实付 0 元的订单不产生退款，如有问题请联系门店。');
      if (!['PAID', 'FULFILLED', 'DONE', 'REFUNDING'].includes(o.status)) return stop(o.status === 'UNPAID' ? '待支付的订单不用退款' : o.status === 'REFUNDED' ? '这笔订单已经全额退款' : '这笔订单已关闭', o.status === 'UNPAID' ? '直接取消订单就可以，优惠券会退回。' : '没有可以申请的款项。');
      if (sc === 'window-closed' || M2.now() > M2.refundWindow(o)) return stop('已超过申请期限', '订单完成后 7 天内可以在线申请售后，这笔订单已过期（截止 ' + K.ymd(M2.refundWindow(o)).slice(5) + '）。如有问题请联系门店处理。', h('button.btn.btn--block', { type: 'button', on: { click: () => M2.call(M2.store(o.storeId)) } }, UI.icon('handset', 'icon--sm'), '联系门店'));
      const free = Ls.filter((l) => l.leftQty > 0 && !l.locked);
      const S = (ctx._ra = ctx._ra || { sel: {}, why: '', other: '', desc: '', proofs: [], busy: false, err: {}, ok: false });
      /* 已有进行中的申请：入口去看进度 */
      const activeCard = active ? h('div.mini-card.m2-card.m2-activecard', {}, h('div.mini-sec', {}, h('h2', { text: '已有进行中的申请' }), stageTag(M2.stageOf(active))), h('p.muted', { text: '退款 ' + money(active.amount) + ' · ' + active.reason + ' · ' + M2.when(active.appliedAt) }), h('button.btn.btn--block.btn--tint', { type: 'button', on: { click: () => ctx.push('refund-apply', { id: o.no, rid: active.id }) } }, '查看进度', UI.icon('right', 'icon--sm'))) : null;
      if (!free.length) { fill(page, activeCard, Mini.empty(active ? '商品都在申请中' : '没有可退的商品了', { label: '返回订单', kind: 'tint', on: back }, { sub: active ? '同一件商品同一时间只能有一个申请，处理完才能再申请。' : '这笔订单的商品都已退款。' })); return wrap; }
      if (!Object.keys(S.sel).length) free.forEach((l) => { S.sel[l.i] = { on: true, qty: l.leftQty }; });
      /* 区块容器 */
      const orderBox = h('div.mini-card.m2-card'), linesBox = h('div.mini-card.m2-card'), trialBox = h('div.mini-card.m2-card'), whyBox = h('div.mini-card.m2-card'), proofBox = h('div.mini-card.m2-card'), wayBox = h('div.mini-card.m2-card');
      const errBox = h('div.m2-err', { role: 'alert', hidden: true }), total = h('span.m2-btotal.num'), sub = h('div.m2-bsub'), go = h('button.btn.btn--primary.m2-bgo', { type: 'button', on: { click: () => submit() } });
      const bar = h('div.m2-bar.m2-bar--col', {}, errBox, h('div.m2-barrow', {}, h('div.m2-bsum', {}, h('div', {}, h('span.muted', { text: '退款 ' }), total), sub), go));
      fill(page, activeCard, orderBox, linesBox, trialBox, whyBox, proofBox, wayBox); wrap.append(bar);
      const picks = () => free.filter((l) => S.sel[l.i].on).map((l) => ({ l, k: S.sel[l.i].qty, amt: M2.lineAmt(l, S.sel[l.i].qty) }));
      const amount = () => picks().reduce((s, x) => s + x.amt, 0);
      const doneSum = M2.refundsOf(o).filter((r) => M2.stageOf(r) === 'DONE').reduce((s, r) => s + r.amount, 0);
      const paintOrder = () => fill(orderBox, sec('订单信息', M2.tag(o)), h('div.m2-brief-top', {}, M2.thumbs(o, 4), h('div.grow', {}, h('b', { text: M2.store(o.storeId).name }), h('p.muted', { text: M2.when(o.createdAt) + ' · 共 ' + M2.count(o) + ' 件' }))),
        kv('实付金额', money(o.amount)), doneSum ? kv('已退款', money(doneSum)) : null, active ? kv('申请中', money(M2.activeRefunds(o).reduce((s, r) => s + r.amount, 0))) : null, kv('申请截止', K.ymd(M2.refundWindow(o)).slice(5) + ' ' + M2.hm(B.fmt(M2.refundWindow(o)))));
      const paintLines = () => {
        fill(linesBox, sec('选择要退的商品', h('button.m2-text', { type: 'button', text: free.every((l) => S.sel[l.i].on) ? '取消全选' : '全选', on: { click: () => { const all = !free.every((l) => S.sel[l.i].on); free.forEach((l) => { S.sel[l.i].on = all; S.sel[l.i].qty = l.leftQty; }); S.err.lines = ''; paintLines(); paintTrial(); paintBar(); } } })),
          h('div.m2-rlines', {}, Ls.map((l) => {
            const s = S.sel[l.i], dead = l.leftQty <= 0 || l.locked;
            return h('div.m2-rline' + (dead ? '.is-off' : ''), {}, dead ? h('span.m2-check-ph') : h('label.mini-check', {}, h('input', { type: 'checkbox', checked: s.on, 'aria-label': '选择 ' + l.it.name, on: { change: (e) => { s.on = e.target.checked; S.err.lines = ''; paintLines(); paintTrial(); paintBar(); } } })), h('img', { src: l.it.img, alt: '', loading: 'lazy' }),
              h('div.grow', {}, h('b.m2-name', { text: l.it.name }), h('p.muted', { text: (l.it.spec || '默认规格') + ' · 买了 ' + l.it.qty + ' 件' }), dead ? h('span.mini-tag', { text: l.locked ? '申请中' : '已退完' }) : h('p.muted', { text: l.usedQty ? '已退 ' + l.usedQty + ' 件，还可退 ' + l.leftQty + ' 件' : '最多可退 ' + l.leftQty + ' 件 · ' + money(l.leftAmt) })),
              !dead ? h('div.m2-rright', {}, h('b.num', { text: money(M2.lineAmt(l, s.qty)) }), l.leftQty > 1 ? h('div.mini-steps', {}, h('button', { type: 'button', 'aria-label': '减少退款件数：' + l.it.name, disabled: s.qty <= 1, on: { click: () => { s.qty--; s.on = true; paintLines(); paintTrial(); paintBar(); } } }, h('span', {}, UI.icon('minus'))), h('output.num', { text: String(s.qty), 'aria-label': '退款件数' }), h('button.plus', { type: 'button', 'aria-label': '增加退款件数：' + l.it.name, disabled: s.qty >= l.leftQty, on: { click: () => { s.qty++; s.on = true; paintLines(); paintTrial(); paintBar(); } } }, h('span', {}, UI.icon('plus')))) : null) : null);
          })), S.err.lines ? h('div.err', { role: 'alert', text: S.err.lines }) : null);
      };
      const paintTrial = () => {
        const P = picks(), raw = P.reduce((s, x) => s + x.l.it.price * x.k, 0), amt = amount(), ch = M2.channelOf(o, amt), cut = raw - amt;
        if (!P.length) { fill(trialBox, sec('可退金额试算'), h('p.muted', { text: '请先在上面选择要退的商品，这里会算出能退多少钱。' })); return; }
        fill(trialBox, sec('可退金额试算', h('span.muted', { text: P.reduce((s, x) => s + x.k, 0) + ' 件' })), kv('所选商品原价', money(raw)), cut > 0 ? kv('已分摊的优惠', '-' + money(cut), 'minus') : null, kv('可退金额', h('b.num.m2-total', { text: money(amt) }), 'sum'),
          h('details.m2-how', {}, h('summary', { text: '怎么算的' }), h('div', {}, P.map((x) => h('p.muted', { text: x.l.it.name + ' ×' + x.k + '：原价 ' + money(x.l.it.price * x.k) + (x.l.it.price * x.k > x.amt ? '，分摊优惠 -' + money(x.l.it.price * x.k - x.amt) : '') + '，可退 ' + money(x.amt) })), h('p.muted', { text: '订单用的优惠券、活动减免和储值赠送金，按各商品实付金额的比例分摊，退款只退你实际付出的钱。' }))),
          h('div.m2-chan', {}, UI.icon('wallet', 'icon--sm'), h('span', { text: '退回路径：' + [ch.balance ? '储值余额 ' + money(ch.balance) + '（即时回钱包）' : '', ch.wechat ? '微信支付 ' + money(ch.wechat) + '（原路退回，1–3 个工作日）' : ''].filter(Boolean).join('；') })));
      };
      const paintWhy = () => {
        const ta = h('textarea.textarea', { rows: 3, maxlength: 200, placeholder: '补充说明（选填，不超过 200 字）', 'aria-label': '补充说明', text: S.desc }), cnt = h('span.muted.num', { text: S.desc.length + '/200' });
        ta.addEventListener('input', () => { S.desc = ta.value; cnt.textContent = ta.value.length + '/200'; });
        const other = S.why === '其他' ? h('textarea.textarea', { rows: 2, maxlength: 100, placeholder: '请写明具体原因（必填）', 'aria-label': '其他原因', text: S.other, on: { input: (e) => { S.other = e.target.value; if (S.err.why) { S.err.why = ''; } } } }) : null;
        fill(whyBox, sec('退款原因'), h('div.mini-chips', { role: 'radiogroup', 'aria-label': '退款原因' }, WHY.map((w) => h('button.mini-chip', { type: 'button', role: 'radio', 'aria-checked': String(S.why === w), on: { click: () => { S.why = w; S.err.why = ''; S.err.proof = ''; paintWhy(); paintProof(); } } }, h('span', { text: w })))), other, h('div.row.between', {}, h('span.muted', { text: '补充说明' }), cnt), ta, S.err.why ? h('div.err', { role: 'alert', text: S.err.why }) : null);
      };
      const paintProof = () => {
        const need = S.why === '菜品有问题';
        fill(proofBox, sec('凭证图片', h('span.muted.num', { text: S.proofs.length + '/3' })), h('p.muted', { text: need ? '“菜品有问题”需要至少 1 张照片，方便门店核实。' : '选填，最多 3 张，有照片处理更快。' }),
          h('div.m2-proofgrid', {}, S.proofs.map((k, i) => h('div.m2-proof', {}, h('img', { src: window.IMG[k], alt: '凭证图片 ' + (i + 1) }), h('button.m2-proof-x', { type: 'button', 'aria-label': '删除图片 ' + (i + 1), on: { click: () => { S.proofs.splice(i, 1); paintProof(); } } }, UI.icon('x', 'icon--sm')))),
            S.proofs.length < 3 ? h('button.m2-addimg', { type: 'button', 'aria-label': '添加图片', on: { click: async () => { const r = await M2.pickImage(3, S.proofs); if (r) { S.proofs = r; S.err.proof = ''; paintProof(); } } } }, UI.icon('camera'), h('span', { text: '添加图片' })) : null), S.err.proof ? h('div.err', { role: 'alert', text: S.err.proof }) : null);
      };
      const paintWay = () => fill(wayBox, sec('期望处理方式'), h('div.m2-opts', { role: 'radiogroup', 'aria-label': '处理方式' }, h('label.m2-opt', {}, h('input.m2-radio', { type: 'radio', name: 'm2way', checked: true }), UI.icon('wallet'), h('span.grow', {}, h('b', { text: '仅退款' }), h('span.muted', { text: '审核通过后，款项原路退回' }))), h('label.m2-opt.is-off', {}, h('input.m2-radio', { type: 'radio', name: 'm2way', disabled: true }), UI.icon('undo'), h('span.grow', {}, h('b', { text: '退货退款' }), h('span.m2-short', { text: '餐品不支持退货' })))));
      const paintBar = () => { const a = amount(); total.textContent = money(a); sub.textContent = picks().length ? '共 ' + picks().reduce((s, x) => s + x.k, 0) + ' 件 · 仅退款' : '请先选择商品'; go.disabled = S.busy; fill(go, S.busy ? h('span.spin') : null, S.busy ? ' 提交中' : '提交申请'); errBox.hidden = !S.err.submit; fill(errBox, S.err.submit ? [UI.icon('warn', 'icon--sm'), h('span.grow', { text: S.err.submit }), S.err.retry ? h('button.btn.btn--sm', { type: 'button', text: S.err.retry, on: { click: () => { S.err.submit = ''; S.err.retry = ''; ctx.refresh(); } } }) : null] : []); };
      async function submit() {
        if (S.busy) return;
        const P = picks(); S.err = {}; let firstEl = null;
        if (!P.length) { S.err.lines = '请至少选择一件要退的商品'; firstEl = linesBox; }
        if (!S.why) { S.err.why = '请选择退款原因'; firstEl = firstEl || whyBox; } else if (S.why === '其他' && S.other.trim().length < 2) { S.err.why = '选了“其他”，请写下具体原因（至少 2 个字）'; firstEl = firstEl || whyBox; }
        if (S.why === '菜品有问题' && !S.proofs.length) { S.err.proof = '“菜品有问题”需要至少 1 张照片'; firstEl = firstEl || proofBox; }
        if (firstEl) { paintLines(); paintWhy(); paintProof(); paintBar(); scrollTo(firstEl); return; }
        S.busy = true; paintBar();
        try { await UI.request(null, 600); } catch (e) { S.busy = false; S.err.submit = '网络不太稳定，申请没有提交。请检查网络后再点一次，不会重复提交'; paintBar(); return; }
        /* 服务端校验：额度、并发、期限（演示场景可触发） */
        const cur = M2.lines(o), over = P.some((x) => x.k > cur[x.l.i].leftQty || cur[x.l.i].locked);
        if (sc === 'exceed') { S.busy = false; S.err.submit = '退款金额超过这笔订单的可退上限（最多 ' + money(cur.reduce((s, l) => s + (l.locked ? 0 : l.leftAmt), 0) - 100) + '），请调整后再提交'; paintBar(); return; }
        if (sc === 'conflict' || over) { S.busy = false; S.err.submit = '刚刚有另一笔申请占用了其中的商品，请刷新后重新选择'; S.err.retry = '刷新'; paintBar(); return; }
        const why = S.why === '其他' ? '其他：' + S.other.trim() : S.why, r = M2.makeRefund(o, { lines: P.map((x) => ({ i: x.l.i, qty: x.k })), reason: why, desc: S.desc.trim(), proofs: S.proofs.slice(), auto: true });
        Mini.toast('申请已提交，等待门店审核'); ctx.replace('refund-apply', { id: o.no, rid: r.id });
      }
      paintOrder(); paintLines(); paintTrial(); paintWhy(); paintProof(); paintWay(); paintBar();
      return wrap;
    },
  };

  /* =====================================================================================
     评价 review（?id=订单号）：整单评分、每个商品点赞或点踩、标签、文字、匿名、图片
     ===================================================================================== */
  const TAGS = [['口味', ['味道很好', '偏咸', '偏淡', '偏油']], ['分量', ['分量足', '分量偏少']], ['包装', ['包装严实', '有洒漏']], ['速度', ['出餐很快', '等了太久']]];
  const RATE = ['', '很不满意', '不太满意', '一般', '满意', '非常满意'];
  const starRow = (n, on) => h('div.m2-stars', { role: 'radiogroup', 'aria-label': '整单评分' }, [1, 2, 3, 4, 5].map((i) => h('button.m2-star' + (i <= n ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(i === n), 'aria-label': i + ' 星，' + RATE[i], disabled: !on, on: on ? { click: () => on(i) } : {} }, UI.icon('star'))));
  const rvPick = (sc) => {
    const L = M2.mine(), done = (o) => M2.kind(o) === 'done';
    if (sc === 'reviewed') return L.find((o) => done(o) && o.reviewed);
    if (sc === 'not-done') return L.find((o) => ['unpaid', 'making', 'ready'].includes(M2.kind(o)));
    if (sc === 'expired') return L.find((o) => done(o) && !o.reviewed && M2.now() > new Date(M2.parse(doneAt(o)).getTime() + 15 * 864e5));
    return L.find((o) => done(o) && !o.reviewed && M2.now() <= new Date(M2.parse(doneAt(o)).getTime() + 15 * 864e5));
  };
  window.PAGES_MINI.review = {
    title: '评价', tab: null, from: 'orders', auth: true, bar: true, nav: { title: '评价' },
    layout: '主次布局', reason: '评价的主角只有一个：整单打几颗星；每个商品的点赞点踩、标签、文字、图片都是依次往下的次要信息，越往下越可选；星数一选，标签和占位文案就跟着变，提交一步完成',
    scenes: [{ id: 'reviewed', label: '已评价：只读展示' }, { id: 'not-done', label: '订单未完成：不能评价' }, { id: 'expired', label: '超过 15 天：评价通道已关闭' }, { id: 'submit-fail', label: '提交被拒：内容未通过审核' }],
    skeleton: () => M2.skel([84, 132, 'rows', 132]),
    render(ctx) {
      const o = ctx.params.id ? M2.byNo(ctx.params.id) : rvPick(ctx.scene);
      if (!o) return h('section.mini-page', {}, Mini.empty('没有可以评价的订单', { label: '回到订单', on: () => ctx.back() }, { sub: '已完成的订单才能评价' }));
      const k = M2.kind(o), page = h('section.mini-page.m2-review'), wrap = h('div.m2-wrap', {}, page), pids = [...new Set(o.items.map((i) => i.pid))], first = {};
      o.items.forEach((i) => { if (!first[i.pid]) first[i.pid] = i; });
      const brief = h('div.mini-card.m2-card', {}, h('div.m2-brief-top', {}, M2.thumbs(o, 4), h('div.grow', {}, h('b', { text: M2.store(o.storeId).name }), h('p.muted', { text: M2.when(M2.times(o).done || o.createdAt) + ' 取餐 · 共 ' + M2.count(o) + ' 件' }))));
      /* 只读：已评价 */
      if (o.reviewed && o.review) {
        const v = o.review;
        fill(page, brief, h('div.mini-card.m2-card.m2-rvmain', {}, h('div.mini-sec', {}, h('h2', { text: '我的评价' }), h('span.mini-tag.mini-tag--ok', { text: '已评价' })), starRow(v.rating, null), h('p.m2-rate', { text: RATE[v.rating] + (v.anon ? ' · 匿名' : '') }),
          h('div.m2-likes', {}, pids.map((pid) => { const it = first[pid], lk = (v.likes || {})[pid]; return h('div.m2-like-row', {}, h('img', { src: it.img, alt: '', loading: 'lazy' }), h('span.grow', { text: it.name }), lk === true ? h('span.mini-tag.mini-tag--ok', {}, UI.icon('thumbup', 'icon--sm'), ' 点赞') : lk === false ? h('span.mini-tag', {}, UI.icon('thumbdown', 'icon--sm'), ' 点踩') : h('span.muted', { text: '未评价' })); })),
          v.tags && v.tags.length ? h('div.mini-chips', {}, v.tags.map((t) => h('span.mini-tag.mini-tag--brand', { text: t }))) : null, h('p', { text: v.text || '（没有文字评价）' }), v.imgs && v.imgs.length ? h('div.m2-proofs', {}, v.imgs.map((x) => h('img', { src: window.IMG[x], alt: '评价图片' }))) : null, h('p.muted', { text: M2.when(v.at) + ' 提交，评价提交后不能修改' })),
          h('div.m2-acts', {}, h('button.btn.btn--primary.btn--block', { type: 'button', text: '返回订单', on: { click: () => ctx.back() } })));
        return page;
      }
      if (k !== 'done') return h('section.mini-page', {}, Mini.empty('订单完成后才能评价', { label: '返回', kind: 'tint', on: () => ctx.back() }, { sub: k === 'refunded' || k === 'cancelled' || k === 'closed' ? '这笔订单已关闭或已退款。' : '取餐后就可以来评价了。' }));
      if (ctx.scene === 'expired' || M2.now() > new Date(M2.parse(doneAt(o)).getTime() + 15 * 864e5)) return h('section.mini-page', {}, Mini.empty('评价通道已关闭', { label: '返回订单', kind: 'tint', on: () => ctx.back() }, { sub: '订单完成后 15 天内可以评价，这笔订单已超过期限。' }));
      /* 表单 */
      const S = (ctx._rv = ctx._rv || { rating: 0, likes: {}, tags: [], text: '', anon: false, imgs: [], busy: false, err: '' });
      const rateBox = h('div.mini-card.m2-card.m2-rvmain'), likeBox = h('div.mini-card.m2-card'), tagBox = h('div.mini-card.m2-card'), textBox = h('div.mini-card.m2-card'), imgBox = h('div.mini-card.m2-card');
      const errBox = h('div.m2-err', { role: 'alert', hidden: true }), go = h('button.btn.btn--primary.btn--block', { type: 'button', on: { click: () => submit() } }), bar = h('div.m2-bar.m2-bar--col', {}, errBox, go);
      page.append(brief, rateBox, likeBox, tagBox, textBox, imgBox); wrap.append(bar);
      const paintRate = () => fill(rateBox, sec('整单评分'), starRow(S.rating, (i) => { S.rating = i; S.err = ''; paintRate(); paintTags(); paintText(); }), h('p.m2-rate' + (S.rating ? '' : '.muted'), { text: S.rating ? RATE[S.rating] : '点星星打分' }));
      const paintLike = () => fill(likeBox, sec('每个商品怎么样（选填）'), h('div.m2-likes', {}, pids.map((pid) => { const it = first[pid], v = S.likes[pid]; const t = (val) => h('button.m2-likebtn' + (v === val ? '.on' : ''), { type: 'button', 'aria-pressed': String(v === val), 'aria-label': (val ? '点赞：' : '点踩：') + it.name, on: { click: () => { if (S.likes[pid] === val) delete S.likes[pid]; else S.likes[pid] = val; paintLike(); } } }, UI.icon(val ? 'thumbup' : 'thumbdown', 'icon--sm'), val ? '好吃' : '一般'); return h('div.m2-like-row', {}, h('img', { src: it.img, alt: '', loading: 'lazy' }), h('div.grow', {}, h('b.m2-name', { text: it.name }), h('p.muted', { text: it.spec || '默认规格' })), t(true), t(false)); })));
      const paintTags = () => fill(tagBox, sec('选几个标签（选填）'), TAGS.map(([g, list]) => h('div.m2-taggrp', {}, h('span.m2-label', { text: g }), h('div.mini-chips', {}, (S.rating && S.rating <= 3 ? list.slice().reverse() : list).map((t) => h('button.mini-chip', { type: 'button', 'aria-pressed': String(S.tags.includes(t)), on: { click: () => { S.tags = S.tags.includes(t) ? S.tags.filter((x) => x !== t) : S.tags.concat(t); S.err = ''; paintTags(); } } }, h('span', { text: t })))))));
      const paintText = () => {
        const ta = h('textarea.textarea', { rows: 4, maxlength: 200, placeholder: S.rating && S.rating <= 2 ? '哪里不满意？写下来，门店会认真看（至少说一句）' : '说说这顿饭的味道、分量、出餐速度（选填，最多 200 字）', 'aria-label': '评价内容', text: S.text }), cnt = h('span.muted.num', { text: S.text.length + '/200' });
        ta.addEventListener('input', () => { S.text = ta.value; cnt.textContent = ta.value.length + '/200'; cnt.classList.toggle('m2-warnnum', ta.value.length >= 190); });
        fill(textBox, sec('文字评价', cnt), ta, h('label.m2-switch', {}, h('span.grow', {}, h('b', { text: '匿名评价' }), h('span.muted', { text: S.anon ? '将显示为“匿名用户”' : '将显示为 ' + B.db.me.name.slice(0, 1) + '**' })), h('input.switch', { type: 'checkbox', role: 'switch', checked: S.anon, on: { change: (e) => { S.anon = e.target.checked; paintText(); } } })));
      };
      const paintImgs = () => fill(imgBox, sec('晒图（选填）', h('span.muted.num', { text: S.imgs.length + '/3' })), h('div.m2-proofgrid', {}, S.imgs.map((x, i) => h('div.m2-proof', {}, h('img', { src: window.IMG[x], alt: '评价图片 ' + (i + 1) }), h('button.m2-proof-x', { type: 'button', 'aria-label': '删除图片 ' + (i + 1), on: { click: () => { S.imgs.splice(i, 1); paintImgs(); } } }, UI.icon('x', 'icon--sm')))), S.imgs.length < 3 ? h('button.m2-addimg', { type: 'button', 'aria-label': '添加图片', on: { click: async () => { const r = await M2.pickImage(3, S.imgs); if (r) { S.imgs = r; paintImgs(); } } } }, UI.icon('camera'), h('span', { text: '添加图片' })) : null));
      const paintBar = () => { go.disabled = S.busy; fill(go, S.busy ? h('span.spin') : null, S.busy ? ' 提交中' : '提交评价'); errBox.hidden = !S.err; fill(errBox, S.err ? [UI.icon('warn', 'icon--sm'), h('span.grow', { text: S.err })] : []); };
      async function submit() {
        if (S.busy) return;
        if (!S.rating) { S.err = '请先给整单打个分'; paintBar(); scrollTo(rateBox); return; }
        if (S.rating <= 2 && !S.text.trim() && !S.tags.length) { S.err = '打了低分，请选一个标签或写一句原因，帮门店改进'; paintBar(); scrollTo(textBox); return; }
        S.err = ''; S.busy = true; paintBar();
        try { await UI.request(null, 600); } catch (e) { S.busy = false; S.err = '网络不太稳定，评价没有提交。你写的内容还在，检查网络后再点一次'; paintBar(); return; }
        if (ctx.scene === 'submit-fail') { S.busy = false; S.err = '评价没有通过审核：内容包含不适宜的文字，请修改后再提交'; paintBar(); scrollTo(textBox); return; }
        M2.addReview(o, { rating: S.rating, likes: Object.assign({}, S.likes), tags: S.tags.slice(), text: S.text.trim(), anon: S.anon, imgs: S.imgs.slice() });
        Mini.toast('评价已提交，感谢你的反馈'); ctx.back();
      }
      paintRate(); paintLike(); paintTags(); paintText(); paintImgs(); paintBar();
      return wrap;
    },
  };
})();
