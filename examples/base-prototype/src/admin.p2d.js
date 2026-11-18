/* 优惠券：看板分列（草稿、进行中、已结束）。读写 B.db.coupons / myCoupons / couponCodes，写操作留审计。 */
(function () {
  'use strict';
  const h = P2.h;
  const { today: TODAY, yuan, dAdd, md, pad, last4 } = P2;

  /** 券模板在看板上的列：按状态和有效期 */
  P2.couponCol = (c) => (c.status === 'DRAFT' ? 'DRAFT' : c.status === 'OFF' || (c.validType === 'fixed' && c.to < TODAY()) ? 'ENDED' : 'ON');
  const ruleText = (c) => (c.kind === '满减' ? '满 ' + yuan(c.threshold) + ' 减 ' + yuan(c.value) : c.kind === '折扣' ? c.value / 10 + ' 折' + (c.threshold ? '，满 ' + yuan(c.threshold) + ' 可用' : '') + '，最高减 ' + yuan(c.cap || 0) : '兑换：' + String(c.scope).replace('指定商品：', ''));
  const validText = (c) => (c.validType === 'fixed' ? md(c.from) + ' 至 ' + md(c.to) : '领取后 ' + c.days + ' 天内有效');

  /* ---------- 演示数据：补齐券模板的字段，加两张草稿（一张故意不合格）、一张已过期的券，给会员发放记录 ---------- */
  P2.onSeed((db) => {
    const r = B.rng(211), today = TODAY(), T = db.coupons;
    T.forEach((c) => { c.validType = 'days'; c.from = ''; c.to = ''; c.excl = '不与其他券同享'; c.createdAt = dAdd(today, -40) + ' 10:00'; c.scopeKind = c.scope === '全部商品' ? 'all' : c.scope.startsWith('指定商品') ? 'product' : 'cat'; });
    const t3 = T.find((c) => c.id === 3); t3.validType = 'fixed'; t3.from = dAdd(today, -20); t3.to = dAdd(today, 25); t3.excl = '可与满减券叠加';
    T.push(
      { id: 5, name: '周末满 100 减 15', kind: '满减', threshold: 10000, value: 1500, scope: '分类：主食', scopeKind: 'cat', validType: 'fixed', from: dAdd(today, 2), to: dAdd(today, 30), days: 0, stock: 200, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享', createdAt: dAdd(today, -1) + ' 16:20' },
      { id: 6, name: '新人 5 元券', kind: '满减', threshold: 300, value: 500, scope: '全部商品', scopeKind: 'all', validType: 'days', from: '', to: '', days: 14, stock: 500, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享', createdAt: dAdd(today, -2) + ' 11:05' },
      { id: 7, name: '国庆 9 折（封顶 8 元）', kind: '折扣', threshold: 0, value: 90, cap: 800, scope: '全部商品', scopeKind: 'all', validType: 'fixed', from: dAdd(today, -35), to: dAdd(today, -12), days: 0, stock: 300, claimed: 260, used: 140, perUser: 1, status: 'ON', excl: '可与满减券叠加', createdAt: dAdd(today, -38) + ' 09:30' },
    );
    /* 发放记录：每张非草稿的券给一批会员，状态按有效期和随机使用决定；原有的 4 张属于第 1 位会员 */
    db.myCoupons.forEach((m, i) => { m.userId = 1; m.at = dAdd(today, -[3, 4, 12, 15][i]) + ' 12:00'; m.source = '领取'; if (m.state === 'USED') m.usedAt = dAdd(today, -8) + ' 12:30'; });
    const users = db.users.filter((u) => u.status === 'ENABLED');
    T.filter((c) => c.status !== 'DRAFT').forEach((c) => {
      const lo = c.validType === 'fixed' ? c.from : dAdd(today, -14), hi = c.validType === 'fixed' && c.to < today ? c.to : today, span = Math.max(0, P2.dDiff(hi, lo));
      const n = Math.min(c.claimed, 16);
      for (let i = 0; i < n; i++) {
        const u = users[Math.floor(r() * users.length)];
        if (db.myCoupons.filter((m) => m.userId === u.id && m.couponId === c.id).length >= c.perUser) continue;
        const at = dAdd(lo, Math.floor(r() * (span + 1))), expire = c.validType === 'fixed' ? c.to : dAdd(at, c.days), expired = expire < today;
        const state = r() < (c.claimed ? c.used / c.claimed : 0) ? 'USED' : expired ? 'EXPIRED' : 'UNUSED';
        const m = { id: db.myCoupons.length + 1, userId: u.id, couponId: c.id, name: c.name, kind: c.kind, threshold: c.threshold, value: c.value, expire, state, at: at + ' ' + pad(9 + Math.floor(r() * 11)) + ':' + pad(Math.floor(r() * 60)), source: r() < 0.8 ? '领取' : '后台发放' };
        if (state === 'USED') m.usedAt = dAdd(at, Math.min(2, Math.max(0, P2.dDiff(today, at)))) + ' 12:' + pad(Math.floor(r() * 60));
        db.myCoupons.push(m);
      }
    });
    db.couponCodes = [];
  });

  /** 发布前的逐项检查，返回不合格的地方 */
  function publishIssues(c) {
    const e = [];
    if (c.kind === '满减') { if (!(c.value > 0)) e.push('面额要大于 0'); if (c.threshold < c.value) e.push('门槛 ' + yuan(c.threshold) + ' 低于面额 ' + yuan(c.value) + '，门槛不能小于面额'); }
    if (c.kind === '折扣') { if (!(c.cap > 0)) e.push('折扣券需要设置封顶金额'); if (c.value < 10 || c.value > 99) e.push('折扣要在 1 折到 9.9 折之间'); }
    if (!(c.stock >= 1)) e.push('库存要不少于 1 张');
    if (c.stock < c.claimed) e.push('库存不能低于已领取的 ' + c.claimed + ' 张');
    if (!(c.perUser >= 1)) e.push('每人限领至少 1 张');
    if (c.validType === 'fixed' && c.to < TODAY()) e.push('有效期已经过去，请改成今天之后');
    if (c.validType === 'days' && !(c.days >= 1)) e.push('领取后的有效天数要不少于 1 天');
    return e;
  }

  window.PAGES2.coupons = {
    title: '优惠券', group: '商品与营销',
    layout: '看板分列',
    reason: '运营每天要看的是每张券处在哪个阶段、发出去多少、用掉多少，并在草稿、进行中、已结束之间推进：券按状态分三列，卡片用小进度条显示领取和使用，顶部只留三个汇总数字',
    scenes: [
      { id: 'nodata', label: '还没有任何券' },
      { id: 'publish-fail', label: '发布失败：与进行中的券互斥冲突' },
      { id: 'send-fail', label: '发放失败：发放通道繁忙' },
      { id: 'codes-fail', label: '兑换码生成失败：库存不够' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有优惠券');
      if (early) return early;
      P2.begin();
      const today = TODAY(), flashIds = new Set(), page = h('section.page.p2-page');
      const statsEl = h('div.p2-statstrip'), host = h('div.p2-board');
      const col = P2.couponCol, byId = (id) => B.db.coupons.find((c) => c.id === Number(id));
      const tgt = (c) => '优惠券 ' + c.name;

      function paintStats() {
        const live = B.db.coupons.filter((c) => c.status !== 'DRAFT'), stock = live.reduce((a, c) => a + c.stock, 0), claimed = live.reduce((a, c) => a + c.claimed, 0), used = live.reduce((a, c) => a + c.used, 0);
        const orders = B.db.orders.filter((o) => o.coupon && ['PAID', 'FULFILLED', 'DONE'].includes(o.status)), rev = orders.reduce((a, o) => a + o.amount, 0), disc = orders.reduce((a, o) => a + o.discount, 0);
        const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
        statsEl.replaceChildren(
          P2.stat({ label: '总领取率', value: pct(claimed, stock), suffix: '%', dec: 1, sub: h('span', { text: '已领 ' + claimed + ' / 总量 ' + stock + ' 张' }) }),
          P2.stat({ label: '使用率', value: pct(used, claimed), suffix: '%', dec: 1, sub: h('span', { text: '已用 ' + used + ' / 已领 ' + claimed + ' 张' }) }),
          P2.stat({ label: '带来的营业额', value: rev / 100, prefix: '¥', dec: 2, sub: h('span', { text: orders.length + ' 单使用了优惠券，让利 ' + yuan(disc) }) }));
      }

      /* ---------- 卡片 ---------- */
      function bar(label, a, b, tone) { return h('div.p2-meter', {}, h('div.row.between', {}, h('span.muted', { text: label }), h('span.num', { text: a + ' / ' + b })), h('div.progress', { role: 'img', 'aria-label': label + ' ' + a + ' / ' + b }, h('i', { style: { '--v': b ? Math.min(1, a / b) : 0, ...(tone ? { background: tone } : {}) } }))); }
      function cardView(c) {
        const k = col(c), out = h('article.p2-ccard', {});
        out.append(
          h('div.row.wrap', { style: { gap: 'var(--s-2)', paddingRight: 'var(--s-6)' } }, h('b', { text: c.name })),
          h('div.row.wrap', { style: { gap: 'var(--s-2)' } }, P2.badge(c.kind, 'brand'), c.claimed >= c.stock && k === 'ON' ? P2.badge('已领完', 'warn') : null, k === 'ENDED' && c.status !== 'OFF' ? P2.badge('有效期已过', '') : null),
          h('p.p2-rule', { text: ruleText(c) }),
          bar('领取', c.claimed, c.stock), bar('使用', c.used, c.claimed || 0, 'var(--ch-2)'),
          h('p.muted.p2-cmeta', { text: c.scope + ' · ' + validText(c) }),
          h('div.row', { style: { gap: 'var(--s-2)' } }, h('button.btn.btn--sm', { type: 'button', text: '查看', on: { click: () => openDetail(c.id) } }),
            k === 'DRAFT' ? h('button.btn.btn--sm', { type: 'button', text: '编辑', on: { click: () => edit(c) } }) : null,
            k === 'ON' ? h('button.btn.btn--sm.btn--soft', { type: 'button', text: '发放', on: { click: () => distribute(c) } }) : null));
        return out;
      }
      function paintBoard() {
        const vis = ctx.scene === 'nodata' ? [] : B.db.coupons;
        const defs = [['DRAFT', '草稿', '还没发布，可以编辑和删除'], ['ON', '进行中', '会员现在可以领取'], ['ENDED', '已结束', '不能再领取，已领的券用到过期']];
        (paintBoard.menus || []).forEach((m) => m.remove());
        const before = new Set(UI.$$('.menu[popover]'));
        const board = UI.kanban(host, { columns: defs.map(([id, title]) => ({ id, title, cards: vis.filter((c) => col(c) === id).map((c) => ({ id: String(c.id), title: c.name })) })), card: (cd) => cardView(byId(cd.id)),
          onMove: async (id, from, to) => { const c = byId(id); let ok = false; try { ok = await move(c, from, to); } catch (e) { ok = false; } if (!ok) board.move(id, from); else { paintAll(); } } });
        paintBoard.menus = UI.$$('.menu[popover]').filter((m) => !before.has(m)); paintBoard.menus.forEach(P2.fixMenu);
        UI.$$('.kcol', host).forEach((el, i) => el.querySelector('.kcol-head').after(h('p.muted.p2-colhint', { text: defs[i][2] })));
        if (flashIds.size) { flashIds.forEach((id) => P2.flash(host.querySelector('.kcard[data-id="' + id + '"]'))); flashIds.clear(); }
      }
      const paintAll = () => { paintStats(); paintBoard(); };

      /* ---------- 状态推进 ---------- */
      async function move(c, from, to) {
        if (from === 'DRAFT' && to === 'ON') {
          const issues = publishIssues(c);
          if (issues.length) { await UI.dialog({ title: '不能发布「' + c.name + '」', size: 'sm', body: h('div.stack.p2-dlg', {}, h('p', { text: '下面 ' + issues.length + ' 项没通过检查，请先编辑：' }), h('ul.p2-faillist', { role: 'list' }, issues.map((t) => h('li', { text: t })))), actions: [{ label: '去编辑', kind: 'primary', value: 'edit' }, { label: '知道了', value: null }] }).then((v) => v === 'edit' && edit(c)); return false; }
          if (!(await UI.confirm('发布后会员马上可以领取。发布后券的类型和有效期类型不能再改，库存不能低于已领数量，每人限领只能放宽。确认发布「' + c.name + '」？', { title: '发布优惠券', ok: '确认发布' }))) return false;
          const r = await P2.act(() => {
            if (ctx.scene === 'publish-fail') P2.fail('发布失败：「' + c.name + '」与进行中的「满 30 减 3」适用范围和时间重叠，互斥规则冲突，请先调整');
            c.status = 'ON'; A2.audit('coupon:edit', '发布优惠券', tgt(c));
          });
          if (r.ok) { UI.toast('已发布「' + c.name + '」'); flashIds.add(String(c.id)); }
          return r.ok;
        }
        if (from === 'ON' && to === 'ENDED') {
          const left = B.db.myCoupons.filter((m) => m.couponId === c.id && m.state === 'UNUSED').length;
          if (!(await A2.danger('结束「' + c.name + '」后会员不能再领取。已经领取、还没使用的 ' + left + ' 张券仍然可以使用到各自的有效期结束，不会被收回。', { title: '结束优惠券', ok: '确认结束' }))) return false;
          const r = await P2.act(() => { c.status = 'OFF'; A2.audit('coupon:edit', '结束优惠券（已领未用 ' + left + ' 张照常可用）', tgt(c)); });
          if (r.ok) { UI.toast('已结束「' + c.name + '」'); flashIds.add(String(c.id)); }
          return r.ok;
        }
        if (from === 'ENDED' && to === 'ON') {
          if (c.status !== 'OFF') { UI.toast('「' + c.name + '」的有效期已过，请先编辑有效期再开启', { kind: 'bad' }); return false; }
          if (!(await UI.confirm('重新开启后会员又可以领取「' + c.name + '」。', { title: '重新开启', ok: '确认开启' }))) return false;
          const r = await P2.act(() => { c.status = 'ON'; A2.audit('coupon:edit', '重新开启优惠券', tgt(c)); });
          if (r.ok) { UI.toast('已重新开启'); flashIds.add(String(c.id)); }
          return r.ok;
        }
        UI.toast(to === 'DRAFT' ? '已发布过的券不能退回草稿，只能结束' : '草稿没有发布过，不能直接结束；不需要时可以删除', { kind: 'bad' });
        return false;
      }

      /* ---------- 新建与编辑 ---------- */
      async function edit(c0) {
        const isNew = !c0, c = c0 || { name: '', kind: '满减', threshold: 0, value: 0, cap: 0, scope: '全部商品', scopeKind: 'all', validType: 'days', from: '', to: '', days: 7, stock: 100, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享' };
        const locked = !isNew && c.status !== 'DRAFT', cats = B.CATS, prods = B.db.products;
        const scopeRef = c.scopeKind === 'cat' ? (cats.find((x) => '分类：' + x.name === c.scope) || cats[0]).id : c.scopeKind === 'product' ? String((prods.find((p) => c.scope.endsWith(p.name)) || prods[0]).id) : '';
        const names = ['name', 'kind', 'threshold', 'amount', 'rate', 'cap', 'item', 'stock', 'perUser', 'vtype', 'from', 'to', 'days', 'scopeKind', 'scopeRef', 'excl'];
        const fields = [
          { name: 'name', label: '券名称', required: true, value: c.name, max: 20, validate: (x) => (x.length < 2 ? '名称至少 2 个字' : B.db.coupons.some((o) => o !== c0 && o.name === x) ? '已经有同名的券' : '') },
          { name: 'kind', label: '类型', type: 'select', options: ['满减', '折扣', '兑换'], value: c.kind },
          { name: 'threshold', label: '使用门槛（元）', type: 'number', value: c.threshold ? c.threshold / 100 : (c.kind === '满减' ? '' : 0), hint: '满减券的门槛不能小于面额；折扣券填 0 表示无门槛' },
          { name: 'amount', label: '面额（元）', type: 'number', value: c.kind === '满减' && c.value ? c.value / 100 : '' },
          { name: 'rate', label: '折扣（几折）', type: 'number', value: c.kind === '折扣' ? c.value / 10 : '', hint: '例如 8.5 表示八五折' },
          { name: 'cap', label: '最高优惠（元）', type: 'number', value: c.cap ? c.cap / 100 : '', hint: '折扣券必须设置封顶' },
          { name: 'item', label: '兑换商品', type: 'select', options: prods.map((p) => ({ v: String(p.id), l: p.name })), value: c.kind === '兑换' ? scopeRef : String(prods[0].id) },
          { name: 'stock', label: '总量（张）', type: 'number', required: true, value: c.stock, hint: locked ? '不能低于已领取的 ' + c.claimed + ' 张' : '', validate: (x) => (!Number.isInteger(x) || x < 1 || x > 100000 ? '请填写 1 到 100000 的整数' : '') },
          { name: 'perUser', label: '每人限领（张）', type: 'number', required: true, value: c.perUser, hint: locked ? '发布后只能放宽，不能调小' : '', validate: (x) => (!Number.isInteger(x) || x < 1 || x > 10 ? '每人限领 1 到 10 张' : '') },
          { name: 'vtype', label: '有效期类型', type: 'select', options: [{ v: 'fixed', l: '固定日期区间' }, { v: 'days', l: '领取后 N 天内有效' }], value: c.validType },
          { name: 'from', label: '开始日期', type: 'date', value: c.from },
          { name: 'to', label: '结束日期', type: 'date', value: c.to },
          { name: 'days', label: '领取后有效天数', type: 'number', value: c.days || 7 },
          { name: 'scopeKind', label: '适用范围', type: 'select', options: [{ v: 'all', l: '全部商品' }, { v: 'cat', l: '指定分类' }, { v: 'product', l: '指定商品' }], value: c.scopeKind },
          { name: 'scopeRef', label: '范围对象', type: 'select', options: [{ v: '', l: '—' }], value: '' },
          { name: 'excl', label: '互斥规则', type: 'select', options: ['不与其他券同享', '可与满减券叠加', '与活动价互斥'], value: c.excl || '不与其他券同享' },
        ];
        const v = await P2.form({ title: isNew ? '新建优惠券' : '编辑优惠券：' + c.name, size: 'wide', ok: isNew ? '创建草稿' : '保存', fields,
          lead: locked ? '这张券已经发布：类型和有效期类型不能再改；修改只影响之后领取的券，已领的券按领取时的规则使用。' : '先保存成草稿，检查无误后在看板上把它拖到“进行中”才会发布。',
          onBuild: (f, body) => {
            f.el.classList.add('p2-form2'); body.classList.add('p2-dlg');
            const ctl = (n) => P2.fieldAt(f, names.indexOf(n)).querySelector('input,select,textarea'), fld = (n) => P2.fieldAt(f, names.indexOf(n));
            const fillRef = () => { const k = ctl('scopeKind').value, s = ctl('scopeRef'); const opts = k === 'cat' ? cats.map((x) => [x.id, x.name]) : k === 'product' ? prods.map((p) => [String(p.id), p.name]) : [['', '—']]; s.replaceChildren(...opts.map(([a, b]) => h('option', { value: a, text: b }))); if (k === c.scopeKind && scopeRef) s.value = scopeRef; fld('scopeRef').hidden = k === 'all'; };
            const show = () => { const k = ctl('kind').value, vt = ctl('vtype').value; fld('amount').hidden = k !== '满减'; fld('rate').hidden = k !== '折扣'; fld('cap').hidden = k !== '折扣'; fld('item').hidden = k !== '兑换'; fld('threshold').hidden = k === '兑换'; fld('scopeKind').hidden = k === '兑换'; fld('scopeRef').hidden = k === '兑换' || ctl('scopeKind').value === 'all'; fld('from').hidden = vt !== 'fixed'; fld('to').hidden = vt !== 'fixed'; fld('days').hidden = vt !== 'days'; };
            ctl('kind').addEventListener('change', show); ctl('vtype').addEventListener('change', show); ctl('scopeKind').addEventListener('change', () => { fillRef(); show(); });
            fillRef(); show();
            if (locked) { ctl('kind').disabled = true; ctl('vtype').disabled = true; }
          },
          check: (x) => {
            const e = {}, k = locked ? c.kind : x.kind, vt = locked ? c.validType : x.vtype;
            if (k === '满减') { if (!(x.amount > 0)) e.amount = '请填写面额'; if (x.threshold === '' || x.threshold < 0) e.threshold = '请填写使用门槛'; else if (x.amount > 0 && x.threshold < x.amount) e.threshold = '门槛不能小于面额（面额 ' + x.amount + ' 元）'; }
            if (k === '折扣') { if (!(x.rate >= 1 && x.rate <= 9.9)) e.rate = '折扣要在 1 到 9.9 折之间'; if (!(x.cap > 0)) e.cap = '折扣券要设置最高优惠，否则无法发布'; if (x.threshold !== '' && x.threshold < 0) e.threshold = '门槛不能为负'; }
            if (x.stock < c.claimed) e.stock = '总量不能低于已领取的 ' + c.claimed + ' 张';
            if (locked && x.perUser < c.perUser) e.perUser = '发布后每人限领只能放宽，当前是 ' + c.perUser + ' 张';
            if (vt === 'fixed') { if (!x.from) e.from = '请选择开始日期'; if (!x.to) e.to = '请选择结束日期'; else if (x.from && x.to < x.from) e.to = '结束日期不能早于开始日期'; else if (x.to < today) e.to = '结束日期不能早于今天'; }
            else if (!Number.isInteger(x.days) || x.days < 1 || x.days > 365) e.days = '请填写 1 到 365 的整数天数';
            return e;
          },
          submit: (x) => {
            const k = locked ? c.kind : x.kind, vt = locked ? c.validType : x.vtype, body = { name: x.name, kind: k, stock: x.stock, perUser: x.perUser, validType: vt, from: vt === 'fixed' ? x.from : '', to: vt === 'fixed' ? x.to : '', days: vt === 'days' ? x.days : 0, excl: x.excl };
            body.threshold = k === '满减' ? Math.round(x.threshold * 100) : k === '折扣' ? Math.round((x.threshold || 0) * 100) : 0;
            body.value = k === '满减' ? Math.round(x.amount * 100) : k === '折扣' ? Math.round(x.rate * 10) : 0; body.cap = k === '折扣' ? Math.round(x.cap * 100) : 0;
            if (k === '兑换') { const p = prods.find((q) => String(q.id) === x.item); body.scopeKind = 'product'; body.scope = '指定商品：' + p.name; }
            else { body.scopeKind = x.scopeKind; body.scope = x.scopeKind === 'all' ? '全部商品' : x.scopeKind === 'cat' ? '分类：' + cats.find((q) => q.id === x.scopeRef).name : '指定商品：' + prods.find((q) => String(q.id) === x.scopeRef).name; }
            if (isNew) { Object.assign(c, body, { id: Math.max(0, ...B.db.coupons.map((o) => o.id)) + 1, createdAt: P2.nowStr() }); B.db.coupons.push(c); } else Object.assign(c, body);
            A2.audit('coupon:edit', (isNew ? '新建优惠券（草稿）' : '修改优惠券') + '：' + ruleText(c), tgt(c));
          } });
        if (v) { UI.toast(isNew ? '已创建草稿「' + c.name + '」' : '已保存「' + c.name + '」'); flashIds.add(String(c.id)); paintAll(); }
        return !!v;
      }

      async function remove(c) {
        if (c.claimed > 0) return UI.toast('这张券已有 ' + c.claimed + ' 条领取记录，不能删除，只能结束', { kind: 'bad' });
        if (!(await A2.danger('将删除优惠券「' + c.name + '」，删除后不能恢复。', { title: '删除优惠券', ok: '确认删除' }))) return false;
        const r = await P2.act(() => { B.db.coupons.splice(B.db.coupons.indexOf(c), 1); A2.audit('coupon:edit', '删除优惠券', tgt(c)); });
        if (r.ok) { UI.toast('已删除「' + c.name + '」'); paintAll(); }
        return r.ok;
      }

      /* ---------- 发放：批量、指定会员、兑换码 ---------- */
      async function distribute(c) {
        if (col(c) !== 'ON') return UI.toast('只有进行中的券可以发放', { kind: 'bad' });
        const left = () => c.stock - c.claimed, users = B.db.users;
        let mode = 'batch';
        const seg = h('div.seg', { role: 'group', 'aria-label': '发放方式' }), panes = h('div.stack');
        const holds = (u) => B.db.myCoupons.filter((m) => m.userId === u.id && m.couponId === c.id).length;
        const closeTop = () => { const d = UI.$$('dialog.dlg[open]').pop(); d && d.close('ok'); };
        const goBtn = (label, fn) => { const b = h('button.btn.btn--primary', { type: 'button', text: label, on: { click: async () => { if (b.disabled) return; b.disabled = true; b.replaceChildren(h('span.spin'), ' ' + label); let done = false; try { done = await fn(); } finally { b.disabled = false; b.textContent = label; } if (done) closeTop(); } } }); return h('div.row', { style: { justifyContent: 'flex-end' } }, b); };
        /* 批量 */
        const tSel = h('select.select', { 'aria-label': '发放对象' }, [['ALL', '全部会员'], ['普通', '普通会员'], ['银卡', '银卡会员'], ['金卡', '金卡会员']].map(([v, l]) => h('option', { value: v, text: l })));
        const nB = h('input.input', { type: 'number', value: 1, min: 1, max: 3, 'aria-label': '每人张数' }), rB = h('textarea.textarea', { rows: 2, maxlength: 100, 'aria-label': '发放原因', placeholder: '例如：新品上市回馈老会员' }), eB = h('div.err', { role: 'alert' }), pB = h('div.p2-preview');
        const targets = () => users.filter((u) => tSel.value === 'ALL' || u.level === tSel.value);
        const paintB = () => { const all = targets(), dis = all.filter((u) => u.status === 'DISABLED').length, full = all.filter((u) => u.status === 'ENABLED' && holds(u) + Number(nB.value || 0) > c.perUser).length; pB.textContent = '范围内 ' + all.length + ' 人：已禁用 ' + dis + ' 人、已达每人限领 ' + full + ' 人将被跳过；剩余库存 ' + left() + ' 张。'; };
        tSel.addEventListener('change', paintB); nB.addEventListener('input', paintB); paintB();
        const runBatch = async () => {
          eB.textContent = ''; const n = Number(nB.value);
          if (!Number.isInteger(n) || n < 1 || n > 3) { eB.textContent = '每人 1 到 3 张'; return false; }
          if (!rB.value.trim()) { eB.textContent = '批量发放必须填写原因'; return false; }
          const list = targets();
          if (!(await UI.confirm('将向范围内 ' + list.length + ' 人各发 ' + n + ' 张「' + c.name + '」（已禁用和已达限领的会跳过）。确认发放？', { title: '确认批量发放', ok: '开始发放' }))) return false;
          const r = await P2.act(() => {
            if (ctx.scene === 'send-fail') P2.fail('发放失败：发放通道繁忙，没有发出任何券，请稍后再试');
            let ok = 0; const fails = [];
            list.forEach((u) => {
              if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '会员已禁用' });
              if (holds(u) + n > c.perUser) return fails.push({ name: u.name, reason: '已领 ' + holds(u) + ' 张，超过每人限领 ' + c.perUser + ' 张' });
              if (c.claimed + n > c.stock) return fails.push({ name: u.name, reason: '库存不足' });
              P2.grantCoupon(c, u, n, '后台发放'); ok++;
            });
            A2.audit('coupon:edit', '批量发放「' + c.name + '」×' + n + '，对象：' + tSel.selectedOptions[0].text + '，成功 ' + ok + ' 人：' + rB.value.trim(), tgt(c));
            return { ok, fails };
          }, 700);
          if (!r.ok) return false;
          flashIds.add(String(c.id)); paintAll(); await P2.report('批量发放结果', r.value.ok, r.value.fails); return true;
        };
        const batch = h('div.stack', {}, h('div.field', {}, h('label', { text: '发放对象' }), tSel), h('div.field', {}, h('label', { text: '每人张数' }), nB, h('div.hint', { text: '本券每人限领 ' + c.perUser + ' 张' })), h('div.field', {}, h('label', {}, '发放原因', h('b', { style: { color: 'var(--bad-ink)' }, text: ' *' })), rB, eB), pB, goBtn('确认发放', runBatch));
        /* 指定会员 */
        const mSel = h('select.select', { 'aria-label': '会员' }, users.map((u) => h('option', { value: u.id, text: u.name + '（尾号 ' + last4(u.phone) + (u.status === 'DISABLED' ? '，已禁用' : '') + '）' }))), nS = h('input.input', { type: 'number', value: 1, min: 1, max: 3, 'aria-label': '张数' }), eS = h('div.err', { role: 'alert' });
        const runSingle = async () => {
          eS.textContent = ''; const u = P2.userById(Number(mSel.value)), n = Number(nS.value);
          if (!Number.isInteger(n) || n < 1 || n > 3) { eS.textContent = '每人 1 到 3 张'; return false; }
          if (u.status === 'DISABLED') { eS.textContent = '这位会员已禁用，不能发券'; return false; }
          if (holds(u) + n > c.perUser) { eS.textContent = u.name + ' 已领 ' + holds(u) + ' 张，超过每人限领 ' + c.perUser + ' 张'; return false; }
          if (c.claimed + n > c.stock) { eS.textContent = '库存只剩 ' + left() + ' 张'; return false; }
          const r = await P2.act(() => { if (ctx.scene === 'send-fail') P2.fail('发放失败：发放通道繁忙，请稍后再试'); P2.grantCoupon(c, u, n, '后台发放'); A2.audit('coupon:edit', '给会员发放「' + c.name + '」×' + n, P2.target.member(u)); });
          if (!r.ok) return false;
          UI.toast('已发给 ' + u.name); flashIds.add(String(c.id)); paintAll(); return true;
        };
        const single = h('div.stack', {}, h('div.field', {}, h('label', { text: '会员' }), mSel), h('div.field', {}, h('label', { text: '张数' }), nS, eS), goBtn('确认发放', runSingle));
        /* 兑换码 */
        const nC = h('input.input', { type: 'number', value: 20, min: 1, max: 500, 'aria-label': '生成数量' }), eC = h('div.err', { role: 'alert' }), outC = h('div.stack');
        const runCodes = async () => {
          eC.textContent = ''; const n = Number(nC.value);
          if (!Number.isInteger(n) || n < 1 || n > 500) { eC.textContent = '一次生成 1 到 500 个'; return false; }
          if (n > left()) { eC.textContent = '库存只剩 ' + left() + ' 张，不够生成 ' + n + ' 个码'; return false; }
          const r = await P2.act(() => {
            if (ctx.scene === 'codes-fail') P2.fail('兑换码生成失败：库存只剩 ' + left() + ' 张，其中一部分已被其他批次的兑换码占用');
            const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', made = [];
            for (let i = 0; i < n; i++) { let s = ''; for (let k = 0; k < 8; k++) s += ch[Math.floor(Math.random() * ch.length)]; made.push({ code: s, couponId: c.id, state: 'UNUSED', at: P2.nowStr() }); }
            B.db.couponCodes.push(...made); A2.audit('coupon:edit', '生成兑换码 ' + n + ' 个', tgt(c)); return made;
          }, 600);
          if (!r.ok) return false;
          outC.replaceChildren(h('div.p2-preview', { text: '已生成 ' + n + ' 个兑换码（示例：' + r.value.slice(0, 3).map((x) => x.code.slice(0, 4) + '****').join('、') + '）。完整明文只在导出文件里。' }), A2.can('export') ? h('button.btn', { type: 'button', on: { click: () => A2.export('兑换码_' + c.name, '兑换码', n) } }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : h('p.muted', { text: '当前角色没有导出权限' }));
          UI.toast('已生成 ' + n + ' 个兑换码'); return false;
        };
        const codes = h('div.stack', {}, h('div.field', {}, h('label', { text: '生成数量' }), nC, h('div.hint', { text: '一次最多 500 个，每个码只能兑换一次；剩余库存 ' + left() + ' 张' }), eC), goBtn('生成', runCodes), outC);
        const modes = [['batch', '批量发放', batch], ['single', '指定会员', single], ['codes', '兑换码', codes]];
        const paintSeg = () => { seg.replaceChildren(...modes.map(([id, l]) => h('button', { type: 'button', 'aria-pressed': String(mode === id), text: l, on: { click: () => { mode = id; paintSeg(); } } }))); panes.replaceChildren(modes.find((m) => m[0] === mode)[2]); };
        paintSeg();
        await UI.dialog({ title: '发放「' + c.name + '」', size: 'sm', body: h('div.stack.p2-dlg', {}, seg, panes), actions: [{ label: '关闭', value: null }] });
      }

      /* ---------- 详情 ---------- */
      function openDetail(id) {
        const c = byId(id), box = (paint) => { const n = h('div'); n.paint = () => n.replaceChildren(paint()); n.paint(); return n; };
        const k = () => col(c), recs = () => B.db.myCoupons.filter((m) => m.couponId === c.id);
        const info = box(() => {
          const acts = h('div.row.wrap'), add = (label, fn, kind) => acts.append(h('button.btn.btn--sm' + (kind ? '.btn--' + kind : ''), { type: 'button', text: label, on: async () => { await fn(); repaint(); } }));
          if (k() === 'DRAFT') add('编辑', () => edit(c)); else add('修改限制', () => edit(c));
          if (k() === 'ON') { add('发放', () => distribute(c), 'soft'); add('结束', async () => { if (await move(c, 'ON', 'ENDED')) paintAll(); }); }
          if (k() === 'ENDED' && c.status === 'OFF') add('重新开启', async () => { if (await move(c, 'ENDED', 'ON')) paintAll(); });
          if (k() === 'DRAFT') add('发布', async () => { if (await move(c, 'DRAFT', 'ON')) paintAll(); }, 'soft');
          const del = h('button.btn.btn--sm.btn--danger', { type: 'button', text: '删除', disabled: c.claimed > 0, on: { click: async () => { if (await remove(c)) { const d = UI.$$('dialog.dlg[open]').pop(); d && d.close(''); } } } }); if (c.claimed > 0) del.title = '已有领取记录，不能删除，只能结束';
          acts.append(del); if (c.claimed > 0) acts.append(h('span.muted', { text: '已有领取记录，只能结束，不能删除' }));
          return h('div.stack', {}, h('div.p2-kpis', {}, [['已领取', c.claimed + ' 张'], ['已使用', c.used + ' 张'], ['库存剩余', c.stock - c.claimed + ' 张'], ['使用率', (c.claimed ? Math.round((c.used / c.claimed) * 1000) / 10 : 0) + '%']].map(([a, b]) => h('div', {}, h('span.muted', { text: a }), h('b.num', { text: b })))),
            A2.kv([['券名称', c.name], ['状态', P2.badge({ DRAFT: '草稿', ON: '进行中', ENDED: '已结束' }[k()], { DRAFT: '', ON: 'ok', ENDED: 'warn' }[k()])], ['类型与面额', c.kind + '：' + ruleText(c)], ['适用范围', c.scope], ['有效期', validText(c)], ['每人限领', c.perUser + ' 张'], ['互斥规则', c.excl || '—'], ['创建时间', c.createdAt || '—']]), acts);
        });
        const claims = box(() => h('div.stack', {}, h('p.muted', { text: '累计领取 ' + c.claimed + ' 张，下面列出最近的 ' + Math.min(recs().length, 40) + ' 条。' }), P2.mini([{ title: '会员', render: (m) => (P2.userById(m.userId) || {}).name }, { title: '领取时间', cls: 'c', render: (m) => md(m.at || '') }, { title: '来源', cls: 'c', render: (m) => m.source }, { title: '有效期至', cls: 'c', render: (m) => md(m.expire) }, { title: '状态', cls: 'c', render: (m) => A2.status({ UNUSED: ['未使用', 'ok'], USED: ['已使用', ''], EXPIRED: ['已过期', 'warn'] }, m.state) }], recs(), '还没有人领取', 40)));
        const stat = box(() => {
          const days = Array.from({ length: 14 }, (_, i) => dAdd(today, i - 13)), rs = recs(), got = days.map((d) => rs.filter((m) => (m.at || '').slice(0, 10) === d).length), used = days.map((d) => rs.filter((m) => (m.usedAt || '').slice(0, 10) === d).length), el = h('div');
          const unused = rs.filter((m) => m.state === 'UNUSED').length, expired = rs.filter((m) => m.state === 'EXPIRED').length;
          requestAnimationFrame(() => UI.bars(el, { labels: days.map((d) => md(d).replace('-', '/')), series: [{ name: '领取', data: got, color: 'var(--ch-1)' }, { name: '使用', data: used, color: 'var(--ch-2)' }], height: 200, unit: ' 张', aria: '近 14 天领取与使用：领取 ' + got.reduce((a, b) => a + b, 0) + ' 张，使用 ' + used.reduce((a, b) => a + b, 0) + ' 张' }));
          return h('div.stack', {}, h('div.p2-kpis', {}, [['领取率', (c.stock ? Math.round((c.claimed / c.stock) * 1000) / 10 : 0) + '%'], ['使用率', (c.claimed ? Math.round((c.used / c.claimed) * 1000) / 10 : 0) + '%'], ['近期已领未用', unused + ' 张'], ['近期已过期未用', expired + ' 张']].map(([a, b]) => h('div', {}, h('span.muted', { text: a }), h('b.num', { text: b })))), h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--ch-1)' } }), '领取'), h('span', {}, h('i', { style: { background: 'var(--ch-2)' } }), '使用')), el, h('p.muted', { text: '图表按记录里的领取和使用日期统计，近 14 天。' }));
        });
        const codes = box(() => { const cs = B.db.couponCodes.filter((x) => x.couponId === c.id); return cs.length ? P2.mini([{ title: '兑换码', render: (x) => x.code.slice(0, 4) + '****' }, { title: '生成时间', cls: 'c', render: (x) => md(x.at) }, { title: '状态', cls: 'c', render: (x) => (x.state === 'USED' ? '已兑换' : '未兑换') }], cs, '', 30) : h('p.muted', { text: '还没有为这张券生成过兑换码。' }); });
        const aud = box(() => P2.mini([{ title: '时间', cls: 'c', render: (a) => md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }], B.db.audit.filter((a) => a.target === tgt(c) || a.target.startsWith('优惠券 ' + c.name)), '还没有操作记录'));
        const repaint = () => [info, claims, stat, codes, aud].forEach((p) => p.paint());
        A2.detail({ title: '优惠券详情：' + c.name, tabs: [{ id: 'info', label: '概况', node: info }, { id: 'claims', label: '领取记录', node: claims }, { id: 'stat', label: '使用统计', node: stat }, { id: 'codes', label: '兑换码', node: codes }, { id: 'audit', label: '操作记录', node: aud }] });
      }

      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '优惠券' }), h('p.muted', { text: '拖动卡片或用卡片右上角的菜单“移到…”推进状态' })), h('div.actions', {}, h('button.btn.btn--primary', { type: 'button', on: { click: () => edit(null) } }, UI.icon('plus', 'icon--sm'), h('span', { text: '新建券' })))), statsEl, host);
      return A2.load(() => { paintAll(); return P2.settled(page); });
    },
  };
})();
