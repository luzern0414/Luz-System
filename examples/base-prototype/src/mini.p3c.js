/* 第二批页面（三）之三：储值（wallet）、优惠券（coupons，参数 tab=mine|center、seg=usable|used|expired）。
   储值：B.db.me.balance 是总额（含赠送金 giftBalance），充值、退款申请都改它并写 B.db.walletLogs；优惠券：领取、兑换都写 B.db.myCoupons，结算页读的是同一份。 */
(function () {
  'use strict';
  const { h } = UI;
  const M3 = Mini.p3, { today, addD, diff, md } = M3;
  const money = Mini.money, money0 = (c) => Mini.money(c, 0);
  const byAt = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);   // 按时间倒序，同一时间保持原顺序
  const WALLET_FEE = 5;     // 余额退款手续费（%），七日内充值且未消费免收
  const UNIFY_REDEEM = false; // true：不存在、已用、已过期统一提示“兑换码无效或已使用”（防探测，见基础功能 BF-COUPON-02）；原型默认逐一说明

  /* =====================================================================================
     储值（二级页；主次布局）：余额是主角（本金与赠送金分开写）→ 充值方案与限额 → 收支明细（分段、按月筛选）；充值固定在底部
     ===================================================================================== */
  const capOf = (ctx) => (ctx.scene === 'topup-limit' ? M3.prepaidHeld() + 6000 : B.db.prepaid.totalCap);
  const kindOf = (l) => (l.kind === '赠送' ? '充值' : l.kind);
  const logTitle = (l) => ({ 充值: '储值充值', 赠送: '充值赠送', 消费: '消费', 退款: '订单退回' }[l.kind] || l.kind);
  const wrQuote = () => {
    const me = B.db.me, gift = Math.min(me.giftBalance || 0, me.balance), principal = me.balance - gift, t = today();
    const last = B.db.walletLogs.filter((l) => l.userId === me.id && l.kind === '充值').sort(byAt)[0];
    const spent = last ? B.db.walletLogs.some((l) => l.userId === me.id && l.kind === '消费' && l.at > last.at) : true, free = !!last && diff(last.at.slice(0, 10), t) <= 7 && !spent;
    const fee = free ? 0 : Math.round((principal * WALLET_FEE) / 100);
    return { principal, gift, fee, free, amount: Math.max(0, principal - fee) };
  };
  const wrView = (ctx) => {
    const sc = ctx.scene, me = B.db.me;
    let rf = (B.db.walletRefunds || []).find((r) => r.status !== 'REJECTED' && r.step < 3) || null;
    if (/^refund-/.test(sc)) {
      const q = wrQuote(), step = { 'refund-review': 1, 'refund-doing': 2, 'refund-done': 3, 'refund-rejected': 1 }[sc];
      rf = { id: 0, principal: q.principal, gift: q.gift, fee: q.fee, amount: q.amount, at: addD(today(), -1) + ' 14:05', step, status: sc === 'refund-rejected' ? 'REJECTED' : 'OK', reason: sc === 'refund-rejected' ? '储值余额在审核期间发生了消费，请重新申请' : '', virtual: true };
    }
    return rf;
  };

  window.PAGES_MINI.wallet = {
    title: '储值', tab: null, from: 'me', auth: true, bar: true, nav: { title: '储值' },
    layout: '主次布局', reason: '储值页的主角是“我还有多少钱、能充多少”：余额放大成展示字号并拆开本金与赠送金；充值方案紧随其后、底部固定一个充值按钮；明细退到下面，可按类型和月份筛',
    scenes: [{ id: 'first-topup', label: '首次储值：须主动勾选预付卡条款' }, { id: 'topup-limit', label: '余额上限：多数档位超过限额' }, { id: 'prepaid-stopped', label: '暂停收取预付款：不能充值' }, { id: 'paused', label: '营业状态：暂停营业（不能充值）' }, { id: 'pay-cancel', label: '支付：用户取消' }, { id: 'pay-fail', label: '支付：银行卡余额不足' }, { id: 'pay-timeout', label: '支付：确认超时' },
      { id: 'refund-review', label: '余额退款进度：审核中' }, { id: 'refund-doing', label: '余额退款进度：退款中' }, { id: 'refund-done', label: '余额退款进度：已到账' }, { id: 'refund-rejected', label: '余额退款进度：被驳回，释放冻结' }],
    skeleton: () => h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '150px', borderRadius: 'var(--r-lg)' } }), h('div.skel', { style: { height: '96px' } }), h('div.skel', { style: { height: '60px' } }), h('div.skel', { style: { height: '60px' } })),
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { seg: 'all', month: '', plan: 3, custom: '', agree: false, shown: 10, pending: null });
      return Mini.load(() => B.db.walletLogs.filter((l) => l.userId === B.db.me.id)).then((logsReal) => {
        const logsAll = ctx.scene === 'empty' ? [] : logsReal;
        const me = B.db.me, plans = B.db.walletPlans, P = B.db.prepaid, stopped = ctx.scene === 'prepaid-stopped' || P.stopped, cap = capOf(ctx), st = Mini.shop.state(ctx.scene);
        const needConsent = ctx.scene === 'first-topup' || !(B.db.legal.special.find((x) => x.key === 'prepaid') || {}).on;
        const rf = wrView(ctx), frozen = rf && rf.status !== 'REJECTED' && rf.step < 3 ? (rf.virtual ? rf.principal + rf.gift : me.frozen) : 0;
        const bal = me.balance, gift = Math.min(me.giftBalance || 0, bal);
        const wrap = h('div.m3-wrap'), page = h('section.mini-page.m3-wallet'), tip = h('div'), bar = h('div.m3-bar.m3-chargebar');
        const flash = S.flash || 0; S.flash = 0;
        /* 余额 */
        const num = h('b.m3-hero-n.num', { text: Mini.money(S.prevBal != null ? S.prevBal : bal) });
        const hero = h('section.m3-balhero', { 'aria-label': '储值余额' }, h('span.m3-lab', { text: '储值余额' }), num,
          h('div.m3-split', {}, h('span', {}, h('small', { text: '本金' }), h('b.num', { text: money(bal - gift) })), h('span', {}, h('small', { text: '赠送金' }), h('b.num', { text: money(gift) })), frozen ? h('span', {}, h('small', { text: '退款冻结中' }), h('b.num', { text: money(frozen) })) : null),
          h('p.m3-balnote', { text: '本金永不过期；余额不能提现、转让或转赠' }));
        if (S.prevBal != null && S.prevBal !== bal) { num.dataset.v = String(S.prevBal / 100); UI.count(num, bal / 100, { dec: 2, prefix: '¥', dur: 700 }); } S.prevBal = bal;
        page.append(hero);
        /* 余额退款进度 */
        const refundBox = h('div');
        const drawRefund = () => {
          refundBox.replaceChildren(); if (!rf) return;
          refundBox.append(h('div.mini-card.m3-rfcard', {}, h('div.mini-sec', {}, h('h2', { text: '余额退款进度' }), h('span.muted', { text: '预计退回 ' + money(rf.amount) })), M3.stepper(['已提交', '审核中', '退款中', '已到账'], rf.step, { fail: rf.status === 'REJECTED' ? 1 : undefined, times: [rf.at.slice(5, 16), '', '', ''], label: '余额退款进度' }),
            rf.status === 'REJECTED' ? M3.alert('申请被驳回：' + rf.reason + '。冻结的金额已释放，余额恢复可用。', { kind: 'bad' }) : h('p.muted', { text: rf.step >= 3 ? '退款已原路退回，请查看支付渠道的到账通知。' : '申请时对应金额已冻结，期间不能消费；审核通过后原路退回，赠送金作废。' })));
        };
        drawRefund(); page.append(refundBox);
        /* 充值方案 */
        const pend = () => S.pending;
        const sel = () => (S.plan === 'custom' ? { amount: Math.round((parseFloat(S.custom) || 0) * 100), gift: 0, custom: true } : Object.assign({ custom: false }, plans.find((p) => p.id === S.plan)));
        const room = () => Math.max(0, cap - M3.prepaidHeld());
        const sum = h('p.m3-sum'), limitNote = h('p.muted.m3-limit-note'), customErr = h('p.err', { role: 'alert' });
        const custom = h('input.input', { type: 'text', inputmode: 'decimal', placeholder: '输入 ' + money0(P.minTopup) + ' 到 ' + money0(P.maxTopup) + ' 之间的金额', value: S.custom, 'aria-label': '自定义充值金额（元）', id: 'm3-custom' });
        const customBox = h('div.m3-customrow', { hidden: S.plan !== 'custom' }, h('span.m3-yuan', { text: '¥' }), custom, customErr);
        const tiles = plans.map((p) => {
          const over = p.amount + p.gift > room(), b = h('button.m3-plan', { type: 'button', role: 'radio', 'aria-checked': String(S.plan === p.id), disabled: stopped || over, 'data-id': p.id, 'aria-label': '充 ' + money0(p.amount) + (p.gift ? '，送 ' + money0(p.gift) : '') + (over ? '，超过余额上限' : ''), on: { click: () => pick(p.id) } },
            p.tag ? h('i.m3-ptag', { text: p.tag }) : null, h('span.m3-pamt', {}, h('small', { text: '充' }), h('b', { text: money0(p.amount) })), h('span.m3-pgift' + (p.gift ? '' : '.is-none'), { text: over ? '超过限额' : p.gift ? '送 ' + money0(p.gift) : '不赠送' }));
          return b;
        });
        const customTile = h('button.m3-plan.is-custom', { type: 'button', role: 'radio', 'aria-checked': String(S.plan === 'custom'), disabled: stopped, on: { click: () => pick('custom') } }, h('span.m3-pamt', {}, h('b', { text: '自定义金额' })), h('span.m3-pgift.is-none', { text: '不享受赠送' }));
        const agree = h('input', { type: 'checkbox', id: 'm3-wagree', checked: S.agree, on: { change: (e) => { S.agree = e.target.checked; paintBar(); } } });
        const agreeRow = needConsent ? h('div.m3-agree', {}, h('label.mini-check', {}, agree), h('label', { for: 'm3-wagree' }, '我已阅读并同意', h('b', { text: '《预付卡与储值条款》' }), '（首次储值需要主动勾选；余额不能提现，七日内未使用可全额退）')) : h('p.muted', { text: '已同意预付卡与储值条款（' + md(B.db.legal.special.find((x) => x.key === 'prepaid').at) + '）' });
        const pickerBox = h('section.m3-plans', { 'aria-label': '充值方案' }, h('div.mini-sec', {}, h('h2', { text: '充值' }), h('span.muted', { text: '赠送金与本金同样可以抵扣订单' })), h('div.m3-plangrid', { role: 'radiogroup', 'aria-label': '充值档位' }, tiles, customTile), customBox, sum, limitNote, agreeRow);
        const valid = () => {
          const s = sel(); let e = '';
          if (stopped) e = '门店已暂停收取预付款，暂时不能充值';
          else if (st.key === 'paused') e = '门店暂停营业，暂时不能充值';
          else if (s.custom && !(s.amount >= P.minTopup)) e = s.amount ? '最低充值 ' + money0(P.minTopup) : '请输入充值金额';
          else if (s.custom && s.amount > P.maxTopup) e = '单笔最多充值 ' + money0(P.maxTopup);
          else if (s.custom && !/^\d+(\.\d{1,2})?$/.test(S.custom)) e = '金额只能是数字，最多保留两位小数';
          else if (s.amount + s.gift > room()) e = '充值后会超过余额上限 ' + money0(cap) + '，目前最多还能充 ' + money(room());
          return { s, e };
        };
        const paintSum = () => {
          const { s, e } = valid(); customErr.textContent = S.plan === 'custom' ? e : '';
          sum.replaceChildren(h('span', { text: '到账 ' }), h('b.num', { text: money(s.amount + s.gift) }), h('small', { text: s.gift ? '（本金 ' + money(s.amount) + ' + 赠送 ' + money(s.gift) + '）' : '（本金，不赠送）' }));
          limitNote.textContent = '会员卡与储值合计上限 ' + money0(cap) + '，你目前约 ' + money(M3.prepaidHeld()) + '，最多还能充 ' + money(room());
        };
        const paintBar = () => {
          const { s, e } = valid(), blocked = !!e || (needConsent && !S.agree);
          bar.replaceChildren(h('div.m3-barsum', {}, h('small', { text: S.pending ? '待支付的充值单' : '实付' }), Mini.price(S.pending ? S.pending.amount : s.amount, { trim: false, size: 'xl' })),
            h('button.btn.btn--primary.m3-gobtn', { type: 'button', disabled: !pendOk() && blocked, 'data-busy': '支付中', on: { click: (ev) => charge(ev.currentTarget) } }, stopped ? '暂停收取预付款' : S.pending ? '继续支付' : '立即充值'));
        };
        const pendOk = () => !!S.pending && !stopped;
        function pick(id) { S.plan = id; S.pending = null; tip.replaceChildren(); tiles.concat(customTile).forEach((b) => b.setAttribute('aria-checked', String(b === customTile ? id === 'custom' : Number(b.dataset.id) === id))); customBox.hidden = id !== 'custom'; if (id === 'custom') custom.focus(); paintSum(); paintBar(); }
        custom.addEventListener('input', () => { S.custom = custom.value.trim(); S.pending = null; paintSum(); paintBar(); });
        async function charge(btn) {
          tip.replaceChildren(); const { s, e } = S.pending ? { s: S.pending, e: '' } : valid();
          if (e) { tip.append(M3.alert(e, { kind: 'bad' })); if (S.plan === 'custom') custom.focus(); return; }
          if (needConsent && !S.agree) { tip.append(M3.alert('请先勾选预付卡与储值条款', { kind: 'warn' })); agree.focus(); return; }
          S.pending = { amount: s.amount, gift: s.gift };
          await M3.busy(btn, async () => {
            const res = await M3.pay(ctx, { amount: s.amount, subject: '储值充值' + (s.gift ? '，赠送 ' + money(s.gift) : '') });
            if (!res.ok) { tip.append(M3.alert('支付没有完成：' + res.reason + '。充值单已保留，可以继续支付。', { kind: res.kind === 'cancel' ? 'warn' : 'bad' })); paintBar(); return; }
            const ref = String(900000 + B.db.walletLogs.length * 19 + 7), r = await M3.act(() => { if (s.gift) Mini.wallet.log('赠送', 0, s.gift, '充值赠送 ' + ref); Mini.wallet.log('充值', s.amount, 0, '充值单 ' + ref); const sp = B.db.legal.special.find((x) => x.key === 'prepaid'); if (sp && (needConsent || !sp.on)) { sp.on = true; sp.at = B.fmt(B.NOW()); } }, 500);
            if (!r.ok) { tip.append(M3.alert('充值结果确认失败：' + r.reason + '。如已扣款会自动退回。', { kind: 'bad' })); return; }
            S.pending = null; S.flash = s.gift ? 2 : 1; M3.touch(); Mini.toast('充值成功，到账 ' + money(s.amount + s.gift)); ctx.refresh(); ctx.scroller.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' });
          });
        }
        paintSum(); paintBar();
        page.append(pickerBox, tip);
        /* 收支明细：分段、按月、分批 */
        const months = Array.from(new Set(logsAll.map((l) => l.at.slice(0, 7)))).sort().reverse(), list = h('div.m3-wlogs'), more = h('div');
        const tabs = M3.tabs([['all', '全部'], ['充值', '充值'], ['消费', '消费'], ['退款', '退款']].map(([id, label]) => ({ id, label })), S.seg, (id) => { S.seg = id; S.shown = 10; drawLogs(); }, '收支类型');
        const monthSel = h('select.select.m3-month', { 'aria-label': '按月份筛选', on: { change: (e) => { S.month = e.target.value; S.shown = 10; drawLogs(); } } }, h('option', { value: '', text: '全部月份' }), months.map((m) => h('option', { value: m, text: m.replace('-', ' 年 ') + ' 月', selected: S.month === m })));
        function drawLogs() {
          const rows = logsAll.filter((l) => (S.seg === 'all' || kindOf(l) === S.seg) && (!S.month || l.at.startsWith(S.month))).sort(byAt);
          list.replaceChildren(); more.replaceChildren();
          if (!rows.length) { list.append(Mini.empty(S.seg === 'all' && !S.month ? '还没有储值记录' : '这个范围内没有记录', S.seg === 'all' && !S.month ? { label: '去充值', kind: 'tint', on: () => pickerBox.scrollIntoView({ block: 'start', behavior: UI.rm ? 'auto' : 'smooth' }) } : { label: '看全部', kind: 'tint', on: () => { S.seg = 'all'; S.month = ''; ctx.refresh(); } }, { sub: '充值、消费和退款都会记在这里' })); return; }
          let cur = '', box = null, fi = 0;
          rows.slice(0, S.shown).forEach((l) => {
            const m = l.at.slice(0, 7);
            if (m !== cur) {
              cur = m; const inMonth = rows.filter((x) => x.at.startsWith(m)), inc = inMonth.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0), out = inMonth.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0);
              list.append(h('div.m3-mhead', {}, h('b', { text: Number(m.slice(5)) + ' 月' + (m.slice(0, 4) !== today().slice(0, 4) ? '（' + m.slice(0, 4) + '）' : '') }), h('span.muted', { text: '收入 ' + money(inc) + ' · 支出 ' + money(out) })), box = h('div.mini-card.m3-wcard'));
            }
            const split = l.principal != null && (l.kind === '消费' || l.kind === '退款') && l.gift;
            const row = h(split ? 'button.m3-wl' : 'div.m3-wl', split ? { type: 'button', 'aria-expanded': 'false', on: { click: () => { const o = det.hidden; det.hidden = !o; row.setAttribute('aria-expanded', String(o)); } } } : {},
              h('span.m3-wl-ic.is-' + ({ 充值: 'in', 赠送: 'in', 消费: 'out', 退款: 'back' }[l.kind] || 'out'), {}, UI.icon(l.kind === '消费' ? 'dish' : l.kind === '退款' ? 'undo' : l.kind === '赠送' ? 'gift' : 'wallet')),
              h('span.grow', {}, h('b', { text: logTitle(l) }), h('small', { text: l.ref + ' · ' + l.at.slice(5, 16) })),
              h('span.m3-wl-r', {}, h('b.num' + (l.amount > 0 ? '.is-plus' : ''), { text: (l.amount > 0 ? '+' : '−') + money(Math.abs(l.amount)) }), h('small', { text: '余额 ' + money(l.balance) })));
            const det = h('div.m3-wl-det', { hidden: true }, h('span', { text: '本金 ' + (l.principal < 0 ? '−' : '+') + money(Math.abs(l.principal)) }), h('span', { text: '赠送金 ' + (l.gift < 0 ? '−' : '+') + money(Math.abs(l.gift)) }));
            const item = h('div.m3-wl-wrap' + (fi++ < flash && S.seg === 'all' && !S.month ? '.mini-flash' : ''), {}, row, split ? det : null); box.append(item);
          });
          if (rows.length > S.shown) more.append(h('button.m3-more', { type: 'button', text: '加载更多（还有 ' + (rows.length - S.shown) + ' 条）', on: { click: () => { S.shown += 10; drawLogs(); } } }));
          else if (rows.length > 10) more.append(h('p.m3-end', { text: '没有更多了' }));
        }
        drawLogs();
        const busyRefund = !!rf && rf.status !== 'REJECTED' && rf.step < 3, refundEntry = h('button.m3-link', { type: 'button', disabled: busyRefund || bal <= 0, on: { click: () => refundSheet() } }, UI.icon('undo', 'icon--sm'), busyRefund ? '退款处理中，暂不能再次申请' : bal <= 0 ? '没有可退的余额' : '申请退还余额');
        page.append(h('div.mini-sec', {}, h('h2', { text: '收支明细' }), monthSel), tabs, list, more, h('div.m3-wfoot', {}, refundEntry, h('p.muted', { text: '赠送金不退现金；七日内未消费的充值免手续费' })));
        wrap.append(page, bar);
        /* 余额退款试算与申请 */
        function refundSheet() {
          if (rf && rf.status !== 'REJECTED' && rf.step < 3) return Mini.toast('已有一笔退款在处理中', { kind: 'bad' });
          const q = wrQuote();
          const body = h('div.m3-rf', {}, h('div.m3-rfhero', {}, h('span.muted', { text: '预计可退到微信支付' }), M3.big(q.amount)),
            h('div.mini-list.m3-rfl', {}, h('div', {}, h('span.grow', { text: '剩余本金' }), h('b.num', { text: money(q.principal) })), h('div', {}, h('span.grow', { text: q.free ? '手续费（最近一次充值 7 日内且未消费）' : '手续费（' + WALLET_FEE + '%）' }), h('b.num', { text: q.free ? '免收' : '−' + money(q.fee) })), h('div', {}, h('span.grow', { text: '赠送金（作废，不退现金）' }), h('b.num', { text: q.gift ? '−' + money(q.gift) : money(0) }))),
            h('ul.m3-bullets', {}, ['消费时本金与赠送金按比例同时扣减，所以剩余本金对应的赠送金一并作废', '申请后对应金额立即冻结，不能再用于消费；驳回后完整释放', '原路退回，通常 1 到 3 个工作日到账；超过 365 天的充值转线下办理'].map((x) => h('li', { text: x }))));
          return Mini.sheet({ title: '申请退还余额', body, actions: [{ label: '再想想', value: null }, { label: '提交退款申请', kind: 'danger.solid', value: 'ok', on: async () => {
            if (!(await Mini.confirm('确认退还余额？预计退回 ' + money(q.amount) + '，赠送金 ' + money(q.gift) + ' 作废。提交后余额立即冻结，审核通过后不能撤回。', { title: '提交退款申请', ok: '提交申请', danger: true }))) return false;
            const r = await M3.act(() => { (B.db.walletRefunds = B.db.walletRefunds || []).push({ id: B.db.walletRefunds.length + 1, principal: q.principal, gift: q.gift, fee: q.fee, amount: q.amount, at: B.fmt(B.NOW()), step: 1, status: 'OK', reason: '' }); me.frozen = q.principal + q.gift; me.balance = 0; me.giftBalance = 0; }, 800);
            if (!r.ok) { Mini.toast(r.reason, { kind: 'bad' }); return false; }
          } }] }).then((v) => { if (v === 'ok') { M3.touch(); Mini.toast('退款申请已提交'); ctx.refresh(); ctx.scroller.scrollTo({ top: 0, behavior: UI.rm ? 'auto' : 'smooth' }); } });
        }
        return wrap;
      });
    },
  };

  /* =====================================================================================
     优惠券（二级页；主次布局）：“我的券”（可用、已使用、已过期）和“领券中心”两个页签，券面额是主角；兑换码在“我的券”顶部
     ===================================================================================== */
  const cState = (c) => (c.state === 'USED' ? 'used' : c.state === 'EXPIRED' || c.expire < today() ? 'expired' : 'usable');
  const valueNode = (c) => (c.kind === '折扣' ? h('span.m3-tk-v', {}, h('b', { text: String(c.value / 10) }), h('small', { text: '折' })) : c.kind === '兑换' ? h('span.m3-tk-v.is-text', {}, h('b', { text: '兑换' })) : h('span.m3-tk-v', {}, h('small', { text: '¥' }), h('b', { text: String(c.value / 100) })));
  const thText = (c) => (c.kind === '折扣' ? (c.cap || tpOf(c).cap ? '最高减 ' + money0(c.cap || tpOf(c).cap) : '无门槛') : c.threshold ? '满 ' + money0(c.threshold) + ' 可用' : '无门槛');
  const expText = (c) => {
    const d = diff(today(), c.expire);
    if (d < 0) return '有效期至 ' + md(c.expire); if (d === 0) { const left = 24 * 60 - (B.NOW().getHours() * 60 + B.NOW().getMinutes()); return '今天 23:59 到期，剩余 ' + Math.floor(left / 60) + ' 小时 ' + (left % 60) + ' 分'; }
    return d <= 3 ? d + ' 天后到期（' + md(c.expire) + '）' : '有效期至 ' + md(c.expire);
  };
  const tpOf = (c) => B.db.coupons.find((x) => x.id === c.couponId) || {};
  const ruleRows = (c) => {
    const tp = tpOf(c);
    return [['使用门槛', c.kind === '折扣' ? '实付金额打 ' + c.value / 10 + ' 折' + (tp.cap ? '，优惠最多 ' + money0(tp.cap) : '') : c.threshold ? '订单满 ' + money0(c.threshold) + ' 立减 ' + money0(c.value) : '无门槛，立减 ' + money0(c.value)], ['适用范围', c.scope || tp.scope || '全部商品'], ['叠加规则', '一笔订单限用 1 张，不与其他优惠券叠加'],
      ['有效期', (c.got ? md(c.got) + ' 领取，' : '') + '至 ' + c.expire + ' 23:59'], ['退款与退券', '订单全额退款时，未过期的券退回账户；部分退款、已过期的券不退回'], ['来源', c.source || '领券中心']];
  };
  /** 券面：左侧价值区，右侧券名、范围、有效期、操作；M3.ticket(c, {use, onUse}) */
  M3.ticket = (c, o) => {
    o = o || {}; const s = cState(c), dead = s !== 'usable', soon = !dead && diff(today(), c.expire) <= 0, panel = h('div.m3-tk-rules', { hidden: true }, h('dl.m3-rules', {}, ruleRows(c).map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))));
    const tog = h('button.m3-tk-tog', { type: 'button', 'aria-expanded': 'false', text: '使用规则', on: { click: () => { const open = panel.hidden; panel.hidden = !open; tog.setAttribute('aria-expanded', String(open)); } } }, UI.icon('down', 'icon--sm'));
    return h('article.m3-tk' + (dead ? '.is-dead.has-stamp' : '') + (soon ? '.is-soon' : ''), { 'aria-label': c.name },
      h('div.m3-tk-main', {}, h('div.m3-tk-l', {}, valueNode(c), h('span.m3-tk-th', { text: thText(c) })),
        h('div.m3-tk-r', {}, h('h3', { text: c.name }), h('p.muted', { text: (c.scope || '全部商品') + (s === 'used' ? ' · ' + (c.usedAt ? md(c.usedAt) + ' 使用' : '已使用') : '') }), h('p.m3-tk-exp' + (soon ? '.is-hot' : ''), { text: s === 'used' ? (c.orderNo ? '订单 ' + c.orderNo : '已使用') : s === 'expired' ? '已于 ' + md(c.expire) + ' 过期' : expText(c) }),
          h('div.m3-tk-act', {}, tog, !dead && o.use !== false ? h('button.btn.btn--sm.btn--primary', { type: 'button', text: '去使用', 'aria-label': '去使用：' + c.name, on: { click: () => (o.onUse ? o.onUse(c) : null) } }) : null)),
        dead ? h('span.m3-stamp', { text: s === 'used' ? '已使用' : '已过期' }) : null), panel);
  };

  window.PAGES_MINI.coupons = {
    title: '优惠券', tab: null, from: 'me', auth: true, nav: { title: '优惠券' },
    layout: '主次布局', reason: '优惠券页的主角是“我现在能用哪张”：默认打开可用的券，面额放大、临期写剩余时间；领券和兑换码是配角，放进“领券中心”页签和顶部一行输入；已使用、已过期的券盖章退后',
    scenes: [{ id: 'claim-sold', label: '领券失败：刚被抢光' }, { id: 'claim-limit', label: '领券失败：已达领取上限' }, { id: 'claim-daily', label: '领券失败：今日已领' }, { id: 'claim-paused', label: '领券失败：活动暂停发放' }, { id: 'redeem-locked', label: '兑换码：连续输错，需等待' }],
    skeleton: () => h('div.mini-skel', { style: { paddingTop: '12px' } }, h('div.skel', { style: { height: '48px' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } }), h('div.skel', { style: { height: '96px', borderRadius: 'var(--r-md)' } })),
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { tab: ctx.params.tab === 'center' ? 'center' : 'mine', seg: ['usable', 'used', 'expired'].includes(ctx.params.seg) ? ctx.params.seg : 'usable', fails: 0, lock: 0 });
      if (ctx.scene === 'redeem-locked' && S.lock < Date.now()) S.lock = Date.now() + 45000;
      return Mini.load(() => B.db.myCoupons).then((mineAll) => {
        const page = h('section.mini-page.m3-coupons'), body = h('div.m3-cbody'), head = h('div.m3-chead');
        const mine = () => (ctx.scene === 'empty' ? [] : B.db.myCoupons.slice());
        const bySeg = (id) => mine().filter((c) => cState(c) === id).sort((a, b) => (id === 'usable' ? (a.expire < b.expire ? -1 : 1) : id === 'used' ? ((a.usedAt || '') < (b.usedAt || '') ? 1 : -1) : (a.expire < b.expire ? 1 : -1)));
        const goUse = () => ctx.switchTab('menu');
        const topSeg = M3.seg([['mine', '我的券'], ['center', '领券中心']], S.tab, (v) => { S.tab = v; draw(); }, '优惠券分类');
        head.append(topSeg);
        /* 兑换码 */
        const code = h('input.input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', maxlength: 20, placeholder: '输入兑换码', 'aria-label': '兑换码', id: 'm3-code' }), err = h('p.err.m3-rerr', { role: 'alert' }), btn = h('button.btn.btn--tint', { type: 'button', text: '兑换', 'data-busy': '兑换中' });
        let lockTimer = 0; ctx.cleanup(() => clearInterval(lockTimer));
        const paintLock = () => { const left = Math.ceil((S.lock - Date.now()) / 1000); if (left > 0) { err.textContent = '输错次数过多，请 ' + left + ' 秒后再试'; btn.disabled = true; } else { clearInterval(lockTimer); if (btn.disabled) { btn.disabled = false; err.textContent = ''; S.fails = 0; } } };
        const doRedeem = async () => {
          err.textContent = ''; code.removeAttribute('aria-invalid');
          const raw = code.value.trim().toUpperCase().replace(/[\s-]/g, '');
          const fail = (msg) => { S.fails++; err.textContent = UNIFY_REDEEM && ['不存在', '已兑换', '已过期'].includes(msg.k) ? '兑换码无效或已使用' : msg.t; code.setAttribute('aria-invalid', 'true'); if (S.fails >= 5) { S.lock = Date.now() + 60000; paintLock(); lockTimer = setInterval(paintLock, 1000); } code.focus(); };
          if (!/^[A-Z0-9]{6,16}$/.test(raw)) { err.textContent = raw ? '兑换码由 6 到 16 位字母或数字组成，请检查后重新输入' : '请输入兑换码'; code.setAttribute('aria-invalid', 'true'); code.focus(); return; }
          await M3.busy(btn, async () => {
            const r = await M3.act(null, 700); if (!r.ok) { err.textContent = r.reason; return; }
            const e = B.db.redeemCodes[raw];
            if (!e) return fail({ k: '不存在', t: '兑换码不存在，请核对后重新输入' }); if (e.st === 'used') return fail({ k: '已兑换', t: '这个兑换码已经兑换过了' }); if (e.st === 'expired') return fail({ k: '已过期', t: '这个兑换码已过期，不能再兑换' });
            const tp = B.db.coupons.find((x) => x.id === e.couponId), nc = grant(tp, '兑换码'); e.st = 'used'; S.fails = 0; code.value = ''; S.seg = 'usable'; S.flashId = nc.id; M3.touch(); Mini.toast('兑换成功，已放入“可用”'); draw();
          });
          if (S.lock > Date.now()) paintLock();
        };
        btn.addEventListener('click', doRedeem); code.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem(); }); code.addEventListener('input', () => { if (btn.disabled === false) { err.textContent = ''; code.removeAttribute('aria-invalid'); } });
        if (S.lock > Date.now()) { paintLock(); lockTimer = setInterval(paintLock, 1000); }
        const redeem = h('section.m3-redeem', { 'aria-label': '兑换优惠券' }, h('div.m3-redeemrow', {}, UI.icon('ticket'), code, btn), err, h('p.muted', { text: '演示：WELCOME5 可兑换，USED2026 已兑换，OLD2025 已过期' }));
        /* 领取 */
        function grant(tp, source) {
          const db = B.db, id = db.myCoupons.reduce((m, x) => Math.max(m, x.id), 0) + 1, nc = { id, couponId: tp.id, name: tp.name, kind: tp.kind, threshold: tp.threshold, value: tp.value, expire: addD(today(), tp.days), state: 'UNUSED', scope: tp.scope, got: today(), source };
          db.myCoupons.unshift(nc); tp.claimed += 1; return nc;
        }
        const claimState = (tp) => {
          const got = B.db.myCoupons.filter((c) => c.couponId === tp.id).length;
          if (tp.startAt && tp.startAt > today()) return { k: 'soon', label: md(tp.startAt) + ' 开抢', sub: diff(today(), tp.startAt) + ' 天后 00:00 开放领取' };
          if (tp.claimed >= tp.stock) return { k: 'out', label: '已抢光', sub: '下次早点来' };
          if (got >= tp.perUser) return { k: 'got', label: '去使用', sub: '已领取 ' + got + ' 张（每人限领 ' + tp.perUser + ' 张）' };
          return { k: 'can', label: '立即领取', sub: '每人限领 ' + tp.perUser + ' 张' + (tp.stock - tp.claimed <= 100 ? '，仅剩 ' + (tp.stock - tp.claimed) + ' 张' : '') };
        };
        const claim = async (tp, btnEl, card) => {
          await M3.busy(btnEl, async () => {
            const r = await M3.act(() => {
              if (ctx.scene === 'claim-sold') { tp.claimed = tp.stock; throw new Error('来晚了，这张券刚刚被抢光'); }
              if (ctx.scene === 'claim-limit') throw new Error('已达到领取上限（每人限领 ' + tp.perUser + ' 张）');
              if (ctx.scene === 'claim-daily') throw new Error('今天已经领过了，明天再来');
              if (ctx.scene === 'claim-paused') throw new Error('这个活动暂时停止发放，请稍后再看');
              if (tp.claimed >= tp.stock) throw new Error('来晚了，这张券已经被抢光'); if (B.db.myCoupons.filter((c) => c.couponId === tp.id).length >= tp.perUser) throw new Error('已达到领取上限（每人限领 ' + tp.perUser + ' 张）');
              return grant(tp, '领券中心');
            }, 600);
            if (!r.ok) { Mini.toast(r.reason, { kind: 'bad' }); card.querySelector('.m3-claimerr').textContent = r.reason; if (r.biz) drawCenter(); return; }
            S.flashId = r.v.id; M3.touch(); Mini.toast('领取成功，已放入“可用”'); drawCenter(true, tp.id);
          });
        };
        /* 页签内容 */
        const drawMine = () => {
          const segs = [['usable', '可用'], ['used', '已使用'], ['expired', '已过期']], tabs = M3.tabs(segs.map(([id, label]) => ({ id, label, n: bySeg(id).length })), S.seg, (id) => { S.seg = id; drawList(); }, '优惠券状态'), list = h('div.m3-tklist');
          const drawList = () => {
            const cs = bySeg(S.seg); list.replaceChildren();
            if (!cs.length) { list.append(S.seg === 'usable' ? Mini.empty('暂时没有可用的优惠券', { label: '去领券', on: () => { S.tab = 'center'; draw(); } }, { sub: '领券中心每天更新' }) : Mini.empty(S.seg === 'used' ? '还没有用过优惠券' : '没有过期的优惠券', null, { sub: S.seg === 'used' ? '用过的券会放在这里' : '过期的券会放在这里，超过 90 天自动清理' })); return; }
            cs.forEach((c) => { const t = M3.ticket(c, { onUse: goUse }); if (c.id === S.flashId) t.classList.add('mini-flash'); list.append(t); }); S.flashId = 0;
            if (S.seg === 'usable' && cs.some((c) => diff(today(), c.expire) <= 2)) list.prepend(M3.alert(cs.filter((c) => diff(today(), c.expire) <= 2).length + ' 张券 2 天内到期，记得在到期前使用', { kind: 'warn' }));
          };
          drawList(); body.replaceChildren(redeem, tabs, list);
        };
        function drawCenter(keepScroll, flashId) {
          const tps = B.db.coupons.filter((t) => t.status === 'ON' && t.kind !== '兑换'), order = { can: 0, soon: 1, got: 2, out: 3 }, items = tps.map((tp) => ({ tp, s: claimState(tp) })).sort((a, b) => order[a.s.k] - order[b.s.k]), list = h('div.m3-tklist');
          if (ctx.scene === 'empty' || !items.length) { body.replaceChildren(Mini.empty('领券中心暂时没有券', { label: '看看我的券', kind: 'tint', on: () => { S.tab = 'mine'; draw(); } }, { sub: '新的券上架后会显示在这里' })); return; }
          items.forEach(({ tp, s }) => {
            const fake = { id: -tp.id, couponId: tp.id, name: tp.name, kind: tp.kind, threshold: tp.threshold, value: tp.value, expire: addD(today(), tp.days), state: 'UNUSED', scope: tp.scope, source: '领券中心' };
            const t = M3.ticket(fake, { use: false }), act = t.querySelector('.m3-tk-act'), exp = t.querySelector('.m3-tk-exp'), err2 = h('p.err.m3-claimerr', { role: 'alert' });
            exp.textContent = '领取后 ' + tp.days + ' 天内有效 · ' + s.sub;
            const b = h('button.btn.btn--sm' + (s.k === 'can' ? '.btn--primary' : s.k === 'got' ? '.btn--tint' : ''), { type: 'button', text: s.label, disabled: s.k === 'soon' || s.k === 'out', 'data-busy': '领取中', 'aria-label': s.label + '：' + tp.name, on: { click: () => (s.k === 'got' ? goUse() : claim(tp, b, t)) } });
            act.append(b); t.querySelector('.m3-tk-r').append(err2);
            if (s.k === 'out' || s.k === 'soon') t.classList.add('is-dead', 'is-' + s.k);
            if (s.k === 'out') { t.classList.add('has-stamp'); t.querySelector('.m3-tk-main').append(h('span.m3-stamp', { text: '已抢光' })); }
            if (s.k === 'got') t.classList.add('is-got');
            if (flashId === tp.id) t.classList.add('mini-flash');
            list.append(t);
          });
          const st = keepScroll ? ctx.scroller.scrollTop : 0; body.replaceChildren(h('p.muted.m3-cnote', { text: '领取后自动放入“我的券”，下单时系统会选出最省的一张' }), list); if (keepScroll) ctx.scroller.scrollTop = st;
        }
        function draw() { topSeg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (S.tab === 'mine')))); if (S.tab === 'mine') drawMine(); else drawCenter(); }
        page.append(head, body); draw();
        return page;
      });
    },
  };
})();
