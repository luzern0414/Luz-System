/* 操作日志（横带分层）：概览数字、近 14 天操作量、明细三条带。
   日志只能查看，不能改、不能删；导出脱敏并生成导出任务；详情里的“修改前后”读记录里的变更，没有就按操作类型合成一份合理的对比。 */
(function () {
  'use strict';
  const { h } = UI;
  const isSens = (r) => r.code.indexOf('sensitive:') === 0 || r.code === 'export';
  const isFail = (r) => r.result === '失败';
  const typeOf = (r) => r.target.split(' ')[0];
  const FAIL_WHY = { 'order:cancel': '订单已出餐，不能取消', 'refund:approve': '退款金额超过实付金额', 'product:publish': '商品正在被活动使用，不能下架', 'card:issue': '会员卡库存不足', 'wallet:adjust': '调整后余额不能为负数', 'system:account': '账号名已存在', 'system:config': '取值超出允许范围', 'member:edit': '会员已注销', 'coupon:edit': '优惠券库存不足', 'auth:login': '口令错误', export: '导出行数超过上限' };
  const RANGES = [['today', '今天', 0], ['7', '近 7 天', 6], ['14', '近 14 天', 13], ['30', '近 30 天', 29], ['custom', '自定义日期', 0]];

  /* ---------- 演示数据：把近 20 天的日志补到每天十来条，加上敏感读取、导出、登录；写进 B.db.audit，重置时重来 ---------- */
  P3.onSeed(function seedAudit(db) {
    const r = B.rng(53), pick = (a) => a[Math.floor(r() * a.length)], actors = ['王海燕', '周敏', '陈晓燕', '赵建国', '吴秀英', '刘洋'];
    const acts = [['order:cancel', '取消订单', '订单', 3], ['refund:approve', '审批退款', '售后', 3], ['product:publish', '商品下架', '商品', 2], ['product:edit', '修改商品价格', '商品', 3], ['card:issue', '人工发卡', '会员卡', 2], ['wallet:adjust', '储值调整', '储值', 2], ['system:account', '重置密码', '账号', 1], ['system:config', '修改配置', '系统配置', 1], ['member:edit', '禁用会员', '会员', 2], ['coupon:edit', '发放优惠券', '优惠券', 2], ['order:fulfil', '订单出餐', '订单', 4], ['sensitive:phone', '查看手机号明文', '会员', 2], ['export', '导出订单', '导出任务', 1], ['auth:login', '登录后台', '账号', 3]];
    const pool = acts.flatMap((a) => Array(a[3]).fill(a)), add = [];
    for (let d = 19; d >= 0; d--) {
      const n = d === 0 ? 7 : 7 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        const a = pick(pool), hh = d === 0 ? 8 + Math.floor(r() * 2.5) : 8 + Math.floor(r() * 13), at = P3.dayKey(d) + ' ' + P3.pad(hh) + ':' + P3.pad(Math.floor(r() * 60));
        const login = a[0] === 'auth:login', actor = pick(actors), fail = r() < (login ? 0.12 : 0.07);
        add.push({ at: at > P3.stamp() ? P3.stamp() : at, actor, code: a[0], action: a[1], target: login ? '账号 ' + pick(['admin', 'manager1', 'front1', 'finance1', 'front2']) : a[2] + ' ' + (1000 + Math.floor(r() * 9000)), result: fail ? '失败' : '成功', fail: fail ? FAIL_WHY[a[0]] : '', reason: a[0].indexOf('sensitive:') === 0 ? pick(['核对会员身份', '处理客诉回访', '补开发票核对']) : '', ip: '10.0.' + Math.floor(r() * 9) + '.' + (10 + Math.floor(r() * 190)), trace: 'tr' + Math.floor(r() * 1e8).toString(16) });
      }
    }
    db.audit.forEach((x) => { if (x.at > P3.stamp()) { const m = (x.id * 7) % 90; x.at = P3.today() + ' ' + P3.pad(8 + Math.floor(m / 60)) + ':' + P3.pad(m % 60); } });
    const all = db.audit.concat(add).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    all.forEach((x, i) => { x.id = all.length - i; if (x.result === '失败' && !x.fail) x.fail = FAIL_WHY[x.code] || '操作没有完成'; });
    db.audit = all;
  });

  /** 没有记录修改前后时，按操作类型合成“字段 修改前 → 修改后” */
  function diffOf(rec) {
    if (rec.diff) return rec.diff;
    if (isFail(rec)) return [];
    const R = B.rng(rec.id * 13 + 5), pk = (a) => a[Math.floor(R() * a.length)], yuan = (c) => '¥' + (c / 100).toFixed(2), amount = 1500 + Math.floor(R() * 3000), who = rec.actor;
    switch (rec.code) {
      case 'order:cancel': return [['订单状态', '待履约', '已取消'], ['取消原因', '—', pk(['顾客要求取消', '重复下单', '商品售罄'])], ['退款', '—', yuan(amount) + ' 原路退回']];
      case 'refund:approve': return [['售后状态', '待审批', '已退款'], ['退款金额', '—', yuan(amount)], ['处理人', '—', who]];
      case 'product:publish': return [['上架状态', '在售', '已下架']];
      case 'product:edit': return [['价格', yuan(amount), yuan(amount + 200)], ['库存', '56', '48']];
      case 'card:issue': return [['会员卡', '—', '月卡 C2026' + (1000 + Math.floor(R() * 8999))], ['剩余次数', '—', '30 次'], ['有效期', '—', '30 天']];
      case 'wallet:adjust': return [['储值余额', yuan(amount * 4), yuan(amount * 4 + 1000)], ['调整原因', '—', pk(['服务补偿', '充值未到账补录'])]];
      case 'system:account': return [['登录口令', '已设置', '已重置（72 小时内必须改密）'], ['登录状态', '在线', '已下线']];
      case 'system:config': return pk([[['未支付自动关闭（分钟）', '30', '45']], [['登录失败锁定次数', '5', '6']], [['免审核退款期限（天）', '7', '10']]]);
      case 'member:edit': return [['会员状态', '正常', '已禁用']];
      case 'coupon:edit': return [['已发放', '412', '612'], ['可领取库存', '588', '388']];
      case 'order:fulfil': return [['订单状态', '待履约', '已出餐']];
      default: return [];
    }
  }
  const noteFor = (rec) => (rec.code.indexOf('sensitive:') === 0 ? '这是一次读取，没有修改任何数据。看的是手机号，页面上只显示脱敏后的号码，原因已记录。' : rec.code === 'auth:login' ? '登录记录，没有修改数据。' : rec.code === 'export' ? '导出记录，文件里的手机号等个人信息已脱敏。' : isFail(rec) ? '这次操作没有成功，数据没有被修改。' : '这类操作没有记录逐项变更。');

  window.PAGES2.audit = {
    title: '操作日志', group: '系统',
    layout: '横带分层',
    reason: '查日志是从结论走向细节：先看今天有没有失败和敏感读取，再看近 14 天的操作量有没有异常，最后才翻明细、点详情看修改前后；自上而下三条横带正好对应这个视线，明细表要用满整行宽度',
    scenes: [{ id: 'nodata', label: '所选时间范围内没有操作记录' }, { id: 'export-limit', label: '导出失败：行数超过 5 万行的上限' }],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有操作记录');
      if (early) return early;
      return A2.load(() => build(ctx));
    },
  };

  function build(ctx) {
    const db = B.db, scene = ctx.scene, page = h('section.page.p3-page'), today = P3.today();
    const src = () => (scene === 'nodata' ? [] : db.audit);
    const state = { tab: 'all', range: '14', from: '', to: '', actor: '', action: '', type: '', result: '', q: '' };
    let table, tabsHost, rangeErr;

    /* ---------- 带一：概览数字 ---------- */
    const statsHost = h('div'), chartHost = h('div'), chartNote = h('p.muted');
    let first = true;
    function paintStats() {
      const all = src(), td = all.filter((r) => r.at.startsWith(today)), last14 = all.filter((r) => r.at >= P3.dayKey(13));
      const items = [
        { label: '今日操作数', v: td.length, sub: [h('span.muted', { text: '近 14 天日均 ' + Math.round(last14.length / 14) + ' 次' })] },
        { label: '失败操作数', v: td.filter(isFail).length, sub: [td.some(isFail) ? h('span.badge.badge--bad', { text: '近 14 天共 ' + last14.filter(isFail).length + ' 次' }) : h('span.muted', { text: '近 14 天共 ' + last14.filter(isFail).length + ' 次' })] },
        { label: '敏感读取数', v: td.filter(isSens).length, sub: [h('span.muted', { text: '含查看明文与导出，近 14 天 ' + last14.filter(isSens).length + ' 次' })] },
        { label: '涉及操作人数', v: new Set(td.map((r) => r.actor)).size, sub: [h('span.muted', { text: '近 14 天共 ' + new Set(last14.map((r) => r.actor)).size + ' 人' })] },
      ];
      const wrap = h('div.band-stats');
      items.forEach((it, i) => { const v = h('span.stat-value.num', { text: '0' }); wrap.append(h('div.stat' + (i ? '.stat--sm' : ''), {}, h('span.stat-label', { text: it.label }), v, h('span.stat-sub', {}, it.sub))); if (first) UI.count(v, it.v); else v.textContent = P3.n(it.v); });
      first = false; statsHost.replaceChildren(wrap);
    }

    /* ---------- 带二：近 14 天操作量 ---------- */
    function paintChart() {
      const labels = [], okS = [], sens = [], fail = [];
      for (let i = 13; i >= 0; i--) { const k = P3.dayKey(i), day = src().filter((r) => r.at.startsWith(k)); labels.push(k.slice(5).replace('-', '/')); fail.push(day.filter(isFail).length); sens.push(day.filter((r) => !isFail(r) && isSens(r)).length); okS.push(day.filter((r) => !isFail(r) && !isSens(r)).length); }
      const tot = labels.map((_, i) => okS[i] + sens[i] + fail[i]), sum = tot.reduce((a, b) => a + b, 0), peak = tot.indexOf(Math.max(...tot)), sf = fail.reduce((a, b) => a + b, 0);
      chartHost.replaceChildren(h('div'));
      if (!sum) { chartHost.replaceChildren(A2.empty('近 14 天没有操作记录')); chartNote.textContent = ''; return; }
      UI.bars(chartHost.firstChild, { labels, stacked: true, unit: ' 次', height: 220, aria: '近 14 天操作量堆叠柱图：共 ' + sum + ' 次，其中失败 ' + sf + ' 次，敏感读取 ' + sens.reduce((a, b) => a + b, 0) + ' 次，操作最多的一天是 ' + labels[peak] + '（' + tot[peak] + ' 次）', series: [{ name: '成功', data: okS }, { name: '敏感读取', data: sens, color: 'var(--ch-2)' }, { name: '失败', data: fail, color: 'var(--bad)' }] });
      chartNote.textContent = '近 14 天共 ' + sum + ' 次操作，其中失败 ' + sf + ' 次；操作最多的一天是 ' + labels[peak] + '（' + tot[peak] + ' 次）。';
    }

    /* ---------- 带三：明细 ---------- */
    function span() { if (state.range === 'custom') return [state.from || P3.dayKey(365), state.to || today]; const d = RANGES.find((x) => x[0] === state.range)[2]; return [P3.dayKey(d), today]; }
    const base = () => { const [f, t] = span(), q = state.q.toLowerCase(); return src().filter((r) => r.at >= f + ' 00:00' && r.at <= t + ' 23:59' && (!state.actor || r.actor === state.actor) && (!state.action || r.action === state.action) && (!state.type || typeOf(r) === state.type) && (!state.result || r.result === state.result) && (!q || (r.target + ' ' + r.trace).toLowerCase().includes(q))); };
    const rows = () => base().filter((r) => state.tab === 'all' || (state.tab === 'sens' ? isSens(r) : isFail(r)));
    function paintTabs() { const b = base(); tabsHost.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部操作', count: b.length }, { id: 'sens', label: '敏感读取', count: b.filter(isSens).length }, { id: 'fail', label: '失败操作', count: b.filter(isFail).length }], state.tab, (v) => { state.tab = v; refresh(); })); }
    const flashSet = new Set();
    function refresh(keepStats) { paintTabs(); table.setRows(rows()); P3.flash(table.el); flashSet.clear(); if (!keepStats) { paintStats(); paintChart(); } }
    const sel = (label, key, opts, w) => h('select.select', { 'aria-label': label, style: { width: w + 'px' }, on: { change: (e) => { state[key] = e.target.value; refresh(true); } } }, h('option', { value: '', text: label + '：全部' }), opts.map((o) => h('option', { value: o, text: o })));
    function detailsBand() {
      tabsHost = h('div');
      const uniq = (f) => [...new Set(db.audit.map(f))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      const rangeSel = h('select.select', { 'aria-label': '时间范围', style: { width: '132px' }, on: { change: (e) => { state.range = e.target.value; dates.hidden = state.range !== 'custom'; rangeErr.textContent = ''; refresh(true); } } }, RANGES.map(([v, l]) => h('option', { value: v, text: l, selected: v === state.range })));
      const fromIn = h('input.input', { type: 'date', 'aria-label': '开始日期', min: P3.dayKey(365), max: today, style: { width: '152px' } }), toIn = h('input.input', { type: 'date', 'aria-label': '结束日期', min: P3.dayKey(365), max: today, style: { width: '152px' } });
      rangeErr = h('div.err', { role: 'alert', style: { color: 'var(--bad-ink)' } });
      const onDate = () => { state.from = fromIn.value; state.to = toIn.value; if (fromIn.value && toIn.value && fromIn.value > toIn.value) { rangeErr.textContent = '开始日期不能晚于结束日期'; return; } rangeErr.textContent = ''; refresh(true); };
      fromIn.addEventListener('change', onDate); toIn.addEventListener('change', onDate);
      const dates = h('div.row', { hidden: state.range !== 'custom', style: { gap: 'var(--s-2)' } }, fromIn, h('span.muted', { text: '至' }), toIn);
      table = A2.table({
        caption: '操作日志', empty: scene === 'nodata' ? '所选时间范围内没有操作记录' : '没有符合条件的操作记录，换个筛选条件试试', rows: rows(), rowClass: (r) => (isFail(r) ? 'p3-fail' : '') + (flashSet.has(r) ? ' p3-flash' : ''),
        columns: [
          { title: '时间', cls: 'p3-nw num', render: (r) => P3.md(r.at) },
          { title: '操作人', cls: 'p3-nw', render: (r) => r.actor },
          { title: '操作', cls: 'p3-nw', render: (r) => h('span.row', { style: { gap: 'var(--s-2)' } }, r.action, isSens(r) ? P3.badge('敏感', 'warn', true) : null) },
          { title: '对象', cls: 'p3-nw', render: (r) => r.target },
          { title: '结果', cls: 'p3-nw', render: (r) => (isFail(r) ? P3.badge('失败', 'bad') : P3.badge('成功', 'ok')) },
          { title: '来源地址', cls: 'p3-nw num p3-hs', render: (r) => r.ip },
          { title: '请求编号', cls: 'p3-nw num', render: (r) => r.trace },
          { title: '操作', cls: 'p3-nw', render: (r) => h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '详情', 'aria-label': '查看详情 ' + r.trace, on: { click: () => detail(r) } }) },
        ],
      });
      paintTabs();
      return h('div.stack', {}, h('div.p3-note', {}, UI.icon('lock', 'icon--sm'), h('span.grow', { text: '审计记录保留 1 年，涉及个人信息的导出和越权操作保留 3 年；记录只能追加，这里不提供修改和删除，日期最多往前选一年。' })),
        h('div.card.card--tight.p3-toolbar', {}, tabsHost, h('span.grow'), A2.search('对象或请求编号', (v) => { state.q = v; refresh(true); })),
        h('div.p3-filters', {}, rangeSel, dates, sel('操作人', 'actor', uniq((r) => r.actor), 148), sel('操作类型', 'action', uniq((r) => r.action), 168), sel('对象', 'type', uniq(typeOf), 132), sel('结果', 'result', ['成功', '失败'], 132)), rangeErr, table.el);
    }
    function detail(r) {
      const diff = diffOf(r), related = db.audit.filter((x) => x !== r && x.target === r.target).slice(0, 6);
      A2.detail({ title: '操作详情 · ' + r.action, tabs: [
        { label: '概况', node: h('div.stack', {}, A2.kv([['时间', r.at], ['操作人', r.actor], ['操作', r.action], ['对象', r.target], ['结果', isFail(r) ? P3.badge('失败', 'bad') : P3.badge('成功', 'ok')], isFail(r) ? ['失败原因', r.fail || '操作没有完成'] : null, r.reason ? ['原因', r.reason] : null, ['来源地址', r.ip], ['请求编号', r.trace]].filter(Boolean)), isFail(r) ? P3.alert('bad', '这次操作失败了：' + (r.fail || '操作没有完成') + '。数据没有被修改。') : isSens(r) ? P3.alert('warn', '敏感读取：本次读取已留痕，只记录脱敏后的内容。') : null) },
        { label: '变更摘要', node: diff.length ? h('div.stack', {}, P3.simpleTable('修改前后对比', [{ title: '修改项', cls: 'p3-nw', render: (d) => h('b', { text: d[0] }) }, { title: '修改前', render: (d) => d[1] }, { title: '', cls: 'c', render: () => '→' }, { title: '修改后', render: (d) => h('b', { text: d[2] }) }], diff), h('p.muted', { text: '只列出有变化的项，手机号等敏感内容已脱敏。' })) : h('div.stack', {}, A2.empty(noteFor(r))) },
        { label: '关联记录', node: related.length ? h('div.list', {}, related.map((x) => h('div', {}, h('span.num.muted', { text: P3.md(x.at) }), h('span.grow', { text: x.actor + ' ' + x.action }), isFail(x) ? P3.badge('失败', 'bad') : P3.badge('成功', 'ok')))) : A2.empty('这个对象没有别的操作记录') },
      ] });
    }

    /* 导出：脱敏、生成导出任务，导出本身也会被记录 */
    async function exportLog() {
      if (!A2.can('export')) return UI.toast('当前角色没有导出权限', { kind: 'bad' });
      const n = rows().length, shown = scene === 'export-limit' ? 63200 : n;
      if (shown > 50000) return UI.dialog({ title: '导出行数超过上限', size: 'sm', body: h('div.stack', {}, P3.alert('bad', '按当前筛选预计 ' + P3.n(shown) + ' 行，超过单次导出上限 50,000 行。'), h('p', { text: '请缩短时间范围，或加上操作人、操作类型再导出。' })), actions: [{ label: '知道了', kind: 'primary', value: 'ok' }] });
      if (!n) return UI.toast('当前筛选下没有可导出的记录', { kind: 'bad' });
      const [f, t] = span(), ok = await UI.confirm('将按当前筛选导出 ' + P3.n(n) + ' 条记录（' + f.slice(5) + ' 至 ' + t.slice(5) + '）。手机号、来源地址末段已脱敏；导出会生成一个导出任务，这次导出本身也会写进操作日志。', { title: '导出操作日志', ok: '确认导出' });
      if (!ok) return;
      const before = db.audit.length;
      await A2.export('操作日志_' + f.slice(5) + '至' + t.slice(5) + '_脱敏', '审计', n);
      if (db.audit.length > before) { state.tab = 'all'; flashSet.add(db.audit[0]); refresh(); }
    }

    /* ---------- 组装 ---------- */
    const head = A2.heading('操作日志', '谁在什么时候对什么做了什么，只能查看，不能修改或删除', [h('button.btn.btn--primary', { type: 'button', text: '导出', on: { click: exportLog } })]);
    const expBtn = head.querySelector('.btn--primary'); if (!A2.can('export')) { expBtn.disabled = true; expBtn.title = '当前角色没有导出权限'; }
    const det = detailsBand();
    paintStats(); paintChart();
    page.append(head, h('div.l-bands', {},
      h('section.band', { 'aria-label': '概览数字' }, statsHost),
      h('section.band', { 'aria-label': '近 14 天操作量' }, h('div.band-title', {}, h('h2', { text: '近 14 天操作量' }), h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--ch-1)' } }), '成功'), h('span', {}, h('i', { style: { background: 'var(--ch-2)' } }), '敏感读取'), h('span', {}, h('i', { style: { background: 'var(--bad)' } }), '失败'))), chartHost, chartNote),
      h('section.band', { 'aria-label': '操作明细' }, h('div.band-title', {}, h('h2', { text: '操作明细' })), det)));
    return page;
  }
})();
