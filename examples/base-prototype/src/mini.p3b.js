/* 第二批页面（三）之二：购卡（cards）、我的会员卡（my-cards）、会员卡详情（card-detail，参数 id）。共用小工具在 mini.p3.js 的 Mini.p3。
   卡的状态：未生效、使用中、冻结中、已挂失、退款中、已退卡、已过期、已用完（M3.cardState）。购卡、冻结、转让、挂失与补办、退卡都真的改 B.db.cards 与 B.db.cardLogs。 */
(function () {
  'use strict';
  const { h } = UI;
  const M3 = Mini.p3, { today, addD, diff, md } = M3;
  const T = (id) => B.db.cardTypes.find((x) => x.id === id);
  const byAt = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);   // 按时间倒序，同一时间保持原顺序
  M3.type = T;
  const money = Mini.money, money0 = (c) => Mini.money(c, 0);
  const HELD = ['ACTIVE', 'PENDING', 'FROZEN', 'LOST'];
  const held = (c) => HELD.includes(M3.cardState(c).key);

  /* ---------- 剩余价值与预付限额 ---------- */
  const remainValue = (c) => { const ty = T(c.typeId); if (!ty || !held(c)) return 0; return Math.round(c.price * (c.total ? Math.max(0, c.total - c.used) / c.total : Math.max(0, Math.min(ty.days, diff(today(), c.expire))) / ty.days)); };
  M3.prepaidHeld = () => B.db.me.balance + M3.myCards().reduce((s, c) => s + remainValue(c), 0);
  const prepaidOf = (ctx) => { const p = B.db.prepaid; return { cardCap: ctx.scene === 'prepaid-over' ? 15000 : p.cardCap, totalCap: p.totalCap, stopped: ctx.scene === 'prepaid-stopped' || p.stopped }; };

  /* ---------- 卡面：按卡种配色，剩余次数或剩余天数是主角 ---------- */
  const remainOf = (c, st) => {
    const t = today(), k = st.key;
    if (c.total) return { n: Math.max(0, c.total - c.used), unit: '次', label: k === 'EXPIRED' ? '到期时剩余' : '剩余' };
    if (k === 'EXPIRED' || k === 'REFUNDED') return { n: c.used, unit: '次', label: '累计使用' };
    if (k === 'PENDING') return { n: Math.max(0, diff(c.start, c.expire)), unit: '天', label: '有效' };
    if (k === 'FROZEN') return { n: Math.max(0, diff(c.frozenTo || t, c.expire)), unit: '天', label: '恢复后剩余' };
    return { n: Math.max(0, diff(t, c.expire)), unit: '天', label: '剩余' };
  };
  const expText = (c, st) => ({ PENDING: md(c.start) + ' 生效，至 ' + md(c.expire), ACTIVE: '有效期至 ' + md(c.expire), FROZEN: '冻结至 ' + md(c.frozenTo || today()) + '，有效期至 ' + md(c.expire), LOST: '已挂失，补办后继续使用', REFUNDING: '退款处理中', REFUNDED: '卡已终止', EXPIRED: '已于 ' + md(c.expire) + ' 到期', USEDUP: '次数已用完' }[st.key]);
  /** 卡面：o.compact 紧凑版；o.tag 'button' 时整张卡可点；o.state 覆盖状态 */
  M3.face = (c, o) => {
    o = o || {}; const st = o.state || M3.cardState(c), r = remainOf(c, st), soon = st.key === 'ACTIVE' && diff(today(), c.expire) <= 7 && diff(today(), c.expire) >= 0;
    const dead = ['EXPIRED', 'USEDUP', 'REFUNDED'].includes(st.key), chip = soon ? { label: diff(today(), c.expire) === 0 ? '今天到期' : diff(today(), c.expire) + ' 天后到期', tone: 'warn' } : st;
    const el = h((o.tag || 'div') + '.m3-face.t' + (c.typeId >= 1 && c.typeId <= 4 ? c.typeId : 1) + (o.compact ? '.is-compact' : '') + (dead ? '.is-dead' : ''), o.tag === 'button' ? { type: 'button', 'aria-label': c.typeName + '，' + st.label + '，' + r.label + ' ' + r.n + r.unit, on: { click: o.on } } : {},
      h('span.m3-face-h', {}, h('b.m3-face-name', { text: c.typeName }), h('span.m3-chip.is-' + (chip.tone || 'plain'), { text: chip.label })),
      h('span.m3-face-hero', {}, h('span.m3-face-lab', { text: r.label }), h('b.m3-face-n.num', { text: String(r.n) }), h('span.m3-face-u', { text: r.unit })),
      h('span.m3-face-f', {}, h('span', { text: expText(c, st) }), h('span', { text: '卡号 ' + c.no.slice(-4) })));
    return el;
  };
  /** 在售卡种的卡面（购卡页）：次数或天数是主角，赠送写在旁边 */
  const typeFace = (ty) => h('div.m3-face.t' + (ty.id >= 1 && ty.id <= 4 ? ty.id : 1), {},
    h('span.m3-face-h', {}, h('b.m3-face-name', { text: ty.name }), h('span.m3-chip.is-plain', { text: ty.kind })),
    h('span.m3-face-hero', {}, h('span.m3-face-lab', { text: ty.times ? '共' : '有效' }), h('b.m3-face-n.num', { text: String(ty.times ? ty.times + ty.gift : ty.days) }), h('span.m3-face-u', { text: ty.times ? '次' : '天' }), ty.gift ? h('span.m3-face-gift', { text: '含赠送 ' + ty.gift + ' 次' }) : null),
    h('span.m3-face-f', {}, h('span', { text: ty.times ? ty.days + ' 天内用完' : '到期自动失效' }), h('span', { text: ty.scope })));
  /** 卡种使用规则：[[名称, 文字]] */
  M3.cardRules = (ty) => [
    ['适用门店', ty.scope || '全部门店'], ['可用时段', ty.hours || '营业时间内'], ['有效期', ty.times ? ty.days + ' 天内用完，超期作废；生效当天算第 1 天' : ty.days + ' 天，生效当天算第 1 天'],
    ty.daily ? ['每日限用', '每天最多用 1 次，当天未用不累计'] : null, ty.gift ? ['赠送', '赠送 ' + ty.gift + ' 次，退卡时不折现'] : null,
    ['请假冻结', ty.freeze ? '最多冻结 ' + ty.freeze.times + ' 次，每次 ' + ty.freeze.min + ' 到 ' + ty.freeze.max + ' 天，累计不超过 ' + ty.freeze.total + ' 天；冻结期间不能使用，到期日顺延' : '这个卡种不支持请假冻结'],
    ['转让', ty.transfer ? '可转让 ' + ty.transfer.times + ' 次，手续费 ' + (ty.transfer.fee ? money(ty.transfer.fee) : '免费') + '；转让后 ' + ty.transfer.cool + ' 天内不能再转让；对方须是已注册会员' : '这个卡种不可转让'],
    ['挂失补办', '挂失后卡立即不能使用；补办费 ' + money(ty.reissue) + '，换新卡号，剩余权益全部保留'],
    ['退卡', '付款 7 日内且未使用，全额退；其余按原价扣除已使用部分，再收 ' + ty.refundFee + '% 手续费；赠送部分不折现；已过期的卡不予退款'],
    ['限购', '每人限购 ' + ty.limit + ' 张（含未生效的卡）'],
  ].filter(Boolean);
  const rulesList = (ty) => h('dl.m3-rules', {}, M3.cardRules(ty).map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
  /** 单选行：items [{v, label, sub, icon, disabled}] */
  M3.opts = (items, cur, on, label) => {
    const rows = items.map((it) => h('button.m3-opt', { type: 'button', role: 'radio', 'aria-checked': String(it.v === cur), disabled: !!it.disabled, 'data-v': it.v, on: { click: () => { rows.forEach((r) => r.setAttribute('aria-checked', String(r.dataset.v === String(it.v)))); on(it.v); } } },
      it.icon ? UI.icon(it.icon) : null, h('span.grow', {}, h('b', { text: it.label }), it.sub ? h('small', { text: it.sub }) : null), h('i.m3-radio')));
    return h('div.m3-opts', { role: 'radiogroup', 'aria-label': label || '选择' }, rows);
  };
  const logCard = (c, action, delta, note) => {
    const id = B.db.cardLogs.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    B.db.cardLogs.unshift({ id, cardNo: c.no, userName: B.db.me.name, at: B.fmt(B.NOW()), action, operator: '本人', store: '小程序', note: note || '', delta });
  };
  const pushNotice = (kind, title, body, jump) => { const id = B.db.notices.reduce((m, n) => Math.max(m, n.id), 0) + 1; B.db.notices.unshift({ id, kind, title, body, at: B.fmt(B.NOW()), read: false, jump: jump || null }); };
  const skeletonList = () => h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '172px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } }));

  /* =====================================================================================
     购卡（二级页；主次布局）：在售的第一张是主角，其余是紧凑行；每张卡写限购与预付限额，折叠使用规则
     ===================================================================================== */
  const buyState = (ctx, ty, st, pre) => {
    if (st.key === 'paused') return { ok: false, label: '暂停营业', why: '门店暂停营业，暂时不能购买' };
    if (pre.stopped) return { ok: false, label: '暂停售卖', why: '门店已暂停收取预付款，已有的卡和余额不受影响' };
    if (ty.status !== 'ON') return { ok: false, label: '暂停销售', why: '这个卡种暂时不卖，已持有的卡不受影响' };
    const n = M3.myCards().filter((c) => c.typeId === ty.id && held(c)).length;
    if (Mini.auth.is() && n >= ty.limit) return { ok: false, label: '已达限购', why: '每人限购 ' + ty.limit + ' 张，你已持有 ' + n + ' 张（含未生效的卡）', n };
    if (ty.price > pre.cardCap) return { ok: false, label: '超过限额', why: '单张预付卡不能超过 ' + money0(pre.cardCap) + '，这张卡 ' + money0(ty.price), n };
    const hv = Mini.auth.is() ? M3.prepaidHeld() : 0;
    if (hv + ty.price > pre.totalCap) return { ok: false, label: '超过限额', why: '购买后预付余额合计 ' + money(hv + ty.price) + '，超过上限 ' + money0(pre.totalCap) + '；目前还能买 ' + money(Math.max(0, pre.totalCap - hv)), n };
    return { ok: true, n };
  };
  /** 发卡：写 B.db.cards、扣次记录、消息；返回新卡 */
  const issue = (ty, start, payBy) => {
    const db = B.db, me = db.me, id = db.cards.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    const c = { id, no: 'C' + (20260000 + id * 53), userId: me.id, userName: me.name, typeId: ty.id, typeName: ty.name, kind: ty.kind, bought: today(), start, expire: addD(start, ty.days), total: ty.times ? ty.times + ty.gift : 0, used: 0, status: 'ACTIVE', frozenDays: 0, slot: ty.slot || '', price: ty.price, freezeDays: 0, freezeCount: 0, payBy };
    db.cards.push(c); logCard(c, '开卡', 0, '购买' + ty.name + '，' + (payBy === 'balance' ? '储值余额' : '微信') + '支付 ' + money(ty.price));
    pushNotice('会员卡', '开卡成功', '您已成功购买' + ty.name + (start > today() ? '，将于 ' + md(start) + ' 生效。' : '，立即生效，有效期至 ' + md(c.expire) + '。'), { page: 'card-detail', params: { id } });
    const sp = db.legal.special.find((x) => x.key === 'prepaid'); if (sp) { sp.on = true; sp.at = B.fmt(B.NOW()); }
    return c;
  };
  const buy = (ctx, ty) => {
    if (M3.needLogin(ctx)) return;
    const me = B.db.me, pre = prepaidOf(ctx), sel = { effect: 'now', date: addD(today(), 1), pay: 'wx', agree: false };
    let created = null;
    const alertBox = h('div'), warn = (t, kind) => { alertBox.replaceChildren(M3.alert(t, { kind })); alertBox.scrollIntoView({ block: 'nearest' }); }, preview = h('p.m3-prev'), dateErr = h('p.err', { role: 'alert' });
    const date = h('input.input', { type: 'date', min: addD(today(), 1), max: addD(today(), 30), value: sel.date, 'aria-label': '生效日期' });
    const dateBox = h('div.m3-field', { hidden: true }, h('label', { for: 'm3-eff-date', text: '生效日期' }), date, dateErr); date.id = 'm3-eff-date';
    const startOf = () => (sel.effect === 'now' ? today() : sel.date);
    const body = (api) => {
      const paintBtn = () => { const go = api.el.querySelector('.btn--primary'); if (go) go.disabled = !sel.agree; };
      const paint = () => { const s = startOf(); preview.textContent = (sel.effect === 'now' ? '付款后立即生效，' : md(s) + ' 零点生效，') + '有效期至 ' + md(addD(s, ty.days)) + '（共 ' + ty.days + ' 天，生效当天算第 1 天）'; dateBox.hidden = sel.effect !== 'date'; };
      date.addEventListener('input', () => { sel.date = date.value; dateErr.textContent = !date.value || date.value <= today() || date.value > addD(today(), 30) ? '生效日期要在明天到 30 天内' : ''; paint(); });
      const agree = h('input', { type: 'checkbox', id: 'm3-agree-card', on: { change: (e) => { sel.agree = e.target.checked; paintBtn(); } } });
      setTimeout(paintBtn, 0); paint();
      return h('div.m3-buy', {}, h('div.m3-buy-sum', {}, h('span.m3-thumb.t' + ty.id, {}, UI.icon('card')), h('span.grow', {}, h('b', { text: ty.name }), h('small', { text: ty.desc })), Mini.price(ty.price, { trim: false })),
        h('section', {}, h('h3', { text: '生效方式' }), M3.opts([{ v: 'now', label: '立即生效', sub: '付款后马上可以使用' }, { v: 'date', label: '指定日期生效', sub: '提前买，到日期当天零点生效' }], sel.effect, (v) => { sel.effect = v; paint(); }, '生效方式'), dateBox, preview),
        h('section', {}, h('h3', { text: '支付方式' }), M3.opts([{ v: 'wx', label: '微信支付', icon: 'wechat' }, { v: 'balance', label: '储值余额', icon: 'wallet', sub: me.balance >= ty.price ? '可用 ' + money(me.balance) : '余额不足，还差 ' + money(ty.price - me.balance), disabled: me.balance < ty.price }], sel.pay, (v) => { sel.pay = v; }, '支付方式')),
        h('section.m3-terms', {}, M3.fold('预付卡条款与退款规则', h('div', {}, rulesList(ty), h('p.muted', { text: '购买即表示卡内保存本次条款快照；条款以购买时的版本为准。' }))),
          h('div.m3-agree', {}, h('label.mini-check', {}, agree), h('label', { for: 'm3-agree-card', text: '我已阅读并同意《预付卡条款与退款规则》' })), h('p.hint.muted', { text: '请主动勾选，不会默认同意' })), alertBox);
    };
    return Mini.sheet({ title: '确认购买', tall: true, body, actions: [{ label: '取消', value: null }, { label: '确认并支付 ' + money(ty.price), kind: 'primary', value: 'paid', on: async () => {
      alertBox.replaceChildren(); dateErr.textContent = '';
      if (sel.effect === 'date' && (!sel.date || sel.date <= today() || sel.date > addD(today(), 30))) { dateErr.textContent = '生效日期要在明天到 30 天内'; date.focus(); return false; }
      const bs = buyState(ctx, ty, Mini.shop.state(ctx.scene), pre); if (!bs.ok) { warn(bs.why, 'bad'); return false; }
      if (sel.pay === 'balance') {
        const r = await M3.act(() => { if (me.balance < ty.price) throw new Error('储值余额不足，请换一种支付方式'); Mini.wallet.spend(ty.price, '购买' + ty.name); }, 700);
        if (!r.ok) { warn('支付没有完成：' + r.reason, 'bad'); return false; }
      } else {
        const res = await M3.pay(ctx, { amount: ty.price, subject: '购买' + ty.name });
        if (!res.ok) { warn('支付没有完成：' + res.reason + '。订单已保留，点“确认并支付”可以继续。', res.kind === 'cancel' ? 'warn' : 'bad'); return false; }
      }
      created = issue(ty, startOf(), sel.pay); return true;
    } }] }).then((v) => { if (v === 'paid' && created) { M3.touch(); Mini.toast('开卡成功'); ctx.replace('my-cards', { seg: created.start > today() ? 'pending' : 'active', flash: created.id }); } return v; });
  };

  window.PAGES_MINI.cards = {
    title: '购卡', tab: null, from: 'me', nav: { title: '购卡' },
    layout: '主次布局', reason: '购卡是挑一张合适的卡：在售的第一张放大成主角（价格、权益、购买），其余收成紧凑行，规则折叠在行内；限额与限购就近写在按钮旁，不在页面顶部堆提示',
    scenes: [{ id: 'prepaid-over', label: '预付限额：超过单张上限' }, { id: 'prepaid-stopped', label: '暂停收取预付款：不能购买' }, { id: 'rest', label: '营业状态：休息中（可买，营业后使用）' }, { id: 'paused', label: '营业状态：暂停营业（不能购买）' }, { id: 'pay-cancel', label: '支付：用户取消' }, { id: 'pay-fail', label: '支付：银行卡余额不足' }, { id: 'pay-timeout', label: '支付：确认超时' }],
    skeleton: skeletonList,
    render(ctx) {
      return Mini.load(() => B.db.cardTypes).then((types) => {
        const st = Mini.shop.state(ctx.scene), pre = prepaidOf(ctx), logged = Mini.auth.is(), on = types.filter((t) => t.status === 'ON'), off = types.filter((t) => t.status !== 'ON');
        const page = h('section.mini-page.m3-cards');
        if (ctx.scene === 'empty' || !types.length) return h('section.mini-page', {}, Mini.empty('暂时没有在售的会员卡', { label: '返回', kind: 'tint', on: () => ctx.back() }, { sub: '上架后会显示在这里' }));
        const hv = logged ? M3.prepaidHeld() : 0;
        page.append(h('div.m3-note', {}, UI.icon('shield', 'icon--sm'), h('span.grow', { text: '预付限额：单张不超过 ' + money0(pre.cardCap) + '，会员卡与储值合计不超过 ' + money0(pre.totalCap) + (logged ? '，你目前持有约 ' + money(hv) : '') })));
        if (pre.stopped) page.append(M3.alert('门店已暂停收取预付款，会员卡和储值暂时不能购买；已有的卡和余额可以照常使用。', { kind: 'warn' }));
        else if (st.key === 'rest' || st.key === 'closed') page.append(M3.alert('现在是' + st.label + '时间，可以先买，营业后到店使用。', { kind: 'info' }));
        else if (st.key === 'paused') page.append(M3.alert('门店暂停营业，暂时不能购卡，恢复营业后再来。', { kind: 'warn' }));
        const rules = (ty) => M3.fold('使用规则', rulesList(ty));
        const action = (ty) => {
          const bs = buyState(ctx, ty, st, pre);
          return { bs, btn: h('button.btn.btn--sm' + (bs.ok ? '.btn--primary' : ''), { type: 'button', disabled: !bs.ok, 'aria-label': (bs.ok ? '购买' : bs.label + '：') + ty.name, text: bs.ok ? '立即购买' : bs.label, on: { click: () => buy(ctx, ty) } }) };
        };
        const limitLine = (bs, ty) => h('p.m3-limit' + (bs.ok ? '' : '.is-bad'), { text: bs.ok ? '每人限购 ' + ty.limit + ' 张' + (bs.n ? '，已持有 ' + bs.n + ' 张' : '') : bs.why });
        const price = (ty) => h('div.m3-pr', {}, Mini.price(ty.price), ty.orig > ty.price ? h('span.mini-strike', { text: money0(ty.orig) }) : null);
        const first = on[0];
        if (first) {
          const a = action(first);
          page.append(h('section.m3-hero', {}, typeFace(first), h('div.m3-herobody', {},
            h('div.m3-herotop', {}, h('p.grow', { text: first.desc }), price(first)),
            h('ul.m3-perks', {}, [first.slot ? first.slot + ' 可用' : '全天可用', first.freeze ? '可请假冻结' : '不可冻结', first.transfer ? '可转让' : '不可转让'].map((t) => h('li', { text: t }))),
            h('div.m3-herofoot', {}, limitLine(a.bs, first), a.btn), rules(first))));
        }
        const rest = on.slice(1).concat(off);
        if (rest.length) page.append(h('div.mini-sec', {}, h('h2', { text: '更多卡种' }), h('span.muted', { text: rest.length + ' 种' })), h('div.m3-rows', {}, rest.map((ty) => {
          const a = action(ty);
          return h('article.m3-row', {}, h('div.m3-rowtop', {}, h('span.m3-thumb.t' + ty.id, {}, UI.icon(ty.kind === '次卡' ? 'ticket' : ty.kind === '时段卡' ? 'clock' : 'card')), h('div.grow', {}, h('h3', { text: ty.name }), h('p.muted', { text: ty.desc })), h('div.m3-rowside', {}, price(ty), a.btn)), limitLine(a.bs, ty), rules(ty));
        })));
        page.append(h('p.m3-foot.muted', { text: '购买前请阅读各卡的使用规则；七日内未使用可全额退，其余按条款折算。' }));
        return page;
      });
    },
  };

  /* =====================================================================================
     我的会员卡（二级页；横带分层）：分段“使用中、未生效、已过期”，卡面按卡种配色，剩余次数或剩余天数是主角
     ===================================================================================== */
  const SEGS = [['active', '使用中', ['ACTIVE', 'FROZEN', 'LOST', 'REFUNDING']], ['pending', '未生效', ['PENDING']], ['expired', '已过期', ['EXPIRED', 'USEDUP', 'REFUNDED']]];
  window.PAGES_MINI['my-cards'] = {
    title: '我的会员卡', tab: null, from: 'me', auth: true, nav: { title: '我的会员卡' },
    layout: '横带分层', reason: '会员卡是资产，先看哪些现在能用：顶部分段把卡分成使用中、未生效、已过期三条带，使用中的第一张放大，其余收紧；点卡进详情做冻结、转让、退卡',
    scenes: [{ id: 'expiring', label: '一张卡 3 天后到期（即将到期标签）' }],
    skeleton: skeletonList,
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { seg: ctx.params.seg || 'active' });
      return Mini.load(() => M3.myCards()).then((mine) => {
        const all = mine.map((c) => c), hit = ctx.scene === 'expiring' ? all.findIndex((x) => M3.cardState(x).key === 'ACTIVE' && !x.total && diff(today(), x.expire) > 3) : -1;
        if (hit >= 0) all[hit] = Object.assign({}, all[hit], { expire: addD(today(), 3) });
        const stOf = (c) => M3.cardState(c).key, inSeg = (id) => all.filter((c) => SEGS.find((s) => s[0] === id)[2].includes(stOf(c)));
        const page = h('section.mini-page.m3-mycards'), list = h('div.m3-clist'), flash = Number(ctx.params.flash);
        if (ctx.scene === 'empty') all.length = 0;
        const tabs = M3.tabs(SEGS.map(([id, label]) => ({ id, label, n: inSeg(id).length })), S.seg, (id) => { S.seg = id; draw(); }, '会员卡状态');
        const draw = () => {
          const cs = inSeg(S.seg).sort((a, b) => (a.expire < b.expire ? -1 : 1)); list.replaceChildren();
          if (!cs.length) {
            const msg = !all.length ? ['还没有会员卡', '办一张卡，到店用更划算'] : S.seg === 'active' ? ['现在没有可用的卡', '看看在售的卡种吧'] : S.seg === 'pending' ? ['没有未生效的卡', '提前购买并指定生效日的卡会放在这里'] : ['没有已过期的卡', '过期或用完的卡会放在这里'];
            list.append(Mini.empty(msg[0], S.seg === 'active' || !all.length ? { label: '去办卡', on: () => ctx.push('cards') } : null, { sub: msg[1] })); return;
          }
          cs.forEach((c, i) => {
            const f = M3.face(c, { tag: 'button', compact: i > 0 && S.seg === 'active', on: () => ctx.push('card-detail', { id: c.id }) });
            if (c.id === flash) f.classList.add('mini-flash'); list.append(f);
          });
          list.append(h('button.m3-addrow', { type: 'button', on: { click: () => ctx.push('cards') } }, UI.icon('plus', 'icon--sm'), h('span.grow', { text: '办理新卡' }), UI.icon('right', 'icon--sm')));
        };
        draw(); page.append(tabs, list);
        return page;
      });
    },
  };

  /* =====================================================================================
     会员卡详情（二级页；主次布局）：卡面是主角；状态说明与唯一的修复动作 → 操作 → 使用规则 → 用卡记录 → 退款进度
     ===================================================================================== */
  const quoteRefund = (c) => {
    const ty = T(c.typeId), t = today(), paid = c.price, sinceBuy = diff(c.bought, t), freeUnits = ty.gift || 0, paidUnits = c.total ? c.total - freeUnits : ty.days;
    const usedUnits = c.total ? c.used : c.start > t ? 0 : Math.min(ty.days, Math.max(0, diff(c.start, t) + 1 - (c.freezeDays || 0)));
    const full = sinceBuy <= 7 && c.used === 0;
    const unit = Math.round((ty.orig || paid) / Math.max(1, paidUnits)), deduct = full ? 0 : Math.min(paid, unit * usedUnits), base = paid - deduct, fee = full ? 0 : Math.round((base * ty.refundFee) / 100);
    return { paid, full, usedUnits, unit, unitName: c.total ? '次' : '天', deduct, fee, gift: freeUnits, amount: Math.max(0, base - fee), orig: ty.orig || paid, paidUnits };
  };
  const view = (c, sc) => {
    const t = today(), v = Object.assign({}, c), cur = M3.cardState(c).key;
    if (sc === 'frozen' && cur !== 'FROZEN') Object.assign(v, { status: 'FROZEN', frozenFrom: addD(t, -1), frozenTo: addD(t, 5), expire: addD(c.expire, 7) });
    if (sc === 'lost') v.status = 'LOST';
    if (sc === 'expired') Object.assign(v, { status: 'EXPIRED', expire: addD(t, -3) });
    if (sc === 'usedup' && c.total) v.used = c.total; else if (sc === 'usedup') Object.assign(v, { status: 'EXPIRED', expire: addD(t, -1) });
    if (sc === 'pending') Object.assign(v, { start: addD(t, 3), expire: addD(t, 3 + (T(c.typeId).days || 30)), status: 'ACTIVE' });
    let rf = (B.db.cardRefunds || []).find((r) => r.cardId === c.id && r.status !== 'REJECTED');
    if (/^refund-/.test(sc)) {
      const q = quoteRefund(c), step = { 'refund-review': 1, 'refund-doing': 2, 'refund-done': 3, 'refund-rejected': 1 }[sc];
      rf = { id: 0, cardId: c.id, amount: q.amount, at: addD(t, -1) + ' 15:20', step, status: sc === 'refund-rejected' ? 'REJECTED' : 'OK', reason: sc === 'refund-rejected' ? '这张卡在审核期间有一次使用记录，需先冲正后再申请' : '' };
      v.status = sc === 'refund-done' ? 'REFUNDED' : sc === 'refund-rejected' ? 'ACTIVE' : 'REFUNDING';
    }
    return { v, rf };
  };

  window.PAGES_MINI['card-detail'] = {
    title: '会员卡详情', tab: null, from: 'me', auth: true, nav: { title: '会员卡详情' },
    layout: '主次布局', reason: '一张卡最要紧的是“还能用多少、到哪天”，所以卡面放大成主角；状态异常时在卡面下给原因和唯一的修复动作，冻结、转让、挂失、退卡收成一组操作行，规则与记录退到下面',
    scenes: [{ id: 'frozen', label: '状态：冻结中' }, { id: 'lost', label: '状态：已挂失' }, { id: 'expired', label: '状态：已过期' }, { id: 'usedup', label: '状态：已用完' }, { id: 'pending', label: '状态：未生效' },
      { id: 'refund-review', label: '退卡进度：审核中' }, { id: 'refund-doing', label: '退卡进度：退款中' }, { id: 'refund-done', label: '退卡进度：已到账' }, { id: 'refund-rejected', label: '退卡进度：被驳回，恢复原状态' }, { id: 'pay-fail', label: '支付：补办费支付失败' }],
    skeleton: () => h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '176px', borderRadius: 'var(--r-lg)' } }), h('div.skel', { style: { height: '56px' } }), h('div.skel', { style: { height: '56px' } }), h('div.skel', { style: { height: '56px' } })),
    render(ctx) {
      const id = Number(ctx.params.id), c = M3.myCards().find((x) => x.id === id) || (ctx.scene !== 'normal' && ctx.scene !== 'pay-fail' ? M3.myCards().find(held) : null);
      return Mini.load(() => c).then((card) => {
        if (!card) return h('section.mini-page', {}, Mini.empty('这张卡不存在或已转让', { label: '返回我的会员卡', kind: 'tint', on: () => ctx.back() }, { illus: 'lock', sub: '转让给他人的卡不再显示在你的账户里' }));
        const sc = ctx.scene, { v, rf } = view(card, sc), st = M3.cardState(v), ty = T(card.typeId), t = today(), page = h('section.mini-page.m3-detail'), done = () => { if (ctx.scene !== 'normal' && ctx.scene !== 'pay-fail') UI.state.scene[ctx.id] = 'normal'; M3.touch(); ctx.refresh(); ctx.scroller.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' }); };
        const fr = ty.freeze, frLeft = fr ? Math.max(0, fr.total - (card.freezeDays || 0)) : 0, frTimes = fr ? Math.max(0, fr.times - (card.freezeCount || 0)) : 0;
        /* 卡面与状态说明 */
        page.append(M3.face(v, { state: st }));
        const banner = { FROZEN: ['冻结至 ' + md(v.frozenTo) + '，期间不能使用，有效期已顺延到 ' + md(v.expire), { label: '提前解冻', on: () => unfreeze() }], LOST: ['这张卡已挂失，现在不能使用；补办后换新卡号，剩余权益全部保留', { label: '补办新卡', on: () => reissue() }],
          PENDING: ['这张卡 ' + md(v.start) + ' 零点生效，生效前不能使用', null], REFUNDING: ['退卡申请处理中，这张卡暂停使用，驳回后会恢复原状态', null], EXPIRED: ['这张卡已过期，不能再使用或退款', null], USEDUP: ['次数已经用完，不能再使用', null], REFUNDED: ['退款已到账，这张卡已终止', null] }[st.key];
        if (banner) page.append(M3.alert(banner[0], { kind: st.key === 'LOST' ? 'bad' : 'info', action: banner[1] }));
        else if (card.freezePlan) page.append(M3.alert('已预约 ' + md(card.freezePlan.from) + ' 至 ' + md(card.freezePlan.to) + ' 冻结，到期日已顺延到 ' + md(card.expire), { kind: 'info', action: { label: '取消预约', on: () => cancelPlan() } }));
        /* 操作：每行说明做什么，或为什么不能做 */
        const live = ['ACTIVE', 'PENDING'].includes(st.key), alive = ['ACTIVE', 'PENDING', 'FROZEN'].includes(st.key);
        const rq = quoteRefund(card);
        const why = {
          freeze: !fr ? '这个卡种不支持请假冻结' : st.key === 'FROZEN' ? '已在冻结中；要提前恢复，请点上方“提前解冻”' : st.key === 'PENDING' ? '未生效的卡不能冻结' : !live ? '当前状态不能冻结（' + st.label + '）' : !frTimes ? '冻结次数已用完（最多 ' + fr.times + ' 次）' : frLeft < fr.min ? '累计可冻结天数不足 ' + fr.min + ' 天' : null,
          transfer: !ty.transfer ? '这个卡种不可转让' : !live ? (st.key === 'FROZEN' ? '冻结中的卡不能转让，请先提前解冻' : '当前状态不能转让（' + st.label + '）') : (card.transferCount || 0) >= ty.transfer.times ? '这张卡已转让过 ' + ty.transfer.times + ' 次，不能再转让' : card.transferAt && diff(card.transferAt, t) < ty.transfer.cool ? '转让冷却期内，' + (ty.transfer.cool - diff(card.transferAt, t)) + ' 天后可再转让' : null,
          lost: st.key === 'LOST' ? '已挂失；要补办，请点上方“补办新卡”' : !alive ? '当前状态不能挂失（' + st.label + '）' : null,
          refund: st.key === 'EXPIRED' ? '已过期的卡不予退款' : st.key === 'USEDUP' ? '次数已用完，没有可退金额' : st.key === 'LOST' ? '挂失中的卡请先补办再退卡' : st.key === 'REFUNDING' ? '退卡申请处理中，进度见下方' : st.key === 'REFUNDED' ? '已退卡' : rq.amount <= 0 ? '已使用部分超过实付，没有可退金额' : null,
        };
        const row = (key, icon, title, sub, onClick, danger) => {
          const bad = !!why[key];
          return h('button.m3-act' + (bad ? '.is-off' : '') + (danger ? '.is-danger' : ''), { type: 'button', 'aria-disabled': bad ? 'true' : null, on: { click: () => (bad ? Mini.toast(why[key], { kind: 'bad' }) : onClick()) } }, h('span.m3-ic', {}, UI.icon(icon)), h('span.grow', {}, h('b', { text: title }), h('small', { text: bad ? why[key] : sub })), UI.icon('right', 'icon--sm'));
        };
        page.append(h('div.mini-sec', {}, h('h2', { text: '卡片操作' })), h('div.mini-card.m3-acts', {},
          row('freeze', 'snow', '请假冻结', fr ? '暂停计时、到期日顺延；还可冻结 ' + frLeft + ' 天、' + frTimes + ' 次' : '', () => freezeSheet()),
          row('transfer', 'swap', '转让给他人', ty.transfer ? (ty.transfer.fee ? '手续费 ' + money(ty.transfer.fee) : '免手续费') + '，对方须是已注册会员' : '', () => transferSheet()),
          row('lost', 'lock', '挂失', '挂失后立即不能使用，可补办新卡（补办费 ' + money(ty.reissue) + '）', () => lostConfirm(), true),
          row('refund', 'undo', '退卡', rq.full ? '付款 7 日内未使用，可全额退 ' + money(rq.amount) : '预计可退 ' + money(rq.amount) + '，先试算再决定', () => refundSheet(), true)));
        /* 退卡进度 */
        if (rf) {
          const times = [rf.at.slice(5, 16), '', '', ''];
          page.append(h('div.mini-sec', {}, h('h2', { text: '退卡进度' }), h('span.muted', { text: '预计退回 ' + money(rf.amount) })), h('div.mini-card', {}, M3.stepper(['已提交', '审核中', '退款中', '已到账'], rf.step, { fail: rf.status === 'REJECTED' ? 1 : undefined, times, label: '退卡进度' }),
            rf.status === 'REJECTED' ? M3.alert('申请被驳回：' + rf.reason + '。这张卡已恢复为原状态，可以继续使用。', { kind: 'bad' }) : h('p.muted', { text: rf.step >= 3 ? '退款已原路退回，请查看支付渠道到账通知。' : rf.step === 2 ? '退款已发起，通常 1 到 3 个工作日到账。' : '审核通过后进入退款，期间这张卡暂停使用。' })));
        }
        /* 使用规则与用卡记录 */
        const ruleFold = M3.fold('使用规则', rulesList(ty), false); ruleFold.classList.add('mini-card'); page.append(ruleFold);
        const logs = B.db.cardLogs.filter((l) => l.cardNo === card.no).sort(byAt), box = h('div.m3-logs');
        let shown = 5;
        const drawLogs = () => {
          box.replaceChildren(...(logs.length ? logs.slice(0, shown).map((l) => { const d = l.delta == null ? (l.action === '冲正' ? 1 : -1) : l.delta; return h('div.m3-log', {}, h('span.m3-logdot.is-' + (l.action === '冲正' ? 'back' : d < 0 ? 'use' : 'info')), h('div.grow', {}, h('b', { text: l.action }), h('small', { text: (l.store || '') + (l.note ? ' · ' + l.note : '') })), h('div.m3-logr', {}, d ? h('b.num' + (d > 0 ? '.is-plus' : ''), { text: (d > 0 ? '+' : '−') + Math.abs(d) + ' ' + (card.total ? '次' : '次') }) : null, h('small', { text: l.at.slice(5, 16) }))); }) : [h('p.muted.m3-nolog', { text: '还没有使用记录，到店使用后会显示在这里' })]));
          if (logs.length > shown) box.append(h('button.m3-more', { type: 'button', text: '查看更多（还有 ' + (logs.length - shown) + ' 条）', on: { click: () => { shown += 10; drawLogs(); } } }));
        };
        drawLogs();
        page.append(h('div.mini-sec', {}, h('h2', { text: '用卡记录' }), h('span.muted', { text: card.total ? '已用 ' + card.used + ' 次' : '已用 ' + card.used + ' 次' })), h('div.mini-card', {}, box));

        /* ---- 冻结 ---- */
        function freezeSheet() {
          const f = { from: t, to: addD(t, fr.min - 1) }, prev = h('p.m3-prev'), err = h('p.err', { role: 'alert' });
          const a = h('input.input', { type: 'date', min: t, max: addD(t, 7), value: f.from, id: 'm3-fz-a' }), b = h('input.input', { type: 'date', min: t, value: f.to, id: 'm3-fz-b' });
          const calc = () => { const days = f.from && f.to ? diff(f.from, f.to) + 1 : 0; let e = ''; if (!f.from || !f.to) e = '请选择开始和结束日期'; else if (f.to < f.from) e = '结束日期不能早于开始日期'; else if (!frTimes) e = '这张卡最多冻结 ' + fr.times + ' 次，已经用完'; else if (days < fr.min) e = '单次最少冻结 ' + fr.min + ' 天'; else if (days > fr.max) e = '单次最多冻结 ' + fr.max + ' 天'; else if (days > frLeft) e = '累计还可以冻结 ' + frLeft + ' 天，已经冻结了 ' + (card.freezeDays || 0) + ' 天'; return { days, e }; };
          const paint = () => { const { days, e } = calc(); err.textContent = days && !e ? '' : e; prev.textContent = !e ? '冻结 ' + md(f.from) + ' 至 ' + md(f.to) + '，共 ' + days + ' 天；有效期 ' + md(card.expire) + ' → ' + md(addD(card.expire, days)) : '选好日期后这里会显示到期日的变化'; };
          a.addEventListener('input', () => { f.from = a.value; if (f.to < f.from) { f.to = addD(f.from, fr.min - 1); b.value = f.to; } b.min = f.from; paint(); }); b.addEventListener('input', () => { f.to = b.value; paint(); }); paint();
          const body = h('div.m3-fz', {}, h('p.muted', { text: '本卡累计还可冻结 ' + frLeft + ' 天（已冻结 ' + (card.freezeDays || 0) + ' 天），还能冻结 ' + frTimes + ' 次；每次 ' + fr.min + ' 到 ' + fr.max + ' 天。' }),
            h('div.m3-twocol', {}, h('div.field.m3-field', {}, h('label', { for: 'm3-fz-a', text: '开始日期' }), a), h('div.field.m3-field', {}, h('label', { for: 'm3-fz-b', text: '结束日期' }), b)), err, h('div.m3-previewbox', {}, UI.icon('calendar', 'icon--sm'), prev), h('p.muted', { text: '冻结期间不能使用，也不会计入有效期；开始日期晚于今天时按预约处理。' }));
          return Mini.sheet({ title: '请假冻结', body, actions: [{ label: '取消', value: null }, { label: '确认冻结', kind: 'primary', value: 'ok', on: async () => {
            const { days, e } = calc(); if (e) { err.textContent = e; return false; }
            const r = await M3.act(() => { card.freezeCount = (card.freezeCount || 0) + 1; card.freezeDays = (card.freezeDays || 0) + days; card.expire = addD(card.expire, days); if (f.from <= t) { card.status = 'FROZEN'; card.frozenFrom = f.from; card.frozenTo = f.to; } else card.freezePlan = { from: f.from, to: f.to, days }; logCard(card, '冻结', 0, '冻结 ' + days + ' 天（' + md(f.from) + ' 至 ' + md(f.to) + '），到期日顺延'); }, 700);
            if (!r.ok) { err.textContent = r.reason; return false; }
          } }] }).then((v) => { if (v === 'ok') { Mini.toast(f.from <= t ? '已冻结，到期日已顺延' : '已预约冻结'); done(); } });
        }
        async function unfreeze() {
          const from = v.frozenFrom, to = v.frozenTo, plan = diff(from, to) + 1, used = Math.min(plan, Math.max(1, diff(from, t) + 1)), back = plan - used, newExp = addD(v.expire, -back);
          if (!(await Mini.confirm('提前解冻后立即恢复使用。实际冻结 ' + used + ' 天，有效期由 ' + md(v.expire) + ' 调整为 ' + md(newExp) + '。', { title: '提前解冻', ok: '解冻' }))) return;
          const r = await M3.act(() => { if (card.status === 'FROZEN') { card.status = 'ACTIVE'; card.expire = addD(card.expire, -back); card.freezeDays = Math.max(0, (card.freezeDays || 0) - back); card.frozenFrom = card.frozenTo = ''; logCard(card, '解冻', 0, '提前解冻，实际冻结 ' + used + ' 天'); } }, 700);
          if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' });
          Mini.toast('已解冻，可以继续使用'); done();
        }
        async function cancelPlan() {
          const p = card.freezePlan; if (!(await Mini.confirm('取消 ' + md(p.from) + ' 至 ' + md(p.to) + ' 的冻结预约，有效期会恢复为 ' + md(addD(card.expire, -p.days)) + '。', { title: '取消冻结预约', ok: '取消预约', cancel: '保留' }))) return;
          const r = await M3.act(() => { card.expire = addD(card.expire, -p.days); card.freezeDays -= p.days; card.freezeCount -= 1; card.freezePlan = null; logCard(card, '取消冻结', 0, '取消冻结预约'); }, 600);
          if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' }); Mini.toast('已取消预约'); done();
        }
        /* ---- 转让 ---- */
        function transferSheet() {
          const tr = ty.transfer, phone = h('input.input', { type: 'tel', inputmode: 'numeric', maxlength: 11, placeholder: '对方的 11 位手机号', id: 'm3-tr-phone' }), pf = M3.field('对方手机号', phone), demo = (B.db.users.find((u) => u.id !== B.db.me.id && u.status === 'ENABLED') || {}).phone;
          phone.addEventListener('input', () => pf.setErr(''));
          const body = h('div.m3-tr', {}, h('ul.m3-bullets', {}, [card.total ? '剩余 ' + (card.total - card.used) + ' 次全部转给对方' : '剩余有效期（至 ' + md(card.expire) + '）全部转给对方', '转让后你不再持有这张卡，不能撤回', tr.fee ? '转让手续费 ' + money(tr.fee) + '，支付成功后才完成转让' : '本次转让免手续费', '同一张卡最多转让 ' + tr.times + ' 次，转让后 ' + tr.cool + ' 天内不能再转', '对方必须是已注册会员'].map((x) => h('li', { text: x }))), pf, h('p.muted', { text: '演示：可输入已注册的 ' + demo + '；输入 13900000000 会提示对方还没有注册' }));
          return Mini.sheet({ title: '转让会员卡', body, actions: [{ label: '取消', value: null }, { label: '下一步', kind: 'primary', value: 'ok', on: async () => {
            const p = phone.value.trim(); pf.setErr('');
            if (!/^1[3-9]\d{9}$/.test(p)) { pf.setErr('请输入正确的 11 位手机号'); phone.focus(); return false; }
            if (p === B.db.me.phone) { pf.setErr('不能转让给自己'); phone.focus(); return false; }
            const r = await M3.act(() => B.db.users.find((u) => u.phone === p), 600); if (!r.ok) { pf.setErr(r.reason); return false; }
            const to = r.v; if (!to) { pf.setErr('该手机号还没有注册，请对方先打开小程序完成注册'); phone.focus(); return false; }
            if (to.status === 'DISABLED') { pf.setErr('对方账号暂时不能接收会员卡'); return false; }
            if (!(await Mini.confirm('把「' + card.typeName + '」（' + (card.total ? '剩余 ' + (card.total - card.used) + ' 次' : '有效期至 ' + md(card.expire)) + '）转让给 ' + to.name.slice(0, 1) + '*（' + B.maskPhone(to.phone) + '）。' + (tr.fee ? '需支付手续费 ' + money(tr.fee) + '。' : '') + '转让后你不再持有这张卡，且不能撤回。', { title: '确认转让', ok: tr.fee ? '支付手续费并转让' : '确认转让', danger: true }))) return false;
            if (tr.fee) { const res = await M3.pay(ctx, { amount: tr.fee, subject: '会员卡转让手续费' }); if (!res.ok) { pf.setErr('手续费没有支付成功：' + res.reason + '，转让没有生效，卡仍在你名下'); return false; } }
            card.userId = to.id; card.userName = to.name; card.transferCount = (card.transferCount || 0) + 1; card.transferAt = t; logCard(card, '转让', 0, '转让给 ' + to.name.slice(0, 1) + '*'); sheetTo = to; return true;
          } }] }).then((v) => { if (v === 'ok') { M3.touch(); Mini.toast('已转让给 ' + sheetTo.name.slice(0, 1) + '*'); if (ctx.scene !== 'normal') UI.state.scene[ctx.id] = 'normal'; ctx.back(); } });
        }
        let sheetTo = null;
        /* ---- 挂失与补办 ---- */
        async function lostConfirm() {
          if (!(await Mini.confirm('确认挂失「' + card.typeName + '」（卡号尾号 ' + card.no.slice(-4) + '）？挂失后这张卡立即不能使用，点单抵扣也不可用。可以随时补办，补办费 ' + money(ty.reissue) + '，换新卡号，剩余权益全部保留。', { title: '挂失会员卡', ok: '确认挂失', danger: true }))) return;
          const r = await M3.act(() => { card.prevStatus = card.status; card.status = 'LOST'; logCard(card, '挂失', 0, '本人挂失'); }, 700);
          if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' }); Mini.toast('已挂失，这张卡不能再使用'); done();
        }
        function reissue() {
          const alertBox = h('div'), body = h('div.m3-re', {}, h('ul.m3-bullets', {}, ['补办费 ' + money(ty.reissue) + '，补办条款已在购卡时写明', '换新卡号，原卡号（尾号 ' + card.no.slice(-4) + '）作废', '剩余' + (card.total ? '次数' : '有效期') + '、冻结记录、用卡记录全部保留'].map((x) => h('li', { text: x }))), alertBox);
          return Mini.sheet({ title: '补办新卡', body, actions: [{ label: '取消', value: null }, { label: '支付 ' + money(ty.reissue), kind: 'primary', value: 'ok', on: async () => {
            alertBox.replaceChildren(); const res = await M3.pay(ctx, { amount: ty.reissue, subject: '补办' + card.typeName });
            if (!res.ok) { alertBox.append(M3.alert('补办费没有支付成功：' + res.reason + '。卡仍是挂失状态，可以再试。', { kind: 'bad' })); return false; }
            const old = card.no, nn = 'C' + (20260000 + card.id * 53 + 7 * ((card.reissueCount || 0) + 1)); B.db.cardLogs.filter((l) => l.cardNo === old).forEach((l) => { l.cardNo = nn; }); card.no = nn; card.reissueCount = (card.reissueCount || 0) + 1; card.status = card.prevStatus && card.prevStatus !== 'LOST' ? card.prevStatus : 'ACTIVE';
            logCard(card, '补办', 0, '补办新卡，原卡号尾号 ' + old.slice(-4) + ' 作废'); return true;
          } }] }).then((x) => { if (x === 'ok') { Mini.toast('补办成功，新卡号尾号 ' + card.no.slice(-4)); done(); } });
        }
        /* ---- 退卡试算 ---- */
        function refundSheet() {
          const q = quoteRefund(card), lines = [['实付金额', money(q.paid)]];
          if (q.full) lines.push(['付款 7 日内且未使用', '全额退还']); else { lines.push(['已使用 ' + q.usedUnits + ' ' + q.unitName + '（按原价 ' + money(q.orig) + ' ÷ ' + q.paidUnits + ' ' + q.unitName + ' = ' + money(q.unit) + ' / ' + q.unitName + '）', '−' + money(q.deduct)]); lines.push(['剩余价值', money(q.paid - q.deduct)]); lines.push(['手续费（' + ty.refundFee + '%，按剩余价值计）', '−' + money(q.fee)]); }
          const body = h('div.m3-rf', {}, h('div.m3-rfhero', {}, h('span.muted', { text: '预计可退' }), M3.big(q.amount)), h('div.mini-list.m3-rfl', {}, lines.map(([k, v2]) => h('div', {}, h('span.grow', { text: k }), h('b.num', { text: v2 })))),
            q.gift ? h('p.muted', { text: '赠送的 ' + q.gift + ' 次不折现，也不计入退款。' }) : null, h('p.muted', { text: '退款原路退回，通常 1 到 3 个工作日到账。提交后这张卡暂停使用；审核驳回会恢复原状态。' + (st.key === 'FROZEN' ? '冻结中的卡退卡前会先按今天结束冻结再报价。' : '') }));
          return Mini.sheet({ title: '退卡试算', body, actions: [{ label: '再想想', value: null }, { label: '提交退卡申请', kind: 'danger.solid', value: 'ok', on: async () => {
            if (!(await Mini.confirm('确认为「' + card.typeName + '」提交退卡申请？预计退回 ' + money(q.amount) + '。提交后这张卡立即暂停使用，审核通过后终止，不能撤回。', { title: '提交退卡申请', ok: '提交申请', danger: true }))) return false;
            const r = await M3.act(() => {
              card.prevStatus = card.status; card.status = 'REFUNDING'; (B.db.cardRefunds = B.db.cardRefunds || []).push({ id: B.db.cardRefunds.length + 1, cardId: card.id, cardNo: card.no, amount: q.amount, fee: q.fee, at: B.fmt(B.NOW()), step: 1, status: 'OK', reason: '' });
              logCard(card, '退卡申请', 0, '申请退卡，预计退回 ' + money(q.amount)); pushNotice('会员卡', '退卡申请已提交', '「' + card.typeName + '」退卡申请已提交，预计退回 ' + money(q.amount) + '，审核通过后原路退回。', { page: 'card-detail', params: { id: card.id } });
            }, 800);
            if (!r.ok) { Mini.toast(r.reason, { kind: 'bad' }); return false; }
          } }] }).then((x) => { if (x === 'ok') { Mini.toast('退卡申请已提交'); done(); } });
        }
        return page;
      });
    },
  };
})();
