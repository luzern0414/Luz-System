/* 通知（主区加右侧窄栏）：模板、发送记录、订阅额度三个工作区，右侧窄栏盯今日失败率、待重试与最近失败原因。
   发送记录与订阅额度是本页自己的演示数据，挂在 B.db.sendLogs 与 B.db.subQuota 上，重置演示数据时重新生成。 */
(function () {
  'use strict';
  const { h } = UI;
  const pad = P3.pad;

  /* ---------- 渠道、变量、校验 ---------- */
  const CHANNELS = ['订阅消息', '短信', '站内信'];
  const CH = { 订阅消息: { limit: 60, kw: 20, tone: 'brand' }, 短信: { limit: 70, hard: 201, tone: 'info' }, 站内信: { limit: 200, tone: '' } };
  const VARS = [
    { k: '订单号', sample: 'A27-10086', max: 32, type: 'code' }, { k: '取餐号', sample: 'A27', max: 6, type: 'code' }, { k: '金额', sample: '¥18.00', max: 12, type: 'amount' }, { k: '余额', sample: '¥86.50', max: 12, type: 'amount' },
    { k: '卡名', sample: '月卡', max: 20, type: 'thing' }, { k: '日期', sample: '11-20', max: 10, type: 'date' }, { k: '验证码', sample: '482915', max: 6, type: 'code' }, { k: '活动名', sample: '周三会员日', max: 20, type: 'thing' },
    { k: '会员名', sample: '李哲', max: 10, type: 'thing' }, { k: '门店名', sample: '示例门店', max: 20, type: 'thing' }, { k: '商品名', sample: '招牌牛腩饭', max: 40, type: 'thing' },
  ];
  const VRE = /\{\{([^{}]*)\}\}/g;
  const findVar = (k) => VARS.find((v) => v.k === k.trim());
  const renderSample = (tpl, who) => tpl.replace(VRE, (m, k) => { const v = findVar(k); return v ? (v.k === '会员名' && who ? who : v.sample) : m; });
  /** 校验内容：返回 {errors, warns, len, est}；est 是每个变量都取最长值时的字数 */
  function check(tpl, channel) {
    const errors = [], warns = [], used = [], c = CH[channel];
    (tpl.match(VRE) || []).forEach((m) => { const v = findVar(m.slice(2, -2)); if (v && !used.includes(v)) used.push(v); });
    const est = [...tpl.replace(VRE, '')].length + (tpl.match(VRE) || []).reduce((n, m) => { const v = findVar(m.slice(2, -2)); return n + (v ? v.max : [...m].length); }, 0);
    if (!tpl.trim()) { errors.push('请填写内容'); return { errors, warns, est: 0 }; }
    const stripped = tpl.replace(VRE, '');
    if (/[{}]/.test(stripped)) errors.push('大括号不成对，变量要写成 {{订单号}} 这样，可以直接点下面的按钮插入');
    (tpl.match(VRE) || []).forEach((m) => { if (!findVar(m.slice(2, -2))) errors.push('变量「' + m.slice(2, -2).trim() + '」不存在，请从下面的按钮里选'); });
    if (channel === '订阅消息') {
      used.filter((v) => v.type === 'thing' && v.max > c.kw).forEach((v) => errors.push('变量「' + v.k + '」最长 ' + v.max + ' 字，超过订阅消息单个关键词 ' + c.kw + ' 字的上限，请换变量或改用站内信、短信'));
      if (est > c.limit) errors.push('按变量最长取值估算有 ' + est + ' 字，超过订阅消息 ' + c.limit + ' 字的上限');
    } else if (channel === '短信') {
      if (est > c.hard) errors.push('按变量最长取值估算有 ' + est + ' 字，短信最多 ' + c.hard + ' 字');
      else if (est > c.limit) warns.push('约 ' + est + ' 字，超过 ' + c.limit + ' 字会拆成 ' + Math.ceil(est / 67) + ' 条短信计费');
    } else if (est > c.limit) errors.push('按变量最长取值估算有 ' + est + ' 字，超过站内信 ' + c.limit + ' 字的上限');
    return { errors, warns, est };
  }

  /* ---------- 失败原因与处理办法 ---------- */
  const RS = {
    订阅消息: { temp: ['微信暂时没有响应，已超时', '微信服务繁忙，请稍后重试'], perm: ['订阅额度已用完', '用户拒收订阅消息', '关键词内容不合规'] },
    短信: { temp: ['短信通道繁忙', '运营商没有及时回应'], perm: ['手机号为空号或已停机', '用户已退订营销短信', '短信内容含屏蔽词'] },
    站内信: { temp: ['消息中心写入超时'], perm: ['会员已注销'] },
  };
  const REMEDY = {
    '订阅额度已用完': '等会员在小程序里再次订阅后，下次触发同类消息时会自动发出。',
    '用户拒收订阅消息': '会员已在微信里拒收这类消息，请改用站内信或短信通知。',
    '关键词内容不合规': '消息里有关键词的内容超出长度或格式，请检查模板，之后由新的业务事件触发。',
    '手机号为空号或已停机': '请会员在小程序里更新手机号。',
    '用户已退订营销短信': '按规定不能再给这位会员发营销短信。',
    '短信内容含屏蔽词': '请修改模板里的敏感词，保存后由新的业务事件触发。',
    '会员已注销': '这位会员已经注销，无需再发。',
  };
  const STATUS = { OK: ['成功', 'ok'], FAIL: ['失败', 'bad'], RETRY: ['重试中', 'warn'] };

  /* ---------- 演示数据：发送记录与订阅额度 ---------- */
  P3.onSeed(function seedNotify(db) {
    const r = B.rng(77), users = db.users, onTpls = db.templates.filter((t) => t.status === 'ON'), logs = [];
    const pick = (a) => a[Math.floor(r() * a.length)];
    const now = P3.stamp();
    for (let d = 13; d >= 0; d--) {
      const n = d === 0 ? 36 : 20 + Math.floor(r() * 14);
      for (let i = 0; i < n; i++) {
        const t = pick(onTpls), u = pick(users);
        let at = P3.dayKey(d) + ' ' + pad(d === 0 ? 8 + Math.floor(r() * 2.5) : 8 + Math.floor(r() * 14)) + ':' + pad(Math.floor(r() * 60));
        if (at > now) at = now;
        const roll = r(), forced = d === 0 ? { 5: 'T', 14: 'P', 27: 'T', 9: 'R', 21: 'R' }[i] : null;
        let status = 'OK', permanent = false, reason = '', tries = 0;
        if (forced === 'T' || forced === 'P' || (d > 0 && roll < 0.055)) { status = 'FAIL'; permanent = forced ? forced === 'P' : d > 3 ? r() < 0.75 : r() < 0.5; reason = pick(RS[t.channel][permanent ? 'perm' : 'temp']); tries = permanent ? 1 : 5; }
        else if (forced === 'R') { status = 'RETRY'; reason = pick(RS[t.channel].temp); tries = 1 + Math.floor(r() * 3); }
        const attempts = [];
        if (status === 'OK') attempts.push({ at, result: '成功', note: '首次投递成功' });
        else if (permanent) attempts.push({ at, result: '失败', note: reason + '，属于永久失败，不再重试' });
        else {
          const back = [0, 1, 5, 30, 120];
          for (let k = 0; k < tries; k++) { const t2 = P3.addMin(at, back[k]); if (t2 <= now) attempts.push({ at: t2, result: '失败', note: reason + (k ? '，第 ' + k + ' 次自动重试' : '') }); }
          if (status === 'FAIL') attempts.push({ at: P3.addMin(at, 150), result: '失败', note: '自动重试 5 次仍失败，等待人工重发' });
        }
        logs.push({ at, userId: u.id, userName: u.name, phone: P3.mask(u.phone), tplId: t.id, scene: t.scene, channel: t.channel, status, reason, permanent, tries, content: renderSample(t.content, u.name).replace('A27-10086', 'A' + (10 + Math.floor(r() * 80)) + '-' + (10000 + Math.floor(r() * 89999))), attempts });
      }
    }
    logs.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((l, i) => { l.id = i + 1; l.msgNo = 'M' + (20260000 + (i + 1) * 37); });
    db.sendLogs = logs.reverse();
    const quota = {};
    db.templates.filter((t) => t.channel === '订阅消息').forEach((t) => { quota[t.id] = quotaFor(t, users); });
    db.subQuota = quota;
  });
  function quotaFor(t, users) { const rq = B.rng(900 + t.id), q = {}, zeroP = 0.1 + (t.id % 3) * 0.17; users.forEach((u) => { const x = rq(); q[u.id] = x < zeroP ? 0 : x < zeroP + 0.2 ? 1 + Math.floor(rq() * 2) : 3 + Math.floor(rq() * 5); }); return q; }
  const quotaOf = (t) => { const db = B.db; db.subQuota = db.subQuota || {}; return (db.subQuota[t.id] = db.subQuota[t.id] || quotaFor(t, db.users)); };

  const quietRow = () => B.db.config.runtime.find((x) => x.key === 'notify.quiet_hours');
  const chBadge = (c) => P3.badge(c, CH[c].tone, true);

  window.PAGES2.notify = {
    title: '通知', group: '系统',
    layout: '主区加右侧窄栏',
    reason: '运营在这里每天做的是维护模板和盯发送结果，所以主区放模板、发送记录、订阅额度三个工作区；今日失败率、待重试数、最近失败原因要随时瞄一眼，放进停留在右边的窄栏，滚动长列表时它不会跑掉',
    scenes: [
      { id: 'nodata', label: '还没有任何发送记录' },
      { id: 'channel-down', label: '短信通道异常：测试发送与重发失败' },
      { id: 'high-fail', label: '失败率偏高：今天微信没有响应的情况变多' },
      { id: 'no-quota', label: '订阅额度全部用完' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有通知场景');
      if (early) return early;
      return A2.load(() => build(ctx));
    },
  };

  function build(ctx) {
    const db = B.db, scene = ctx.scene;
    if (scene === 'high-fail' && !db._p3hf) { db._p3hf = true; db.sendLogs.filter((l) => l.at.startsWith(P3.today()) && l.status === 'OK' && l.channel === '订阅消息').slice(0, 11).forEach((l, i) => { l.status = i % 3 === 2 ? 'RETRY' : 'FAIL'; l.reason = '微信暂时没有响应，已超时'; l.permanent = false; l.tries = l.status === 'RETRY' ? 2 : 5; l.attempts = [{ at: l.at, result: '失败', note: '微信暂时没有响应，已超时' }]; }); }
    if (scene === 'no-quota' && !db._p3nq) { db._p3nq = true; Object.values(db.subQuota).forEach((q) => Object.keys(q).forEach((k) => { q[k] = 0; })); }
    const logsAll = () => (scene === 'nodata' ? [] : db.sendLogs);
    const flashSet = new Set();
    const page = h('section.page.p3-page');
    const today = P3.today();

    /* ---------- 右侧窄栏 ---------- */
    const rail = h('aside.rail', { 'aria-label': '发送情况提醒' });
    let railFirst = true;
    function paintRail() {
      const logs = logsAll().filter((l) => !l.test), td = logs.filter((l) => l.at.startsWith(today)), fail = td.filter((l) => l.status === 'FAIL').length, retrying = td.filter((l) => l.status === 'RETRY').length;
      const rate = td.length ? (fail / td.length) * 100 : 0, high = rate > 10;
      const pendingManual = logs.filter((l) => l.status === 'FAIL' && !l.permanent).length, pendingAuto = logs.filter((l) => l.status === 'RETRY').length;
      const daily = Array.from({ length: 14 }, (_, i) => { const k = P3.dayKey(13 - i); return logs.filter((l) => l.at.startsWith(k) && !l.test).length; });
      const reasons = {}; logs.filter((l) => (l.status === 'FAIL' || l.status === 'RETRY') && l.at >= P3.dayKey(2)).forEach((l) => { const x = reasons[l.reason] = reasons[l.reason] || { n: 0, last: '', perm: l.permanent }; x.n++; if (l.at > x.last) x.last = l.at; });
      const top = Object.entries(reasons).sort((a, b) => b[1].n - a[1].n).slice(0, 4);
      const sent = h('span.stat-value.num', { text: '0' }), rt = h('span.stat-value.num', { text: '0', style: high ? { color: 'var(--bad-ink)' } : null }), pend = h('span.stat-value.num', { text: '0' });
      const spark = h('div', { style: { marginTop: 'var(--s-3)' } });
      rail.replaceChildren(
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '今日发送' }), high ? P3.badge('失败率偏高', 'bad') : P3.badge('运行正常', 'ok')),
          h('div.p3-pair', {}, h('div.stat.stat--sm', {}, h('span.stat-label', { text: '发送量' }), sent, h('span.stat-sub', { text: '截至 ' + P3.stamp().slice(11) })), h('div.stat.stat--sm', {}, h('span.stat-label', { text: '失败率' }), rt, h('span.stat-sub', { text: fail + ' 条失败 · ' + retrying + ' 条重试中' }))),
          spark, h('div.muted', { text: '近 14 天每日发送量' })),
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '待重试' }), pendingManual + pendingAuto ? P3.badge('需要关注', 'warn') : P3.badge('没有积压', 'ok')),
          h('div.stat.stat--sm', {}, pend, h('span.stat-sub', { text: pendingManual + ' 条等人工重发 · ' + pendingAuto + ' 条自动重试中' })),
          h('button.btn.btn--soft.btn--sm', { type: 'button', style: { marginTop: 'var(--s-3)' }, text: '去处理', disabled: !pendingManual, on: { click: () => { state.tab = 'FAIL'; state.scene = state.channel = state.q = ''; state.range = '14'; tabsUI.show(1); syncToolbar(); refreshLogs(); } } })),
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '最近失败原因' }), h('span.muted', { text: '近 3 天' })),
          top.length ? h('div.list', {}, top.map(([why, x]) => h('div', {}, h('span.grow', {}, why, h('div.muted', { text: '最近 ' + P3.md(x.last) })), h('span.badge.' + (x.perm ? 'badge--bad' : 'badge--warn') + '.num', { text: x.n + ' 条' })))) : h('p.muted', { text: '近 3 天没有失败，状态很好' })));
      if (railFirst) { UI.count(sent, td.length); UI.count(rt, rate, { dec: 1, suffix: '%' }); UI.count(pend, pendingManual + pendingAuto); } else { sent.textContent = P3.n(td.length); rt.textContent = rate.toFixed(1) + '%'; pend.textContent = pendingManual + pendingAuto; }
      railFirst = false;
      UI.spark(spark, daily, { color: high ? 'var(--bad)' : 'var(--brand)', label: '近 14 天每日发送量，今天 ' + daily[13] + ' 条' });
    }

    /* ---------- 模板 ---------- */
    const tplState = { status: 'all', channel: '', q: '' };
    const tplRows = () => db.templates.filter((t) => (tplState.status === 'all' || (tplState.status === 'ON') === (t.status === 'ON')) && (!tplState.channel || t.channel === tplState.channel) && (!tplState.q || (t.scene + t.content).includes(tplState.q)));
    let tplTable, tplTabsHost;
    function paintTplTabs() {
      const all = db.templates.filter((t) => (!tplState.channel || t.channel === tplState.channel) && (!tplState.q || (t.scene + t.content).includes(tplState.q)));
      const nn = (s) => all.filter((t) => (s === 'all' ? true : s === 'ON' ? t.status === 'ON' : t.status !== 'ON')).length;
      tplTabsHost.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: nn('all') }, { id: 'ON', label: '启用', count: nn('ON') }, { id: 'OFF', label: '停用', count: nn('OFF') }], tplState.status, (v) => { tplState.status = v; refreshTpl(); }));
    }
    function refreshTpl(keep) { paintTplTabs(); if (keep) tplTable.clear(); else tplTable.setRows(tplRows()); P3.flash(tplTable.el); flashSet.clear(); tabsUI && tabsUI.count(0, db.templates.length); }
    function tplPanel() {
      const quiet = h('span.num', { text: quietRow().value }), root = h('div.stack', {});
      const bar = h('div.p3-note', {}, UI.icon('clock', 'icon--sm'), h('span.grow', {}, '静默时段 ', quiet, '：这段时间只发验证码、支付成功这类紧急消息，营销类延后到时段结束。'), h('button.btn.btn--sm', { type: 'button', text: '静默时段设置', on: { click: async () => { if (await quietDialog()) quiet.textContent = quietRow().value; } } }));
      tplTabsHost = h('div');
      const search = A2.search('场景或内容', (v) => { tplState.q = v; refreshTpl(); });
      const chSel = h('select.select', { 'aria-label': '渠道', style: { width: '140px' }, on: { change: (e) => { tplState.channel = e.target.value; refreshTpl(); } } }, h('option', { value: '', text: '全部渠道' }), CHANNELS.map((c) => h('option', { value: c, text: c })));
      tplTable = A2.table({
        caption: '通知模板', empty: '没有符合条件的模板', rows: tplRows(), rowClass: (t) => (flashSet.has(t) ? 'p3-flash' : ''),
        columns: [
          { title: '场景', cls: 'p3-nw', render: (t) => h('b', { text: t.scene }) },
          { title: '渠道', cls: 'p3-nw', render: (t) => chBadge(t.channel) },
          { title: '内容', ell: true, render: (t) => t.content },
          { title: '状态', cls: 'p3-nw', render: (t) => statusSwitch(t) },
          { title: '发送情况', cls: 'p3-nw', render: (t) => h('div', {}, h('b.num', { text: P3.n(t.sent) }), h('div.muted.num', { text: t.sent ? '失败 ' + t.failed + ' · ' + P3.pct(t.failed, t.sent) : '还没有发送' })) },
          { title: '操作', cls: 'p3-nw', render: (t) => { const more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + t.scene }, UI.icon('more', 'p3-more')); P3.menuOn(more, () => [{ label: '复制为新场景', icon: 'copy', on: () => duplicateTpl(t) }, 'hr', { label: '删除场景', icon: 'trash', danger: true, on: () => deleteTpl(t), disabled: A2.can('delete') ? null : '没有删除权限' }]); return h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '编辑', 'aria-label': '编辑 ' + t.scene, on: { click: () => editTpl(t) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '测试发送', 'aria-label': '测试发送 ' + t.scene, on: { click: () => testSend(t) } }), more); } },
        ],
      });
      paintTplTabs();
      root.append(bar, h('div.card.card--tight.p3-toolbar', {}, tplTabsHost, h('span.grow'), chSel, search), tplTable.el);
      return root;
    }
    function statusSwitch(t) {
      const on = t.status === 'ON', sw = h('input.switch', { type: 'checkbox', role: 'switch', checked: on, 'aria-label': (on ? '停用 ' : '启用 ') + t.scene });
      sw.addEventListener('change', async () => {
        const next = sw.checked;
        if (!next && !(await A2.danger('停用后「' + t.scene + '」不再发送，已排队的消息会在发送前再检查一次，历史记录保留。', { ok: '确认停用', title: '停用 ' + t.scene }))) { sw.checked = true; return; }
        try { await UI.request(null, 300); } catch (e) { sw.checked = !next; return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
        t.status = next ? 'ON' : 'OFF'; flashSet.add(t);
        P3.audit('system:notify', next ? '启用通知场景' : '停用通知场景', '通知模板 ' + t.scene, { diff: [['状态', next ? '停用' : '启用', next ? '启用' : '停用']] });
        refreshTpl(true); UI.toast(t.scene + (next ? ' 已启用' : ' 已停用'));
      });
      return h('label.row', { style: { gap: 'var(--s-2)' } }, sw, h('span', { text: on ? '启用' : '停用' }));
    }
    async function deleteTpl(t) {
      if (!(await A2.danger('删除场景「' + t.scene + '」后将不再发送该通知，已发出的历史记录保留。', { ok: '确认删除', title: '删除场景' }))) return;
      try { await UI.request(null, 400); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      db.templates.splice(db.templates.indexOf(t), 1);
      P3.audit('system:notify', '删除通知场景', '通知模板 ' + t.scene, { diff: [['场景', t.scene, '已删除']] });
      refreshTpl(); UI.toast('已删除场景「' + t.scene + '」');
    }
    async function duplicateTpl(t) { const r = await editTpl({ ...t, id: null, scene: t.scene + '（副本）', sent: 0, failed: 0, status: 'OFF' }, true); return r; }

    /* 编辑与新建：变量插入、字数与关键词长度校验、预览 */
    function editTpl(t0, asNew) {
      const isNew = !t0 || asNew, t = t0 || { scene: '', channel: '订阅消息', content: '', status: 'ON', sent: 0, failed: 0 };
      const nameF = P3.field('场景名称', h('input.input', { value: t.scene, maxlength: 10, placeholder: '例如：预约成功提醒' }), { required: true, hint: '2 到 10 个字，不能和已有场景重名' });
      const chSel = h('select.select', { 'aria-label': '渠道' }, CHANNELS.map((c) => h('option', { value: c, text: c, selected: c === t.channel })));
      const chF = P3.field('渠道', chSel, { hint: '订阅消息要会员有订阅额度；短信按条计费；站内信总是会发' });
      const ta = h('textarea.textarea', { rows: 4, value: t.content, placeholder: '例如：您的订单{{订单号}}已支付，金额{{金额}}', 'aria-label': '内容' }), conF = P3.field('内容', ta, { required: true });
      const counter = h('div.p3-counter.num', { 'aria-live': 'polite' }), issues = h('ul.p3-issues', { role: 'list' }), chips = h('div.p3-chips', { role: 'group', 'aria-label': '插入变量' });
      const sw = h('input.switch', { type: 'checkbox', role: 'switch', checked: t.status === 'ON', 'aria-label': '启用' });
      const preview = h('div.p3-preview');
      VARS.forEach((v) => chips.append(h('button.btn.btn--sm', { type: 'button', title: '示例：' + v.sample + '，最长 ' + v.max + ' 字', text: v.k, on: { click: () => { const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, e = ta.selectionEnd == null ? s : ta.selectionEnd, ins = '{{' + v.k + '}}'; ta.setRangeText(ins, s, e, 'end'); ta.focus(); paint(); } } })));
      function paint() {
        const ch = chSel.value, res = check(ta.value, ch), c = CH[ch], lim = ch === '短信' ? c.hard : c.limit;
        counter.textContent = '模板 ' + [...ta.value].length + ' 字，按变量最长取值约 ' + res.est + ' 字（' + ch + '建议不超过 ' + c.limit + ' 字）';
        counter.className = 'p3-counter num' + (res.errors.length ? ' bad' : res.warns.length ? ' warn' : '');
        issues.replaceChildren(...res.errors.map((m) => h('li.err', {}, UI.icon('warn', 'icon--sm'), m)), ...res.warns.map((m) => h('li.p3-warn', {}, UI.icon('info', 'icon--sm'), m)));
        const body = renderSample(ta.value || '（内容还是空的）'), title = nameF.control.value.trim() || '场景名称';
        preview.replaceChildren(
          ch === '订阅消息' ? h('div.p3-wx', {}, h('div.p3-wx-head', {}, UI.icon('bell', 'icon--sm'), h('span', { text: '示例门店' }), h('span.muted', { text: '订阅消息 · 刚刚' })), h('b', { text: title }), h('p', { text: body }), h('div.p3-wx-foot', { text: '点击进入小程序 ›' }))
            : ch === '短信' ? h('div.p3-sms', {}, h('div.muted', { text: '短信 · 刚刚' }), h('p', { text: '【示例门店】' + body })) : h('div.p3-inbox', {}, h('div.p3-wx-head', {}, UI.icon('bell', 'icon--sm'), h('b', { text: title }), h('span.muted', { text: '刚刚' })), h('p', { text: body })),
          h('p.muted', { text: '预览用示例数据：' + (ta.value.match(VRE) || []).filter((m, i, a) => a.indexOf(m) === i && findVar(m.slice(2, -2))).map((m) => m.slice(2, -2) + '＝' + findVar(m.slice(2, -2)).sample).join('，') }));
      }
      ta.addEventListener('input', () => { conF.setErr(''); paint(); }); chSel.addEventListener('change', paint); nameF.control.addEventListener('input', () => { nameF.setErr(''); paint(); });
      paint();
      const body = h('div.p3-split', {}, h('div.stack', {}, nameF.el, chF.el, h('div.stack', { style: { gap: 'var(--s-2)' } }, conF.el, counter, issues, h('div.muted', { text: '点按钮把变量插到光标处：' }), chips), h('label.row', { style: { gap: 'var(--s-3)' } }, sw, h('span', { text: '保存后立即启用' }))), h('div.stack', {}, h('h3', { text: '预览' }), preview));
      let saved = null;
      return UI.dialog({ title: isNew ? '新建通知场景' : '编辑 ' + t.scene, size: 'wide', body, actions: [{ label: '取消', value: null }, { label: '保存', kind: 'primary', value: 'ok', on: () => {
        const name = nameF.control.value.trim(), res = check(ta.value, chSel.value); let bad = false;
        if (name.length < 2) { nameF.setErr('场景名称至少 2 个字'); bad = true; } else if (db.templates.some((x) => x !== t0 && x.scene === name)) { nameF.setErr('已经有叫「' + name + '」的场景，换一个名字'); bad = true; }
        if (res.errors.length) { conF.setErr(res.errors[0]); bad = true; }
        if (bad) { (nameF.err.textContent ? nameF.control : ta).focus(); return false; }
        return P3.submit(() => {
          const before = isNew ? null : { ...t };
          if (isNew) { saved = { id: Math.max(0, ...db.templates.map((x) => x.id)) + 1, scene: name, channel: chSel.value, content: ta.value.trim(), status: sw.checked ? 'ON' : 'OFF', sent: 0, failed: 0 }; db.templates.push(saved); }
          else { saved = t; Object.assign(t, { scene: name, channel: chSel.value, content: ta.value.trim(), status: sw.checked ? 'ON' : 'OFF' }); }
          const diff = isNew ? [['场景', '—', name], ['渠道', '—', chSel.value]] : [['场景', before.scene, name], ['渠道', before.channel, chSel.value], ['内容', before.content, ta.value.trim()], ['状态', before.status === 'ON' ? '启用' : '停用', sw.checked ? '启用' : '停用']].filter((d) => d[1] !== d[2]);
          P3.audit('system:notify', isNew ? '新建通知场景' : '修改通知模板', '通知模板 ' + name, { diff });
          flashSet.add(saved); tplState.status = 'all'; tplState.channel = ''; tplState.q = ''; refreshTpl();
          UI.toast(isNew ? '已新建场景「' + name + '」' : '已保存「' + name + '」');
        });
      } }] }).then((v) => (v === 'ok' ? saved : null));
    }

    /* 测试发送：输入手机号或选会员，模拟成功与失败 */
    function testSend(t) {
      let mode = 'phone';
      const phone = h('input.input', { type: 'tel', inputmode: 'numeric', maxlength: 11, placeholder: '11 位手机号', 'aria-label': '手机号' }), phoneF = P3.field('手机号', phone, { hint: '演示：以 9999 结尾的号码会模拟发送失败' });
      const mem = h('select.select', { 'aria-label': '会员' }, db.users.filter((u) => u.status === 'ENABLED').slice(0, 20).map((u) => h('option', { value: u.id, text: u.name + '（' + P3.mask(u.phone) + '）' }))), memF = P3.field('会员', mem);
      const result = h('div', { role: 'alert' }), slot = h('div', {}, phoneF.el);
      const seg = P3.seg('发送对象', [['phone', '输入手机号'], ['member', '选择会员']], mode, (v) => { mode = v; slot.replaceChildren(v === 'phone' ? phoneF.el : memF.el); result.replaceChildren(); });
      const body = h('div.stack', {}, h('p', {}, '用「', h('b', { text: t.scene }), '」（' + t.channel + '）发一条测试消息，内容用示例数据，会带“测试”字样，不计入发送量。'), seg, slot, result);
      return UI.dialog({ title: '测试发送', size: 'sm', body, actions: [{ label: '取消', value: null }, { label: '发送测试', kind: 'primary', value: 'ok', on: async () => {
        result.replaceChildren(); let u = null, ph = '';
        if (mode === 'phone') { ph = phone.value.trim(); if (!/^1[3-9]\d{9}$/.test(ph)) { phoneF.setErr('请填写 11 位手机号'); phone.focus(); return false; } phoneF.setErr(''); u = db.users.find((x) => x.phone === ph) || null; }
        else { u = db.users.find((x) => x.id === +mem.value); ph = u.phone; }
        try { await UI.request(null, 700); } catch (e) { UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); return false; }
        let why = '';
        if (t.status !== 'ON') why = '这个场景已停用，请先启用再测试';
        else if (scene === 'channel-down' && t.channel === '短信') why = '短信通道暂不可用（服务商返回繁忙），请稍后再试';
        else if (ph.endsWith('9999')) why = '这个号码是空号或已停机';
        else if (t.channel !== '短信' && !u) why = '这个手机号不是会员，' + t.channel + '只能发给会员';
        else if (t.channel === '订阅消息' && quotaOf(t)[u.id] === 0) why = '这位会员对这类消息的订阅额度已用完，无法发送';
        const log = { id: Math.max(0, ...db.sendLogs.map((l) => l.id)) + 1, at: P3.stamp(), userId: u ? u.id : 0, userName: (u ? u.name : '非会员') + '（测试）', phone: P3.mask(ph), tplId: t.id, scene: t.scene, channel: t.channel, status: why ? 'FAIL' : 'OK', reason: why ? '测试发送失败：' + why : '', permanent: !!why, tries: why ? 1 : 0, test: true, msgNo: 'T' + Date.now().toString().slice(-8), content: renderSample(t.content, u && u.name), attempts: [{ at: P3.stamp(), result: why ? '失败' : '成功', note: why || '测试发送成功' }] };
        db.sendLogs.unshift(log); flashSet.add(log);
        P3.audit('system:notify', '测试发送通知', '通知模板 ' + t.scene + ' → ' + P3.mask(ph), { result: why ? '失败' : '成功' });
        paintRail(); refreshLogs(true);
        if (why) { result.replaceChildren(P3.alert('bad', '发送失败：' + why)); return false; }
        UI.toast('测试消息已发给 ' + P3.mask(ph));
      } }] });
    }

    /* 静默时段设置：和系统配置里的“消息静默时段”是同一项 */
    function quietDialog() {
      const row = quietRow(), cur = row.value, on = cur !== '未启用', parts = on && cur.includes('–') ? cur.split('–') : ['22:00', '08:00'];
      const sw = h('input.switch', { type: 'checkbox', role: 'switch', checked: on, 'aria-label': '启用静默时段' }), s = h('input.input', { type: 'time', value: parts[0] }), e = h('input.input', { type: 'time', value: parts[1] });
      const sF = P3.field('开始时间', s), eF = P3.field('结束时间', e), grid = h('div.p3-pair', {}, sF.el, eF.el);
      const sync = () => { s.disabled = e.disabled = !sw.checked; }; sw.addEventListener('change', sync); sync();
      let ok = false;
      return UI.dialog({ title: '静默时段设置', size: 'sm', body: h('div.stack', {}, h('label.row', { style: { gap: 'var(--s-3)' } }, sw, h('span', { text: '启用静默时段' })), grid, h('p.muted', { text: '静默时段里，营销类消息延后到结束时刻再发；验证码、支付成功、退款到账等紧急消息照常发送，站内信不受影响。' })),
        actions: [{ label: '取消', value: null }, { label: '保存', kind: 'primary', value: 'ok', on: () => {
          if (sw.checked && (!s.value || !e.value)) { sF.setErr(s.value ? '' : '请选择开始时间'); eF.setErr(e.value ? '' : '请选择结束时间'); return false; }
          if (sw.checked && s.value === e.value) { eF.setErr('开始和结束不能是同一时刻'); return false; }
          return P3.submit(() => { const next = sw.checked ? s.value + '–' + e.value : '未启用'; if (next !== row.value) { const old = row.value; row.value = next; P3.audit('system:config', '修改静默时段', '系统配置 消息静默时段', { diff: [['消息静默时段', old, next]] }); UI.toast('静默时段已改为 ' + next); } ok = true; });
        } }] }).then((v) => v === 'ok' && ok);
    }

    /* ---------- 发送记录 ---------- */
    const state = { tab: 'all', scene: '', channel: '', range: '7', q: '' };
    let logTable, logTabsHost, selBar, selBtn, batchStrip, sceneSel, chSel2, rangeSel, searchBox, exportBtn;
    const inRange = (l) => l.at >= P3.dayKey(+state.range - 1) + ' 00:00';
    const base = () => logsAll().filter((l) => inRange(l) && (!state.scene || l.scene === state.scene) && (!state.channel || l.channel === state.channel) && (!state.q || (l.userName + l.phone + l.msgNo).includes(state.q)));
    const logRows = () => base().filter((l) => state.tab === 'all' || l.status === state.tab);
    function syncToolbar() { if (!sceneSel) return; sceneSel.value = state.scene; chSel2.value = state.channel; rangeSel.value = state.range; }
    function paintLogTabs() {
      const b = base(), nn = (s) => (s === 'all' ? b.length : b.filter((l) => l.status === s).length);
      logTabsHost.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: nn('all') }, { id: 'OK', label: '成功', count: nn('OK') }, { id: 'FAIL', label: '失败', count: nn('FAIL') }, { id: 'RETRY', label: '重试中', count: nn('RETRY') }], state.tab, (v) => { state.tab = v; refreshLogs(); }));
    }
    function updateSel(sel) { const picked = sel || logTable.selected(), can = picked.filter((l) => l.status === 'FAIL' && !l.permanent).length; batchStrip.hidden = !picked.length; selBar.textContent = '已选 ' + picked.length + ' 条，其中 ' + can + ' 条可以重发' + (picked.length > can ? '（成功、重试中和永久失败的不能重发）' : ''); selBtn.disabled = !can; }
    function refreshLogs(keep) { if (!logTable) { paintRail(); return; } paintLogTabs(); if (keep) logTable.clear(); else logTable.setRows(logRows()); updateSel(); P3.flash(logTable.el); flashSet.clear(); tabsUI.count(1, logsAll().length); paintRail(); }
    function logsPanel() {
      logTabsHost = h('div');
      sceneSel = h('select.select', { 'aria-label': '场景', style: { width: '140px' }, on: { change: (e) => { state.scene = e.target.value; refreshLogs(); } } }, h('option', { value: '', text: '全部场景' }), [...new Set(db.templates.map((t) => t.scene))].map((s) => h('option', { value: s, text: s })));
      chSel2 = h('select.select', { 'aria-label': '渠道', style: { width: '132px' }, on: { change: (e) => { state.channel = e.target.value; refreshLogs(); } } }, h('option', { value: '', text: '全部渠道' }), CHANNELS.map((c) => h('option', { value: c, text: c })));
      rangeSel = h('select.select', { 'aria-label': '时间范围', style: { width: '124px' }, on: { change: (e) => { state.range = e.target.value; refreshLogs(); } } }, [['1', '今天'], ['3', '近 3 天'], ['7', '近 7 天'], ['14', '近 14 天']].map(([v, l]) => h('option', { value: v, text: l, selected: v === state.range })));
      searchBox = A2.search('会员或消息编号', (v) => { state.q = v; refreshLogs(); });
      selBar = h('span.grow', { 'aria-live': 'polite' });
      selBtn = h('button.btn.btn--sm.btn--primary', { type: 'button', text: '批量重发', on: { click: batchRetry } });
      batchStrip = h('div.p3-note', { hidden: true }, UI.icon('info', 'icon--sm'), selBar, selBtn, h('button.btn.btn--sm.btn--ghost', { type: 'button', text: '取消选择', on: { click: () => { logTable.clear(); updateSel([]); } } }));
      exportBtn = h('button.btn.btn--sm', { type: 'button', text: '导出', on: { click: async () => { if (!A2.can('export')) return UI.toast('当前角色没有导出权限', { kind: 'bad' }); await A2.export('通知发送记录', '通知', logRows().length); } } });
      logTable = A2.table({
        caption: '通知发送记录', selectable: true, empty: ctx.scene === 'nodata' ? '还没有发送记录，启用模板并有业务触发后会出现在这里' : '没有符合条件的发送记录', rows: logRows(), onSelect: updateSel, rowClass: (l) => (flashSet.has(l) ? 'p3-flash' : ''),
        columns: [
          { title: '时间', cls: 'p3-nw num', render: (l) => P3.md(l.at) },
          { title: '会员', cls: 'p3-nw', render: (l) => h('div', {}, l.userName, h('div.muted.num', { text: l.phone })) },
          { title: '场景', cls: 'p3-nw', render: (l) => l.scene },
          { title: '渠道', cls: 'p3-nw p3-hs', render: (l) => chBadge(l.channel) },
          { title: '状态', cls: 'p3-nw', render: (l) => A2.status(STATUS, l.status) },
          { title: '失败原因', ell: true, render: (l) => (l.status === 'OK' ? '' : (l.permanent ? '永久失败：' : '') + l.reason) },
          { title: '操作', cls: 'p3-nw', render: (l) => h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '详情', 'aria-label': '查看详情 ' + l.msgNo, on: { click: () => logDetail(l) } }), l.status === 'FAIL' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '重发', 'aria-label': '重发 ' + l.msgNo, 'aria-disabled': l.permanent ? 'true' : null, on: { click: () => retryOne(l) } }) : null) },
        ],
      });
      paintLogTabs(); updateSel([]);
      const toolbar = h('div.card.card--tight.p3-toolbar', {}, logTabsHost, h('span.grow'), searchBox);
      const filters = h('div.p3-filters', {}, sceneSel, chSel2, rangeSel, h('span.grow'), exportBtn);
      return h('div.stack', {}, toolbar, filters, batchStrip, logTable.el);
    }
    function explainPermanent(l) {
      return UI.dialog({ title: '这条是永久失败，不能重发', size: 'sm', body: h('div.stack', {}, h('p', {}, '原因：', h('b', { text: l.reason })), h('p', { text: REMEDY[l.reason] || '这类错误重发也不会成功，请先处理原因。' }), h('p.muted', { text: '可重发的是“自动重试 5 次仍失败”的临时错误，比如微信没有响应、短信通道繁忙。' })), actions: [{ label: '知道了', kind: 'primary', value: 'ok' }] });
    }
    const retryResult = (l) => (l.id * 37) % 11 >= 3;
    async function retryOne(l) {
      if (l.permanent) return explainPermanent(l);
      try { await UI.request(null, 600); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      applyRetry(l); flashSet.add(l); refreshLogs(state.tab === 'all');
      P3.audit('notify:retry', '重发通知', l.scene + ' ' + l.msgNo, { result: l.status === 'OK' ? '成功' : '失败' });
      if (l.status === 'OK') UI.toast('已重发，消息 ' + l.msgNo + ' 发送成功'); else UI.toast('重发失败：' + l.reason, { kind: 'bad' });
    }
    function applyRetry(l) {
      const ok = retryResult(l) && !(scene === 'channel-down' && l.channel === '短信'), at = P3.stamp();
      if (ok) { l.status = 'OK'; l.reason = ''; l.tries = 0; l.attempts.push({ at, result: '成功', note: '人工重发，发送成功' }); }
      else { l.reason = scene === 'channel-down' && l.channel === '短信' ? '短信通道暂不可用' : l.reason; l.attempts.push({ at, result: '失败', note: '人工重发仍失败：' + l.reason }); }
    }
    async function batchRetry() {
      const picked = logTable.selected(), can = picked.filter((l) => l.status === 'FAIL' && !l.permanent), perm = picked.filter((l) => l.status === 'FAIL' && l.permanent), skip = picked.length - can.length - perm.length;
      if (!can.length) return;
      const ok = await UI.confirm('将重发 ' + can.length + ' 条失败的消息' + (perm.length ? '；另有 ' + perm.length + ' 条永久失败，重发也不会成功，已自动跳过' : '') + (skip ? '；' + skip + ' 条不是失败状态，已跳过' : '') + '。', { title: '批量重发', ok: '确认重发' });
      if (!ok) return;
      try { await UI.request(null, 900); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      can.forEach((l) => { applyRetry(l); flashSet.add(l); });
      const good = can.filter((l) => l.status === 'OK').length;
      P3.audit('notify:retry', '批量重发通知', '共 ' + can.length + ' 条，成功 ' + good + ' 条');
      refreshLogs();
      UI.toast('已重发 ' + can.length + ' 条：成功 ' + good + ' 条，失败 ' + (can.length - good) + ' 条' + (perm.length + skip ? '；跳过 ' + (perm.length + skip) + ' 条' : ''), { kind: good === can.length ? 'ok' : 'bad' });
    }
    function logDetail(l) {
      const tl = h('div.list', {}, l.attempts.map((a, i) => h('div', {}, h('span.num.muted', { text: P3.md(a.at) }), h('span.grow', {}, '第 ' + (i + 1) + ' 次：', a.note), P3.badge(a.result, a.result === '成功' ? 'ok' : 'bad'))));
      const statusLine = [A2.status(STATUS, l.status), l.permanent ? P3.badge('永久失败', 'bad', true) : null];
      const actions = [{ label: '关闭', value: null }];
      if (l.status === 'FAIL' && !l.permanent) actions.push({ label: '重发', kind: 'primary', value: 'retry' });
      A2.detail({ title: '发送详情 · ' + l.scene, tabs: [
        { label: '概况', node: h('div.stack', {}, A2.kv([['消息编号', l.msgNo], ['发送时间', l.at], ['会员', l.userName + '  ' + l.phone], ['场景', l.scene], ['渠道', l.channel], ['状态', h('span.row', { style: { gap: 'var(--s-2)' } }, statusLine)], ['失败原因', l.reason || '—'], ['重试次数', l.status === 'OK' ? '无需重试' : l.tries + ' / 5']]), l.permanent ? P3.alert('bad', '永久失败，不能重发。' + (REMEDY[l.reason] || '')) : l.status === 'FAIL' ? P3.alert('warn', '自动重试 5 次仍失败，可以点“重发”再试一次。') : l.status === 'RETRY' ? P3.alert('info', '系统正在按 1 分钟、5 分钟、30 分钟、2 小时的间隔自动重试，无需人工处理。') : null) },
        { label: '消息内容', node: h('div.stack', {}, h('div.p3-preview', {}, h('div.p3-sms', {}, h('div.muted', { text: l.channel + ' · ' + P3.md(l.at) }), h('p', { text: l.content }))), h('p.muted', { text: '为保护会员隐私，记录里只保留脱敏手机号。' })) },
        { label: '投递过程', node: tl },
      ], actions }).then((v) => v === 'retry' && retryOne(l));
    }

    /* ---------- 订阅额度 ---------- */
    function quotaPanel() {
      const tpls = db.templates.filter((t) => t.channel === '订阅消息'), users = db.users.filter((u) => u.status === 'ENABLED');
      const stat = tpls.map((t) => { const q = quotaOf(t), vals = users.map((u) => q[u.id] ?? 0); return { t, total: users.length, sum: vals.reduce((a, b) => a + b, 0), ok: vals.filter((v) => v >= 3).length, low: vals.filter((v) => v >= 1 && v <= 2).length, zero: vals.filter((v) => v === 0).length }; });
      const worst = stat.slice().sort((a, b) => b.zero / b.total - a.zero / a.total)[0];
      const root = h('div.stack', {});
      if (!stat.length) return h('div.card', {}, A2.empty('还没有订阅消息类的场景'));
      const allZero = stat.every((x) => x.zero === x.total);
      root.append(h('div.card', {}, h('div.card-head', {}, h('h3', { text: '各场景会员订阅余量' }), h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--ok)' } }), '充足（3 次以上）'), h('span', {}, h('i', { style: { background: 'var(--warn)' } }), '偏少（1–2 次）'), h('span', {}, h('i', { style: { background: 'var(--bad)' } }), '已用完'))), h('div#p3-quota', { style: { minHeight: '220px' } }),
        h('p.muted', { style: { marginTop: 'var(--s-3)' }, text: '订阅消息每发一条消耗会员 1 次额度，用完就发不出去，需要会员在小程序里再次订阅。' + (allZero ? '当前所有场景的额度都已用完。' : '额度最紧张的是“' + worst.t.scene + '”：' + worst.total + ' 位会员里 ' + worst.zero + ' 位已用完，' + worst.low + ' 位偏少。') })));
      if (allZero) root.prepend(P3.alert('bad', '所有订阅消息场景的额度都已用完，会员收不到订阅消息；订单类提醒会改发站内信，重要场景可补发短信。'));
      root.append(A2.table({ caption: '订阅额度', rows: stat, size: 10, columns: [
        { title: '场景', cls: 'p3-nw', render: (x) => h('b', { text: x.t.scene }) },
        { title: '会员数', cls: 'r', render: (x) => x.total },
        { title: '剩余合计', cls: 'r', render: (x) => P3.n(x.sum) },
        { title: '充足', cls: 'r', render: (x) => x.ok },
        { title: '偏少', cls: 'r', render: (x) => x.low },
        { title: '已用完', cls: 'r', render: (x) => x.zero },
        { title: '提示', cls: 'p3-nw', render: (x) => { const f = x.zero / x.total; return f >= 0.4 ? P3.badge('额度告急', 'bad') : f >= 0.2 ? P3.badge('建议引导订阅', 'warn') : P3.badge('额度充足', 'ok'); } },
        { title: '操作', cls: 'p3-nw', render: (x) => h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '查看会员', 'aria-label': '查看额度不足的会员：' + x.t.scene, on: { click: () => lowMembers(x) } }) },
      ] }).el);
      UI.bars(UI.$('#p3-quota', root), { labels: stat.map((x) => x.t.scene), stacked: true, unit: ' 人', height: 240, aria: '各订阅消息场景的会员额度：' + stat.map((x) => x.t.scene + '，充足 ' + x.ok + ' 人，偏少 ' + x.low + ' 人，已用完 ' + x.zero + ' 人').join('；'), series: [{ name: '充足', data: stat.map((x) => x.ok), color: 'var(--ok)' }, { name: '偏少', data: stat.map((x) => x.low), color: 'var(--warn)' }, { name: '已用完', data: stat.map((x) => x.zero), color: 'var(--bad)' }] });
      return root;
    }
    function lowMembers(x) {
      const q = quotaOf(x.t), rows = db.users.filter((u) => u.status === 'ENABLED' && (q[u.id] ?? 0) <= 2).sort((a, b) => q[a.id] - q[b.id]);
      const t = A2.table({ caption: '额度不足的会员', rows, size: 10, empty: '所有会员的额度都充足', columns: [{ title: '会员', render: (u) => u.name }, { title: '手机号', cls: 'p3-nw num', render: (u) => P3.mask(u.phone) }, { title: '剩余次数', cls: 'r', render: (u) => q[u.id] }, { title: '状态', cls: 'p3-nw', render: (u) => (q[u.id] === 0 ? P3.badge('已用完', 'bad') : P3.badge('偏少', 'warn')) }] });
      return UI.dialog({ title: x.t.scene + ' · 额度不足的会员', size: 'wide', body: h('div.stack', {}, h('p.muted', { text: '共 ' + rows.length + ' 位会员的剩余次数在 2 次以内。可以在支付成功页、消息提醒设置页引导他们再次订阅。' }), t.el), actions: [{ label: '关闭', value: null }] });
    }

    /* ---------- 组装 ---------- */
    let tabsUI;
    const head = A2.heading('通知', '维护模板，盯发送结果和订阅额度', [h('button.btn.btn--primary', { type: 'button', text: '新建场景', on: { click: () => editTpl(null) } })]);
    tabsUI = P3.tabs([
      { label: '模板', count: db.templates.length, render: tplPanel },
      { label: '发送记录', count: logsAll().length, render: logsPanel },
      { label: '订阅额度', render: quotaPanel },
    ], { label: '通知工作区', onChange: (i) => { if (i === 1) refreshLogs(true); } });
    paintRail();
    const banner = scene === 'channel-down' ? P3.alert('bad', '短信通道异常：短信类消息暂时发不出去，会先进入自动重试；紧急场景请改用订阅消息或站内信。') : scene === 'high-fail' ? P3.alert('warn', '今天微信暂时没有响应的情况明显增多，订阅消息的失败率偏高，系统在自动重试，无需人工处理。') : null;
    page.append(head); if (banner) page.append(banner);
    page.append(h('div.l-rail', {}, h('div.main', {}, h('div.card.card--tight.p3-tabsbar', {}, tabsUI.list), tabsUI.panels), rail));
    return page;
  }
})();
