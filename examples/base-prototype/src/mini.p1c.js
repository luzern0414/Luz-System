/* 第一批页面（三）：门店与自提点（全幅画布加浮动面板）。门店数据来自 B.db.stores（5 家，第一家就是 B.shop）。 */
(function () {
  'use strict';
  const { h } = UI;
  const P1 = Mini.p1;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, a, ...k) => { const e = document.createElementNS(NS, tag); for (const [x, y] of Object.entries(a || {})) if (y != null) e.setAttribute(x, y); k.forEach((c) => c && e.append(c)); return e; };

  /* 示意地图：底色是街区，道路是白线，水面、公园是浅色块；只有图钉是可点的 */
  function drawMap() {
    const road = (d, w) => sv('path', { d, fill: 'none', stroke: 'var(--surface)', 'stroke-width': w, 'stroke-linecap': 'round' });
    const svg = sv('svg', { class: 'm1-map', viewBox: '0 0 390 760', preserveAspectRatio: 'xMidYMin slice', role: 'group', 'aria-label': '门店地图，图钉是门店位置' });
    svg.append(sv('rect', { width: 390, height: 760, fill: 'var(--surface-3)' }));
    const blocks = [[14, 128, 40, 112], [78, 128, 108, 112], [214, 128, 102, 112], [344, 128, 40, 112], [14, 270, 40, 120], [78, 270, 108, 120], [214, 270, 102, 120], [344, 270, 40, 120], [14, 412, 172, 90], [214, 412, 170, 90]];
    blocks.forEach(([x, y, w, hh]) => svg.append(sv('rect', { x, y, width: w, height: hh, rx: 8, fill: 'var(--surface-2)' })));
    svg.append(sv('rect', { x: 214, y: 150, width: 102, height: 90, rx: 10, fill: 'var(--ok-soft)' }), sv('rect', { x: 14, y: 281, width: 172, height: 100, rx: 14, fill: 'var(--info-soft)' }));
    svg.append(sv('path', { d: 'M-10 560 C 70 520 130 600 230 570 S 380 540 400 580', fill: 'none', stroke: 'var(--info-soft)', 'stroke-width': 36, 'stroke-linecap': 'round' }));
    [118, 262, 404].forEach((y) => svg.append(road(`M-10 ${y}H400`, 14)));
    [66, 200, 330].forEach((x) => svg.append(road(`M${x} -10V620`, 14)));
    svg.append(road('M-10 70L400 460', 20), road('M-10 330L120 460', 10));
    [['示例路', 108, 112], ['东湖', 100, 340], ['万象公园', 262, 205]].forEach(([t, x, y]) => svg.append(sv('text', { x, y, 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 14 }, document.createTextNode(t))));
    const me = sv('g', { transform: 'translate(200 252)', role: 'img', 'aria-label': '我的位置' }, sv('circle', { r: 18, fill: 'var(--info)', opacity: 0.18 }), sv('circle', { r: 8, fill: 'var(--info)', stroke: '#fff', 'stroke-width': 3 }));
    svg.append(me); return svg;
  }
  const pinNode = (s, st, onPick) => {
    const g = sv('g', { class: 'm1-pin', transform: `translate(${s.x} ${s.y})`, role: 'button', tabindex: '0', 'aria-label': s.name + '，' + st.label }, sv('circle', { r: 24, cy: -24, fill: 'transparent' }));
    const body = sv('g', { class: 'm1-pinbody' }, sv('path', { d: 'M0 0L-9 -17A16 16 0 1 1 9 -17Z', class: 'm1-pinshape' }), sv('path', { d: UI.icons.shop, class: 'm1-pinicon', transform: 'translate(-8 -38) scale(0.67)' }));
    g.append(body); g.addEventListener('click', () => onPick(s.id)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s.id); } });
    return g;
  };

  window.PAGES_MINI.stores = {
    title: '门店', tab: null, from: 'home', fill: true, bar: true, nav: { transparent: true, tone: 'dark', title: '门店' },
    layout: '全幅画布加浮动面板', reason: '“哪家店在哪、离我多远”是空间问题，所以地图铺满整页当画布；门店卡做成底部浮动面板，横滑选店、地图图钉联动，上拉展开成完整列表，不遮住图钉',
    scenes: [{ id: 'locdenied', label: '没有开启定位：距离不可用' }, { id: 'rest', label: '营业状态：休息中（部分门店未开门）' }, { id: 'closed', label: '营业状态：已打烊' }],
    skeleton: () => h('div', { style: { position: 'absolute', inset: 0 } }, h('div.skel', { style: { position: 'absolute', inset: 0, borderRadius: 0 } }), h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px', background: 'var(--surface)', borderRadius: '16px 16px 0 0' } }, Mini.skeleton(2))),
    render: P1.net((ctx) => {
      const denied = ctx.scene === 'locdenied', none = ctx.scene === 'empty';
      const stores = none ? [] : B.db.stores.slice().sort((a, b) => (denied ? a.id - b.id : a.dist - b.dist));
      let sel = stores.some((s) => s.id === B.db.curStore) ? B.db.curStore : stores[0] && stores[0].id, open = false;
      const root = h('div.m1-stores'), svg = drawMap(), pins = {};
      const stOf = (s) => Mini.shop.state(ctx.scene, s.hours, s.status === 'PAUSED');
      /* 图钉 */
      const label = sv('g', { class: 'm1-plabel', 'aria-hidden': 'true' }, sv('rect', { rx: 8, height: 30, y: -92 }), sv('text', { y: -71, 'text-anchor': 'middle' }));
      stores.forEach((s) => { pins[s.id] = pinNode(s, stOf(s), (id) => select(id, true)); svg.append(pins[s.id]); });
      svg.append(label);
      /* 面板 */
      const row = h('div.m1-cardrow', { role: 'list', 'aria-label': '附近门店' }), cards = {};
      const handle = h('button.m1-handle', { type: 'button', 'aria-expanded': 'false', 'aria-label': '展开门店列表' }, h('i'));
      const sheetEl = h('div.m1-spanel', {}, handle, h('div.m1-phead', {}, h('h2', { text: '附近门店' }), h('span.muted', { text: none ? '' : '共 ' + stores.length + ' 家 · ' + (denied ? '按默认顺序' : '按距离从近到远') })),
        denied ? h('div.m1-alert.m1-locwarn', { role: 'status' }, UI.icon('warn', 'icon--sm'), h('span.grow', { text: '没有开启定位，距离暂时不能显示' }), h('button.btn.btn--sm', { type: 'button', text: '去开启', on: { click: () => { UI.state.scene.stores = 'normal'; ctx.refresh(); Mini.toast('已开启定位（模拟）'); } } })) : null,
        none ? Mini.empty('附近暂时没有门店', { label: '返回', kind: 'tint', on: () => ctx.back() }, { illus: 'map', sub: '换个位置再看看' }) : row);
      stores.forEach((s) => {
        const st = stOf(s), me = s.id === sel;
        const card = h('article.m1-scard', { role: 'listitem', 'data-id': s.id },
          h('button.m1-hit', { type: 'button', 'aria-label': '选中 ' + s.name, on: { click: () => select(s.id, false) } }),
          h('div.m1-scard-top', {}, h('h3', { text: s.name }), Mini.shop.badge(st)),
          h('p.m1-smeta', {}, h('span', { text: denied ? '距离未知' : Mini.fmtDist(s.dist) }), st.canOrder && s.queue ? h('span', { text: ' · 前方 ' + s.queue + ' 单制作中' }) : st.canOrder ? h('span', { text: ' · 现在下单马上做' }) : h('span', { text: ' · ' + st.hint })),
          h('p.m1-saddr', {}, UI.icon('pin', 'icon--sm'), h('span', { text: s.addr })),
          h('p.m1-saddr', {}, UI.icon('clock', 'icon--sm'), h('span', { text: s.hours + ' · ' + s.tags.join('、') })),
          h('div.m1-sacts', {}, h('button.btn.btn--sm', { type: 'button', on: { click: () => P1.navigate(ctx, s) } }, UI.icon('navigate', 'icon--sm'), '导航'), h('button.btn.btn--sm', { type: 'button', on: { click: () => P1.call(s) } }, UI.icon('handset', 'icon--sm'), '电话'),
            h('button.btn.btn--sm.m1-pick', { type: 'button', disabled: !st.canOrder, text: st.canOrder ? '在此点单' : st.label, on: { click: () => { B.db.curStore = s.id; Mini.toast('已选择 ' + s.name); ctx.back(); } } })));
        cards[s.id] = card; row.append(card);
      });
      /* 联动：点图钉或点卡片选中，卡片横滑到哪张就选哪张 */
      let quiet = 0;
      function select(id, scrollCard) {
        sel = id; const s = stores.find((x) => x.id === id); if (!s) return;
        Object.entries(pins).forEach(([k, g]) => g.classList.toggle('on', Number(k) === id));
        Object.entries(cards).forEach(([k, c]) => { const on = Number(k) === id; c.classList.toggle('on', on); c.querySelector('.m1-pick').classList.toggle('btn--primary', on && !c.querySelector('.m1-pick').disabled); c.querySelector('.m1-pick').classList.toggle('btn--tint', !on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
        const w = Math.max(80, s.name.length * 14 + 24); label.setAttribute('transform', `translate(${s.x} ${s.y})`); label.firstChild.setAttribute('x', -w / 2); label.firstChild.setAttribute('width', w); label.lastChild.textContent = s.name;
        svg.append(label);
        if (scrollCard && cards[id]) { quiet = Date.now() + 500; if (open) cards[id].scrollIntoView({ block: 'nearest', behavior: UI.rm ? 'auto' : 'smooth' }); else row.scrollTo({ left: cards[id].offsetLeft - 16, behavior: UI.rm ? 'auto' : 'smooth' }); }
      }
      let raf = 0;
      row.addEventListener('scroll', () => { if (open || Date.now() < quiet || raf) return; raf = requestAnimationFrame(() => { raf = 0; const x = row.scrollLeft + row.clientWidth / 3, c = stores.find((s, i) => { const el = cards[s.id]; return el.offsetLeft + el.offsetWidth > x + 16; }) || stores[stores.length - 1]; if (c && c.id !== sel) select(c.id, false); }); }, { passive: true });
      /* 上拉展开：点把手或上下拖 */
      const setOpen = (v) => { open = v; root.classList.toggle('is-open', v); handle.setAttribute('aria-expanded', String(v)); handle.setAttribute('aria-label', v ? '收起门店列表' : '展开门店列表'); if (v && cards[sel]) setTimeout(() => cards[sel].scrollIntoView({ block: 'nearest' }), 0); else if (!v && cards[sel]) row.scrollTo({ left: cards[sel].offsetLeft - 16 }); };
      let y0 = null, moved = false, skip = false;
      handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; handle.setPointerCapture && handle.setPointerCapture(e.pointerId); });
      handle.addEventListener('pointermove', (e) => { if (y0 != null && Math.abs(e.clientY - y0) > 10) moved = true; });
      handle.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (moved && Math.abs(dy) > 30) { setOpen(dy < 0); skip = true; setTimeout(() => { skip = false; }, 50); } });
      handle.addEventListener('click', () => { if (!skip) setOpen(!open); });
      root.append(svg, sheetEl);
      root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); e.stopPropagation(); } });
      if (sel != null) { select(sel, false); requestAnimationFrame(() => { if (cards[sel]) row.scrollTo({ left: cards[sel].offsetLeft - 16 }); }); }
      return root;
    }),
  };
})();
