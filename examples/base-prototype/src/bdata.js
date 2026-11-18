/* 与旧原型底座无关的日期小工具：数据文件只需要这四个函数 */
window.K = window.K || { pad: (n) => String(n).padStart(2, '0'), today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }, ymd(d) { return d.getFullYear() + '-' + K.pad(d.getMonth() + 1) + '-' + K.pad(d.getDate()); } };
/* 底座原型（全功能超集）共用的通用演示数据：一家示例门店的商品、会员、订单与售后、月卡、储值、优惠券、消息、账号权限、审计、配置、素材、导入导出。
   两个端（小程序、后台）读同一份 window.B；数字互相对得上（订单金额 = 商品小计 - 优惠；退款不超过实付；卡的剩余次数 = 总次数 - 扣次记录）。
   与具体行业无关：换行业只换商品名、图片与文案，页面和流程不变。B.reset() 恢复演示数据；演示时钟固定每天 10:30。 */
(function () {
  'use strict';
  const K = window.K;
  const B = (window.B = {});
  B.NOW = () => { const d = K.today(); d.setHours(10, 30, 0, 0); return d; };
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  B.rng = rng;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ymdhm = (d) => K.ymd(d) + ' ' + K.pad(d.getHours()) + ':' + K.pad(d.getMinutes());
  B.fmt = ymdhm;
  const IMG = window.IMG || {};
  const img = (n) => IMG['pkg-' + String(n).padStart(2, '0')] || '';

  B.shop = { name: '示例门店', phone: '400-000-0000', hours: '09:00–21:00', addr: '示例市示例区示例路 88 号', notice: '本店支持线上点单、到店自取，会员卡与储值可抵扣。' };
  B.CATS = [{ id: 'hot', name: '热销' }, { id: 'main', name: '主食' }, { id: 'light', name: '轻食' }, { id: 'breakfast', name: '早餐' }];
  const SPECS = [{ name: '份量', opts: [{ n: '标准', d: 0 }, { n: '加大', d: 400 }] }, { name: '口味', opts: [{ n: '原味', d: 0 }, { n: '微辣', d: 0 }, { n: '少盐', d: 0 }] }];
  const P = (id, name, price, cat, desc, imgNo, extra) => Object.assign({ id, name, price: price * 100, orig: Math.round(price * 1.2) * 100, cat, desc, img: img(imgNo), sales: 100 + id * 37 % 400, stock: 20 + id * 13 % 80, status: 'ON', specs: id === 12 ? [SPECS[1]] : SPECS, tags: id % 4 === 0 ? ['新品'] : id % 3 === 0 ? ['招牌'] : [], sort: id }, extra || {});
  B.products = () => [
    P(1, '招牌牛腩饭', 22, 'main', '番茄慢炖牛腩，酸甜软烂，配时蔬与例汤', 5), P(2, '红烧鸡腿饭', 18, 'main', '整只鸡腿慢火红烧，咸鲜入味', 4), P(3, '清蒸鲈鱼套餐', 26, 'main', '当日鲜鲈鱼清蒸，少油清淡', 6),
    P(4, '田园素食套餐', 15, 'light', '时令蔬菜搭配，少油少盐', 7), P(5, '宫保鸡丁饭', 18, 'main', '经典川味，微辣下饭', 8), P(6, '黑椒牛柳饭', 22, 'main', '黑椒汁现炒牛柳，口感嫩滑', 9),
    P(7, '鱼香肉丝饭', 17, 'main', '酸甜微辣，家常味道', 10), P(8, '轻食鸡胸沙拉', 19, 'light', '低脂高蛋白，适合控制饮食', 12), P(9, '中式早餐', 8, 'breakfast', '现蒸包点配热豆浆', 1),
    P(10, '粥品早餐', 7, 'breakfast', '小米南瓜粥配点心', 2), P(11, '西式早餐', 10, 'breakfast', '三明治配牛奶，适合赶时间', 3), P(12, '梅菜扣肉饭', 20, 'main', '梅干菜蒸五花肉，肥而不腻', 11, { status: 'OFF' }),
  ];

  /* ---------- 会员（用户）：40 人，等级、积分、余额 ---------- */
  const SUR = '王李张刘陈杨黄赵吴周徐孙马胡朱郭何罗高林'.split(''), GIV = '伟芳娜敏静强磊军洋勇艳杰涛明超秀英华慧建国玲峰丽'.split('');
  B.users = () => {
    const r = rng(7), out = [];
    for (let i = 1; i <= 40; i++) {
      const d = K.addDays(K.today(), -Math.floor(r() * 300));
      out.push({ id: i, name: i === 1 ? '李哲' : pick(r, SUR) + pick(r, GIV) + (r() > .5 ? pick(r, GIV) : ''), phone: '1' + (3 + Math.floor(r() * 6)) + String(Math.floor(r() * 1e9)).padStart(9, '0'),
        level: pick(r, ['普通', '普通', '银卡', '金卡']), points: Math.floor(r() * 3000), balance: Math.round(r() * 20000), joined: K.ymd(d), status: i % 17 === 0 ? 'DISABLED' : 'ENABLED', orders: 0, spent: 0, openidHint: 'o' + Math.floor(r() * 1e6) });
    }
    out[0].phone = '13800000000'; out[0].level = '银卡'; out[0].points = 1280; out[0].balance = 8650;
    return out;
  };
  const maskPhone = (p) => p.slice(0, 3) + '****' + p.slice(7);
  B.maskPhone = maskPhone;

  /* ---------- 订单：状态机 UNPAID → PAID → FULFILLED → DONE；UNPAID/PAID → CANCELLED；PAID/FULFILLED/DONE → REFUNDING → REFUNDED ---------- */
  B.ORDER_STATUS = { UNPAID: '待支付', PAID: '待履约', FULFILLED: '已出餐', DONE: '已完成', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' };
  B.PAY = { WECHAT: '微信支付', BALANCE: '储值余额', CARD: '会员卡抵扣' };
  B.orders = (products, users) => {
    const r = rng(11), out = [], now = B.NOW();
    let no = 1;
    for (let i = 0; i < 420; i++) {
      const u = i < 8 ? users[0] : pick(r, users), n = 1 + Math.floor(r() * 3), items = [];
      for (let k = 0; k < n; k++) { const p = pick(r, products.filter((x) => x.status === 'ON')), spec = (p.specs[0].opts[Math.floor(r() * p.specs[0].opts.length)]), qty = 1 + Math.floor(r() * 2); items.push({ pid: p.id, name: p.name, spec: spec.n, qty, price: p.price + spec.d, img: p.img }); }
      const sub = items.reduce((s, x) => s + x.price * x.qty, 0), disc = r() > .65 ? Math.min(sub, [200, 300, 500][Math.floor(r() * 3)]) : 0;
      const age = i < 8 ? i * 0.4 : r() * 30, created = new Date(now.getTime() - age * 864e5 - Math.floor(r() * 36e5));
      const roll = r(); let status = roll < .06 ? 'UNPAID' : roll < .16 ? 'PAID' : roll < .21 ? 'FULFILLED' : roll < .78 ? 'DONE' : roll < .86 ? 'CANCELLED' : roll < .92 ? 'REFUNDING' : 'REFUNDED';
      if (i === 0) status = 'UNPAID'; if (i === 1) status = 'PAID'; if (i === 2) status = 'DONE'; if (i === 3) status = 'REFUNDING';
      const paid = status !== 'UNPAID' && status !== 'CANCELLED' || (status === 'CANCELLED' && r() > .6);
      out.push({ no: '26' + K.ymd(created).replace(/-/g, '').slice(2) + String(100000 + no++ * 137), userId: u.id, userName: u.name, items, subtotal: sub, discount: disc, amount: sub - disc, pay: pick(r, ['WECHAT', 'WECHAT', 'BALANCE', 'CARD']), status,
        createdAt: ymdhm(created), paidAt: paid ? ymdhm(new Date(created.getTime() + 120000)) : '', remark: r() > .85 ? '不要香菜' : '', pickup: 'A' + String(10 + Math.floor(r() * 80)), coupon: disc ? '满减券' : '' });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  };
  B.refunds = (orders) => orders.filter((o) => o.status === 'REFUNDING' || o.status === 'REFUNDED').map((o, i) => ({ id: i + 1, orderNo: o.no, userName: o.userName, amount: o.amount - (i % 3 === 0 ? 300 : 0), reason: ['点错了', '菜品有问题', '重复下单', '送达太慢'][i % 4], kind: i % 4 === 1 ? '退货退款' : '仅退款', status: o.status === 'REFUNDED' ? 'DONE' : 'PENDING', appliedAt: o.createdAt, handler: o.status === 'REFUNDED' ? '王海燕' : '', note: '' }));

  /* ---------- 会员卡（期限卡、次卡、时段卡）与扣次记录 ---------- */
  B.cardTypes = () => [
    { id: 1, name: '月卡', kind: '期限卡', price: 19800, days: 30, times: 0, daily: 1, gift: 0, desc: '30 天内每天可用 1 次，当天未用不累计', status: 'ON' },
    { id: 2, name: '十次卡', kind: '次卡', price: 15000, days: 90, times: 10, daily: 0, gift: 1, desc: '10 次加赠 1 次，90 天内有效', status: 'ON' },
    { id: 3, name: '午餐时段卡', kind: '时段卡', price: 9900, days: 30, times: 0, daily: 1, gift: 0, slot: '11:00–13:30', desc: '仅午餐时段可用，30 天有效', status: 'ON' },
    { id: 4, name: '季卡', kind: '期限卡', price: 52800, days: 90, times: 0, daily: 1, gift: 0, desc: '90 天内每天可用 1 次', status: 'OFF' },
  ];
  B.cards = (users, types) => {
    const r = rng(23), out = [], t0 = K.today();
    for (let i = 1; i <= 18; i++) {
      const u = i === 1 ? users[0] : pick(r, users), ty = types[(i - 1) % 3], bought = K.addDays(t0, -Math.floor(r() * 40));
      const total = ty.times ? ty.times + ty.gift : 0, used = ty.times ? Math.min(total, Math.floor(r() * (total + 1))) : Math.floor(r() * 12);
      const exp = K.addDays(bought, ty.days);
      out.push({ id: i, no: 'C' + String(20260000 + i * 53), userId: u.id, userName: u.name, typeId: ty.id, typeName: ty.name, kind: ty.kind, bought: K.ymd(bought), expire: K.ymd(exp), total, used, status: exp < t0 ? 'EXPIRED' : i === 5 ? 'FROZEN' : i === 9 ? 'LOST' : 'ACTIVE', frozenDays: i === 5 ? 3 : 0, slot: ty.slot || '' });
    }
    return out;
  };
  B.cardLogs = (cards) => { const out = []; cards.forEach((c) => { for (let k = 0; k < c.used && k < 6; k++) out.push({ id: out.length + 1, cardNo: c.no, userName: c.userName, at: K.ymd(K.addDays(K.today(), -k * 2 - 1)) + ' 12:' + K.pad(10 + k * 3), action: '核销扣次', operator: '前台', note: '' }); }); return out; };

  /* ---------- 储值 ---------- */
  B.walletPlans = () => [{ id: 1, amount: 5000, gift: 0 }, { id: 2, amount: 10000, gift: 1000 }, { id: 3, amount: 20000, gift: 3000 }, { id: 4, amount: 50000, gift: 10000 }];
  B.walletLogs = (users) => { const r = rng(31), out = []; for (let i = 0; i < 60; i++) { const u = i < 6 ? users[0] : pick(r, users), kind = pick(r, ['充值', '消费', '消费', '退款', '赠送']); const amt = kind === '充值' ? pick(r, [5000, 10000, 20000]) : kind === '赠送' ? pick(r, [500, 1000, 3000]) : kind === '退款' ? 1800 : -pick(r, [1800, 2200, 3600]); out.push({ id: i + 1, userId: u.id, userName: u.name, kind, amount: amt, balance: 0, at: K.ymd(K.addDays(K.today(), -Math.floor(r() * 30))) + ' ' + K.pad(8 + Math.floor(r() * 12)) + ':' + K.pad(Math.floor(r() * 60)), ref: kind === '消费' || kind === '退款' ? '订单 ' + (100000 + i * 17) : '充值单 ' + (900000 + i * 19) }); } out.sort((a, b) => (a.at < b.at ? 1 : -1)); return out; };

  /* ---------- 优惠券 ---------- */
  B.coupons = () => [
    { id: 1, name: '满 30 减 3', kind: '满减', threshold: 3000, value: 300, scope: '全部商品', days: 7, stock: 1000, claimed: 412, used: 187, perUser: 2, status: 'ON' },
    { id: 2, name: '满 50 减 8', kind: '满减', threshold: 5000, value: 800, scope: '主食', days: 7, stock: 500, claimed: 266, used: 98, perUser: 1, status: 'ON' },
    { id: 3, name: '全场 9 折（封顶 10 元）', kind: '折扣', threshold: 0, value: 90, cap: 1000, scope: '全部商品', days: 3, stock: 300, claimed: 120, used: 41, perUser: 1, status: 'ON' },
    { id: 4, name: '早餐兑换券', kind: '兑换', threshold: 0, value: 0, scope: '指定商品：粥品早餐', days: 14, stock: 100, claimed: 100, used: 63, perUser: 1, status: 'OFF' },
  ];
  B.myCoupons = (coupons) => [{ id: 1, couponId: 1, name: coupons[0].name, kind: '满减', threshold: 3000, value: 300, expire: K.ymd(K.addDays(K.today(), 5)), state: 'UNUSED' }, { id: 2, couponId: 2, name: coupons[1].name, kind: '满减', threshold: 5000, value: 800, expire: K.ymd(K.addDays(K.today(), 2)), state: 'UNUSED' }, { id: 3, couponId: 3, name: coupons[2].name, kind: '折扣', threshold: 0, value: 90, expire: K.ymd(K.addDays(K.today(), -1)), state: 'EXPIRED' }, { id: 4, couponId: 1, name: coupons[0].name, kind: '满减', threshold: 3000, value: 300, expire: K.ymd(K.addDays(K.today(), -6)), state: 'USED' }];

  /* ---------- 消息与通知模板 ---------- */
  B.notices = () => [
    { id: 1, kind: '订单', title: '订单已支付', body: '您的订单已支付成功，正在备餐，取餐号 A27。', at: K.ymd(K.today()) + ' 10:12', read: false },
    { id: 2, kind: '卡券', title: '优惠券即将到期', body: '您有 1 张满 50 减 8 的优惠券将在 2 天后到期。', at: K.ymd(K.today()) + ' 09:00', read: false },
    { id: 3, kind: '会员卡', title: '月卡今日已使用', body: '月卡今日已扣 1 次，剩余有效期 18 天。', at: K.ymd(K.addDays(K.today(), -1)) + ' 12:20', read: true },
    { id: 4, kind: '系统', title: '服务时间调整', body: '本周六门店营业时间调整为 10:00–20:00。', at: K.ymd(K.addDays(K.today(), -3)) + ' 18:00', read: true },
    { id: 5, kind: '订单', title: '退款已到账', body: '订单退款 ¥18.00 已原路退回。', at: K.ymd(K.addDays(K.today(), -5)) + ' 15:40', read: true },
  ];
  B.templates = () => [
    { id: 1, scene: '支付成功', channel: '订阅消息', content: '您的订单{{订单号}}已支付，金额{{金额}}', status: 'ON', sent: 2310, failed: 12 },
    { id: 2, scene: '订单完成', channel: '订阅消息', content: '您的订单{{订单号}}已完成，欢迎再次光临', status: 'ON', sent: 2104, failed: 9 },
    { id: 3, scene: '退款到账', channel: '订阅消息', content: '订单{{订单号}}退款{{金额}}已原路退回', status: 'ON', sent: 188, failed: 1 },
    { id: 4, scene: '卡到期提醒', channel: '短信', content: '您的{{卡名}}将于{{日期}}到期，请及时使用', status: 'ON', sent: 420, failed: 6 },
    { id: 5, scene: '验证码', channel: '短信', content: '验证码{{验证码}}，5 分钟内有效，请勿泄露', status: 'ON', sent: 3880, failed: 31 },
    { id: 6, scene: '营销活动', channel: '站内信', content: '{{活动名}}开始了，点击查看', status: 'OFF', sent: 0, failed: 0 },
  ];

  /* ---------- 账号、角色、权限、审计 ---------- */
  B.PERMS = () => [
    { code: 'dashboard', name: '数据看板', children: [{ code: 'dashboard:view', name: '查看' }] },
    { code: 'product', name: '商品', children: [{ code: 'product:view', name: '查看' }, { code: 'product:edit', name: '新增与编辑' }, { code: 'product:publish', name: '上下架' }] },
    { code: 'order', name: '订单', children: [{ code: 'order:view', name: '查看' }, { code: 'order:fulfil', name: '履约' }, { code: 'order:cancel', name: '取消' }, { code: 'order:export', name: '导出' }] },
    { code: 'refund', name: '售后', children: [{ code: 'refund:view', name: '查看' }, { code: 'refund:approve', name: '审批' }] },
    { code: 'member', name: '会员', children: [{ code: 'member:view', name: '查看' }, { code: 'member:edit', name: '禁用与启用' }] },
    { code: 'card', name: '会员卡', children: [{ code: 'card:view', name: '查看' }, { code: 'card:issue', name: '发卡与扣次' }, { code: 'card:config', name: '卡种设置' }] },
    { code: 'wallet', name: '储值', children: [{ code: 'wallet:view', name: '查看' }, { code: 'wallet:adjust', name: '人工调整' }] },
    { code: 'coupon', name: '优惠券', children: [{ code: 'coupon:view', name: '查看' }, { code: 'coupon:edit', name: '新建与发放' }] },
    { code: 'system', name: '系统', children: [{ code: 'system:account', name: '账号与角色' }, { code: 'system:config', name: '系统配置' }, { code: 'system:audit', name: '审计日志' }, { code: 'system:file', name: '素材库' }, { code: 'system:notify', name: '通知模板' }] },
  ];
  B.roles = () => { const all = [].concat(...B.PERMS().map((g) => g.children.map((c) => c.code))); return [{ id: 1, name: '超级管理员', builtin: true, perms: all, users: 1 }, { id: 2, name: '店长', builtin: false, perms: all.filter((c) => !c.startsWith('system:') || c === 'system:audit'), users: 3 }, { id: 3, name: '前台', builtin: false, perms: ['order:view', 'order:fulfil', 'card:view', 'card:issue', 'member:view'], users: 6 }, { id: 4, name: '财务', builtin: false, perms: ['order:view', 'order:export', 'refund:view', 'refund:approve', 'wallet:view', 'dashboard:view'], users: 2 }]; };
  B.accounts = () => [
    { id: 1, user: 'admin', name: '王海燕', phone: '13800009001', role: '超级管理员', mfa: true, status: 'ENABLED', lastLogin: K.ymd(K.addDays(K.today(), -1)) + ' 09:12' },
    { id: 2, user: 'manager1', name: '周敏', phone: '13500001001', role: '店长', mfa: true, status: 'ENABLED', lastLogin: K.ymd(K.today()) + ' 08:40' },
    { id: 3, user: 'front1', name: '陈晓燕', phone: '13500001011', role: '前台', mfa: false, status: 'ENABLED', lastLogin: K.ymd(K.today()) + ' 08:02' },
    { id: 4, user: 'front2', name: '刘洋', phone: '13800002012', role: '前台', mfa: false, status: 'DISABLED', lastLogin: K.ymd(K.addDays(K.today(), -40)) + ' 17:30' },
    { id: 5, user: 'finance1', name: '赵建国', phone: '13800004004', role: '财务', mfa: true, status: 'ENABLED', lastLogin: K.ymd(K.addDays(K.today(), -2)) + ' 14:21' },
  ];
  B.audit = () => { const r = rng(41), acts = [['order:cancel', '取消订单', '订单'], ['refund:approve', '审批退款', '售后'], ['product:publish', '商品下架', '商品'], ['card:issue', '人工发卡', '会员卡'], ['wallet:adjust', '储值调整', '储值'], ['system:account', '重置密码', '账号'], ['system:config', '修改配置', '系统'], ['member:edit', '禁用会员', '会员']], out = []; for (let i = 0; i < 60; i++) { const a = pick(r, acts); out.push({ id: i + 1, at: K.ymd(K.addDays(K.today(), -Math.floor(r() * 20))) + ' ' + K.pad(8 + Math.floor(r() * 12)) + ':' + K.pad(Math.floor(r() * 60)), actor: pick(r, ['王海燕', '周敏', '陈晓燕', '赵建国']), code: a[0], action: a[1], target: a[2] + ' ' + (1000 + Math.floor(r() * 9000)), result: r() > .05 ? '成功' : '失败', ip: '10.0.' + Math.floor(r() * 9) + '.' + Math.floor(r() * 200), trace: 'tr' + Math.floor(r() * 1e8).toString(16) }); } out.sort((a, b) => (a.at < b.at ? 1 : -1)); return out; };

  /* ---------- 配置、素材、导入导出 ---------- */
  B.config = () => ({
    runtime: [
      { key: 'order.unpaid_close_minutes', name: '未支付自动关闭（分钟）', type: 'number', value: 30, hint: '超时先查支付结果再关单' },
      { key: 'order.refund_free_days', name: '免审核退款期限（天）', type: 'number', value: 7, hint: '期限内的储值充值可全额退' },
      { key: 'login.lock_attempts', name: '登录失败锁定次数', type: 'number', value: 5, hint: '后台账号连续输错锁定' },
      { key: 'notify.quiet_hours', name: '消息静默时段', type: 'text', value: '22:00–08:00', hint: '静默时段不发营销类消息' },
      { key: 'feature.coupon', name: '优惠券功能', type: 'switch', value: true, hint: '关闭后小程序不显示领券入口' },
      { key: 'feature.wallet', name: '储值功能', type: 'switch', value: true, hint: '关闭后不能充值，已有余额仍可消费' },
      { key: 'feature.card', name: '会员卡功能', type: 'switch', value: true, hint: '' },
    ],
    copy: [{ key: 'home.slogan', name: '首页标语', value: '好好吃饭，每一天' }, { key: 'order.empty', name: '订单为空的提示', value: '还没有订单，去点一份吧' }, { key: 'pay.success', name: '支付成功提示', value: '支付成功，正在为您备餐' }, { key: 'refund.tip', name: '退款说明', value: '退款将原路退回，到账时间以支付渠道为准' }],
    pages: [{ key: 'agreement', name: '用户协议', updated: '2026-08-01' }, { key: 'privacy', name: '隐私政策', updated: '2026-08-01' }, { key: 'card_rule', name: '会员卡规则', updated: '2026-09-12' }],
  });
  B.files = () => Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: i < 12 ? '商品图-' + (i + 1) + '.webp' : i < 20 ? '轮播图-' + (i - 11) + '.jpg' : '活动海报-' + (i - 19) + '.png', kind: '图片', size: 80 + (i * 37) % 900, group: i < 12 ? '商品' : i < 20 ? '轮播' : '活动', uploader: '周敏', at: K.ymd(K.addDays(K.today(), -i)) + ' 10:' + K.pad(i % 60), img: i < 12 ? img(i + 1) : '' }));
  B.exportTasks = () => [
    { id: 1, name: '订单_近 30 天', kind: '订单', rows: 3260, status: 'DONE', at: K.ymd(K.today()) + ' 09:20', by: '赵建国' }, { id: 2, name: '会员列表', kind: '会员', rows: 1240, status: 'DONE', at: K.ymd(K.addDays(K.today(), -1)) + ' 16:02', by: '周敏' },
    { id: 3, name: '储值流水_本月', kind: '储值', rows: 8800, status: 'RUNNING', at: K.ymd(K.today()) + ' 10:25', by: '赵建国' }, { id: 4, name: '审计日志_上周', kind: '审计', rows: 520, status: 'FAILED', at: K.ymd(K.addDays(K.today(), -2)) + ' 11:00', by: '王海燕' },
  ];
  B.importTasks = () => [{ id: 1, name: '商品批量导入.xlsx', kind: '商品', total: 48, ok: 45, fail: 3, at: K.ymd(K.addDays(K.today(), -4)) + ' 14:10', by: '周敏' }, { id: 2, name: '会员导入.xlsx', kind: '会员', total: 200, ok: 200, fail: 0, at: K.ymd(K.addDays(K.today(), -9)) + ' 09:30', by: '周敏' }];

  B.reset = () => {
    const products = B.products(), users = B.users(), orders = B.orders(products, users), types = B.cardTypes(), cards = B.cards(users, types), coupons = B.coupons();
    orders.forEach((o) => { const u = users.find((x) => x.id === o.userId); if (u && ['PAID', 'FULFILLED', 'DONE'].includes(o.status)) { u.orders++; u.spent += o.amount; } });
    const logs = B.walletLogs(users);
    B.db = { products, users, orders, refunds: B.refunds(orders), cardTypes: types, cards, cardLogs: B.cardLogs(cards), walletPlans: B.walletPlans(), walletLogs: logs, coupons, myCoupons: B.myCoupons(coupons), notices: B.notices(), templates: B.templates(), roles: B.roles(), accounts: B.accounts(), audit: B.audit(), config: B.config(), files: B.files(), exportTasks: B.exportTasks(), importTasks: B.importTasks(), cart: [], me: users[0] };
    return B.db;
  };
  B.reset();
  /* 后台外壳读 D.db 与 D.reset；底座原型没有行业数据文件，用 B 顶替 */
  if (!window.D) window.D = { get db() { return B.db; }, reset() { return B.reset(); } };
})();
