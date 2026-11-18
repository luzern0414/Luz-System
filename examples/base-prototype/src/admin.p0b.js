/* 示例页面：数据看板（主次布局）。其他页面照它的写法：用 A2 的共用件，布局选一种并写明理由，状态由 A2.sceneView 统一，数字用 UI.count，图表用 UI.line 等。 */
(function () {
  'use strict';
  const { h } = UI;
  const RANGES = [['today', '今天', 1], ['7', '近 7 天', 7], ['30', '近 30 天', 30]];
  window.PAGES2.dashboard = {
    title: '数据看板', group: '概览',
    layout: '主次布局',
    reason: '老板进来最关心营业额走势，所以营业额趋势做 Hero 占一半以上，订单、客单价缩成右侧小块，会员与售后放下方',
    scenes: [{ id: 'nodata', label: '所选范围没有订单' }],
    render(ctx) {
      const early = A2.sceneView(ctx, '所选范围没有订单');
      if (early) return early;
      let range = 30;
      const page = h('section.page'), head = h('div.page-head', {}, h('div', {}, h('h2', { text: '数据看板' }), h('p.muted', { text: '营业额走势是今天最该看的数字' })), h('div.actions'));
      const body = h('div');
      const seg = h('div.seg', { role: 'group', 'aria-label': '时间范围' }, RANGES.map(([k, l, n]) => h('button', { type: 'button', 'aria-pressed': String(n === range), text: l, on: { click: (e) => { range = n; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } } })));
      const exp = h('button.btn.btn--primary', { type: 'button', text: '导出', on: { click: () => A2.export('经营数据_近' + range + '天', '经营数据', range * 3) } });
      if (!A2.can('export')) exp.disabled = true;
      head.querySelector('.actions').append(seg, exp);
      page.append(head, body);
      const orders = B.db.orders;
      function series(n) {
        const today = B.NOW(); const out = [];
        for (let i = n - 1; i >= 0; i--) { const d = new Date(today.getTime() - i * 864e5), key = B.fmt(d).slice(0, 10); const day = orders.filter((o) => o.createdAt.slice(0, 10) === key && ['PAID', 'FULFILLED', 'DONE'].includes(o.status)); out.push({ label: key.slice(5).replace('-', '/'), rev: day.reduce((s, o) => s + o.amount, 0), n: day.length }); }
        return out;
      }
      function draw() {
        const n = Math.max(range, 2), s = series(n), rev = s.reduce((a, x) => a + x.rev, 0), cnt = s.reduce((a, x) => a + x.n, 0);
        body.replaceChildren();
        if (ctx.scene === 'nodata' || !cnt) { body.append(A2.empty('所选范围没有订单')); return; }
        const hero = h('article.card.hero', {}, h('div.stat', {}, h('span.stat-label', { text: '营业额' }), h('div.row.wrap', {}, h('span.stat-value.num#rev', { text: '0' }), h('span.delta.up', { text: '▲ 12.4%' })), h('span.stat-sub', { text: '较上一个相同时段' })), h('div#chart', { style: { marginTop: 'var(--s-4)', minHeight: '260px' } }));
        const small = (label, id, sub, spark) => h('article.card.card--tight.stat.stat--sm', {}, h('span.stat-label', { text: label }), h('span.stat-value.num', { id }), h('span.stat-sub', {}, sub), spark ? h('div', { id: id + '-s' }) : null);
        const refunds = B.db.refunds.filter((r) => r.status === 'PENDING').length, newMem = B.db.users.filter((u) => u.joined >= B.fmt(new Date(B.NOW().getTime() - range * 864e5)).slice(0, 10)).length;
        const grid = h('div.l-hero', {}, hero,
          Object.assign(small('订单数', 'c1', [h('span.delta.up', { text: '▲ 8.1%' }), h('span', { text: ' 日均 ' + Math.round(cnt / n) + ' 单' })], true), {}), Object.assign(small('客单价', 'c2', [h('span.delta', { text: '持平' })], true), {}),
          small('新增会员', 'c3', [h('span.delta.up', { text: '▲ 3.2%' })]), small('待处理售后', 'c4', [h('span.badge.badge--warn', { text: refunds + ' 条待审批' })]), small('会员余额合计', 'c5', [h('span.muted', { text: '全部会员' })]));
        grid.children[1].classList.add('aside'); grid.children[2].classList.add('aside'); [3, 4, 5].forEach((i) => grid.children[i].classList.add('below'));
        body.append(grid);
        UI.line(body.querySelector('#chart'), { labels: s.map((x) => x.label), series: [{ name: '营业额', data: s.map((x) => Math.round(x.rev / 100)) }], unit: ' 元', height: 280, aria: '营业额折线图，合计 ' + Math.round(rev / 100) + ' 元' });
        UI.count(body.querySelector('#rev'), rev / 100, { prefix: '¥', dec: 2 }); UI.count(body.querySelector('#c1'), cnt); UI.count(body.querySelector('#c2'), cnt ? rev / cnt / 100 : 0, { prefix: '¥', dec: 2 }); UI.count(body.querySelector('#c3'), newMem); UI.count(body.querySelector('#c4'), refunds); UI.count(body.querySelector('#c5'), B.db.users.reduce((a, u) => a + u.balance, 0) / 100, { prefix: '¥', dec: 0 });
        UI.spark(body.querySelector('#c1-s'), s.map((x) => x.n)); UI.spark(body.querySelector('#c2-s'), s.map((x) => (x.n ? x.rev / x.n / 100 : 0)), { color: 'var(--ch-2)' });
      }
      return A2.load(() => { draw(); return page; });
    },
  };
})();
