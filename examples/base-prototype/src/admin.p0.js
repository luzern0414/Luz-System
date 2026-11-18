/* 后台原型的共用件（页面文件 admin.p1.js 起都用它）：当前账号与权限、审计、列表（筛选条、状态标签页、表格、分页、批量）、表单、详情对话框、导出。
   页面通过 window.PAGES2[id] = { title, group, layout, reason, scenes, render(ctx) } 注册；render 返回节点或 Promise；ctx 见 UI.app。*/
(function () {
  'use strict';
  const { h, $, $$ } = UI;
  const A2 = (window.A2 = {});
  window.PAGES2 = window.PAGES2 || {};
  A2.h = h;

  /* ---------- 账号与权限：角色 A 超级管理员、F 前台；页面用 A2.can('动作') 决定按钮 ---------- */
  A2.accounts = { A: { role: 'A', name: '王海燕', user: 'admin', label: '超级管理员' }, F: { role: 'F', name: '陈晓燕', user: 'front1', label: '前台' } };
  A2.role = () => UI.state.role || 'A';
  A2.me = () => A2.accounts[A2.role()];
  const DENY = { F: ['export', 'cancel', 'disable', 'adjust', 'coupon', 'cardConfig', 'issue', 'delete', 'config'] };
  A2.can = (action) => !(DENY[A2.role()] || []).includes(action);

  /* ---------- 审计：每个写操作都留一条，操作人是当前账号 ---------- */
  A2.audit = (code, action, target, result) => { const db = B.db; db.audit.unshift({ id: db.audit.length + 1, at: B.fmt(B.NOW()), actor: A2.me().name, code, action, target, result: result || '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) }); };
  A2.money = (cents) => UI.money(cents);
  A2.status = (map, key) => { const m = map[key] || ['—', '']; return h('span.badge' + (m[1] ? '.badge--' + m[1] : ''), { text: m[0] }); };

  /* ---------- 网络：把取数包起来，弱网多等、断网抛错，页面 catch 后显示重试 ---------- */
  A2.load = (fn, ms) => UI.request(fn, ms);

  /* ---------- 状态块 ---------- */
  A2.empty = (text, action) => h('div.empty', {}, UI.icon('search', 'icon--lg'), h('p', { text }), action || null);
  A2.error = (retry) => h('div.empty', { role: 'alert' }, UI.icon('warn', 'icon--lg'), h('p', { text: '加载失败，请稍后再试' }), h('button.btn', { type: 'button', text: '重试', on: { click: retry } }));
  /** 页面按场景返回统一的状态：loading / empty / error 由这里处理，正常与页面自己的场景返回 null 让页面继续 */
  A2.sceneView = (ctx, emptyText) => {
    if (ctx.scene === 'loading') return h('div.page', {}, UI.skeleton(8));
    if (ctx.scene === 'error') return h('div.page', {}, A2.error(() => { UI.state.scene[ctx.id] = 'normal'; ctx.refresh(); }));
    if (ctx.scene === 'empty') return h('div.page', {}, A2.empty(emptyText || '暂无数据'));
    return null;
  };

  /* ---------- 表格：A2.table({columns:[{key,title,cls,render(row)}], rows, size, selectable, onSelect, empty, caption}) → {el, setRows(rows), selected()} ----------
     表头 sticky，行悬停，数字右对齐用 cls:'r'，分页 20 条（10、20、50），窄容器里每行变卡片（data-label 取列名） */
  A2.table = function (o) {
    let rows = o.rows || [], page = 1, size = o.size || 20; const sel = new Set();
    const wrap = h('div.table-wrap'), foot = h('div.row.between.wrap', { style: { padding: 'var(--s-3) var(--s-4)', borderTop: '1px solid var(--line)' } });
    const paint = () => {
      const total = rows.length, pages = Math.max(1, Math.ceil(total / size)); page = Math.min(page, pages);
      const slice = rows.slice((page - 1) * size, page * size);
      wrap.replaceChildren();
      if (!total) { wrap.append(A2.empty(o.empty || '没有符合条件的数据')); foot.replaceChildren(); return; }
      const countText = () => '共 ' + total + ' 条' + (sel.size ? '，已选 ' + sel.size + ' 条' : ''), countEl = h('span.muted.num', { text: countText() });
      const headBox = o.selectable ? h('input', { type: 'checkbox', 'aria-label': '全选本页', on: { change: (e) => { slice.forEach((r) => { if (e.target.checked) sel.add(r); else sel.delete(r); }); sync(); body.querySelectorAll('input').forEach((i, k) => { i.checked = sel.has(slice[k]); }); o.onSelect && o.onSelect([...sel]); } } }) : null;
      const sync = () => { if (headBox) { const n = slice.filter((r) => sel.has(r)).length; headBox.checked = n > 0 && n === slice.length; headBox.indeterminate = n > 0 && n < slice.length; } countEl.textContent = countText(); };
      const head = h('tr', {}, o.selectable ? h('th', { style: { width: '44px' } }, headBox) : null, o.columns.map((c) => h('th', { class: c.cls || '', text: c.title })));
      const body = h('tbody', {}, slice.map((r) => h('tr', { class: o.rowClass ? o.rowClass(r) : '' }, o.selectable ? h('td', {}, h('input', { type: 'checkbox', checked: sel.has(r), 'aria-label': '选择此行', on: { change: (e) => { e.target.checked ? sel.add(r) : sel.delete(r); sync(); o.onSelect && o.onSelect([...sel]); } } })) : null, o.columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h('td', { class: (c.cls || '') + (c.ell ? ' ell' : ''), 'data-label': c.title, title: c.ell && typeof v === 'string' ? v : null }, v == null || v === '' ? '—' : v); }))));
      wrap.append(h('table.table', { 'aria-label': o.caption || '列表' }, h('thead', {}, head), body));
      sync();
      foot.replaceChildren(countEl, h('div.row', {},
        h('select.select', { 'aria-label': '每页条数', style: { width: '112px' }, on: { change: (e) => { size = +e.target.value; page = 1; paint(); } } }, [10, 20, 50].map((n) => h('option', { value: n, selected: n === size, text: n + ' 条/页' }))),
        h('button.btn.btn--sm.btn--icon', { type: 'button', 'aria-label': '上一页', disabled: page <= 1, on: { click: () => { page--; paint(); } } }, UI.icon('left', 'icon--sm')), h('span.num', { text: page + ' / ' + pages }),
        h('button.btn.btn--sm.btn--icon', { type: 'button', 'aria-label': '下一页', disabled: page >= pages, on: { click: () => { page++; paint(); } } }, UI.icon('right', 'icon--sm'))));
    };
    paint();
    const el = h('div', {}, wrap, foot); el.style.cssText = 'background:var(--surface);border-radius:var(--r-md);box-shadow:var(--e1);overflow:hidden';
    wrap.style.boxShadow = 'none';
    return { el, setRows(r) { rows = r; page = 1; sel.clear(); paint(); }, selected: () => [...sel], clear() { sel.clear(); paint(); } };
  };

  /* ---------- 表单：A2.form([{name,label,type,required,options,hint,value,validate(v)→错误文字}]) → {el, values(), validate()} ---------- */
  A2.form = function (fields, o) {
    const refs = {};
    const el = h('div.stack', {}, fields.map((f) => {
      const id = 'f-' + f.name + Math.random().toString(36).slice(2, 5), err = h('div.err', { role: 'alert' });
      let input;
      if (f.type === 'select') input = h('select.select', { id, 'aria-label': f.label }, (f.options || []).map((x) => h('option', { value: x.v ?? x, selected: (x.v ?? x) === f.value, text: x.l ?? x })));
      else if (f.type === 'textarea') input = h('textarea.textarea', { id, rows: 3, maxlength: f.max, 'aria-label': f.label, placeholder: f.placeholder || '', text: f.value || '' });
      else if (f.type === 'switch') input = h('input.switch', { id, type: 'checkbox', role: 'switch', checked: !!f.value });
      else input = h('input.input', { id, type: f.type || 'text', value: f.value == null ? '' : f.value, maxlength: f.max, placeholder: f.placeholder || '', 'aria-label': f.label, inputmode: f.type === 'number' ? 'decimal' : null });
      input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
      refs[f.name] = { input, err, f };
      return h('div.field', {}, h('label', { for: id }, f.label, f.required ? h('b', { style: { color: 'var(--bad-ink)' }, text: ' *' }) : null), input, f.hint ? h('div.hint', { text: f.hint }) : null, err);
    }));
    const val = (r) => (r.f.type === 'switch' ? r.input.checked : r.f.type === 'number' ? (r.input.value.trim() === '' ? '' : Number(r.input.value)) : r.input.value.trim());
    const api = {
      el, values: () => Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, val(r)])),
      validate() {
        let ok = true;
        Object.values(refs).forEach((r) => { const v = val(r); let m = ''; if (r.f.required && (v === '' || v == null)) m = '请填写' + r.f.label; else if (r.f.validate && v !== '') m = r.f.validate(v) || ''; if (m) { ok = false; r.err.textContent = m; r.input.setAttribute('aria-invalid', 'true'); } });
        if (!ok) { const first = Object.values(refs).find((r) => r.err.textContent); first && first.input.focus(); }
        return ok;
      },
      error(name, msg) { refs[name].err.textContent = msg; refs[name].input.setAttribute('aria-invalid', 'true'); },
    };
    return api;
  };

  /* ---------- 对话框：表单、详情、危险确认 ---------- */
  /** A2.edit({title, fields, submit(values)→Promise|void, ok:'保存'}) → Promise<保存后的值|null>；提交时按钮转圈，失败留在对话框里 */
  A2.edit = (o) => { const f = A2.form(o.fields); let result = null; return UI.dialog({ title: o.title, size: o.size, body: f.el, actions: [{ label: '取消', value: null }, { label: o.ok || '保存', kind: 'primary', value: 'ok', on: async () => { if (!f.validate()) return false; try { await UI.request(null, 400); result = f.values(); if (o.submit) { const r = await o.submit(result); if (r === false) return false; } } catch (e) { UI.toast(e.offline ? '网络不太稳定，请稍后再试' : String(e.message || '保存失败'), { kind: 'bad' }); return false; } } }] }).then((v) => (v === 'ok' ? result : null)); };
  /** A2.danger('一句话说清对象、数量和后果', {ok:'确认停用'}) → Promise<boolean> */
  A2.danger = (text, o) => UI.confirm(text, Object.assign({ danger: true, title: '请确认' }, o));
  /** 需要原因的操作：原因必填，取消订单、撤销核销、拒绝退款都用它 */
  A2.reason = (title, lead) => { const f = A2.form([{ name: 'reason', label: '原因', type: 'textarea', required: true, max: 200 }]); let r = null; return UI.dialog({ title, size: 'sm', body: h('div.stack', {}, lead ? h('p', { text: lead }) : null, f.el), actions: [{ label: '取消', value: null }, { label: '确定', kind: 'primary', value: 'ok', on: () => { if (!f.validate()) return false; r = f.values().reason; } }] }).then((v) => (v === 'ok' ? r : null)); };
  /** 详情对话框：A2.detail({title, tabs:[{id,label,node}], actions}) */
  A2.detail = (o) => {
    const tabs = h('div.tabs', { role: 'tablist' }), panels = h('div', { style: { paddingTop: 'var(--s-4)' } }), uid = 'dt' + Math.random().toString(36).slice(2, 5);
    o.tabs.forEach((t, i) => { tabs.append(h('button', { type: 'button', role: 'tab', id: uid + 't' + i, 'aria-controls': uid + 'p' + i, 'aria-selected': String(i === 0), tabindex: i ? -1 : 0 }, t.label)); panels.append(h('div', { role: 'tabpanel', id: uid + 'p' + i, hidden: i !== 0, 'aria-labelledby': uid + 't' + i }, t.node)); });
    UI.tabs(tabs);
    return UI.dialog({ title: o.title, size: o.size || 'wide', body: h('div', {}, o.tabs.length > 1 ? tabs : null, panels), actions: o.actions || [{ label: '关闭', value: null }] });
  };
  A2.kv = (pairs) => h('dl', { style: { display: 'grid', gridTemplateColumns: 'minmax(96px, 160px) 1fr', gap: 'var(--s-2) var(--s-4)', margin: 0 } }, pairs.map(([k, v]) => [h('dt.muted', { text: k }), h('dd', { style: { margin: 0 } }, v == null || v === '' ? '—' : v)]));

  /* ---------- 导出：往导出任务里加一条，成功提示中文文件名 ---------- */
  A2.export = async (name, kind, rows) => {
    if (!A2.can('export')) return UI.toast('当前角色没有导出权限', { kind: 'bad' });
    try { await UI.request(null, 600); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
    const file = name + '_' + B.fmt(B.NOW()).slice(0, 10) + '.xlsx';
    B.db.exportTasks.unshift({ id: B.db.exportTasks.length + 1, name: file, kind, rows, status: 'DONE', at: B.fmt(B.NOW()), by: A2.me().name });
    A2.audit('export', '导出' + kind, file);
    UI.toast('已导出 ' + file);
  };
  /** 标签页（带数量）：A2.statusTabs([{id,label,count}], value, onChange) */
  A2.statusTabs = (list, value, onChange) => h('div.tabs', { role: 'tablist', 'aria-label': '状态' }, list.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(t.id === value), on: { click: () => onChange(t.id) } }, t.label, h('span.count', { text: t.count }))));
  A2.search = (placeholder, onInput) => { let tm; const i = h('input.input.input--search', { type: 'search', placeholder, 'aria-label': placeholder, style: { width: '240px' }, on: { input: () => { clearTimeout(tm); tm = setTimeout(() => onInput(i.value.trim()), 250); } } }); return i; };
  A2.heading = (title, sub, actions) => h('div.page-head', {}, h('div', {}, h('h2', { text: title }), sub ? h('p.muted', { text: sub }) : null), h('div.actions', {}, actions || []));
})();
