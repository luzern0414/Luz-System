/* 第二批页面（三）：会员资产、消息与我的。本文件：数据补充、共用小工具 Mini.p3、“我的”（me）、“个人资料”（profile）。
   后面的文件：mini.p3b.js（购卡 cards、我的会员卡 my-cards、会员卡详情 card-detail）、mini.p3c.js（储值 wallet、优惠券 coupons）、
   mini.p3d.js（消息 notices、设置 settings、协议阅读 legal、注销账号 cancel-account、意见反馈 feedback）。
   页面参数约定（给其他页面的同事）：
     orders      Mini.push('orders', {seg})，seg：all | unpaid | pickup | done | refund（“我的”里的订单快捷入口用它）
     coupons     {tab:'mine'|'center', seg:'usable'|'used'|'expired'}      my-cards {seg:'active'|'pending'|'expired', flash:卡id}      card-detail {id}
     legal       {doc:'agreement'|'privacy'}（协议阅读页；登录页可用 Mini.p3.openLegal(ctx, doc) 打开）
   B.db 补充：me 增加 gender、birthday、avatarIdx、phoneBound、giftBalance（赠送金，已含在 balance 里）、frozen（退款冻结中的金额）；
   cardTypes、cards、cardLogs、walletLogs、coupons、myCoupons、notices 补字段并给“我”准备一批演示记录；另有 prepaid、subs、legal、feedbacks、bookings、settings、redeemCodes、deletion。
   Mini.wallet.spend(分, 业务单号) / Mini.wallet.back(分, 业务单号)：结算页扣款与退款回冲可以直接用，按本金与赠送金比例拆分并记流水。 */
