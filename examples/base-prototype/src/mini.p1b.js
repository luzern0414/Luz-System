/* 第一批页面（二）：点单、商品详情、购物车。共用的商品行、规格弹层、价格组件在 mini.p1.js 里（Mini.pick、Mini.p1）。
   购物车数据与算法在 mini.p0.js 的 Mini.cart（B.db.cart）。 */
(function () {
  'use strict';
  const { h } = UI;
  const P1 = Mini.p1;
  const $ = (s, r) => (r || document).querySelector(s);
  const money = Mini.money;

  /* ---------- 购物车里的一行：勾选（购物车页）、图、名称、规格、价格、步进器；数量为 1 时点减号即移除并给撤销 ---------- */
  const limitHint = (l) => {
    const p = Mini.product(l.pid); if (!p) return '';
    const room = Mini.cart.room(p), left = Mini.rules.left(p), r = Mini.rules.of(p);
    if (room >= 1) return Mini.cart.low(l) ? '仅剩 ' + Mini.cart.low(l) + ' 件' : '';
    return left !== Infinity && left - Mini.cart.countOf(p.id) <= 0 ? '已达购买上限' : r.max && Mini.cart.countOf(p.id) >= r.max ? '每单最多 ' + r.max + ' 件' : '库存只有 ' + p.stock + ' 件';
  };
  P1.lineRow = (ctx, l, o) => {
    o = o || {}; const p = Mini.product(l.pid), st = Mini.cart.state(l), dead = !st.ok;
    const dec = async () => {
      if (l.qty > 1) return Mini.cart.setQty(l.key, l.qty - 1);
      const snap = Mini.cart.snapshot(); if (await Mini.cart.remove(l.key)) Mini.toast('已移除 ' + l.name, { action: { label: '撤销', on: () => Mini.cart.restore(snap) } });
    };
    const inc = () => { if (Mini.cart.room(p) < 1) return Mini.toast(limitHint(l), { kind: 'bad' }); Mini.cart.setQty(l.key, l.qty + 1); };
    const prob = o.problem, hint = dead ? '' : limitHint(l);
    const img = h('img', { src: l.img, alt: '', loading: 'lazy' });
    const row = h('article.m1-line' + (dead ? '.is-off' : '') + (o.compact ? '.compact' : ''), { 'data-key': l.key },
      o.check ? h('label.mini-check', {}, h('input', { type: 'checkbox', checked: !!l.selected, disabled: dead, 'aria-label': '选择 ' + l.name, 'data-fk': l.key + ':sel', on: { change: (e) => Mini.cart.select(l.key, e.target.checked) } })) : null,
      h('div.m1-line-img', {}, img),
      h('div.m1-line-main', {},
        h('div.m1-line-top', {}, h('h3.m1-name', { text: l.name }), o.remove ? h('button.m1-trash', { type: 'button', 'aria-label': '删除 ' + l.name, 'data-fk': l.key + ':del', on: { click: () => o.remove(l, row) } }, UI.icon('trash', 'icon--sm')) : null),
        h('p.muted', { text: l.spec || '默认规格' }),
        dead ? h('div', {}, h('span.mini-tag.mini-tag--bad', { text: st.text }), st.fix ? h('button.m1-text', { type: 'button', text: '改为 ' + st.fix + ' 件', style: { marginLeft: '8px' }, on: { click: () => Mini.cart.setQty(l.key, st.fix) } }) : null) : (hint || prob) ? h('p.m1-warn', {}, prob ? prob.text : hint, prob && prob.fix ? h('button.m1-text', { type: 'button', text: prob.fix.label, on: { click: () => (prob.fix.qty ? Mini.cart.setQty(l.key, prob.fix.qty) : Mini.cart.remove(l.key)) } }) : null) : null,
        h('div.m1-line-foot', {}, h('div.m1-pr', {}, Mini.price(l.unit, { trim: false }), l.orig > l.unit ? h('span.mini-strike', { text: money(l.orig, 0) }) : null),
          dead ? null : h('div.mini-steps', {}, h('button', { type: 'button', 'aria-label': '减少一份：' + l.name, 'data-fk': l.key + ':dec', on: { click: dec } }, h('span', {}, UI.icon('minus'))), h('output.num', { text: String(l.qty), 'aria-label': '数量' }),
            h('button.plus', { type: 'button', 'aria-label': '增加一份：' + l.name, 'data-fk': l.key + ':inc', disabled: Mini.cart.room(p) < 1, on: { click: inc } }, h('span', {}, UI.icon('plus')))))));
    return row;
  };
  /** 重绘后把焦点还给同一个按钮（键盘用户不丢位置） */
  const keepFocus = (root, draw) => { const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fk; draw(); if (fk) { const n = root.querySelector('[data-fk="' + fk.replace(/"/g, '') + '"]'); n && !n.disabled && n.focus({ preventScroll: true }); } };
  const flashLine = (root, o) => { if (o && o.key) Mini.flash([...root.querySelectorAll('.m1-line')].find((r) => r.dataset.key === o.key)); };
  const goCheckout = (ctx) => { Mini.cart.selectAll(true); ctx.push('checkout'); };

  /* ---------- 购物车弹层（点单页悬浮栏展开）：每行增减、清空 ---------- */
  P1.cartSheet = (ctx) => {
    const st = P1.shopOf(ctx); let off = () => {};
    const body = (api) => {
      const box = h('div.m1-csheet');
      const draw = (o) => { keepFocus(box, () => {
        const ok = Mini.cart.valid(), bad = Mini.cart.invalid(), q = Mini.cart.quote(ok), go = $('.btn--primary', api.el), clr = $('.btn--danger', api.el);
        box.replaceChildren();
        if (!ok.length && !bad.length) { box.append(Mini.empty('购物车是空的', { label: '去选购', kind: 'tint', on: () => api.close() }, { sub: '选好的商品会放在这里' })); if (go) { go.disabled = true; go.textContent = '去结算'; } if (clr) clr.disabled = true; return; }
        box.append(h('p.muted', { text: '共 ' + q.count + ' 件' + (bad.length ? '，另有 ' + bad.length + ' 件已失效' : '') }), h('div', {}, ok.map((l) => P1.lineRow(ctx, l, { compact: true })), bad.map((l) => P1.lineRow(ctx, l, { compact: true, remove: (x) => Mini.cart.remove(x.key) }))));
        if (go) { go.disabled = !st.canOrder || !ok.length; go.textContent = st.canOrder ? '去结算 ' + money(q.pay) : '暂停营业'; }
        if (clr) clr.disabled = false;
      }); flashLine(box, o); };
      off = Mini.on('cart', draw); draw(); return box;
    };
    const p = Mini.sheet({ title: '已选商品', body, actions: [
      { label: '清空', kind: 'danger', value: null, on: async (b, api) => { const n = Mini.cart.lines().length; if (!n) return false; if (!(await Mini.confirm('清空购物车里的 ' + n + ' 件商品，清空后需要重新选购', { title: '清空购物车', ok: '清空', danger: true }))) return false; await Mini.cart.clear(); return false; } },
      { label: '去结算', kind: 'primary', value: 'go' }] });
    return p.then((v) => { off(); if (v === 'go') goCheckout(ctx); return v; });
  };

  /* =====================================================================================
     点单（标签页；主区加侧栏变体）：左侧分类栏，右侧商品列表，点分类滚到对应区，滚动时分类高亮；底部悬浮购物车栏
     ===================================================================================== */
  window.PAGES_MINI.menu = {
    title: '点单', tab: 'menu', fill: true, nav: { title: '点单' },
    layout: '主区加侧栏变体', reason: '点单是高频的核心任务：商品列表是主区，左边一条窄的分类栏当导航，两边联动；门店、搜索、券条压成顶部三行，购物车悬浮在底部不占版面',
    scenes: [{ id: 'rest', label: '营业状态：休息中（只能浏览）' }, { id: 'closed', label: '营业状态：已打烊（只能浏览）' }, { id: 'paused', label: '营业状态：暂停营业（只能浏览）' }, { id: 'allsoldout', label: '商品全部售罄' }],
    skeleton: () => h('div', { style: { padding: '12px 0 0' } }, h('div.mini-skel', {}, h('div.skel', { style: { height: '44px' } }), h('div.skel', { style: { height: '44px' } })), h('div', { style: { display: 'grid', gridTemplateColumns: '88px 1fr', marginTop: '12px' } }, h('div.skel', { style: { height: '320px', borderRadius: '0' } }), Mini.skeleton(4))),
    render: P1.net((ctx) => {
      const st = P1.shopOf(ctx), store = B.db.stores.find((s) => s.id === B.db.curStore) || B.db.stores[0], rows = [];
      const on = B.db.products.filter((p) => p.status === 'ON'), hotItems = on.filter((p) => p.stock > 0 && ctx.scene !== 'allsoldout').sort((a, b) => b.sales - a.sales).slice(0, 4);
      const secs = [{ id: 'hot', name: '热销', sub: '大家都在点', items: hotItems }].concat(B.CATS.filter((c) => c.id !== 'hot').map((c) => ({ id: c.id, name: c.name, items: B.db.products.filter((p) => p.cat === c.id && !hotItems.includes(p)).sort((a, b) => (a.status === 'ON' ? 0 : 1) - (b.status === 'ON' ? 0 : 1)) }))).filter((s) => s.items.length);
      const root = h('div.m1-menu');
      if (!secs.length || ctx.scene === 'empty') { root.append(h('div', { style: { padding: '32px 16px' } }, Mini.empty('今天的菜单还没有上架', { label: '看看其他门店', kind: 'tint', on: () => ctx.push('stores') }, { sub: '上架后会显示在这里' }))); return root; }
      /* 顶部：门店与排队、搜索入口、券条 */
      const cps = P1.couponsOf(), soon = cps.slice().sort((a, b) => (a.expire < b.expire ? -1 : 1))[0], couponOn = (B.db.config.runtime.find((c) => c.key === 'feature.coupon') || {}).value !== false;
      const head = h('div.m1-mtop', {},
        h('div.m1-mshop', {}, h('div.grow', {}, h('div.row', { style: { gap: '8px' } }, h('h2.m1-mshop-name', { text: store.name }), Mini.shop.badge(st)), h('p.muted', { text: st.canOrder ? (store.queue ? '前方 ' + store.queue + ' 单制作中 · 约 ' + store.queue * 3 + ' 分钟取餐' : '现在下单马上制作') : st.hint })),
          h('button.mini-link', { type: 'button', on: { click: () => ctx.push('stores') } }, '换店', UI.icon('right'))),
        h('button.m1-sentry', { type: 'button', on: { click: () => ctx.push('search') } }, UI.icon('search', 'icon--sm'), h('span', { text: '搜索菜品，例如牛腩饭' })),
        couponOn && cps.length ? h('button.m1-couponbar', { type: 'button', on: { click: () => ctx.push('coupons') } }, UI.icon('tag', 'icon--sm'), h('span.grow', { text: cps.length + ' 张优惠券可用' + (soon ? ' · ' + (P1.daysTo(soon.expire) <= 0 ? '今天到期' : P1.daysTo(soon.expire) + ' 天后到期') : '') }), h('span.m1-go', { text: '去查看' })) : null);
      /* 左栏与右列表 */
      const rail = h('nav.m1-rail', { 'aria-label': '菜品分类' }), list = h('div.m1-mlist');
      const railBtns = secs.map((s) => { const b = h('button.m1-rail-item', { type: 'button', 'data-cat': s.id, 'aria-current': 'false', on: { click: () => go(s.id) } }, h('span', { text: s.name }), h('i.mini-badge', { 'data-sec': s.id })); rail.append(b); return b; });
      const secEls = secs.map((s) => {
        const el = h('section.m1-msec', { 'data-cat': s.id, 'aria-label': s.name }, h('h3.m1-msec-h', {}, s.name, s.sub ? h('span.muted', { text: s.sub }) : null),
          h('div.m1-msec-rows', {}, s.items.map((p) => { const r = P1.row(ctx, p, { to: () => $('.m1-cartmain .icon', root) }); rows.push(r); return r; })));
        list.append(el); return el;
      });
      list.append(h('div.m1-mend', { text: '没有更多了' }));
      let active = '', lockUntil = 0;
      const setActive = (id) => { if (id === active) return; active = id; railBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.cat === id))); const b = railBtns.find((x) => x.dataset.cat === id); if (b) { const top = b.offsetTop, h2 = rail.clientHeight; if (top < rail.scrollTop || top + b.offsetHeight > rail.scrollTop + h2) rail.scrollTo({ top: Math.max(0, top - h2 / 2), behavior: UI.rm ? 'auto' : 'smooth' }); } };
      const go = (id) => { setActive(id); lockUntil = Date.now() + 600; const el = secEls[secs.findIndex((s) => s.id === id)]; list.scrollTo({ top: el.offsetTop, behavior: UI.rm ? 'auto' : 'smooth' }); };
      let raf = 0;
      list.addEventListener('scroll', () => { if (raf || Date.now() < lockUntil) return; raf = requestAnimationFrame(() => { raf = 0; const y = list.scrollTop + 8; let cur = secs[0].id; secEls.forEach((el, i) => { if (el.offsetTop <= y) cur = secs[i].id; }); if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) cur = secs[secs.length - 1].id; setActive(cur); }); }, { passive: true });
      /* 悬浮购物车栏 */
      const icon = h('span.m1-cartico', {}, UI.icon('cart'), Mini.badge(0)), total = h('div.m1-cart-total'), sub = h('div.m1-cart-sub');
      const main = h('button.m1-cartmain', { type: 'button', 'aria-label': '查看已选商品', on: { click: () => P1.cartSheet(ctx) } }, icon, h('div', {}, total, sub));
      const goBtn = h('button.btn.btn--primary', { type: 'button', text: '去结算', on: { click: () => goCheckout(ctx) } });
      const bar = h('div.m1-cartbar', {}, main, goBtn);
      const paintBar = () => {
        const ok = Mini.cart.valid(), q = Mini.cart.quote(ok), n = q.count; Mini.setBadge($('.mini-badge', icon), n); icon.classList.toggle('empty', !n);
        total.replaceChildren(n ? Mini.price(q.pay, { trim: false }) : h('span', { text: '暂无商品，请先选购' }));
        sub.textContent = !st.canOrder ? st.hint : !n ? '' : q.coupon ? '已减 ' + money(q.discount, 0) + ' · 预估到手' : q.next ? '再买 ' + money(q.next.need, 0) + ' 可用' + q.next.name : '到店自取，无配送费';
        sub.hidden = !sub.textContent;
        goBtn.disabled = !st.canOrder || !n; goBtn.textContent = st.canOrder ? '去结算' : '暂停营业';
        railBtns.forEach((b) => { const sec = secs.find((s) => s.id === b.dataset.cat); Mini.setBadge($('.mini-badge', b), sec.items.reduce((a, p) => a + Mini.cart.countOf(p.id), 0)); });
      };
      let last = 0;
      ctx.cleanup(Mini.on('cart', () => { rows.forEach((r) => r.sync && r.sync()); const n = Mini.cart.count(); paintBar(); if (n > last) Mini.bump($('.mini-badge', icon)); last = n; }));
      ctx.onRetap(() => list.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' }));
      root.append(head, h('div.m1-mbody', {}, rail, list), bar);
      last = Mini.cart.count(); paintBar(); setActive(secs[0].id);
      return root;
    }),
  };

  /* =====================================================================================
     商品详情（主次布局）：图集大图是主角，名称价格、规格、介绍、评价依次往下；底部一个主操作“立即购买”
     ===================================================================================== */
  const DETAIL = (p) => [p.desc + '。食材每日新鲜采购，下单后现做现出，出餐约 8 分钟，请凭取餐号到店自取。', '主食搭配当季时蔬和例汤，米饭可免费续添一次；如有忌口，可在结算时备注。', '图片仅供参考，以实物为准。'];
  window.PAGES_MINI.product = {
    title: '商品详情', tab: null, from: 'menu', bar: true, nav: { transparent: true, tone: 'dark', title: '商品详情' },
    layout: '主次布局', reason: '一张大图的图集是主角，占首屏一半以上；名称价格紧跟其后，规格、介绍、评价是次要的小块，往下才看；底部固定栏只有一个主操作“立即购买”',
    scenes: [{ id: 'soldout', label: '已售罄' }, { id: 'off', label: '已下架' }, { id: 'limit', label: '已达购买上限' }, { id: 'rest', label: '营业状态：休息中' }, { id: 'closed', label: '营业状态：已打烊' }, { id: 'paused', label: '营业状态：暂停营业' }, { id: 'noreview', label: '还没有评价' }],
    skeleton: () => h('div', {}, h('div.skel', { style: { aspectRatio: '1', borderRadius: '0' } }), h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '88px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '56px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '120px', borderRadius: 'var(--r-md)' } }))),
    render: P1.net((ctx) => {
      const p = Mini.product(ctx.params.pid || 1);
      if (!p) return h('section.mini-page', { style: { paddingTop: 'var(--m-top)' } }, Mini.empty('这件商品不存在或已下架', { label: '返回', kind: 'tint', on: () => ctx.back() }));
      const st = P1.shopOf(ctx), pst = ctx.scene === 'limit' ? 'limit' : Mini.pstate(p, ctx.scene), sel = Mini.defaultSpecs(p), spec = P1.hasSpecs(p);
      const idx = B.db.products.indexOf(p), n = B.db.products.length, pics = [p.img, B.db.products[(idx + 1) % n].img, B.db.products[(idx + 5) % n].img];
      /* 图集 */
      const gal = h('div.m1-gal', { role: 'group', 'aria-label': '商品图片，共 ' + pics.length + ' 张', tabindex: '0' }, pics.map((s, i) => h('img', { src: s, alt: i === 0 ? p.name : p.name + '，图 ' + (i + 1) })));
      const dots = h('div.m1-gdots', { 'aria-hidden': 'true' }, pics.map((_, i) => h('i', { class: i === 0 ? 'on' : '' }))), count = h('span.m1-gcount', { text: '1/' + pics.length });
      gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); count.textContent = (i + 1) + '/' + pics.length; }, { passive: true });
      /* 价格与名称 */
      const unit = () => Mini.specPrice(p, sel), rulesTx = Mini.rules.texts(p);
      const priceRow = h('div.m1-prow'), paintPrice = () => priceRow.replaceChildren(Mini.price(unit(), { size: 'xl' }), p.orig > p.price ? h('span.m1-ptype', { text: '原价' }) : null, p.orig > p.price ? h('span.mini-strike', { text: money(p.orig + unit() - p.price, 0) }) : null, h('span.muted.m1-sold', { text: '已售 ' + p.sales }));
      paintPrice();
      const info = h('div.mini-card.m1-pcard', {}, priceRow, h('h2.m1-pname', { text: p.name }), h('p.muted', { text: p.desc }),
        (p.tags.length || rulesTx.length) ? h('div.m1-tags', {}, p.tags.map((t) => h('span.mini-tag.mini-tag--price', { text: t })), rulesTx.map((t) => h('span.mini-tag', { text: t }))) : null);
      /* 规格行 */
      const specText = h('span.grow'), paintSpec = () => { specText.textContent = '已选 ' + Mini.specText(sel); };
      paintSpec();
      const specRow = spec ? h('button.mini-card.m1-rowbtn', { type: 'button', on: { click: () => Mini.pick(ctx, p, { buy: true, specs: sel, to: () => cartBtn, onPick: (s) => { Object.assign(sel, s); paintSpec(); paintPrice(); } }) } }, h('b', { text: '规格' }), specText, UI.icon('right', 'icon--sm')) : null;
      /* 介绍、价格说明 */
      const text = DETAIL(p), more = h('button.mini-link', { type: 'button', 'aria-expanded': 'false', text: '展开' }), intro = h('p.m1-intro.clamp', { text: text.join('') });
      more.addEventListener('click', () => { const open = intro.classList.toggle('clamp') === false; more.textContent = open ? '收起' : '展开'; more.setAttribute('aria-expanded', String(open)); });
      const note = h('button.mini-card.m1-rowbtn', { type: 'button', on: { click: () => Mini.dialog({ title: '价格说明', left: true, body: h('div.m1-prose', {}, h('p', { text: '划线价是本店该商品标准规格的日常标价，不是其他渠道的价格。' }), h('p', { text: '预估到手价按你的优惠券自动计算，实付以结算页为准，可能与预估不同。' })), actions: [{ label: '知道了', kind: 'primary' }] }) } }, h('b', { text: '价格说明' }), h('span.grow.muted', { text: '划线价与到手价怎么算' }), UI.icon('right', 'icon--sm'));
      /* 评价摘要 */
      const rv = ctx.scene === 'noreview' ? [] : B.db.reviews.filter((r) => r.pid === p.id), good = rv.filter((r) => r.rating >= 4).length;
      const reviews = h('div.mini-card.m1-rv', {}, h('div.mini-sec', {}, h('h3', { text: '评价（' + rv.length + '）' }), rv.length ? h('button.mini-link', { type: 'button', on: { click: () => Mini.sheet({ title: '全部评价（' + rv.length + '）', tall: true, body: h('div', {}, rv.map(revItem)) }) } }, '好评率 ' + Math.round(good / rv.length * 100) + '%', UI.icon('right')) : null),
        rv.length ? h('div', {}, rv.slice(0, 2).map(revItem)) : h('p.muted', { text: '还没有评价，下单后可以来写第一条' }));
      function revItem(r) { return h('article.m1-rvi', {}, h('div.row', { style: { gap: '8px' } }, h('b', { text: r.user }), P1.star(r.rating), h('span.muted.grow', { style: { textAlign: 'right' }, text: r.at })), h('p', { text: r.text })); }
      /* 底部固定栏 */
      const cartBadge = Mini.badge(Mini.cart.count()), cartBtn = h('button.m1-pcart', { type: 'button', 'aria-label': '购物车', on: { click: () => ctx.push('cart') } }, UI.icon('cart'), cartBadge, h('span', { text: '购物车' }));
      ctx.cleanup(Mini.on('cart', () => { const c = Mini.cart.count(), up = c > Number(cartBadge.dataset.n || 0); Mini.setBadge(cartBadge, c); if (up) Mini.bump(cartBadge); }));
      const bar = h('div.m1-pbar', {}, cartBtn);
      const addNow = async (btn, buy) => {
        btn.disabled = true; const t = btn.textContent; btn.replaceChildren(h('span.spin'), ' ' + t);
        const r = await Mini.cart.add(p, { specs: Object.assign({}, sel), qty: Mini.rules.min(p) });
        btn.disabled = false; btn.textContent = t;
        if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' });
        if (buy) { Mini.cart.valid().forEach((l) => { l.selected = l === r.line; }); Mini.emit('cart'); return ctx.push('checkout'); }
        Mini.toast('已加入购物车'); Mini.fly(gal.firstChild, cartBtn, p.img);
      };
      const dis = (t) => h('button.btn.grow', { type: 'button', disabled: true, text: t });
      if (!st.canOrder) bar.append(dis(st.label + '，暂不能下单'));
      else if (pst === 'off') bar.append(dis('已下架'));
      else if (pst === 'limit') bar.append(dis('已达购买上限'));
      else if (pst === 'soldout') { const nb = h('button.btn.btn--tint.grow', { type: 'button', text: '到货通知', on: { click: () => { nb.textContent = '已设置到货通知'; nb.disabled = true; Mini.toast('到货后会通知你'); } } }); bar.append(nb, dis('已售罄')); }
      else { const a = h('button.btn.btn--tint.grow', { type: 'button', text: '加入购物车', on: { click: () => addNow(a, false) } }), b = h('button.btn.btn--primary.grow', { type: 'button', text: '立即购买', on: { click: () => addNow(b, true) } }); bar.append(a, b); }
      const page = h('section.mini-page.m1-product', {}, h('div.m1-galwrap', {}, gal, dots, count), h('div.m1-pbody', {}, info, specRow, h('div.mini-card.m1-desc-card', {}, h('div.mini-sec', {}, h('h3', { text: '商品介绍' }), more), intro), note, reviews));
      return h('div.m1-pwrap', {}, page, bar);
    }),
  };

  /* =====================================================================================
     购物车（横带分层，单列）：已选商品 → 失效商品 → 底部合计与去结算
     ===================================================================================== */
  window.PAGES_MINI.cart = {
    title: '购物车', tab: null, from: 'menu', bar: true, nav: { title: '购物车' },
    layout: '横带分层', reason: '单列从上到下：先是能结算的商品，再是失效的，最后固定在底部的合计与去结算；视线从“买什么”走到“花多少”',
    scenes: [{ id: 'invalid', label: '有失效商品（下架、售罄、库存不足）' }, { id: 'rest', label: '营业状态：休息中（不能结算）' }, { id: 'closed', label: '营业状态：已打烊（不能结算）' }, { id: 'paused', label: '营业状态：暂停营业（不能结算）' }, { id: 'rule', label: '商品不满足购买规则' }],
    skeleton: () => h('div', { style: { paddingTop: '12px' } }, Mini.skeleton(4)),
    render: P1.net((ctx) => {
      const st = P1.shopOf(ctx), store = B.db.stores.find((s) => s.id === B.db.curStore) || B.db.stores[0];
      if (ctx.scene === 'invalid' && !Mini.cart.invalid().length) [[12, 1], [7, 1], [5, 5]].forEach(([pid, qty]) => { const p = Mini.product(pid), specs = Mini.defaultSpecs(p); B.db.cart.push({ key: Mini.cart.keyOf(pid, specs), pid, name: p.name, img: p.img, unit: Mini.specPrice(p, specs), orig: p.orig, qty, specs, spec: Mini.specText(specs), selected: false }); });
      if (ctx.scene === 'rule') { const l = Mini.cart.lines().find((x) => x.pid === 9); if (l) l.qty = 1; }
      const page = h('section.mini-page.m1-cart'), listBox = h('div.m1-cbands');
      const allCb = h('input', { type: 'checkbox', id: 'm1-all', 'aria-label': '全选', on: { change: () => Mini.cart.selectAll(allCb.checked) } });
      const total = h('span.m1-ctotal.num', { text: '¥0.00' }), sub = h('span.m1-csub'), goBtn = h('button.btn.btn--primary.m1-cgo', { type: 'button', on: { click: () => ctx.push('checkout') } });
      const bar = h('div.m1-cbar', {}, h('label.mini-check.m1-allwrap', { for: 'm1-all' }, allCb, h('span', { text: '全选' })), h('div.m1-csum', {}, h('div', {}, h('span.muted', { text: '合计 ' }), total), sub), goBtn);
      const remove = async (l, row) => { const snap = Mini.cart.snapshot(); if (!UI.rm) await row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Mini.dur('--dur-fast', 150), easing: 'cubic-bezier(0.3,0,1,1)', fill: 'forwards' }).finished.catch(() => {}); if (await Mini.cart.remove(l.key)) Mini.toast('已删除 ' + l.name, { action: { label: '撤销', on: () => Mini.cart.restore(snap) } }); else row.getAnimations().forEach((a) => a.cancel()); };
      const drawList = (o) => { keepFocus(listBox, () => {
        const ok = Mini.cart.valid(), bad = Mini.cart.invalid(); listBox.replaceChildren();
        if (!ok.length && !bad.length) { listBox.append(Mini.empty('购物车还是空的', { label: '去点单', on: () => ctx.switchTab('menu') }, { sub: '选好的商品会放在这里' })); return; }
        const probs = Object.fromEntries(Mini.rules.problems(ok.filter((l) => l.selected)).map((x) => [x.key, x]));
        if (ok.length) listBox.append(h('div.m1-band', {}, h('div.mini-sec', {}, h('h2', {}, store.name), h('span.mini-tag.mini-tag--brand', { text: '到店自取' })), h('div.m1-lines', {}, ok.map((l) => P1.lineRow(ctx, l, { check: true, remove, problem: probs[l.key] })))));
        if (bad.length) listBox.append(h('div.m1-band', {}, h('div.mini-sec', {}, h('h2', { text: '失效商品 ' + bad.length + ' 件' }), h('button.mini-link', { type: 'button', on: { click: async () => { if (await Mini.confirm('清除下架、售罄或库存不足的 ' + bad.length + ' 件商品：' + bad.map((l) => l.name).join('、'), { title: '清除失效商品', ok: '清除', danger: true })) { if (await Mini.cart.clearInvalid()) { Mini.toast('已清除失效商品'); if (ctx.scene === 'invalid') UI.state.scene.cart = 'normal'; } } } } }, UI.icon('trash', 'icon--sm'), '清除失效商品')), h('div.m1-lines', {}, bad.map((l) => P1.lineRow(ctx, l, { remove })))));
      }); flashLine(listBox, o); };
      const paintBar = () => {
        const ok = Mini.cart.valid(), sel = ok.filter((l) => l.selected), q = Mini.cart.quote(sel);
        allCb.checked = ok.length > 0 && sel.length === ok.length; allCb.indeterminate = sel.length > 0 && sel.length < ok.length; allCb.disabled = !ok.length;
        const to = q.pay / 100, from = Number(total.dataset.v);
        if (Number.isNaN(from) || !total.dataset.v) { total.textContent = Mini.money(q.pay); total.dataset.v = String(to); } else if (from !== to) UI.count(total, to, { prefix: '¥', dec: 2, dur: 350 });
        sub.textContent = !st.canOrder ? st.hint : !sel.length ? (ok.length ? '请先选择商品' : '') : q.coupon ? '已用券减 ' + Mini.money(q.discount) : q.next ? '再买 ' + Mini.money(q.next.need, 0) + ' 可用' + q.next.name : '到店自取，无配送费';
        sub.hidden = !sub.textContent;
        goBtn.disabled = !st.canOrder || !sel.length; goBtn.textContent = st.canOrder ? '去结算' + (q.count ? '（' + q.count + '）' : '') : '暂停营业';
        bar.hidden = !ok.length && !Mini.cart.invalid().length;
      };
      ctx.cleanup(Mini.on('cart', (o) => { drawList(o); paintBar(); }));
      drawList(); paintBar();
      page.append(listBox);
      return h('div.m1-pwrap', {}, page, bar);
    }),
  };
})();
