/* 门店：全幅画布加浮动面板。画布是手画的示意地图（路网、水域、绿地、门店图钉）；读写 B.db.stores，订单按门店分摊只在本页计算。 */
(function () {
  'use strict';
  const h = P2.h;
  const { today: TODAY, yuan, dAdd, md, pad } = P2;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, a, ...k) => { const e = document.createElementNS(SVGNS, tag); for (const [x, y] of Object.entries(a || {})) if (y != null) e.setAttribute(x, y); k.forEach((c) => c && e.append(c)); return e; };
  const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const weekIdx = (d) => (P2.parse(d).getDay() + 6) % 7;
  const MODES = ['堂食', '自取', '外卖'];
  const hm = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  /* ---------- 演示数据：5 家门店 ---------- */
  P2.onSeed((db) => {
    const today = TODAY(), mk = (id, code, name, addr, phone, open, close, x, y, extra) => Object.assign({ id, code, name, addr, phone, open, close, x, y, modes: ['堂食', '自取', '外卖'], notice: '本店支持线上点单、到店自取，会员卡与储值可抵扣。', manual: 'OPEN', resumeAt: '', pauseNote: '', specialDays: [], week: Array.from({ length: 7 }, () => ({ on: true, open, close })), version: 1, createdAt: dAdd(today, -200 + id * 17) }, extra || {});
    const s = [
      mk(1, 'YF001', '云帆店', '示例市示例区示例路 88 号', '0571-8800-0001', '09:00', '21:00', 250, 330, { notice: '本店支持线上点单、到店自取，会员卡与储值可抵扣。午市 11:30–13:00 高峰，建议提前下单。' }),
      mk(2, 'BJ002', '滨江店', '示例市滨江区江南大道 216 号', '0571-8800-0002', '09:30', '22:00', 520, 255, { modes: ['堂食', '自取'], notice: '滨江店晚市营业到 22:00，欢迎夜宵。' }),
      mk(3, 'XX003', '西溪店', '示例市西湖区文二西路 18 号', '0571-8800-0003', '07:30', '20:00', 790, 370, { manual: 'PAUSED', resumeAt: today + ' 14:00', pauseNote: '设备检修，今天 14:00 恢复营业，给您带来不便请谅解。', notice: '西溪店早餐 7:30 起供应。' }),
      mk(4, 'QJ004', '钱江店', '示例市上城区钱江路 66 号', '0571-8800-0004', '11:00', '21:30', 430, 470, { modes: ['堂食', '外卖'], notice: '钱江店 11:00 开门，主营午餐与晚餐。' }),
      mk(5, 'XS005', '萧山店', '示例市萧山区市心路 9 号', '0571-8800-0005', '09:00', '21:00', 985, 440, { notice: '萧山店新开业，会员卡全城通用。', specialDays: [{ id: 1, date: today, type: '休息', open: '', close: '', note: '员工团建，今天休息' }] }),
    ];
    s[1].specialDays.push({ id: 1, date: dAdd(today, 23), type: '调整营业时间', open: '10:00', close: '20:00', note: '圣诞周边活动，提前打烊' });
    s[0].specialDays.push({ id: 1, date: dAdd(today, 58), type: '休息', open: '', close: '', note: '元旦休息' });
    s[3].week[6] = { on: false, open: '11:00', close: '21:30' };
    db.stores = s;
  });

  /* ---------- 营业状态：人工暂停优先，其次特殊日期与每周安排，最后看当前时间 ---------- */
  function storeState(s) {
    const today = TODAY(), now = hm(P2.nowHM());
    if (s.manual === 'PAUSED') return { k: 'PAUSED', label: '暂停营业', tone: 'warn', note: s.resumeAt ? '预计 ' + md(s.resumeAt) + ' 恢复' : '恢复时间待定' };
    const sp = s.specialDays.find((d) => d.date === today);
    if (sp && sp.type === '休息') return { k: 'REST', label: '今日休息', tone: 'warn', note: sp.note || '特殊日期休息' };
    const wk = s.week[weekIdx(today)], hours = sp && sp.type === '调整营业时间' ? { open: sp.open, close: sp.close } : wk.on ? wk : null;
    if (!hours) return { k: 'REST', label: '今日休息', tone: 'warn', note: WEEK[weekIdx(today)] + '休息' };
    if (now >= hm(hours.open) && now < hm(hours.close)) return { k: 'OPEN', label: '营业中', tone: 'ok', note: '营业到 ' + hours.close };
    return { k: 'CLOSED', label: now < hm(hours.open) ? '未开门' : '已打烊', tone: '', note: now < hm(hours.open) ? hours.open + ' 开门' : '明天 ' + s.open + ' 开门' };
  }
  P2.storeState = storeState;
  const hoursToday = (s) => { const today = TODAY(), sp = s.specialDays.find((d) => d.date === today), wk = s.week[weekIdx(today)]; return sp && sp.type === '休息' ? '今日休息' : sp && sp.type === '调整营业时间' ? sp.open + '–' + sp.close + '（特殊日期）' : wk.on ? wk.open + '–' + wk.close : '今日休息'; };

  /* ---------- 订单按门店分摊（只在本页算）：按订单号取散列，权重固定，后来新增的门店没有历史订单 ---------- */
  const hash = (str) => { let a = 7; for (let i = 0; i < str.length; i++) a = (Math.imul(a, 31) + str.charCodeAt(i)) >>> 0; return a; };
  const CUM = [30, 54, 74, 90, 100];
  const storeIdOf = (o) => { const v = hash(o.no) % 100; return CUM.findIndex((c) => v < c) + 1; };
  function storeNumbers(s) {
    const today = TODAY(), mine = B.db.orders.filter((o) => storeIdOf(o) === s.id);
    const paid = mine.filter((o) => ['PAID', 'FULFILLED', 'DONE'].includes(o.status) && o.createdAt.slice(0, 10) === today);
    return { orders: paid.length, rev: paid.reduce((a, o) => a + o.amount, 0), unpaid: mine.filter((o) => o.status === 'UNPAID').length, toFulfil: mine.filter((o) => o.status === 'PAID').length };
  }
  P2.storeNumbers = storeNumbers;

  /* ---------- 示意地图：路网、水域、绿地、街区，纯 SVG，颜色取令牌 ---------- */
  const ROADS = {
    main: [[[0, 560], [260, 520], [560, 540], [880, 470], [1200, 430]], [[130, 0], [210, 250], [330, 480], [380, 720]], [[700, 0], [660, 200], [690, 420], [790, 720]], [[0, 160], [320, 190], [700, 200], [1200, 150]]],
    side: [[[0, 340], [400, 330], [900, 310], [1200, 340]], [[500, 0], [520, 360], [540, 720]], [[900, 0], [920, 300], [960, 720]], [[0, 700], [600, 640], [1200, 680]], [[250, 0], [300, 300], [260, 720]], [[1080, 0], [1100, 400], [1140, 720]]],
  };
  const RIVER = [[0, 440], [200, 400], [420, 410], [640, 360], [840, 380], [1040, 330], [1200, 300]];
  const LAKE = { x: 1010, y: 90, rx: 150, ry: 54 };
  const PARKS = [[40, 60, 190, 110], [740, 480, 170, 120], [380, 590, 130, 90], [1040, 560, 140, 100]];
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
  const lineDist = (p, pts) => Math.min(...pts.slice(1).map((q, i) => segDist(p, pts[i], q)));
  const smooth = (pts) => pts.reduce((d, p, i, a) => (i === 0 ? 'M' + p[0] + ' ' + p[1] : d + 'C' + [(a[i - 1][0] + p[0]) / 2, a[i - 1][1], (a[i - 1][0] + p[0]) / 2, p[1], p[0], p[1]].join(' ')), '');
  function buildMap() {
    const svg = sv('svg', { class: 'p2-map', viewBox: '0 0 1200 720', preserveAspectRatio: 'xMidYMid slice', role: 'img', 'aria-label': '示意地图：路网、河流、湖和绿地，上面标着门店位置' });
    svg.append(sv('rect', { class: 'p2-land', width: 1200, height: 720 }));
    const r = B.rng(5), blocks = sv('g', { class: 'p2-blocks' });
    for (let gx = 20; gx < 1200; gx += 54) for (let gy = 14; gy < 720; gy += 46) {
      const p = [gx + 25, gy + 21];
      if (Math.abs(r()) < 0.12) continue;
      if (lineDist(p, RIVER) < 54) continue;
      if (PARKS.some(([x, y, w, hh]) => p[0] > x - 14 && p[0] < x + w + 14 && p[1] > y - 14 && p[1] < y + hh + 14)) continue;
      if (((p[0] - LAKE.x) / (LAKE.rx + 20)) ** 2 + ((p[1] - LAKE.y) / (LAKE.ry + 20)) ** 2 < 1) continue;
      if (ROADS.main.some((l) => lineDist(p, l) < 24) || ROADS.side.some((l) => lineDist(p, l) < 18)) continue;
      const w = 30 + Math.floor(r() * 18), hh = 26 + Math.floor(r() * 14);
      blocks.append(sv('rect', { x: gx + Math.floor(r() * 6), y: gy + Math.floor(r() * 6), width: w, height: hh, rx: 5 }));
    }
    svg.append(blocks);
    PARKS.forEach(([x, y, w, hh]) => svg.append(sv('rect', { class: 'p2-park', x, y, width: w, height: hh, rx: 22 })));
    svg.append(sv('ellipse', { class: 'p2-water', cx: LAKE.x, cy: LAKE.y, rx: LAKE.rx, ry: LAKE.ry }));
    svg.append(sv('path', { class: 'p2-water p2-river', d: smooth(RIVER), fill: 'none', 'stroke-width': 58, 'stroke-linecap': 'round' }));
    svg.append(sv('path', { class: 'p2-river-in', d: smooth(RIVER), fill: 'none', 'stroke-width': 40, 'stroke-linecap': 'round' }));
    const road = (pts, w, cls) => { const d = smooth(pts); svg.append(sv('path', { class: 'p2-road-casing', d, 'stroke-width': w + 4, fill: 'none' }), sv('path', { class: 'p2-road ' + cls, d, 'stroke-width': w, fill: 'none' })); };
    ROADS.side.forEach((l) => road(l, 8, 'p2-side'));
    ROADS.main.forEach((l) => road(l, 16, 'p2-main'));
    [['老城区', 150, 290], ['滨江新区', 560, 170], ['西溪湿地', 820, 590], ['萧山', 1080, 380], ['钱江新城', 440, 660], ['城北公园', 135, 90]].forEach(([t, x, y]) => svg.append(sv('text', { class: 'p2-district', x, y, 'text-anchor': 'middle' }, document.createTextNode(t))));
    const compass = sv('g', { class: 'p2-compass', transform: 'translate(1150 345)' }, sv('circle', { r: 22 }), sv('path', { d: 'M0 -14L6 6L0 2L-6 6Z' }), sv('text', { y: -28, 'text-anchor': 'middle' }, document.createTextNode('北')));
    svg.append(compass);
    return svg;
  }
  P2.buildMap = buildMap;

  window.PAGES2.tenants = {
    title: '门店', group: '门店',
    layout: '全幅画布加浮动面板',
    reason: '门店管理的第一件事是看清每家店在哪、现在开不开：示意地图铺满主区当主角，搜索与筛选、今日汇总和门店卡片做成浮动面板压在画布四周，点图钉或卡片再进详情去停业、改时间、改公告',
    scenes: [
      { id: 'nodata', label: '还没有门店' },
      { id: 'map-fail', label: '地图加载失败（门店列表仍可用）' },
      { id: 'pause-fail', label: '停业失败：门店状态已被别人改过' },
      { id: 'save-fail', label: '保存失败：门店编码已被占用' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有门店');
      if (early) return early;
      P2.begin();
      const today = TODAY(), S = { sel: null, q: '', st: 'ALL' }, flashIds = new Set();
      const page = h('section.page.p2-page');
      const tgt = (s) => '门店 ' + s.name;
      const stores = () => (ctx.scene === 'nodata' ? [] : B.db.stores);
      const visible = () => stores().filter((s) => { const st = storeState(s); return (!S.q || s.name.includes(S.q) || s.addr.includes(S.q)) && (S.st === 'ALL' || (S.st === 'OPEN' && st.k === 'OPEN') || (S.st === 'PAUSE' && (st.k === 'PAUSED' || st.k === 'REST')) || (S.st === 'CLOSED' && st.k === 'CLOSED')); });

      /* ----- 画布 ----- */
      const canvas = h('div.canvas'), svgHost = h('div.p2-mapwrap');
      let mapEl = null, pinLayer = null;
      function drawMap() {
        svgHost.replaceChildren();
        if (ctx.scene === 'map-fail') { svgHost.append(h('div.empty.p2-maperr', { role: 'alert' }, UI.icon('warn', 'icon--lg'), h('h3', { text: '地图暂时加载不出来' }), h('p', { text: '下面的门店列表仍然可以使用。' }), h('button.btn', { type: 'button', text: '重新加载', on: { click: () => { UI.state.scene.tenants = 'normal'; ctx.refresh(); } } }))); return; }
        mapEl = buildMap(); pinLayer = sv('g', { class: 'p2-pins' }); mapEl.append(pinLayer); svgHost.append(mapEl); drawPins();
        mapEl.addEventListener('click', (e) => { if (!e.target.closest('.p2-pin, .p2-callout')) { S.sel = null; paintSel(); } });
      }
      function drawPins() {
        if (!pinLayer) return;
        pinLayer.replaceChildren();
        const vis = new Set(visible().map((s) => s.id));
        stores().slice().sort((a, b) => (a.id === S.sel) - (b.id === S.sel)).forEach((s) => {
          const st = storeState(s), on = s.id === S.sel, dim = !vis.has(s.id);
          const g = sv('g', { class: 'p2-pin p2-' + (st.tone || 'idle') + (on ? ' on' : '') + (dim ? ' dim' : ''), transform: 'translate(' + s.x + ' ' + s.y + ')', tabindex: 0, role: 'button', 'aria-label': s.name + '，' + st.label + (on ? '，已选中' : '，点击选中') });
          g.append(sv('ellipse', { class: 'p2-pin-shadow', cx: 0, cy: 2, rx: 12, ry: 5 }), sv('g', { class: 'p2-pin-body' }, sv('path', { d: 'M0 0C-4 -9 -17 -19 -17 -33a17 17 0 0 1 34 0C17 -19 4 -9 0 0Z' }), sv('circle', { cx: 0, cy: -33, r: 6.5, class: 'p2-pin-dot' })), sv('text', { class: 'p2-pin-name', x: 0, y: 22, 'text-anchor': 'middle' }, document.createTextNode(s.name)));
          const act = () => { S.sel = s.id; paintSel(); };
          g.addEventListener('click', act); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
          pinLayer.append(g);
          if (on) {
            const n = storeNumbers(s), up = s.y > 380, w = 210, hgt = 78, ox = Math.max(-s.x + 8, Math.min(1200 - s.x - w - 8, -w / 2)), oy = up ? -hgt - 54 : 34;
            const c = sv('g', { class: 'p2-callout', transform: 'translate(' + (s.x + ox) + ' ' + (s.y + oy) + ')', tabindex: 0, role: 'button', 'aria-label': '打开 ' + s.name + ' 的门店详情' });
            c.append(sv('rect', { width: w, height: hgt, rx: 12 }), sv('text', { class: 't1', x: 14, y: 24 }, document.createTextNode(s.name + ' · ' + st.label)), sv('text', { class: 't2', x: 14, y: 46 }, document.createTextNode('今日 ' + yuan(n.rev) + ' · ' + n.orders + ' 单')), sv('text', { class: 't3', x: 14, y: 67 }, document.createTextNode('查看详情 ›')));
            c.addEventListener('click', () => openDetail(s.id)); c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(s.id); } });
            pinLayer.append(c);
          }
        });
      }
      canvas.append(svgHost);

      /* ----- 左上：搜索与筛选 ----- */
      const tl = h('div.float.tl.p2-fl', { 'aria-label': '搜索与筛选' });
      const search = h('input.input.input--search', { type: 'search', placeholder: '搜索门店名称或地址', 'aria-label': '搜索门店', on: { input: () => { S.q = search.value.trim(); paintAll(); } } });
      const chips = h('div.seg.p2-chips', { role: 'group', 'aria-label': '营业状态' });
      function paintChips() {
        const base = stores().filter((s) => !S.q || s.name.includes(S.q) || s.addr.includes(S.q)), n = (f) => base.filter((s) => f(storeState(s).k)).length;
        chips.replaceChildren(...[['ALL', '全部', n(() => true)], ['OPEN', '营业中', n((k) => k === 'OPEN')], ['PAUSE', '暂停或休息', n((k) => k === 'PAUSED' || k === 'REST')], ['CLOSED', '未营业', n((k) => k === 'CLOSED')]].map(([v, l, c]) => h('button', { type: 'button', 'aria-pressed': String(S.st === v), on: { click: () => { S.st = v; paintAll(); } } }, l, ' ', h('span.num.p2-seg-n', { text: c }))));
      }
      tl.append(h('div.field', {}, h('label.sr-only', { for: 'p2-store-q', text: '搜索门店' }), Object.assign(search, { id: 'p2-store-q' })), chips);

      /* ----- 右上：今日汇总 ----- */
      const tr = h('div.float.tr.p2-fl', { 'aria-label': '今日汇总' });
      function paintSum() {
        const list = stores(), nums = list.map(storeNumbers), rev = nums.reduce((a, n) => a + n.rev, 0), ord = nums.reduce((a, n) => a + n.orders, 0), open = list.filter((s) => storeState(s).k === 'OPEN').length;
        tr.replaceChildren(h('div.row.between', {}, h('b', { text: '今日汇总' }), h('span.muted', { text: P2.nowHM() + ' 更新' })), h('div.p2-sum', {},
          P2.stat({ label: '营业额', value: rev / 100, prefix: '¥', dec: 2, sub: h('span', { text: list.length + ' 家门店合计' }) }), h('div.p2-sum-row', {}, P2.stat({ label: '订单数', value: ord, suffix: ' 单' }), P2.stat({ label: '营业中', value: open, suffix: ' / ' + list.length + ' 家' }))));
      }

      /* ----- 底边：门店卡 ----- */
      const bottom = h('div.float.bottom.p2-fl', { 'aria-label': '门店列表' }), strip = h('div.p2-strip', { role: 'list' });
      function paintStrip() {
        const list = visible();
        strip.replaceChildren(...(list.length ? list.map((s) => {
          const st = storeState(s), n = storeNumbers(s);
          return h('button.p2-scard' + (s.id === S.sel ? '.on' : '') + (flashIds.has(s.id) ? '.p2-flash-card' : ''), { type: 'button', role: 'listitem', 'data-id': s.id, 'aria-label': s.name + '，' + st.label + '，打开详情', on: { click: () => { S.sel = s.id; paintSel(); openDetail(s.id); } } },
            h('div.row.between', {}, h('b', { text: s.name }), P2.badge(st.label, st.tone)), h('span.muted', { text: st.note }), h('span.p2-scard-n', {}, h('b.num', { text: yuan(n.rev) }), h('span.muted', { text: ' · ' + n.orders + ' 单' })), h('span.muted.p2-ell', { text: hoursToday(s) + ' · ' + s.addr }));
        }) : [h('div.p2-strip-empty', {}, stores().length ? '没有符合条件的门店，换个关键词或状态试试' : '还没有门店，点右上角“新增门店”', stores().length ? h('button.btn.btn--sm', { type: 'button', text: '清除筛选', on: { click: () => { S.q = ''; search.value = ''; S.st = 'ALL'; paintAll(); } } }) : null)]));
        if (flashIds.size) { flashIds.forEach((id) => P2.flash(strip.querySelector('[data-id="' + id + '"]'))); flashIds.clear(); }
      }
      bottom.append(strip);
      const paintSel = () => { drawPins(); paintStrip(); const on = strip.querySelector('.on'); on && on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: UI.rm ? 'auto' : 'smooth' }); };
      const paintAll = () => { paintChips(); paintSum(); drawPins(); paintStrip(); };

      /* ================= 营业状态：一键停业与恢复 ================= */
      async function pause(s) {
        const n = storeNumbers(s);
        const opts = [[today + ' 11:30', '今天 11:30'], [today + ' 12:30', '今天 12:30'], [today + ' 14:00', '今天 14:00'], [today + ' 17:00', '今天 17:00'], [dAdd(today, 1) + ' 09:00', '明天 09:00'], ['', '恢复时间待定']].filter(([v]) => !v || v > P2.nowStr());
        let msg, text;
        const v = await P2.form({ title: '停业：' + s.name, size: 'sm', ok: '确认停业', danger: true,
          lead: h('div.stack', {}, h('div.p2-impact', {}, h('b', { text: '停业会影响' }), h('ul', { role: 'list' }, h('li', {}, h('span', { text: '待支付订单' }), h('b.num', { text: n.unpaid + ' 笔' }), h('span.muted', { text: '顾客不能再支付，超时后自动关闭' })), h('li', {}, h('span', { text: '待履约订单' }), h('b.num', { text: n.toFulfil + ' 笔' }), h('span.muted', { text: '需要继续出餐，或联系顾客退款' })))),
            h('p.muted', { text: '停业后小程序里商品和价格仍可浏览，下单按钮变成“暂停营业”。' })),
          fields: [{ name: 'resume', label: '恢复时间', type: 'select', options: opts.map(([v, l]) => ({ v, l })), value: opts[0][0] }, { name: 'note', label: '小程序提示文案', type: 'textarea', required: true, max: 60, value: '', hint: '顾客在小程序里会看到这句话' }],
          onBuild: (f, body) => {
            const sel = f.el.querySelector('select'), ta = f.el.querySelector('textarea'); text = ta; let touched = false; ta.addEventListener('input', () => { touched = true; paint(); });
            const base = () => { const l = (opts.find(([v]) => v === sel.value) || [, ''])[1]; return s.name + '暂时停业' + (sel.value ? '，预计' + l + ' 恢复营业' : '，恢复时间另行通知') + '，给您带来不便请谅解。'; };
            msg = h('div.p2-phone', { 'aria-label': '小程序提示预览' }); body.append(h('div.muted', { text: '小程序里的显示' }), msg);
            const paint = () => { msg.replaceChildren(h('div.p2-phone-bar', {}, h('b', { text: s.name }), P2.badge('暂停营业', 'warn')), h('div.p2-phone-note', { text: ta.value.trim() || '（请填写提示文案）' }), h('button.btn.btn--sm', { type: 'button', disabled: true, text: '暂停营业' })); };
            sel.addEventListener('change', () => { if (!touched) { ta.value = base(); } paint(); }); ta.value = base(); paint();
          },
          submit: (x) => {
            if (ctx.scene === 'pause-fail') P2.fail('停业失败：' + s.name + ' 的状态刚刚被另一位管理员修改过，请关闭后重新打开再试');
            s.manual = 'PAUSED'; s.resumeAt = x.resume; s.pauseNote = x.note; s.version++;
            A2.audit('store:edit', '一键停业（待支付 ' + n.unpaid + ' 笔、待履约 ' + n.toFulfil + ' 笔），' + (x.resume ? '预计 ' + md(x.resume) + ' 恢复' : '恢复时间待定') + '：' + x.note, tgt(s));
          } });
        if (v) { UI.toast(s.name + ' 已停业，小程序已显示提示'); flashIds.add(s.id); paintAll(); }
        return !!v;
      }
      async function resume(s) {
        if (!(await UI.confirm('恢复营业后，小程序马上可以下单。当前提示：“' + s.pauseNote + '”将被撤下。', { title: '恢复营业：' + s.name, ok: '确认恢复' }))) return false;
        const r = await P2.act(() => { if (ctx.scene === 'pause-fail') P2.fail('恢复失败：' + s.name + ' 的状态刚刚被另一位管理员修改过，请重新打开再试'); s.manual = 'OPEN'; s.resumeAt = ''; s.pauseNote = ''; s.version++; A2.audit('store:edit', '恢复营业', tgt(s)); });
        if (r.ok) { UI.toast(s.name + ' 已恢复营业'); flashIds.add(s.id); paintAll(); }
        return r.ok;
      }

      /* ================= 新增与编辑 ================= */
      async function edit(s0) {
        const isNew = !s0, s = s0 || { name: '', code: '', addr: '', phone: '', open: '09:00', close: '21:00', modes: ['堂食', '自取'] };
        const v = await P2.form({ title: isNew ? '新增门店' : '编辑门店：' + s.name, size: 'sm', ok: isNew ? '创建' : '保存', lead: isNew ? '新门店创建后默认营业，可以在详情里设置每周时间和特殊日期。' : '门店编码创建后不能修改。',
          fields: [
            { name: 'name', label: '门店名称', required: true, value: s.name, max: 30, validate: (x) => (x.length < 2 ? '名称至少 2 个字' : '') },
            { name: 'code', label: '门店编码', required: true, value: s.code, max: 10, hint: '字母或数字 3 到 10 位，创建后不能改', validate: (x) => (!/^[A-Za-z0-9]{3,10}$/.test(x) ? '编码只能是 3 到 10 位字母或数字' : '') },
            { name: 'addr', label: '详细地址', required: true, value: s.addr, max: 60 },
            { name: 'phone', label: '联系电话', required: true, value: s.phone, max: 14, hint: '对会员公开，例如 0571-8800-0001 或手机号', validate: (x) => (!/^(\d{3,4}-)?\d{7,8}$|^1\d{10}$|^400-\d{3}-\d{4}$|^\d{3,4}-\d{4}-\d{4}$/.test(x) ? '电话格式不对' : '') },
            { name: 'open', label: '开门时间', type: 'time', required: true, value: s.open },
            { name: 'close', label: '关门时间', type: 'time', required: true, value: s.close },
            { name: 'm0', label: '支持堂食', type: 'switch', value: s.modes.includes('堂食') },
            { name: 'm1', label: '支持到店自取', type: 'switch', value: s.modes.includes('自取') },
            { name: 'm2', label: '支持外卖配送', type: 'switch', value: s.modes.includes('外卖') },
          ],
          onBuild: (f) => { f.el.classList.add('p2-form2'); if (!isNew) { const c = f.el.children[1].querySelector('input'); c.disabled = true; } },
          check: (x) => { const e = {}; if (isNew && B.db.stores.some((o) => o.code.toLowerCase() === x.code.toLowerCase())) e.code = '这个编码已经被「' + B.db.stores.find((o) => o.code.toLowerCase() === x.code.toLowerCase()).name + '」用了'; if (x.close <= x.open) e.close = '关门时间要晚于开门时间'; if (!x.m0 && !x.m1 && !x.m2) e.m0 = '至少支持一种取餐方式'; if (B.db.stores.some((o) => o !== s0 && o.name === x.name)) e.name = '已经有同名的门店'; return e; },
          submit: (x) => {
            if (ctx.scene === 'save-fail') P2.fail('保存失败：门店编码「' + (x.code || s.code) + '」已被另一家门店占用');
            const modes = MODES.filter((_, i) => x['m' + i]), body = { name: x.name, addr: x.addr, phone: x.phone, open: x.open, close: x.close, modes };
            if (isNew) {
              const free = [[650, 470], [130, 450], [1090, 340], [700, 250], [880, 250], [600, 360]].find(([px, py]) => B.db.stores.every((o) => Math.hypot(o.x - px, o.y - py) > 90)) || [200 + Math.floor(Math.random() * 800), 250 + Math.floor(Math.random() * 200)];
              Object.assign(s, body, { id: Math.max(0, ...B.db.stores.map((o) => o.id)) + 1, code: x.code.toUpperCase(), x: free[0], y: free[1], manual: 'OPEN', resumeAt: '', pauseNote: '', specialDays: [], notice: '欢迎光临' + x.name + '。', week: Array.from({ length: 7 }, () => ({ on: true, open: x.open, close: x.close })), version: 1, createdAt: today });
              B.db.stores.push(s);
            } else { s.week.forEach((d) => { if (d.open === s.open) d.open = x.open; if (d.close === s.close) d.close = x.close; }); Object.assign(s, body); s.version++; }
            A2.audit('store:edit', isNew ? '新增门店' : '修改门店信息', tgt(s));
          } });
        if (v) { UI.toast(isNew ? '已新增「' + s.name + '」' : '已保存「' + s.name + '」'); flashIds.add(s.id); S.sel = s.id; paintAll(); }
        return !!v;
      }

      /* ================= 详情 ================= */
      function openDetail(id) {
        const s = () => B.db.stores.find((x) => x.id === id), box = (paint) => { const n = h('div'); n.paint = () => n.replaceChildren(paint()); n.paint(); return n; };
        const changed = () => { paintAll(); [info, hoursTab, noteTab, aud].forEach((p) => p.paint()); };
        const info = box(() => {
          const x = s(), st = storeState(x), n = storeNumbers(x), acts = h('div.row.wrap');
          if (st.k === 'PAUSED') acts.append(h('button.btn.btn--sm.btn--primary', { type: 'button', text: '恢复营业', on: { click: async () => { if (await resume(x)) changed(); } } }, UI.icon('play', 'icon--sm')));
          else if (st.k === 'OPEN') acts.append(h('button.btn.btn--sm.btn--danger', { type: 'button', text: '一键停业', on: { click: async () => { if (await pause(x)) changed(); } } }, UI.icon('pause', 'icon--sm')));
          else acts.append(h('span.muted', { text: st.k === 'REST' ? '今天休息，不需要停业' : '现在不在营业时间，不需要停业' }));
          acts.append(h('button.btn.btn--sm', { type: 'button', text: '编辑门店', on: { click: async () => { if (await edit(x)) changed(); } } }, UI.icon('edit', 'icon--sm')));
          return h('div.stack', {}, h('div.p2-kpis', {}, [['今日营业额', yuan(n.rev)], ['今日订单', n.orders + ' 单'], ['待支付订单', n.unpaid + ' 笔'], ['待履约订单', n.toFulfil + ' 笔']].map(([a, b]) => h('div', {}, h('span.muted', { text: a }), h('b.num', { text: b })))),
            A2.kv([['门店名称', x.name + '（' + x.code + '）'], ['营业状态', h('span.row.wrap', { style: { gap: 'var(--s-2)' } }, P2.badge(st.label, st.tone), h('span.muted', { text: st.note }))], ['详细地址', x.addr], ['联系电话', x.phone], ['今日营业时间', hoursToday(x)], ['取餐方式', x.modes.join('、')], ['小程序公告', x.notice || '—'], x.manual === 'PAUSED' ? ['停业提示', x.pauseNote] : null].filter(Boolean)), acts);
        });
        /* 营业时间与特殊日期 */
        const hoursTab = box(() => {
          const x = s(), rows = x.week.map((d) => ({ ...d })), body = h('div.stack');
          const grid = h('div.p2-week', { role: 'group', 'aria-label': '每周营业时间' }, rows.map((d, i) => {
            const on = h('input.switch', { type: 'checkbox', role: 'switch', checked: d.on, 'aria-label': WEEK[i] + '营业', on: { change: () => { d.on = on.checked; o.disabled = c.disabled = !d.on; } } }), o = h('input.input', { type: 'time', value: d.open, 'aria-label': WEEK[i] + '开门', disabled: !d.on, on: { input: () => (d.open = o.value) } }), c = h('input.input', { type: 'time', value: d.close, 'aria-label': WEEK[i] + '关门', disabled: !d.on, on: { input: () => (d.close = c.value) } });
            return h('div.p2-week-row', {}, h('b', { text: WEEK[i] }), h('label.row', { style: { gap: 'var(--s-2)' } }, on, h('span', { text: '营业' })), o, h('span.muted', { text: '至' }), c);
          }));
          const err = h('div.err', { role: 'alert' });
          const save = h('button.btn.btn--primary', { type: 'button', text: '保存时间', on: { click: async () => {
            err.textContent = ''; const bad = rows.findIndex((d) => d.on && (!d.open || !d.close || d.close <= d.open));
            if (bad >= 0) { err.textContent = WEEK[bad] + '的关门时间要晚于开门时间'; return; }
            if (!rows.some((d) => d.on)) { err.textContent = '一周至少要有一天营业'; return; }
            const r = await P2.act(() => { x.week = rows; const first = rows.find((d) => d.on); x.open = first.open; x.close = first.close; x.version++; A2.audit('store:edit', '修改每周营业时间', tgt(x)); });
            if (r.ok) { UI.toast('营业时间已保存'); changed(); }
          } } });
          /* 特殊日期 */
          const sd = x.specialDays.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
          const fDate = h('input.input', { type: 'date', min: today, 'aria-label': '特殊日期' }), fType = h('select.select', { 'aria-label': '类型' }, ['休息', '调整营业时间'].map((t) => h('option', { value: t, text: t }))), fO = h('input.input', { type: 'time', value: x.open, 'aria-label': '开门' }), fC = h('input.input', { type: 'time', value: x.close, 'aria-label': '关门' }), fN = h('input.input', { type: 'text', maxlength: 20, placeholder: '备注，例如 元旦休息', 'aria-label': '备注' }), eS = h('div.err', { role: 'alert' });
          const hrs = h('div.row.wrap', { style: { gap: 'var(--s-2)' } }, fO, h('span.muted', { text: '至' }), fC); hrs.hidden = true;
          fType.addEventListener('change', () => (hrs.hidden = fType.value === '休息'));
          const add = h('button.btn', { type: 'button', text: '添加', on: { click: async () => {
            eS.textContent = '';
            if (!fDate.value) { eS.textContent = '请选择日期'; return; }
            if (fDate.value < today) { eS.textContent = '日期不能早于今天'; return; }
            if (x.specialDays.some((d) => d.date === fDate.value)) { eS.textContent = '这一天已经设置过了'; return; }
            if (fType.value !== '休息' && (!fO.value || !fC.value || fC.value <= fO.value)) { eS.textContent = '关门时间要晚于开门时间'; return; }
            const r = await P2.act(() => { x.specialDays.push({ id: Math.max(0, ...x.specialDays.map((d) => d.id)) + 1, date: fDate.value, type: fType.value, open: fType.value === '休息' ? '' : fO.value, close: fType.value === '休息' ? '' : fC.value, note: fN.value.trim() }); x.version++; A2.audit('store:edit', '添加特殊日期 ' + fDate.value + '（' + fType.value + '）', tgt(x)); });
            if (r.ok) { UI.toast('已添加特殊日期'); changed(); }
          } } });
          body.append(h('h3', { text: '每周营业时间' }), grid, err, h('div.row', { style: { justifyContent: 'flex-end' } }, save), h('hr.p2-hr'), h('h3', { text: '特殊日期' }), h('p.muted', { text: '节假日休息或临时调整营业时间，到日期自动生效。' }),
            P2.mini([{ title: '日期', cls: 'c', render: (d) => d.date + '（' + WEEK[weekIdx(d.date)] + '）' }, { title: '类型', cls: 'c', render: (d) => P2.badge(d.type, 'warn') }, { title: '营业时间', cls: 'c', render: (d) => (d.type === '休息' ? '休息' : d.open + '–' + d.close) }, { title: '备注', render: (d) => d.note }, { title: '操作', cls: 'c', render: (d) => h('button.btn.btn--sm', { type: 'button', text: '删除', on: { click: async () => { if (!(await A2.danger('删除 ' + d.date + ' 的特殊日期后，这一天按每周安排营业。', { title: '删除特殊日期', ok: '确认删除' }))) return; const r = await P2.act(() => { x.specialDays.splice(x.specialDays.indexOf(d), 1); x.version++; A2.audit('store:edit', '删除特殊日期 ' + d.date, tgt(x)); }); if (r.ok) { UI.toast('已删除'); changed(); } } } }) }], sd, '没有设置特殊日期'),
            h('div.p2-addrow', {}, fDate, fType, hrs, fN, add), eS);
          return body;
        });
        /* 公告 */
        const noteTab = box(() => {
          const x = s(), ta = h('textarea.textarea', { rows: 3, maxlength: 100, 'aria-label': '小程序公告', value: x.notice }), cnt = h('span.muted.num'), err = h('div.err', { role: 'alert' });
          const prev = h('div.p2-phone', { 'aria-label': '小程序里的显示' });
          const paint = () => { const st = storeState(x); cnt.textContent = ta.value.length + ' / 100'; prev.replaceChildren(h('div.p2-phone-bar', {}, h('b', { text: x.name }), P2.badge(st.label, st.tone)), h('div.p2-phone-hours', { text: '今日 ' + hoursToday(x) + ' · ' + x.modes.join(' / ') }), h('div.p2-phone-note', {}, UI.icon('bell', 'icon--sm'), h('span', { text: ta.value.trim() || '（暂无公告）' })), h('button.btn.btn--sm' + (st.k === 'OPEN' ? '.btn--primary' : ''), { type: 'button', disabled: st.k !== 'OPEN', text: st.k === 'OPEN' ? '开始点餐' : '暂停营业' })); };
          ta.value = x.notice; ta.addEventListener('input', () => { err.textContent = ''; paint(); }); paint();
          return h('div.stack', {}, h('div.field', {}, h('label', { text: '公告内容' }), ta, h('div.row.between', {}, h('span.hint', { text: '显示在小程序门店页顶部，最多 100 字' }), cnt), err), h('div.muted', { text: '小程序里的显示' }), prev,
            h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.btn--primary', { type: 'button', text: '保存公告', on: { click: async () => {
              const v = ta.value.trim(); if (v.length < 4) { err.textContent = '公告至少写 4 个字'; return; }
              if (/(最好|第一|最低价)/.test(v)) { err.textContent = '公告里不要出现“最好、第一、最低价”这类绝对化用语'; return; }
              const r = await P2.act(() => { x.notice = v; x.version++; A2.audit('store:edit', '修改公告：' + v.slice(0, 30), tgt(x)); });
              if (r.ok) { UI.toast('公告已更新，小程序马上显示'); changed(); }
            } } }, '保存公告')));
        });
        const aud = box(() => P2.mini([{ title: '时间', cls: 'c', render: (a) => md(a.at) }, { title: '操作人', cls: 'c', render: (a) => a.actor }, { title: '操作', render: (a) => a.action }, { title: '结果', cls: 'c', render: (a) => a.result }], B.db.audit.filter((a) => a.target === tgt(s())), '还没有对这家门店的操作记录'));
        A2.detail({ title: '门店详情：' + s().name, tabs: [{ id: 'info', label: '概况', node: info }, { id: 'hours', label: '营业时间与特殊日期', node: hoursTab }, { id: 'note', label: '公告', node: noteTab }, { id: 'audit', label: '操作记录', node: aud }] });
      }

      /* ----- 组装 ----- */
      const layout = h('section.l-canvas', { 'aria-label': '门店地图' }, canvas, tl, tr, bottom);
      page.append(h('div.page-head', {}, h('div', {}, h('h2', { text: '门店' }), h('p.muted', { text: '点地图上的图钉或底部的门店卡' })), h('div.actions', {}, h('button.btn.btn--primary', { type: 'button', on: { click: () => edit(null) } }, UI.icon('plus', 'icon--sm'), h('span', { text: '新增门店' })))), layout);
      return A2.load(() => { drawMap(); paintAll(); return P2.settled(page); });
    },
  };
})();
