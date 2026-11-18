/* 第一批页面（一）：共用商品组件（价格行、商品行、双列商品卡、规格弹层）、登录、首页、搜索。
   后面的 mini.p1b.js 放点单、商品详情、购物车，mini.p1c.js 放门店。 */
(function () {
  'use strict';
  const { h } = UI;
  const K = window.K;
  const $ = (s, r) => (r || document).querySelector(s);
  const P1 = (Mini.p1 = {});

  /* ---------- 小工具 ---------- */
  const shopOf = (ctx) => Mini.shop.state(ctx && ctx.scene);
  const hasSpecs = (p) => (p.specs || []).length > 0;
  const priceFrom = (p) => (p.specs || []).some((g) => g.opts.some((o) => o.d > 0));
  const cardOf = () => B.db.cards.find((c) => c.userId === B.db.me.id && c.status === 'ACTIVE');
  const couponsOf = () => { const today = K.ymd(B.NOW()); return B.db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today); };
  const daysTo = (ymd) => Math.round((new Date(ymd + 'T00:00:00') - K.today()) / 864e5);
  const hot = () => B.db.products.filter((p) => p.status === 'ON').sort((a, b) => b.sales - a.sales);
  /** 页面进入时取一次数据：弱网多等、断网时外壳显示“网络不太稳定，请稍后再试”和重试 */
  P1.net = (build) => (ctx) => Mini.load(() => build(ctx));
  P1.shopOf = shopOf; P1.hasSpecs = hasSpecs; P1.cardOf = cardOf; P1.couponsOf = couponsOf; P1.daysTo = daysTo; P1.hot = hot;
  const star = (n) => h('span.m1-stars', { role: 'img', 'aria-label': n + ' 星' }, Array.from({ length: 5 }, (_, i) => { const s = UI.icon('star', 'icon--sm'); if (i < n) s.classList.add('on'); return s; }));
  P1.star = star;

  /* ---------- 规格弹层：份量、口味、数量，加入购物车与立即购买（菜单、搜索、首页、详情页共用） ----------
     Mini.pick(ctx, product, {buy:true, from:元素（飞入起点）, to:()=>购物车图标, specs, onAdded}) → Promise */
  Mini.pick = (ctx, p, o) => {
    o = o || {}; const st = shopOf(ctx), pst = Mini.pstate(p, ctx.scene), specs = Object.assign(Mini.defaultSpecs(p), o.specs || {});
    let qty = Math.max(Mini.rules.min(p), 1);
    const rl = Mini.rules.of(p), inCart = Mini.cart.countOf(p.id), min = Mini.rules.min(p), room = Math.max(0, Mini.rules.cap(p) - inCart);
    if (room > 0 && qty > room) qty = room;
    const img = h('img.m1-pick-img', { src: p.img, alt: '' }), priceBox = h('div.m1-pick-price'), specLine = h('p.muted'), hint = h('p.m1-hint'), out = h('output.num', { text: String(qty) });
    const minus = h('button', { type: 'button', 'aria-label': '减少一份', on: { click: () => set(qty - 1) } }, h('span', {}, UI.icon('minus'))), plus = h('button.plus', { type: 'button', 'aria-label': '增加一份', on: { click: () => set(qty + 1) } }, h('span', {}, UI.icon('plus')));
    /* 数量旁写规则与本人剩余；到边界写明是哪一条拦住了 */
    const limitText = () => {
      const left = Mini.rules.left(p), caps = [[p.stock, '库存不够了'], [rl.max || Infinity, '每单最多 ' + rl.max + ' 件'], [left, '已达购买上限']].filter((c) => c[0] !== Infinity).sort((x, y) => x[0] - y[0]), c0 = caps[0];
      if (c0 && qty + inCart >= c0[0]) return c0[1] + (inCart ? '，购物车里已有 ' + inCart + ' 件' : '');
      if (qty <= min && min > 1) return min + ' 件起售';
      return Mini.rules.texts(p).slice(0, 2).join('；');
    };
    const paint = () => {
      const unit = Mini.specPrice(p, specs), d = unit - p.price;
      priceBox.replaceChildren(Mini.price(unit * qty, { trim: false }), p.orig + d > unit ? h('span.mini-strike', { text: Mini.money((p.orig + d) * qty, 0) }) : null);
      specLine.textContent = '已选 ' + Mini.specText(specs);
      out.textContent = qty; minus.disabled = qty <= min; plus.disabled = qty >= room;
      hint.textContent = room < min ? (Mini.rules.left(p) - inCart <= 0 ? '已达购买上限' : '库存不够了') : limitText();
    };
    const set = (n) => { qty = Math.max(min, Math.min(Math.max(room, min), n)); paint(); };
    const groups = (p.specs || []).map((g) => h('div.m1-pick-group', { role: 'radiogroup', 'aria-label': g.name }, h('h3.m1-label', { text: g.name }), h('div.mini-chips', {}, g.opts.map((opt, i) => {
      const b = h('button.mini-chip', { type: 'button', role: 'radio', 'aria-checked': String(specs[g.name] === opt.n), on: { click: () => { specs[g.name] = opt.n; b.parentNode.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); paint(); o.onPick && o.onPick(Object.assign({}, specs)); } } },
        h('span', {}, opt.n + (opt.d ? ' +' + Mini.money(opt.d, 0) : ''), i === 0 ? h('b.m1-rec', { text: '推荐' }) : null)); return b; }))));
    const body = h('div.m1-pick', {}, h('div.m1-pick-head', {}, img, h('div', {}, priceBox, specLine)), groups,
      h('div.m1-pick-qty', {}, h('div', {}, h('h3.m1-label', { text: '数量' }), hint), h('div.mini-steps', {}, minus, out, plus)));
    paint();
    const closed = !st.canOrder, dead = pst !== 'ok' || room < min;
    const add = async () => {
      const r = await Mini.cart.add(p, { specs: Object.assign({}, specs), qty });
      if (!r.ok) { Mini.toast(r.reason, { kind: 'bad' }); return false; }
      const to = o.to && o.to(); Mini.toast('已加入购物车'); Mini.fly(img, to, p.img).then(() => { Mini.bump(to && to.querySelector('.mini-badge')); }); o.onAdded && o.onAdded(r.line);
    };
    const actions = closed ? [{ label: st.label === '暂停营业' ? '暂停营业' : st.label + '，暂不能下单', disabled: true }]
      : dead ? [{ label: pst === 'off' ? '已下架' : pst === 'soldout' ? '已售罄' : '已达购买上限', disabled: true }]
      : [{ label: '加入购物车', kind: o.buy ? 'tint' : 'primary', value: 'added', on: () => add() }].concat(o.buy ? [{ label: '立即购买', kind: 'primary', value: 'buy', on: async () => {
        const r = await Mini.cart.add(p, { specs: Object.assign({}, specs), qty }); if (!r.ok) { Mini.toast(r.reason, { kind: 'bad' }); return false; }
        Mini.cart.valid().forEach((l) => { l.selected = l === r.line; }); Mini.emit('cart');
      } }] : []);
    return Mini.sheet({ title: p.name, body, actions }).then((v) => { if (v === 'buy') ctx.push('checkout'); return v; });
  };

  /* ---------- 添加控制：单规格是加号与步进器，多规格是“选规格”胶囊；售罄、下架、休息中置灰 ---------- */
  P1.control = (ctx, p, o) => {
    o = o || {}; const wrap = h('div.m1-ctl'), st = shopOf(ctx), pst = Mini.pstate(p, ctx.scene);
    const paint = () => {
      const had = wrap.contains(document.activeElement) && document.activeElement.getAttribute('aria-label');
      paint0(); if (had) { const f = [...wrap.querySelectorAll('[aria-label]')].find((x) => x.getAttribute('aria-label') === had && !x.disabled); f && f.focus({ preventScroll: true }); }
    };
    const paint0 = () => {
      wrap.replaceChildren(); const n = Mini.cart.countOf(p.id);
      if (pst !== 'ok') { wrap.append(h('button.m1-pill.is-off', { type: 'button', disabled: true }, h('span', { text: pst === 'off' ? '已下架' : '已售罄' }))); return; }
      if (!st.canOrder) { wrap.append(h('button.m1-pill.is-off', { type: 'button', disabled: true }, h('span', { text: '暂停营业' }))); return; }
      if (hasSpecs(p)) {
        const b = h('button.m1-pill', { type: 'button', 'aria-label': '选规格：' + p.name, on: { click: (e) => { e.stopPropagation(); Mini.pick(ctx, p, { to: o.to, buy: false }); } } }, h('span', { text: '选规格' }), n ? h('i.mini-badge', { text: String(n) }) : null);
        wrap.append(b); return;
      }
      const line = Mini.cart.lines().find((l) => l.pid === p.id), add = () => { if (Mini.cart.room(p) < 1) return Mini.toast(Mini.rules.left(p) <= 0 ? '已达购买上限' : '库存不够了', { kind: 'bad' }); Mini.cart.add(p, { qty: 1 }); };
      if (!n) { wrap.append(h('div.mini-steps', {}, h('button.plus', { type: 'button', 'aria-label': '加入购物车：' + p.name, on: { click: add } }, h('span', {}, UI.icon('plus'))))); return; }
      wrap.append(h('div.mini-steps', {}, h('button', { type: 'button', 'aria-label': '减少一份：' + p.name, on: { click: () => Mini.cart.setQty(line.key, line.qty - 1) } }, h('span', {}, UI.icon('minus'))), h('output.num', { text: String(n) }), h('button.plus', { type: 'button', 'aria-label': '增加一份：' + p.name, disabled: Mini.cart.room(p) < 1, on: { click: add } }, h('span', {}, UI.icon('plus')))));
    };
    paint(); wrap.sync = paint; return wrap;
  };

  /* ---------- 商品行（点单、搜索）：整行只有一个入口（透明按钮盖在行上），添加控制在它上面 ---------- */
  P1.row = (ctx, p, o) => {
    o = o || {}; const pst = Mini.pstate(p, ctx.scene), off = pst !== 'ok', el = h('article.m1-row' + (off ? '.is-off' : ''), { 'data-pid': p.id });
    const img = h('img', { src: p.img, alt: '', loading: 'lazy' });
    const ctl = P1.control(ctx, p, { img: () => img, to: o.to });
    const name = o.mark ? mark(p.name, o.mark) : p.name;
    const tg = (p.tags || []).slice(0, 1), rules = Mini.rules.texts(p).slice(0, 2 - tg.length);
    el.append(
      h('button.m1-hit', { type: 'button', 'aria-label': p.name, on: { click: () => (o.open ? o.open(p) : ctx.push('product', { pid: p.id })) } }),
      h('div.m1-row-img', {}, img, off ? h('span.m1-row-mask', { text: pst === 'off' ? '已下架' : '已售罄' }) : null),
      h('div.m1-row-info', {}, h('h3.m1-name', {}, name), h('p.m1-desc', { text: p.desc }),
        h('div.m1-tags', {}, tg.map((t) => h('span.mini-tag.mini-tag--price', { text: t })), rules.map((t) => h('span.mini-tag', { text: t }))),
        h('div.m1-row-foot', {}, h('div.m1-pr', {}, Mini.price(p.price, { from: priceFrom(p) }), p.orig > p.price ? h('span.mini-strike', { text: Mini.money(p.orig, 0) }) : null), ctl)));
    el.sync = ctl.sync; return el;
  };
  const mark = (text, kw) => { const i = text.indexOf(kw); return i < 0 ? text : h('span', {}, text.slice(0, i), h('mark', { text: kw }), text.slice(i + kw.length)); };

  /* ---------- 双列商品卡（首页推荐）：图 1:1，标题固定两行，价格加加购在右下，点加购不跳详情 ---------- */
  P1.card = (ctx, p, o) => {
    o = o || {}; const pst = Mini.pstate(p, ctx.scene), off = pst !== 'ok', img = h('img', { src: p.img, alt: '', loading: 'lazy' });
    const ctl = P1.control(ctx, p, { img: () => img, to: o.to });
    const el = h('article.m1-card' + (off ? '.is-off' : ''), { 'data-pid': p.id },
      h('button.m1-hit', { type: 'button', 'aria-label': p.name, on: { click: () => ctx.push('product', { pid: p.id }) } }),
      h('div.m1-card-img', {}, img, p.tags && p.tags[0] ? h('span.mini-tag.mini-tag--price', { text: p.tags[0] }) : null, off ? h('span.m1-row-mask', { text: pst === 'off' ? '已下架' : '已售罄' }) : null),
      h('h3.m1-name.m1-two', { text: p.name }),
      h('div.m1-row-foot', {}, h('div.m1-pr', {}, Mini.price(p.price, { from: priceFrom(p) })), ctl));
    el.sync = ctl.sync; return el;
  };

  /* =====================================================================================
     登录：微信一键登录、手机号绑定、同意协议
     ===================================================================================== */
  const AGREE = {
    agreement: ['《用户协议》', '欢迎使用本店小程序。点单、支付、储值和会员卡服务由本店提供；下单即表示你同意按页面所示价格和规则购买。', '会员卡、储值余额和优惠券按各自页面写明的有效期与使用范围使用，过期不能抵扣。', '你可以随时在“我的 - 设置”里注销账号，注销后个人信息按隐私政策处理。'],
    privacy: ['《隐私政策》', '我们只收集下单和会员服务必须的信息：微信昵称头像、手机号、订单记录。', '位置只用来显示附近门店的距离，你拒绝授权后其余功能照常可用。', '你可以在“我的 - 个人资料”里查看、更正信息，也可以撤回授权或注销账号。'],
  };
  const showAgree = (key) => { const a = AGREE[key], upd = (B.db.config.pages.find((x) => x.key === key) || {}).updated; return Mini.sheet({ title: a[0], tall: true, body: h('div.m1-prose', {}, h('p.muted', { text: '更新于 ' + upd }), a.slice(1).map((t) => h('p', { text: t }))), actions: [{ label: '我知道了', kind: 'primary' }] }); };
  P1.agree = showAgree;

  window.PAGES_MINI.login = {
    title: '登录', tab: null, bar: true, nav: { transparent: true, tone: 'dark' },
    layout: '主次布局', reason: '品牌展示是主角，占上半屏；登录动作紧随其后只有一个主按钮，手机号登录和先逛逛退到次要位置',
    scenes: [{ id: 'wx-net', label: '微信登录失败：网络异常' }, { id: 'wx-cancel', label: '微信登录失败：用户取消授权' }, { id: 'phone-bound', label: '手机号：该手机号已绑定其他账号' }, { id: 'code-expired', label: '手机号：验证码已过期' }],
    skeleton: () => h('div.m1-login-skel', {}, h('div.skel', { style: { height: '260px', borderRadius: '0' } }), h('div.mini-skel', {}, h('div.skel', { style: { height: '44px' } }), h('div.skel', { style: { height: '44px' } }))),
    render(ctx) {
      const st = { step: ctx.scene === 'phone-bound' || ctx.scene === 'code-expired' ? 'phone' : 'entry', agree: false, busy: false, err: null, phone: '', code: '', cd: 0, sent: false };
      const slogan = (B.db.config.copy.find((c) => c.key === 'home.slogan') || {}).value || '';
      const imgs = B.db.products.filter((p) => p.status === 'ON').slice(0, 3).map((p) => p.img);
      const root = h('section.m1-login'), view = h('div.m1-login-panel');
      let timer; ctx.cleanup(() => clearInterval(timer));
      root.append(h('div.m1-login-top', {}, h('div.m1-login-brand', {}, h('span.m1-lockmark.big', {}, UI.icon('shop')), h('div', {}, h('strong', { text: B.shop.name }), h('p', { text: slogan }))), h('div.m1-login-photos', {}, imgs.map((s, i) => h('img', { src: s, alt: '', class: 'p' + i })))), view);
      const agreeRow = () => {
        const cb = h('input', { type: 'checkbox', checked: st.agree, id: 'm1-agree', 'aria-describedby': 'm1-agree-err', on: { change: () => { st.agree = cb.checked; if (st.agree) err.textContent = ''; } } }), err = h('div.err', { id: 'm1-agree-err', role: 'alert' });
        const row = h('div.m1-agree', {}, h('label.mini-check', {}, cb), h('p', {}, h('label', { for: 'm1-agree', text: '我已阅读并同意' }), h('button.m1-text', { type: 'button', text: '《用户协议》', on: { click: () => showAgree('agreement') } }), '和', h('button.m1-text', { type: 'button', text: '《隐私政策》', on: { click: () => showAgree('privacy') } })), err);
        row.needAgree = () => { if (st.agree) return true; err.textContent = '请先阅读并同意用户协议和隐私政策'; cb.focus(); if (!UI.rm) UI.play(row, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 240, easing: 'ease-in-out' }); return false; };
        return row;
      };
      const fail = (kind) => { st.err = kind; paint(); };
      const ERR = { net: ['网络不太稳定，没有登录成功', '请检查网络后重新登录'], cancel: ['你取消了微信授权，没有登录', '可以重新授权，也可以先逛逛，登录后再下单'] };
      const wx = async (agree) => {
        if (!agree.needAgree() || st.busy) return; st.busy = true; st.err = null; paint();
        try { await UI.request(null, 900); } catch (e) { st.busy = false; return fail('net'); }
        st.busy = false;
        if (ctx.scene === 'wx-net') return fail('net');
        if (ctx.scene === 'wx-cancel') return fail('cancel');
        Mini.toast('登录成功'); Mini.afterLogin(ctx);
      };
      const entry = () => {
        const agree = agreeRow(), e = st.err && ERR[st.err];
        return [h('h2.m1-h', { text: '欢迎光临' }), h('p.muted', { text: '登录后可以点单、使用会员卡和优惠券' }),
          e ? h('div.m1-alert', { role: 'alert' }, UI.icon('warn', 'icon--sm'), h('div', {}, h('b', { text: e[0] }), h('p', { text: e[1] }))) : null,
          h('button.btn.btn--primary.btn--block', { type: 'button', disabled: st.busy, on: { click: () => wx(agree) } }, st.busy ? h('span.spin') : UI.icon('wechat', 'icon--sm'), st.busy ? ' 登录中' : st.err ? '重新登录' : '微信一键登录'),
          h('button.btn.btn--block', { type: 'button', disabled: st.busy, text: '使用手机号登录', on: { click: () => { st.step = 'phone'; st.err = null; paint(); } } }),
          agree,
          ctx.isRoot ? h('button.m1-text.center', { type: 'button', text: '先逛逛', on: { click: () => Mini.reset('home') } }) : null];
      };
      const phoneStep = () => {
        const agree = agreeRow(), phone = h('input.input', { type: 'tel', inputmode: 'numeric', maxlength: 11, autocomplete: 'tel', placeholder: '请输入手机号', 'aria-label': '手机号', value: st.phone, on: { input: () => { st.phone = phone.value.trim(); pErr.textContent = ''; phone.removeAttribute('aria-invalid'); } } });
        const code = h('input.input', { type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '6 位验证码', 'aria-label': '验证码', value: st.code, on: { input: () => { st.code = code.value.trim(); cErr.textContent = ''; code.removeAttribute('aria-invalid'); } } });
        const pErr = h('div.err', { role: 'alert' }), cErr = h('div.err', { role: 'alert' }), sErr = h('div.err', { role: 'alert' });
        const get = h('button.btn.btn--tint', { type: 'button', style: { flex: 'none' }, on: { click: async () => {
          if (st.cd > 0) return;
          if (!/^1[3-9]\d{9}$/.test(st.phone)) { pErr.textContent = '请输入正确的 11 位手机号'; phone.setAttribute('aria-invalid', 'true'); return phone.focus(); }
          get.disabled = true;
          try { await UI.request(null, 500); } catch (e) { get.disabled = false; return Mini.toast('网络不太稳定，验证码没有发出，请重试', { kind: 'bad' }); }
          st.sent = true; st.cd = 60; Mini.toast('验证码已发送至 ' + B.maskPhone(st.phone)); tick(); timer = setInterval(() => { st.cd--; tick(); if (st.cd <= 0) clearInterval(timer); }, 1000); code.focus();
        } } });
        const tick = () => { get.disabled = st.cd > 0; get.textContent = st.cd > 0 ? '重新获取（' + st.cd + ' 秒）' : st.sent ? '重新获取' : '获取验证码'; }; tick();
        const submit = h('button.btn.btn--primary.btn--block', { type: 'submit' }, '登录');
        const form = h('form.m1-form', { novalidate: '', on: { submit: async (e) => {
          e.preventDefault(); pErr.textContent = cErr.textContent = sErr.textContent = '';
          if (!/^1[3-9]\d{9}$/.test(st.phone)) { pErr.textContent = '请输入正确的 11 位手机号'; phone.setAttribute('aria-invalid', 'true'); return phone.focus(); }
          if (!st.sent) { cErr.textContent = '请先获取验证码'; return get.focus(); }
          if (!/^\d{6}$/.test(st.code)) { cErr.textContent = '请输入 6 位验证码'; code.setAttribute('aria-invalid', 'true'); return code.focus(); }
          if (!agree.needAgree()) return;
          submit.disabled = true; submit.replaceChildren(h('span.spin'), ' 登录中');
          const reset = () => { submit.disabled = false; submit.textContent = '登录'; };
          try { await UI.request(null, 700); } catch (er) { reset(); sErr.textContent = '网络不太稳定，没有登录成功，请重试'; return; }
          const other = B.db.users.some((u) => u.phone === st.phone && u.id !== B.db.me.id);
          if (ctx.scene === 'phone-bound' || other) { reset(); pErr.textContent = '该手机号已绑定其他账号，请换一个手机号或使用微信登录'; phone.setAttribute('aria-invalid', 'true'); return phone.focus(); }
          if (ctx.scene === 'code-expired' || st.code === '111111') { reset(); cErr.textContent = '验证码已过期，请重新获取'; st.cd = 0; clearInterval(timer); tick(); code.setAttribute('aria-invalid', 'true'); return; }
          if (st.code !== '123456') { reset(); cErr.textContent = '验证码不对，请重新输入'; code.setAttribute('aria-invalid', 'true'); return code.focus(); }
          B.db.me.phone = st.phone; Mini.toast('登录成功'); Mini.afterLogin(ctx);
        } } },
          h('div.field', {}, h('label', { text: '手机号' }), h('div.m1-prefix', {}, h('span', { text: '+86' }), phone), pErr),
          h('div.field', {}, h('label', { text: '验证码' }), h('div.m1-codeRow', {}, code, get), cErr),
          sErr, submit);
        return [h('h2.m1-h', { text: '手机号登录' }), h('p.muted', { text: '用于接收订单通知和找回账号，不会用于营销电话' }), form, agree,
          h('p.m1-demo', { text: '演示验证码：123456 通过，111111 已过期' }), h('button.m1-text.center', { type: 'button', text: '返回微信登录', on: { click: () => { st.step = 'entry'; paint(); } } })];
      };
      function paint() { clearInterval(timer); st.cd = st.step === 'phone' ? st.cd : 0; view.replaceChildren(...(st.step === 'phone' ? phoneStep() : entry()).filter(Boolean)); }
      paint();
      return root;
    },
  };

  /* =====================================================================================
     首页（主次布局）：问候与门店卡 → 品牌主卡（主角）→ 入口宫格 → 热销横滑 → 推荐两列 → 会员卡与优惠券
     ===================================================================================== */
  /** 宫格入口：入口数、最长文案字数、屏宽推导列数、行数与分页（每格最小宽 = 取大值（56，字数 × 14 + 8）） */
  Mini.dock = (n, L, W) => {
    const m = W <= 375 ? 12 : 16, cellMin = Math.max(56, L * 14 + 8), cMax = Math.max(3, Math.min(5, Math.floor((W - 2 * m) / cellMin)));
    if (n <= 0) return { cols: 1, rows: 0, pages: 0, cellMin, m };
    if (n < 3) return { cols: n, rows: 1, pages: 1, cellMin, m };
    const cand = []; for (let c = 3; c <= cMax; c++) cand.push(c);
    const two = cand.filter((c) => Math.ceil(n / c) <= 2 && c >= Math.ceil(n / 2));
    const c = two.find((x) => n % x === 0) || two.find((x) => n % x >= Math.ceil(x / 2)) || cMax, rows = Math.ceil(n / c);
    return { cols: c, rows: Math.min(rows, 2), pages: rows <= 2 ? 1 : Math.ceil(rows / 2), cellMin, m };
  };
  const greet = () => { const hr = B.NOW().getHours(); return hr < 11 ? '上午好' : hr < 13 ? '中午好' : hr < 18 ? '下午好' : '晚上好'; };

  window.PAGES_MINI.home = {
    title: '首页', tab: 'home',
    nav: { bg: 'var(--bg)', left: () => h('div.m1-lockup', {}, h('span.m1-lockmark', {}, UI.icon('shop')), h('strong', { text: B.shop.name })) },
    layout: '主次布局', reason: '先看门店状态与商品搜索，再看热销。一级标签提供点单，个人权益归我的。',
    scenes: [{ id: 'rest', label: '营业状态：休息中' }, { id: 'closed', label: '营业状态：已打烊' }, { id: 'paused', label: '营业状态：暂停营业' }],
    skeleton: () => h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '44px' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '280px', borderRadius: 'var(--r-lg)' } }), h('div.skel', { style: { height: '80px' } }), h('div.skel', { style: { height: '140px' } })),
    render: P1.net((ctx) => {
      ctx.cleanup(Mini.on('auth', () => ctx.refresh()));
      const st = shopOf(ctx), me = Mini.auth.user(), empty = ctx.scene === 'empty';
      const page = h('section.mini-page.m1-home');
      /* 问候 */
      page.append(h('div.m1-greet', {}, Mini.avatar(me, 44), h('div.grow', {}, h('h2.m1-hello', { text: me ? greet() + '，' + me.name : '你好，欢迎光临' }), h('p.muted', { text: me ? '今天想吃点什么？' : '先浏览商品，也可登录后点单' })),
        me ? null : h('button.btn.btn--tint.btn--sm', { type: 'button', text: '登录', on: { click: () => ctx.push('login', { redirect: 'back', from: 'home' }) } })));
      /* 门店卡：状态、距离、导航、电话、门店详情 */
      const store = B.db.stores.find((s) => s.id === B.db.curStore) || B.db.stores[0];
      page.append(h('div.mini-card.m1-shop', {},
        h('div.m1-shop-top', {}, h('div.grow', {}, h('div.row.wrap', { style: { gap: '8px' } }, h('h2.m1-shop-name', { text: store.name }), Mini.shop.badge(st)), h('p.muted', { text: st.hint + ' · ' + Mini.fmtDist(store.dist) })),
          h('button.m1-ibtn', { type: 'button', 'aria-label': '导航到 ' + store.name, on: { click: () => P1.navigate(ctx, store) } }, h('span', {}, UI.icon('navigate')), '导航'),
          h('button.m1-ibtn', { type: 'button', 'aria-label': '拨打 ' + store.name, on: { click: () => P1.call(store) } }, h('span', {}, UI.icon('handset')), '电话')),
        h('div.m1-shop-mid', {}, h('p.m1-addr', {}, UI.icon('pin', 'icon--sm'), h('span', { text: store.addr })), h('button.mini-link', { type: 'button', on: { click: () => ctx.push('stores') } }, '门店详情', UI.icon('right'))),
        h('button.m1-notice', { type: 'button', on: { click: () => Mini.dialog({ title: '门店公告', body: B.shop.notice, left: true, actions: [{ label: '知道了', kind: 'primary' }] }) } }, UI.icon('bell', 'icon--sm'), h('span.grow', { text: B.shop.notice }), h('span.m1-go', { text: '查看' }))));
      /* 品牌主卡：整个首页只有这一个实色主按钮 */
      const feat = B.db.products[0], slogan = (B.db.config.copy.find((c) => c.key === 'home.slogan') || {}).value || '';
      page.append(h('div.m1-hero', {}, h('div.m1-hero-img', {}, h('img', { src: feat.img, alt: '' }), h('span.mini-tag.mini-tag--price', { text: '招牌' })),
        h('div.m1-hero-body', {}, h('h2', { text: slogan }), h('p', { text: feat.name + ' · ' + feat.desc }),
          h('button.btn.btn--onbrand.btn--block', { type: 'button', on: { click: () => ctx.push('search') } }, UI.icon('search', 'icon--sm'), '搜索商品'))));
      /* 热销与推荐 */
      const items = empty ? [] : hot().filter((p) => p.stock > 0), hotList = items.slice(0, 6), rec = items.filter((p) => !hotList.includes(p) && Mini.pstate(p) === 'ok').slice(0, 6);
      if (hotList.length) {
        page.append(h('div.m1-block', {}, h('div.mini-sec', {}, h('h2', {}, UI.icon('fire', 'icon--sm'), ' 热销')), h('div.mini-scroller', {}, hotList.map((p, i) => h('article.m1-hot', {},
          h('button.m1-hit', { type: 'button', 'aria-label': p.name, on: { click: () => ctx.push('product', { pid: p.id }) } }), h('div.m1-hot-img', {}, h('img', { src: p.img, alt: '', loading: 'lazy' }), h('b.m1-rank', { text: String(i + 1) })),
          h('h3.m1-name', { text: p.name }), Mini.price(p.price, { size: 'sm', from: priceFrom(p) }))))));
      }
      if (rec.length) {
        const grid = h('div.m1-cards', {}, rec.map((p) => P1.card(ctx, p, { to: () => $('.mini-tab[data-id="menu"]') })));
        ctx.cleanup(Mini.on('cart', () => grid.querySelectorAll('.m1-card').forEach((c) => c.sync && c.sync())));
        page.append(h('div.m1-block', {}, h('div.mini-sec', {}, h('h2', { text: '为你推荐' })), grid));
      }
      if (empty) page.append(Mini.empty('菜单正在准备中', { label: '看看门店', kind: 'tint', on: () => ctx.push('stores') }, { sub: '热销和推荐上架后会显示在这里' }));
      return page;
    }),
  };

  /* 导航与电话（模拟）：首页、门店页共用 */
  P1.navigate = (ctx, s) => Mini.sheet({ title: '导航到 ' + s.name, body: (api) => h('div.mini-list', {}, h('p.muted', { style: { padding: '0 16px 8px' }, text: s.addr }), ['腾讯地图', '高德地图', '苹果地图'].map((n) => h('button', { type: 'button', on: { click: () => { api.close(); Mini.toast('已打开' + n + '（模拟）'); } } }, UI.icon('navigate'), h('span.grow', { text: n })))) });
  P1.call = (s) => Mini.dialog({ title: '拨打电话', body: s.name + '\n' + s.phone, actions: [{ label: '取消', value: null }, { label: '拨打', kind: 'primary', value: 'ok', on: () => Mini.toast('正在呼叫（模拟）') }] });

  /* =====================================================================================
     搜索：搜索框、历史（可清空）、热门、实时结果、无结果
     ===================================================================================== */
  window.PAGES_MINI.search = {
    title: '搜索', tab: null, from: 'menu', nav: { title: '搜索' },
    layout: '横带分层', reason: '一条搜索框在最上，下面从历史、热门到结果一层一层往下读；有字时结果顶替历史和热门，没有结果给出路',
    scenes: [{ id: 'nohistory', label: '没有搜索历史' }, { id: 'noresult', label: '搜索没有结果' }],
    skeleton: () => Mini.skeleton(4),
    render: P1.net((ctx) => {
      const hist = B.db.searchHistory, rows = [];
      if (ctx.scene === 'nohistory' || ctx.scene === 'empty') hist.length = 0;
      let q = ctx.scene === 'noresult' || ctx.scene === 'empty' ? '麻辣烫' : '', tm;
      const input = h('input.input.input--search', { type: 'search', enterkeyhint: 'search', placeholder: '搜索菜品，例如牛腩饭', 'aria-label': '搜索菜品', value: q, autocomplete: 'off', on: { input: () => { q = input.value.trim(); clearTimeout(tm); tm = setTimeout(draw, 220); } } });
      const body = h('div.m1-sbody'), page = h('section.mini-page.m1-search', {}, h('div.m1-sbar', {}, input), body);
      ctx.onShow(() => setTimeout(() => { if (!q && input.isConnected) input.focus({ preventScroll: true }); }, 50));
      const commit = (w) => { w = (w || '').trim(); if (!w) return; const i = hist.indexOf(w); if (i >= 0) hist.splice(i, 1); hist.unshift(w); hist.length = Math.min(hist.length, 8); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(q); draw(); } });
      const pickWord = (w) => { input.value = w; q = w; commit(w); draw(); input.focus({ preventScroll: true }); };
      const chip = (w, lead) => h('button.mini-chip', { type: 'button', on: { click: () => pickWord(w) } }, h('span', {}, lead || null, w));
      function draw() {
        body.replaceChildren(); rows.length = 0;
        if (!q) {
          if (hist.length) body.append(h('div.m1-band', {}, h('div.mini-sec', {}, h('h2', { text: '搜索历史' }), h('button.mini-link', { type: 'button', 'aria-label': '清空搜索历史', on: { click: async () => { if (await Mini.confirm('清空全部 ' + hist.length + ' 条搜索历史，清空后不能恢复', { title: '清空搜索历史', ok: '清空', danger: true })) { hist.length = 0; draw(); Mini.toast('已清空搜索历史'); } } } }, UI.icon('trash', 'icon--sm'), '清空')), h('div.mini-chips', {}, hist.map((w) => chip(w)))));
          body.append(h('div.m1-band', {}, h('div.mini-sec', {}, h('h2', {}, UI.icon('fire', 'icon--sm'), ' 热门搜索')), h('div.mini-chips', {}, hot().slice(0, 6).map((p, i) => chip(p.name, h('b.m1-rk' + (i < 3 ? '.top' : ''), { text: String(i + 1) }))))));
          return;
        }
        const res = B.db.products.filter((p) => (p.name + p.desc + (p.tags || []).join('') + Mini.cat(p.cat)).includes(q));
        if (!res.length) { body.append(Mini.empty('没有找到“' + q + '”', { label: '看看热销', kind: 'tint', on: () => { input.value = ''; q = ''; draw(); } }, { sub: '换个词试试，比如“牛腩”“早餐”', illus: 'empty' })); return; }
        const list = h('div.m1-list-rows', {}, res.map((p) => { const r = P1.row(ctx, p, { mark: q, to: () => null, open: (pp) => { commit(q); ctx.push('product', { pid: pp.id }); } }); rows.push(r); return r; }));
        body.append(h('div.m1-band', {}, h('p.muted', { text: '找到 ' + res.length + ' 件商品' }), list));
      }
      ctx.cleanup(Mini.on('cart', () => rows.forEach((r) => r.sync && r.sync())));
      draw(); return page;
    }),
  };
})();
