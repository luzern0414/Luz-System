/* 会员卡：已发卡、卡种设置、扣次记录（主区加右侧窄栏）。读写 B.db.cards / cardTypes / cardLogs，写操作留审计。 */
(function () {
  'use strict';
  const h = P2.h;
  const { today: TODAY, yuan, dAdd, dDiff, md, pad, last4 } = P2;

  P2.CARD_STATUS = { ACTIVE: ['生效中', 'ok'], FROZEN: ['已冻结', 'info'], LOST: ['已挂失', 'warn'], EXPIRED: ['已过期', ''], USEDUP: ['已用完', ''], REFUNDED: ['已退卡', ''], VOID: ['已作废', ''] };
  /** 卡的当前状态：按有效期和次数实时算 */
  P2.cardState = (c) => {
    if (['REFUNDED', 'VOID', 'LOST', 'FROZEN'].includes(c.status)) return c.status;
    if (c.expire < TODAY()) return 'EXPIRED';
    if (c.kind === '次卡' && c.total && c.used >= c.total) return 'USEDUP';
    return 'ACTIVE';
  };
  const TAB_OF = { ACTIVE: 'ACTIVE', FROZEN: 'FROZEN', LOST: 'LOST', EXPIRED: 'EXPIRED', USEDUP: 'EXPIRED', REFUNDED: 'END', VOID: 'END' };
  const logsOf = (c) => B.db.cardLogs.filter((l) => l.cardNo === c.no);
  P2.cardUsedToday = (c) => B.db.cardLogs.find((l) => l.cardNo === c.no && l.action === '核销扣次' && !l.revoked && l.at.slice(0, 10) === TODAY());
  P2.cardRemain = (c) => (c.kind === '次卡' ? Math.max(0, c.total - c.used) + '/' + c.total + ' 次' : '剩 ' + Math.max(0, dDiff(c.expire, TODAY())) + ' 天');
  const typeOf = (c) => B.db.cardTypes.find((t) => t.id === c.typeId) || {};
  const addLog = (c, action, note, operator, at) => { const l = { id: B.db.cardLogs.length + 1, cardNo: c.no, userName: c.userName, at: at || P2.nowStr(), action, operator: operator || A2.me().name, note: note || '' }; B.db.cardLogs.unshift(l); return l; };
  const cardNo = (id) => 'C' + String(20260000 + id * 53);
  const tgt = P2.target.card;

  /* ---------- 演示数据：卡带购买价、支付方式；即将到期、今日已扣、冻结顺延都对得上；扣次记录按已用次数重新生成 ---------- */
  P2.onSeed((db) => {
    const r = B.rng(171), today = TODAY(), types = db.cardTypes, cards = db.cards;
    /* 让三个卡种的销量有高有低：三张午餐时段卡改成月卡 */
    [3, 12, 15].forEach((id) => { const c = cards.find((x) => x.id === id), ty = types[0]; if (!c) return; Object.assign(c, { typeId: ty.id, typeName: ty.name, kind: ty.kind, total: 0, slot: '', expire: dAdd(c.bought, ty.days) }); if (c.status === 'EXPIRED' || c.expire < today) c.status = c.expire < today ? 'EXPIRED' : 'ACTIVE'; });
    cards.forEach((c) => { const ty = types.find((t) => t.id === c.typeId); c.price = ty.price; c.pay = r() < 0.5 ? '线上' : '现金'; c.transfers = 0; c.frozenTotal = 0; });
    [[2, 2], [7, 5], [10, 6], [13, 1]].forEach(([id, left]) => { const c = cards.find((x) => x.id === id), ty = c && types.find((t) => t.id === c.typeId); if (!c) return; c.expire = dAdd(today, left); c.bought = dAdd(c.expire, -ty.days); c.status = 'ACTIVE'; c.frozenDays = 0; });
    const fz = cards.find((c) => c.status === 'FROZEN');
    if (fz) { fz.frozenFrom = dAdd(today, -1); fz.frozenTotal = 3; fz.expire = dAdd(fz.expire, 3); }
    cards.forEach((c) => {
      const elapsed = Math.max(0, dDiff(c.expire < today ? c.expire : today, c.bought));
      c.used = c.kind === '次卡' ? Math.min(c.used, c.total) : Math.min(c.used, elapsed);
    });
    /* 今天已经扣过的三张：两张期限卡、一张次卡 */
    const todayHit = [];
    cards.filter((c) => c.status === 'ACTIVE' && c.expire >= today && c.kind === '期限卡' && c.used < dDiff(today, c.bought)).slice(0, 2).forEach((c) => todayHit.push(c));
    const ten = cards.find((c) => c.status === 'ACTIVE' && c.expire >= today && c.kind === '次卡' && c.used < c.total - 1); if (ten) todayHit.push(ten);
    todayHit.forEach((c) => (c.used += 1));
    const ops = ['陈晓燕', '何建平', '陈晓燕'], logs = [];
    cards.forEach((c) => {
      logs.push({ cardNo: c.no, userName: c.userName, at: c.bought + ' ' + pad(9 + Math.floor(r() * 9)) + ':' + pad(Math.floor(r() * 60)), action: '开卡', operator: c.pay === '现金' ? '陈晓燕' : '线上购买', note: (c.pay === '现金' ? '前台现金收款 ' : '线上支付 ') + yuan(c.price) });
      const hit = todayHit.includes(c), past = c.used - (hit ? 1 : 0), end = c.expire < today ? c.expire : dAdd(today, -1), span = Math.max(0, dDiff(end, c.bought)) + 1;
      const days = Array.from({ length: span }, (_, i) => dAdd(c.bought, i)).filter((d) => d >= c.bought && d <= end);
      const pickDays = c.kind === '次卡' ? Array.from({ length: past }, () => days[Math.floor(r() * days.length)]).sort() : days.slice().sort(() => r() - 0.5).slice(0, past).sort();
      pickDays.forEach((d) => { const slot = c.kind === '时段卡' ? [11, 13] : [11, 19]; logs.push({ cardNo: c.no, userName: c.userName, at: d + ' ' + pad(slot[0] + Math.floor(r() * (slot[1] - slot[0]))) + ':' + pad(Math.floor(r() * 60)), action: '核销扣次', operator: ops[Math.floor(r() * ops.length)], note: '' }); });
      if (hit) logs.push({ cardNo: c.no, userName: c.userName, at: today + ' ' + pad(8 + todayHit.indexOf(c)) + ':' + pad(12 + todayHit.indexOf(c) * 17), action: '核销扣次', operator: '陈晓燕', note: '' });
      if (c.status === 'FROZEN') logs.push({ cardNo: c.no, userName: c.userName, at: c.frozenFrom + ' 15:20', action: '冻结', operator: '陈晓燕', note: '请假 3 天，有效期顺延到 ' + c.expire });
      if (c.status === 'LOST') logs.push({ cardNo: c.no, userName: c.userName, at: dAdd(today, -2) + ' 18:05', action: '挂失', operator: '陈晓燕', note: '会员来电挂失' });
    });
    logs.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((l, i) => (l.id = i + 1));
    db.cardLogs = logs.reverse();
  });

  /* ---------- 发卡（会员页也用） ---------- */
  P2.issueCard = async (u0) => {
    const types = B.db.cardTypes.filter((t) => t.status === 'ON'), users = B.db.users.filter((u) => u.status === 'ENABLED' && (!u0 || u.id === u0.id));
    if (!types.length) { UI.toast('现在没有上架的卡种可以发', { kind: 'bad' }); return null; }
    let made = null;
    const scene = (UI.state.scene.cards || 'normal');
    await P2.form({ title: '人工发卡', size: 'sm', ok: '确认发卡', lead: '发卡会同步到会员的会员卡，并写入审计。',
      fields: [{ name: 'uid', label: '会员', type: 'select', options: users.map((u) => ({ v: String(u.id), l: u.name + '（尾号 ' + last4(u.phone) + '）' })), value: String(users[0].id) },
        { name: 'tid', label: '卡种', type: 'select', options: types.map((t) => ({ v: String(t.id), l: t.name + ' · ' + yuan(t.price) })), value: String(types[0].id) },
        { name: 'pay', label: '收款方式', type: 'select', options: ['现金', '线上'], value: '现金', hint: '现金表示前台已收款；线上表示会员已在小程序付款' }],
      submit: (v) => {
        const u = P2.userById(+v.uid), ty = B.db.cardTypes.find((t) => t.id === +v.tid);
        const held = B.db.cards.filter((c) => c.userId === u.id && c.typeId === ty.id && P2.cardState(c) === 'ACTIVE').length;
        if (held >= 2) P2.fail('该会员已持有 ' + held + ' 张生效中的「' + ty.name + '」，每人最多持有 2 张');
        if (scene === 'issue-limit') P2.fail('发卡失败：该会员的储值与会员卡合计已超过预付上限 ¥5,000.00');
        const id = Math.max(0, ...B.db.cards.map((c) => c.id)) + 1;
        made = { id, no: cardNo(id), userId: u.id, userName: u.name, typeId: ty.id, typeName: ty.name, kind: ty.kind, bought: TODAY(), expire: dAdd(TODAY(), ty.days), total: ty.times ? ty.times + ty.gift : 0, used: 0, status: 'ACTIVE', frozenDays: 0, slot: ty.slot || '', price: ty.price, pay: v.pay, transfers: 0, frozenTotal: 0 };
        B.db.cards.unshift(made);
        addLog(made, '开卡', (v.pay === '现金' ? '前台现金收款 ' : '线上支付 ') + yuan(ty.price));
        A2.audit('card:issue', '人工发卡「' + ty.name + '」，' + v.pay + ' ' + yuan(ty.price), tgt(made));
      } });
    if (made) UI.toast('已发卡 ' + made.no + '，会员的会员卡已同步');
    return made;
  };

  /* ---------- 扣次：返回具体失败原因；同一天同一张期限卡或时段卡只扣一次 ---------- */
  function deductCheck(c, at) {
    const st = P2.cardState(c);
    if (st === 'REFUNDED') return '这张卡已退卡，不能再使用';
    if (st === 'VOID') return '这张卡已作废（已补办新卡），请使用新卡';
    if (st === 'LOST') return '这张卡已挂失，不能使用；找回后请先解挂';
    if (st === 'FROZEN') return '这张卡正在冻结中（到 ' + md(dAdd(c.frozenFrom, c.frozenDays)) + '），期间不能使用；可以先解冻';
    if (st === 'EXPIRED') return '这张卡已于 ' + md(c.expire) + ' 到期';
    if (st === 'USEDUP') return '这张卡的次数已经用完';
    if (c.kind === '时段卡' && c.slot) { const [a, b] = c.slot.split('–'); if (at < a || at > b) return '不在可用时段：这张卡只能在 ' + c.slot + ' 使用，核销时间是 ' + at; }
    if (c.kind !== '次卡') { const l = P2.cardUsedToday(c); if (l) return '今天 ' + l.at.slice(11) + ' 已经扣过 1 次，同一天同一张卡只能扣一次，不会重复扣'; }
    return '';
  }
  function deduct(c, at, scene) {
    const bad = deductCheck(c, at);
    if (bad) P2.fail(bad);
    if (scene === 'deduct-device') P2.fail('扣次失败：这张卡正在另一台设备上核销，请 10 秒后再试');
    c.used += 1;
    const l = addLog(c, '核销扣次', '', undefined, TODAY() + ' ' + at);
    A2.audit('card:issue', '扣次 1 次（' + (c.kind === '次卡' ? '剩余 ' + (c.total - c.used) + ' 次' : '今日已用') + '）', tgt(c));
    return l;
  }
  P2.cardDeduct = deduct;

  window.PAGES2.cards = {
    title: '会员卡', group: '会员',
    layout: '主区加右侧窄栏',
    reason: '前台和店长的日常是在已发卡里找人、扣次、处理冻结和退卡，这是主区；即将到期、今日扣次和卡种销量只是提醒和参照，放在滚动时停留的右侧窄栏里',
    scenes: [
      { id: 'nodata', label: '没有符合条件的卡' },
      { id: 'deduct-device', label: '扣次失败：卡正在另一台设备核销' },
      { id: 'issue-limit', label: '发卡失败：超过预付上限' },
      { id: 'refund-quote-fail', label: '退卡试算失败：查不到原支付单' },
      { id: 'transfer-fail', label: '转让失败：对方手机号不是会员' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有发出去的会员卡');
      if (early) return early;
      P2.begin();
      UI.state.scene.cards = ctx.scene;
      const canCfg = A2.can('cardConfig'), canOp = A2.can('issue'), canExport = A2.can('export');
      const S = { tab: 'issued', status: 'ALL', q: '', logRange: '7', logAct: 'ALL', logQ: '' }, flashIds = new Set();
      const page = h('section.page.p2-page.p2-cards'), today = TODAY();
      const flashNew = (tblEl) => { if (flashIds.size) { P2.flashRows(tblEl); flashIds.clear(); } };

      /* ===== 右侧窄栏 ===== */
      const rail = h('aside.rail', { 'aria-label': '提醒与统计' });
      function paintRail() {
        const soon = B.db.cards.filter((c) => P2.cardState(c) === 'ACTIVE' && dDiff(c.expire, today) <= 7).sort((a, b) => (a.expire < b.expire ? -1 : 1));
        const logs = B.db.cardLogs.filter((l) => l.action === '核销扣次' && !l.revoked), cnt = (d) => logs.filter((l) => l.at.slice(0, 10) === d).length, todayN = cnt(today), yestN = cnt(dAdd(today, -1));
        const series = Array.from({ length: 7 }, (_, i) => cnt(dAdd(today, i - 6)));
        const types = B.db.cardTypes.map((t) => ({ t, n: B.db.cards.filter((c) => c.typeId === t.id && c.status !== 'VOID').length })), mx = Math.max(1, ...types.map((x) => x.n));
        const spark = h('div');
        rail.replaceChildren(
          h('section.card.card--tight.stack', { 'aria-label': '即将到期' }, h('div.row.between', {}, h('h3', { text: '7 天内到期' }), h('span.count', { text: soon.length })),
            soon.length ? h('ul.list.p2-soon', { role: 'list' }, soon.slice(0, 6).map((c) => h('li', {}, h('button.p2-soon-row', { type: 'button', 'aria-label': '查看 ' + c.userName + ' 的 ' + c.typeName + '，' + (dDiff(c.expire, today) === 0 ? '今天到期' : '还剩 ' + dDiff(c.expire, today) + ' 天'), on: () => openDetail(c.id) }, h('span.p2-soon-who', {}, h('b', { text: c.userName }), h('span.muted', { text: c.typeName + ' · ' + c.no.slice(-5) })), h('span.badge' + (dDiff(c.expire, today) <= 2 ? '.badge--warn' : ''), { text: dDiff(c.expire, today) === 0 ? '今天到期' : '还剩 ' + dDiff(c.expire, today) + ' 天' }))))) : h('p.muted', { text: '最近 7 天没有要到期的卡' })),
          h('section.card.card--tight.stack', { 'aria-label': '今日扣次' }, h('span.stat-label', { text: '今日扣次数' }), h('div.row', {}, h('span.stat-value.num.p2-rail-n', { text: String(todayN) }), h('span.delta' + (todayN >= yestN ? '.up' : '.down'), { text: (todayN >= yestN ? '▲ ' : '▼ ') + Math.abs(todayN - yestN) + ' 次' })), h('span.muted', { text: '较昨日 ' + yestN + ' 次，近 7 天趋势' }), spark),
          h('section.card.card--tight.stack', { 'aria-label': '卡种销量' }, h('h3', { text: '卡种销量' }), h('ul.p2-hbars', { role: 'list' }, types.map(({ t, n }) => h('li', {}, h('div.row.between', {}, h('span', { text: t.name }), h('b.num', { text: n + ' 张' })), h('div.progress', { role: 'img', 'aria-label': t.name + ' 已发 ' + n + ' 张' }, h('i', { style: { '--v': n / mx } })))))));
        UI.spark(spark, series, { label: '近 7 天每天扣次数：' + series.join('、') });
      }

      /* ===== 主区：标签页 ===== */
      const main = h('div.main'), tabsEl = h('div.tabs', { role: 'tablist', 'aria-label': '会员卡' }), panel = h('div.stack');
      const tabDefs = [['issued', '已发卡'], ...(canCfg ? [['types', '卡种设置']] : []), ...(canCfg ? [['logs', '扣次记录']] : [])];
      const paintTabs = () => tabsEl.replaceChildren(...tabDefs.map(([id, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), on: { click: () => { S.tab = id; paintTabs(); UI.go(paintPanel); } } }, l)));
      const paintPanel = () => { panel.replaceChildren(S.tab === 'issued' ? issuedView() : S.tab === 'types' ? typesView() : logsView()); };
      main.append(tabDefs.length > 1 ? tabsEl : h('h3', { text: '已发卡' }), panel);

      /* ===== 已发卡 ===== */
      function issuedView() {
        S.q = ''; S.status = 'ALL';
        const fb = P2.fbar([
          { key: 'type', label: '卡种', type: 'select', options: [['ALL', '全部卡种'], ...B.db.cardTypes.map((t) => [String(t.id), t.name])] },
          { key: 'exp', label: '到期时间', type: 'select', options: [['ALL', '全部'], ['7', '7 天内到期'], ['30', '30 天内到期']] },
          { key: 'avail', label: '今日是否可用', type: 'select', options: [['ALL', '全部'], ['Y', '今日可用'], ['N', '今日不可用']] },
          { key: 'buy', label: '购买时间', type: 'date' },
        ], () => draw());
        const tabsHost = P2.tabsRow('卡状态'), batchBar = h('div.p2-batch', { hidden: true }), count = h('span.muted.num');
        const search = A2.search('搜索卡号、会员姓名或手机号后四位', (v) => { S.q = v; draw(); }); search.style.width = '320px';
        fb.addReset(() => { S.q = ''; search.value = ''; });
        const usable = (c) => P2.cardState(c) === 'ACTIVE' && (c.kind === '次卡' || !P2.cardUsedToday(c));
        const match = (c, skipStatus) => {
          const g = fb.get(), st = P2.cardState(c);
          if (!skipStatus && S.status !== 'ALL' && TAB_OF[st] !== S.status) return false;
          if (g.type !== 'ALL' && String(c.typeId) !== g.type) return false;
          if (g.exp !== 'ALL' && !(st === 'ACTIVE' && dDiff(c.expire, today) <= Number(g.exp))) return false;
          if (g.avail === 'Y' && !usable(c)) return false;
          if (g.avail === 'N' && usable(c)) return false;
          if (g.buyFrom && c.bought < g.buyFrom) return false;
          if (g.buyTo && c.bought > g.buyTo) return false;
          if (S.q) { const u = P2.userById(c.userId); if (!(c.no.includes(S.q) || c.userName.includes(S.q) || (u && /^\d{4}$/.test(S.q) && last4(u.phone) === S.q))) return false; }
          return true;
        };
        const tbl = A2.table({
          caption: '已发卡', selectable: true, empty: '没有符合条件的会员卡', rowClass: (c) => (flashIds.has(c.id) ? 'p2-flash' : ''), onSelect: (rows) => paintBatch(rows),
          columns: [
            { title: '卡号', render: (c) => h('b.num', { text: c.no }) },
            { title: '会员', render: (c) => c.userName },
            { title: '卡种', cls: 'c', render: (c) => c.typeName },
            { title: '有效期至', cls: 'c', render: (c) => md(c.expire) },
            { title: '剩余 / 今日', render: (c) => remainCell(c) },
            { title: '状态', cls: 'c', render: (c) => A2.status(P2.CARD_STATUS, P2.cardState(c)) },
            { title: '操作', cls: 'c', render: (c) => h('div.row', { style: { justifyContent: 'center', gap: 'var(--s-1)' } }, h('button.btn.btn--sm.btn--soft', { type: 'button', text: '扣次', 'aria-label': '给 ' + c.userName + ' 的 ' + c.no + ' 扣次', on: () => deductOne(c) }), h('button.btn.btn--sm', { type: 'button', text: '查看', on: () => openDetail(c.id) }), canOp ? rowMenu(c) : null) },
          ],
        });
        function remainCell(c) {
          const st = P2.cardState(c);
          if (st === 'FROZEN') return h('span', { text: '冻结至 ' + md(dAdd(c.frozenFrom, c.frozenDays)) });
          if (st !== 'ACTIVE') return h('span.muted', { text: '—' });
          if (c.kind === '次卡') return h('div.p2-remain', {}, h('b.num', { text: '剩余 ' + (c.total - c.used) + ' / ' + c.total + ' 次' }), h('div.progress', { role: 'img', 'aria-label': '剩余 ' + (c.total - c.used) + ' 次，共 ' + c.total + ' 次' }, h('i', { style: { '--v': (c.total - c.used) / c.total } })));
          const used = P2.cardUsedToday(c), slot = c.kind === '时段卡' && c.slot;
          return h('div.p2-remain', {}, h('span.badge' + (used ? '' : '.badge--ok'), { text: used ? '今日已用' : '今日可用' }), h('span.muted.num', { text: (slot ? c.slot + ' · ' : '') + '剩 ' + dDiff(c.expire, today) + ' 天' }));
        }
        function rowMenu(c) {
          return P2.moreBtn(() => {
            const st = P2.cardState(c), it = [];
            if (st === 'ACTIVE') it.push({ label: '冻结（请假）', icon: 'snow', on: () => freeze(c) });
            if (st === 'FROZEN') it.push({ label: '解冻', icon: 'play', on: () => unfreeze(c) });
            if (st === 'ACTIVE' || st === 'FROZEN') it.push({ label: '挂失', icon: 'flag', on: () => lose(c) });
            if (st === 'LOST') it.push({ label: '解挂', icon: 'check', on: () => unlost(c) }, { label: '补办新卡', icon: 'refresh', on: () => reissue(c) });
            if (st === 'ACTIVE') it.push({ label: '转让', icon: 'swap', on: () => transfer(c) });
            if (['ACTIVE', 'FROZEN', 'LOST'].includes(st)) it.push({ label: '退卡试算', icon: 'receipt', on: () => refund(c) });
            if (['ACTIVE', 'FROZEN', 'EXPIRED'].includes(st)) it.push({ label: '延期', icon: 'calendar', on: () => extend(c) });
            return it.length ? it : [{ label: '这张卡没有可做的操作', on: () => 0 }];
          }, '更多操作：' + c.no);
        }
        function paintBatch(sel) {
          sel = sel || tbl.selected(); batchBar.hidden = !sel.length;
          batchBar.replaceChildren(h('b.num', { text: '已选 ' + sel.length + ' 张' }), h('button.btn.btn--sm.btn--soft', { type: 'button', text: '批量扣次', on: () => batchDeduct(tbl.selected()) }), h('button.btn.btn--sm.btn--ghost', { type: 'button', text: '取消选择', on: () => { tbl.clear(); paintBatch([]); } }));
        }
        function draw() {
          const rows = B.db.cards.filter((c) => match(c)).sort((a, b) => (a.id < b.id ? 1 : -1));
          P2.paintTabs(tabsHost, [['ALL', '全部'], ['ACTIVE', '生效中'], ['FROZEN', '已冻结'], ['LOST', '已挂失'], ['EXPIRED', '已过期'], ['END', '已终止']].map(([id, l]) => ({ id, label: l, count: B.db.cards.filter((c) => match(c, true) && (id === 'ALL' || TAB_OF[P2.cardState(c)] === id)).length })), S.status, (v) => { S.status = v; draw(); });
          count.textContent = '共 ' + rows.length + ' 张';
          tbl.setRows(ctx.scene === 'nodata' ? [] : rows); paintBatch([]); flashNew(tbl.el);
        }
        S.redraw = draw;
        const el = h('div.stack', {},
          h('div.row.wrap.between', {}, h('div.row.wrap', {}, search, count), h('div.row.wrap', {}, canExport ? h('button.btn', { type: 'button', on: () => A2.export('会员卡', '会员卡', B.db.cards.filter((c) => match(c)).length) }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : null, canOp ? h('button.btn.btn--primary', { type: 'button', on: async () => { const c = await P2.issueCard(); if (c) { flashIds.add(c.id); S.status = 'ALL'; afterChange(); } } }, UI.icon('plus', 'icon--sm'), h('span', { text: '人工发卡' })) : null)),
          h('div.p2-filterbox', {}, fb.el),
          tabsHost, batchBar, tbl.el);
        draw();
        return el;
      }
      const afterChange = () => { paintRail(); if (S.tab === 'issued' && S.redraw) S.redraw(); else paintPanel(); };

      /* ----- 扣次 ----- */
      async function deductOne(c) {
        const slot = c.kind === '时段卡';
        const pre = deductCheck(c, slot && c.slot ? c.slot.split('–')[0] : P2.nowHM());
        if (pre) { UI.toast(pre, { kind: 'bad' }); return false; }
        if (slot) {
          let done = null;
          const v = await P2.form({ title: '扣次：' + c.userName, size: 'sm', ok: '确认扣次', lead: '时段卡按核销时间校验可用时段（' + c.slot + '）。', fields: [{ name: 'at', label: '核销时间', type: 'select', options: [{ v: P2.nowHM(), l: '现在 ' + P2.nowHM() }, { v: '12:10', l: '12:10（午餐时段内）' }], value: P2.nowHM() }],
            submit: (x) => { deduct(c, x.at, ctx.scene); done = x.at; } });
          if (!v) return false;
          UI.toast('已扣次：' + c.userName + '，今日已用'); flashIds.add(c.id); afterChange(); return true;
        }
        if (!(await UI.confirm((c.kind === '次卡' ? '给 ' + c.userName + ' 的「' + c.typeName + '」扣 1 次，扣后剩余 ' + Math.max(0, c.total - c.used - 1) + ' 次。' : '给 ' + c.userName + ' 的「' + c.typeName + '」记录今天使用 1 次。同一天只能扣一次。'), { title: '确认扣次', ok: '确认扣次' }))) return false;
        const r = await P2.act(() => deduct(c, P2.nowHM(), ctx.scene));
        if (r.ok) { UI.toast('已扣次：' + c.userName + '，' + (c.kind === '次卡' ? '剩余 ' + (c.total - c.used) + ' 次' : '今日已用')); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }
      async function batchDeduct(sel) {
        if (!sel.length) return;
        if (!(await UI.confirm('将为已选的 ' + sel.length + ' 张卡各扣 1 次；今天已扣过的期限卡、不能使用的卡会被跳过并说明原因。', { title: '批量扣次', ok: '开始扣次' }))) return;
        const r = await P2.act(() => 0, 500); if (!r.ok) return;
        let ok = 0; const fails = [];
        sel.forEach((c) => { try { deduct(c, P2.nowHM(), ctx.scene); ok++; flashIds.add(c.id); } catch (e) { fails.push({ name: c.userName + ' ' + c.no.slice(-5), reason: e.message }); } });
        afterChange(); await P2.report('批量扣次结果', ok, fails);
      }

      /* ----- 冻结、解冻 ----- */
      async function freeze(c) {
        const left = 60 - (c.frozenTotal || 0);
        if (left <= 0) return UI.toast('这张卡累计冻结已满 60 天，不能再冻结', { kind: 'bad' });
        let prev;
        const v = await P2.form({ title: '冻结：' + c.userName + ' 的' + c.typeName, size: 'sm', ok: '确认冻结', lead: '冻结期间不能使用，也不会到期；有效期会顺延相同的天数。',
          fields: [{ name: 'days', label: '请假天数', type: 'number', required: true, value: 3, hint: '单次 1 到 30 天，累计最多 60 天（还可冻结 ' + left + ' 天）', validate: (x) => (!Number.isInteger(x) || x < 1 ? '请填写大于 0 的整数天数' : x > 30 ? '单次最多冻结 30 天' : x > left ? '累计最多 60 天，还可冻结 ' + left + ' 天' : '') }, { name: 'reason', label: '原因', type: 'textarea', required: true, max: 100 }],
          onBuild: (f, body) => { prev = h('div.p2-preview'); body.append(prev); const inp = f.el.querySelector('input'); const paint = () => { const n = Number(inp.value); prev.textContent = Number.isInteger(n) && n > 0 && n <= 30 ? '冻结到 ' + md(dAdd(today, n)) + '，有效期从 ' + md(c.expire) + ' 顺延到 ' + md(dAdd(c.expire, n)) : '填写天数后显示顺延后的到期日'; }; inp.addEventListener('input', paint); paint(); } });
        if (!v) return false;
        const r = await P2.act(() => { c.status = 'FROZEN'; c.frozenFrom = today; c.frozenDays = v.days; c.frozenTotal = (c.frozenTotal || 0) + v.days; c.expire = dAdd(c.expire, v.days); addLog(c, '冻结', '请假 ' + v.days + ' 天，有效期顺延到 ' + c.expire + '；' + v.reason); A2.audit('card:issue', '冻结 ' + v.days + ' 天：' + v.reason, tgt(c)); });
        if (r.ok) { UI.toast('已冻结，有效期顺延到 ' + md(c.expire)); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }
      async function unfreeze(c) {
        const used = Math.max(0, Math.min(c.frozenDays, dDiff(today, c.frozenFrom))), back = c.frozenDays - used;
        if (!(await UI.confirm('冻结已过 ' + used + ' 天（原计划 ' + c.frozenDays + ' 天），提前解冻后有效期' + (back ? '收回 ' + back + ' 天，变为 ' + md(dAdd(c.expire, -back)) : '保持 ' + md(c.expire)) + '。', { title: '提前解冻', ok: '确认解冻' }))) return false;
        const r = await P2.act(() => { c.expire = dAdd(c.expire, -back); c.frozenTotal = Math.max(0, (c.frozenTotal || 0) - back); c.status = 'ACTIVE'; c.frozenFrom = ''; c.frozenDays = 0; addLog(c, '解冻', '实际冻结 ' + used + ' 天，到期日 ' + c.expire); A2.audit('card:issue', '提前解冻（实际冻结 ' + used + ' 天）', tgt(c)); });
        if (r.ok) { UI.toast('已解冻，有效期到 ' + md(c.expire)); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }
      /* ----- 挂失、补办 ----- */
      async function lose(c) {
        if (!(await A2.danger('挂失后「' + c.userName + '」的这张卡立即不能使用，可以补办新卡或找回后解挂。', { ok: '确认挂失', title: '挂失 ' + c.no }))) return false;
        const r = await P2.act(() => { c.prevStatus = c.status; c.status = 'LOST'; addLog(c, '挂失', '后台办理'); A2.audit('card:issue', '挂失', tgt(c)); });
        if (r.ok) { UI.toast('已挂失 ' + c.no); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }
      async function unlost(c) {
        const r = await P2.act(() => { c.status = c.prevStatus === 'FROZEN' ? 'FROZEN' : 'ACTIVE'; addLog(c, '解挂', '会员找回'); A2.audit('card:issue', '解挂', tgt(c)); });
        if (r.ok) { UI.toast('已解挂 ' + c.no); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }
      async function reissue(c) {
        if (!(await UI.confirm('补办后换新卡号，原卡号作废，次数和有效期全部保留，不收工本费。', { title: '补办新卡', ok: '确认补办' }))) return false;
        let made;
        const r = await P2.act(() => {
          const id = Math.max(...B.db.cards.map((x) => x.id)) + 1;
          made = Object.assign({}, c, { id, no: cardNo(id), status: 'ACTIVE', prevStatus: '', reissuedFrom: c.no });
          c.status = 'VOID'; B.db.cards.unshift(made);
          addLog(c, '补办', '原卡号作废，新卡号 ' + made.no); addLog(made, '开卡', '补办，沿用原卡权益（原卡 ' + c.no + '）'); A2.audit('card:issue', '补办新卡 ' + made.no, tgt(c));
        });
        if (r.ok) { UI.toast('已补办，新卡号 ' + made.no); flashIds.add(made.id); afterChange(); }
        return r.ok;
      }
      /* ----- 转让 ----- */
      async function transfer(c) {
        if ((c.transfers || 0) >= 1) return UI.toast('这张卡已转让过 1 次，不能再转让', { kind: 'bad' });
        let hint;
        const v = await P2.form({ title: '转让会员卡：' + c.no, size: 'sm', ok: '确认转让', lead: '转让后原持卡人不再持有，每张卡最多转让 1 次，不收手续费。对方必须已经是会员。',
          fields: [{ name: 'phone', label: '对方手机号', type: 'tel', required: true, max: 11, validate: (x) => (!/^1\d{10}$/.test(x) ? '请输入 11 位手机号' : '') }],
          onBuild: (f, body) => { hint = h('div.p2-preview', { text: '输入后显示对方姓名' }); body.append(hint); const inp = f.el.querySelector('input'); inp.addEventListener('input', () => { const u = B.db.users.find((x) => x.phone === inp.value.trim()); hint.textContent = /^1\d{10}$/.test(inp.value.trim()) ? (u ? '对方：' + u.name + (u.status === 'DISABLED' ? '（已禁用）' : '') : '没有找到这个手机号的会员') : '输入后显示对方姓名'; }); },
          submit: (x) => {
            if (ctx.scene === 'transfer-fail') P2.fail('转让失败：这个手机号还不是会员，请对方先在小程序注册');
            const to = B.db.users.find((u) => u.phone === x.phone);
            if (!to) P2.fail('转让失败：这个手机号还不是会员，请对方先在小程序注册');
            if (to.id === c.userId) P2.fail('不能转让给自己');
            if (to.status === 'DISABLED') P2.fail('对方账号已禁用，不能受让');
            const from = c.userName; c.userId = to.id; c.userName = to.name; c.transfers = (c.transfers || 0) + 1;
            addLog(c, '转让', from + ' 转给 ' + to.name + '（尾号 ' + last4(to.phone) + '）'); A2.audit('card:issue', '转让：' + from + ' → ' + to.name, tgt(c));
          } });
        if (v) { UI.toast('已转让给 ' + c.userName); flashIds.add(c.id); afterChange(); }
        return !!v;
      }
      /* ----- 退卡试算 ----- */
      function quote(c) {
        const ty = typeOf(c), P = c.price || ty.price || 0, days = dDiff(today, c.bought), rows = [];
        let usedAmt, fullRefund = days <= 7 && c.used === 0;
        if (c.kind === '次卡') { const paid = ty.times || c.total, used = Math.min(c.used, paid); usedAmt = Math.round((P * used) / Math.max(1, paid)); rows.push(['已使用', c.used + ' 次（购买 ' + paid + ' 次，赠送 ' + Math.max(0, c.total - paid) + ' 次不折现）'], ['已用折算', '−' + yuan(usedAmt) + '（' + yuan(P) + ' ÷ ' + paid + ' 次 × ' + used + ' 次）']); }
        else { const valid = ty.days || 30, used = Math.min(c.used, valid); usedAmt = Math.round((P * used) / valid); rows.push(['已使用', used + ' 天，共 ' + valid + ' 天有效'], ['已用折算', '−' + yuan(usedAmt) + '（' + yuan(P) + ' ÷ ' + valid + ' 天 × ' + used + ' 天）']); }
        const fee = fullRefund ? 0 : Math.round((P - usedAmt) * 0.05), refund = fullRefund ? P : Math.max(0, P - usedAmt - fee);
        return { P, usedAmt, fee, refund, fullRefund, rows, days };
      }
      async function refund(c) {
        const q0 = await P2.act(() => { if (ctx.scene === 'refund-quote-fail') P2.fail('退卡试算失败：查不到这张卡的原支付单，请稍后再试'); return quote(c); }, 500);
        if (!q0.ok) return false;
        const q = q0.value;
        const detail = h('div.stack', {}, A2.kv([['实付', yuan(q.P)], ...q.rows, ['手续费', q.fullRefund ? '付款 7 天内且未使用，全额退，不收手续费' : '−' + yuan(q.fee) + '（剩余价值的 5%）'], ['可退金额', h('b.num', { style: { fontSize: '20px' }, text: yuan(q.refund) })], ['退回方式', c.pay === '线上' ? '原路退回，1 到 3 个工作日到账' : '线下现金退还，由前台当面办理']]),
          P2.cardState(c) === 'FROZEN' ? h('p.muted', { text: '这张卡冻结中，退卡会先按今天结束冻结再退款。' }) : null,
          h('p.muted', { text: '确认后这张卡立即作废，不能恢复。' }));
        const v = await P2.form({ title: '退卡试算：' + c.userName + ' 的' + c.typeName, size: 'sm', ok: '确认退卡', danger: true, lead: detail, fields: [{ name: 'reason', label: '退卡原因', type: 'textarea', required: true, max: 100 }],
          submit: (x) => { c.status = 'REFUNDED'; c.refundAmount = q.refund; c.refundAt = P2.nowStr(); addLog(c, '退卡', '退还 ' + yuan(q.refund) + '；' + x.reason); A2.audit('card:issue', '退卡 ' + yuan(q.refund) + '：' + x.reason, tgt(c)); } });
        if (v) { UI.toast('已退卡，退还 ' + yuan(q.refund)); flashIds.add(c.id); afterChange(); }
        return !!v;
      }
      /* ----- 延期 ----- */
      async function extend(c) {
        let prev;
        const v = await P2.form({ title: '延期：' + c.userName + ' 的' + c.typeName, size: 'sm', ok: '确认延期', lead: '当前有效期到 ' + md(c.expire) + '。延期会写入操作记录。',
          fields: [{ name: 'days', label: '延期天数', type: 'number', required: true, value: 7, hint: '单次最多 90 天', validate: (x) => (!Number.isInteger(x) || x < 1 ? '请填写大于 0 的整数天数' : x > 90 ? '单次最多延期 90 天' : '') }, { name: 'reason', label: '原因', type: 'textarea', required: true, max: 100 }],
          onBuild: (f, body) => { prev = h('div.p2-preview'); body.append(prev); const inp = f.el.querySelector('input'); const paint = () => { const n = Number(inp.value); prev.textContent = Number.isInteger(n) && n > 0 ? '延期后到 ' + md(dAdd(c.expire, n)) : '填写天数后显示延期后的到期日'; }; inp.addEventListener('input', paint); paint(); },
          check: (x) => (dAdd(c.expire, x.days) < today ? { days: '延期后仍早于今天，请加大天数' } : null),
          submit: (x) => { const old = c.expire; c.expire = dAdd(c.expire, x.days); if (c.status === 'EXPIRED') c.status = 'ACTIVE'; addLog(c, '延期', old + ' → ' + c.expire + '；' + x.reason); A2.audit('card:issue', '延期 ' + x.days + ' 天：' + x.reason, tgt(c)); } });
        if (v) { UI.toast('已延期到 ' + md(c.expire)); flashIds.add(c.id); afterChange(); }
        return !!v;
      }
      /* ----- 撤销扣次 ----- */
      async function revoke(l) {
        const c = B.db.cards.find((x) => x.no === l.cardNo);
        if (!c) return UI.toast('找不到这张卡', { kind: 'bad' });
        if (['REFUNDED', 'VOID'].includes(c.status)) return UI.toast('这张卡已' + (c.status === 'VOID' ? '作废' : '退卡') + '，不能撤销扣次', { kind: 'bad' });
        const reason = await A2.reason('撤销扣次：' + l.userName, '会把 ' + md(l.at) + ' 的这次扣次退回给会员，不能重复撤销。请写明原因。');
        if (!reason) return false;
        const r = await P2.act(() => { l.revoked = true; c.used = Math.max(0, c.used - 1); addLog(c, '撤销扣次', '撤销 ' + md(l.at) + ' 的扣次：' + reason); A2.audit('card:issue', '撤销扣次（' + md(l.at) + '）：' + reason, tgt(c)); });
        if (r.ok) { UI.toast('已撤销，次数已退回'); flashIds.add(c.id); afterChange(); }
        return r.ok;
      }

      /* ===== 卡种设置 ===== */
      function typesView() {
        const tbl = A2.table({
          caption: '卡种', empty: '还没有卡种', rowClass: (t) => (flashIds.has('t' + t.id) ? 'p2-flash' : ''),
          columns: [
            { title: '名称', render: (t) => h('b', { text: t.name }) },
            { title: '类型', cls: 'c', render: (t) => P2.badge(t.kind, 'brand') },
            { title: '价格', cls: 'r', render: (t) => yuan(t.price) },
            { title: '有效天数', cls: 'r', render: (t) => t.days },
            { title: '次数（含赠送）', cls: 'r', render: (t) => (t.times ? t.times + (t.gift ? ' + ' + t.gift : '') : '—') },
            { title: '每日次数', cls: 'c', render: (t) => (t.daily ? t.daily + ' 次' : '不限') },
            { title: '可用时段', cls: 'c', render: (t) => t.slot || '全天' },
            { title: '已发', cls: 'r', render: (t) => B.db.cards.filter((c) => c.typeId === t.id).length + ' 张' },
            { title: '状态', cls: 'c', render: (t) => A2.status({ ON: ['上架中', 'ok'], OFF: ['已下架', ''] }, t.status) },
            { title: '操作', cls: 'c', render: (t) => h('div.row', { style: { justifyContent: 'center', gap: 'var(--s-1)' } }, h('button.btn.btn--sm', { type: 'button', text: '编辑', on: () => editType(t) }), h('button.btn.btn--sm', { type: 'button', text: t.status === 'ON' ? '下架' : '上架', on: () => toggleType(t) })) },
          ],
        });
        tbl.setRows(B.db.cardTypes.slice()); flashNew(tbl.el);
        return h('div.stack', {}, h('div.row.between.wrap', {}, h('p.muted', { text: '卡种改动只影响之后新发的卡；已发出去的卡按购买时的内容执行，下架也不影响。' }), h('button.btn.btn--primary', { type: 'button', on: () => editType(null) }, UI.icon('plus', 'icon--sm'), h('span', { text: '新建卡种' }))), tbl.el);
      }
      async function toggleType(t) {
        const n = B.db.cards.filter((c) => c.typeId === t.id && ['ACTIVE', 'FROZEN'].includes(P2.cardState(c))).length;
        const on = t.status === 'ON';
        if (!(await (on ? A2.danger('「' + t.name + '」下架后，小程序和后台不能再购买或发这个卡种；已经发出的 ' + n + ' 张卡不受影响，照常使用。', { ok: '确认下架', title: '下架 ' + t.name }) : UI.confirm('「' + t.name + '」上架后可以继续购买和发卡。', { ok: '确认上架', title: '上架 ' + t.name })))) return false;
        const r = await P2.act(() => { t.status = on ? 'OFF' : 'ON'; A2.audit('card:config', (on ? '下架' : '上架') + '卡种「' + t.name + '」', '卡种 ' + t.name); });
        if (r.ok) { UI.toast((on ? '已下架 ' : '已上架 ') + t.name); flashIds.add('t' + t.id); paintPanel(); }
        return r.ok;
      }
      async function editType(t) {
        const isNew = !t, d = t || { name: '', kind: '次卡', price: 0, days: 30, times: 10, gift: 0, daily: 0, slot: '', status: 'OFF', desc: '' };
        const [s0, s1] = (d.slot || '11:00–13:30').split('–');
        const v = await P2.form({ title: isNew ? '新建卡种' : '编辑卡种：' + t.name, size: 'wide', ok: isNew ? '创建' : '保存',
          fields: [
            { name: 'name', label: '名称', required: true, value: d.name, max: 10, validate: (x) => (x.length < 2 ? '名称至少 2 个字' : B.db.cardTypes.some((o) => o !== t && o.name === x) ? '已经有同名的卡种' : '') },
            { name: 'kind', label: '类型', type: 'select', options: ['期限卡', '次卡', '时段卡'], value: d.kind },
            { name: 'price', label: '价格（元）', type: 'number', required: true, value: d.price ? d.price / 100 : '', validate: (x) => (x <= 0 ? '价格要大于 0' : x > 5000 ? '单张价格不能超过 ¥5,000（预付上限）' : '') },
            { name: 'days', label: '有效天数', type: 'number', required: true, value: d.days, validate: (x) => (!Number.isInteger(x) || x < 1 || x > 365 ? '请填写 1 到 365 的整数' : '') },
            { name: 'times', label: '次数', type: 'number', value: d.times || '' },
            { name: 'gift', label: '赠送次数', type: 'number', value: d.gift || 0, hint: '赠送不超过购买次数的 30%' },
            { name: 'daily', label: '每日次数', type: 'number', value: d.daily || '', hint: '留空表示不限制；期限卡通常是每天 1 次' },
            { name: 'slot0', label: '可用时段：开始', type: 'time', value: s0 },
            { name: 'slot1', label: '可用时段：结束', type: 'time', value: s1 },
            { name: 'status', label: '状态', type: 'select', options: [{ v: 'ON', l: '上架' }, { v: 'OFF', l: '下架' }], value: d.status },
          ],
          onBuild: (f) => {
            f.el.classList.add('p2-form2');
            const sel = f.el.querySelector('select'), show = () => { const k = sel.value; P2.fieldAt(f, 4).hidden = k !== '次卡'; P2.fieldAt(f, 5).hidden = k !== '次卡'; P2.fieldAt(f, 7).hidden = k !== '时段卡'; P2.fieldAt(f, 8).hidden = k !== '时段卡'; };
            sel.addEventListener('change', () => { f.el.querySelectorAll('.err').forEach((e) => (e.textContent = '')); f.el.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid')); show(); }); show();
          },
          check: (x) => {
            const e = {};
            if (x.kind === '次卡') { if (!Number.isInteger(x.times) || x.times < 1 || x.times > 200) e.times = '次卡要填 1 到 200 的整数次数'; else if ((x.gift || 0) > Math.floor(x.times * 0.3)) e.gift = '赠送不能超过购买次数的 30%（最多 ' + Math.floor(x.times * 0.3) + ' 次）'; }
            if (x.kind === '时段卡') { if (!x.slot0 || !x.slot1) e.slot0 = '请填写可用时段'; else if (x.slot1 <= x.slot0) e.slot1 = '结束时间要晚于开始时间'; }
            if (x.daily !== '' && (!Number.isInteger(x.daily) || x.daily < 1 || x.daily > 5)) e.daily = '每日次数填 1 到 5，或留空表示不限';
            return e;
          },
          submit: (x) => {
            const body = { name: x.name, kind: x.kind, price: Math.round(x.price * 100), days: x.days, times: x.kind === '次卡' ? x.times : 0, gift: x.kind === '次卡' ? x.gift || 0 : 0, daily: x.daily === '' ? 0 : x.daily, status: x.status };
            if (x.kind === '时段卡') body.slot = x.slot0 + '–' + x.slot1; else body.slot = '';
            body.desc = x.kind === '次卡' ? body.times + ' 次' + (body.gift ? '加赠 ' + body.gift + ' 次' : '') + '，' + x.days + ' 天内有效' : x.kind === '时段卡' ? '仅 ' + body.slot + ' 可用，' + x.days + ' 天有效' : x.days + ' 天内每天可用 ' + (body.daily || 1) + ' 次';
            if (isNew) { body.id = Math.max(0, ...B.db.cardTypes.map((o) => o.id)) + 1; B.db.cardTypes.push(body); t = body; } else Object.assign(t, body);
            A2.audit('card:config', (isNew ? '新建' : '修改') + '卡种「' + body.name + '」', '卡种 ' + body.name);
          } });
        if (v) { UI.toast(isNew ? '已创建卡种 ' + t.name : '已保存 ' + t.name); flashIds.add('t' + t.id); afterChange(); }
        return !!v;
      }

      /* ===== 扣次记录 ===== */
      function logsView() {
        S.logQ = '';
        const tbl = A2.table({
          caption: '扣次记录', empty: '没有符合条件的扣次记录', rowClass: (l) => (flashIds.has('l' + l.id) ? 'p2-flash' : ''),
          columns: [
            { title: '时间', cls: 'c', render: (l) => md(l.at) },
            { title: '卡号', render: (l) => l.cardNo },
            { title: '会员', render: (l) => l.userName },
            { title: '动作', cls: 'c', render: (l) => P2.badge(l.action + (l.revoked ? '（已撤销）' : ''), l.action === '撤销扣次' ? 'warn' : l.revoked ? '' : 'ok') },
            { title: '操作人', cls: 'c', render: (l) => l.operator },
            { title: '备注', cls: 'ell', render: (l) => l.note },
            { title: '操作', cls: 'c', render: (l) => (l.action === '核销扣次' && !l.revoked ? h('button.btn.btn--sm', { type: 'button', text: '撤销', on: () => revoke(l) }) : h('span.muted', { text: '—' })) },
          ],
        });
        const count = h('span.muted.num');
        const rows = () => { const since = S.logRange === 'today' ? today : S.logRange === '7' ? dAdd(today, -6) : '0000'; return B.db.cardLogs.filter((l) => ['核销扣次', '撤销扣次'].includes(l.action) && l.at.slice(0, 10) >= since && (S.logAct === 'ALL' || l.action === S.logAct) && (!S.logQ || l.cardNo.includes(S.logQ) || l.userName.includes(S.logQ))); };
        const draw = () => { const r = ctx.scene === 'nodata' ? [] : rows(); count.textContent = '共 ' + r.length + ' 条'; tbl.setRows(r); flashNew(tbl.el); };
        S.redraw = null;
        const search = A2.search('搜索卡号或会员姓名', (v) => { S.logQ = v; draw(); });
        const el = h('div.stack', {}, h('div.row.wrap.between', {}, h('div.row.wrap', {}, P2.seg('时间范围', [['today', '今天'], ['7', '近 7 天'], ['ALL', '全部']], S.logRange, (v) => { S.logRange = v; draw(); }), h('select.select', { 'aria-label': '动作', style: { width: '140px' }, on: { change: (e) => { S.logAct = e.target.value; draw(); } } }, [['ALL', '全部动作'], ['核销扣次', '核销扣次'], ['撤销扣次', '撤销扣次']].map(([v, l]) => h('option', { value: v, text: l, selected: v === S.logAct }))), search, count), canExport ? h('button.btn', { type: 'button', on: () => A2.export('扣次记录', '会员卡扣次', rows().length) }, UI.icon('download', 'icon--sm'), h('span', { text: '导出' })) : null), tbl.el);
        draw(); return el;
      }

      /* ===== 详情 ===== */
      function openDetail(id) {
        const card = () => B.db.cards.find((c) => c.id === id);
        const box = (paint) => { const n = h('div'); n.paint = () => n.replaceChildren(paint()); n.paint(); return n; };
        const info = box(() => {
          const c = card(), st = P2.cardState(c), u = P2.userById(c.userId), ty = typeOf(c);
          const acts = h('div.row.wrap');
          const add = (label, fn, kind) => acts.append(h('button.btn.btn--sm' + (kind ? '.btn--' + kind : ''), { type: 'button', text: label, on: async () => { const ok = await fn(c); if (ok !== false) repaint(); } }));
          add('扣次', (x) => deductOne(x), 'soft');
          if (canOp) {
            if (st === 'ACTIVE') add('冻结', freeze); if (st === 'FROZEN') add('解冻', unfreeze);
            if (st === 'ACTIVE' || st === 'FROZEN') add('挂失', lose);
            if (st === 'LOST') { add('解挂', unlost); add('补办新卡', reissue); }
            if (st === 'ACTIVE') add('转让', transfer);
            if (['ACTIVE', 'FROZEN', 'LOST'].includes(st)) add('退卡试算', refund);
            if (['ACTIVE', 'FROZEN', 'EXPIRED'].includes(st)) add('延期', extend);
          }
          const used = P2.cardUsedToday(c);
          return h('div.stack', {}, h('div.p2-kpis', {}, h('div', {}, h('span.muted', { text: '状态' }), A2.status(P2.CARD_STATUS, st)), h('div', {}, h('span.muted', { text: c.kind === '次卡' ? '剩余次数' : '剩余天数' }), h('b.num', { text: c.kind === '次卡' ? Math.max(0, c.total - c.used) + ' / ' + c.total : st === 'ACTIVE' ? dDiff(c.expire, today) + ' 天' : '—' })), h('div', {}, h('span.muted', { text: '今日' }), h('b', { text: c.kind === '次卡' ? '次卡不限每日' : st !== 'ACTIVE' ? '不可用' : used ? '已用 ' + used.at.slice(11) : '可用' })), h('div', {}, h('span.muted', { text: '实付' }), h('b.num', { text: yuan(c.price || 0) }))),
            A2.kv([['卡号', c.no], ['持卡会员', u ? u.name + '（' + B.maskPhone(u.phone) + '）' : c.userName], ['卡种', c.typeName + ' · ' + c.kind], ['说明', ty.desc || '—'], ['购买时间', c.bought + '，' + (c.pay === '现金' ? '前台现金收款' : '线上支付')], ['有效期', c.bought + ' 至 ' + c.expire], ['可用时段', c.slot || '全天'], ['冻结记录', c.frozenTotal ? '累计冻结 ' + c.frozenTotal + ' 天' + (st === 'FROZEN' ? '，当前从 ' + md(c.frozenFrom) + ' 起冻结 ' + c.frozenDays + ' 天' : '') : '无'], c.refundAmount != null ? ['退款', yuan(c.refundAmount) + '，' + md(c.refundAt)] : null].filter(Boolean)),
            h('div', {}, h('div.muted', { style: { marginBottom: 'var(--s-2)' }, text: '操作' }), acts));
        });
        const usage = box(() => {
          const c = card();
          return P2.mini([{ title: '时间', cls: 'c', render: (l) => md(l.at) }, { title: '动作', cls: 'c', render: (l) => P2.badge(l.action + (l.revoked ? '（已撤销）' : ''), l.action === '核销扣次' && !l.revoked ? 'ok' : l.action === '撤销扣次' ? 'warn' : '') }, { title: '操作人', cls: 'c', render: (l) => l.operator }, { title: '说明', render: (l) => l.note }, { title: '操作', cls: 'c', render: (l) => (canCfg && l.action === '核销扣次' && !l.revoked ? h('button.btn.btn--sm', { type: 'button', text: '撤销', on: async () => { await revoke(l); repaint(); } }) : '') }], logsOf(c), '还没有使用记录', 40);
        });
        const aud = box(() => P2.mini([{ title: '时间', cls: 'c', render: (a) => md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }, { title: '结果', cls: 'c', render: (a) => a.result }], B.db.audit.filter((a) => a.target === tgt(card())), '还没有对这张卡的操作记录'));
        const repaint = () => [info, usage, aud].forEach((p) => p.paint());
        A2.detail({ title: '会员卡详情：' + card().no, tabs: [{ id: 'info', label: '概况', node: info }, { id: 'use', label: '使用记录', node: usage }, { id: 'audit', label: '操作记录', node: aud }] });
      }

      /* ===== 组装 ===== */
      const layout = h('div.l-rail', {}, main, rail);
      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '会员卡' }), h('p.muted', { text: canCfg ? '已发卡、卡种和扣次，右侧是到期提醒与今日数据' : '查找会员的卡并扣次' }))), layout);
      return A2.load(() => { paintTabs(); paintPanel(); paintRail(); return P2.settled(page); });
    },
  };
})();
