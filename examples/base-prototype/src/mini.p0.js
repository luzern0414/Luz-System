/* 小程序底座原型的外壳（页面文件 mini.p1.js 起都用它）。接口说明见 mini.API.md。
   内容：手机框与页面栈（二级页滑入滑出、标签淡入、状态与导航栏）、容器内弹层 Mini.sheet / Mini.dialog / Mini.toast、
   登录态、营业状态、购物车 Mini.cart、购买规则 Mini.rules、共用块（空、错误、骨架、价格、头像），以及 UI.demo 需要的 app 对象。
   页面通过 window.PAGES_MINI[id] = { title, tab, nav, layout, reason, scenes, render(ctx) } 注册。 */
(function () {
  'use strict';
  const { h, $, $$ } = UI;
  const K = window.K;
  const Mini = (window.Mini = {});
  const PAGES = (window.PAGES_MINI = window.PAGES_MINI || {});
  Mini.h = h;

  /* ---------- 图标：补充小程序需要的几个线性图标（24 栅格，描边 1.75） ---------- */
  Object.assign(UI.icons, {
    dish: 'M3 13h18a9 9 0 0 1-18 0zM8 9.5c0-1.4 1-1.8 1-3.2M12 9.5c0-1.4 1-1.8 1-3.2M16 9.5c0-1.4 1-1.8 1-3.2',
    handset: 'M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 14.5V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z',
    navigate: 'M20 4L4 10.5l6.5 2.5L13 19.5z',
    wechat: 'M9.5 4C5.4 4 2 6.7 2 10.1c0 1.9 1 3.6 2.7 4.7L4.1 17.5l2.8-1.5c.8.3 1.7.4 2.6.4M9.5 4c3.5 0 6.4 2.2 7 5M16 10c-3.2 0-6 2-6 4.7s2.8 4.8 6 4.8c.8 0 1.5-.1 2.2-.4l2.3 1.2-.6-2.3c1.2-.9 2-2.1 2-3.3 0-2.7-2.8-4.7-6-4.7z',
    fire: 'M12 3c.8 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-1.9.9-3.1 2-4 .2 1.6.9 2.3 1.8 2.5C11 8.8 10.6 6 12 3z',
    ticket: 'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5V14a2 2 0 0 0 0-4zM14 7v10',
    dots: 'M6 12h.01M12 12h.01M18 12h.01', locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3', crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  });

  const dur = (name, fb) => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)); return Number.isNaN(v) ? fb : v; };
  const EASE_IN = 'cubic-bezier(0, 0, 0, 1)', EASE_OUT = 'cubic-bezier(0.3, 0, 1, 1)', EASE_STD = 'cubic-bezier(0.2, 0, 0, 1)';
  Mini.dur = dur;

  /* ---------- 事件：cart / auth / shop 变化时页面刷新自己的局部 ---------- */
  const bus = {};
  Mini.on = (name, fn) => { (bus[name] = bus[name] || new Set()).add(fn); return () => bus[name].delete(fn); };
  Mini.emit = (name, arg) => (bus[name] ? [...bus[name]] : []).forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } });

  /* ---------- 金额、价格、头像 ---------- */
  /** ¥18.00（账务页用）；Mini.money(1800, 0) → ¥18 */
  Mini.money = (cents, dec) => '¥' + (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec });
  /** 价格节点：符号和小数小一号；列表与卡片去掉末尾的零（trim 默认 true），账务页传 trim:false；o.size 'sm'|'xl'；o.from 在后面加“起” */
  Mini.price = (cents, o) => {
    o = o || {}; const yuan = Math.floor(cents / 100), frac = cents % 100, trim = o.trim !== false, fs = String(frac).padStart(2, '0');
    const dec = trim ? (frac === 0 ? '' : '.' + fs.replace(/0$/, '')) : '.' + fs;
    return h('span.mini-price' + (o.size ? '.mini-price--' + o.size : ''), {}, h('small', { text: '¥' }), h('b', { text: yuan.toLocaleString('zh-CN') }), dec ? h('small', { text: dec }) : null, o.from ? h('small', { text: ' 起' }) : null);
  };
  /** 数字角标：n 为 0 时不显示，超过 99 显示 99+ */
  Mini.badge = (n) => h('span.mini-badge', { 'data-n': n, text: n > 0 ? (n > 99 ? '99+' : String(n)) : '' });
  Mini.setBadge = (el, n) => { if (!el) return; const t = n > 0 ? (n > 99 ? '99+' : String(n)) : ''; if (el.textContent !== t) { el.textContent = t; el.dataset.n = n; } };
  /** 新增或改动的行闪一次：背景取主色浅底，150 毫秒淡入、700 毫秒淡去；减少动态效果时不闪 */
  Mini.flash = (el) => { if (el && !UI.rm) UI.play(el, [{ backgroundColor: 'transparent' }, { backgroundColor: 'var(--brand-soft)', offset: 0.18 }, { backgroundColor: 'transparent' }], { duration: 850, easing: 'cubic-bezier(0.2, 0, 0, 1)' }); };
  /** 数量角标跳动一次 */
  Mini.bump = (el) => { if (!el || UI.rm) return; el.classList.remove('mini-bump'); void el.offsetWidth; el.classList.add('mini-bump'); };

  const ANIMALS = [
    ['#f2c9a0', '<path d="M10 14l3-8 6 5M38 14l-3-8-6 5" fill="#f2c9a0"/><circle cx="24" cy="26" r="15" fill="#f2c9a0"/><circle cx="18" cy="25" r="2" fill="#4a3a30"/><circle cx="30" cy="25" r="2" fill="#4a3a30"/><path d="M22 30h4l-2 2.5z" fill="#c4705a"/><path d="M14 30h-6M14 33l-5 2M34 30h6M34 33l5 2" stroke="#4a3a30" stroke-width="1.2" stroke-linecap="round"/>'],
    ['#d9b99b', '<circle cx="12" cy="13" r="5" fill="#d9b99b"/><circle cx="36" cy="13" r="5" fill="#d9b99b"/><circle cx="24" cy="26" r="15" fill="#d9b99b"/><ellipse cx="24" cy="30" rx="7" ry="5.5" fill="#f4e4d0"/><circle cx="18" cy="23" r="2" fill="#3d2f27"/><circle cx="30" cy="23" r="2" fill="#3d2f27"/><ellipse cx="24" cy="28" rx="2.4" ry="1.7" fill="#3d2f27"/>'],
    ['#f6e3e6', '<path d="M16 22c-3-9-1-17 2-17s4 8 3 17zM32 22c3-9 1-17-2-17s-4 8-3 17z" fill="#f6e3e6"/><circle cx="24" cy="29" r="13" fill="#f6e3e6"/><circle cx="19" cy="27" r="2" fill="#4a3a40"/><circle cx="29" cy="27" r="2" fill="#4a3a40"/><path d="M22 32h4l-2 2z" fill="#d98a9a"/>'],
    ['#eba865', '<path d="M9 22l3-14 9 8zM39 22l-3-14-9 8z" fill="#eba865"/><circle cx="24" cy="27" r="14" fill="#eba865"/><path d="M13 29c4 2 7 6 11 6s7-4 11-6c-1 7-6 11-11 11S14 36 13 29z" fill="#fbeedd"/><circle cx="18" cy="25" r="2" fill="#3d2a1c"/><circle cx="30" cy="25" r="2" fill="#3d2a1c"/><circle cx="24" cy="31" r="1.8" fill="#3d2a1c"/>'],
    ['#e9eaec', '<circle cx="12" cy="13" r="5.5" fill="#3b3f46"/><circle cx="36" cy="13" r="5.5" fill="#3b3f46"/><circle cx="24" cy="26" r="15" fill="#e9eaec"/><ellipse cx="17.5" cy="25" rx="4" ry="5" fill="#3b3f46" transform="rotate(-18 17.5 25)"/><ellipse cx="30.5" cy="25" rx="4" ry="5" fill="#3b3f46" transform="rotate(18 30.5 25)"/><circle cx="18" cy="25" r="1.3" fill="#fff"/><circle cx="30" cy="25" r="1.3" fill="#fff"/><ellipse cx="24" cy="31" rx="2.2" ry="1.5" fill="#3b3f46"/>'],
    ['#c9b08f', '<path d="M8 20c-2 9 0 14 4 14l2-12zM40 20c2 9 0 14-4 14l-2-12z" fill="#a98f6e"/><circle cx="24" cy="26" r="14" fill="#c9b08f"/><ellipse cx="24" cy="30" rx="8" ry="6" fill="#efe1cc"/><circle cx="18" cy="23" r="2" fill="#3c2f22"/><circle cx="30" cy="23" r="2" fill="#3c2f22"/><ellipse cx="24" cy="28" rx="2.6" ry="1.9" fill="#3c2f22"/>'],
  ];
  /** 头像：有会员时用按会员编号固定的卡通动物（不用首字母），未登录用线性人像 */
  Mini.avatar = (user, size) => {
    size = size || 40;
    if (!user) return h('span.mini-avatar-guest', { style: { width: size + 'px', height: size + 'px', flex: 'none' } }, UI.icon('user'));
    const a = ANIMALS[(user.id || 0) % ANIMALS.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#edf2ef"/>${a[1]}</svg>`;
    return h('img.avatar', { alt: '', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), style: { width: size + 'px', height: size + 'px' } });
  };

  /* ---------- 空、错误、无权限、骨架 ---------- */
  const ILL = {
    empty: '<svg class="ill" viewBox="0 0 132 108" fill="none" aria-hidden="true"><ellipse cx="66" cy="97" rx="42" ry="7" fill="var(--surface-3)"/><path d="M26 54h80c0 22-18 38-40 38S26 76 26 54z" fill="var(--brand-soft)" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 54h92" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round"/><path d="M50 40c0-6 6-7 6-13M66 40c0-6 6-7 6-13M82 40c0-6 6-7 6-13" stroke="var(--brand-line)" stroke-width="2.5" stroke-linecap="round"/></svg>',
    error: '<svg class="ill" viewBox="0 0 132 108" fill="none" aria-hidden="true"><ellipse cx="66" cy="97" rx="42" ry="7" fill="var(--surface-3)"/><path d="M38 82h54a18 18 0 0 0 2-35.9A24 24 0 0 0 48 42a19 19 0 0 0-10 40z" fill="var(--warn-soft)" stroke="var(--warn)" stroke-width="2.5" stroke-linejoin="round"/><path d="M52 62l26 0M65 52v0" stroke="var(--warn)" stroke-width="2.5" stroke-linecap="round"/><path d="M34 92L100 30" stroke="var(--warn-ink)" stroke-width="2.5" stroke-linecap="round"/></svg>',
    lock: '<svg class="ill" viewBox="0 0 132 108" fill="none" aria-hidden="true"><ellipse cx="66" cy="97" rx="42" ry="7" fill="var(--surface-3)"/><rect x="38" y="46" width="56" height="42" rx="8" fill="var(--brand-soft)" stroke="var(--brand)" stroke-width="2.5"/><path d="M50 46V36a16 16 0 0 1 32 0v10" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round"/><circle cx="66" cy="66" r="4" fill="var(--brand)"/></svg>',
    done: '<svg class="ill" viewBox="0 0 132 108" fill="none" aria-hidden="true"><ellipse cx="66" cy="97" rx="42" ry="7" fill="var(--surface-3)"/><circle cx="66" cy="52" r="34" fill="var(--ok-soft)" stroke="var(--ok)" stroke-width="2.5"/><path d="M50 53l11 11 21-23" stroke="var(--ok)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    map: '<svg class="ill" viewBox="0 0 132 108" fill="none" aria-hidden="true"><ellipse cx="66" cy="97" rx="42" ry="7" fill="var(--surface-3)"/><path d="M26 34l26-8 28 8 26-8v52l-26 8-28-8-26 8z" fill="var(--brand-soft)" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/><path d="M52 26v52M80 34v52" stroke="var(--brand-line)" stroke-width="2.5"/><circle cx="66" cy="50" r="7" fill="var(--brand)"/></svg>',
  };
  Mini.illus = (kind) => h('div', { html: ILL[kind] || ILL.empty, style: { display: 'contents' } }).firstChild;
  /** 空状态：对象加一个行动；action 可以是 {label, on, kind} 或节点 */
  Mini.empty = (text, action, o) => {
    o = o || {};
    const act = action && action.nodeType ? action : action ? h('button.btn' + (action.kind ? '.btn--' + action.kind : '.btn--primary'), { type: 'button', text: action.label, on: { click: action.on } }) : null;
    return h('div.mini-empty', { role: 'status' }, Mini.illus(o.illus || 'empty'), h('h3', { text }), o.sub ? h('p.muted', { text: o.sub }) : null, act);
  };
  /** 加载失败：原因加重试 */
  Mini.error = (retry, text) => h('div.mini-empty', { role: 'alert' }, Mini.illus('error'), h('h3', { text: text || '网络不太稳定，请稍后再试' }), h('p.muted', { text: '检查一下网络，再点“重试”' }), h('button.btn', { type: 'button', text: '重试', on: { click: retry } }));
  /** 骨架：n 行“图加两行字”；kind 'cards' 为两列卡片 */
  Mini.skeleton = (n, kind) => h('div.mini-skel', { 'aria-busy': 'true', 'aria-label': '加载中' }, kind === 'cards'
    ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } }, Array.from({ length: n || 4 }, () => h('div', { style: { display: 'grid', gap: '8px' } }, h('div.skel', { style: { aspectRatio: '1', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '16px' } }), h('div.skel', { style: { height: '16px', width: '50%' } }))))
    : Array.from({ length: n || 5 }, () => h('div.row', {}, h('div.skel', { style: { width: '72px', height: '72px', flex: 'none', borderRadius: 'var(--r-sm)' } }), h('div', { style: { flex: 1, display: 'grid', gap: '8px' } }, h('div.skel', { style: { height: '16px' } }), h('div.skel', { style: { height: '14px', width: '60%' } })))));
  /** 取数：弱网多等、断网抛错（页面 catch 后给 Mini.error），和 UI.request 一样 */
  Mini.load = (fn, ms) => UI.request(fn, ms);

  /* ---------- 登录态 ---------- */
  const S = (Mini._s = { base: null, pages: [], tabs: {}, pending: [], overlays: [], loggedIn: false, hash: '' });
  Mini.auth = {
    is: () => S.loggedIn,
    user: () => (S.loggedIn ? B.db.me : null),
    login() { S.loggedIn = true; Mini.emit('auth'); },
    logout() { S.loggedIn = false; Mini.emit('auth'); },
  };

  /* ---------- 营业状态：来自 B.shop 的营业时间和演示时钟（固定 10:30）；scene 传 rest / closed / paused 演示另外三种 ---------- */
  const toMin = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  Mini.shop = {
    hours() { return B.shop.hours.split(/[–-]/).map((s) => s.trim()); },
    /** → {key:'open'|'rest'|'closed'|'paused', label, tone:'ok'|'warn'|'', icon, hint, canOrder} */
    state(scene, hours, paused) {
      const [o, c] = (hours ? hours.split(/[–-]/).map((x) => x.trim()) : this.hours()), nw = B.NOW(), now = scene === 'rest' ? 8 * 60 + 10 : scene === 'closed' ? 21 * 60 + 40 : nw.getHours() * 60 + nw.getMinutes();
      if (scene === 'paused' || paused) return { key: 'paused', label: '暂停营业', tone: 'warn', icon: 'clock', hint: '临时暂停，预计 11:30 恢复', canOrder: false };
      if (now < toMin(o)) return { key: 'rest', label: '休息中', tone: 'warn', icon: 'clock', hint: o + ' 开始营业', canOrder: false };
      if (now >= toMin(c)) return { key: 'closed', label: '已打烊', tone: '', icon: 'clock', hint: '明天 ' + o + ' 营业', canOrder: false };
      return { key: 'open', label: '营业中', tone: 'ok', icon: 'check', hint: '营业至 ' + c, canOrder: true };
    },
    /** 状态标签节点 */
    badge(st) { return h('span.badge.badge--' + (st.tone || 'plain'), { text: st.label }); },
  };
    Mini.fmtDist = (m) => (m == null ? '—' : m < 1000 ? m + ' 米' : (m / 1000).toFixed(1) + ' 公里');

  /* ---------- 商品辅助与购买规则 ---------- */
  Mini.product = (pid) => B.db.products.find((p) => p.id === Number(pid));
  Mini.cat = (id) => (B.CATS.find((c) => c.id === id) || {}).name || '';
  /** 规格价：基础价加所选选项的加价（分） */
  Mini.specPrice = (p, specs) => p.price + (p.specs || []).reduce((s, g) => s + ((g.opts.find((o) => o.n === (specs || {})[g.name]) || {}).d || 0), 0);
  Mini.defaultSpecs = (p) => Object.fromEntries((p.specs || []).map((g) => [g.name, g.opts[0].n]));
  Mini.specText = (specs) => Object.values(specs || {}).join(' / ');
  /** 商品状态：ok / soldout / off（scene 传 soldout、off、limit 演示） */
  Mini.pstate = (p, scene) => (scene === 'off' || p.status !== 'ON' ? 'off' : scene === 'soldout' || scene === 'allsoldout' || p.stock <= 0 ? 'soldout' : 'ok');

  Mini.rules = {
    of: (p) => (B.db.buyRules || {})[p.id] || {},
    /** 我已买的件数：period 'day' 只算今天；不含已取消和已退款的订单 */
    bought(pid, period) {
      const me = B.db.me, today = K.ymd(B.NOW());
      return B.db.orders.filter((o) => o.userId === me.id && !['CANCELLED', 'REFUNDED'].includes(o.status) && (period === 'day' ? o.createdAt.slice(0, 10) === today : true))
        .reduce((s, o) => s + o.items.filter((i) => i.pid === pid).reduce((a, i) => a + i.qty, 0), 0);
    },
    /** 本人还能买几件（无限制为 Infinity） */
    left(p) { const r = this.of(p); if (r.once) return this.bought(p.id) > 0 ? 0 : 1; if (r.limit) return Math.max(0, r.limit.n - this.bought(p.id, r.limit.period)); return Infinity; },
    /** 一单最多能买的件数：库存、单笔上限、本人剩余里取最小 */
    cap(p) { const r = this.of(p); return Math.max(0, Math.min(p.stock, r.max || Infinity, this.left(p))); },
    /** 写在数量旁的规则文字 */
    texts(p) {
      const r = this.of(p), out = [];
      if (r.min > 1) out.push(r.min + ' 件起售');
      if (r.max) out.push('每单最多 ' + r.max + ' 件');
      if (r.once) out.push(this.bought(p.id) > 0 ? '每人限购 1 次，你已买过' : '每人限购 1 次');
      else if (r.limit) { const left = this.left(p); out.push((r.limit.period === 'day' ? '每日限购 ' : '每人限购 ') + r.limit.n + ' 件，' + (r.limit.period === 'day' ? '今日' : '') + (left > 0 ? '还可买 ' + left + ' 件' : '已达上限')); }
      if (p.stock > 0 && p.stock <= 5) out.push('仅剩 ' + p.stock + ' 件');
      return out;
    },
    /** 逐行检查购物车里的行是否满足规则 → [{key, text, fix}]，结算页用 */
    problems(lines) {
      const out = [], byPid = {};
      lines.forEach((l) => { byPid[l.pid] = (byPid[l.pid] || 0) + l.qty; });
      Object.entries(byPid).forEach(([pid, qty]) => {
        const p = Mini.product(pid), r = this.of(p), left = this.left(p), first = lines.find((l) => l.pid === Number(pid));
        if (r.min && qty < r.min) out.push({ key: first.key, name: p.name, text: p.name + '需要 ' + r.min + ' 件起售', fix: { label: '改为 ' + r.min + ' 件', qty: r.min } });
        if (r.max && qty > r.max) out.push({ key: first.key, name: p.name, text: p.name + '每单最多 ' + r.max + ' 件', fix: { label: '改为 ' + r.max + ' 件', qty: r.max } });
        if (left !== Infinity && qty > left) out.push({ key: first.key, name: p.name, text: left > 0 ? p.name + '你还可买 ' + left + ' 件' : p.name + '已达购买上限', fix: left > 0 ? { label: '改为 ' + left + ' 件', qty: left } : { label: '移除', qty: 0 } });
      });
      return out;
    },
  };
  /** 起售数（没有起售规则为 1） */
  Mini.rules.min = (p) => Mini.rules.of(p).min || 1;

  /* ---------- 购物车：B.db.cart 是行的数组，menu、product、cart 和结算共用 ----------
     行：{ key, pid, name, img, unit(分，含规格加价), orig(分，划线价含加价), qty, specs:{份量:'标准'}, spec:'标准 / 原味', selected }
     所有修改先在本地改（乐观），再走一次请求；断网时回滚并提示 */
  const cartLines = () => B.db.cart;
  const lineKey = (pid, specs) => pid + '|' + Object.values(specs || {}).join('|');
  const snap = () => JSON.parse(JSON.stringify(B.db.cart));
  Mini.cart = {
    lines: cartLines,
    keyOf: lineKey,
    find: (key) => cartLines().find((l) => l.key === key),
    /** 行是否有效：{ok:true} 或 {ok:false, kind:'off'|'out'|'short', text, fix}（short 是库存不足，fix 是还能买的件数） */
    state(l) {
      const p = Mini.product(l.pid); if (!p || p.status !== 'ON') return { ok: false, kind: 'off', text: '已下架' };
      if (p.stock <= 0) return { ok: false, kind: 'out', text: '已售罄' };
      if (l.qty > p.stock) return { ok: false, kind: 'short', text: '库存不足，仅剩 ' + p.stock + ' 件', fix: p.stock };
      return { ok: true };
    },
    /** 库存不多时返回剩余件数（1 到 3），否则 0 */
    low(l) { const p = Mini.product(l.pid); return p && p.stock > 0 && p.stock <= 3 ? p.stock : 0; },
    valid: () => cartLines().filter((l) => Mini.cart.state(l).ok),
    invalid: () => cartLines().filter((l) => !Mini.cart.state(l).ok),
    /** 有效商品的总件数（角标用） */
    count: () => Mini.cart.valid().reduce((s, l) => s + l.qty, 0),
    countOf: (pid) => cartLines().filter((l) => l.pid === pid).reduce((s, l) => s + l.qty, 0),
    /** 已选且有效的行的汇总，菜单、购物车、结算用同一套算法（金额按分）：
        {lines, count, subtotal, orig, saved, coupon, discount, pay, next:{need, name}|null} */
    quote(lines) {
      const ls = lines || Mini.cart.valid().filter((l) => l.selected), subtotal = ls.reduce((s, l) => s + l.unit * l.qty, 0), orig = ls.reduce((s, l) => s + (l.orig || l.unit) * l.qty, 0);
      const today = K.ymd(B.NOW()), usable = (B.db.myCoupons || []).filter((c) => c.state === 'UNUSED' && c.expire >= today);
      const worth = (c) => (c.kind === '折扣' ? Math.min((B.db.coupons.find((x) => x.id === c.couponId) || {}).cap || Infinity, Math.floor((subtotal * (100 - c.value)) / 100)) : c.value);
      const ok = usable.filter((c) => subtotal >= c.threshold && subtotal > 0), coupon = ok.sort((a, b) => worth(b) - worth(a))[0] || null, discount = coupon ? Math.min(subtotal, worth(coupon)) : 0;
      const nextC = usable.filter((c) => subtotal < c.threshold && c.threshold > 0).sort((a, b) => a.threshold - b.threshold)[0];
      return { lines: ls, count: ls.reduce((s, l) => s + l.qty, 0), subtotal, orig, saved: Math.max(0, orig - subtotal), coupon, discount, pay: subtotal - discount, next: nextC ? { need: nextC.threshold - subtotal, name: nextC.name, value: nextC.value } : null };
    },
    /** 本次最多还能再加几件（库存、单笔上限、本人剩余里取最小，减去购物车里已有的同商品） */
    room(p) { return Math.max(0, Mini.rules.cap(p) - Mini.cart.countOf(p.id)); },
    /** 带回滚的修改：fn 里直接改 B.db.cart；返回 Promise<boolean>（断网时回滚，false） */
    async mutate(fn, o) {
      const before = snap(); fn(); Mini.emit('cart', o);
      try { await UI.request(null, 60); return true; } catch (e) { B.db.cart.splice(0, B.db.cart.length, ...before); Mini.emit('cart', o); Mini.toast('网络不太稳定，操作没有成功，请稍后再试', { kind: 'bad' }); return false; }
    },
    /** 加入购物车 → Promise<{ok, line, reason}>；已有同规格行则合并件数 */
    async add(p, o) {
      o = o || {}; const specs = o.specs || Mini.defaultSpecs(p), qty = o.qty || 1, key = lineKey(p.id, specs);
      if (Mini.pstate(p) !== 'ok') return { ok: false, reason: Mini.pstate(p) === 'off' ? '这件商品已下架' : '这件商品已售罄' };
      if (qty > Mini.cart.room(p)) return { ok: false, reason: Mini.rules.left(p) <= 0 ? '已达购买上限' : '库存不够了' };
      let line;
      const ok = await Mini.cart.mutate(() => {
        line = Mini.cart.find(key);
        if (line) { line.qty += qty; line.selected = true; } else { const unit = Mini.specPrice(p, specs), d = unit - p.price; line = { key, pid: p.id, name: p.name, img: p.img, unit, orig: p.orig + d, qty, specs, spec: Mini.specText(specs), selected: true }; B.db.cart.push(line); }
      }, { key });
      return ok ? { ok: true, line } : { ok: false, reason: '网络不太稳定，请稍后再试' };
    },
    /** 设置数量；0 即移除 */
    setQty(key, qty) { return Mini.cart.mutate(() => { const l = Mini.cart.find(key); if (!l) return; if (qty <= 0) B.db.cart.splice(B.db.cart.indexOf(l), 1); else l.qty = qty; }, { key }); },
    remove: (key) => Mini.cart.setQty(key, 0),
    select(key, on) { const l = Mini.cart.find(key); if (l) { l.selected = on; Mini.emit('cart', { key }); } },
    selectAll(on) { Mini.cart.valid().forEach((l) => { l.selected = on; }); Mini.emit('cart'); },
    clear: () => Mini.cart.mutate(() => B.db.cart.splice(0, B.db.cart.length)),
    clearInvalid: () => Mini.cart.mutate(() => { const bad = Mini.cart.invalid(); bad.forEach((l) => B.db.cart.splice(B.db.cart.indexOf(l), 1)); }),
    /** 下单成功后调用：移除已选且有效的行 */
    clearSelected: () => Mini.cart.mutate(() => { Mini.cart.valid().filter((l) => l.selected).forEach((l) => B.db.cart.splice(B.db.cart.indexOf(l), 1)); }),
    restore(snapshot) { B.db.cart.splice(0, B.db.cart.length, ...snapshot); Mini.emit('cart'); },
    snapshot: snap,
  };

  /* ---------- 演示数据补充：库存、购买规则、搜索历史、门店、评价、初始购物车（B.reset 之后重做） ---------- */
  const seed = (db) => {
    const P = (id) => db.products.find((p) => p.id === id);
    if (P(7)) P(7).stock = 0; if (P(5)) P(5).stock = 3; if (P(2)) P(2).stock = 6;
    db.buyRules = { 9: { min: 2 }, 1: { limit: { n: 2, period: 'day' } }, 2: { max: 3 }, 11: { once: true } };
    db.searchHistory = ['牛腩饭', '早餐'];
    db.stores = db.stores || [
      { id: 1, name: B.shop.name, addr: B.shop.addr, phone: B.shop.phone, hours: B.shop.hours, status: 'OPEN', dist: 320, x: 150, y: 215, tags: ['可自取', '有座位'], queue: 3 },
      { id: 2, name: '示例门店 · 万象店', addr: '示例市示例区万象路 12 号 一层', phone: '400-000-0001', hours: '10:00–22:00', status: 'OPEN', dist: 860, x: 270, y: 170, tags: ['可自取', '停车位'], queue: 5 },
      { id: 3, name: '示例门店 · 东湖店', addr: '示例市东湖区滨湖路 45 号', phone: '400-000-0002', hours: '09:00–20:30', status: 'OPEN', dist: 1900, x: 95, y: 300, tags: ['可自取', '临湖座位'], queue: 1 },
      { id: 4, name: '示例门店 · 大学城店', addr: '示例市大学城中路 8 号 学生街', phone: '400-000-0003', hours: '08:00–21:30', status: 'PAUSED', dist: 3200, x: 285, y: 300, tags: ['可自取'], queue: 0 },
      { id: 5, name: '示例门店 · 南站店', addr: '示例市南站东路 3 号 候车厅旁', phone: '400-000-0004', hours: '06:30–19:00', status: 'OPEN', dist: 5600, x: 205, y: 340, tags: ['可自取', '早餐'], queue: 2 },
    ];
    db.curStore = 1;
    const r = B.rng(53), words = ['味道很好，分量足', '出餐很快，取餐方便', '牛腩软烂，汤汁拌饭一绝', '清淡不油腻，会再来', '早上赶时间也来得及', '包装严实，到店还是热的', '价格实惠，会员卡很划算'], names = ['李', '王', '张', '陈', '刘', '周'];
    db.reviews = [];
    db.products.forEach((p) => { const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) db.reviews.push({ id: db.reviews.length + 1, pid: p.id, user: names[Math.floor(r() * names.length)] + '**', rating: r() > 0.18 ? 5 : 4, text: words[Math.floor(r() * words.length)], at: K.ymd(K.addDays(K.today(), -Math.floor(r() * 20))).slice(5) }); });
    const add = (pid, specs, qty) => { const p = P(pid); if (!p) return; const unit = Mini.specPrice(p, specs); db.cart.push({ key: lineKey(pid, specs), pid, name: p.name, img: p.img, unit, orig: p.orig + (unit - p.price), qty, specs, spec: Mini.specText(specs), selected: true }); };
    db.cart.length = 0; add(1, { 份量: '标准', 口味: '原味' }, 1); add(9, { 份量: '标准', 口味: '原味' }, 2);
  };
  const baseReset = B.reset;
  B.reset = function () { const db = baseReset.call(B); seed(db); return db; };
  seed(B.db);

  /* =====================================================================================
     手机框、页面栈、导航栏、标签栏
     ===================================================================================== */
  const TABS = [['home', '首页', 'home'], ['menu', '点单', 'dish'], ['orders', '订单', 'list'], ['me', '我的', 'user']];
  Mini.TABS = TABS;
  let stage, phone, stack, tabbar, layer, toasts, statusEl, homeBar;

  const pageOf = (id) => PAGES[id] || { title: '', tab: null, nav: {}, _missing: true, layout: '', reason: '', render: () => h('section.mini-page', {}, Mini.empty('这个页面还没有做')) };
  const top = () => S.pages[S.pages.length - 1] || S.base;
  Mini.top = () => top();
  Mini.scenesOf = (id) => { const p = PAGES[id]; return ((p && p.scenes) || []).concat(p && p.auth ? [{ id: 'login', label: '未登录：跳登录页' }] : []); };
  const parseHash = () => { const raw = location.hash.replace(/^#\/?/, ''); if (!raw) return null; const [id, q] = raw.split('?'); return { id, params: Object.fromEntries(new URLSearchParams(q || '')) }; };
  const fmtHash = (id, params) => { const q = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([k, v]) => v != null && typeof v !== 'object' && typeof v !== 'function'))).toString(); return '#/' + id + (q ? '?' + q : ''); };

  /* ---- 动画：可打断。每次导航先把上一次没播完的动画收尾 ---- */
  const settle = () => { const p = S.pending; S.pending = []; p.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };
  const wait = (anims, done) => {
    let fin = false; const end = () => { if (fin) return; fin = true; anims.forEach((a) => { try { a.cancel(); } catch (e) { /* 已结束 */ } }); done(); };
    S.pending.push(end); Promise.allSettled(anims.map((a) => a.finished)).then(() => { S.pending = S.pending.filter((f) => f !== end); end(); });
  };

  /* ---- 帧：每页一个 .mini-pg（导航栏、滚动区、变暗层） ---- */
  function makeFrame(id, params, kind) {
    const page = pageOf(id), fr = { id, page, params: params || {}, kind, cleanups: [], showHooks: [], hideHooks: [], retapHooks: [], token: 0, stale: false, title: null, solid: false, gated: false };
    fr.ctx = makeCtx(fr); buildChrome(fr); renderFrame(fr); return fr;
  }
  function makeCtx(fr) {
    const ctx = {
      id: fr.id, params: fr.params, scene: 'normal', net: 'ok',
      push: (id, p) => Mini.push(id, p), back: () => Mini.back(), replace: (id, p) => Mini.replace(id, p), switchTab: (id) => Mini.switchTab(id), reset: (id, p) => Mini.reset(id, p),
      refresh: () => renderFrame(fr, true), toast: (t, o) => Mini.toast(t, o), sheet: (o) => Mini.sheet(o), dialog: (o) => Mini.dialog(o), confirm: (t, o) => Mini.confirm(t, o),
      setTitle: (t) => { fr.title = t; paintTitle(fr); },
      onShow: (fn) => { fr.showHooks.push(fn); if (fr.visible) queueMicrotask(() => { try { fn(); } catch (e) { console.error(e); } }); }, onHide: (fn) => fr.hideHooks.push(fn), onRetap: (fn) => fr.retapHooks.push(fn), cleanup: (fn) => fr.cleanups.push(fn),
      get scroller() { return fr.scrollEl; }, get frame() { return fr.el; },
      get isRoot() { return fr.kind !== 'page'; }, isTop: () => top() === fr,
    };
    return ctx;
  }
  function buildChrome(fr) {
    const nav = fr.page.nav || {}, el = h('div.mini-pg', { 'data-id': fr.id });
    if (fr.kind === 'tab') el.dataset.tab = fr.id;
    if (fr.page.fill) el.dataset.fill = '';
    if (fr.page.bar) el.dataset.bar = '';
    if (nav.hide) el.dataset.nonav = '';
    if (nav.transparent) { el.dataset.trans = ''; el.dataset.overlay = ''; } else el.dataset.solid = '';
    const scroll = h('div.mini-scroll', { tabindex: '-1' }), content = h('div.mini-content'), dim = h('div.mini-dim');
    scroll.append(content);
    const bg = h('div.mini-nav-bg'); if (nav.bg) bg.style.background = nav.bg;
    const left = h('div.mini-nav-left'), mid = nav.center ? h('div.mini-nav-center') : h('h2.mini-nav-title'), right = h('div.mini-nav-right');
    const navEl = h('header.mini-nav', {}, bg, h('div.mini-nav-row', {}, left, mid, right), h('div.mini-netbar', { role: 'status' }, UI.icon('warn', 'icon--sm'), h('span.netmsg')));
    if (nav.color) navEl.style.color = nav.color;
    if (nav.hide) navEl.hidden = true;
    if (nav.left && nav.title == null && !nav.center) mid.hidden = true;
    if (nav.left) left.append(h('div.mini-nav-custom', {}, nav.left(fr.ctx)));
    else if (fr.kind === 'page') left.append(h('button.mini-navbtn.mini-back', { type: 'button', 'aria-label': '返回', on: { click: () => Mini.back() } }, UI.icon('left')));
    if (nav.capsule !== false) right.append(capsule());
    el.append(scroll, navEl, dim);
    Object.assign(fr, { el, scrollEl: scroll, contentEl: content, navEl, dim, leftEl: left, midEl: mid });
    if (nav.center) mid.append(nav.center(fr.ctx)); else paintTitle(fr);
    scroll.addEventListener('scroll', () => {
      const on = scroll.scrollTop > 24; if (!nav.transparent || on === fr.solid) return;
      fr.solid = on; el.toggleAttribute('data-solid', on); if (top() === fr) paintStatus();
    }, { passive: true });
  }
  function paintTitle(fr) {
    if (!fr.midEl || fr.page.nav && fr.page.nav.center) return;
    const nav = fr.page.nav || {}, t = fr.title != null ? fr.title : typeof nav.title === 'function' ? nav.title(fr.ctx) : nav.title != null ? nav.title : fr.page.title;
    fr.midEl.textContent = t || '';
  }
  function capsule() {
    const dots = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>', ring = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>';
    return h('div.mini-capsule', { role: 'group', 'aria-label': '小程序菜单' },
      h('button', { type: 'button', 'aria-label': '更多', html: dots, on: { click: capsuleMenu } }), h('i'),
      h('button', { type: 'button', 'aria-label': '关闭小程序', html: ring, on: { click: () => { Mini.reset('home'); Mini.toast('已回到首页'); } } }));
  }
  function capsuleMenu() {
    Mini.sheet({ title: '小程序菜单', body: (api) => h('div.mini-list', {},
      h('button', { type: 'button', on: { click: () => { api.close(); Mini.reset('home'); } } }, UI.icon('home'), h('span.grow', { text: '回到首页' })),
      h('button', { type: 'button', on: { click: () => { api.close(); renderFrame(top(), true); Mini.toast('已刷新'); } } }, UI.icon('refresh'), h('span.grow', { text: '刷新页面' })),
      h('button', { type: 'button', on: { click: () => { api.close(); Mini.push('feedback'); } } }, UI.icon('send'), h('span.grow', { text: '反馈与投诉' }))) });
  }

  /* ---- 渲染一帧：先处理通用场景（加载、失败、无权限、未登录），再交给页面 ---- */
  function renderFrame(fr, keepScroll) {
    fr.cleanups.splice(0).forEach((f) => { try { f(); } catch (e) { /* 页面清理失败不影响重绘 */ } });
    fr.showHooks.length = 0; fr.hideHooks.length = 0; fr.retapHooks.length = 0;
    const page = fr.page, ctx = fr.ctx, tok = ++fr.token, prev = fr.scrollEl.scrollTop, scene = UI.state.scene[fr.id] || 'normal';
    ctx.scene = scene; ctx.net = UI.state.net; fr.stale = false;
    fr.el.dataset.net = UI.state.net;
    fr.el.querySelector('.netmsg').textContent = UI.state.net === 'off' ? '当前没有网络，已加载的内容可以继续看' : UI.state.net === 'weak' ? '网络较慢，请稍等' : '';
    const put = (node) => { if (tok !== fr.token) return; fr.contentEl.replaceChildren(node); if (keepScroll) fr.scrollEl.scrollTop = prev; };
    const retry = () => { UI.state.scene[fr.id] = 'normal'; renderFrame(fr); };
    const netFail = () => put(h('section.mini-page', {}, Mini.error(() => renderFrame(fr))));
    if (page.auth && (!S.loggedIn || scene === 'login')) { put(gateView(fr)); if (!fr.gated) { fr.gated = true; setTimeout(() => { if (top() === fr && fr.token === tok) Mini.push('login', { redirect: 'back', from: fr.id }); }, dur('--dur-base', 200) + 80); } return; }
    fr.gated = false;
    if (scene === 'forbidden') return put(h('section.mini-page', {}, Mini.empty('账号已停用，暂时不能下单', { label: '联系门店', kind: 'default', on: () => Mini.dialog({ title: '联系门店', body: '拨打 ' + B.shop.phone + '，门店会帮你核实账号', actions: [{ label: '取消', value: null }, { label: '拨打', kind: 'primary', value: 'ok', on: () => Mini.toast('正在呼叫（模拟）') }] }) }, { illus: 'lock', sub: '停用期间仍可浏览菜单和门店' })));
    if (scene === 'loading') return put(page.skeleton ? page.skeleton(ctx) : Mini.skeleton(5));
    if (scene === 'error') return put(h('section.mini-page', {}, Mini.error(retry, '加载没有成功，请稍后再试')));
    let node;
    try { node = page.render(ctx); } catch (e) { console.error(e); return put(h('section.mini-page', {}, Mini.error(() => renderFrame(fr), '页面出了点问题，请重试'))); }
    if (node && typeof node.then === 'function') {
      const timer = setTimeout(() => { if (tok === fr.token) put(page.skeleton ? page.skeleton(ctx) : Mini.skeleton(5)); }, 300);
      node.then((n) => { clearTimeout(timer); put(n); }).catch((e) => { clearTimeout(timer); if (e && !e.offline) console.error(e); netFail(); });
    } else put(node);
  }
  function gateView(fr) {
    return h('section.mini-page', {}, Mini.empty('登录后可查看', { label: '去登录', on: () => Mini.push('login', { redirect: 'back', from: fr.id }) }, { illus: 'lock', sub: '登录后可以看到你的订单、会员卡和优惠券' }));
  }
  const fireShow = (fr) => { fr.visible = true; fr.showHooks.slice().forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };
  const fireHide = (fr) => { fr.visible = false; fr.hideHooks.slice().forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };
  function destroy(fr) { fireHide(fr); fr.cleanups.splice(0).forEach((f) => { try { f(); } catch (e) { /* 忽略 */ } }); fr.token++; fr.el.remove(); }
  function hideFrame(fr) { fr.el.dataset.hidden = ''; fr.el.inert = true; }
  function revealFrame(fr) { fr.el.removeAttribute('data-hidden'); fr.el.inert = false; if (fr.stale) renderFrame(fr, true); else if (fr.page.auth && S.loggedIn && fr.gated && UI.state.scene[fr.id] !== 'login') { fr.gated = false; renderFrame(fr, true); } }

  /* ---- 状态栏色调、标签栏、地址栏同步 ---- */
  function paintStatus() {
    const fr = top(); if (!fr) return; const nav = fr.page.nav || {}, trans = nav.transparent && !fr.solid;
    const tone = (trans ? nav.toneTop || nav.tone : nav.tone) || 'dark';
    statusEl.dataset.tone = tone; homeBar.dataset.tone = tone;
  }
  function sync() {
    const fr = top(); if (!fr) return;
    tabbar.hidden = !(S.base && S.base.kind === 'tab');
    $$('.mini-tab', tabbar).forEach((b) => b.setAttribute('aria-current', S.base && S.base.kind === 'tab' && b.dataset.id === S.base.id ? 'page' : 'false'));
    S.frames().forEach((f, i) => { f.el.style.zIndex = f.kind === 'page' ? 20 + i : 1; });
    paintStatus();
    const hash = fmtHash(fr.id, fr.params); S.hash = hash; if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  S.frames = () => [S.base].concat(S.pages).concat(Object.values(S.tabs).filter((f) => f !== S.base)).filter(Boolean);

  /* ---- 导航：push / back / replace / switchTab / reset / go ---- */
  function tabFrame(id, params) { if (!S.tabs[id]) { S.tabs[id] = makeFrame(id, params, 'tab'); stack.append(S.tabs[id].el); hideFrame(S.tabs[id]); } return S.tabs[id]; }
  Mini.push = (id, params) => {
    settle(); const prev = top();
    if (S.pages.length >= 9) { Mini.replace(id, params); return; }
    fireHide(prev);
    const fr = makeFrame(id, params, 'page'); S.pages.push(fr); stack.append(fr.el); sync();
    if (UI.rm) { hideFrame(prev); fireShow(fr); return; }
    const d = dur('--dur-slow', 300);
    const a = fr.el.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: d, easing: EASE_IN });
    const b = prev.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-30%)' }], { duration: d, easing: EASE_IN, fill: 'forwards' });
    const c = prev.dim.animate([{ opacity: 0 }, { opacity: 0.14 }], { duration: d, easing: EASE_IN, fill: 'forwards' });
    wait([a, b, c], () => { hideFrame(prev); fireShow(fr); });
  };
  Mini.back = () => {
    settle(); if (!S.pages.length) return;
    const fr = S.pages.pop(), below = top(); fireHide(fr);
    below.el.removeAttribute('data-hidden'); below.el.inert = false; sync();
    if (below.stale) renderFrame(below, true);
    if (UI.rm) { destroy(fr); revealFrame(below); fireShow(below); return; }
    const d = dur('--dur-dialog', 240);
    const a = fr.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: d, easing: EASE_OUT, fill: 'forwards' });
    const b = below.el.animate([{ transform: 'translateX(-30%)' }, { transform: 'translateX(0)' }], { duration: d, easing: EASE_IN });
    const c = below.dim.animate([{ opacity: 0.14 }, { opacity: 0 }], { duration: d, easing: EASE_IN });
    wait([a, b, c], () => { destroy(fr); revealFrame(below); fireShow(below); });
  };
  Mini.replace = (id, params) => {
    settle(); const old = S.pages.pop() || null, prev = top();
    if (old) destroy(old);
    const fr = makeFrame(id, params, 'page'); S.pages.push(fr); stack.append(fr.el); if (!old) hideFrame(prev); sync();
    if (!UI.rm) UI.play(fr.el, [{ opacity: 0 }, { opacity: 1 }], { duration: dur('--dur-base', 200), easing: EASE_IN }); fireShow(fr);
  };
  Mini.switchTab = (id, params) => {
    settle();
    if (S.base && S.base.kind === 'tab' && S.base.id === id && !S.pages.length) { const f = S.base; f.retapHooks.length ? f.retapHooks.forEach((fn) => fn()) : f.scrollEl.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' }); return; }
    UI.go(() => {
      S.pages.splice(0).forEach(destroy);
      if (S.base && S.base.kind === 'root') { S.base.el.remove(); S.base = null; }
      const old = S.base, fr = tabFrame(id, params);
      if (old && old !== fr) { fireHide(old); hideFrame(old); }
      S.base = fr; revealFrame(fr); sync(); fireShow(fr);
    });
  };
  /** 重置页面栈：目标是标签页就切到它，否则作为独立的根页面（没有标签栏，例如首次进入时的登录页） */
  Mini.reset = (id, params) => {
    const page = pageOf(id); if (page.tab) { Mini.switchTab(id, params); return; }
    settle();
    UI.go(() => {
      S.pages.splice(0).forEach(destroy); Object.values(S.tabs).forEach(destroy); S.tabs = {}; if (S.base) S.base.el.remove();
      S.base = makeFrame(id, params, 'root'); stack.append(S.base.el); sync(); fireShow(S.base);
    });
  };
  /** 直接跳到某页（页面直达、地址栏）：标签页就切标签；二级页放在它的 from 标签上面，没有动画 */
  Mini.go = (id, params) => {
    settle(); const page = pageOf(id);
    if (page.tab) { Mini.switchTab(id, params); return; }
    const from = page.from || (S.base && S.base.kind === 'tab' ? S.base.id : 'home');
    UI.go(() => {
      S.pages.splice(0).forEach(destroy);
      if (S.base && S.base.kind === 'root') { S.base.el.remove(); S.base = null; }
      const baseF = tabFrame(from); if (S.base && S.base !== baseF) hideFrame(S.base); S.base = baseF; hideFrame(baseF);
      const fr = makeFrame(id, params, 'page'); S.pages.push(fr); stack.append(fr.el); sync(); fireShow(fr);
    });
  };
  Mini.refresh = () => renderFrame(top(), true);
  /** 登录成功后的去向：根页面登录回首页，二级页登录回到来源并刷新 */
  Mini.afterLogin = (ctx) => {
    Mini.auth.login(); const from = ctx.params.from; if (from && UI.state.scene[from] === 'login') UI.state.scene[from] = 'normal';
    if (ctx.isRoot || !S.pages.length) Mini.reset('home'); else Mini.back();
    Mini.frames().forEach((f) => { if (f !== top()) f.stale = true; });
  };
  Mini.frames = () => S.frames();

  /* ---- UI.demo 要的 app 对象 ---- */
  Mini.app = {
    route() { S.frames().forEach((f) => { f.stale = true; }); renderFrame(top(), true); top().stale = false; },
    go(id) { Mini.go(id); },
    repaintNav() { sync(); },
  };

  /* =====================================================================================
     容器内弹层：Mini.sheet / Mini.dialog / Mini.confirm / Mini.toast / Mini.fly
     ===================================================================================== */
  let ovSeq = 0;
  function overlay(kind, o) {
    const prevFocus = document.activeElement, cls = kind === 'sheet' ? 'mini-sheet' : 'mini-dialog', tid = 'mini-ov-t' + ++ovSeq;
    let resolve; const p = new Promise((r) => { resolve = r; });
    const api = { close: (v) => close(v === undefined ? null : v), el: null };
    const scrim = h('div.mini-scrim.on', { on: { click: () => o.dismiss !== false && api.close(null) } });
    const head = kind === 'sheet'
      ? h('div.mini-sheet-head', {}, h('h2', { id: tid, text: o.title || '' }), o.dismiss === false ? null : h('button.mini-navbtn', { type: 'button', 'aria-label': '关闭', on: { click: () => api.close(null) } }, UI.icon('x')))
      : h('h2', { id: tid, text: o.title || '' });
    const body = h(kind === 'sheet' ? 'div.mini-sheet-body' : 'div.mini-dlg-body' + (o.left ? '.left' : ''));
    const foot = (o.actions || []).length ? h(kind === 'sheet' ? 'div.mini-sheet-foot' : 'div.mini-dlg-foot') : null;
    (o.actions || []).forEach((a) => {
      const b = h('button.btn' + (a.kind ? '.btn--' + a.kind.split(' ').join('.btn--') : ''), { type: 'button', text: a.label, disabled: !!a.disabled, on: { click: async () => {
        if (b.disabled) return;
        if (a.on) { b.disabled = true; const t = b.textContent; b.replaceChildren(h('span.spin'), ' ' + t); let r; try { r = await a.on(body, api); } finally { b.disabled = false; b.textContent = t; } if (r === false) return; }
        api.close(a.value === undefined ? 'ok' : a.value);
      } } });
      foot.append(b);
    });
    const box = h('div.' + cls + (o.tall ? '.tall' : '') + '.on', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1' }, head, body, foot);
    api.el = box; api.body = body;
    const bodyNode = typeof o.body === 'function' ? o.body(api) : typeof o.body === 'string' ? h('p', { text: o.body, style: { whiteSpace: 'pre-line' } }) : o.body;
    if (bodyNode) body.append(bodyNode);
    let closed = false;
    function close(v) {
      if (closed) return; closed = true;
      S.overlays = S.overlays.filter((x) => x !== entry);
      scrim.classList.remove('on'); box.classList.remove('on');
      if (!S.overlays.length) stack.inert = false;
      setTimeout(() => { scrim.remove(); box.remove(); if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); }, dur('--dur-close', 160) + 40);
      resolve(v);
    }
    const entry = { api, dismiss: o.dismiss !== false };
    S.overlays.push(entry); stack.inert = true;
    layer.append(scrim, box);
    const first = $('[autofocus],input:not([type=checkbox]),textarea,select', body) || (foot && $('.btn--primary', foot)) || $('button', head);
    first && first.focus({ preventScroll: true });
    p.close = api.close; p.api = api;
    return p;
  }
  /** 底部弹层：title、body（节点、文字，或 (api)=>节点）、actions [{label, kind, value, on(body, api)}]、tall、dismiss；返回 Promise（点按钮得按钮的 value，点遮罩或关闭得 null），也带 .close(value) */
  Mini.sheet = (o) => overlay('sheet', o);
  /** 居中对话框，宽为手机框的 80% */
  Mini.dialog = (o) => overlay('dialog', o);
  /** 确认框：Mini.confirm('正文', {title, ok, danger}) → Promise<boolean> */
  Mini.confirm = (text, o) => { o = o || {}; return overlay('dialog', { title: o.title || '请确认', body: text, actions: [{ label: o.cancel || '取消', value: null }, { label: o.ok || '确定', kind: o.danger ? 'danger.solid' : 'primary', value: 'ok' }] }).then((v) => v === 'ok'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.overlays.length) { const t = S.overlays[S.overlays.length - 1]; if (t.dismiss) { e.preventDefault(); t.api.close(null); } } });
  /** 轻提示：成功约 1.5 秒，错误 3 秒；o.action = {label, on} 带一个“撤销”之类的按钮（4 秒） */
  Mini.toast = (text, o) => {
    o = o || {}; const bad = o.kind === 'bad';
    const t = h('div.toast' + (bad ? '.bad' : ''), {}, UI.icon(bad ? 'warn' : 'check', 'icon--sm'), h('span', { text }), o.action ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: o.action.label, on: { click: () => { gone(); o.action.on && o.action.on(); } } }) : null);
    const gone = () => { t.classList.add('out'); setTimeout(() => t.remove(), 180); };
    while (toasts.children.length >= 2) toasts.firstChild.remove();
    toasts.append(t); setTimeout(gone, o.duration || (bad ? 3000 : o.action ? 4000 : 1500));
  };
  /** 加购飞入：商品图从 src 元素飞到 dst 元素（购物车图标），完成后返回 */
  Mini.fly = (src, dst, img) => {
    if (UI.rm || !src || !dst || !phone) return Promise.resolve();
    const pr = phone.getBoundingClientRect(), a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    const x0 = a.left + a.width / 2 - pr.left - 18, y0 = a.top + a.height / 2 - pr.top - 18, x1 = b.left + b.width / 2 - pr.left - 18, y1 = b.top + b.height / 2 - pr.top - 18;
    const el = h('img.mini-fly', { src: img || '', alt: '' }); el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; phone.append(el);
    const an = el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(0.4)`, opacity: 0.5 }], { duration: dur('--dur-slow', 300) + 100, easing: EASE_STD });
    return an.finished.then(() => el.remove(), () => el.remove());
  };

  /* =====================================================================================
     启动：Mini.start({root, loggedIn}) 建手机框，再按地址栏进入页面
     ===================================================================================== */
  Mini.start = function (o) {
    S.loggedIn = !!o.loggedIn;
    const sig = '<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
    const wifi = '<svg viewBox="0 0 17 12" aria-hidden="true"><path d="M8.5 11.5l-2-2.2a2.9 2.9 0 0 1 4 0zM3.8 6.6a6.6 6.6 0 0 1 9.4 0l-1.3 1.4a4.7 4.7 0 0 0-6.8 0zM1 3.7a10.4 10.4 0 0 1 15 0l-1.3 1.4a8.5 8.5 0 0 0-12.4 0z"/></svg>';
    const bat = '<svg viewBox="0 0 27 13" aria-hidden="true"><rect class="bat" x="0.75" y="0.75" width="22" height="11.5" rx="3.2" stroke-width="1.5" opacity=".45"/><rect x="2.5" y="2.5" width="16.5" height="8" rx="1.8" fill="currentColor"/><path d="M25 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2z" fill="currentColor" opacity=".5"/></svg>';
    const time = B.fmt(B.NOW()).slice(11);
    statusEl = h('div.mini-status', { 'aria-hidden': 'true' }, h('span', { text: time }), h('span.sys', { html: sig + wifi + bat }));
    homeBar = h('div.mini-home-bar', { 'aria-hidden': 'true' });
    stack = h('div.mini-stack');
    tabbar = h('nav.mini-tabbar', { 'aria-label': '底部标签', hidden: true }, TABS.map(([id, label, icon]) => h('button.mini-tab', { type: 'button', 'data-id': id, 'aria-current': 'false', on: { click: () => Mini.switchTab(id) } }, UI.icon(icon), h('span', { text: label }))));
    layer = h('div.mini-layer'); toasts = h('div.mini-toasts', { role: 'status', 'aria-live': 'polite' });
    stack.append(tabbar);
    phone = h('div.mini-phone', {}, stack, statusEl, homeBar, layer, toasts);
    stage = h('main.mini-stage', {}, phone);
    o.root.replaceChildren(stage);
    window.addEventListener('hashchange', () => { if (location.hash === S.hash) return; const t = parseHash(); if (t) Mini.go(t.id, t.params); });
    const t = parseHash();
    if (t && (PAGES[t.id] || t.id)) { Mini.go(t.id, t.params); return; }
    if (S.loggedIn || o.guest) Mini.reset('home'); else Mini.reset('login');
  };
})();
