/* 导入导出（横带分层）：概览数字、近 14 天任务量、任务明细三条带。
   导出：同步不超过 5000 行直接下载，更多转后台任务并自动推进；导入：五步（下载模板、选择文件、校验预览、确认导入、结果），真的改 B.db.products 或 B.db.users 并写审计。 */
(function () {
  'use strict';
  const { h } = UI;

  const SYNC_LIMIT = 5000, HARD_LIMIT = 50000;
  const RANGES = [['7', '近 7 天', 7], ['30', '近 30 天', 30], ['90', '近 90 天', 90], ['365', '近 1 年', 365], ['all', '全部时间', 1095]];
  const STATUS = { RUNNING: ['进行中', 'info'], DONE: ['已完成', 'ok'], FAILED: ['失败', 'bad'] };
  const KIND_NAME = { 储值: '储值流水' };
  const kindOf = (t) => KIND_NAME[t.kind] || t.kind;
  const money = (c) => (c / 100).toFixed(2);

  /* ---------- 导出类型：每天大约有多少行、可选的列、可加的筛选 ---------- */
  const EXPORTS = {
    订单: { per: 110, cols: ['订单号', '下单时间', '会员', '手机号', '商品', '实付金额（元）', '优惠金额（元）', '支付方式', '状态', '备注'], filter: { key: 'status', label: '订单状态', opts: [['', '全部状态', 1], ['DONE', '已完成', 0.55], ['PAID', '待履约', 0.1], ['CANCELLED', '已取消', 0.08], ['REFUNDED', '已退款', 0.06]] }, mask: '手机号' },
    会员: { per: 3.4, cols: ['姓名', '手机号', '会员等级', '积分', '储值余额（元）', '加入日期', '状态'], filter: { key: 'level', label: '会员等级', opts: [['', '全部等级', 1], ['金卡', '金卡', 0.12], ['银卡', '银卡', 0.28], ['普通', '普通', 0.6]] }, mask: '手机号', dateLabel: '加入时间' },
    储值流水: { per: 290, cols: ['流水时间', '会员', '类型', '金额（元）', '关联单号'], filter: { key: 'kind', label: '流水类型', opts: [['', '全部类型', 1], ['充值', '充值', 0.2], ['消费', '消费', 0.55], ['退款', '退款', 0.1], ['赠送', '赠送', 0.15]] } },
    审计: { per: 75, cols: ['操作时间', '操作人', '操作', '对象', '结果', '来源地址（脱敏）', '请求编号'], filter: { key: 'result', label: '结果', opts: [['', '全部结果', 1], ['成功', '成功', 0.93], ['失败', '失败', 0.07]] } },
  };
  const GET = {
    订单: (db, o) => { const u = db.users.find((x) => x.id === o.userId); return { 订单号: o.no, 下单时间: o.createdAt, 会员: o.userName, 手机号: P3.mask(u && u.phone), 商品: o.items.map((i) => i.name + '×' + i.qty).join('；'), '实付金额（元）': money(o.amount), '优惠金额（元）': money(o.discount), 支付方式: B.PAY[o.pay], 状态: B.ORDER_STATUS[o.status], 备注: o.remark }; },
    会员: (db, u) => ({ 姓名: u.name, 手机号: P3.mask(u.phone), 会员等级: u.level, 积分: u.points, '储值余额（元）': money(u.balance), 加入日期: u.joined, 状态: u.status === 'ENABLED' ? '正常' : '已禁用' }),
    储值流水: (db, l) => ({ 流水时间: l.at, 会员: l.userName, 类型: l.kind, '金额（元）': money(l.amount), 关联单号: l.ref }),
    审计: (db, a) => ({ 操作时间: a.at, 操作人: a.actor, 操作: a.action, 对象: a.target, 结果: a.result, '来源地址（脱敏）': a.ip.replace(/\.\d+$/, '.*'), 请求编号: a.trace }),
    通知: (db, l) => ({ 时间: l.at, 会员: l.userName, 场景: l.scene, 渠道: l.channel, 状态: { OK: '成功', FAIL: '失败', RETRY: '重试中' }[l.status], 失败原因: l.reason }),
  };
  const SOURCE = { 订单: (db) => db.orders, 会员: (db) => db.users, 储值流水: (db) => db.walletLogs, 审计: (db) => db.audit, 通知: (db) => db.sendLogs };
  const DATEKEY = { 订单: 'createdAt', 会员: 'joined', 储值流水: 'at', 审计: 'at', 通知: 'at' };
  const FKEY = { 订单: 'status', 会员: 'level', 储值流水: 'kind', 审计: 'result' };

  /** 按任务记下的条件，从演示数据里取出真正的行，生成文件内容（原型里的文件只含示例数据） */
  function buildExport(t) {
    const db = B.db, kind = kindOf(t), get = GET[kind], spec = t.spec || {};
    if (!get) return { header: ['任务名', '类型', '行数', '导出时间', '导出人'], rows: [[t.name, kind, t.rows, t.at, t.by]] };
    const cols = spec.cols || EXPORTS[kind]?.cols || Object.keys(get(db, SOURCE[kind](db)[0]));
    const days = spec.days || 0, since = days && days < 1095 ? P3.dayKey(days - 1) : '';
    const fk = FKEY[kind], fv = spec.filter || '';
    const rows = SOURCE[kind](db).filter((r) => (!since || String(r[DATEKEY[kind]]) >= since) && (!fv || r[fk] === fv)).slice(0, 500).map((r) => { const o = get(db, r); return cols.map((c) => o[c]); });
    return { header: cols, rows };
  }

  /* ---------- 演示数据：导出任务的进度与原因、近 14 天任务量、导入记录的明细 ---------- */
  P3.onSeed(function seedExchange(db) {
    db.exportTasks.forEach((t) => {
      t._seed = true;
      if (t.status === 'RUNNING') t.progress = 38;
      if (t.status === 'FAILED') t.fail = '导出过程中连接中断，文件没有生成';
      t.cond = { 1: '范围：近 30 天；订单状态：全部状态', 2: '范围：全部时间；会员等级：全部等级', 3: '范围：本月；流水类型：全部类型', 4: '范围：上周；结果：全部结果' }[t.id] || '范围：全部';
    });
    const r = B.rng(131);
    db.exchangeDaily = Array.from({ length: 14 }, (_, i) => ({ day: P3.dayKey(13 - i), exp: i === 13 ? 0 : 2 + Math.floor(r() * 6), imp: r() < 0.3 ? 1 : 0, fail: r() < 0.25 ? 1 : 0 }));
    db.importTasks.forEach((t) => {
      t._seed = true;
      if (t.id === 1) { t.added = 30; t.updated = 15; t.failRows = [{ line: 7, reason: '价格不是数字，请填写如 18.00', raw: ['黑椒意面', '主食', '二十', '40', '上架', ''] }, { line: 19, reason: '分类「甜品」不存在，可选：热销、主食、轻食、早餐', raw: ['杨枝甘露', '甜品', '12.00', '30', '上架', ''] }, { line: 33, reason: '商品名称与第 12 行重复', raw: ['招牌牛腩饭', '主食', '22.00', '50', '上架', ''] }]; }
      else { t.added = t.ok; t.updated = 0; t.failRows = []; }
    });
  });

  /* ---------- 后台任务自动推进：每 2 秒多一步，完成或失败时提示；页面不在也照常推进 ---------- */
  let timer = null;
  function tick() {
    const running = B.db.exportTasks.filter((t) => t.status === 'RUNNING');
    if (!running.length) return;
    const done = [], failed = [];
    running.forEach((t) => {
      t.progress = Math.min(100, (t.progress || 0) + 9 + ((t.id * 7) % 11));
      if (t.failAt && t.progress >= t.failAt) { t.status = 'FAILED'; t.fail = '生成超时，数据量较大，请缩小时间范围后重试'; failed.push(t); }
      else if (t.progress >= 100) { t.status = 'DONE'; t.progress = 100; done.push(t); }
    });
    window.dispatchEvent(new CustomEvent('p3-tasks', { detail: { done, failed } }));
    done.forEach((t) => UI.toast('导出完成：' + t.name));
    failed.forEach((t) => UI.toast('导出失败：' + t.name, { kind: 'bad' }));
  }
  timer = setInterval(tick, 2000);

  /* ---------- 导入类型：模板说明与示例文件 ---------- */
  const IMPORTS = {
    商品: { noun: '个商品', key: '商品名称', page: 'products', pageName: '商品', cols: [['商品名称', '必填', '最多 20 个字；名称相同的商品会被更新，不会重复新增'], ['分类', '必填', '热销、主食、轻食、早餐 四选一'], ['价格（元）', '必填', '0.01 到 999.99，最多两位小数'], ['库存', '选填', '0 到 9999 的整数，不填按 50'], ['状态', '选填', '上架或下架，不填按上架'], ['描述', '选填', '最多 40 个字']], sample: [['香煎三文鱼饭', '主食', '28.00', '40', '上架', '香煎三文鱼配时蔬'], ['红烧鸡腿饭', '主食', '19.00', '60', '上架', '']] },
    会员: { noun: '位会员', key: '手机号', page: 'members', pageName: '会员', cols: [['姓名', '必填', '最多 10 个字'], ['手机号', '必填', '11 位数字；手机号相同的会员会被更新，不会重复新增'], ['会员等级', '选填', '普通、银卡、金卡，不填按普通'], ['积分', '选填', '0 以上的整数'], ['储值余额（元）', '选填', '0 以上，最多两位小数']], sample: [['孙晓雨', '13900000101', '银卡', '300', '50.00'], ['郑思远', '13900000102', '普通', '0', '0']] },
  };
  const SAMPLES = [['mixed', '示例一：有几行填错了'], ['clean', '示例二：全部填对了'], ['header', '示例三：表头和模板对不上']];
  const catId = (name) => (B.CATS.find((c) => c.name === name) || {}).id;
  const catName = (id) => (B.CATS.find((c) => c.id === id) || {}).name || id;

  function sampleRows(kind, sample) {
    const db = B.db, P = db.products, U = db.users;
    if (kind === '商品') {
      const up = (p, d, st) => [p.name, catName(p.cat), (p.price / 100 + d).toFixed(2), String(st), '上架', ''];
      const all = [['香煎三文鱼饭', '主食', '28.00', '40', '上架', '香煎三文鱼配时蔬'], up(P[0], 1, 90), ['照烧鸡排饭', '主食', '19.50', '55', '上架', '照烧酱汁鸡排'], ['', '主食', '16.00', '30', '上架', ''], up(P[2], 0.5, 70), ['咖喱牛肉饭', '主食', 'abc', '35', '上架', ''], ['番茄鸡蛋面', '主食', '13.00', '45', '上架', ''], ['杨枝甘露', '甜品', '12.00', '30', '上架', ''], ['南瓜小米粥', '早餐', '9.00', '80', '上架', '暖胃小米粥'], ['香煎三文鱼饭', '主食', '28.00', '40', '上架', ''], [P[4].name, catName(P[4].cat), (P[4].price / 100).toFixed(2), '65', '下架', ''], ['蔬菜沙拉', '轻食', '15.00', '-5', '上架', '']];
      return sample === 'clean' ? [all[0], all[1], all[2], all[4], all[6], all[8], all[10], ['鲜虾云吞面', '主食', '21.00', '35', '上架', '']] : all;
    }
    const all = [['孙晓雨', '13900000101', '银卡', '300', '50.00'], [U[1].name, U[1].phone, '金卡', '2200', (U[1].balance / 100).toFixed(2)], ['郑思远', '13900000102', '普通', '0', '0'], ['', '13900000103', '普通', '0', '0'], ['周婷', '1390000', '银卡', '120', '0'], [U[3].name, U[3].phone, '银卡', '860', (U[3].balance / 100).toFixed(2)], ['冯浩', '13900000106', '钻石卡', '0', '0'], ['蒋文静', '13900000104', '普通', '40', '20.00'], ['沈佳怡', '13900000102', '普通', '0', '0'], ['韩雪', '13900000105', '普通', '0', '0']];
    return sample === 'clean' ? [all[0], all[1], all[2], all[5], all[7], all[9]] : all;
  }

  /** 逐行校验：每行给出 新增、更新或失败，失败写清行号对应的原因（业务语言）；同一文件里重复的唯一键，第二次出现的行判为失败 */
  function validateRows(kind, rows) {
    const db = B.db, seen = {}, out = [];
    rows.forEach((raw, i) => {
      const line = i + 2, cell = (k) => String(raw[k] == null ? '' : raw[k]).trim();
      const row = { line, raw, kind: 'new', reason: '', norm: null, note: '' };
      const fail = (why) => { row.kind = 'fail'; row.reason = why; return row; };
      if (kind === '商品') {
        const name = cell(0), cat = cell(1), price = cell(2), stock = cell(3), st = cell(4), desc = cell(5);
        out.push(row);
        if (!name) return fail('商品名称为空');
        if ([...name].length > 20) return fail('商品名称不能超过 20 个字');
        if (!catId(cat)) return fail('分类「' + cat + '」不存在，可选：' + B.CATS.map((c) => c.name).join('、'));
        if (price === '' || isNaN(Number(price))) return fail('价格不是数字，请填写如 18.00');
        if (!/^\d+(\.\d{1,2})?$/.test(price) || +price < 0.01 || +price > 999.99) return fail('价格要在 0.01 到 999.99 之间，最多两位小数');
        if (stock !== '' && (!/^\d+$/.test(stock) || +stock > 9999)) return fail('库存必须是 0 到 9999 的整数');
        if (st && !['上架', '下架'].includes(st)) return fail('状态只能填上架或下架');
        if ([...desc].length > 40) return fail('描述不能超过 40 个字');
        if (seen[name]) return fail('商品名称与第 ' + seen[name] + ' 行重复');
        seen[name] = line;
        row.norm = { name, cat: catId(cat), price: Math.round(price * 100), stock: stock === '' ? 50 : +stock, status: st === '下架' ? 'OFF' : 'ON', desc };
        const old = db.products.find((p) => p.name === name);
        if (old) { row.kind = 'update'; row.target = old; const ch = []; if (old.price !== row.norm.price) ch.push('价格 ¥' + money(old.price) + ' → ¥' + money(row.norm.price)); if (old.stock !== row.norm.stock) ch.push('库存 ' + old.stock + ' → ' + row.norm.stock); if (old.status !== row.norm.status) ch.push('状态 ' + (old.status === 'ON' ? '上架' : '下架') + ' → ' + (row.norm.status === 'ON' ? '上架' : '下架')); if (old.cat !== row.norm.cat) ch.push('分类 ' + catName(old.cat) + ' → ' + catName(row.norm.cat)); row.note = ch.join('；') || '没有变化'; }
        else row.note = '新增：¥' + money(row.norm.price) + '，库存 ' + row.norm.stock;
      } else {
        const name = cell(0), phone = cell(1), level = cell(2), pts = cell(3), bal = cell(4);
        out.push(row);
        if (!name) return fail('姓名为空');
        if ([...name].length > 10) return fail('姓名不能超过 10 个字');
        if (!/^1[3-9]\d{9}$/.test(phone)) return fail('手机号格式不对，应为 11 位数字');
        if (level && !['普通', '银卡', '金卡'].includes(level)) return fail('会员等级「' + level + '」不存在，可选：普通、银卡、金卡');
        if (pts !== '' && !/^\d+$/.test(pts)) return fail('积分必须是 0 以上的整数');
        if (bal !== '' && !/^\d+(\.\d{1,2})?$/.test(bal)) return fail('储值余额必须是 0 以上的金额，最多两位小数');
        if (seen[phone]) return fail('手机号与第 ' + seen[phone] + ' 行重复');
        seen[phone] = line;
        row.norm = { name, phone, level: level || '普通', points: pts === '' ? 0 : +pts, balance: bal === '' ? 0 : Math.round(bal * 100) };
        const old = db.users.find((u) => u.phone === phone);
        if (old) { row.kind = 'update'; row.target = old; const ch = []; if (old.level !== row.norm.level) ch.push('等级 ' + old.level + ' → ' + row.norm.level); if (old.points !== row.norm.points) ch.push('积分 ' + old.points + ' → ' + row.norm.points); if (old.balance !== row.norm.balance) ch.push('储值 ¥' + money(old.balance) + ' → ¥' + money(row.norm.balance)); row.note = ch.join('；') || '没有变化'; }
        else row.note = '新增：' + row.norm.level + '，积分 ' + row.norm.points;
      }
    });
    return out;
  }

  /** 把校验通过的行真的写进 B.db.products 或 B.db.users */
  function applyRows(kind, res) {
    const db = B.db;
    res.filter((r) => r.kind !== 'fail').forEach((r) => {
      if (kind === '商品') {
        if (r.kind === 'update') Object.assign(r.target, { price: r.norm.price, stock: r.norm.stock, status: r.norm.status, cat: r.norm.cat, desc: r.norm.desc || r.target.desc });
        else { const id = Math.max(0, ...db.products.map((p) => p.id)) + 1, tpl = db.products[id % 12] || db.products[0]; db.products.push({ id, name: r.norm.name, price: r.norm.price, orig: Math.round((r.norm.price * 1.2) / 100) * 100, cat: r.norm.cat, desc: r.norm.desc, img: tpl.img, sales: 0, stock: r.norm.stock, status: r.norm.status, specs: tpl.specs, tags: ['新品'], sort: id }); r.created = db.products[db.products.length - 1]; }
      } else if (r.kind === 'update') Object.assign(r.target, { name: r.norm.name, level: r.norm.level, points: r.norm.points, balance: r.norm.balance });
      else { const id = Math.max(0, ...db.users.map((u) => u.id)) + 1; db.users.push({ id, name: r.norm.name, phone: r.norm.phone, level: r.norm.level, points: r.norm.points, balance: r.norm.balance, joined: P3.today(), status: 'ENABLED', orders: 0, spent: 0, openidHint: 'o' + (100000 + id) }); }
    });
  }

  /* ---------- 页面 ---------- */
  window.PAGES2.exchange = {
    title: '导入导出', group: '系统',
    layout: '横带分层',
    reason: '运营先要知道“有没有任务卡住、失败了几个”，再看近 14 天的任务量有没有异常，最后才去任务明细里下载、重试或做一次导入；结论到细节自上而下，所以用三条横带，不用左右分栏',
    scenes: [
      { id: 'no-tasks', label: '还没有任何导入导出任务' },
      { id: 'export-timeout', label: '导出失败：数据太多，生成超时' },
      { id: 'import-bad-file', label: '导入失败：文件表头和模板对不上' },
    ],
    render(ctx) {
      const early = A2.sceneView(ctx, '还没有导入导出任务');
      if (early) return early;
      return A2.load(() => build(ctx));
    },
  };

  function build(ctx) {
    const db = B.db, scene = ctx.scene, page = h('section.page.p3-page');
    const flash = new Set();
    const exps = () => (scene === 'no-tasks' ? db.exportTasks.filter((t) => !t._seed) : db.exportTasks);
    const imps = () => (scene === 'no-tasks' ? db.importTasks.filter((t) => !t._seed) : db.importTasks);

    /* ===== 带一：概览数字 ===== */
    const statsHost = h('div'), chartHost = h('div'), chartNote = h('p.muted');
    let statsFirst = true;
    function paintStats() {
      const ex = exps(), im = imps(), running = ex.filter((t) => t.status === 'RUNNING'), failed = ex.filter((t) => t.status === 'FAILED'), month = P3.today().slice(0, 7);
      const monthCnt = ex.filter((t) => t.at.startsWith(month) && t.status !== 'FAILED').length + (scene === 'no-tasks' ? 0 : db.exchangeDaily.filter((d) => d.day.startsWith(month)).reduce((s, d) => s + d.exp, 0));
      const okRows = im.reduce((s, t) => s + t.ok, 0), allRows = im.reduce((s, t) => s + t.total, 0), rate = allRows ? (okRows / allRows) * 100 : 0;
      const slow = running.length ? Math.min(...running.map((t) => t.progress || 0)) : 0;
      const items = [
        { label: '进行中', v: running.length, sub: running.length ? [h('span.badge.badge--info', { text: '最慢的完成 ' + slow + '%' })] : [h('span.muted', { text: '没有进行中的任务' })] },
        { label: '失败', v: failed.length, sub: failed.length ? [h('span.badge.badge--bad', { text: '需要重试' })] : [h('span.muted', { text: '没有失败的任务' })] },
        { label: '本月导出次数', v: monthCnt, sub: [h('span.muted', { text: '不含失败的' })] },
        { label: '导入成功率', v: rate, opt: { dec: 1, suffix: '%' }, none: !allRows, sub: [h('span.muted', { text: '共导入 ' + im.length + ' 次' })] },
      ];
      const wrap = h('div.band-stats');
      items.forEach((it, i) => { const v = h('span.stat-value.num', { text: '0' }); wrap.append(h('div.stat' + (i ? '.stat--sm' : ''), {}, h('span.stat-label', { text: it.label }), v, h('span.stat-sub', {}, it.sub))); if (it.none) v.textContent = '—'; else if (statsFirst) UI.count(v, it.v, it.opt || {}); else v.textContent = it.opt ? it.v.toFixed(1) + '%' : P3.n(it.v); });
      statsFirst = false;
      statsHost.replaceChildren(wrap);
    }

    /* ===== 带二：近 14 天任务量 ===== */
    function dailySeries() {
      const labels = [], exp = [], imp = [], fail = [];
      for (let i = 13; i >= 0; i--) {
        const day = P3.dayKey(i), base = scene === 'no-tasks' ? { exp: 0, imp: 0, fail: 0 } : db.exchangeDaily.find((d) => d.day === day) || { exp: 0, imp: 0, fail: 0 };
        const e = exps().filter((t) => t.at.startsWith(day)), m = imps().filter((t) => t.at.startsWith(day));
        labels.push(day.slice(5).replace('-', '/'));
        const okE = scene === 'no-tasks' ? 0 : base.exp;
        exp.push(okE + e.filter((t) => t.status !== 'FAILED').length); imp.push((scene === 'no-tasks' ? 0 : base.imp) + m.length); fail.push((scene === 'no-tasks' ? 0 : base.fail) + e.filter((t) => t.status === 'FAILED').length);
      }
      return { labels, exp, imp, fail };
    }
    function paintChart() {
      const d = dailySeries(), tot = d.labels.map((_, i) => d.exp[i] + d.imp[i] + d.fail[i]), sum = tot.reduce((a, b) => a + b, 0), peak = tot.indexOf(Math.max(...tot));
      chartHost.replaceChildren(h('div'));
      if (!sum) { chartHost.replaceChildren(A2.empty('近 14 天没有导入导出任务')); chartNote.textContent = ''; return; }
      UI.bars(chartHost.firstChild, { labels: d.labels, stacked: true, unit: ' 个', height: 220, aria: '近 14 天导入导出任务量堆叠柱图：共 ' + sum + ' 个任务，导出 ' + d.exp.reduce((a, b) => a + b, 0) + ' 个，导入 ' + d.imp.reduce((a, b) => a + b, 0) + ' 个，失败 ' + d.fail.reduce((a, b) => a + b, 0) + ' 个，任务最多的一天是 ' + d.labels[peak] + '（' + tot[peak] + ' 个）', series: [{ name: '导出', data: d.exp }, { name: '导入', data: d.imp, color: 'var(--ch-3)' }, { name: '失败', data: d.fail, color: 'var(--bad)' }] });
      chartNote.textContent = '近 14 天共 ' + sum + ' 个任务，导出 ' + d.exp.reduce((a, b) => a + b, 0) + ' 个、导入 ' + d.imp.reduce((a, b) => a + b, 0) + ' 个，其中 ' + d.fail.reduce((a, b) => a + b, 0) + ' 个失败；任务最多的一天是 ' + d.labels[peak] + '（' + tot[peak] + ' 个）。';
    }

    /* ===== 带三：任务明细 ===== */
    const ex = { status: 'all', kind: '', q: '' };
    let exTable, exSeg, exBatch, exBatchText, exBatchRetry, exBatchDel;
    const exRows = () => exps().filter((t) => (ex.status === 'all' || t.status === ex.status) && (!ex.kind || kindOf(t) === ex.kind) && (!ex.q || t.name.includes(ex.q)));
    function paintExSeg() {
      const all = exps().filter((t) => (!ex.kind || kindOf(t) === ex.kind) && (!ex.q || t.name.includes(ex.q))), n = (s) => (s === 'all' ? all.length : all.filter((t) => t.status === s).length);
      exSeg.replaceChildren(A2.statusTabs([{ id: 'all', label: '全部', count: n('all') }, { id: 'RUNNING', label: '进行中', count: n('RUNNING') }, { id: 'DONE', label: '已完成', count: n('DONE') }, { id: 'FAILED', label: '失败', count: n('FAILED') }], ex.status, (v) => { ex.status = v; refreshEx(); }));
    }
    function updateExSel(sel) { const picked = sel || exTable.selected(), canRetry = picked.filter((t) => t.status === 'FAILED').length, canDel = picked.filter((t) => t.status !== 'RUNNING').length; exBatch.hidden = !picked.length; exBatchText.textContent = '已选 ' + picked.length + ' 个任务，其中 ' + canRetry + ' 个可重试，' + canDel + ' 个可删除'; exBatchRetry.disabled = !canRetry; exBatchDel.disabled = !canDel; }
    function refreshEx(keep) { paintExSeg(); if (keep) exTable.clear(); else exTable.setRows(exRows()); updateExSel([]); P3.flash(exTable.el); flash.clear(); paintStats(); paintChart(); tabsUI.count(0, exps().length); }
    function statusCell(t) {
      const m = STATUS[t.status], wrap = h('div.p3-prog', { 'data-task': t.id });
      wrap.append(h('span.badge.badge--' + m[1], { text: m[0] + (t.status === 'RUNNING' ? ' ' + (t.progress || 0) + '%' : '') }));
      if (t.status === 'RUNNING') wrap.append(h('div.progress', { role: 'progressbar', 'aria-label': '导出进度', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': t.progress || 0 }, h('i', { style: { '--v': (t.progress || 0) / 100 } })));
      if (t.status === 'FAILED') wrap.append(h('div.muted.p3-why', { text: t.fail || '导出失败', title: t.fail || '' }));
      return wrap;
    }
    function exportsPanel() {
      exSeg = h('div'); exBatchText = h('span.grow', { 'aria-live': 'polite' });
      exBatchRetry = h('button.btn.btn--sm.btn--primary', { type: 'button', text: '批量重试', on: { click: batchRetry } });
      exBatchDel = h('button.btn.btn--sm.btn--danger', { type: 'button', text: '批量删除', on: { click: batchDelete } });
      exBatch = h('div.p3-note', { hidden: true }, UI.icon('info', 'icon--sm'), exBatchText, exBatchRetry, exBatchDel, h('button.btn.btn--sm.btn--ghost', { type: 'button', text: '取消选择', on: { click: () => { exTable.clear(); updateExSel([]); } } }));
      const kindSel = h('select.select', { 'aria-label': '类型', style: { width: '140px' }, on: { change: (e) => { ex.kind = e.target.value; refreshEx(); } } }, h('option', { value: '', text: '全部类型' }), ['订单', '会员', '储值流水', '审计', '通知'].map((k) => h('option', { value: k, text: k })));
      const search = A2.search('任务名', (v) => { ex.q = v; refreshEx(); });
      exTable = A2.table({
        caption: '导出任务', selectable: true, empty: scene === 'no-tasks' ? '还没有导出任务，点右上角“新建导出”试试' : '没有符合条件的导出任务', rows: exRows(), onSelect: updateExSel, rowClass: (t) => (flash.has(t) ? 'p3-flash' : ''),
        columns: [
          { title: '任务名', ell: true, render: (t) => h('button.btn.btn--ghost.btn--sm.p3-link', { type: 'button', text: t.name, title: t.name, on: { click: () => exportDetail(t) } }) },
          { title: '类型', cls: 'p3-nw', render: (t) => kindOf(t) },
          { title: '行数', cls: 'r', render: (t) => P3.n(t.rows) },
          { title: '状态', render: statusCell },
          { title: '创建时间', cls: 'p3-nw num', render: (t) => P3.md(t.at) },
          { title: '创建人', cls: 'p3-nw p3-hs', render: (t) => t.by },
          { title: '操作', cls: 'p3-nw', render: (t) => h('div.row', { style: { gap: 'var(--s-1)' } }, t.status === 'DONE' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '下载', 'aria-label': '下载 ' + t.name, on: { click: () => downloadTask(t) } }) : null, t.status === 'FAILED' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '重试', 'aria-label': '重试 ' + t.name, on: { click: () => retryTask(t) } }) : null, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '删除', 'aria-label': '删除 ' + t.name, 'aria-disabled': t.status === 'RUNNING' ? 'true' : null, on: { click: () => deleteTask(t) } })) },
        ],
      });
      paintExSeg(); updateExSel([]);
      return h('div.stack', {}, h('div.card.card--tight.p3-toolbar', {}, exSeg, h('span.grow'), kindSel, search), exBatch, exTable.el);
    }
    async function downloadTask(t) {
      if (!A2.can('export')) return UI.toast('当前角色没有导出权限', { kind: 'bad' });
      try { await UI.request(null, 400); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      const f = buildExport(t), name = t.name.replace(/\.xlsx$/, '') + '.csv';
      P3.download(name, P3.csv(f.header, f.rows));
      P3.audit('export', '下载导出文件', t.name);
      UI.toast('已开始下载 ' + name);
    }
    async function retryTask(t) {
      try { await UI.request(null, 500); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      resubmit(t); flash.add(t); refreshEx(true); P3.audit('export', '重新提交导出', t.name); UI.toast('已重新提交，生成完成后会提示你');
    }
    function resubmit(t) { t.status = 'RUNNING'; t.progress = 0; t.fail = ''; t.at = P3.stamp(); t.failAt = scene === 'export-timeout' ? 60 : 0; }
    async function deleteTask(t) {
      if (t.status === 'RUNNING') return UI.toast('进行中的任务不能删除，等它完成或失败后再删', { kind: 'bad' });
      if (!(await A2.danger('删除任务「' + t.name + '」后无法再下载这份文件，导出记录只在审计里保留。', { ok: '确认删除', title: '删除导出任务' }))) return;
      try { await UI.request(null, 400); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      db.exportTasks.splice(db.exportTasks.indexOf(t), 1); P3.audit('export', '删除导出任务', t.name); refreshEx(); UI.toast('已删除任务');
    }
    async function batchRetry() {
      const picked = exTable.selected(), can = picked.filter((t) => t.status === 'FAILED');
      if (!can.length || !(await UI.confirm('将重新提交 ' + can.length + ' 个失败的导出任务' + (picked.length > can.length ? '；另外 ' + (picked.length - can.length) + ' 个不是失败状态，已跳过' : '') + '。', { title: '批量重试', ok: '确认重试' }))) return;
      try { await UI.request(null, 600); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      can.forEach((t) => { resubmit(t); flash.add(t); }); P3.audit('export', '批量重新提交导出', '共 ' + can.length + ' 个任务'); refreshEx();
      UI.toast('已重新提交 ' + can.length + ' 个任务' + (picked.length > can.length ? '，跳过 ' + (picked.length - can.length) + ' 个' : ''));
    }
    async function batchDelete() {
      const picked = exTable.selected(), can = picked.filter((t) => t.status !== 'RUNNING');
      if (!can.length || !(await A2.danger('将删除 ' + can.length + ' 个导出任务，文件无法再下载' + (picked.length > can.length ? '；另外 ' + (picked.length - can.length) + ' 个进行中的任务不能删除，已跳过' : '') + '。', { ok: '确认删除', title: '批量删除' }))) return;
      try { await UI.request(null, 600); } catch (e) { return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      can.forEach((t) => db.exportTasks.splice(db.exportTasks.indexOf(t), 1)); P3.audit('export', '批量删除导出任务', '共 ' + can.length + ' 个任务'); refreshEx();
      UI.toast('已删除 ' + can.length + ' 个任务' + (picked.length > can.length ? '，跳过 ' + (picked.length - can.length) + ' 个进行中的' : ''));
    }
    function exportDetail(t) {
      const m = STATUS[t.status], cols = (t.spec && t.spec.cols) || (EXPORTS[kindOf(t)] && EXPORTS[kindOf(t)].cols) || [];
      const logs = db.audit.filter((a) => a.target === t.name).slice(0, 8);
      A2.detail({ title: '导出任务 · ' + t.name, tabs: [
        { label: '概况', node: h('div.stack', {}, A2.kv([['任务名', t.name], ['类型', kindOf(t)], ['行数', P3.n(t.rows) + ' 行' + (t.rows > SYNC_LIMIT ? '（超过 ' + P3.n(SYNC_LIMIT) + ' 行，走后台任务）' : '')], ['状态', A2.status(STATUS, t.status)], ['创建人', t.by], ['创建时间', t.at], ['文件有效期', t.status === 'DONE' ? '生成后 24 小时内可下载' : '—']]), t.status === 'FAILED' ? P3.alert('bad', '失败原因：' + (t.fail || '导出失败') + '。可以点“重试”重新提交。') : t.status === 'RUNNING' ? P3.alert('info', '正在生成，已完成 ' + (t.progress || 0) + '%，离开页面也会继续，完成后会提示你。') : null) },
        { label: '导出条件', node: h('div.stack', {}, A2.kv([['条件', t.cond || '全部数据'], ['导出的列', cols.length ? cols.join('、') : '全部列']]), h('p.muted', { text: '文件里的手机号等个人信息默认脱敏，需要明文请另行申请。' })) },
        { label: '操作记录', node: logs.length ? h('div.list', {}, logs.map((a) => h('div', {}, h('span.num.muted', { text: P3.md(a.at) }), h('span.grow', { text: a.actor + ' ' + a.action }), P3.badge(a.result, a.result === '成功' ? 'ok' : 'bad')))) : A2.empty('还没有这个任务的操作记录') },
      ], actions: [{ label: '关闭', value: null }].concat(t.status === 'DONE' ? [{ label: '下载', kind: 'primary', value: 'dl' }] : t.status === 'FAILED' ? [{ label: '重试', kind: 'primary', value: 'retry' }] : []) }).then((v) => { if (v === 'dl') downloadTask(t); if (v === 'retry') retryTask(t); });
    }

    /* 新建导出：类型、范围、筛选、列；预计行数决定同步、后台任务还是不能导 */
    function newExport() {
      if (!A2.can('export')) return UI.toast('当前角色没有导出权限', { kind: 'bad' });
      const st = { kind: '订单', range: '30', filter: '', cols: new Set(EXPORTS.订单.cols) };
      const typeHost = h('div'), body = h('div.stack', {}), tip = h('div', { 'aria-live': 'polite' });
      const estimate = () => { const T = EXPORTS[st.kind], days = RANGES.find((r) => r[0] === st.range)[2], f = (T.filter.opts.find((o) => o[0] === st.filter) || [0, 0, 1])[2]; return Math.max(1, Math.round(T.per * days * f)); };
      const nameOf = () => { const T = EXPORTS[st.kind], fl = (T.filter.opts.find((o) => o[0] === st.filter) || [])[1], rg = RANGES.find((r) => r[0] === st.range)[1].replace(/ /g, ''); return st.kind + '_' + (st.filter ? fl + '_' : '') + rg + '_' + P3.today() + '.xlsx'; };
      function paintTip() {
        const n = estimate();
        tip.replaceChildren(n > HARD_LIMIT ? P3.alert('bad', '预计 ' + P3.n(n) + ' 行，超过单次上限 ' + P3.n(HARD_LIMIT) + ' 行，请缩短时间范围或加上筛选条件。') : n > SYNC_LIMIT ? P3.alert('warn', '预计 ' + P3.n(n) + ' 行，超过 ' + P3.n(SYNC_LIMIT) + ' 行，会转成后台任务，完成后在任务列表里下载，离开页面也会继续。') : P3.alert('ok', '预计 ' + P3.n(n) + ' 行，不超过 ' + P3.n(SYNC_LIMIT) + ' 行，点“开始导出”后直接下载。'), h('p.muted', { style: { marginTop: 'var(--s-2)' }, text: '文件名：' + nameOf() }));
      }
      function paintBody() {
        const T = EXPORTS[st.kind], rangeSel = h('select.select', { 'aria-label': '时间范围' }, RANGES.map(([v, l]) => h('option', { value: v, text: (T.dateLabel ? T.dateLabel + '：' : '') + l, selected: v === st.range }))), filSel = h('select.select', { 'aria-label': T.filter.label }, T.filter.opts.map(([v, l]) => h('option', { value: v, text: l, selected: v === st.filter })));
        rangeSel.addEventListener('change', () => { st.range = rangeSel.value; paintTip(); }); filSel.addEventListener('change', () => { st.filter = filSel.value; paintTip(); });
        const colsBox = h('div.p3-cols', { role: 'group', 'aria-label': '导出的列' }, T.cols.map((c) => h('label.p3-col', {}, h('input', { type: 'checkbox', checked: st.cols.has(c), on: { change: (e) => { e.target.checked ? st.cols.add(c) : st.cols.delete(c); colErr.textContent = ''; } } }), h('span', { text: c }))));
        const colErr = h('div.err', { role: 'alert', style: { color: 'var(--bad-ink)' } });
        const setAll = (on) => { st.cols = new Set(on ? T.cols : []); UI.$$('input', colsBox).forEach((i) => { i.checked = on; }); };
        body.replaceChildren(
          h('div.p3-pair', {}, h('div.field', {}, h('label', { text: '时间范围' }), rangeSel), h('div.field', {}, h('label', { text: T.filter.label }), filSel)),
          h('div.field', {}, h('div.row.between', {}, h('label', { text: '导出的列' }), h('span.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '全选', on: { click: () => setAll(true) } }), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '清空', on: { click: () => setAll(false) } }))), colsBox, colErr, T.mask ? h('div.hint', { text: '“' + T.mask + '”导出时会脱敏，例如 138****0000。' }) : null));
        body._colErr = colErr; paintTip();
      }
      typeHost.append(P3.seg('导出类型', Object.keys(EXPORTS).map((k) => [k, k]), st.kind, (v) => { st.kind = v; st.filter = ''; st.cols = new Set(EXPORTS[v].cols); paintBody(); }));
      paintBody();
      let made = null;
      return UI.dialog({ title: '新建导出', size: 'wide', body: h('div.stack', {}, h('div.field', {}, h('label', { text: '导出什么' }), typeHost), body, tip), actions: [{ label: '取消', value: null }, { label: '开始导出', kind: 'primary', value: 'ok', on: () => {
        const n = estimate();
        if (!st.cols.size) { body._colErr.textContent = '至少选 1 列'; return false; }
        if (n > HARD_LIMIT) { UI.play(tip, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 320 }); return false; }
        return P3.submit(async () => {
          const T = EXPORTS[st.kind], fl = (T.filter.opts.find((o) => o[0] === st.filter) || [])[1] || T.filter.opts[0][1], rg = RANGES.find((r) => r[0] === st.range), async_ = n > SYNC_LIMIT;
          const cond = '范围：' + rg[1] + '；' + T.filter.label + '：' + fl + '；列：' + st.cols.size + ' 项';
          const t = { id: Math.max(0, ...db.exportTasks.map((x) => x.id)) + 1, name: nameOf(), kind: st.kind, rows: n, status: async_ ? 'RUNNING' : 'DONE', at: P3.stamp(), by: A2.me().name, cond, spec: { cols: T.cols.filter((c) => st.cols.has(c)), days: rg[2], filter: st.filter }, progress: async_ ? 0 : 100, failAt: async_ && scene === 'export-timeout' ? 60 : 0 };
          db.exportTasks.unshift(t); made = t; flash.add(t);
          P3.audit('export', '导出' + st.kind, t.name, { diff: [['导出类型', '—', st.kind], ['范围', '—', rg[1]], [T.filter.label, '—', fl], ['行数', '—', P3.n(n)]] });
        });
      } }] }).then((v) => {
        if (v !== 'ok' || !made) return;
        ex.status = 'all'; ex.kind = ex.q = ''; tabsUI.show(0); refreshEx();
        if (made.status === 'DONE') { const f = buildExport(made); P3.download(made.name.replace(/\.xlsx$/, '') + '.csv', P3.csv(f.header, f.rows)); UI.toast('已导出 ' + made.name + '（' + P3.n(made.rows) + ' 行）'); }
        else UI.toast('导出的行数较多（' + P3.n(made.rows) + ' 行），已转成后台任务，完成后会提示你', { });
      });
    }

    /* ===== 导入：五步 ===== */
    const W = { kind: '商品', step: 0, sample: 'mixed', file: null, fileErr: '', res: null, header: '', busy: false, view: 'fail', ack: false, out: null, progress: 0 };
    const STEPS = ['下载模板', '选择文件', '校验预览', '确认导入', '导入结果'];
    const wiz = h('section.card.p3-wiz', { 'aria-label': '导入数据' });
    const wizReset = (kind) => Object.assign(W, { kind: kind || W.kind, step: 0, file: null, fileErr: '', res: null, header: '', busy: false, view: 'fail', ack: false, out: null, progress: 0 });
    const counts = () => { const r = W.res || []; return { n: r.filter((x) => x.kind === 'new').length, u: r.filter((x) => x.kind === 'update').length, f: r.filter((x) => x.kind === 'fail').length, t: r.length }; };
    function failCsv(kind, res, name) {
      const I = IMPORTS[kind], header = I.cols.map((c) => c[0]).concat('失败原因'), rows = res.filter((r) => r.kind === 'fail').map((r) => r.raw.concat(r.reason));
      P3.download(name.replace(/\.xlsx$/, '') + '_失败行.csv', P3.csv(header, rows));
    }
    function checkMark() { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'check'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<circle cx="32" cy="32" r="30"></circle><path d="M20 33l8 8 16-17"></path>'; return s; }
    function paintWiz() {
      const I = IMPORTS[W.kind], c = counts();
      const typeSeg = P3.seg('导入类型', [['商品', '商品'], ['会员', '会员']], W.kind, async (v) => { if (v === W.kind) return; if (W.step > 0 && W.step < 4 && !(await UI.confirm('换成导入' + v + '后，已选的文件和校验结果会清掉。', { title: '换导入类型', ok: '确认更换' }))) return paintWiz(); wizReset(v); paintWiz(); });
      const steps = h('ol.p3-steps', { 'aria-label': '导入步骤' }, STEPS.map((s, i) => h('li', { class: i < W.step ? 'done' : i === W.step ? 'now' : '', 'aria-current': i === W.step ? 'step' : null }, h('span.p3-step-n', {}, i < W.step ? UI.icon('check', 'icon--sm') : String(i + 1)), h('span', { text: s }))));
      let main, foot = [];
      const next = (label, on, disabled) => h('button.btn.btn--primary', { type: 'button', text: label, disabled, on: { click: on } }), prev = (to) => h('button.btn', { type: 'button', text: '上一步', on: { click: () => { W.step = to; if (to < 2) { W.res = null; } paintWiz(); } } });
      if (W.step === 0) {
        main = h('div.stack', {}, h('p', {}, '先下载导入模板，按模板填写后再上传。已有的' + I.pageName + '（按' + I.key + '判断）会被更新，其余新增；一次最多导入 500 行，只接受 .xlsx 文件。'),
          h('div.p3-tpl', {}, h('button.btn', { type: 'button', on: { click: () => { P3.download(I.pageName + '导入模板.csv', P3.csv(I.cols.map((x) => x[0]), I.sample)); UI.toast('已开始下载' + I.pageName + '导入模板'); } } }, UI.icon('download', 'icon--sm'), '下载导入模板')),
          P3.simpleTable('模板的列说明', [{ title: '列', cls: 'p3-nw', render: (r) => h('b', { text: r[0] }) }, { title: '是否必填', cls: 'p3-nw', render: (r) => P3.badge(r[1], r[1] === '必填' ? 'brand' : '', true) }, { title: '怎么填', render: (r) => r[2] }], I.cols));
        foot = [next('下一步：选择文件', () => { W.step = 1; paintWiz(); })];
      } else if (W.step === 1) {
        const fileIn = h('input', { type: 'file', accept: '.xlsx', hidden: true, 'aria-label': '选择要导入的文件', on: { change: (e) => { const f = e.target.files[0]; if (!f) return; W.fileErr = ''; W.file = null; if (!/\.xlsx$/i.test(f.name)) W.fileErr = '请上传 Excel 文件（.xlsx），不支持 .xls、.csv 或改了扩展名的文件'; else if (!f.size) W.fileErr = '无法读取这个文件，请使用导入模板填写后再上传'; else W.file = { name: f.name, rows: sampleRows(W.kind, W.sample).length, size: f.size, real: true }; paintWiz(); } } });
        const pickSample = (v) => { W.sample = v; W.file = { name: (v === 'header' ? '示例_表头不对' : v === 'clean' ? '示例_全部填对' : '示例_有几行填错') + '_' + I.pageName + '导入.xlsx', rows: sampleRows(W.kind, v).length, size: 18 * 1024, real: false }; W.fileErr = ''; paintWiz(); };
        main = h('div.stack', {}, h('div.p3-drop', {}, UI.icon('upload', 'icon--lg'), h('div', {}, h('b', { text: '选择填好的 Excel 文件' }), h('div.muted', { text: '.xlsx，最多 500 行' })), h('button.btn.btn--primary', { type: 'button', text: '选择文件', on: { click: () => fileIn.click() } }), fileIn),
          W.fileErr ? P3.alert('bad', W.fileErr) : null,
          W.file ? h('div.p3-file', {}, UI.icon('file', 'icon--sm'), h('span.grow', {}, h('b', { text: W.file.name }), h('span.muted', { text: '  ' + W.file.rows + ' 行 · ' + Math.max(1, Math.round(W.file.size / 1024)) + ' KB' })), h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '移除', 'aria-label': '移除已选文件', on: { click: () => { W.file = null; paintWiz(); } } })) : null,
          h('div.field', {}, h('label', { text: '没有文件？用示例文件体验' }), h('div.row.wrap', { role: 'group', 'aria-label': '示例文件' }, SAMPLES.map(([v, l]) => h('button.btn.btn--sm' + (W.file && !W.file.real && W.sample === v ? '.btn--soft' : ''), { type: 'button', text: l, on: { click: () => pickSample(v) } }))), h('div.hint', { text: '选择真实文件时，原型里按示例一的内容校验，不读取文件里的数据。' })));
        foot = [prev(0), next('下一步：校验预览', () => { W.step = 2; W.res = null; W.header = ''; paintWiz(); validate(); }, !W.file)];
      } else if (W.step === 2) {
        if (W.busy) main = h('div.stack', {}, h('p', { text: '正在逐行校验“' + W.file.name + '”…' }), UI.skeleton(5));
        else if (W.header) { main = h('div.stack', {}, P3.alert('bad', '文件格式不正确：' + W.header + '。请重新下载导入模板，按模板填写后再上传。'), h('div.row', {}, h('button.btn', { type: 'button', text: '重新选择文件', on: { click: () => { W.step = 1; W.file = null; paintWiz(); } } }), h('button.btn.btn--ghost', { type: 'button', on: { click: () => { W.step = 0; paintWiz(); } } }, '回到下载模板'))); foot = [prev(1), next('下一步：确认导入', null, true)]; }
        else if (W.res) {
          const tabs = [['new', '将新增', c.n, 'ok'], ['update', '将更新', c.u, 'info'], ['fail', '失败', c.f, 'bad']], view = W.view;
          const list = W.res.filter((r) => r.kind === view);
          const tbl = view === 'fail' ? A2.table({ caption: '失败的行', rows: list, size: 10, empty: '没有失败的行，全部可以导入', columns: [{ title: '行号', cls: 'r', render: (r) => '第 ' + r.line + ' 行' }, { title: '失败原因', render: (r) => r.reason }, { title: '原始内容', ell: true, render: (r) => r.raw.map((x) => (x === '' ? '（空）' : x)).join(' | ') }] }) : A2.table({ caption: view === 'new' ? '将新增的行' : '将更新的行', rows: list, size: 10, empty: '没有这一类的行', columns: [{ title: '行号', cls: 'r', render: (r) => '第 ' + r.line + ' 行' }, { title: I.key, render: (r) => (W.kind === '会员' ? r.norm.name + '  ' + P3.mask(r.norm.phone) : r.norm.name) }, { title: view === 'new' ? '新增内容' : '更新内容', render: (r) => r.note }] });
          main = h('div.stack', {}, h('div.p3-trio', {}, tabs.map(([k, l, n, tone]) => h('button.p3-count' + (view === k ? '.on' : ''), { type: 'button', 'aria-pressed': String(view === k), on: { click: () => { W.view = k; paintWiz(); } } }, h('span.muted', { text: l }), h('b.num', { text: n }), P3.badge(k === 'fail' ? (n ? '有问题' : '没问题') : '可导入', n || k !== 'fail' ? tone : 'ok', true)))),
            h('p.muted', { text: '共 ' + c.t + ' 行 = 新增 ' + c.n + ' + 更新 ' + c.u + ' + 失败 ' + c.f + '（跳过 0）。失败的行不会导入，改好后可以只重传失败的行。' }),
            c.f ? h('div.row', {}, h('button.btn.btn--sm', { type: 'button', on: { click: () => failCsv(W.kind, W.res, W.file.name) } }, UI.icon('download', 'icon--sm'), '只下载失败行')) : null, tbl.el);
          foot = [prev(1), next('下一步：确认导入', () => { W.step = 3; W.ack = false; paintWiz(); }, c.n + c.u === 0)];
          if (c.n + c.u === 0) main.append(P3.alert('bad', '所有行都没有通过校验，没有可以导入的数据。请先改好失败的行。'));
        }
      } else if (W.step === 3) {
        const okBox = h('input', { type: 'checkbox', checked: W.ack, on: { change: (e) => { W.ack = e.target.checked; btn.disabled = !W.ack || W.busy; } } });
        const btn = next(W.busy ? '正在导入…' : '确认导入', doImport, !W.ack || W.busy);
        main = h('div.stack', {}, h('div.p3-trio', {}, [['将新增', c.n, 'ok'], ['将更新', c.u, 'info'], ['不导入', c.f, c.f ? 'bad' : '']].map(([l, n, tone]) => h('div.p3-count.static', {}, h('span.muted', { text: l }), h('b.num', { text: n }), P3.badge(I.noun.slice(1), tone, true)))),
          P3.alert('warn', '将新增 ' + c.n + I.noun + '、更新 ' + c.u + I.noun + '，导入后立即生效。更新会覆盖原来的' + (W.kind === '商品' ? '价格、库存和状态' : '等级、积分和储值余额') + '，导入前请确认。' + (c.f ? '另有 ' + c.f + ' 行没有通过校验，不会导入。' : '')),
          W.busy ? h('div.stack', {}, h('div.progress', { role: 'progressbar', 'aria-label': '导入进度', 'aria-valuenow': Math.round(W.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { '--v': W.progress } })), h('span.muted', { text: '正在写入，请不要离开页面…' })) : null,
          h('label.row', { style: { gap: 'var(--s-3)' } }, okBox, h('span', { text: '我已核对预览，确认按以上内容导入' })));
        okBox.disabled = W.busy;
        foot = [h('button.btn', { type: 'button', text: '上一步', disabled: W.busy, on: { click: () => { W.step = 2; paintWiz(); } } }), btn];
      } else {
        const o = W.out;
        main = h('div.stack', {}, h('div.row', { style: { gap: 'var(--s-4)' } }, o.n + o.u ? checkMark() : UI.icon('warn', 'icon--lg'), h('div', {}, h('h3', { text: o.n + o.u ? '导入完成' : '没有导入任何数据' }), h('p', { text: '新增 ' + o.n + ' ' + I.noun.slice(0, 1) + '、更新 ' + o.u + ' ' + I.noun.slice(0, 1) + '、失败 ' + o.f + ' 行；总数 ' + o.t + ' = 成功 ' + (o.n + o.u) + ' + 失败 ' + o.f + ' + 跳过 0。' }))),
          o.f ? P3.alert('warn', '有 ' + o.f + ' 行没有导入，可以下载失败行，改好后只重传这几行。') : null,
          h('div.row.wrap', {}, o.f ? h('button.btn', { type: 'button', on: { click: () => failCsv(W.kind, o.res, o.name) } }, UI.icon('download', 'icon--sm'), '下载失败行') : null, o.n + o.u ? h('button.btn', { type: 'button', text: '去看看' + I.pageName, on: { click: () => ctx.go(I.page) } }) : null, h('button.btn.btn--primary', { type: 'button', text: '再导入一份', on: { click: () => { wizReset(); paintWiz(); } } })));
      }
      if (!main) main = h('div.stack', {}, UI.skeleton(4));
      wiz.replaceChildren(...[h('div.card-head', {}, h('div', {}, h('h3', { text: '导入数据' }), h('p.muted', { text: '按模板填好文件，先校验再导入，失败的行会告诉你原因' })), typeSeg), steps, main, foot.length ? h('div.p3-foot', {}, foot) : null].filter(Boolean));
    }
    async function validate() {
      W.busy = true; paintWiz();
      try { await UI.request(null, 700); } catch (e) { W.busy = false; W.step = 1; paintWiz(); return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      if (W.file.name.startsWith('示例_表头') || scene === 'import-bad-file') W.header = W.kind === '商品' ? '缺少“价格（元）”列，多了“售价”列' : '缺少“手机号”列，多了“电话”列';
      else W.res = validateRows(W.kind, sampleRows(W.kind, W.file.real ? 'mixed' : W.sample));
      W.view = W.res && counts().f ? 'fail' : 'new'; W.busy = false; if (W.step === 2) paintWiz();
    }
    async function doImport() {
      const c = counts(), I = IMPORTS[W.kind];
      W.busy = true; paintWiz();
      try { await UI.request(null, 300); for (let i = 1; i <= 4; i++) { W.progress = i / 4; paintWiz(); await UI.sleep(260); } } catch (e) { W.busy = false; W.progress = 0; paintWiz(); return UI.toast('网络不太稳定，导入没有完成，数据没有改动，请重试', { kind: 'bad' }); }
      applyRows(W.kind, W.res);
      const name = W.file.name, task = { id: Math.max(0, ...db.importTasks.map((x) => x.id)) + 1, name, kind: W.kind, total: c.t, ok: c.n + c.u, fail: c.f, added: c.n, updated: c.u, at: P3.stamp(), by: A2.me().name, failRows: W.res.filter((r) => r.kind === 'fail').map((r) => ({ line: r.line, reason: r.reason, raw: r.raw })) };
      db.importTasks.unshift(task); flashImp.add(task);
      P3.audit('import', '导入' + W.kind, name, { diff: [['新增', '—', c.n + ' ' + I.noun.slice(0, 1)], ['更新', '—', c.u + ' ' + I.noun.slice(0, 1)], ['失败', '—', c.f + ' 行']] });
      W.out = { n: c.n, u: c.u, f: c.f, t: c.t, res: W.res, name }; W.busy = false; W.step = 4; W.progress = 0; paintWiz();
      refreshImp(); paintStats(); paintChart(); tabsUI.count(1, imps().length);
      UI.toast(c.n + c.u ? '导入完成：新增 ' + c.n + '，更新 ' + c.u + '，失败 ' + c.f : '没有导入任何数据', c.n + c.u ? {} : { kind: 'bad' });
    }

    /* 导入历史 */
    const flashImp = new Set();
    let impTable;
    const impRows = () => imps();
    function refreshImp() { if (!impTable) return; impTable.setRows(impRows()); P3.flash(impTable.el); flashImp.clear(); }
    function importsPanel() {
      impTable = A2.table({
        caption: '导入历史', empty: scene === 'no-tasks' ? '还没有导入记录，按上面的步骤导入一份试试' : '还没有导入记录', rows: impRows(), rowClass: (t) => (flashImp.has(t) ? 'p3-flash' : ''),
        columns: [
          { title: '文件名', ell: true, render: (t) => t.name },
          { title: '类型', cls: 'p3-nw', render: (t) => t.kind },
          { title: '总行数', cls: 'r', render: (t) => t.total },
          { title: '新增', cls: 'r', render: (t) => (t.added == null ? '—' : t.added) },
          { title: '更新', cls: 'r', render: (t) => (t.updated == null ? '—' : t.updated) },
          { title: '失败', cls: 'r', render: (t) => (t.fail ? h('b', { style: { color: 'var(--bad-ink)' }, text: t.fail }) : 0) },
          { title: '导入时间', cls: 'p3-nw num', render: (t) => P3.md(t.at) },
          { title: '导入人', cls: 'p3-nw', render: (t) => t.by },
          { title: '操作', cls: 'p3-nw', render: (t) => h('div.row', { style: { gap: 'var(--s-1)' } }, h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '详情', 'aria-label': '查看导入详情 ' + t.name, on: { click: () => importDetail(t) } }), t.failRows && t.failRows.length ? h('button.btn.btn--ghost.btn--sm', { type: 'button', text: '失败行', 'aria-label': '下载失败行 ' + t.name, on: { click: () => failRowsDownload(t) } }) : null) },
        ],
      });
      return h('div.stack', {}, wiz, h('div.band-title', {}, h('h3', { text: '导入历史' }), h('span.muted', { text: '每次导入都会留下记录，并写入操作日志' })), impTable.el);
    }
    function failRowsDownload(t) { const I = IMPORTS[t.kind]; P3.download(t.name.replace(/\.xlsx$/, '') + '_失败行.csv', P3.csv(I.cols.map((c) => c[0]).concat('失败原因'), t.failRows.map((r) => r.raw.concat(r.reason)))); UI.toast('已开始下载失败行'); }
    function importDetail(t) {
      const fr = t.failRows || [];
      A2.detail({ title: '导入详情 · ' + t.name, tabs: [
        { label: '概况', node: A2.kv([['文件名', t.name], ['类型', t.kind], ['总行数', t.total], ['新增', t.added == null ? '—' : t.added], ['更新', t.updated == null ? '—' : t.updated], ['失败', t.fail], ['导入时间', t.at], ['导入人', t.by]]) },
        { label: '失败行', node: fr.length ? A2.table({ caption: '失败的行', rows: fr, size: 10, columns: [{ title: '行号', cls: 'r', render: (r) => '第 ' + r.line + ' 行' }, { title: '失败原因', render: (r) => r.reason }, { title: '原始内容', ell: true, render: (r) => r.raw.map((x) => (x === '' ? '（空）' : x)).join(' | ') }] }).el : A2.empty('这次导入没有失败的行') },
      ], actions: [{ label: '关闭', value: null }].concat(fr.length ? [{ label: '下载失败行', kind: 'primary', value: 'dl' }] : []) }).then((v) => v === 'dl' && failRowsDownload(t));
    }

    /* ===== 组装 ===== */
    let tabsUI;
    const importBtn = h('button.btn', { type: 'button', text: '导入数据', on: { click: () => { tabsUI.show(1); setTimeout(() => wiz.scrollIntoView({ behavior: UI.rm ? 'auto' : 'smooth', block: 'start' }), 120); } } });
    const newBtn = h('button.btn.btn--primary', { type: 'button', text: '新建导出', on: { click: newExport } });
    if (!A2.can('export')) { newBtn.disabled = true; newBtn.title = '当前角色没有导出权限'; }
    const head = A2.heading('导入导出', '导出报表、批量导入商品和会员，任务进度都在这里', [importBtn, newBtn]);
    tabsUI = P3.tabs([{ label: '导出任务', count: exps().length, render: exportsPanel }, { label: '导入任务', count: imps().length, render: importsPanel }], { label: '任务明细' });
    paintWiz(); paintStats(); paintChart();
    page.append(head, h('div.l-bands', {},
      h('section.band', { 'aria-label': '概览数字' }, statsHost),
      h('section.band', { 'aria-label': '近 14 天任务量' }, h('div.band-title', {}, h('h2', { text: '近 14 天任务量' }), h('div.legend', {}, h('span', {}, h('i', { style: { background: 'var(--ch-1)' } }), '导出'), h('span', {}, h('i', { style: { background: 'var(--ch-3)' } }), '导入'), h('span', {}, h('i', { style: { background: 'var(--bad)' } }), '失败'))), chartHost, chartNote),
      h('section.band', { 'aria-label': '任务明细' }, h('div.band-title', {}, h('h2', { text: '任务明细' })), tabsUI.list, tabsUI.panels)));

    /* 后台任务推进时，只改进度条和状态，不整表重画 */
    const onTasks = (e) => {
      if (!page.isConnected) { if (page.dataset.seen) window.removeEventListener('p3-tasks', onTasks); return; }
      page.dataset.seen = '1';
      if (!exTable) { paintStats(); return; }
      const { done, failed } = e.detail;
      exps().filter((t) => t.status === 'RUNNING').forEach((t) => { const w = UI.$('[data-task="' + t.id + '"]', page); if (!w) return; w.querySelector('.badge').textContent = '进行中 ' + t.progress + '%'; const bar = w.querySelector('.progress'); bar.setAttribute('aria-valuenow', t.progress); bar.firstChild.style.setProperty('--v', t.progress / 100); });
      if (done.length || failed.length) { done.concat(failed).forEach((t) => flash.add(t)); refreshEx(true); } else paintStats();
    };
    window.addEventListener('p3-tasks', onTasks);
    return page;
  }
})();
