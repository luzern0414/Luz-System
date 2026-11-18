/* 第一组页面（r1）续：商品、素材库，都是“主区加右侧窄栏”。共用件在 admin.p1.js 的 window.P1。 */
(function () {
  'use strict';
  const { h } = UI;
  const money = (c) => UI.money(c), short = (s) => P1.short(s), dayOf = (s) => P1.dayOf(s), nowStr = () => P1.nowStr();
  const bad = (t) => UI.toast(t, { kind: 'bad' });
  const clone = (x) => JSON.parse(JSON.stringify(x));
  UI.icons.grip = UI.icons.drag;

  /* ====================== 商品 ====================== */
  const LOW = 10, WARN = 40, VIEW = { v: 'list' };
  const catName = (id) => (B.CATS.find((c) => c.id === id) || { name: '未分类' }).name;
  const PST = { ON: ['在售', 'ok'], OFF: ['已下架', ''] };
  const stockTag = (n, label) => (n <= 0 ? h('span.badge.badge--bad', { text: '已售罄' }) : n < LOW ? h('span.badge.badge--bad', { text: '仅剩 ' + n }) : h('span.num' + (label ? '.muted' : ''), { text: (label || '') + n }));
  const priceNode = (p) => h('span.p1-price', {}, h('b.num', { text: money(p.price) }), p.orig > p.price ? h('s.muted.num', { text: money(p.orig) }) : null);
  const usersOf = (p) => B.db.orders.filter((o) => o.items.some((i) => i.pid === p.id));
  const specText = (p) => (p.specs && p.specs.length ? p.specs.map((g) => g.name + '：' + g.opts.map((o) => o.n + (o.d ? '（+' + money(o.d) + '）' : '')).join('、')).join('；') : '没有规格');
  /* 演示数据里没有上下架记录：第一次进来补三条真实商品名的动态，写进审计，商品页和操作日志都看得到 */
  P1.seedProducts = () => {
    const db = B.db; if (db._p1seed) return; db._p1seed = true;
    const day = (n) => dayOf(B.fmt(new Date(B.NOW().getTime() - n * 864e5)));
    [[1, '周敏', 'product:publish', '下架商品', '梅菜扣肉饭', '18:20'], [3, '周敏', 'product:publish', '上架商品', '西式早餐', '09:05'], [5, '王海燕', 'product:edit', '调整价格', '招牌牛腩饭', '14:42']].forEach(([n, who, code, action, name, t], i) => db.audit.push({ id: db.audit.length + 1 + i, at: day(n) + ' ' + t, actor: who, code, action, target: '商品 ' + name, result: '成功', ip: '10.0.0.8', trace: 'tr' + (7000000 + i).toString(16) }));
    db.audit.sort((a, b) => (a.at < b.at ? 1 : -1));
  };

  /** 规格编辑器：规格组（如份量、口味）下面有选项（名称、加价）；返回 {el, get(), validate()}，加价按元输入，取值转成分 */
  P1.specEditor = (specs) => {
    const st = clone(specs || []).map((g) => ({ name: g.name, opts: g.opts.map((o) => ({ n: o.n, d: o.d / 100 })) }));
    const root = h('div.stack.p1-spec'); let errs = [];
    const paint = () => {
      root.replaceChildren(); errs = [];
      if (!st.length) root.append(h('p.muted', { text: '还没有规格。顾客下单时直接买这件商品；需要选份量、口味时再添加规格组。' }));
      st.forEach((g, gi) => {
        const ge = h('div.err', { role: 'alert' }), oe = [];
        const box = h('div.p1-spec-g', {}, h('div.row', {}, h('div.field.grow', {}, h('label', { for: 'p1sg' + gi, text: '规格组名称' }), h('input.input', { id: 'p1sg' + gi, value: g.name, maxlength: 8, placeholder: '如：份量、口味', on: { input: (e) => { g.name = e.target.value.trim(); ge.textContent = ''; } } })), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '删除规格组', 'aria-label': '删除规格组 ' + (g.name || gi + 1), on: { click: () => { st.splice(gi, 1); paint(); } } })), ge,
          h('div.p1-spec-head.muted', {}, h('span', { text: '选项名称' }), h('span', { text: '加价（元）' }), h('span')),
          g.opts.map((o, oi) => { const e = h('div.err', { role: 'alert' }); oe.push(e); return h('div', {}, h('div.p1-spec-o', {}, h('input.input', { value: o.n, maxlength: 8, 'aria-label': (g.name || '规格组 ' + (gi + 1)) + ' 选项 ' + (oi + 1) + ' 名称', placeholder: '如：加大', on: { input: (ev) => { o.n = ev.target.value.trim(); e.textContent = ''; } } }), h('input.input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: o.d, 'aria-label': (g.name || '规格组 ' + (gi + 1)) + ' 选项 ' + (oi + 1) + ' 加价（元）', on: { input: (ev) => { o.d = ev.target.value === '' ? NaN : Number(ev.target.value); e.textContent = ''; } } }), h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '删除选项 ' + (o.n || oi + 1), on: { click: () => { g.opts.splice(oi, 1); paint(); } } }, UI.icon('trash', 'icon--sm'))), e); }),
          h('div.row', {}, h('button.btn.btn--sm', { type: 'button', text: '添加选项', disabled: g.opts.length >= 6, on: { click: () => { g.opts.push({ n: '', d: 0 }); paint(); } } }), g.opts.length >= 6 ? h('span.muted', { text: '每组最多 6 个选项' }) : null));
        errs.push({ ge, oe }); root.append(box);
      });
      root.append(h('div.row', {}, h('button.btn.btn--sm', { type: 'button', text: '添加规格组', disabled: st.length >= 3, on: { click: () => { st.push({ name: '', opts: [{ n: '', d: 0 }] }); paint(); } } }), st.length >= 3 ? h('span.muted', { text: '最多 3 个规格组' }) : null));
    };
    paint();
    return {
      el: root, get: () => st.map((g) => ({ name: g.name, opts: g.opts.map((o) => ({ n: o.n, d: Math.round((o.d || 0) * 100) })) })),
      validate() {
        let ok = true; const names = new Set();
        st.forEach((g, gi) => {
          const { ge, oe } = errs[gi];
          if (!g.name) { ge.textContent = '请填写规格组名称'; ok = false; } else if (names.has(g.name)) { ge.textContent = '规格组名称重复：' + g.name; ok = false; } else if (!g.opts.length) { ge.textContent = '每个规格组至少要有一个选项'; ok = false; }
          names.add(g.name); const on = new Set();
          g.opts.forEach((o, oi) => { let m = ''; if (!o.n) m = '请填写选项名称'; else if (on.has(o.n)) m = '选项名称重复：' + o.n; else if (isNaN(o.d) || o.d < 0) m = '加价要填 0 或更大的数'; else if (!P1.isMoney(o.d)) m = '加价最多两位小数'; if (m) { oe[oi].textContent = m; ok = false; } on.add(o.n); });
        });
        if (!ok) { const first = root.querySelector('.err:not(:empty)'); first && first.closest('div').querySelector('input') && first.parentElement.querySelector('input').focus(); }
        return ok;
      },
    };
  };

  window.PAGES2.products = {
    title: '商品', group: '商品与营销',
    layout: '主区加右侧窄栏',
    reason: '商品页的主角是商品本身：左边三分之二放可切换卡片或列表的商品清单，筛选、批量上下架都在这里做；右边窄栏固定不动，放库存预警、热销榜、最近上下架这些“该补货、卖得怎么样、谁动过”的辅助信息',
    scenes: [
      { id: 'nodata', label: '所选分类下没有商品' },
      { id: 'save-conflict', label: '保存失败：商品刚被同事修改过' },
      { id: 'publish-fail', label: '上下架失败：网络异常' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有商品'); if (early) return early;
      P1.seedProducts();
      const S = { cat: 'all', status: '', stock: '', q: '', sort: 'sort' }, touched = new Set();
      const src = () => (ctx.scene === 'nodata' ? [] : B.db.products);
      let rows = [], shown = -1; const checked = new Set();
      const page = h('section.page.p1-products');
      page.append(A2.heading('商品', '管理在售商品、价格与库存；上下架会立刻影响顾客端', [
        A2.can('export') ? h('button.btn', { type: 'button', text: '导出商品', on: { click: () => doExport() } }) : null,
        h('button.btn', { type: 'button', text: '分类管理', on: { click: () => catDlg() } }),
        h('button.btn.btn--primary', { type: 'button', text: '新增商品', on: { click: () => editDlg(null) } })]));

      const tabsBox = h('div.p1-tabs'), sumEl = h('span.muted.num'), batch = h('div.p1-batch', { hidden: true, role: 'region', 'aria-label': '批量操作' });
      const seg = h('div.seg', { role: 'group', 'aria-label': '视图' }, [['list', '列表'], ['card', '卡片']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(VIEW.v === v), text: l, on: { click: (e) => { VIEW.v = v; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); checked.clear(); drawBody(); paintBatch(); } } })));
      const mk = (label, key, opts, w) => h('select.select', { 'aria-label': label, style: { width: w + 'px' }, on: { change: (e) => { S[key] = e.target.value; refresh(); } } }, opts.map(([v, l]) => h('option', { value: v, text: l, selected: S[key] === v })));
      const search = A2.search('商品名称或简介', (v) => { S.q = v; refresh(); });
      const selStatus = mk('上架状态', 'status', [['', '全部状态'], ['ON', '在售'], ['OFF', '已下架']], 132), selStock = mk('库存', 'stock', [['', '全部库存'], ['low', '库存低于 ' + LOW], ['warn', '库存低于 ' + WARN], ['zero', '已售罄']], 148);
      const filters = h('div.row.wrap.p1-filters', {}, selStatus, selStock, mk('排序', 'sort', [['sort', '按排序值'], ['sales', '销量从高到低'], ['price', '价格从低到高'], ['stock', '库存从少到多']], 148), search);
      const body = h('div.p1-pbody');
      const tbl = A2.table({
        selectable: true, caption: '商品列表', rows: [], empty: '没有符合条件的商品', rowClass: (r) => 'p1-p' + r.id, onSelect: (l) => { checked.clear(); l.forEach((p) => checked.add(p.id)); paintBatch(); },
        columns: [
          { title: '商品', render: (p) => h('div.p1-pname', {}, P1.thumb(p.img, 'p1-thumb--sm', p.name), h('div', {}, h('button.p1-link', { type: 'button', text: p.name, on: { click: () => detail(p) } }), h('div.muted', { text: (p.tags || []).join('、') || '—' }))) },
          { title: '分类', render: (p) => catName(p.cat) },
          { title: '价格', cls: 'r', render: priceNode },
          { title: '库存', cls: 'r', render: (p) => stockTag(p.stock) },
          { title: '销量', cls: 'r', render: (p) => p.sales },
          { title: '排序', cls: 'r', render: (p) => p.sort },
          { title: '上架', render: (p) => toggle(p) },
          { title: '操作', cls: 'c', render: (p) => acts(p) },
        ],
      });
      const main = h('div.main', {}, h('div.card.card--tight.stack', {}, h('div.row.between.wrap', {}, h('h2', { text: '商品清单' }), h('div.row.wrap', {}, sumEl, seg)), tabsBox, filters), batch, body);
      const rail = h('aside.rail', { 'aria-label': '库存预警、热销榜和最近上下架' });
      page.append(h('div.l-rail', {}, main, rail));

      const toggle = (p) => { const sw = h('input.switch', { type: 'checkbox', role: 'switch', checked: p.status === 'ON', 'aria-label': (p.status === 'ON' ? '下架 ' : '上架 ') + p.name, on: { change: async () => { const want = sw.checked; sw.checked = !want; await publish([p], want ? 'ON' : 'OFF'); } } }); return h('label.row.p1-sw', {}, sw, h('span', { text: p.status === 'ON' ? '在售' : '已下架' })); };
      function acts(p) {
        const box = h('div.p1-acts'), more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + p.name }, UI.icon('more', 'icon--sm'));
        box.append(h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '编辑', on: { click: () => editDlg(p) } }), more);
        P1.menu(more, [{ label: '查看详情', icon: 'list', on: () => detail(p) }, { label: '编辑规格', icon: 'tag', on: () => specDlg(p) }, { label: '补货', icon: 'plus', on: () => restock(p) }, { label: '改分类', icon: 'edit', on: () => moveCat([p]) }]);
        return box;
      }

      /* ---- 数据 ---- */
      function calc() {
        const q = S.q.toLowerCase();
        const base = src().filter((p) => (!S.status || p.status === S.status) && (!S.stock || (S.stock === 'low' ? p.stock < LOW : S.stock === 'warn' ? p.stock < WARN : p.stock <= 0)) && (!q || p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q)));
        const counts = { all: base.length }; base.forEach((p) => { counts[p.cat] = (counts[p.cat] || 0) + 1; });
        const cmp = { sort: (a, b) => a.sort - b.sort || b.id - a.id, sales: (a, b) => b.sales - a.sales, price: (a, b) => a.price - b.price, stock: (a, b) => a.stock - b.stock }[S.sort];
        return { base, counts, rows: base.filter((p) => S.cat === 'all' || p.cat === S.cat).sort(cmp) };
      }
      function refresh(keep) {
        const c = calc(); rows = c.rows;
        if (S.cat !== 'all' && !B.CATS.some((x) => x.id === S.cat)) S.cat = 'all';
        tabsBox.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: c.counts.all }].concat(B.CATS.map((x) => ({ id: x.id, label: x.name, count: c.counts[x.id] || 0 }))), S.cat, (id) => { S.cat = id; refresh(); }));
        const low = c.rows.filter((p) => p.stock < LOW).length;
        sumEl.textContent = '共 ' + c.rows.length + ' 个商品' + (low ? '，其中库存低于 ' + LOW + ' 的 ' + low + ' 个' : '');
        if (VIEW.v === 'list') { if (!body.contains(tbl.el)) drawBody(); else if (keep && shown === c.rows.length) tbl.clear(); else tbl.setRows(c.rows); } else drawBody();
        shown = c.rows.length;
        checked.clear(); paintBatch(); P1.sweep();
        if (touched.size) requestAnimationFrame(() => { touched.forEach((id) => P1.flash(page.querySelector('.p1-p' + id))); touched.clear(); });
      }
      function drawBody() {
        body.replaceChildren();
        if (VIEW.v === 'list') { body.append(tbl.el); tbl.setRows(rows); return; }
        if (!rows.length) { body.append(h('div.card', {}, A2.empty('没有符合条件的商品'))); return; }
        body.append(h('div.p1-pgrid', {}, rows.map(cardOf)));
      }
      function cardOf(p) {
        const cb = h('input', { type: 'checkbox', checked: checked.has(p.id), 'aria-label': '选择 ' + p.name, on: { change: (e) => { e.target.checked ? checked.add(p.id) : checked.delete(p.id); paintBatch(); } } }), more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + p.name }, UI.icon('more', 'icon--sm'));
        const el = h('article.p1-pcard.p1-p' + p.id + (p.status === 'OFF' ? '.is-off' : ''), {},
          h('div.p1-pcard-img', {}, P1.thumb(p.img, 'p1-thumb--lg', p.name), h('label.p1-pcard-cb', {}, cb), p.status === 'OFF' ? h('span.badge.p1-pcard-tag', { text: '已下架' }) : p.sales >= 300 ? h('span.badge.badge--brand.p1-pcard-tag', { text: '热销' }) : null),
          h('div.p1-pcard-b', {}, h('button.p1-link.p1-pcard-name', { type: 'button', text: p.name, on: { click: () => detail(p) } }), h('p.muted.p1-clamp', { text: p.desc || '暂无简介' }),
            h('div.row.between', {}, priceNode(p), stockTag(p.stock, '库存 ')), h('div.muted', { text: catName(p.cat) + ' · 销量 ' + p.sales })),
          h('div.p1-pcard-f', {}, h('button.btn.btn--sm', { type: 'button', text: '编辑', on: { click: () => editDlg(p) } }), h('button.btn.btn--sm' + (p.status === 'ON' ? '' : '.btn--soft'), { type: 'button', text: p.status === 'ON' ? '下架' : '上架', on: { click: () => publish([p], p.status === 'ON' ? 'OFF' : 'ON') } }), more));
        P1.menu(more, [{ label: '查看详情', icon: 'list', on: () => detail(p) }, { label: '编辑规格', icon: 'tag', on: () => specDlg(p) }, { label: '补货', icon: 'plus', on: () => restock(p) }, { label: '改分类', icon: 'edit', on: () => moveCat([p]) }]);
        return el;
      }
      function paintBatch() {
        batch.hidden = !checked.size; batch.replaceChildren(); if (!checked.size) return;
        const l = [...checked].map((id) => B.db.products.find((p) => p.id === id)).filter(Boolean);
        batch.append(h('span.num', { text: '已选 ' + l.length + ' 个商品' }), h('span.grow'), h('button.btn.btn--sm', { type: 'button', text: '批量上架', on: { click: () => publish(l, 'ON') } }), h('button.btn.btn--danger.btn--sm', { type: 'button', text: '批量下架', on: { click: () => publish(l, 'OFF') } }), h('button.btn.btn--sm', { type: 'button', text: '批量改分类', on: { click: () => moveCat(l) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '取消选择', on: { click: () => { checked.clear(); if (VIEW.v === 'list') tbl.clear(); else drawBody(); paintBatch(); } } }));
      }

      /* ---- 上下架：下架先确认影响；批量逐条报告 ---- */
      async function publish(list, to) {
        const verb = to === 'ON' ? '上架' : '下架', fit = list.filter((p) => p.status !== to), skip = list.filter((p) => p.status === to);
        if (!fit.length) { bad(list.length === 1 ? list[0].name + ' 已经是' + PST[to][0] : '选中的商品都已经是' + PST[to][0]); refresh(true); return false; }
        if (to === 'OFF') {
          const inCart = (B.db.cart || []).filter((c) => fit.some((p) => p.id === c.pid)).length;
          const names = fit.slice(0, 4).map((p) => '「' + p.name + '」').join('、') + (fit.length > 4 ? ' 等 ' + fit.length + ' 个商品' : '');
          const yes = await P1.dlg(() => A2.danger('将下架 ' + names + '。下架后顾客端不再显示，' + (inCart ? '购物车里的 ' + inCart + ' 件会标记失效、不能结算；' : '已在购物车里的会标记失效、不能结算；') + '已经下的订单不受影响，随时可以重新上架。', { title: '确认下架 ' + fit.length + ' 个商品', ok: '确认下架' }));
          if (!yes) { refresh(true); return false; }
        }
        if (!(await P1.net(400))) { refresh(true); return false; }
        if (ctx.scene === 'publish-fail') { bad(verb + '失败：网络异常，商品状态没有变化，请稍后再试'); refresh(true); return false; }
        fit.forEach((p) => { p.status = to; touched.add(p.id); A2.audit('product:publish', verb + '商品', '商品 ' + p.name); });
        refreshAll(); const badList = skip.map((p) => ({ label: p.name, why: '已经是' + PST[to][0] }));
        if (list.length === 1) UI.toast('已' + verb + '「' + list[0].name + '」'); else P1.report('批量' + verb, fit.length, badList);
        return true;
      }
      async function restock(p) {
        const v = await P1.dlg(() => A2.edit({ title: '补货：' + p.name, size: 'sm', ok: '确认补货', fields: [{ name: 'n', label: '补货数量（件）', type: 'number', required: true, value: 20, hint: '现有库存 ' + p.stock + ' 件，补货后加在现有库存上', validate: (x) => (!Number.isInteger(x) || x <= 0 ? '补货数量要填大于 0 的整数' : x > 9999 ? '一次最多补 9999 件' : '') }], submit: (vals) => { p.stock += vals.n; A2.audit('product:edit', '商品补货', '商品 ' + p.name + '，+' + vals.n); } }));
        if (v) { UI.toast('已补货 ' + v.n + ' 件，现有库存 ' + p.stock + ' 件'); touched.add(p.id); refreshAll(); }
      }
      async function moveCat(list) {
        const v = await P1.dlg(() => A2.edit({ title: list.length === 1 ? '改分类：' + list[0].name : '批量改分类（' + list.length + ' 个商品）', size: 'sm', ok: '确认修改', fields: [{ name: 'cat', label: '新分类', type: 'select', options: B.CATS.map((c) => ({ v: c.id, l: c.name })), value: list[0].cat }], submit: (vals) => { list.forEach((p) => { p.cat = vals.cat; touched.add(p.id); }); A2.audit('product:edit', '批量改分类', list.length + ' 个商品改到「' + catName(vals.cat) + '」'); } }));
        if (v) { UI.toast(list.length + ' 个商品已改到「' + catName(v.cat) + '」'); refreshAll(); }
      }
      async function specDlg(p) {
        const ed = P1.specEditor(p.specs); let out = null;
        const ok = await P1.dlg(() => UI.dialog({ title: '规格：' + p.name, size: 'wide', body: h('div.stack', {}, h('p.muted', { text: '顾客下单时选择规格；选项的加价会加在商品价格上，只影响之后的订单。' }), ed.el), actions: [{ label: '取消', value: null }, { label: '保存规格', kind: 'primary', value: 'ok', on: async () => { if (!ed.validate()) return false; if (!(await P1.net(400))) return false; out = ed.get(); } }] }));
        if (ok === 'ok' && out) { p.specs = out; A2.audit('product:edit', '修改商品规格', '商品 ' + p.name); UI.toast('规格已保存'); touched.add(p.id); refreshAll(); }
      }
      async function doExport() { if (!rows.length) return bad('当前筛选没有商品可导出'); await A2.export('商品_' + (S.cat === 'all' ? '全部分类' : catName(S.cat)), '商品', rows.length); }

      /* ---- 新增与编辑 ---- */
      async function editDlg(p) {
        const isNew = !p, cur = p || { name: '', cat: S.cat !== 'all' ? S.cat : ((B.CATS.find((c) => B.db.products.some((x) => x.cat === c.id)) || B.CATS[0] || {}).id), price: 0, orig: 0, desc: '', img: '', stock: 20, status: 'ON', specs: [], tags: [], sort: B.db.products.reduce((m, x) => Math.max(m, x.sort), 0) + 1 };
        let img = cur.img; const tags = new Set(cur.tags || []);
        const f = A2.form([
          { name: 'name', label: '商品名称', required: true, max: 60, value: cur.name, placeholder: '2 到 60 个字', validate: (v) => (v.length < 2 ? '名称至少 2 个字' : B.db.products.some((x) => x !== p && x.name === v) ? '已经有同名商品' : '') },
          { name: 'cat', label: '分类', type: 'select', options: B.CATS.map((c) => ({ v: c.id, l: c.name })), value: cur.cat },
          { name: 'sort', label: '排序（越小越靠前）', type: 'number', required: true, value: cur.sort, validate: (v) => (!Number.isInteger(v) || v < 0 ? '排序要填 0 或更大的整数' : '') },
          { name: 'price', label: '售价（元）', type: 'number', required: true, value: cur.price ? (cur.price / 100).toFixed(2) : '', validate: (v) => (v <= 0 ? '售价要大于 0' : !P1.isMoney(v) ? '金额最多两位小数' : v > 99999 ? '售价不能超过 99999 元' : '') },
          { name: 'orig', label: '划线价（元，选填）', type: 'number', value: cur.orig && cur.orig > cur.price ? (cur.orig / 100).toFixed(2) : '', hint: '比售价高才会在顾客端显示划线', validate: (v) => (v < 0 ? '划线价不能小于 0' : !P1.isMoney(v) ? '金额最多两位小数' : '') },
          { name: 'stock', label: '库存（件）', type: 'number', required: true, value: cur.stock, validate: (v) => (!Number.isInteger(v) || v < 0 ? '库存要填 0 或更大的整数' : v > 99999 ? '库存不能超过 99999' : '') },
          { name: 'on', label: '立即上架', type: 'switch', value: cur.status === 'ON' },
          { name: 'desc', label: '商品简介', type: 'textarea', max: 255, value: cur.desc, placeholder: '一两句话写清口味、做法或适合谁', validate: () => '' },
        ]);
        f.el.classList.add('p1-form'); [...f.el.children].forEach((c, i) => { if (i === 0 || i === 7) c.classList.add('p1-wide'); });
        /* 图片：从素材库的商品图里选 */
        const pickBox = h('div.p1-picks', { role: 'group', 'aria-label': '商品图片' }), pickHint = h('div.hint.muted');
        const files = B.db.files.filter((x) => x.img);
        const paintPick = () => {
          pickBox.replaceChildren(h('button.p1-pick.p1-pick--none', { type: 'button', 'aria-pressed': String(!img), title: '不使用图片', on: { click: () => { img = ''; paintPick(); } } }, UI.icon('x'), h('span', { text: '无图片' })), ...files.map((x) => h('button.p1-pick', { type: 'button', 'aria-pressed': String(img === x.img), title: x.name, 'aria-label': '选择素材 ' + x.name, on: { click: () => { img = x.img; paintPick(); } } }, h('img', { src: x.img, alt: '', loading: 'lazy' }))));
          const other = img && B.db.products.find((x) => x !== p && x.img === img);
          pickHint.textContent = img ? (other ? '提示：这张图也被「' + other.name + '」使用' : '已选择：' + (files.find((x) => x.img === img) || {}).name) : '没有图片时，顾客端显示默认占位图';
        };
        paintPick();
        /* 标签 */
        const tagBox = h('div.p1-tags', { role: 'group', 'aria-label': '商品标签' }), tagIn = h('input.input', { maxlength: 6, placeholder: '自定义标签，最多 6 个字', 'aria-label': '自定义标签', style: { width: '200px' } }), tagErr = h('div.err', { role: 'alert' });
        const paintTags = () => { tagBox.replaceChildren(...[...new Set(['新品', '招牌', '热销', '限量', '微辣'].concat([...tags]))].map((t) => h('button.p1-tag', { type: 'button', 'aria-pressed': String(tags.has(t)), text: t, on: { click: () => { tags.has(t) ? tags.delete(t) : tags.size < 5 ? tags.add(t) : bad('最多 5 个标签'); paintTags(); } } }))); };
        paintTags();
        const addTag = () => { const v = tagIn.value.trim(); if (!v) return; if (tags.size >= 5) { tagErr.textContent = '最多 5 个标签'; return; } tags.add(v); tagIn.value = ''; tagErr.textContent = ''; paintTags(); };
        tagIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
        const ed = P1.specEditor(cur.specs);
        const sec = (t, hint, ...kids) => h('section.p1-sec', {}, h('div.row.between.wrap', {}, h('h3', { text: t }), hint ? h('span.muted', { text: hint }) : null), ...kids);
        const bodyEl = h('div.stack-lg', {}, f.el, sec('商品图片', '来自素材库的商品图，共 ' + files.length + ' 张', pickBox, pickHint), sec('标签', '最多 5 个', tagBox, h('div.row.wrap', {}, tagIn, h('button.btn', { type: 'button', text: '添加', on: { click: addTag } })), tagErr), sec('规格', '选填', ed.el));
        let saved = null;
        await P1.dlg(() => UI.dialog({ title: isNew ? '新增商品' : '编辑商品：' + cur.name, size: 'wide', body: bodyEl, actions: [{ label: '取消', value: null }, { label: isNew ? '创建商品' : '保存修改', kind: 'primary', value: 'ok', on: async () => {
          const okF = f.validate(), okS = ed.validate(); if (!okF || !okS) return false;
          const v = f.values(), price = P1.parseYuan(v.price), orig = v.orig === '' ? 0 : P1.parseYuan(v.orig);
          if (orig && orig < price) { f.error('orig', '划线价要比售价高，不想显示划线就留空'); return false; }
          if (!isNew && price !== cur.price) { const yes = await P1.dlg(() => A2.danger('「' + cur.name + '」的售价将从 ' + money(cur.price) + ' 改为 ' + money(price) + '。只影响之后下的订单，已经下的订单价格不变。', { title: '确认改价', ok: '确认改价' })); if (!yes) return false; }
          if (!(await P1.net(500))) return false;
          if (ctx.scene === 'save-conflict') { bad('保存失败：这个商品刚被其他同事修改过。请关闭后重新打开再改，你填的内容还在，可以先复制保存'); return false; }
          const patch = { name: v.name, cat: v.cat, sort: v.sort, price, orig: orig || price, stock: v.stock, status: v.on ? 'ON' : 'OFF', desc: v.desc, img, tags: [...tags], specs: ed.get() };
          if (isNew) { saved = Object.assign({ id: B.db.products.reduce((m, x) => Math.max(m, x.id), 0) + 1, sales: 0 }, patch); B.db.products.push(saved); }
          else { const changed = []; if (price !== cur.price) changed.push('价格 ' + money(cur.price) + ' → ' + money(price)); if (v.stock !== cur.stock) changed.push('库存 ' + cur.stock + ' → ' + v.stock); if (patch.status !== cur.status) changed.push(patch.status === 'ON' ? '上架' : '下架'); Object.assign(cur, patch); saved = cur; if (changed.length) A2.audit('product:edit', '编辑商品', '商品 ' + cur.name + '：' + changed.join('，')); else A2.audit('product:edit', '编辑商品', '商品 ' + cur.name); }
          if (isNew) A2.audit('product:edit', '新增商品', '商品 ' + v.name + '，售价 ' + money(price));
        } }] }));
        if (saved) { UI.toast(isNew ? '已创建「' + saved.name + '」' : '已保存「' + saved.name + '」'); if (isNew) { S.cat = 'all'; S.status = ''; S.stock = ''; S.q = ''; selStatus.value = ''; selStock.value = ''; search.value = ''; } touched.add(saved.id); refreshAll(); }
      }

      /* ---- 分类管理：增删改排序，点保存才生效 ---- */
      async function catDlg() {
        const st = B.CATS.map((c) => ({ id: c.id, name: c.name })), root = h('div.stack'), errBox = h('div.err', { role: 'alert' }); let nid = 1;
        const cnt = (id) => B.db.products.filter((p) => p.cat === id).length;
        const paint = () => {
          root.replaceChildren(...st.map((c, i) => h('div.p1-cat', {}, h('div.row', { style: { gap: 0 } }, h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '上移 ' + c.name, disabled: i === 0, on: { click: () => { st.splice(i - 1, 0, st.splice(i, 1)[0]); paint(); } } }, UI.icon('up', 'icon--sm')), h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '下移 ' + c.name, disabled: i === st.length - 1, on: { click: () => { st.splice(i + 1, 0, st.splice(i, 1)[0]); paint(); } } }, UI.icon('down', 'icon--sm'))),
            h('input.input.grow', { value: c.name, maxlength: 8, 'aria-label': '分类名称 ' + (i + 1), on: { input: (e) => { c.name = e.target.value.trim(); errBox.textContent = ''; } } }), h('span.badge.badge--plain', { text: cnt(c.id) + ' 个商品' }),
            h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '删除', 'aria-label': '删除分类 ' + c.name, on: { click: () => { const n = cnt(c.id); if (n) { errBox.textContent = '「' + c.name + '」下还有 ' + n + ' 个商品，请先把它们改到别的分类，再删除'; return; } st.splice(i, 1); errBox.textContent = ''; paint(); } } }))));
          root.append(h('div', {}, h('button.btn.btn--sm', { type: 'button', text: '添加分类', disabled: st.length >= 10, on: { click: () => { st.push({ id: 'c' + Date.now().toString(36) + nid++, name: '' }); paint(); root.querySelectorAll('input').forEach((x, k, a) => { if (k === a.length - 1) x.focus(); }); } } })));
        };
        paint();
        let done = false;
        await P1.dlg(() => UI.dialog({ title: '分类管理', size: 'sm', body: h('div.stack', {}, h('p.muted', { text: '分类决定顾客端的菜单顺序，靠上的先显示。有商品的分类不能删除。' }), root, errBox), actions: [{ label: '取消', value: null }, { label: '保存分类', kind: 'primary', value: 'ok', on: async () => {
          const names = st.map((c) => c.name); if (names.some((n) => !n)) { errBox.textContent = '分类名称不能为空'; return false; } if (new Set(names).size !== names.length) { errBox.textContent = '分类名称不能重复'; return false; } if (!st.length) { errBox.textContent = '至少保留一个分类'; return false; }
          if (!(await P1.net(400))) return false;
          B.CATS.splice(0, B.CATS.length, ...st); done = true; A2.audit('product:edit', '调整商品分类', st.length + ' 个分类：' + names.join('、'));
        } }] }));
        if (done) { UI.toast('分类已保存'); refreshAll(); }
      }

      /* ---- 详情：概况、规格、销量与关联订单、操作记录 ---- */
      function detail(p) {
        const metaOf = (k, v) => h('div.p1-m', {}, h('span.muted', { text: k }), h('strong', {}, v));
        const od = usersOf(p), recent = od.filter((o) => dayOf(o.createdAt) >= dayOf(B.fmt(new Date(B.NOW().getTime() - 29 * 864e5)))), qty = recent.reduce((s, o) => s + o.items.filter((i) => i.pid === p.id).reduce((a, i) => a + i.qty, 0), 0);
        const ov = h('div.stack-lg', {}, h('div.p1-pd', {}, P1.thumb(p.img, 'p1-thumb--lg', p.name), h('div.stack', {}, h('h3', { text: p.name }), h('p.muted', { text: p.desc || '暂无简介' }), h('div.row.wrap', { style: { gap: 'var(--s-2)' } }, A2.status(PST, p.status), ...(p.tags || []).map((t) => h('span.badge.badge--brand.badge--plain', { text: t }))), priceNode(p))),
          h('div.p1-meta', {}, metaOf('分类', catName(p.cat)), metaOf('库存', stockTag(p.stock)), metaOf('累计销量', h('span.num', { text: p.sales + ' 份' })), metaOf('排序值', h('span.num', { text: String(p.sort) })), metaOf('近 30 天订单', h('span.num', { text: recent.length + ' 单' })), metaOf('近 30 天售出', h('span.num', { text: qty + ' 份' }))));
        const spec = (p.specs && p.specs.length) ? h('div.stack', {}, p.specs.map((g) => h('div.card.card--flat.card--tight.stack', {}, h('strong', { text: g.name }), h('div.list', {}, g.opts.map((o) => h('div', {}, h('span.grow', { text: o.n }), h('span.num.muted', { text: o.d ? '加价 ' + money(o.d) : '不加价' }))))))) : A2.empty('这个商品没有规格');
        const ordersN = h('div.stack', {}, h('p.muted', { text: '近 30 天共 ' + recent.length + ' 单、售出 ' + qty + ' 份（全部时间 ' + od.length + ' 单）。点订单号看详情。' }), od.length ? h('div.list.p1-rec', {}, od.slice(0, 8).map((o) => h('div', {}, h('button.p1-link.num', { type: 'button', text: o.no, on: { click: () => A2.orderDetail(o, { onChange: () => refreshAll() }) } }), h('span.grow.muted', { text: o.userName + ' · ' + short(o.createdAt) }), h('span.num', { text: '×' + o.items.filter((i) => i.pid === p.id).reduce((a, i) => a + i.qty, 0) }), P1.badge(o.status)))) : A2.empty('还没有包含这个商品的订单'));
        const logs = B.db.audit.filter((a) => a.target.includes(p.name)).slice(0, 12);
        const rec = logs.length ? h('div.list.p1-rec', {}, logs.map((a) => h('div', {}, h('span.muted.num.p1-rec-t', { text: short(a.at) }), h('span.p1-rec-w', { text: a.actor }), h('span.grow', { text: a.action + ' · ' + a.target })))) : A2.empty('还没有操作记录');
        return P1.dlg(() => A2.detail({ title: '商品：' + p.name, tabs: [{ id: 'ov', label: '概况', node: ov }, { id: 'spec', label: '规格', node: spec }, { id: 'ord', label: '销量与关联订单', node: ordersN }, { id: 'rec', label: '操作记录', node: rec }], actions: [{ label: '关闭', value: null }, { label: '编辑', value: 'edit', on: () => { setTimeout(() => editDlg(p), 260); } }, p.status === 'ON' ? { label: '下架', kind: 'danger', value: 'off', on: () => { setTimeout(() => publish([p], 'OFF'), 260); } } : { label: '上架', kind: 'primary', value: 'on', on: () => { setTimeout(() => publish([p], 'ON'), 260); } }] }));
      }

      /* ---- 右侧窄栏 ---- */
      function paintRail() {
        const all = src(), warn = all.filter((p) => p.stock < WARN).sort((a, b) => a.stock - b.stock);
        const stock = h('section.card.card--tight', { 'aria-label': '库存预警' }, h('div.card-head', {}, h('h3', { text: '库存预警' }), h('span.badge' + (warn.some((p) => p.stock < LOW) ? '.badge--bad' : warn.length ? '.badge--warn' : ''), { text: warn.length + ' 项' })),
          warn.length ? h('div.stack', {}, h('p.muted', { text: '低于 ' + LOW + ' 件标红，低于 ' + WARN + ' 件标橙。' }), h('div.list', {}, warn.slice(0, 6).map((p) => h('div', {}, h('button.p1-link.grow', { type: 'button', text: p.name, on: { click: () => detail(p) } }), h('span.badge' + (p.stock < LOW ? '.badge--bad' : '.badge--warn') + '.num', { text: p.stock <= 0 ? '已售罄' : '剩 ' + p.stock }), p.status === 'OFF' ? h('span.muted', { text: '已下架' }) : null, h('button.btn.btn--soft.btn--sm', { type: 'button', text: '补货', 'aria-label': '补货：' + p.name, on: { click: () => restock(p) } }))))) : h('p.muted', { text: '库存都够，没有需要补的商品。' }));
        const top = all.slice().sort((a, b) => b.sales - a.sales).slice(0, 5), mx = Math.max(1, ...top.map((p) => p.sales));
        const hot = h('section.card.card--tight', { 'aria-label': '热销榜' }, h('div.card-head', {}, h('h3', { text: '热销榜前五' }), h('span.muted', { text: '按累计销量' })),
          top.length ? h('ol.p1-rank', { role: 'list' }, top.map((p, i) => h('li', {}, h('span.p1-rk.num', { text: String(i + 1) }), h('div.grow', {}, h('div.row.between', {}, h('span', { text: p.name }), h('span.num', { text: p.sales + ' 份' })), h('div.p1-bar', { role: 'img', 'aria-label': p.name + ' 销量 ' + p.sales + ' 份，占榜首的 ' + Math.round((p.sales / mx) * 100) + '%' }, h('i', { style: { width: (p.sales / mx) * 100 + '%' } })))))) : h('p.muted', { text: '还没有销量' }));
        const feed = B.db.audit.filter((a) => (a.code === 'product:publish' || a.code === 'product:edit') && B.db.products.some((p) => a.target.includes(p.name))).slice(0, 6);
        const fd = h('section.card.card--tight', { 'aria-label': '最近上下架动态' }, h('div.card-head', {}, h('h3', { text: '最近上下架动态' })),
          feed.length ? h('div.list', {}, feed.map((a) => h('div', {}, h('span.grow', {}, h('div', { text: a.actor + ' ' + a.action }), h('div.muted', { text: a.target })), h('span.muted.num', { text: short(a.at) })))) : h('p.muted', { text: '还没有上下架记录' }));
        rail.replaceChildren(stock, hot, fd);
      }
      function refreshAll() { refresh(true); paintRail(); }
      return A2.load(() => { refresh(); paintRail(); return page; });
    },
  };

  /* ====================== 素材库 ====================== */
  const GROUPS = ['商品', '轮播', '活动', '其他'], GCOL = { 商品: 'var(--ch-1)', 轮播: 'var(--ch-2)', 活动: 'var(--ch-3)', 其他: 'var(--ch-5)' }, QUOTA = 100 * 1024, MAXKB = 10 * 1024;
  const fmtSize = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB');
  const DIMS = { 商品: [800, 450], 轮播: [1500, 600], 活动: [1080, 1440], 其他: [1200, 800] };
  const dimsOf = (f) => (f.w && f.h ? [f.w, f.h] : DIMS[f.group] || DIMS['其他']);
  const refsOf = (f) => (f.img ? B.db.products.filter((p) => p.img === f.img) : []);
  const linkOf = (f) => 'files.example.com/f/' + f.id + (f.name.match(/\.[A-Za-z0-9]+$/) || [''])[0];
  const hue = { 商品: '#e6f0ea', 轮播: '#f7e9d6', 活动: '#e0eaf6', 其他: '#ece4f3' }, ink = { 商品: '#2f6b4f', 轮播: '#b5651d', 活动: '#2c5f9e', 其他: '#6b4a8c' };
  /** 新上传素材的缩略图：按分组着色的扁平图形，生成为内嵌图片，不引用任何外部地址 */
  const art = (g) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="' + hue[g] + '"/><circle cx="360" cy="84" r="26" fill="' + ink[g] + '" opacity=".35"/><path d="M0 230l120-96 90 70 80-60 190 120v26H0z" fill="' + ink[g] + '" opacity=".28"/><path d="M0 250l150-70 110 52 100-44 120 62v20H0z" fill="' + ink[g] + '" opacity=".5"/></svg>');
  const kv2 = (pairs) => h('dl.p1-kv', {}, pairs.map(([k, v]) => [h('dt.muted', { text: k }), h('dd', {}, v == null || v === '' ? '—' : v)]));
  const ext = (n) => (n.match(/\.[A-Za-z0-9]+$/) || [''])[0];

  window.PAGES2.files = {
    title: '素材库', group: '商品与营销',
    layout: '主区加右侧窄栏',
    reason: '素材库的主工作是浏览、挑选和管理图片，所以左边三分之二放网格或列表；选中一张素材后的预览、引用情况和改名改分组放在右侧固定窄栏，存储用量也常驻在那里，不用翻页就能看到',
    scenes: [
      { id: 'nodata', label: '素材库里还没有素材' },
      { id: 'upload-net', label: '上传失败：网络中断（可重试）' },
      { id: 'upload-size', label: '上传失败：文件超过 10 MB' },
      { id: 'upload-type', label: '上传失败：格式不支持' },
      { id: 'delete-fail', label: '删除失败：网络异常' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '素材库里还没有素材'); if (early) return early;
      const S = { group: 'all', q: '', view: 'grid', active: null, limit: 24 }, checked = new Set(), tasks = []; let tid = 0, rows = [], touched = new Set();
      const src = () => (ctx.scene === 'nodata' ? [] : B.db.files);
      const page = h('section.page.p1-files');
      const upBtn = h('button.btn.btn--primary', { type: 'button', text: '上传素材', on: { click: () => upload() } });
      page.append(A2.heading('素材库', '商品、轮播和活动用到的图片都放在这里；删除前会检查有没有商品在用', [upBtn]));
      const tabsBox = h('div.p1-tabs'), sumEl = h('span.muted.num'), batch = h('div.p1-batch', { hidden: true, role: 'region', 'aria-label': '批量操作' }), queue = h('section.card.card--tight', { hidden: true, 'aria-label': '上传队列' });
      const seg = h('div.seg', { role: 'group', 'aria-label': '视图' }, [['grid', '网格'], ['list', '列表']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(S.view === v), text: l, on: { click: (e) => { S.view = v; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); checked.clear(); drawBody(); paintBatch(); } } })));
      const search = A2.search('素材名称', (v) => { S.q = v; S.limit = 24; refresh(); });
      const body = h('div.p1-fbody');
      const tbl = A2.table({
        selectable: true, caption: '素材列表', rows: [], empty: '没有符合条件的素材', rowClass: (f) => 'p1-f' + f.id, onSelect: (l) => { checked.clear(); l.forEach((f) => checked.add(f.id)); paintBatch(); },
        columns: [
          { title: '素材', render: (f) => h('div.p1-pname', {}, P1.thumb(f.img, 'p1-thumb--sm', f.name), h('div', {}, h('button.p1-link', { type: 'button', text: f.name, 'aria-label': '查看素材 ' + f.name, on: { click: () => setActive(f.id) } }), h('div.muted.num', { text: dimsOf(f).join(' × ') + ' · ' + f.uploader }))) },
          { title: '分组', render: (f) => f.group },
          { title: '体积', cls: 'r', render: (f) => fmtSize(f.size) },
          { title: '上传时间', cls: 'num', render: (f) => short(f.at) },
          { title: '引用', render: (f) => { const n = refsOf(f).length; return h('span.badge' + (n ? '.badge--brand' : '.badge--plain'), { text: n ? n + ' 个商品在用' : '未使用' }); } },
          { title: '操作', cls: 'c', render: (f) => acts(f) },
        ],
      });
      const main = h('div.main', {}, h('div.card.card--tight.stack', {}, h('div.row.between.wrap', {}, h('h2', { text: '素材' }), sumEl), tabsBox, h('div.row.wrap.p1-filters', {}, search, h('span.grow'), seg)), queue, batch, body);
      const rail = h('aside.rail', { 'aria-label': '素材详情与存储用量' });
      page.append(h('div.l-rail', {}, main, rail));

      const byId = (id) => B.db.files.find((f) => f.id === id);
      function acts(f) {
        const box = h('div.p1-acts'), more = h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': '更多操作：' + f.name }, UI.icon('more', 'icon--sm'));
        box.append(h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '查看', 'aria-label': '查看素材 ' + f.name, on: { click: () => setActive(f.id) } }), more);
        P1.menu(more, [{ label: '重命名', icon: 'edit', on: () => rename(f) }, { label: '改分组', icon: 'tag', on: () => regroup(f) }, { label: '复制链接', icon: 'copy', on: () => copyLink(f) }, A2.can('delete') ? 'hr' : null, A2.can('delete') ? { label: '删除', icon: 'trash', danger: true, on: () => remove([f]) } : null].filter(Boolean));
        return box;
      }
      function calc() {
        const q = S.q.toLowerCase(), base = src().filter((f) => !q || f.name.toLowerCase().includes(q)), counts = { all: base.length }; base.forEach((f) => { counts[f.group] = (counts[f.group] || 0) + 1; });
        return { base, counts, rows: base.filter((f) => S.group === 'all' || f.group === S.group) };
      }
      function refresh(keep) {
        const c = calc(); rows = c.rows;
        tabsBox.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: c.counts.all }].concat(GROUPS.map((g) => ({ id: g, label: g, count: c.counts[g] || 0 }))), S.group, (id) => { S.group = id; S.limit = 24; refresh(); }));
        const kb = c.rows.reduce((s, f) => s + f.size, 0); sumEl.textContent = '共 ' + c.rows.length + ' 个素材，合计 ' + fmtSize(kb);
        [...checked].forEach((id) => { if (!byId(id)) checked.delete(id); });
        drawBody(); paintBatch(); P1.sweep();
        if (touched.size) requestAnimationFrame(() => { touched.forEach((id) => P1.flash(page.querySelector('.p1-f' + id))); touched.clear(); });
      }
      function drawBody() {
        body.replaceChildren();
        if (S.view === 'list') { body.append(tbl.el); tbl.setRows(rows); return; }
        if (!rows.length) { body.append(h('div.card', {}, A2.empty(ctx.scene === 'nodata' ? '素材库里还没有素材，点右上角“上传素材”添加' : '没有符合条件的素材'))); return; }
        const shown = rows.slice(0, S.limit);
        body.append(h('div.p1-fgrid', {}, shown.map(tile)), rows.length > S.limit ? h('div.row', { style: { justifyContent: 'center', paddingTop: 'var(--s-3)' } }, h('button.btn', { type: 'button', text: '显示更多（还有 ' + (rows.length - S.limit) + ' 个）', on: { click: () => { S.limit += 24; drawBody(); } } })) : null);
      }
      function tile(f) {
        const n = refsOf(f).length, cb = h('input', { type: 'checkbox', checked: checked.has(f.id), 'aria-label': '选择 ' + f.name, on: { change: (e) => { e.target.checked ? checked.add(f.id) : checked.delete(f.id); paintBatch(); } } });
        return h('div.p1-ftile.p1-f' + f.id + (S.active === f.id ? '.is-active' : ''), {}, h('button.p1-ftile-b', { type: 'button', 'aria-pressed': String(S.active === f.id), 'aria-label': '查看素材 ' + f.name, on: { click: () => setActive(f.id) } }, P1.thumb(f.img, 'p1-thumb--lg', f.name), h('span.p1-ftile-n', { text: f.name }), h('span.muted.p1-ftile-m', { text: fmtSize(f.size) + ' · ' + f.group })), h('label.p1-ftile-cb', {}, cb), n ? h('span.badge.badge--brand.p1-ftile-tag', { text: n + ' 个商品在用' }) : null);
      }
      function paintBatch() {
        batch.hidden = !checked.size; batch.replaceChildren(); if (!checked.size) return;
        const l = [...checked].map(byId).filter(Boolean);
        batch.append(h('span.num', { text: '已选 ' + l.length + ' 个素材，合计 ' + fmtSize(l.reduce((s, f) => s + f.size, 0)) }), h('span.grow'), A2.can('delete') ? h('button.btn.btn--danger.btn--sm', { type: 'button', text: '批量删除', on: { click: () => remove(l) } }) : null, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '取消选择', on: { click: () => { checked.clear(); drawBody(); paintBatch(); } } }));
      }
      function setActive(id) { S.active = id; page.querySelectorAll('.p1-ftile').forEach((t) => { const on = t.classList.contains('p1-f' + id); t.classList.toggle('is-active', on); t.querySelector('.p1-ftile-b').setAttribute('aria-pressed', String(on)); }); paintRail(); }

      /* ---- 上传（模拟）：进度条、审核中、失败原因逐条写明，可重试 ---- */
      const paintQueue = () => {
        queue.hidden = !tasks.length; if (!tasks.length) return;
        queue.replaceChildren(h('div.card-head', {}, h('h3', { text: '上传队列' }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '清除已结束', on: { click: () => { for (let i = tasks.length - 1; i >= 0; i--) if (!['uploading', 'reviewing'].includes(tasks[i].state)) tasks.splice(i, 1); paintQueue(); } } })),
          h('div.list', {}, tasks.map((t) => h('div.p1-up', {}, h('div.grow', {}, h('div.row.between', {}, h('span', { text: t.name }), h('span.muted.num', { text: fmtSize(t.size) })),
            t.state === 'failed' ? h('div.p1-up-err', { role: 'alert', text: t.err }) : t.state === 'done' ? h('div.muted', { text: '上传完成，审核通过' }) : h('div.p1-up-bar', {}, h('div.progress', { role: 'progressbar', 'aria-label': t.name + ' 上传进度', 'aria-valuenow': t.p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { '--v': t.state === 'reviewing' ? 1 : t.p / 100 } })), h('span.muted.num', { text: t.state === 'reviewing' ? '审核中' : t.p + '%' }))),
            t.state === 'failed' ? h('div.row', {}, t.retry ? h('button.btn.btn--sm', { type: 'button', text: '重试', on: { click: () => run(t) } }) : null, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '移除', on: { click: () => { tasks.splice(tasks.indexOf(t), 1); paintQueue(); } } })) : t.state === 'uploading' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '取消', on: { click: () => { t.cancelled = true; tasks.splice(tasks.indexOf(t), 1); paintQueue(); } } }) : null))));
      };
      function nextName(g) { const pre = { 商品: ['商品图', '.webp'], 轮播: ['轮播图', '.jpg'], 活动: ['活动海报', '.png'], 其他: ['素材', '.png'] }[g]; let n = B.db.files.filter((f) => f.group === g).length + 1, nm; do { nm = pre[0] + '-' + n++ + pre[1]; } while (B.db.files.some((f) => f.name === nm)); return nm; }
      function upload() {
        const g = GROUPS.includes(S.group) ? S.group : '其他';
        const t = { id: ++tid, group: g, name: ctx.scene === 'upload-type' ? '合同扫描件-' + tid + '.bmp' : nextName(g), size: ctx.scene === 'upload-size' ? 12800 + tid * 311 : 180 + ((tid * 397) % 1800), state: 'uploading', p: 0, retry: true, tries: 0, cancelled: false };
        tasks.unshift(t); paintQueue(); run(t);
      }
      async function run(t) {
        t.state = 'uploading'; t.p = 0; t.err = ''; t.tries++; paintQueue();
        const fail = (m, retry) => { t.state = 'failed'; t.err = m; t.retry = retry; paintQueue(); bad(t.name + '：' + m); };
        if (ctx.scene === 'upload-type') { await UI.sleep(300); return fail('格式不支持，只能上传 jpg、png、webp 图片，请换一张', false); }
        if (ctx.scene === 'upload-size') { await UI.sleep(300); return fail('文件 ' + fmtSize(t.size) + '，超过 ' + fmtSize(MAXKB) + ' 的上限，请压缩后再传', false); }
        for (let p = 0; p <= 100; p += 10) {
          if (t.cancelled) return;
          try { if (p === 0 || p === 60) await UI.request(null, 100); else await UI.sleep(150); } catch (e) { return fail('网络中断，已上传 ' + t.p + '%，网络恢复后点“重试”', true); }
          if (ctx.scene === 'upload-net' && t.tries === 1 && p === 60) return fail('网络中断，已上传 ' + t.p + '%，网络恢复后点“重试”', true);
          t.p = p; paintQueue();
        }
        t.state = 'reviewing'; paintQueue(); await UI.sleep(700); if (t.cancelled) return;
        const [w, hh] = DIMS[t.group], f = { id: B.db.files.reduce((m, x) => Math.max(m, x.id), 0) + 1, name: t.name, kind: '图片', size: t.size, group: t.group, uploader: A2.me().name, at: nowStr(), img: art(t.group), w, h: hh };
        B.db.files.unshift(f); t.state = 'done'; A2.audit('system:file', '上传素材', '素材 ' + f.name + '，' + fmtSize(f.size)); UI.toast('已上传「' + f.name + '」，审核通过');
        touched.add(f.id); S.active = f.id; refresh(); paintRail(); paintQueue();
      }

      /* ---- 重命名、改分组、复制链接、删除 ---- */
      async function rename(f) {
        const v = await P1.dlg(() => A2.edit({ title: '重命名素材', size: 'sm', fields: [{ name: 'name', label: '素材名称', required: true, max: 40, value: f.name, hint: '保留文件后缀 ' + ext(f.name), validate: (x) => (/[\\/:*?"<>|]/.test(x) ? '名称里不能有 \\ / : * ? " < > |' : ext(x) !== ext(f.name) ? '请保留文件后缀 ' + ext(f.name) : B.db.files.some((y) => y !== f && y.name === x) ? '已经有同名素材' : '') }], submit: (vals) => { if (vals.name === f.name) return; A2.audit('system:file', '重命名素材', f.name + ' → ' + vals.name); f.name = vals.name; } }));
        if (v) { UI.toast('已重命名'); touched.add(f.id); refresh(); paintRail(); }
      }
      async function regroup(f) {
        const v = await P1.dlg(() => A2.edit({ title: '改分组：' + f.name, size: 'sm', ok: '确认修改', fields: [{ name: 'group', label: '分组', type: 'select', options: GROUPS, value: f.group }], submit: (vals) => { if (vals.group === f.group) return; A2.audit('system:file', '修改素材分组', f.name + '：' + f.group + ' → ' + vals.group); f.group = vals.group; } }));
        if (v) { UI.toast('已改到「' + v.group + '」'); touched.add(f.id); refresh(); paintRail(); }
      }
      async function copyLink(f) { try { await navigator.clipboard.writeText(linkOf(f)); } catch (e) { /* 没有剪贴板权限时只提示，演示用 */ } UI.toast('素材链接已复制'); }
      async function remove(list) {
        const used = list.map((f) => ({ f, ps: refsOf(f) })).filter((x) => x.ps.length), affected = [...new Set(used.flatMap((x) => x.ps))];
        let text;
        if (list.length === 1) text = used.length ? '「' + list[0].name + '」已被 ' + used[0].ps.length + ' 个商品使用（' + used[0].ps.map((p) => p.name).join('、') + '），删除后这些商品没有图片。仍要删除吗？' : '将删除「' + list[0].name + '」，删除后无法恢复。';
        else text = '将删除 ' + list.length + ' 个素材。' + (used.length ? '其中 ' + used.length + ' 个已被商品使用，涉及 ' + affected.length + ' 个商品（' + affected.slice(0, 4).map((p) => p.name).join('、') + (affected.length > 4 ? ' 等' : '') + '），删除后这些商品没有图片。' : '没有商品在用这些素材。') + '删除后无法恢复，仍要删除吗？';
        const yes = await P1.dlg(() => A2.danger(text, { title: used.length ? '素材正在被使用' : '确认删除', ok: used.length ? '仍要删除' : '确认删除' })); if (!yes) return;
        if (!(await P1.net(500))) return;
        if (ctx.scene === 'delete-fail') return bad('删除失败：网络异常，素材没有被删除，请稍后再试');
        const ids = new Set(list.map((f) => f.id)); for (let i = B.db.files.length - 1; i >= 0; i--) if (ids.has(B.db.files[i].id)) B.db.files.splice(i, 1);
        affected.forEach((p) => { p.img = ''; A2.audit('product:edit', '商品图片被清空', '商品 ' + p.name + '（素材被删除）'); });
        A2.audit('system:file', list.length > 1 ? '批量删除素材' : '删除素材', list.length > 1 ? list.length + ' 个素材' + (affected.length ? '，影响 ' + affected.length + ' 个商品' : '') : '素材 ' + list[0].name + (affected.length ? '，影响 ' + affected.length + ' 个商品' : ''));
        if (ids.has(S.active)) S.active = null; list.forEach((f) => checked.delete(f.id));
        UI.toast('已删除 ' + list.length + ' 个素材' + (affected.length ? '，' + affected.length + ' 个商品现在没有图片' : '')); refresh(); paintRail();
      }

      /* ---- 右侧窄栏：选中素材的预览与信息、存储用量 ---- */
      function paintRail() {
        const f = S.active && byId(S.active), all = src();
        let info;
        if (!f) info = h('section.card.card--tight', { 'aria-label': '素材预览' }, h('div.card-head', {}, h('h3', { text: '素材预览' })), h('div.empty', { style: { padding: 'var(--s-6) var(--s-3)' } }, UI.icon('image', 'icon--lg'), h('p', { text: '点一张素材，在这里看大图、尺寸和有哪些商品在用' })));
        else {
          const ps = refsOf(f), [w, hh] = dimsOf(f);
          info = h('section.card.card--tight.stack', { 'aria-label': '素材预览' }, h('div.card-head', { style: { marginBottom: 0 } }, h('h3', { text: '素材预览' }), h('span.badge.badge--ok', { text: '已通过审核' })), P1.thumb(f.img, 'p1-thumb--lg', f.name), h('strong.p1-fname', { text: f.name }),
            kv2([['尺寸', w + ' × ' + hh], ['体积', fmtSize(f.size)], ['分组', f.group], ['上传人', f.uploader], ['上传时间', f.at], ['引用情况', ps.length ? h('span', {}, '已被 ' + ps.length + ' 个商品使用：' + ps.map((p) => p.name).join('、')) : '没有商品在用']]),
            h('div.p1-link-row', {}, h('span.muted.p1-linkbox', { text: linkOf(f), title: linkOf(f) }), h('button.btn.btn--sm', { type: 'button', text: '复制链接', on: { click: () => copyLink(f) } })),
            h('div.row.wrap', { style: { gap: 'var(--s-2)' } }, h('button.btn.btn--sm', { type: 'button', text: '重命名', on: { click: () => rename(f) } }), h('button.btn.btn--sm', { type: 'button', text: '改分组', on: { click: () => regroup(f) } }), A2.can('delete') ? h('button.btn.btn--danger.btn--sm', { type: 'button', text: '删除', on: { click: () => remove([f]) } }) : null));
        }
        const by = GROUPS.map((g) => ({ g, kb: all.filter((x) => x.group === g).reduce((s, x) => s + x.size, 0), n: all.filter((x) => x.group === g).length })), used = by.reduce((s, x) => s + x.kb, 0), pct = Math.min(100, (used / QUOTA) * 100);
        const usage = h('section.card.card--tight.stack', { 'aria-label': '存储用量' }, h('div.card-head', { style: { marginBottom: 0 } }, h('h3', { text: '存储用量' }), h('span.muted.num', { text: pct.toFixed(1) + '%' })),
          h('div.p1-usage', { role: 'img', 'aria-label': '已用 ' + fmtSize(used) + '，总容量 ' + fmtSize(QUOTA) + '：' + by.map((x) => x.g + ' ' + fmtSize(x.kb)).join('，') }, by.filter((x) => x.kb).map((x) => h('i', { style: { width: (x.kb / QUOTA) * 100 + '%', background: GCOL[x.g] } }))),
          h('p', {}, h('b.num', { text: fmtSize(used) }), h('span.muted', { text: ' / ' + fmtSize(QUOTA) })),
          h('ul.p1-legend', { role: 'list' }, by.map((x) => h('li', {}, h('i', { style: { background: GCOL[x.g] } }), h('span.grow', { text: x.g + '（' + x.n + ' 个）' }), h('span.num', { text: fmtSize(x.kb) })))),
          pct > 80 ? h('p.p1-confirm', { text: '用量已超过 80%，请清理没用的素材。' }) : h('p.muted', { text: '容量够用，单个文件不超过 ' + fmtSize(MAXKB) + '，支持 jpg、png、webp。' }));
        rail.replaceChildren(info, usage);
      }
      return A2.load(() => { refresh(); paintRail(); return page; });
    },
  };
})();
