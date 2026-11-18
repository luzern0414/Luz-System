/* 排班：时间轴泳道（UI.lanes）。泳道是员工，事项是班次与会议；读写 B.db.staff / B.db.shifts（按日期各一份），重置时重新生成。 */
(function () {
  'use strict';
  const h = P2.h;
  const { today: TODAY, dAdd, md, pad } = P2;
  const FROM = 7, TO = 22;
  const fmt = (t) => pad(t) + ':00';
  const DAYNAME = { '-1': '昨天', 0: '今天', 1: '明天' };

  /* ---------- 演示数据：7 位员工、三天的班次；今天有冲突、需确认和空闲 ---------- */
  P2.onSeed((db) => {
    const today = TODAY();
    db.staff = [
      { id: 1, name: '陈晓燕', role: '前台' }, { id: 2, name: '何建平', role: '前台' }, { id: 3, name: '刘洋', role: '后厨' }, { id: 4, name: '马国强', role: '后厨' },
      { id: 5, name: '周敏', role: '店长' }, { id: 6, name: '赵建国', role: '配送' }, { id: 7, name: '孙磊', role: '配送' },
    ];
    let id = 0;
    const S = (staffId, from, to, title, kind, needConfirm) => ({ id: ++id, staffId, from, to, title, kind: kind || '班次', needConfirm: !!needConfirm, note: '' });
    db.shifts = {
      [dAdd(today, -1)]: [S(1, 8, 16, '早班'), S(2, 12, 20, '晚班'), S(3, 7, 15, '早厨'), S(4, 11, 19, '午晚厨'), S(5, 9, 17, '店长班'), S(5, 15, 16, '周例会', '会议'), S(6, 10, 14, '配送高峰'), S(7, 17, 21, '配送晚高峰')],
      [today]: [S(1, 8, 12, '早班'), S(1, 14, 18, '午班'), S(2, 11, 15, '午高峰'), S(2, 14, 18, '代班'), S(3, 7, 11, '备料'), S(3, 10, 14, '出餐高峰'), S(3, 16, 20, '晚班'), S(4, 11, 20, '厨房长班'), S(5, 9, 12, '盘点'), S(5, 12, 13, '供应商会议', '会议', true), S(6, 10, 14, '配送高峰'), S(6, 17, 21, '配送晚高峰')],
      [dAdd(today, 1)]: [S(1, 8, 16, '早班'), S(5, 9, 17, '店长班'), S(5, 14, 15, '新品培训', '会议', true), S(7, 10, 14, '配送高峰'), S(7, 13, 17, '配送代班')],
    };
    db.shiftSeq = id;
  });

  const overlap = (a, b) => a.from < b.to && a.to > b.from;
  /** 一天里每个人的冲突（时间重叠的班次对） */
  function conflictsOf(list) {
    const out = [];
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => { if (a.staffId === b.staffId && overlap(a, b)) out.push([a, b]); }));
    return out;
  }
  /** 与 UI.lanes 画出的虚线空闲块同一算法：空档不少于 2 小时 */
  function freeGaps(evs) {
    if (!evs.length) return [[FROM, TO, true]];
    const cov = evs.map((e) => [e.from, e.to]).sort((a, b) => a[0] - b[0]), gaps = []; let t = FROM;
    cov.forEach(([f, to]) => { if (f - t >= 2) gaps.push([t, f]); t = Math.max(t, to); });
    if (TO - t >= 2) gaps.push([t, TO]);
    return gaps;
  }

  window.PAGES2.schedule = {
    title: '排班', group: '门店',
    layout: '时间轴泳道',
    reason: '排班最怕的是同一个人被排到重叠的时间、该确认的事没人确认、某段时间没人：员工是泳道、班次与会议是横条，红色冲突、橙色待确认、虚线空闲一眼可见，那条“现在”竖线告诉店长此刻谁在岗',
    scenes: [
      { id: 'nodata', label: '这一天没有排班' },
      { id: 'copy-fail', label: '复制失败：明天的排班已被锁定' },
      { id: 'save-fail', label: '保存失败：班次已被别人改过' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '这一天还没有排班');
      if (early) return early;
      P2.begin();
      const S = { off: 0, onlyBad: false }, page = h('section.page.p2-page'), flashIds = new Set();
      const day = () => dAdd(TODAY(), S.off);
      const shifts = (d) => { B.db.shifts[d] = B.db.shifts[d] || []; return B.db.shifts[d]; };
      const staffOf = (id) => B.db.staff.find((s) => s.id === id);
      const tgt = (sh, d) => '排班 ' + (d || day()) + ' ' + (staffOf(sh.staffId) || {}).name;
      const timeText = (sh) => fmt(sh.from) + '–' + fmt(sh.to);

      const sumEl = h('div.p2-sumstrip'), lanesHost = h('div'), listEl = h('section.card.card--tight.stack', { 'aria-label': '冲突与待办' });
      const segEl = h('div.seg', { role: 'group', 'aria-label': '日期' });

      function paintSum(list, confl, gapsN) {
        const duty = new Set(list.filter((s) => s.kind === '班次').map((s) => s.staffId)).size, name = DAYNAME[S.off];
        sumEl.replaceChildren(
          P2.stat({ label: name + '在岗人数', value: duty, suffix: ' / ' + B.db.staff.length + ' 人', sub: h('span', { text: '有班次的人数' }) }),
          P2.stat({ label: '冲突', value: confl.length, suffix: ' 处', sub: confl.length ? h('span.badge.badge--bad', { text: '涉及 ' + new Set(confl.flat().map((s) => s.id)).size + ' 个班次' }) : h('span.badge.badge--ok', { text: '没有冲突' }) }),
          P2.stat({ label: '空闲时段', value: gapsN, suffix: ' 个', sub: h('span', { text: '连续空档不少于 2 小时' }) }));
      }

      function draw() {
        const d = day(), list = ctx.scene === 'nodata' ? [] : shifts(d), confl = conflictsOf(list), badStaff = new Set(confl.flat().map((s) => s.staffId));
        let staff = B.db.staff; if (S.onlyBad) staff = staff.filter((s) => badStaff.has(s.id));
        const gapsN = B.db.staff.reduce((a, s) => a + freeGaps(list.filter((x) => x.staffId === s.id)).length, 0);
        paintSum(list, confl, gapsN);
        segEl.replaceChildren(...[-1, 0, 1].map((o) => h('button', { type: 'button', 'aria-pressed': String(S.off === o), text: DAYNAME[o] + ' ' + md(dAdd(TODAY(), o)), on: { click: () => { S.off = o; draw(); } } })));
        if (!staff.length) lanesHost.replaceChildren(A2.empty(S.onlyBad ? '当天没有冲突' : '没有员工'));
        else {
          lanesHost.replaceChildren(); const el = h('div'); lanesHost.append(el);
          UI.lanes(el, { from: FROM, to: TO, step: 1, now: S.off === 0 ? Number(P2.nowHM().slice(0, 2)) + Number(P2.nowHM().slice(3)) / 60 : null,
            lanes: staff.map((s) => ({ id: s.id, label: s.name, sub: s.role, avatar: h('span.p2-av', { text: s.name[0], 'aria-hidden': 'true' }), events: list.filter((x) => x.staffId === s.id).map((x) => ({ id: x.id, from: x.from, to: x.to, title: x.title, kind: x.needConfirm ? 'warn' : '' })) })),
            onEvent: (ev) => openShift(ev.id) });
          /* UI.lanes 按开始时间排好再画：按同样的顺序给每个横条标上编号，改动过的闪一次 */
          UI.$$('.lane-track', el).forEach((tr, i) => { const evs = list.filter((x) => x.staffId === staff[i].id).sort((a, b) => a.from - b.from); UI.$$('.lane-event', tr).forEach((n, k) => { if (evs[k]) { n.dataset.id = evs[k].id; if (flashIds.has(evs[k].id)) P2.flash(n); } }); });
          flashIds.clear();
        }
        /* 冲突与待办 */
        const rows = [];
        confl.forEach(([a, b]) => rows.push({ k: 'bad', text: staffOf(a.staffId).name + '：「' + a.title + '」' + timeText(a) + ' 与「' + b.title + '」' + timeText(b) + ' 重叠', id: a.id }));
        if (!S.onlyBad) {
          list.filter((x) => x.needConfirm).forEach((x) => rows.push({ k: 'warn', text: staffOf(x.staffId).name + '：「' + x.title + '」' + timeText(x) + ' 还没有本人确认', id: x.id }));
          B.db.staff.filter((s) => !list.some((x) => x.staffId === s.id)).forEach((s) => rows.push({ k: 'idle', text: s.name + '（' + s.role + '）当天没有排班，全天空闲', id: null, staffId: s.id }));
        }
        listEl.replaceChildren(h('div.row.between.wrap', {}, h('h3', { text: '冲突与待办' }), h('label.row', { style: { gap: 'var(--s-2)' } }, h('span', { text: '只看冲突' }), h('input.switch', { type: 'checkbox', role: 'switch', checked: S.onlyBad, 'aria-label': '只看冲突', on: { change: (e) => { S.onlyBad = e.target.checked; draw(); } } }))),
          rows.length ? h('ul.list', { role: 'list' }, rows.map((r) => h('li', {}, P2.badge({ bad: '冲突', warn: '待确认', idle: '空闲' }[r.k], { bad: 'bad', warn: 'warn', idle: '' }[r.k]), h('span.grow', { text: r.text }), r.id ? h('button.btn.btn--sm', { type: 'button', text: '处理', on: { click: () => openShift(r.id) } }) : h('button.btn.btn--sm', { type: 'button', text: '去排班', on: { click: () => addShift(r.staffId) } })))) : h('p.muted', { text: S.onlyBad ? '这一天没有冲突。' : '这一天没有需要处理的事项。' }));
        copyBtn.disabled = S.off >= 1; copyBtn.title = S.off >= 1 ? '明天是最后一天，没有可复制到的日期' : '把' + DAYNAME[S.off] + '的班次复制到' + (S.off === -1 ? '今天' : '明天');
      }

      /* ---------- 班次的新增、调整、换班、删除 ---------- */
      const hourOpts = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ v: String(a + i), l: fmt(a + i) }));
      async function shiftForm(sh, preStaff) {
        const isNew = !sh, d = day(), base = sh || { staffId: preStaff || B.db.staff[0].id, from: 9, to: 13, title: '', kind: '班次', needConfirm: false };
        const v = await P2.form({ title: isNew ? '新增班次（' + d + '）' : '调整班次：' + sh.title, size: 'sm', ok: isNew ? '保存班次' : '保存', lead: '保存前会检查同一个人当天有没有时间重叠的班次。',
          fields: [
            { name: 'staff', label: '人员', type: 'select', options: B.db.staff.map((s) => ({ v: String(s.id), l: s.name + '（' + s.role + '）' })), value: String(base.staffId) },
            { name: 'kind', label: '类型', type: 'select', options: ['班次', '会议'], value: base.kind },
            { name: 'title', label: '名称', required: true, value: base.title, max: 12, placeholder: '例如 早班、盘点、周例会', validate: (x) => (x.length < 2 ? '名称至少 2 个字' : '') },
            { name: 'from', label: '开始', type: 'select', options: hourOpts(FROM, TO - 1), value: String(base.from) },
            { name: 'to', label: '结束', type: 'select', options: hourOpts(FROM + 1, TO), value: String(base.to) },
            { name: 'confirm', label: '需要本人确认', type: 'switch', value: base.needConfirm, hint: '会议默认需要本人确认，确认前显示为橙色' },
          ],
          onBuild: (f) => { f.el.classList.add('p2-form2'); const k = f.el.children[1].querySelector('select'), sw = f.el.children[5].querySelector('input'); if (isNew) k.addEventListener('change', () => (sw.checked = k.value === '会议')); },
          check: (x) => { const e = {}, a = Number(x.from), b = Number(x.to); if (b <= a) e.to = '结束时间要晚于开始时间'; else if (b - a > 12) e.to = '单个班次最长 12 小时'; else if (x.kind === '会议' && b - a > 4) e.to = '会议最长 4 小时'; return e; },
          submit: async (x) => {
            if (ctx.scene === 'save-fail') P2.fail('保存失败：这天的排班刚刚被另一位店长改过，请关闭后重新打开再试');
            const cand = { staffId: Number(x.staff), from: Number(x.from), to: Number(x.to) }, clash = shifts(d).filter((o) => o !== sh && o.staffId === cand.staffId && overlap(o, cand));
            if (clash.length && !(await UI.confirm(staffOf(cand.staffId).name + ' 在 ' + clash.map((o) => '「' + o.title + '」' + timeText(o)).join('、') + ' 已有安排，和新的 ' + fmt(cand.from) + '–' + fmt(cand.to) + ' 重叠。仍要保存吗？保存后会在排班表里标成红色冲突。', { title: '时间有冲突', ok: '仍然保存' }))) return false;
            const body = { staffId: cand.staffId, from: cand.from, to: cand.to, title: x.title, kind: x.kind, needConfirm: x.confirm };
            if (isNew) { sh = Object.assign({ id: ++B.db.shiftSeq, note: '' }, body); shifts(d).push(sh); } else Object.assign(sh, body);
            A2.audit('schedule:edit', (isNew ? '新增' : '调整') + '班次「' + x.title + '」' + timeText(sh) + (clash.length ? '（与 ' + clash.length + ' 个班次冲突）' : ''), tgt(sh));
          } });
        if (v) { UI.toast(isNew ? '已新增班次' : '已保存'); flashIds.add(sh.id); draw(); }
        return !!v;
      }
      const addShift = (staffId) => shiftForm(null, staffId);

      async function swap(sh) {
        const others = B.db.staff.filter((s) => s.id !== sh.staffId), d = day();
        const v = await P2.form({ title: '换班：' + sh.title + ' ' + timeText(sh), size: 'sm', ok: '确认换班', lead: '现在是 ' + staffOf(sh.staffId).name + '（' + staffOf(sh.staffId).role + '），换给另一位同事后会检查对方当天的时间。',
          fields: [{ name: 'to', label: '换给', type: 'select', options: others.map((s) => ({ v: String(s.id), l: s.name + '（' + s.role + '）' })), value: String(others[0].id) }, { name: 'why', label: '原因（选填）', type: 'textarea', max: 60 }],
          check: (x) => { const clash = shifts(d).filter((o) => o !== sh && o.staffId === Number(x.to) && overlap(o, sh)); return clash.length ? { to: staffOf(Number(x.to)).name + ' 在 ' + clash.map((o) => '「' + o.title + '」' + timeText(o)).join('、') + ' 已有安排，换过去会冲突，请选别人' } : null; },
          submit: async (x) => {
            const to = staffOf(Number(x.to));
            if (to.role !== staffOf(sh.staffId).role && !(await UI.confirm(to.name + ' 是' + to.role + '，原来是' + staffOf(sh.staffId).role + '岗位，岗位不同，仍要换吗？', { title: '岗位不同', ok: '仍然换班' }))) return false;
            const from = staffOf(sh.staffId).name; sh.staffId = to.id; A2.audit('schedule:edit', '换班：「' + sh.title + '」' + timeText(sh) + '，' + from + ' → ' + to.name + (x.why ? '：' + x.why : ''), tgt(sh));
          } });
        if (v) { UI.toast('已换给 ' + staffOf(sh.staffId).name); flashIds.add(sh.id); draw(); }
        return !!v;
      }
      async function remove(sh) {
        if (!(await A2.danger('将删除 ' + staffOf(sh.staffId).name + ' 的「' + sh.title + '」' + timeText(sh) + '，删除后这段时间变成空闲。', { title: '删除班次', ok: '确认删除' }))) return false;
        const r = await P2.act(() => { const l = shifts(day()); l.splice(l.indexOf(sh), 1); A2.audit('schedule:edit', '删除班次「' + sh.title + '」' + timeText(sh), tgt(sh)); });
        if (r.ok) { UI.toast('已删除班次'); draw(); }
        return r.ok;
      }
      async function confirmShift(sh) {
        const r = await P2.act(() => { sh.needConfirm = false; A2.audit('schedule:edit', '标记「' + sh.title + '」已确认', tgt(sh)); });
        if (r.ok) { UI.toast('已标记确认'); flashIds.add(sh.id); draw(); }
        return r.ok;
      }

      function openShift(id) {
        const d = day(), sh = () => shifts(d).find((x) => x.id === id);
        if (!sh()) return;
        const box = (paint) => { const n = h('div'); n.paint = () => n.replaceChildren(paint()); n.paint(); return n; };
        let dlg;
        const closeMe = () => { const o = UI.$$('dialog.dlg[open]').pop(); o && o.close(''); };
        const info = box(() => {
          const x = sh(); if (!x) return h('p.muted', { text: '这个班次已经被删除。' });
          const clash = shifts(d).filter((o) => o !== x && o.staffId === x.staffId && overlap(o, x)), acts = h('div.row.wrap');
          const add = (label, fn, kind, close) => acts.append(h('button.btn.btn--sm' + (kind ? '.btn--' + kind : ''), { type: 'button', text: label, on: { click: async () => { const ok = await fn(x); if (ok && close) closeMe(); else if (ok) { info.paint(); aud.paint(); } } } }));
          add('调整', shiftForm); add('换班', swap); if (x.needConfirm) add('标记确认', confirmShift, 'soft'); add('删除', remove, 'danger', true);
          return h('div.stack', {}, clash.length ? h('div.p2-warnbox', { role: 'alert' }, h('b', { text: '时间冲突' }), h('span', { text: '与「' + clash.map((o) => o.title + ' ' + timeText(o)).join('」「') + '」重叠，请调整或换班。' })) : null,
            A2.kv([['人员', staffOf(x.staffId).name + '（' + staffOf(x.staffId).role + '）'], ['日期', d + '（' + DAYNAME[S.off] + '）'], ['时间', timeText(x) + '，共 ' + (x.to - x.from) + ' 小时'], ['类型', x.kind], ['名称', x.title], ['确认状态', x.needConfirm ? P2.badge('待本人确认', 'warn') : P2.badge('已确认', 'ok')]]), acts);
        });
        const aud = box(() => P2.mini([{ title: '时间', cls: 'c', render: (a) => md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }], B.db.audit.filter((a) => a.target.startsWith('排班 ') && a.action.includes('「' + (sh() || {}).title + '」')), '还没有这个班次的操作记录'));
        A2.detail({ title: '班次详情：' + sh().title, size: 'sm', tabs: [{ id: 'info', label: '概况', node: info }, { id: 'audit', label: '操作记录', node: aud }] });
      }

      /* ---------- 批量复制到下一天 ---------- */
      async function copyNext() {
        const from = day(), to = dAdd(from, 1), src = shifts(from), conf = new Set(conflictsOf(src).flat());
        if (!src.length) return UI.toast(DAYNAME[S.off] + '没有班次可以复制', { kind: 'bad' });
        const picks = new Map(src.map((x) => [x.id, !conf.has(x)]));
        const list = h('div.p2-picklist', { role: 'group', 'aria-label': '要复制的班次' }, src.map((x) => h('label.p2-pick', {}, h('input', { type: 'checkbox', checked: picks.get(x.id), on: { change: (e) => picks.set(x.id, e.target.checked) } }), h('span.grow', {}, h('b', { text: staffOf(x.staffId).name }), ' ' + x.title + ' ' + timeText(x)), conf.has(x) ? P2.badge('有冲突', 'bad') : x.needConfirm ? P2.badge('待确认', 'warn') : null)));
        const v = await UI.dialog({ title: '复制到' + (S.off === -1 ? '今天' : '明天') + '（' + md(to) + '）', size: 'sm', body: h('div.stack.p2-dlg', {}, h('p', { text: '勾选要复制的班次。有冲突的默认不勾；对方当天已有重叠安排的会被跳过并说明原因。' }), list), actions: [{ label: '取消', value: null }, { label: '开始复制', kind: 'primary', value: 'ok' }] });
        if (v !== 'ok') return;
        const r = await P2.act(() => { if (ctx.scene === 'copy-fail') P2.fail('复制失败：' + md(to) + ' 的排班已经被锁定，不能再修改'); }, 500);
        if (!r.ok) return;
        let ok = 0; const fails = [], target = shifts(to);
        src.filter((x) => picks.get(x.id)).forEach((x) => {
          const c = { staffId: x.staffId, from: x.from, to: x.to }, same = target.find((o) => o.staffId === c.staffId && o.from === c.from && o.to === c.to), clash = target.find((o) => o.staffId === c.staffId && overlap(o, c));
          if (same) return fails.push({ name: staffOf(x.staffId).name + ' ' + x.title, reason: md(to) + ' 已有同样的班次' });
          if (clash) return fails.push({ name: staffOf(x.staffId).name + ' ' + x.title, reason: md(to) + ' 已有「' + clash.title + '」' + timeText(clash) + '，时间重叠' });
          target.push({ id: ++B.db.shiftSeq, staffId: x.staffId, from: x.from, to: x.to, title: x.title, kind: x.kind, needConfirm: x.kind === '会议', note: '' }); ok++;
        });
        A2.audit('schedule:edit', '批量复制 ' + md(from) + ' 的班次到 ' + md(to) + '（成功 ' + ok + ' 个，跳过 ' + fails.length + ' 个）', '排班 ' + to);
        await P2.report('复制排班结果', ok, fails);
        if (ok) { S.off += 1; draw(); }
      }

      const copyBtn = h('button.btn', { type: 'button', on: { click: copyNext } }, UI.icon('copy', 'icon--sm'), h('span', { text: '复制排班' }));
      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '排班' }), h('p.muted', { text: '横条是班次与会议，红色是冲突，橙色等本人确认，虚线是空闲' })), h('div.actions', {}, segEl, copyBtn, h('button.btn.btn--primary', { type: 'button', on: { click: () => addShift() } }, UI.icon('plus', 'icon--sm'), h('span', { text: '新增班次' })))),
        sumEl, h('section', { 'aria-label': '排班泳道' }, lanesHost, h('div.legend', { style: { marginTop: 'var(--s-3)' } }, h('span', {}, h('i', { style: { background: 'var(--brand)' } }), '正常班次'), h('span', {}, h('i', { style: { background: 'var(--bad)' } }), '时间冲突'), h('span', {}, h('i', { style: { background: 'var(--warn)' } }), '待本人确认'), h('span', {}, h('i', { style: { background: 'none', border: '1px dashed var(--line-strong)' } }), '空闲'))), listEl);
      return A2.load(() => { draw(); return P2.settled(page); });
    },
  };
})();
