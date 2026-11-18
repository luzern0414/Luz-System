/* 账号与角色（主区加右侧窄栏）：账号列表与角色列表两个工作区；右侧窄栏是选中角色的权限摘要、角色人数分布、风险提示。
   口令只在创建与重置那一次显示；二次验证开启要输 6 位验证码（演示用 123456），关闭要再输当前账号口令（演示用 Admin@2026）。 */
(function () {
  'use strict';
  const { h } = UI;
  UI.icons.eye = 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
  const SUPER = '超级管理员', DEMO_PASSWORD = 'Admin@2026', DEMO_CODE = '123456';
  const ALL = () => [].concat(...B.PERMS().map((g) => g.children.map((c) => c.code)));
  const PNAME = () => { const m = {}; B.PERMS().forEach((g) => g.children.forEach((c) => { m[c.code] = g.name + ' · ' + c.name; })); return m; };
  const HIGH_RISK = ['refund:approve', 'order:export', 'wallet:adjust', 'system:account'];
  const STALE_DAYS = 90;

  /* ---------- 演示数据：补齐账号到 12 个（和各角色的账号数对得上），补上角色说明 ---------- */
  P3.syncRoles = (db) => db.roles.forEach((r) => { r.users = db.accounts.filter((a) => a.role === r.name).length; });
  P3.onSeed(function seedAccounts(db) {
    const day = (n, t) => P3.dayKey(-n) + ' ' + t;
    const more = [
      ['manager2', '吴秀英', '13500001002', '店长', true, 1, '17:50'], ['manager3', '郑浩', '13500001003', '店长', false, 6, '10:05'], ['front3', '孙佳怡', '13500001012', '前台', false, 0, '09:15'],
      ['front4', '何磊', '13500001013', '前台', false, 2, '18:20'], ['front5', '罗静', '13500001014', '前台', false, 12, '12:40'], ['front6', '冯超', '13500001015', '前台', false, 95, '09:00'], ['finance2', '蒋文', '13800004005', '财务', true, 3, '15:30'],
    ];
    db.accounts.forEach((a) => { a.locked = false; a.mustChange = false; });
    more.forEach(([user, name, phone, role, mfa, back, t], i) => db.accounts.push({ id: 6 + i, user, name, phone, role, mfa, status: 'ENABLED', lastLogin: P3.dayKey(back) + ' ' + t, locked: user === 'front4', mustChange: false }));
    db.accounts.find((a) => a.user === 'front4').lockedAt = P3.today() + ' 10:12';
    const desc = { 超级管理员: '拥有全部权限；内置角色，不能修改也不能删除', 店长: '管理门店日常运营，不含账号与系统配置', 前台: '接待顾客、履约、发卡和扣次', 财务: '对账、审批退款、导出报表' };
    db.roles.forEach((r) => { r.desc = desc[r.name] || ''; r.updated = r.builtin ? '内置' : P3.dayKey(8 + r.id).slice(5) + ' 10:00'; });
    P3.syncRoles(db);
  });

  window.PAGES2.accounts = {
    title: '账号与角色', group: '系统',
    layout: '主区加右侧窄栏',
    reason: '管理员在这里反复做的是查账号、改角色、调权限，主区放账号与角色两张列表；而“哪个超级管理员没开二次验证、有几个账号被锁定、各角色多少人”是随时要瞄一眼的风险，放进停留在右侧的窄栏，不抢列表的位置',
    scenes: [
      { id: 'locked-account', label: '多个账号连续输错被锁定' },
      { id: 'no-mfa-super', label: '超级管理员没开二次验证（风险提示）' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有账号');
      if (early) return early;
      return A2.load(() => build(ctx));
    },
  };

  function build(ctx) {
    const db = B.db, scene = ctx.scene, page = h('section.page.p3-page'), flashSet = new Set();
    if (scene === 'locked-account' && !db._p3lk) { db._p3lk = true; ['front5', 'manager3'].forEach((u) => { const a = db.accounts.find((x) => x.user === u); a.locked = true; a.lockedAt = P3.today() + ' 09:' + (40 + u.length); }); }
    if (scene === 'no-mfa-super' && !db._p3nm) { db._p3nm = true; db.accounts.find((a) => a.role === SUPER && a.status === 'ENABLED').mfa = false; }
    const me = () => A2.me().user, isSelf = (a) => a.user === me();
    const supers = () => db.accounts.filter((a) => a.role === SUPER && a.status === 'ENABLED');
    const lastSuper = (a) => a.role === SUPER && a.status === 'ENABLED' && supers().length <= 1;
    const whyNoDisable = (a) => (isSelf(a) ? (lastSuper(a) ? '不能停用自己，也是最后一名在职的超级管理员' : '不能停用自己') : lastSuper(a) ? '至少保留一名在职的超级管理员' : '');
    const staleOf = (a) => a.status === 'ENABLED' && a.lastLogin && a.lastLogin.slice(0, 10) < P3.dayKey(STALE_DAYS);
    const roleOf = (name) => db.roles.find((r) => r.name === name);
    const state = { status: 'all', role: '', mfa: '', q: '', sel: db.roles[0].id };
    let tabsUI;

    /* ---------- 右侧窄栏 ---------- */
    const rail = h('aside.rail', { 'aria-label': '角色与风险' });
    function permsByGroup(role) { return B.PERMS().map((g) => ({ g, n: g.children.filter((c) => role.perms.includes(c.code)).length })); }
    function paintRail() {
      P3.syncRoles(db);
      const role = db.roles.find((r) => r.id === state.sel) || db.roles[0], total = ALL().length;
      const roleSel = h('select.select', { 'aria-label': '查看哪个角色的权限', on: { change: (e) => { state.sel = +e.target.value; paintRail(); paintRoles(true); } } }, db.roles.map((r) => h('option', { value: r.id, text: r.name, selected: r.id === role.id })));
      const sumCard = h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '角色权限摘要' }), role.builtin ? P3.badge('内置', 'brand', true) : null), roleSel,
        h('p.muted', { style: { margin: 'var(--s-3) 0' }, text: role.perms.length + ' / ' + total + ' 项权限 · ' + role.users + ' 个账号' + (role.desc ? '。' + role.desc : '') }),
        h('div.p3-sum', {}, permsByGroup(role).map(({ g, n }) => h('div.p3-sum-row', { title: g.name + '：' + n + ' / ' + g.children.length }, h('span', { text: g.name }), h('div.progress', { role: 'img', 'aria-label': g.name + ' ' + n + ' 项，共 ' + g.children.length + ' 项' }, h('i', { style: { '--v': n / g.children.length } })), h('span.num' + (n ? '' : '.muted'), { text: n + '/' + g.children.length })))));
      const dist = h('div'), total2 = db.accounts.length, items = db.roles.map((r, i) => ({ name: r.name, value: r.users, color: UI.chartColors[i % 6] }));
      const distCard = h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '角色人数分布' }), h('span.muted', { text: '共 ' + total2 + ' 个账号' })), dist, h('div.list.p3-dist', {}, items.map((x) => h('div', {}, h('i.p3-dot', { style: { background: x.color } }), h('span.grow', { text: x.name }), h('b.num', { text: x.value })))));
      const risks = [];
      db.accounts.filter((a) => a.role === SUPER && a.status === 'ENABLED' && !a.mfa).forEach((a) => risks.push({ tone: 'bad', text: '超级管理员「' + a.name + '」没有开启二次验证，口令一旦泄露就能改所有设置', act: '去开启', run: () => mfaOn(a) }));
      const lockedN = db.accounts.filter((a) => a.locked).length; if (lockedN) risks.push({ tone: 'warn', text: lockedN + ' 个账号因连续输错口令被锁定', act: '去解锁', run: () => { state.status = 'locked'; tabsUI.show(0); refreshAcc(); } });
      const noMfa = db.accounts.filter((a) => a.status === 'ENABLED' && !a.mfa && a.role !== SUPER && (roleOf(a.role) || { perms: [] }).perms.some((c) => HIGH_RISK.includes(c))); if (noMfa.length) risks.push({ tone: 'warn', text: noMfa.length + ' 个能审批退款或导出的账号没有开启二次验证（' + noMfa.map((a) => a.name).join('、') + '）', act: '去查看', run: () => { state.status = 'all'; state.mfa = 'off'; state.role = ''; syncAccFilters(); tabsUI.show(0); refreshAcc(); } });
      const staleN = db.accounts.filter(staleOf).length; if (staleN) risks.push({ tone: 'warn', text: staleN + ' 个在职账号超过 ' + STALE_DAYS + ' 天没登录，建议确认是否还需要', act: '去查看', run: () => { state.status = 'stale'; tabsUI.show(0); refreshAcc(); } });
      const riskCard = h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '风险提示' }), risks.length ? P3.badge(risks.length + ' 项', risks.some((r) => r.tone === 'bad') ? 'bad' : 'warn') : P3.badge('没有风险', 'ok')),
        risks.length ? h('div.list.p3-risks', {}, risks.map((r) => h('div', {}, UI.icon(r.tone === 'bad' ? 'warn' : 'info', 'icon--sm'), h('span.grow', { text: r.text }), h('button.btn.btn--soft.btn--sm', { type: 'button', text: r.act, on: { click: r.run } })))) : h('p.muted', { text: '超级管理员都开了二次验证，没有账号被锁定，也没有长期不用的账号。' }));
      rail.replaceChildren(riskCard, sumCard, distCard);
      UI.donut(dist, items, { size: 132, center: { value: total2, label: '个账号' }, aria: '各角色账号数：' + items.map((x) => x.name + ' ' + x.value + ' 个').join('，') });
    }

    /* ---------- 账号 ---------- */
    let accTable, accTabsHost, accBatch, accBatchText, roleSelF, mfaSelF;
    const accRows = () => db.accounts.filter((a) => (state.status === 'all' || (state.status === 'ENABLED' ? a.status === 'ENABLED' && !a.locked : state.status === 'DISABLED' ? a.status === 'DISABLED' : state.status === 'locked' ? a.locked : staleOf(a))) && (!state.role || a.role === state.role) && (!state.mfa || (state.mfa === 'on') === a.mfa) && (!state.q || (a.user + a.name).includes(state.q)));
    const statusKey = (a) => (a.locked ? 'LOCKED' : a.status);
    const STATUS = { ENABLED: ['正常', 'ok'], DISABLED: ['已停用', ''], LOCKED: ['已锁定', 'bad'] };
    function syncAccFilters() { if (roleSelF) { roleSelF.value = state.role; mfaSelF.value = state.mfa; } }
    function paintAccTabs() {
      const base = db.accounts.filter((a) => (!state.role || a.role === state.role) && (!state.mfa || (state.mfa === 'on') === a.mfa) && (!state.q || (a.user + a.name).includes(state.q)));
      const n = { all: base.length, ENABLED: base.filter((a) => a.status === 'ENABLED' && !a.locked).length, DISABLED: base.filter((a) => a.status === 'DISABLED').length, locked: base.filter((a) => a.locked).length, stale: base.filter(staleOf).length };
      accTabsHost.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: n.all }, { id: 'ENABLED', label: '正常', count: n.ENABLED }, { id: 'DISABLED', label: '已停用', count: n.DISABLED }, { id: 'locked', label: '已锁定', count: n.locked }, { id: 'stale', label: '长期未登录', count: n.stale }], state.status, (v) => { state.status = v; refreshAcc(); }));
    }
    function updateAccSel(sel) { const picked = sel || accTable.selected(); accBatch.hidden = !picked.length; accBatchText.textContent = '已选 ' + picked.length + ' 个账号'; }
    function refreshAcc(keep) { P3.syncRoles(db); paintAccTabs(); if (keep) accTable.clear(); else accTable.setRows(accRows()); updateAccSel([]); P3.flash(accTable.el); flashSet.clear(); tabsUI.count(0, db.accounts.length); tabsUI.count(1, db.roles.length); paintRail(); if (roleTable) paintRoles(true); }
    function accountsPanel() {
      accTabsHost = h('div'); accBatchText = h('span.grow', { 'aria-live': 'polite' });
      accBatch = h('div.p3-note', { hidden: true }, UI.icon('info', 'icon--sm'), accBatchText, h('button.btn.btn--sm', { type: 'button', text: '批量强制下线', on: { click: () => batchOp('logout') } }), h('button.btn.btn--sm.btn--danger', { type: 'button', text: '批量停用', on: { click: () => batchOp('disable') } }), h('button.btn.btn--sm.btn--ghost', { type: 'button', text: '取消选择', on: { click: () => { accTable.clear(); updateAccSel([]); } } }));
      roleSelF = h('select.select', { 'aria-label': '角色', style: { width: '136px' }, on: { change: (e) => { state.role = e.target.value; refreshAcc(); } } }, h('option', { value: '', text: '全部角色' }), db.roles.map((r) => h('option', { value: r.name, text: r.name })));
      mfaSelF = h('select.select', { 'aria-label': '二次验证', style: { width: '152px' }, on: { change: (e) => { state.mfa = e.target.value; refreshAcc(); } } }, h('option', { value: '', text: '二次验证：全部' }), h('option', { value: 'on', text: '已开启' }), h('option', { value: 'off', text: '未开启' }));
      accTable = A2.table({
        caption: '后台账号', selectable: true, empty: '没有符合条件的账号', rows: accRows(), onSelect: updateAccSel, rowClass: (a) => (flashSet.has(a) ? 'p3-flash' : ''),
        columns: [
          { title: '账号', cls: 'p3-nw', render: (a) => h('span.row', { style: { gap: 'var(--s-2)' } }, h('button.btn.btn--ghost.btn--sm.p3-link', { type: 'button', text: a.user, 'aria-label': '查看账号详情 ' + a.user, on: { click: () => accDetail(a) } }), isSelf(a) ? P3.badge('本人', 'brand', true) : null) },
          { title: '姓名', cls: 'p3-nw', render: (a) => a.name },
          { title: '手机号', cls: 'p3-nw num', render: (a) => P3.mask(a.phone) },
          { title: '角色', cls: 'p3-nw', render: (a) => h('button.btn.btn--ghost.btn--sm.p3-link', { type: 'button', text: a.role, title: '在右侧看这个角色的权限', on: { click: () => { const r = roleOf(a.role); if (r) { state.sel = r.id; paintRail(); paintRoles(true); } } } }) },
          { title: '二次验证', cls: 'p3-nw', render: (a) => (a.mfa ? P3.badge('已开启', 'ok') : P3.badge('未开启', 'warn')) },
          { title: '状态', cls: 'p3-nw', render: (a) => A2.status(STATUS, statusKey(a)) },
          { title: '最近登录', cls: 'p3-nw num p3-hs', render: (a) => P3.md(a.lastLogin) },
          { title: '操作', cls: 'p3-nw', render: (a) => accActions(a) },
        ],
      });
      paintAccTabs(); updateAccSel([]);
      return h('div.stack', {}, h('div.card.card--tight.p3-toolbar', {}, accTabsHost), h('div.p3-filters', {}, roleSelF, mfaSelF, h('span.grow'), A2.search('账号或姓名', (v) => { state.q = v; refreshAcc(); })), accBatch, accTable.el);
    }
    function accActions(a) {
      const more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + a.user }, UI.icon('more', 'p3-more'));
      P3.menuOn(more, () => [
        { label: '查看完整手机号', icon: 'eye', on: () => revealPhone(a) },
        { label: '重置密码', icon: 'lock', on: () => resetPwd(a), disabled: isSelf(a) ? '不能对自己操作' : null },
        { label: '强制下线', icon: 'x', on: () => forceOut(a), disabled: isSelf(a) ? '不能对自己操作' : null },
        a.mfa ? { label: '关闭二次验证', icon: 'shield', on: () => mfaOff(a) } : { label: '开启二次验证', icon: 'shield', on: () => mfaOn(a) },
        'hr',
        a.status === 'ENABLED' ? { label: '停用账号', icon: 'minus', danger: true, on: () => disable(a), disabled: !A2.can('disable') ? '没有停用权限' : whyNoDisable(a) || null } : { label: '启用账号', icon: 'check', on: () => enable(a), disabled: !A2.can('disable') ? '没有启用权限' : null },
      ]);
      return h('div.row', { style: { gap: 'var(--s-1)' } }, a.locked ? h('button.btn.btn--soft.btn--sm', { type: 'button', text: '解锁', 'aria-label': '解锁 ' + a.user, on: { click: () => unlock(a) } }) : null, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '编辑', 'aria-label': '编辑 ' + a.user, on: { click: () => editAccount(a) } }), more);
    }
    const done = (a, msg) => { flashSet.add(a); refreshAcc(true); UI.toast(msg); };
    const net = async (ms) => { try { await UI.request(null, ms || 500); return true; } catch (e) { UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); return false; } };

    /* 口令只显示一次 */
    function secretDialog(title, lead, secret) {
      return UI.dialog({ title, size: 'sm', dismiss: false, body: h('div.stack', {}, h('p', { text: lead }), h('div.p3-secret', { text: secret, tabindex: 0, 'aria-label': '口令：' + secret.split('').join(' ') }), h('div.row', {}, h('button.btn', { type: 'button', on: { click: async () => { const ok = await P3.copy(secret); UI.toast(ok ? '已复制到剪贴板' : '复制没有成功，请手动选中复制', ok ? {} : { kind: 'bad' }); } } }, UI.icon('copy', 'icon--sm'), '复制口令')), P3.alert('warn', '口令只显示这一次，关闭后无法再查看，请当面或用安全的方式告诉本人。72 小时内首次登录必须修改口令。')), actions: [{ label: '我已保存，关闭', kind: 'primary', value: 'ok' }] });
    }
    async function revealPhone(a) {
      const why = await A2.reason('查看完整手机号', '查看 ' + a.name + ' 的完整手机号。本次查看会被记录，原因必填。');
      if (!why) return;
      if (!(await net(300))) return;
      P3.audit('sensitive:phone', '查看手机号明文', '账号 ' + a.user, { reason: why, diff: [['查看内容', '—', '手机号']] });
      UI.dialog({ title: a.name + ' 的手机号', size: 'sm', body: h('div.stack', {}, h('div.p3-secret', { text: a.phone }), h('p.muted', { text: '关闭后不再显示，本次查看已记录（原因：' + why + '）。' })), actions: [{ label: '关闭', kind: 'primary', value: 'ok' }] });
    }

    /* 新建与编辑 */
    function accountForm(a) {
      const isNew = !a, user = h('input.input', { value: a ? a.user : '', maxlength: 32, placeholder: '4 到 32 位，字母、数字或下划线', autocomplete: 'off', readOnly: !isNew });
      const name = h('input.input', { value: a ? a.name : '', maxlength: 10 }), phone = h('input.input', { type: 'tel', inputmode: 'numeric', value: a ? a.phone : '', maxlength: 11, placeholder: '11 位手机号' });
      const self = a && isSelf(a), last = a && lastSuper(a);
      const role = h('select.select', { 'aria-label': '角色', disabled: !!(self || last) }, db.roles.map((r) => h('option', { value: r.name, text: r.name, selected: r.name === (a ? a.role : '前台') })));
      const f = { user: P3.field('账号名', user, { required: true, hint: isNew ? '创建后不能修改，也不会再被别人使用' : '账号名创建后不能修改' }), name: P3.field('姓名', name, { required: true }), phone: P3.field('手机号', phone, { required: true }), role: P3.field('角色', role, { required: true, hint: self ? (last ? '不能修改自己的角色；这也是最后一名在职的超级管理员，不能降权' : '不能修改自己的角色') : last ? '这是最后一名在职的超级管理员，不能降权' : '决定这个账号能看到和操作哪些功能' }) };
      Object.values(f).forEach((x) => x.control.addEventListener('input', () => x.setErr('')));
      return { f, el: h('div.stack', {}, f.user.el, f.name.el, f.phone.el, f.role.el), user, name, phone, role };
    }
    function validateForm(m, a) {
      let ok = true; const bad = (k, msg) => { m.f[k].setErr(msg); ok = false; };
      const u = m.user.value.trim();
      if (!a) { if (!/^[A-Za-z0-9_]{4,32}$/.test(u)) bad('user', '账号名要 4 到 32 位，只能用字母、数字或下划线'); else if (db.accounts.some((x) => x.user.toLowerCase() === u.toLowerCase())) bad('user', '账号名「' + u + '」已经被使用（停用的账号名也不会再用），请换一个'); }
      if (!m.name.value.trim()) bad('name', '请填写姓名'); else if ([...m.name.value.trim()].length > 10) bad('name', '姓名不超过 10 个字');
      if (!/^1[3-9]\d{9}$/.test(m.phone.value.trim())) bad('phone', '请填写 11 位手机号');
      if (a && m.role.value !== a.role) { if (isSelf(a)) bad('role', '不能修改自己的角色'); else if (lastSuper(a)) bad('role', '这是最后一名在职的超级管理员，不能降权，请先让另一位账号成为超级管理员'); }
      if (!ok) { const first = Object.values(m.f).find((x) => x.err.textContent); first && first.control.focus(); }
      return ok;
    }
    function newAccount() {
      const m = accountForm(null); let made = null, pwd = '';
      return UI.dialog({ title: '新建账号', size: 'sm', body: h('div.stack', {}, m.el, h('p.muted', { text: '创建后会生成一个随机初始口令，只显示一次。' })), actions: [{ label: '取消', value: null }, { label: '创建账号', kind: 'primary', value: 'ok', on: () => {
        if (!validateForm(m, null)) return false;
        return P3.submit(() => { pwd = P3.randomPassword(20); made = { id: Math.max(0, ...db.accounts.map((x) => x.id)) + 1, user: m.user.value.trim(), name: m.name.value.trim(), phone: m.phone.value.trim(), role: m.role.value, mfa: false, status: 'ENABLED', lastLogin: '', locked: false, mustChange: true }; db.accounts.push(made); P3.audit('system:account', '新建账号', '账号 ' + made.user, { diff: [['账号', '—', made.user], ['姓名', '—', made.name], ['角色', '—', made.role]] }); });
      } }] }).then(async (v) => {
        if (v !== 'ok' || !made) return;
        state.status = 'all'; state.role = state.mfa = state.q = ''; syncAccFilters(); flashSet.add(made); refreshAcc();
        await secretDialog('账号已创建', '「' + made.name + '」（' + made.user + '）的初始口令如下，请现在就记下来：', pwd);
        UI.toast('已创建账号 ' + made.user);
      });
    }
    function editAccount(a) {
      const m = accountForm(a);
      return UI.dialog({ title: '编辑 ' + a.user, size: 'sm', body: m.el, actions: [{ label: '取消', value: null }, { label: '保存', kind: 'primary', value: 'ok', on: () => {
        if (!validateForm(m, a)) return false;
        return P3.submit(() => { const before = { name: a.name, phone: a.phone, role: a.role }, diff = []; if (before.name !== m.name.value.trim()) diff.push(['姓名', before.name, m.name.value.trim()]); if (before.phone !== m.phone.value.trim()) diff.push(['手机号', P3.mask(before.phone), P3.mask(m.phone.value.trim())]); if (before.role !== m.role.value) diff.push(['角色', before.role, m.role.value]); Object.assign(a, { name: m.name.value.trim(), phone: m.phone.value.trim(), role: m.role.value }); if (diff.length) P3.audit('system:account', '修改账号', '账号 ' + a.user, { diff }); done(a, diff.length ? '已保存 ' + a.user : '没有修改任何内容'); });
      } }] });
    }
    async function resetPwd(a) {
      const why = await A2.reason('重置密码', '将重置「' + a.name + '」（' + a.user + '）的登录口令：旧口令立即失效，这个账号的所有登录会被强制下线，需要你把新口令告诉本人。');
      if (!why) return;
      if (!(await net(500))) return;
      const pwd = P3.randomPassword(20); a.mustChange = true; a.locked = false;
      P3.audit('system:account', '重置密码', '账号 ' + a.user, { reason: why, diff: [['口令', '已设置', '已重置（72 小时内必须改密）']] });
      flashSet.add(a); refreshAcc(true);
      await secretDialog('新口令', '「' + a.name + '」（' + a.user + '）的新口令如下：', pwd);
    }
    async function forceOut(a) {
      const why = await A2.reason('强制下线', '将让「' + a.name + '」（' + a.user + '）的所有登录立即失效，他正在做的操作会中断，需要重新登录。');
      if (!why) return;
      if (!(await net(400))) return;
      P3.audit('system:account', '强制下线', '账号 ' + a.user, { reason: why, diff: [['登录状态', '在线', '已下线']] });
      done(a, '已让 ' + a.user + ' 下线');
    }
    async function disable(a) {
      const no = whyNoDisable(a); if (no) return UI.toast(no, { kind: 'bad' });
      const why = await A2.reason('停用账号', '停用「' + a.name + '」（' + a.user + '）后，他将不能登录，已登录的会话立即失效，账号和操作记录保留，可以随时启用。');
      if (!why) return;
      if (!(await net(500))) return;
      const no2 = whyNoDisable(a); if (no2) return UI.toast(no2, { kind: 'bad' });
      a.status = 'DISABLED'; P3.audit('system:account', '停用账号', '账号 ' + a.user, { reason: why, diff: [['状态', '正常', '已停用']] }); done(a, '已停用 ' + a.user);
    }
    async function enable(a) {
      if (!(await UI.confirm('启用「' + a.name + '」（' + a.user + '）后，他可以重新登录。', { title: '启用账号', ok: '确认启用' }))) return;
      if (!(await net(400))) return;
      a.status = 'ENABLED'; P3.audit('system:account', '启用账号', '账号 ' + a.user, { diff: [['状态', '已停用', '正常']] }); done(a, '已启用 ' + a.user);
    }
    async function unlock(a) {
      if (!(await UI.confirm('「' + a.name + '」（' + a.user + '）因连续输错口令被锁定。解锁后他可以立即重新登录，输错次数清零。', { title: '解锁账号', ok: '确认解锁' }))) return;
      if (!(await net(400))) return;
      a.locked = false; P3.audit('system:account', '解锁账号', '账号 ' + a.user, { diff: [['状态', '已锁定', '正常']] }); done(a, '已解锁 ' + a.user);
    }

    /* 二次验证：开启要二维码加 6 位验证码，关闭要再输当前账号口令 */
    function qr(seed) {
      const N = 25, r = B.rng(seed), NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + (N + 2) + ' ' + (N + 2)); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '二维码示意图'); svg.setAttribute('class', 'p3-qr');
      const finder = (x, y) => x < 7 && y < 7 || x >= N - 7 && y < 7 || x < 7 && y >= N - 7;
      const ring = (x, y) => { const f = (a, b) => { const dx = Math.min(a, 6 - a), dy = Math.min(b, 6 - b); return Math.min(dx, dy) === 0 || (dx >= 2 && dy >= 2); }; const lx = x >= N - 7 ? x - (N - 7) : x, ly = y >= N - 7 ? y - (N - 7) : y; return f(lx, ly); };
      let d = '';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (finder(x, y) ? ring(x, y) : r() > 0.52) d += 'M' + (x + 1) + ' ' + (y + 1) + 'h1v1h-1z';
      const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', N + 2); bg.setAttribute('height', N + 2); bg.setAttribute('fill', 'var(--surface)');
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'var(--text-1)'); svg.append(bg, p); return svg;
    }
    async function mfaOn(a) {
      const secret = 'JBSW Y3DP EHPK 3PXP', code = h('input.input', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', 'aria-label': '6 位验证码', style: { letterSpacing: '0.4em', textAlign: 'center', fontSize: '20px' } }), cf = P3.field('验证器上的 6 位验证码', code, { hint: '演示：输入 ' + DEMO_CODE + ' 即可' }); code.addEventListener('input', () => cf.setErr(''));
      const ok = await UI.dialog({ title: '开启二次验证 · ' + a.user, size: 'sm', body: h('div.stack', {}, h('p', { text: '用手机上的验证器应用扫描下面的二维码，再输入它显示的 6 位验证码。' }), h('div.p3-qrbox', {}, qr(a.id * 31 + 7), h('div', {}, h('div.muted', { text: '扫不了码？手动输入密钥' }), h('div.p3-secret.p3-secret--sm', { text: secret }), h('div.muted', { text: '二维码是示意图，不能真的扫描。' }))), cf.el), actions: [{ label: '取消', value: null }, { label: '验证并开启', kind: 'primary', value: 'ok', on: () => P3.submit(() => { if (!/^\d{6}$/.test(code.value.trim())) { cf.setErr('请输入 6 位数字验证码'); return false; } if (code.value.trim() !== DEMO_CODE) { cf.setErr('验证码不对，请看一下验证器上的最新验证码再输入（演示：' + DEMO_CODE + '）'); code.select(); return false; } a.mfa = true; P3.audit('system:account', '开启二次验证', '账号 ' + a.user, { diff: [['二次验证', '未开启', '已开启']] }); }, 300) }] });
      if (ok !== 'ok') return;
      done(a, a.user + ' 已开启二次验证');
      const codes = Array.from({ length: 10 }, (_, i) => { const r = B.rng(a.id * 97 + i + 3), s = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(r() * 31)]).join(''); return s() + '-' + s(); });
      await UI.dialog({ title: '请保存恢复码', size: 'sm', dismiss: false, body: h('div.stack', {}, h('p', { text: '手机丢失或验证器用不了时，可以用恢复码登录，每个只能用一次。' }), h('div.p3-codes', {}, codes.map((c) => h('span.p3-secret.p3-secret--sm', { text: c }))), h('div.row', {}, h('button.btn', { type: 'button', on: { click: async () => { const o = await P3.copy(codes.join('\n')); UI.toast(o ? '已复制恢复码' : '复制没有成功，请手动抄写', o ? {} : { kind: 'bad' }); } } }, UI.icon('copy', 'icon--sm'), '复制全部')), P3.alert('warn', '恢复码只显示这一次，请离线保存。')), actions: [{ label: '我已保存，关闭', kind: 'primary', value: 'ok' }] });
    }
    async function mfaOff(a) {
      const pw = h('input.input', { type: 'password', autocomplete: 'current-password', 'aria-label': '当前账号口令' }), pf = P3.field('请输入你当前登录账号的口令', pw, { required: true, hint: '关闭前要再验证一次身份（演示口令：' + DEMO_PASSWORD + '）' }); pw.addEventListener('input', () => pf.setErr(''));
      const ok = await UI.dialog({ title: '关闭二次验证 · ' + a.user, size: 'sm', body: h('div.stack', {}, a.role === SUPER ? P3.alert('bad', '「' + a.name + '」是超级管理员，关闭后口令一旦泄露就能改所有设置，不建议关闭。') : P3.alert('warn', '关闭后，登录只需要口令，安全性会降低。'), pf.el), actions: [{ label: '取消', value: null }, { label: '确认关闭', kind: 'danger solid', value: 'ok', on: () => P3.submit(() => { if (!pw.value) { pf.setErr('请输入口令'); return false; } if (pw.value !== DEMO_PASSWORD) { pf.setErr('口令不对，请重新输入'); pw.select(); return false; } a.mfa = false; P3.audit('system:account', '关闭二次验证', '账号 ' + a.user, { diff: [['二次验证', '已开启', '未开启']] }); }, 300) }] });
      if (ok === 'ok') done(a, a.user + ' 已关闭二次验证');
    }

    /* 批量：成功几个、跳过几个与原因都报出来 */
    async function batchOp(kind) {
      const picked = accTable.selected(), ok = [], skip = [];
      picked.forEach((a) => { const why = kind === 'disable' ? (a.status !== 'ENABLED' ? '已经是停用状态' : whyNoDisable(a)) : isSelf(a) ? '不能对自己操作' : ''; (why ? skip : ok).push({ a, why }); });
      if (!ok.length) return UI.toast('选中的账号都不能' + (kind === 'disable' ? '停用' : '强制下线') + '：' + [...new Set(skip.map((s) => s.why))].join('；'), { kind: 'bad' });
      const lead = (kind === 'disable' ? '将停用 ' : '将强制下线 ') + ok.length + ' 个账号（' + ok.slice(0, 4).map((x) => x.a.name).join('、') + (ok.length > 4 ? ' 等' : '') + '）' + (kind === 'disable' ? '，他们将不能登录，已登录的立即失效' : '，他们正在做的操作会中断') + '。' + (skip.length ? '另有 ' + skip.length + ' 个会被跳过：' + [...new Set(skip.map((s) => s.why))].join('；') + '。' : '');
      const why = await A2.reason(kind === 'disable' ? '批量停用' : '批量强制下线', lead);
      if (!why) return;
      if (!(await net(700))) return;
      ok.forEach(({ a }) => { if (kind === 'disable') a.status = 'DISABLED'; flashSet.add(a); });
      P3.audit('system:account', kind === 'disable' ? '批量停用账号' : '批量强制下线', '共 ' + ok.length + ' 个账号：' + ok.map((x) => x.a.user).join('、'), { reason: why });
      refreshAcc(); UI.toast((kind === 'disable' ? '已停用 ' : '已让 ') + ok.length + (kind === 'disable' ? ' 个账号' : ' 个账号下线') + (skip.length ? '，跳过 ' + skip.length + ' 个' : ''));
    }
    function accDetail(a) {
      const r = roleOf(a.role), logs = db.audit.filter((x) => x.target.includes(a.user) || x.actor === a.name).slice(0, 8), pn = PNAME();
      A2.detail({ title: '账号详情 · ' + a.user, tabs: [
        { label: '概况', node: A2.kv([['账号', a.user], ['姓名', a.name], ['手机号', h('span.row', { style: { gap: 'var(--s-2)' } }, h('span.num', { text: P3.mask(a.phone) }), h('button.btn.btn--sm', { type: 'button', text: '查看完整号码', on: { click: () => revealPhone(a) } }))], ['角色', a.role], ['状态', A2.status(STATUS, statusKey(a))], ['二次验证', a.mfa ? '已开启' : '未开启'], ['最近登录', a.lastLogin || '从未登录'], ['口令', a.mustChange ? '临时口令，首次登录必须修改' : '已由本人设置']]) },
        { label: '权限', node: r ? h('div.stack', {}, h('p.muted', { text: '来自角色「' + r.name + '」，共 ' + r.perms.length + ' 项。' }), h('div.p3-chips', {}, r.perms.map((c) => h('span.badge.badge--plain', { text: pn[c] })))) : A2.empty('角色不存在') },
        { label: '操作记录', node: logs.length ? h('div.list', {}, logs.map((x) => h('div', {}, h('span.num.muted', { text: P3.md(x.at) }), h('span.grow', { text: x.actor + ' ' + x.action + ' · ' + x.target }), P3.badge(x.result, x.result === '成功' ? 'ok' : 'bad')))) : A2.empty('还没有相关的操作记录') },
      ] });
    }

    /* ---------- 角色 ---------- */
    let roleTable, roleQ = '';
    const roleRows = () => db.roles.filter((r) => !roleQ || (r.name + r.desc).includes(roleQ));
    function paintRoles(keep) { if (!roleTable) return; if (keep) roleTable.clear(); else roleTable.setRows(roleRows()); P3.flash(roleTable.el); flashSet.clear(); }
    function rolesPanel() {
      const total = ALL().length;
      roleTable = A2.table({
        caption: '角色', empty: '没有符合条件的角色', rows: roleRows(), rowClass: (r) => (flashSet.has(r) ? 'p3-flash' : r.id === state.sel ? 'p3-selected' : ''),
        columns: [
          { title: '名称', cls: 'p3-nw', render: (r) => h('div', {}, h('button.btn.btn--ghost.btn--sm.p3-link', { type: 'button', text: r.name, 'aria-label': '在右侧查看 ' + r.name + ' 的权限', on: { click: () => { state.sel = r.id; paintRail(); paintRoles(true); } } }), r.builtin ? P3.badge('内置', 'brand', true) : null) },
          { title: '说明', ell: true, render: (r) => r.desc },
          { title: '权限数', cls: 'r', render: (r) => r.perms.length + ' / ' + total },
          { title: '账号数', cls: 'r', render: (r) => r.users },
          { title: '最近修改', cls: 'p3-nw', render: (r) => r.updated },
          { title: '操作', cls: 'p3-nw', render: (r) => h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: r.builtin ? '查看' : '编辑', 'aria-label': (r.builtin ? '查看 ' : '编辑 ') + r.name, on: { click: () => roleDialog(r) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '复制', 'aria-label': '复制 ' + r.name, on: { click: () => roleDialog(null, { from: r }) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '删除', 'aria-label': '删除 ' + r.name, 'aria-disabled': r.builtin ? 'true' : null, title: r.builtin ? '内置角色不能删除' : null, on: { click: () => deleteRole(r) } })) },
        ],
      });
      return h('div.stack', {}, h('div.card.card--tight.p3-toolbar', {}, h('span.grow', { text: '角色决定账号能看到和操作哪些功能；内置角色不能删除，超级管理员的权限不能改。' }), A2.search('角色名称或说明', (v) => { roleQ = v; roleTable.setRows(roleRows()); })), roleTable.el);
    }
    async function deleteRole(r) {
      if (r.builtin) return UI.dialog({ title: '内置角色不能删除', size: 'sm', body: '「' + r.name + '」是系统内置角色，用来保证随时有人能管理系统，不能删除。', actions: [{ label: '知道了', kind: 'primary', value: 'ok' }] });
      P3.syncRoles(db);
      if (r.users > 0) {
        const v = await UI.dialog({ title: '还有账号在用这个角色', size: 'sm', body: h('div.stack', {}, h('p', {}, '角色「', h('b', { text: r.name }), '」下还有 ' + r.users + ' 个账号：' + db.accounts.filter((a) => a.role === r.name).map((a) => a.name).join('、') + '。'), h('p.muted', { text: '请先把他们调到其他角色，再来删除。' })), actions: [{ label: '知道了', value: null }, { label: '去看这些账号', kind: 'primary', value: 'go' }] });
        if (v === 'go') { state.role = r.name; state.status = 'all'; state.mfa = ''; state.q = ''; syncAccFilters(); tabsUI.show(0); refreshAcc(); }
        return;
      }
      if (!(await A2.danger('删除角色「' + r.name + '」（' + r.perms.length + ' 项权限，没有账号在用），删除后无法恢复，只能重新创建。', { ok: '确认删除', title: '删除角色' }))) return;
      if (!(await net(400))) return;
      db.roles.splice(db.roles.indexOf(r), 1); if (state.sel === r.id) state.sel = db.roles[0].id;
      P3.audit('system:account', '删除角色', '角色 ' + r.name, { diff: [['角色', r.name, '已删除']] }); refreshAcc(); roleTable.setRows(roleRows()); UI.toast('已删除角色「' + r.name + '」');
    }

    /* 角色编辑：权限树（父级联动子级、半选、搜索、全选与清空）加变更预览 */
    function roleDialog(role, o) {
      o = o || {};
      const groups = B.PERMS(), all = ALL(), pn = PNAME(), readOnly = !!(role && role.builtin), isNew = !role;
      const cur = new Set(readOnly ? all : role ? role.perms : o.from ? o.from.perms : []), base = new Set(role ? role.perms : []);
      const nameIn = h('input.input', { value: role ? role.name : o.from ? o.from.name + '（副本）' : '', maxlength: 12, disabled: readOnly, placeholder: '例如：仓库管理员' }), nameF = P3.field('角色名称', nameIn, { required: true, hint: '2 到 12 个字，不能和已有角色重名' });
      const descIn = h('input.input', { value: role ? role.desc : o.from ? o.from.desc : '', maxlength: 40, disabled: readOnly, placeholder: '一句话说明这个角色做什么' }), descF = P3.field('说明', descIn);
      const search = h('input.input.input--search', { type: 'search', placeholder: '搜索权限，例如“退款”', 'aria-label': '搜索权限', style: { flex: 1, minWidth: '160px' } });
      const counter = h('span.muted.num', { 'aria-live': 'polite' }), empty = h('p.muted', { hidden: true, text: '没有找到匹配的权限，换个词试试' });
      const tree = h('div.p3-tree', { role: 'group', 'aria-label': '权限树' }), refs = [];
      groups.forEach((g) => {
        const head = h('input', { type: 'checkbox', 'aria-label': '选择「' + g.name + '」下的全部权限', disabled: readOnly }), cnt = h('span.muted.num'), kids = h('div.p3-kids'), toggle = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '展开或收起 ' + g.name, 'aria-expanded': 'true' }, UI.icon('down', 'icon--sm'));
        const leaves = g.children.map((c) => { const cb = h('input', { type: 'checkbox', disabled: readOnly, on: { change: () => { cb.checked ? cur.add(c.code) : cur.delete(c.code); paint(); } } }), lab = h('label.p3-leaf', {}, cb, h('span', { text: c.name })); kids.append(lab); return { c, cb, lab }; });
        head.addEventListener('change', () => { g.children.forEach((c) => (head.checked ? cur.add(c.code) : cur.delete(c.code))); paint(); });
        toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); kids.hidden = !open; toggle.style.rotate = open ? '' : '-90deg'; });
        const el = h('div.p3-group', {}, h('div.p3-ghead', {}, h('label.p3-gname', {}, head, h('b', { text: g.name })), cnt, toggle), kids); tree.append(el); refs.push({ g, head, cnt, leaves, el, kids, toggle });
      });
      const prevAdd = h('div.p3-chips'), prevDel = h('div.p3-chips'), prev = h('div.stack', {});
      function paint() {
        const q = search.value.trim();
        let any = false;
        refs.forEach((r) => {
          const n = r.g.children.filter((c) => cur.has(c.code)).length; r.head.checked = n === r.g.children.length; r.head.indeterminate = n > 0 && n < r.g.children.length; r.cnt.textContent = n + ' / ' + r.g.children.length;
          const gm = !q || r.g.name.includes(q); let vis = 0;
          r.leaves.forEach((l) => { l.cb.checked = cur.has(l.c.code); const show = gm || l.c.name.includes(q) || (r.g.name + l.c.name).includes(q); l.lab.hidden = !show; if (show) vis++; });
          r.el.hidden = !!q && !gm && !vis; if (q && !r.el.hidden) { r.kids.hidden = false; r.toggle.setAttribute('aria-expanded', 'true'); r.toggle.style.rotate = ''; } if (!r.el.hidden) any = true;
        });
        empty.hidden = any; counter.textContent = '已选 ' + cur.size + ' / ' + all.length + ' 项';
        const added = all.filter((c) => cur.has(c) && !base.has(c)), removed = all.filter((c) => !cur.has(c) && base.has(c));
        prevAdd.replaceChildren(...added.map((c) => h('span.badge.badge--ok.badge--plain', {}, UI.icon('plus', 'icon--sm'), pn[c]))); prevDel.replaceChildren(...removed.map((c) => h('span.badge.badge--bad.badge--plain', {}, UI.icon('minus', 'icon--sm'), pn[c])));
        prev.replaceChildren(...[h('h3', { text: '权限变更预览' }),
          readOnly ? h('p.muted', { text: '超级管理员拥有全部 ' + all.length + ' 项权限，不能修改。' }) : isNew ? h('p', { text: cur.size ? '这个新角色将拥有 ' + cur.size + ' 项权限，保存后可以分配给账号。' : '还没有选任何权限，没有权限的角色保存后账号什么也看不到。' }) : !added.length && !removed.length ? h('p.muted', { text: '权限还没有变化。' }) : h('p', { text: '新增 ' + added.length + ' 项，去掉 ' + removed.length + ' 项' + (role.users ? '；会影响 ' + role.users + ' 个账号，他们下一次操作立即按新权限校验' : '') + '。' }),
          added.length ? h('div.stack', { style: { gap: 'var(--s-1)' } }, h('b', { text: '新增 ' + added.length + ' 项' }), prevAdd) : null, removed.length ? h('div.stack', { style: { gap: 'var(--s-1)' } }, h('b', { text: '去掉 ' + removed.length + ' 项' }), prevDel) : null].filter(Boolean));
      }
      search.addEventListener('input', paint);
      const bulk = h('div.row.wrap', {}, search, h('button.btn.btn--sm', { type: 'button', text: '全选', disabled: readOnly, on: { click: () => { all.forEach((c) => cur.add(c)); paint(); } } }), h('button.btn.btn--sm', { type: 'button', text: '清空', disabled: readOnly, on: { click: () => { cur.clear(); paint(); } } }));
      paint();
      const body = h('div.p3-split', {}, h('div.stack', {}, readOnly ? P3.alert('info', '超级管理员是内置角色，拥有全部权限，不能修改也不能删除。') : null, nameF.el, descF.el, h('div.field', {}, h('div.row.between', {}, h('label', { text: '权限' }), counter), bulk, tree, empty)), h('div.p3-sticky', {}, prev));
      let saved = null;
      return UI.dialog({ title: readOnly ? '查看角色 · ' + role.name : isNew ? (o.from ? '复制角色 · ' + o.from.name : '新建角色') : '编辑角色 · ' + role.name, size: 'wide', body, actions: readOnly ? [{ label: '关闭', kind: 'primary', value: null }] : [{ label: '取消', value: null }, { label: '保存', kind: 'primary', value: 'ok', on: async () => {
        const name = nameIn.value.trim(); let bad = false;
        if ([...name].length < 2) { nameF.setErr('角色名称至少 2 个字'); bad = true; } else if (db.roles.some((r) => r !== role && r.name === name)) { nameF.setErr('已经有叫「' + name + '」的角色，换一个名字'); bad = true; }
        if (bad) { nameIn.focus(); return false; }
        const added = all.filter((c) => cur.has(c) && !base.has(c)), removed = all.filter((c) => !cur.has(c) && base.has(c));
        if (role && !added.length && !removed.length && name === role.name && descIn.value.trim() === role.desc) { UI.toast('没有修改任何内容'); return; }
        if (role && removed.length && role.users && !(await A2.danger('将去掉「' + role.name + '」的 ' + removed.length + ' 项权限，影响 ' + role.users + ' 个账号，保存后他们下一次操作立即按新权限校验。', { ok: '确认保存', title: '收回权限' }))) return false;
        return P3.submit(() => {
          const diff = [];
          if (isNew) { saved = { id: Math.max(0, ...db.roles.map((r) => r.id)) + 1, name, builtin: false, perms: all.filter((c) => cur.has(c)), users: 0, desc: descIn.value.trim(), updated: P3.stamp().slice(5) }; db.roles.push(saved); diff.push(['角色', '—', name], ['权限', '—', cur.size + ' 项']); }
          else { saved = role; if (role.name !== name) { db.accounts.forEach((a) => { if (a.role === role.name) a.role = name; }); diff.push(['名称', role.name, name]); role.name = name; } if (added.length) diff.push(['新增权限', '—', added.map((c) => pn[c]).join('、')]); if (removed.length) diff.push(['去掉权限', removed.map((c) => pn[c]).join('、'), '—']); role.perms = all.filter((c) => cur.has(c)); role.desc = descIn.value.trim(); role.updated = P3.stamp().slice(5); }
          P3.audit('system:account', isNew ? (o.from ? '复制角色' : '新建角色') : '修改角色权限', '角色 ' + name, { diff });
        });
      } }] }).then(async (v) => { if (v === 'ok' && saved) { flashSet.add(saved); state.sel = saved.id; await tabsUI.show(1); refreshAcc(); roleTable.setRows(roleRows()); P3.flash(roleTable.el); UI.toast(isNew ? '已创建角色「' + saved.name + '」' : '已保存角色「' + saved.name + '」'); } });
    }

    /* ---------- 组装 ---------- */
    const head = A2.heading('账号与角色', '管理谁能登录、能做什么', [h('button.btn', { type: 'button', text: '新建角色', on: { click: () => roleDialog(null) } }), h('button.btn.btn--primary', { type: 'button', text: '新建账号', on: { click: newAccount } })]);
    tabsUI = P3.tabs([{ label: '账号', count: db.accounts.length, render: accountsPanel }, { label: '角色', count: db.roles.length, render: rolesPanel }], { label: '账号与角色' });
    paintRail();
    const banner = scene === 'locked-account' ? P3.alert('warn', db.accounts.filter((a) => a.locked).length + ' 个账号因连续输错口令被锁定，可以在列表里点“解锁”。') : null;
    page.append(head); if (banner) page.append(banner);
    page.append(h('div.l-rail', {}, h('div.main', {}, h('div.card.card--tight.p3-tabsbar', {}, tabsUI.list), tabsUI.panels), rail));
    return page;
  }
})();
