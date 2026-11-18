/* 系统配置（主区加右侧窄栏）：运行参数、文案、页面内容、版本信息四个标签页；右侧窄栏是最近变更、待保存项汇总、配置健康检查。
   运行参数读写 B.db.config.runtime（热生效，无需重启）；文案读写 B.db.config.copy；三份页面文本与版本记录在 B.db.pageText、B.db.pageVersions；变更历史在 B.db.configHistory。 */
(function () {
  'use strict';
  const { h } = UI;

  /* ---------- 每项参数的分组、单位、范围、默认值 ---------- */
  const GROUPS = ['订单', '登录', '通知', '功能开关'];
  const META = {
    'order.unpaid_close_minutes': { group: '订单', unit: '分钟', min: 5, max: 120, def: 30 },
    'order.refund_free_days': { group: '订单', unit: '天', min: 0, max: 30, def: 7, high: true },
    'login.lock_attempts': { group: '登录', unit: '次', min: 3, max: 10, def: 5 },
    'notify.quiet_hours': { group: '通知', def: '22:00–08:00', pattern: /^(未启用|\d{2}:\d{2}–\d{2}:\d{2})$/, format: '写成 22:00–08:00 这样，或者写“未启用”' },
    'feature.coupon': { group: '功能开关', def: true, high: true },
    'feature.wallet': { group: '功能开关', def: true, high: true },
    'feature.card': { group: '功能开关', def: true, high: true },
  };
  const COPY_META = { 'home.slogan': { max: 20, where: '小程序首页顶部' }, 'order.empty': { max: 24, where: '订单列表为空时' }, 'pay.success': { max: 24, where: '支付成功页' }, 'refund.tip': { max: 40, where: '退款申请页' } };
  const BAD_WORDS = ['最好', '第一', '最佳', '国家级', '绝对', '100%'];
  const DEFAULT_COPY = Object.fromEntries(B.config().copy.map((c) => [c.key, c.value]));
  const DOCS = [['agreement', '用户协议'], ['privacy', '隐私政策'], ['card_rule', '会员卡规则']];
  const DOC_LIMIT = 20000;
  const fmtVal = (m, v) => (typeof v === 'boolean' ? (v ? '开启' : '关闭') : m && m.unit ? v + ' ' + m.unit : String(v));
  const ENV = '正式环境（示例）';
  const short = (t) => { const a = [...String(t)]; return a.length > 14 ? a.slice(0, 14).join('') + '…' : String(t); };

  const TEXT = {
    agreement: '一、总则\n欢迎使用示例门店小程序。你点击“同意”并使用本服务，即表示你已阅读并接受本协议。\n二、账号与会员\n你可以用手机号注册成为会员。请保管好账号，不要借给他人使用；因借用产生的损失由你自己承担。\n三、下单与支付\n下单后请在规定时间内完成支付，超时订单会自动关闭。商品以实际出餐为准，图片仅供参考。\n四、会员卡与储值\n会员卡和储值余额只能在本店使用，不能兑换现金。具体规则以“会员卡规则”为准。\n五、售后与退款\n商品有问题可以申请售后，审核通过后原路退回。储值充值在规定期限内可以申请退回。\n六、协议变更\n本协议变更后会在小程序里提示，你继续使用即表示接受变更后的内容。',
    privacy: '一、我们收集哪些信息\n注册和下单时，我们会收集你的手机号、昵称和订单信息，用来提供点餐、取餐和售后服务。\n二、信息怎么使用\n这些信息只用于完成订单、发送与订单有关的提醒、处理售后，不会出售给第三方。\n三、信息怎么保存\n手机号等个人信息加密保存，只有经过授权的工作人员才能查看，每次查看都会留下记录。\n四、你的权利\n你可以随时在“我的”里查看、修改个人信息，也可以申请注销账号，注销后我们会删除或匿名化你的个人信息。\n五、消息提醒\n订阅消息由你主动开启，你可以随时在“消息提醒设置”里关闭。\n六、联系我们\n对个人信息有疑问，可以拨打门店电话 400-000-0000 联系我们。',
    card_rule: '一、会员卡种类\n本店有月卡、十次卡、午餐时段卡三种，价格和有效期以购买页显示为准。\n二、使用方式\n月卡 30 天内每天可用 1 次，当天没用完不累计；十次卡 10 次加赠 1 次，90 天内有效；午餐时段卡只能在 11:00 到 13:30 使用。\n三、冻结与挂失\n月卡可以申请冻结，每张卡最多冻结 7 天；卡丢失请联系门店挂失，补办需要出示购买凭证。\n四、到期与退款\n到期未用完的次数作废；购买后 7 天内且未使用，可以申请全额退款。\n五、规则调整\n门店可以调整会员卡规则，调整只影响之后购买的卡，已购买的卡按购买当时的规则执行。',
  };

  /* ---------- 演示数据：变更历史、页面文本与版本记录 ---------- */
  P3.onSeed(function seedSettings(db) {
    const rt = (k) => db.config.runtime.find((x) => x.key === k);
    const ev = (back, t, by, key, bv, av, reason) => { const m = META[key], it = rt(key); return { at: P3.dayKey(back) + ' ' + t, by, kind: 'runtime', key, name: it.name, bv, av, before: fmtVal(m, bv), after: fmtVal(m, av), reason }; };
    db.configHistory = [ev(1, '15:20', '周敏', 'feature.card', false, true, '会员卡功能恢复上线'), ev(4, '11:05', '王海燕', 'login.lock_attempts', 3, 5, '前台反映输错两次就锁定，影响交接班'), ev(9, '09:40', '周敏', 'order.unpaid_close_minutes', 20, 30, '支付高峰期订单被误关'), ev(16, '17:12', '王海燕', 'feature.coupon', false, true, '优惠券活动开始'), ev(23, '10:30', '王海燕', 'order.refund_free_days', 3, 7, '按新的退款规则调整')];
    db.configHistory.forEach((x, i) => { x.id = i + 1; });
    db.pageText = { ...TEXT };
    db.pageVersions = {};
    DOCS.forEach(([k], i) => { const t = TEXT[k]; db.pageVersions[k] = [{ v: 3, at: db.config.pages[i].updated + ' 10:00', by: i === 2 ? '周敏' : '王海燕', text: t, len: [...t].length, note: i === 2 ? '补充冻结与挂失的说明' : '调整措辞，没有实质变更' }, { v: 2, at: P3.dayKey(60 + i * 7) + ' 14:30', by: '王海燕', text: t.replace('不要借给他人使用', '不要借给他人'), len: [...t].length - 3, note: '新增“协议变更”一条' }, { v: 1, at: P3.dayKey(150) + ' 09:00', by: '王海燕', text: t.split('\n').slice(0, 6).join('\n'), len: [...t.split('\n').slice(0, 6).join('\n')].length, note: '首次发布' }]; });
    db.copyHistory = { 'home.slogan': [{ at: P3.dayKey(20) + ' 10:00', by: '周敏', value: '每一餐都认真' }] };
  });
  const hashOf = (rt) => { let a = 0x811c9dc5; const s = JSON.stringify(rt.map((x) => [x.key, x.value])); for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619) >>> 0; } return (a.toString(16).padStart(8, '0') + (Math.imul(a, 2654435761) >>> 0).toString(16).padStart(8, '0')).slice(0, 12); };

  window.PAGES2.settings = {
    title: '系统配置', group: '系统',
    layout: '主区加右侧窄栏',
    reason: '改配置是“改一点、对比、确认、保存”的连续工作，主区放运行参数、文案、页面内容和版本四个工作区；刚改了什么、还有哪些没保存、配置是否健康是随时要瞄一眼的，放在停留在右侧的窄栏，不打断主区的编辑',
    scenes: [{ id: 'conflict', label: '保存冲突：别人刚改过同一项' }, { id: 'new-version', label: '服务端有新版本' }],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有配置项');
      if (early) return early;
      return A2.load(() => build(ctx));
    },
  };

  function build(ctx) {
    const db = B.db, rt = db.config.runtime, page = h('section.page.p3-page'), flashSet = new Set();
    let tabsUI, scene = ctx.scene;
    const saved = (k) => rt.find((x) => x.key === k).value;
    const metaOf = (it) => META[it.key] || { group: '其他', def: it.value };
    const net = async (ms) => { try { await UI.request(null, ms || 500); return true; } catch (e) { UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); return false; } };
    const hist = db.configHistory;
    const addHist = (o) => { hist.unshift({ id: Math.max(0, ...hist.map((x) => x.id)) + 1, at: P3.stamp(), by: A2.me().name, ...o }); };

    /* ================= 运行参数 ================= */
    const cur = {};   // key -> {raw, val, err}
    rt.forEach((it) => { cur[it.key] = { raw: it.value, val: it.value, err: '' }; });
    const changedKeys = () => rt.filter((it) => cur[it.key].err || cur[it.key].val !== it.value).map((it) => it.key);
    const errKeys = () => rt.filter((it) => cur[it.key].err).map((it) => it.key);
    const rows = {};  // key -> {badge, err, note, reset, input}
    function parse(it, raw) {
      const m = metaOf(it), c = cur[it.key];
      if (it.type === 'switch') { c.val = raw; c.err = ''; }
      else if (it.type === 'number') {
        const s = String(raw).trim();
        if (s === '') { c.val = it.value; c.err = '请填写数字'; }
        else if (isNaN(Number(s))) { c.val = it.value; c.err = '要填数字，不能有文字'; }
        else if (!Number.isInteger(Number(s))) { c.val = it.value; c.err = '要填整数'; }
        else if (+s < m.min || +s > m.max) { c.val = it.value; c.err = '要在 ' + m.min + ' 到 ' + m.max + ' ' + m.unit + '之间'; }
        else { c.val = +s; c.err = ''; }
      } else {
        const s = String(raw).trim();
        if (!s) { c.val = it.value; c.err = '不能为空'; }
        else if (m.pattern && !m.pattern.test(s)) { c.val = it.value; c.err = '格式不对，' + (m.format || '请检查'); }
        else if (it.key === 'notify.quiet_hours' && s !== '未启用' && s.split('–')[0] === s.split('–')[1]) { c.val = it.value; c.err = '开始和结束不能是同一时刻'; }
        else { c.val = s; c.err = ''; }
      }
      c.raw = raw;
    }
    function paintRow(it) {
      const r = rows[it.key], c = cur[it.key], m = metaOf(it), changed = c.err || c.val !== it.value;
      r.err.textContent = c.err; r.wrap.classList.toggle('p3-changed', !!changed);
      if (r.input) { if (c.err) r.input.setAttribute('aria-invalid', 'true'); else r.input.removeAttribute('aria-invalid'); }
      r.badge.hidden = !changed; r.badge.textContent = c.err ? '填写有误' : '已修改'; r.badge.className = 'badge ' + (c.err ? 'badge--bad' : 'badge--warn');
      r.note.textContent = changed && !c.err ? '原值 ' + fmtVal(m, it.value) : '默认 ' + fmtVal(m, m.def) + (m.min != null ? ' · 范围 ' + m.min + '–' + m.max : '');
      r.reset.hidden = c.val === m.def && !c.err;
    }
    function paintAll() { rt.forEach(paintRow); paintPending(); paintRail(); }
    function controlFor(it) {
      const m = metaOf(it);
      if (it.type === 'switch') { const sw = h('input.switch', { type: 'checkbox', role: 'switch', checked: !!it.value, 'aria-label': it.name }), lab = h('span', { text: it.value ? '开启' : '关闭' }); sw.addEventListener('change', () => { parse(it, sw.checked); lab.textContent = sw.checked ? '开启' : '关闭'; paintAll(); }); return { node: h('label.row', { style: { gap: 'var(--s-3)' } }, sw, lab), sync: () => { const v = cur[it.key].val; sw.checked = !!v; lab.textContent = v ? '开启' : '关闭'; }, input: sw }; }
      const input = h('input.input', { type: it.type === 'number' ? 'number' : 'text', inputmode: it.type === 'number' ? 'numeric' : null, value: it.value, 'aria-label': it.name, style: { width: it.type === 'number' ? '120px' : '200px' } });
      input.addEventListener('input', () => { parse(it, input.value); paintAll(); });
      return { node: h('div.row', { style: { gap: 'var(--s-2)' } }, input, m.unit ? h('span.muted', { text: m.unit }) : null), sync: () => { input.value = cur[it.key].raw; }, input };
    }
    function runtimePanel() {
      const root = h('div.stack', {}), pendingHost = h('div');
      paintPending.host = pendingHost;
      root.append(pendingHost);
      GROUPS.forEach((g) => {
        const items = rt.filter((it) => metaOf(it).group === g); if (!items.length) return;
        root.append(h('section.card', {}, h('div.card-head', {}, h('h3', { text: g })), h('div.p3-sets', {}, items.map((it) => {
          const ctl = controlFor(it), badge = h('span.badge.badge--warn', { hidden: true }), err = h('div.err', { role: 'alert' }), note = h('div.muted'), reset = h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '恢复默认', 'aria-label': '恢复默认：' + it.name, on: { click: () => { const m = metaOf(it); if (it.type === 'switch') parse(it, m.def); else parse(it, String(m.def)); ctl.sync(); paintAll(); } } });
          const wrap = h('div.p3-set', {}, h('div.p3-set-main', {}, h('div.row', { style: { gap: 'var(--s-2)', flexWrap: 'wrap' } }, h('b', { text: it.name }), badge), it.hint ? h('div.muted', { text: it.hint }) : null, note, err), h('div.p3-set-ctl', {}, ctl.node, reset));
          rows[it.key] = { wrap, badge, err, note, reset, input: ctl.input, sync: ctl.sync }; return wrap;
        }))));
      });
      root.append(historyCard());
      rt.forEach(paintRow); paintPending();
      return root;
    }
    function paintPending() {
      const host = paintPending.host; if (!host) return;
      const ch = changedKeys(), errs = errKeys();
      if (!ch.length) { host.replaceChildren(); return; }
      const diffRows = ch.map((k) => { const it = rt.find((x) => x.key === k), m = metaOf(it); return h('div', {}, h('span.grow', {}, h('b', { text: it.name }), h('div.muted', { text: cur[k].err ? '填写有误：' + cur[k].err : '' })), h('span.muted.num', { text: fmtVal(m, it.value) }), h('span', { text: '→' }), h('b.num', { text: cur[k].err ? cur[k].raw + '（未生效）' : fmtVal(m, cur[k].val) })); });
      const save = h('button.btn.btn--primary', { type: 'button', text: '保存修改', disabled: !!errs.length, title: errs.length ? '有 ' + errs.length + ' 项填写有误，改好才能保存' : null, on: { click: saveRuntime } });
      host.replaceChildren(h('div.p3-pending', { role: 'status' }, h('div.row.wrap', { style: { gap: 'var(--s-3)' } }, UI.icon('info', 'icon--sm'), h('b.grow', { text: '待保存：改了 ' + ch.length + ' 项' + (errs.length ? '，其中 ' + errs.length + ' 项填写有误' : '') }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '放弃修改', on: { click: discardRuntime } }), save), h('div.list.p3-diff', {}, diffRows)));
    }
    function discardRuntime() { rt.forEach((it) => { cur[it.key] = { raw: it.value, val: it.value, err: '' }; rows[it.key] && rows[it.key].sync(); }); paintAll(); }
    async function saveRuntime() {
      const ch = changedKeys().filter((k) => !cur[k].err); if (!ch.length) return;
      const items = ch.map((k) => rt.find((x) => x.key === k)), high = items.some((it) => metaOf(it).high);
      const reason = h('textarea.textarea', { rows: 2, maxlength: 200, 'aria-label': '修改原因', placeholder: high ? '涉及退款期限或功能开关，请写明原因' : '选填，写明原因方便以后查' }), rf = P3.field('修改原因' + (high ? '' : '（选填）'), reason, { required: high }); reason.addEventListener('input', () => rf.setErr(''));
      const body = h('div.stack', {}, h('div.list.p3-diff', {}, items.map((it) => { const m = metaOf(it); return h('div', {}, h('span.grow', {}, h('b', { text: it.name })), h('span.muted.num', { text: fmtVal(m, it.value) }), h('span', { text: '→' }), h('b.num', { text: fmtVal(m, cur[it.key].val) })); })), P3.alert('info', '保存后立即生效（热生效），无需重启，只影响之后发生的业务。'), rf.el);
      let did = false;
      await UI.dialog({ title: '确认保存 ' + items.length + ' 项修改', size: 'sm', body, actions: [{ label: '取消', value: null }, { label: '确认保存', kind: 'primary', value: 'ok', on: async () => {
        if (high && !reason.value.trim()) { rf.setErr('请写明修改原因'); reason.focus(); return false; }
        if (!(await net(500))) return false;
        if (scene === 'conflict') return conflict(items[0]);
        items.forEach((it) => { const m = metaOf(it), nv = cur[it.key].val; addHist({ kind: 'runtime', key: it.key, name: it.name, bv: it.value, av: nv, before: fmtVal(m, it.value), after: fmtVal(m, nv), reason: reason.value.trim() }); it.value = nv; flashSet.add(hist[0]); });
        P3.audit('system:config', '修改配置', '系统配置 ' + items.map((x) => x.name.replace(/（.*）/, '')).join('、'), { reason: reason.value.trim(), diff: items.map((it) => { const e = hist.find((x) => x.key === it.key); return [it.name, e.before, e.after]; }) });
        did = true;
      } }] });
      if (did) { rt.forEach((it) => { cur[it.key] = { raw: it.value, val: it.value, err: '' }; rows[it.key] && rows[it.key].sync(); }); paintAll(); histTable && histTable.setRows(hist.filter((x) => x.kind === 'runtime')); histTable && P3.flash(histTable.el); UI.toast('已保存 ' + items.length + ' 项，已热生效，无需重启'); }
    }
    /* 保存冲突：别人刚改过同一项，你的修改基于旧值，这次不保存，让你先看最新值 */
    async function conflict(it) {
      const m = metaOf(it), theirs = it.type === 'switch' ? !it.value : it.type === 'number' ? Math.min(m.max, it.value + 10) : '23:00–07:00', mine = cur[it.key].val;
      const v = await UI.dialog({ title: '保存冲突', size: 'sm', body: h('div.stack', {}, P3.alert('bad', '“' + it.name + '”刚刚被周敏改成了 ' + fmtVal(m, theirs) + '，而你是在 ' + fmtVal(m, it.value) + ' 的基础上改成 ' + fmtVal(m, mine) + '。为了不覆盖别人的修改，这次没有保存。'), h('p', { text: '先看一下最新的值，再决定要不要重新修改。其他没有冲突的修改还留在页面上。' })), actions: [{ label: '取消', value: null }, { label: '查看最新值', kind: 'primary', value: 'ok' }] });
      if (v === 'ok') {
        addHist({ kind: 'runtime', key: it.key, name: it.name, by: '周敏', at: P3.stamp(), bv: it.value, av: theirs, before: fmtVal(m, it.value), after: fmtVal(m, theirs), reason: '同时修改' }); it.value = theirs; cur[it.key] = { raw: theirs, val: theirs, err: '' }; rows[it.key] && rows[it.key].sync();
        scene = 'normal'; UI.state.scene.settings = 'normal'; paintAll(); histTable && histTable.setRows(hist.filter((x) => x.kind === 'runtime')); UI.toast('已更新为最新值，请确认后重新保存');
      }
      return v === 'ok' ? undefined : false;
    }

    /* 变更历史与回滚 */
    let histTable;
    function historyCard() {
      histTable = A2.table({
        caption: '运行参数变更历史', empty: '还没有变更历史', rows: hist.filter((x) => x.kind === 'runtime'), size: 10, rowClass: (x) => (flashSet.has(x) ? 'p3-flash' : ''),
        columns: [
          { title: '时间', cls: 'p3-nw num', render: (x) => P3.md(x.at) }, { title: '操作人', cls: 'p3-nw', render: (x) => x.by }, { title: '配置项', render: (x) => x.name },
          { title: '改前', cls: 'p3-nw', render: (x) => x.before }, { title: '改后', cls: 'p3-nw', render: (x) => h('b', { text: x.after }) }, { title: '原因', ell: true, render: (x) => x.reason },
          { title: '操作', cls: 'p3-nw', render: (x) => h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '回滚', 'aria-label': '回滚到这次修改之前：' + x.name, on: { click: () => rollback(x) } }) },
        ],
      });
      return h('section.stack', { 'aria-label': '变更历史' }, h('div.band-title', {}, h('h3', { text: '变更历史' }), h('span.muted', { text: '“回滚”会把这一项改回这次修改之前的值' })), histTable.el);
    }
    async function rollback(x) {
      const it = rt.find((k) => k.key === x.key), m = metaOf(it), now = it.value;
      if (now === x.bv) return UI.toast('这一项现在已经是 ' + fmtVal(m, now) + '，不用回滚', { kind: 'bad' });
      const ok = await UI.confirm('将「' + it.name + '」从当前的 ' + fmtVal(m, now) + ' 改回 ' + x.before + '（回到 ' + P3.md(x.at) + ' 这次修改之前）。' + (now !== x.av ? '注意：这一项在那次修改之后又被改过。' : '') + '保存后立即生效。', { title: '回滚配置', ok: '确认回滚' });
      if (!ok || !(await net(500))) return;
      addHist({ kind: 'runtime', key: it.key, name: it.name, bv: now, av: x.bv, before: fmtVal(m, now), after: fmtVal(m, x.bv), reason: '回滚到 ' + P3.md(x.at) + ' 的修改之前' });
      it.value = x.bv; cur[it.key] = { raw: x.bv, val: x.bv, err: '' }; rows[it.key] && rows[it.key].sync();
      P3.audit('system:config', '回滚配置', '系统配置 ' + it.name, { reason: '回滚到 ' + P3.md(x.at) + ' 的修改之前', diff: [[it.name, fmtVal(m, now), x.before]] });
      flashSet.add(hist[0]); paintAll(); histTable.setRows(hist.filter((k) => k.kind === 'runtime')); P3.flash(histTable.el); UI.toast('已回滚「' + it.name + '」为 ' + x.before);
    }

    /* ================= 文案 ================= */
    const copy = db.config.copy, copyHist = db.copyHistory, cs = { q: '', only: 'all' };
    let copyTable;
    const copyMax = (c) => (COPY_META[c.key] || { max: 30 }).max, modified = (c) => c.value !== DEFAULT_COPY[c.key];
    const copyRows = () => copy.filter((c) => (cs.only === 'all' || modified(c)) && (!cs.q || (c.key + c.name + c.value).includes(cs.q)));
    function mock(key, text) {
      const t = text || '（还没有内容）';
      const kind = key === 'home.slogan' ? h('div.p3-m-home', {}, h('b', { text: '示例门店' }), h('p.p3-m-big', { text: t })) : key === 'order.empty' ? h('div.p3-m-empty', {}, UI.icon('list', 'icon--lg'), h('p', { text: t }), h('span.btn.btn--sm.btn--primary', { text: '去点餐' })) : key === 'pay.success' ? h('div.p3-m-empty', {}, UI.icon('check', 'icon--lg'), h('b', { text: '支付成功' }), h('p', { text: t })) : h('div.p3-m-note', {}, h('b', { text: '申请退款' }), h('p.muted', { text: t }));
      return h('div.p3-phone', { 'aria-label': '小程序预览', inert: true }, h('div.p3-phone-bar', { text: (COPY_META[key] || { where: '小程序里' }).where }), kind);
    }
    function copyEdit(c) {
      const max = copyMax(c), ta = h('textarea.textarea', { rows: 2, value: c.value, 'aria-label': '文案内容' }), f = P3.field('文案内容', ta, { required: true, hint: '“' + c.name + '”，最多 ' + max + ' 个字，只能写业务文字，不要写夸大的词（最好、第一等）' });
      const counter = h('span.num', { 'aria-live': 'polite' }), pv = h('div'), last = (copyHist[c.key] || [])[0];
      const paint = () => { const n = [...ta.value.trim()].length; counter.textContent = n + ' / ' + max; counter.className = 'num' + (n > max ? ' p3-bad' : ''); pv.replaceChildren(mock(c.key, ta.value.trim())); };
      ta.addEventListener('input', () => { f.setErr(''); paint(); }); paint();
      let ok = false;
      return UI.dialog({ title: '编辑文案 · ' + c.name, size: 'wide', body: h('div.p3-split', {}, h('div.stack', {}, h('div.muted', {}, '文案键：' + c.key + '，默认文案：', h('b', { text: DEFAULT_COPY[c.key] })), f.el, h('div.row.between', {}, h('span.muted', { text: '字数' }), counter), h('div.row.wrap', {}, h('button.btn.btn--sm', { type: 'button', text: '恢复默认文案', on: { click: () => { ta.value = DEFAULT_COPY[c.key]; f.setErr(''); paint(); } } }), last ? h('button.btn.btn--sm', { type: 'button', text: '恢复上一版', title: '上一版：' + last.value, on: { click: () => { ta.value = last.value; f.setErr(''); paint(); } } }) : null)), h('div.stack', {}, h('h3', { text: '预览' }), pv)), actions: [{ label: '取消', value: null }, { label: '保存', kind: 'primary', value: 'ok', on: () => {
        const v = ta.value.trim(), n = [...v].length;
        if (!v) { f.setErr('文案不能为空'); ta.focus(); return false; }
        if (n > max) { f.setErr('超出 ' + (n - max) + ' 个字，最多 ' + max + ' 个字'); ta.focus(); return false; }
        const bad = BAD_WORDS.find((w) => v.includes(w)); if (bad) { f.setErr('含有不宜使用的词“' + bad + '”，请换一种说法'); ta.focus(); return false; }
        if (v === c.value) { ok = false; return; }
        return P3.submit(() => { const old = c.value; (copyHist[c.key] = copyHist[c.key] || []).unshift({ at: P3.stamp(), by: A2.me().name, value: old }); c.value = v; addHist({ kind: 'copy', key: c.key, name: c.name, before: old, after: v, reason: '' }); P3.audit('system:config', '修改文案', '文案 ' + c.name, { diff: [[c.name, old, v]] }); ok = true; });
      } }] }).then((r) => { if (r === 'ok' && ok) { flashSet.add(c); copyTable.setRows(copyRows()); P3.flash(copyTable.el); paintRail(); UI.toast('文案已保存，小程序里立即生效'); } });
    }
    async function copyReset(c) {
      if (!modified(c)) return;
      if (!(await UI.confirm('将「' + c.name + '」恢复为默认文案“' + DEFAULT_COPY[c.key] + '”，当前文案“' + c.value + '”会被替换。', { title: '恢复默认文案', ok: '确认恢复' })) || !(await net(400))) return;
      const old = c.value; (copyHist[c.key] = copyHist[c.key] || []).unshift({ at: P3.stamp(), by: A2.me().name, value: old }); c.value = DEFAULT_COPY[c.key];
      addHist({ kind: 'copy', key: c.key, name: c.name, before: old, after: c.value, reason: '恢复默认' }); P3.audit('system:config', '恢复默认文案', '文案 ' + c.name, { diff: [[c.name, old, c.value]] });
      flashSet.add(c); copyTable.setRows(copyRows()); P3.flash(copyTable.el); paintRail(); UI.toast('已恢复默认文案');
    }
    function copyPanel() {
      copyTable = A2.table({
        caption: '文案', empty: '没有符合条件的文案', rows: copyRows(), rowClass: (c) => (flashSet.has(c) ? 'p3-flash' : ''),
        columns: [
          { title: '文案键', cls: 'p3-nw', render: (c) => c.key }, { title: '位置', cls: 'p3-nw', render: (c) => h('div', {}, h('b', { text: c.name }), h('div.muted', { text: (COPY_META[c.key] || { where: '' }).where })) },
          { title: '当前文案', ell: true, render: (c) => c.value }, { title: '字数', cls: 'r', render: (c) => [...c.value].length + ' / ' + copyMax(c) }, { title: '状态', cls: 'p3-nw', render: (c) => (modified(c) ? P3.badge('已修改', 'warn') : P3.badge('默认', '', true)) },
          { title: '操作', cls: 'p3-nw', render: (c) => h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '编辑', 'aria-label': '编辑文案：' + c.name, on: { click: () => copyEdit(c) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '预览', 'aria-label': '预览文案：' + c.name, on: { click: () => UI.dialog({ title: '预览 · ' + c.name, size: 'sm', body: mock(c.key, c.value), actions: [{ label: '关闭', kind: 'primary', value: 'ok' }] }) } }), modified(c) ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '恢复默认', 'aria-label': '恢复默认文案：' + c.name, on: { click: () => copyReset(c) } }) : null) },
        ],
      });
      const onlySeg = P3.seg('筛选', [['all', '全部'], ['mod', '已修改']], cs.only, (v) => { cs.only = v; copyTable.setRows(copyRows()); });
      return h('div.stack', {}, h('div.card.card--tight.p3-toolbar', {}, onlySeg, h('span.grow', { text: '小程序里每处可见的文字都有一个文案键，改完保存即生效，不用发版。' }), A2.search('文案键、位置或内容', (v) => { cs.q = v; copyTable.setRows(copyRows()); })), copyTable.el);
    }

    /* ================= 页面内容 ================= */
    const drafts = {}, pg = { key: 'agreement' };
    const docName = (k) => DOCS.find((d) => d[0] === k)[1], docDirty = (k) => drafts[k] != null && drafts[k] !== db.pageText[k];
    const anyDocDirty = () => DOCS.some(([k]) => docDirty(k));
    function renderDoc(text) { return h('div.p3-doc', {}, text.split('\n').map((l) => (/^[一二三四五六七八九十]+、/.test(l) ? h('h3', { text: l }) : h('p', { text: l })))); }
    let docHost, docSeg, ta, counter, dirtyBadge;
    function paintDocTop() { dirtyBadge.hidden = !docDirty(pg.key); UI.$$('button', docSeg).forEach((b) => { const k = b.dataset.v; b.textContent = docName(k) + (docDirty(k) ? '（未保存）' : ''); }); const n = [...ta.value].length; counter.textContent = '已写 ' + P3.n(n) + ' 字 / 上限 ' + P3.n(DOC_LIMIT) + ' 字'; counter.className = 'num' + (n > DOC_LIMIT ? ' p3-bad' : ''); }
    function pagePanel() {
      docSeg = P3.seg('选择文本', DOCS.map(([k, n]) => [k, n]), pg.key, (k) => { drafts[pg.key] = ta.value; pg.key = k; ta.value = drafts[k] != null ? drafts[k] : db.pageText[k]; paintDocTop(); paintRail(); });
      ta = h('textarea.textarea.p3-docedit', { 'aria-label': '页面文本', value: db.pageText[pg.key], spellcheck: false }); counter = h('span.muted', { 'aria-live': 'polite' }); dirtyBadge = h('span.badge.badge--warn', { hidden: true, text: '有未保存的修改' });
      ta.addEventListener('input', () => { drafts[pg.key] = ta.value; paintDocTop(); paintRail(); });
      const metaLine = () => { const p = db.config.pages.find((x) => x.key === pg.key); return '最近更新 ' + p.updated + ' · 当前 v' + db.pageVersions[pg.key][0].v; };
      const info = h('span.muted'), refreshInfo = () => { info.textContent = metaLine(); };
      refreshInfo(); paintDocTop();
      pagePanel.refreshInfo = refreshInfo;
      return h('div.stack', {}, h('div.card.card--tight.p3-toolbar', {}, docSeg, dirtyBadge, h('span.grow'), info, h('button.btn.btn--sm', { type: 'button', text: '预览', on: { click: () => UI.dialog({ title: '预览 · ' + docName(pg.key), size: 'wide', body: renderDoc(ta.value), actions: [{ label: '关闭', kind: 'primary', value: 'ok' }] }) } }), h('button.btn.btn--sm', { type: 'button', text: '版本记录', on: { click: () => versions() } })),
        h('div.card', {}, ta, h('div.row.between.wrap', { style: { marginTop: 'var(--s-3)' } }, counter, h('div.row', {}, h('button.btn.btn--ghost', { type: 'button', text: '放弃修改', on: { click: () => { delete drafts[pg.key]; ta.value = db.pageText[pg.key]; paintDocTop(); paintRail(); } } }), h('button.btn.btn--primary', { type: 'button', text: '保存', on: { click: savePage } })))));
    }
    async function savePage() {
      const k = pg.key, text = ta.value, old = db.pageText[k];
      if (!text.trim()) return UI.toast('内容不能为空', { kind: 'bad' });
      if ([...text].length > DOC_LIMIT) return UI.toast('超出 ' + P3.n(DOC_LIMIT) + ' 字的上限，请精简后再保存', { kind: 'bad' });
      if (text === old) return UI.toast('没有修改任何内容');
      const note = h('textarea.textarea', { rows: 2, maxlength: 100, 'aria-label': '变更摘要', placeholder: '例如：补充退款期限的说明' }), nf = P3.field('变更摘要', note, { required: true, hint: '一句话写清改了什么，写进版本记录' }); note.addEventListener('input', () => nf.setErr(''));
      const dn = [...text].length - [...old].length;
      const v = await UI.dialog({ title: '保存「' + docName(k) + '」', size: 'sm', body: h('div.stack', {}, h('p', { text: '将生成新版本 v' + (db.pageVersions[k][0].v + 1) + '，字数 ' + [...old].length + ' → ' + [...text].length + '（' + (dn >= 0 ? '多 ' : '少 ') + Math.abs(dn) + ' 字）。保存后小程序里立即显示新内容，旧版本留在版本记录里。' }), nf.el), actions: [{ label: '取消', value: null }, { label: '确认保存', kind: 'primary', value: 'ok', on: () => { if (!note.value.trim()) { nf.setErr('请写一句变更摘要'); note.focus(); return false; } return P3.submit(() => commitDoc(k, text, note.value.trim(), '修改页面内容')); } }] });
      if (v === 'ok') { UI.toast('已保存，当前为 v' + db.pageVersions[k][0].v); }
    }
    function commitDoc(k, text, note, action) {
      const vs = db.pageVersions[k], old = db.pageText[k], p = db.config.pages.find((x) => x.key === k);
      vs.unshift({ v: vs[0].v + 1, at: P3.stamp(), by: A2.me().name, text, len: [...text].length, note }); db.pageText[k] = text; p.updated = P3.today(); delete drafts[k];
      addHist({ kind: 'page', key: k, name: docName(k), before: '字数 ' + [...old].length, after: '字数 ' + [...text].length, reason: note });
      P3.audit('system:config', action, '页面内容 ' + docName(k), { reason: note, diff: [['版本', 'v' + vs[1].v, 'v' + vs[0].v], ['字数', [...old].length, [...text].length]] });
      if (pg.key === k && ta) ta.value = text; paintDocTop(); pagePanel.refreshInfo && pagePanel.refreshInfo(); paintRail();
    }
    function versions() {
      const k = pg.key, vs = db.pageVersions[k];
      const t = A2.table({ caption: docName(k) + '的版本记录', rows: vs, size: 10, columns: [
        { title: '版本', cls: 'p3-nw', render: (x) => h('span.row', { style: { gap: 'var(--s-2)' } }, h('b', { text: 'v' + x.v }), x === vs[0] ? P3.badge('当前', 'ok', true) : null) }, { title: '时间', cls: 'p3-nw num', render: (x) => P3.md(x.at) }, { title: '修改人', cls: 'p3-nw', render: (x) => x.by },
        { title: '字数', cls: 'r', render: (x) => x.len }, { title: '变更摘要', ell: true, render: (x) => x.note },
        { title: '操作', cls: 'p3-nw', render: (x) => h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '查看', on: { click: () => UI.dialog({ title: docName(k) + ' · v' + x.v, size: 'wide', body: renderDoc(x.text), actions: [{ label: '关闭', kind: 'primary', value: 'ok' }] }) } }), x === vs[0] ? null : h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '回滚到此版', on: { click: async () => {
          if (docDirty(k) && !(await UI.confirm('「' + docName(k) + '」有未保存的修改，回滚会把它们覆盖掉。', { title: '覆盖未保存的修改', ok: '继续回滚', danger: true }))) return;
          if (!(await UI.confirm('将「' + docName(k) + '」回滚到 v' + x.v + '，会生成新版本 v' + (vs[0].v + 1) + '，立即生效，当前内容保留在版本记录里。', { title: '回滚页面内容', ok: '确认回滚' })) || !(await net(500))) return;
          commitDoc(k, x.text, '回滚到 v' + x.v, '回滚页面内容'); UI.toast('已回滚，当前为 v' + db.pageVersions[k][0].v); document.querySelector('dialog[open]') && document.querySelector('dialog[open]').close();
        } } })) },
      ] });
      return UI.dialog({ title: docName(k) + ' · 版本记录', size: 'wide', body: h('div.stack', {}, h('p.muted', { text: '已发布的版本不能修改，只能回滚到某个旧版本（生成新版本）。' }), t.el), actions: [{ label: '关闭', kind: 'primary', value: 'ok' }] });
    }

    /* ================= 版本信息 ================= */
    const REL = [
      { v: '2.4.1', d: P3.dayKey(12), title: '修复通知重发与导出下载', notes: ['修复批量重发通知时偶尔重复发送的问题', '导出任务完成后可在顶栏看到提示', '会员列表手机号默认脱敏，查看需要填写原因'] },
      { v: '2.4.0', d: P3.dayKey(31), title: '新增导入导出与系统配置', notes: ['新增批量导入商品、会员，失败行可单独下载', '系统配置页支持改前改后对比与回滚', '新增二次验证，超级管理员建议开启'] },
      { v: '2.3.2', d: P3.dayKey(58), title: '稳定性改进', notes: ['优化订单列表在弱网下的加载', '修复月卡扣次后剩余天数显示不对的问题'] },
      { v: '2.3.0', d: P3.dayKey(96), title: '会员卡与储值', notes: ['新增月卡、次卡、时段卡', '新增储值充值与赠送规则'] },
    ];
    const newRel = { v: '2.5.0', d: P3.dayKey(-4), title: '即将发布：通知与账号安全', notes: ['通知发送记录支持按场景统计', '账号长期未登录自动提醒', '修复若干界面问题'], fresh: true };
    const relList = REL.slice();
    let verHost, lastCheck = '今天 ' + P3.stamp().slice(11), hasNew = scene === 'new-version';
    function versionPanel() {
      verHost = h('div.stack', {}); paintVer(); return verHost;
    }
    function paintVer() {
      const rels = hasNew ? [newRel].concat(relList) : relList;
      const chk = h('button.btn', { type: 'button', text: '检查新版本', on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; b.replaceChildren(h('span.spin'), ' 检查中'); try { await UI.request(null, 900); } catch (er) { b.disabled = false; b.textContent = '检查新版本'; return UI.toast('网络不太稳定，没能检查成功，请稍后再试', { kind: 'bad' }); } lastCheck = '今天 ' + P3.stamp().slice(11); if (hasNew) UI.toast('发现新版本 v' + newRel.v); else UI.toast('已经是最新版本 v' + relList[0].v); paintVer(); } } });
      verHost.replaceChildren(...[
        hasNew ? P3.alert('info', '有新版本 v' + newRel.v + '（' + newRel.d.slice(5) + ' 发布）：' + newRel.title + '。刷新页面后使用，不会打断你正在填写的内容。', h('button.btn.btn--sm', { type: 'button', text: '刷新后使用', on: { click: () => { if (anyDocDirty() || changedKeys().length) return UI.toast('还有未保存的修改，先保存再刷新', { kind: 'bad' }); hasNew = false; scene = 'normal'; UI.state.scene.settings = 'normal'; UI.toast('已更新到 v' + newRel.v + '（演示不会真的刷新）'); relList.unshift({ ...newRel, fresh: false }); paintVer(); paintRail(); } } })) : null,
        h('div.card', {}, h('div.card-head', {}, h('h3', { text: '当前版本' }), h('div.row', { style: { gap: 'var(--s-3)' } }, h('span.muted', { text: '上次检查：' + lastCheck }), chk)),
          A2.kv([['前端版本', 'v' + relList[0].v], ['后端版本', 'v2.4.0'], ['配置版本', hashOf(rt) + '（运行参数内容的摘要，改一项就会变）'], ['上线日期', relList[0].d], ['运行环境', ENV], ['时区', '北京时间（UTC+8）']])),
        h('div.card', {}, h('div.card-head', {}, h('h3', { text: '更新说明' }), h('span.muted', { text: '点标题展开' })), h('div.p3-rels', {}, rels.map((r, i) => h('details.p3-rel', { open: i === (hasNew ? 0 : 0) }, h('summary', {}, h('b', { text: 'v' + r.v }), h('span.muted', { text: r.d }), h('span.grow', { text: r.title }), r.fresh ? P3.badge('新版本', 'brand') : null), h('ul', {}, r.notes.map((n) => h('li', { text: n })))))))].filter(Boolean));
    }

    /* ================= 右侧窄栏 ================= */
    const rail = h('aside.rail', { 'aria-label': '配置提醒' });
    let checkedAt = P3.stamp().slice(11), checking = false;
    function health() {
      const v = (k) => saved(k), out = [];
      out.push(v('order.unpaid_close_minutes') < 15 ? ['warn', '未支付自动关闭只有 ' + v('order.unpaid_close_minutes') + ' 分钟，顾客支付慢一点就会被误关'] : ['ok', '未支付自动关闭 ' + v('order.unpaid_close_minutes') + ' 分钟，在合理范围']);
      out.push(v('order.refund_free_days') > 15 ? ['warn', '免审核退款期限 ' + v('order.refund_free_days') + ' 天偏长，资金风险较高'] : ['ok', '免审核退款期限 ' + v('order.refund_free_days') + ' 天，在建议范围']);
      out.push(v('login.lock_attempts') > 8 ? ['warn', '登录失败锁定次数 ' + v('login.lock_attempts') + ' 次偏多，口令容易被试出来'] : ['ok', '登录失败 ' + v('login.lock_attempts') + ' 次锁定，在建议范围']);
      out.push(v('notify.quiet_hours') === '未启用' ? ['warn', '没有设置静默时段，营销消息夜间也会打扰会员'] : ['ok', '静默时段 ' + v('notify.quiet_hours')]);
      const off = ['feature.coupon', 'feature.wallet', 'feature.card'].filter((k) => !v(k)).map((k) => rt.find((x) => x.key === k).name.replace('功能', ''));
      out.push(off.length ? ['warn', off.join('、') + ' 已关闭，小程序里对应入口不显示'] : ['ok', '优惠券、储值、会员卡功能都已开启']);
      out.push(['ok', '支付结果回调正常（示意）'], ['warn', '短信余额约 1,240 条，按近期用量约够 6 天（示意）']);
      return out;
    }
    function paintRail() {
      const recent = hist.slice(0, 5), pend = changedKeys(), dd = DOCS.filter(([k]) => docDirty(k)), hs = health();
      rail.replaceChildren(
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '待保存' }), pend.length + dd.length ? P3.badge(pend.length + dd.length + ' 处', 'warn') : P3.badge('没有待保存', 'ok')),
          pend.length + dd.length ? h('div.stack', { style: { gap: 'var(--s-2)' } }, h('div.list', {}, pend.map((k) => { const it = rt.find((x) => x.key === k); return h('div', {}, h('span.grow', { text: it.name }), h('span.muted.num', { text: cur[k].err ? '填写有误' : fmtVal(metaOf(it), it.value) + ' → ' + fmtVal(metaOf(it), cur[k].val) })); }).concat(dd.map(([k, n]) => h('div', {}, h('span.grow', { text: n }), h('span.muted', { text: '文本已改' }))))), h('button.btn.btn--soft.btn--sm', { type: 'button', text: '去保存', on: { click: () => { tabsUI.show(pend.length ? 0 : 2); } } })) : h('p.muted', { text: '运行参数和页面文本都已保存。' })),
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '最近变更' })), recent.length ? h('div.list', {}, recent.map((x) => h('div.p3-recent', {}, h('span.grow', {}, h('b', { text: x.name }), h('div.muted', { text: short(x.before) + ' → ' + short(x.after) }), h('div.muted.num', { text: P3.md(x.at) + ' · ' + x.by }))))) : h('p.muted', { text: '还没有变更' })),
        h('section.card.card--tight', {}, h('div.card-head', {}, h('h3', { text: '配置健康检查' }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: checking ? '检查中…' : '重新检查', disabled: checking, on: { click: async () => { checking = true; paintRail(); try { await UI.request(null, 700); } catch (e) { checking = false; paintRail(); return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); } checking = false; checkedAt = P3.stamp().slice(11); paintRail(); UI.toast('检查完成，' + hs.filter((x) => x[0] === 'warn').length + ' 项需要留意'); } } })),
          h('div.list.p3-health', {}, hs.map(([k, t]) => h('div', {}, UI.icon(k === 'ok' ? 'check' : 'warn', 'icon--sm'), h('span.grow', { text: t }), h('span.badge.badge--plain.badge--' + (k === 'ok' ? 'ok' : 'warn'), { text: k === 'ok' ? '正常' : '留意' })))), h('div.muted', { style: { marginTop: 'var(--s-2)' }, text: '示意检查，' + checkedAt + ' 更新' })));
    }

    /* ================= 组装 ================= */
    const head = A2.heading('系统配置', '改运行设置、文案和协议，保存后热生效，无需重启', []);
    tabsUI = P3.tabs([{ label: '运行参数', render: runtimePanel }, { label: '文案', count: copy.length, render: copyPanel }, { label: '页面内容', render: pagePanel }, { label: '版本信息', render: versionPanel }], { label: '系统配置分区' });
    paintRail();
    page.append(head);
    if (scene === 'new-version') page.append(P3.alert('info', '有新版本 v' + newRel.v + '，刷新后使用；不会丢掉你正在填写的内容。可以到“版本信息”里查看更新说明。', h('button.btn.btn--sm', { type: 'button', text: '查看更新说明', on: { click: () => tabsUI.show(3) } })));
    page.append(h('div.l-rail', {}, h('div.main', {}, h('div.card.card--tight.p3-tabsbar', {}, tabsUI.list), tabsUI.panels), rail));
    P3.leaveGuard(page, () => changedKeys().length > 0 || anyDocDirty(), () => '运行参数或页面文本还有修改没有保存，现在离开会丢掉它们。');
    return page;
  }
})();