(function () {
  'use strict';
  const { h } = UI;
  const K = window.K;
  const M3 = (Mini.p3 = {});

  /* ---------- 图标：本批需要的几个线性图标 ---------- */
  Object.assign(UI.icons, {
    swap: 'M7 8h13M16 4l4 4-4 4M17 16H4M8 12l-4 4 4 4',
    snow: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    chat: 'M4 5h16v11H10l-4 4v-4H4zM8 9h8M8 12h5',
    headset: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H4zM17 14h3v5h-3zM17 19c0 1.5-2 2-5 2',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    ticket: UI.icons.ticket || 'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5V14a2 2 0 0 0 0-4zM14 7v10',
  });

  /* ---------- 日期与金额小工具 ---------- */
  const today = () => K.ymd(B.NOW());
  const byAt = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);   // 按时间倒序，同一时间保持原顺序
  const addD = (s, n) => K.ymd(K.addDays(new Date(s + 'T00:00:00'), n));
  const diff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  Object.assign(M3, { today, addD, diff, md: (s) => (s ? s.slice(5, 10) : ''), mdhm: (s) => (s ? s.slice(5, 16) : '') });
  M3.yuan = (c) => Mini.money(c);
  M3.me = () => B.db.me;
  M3.unread = () => B.db.notices.filter((n) => !n.read && !n.deleted).length;

  /* ---------- 演示数据补充：B.reset 之后自动重做 ---------- */
  const seed3 = (db) => {
    const me = db.me, t = today(), D = (n) => addD(t, n), at = (n, hm) => D(n) + ' ' + hm, T = (id) => db.cardTypes.find((x) => x.id === id);
    Object.assign(me, { gender: '', birthday: '', avatarIdx: null, avatarPending: false, phoneBound: true, giftBalance: 0, frozen: 0, memberNo: String(80000000 + me.id * 137) });
    db.prepaid = { cardCap: 100000, totalCap: 300000, stopped: false, minTopup: 1000, maxTopup: 200000 };

    /* 卡种：划线价、限购、适用范围、冻结与转让规则、补办费、退卡手续费 */
    const X = {
      1: { orig: 24800, limit: 3, scope: '全部门店', hours: '全天可用，每天限用 1 次', freeze: { min: 3, max: 15, total: 15, times: 2 }, transfer: { fee: 500, cool: 30, times: 1 } },
      2: { orig: 18000, limit: 2, scope: '全部门店', hours: '营业时间内可用，每次用 1 次', freeze: { min: 3, max: 30, total: 30, times: 1 }, transfer: { fee: 0, cool: 30, times: 1 } },
      3: { orig: 12800, limit: 1, scope: '示例门店与万象店', hours: '每天 11:00–13:30 可用', freeze: null, transfer: null },
      4: { orig: 62800, limit: 1, scope: '全部门店', hours: '全天可用，每天限用 1 次', freeze: { min: 3, max: 30, total: 30, times: 2 }, transfer: { fee: 500, cool: 30, times: 1 } },
    };
    db.cardTypes.forEach((ty) => Object.assign(ty, { reissue: 1000, refundFee: 10 }, X[ty.id] || {}));

    /* 我的会员卡：使用中三张、未生效一张、已过期两张（含一张已用完）；扣次记录与卡上的已用次数对得上 */
    const mine = new Set(db.cards.filter((c) => c.userId === me.id).map((c) => c.no));
    db.cards = db.cards.filter((c) => c.userId !== me.id);
    db.cardLogs = db.cardLogs.filter((l) => !mine.has(l.cardNo));
    let cid = 100, lid = db.cardLogs.reduce((m, l) => Math.max(m, l.id), 0);
    const mk = (typeId, bought, start, o) => {
      const ty = T(typeId); cid++;
      return Object.assign({ id: cid, no: 'C' + (20260000 + cid * 53), userId: me.id, userName: me.name, typeId, typeName: ty.name, kind: ty.kind, bought: D(bought), start: D(start), expire: D(start + ty.days), total: ty.times ? ty.times + ty.gift : 0, used: 0, status: 'ACTIVE', frozenDays: 0, slot: ty.slot || '', price: ty.price, freezeDays: 0, freezeCount: 0 }, o);
    };
    const mineCards = [mk(1, -12, -12, { used: 9 }), mk(2, -20, -20, { used: 4 }), mk(3, -10, -10, { used: 5 }), mk(1, -1, 3), mk(2, -110, -110, { used: 8, status: 'EXPIRED' }), mk(2, -50, -50, { used: 11 })];
    mineCards.forEach((c) => {
      const ty = T(c.typeId), n = c.used + (c.id === 102 ? 1 : 0), sn = (k) => db.stores[k % db.stores.length].name;
      for (let k = n - 1; k >= 0; k--) {
        const when = D(-(k * (ty.times ? 3 : 1) + 1)) + ' ' + (ty.slot ? '12:' : '18:') + K.pad(10 + (k * 7) % 40);
        db.cardLogs.push({ id: ++lid, cardNo: c.no, userName: me.name, at: when, action: '核销扣次', operator: '前台', store: sn(k), note: '', delta: -1 });
      }
      if (c.id === 102) db.cardLogs.push({ id: ++lid, cardNo: c.no, userName: me.name, at: D(-2) + ' 12:45', action: '冲正', operator: '前台', store: sn(1), note: '出餐失败，次数已退回', delta: 1 });
    });
    db.cards.push(...mineCards);
    db.cardRefunds = [];

    /* 储值流水：本金与赠送金分开记，消费按比例拆分（向下取整），最后一笔余额与 me.balance 一致 */
    db.walletLogs = db.walletLogs.filter((l) => l.userId !== me.id);
    let p = 0, g = 0, wid = db.walletLogs.reduce((m, l) => Math.max(m, l.id), 0);
    [[58, '充值', 10000, '充值单 900103', '09:12'], [58, '赠送', 1000, '充值赠送 900103', '09:12'], [52, '消费', 2200, '订单 100391', '12:05'], [46, '消费', 1800, '订单 100402', '11:48'], [40, '消费', 3600, '订单 100433', '18:20'],
      [33, '充值', 15000, '充值单 900188', '10:02'], [33, '赠送', 2000, '充值赠送 900188', '10:02'], [27, '消费', 2200, '订单 100486', '12:15'], [21, '消费', 1800, '订单 100517', '08:40'], [17, '退款', 2050, '订单 100517 部分退款', '15:30'],
      [12, '消费', 3600, '订单 100563', '12:30'], [8, '消费', 2200, '订单 100601', '11:55'], [5, '消费', 1800, '订单 100622', '08:25'], [2, '消费', 2200, '订单 100648', '12:10']].forEach(([days, kind, a, ref, hm]) => {
      let dp = a, dg = 0;
      if (kind === '消费') { const gg = Math.floor((a * g) / Math.max(1, p + g)); dg = -gg; dp = -(a - gg); } else if (kind === '赠送') { dp = 0; dg = a; }
      p += dp; g += dg;
      db.walletLogs.push({ id: ++wid, userId: me.id, userName: me.name, kind, amount: dp + dg, principal: dp, gift: dg, balance: p + g, at: D(-days) + ' ' + hm, ref });
    });
    db.walletLogs.sort(byAt);
    me.balance = p + g; me.giftBalance = g;
    db.walletPlans.forEach((pl, i) => { pl.tag = i === 2 ? '最划算' : ''; });
    db.walletRefunds = [];

    /* 优惠券：模板补五个（可领、未到时间、已抢光各一类），我的券补字段，兑换码 */
    db.coupons.push(
      { id: 5, name: '新人礼 满 20 减 5', kind: '满减', threshold: 2000, value: 500, scope: '全部商品', days: 1, stock: 2000, claimed: 1204, used: 612, perUser: 1, status: 'ON' },
      { id: 6, name: '周末满 60 减 15', kind: '满减', threshold: 6000, value: 1500, scope: '全部商品', days: 3, stock: 500, claimed: 0, used: 0, perUser: 1, status: 'ON', startAt: D(2) },
      { id: 7, name: '午市满 40 减 6', kind: '满减', threshold: 4000, value: 600, scope: '主食', days: 7, stock: 200, claimed: 200, used: 144, perUser: 1, status: 'ON' },
      { id: 8, name: '早餐 8.5 折（封顶 8 元）', kind: '折扣', threshold: 0, value: 85, cap: 800, scope: '早餐类商品', days: 5, stock: 300, claimed: 87, used: 20, perUser: 1, status: 'ON' },
      { id: 9, name: '满 35 减 4', kind: '满减', threshold: 3500, value: 400, scope: '全部商品', days: 7, stock: 800, claimed: 344, used: 120, perUser: 2, status: 'ON', daily: 1 });
    db.myCoupons.push({ id: 5, couponId: 5, name: '新人礼 满 20 减 5', kind: '满减', threshold: 2000, value: 500, expire: D(0), state: 'UNUSED' });
    const doneOrder = db.orders.find((o) => o.userId === me.id && o.status === 'DONE');
    db.myCoupons.forEach((c) => { const tp = db.coupons.find((x) => x.id === c.couponId) || {}; c.scope = tp.scope || '全部商品'; c.got = D(Math.min(-1, -(tp.days || 7) + diff(t, c.expire))); if (c.state === 'USED') { c.usedAt = D(-9) + ' 12:10'; c.orderNo = doneOrder ? doneOrder.no : ''; } });
    db.redeemCodes = { WELCOME5: { couponId: 9, st: 'ok' }, BREAKFAST: { couponId: 8, st: 'ok' }, USED2026: { couponId: 1, st: 'used' }, OLD2025: { couponId: 2, st: 'expired' } };

    /* 消息：补活动、系统类，并写明点开后去哪里 */
    const jump = { 1: { page: 'orders', params: { seg: 'pickup' } }, 2: { page: 'coupons' }, 3: { page: 'my-cards' }, 5: { page: 'orders', params: { seg: 'refund' } } };
    db.notices.forEach((n) => { n.jump = jump[n.id] || null; });
    [[6, '活动', '新人礼券已到账', '一张“满 20 减 5”的新人券已放入“我的优惠券”，今天内有效，下单时自动抵扣。', at(0, '08:05'), false, { page: 'coupons' }],
      [7, '活动', '周末满 60 减 15 后天开抢', '周末满 60 减 15 将在后天 00:00 开放领取，每人限领 1 张，先到先得。', at(-1, '18:30'), false, { page: 'coupons', params: { tab: 'center' } }],
      [8, '订单', '订单已完成', '您的订单已完成，欢迎再次光临。评价订单可以帮助我们做得更好。', at(-1, '13:02'), true, { page: 'orders', params: { seg: 'done' } }],
      [9, '系统', '隐私政策将于近期更新', '隐私政策已更新到 3.1 版，新增“个性化推荐”开关并说明订阅消息的数据用途，请阅读并确认。', at(-2, '10:00'), false, { page: 'legal', params: { doc: 'privacy' } }],
      [10, '会员卡', '十次卡剩余 7 次', '您的十次卡还剩 7 次，有效期至 ' + D(70).slice(5) + '，可在任意门店使用。', at(-4, '12:05'), true, { page: 'my-cards' }],
      [11, '活动', '储值充 100 送 10', '储值满 100 元赠 10 元，赠送金与本金同样可以抵扣订单，限时进行中。', at(-6, '09:00'), true, { page: 'wallet' }],
      [12, '订单', '订单待支付提醒', '您有一笔订单还没有支付，请在 30 分钟内完成支付，超时将自动取消。', at(-7, '11:40'), true, { page: 'orders', params: { seg: 'unpaid' } }],
      [13, '系统', '账号安全提醒', '您的账号刚在新设备上登录。如非本人操作，请尽快联系客服。', at(-9, '20:15'), true, null],
      [14, '活动', '生日月福利预告', '补全个人资料里的生日，生日当月可享专属权益。', at(-12, '10:30'), true, { page: 'profile' }],
      [15, '订单', '退款申请已受理', '您的退款申请已受理，审核通过后将原路退回，请留意到账通知。', at(-14, '16:45'), true, { page: 'orders', params: { seg: 'refund' } }]].forEach(([id, kind, title, body, when, read, jp]) => db.notices.push({ id, kind, title, body, at: when, read, jump: jp }));
    db.notices.sort(byAt);
    db.subs = [{ id: 1, name: '订单支付成功', desc: '付款后通知取餐号', left: 3 }, { id: 2, name: '订单完成', desc: '出餐后提醒取餐', left: 1 }, { id: 3, name: '退款到账', desc: '退款原路退回后通知', left: 0 }, { id: 4, name: '会员卡到期', desc: '到期前 7、3、1 天提醒', left: 0 }];

    /* 协议与专项同意 */
    const pg = db.config.pages.find((x) => x.key === 'privacy'); if (pg) pg.updated = '2026-10-20';
    db.legal = {
      docs: { agreement: { name: '用户协议', version: '2.3', updated: '2026-08-01' }, privacy: { name: '隐私政策', version: '3.1', updated: '2026-10-20', changes: ['新增“个性化推荐”开关，可随时关闭', '说明订阅消息的数据用途', '补充账号注销后交易记录的保留方式'] } },
      consents: { agreement: { version: '2.3', at: '2026-08-02 10:15', channel: '微信小程序' }, privacy: { version: '3.0', at: '2026-08-02 10:15', channel: '微信小程序' } },
      special: [
        { key: 'prepaid', name: '预付卡与储值条款', desc: '购买会员卡、储值充值时使用', on: true, at: '2026-09-12 12:20', effect: '撤回后不能再购买会员卡和储值充值；已有的卡和余额仍可使用，退款按条款办理。' },
        { key: 'personal', name: '个性化推荐', desc: '根据点单偏好推荐菜品和优惠', on: true, at: '2026-08-02 10:15', effect: '撤回后首页和菜单不再按你的偏好推荐，只展示通用内容。' },
        { key: 'location', name: '位置信息', desc: '计算你与门店的距离', on: true, at: '2026-08-02 10:16', effect: '撤回后不再显示距离，需要自己选择门店。' },
      ],
    };

    db.feedbacks = [
      { id: 3, type: '建议', text: '希望菜单里能按口味筛选，比如不吃辣的一眼就能看到。', imgs: 0, contact: '', at: at(-1, '20:12'), status: 'PENDING' },
      { id: 2, type: '问题', text: '昨天中午用月卡点单时提示“今天已使用”，但我当天只用了一次。', imgs: 2, contact: '138****0000', at: at(-4, '12:40'), status: 'DOING', note: '客服已联系门店，正在核对当日核销记录。' },
      { id: 1, type: '投诉', text: '取餐时打包袋有破损，汤洒了一些。', imgs: 1, contact: '', at: at(-12, '13:05'), status: 'REPLIED', reply: '非常抱歉给你带来不好的体验。我们已向门店核实，并补发了一张满 30 减 3 的优惠券到你的账户；打包问题已同步给出餐团队改进。', replyAt: at(-11, '09:20') },
    ];
    db.bookings = [{ id: 1, name: '预约自取', at: D(1) + ' 12:00', store: db.stores[0].name, status: 'BOOKED' }];
    db.settings = { orderNotify: true, promoNotify: true, sysNotify: true, cacheKB: 24188 };
    db.deletion = null;
  };
  const baseReset = B.reset;
  B.reset = function () { const db = baseReset.call(B); seed3(db); return db; };
  seed3(B.db);

  /* ---------- 头像：个人资料里选的卡通动物（avatarIdx）优先于按会员号固定的那只 ---------- */
  const baseAvatar = Mini.avatar;
  Mini.avatar = (user, size) => baseAvatar(user && user.avatarIdx != null ? { id: user.avatarIdx } : user, size);

  /* ---------- 储值余额：总额 balance（含赠送金 giftBalance）；扣款按比例拆分，向下取整 ---------- */
  Mini.wallet = {
    balance: () => B.db.me.balance,
    gift: () => Math.min(B.db.me.giftBalance || 0, B.db.me.balance),
    principal() { return B.db.me.balance - this.gift(); },
    log(kind, principal, gift, ref) {
      const db = B.db, me = db.me; me.balance += principal + gift; me.giftBalance = Math.max(0, (me.giftBalance || 0) + gift);
      const row = { id: db.walletLogs.reduce((m, l) => Math.max(m, l.id), 0) + 1, userId: me.id, userName: me.name, kind, amount: principal + gift, principal, gift, balance: me.balance, at: B.fmt(B.NOW()), ref };
      db.walletLogs.unshift(row); return row;
    },
    spend(cents, ref) {
      const me = B.db.me; if (cents > me.balance) return { ok: false, reason: '余额不足' };
      const g = Math.floor((cents * this.gift()) / Math.max(1, me.balance)); this.log('消费', -(cents - g), -g, ref || ''); return { ok: true, principal: cents - g, gift: g };
    },
    back(cents, ref) { return this.log('退款', cents, 0, ref || ''); },
  };

  /* =====================================================================================
     共用小工具（p3b、p3c、p3d 也用）
     ===================================================================================== */
  /** 其他已打开的页面标为“需要重绘”，返回到它们时显示最新的券、卡、余额 */
  M3.touch = () => { const top = Mini.top(); Mini.frames().forEach((f) => { if (f !== top) f.stale = true; }); };
  /** 未登录：推登录页并返回 true */
  M3.needLogin = (ctx) => { if (Mini.auth.is()) return false; Mini.push('login', { redirect: 'back', from: ctx.id }); return true; };
  /** 一次“请求”：断网、弱网由 UI.request 模拟；成功后才执行 fn（业务拒绝可 throw Error(原因)）→ {ok, v} 或 {ok:false, reason, off} */
  M3.act = async (fn, ms) => {
    try { await UI.request(null, ms || 500); } catch (e) { const off = UI.state.net === 'off'; return { ok: false, off, reason: off ? '当前没有网络，请连上网络后再试' : '网络不太稳定，请稍后再试' }; }
    try { return { ok: true, v: fn ? fn() : undefined }; } catch (e) { return { ok: false, biz: true, reason: e.message }; }
  };
  /** 按钮转圈：执行期间禁用并显示转圈 */
  M3.busy = async (btn, fn) => {
    const old = Array.from(btn.childNodes); btn.disabled = true; btn.replaceChildren(h('span.spin'), ' ' + (btn.dataset.busy || '处理中'));
    try { return await fn(); } finally { btn.disabled = false; btn.replaceChildren(...old); }
  };
  /** 页内提示条：kind 为 warn、bad、ok、info；o.action = {label, on} */
  M3.alert = (text, o) => {
    o = o || {}; const kind = o.kind || 'warn';
    return h('div.m3-alert.m3-alert--' + kind, { role: kind === 'bad' ? 'alert' : 'status' }, UI.icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'warn', 'icon--sm'), h('span.grow', { text }),
      o.action ? h('button.btn.btn--sm', { type: 'button', text: o.action.label, on: { click: o.action.on } }) : null);
  };
  /** 表单项：标签、控件、提示、错误（setErr 写错误并标红） */
  M3.field = (label, control, o) => {
    o = o || {}; const tgt = o.input || control, err = h('p.err', { role: 'alert' }), id = tgt.id || 'm3f-' + Math.random().toString(36).slice(2, 7); if (!tgt.id) tgt.id = id;
    const w = h('div.field.m3-field', {}, h('label', { for: id, text: label }), control, o.hint ? h('p.hint', { text: o.hint }) : null, err);
    w.setErr = (t) => { err.textContent = t || ''; if (tgt.matches && tgt.matches('input,textarea,select')) tgt.setAttribute('aria-invalid', t ? 'true' : 'false'); };
    return w;
  };
  /** 标签页（带数量）：返回的节点有 set(id) */
  M3.tabs = (items, cur, on, label) => {
    const btns = items.map((it) => h('button', { type: 'button', role: 'tab', 'data-id': it.id, 'aria-selected': String(it.id === cur), tabindex: it.id === cur ? 0 : -1, on: { click: () => { el.set(it.id); on(it.id); } } }, it.label, it.n != null ? h('span.m3-n', { text: String(it.n) }) : null));
    const el = h('div.tabs.m3-tabs', { role: 'tablist', 'aria-label': label || '分类' }, btns);
    el.set = (id) => btns.forEach((b) => { const on2 = b.dataset.id === id; b.setAttribute('aria-selected', String(on2)); b.tabIndex = on2 ? 0 : -1; });
    el.count = (id, n) => { const b = btns.find((x) => x.dataset.id === id), s = b && b.querySelector('.m3-n'); if (s) s.textContent = String(n); };
    el.addEventListener('keydown', (e) => { const i = btns.findIndex((b) => b.getAttribute('aria-selected') === 'true'), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const b = btns[(i + d + btns.length) % btns.length]; b.click(); b.focus(); } });
    return el;
  };
  /** 分段控件（单选）：items [[value, label]] */
  M3.seg = (items, cur, on, label) => {
    const btns = items.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), on: { click: () => { btns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn(v)))); on(v); } } }, l));
    const btn = (v) => btns[items.findIndex((i) => i[0] === v)];
    return h('div.seg.m3-seg', { role: 'group', 'aria-label': label || '选择' }, btns);
  };
  /** 进度步骤条：steps 文案数组，cur 当前步（0 起），o.fail 失败在第几步，o.times 每步时间 */
  M3.stepper = (steps, cur, o) => {
    o = o || {};
    return h('ol.m3-steps', { 'aria-label': o.label || '办理进度' }, steps.map((s, i) => {
      const st = o.fail === i ? 'fail' : i < cur ? 'done' : i === cur ? 'now' : 'todo';
      return h('li.m3-step.is-' + st, { 'aria-current': st === 'now' ? 'step' : null }, h('i', {}, st === 'done' ? UI.icon('check', 'icon--sm') : st === 'fail' ? UI.icon('x', 'icon--sm') : null), h('b', { text: s }), o.times && o.times[i] ? h('span', { text: o.times[i] }) : null);
    }));
  };
  /** 折叠区：点标题展开收起，高度不做动画（只切 hidden） */
  M3.fold = (title, body, open) => {
    const panel = h('div.m3-fold-body', { hidden: !open }, body), btn = h('button.m3-fold-h', { type: 'button', 'aria-expanded': String(!!open), on: { click: () => { const o = panel.hidden; panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); } } }, h('span.grow', { text: title }), UI.icon('down', 'icon--sm'));
    return h('div.m3-fold', {}, btn, panel);
  };
  /** 大号金额：符号与小数小一号 */
  M3.big = (cents, cls) => { const y = Math.floor(Math.abs(cents) / 100), f = String(Math.abs(cents) % 100).padStart(2, '0'); return h('span.m3-big' + (cls ? '.' + cls : ''), {}, cents < 0 ? h('small', { text: '-' }) : null, h('small', { text: '¥' }), h('b', { text: y.toLocaleString('zh-CN') }), h('small', { text: '.' + f })); };
  /** 模拟微信支付：返回 Promise<{ok, kind:'cancel'|'fail'|'timeout'|'net', reason}>；页面场景 pay-cancel、pay-fail、pay-timeout 演示各种结果 */
  M3.pay = (ctx, o) => {
    let out = { ok: false, kind: 'cancel', reason: '你取消了支付' };
    const body = h('div.m3-pay', {}, h('p.muted.center', { text: o.merchant || B.shop.name }), h('div.m3-pay-amt', {}, M3.big(o.amount)), h('p.center', { text: o.subject }),
      h('div.mini-list', {}, h('div', {}, UI.icon('wechat', 'icon--sm'), h('span.grow', { text: '支付方式' }), h('span.muted', { text: '微信支付（零钱）' }))));
    return Mini.sheet({ title: '微信支付', body, actions: [{ label: '取消支付', value: 'x' }, { label: '确认支付 ' + M3.yuan(o.amount), kind: 'primary', value: 'paid', on: async () => {
      const r = await M3.act(null, 700);
      if (!r.ok) { out = { ok: false, kind: 'net', reason: r.reason }; return true; }
      if (ctx.scene === 'pay-cancel') { out = { ok: false, kind: 'cancel', reason: '你取消了支付' }; return true; }
      if (ctx.scene === 'pay-fail') { out = { ok: false, kind: 'fail', reason: '银行卡余额不足，请换一种支付方式' }; return true; }
      if (ctx.scene === 'pay-timeout') { await UI.sleep(1200); out = { ok: false, kind: 'timeout', reason: '支付结果确认超时，如已扣款会在 10 分钟内自动退回' }; return true; }
      out = { ok: true }; return true;
    } }] }).then(() => out);
  };
  /** 卡的状态：返回 {key, label, tone}；key：PENDING 未生效 / ACTIVE 使用中 / FROZEN 冻结中 / LOST 已挂失 / REFUNDING 退款中 / REFUNDED 已退卡 / EXPIRED 已过期 / USEDUP 已用完 */
  M3.cardState = (c) => {
    const t = today(), S = (key, label, tone) => ({ key, label, tone });
    if (c.status === 'REFUNDED') return S('REFUNDED', '已退卡', ''); if (c.status === 'REFUNDING') return S('REFUNDING', '退款中', 'warn'); if (c.status === 'LOST') return S('LOST', '已挂失', 'bad'); if (c.status === 'FROZEN') return S('FROZEN', '冻结中', 'info');
    if (c.start > t) return S('PENDING', '未生效', 'info'); if (c.expire < t || c.status === 'EXPIRED') return S('EXPIRED', '已过期', ''); if (c.total > 0 && c.used >= c.total) return S('USEDUP', '已用完', '');
    return S('ACTIVE', '使用中', 'ok');
  };
  M3.myCards = () => B.db.cards.filter((c) => c.userId === B.db.me.id);
  M3.usableCoupons = () => B.db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today());

  /* ---------- 金刚区：列数由入口数、最长文案字数、宽度推导（每格最小宽 = 取大值（56，字数 × 12 + 8）；末行均衡） ---------- */
  M3.gridCols = (n, maxChars, width) => { const cell = Math.max(56, maxChars * 12 + 8), most = Math.max(2, Math.floor(width / cell)), rows = Math.ceil(n / most); return { cols: Math.ceil(n / rows), rows, cell }; };

  /* =====================================================================================
     我的（一级标签页；横带分层）：头部与资料完整度 → 资产条（余额是主角）→ 订单状态快捷入口 → 常用功能宫格
     ===================================================================================== */
  const orderCounts = (sc) => {
    if (sc === 'busy') return { unpaid: 120, pickup: 6, done: 0, refund: 3 };
    if (sc === 'newbie') return { unpaid: 0, pickup: 0, done: 0, refund: 0 };
    const os = B.db.orders.filter((o) => o.userId === B.db.me.id), n = (f) => os.filter(f).length;
    return { unpaid: n((o) => o.status === 'UNPAID'), pickup: n((o) => o.status === 'PAID' || o.status === 'FULFILLED'), done: 0, refund: n((o) => o.status === 'REFUNDING') };
  };
  M3.profileItems = (me) => [['昵称', !!me.name], ['头像', me.avatarIdx != null], ['性别', !!me.gender], ['生日', !!me.birthday], ['手机号', !!me.phoneBound]];
  M3.logout = async () => {
    if (!(await Mini.confirm('退出后需要重新登录，才能查看订单、会员卡和优惠券。', { title: '退出登录', ok: '退出', danger: true }))) return false;
    Mini.auth.logout(); Mini.reset('login'); return true;
  };

  window.PAGES_MINI.me = {
    title: '我的', tab: 'me', nav: { transparent: true, tone: 'dark', title: '我的' },
    layout: '横带分层', reason: '“我的”是资产与入口的汇总：头部确认我是谁，往下按重要性分三条横带——资产（余额最大，是主角）、订单状态、常用功能，每条带只做一件事',
    scenes: [{ id: 'guest', label: '未登录：登录引导' }, { id: 'newbie', label: '新会员：资产为零、没有订单' }, { id: 'busy', label: '角标很多：订单 120 笔待支付、未读消息很多' }],
    skeleton: () => h('div', {}, h('div.skel', { style: { height: '220px', borderRadius: '0' } }), h('div.mini-skel', { style: { marginTop: '-40px' } }, h('div.skel', { style: { height: '110px' } }), h('div.skel', { style: { height: '96px' } }), h('div.skel', { style: { height: '140px' } }))),
    render(ctx) {
      const guest = !Mini.auth.is() || ctx.scene === 'guest', me = B.db.me, newbie = ctx.scene === 'newbie';
      const toLogin = () => ctx.push('login', { redirect: 'back', from: 'me' });
      const go = (id, params) => () => (guest ? toLogin() : ctx.push(id, params));
      const live = () => {
        const cards = newbie ? [] : M3.myCards().filter((c) => ['ACTIVE', 'PENDING', 'FROZEN', 'LOST'].includes(M3.cardState(c).key));
        return { usable: newbie ? [] : M3.usableCoupons(), cards, unread: guest ? 0 : ctx.scene === 'busy' ? 128 : M3.unread(), oc: guest ? {} : orderCounts(ctx.scene), items: M3.profileItems(me), bal: newbie ? 0 : me.balance };
      };
      const snap = () => { const l = live(); return [l.bal, me.name, me.avatarIdx, l.usable.length, l.cards.length, l.unread, JSON.stringify(l.oc), l.items.filter((i) => i[1]).length].join('|'); }, first = snap();
      const L = live(), root = h('section.mini-page.m3-me');
      /* 头部：头像、昵称、会员号；资料完整度并在同一个入口里，整块进个人资料 */
      const done = L.items.filter((i) => i[1]).length, pct = Math.round((done / L.items.length) * 100), todo = L.items.filter((i) => !i[1]).map((i) => i[0]);
      const head = guest
        ? h('header.m3-mehead', {}, h('div.m3-who', {}, Mini.avatar(null, 64), h('div.grow', {}, h('h2.m3-who-name', { text: '你好，欢迎光临' }), h('p.m3-who-sub', { text: '登录后可查看订单、会员卡和优惠券' }))), h('button.btn.btn--primary.btn--block', { type: 'button', text: '登录 / 注册', on: { click: toLogin } }))
        : h('header.m3-mehead', {}, h('button.m3-who', { type: 'button', 'aria-label': '个人资料：' + me.name + (pct < 100 ? '，资料完整度 ' + pct + '%' : ''), on: { click: () => ctx.push('profile') } }, Mini.avatar(me, 64),
          h('span.grow', {}, h('span.m3-who-name', { text: newbie ? '新朋友' : me.name }), h('span.m3-who-sub', {}, '会员号 ' + me.memberNo, h('span.m3-lv', { text: newbie ? '普通会员' : me.level + '会员' })),
            pct < 100 ? h('span.m3-comp', {}, h('span.m3-prog', { 'aria-hidden': 'true' }, h('i', { style: { '--v': pct / 100 } })), h('span', { text: '资料完整度 ' + pct + '%，补全' + todo.slice(0, 2).join('、') })) : h('span.m3-who-sub', { text: '资料已完整' })),
          UI.icon('right', 'icon--sm')));
      /* 资产条：余额是主角（展示字号），优惠券、会员卡是配角 */
      const soon = L.usable.filter((c) => M3.diff(today(), c.expire) <= 2).length, gift = Math.min(me.giftBalance || 0, L.bal);
      const assets = h('section.m3-assets', { 'aria-label': '我的资产' },
        h('button.m3-bal', { type: 'button', on: { click: go('wallet') } }, h('span.m3-lab', {}, '储值余额 ', UI.icon('right', 'icon--sm')), guest ? h('span.m3-big', {}, h('b', { text: '—' })) : M3.big(L.bal),
          guest || !L.bal ? h('span.m3-sub', { text: guest ? '登录后查看' : '还没有储值，去充值享赠送' }) : h('span.m3-sub.m3-subs2', {}, h('span', { text: '本金 ' + Mini.money(L.bal - gift) }), h('span', { text: '赠送 ' + Mini.money(gift) }))),
        h('div.m3-side', {}, h('button.m3-asset', { type: 'button', on: { click: go('coupons') } }, UI.icon('tag'), h('span.grow', {}, h('b.num', { text: guest ? '—' : String(L.usable.length) }), ' 张优惠券', h('small', { text: guest ? '' : soon ? soon + ' 张即将到期' : L.usable.length ? '' : '暂无可用' })), UI.icon('right', 'icon--sm')),
          h('button.m3-asset', { type: 'button', on: { click: go('my-cards') } }, UI.icon('card'), h('span.grow', {}, h('b.num', { text: guest ? '—' : String(L.cards.length) }), ' 张会员卡', h('small', { text: guest ? '' : L.cards.length ? '' : '去办一张' })), UI.icon('right', 'icon--sm'))));
      /* 订单状态：四个入口，角标来自订单 */
      const ords = [['待支付', 'clock', 'unpaid'], ['待取餐', 'dish', 'pickup'], ['已完成', 'check', 'done'], ['退款与售后', 'undo', 'refund']];
      const orders = h('section.m3-orders', { 'aria-label': '我的订单' }, h('div.mini-sec', {}, h('h2', { text: '我的订单' }), h('button.mini-link', { type: 'button', on: { click: go('orders', { seg: 'all' }) } }, '全部订单', UI.icon('right'))),
        h('div.m3-ordrow', {}, ords.map(([label, icon, seg]) => h('button.m3-ord', { type: 'button', 'aria-label': label + (L.oc[seg] ? '，' + L.oc[seg] + ' 笔' : ''), on: { click: go('orders', { seg }) } }, h('span.m3-ic', {}, UI.icon(icon), Mini.badge(L.oc[seg] || 0)), h('span', { text: label })))));
      /* 常用功能宫格：列数按金刚区公式推导，随宽度重算 */
      const fns = [['办会员卡', 'crown', 'cards'], ['领券中心', 'gift', 'coupons', { tab: 'center' }], ['消息', 'bell', 'notices'], ['门店', 'shop', 'stores'], ['联系客服', 'headset', 'call'], ['意见反馈', 'chat', 'feedback'], ['设置', 'gear', 'settings']];
      const call = () => Mini.dialog({ title: '联系客服', body: '拨打 ' + B.shop.phone + '\n服务时间 ' + B.shop.hours, actions: [{ label: '取消', value: null }, { label: '拨打', kind: 'primary', value: 'ok', on: () => Mini.toast('正在呼叫（模拟）') }] });
      const grid = h('div.m3-grid', {}, fns.map(([label, icon, id, params]) => h('button.m3-gi', { type: 'button', on: { click: () => (id === 'call' ? call() : id === 'notices' && guest ? toLogin() : ctx.push(id, params)) } }, h('span.m3-ic', {}, UI.icon(icon), id === 'notices' ? Mini.badge(L.unread) : null), h('span', { text: label }))));
      const maxChars = Math.max(...fns.map((f) => f[0].length)), lay = () => { const w = grid.clientWidth; if (!w) return; const g = M3.gridCols(fns.length, maxChars, w); grid.style.gridTemplateColumns = 'repeat(' + g.cols + ', minmax(0, 1fr))'; grid.dataset.cols = g.cols; };
      if (window.ResizeObserver) { const ro = new ResizeObserver(lay); ro.observe(grid); ctx.cleanup(() => ro.disconnect()); }
      root.append(head, assets, orders, h('section.m3-fns', { 'aria-label': '常用功能' }, h('div.mini-sec', {}, h('h2', { text: '常用功能' })), grid));
      /* 数据变化后回到本页：只有资产、角标、资料变了才重绘 */
      ctx.cleanup(Mini.on('auth', () => ctx.refresh()));
      ctx.onShow(() => { lay(); if (!guest && snap() !== first) ctx.refresh(); });
      return root;
    },
  };

  /* =====================================================================================
     个人资料（二级页；主次布局）：头像是主角，下面是昵称、性别、生日、手机号；保存时才做昵称内容检测
     ===================================================================================== */
  const BAD_WORDS = ['傻', '赌博', '代充', '刷单', '加微信', '垃圾', 'http', 'www.'];
  /** 手机号验证：微信快速验证与短信验证；返回 Promise<手机号或 null> */
  M3.verifyPhone = (ctx) => {
    const st = { phone: '', code: '', cd: 0, sent: false, tries: 0, locked: false }; let timer;
    const phone = h('input.input', { type: 'tel', inputmode: 'numeric', maxlength: 11, placeholder: '请输入手机号', autocomplete: 'tel' }), code = h('input.input', { type: 'text', inputmode: 'numeric', maxlength: 6, placeholder: '6 位验证码', autocomplete: 'one-time-code' });
    const get = h('button.btn.btn--tint', { type: 'button', style: { flex: 'none' } }), pf = M3.field('手机号', phone), cf = M3.field('验证码', h('div.m3-inrow', {}, code, get), { input: code });
    const tick = () => { get.disabled = st.cd > 0; get.textContent = st.cd > 0 ? '重新获取（' + st.cd + ' 秒）' : st.sent ? '重新获取' : '获取验证码'; }; tick();
    get.addEventListener('click', async () => {
      pf.setErr(''); if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) { pf.setErr('请输入正确的 11 位手机号'); return phone.focus(); }
      if (B.db.users.some((u) => u.phone === phone.value.trim() && u.id !== B.db.me.id)) { pf.setErr('该手机号已绑定其他账号，请更换手机号或联系客服'); return phone.focus(); }
      get.disabled = true; const r = await M3.act(null, 500);
      if (!r.ok) { tick(); return pf.setErr(r.off ? '没有网络，验证码没有发出，请连上网络后重试' : '网络不太稳定，验证码没有发出，请重试'); }
      if (ctx.scene === 'sms-limit') { tick(); return pf.setErr('今天获取验证码的次数已达上限，请明天再试或使用微信快速验证'); }
      if (ctx.scene === 'sms-fail') { tick(); return pf.setErr('短信发送失败，请稍后重试'); }
      st.phone = phone.value.trim(); st.sent = true; st.locked = false; st.tries = 0; st.cd = 60; cf.setErr(''); tick(); Mini.toast('验证码已发送至 ' + B.maskPhone(st.phone)); code.focus();
      clearInterval(timer); timer = setInterval(() => { st.cd = Math.max(0, st.cd - 1); tick(); if (!st.cd) clearInterval(timer); }, 1000);
    });
    const body = h('div.m3-sms', {}, pf, cf, h('p.muted', { text: '演示验证码：123456；连续输错 5 次需要重新获取' }));
    const p = Mini.sheet({ title: '短信验证', body, actions: [{ label: '取消', value: null }, { label: '验证并绑定', kind: 'primary', value: 'ok', on: async () => {
      pf.setErr(''); cf.setErr('');
      if (!st.sent) { cf.setErr('请先获取验证码'); get.focus(); return false; }
      if (st.locked) { cf.setErr('验证码错误次数过多，请重新获取验证码'); return false; }
      if (phone.value.trim() !== st.phone) { pf.setErr('手机号和获取验证码时不一致，请重新获取'); return false; }
      if (!/^\d{6}$/.test(code.value.trim())) { cf.setErr('请输入 6 位验证码'); code.focus(); return false; }
      const r = await M3.act(null, 600); if (!r.ok) { cf.setErr(r.reason); return false; }
      if (code.value.trim() !== '123456') { st.tries++; if (st.tries >= 5) { st.locked = true; st.sent = false; tick(); cf.setErr('验证码错误次数过多，请重新获取验证码'); } else cf.setErr('验证码不对，还可以再试 ' + (5 - st.tries) + ' 次'); code.focus(); return false; }
      return true;
    } }] });
    return p.then((v) => { clearInterval(timer); return v === 'ok' ? st.phone : null; });
  };
  const wxPhone = () => Mini.sheet({ title: '微信快速验证', body: h('div.m3-wxauth', {}, h('span.m3-wxlogo', {}, UI.icon('wechat')), h('p', { text: '“' + B.shop.name + '”申请获取你微信绑定的手机号' }), h('p.m3-wxphone', { text: B.maskPhone('13800000000') }), h('p.muted', { text: '仅用于接收订单与会员通知，不会对外展示' })), actions: [{ label: '拒绝', value: null }, { label: '允许', kind: 'primary', value: 'ok' }] });

  window.PAGES_MINI.profile = {
    title: '个人资料', tab: null, from: 'me', auth: true, bar: true,
    nav: { title: '个人资料', left: (ctx) => h('button.mini-navbtn.mini-back', { type: 'button', 'aria-label': '返回', on: { click: async () => { if (ctx.m3 && ctx.m3.dirty && !(await Mini.confirm('当前的修改还没有保存，离开后会丢失。', { title: '放弃修改', ok: '放弃', cancel: '继续编辑', danger: true }))) return; Mini.back(); } } }, UI.icon('left')) },
    layout: '主次布局', reason: '资料页的主角是“我是谁”：头像放大居上，昵称、性别、生日、手机号是配角；保存固定在拇指区，只有改动了才可点',
    scenes: [{ id: 'unbound', label: '手机号：还没有绑定' }, { id: 'nick-risky', label: '昵称：检测不通过（含不合适内容）' }, { id: 'nick-down', label: '昵称：检测服务异常，稍后再试' }, { id: 'avatar-pending', label: '头像：新头像审核中' }, { id: 'sms-fail', label: '短信：发送失败' }, { id: 'sms-limit', label: '短信：今日次数已用完' }],
    skeleton: () => h('div.mini-skel', { style: { paddingTop: '16px' } }, h('div.skel', { style: { width: '88px', height: '88px', borderRadius: '50%', justifySelf: 'center' } }), h('div.skel', { style: { height: '44px' } }), h('div.skel', { style: { height: '44px' } }), h('div.skel', { style: { height: '44px' } })),
    render(ctx) {
      const me = B.db.me, S = (ctx.m3 = ctx.m3 || {});
      if (!S.f) S.f = { name: me.name, gender: me.gender, birthday: me.birthday, avatarIdx: me.avatarIdx, wx: false };
      if (S.bound == null) S.bound = ctx.scene === 'unbound' ? false : me.phoneBound;
      const f = S.f, todayS = today();
      const isDirty = () => f.name !== me.name || f.gender !== me.gender || f.birthday !== me.birthday || f.avatarIdx !== me.avatarIdx || f.wx;
      const wrap = h('div.m3-wrap'), page = h('section.mini-page.m3-profile'), save = h('button.btn.btn--primary.btn--block', { type: 'button', disabled: true, 'data-busy': '保存中' }, '保存'), tip = h('div');
      const paintSave = () => { S.dirty = isDirty(); save.disabled = !S.dirty; };
      /* 头像 */
      const av = h('button.m3-av', { type: 'button', 'aria-label': '更换头像' }), avBox = h('div.m3-avbox', {});
      const paintAv = () => { av.replaceChildren(Mini.avatar({ avatarIdx: f.avatarIdx != null ? f.avatarIdx : me.id % 6, id: me.id }, 88), h('span.m3-av-edit', {}, UI.icon('edit', 'icon--sm'))); avBox.replaceChildren(av, h('p.muted', { text: me.avatarPending || f.wx || ctx.scene === 'avatar-pending' ? '新头像审核中，通过前继续显示当前头像' : '点头像更换' })); };
      const pickAvatar = () => {
        let sel = f.avatarIdx != null ? f.avatarIdx : me.id % 6, wx = false;
        const opts = Array.from({ length: 6 }, (_, i) => { const b = h('button.m3-avopt', { type: 'button', 'aria-label': '卡通头像 ' + (i + 1), 'aria-pressed': String(i === sel), on: { click: () => { sel = i; wx = false; opts.forEach((o, k) => o.setAttribute('aria-pressed', String(k === i))); wxb.setAttribute('aria-pressed', 'false'); } } }, Mini.avatar({ id: i }, 56)); return b; });
        const wxb = h('button.btn.btn--block', { type: 'button', 'aria-pressed': 'false', on: { click: () => { wx = true; opts.forEach((o) => o.setAttribute('aria-pressed', 'false')); wxb.setAttribute('aria-pressed', 'true'); } } }, UI.icon('wechat', 'icon--sm'), '使用微信头像（需要审核）');
        return Mini.sheet({ title: '更换头像', body: h('div.m3-avpick', {}, h('div.m3-avgrid', {}, opts), wxb, h('p.muted', { text: '微信头像会先审核，通过后才会替换；审核期间继续显示当前头像' })), actions: [{ label: '取消', value: null }, { label: '使用', kind: 'primary', value: 'ok' }] }).then((v) => { if (v !== 'ok') return; if (wx) f.wx = true; else { f.avatarIdx = sel; f.wx = false; } paintAv(); paintSave(); });
      };
      av.addEventListener('click', pickAvatar);
      /* 昵称、性别、生日 */
      const nick = h('input.input', { type: 'text', maxlength: 20, value: f.name, autocomplete: 'nickname', placeholder: '1 到 20 个字' }), cnt = h('span.m3-cnt.num'), nickF = M3.field('昵称', nick, { hint: '' });
      const paintCnt = () => { cnt.textContent = nick.value.length + ' / 20'; };
      nick.addEventListener('input', () => { f.name = nick.value.trim(); nickF.setErr(''); tip.replaceChildren(); paintCnt(); paintSave(); }); paintCnt();
      nickF.querySelector('label').after(cnt);
      const sex = M3.seg([['', '保密'], ['男', '男'], ['女', '女']], f.gender, (v) => { f.gender = v; paintSave(); }, '性别');
      const bd = h('input.input', { type: 'date', value: f.birthday, max: todayS, min: '1920-01-01' }), bdF = M3.field('生日', bd, { hint: '生日只用于计算会员权益，不会对外展示' });
      bd.addEventListener('input', () => { f.birthday = bd.value; bdF.setErr(bd.value && bd.value > todayS ? '生日不能晚于今天' : ''); paintSave(); });
      /* 手机号 */
      const phoneBox = h('div.m3-phone'), bindOk = (ph) => { me.phone = ph || me.phone; me.phoneBound = true; S.bound = true; M3.touch(); Mini.toast('手机号已绑定'); paintPhone(); };
      const paintPhone = () => {
        phoneBox.replaceChildren(S.bound
          ? h('div.m3-prow', {}, UI.icon('handset'), h('div.grow', {}, h('b', { text: B.maskPhone(me.phone) }), h('p.muted', { text: '已验证，用于接收订单通知和找回账号' })), h('button.btn.btn--sm', { type: 'button', text: '更换', on: { click: async () => { const ph = await M3.verifyPhone(ctx); if (ph) bindOk(ph); } } }))
          : h('div.m3-punbound', {}, h('p', {}, UI.icon('warn', 'icon--sm'), ' 还没有绑定手机号，部分功能（购卡、储值）需要先绑定'), h('div.m3-pbtns', {},
            h('button.btn.btn--primary', { type: 'button', on: { click: async () => { if ((await wxPhone()) === 'ok') { const r = await M3.act(null, 500); if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' }); bindOk('13800000000'); } } } }, UI.icon('wechat', 'icon--sm'), '微信快速验证'),
            h('button.btn', { type: 'button', on: { click: async () => { const ph = await M3.verifyPhone(ctx); if (ph) bindOk(ph); } } }, UI.icon('phone', 'icon--sm'), '短信验证'))));
      };
      /* 保存：昵称内容检测在保存时做，违规在原位提示，检测服务异常不保存 */
      save.addEventListener('click', async () => {
        tip.replaceChildren(); let bad = false;
        if (!f.name) { nickF.setErr('请输入昵称'); bad = true; } else if (f.name.length > 20) { nickF.setErr('昵称最多 20 个字'); bad = true; }
        if (f.birthday && f.birthday > todayS) { bdF.setErr('生日不能晚于今天'); bad = true; }
        if (bad) return (nickF.querySelector('[aria-invalid="true"]') || bd).focus();
        await M3.busy(save, async () => {
          const r = await M3.act(null, 800); if (!r.ok) return tip.replaceChildren(M3.alert('没有保存成功：' + r.reason, { kind: 'bad' }));
          if (ctx.scene === 'nick-down') return tip.replaceChildren(M3.alert('昵称检测服务暂时不可用，资料没有保存，请稍后再试', { kind: 'warn', action: { label: '再试一次', on: () => save.click() } }));
          if (ctx.scene === 'nick-risky' || BAD_WORDS.some((w) => f.name.toLowerCase().includes(w))) { nickF.setErr('昵称包含不合适的内容，请修改'); return nick.focus(); }
          Object.assign(me, { name: f.name, gender: f.gender, birthday: f.birthday }); if (f.wx) me.avatarPending = true; else if (f.avatarIdx != null) { me.avatarIdx = f.avatarIdx; me.avatarPending = false; }
          M3.myCards().forEach((c) => { c.userName = me.name; }); S.dirty = false; M3.touch(); Mini.toast('资料已保存'); ctx.back();
        });
      });
      paintAv(); paintPhone(); paintSave();
      page.append(avBox, h('section.m3-pcard', {}, nickF, M3.field('性别', sex), bdF), h('section.m3-pcard', {}, h('h3', { text: '手机号' }), phoneBox), tip);
      wrap.append(page, h('div.m3-bar', {}, save));
      return wrap;
    },
  };
})();
