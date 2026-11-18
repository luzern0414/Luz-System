/* 第二批页面（三）之四：消息（notices）、设置（settings）、协议阅读（legal，参数 doc=agreement|privacy）、注销账号（cancel-account）、意见反馈（feedback）。
   消息读 B.db.notices 与 B.db.subs（订阅额度）；协议读 B.db.legal（版本、同意留痕、专项授权）；注销读订单、会员卡、储值、预约，写 B.db.deletion；反馈写 B.db.feedbacks。 */
(function () {
  'use strict';
  const { h } = UI;
  const M3 = Mini.p3, { today, addD, diff, md } = M3;
  const money = Mini.money;
  const byAt = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);   // 按时间倒序，同一时间保持原顺序
  const skel = (n) => h('div.mini-skel', { style: { paddingTop: '12px' } }, Array.from({ length: n || 4 }, () => h('div.skel', { style: { height: '64px', borderRadius: 'var(--r-md)' } })));

  /* =====================================================================================
     消息（二级页；横带分层）：订阅额度条 → 分组页签（订单、活动、系统）与全部已读 → 按日期分带的站内信
     ===================================================================================== */
  const groupOf = (n) => ({ 订单: '订单', 会员卡: '订单', 卡券: '活动', 活动: '活动', 系统: '系统' }[n.kind] || '系统');
  const iconOf = (n) => ({ 订单: 'receipt', 会员卡: 'card', 卡券: 'tag', 活动: 'gift', 系统: 'bell' }[n.kind] || 'bell');
  const dayLabel = (at) => { const d = at.slice(0, 10), t = today(); return d === t ? '今天' : d === addD(t, -1) ? '昨天' : '更早'; };
  const timeLabel = (at) => { const d = at.slice(0, 10), t = today(); return d === t ? at.slice(11, 16) : d === addD(t, -1) ? '昨天' : at.slice(5, 10); };
  const JUMP = { orders: '查看订单', coupons: '去使用', 'my-cards': '查看会员卡', wallet: '查看储值', legal: '去阅读', profile: '去完善资料', 'card-detail': '查看会员卡' };

  window.PAGES_MINI.notices = {
    title: '消息', tab: null, from: 'me', auth: true, nav: { title: '消息' },
    layout: '横带分层', reason: '消息先回答“有没有要处理的”：顶部一条订阅额度（额度不够时给“去授权”），中间分组页签带未读数和全部已读，下面按今天、昨天、更早分带；未读用红点，点开读详情并跳到对应页面',
    scenes: [{ id: 'quota-low', label: '订阅额度全部用完：提示去授权' }, { id: 'sub-ban', label: '授权失败：微信里关闭了订阅消息' }, { id: 'jump-gone', label: '点开消息：目标页面已不存在' }],
    skeleton: () => skel(5),
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { g: 'all', shown: 10 });
      return Mini.load(() => B.db.notices).then(() => {
        const page = h('section.mini-page.m3-notices'), subs = h('section.m3-subs'), top = h('div.m3-ntop'), list = h('div.m3-nlist'), more = h('div');
        const all = () => (ctx.scene === 'empty' ? [] : B.db.notices.filter((n) => !n.deleted)), unread = (g) => all().filter((n) => !n.read && (g === 'all' || groupOf(n) === g)).length;
        const quota = () => B.db.subs.map((s) => Object.assign({}, s, { left: ctx.scene === 'quota-low' ? 0 : s.left }));
        /* 订阅额度与授权（系统风格的授权弹层示意） */
        const authorize = () => {
          const q = quota(), sel = new Set(q.filter((x) => x.left <= 0).map((x) => x.id)); if (!sel.size) q.forEach((x) => sel.add(x.id));
          const warn = h('div'), rows = q.map((x) => h('label.m3-authrow', {}, h('input', { type: 'checkbox', checked: sel.has(x.id), on: { change: (e) => { if (e.target.checked) sel.add(x.id); else sel.delete(x.id); } } }), h('span.grow', {}, h('b', { text: x.name }), h('small', { text: x.desc + '（一次性，授权一次收到一次）' }))));
          const body = h('div.m3-auth', {}, h('div.m3-auth-head', {}, h('span.m3-authlogo', {}, UI.icon('shop')), h('div', {}, h('b', { text: B.shop.name }), h('small', { text: '想给你发送以下通知' }))), h('div.m3-authlist', {}, rows), warn, h('p.muted', { text: '一次最多选 5 项。拒绝授权不影响点单和使用，站内信仍然可以看到。' }));
          return Mini.sheet({ title: '订阅消息', body, actions: [{ label: '拒绝', value: 'no' }, { label: '允许', kind: 'primary', value: 'yes', on: async () => {
            warn.replaceChildren();
            if (!sel.size) { warn.append(M3.alert('请至少选择一项', { kind: 'warn' })); return false; }
            if (sel.size > 5) { warn.append(M3.alert('一次最多只能选择 5 项', { kind: 'warn' })); return false; }
            const r = await M3.act(() => { if (ctx.scene === 'sub-ban') throw new Error('你在微信“设置 > 通知”里关闭了该小程序的订阅消息，请先打开后再授权'); B.db.subs.forEach((s) => { if (sel.has(s.id)) s.left += 1; }); }, 600);
            if (!r.ok) { warn.append(M3.alert(r.reason, { kind: 'bad' })); return false; }
          } }] }).then((v) => { if (v === 'yes') { Mini.toast('已授权，所选提醒各增加 1 次'); drawSubs(); } else if (v === 'no') Mini.toast('已拒绝，不影响使用，站内信仍可查看'); });
        };
        const drawSubs = () => {
          const q = quota(), low = q.filter((x) => x.left <= 0);
          subs.replaceChildren(h('div.mini-card.m3-subcard', {}, h('div.m3-subhead', {}, h('span.m3-ic', {}, UI.icon('bell')), h('div.grow', {}, h('b', { text: '订阅提醒额度' }), h('small', { text: low.length ? '“' + low.map((x) => x.name).join('”“') + '”额度已用完，到时可能收不到微信提醒' : '额度充足，订单和会员卡提醒会推送到微信' })), h('button.btn.btn--sm' + (low.length ? '.btn--tint' : ''), { type: 'button', text: low.length ? '去授权' : '补充额度', on: { click: authorize } })),
            M3.fold('各项提醒的剩余次数', h('div.m3-quota', {}, q.map((x) => h('div', {}, h('span.grow', { text: x.name }), h('span.m3-q' + (x.left <= 0 ? '.is-zero' : ''), { text: x.left <= 0 ? '已用完' : '剩 ' + x.left + ' 次' })))))));
        };
        /* 全部已读、详情、删除 */
        const markAll = async () => {
          const ts = all().filter((n) => !n.read && (S.g === 'all' || groupOf(n) === S.g)); if (!ts.length) return Mini.toast('没有未读消息');
          if (!(await Mini.confirm('把' + (S.g === 'all' ? '全部' : '“' + S.g + '”类') + ' ' + ts.length + ' 条未读消息标为已读？红点会消失，消息不会被删除。', { title: '全部已读', ok: '全部已读' }))) return;
          const r = await M3.act(() => ts.forEach((n) => { n.read = true; }), 500); if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' });
          M3.touch(); Mini.toast('已全部标为已读'); drawAll();
        };
        const open = (n) => {
          if (!n.read) { n.read = true; M3.touch(); drawAll(); }
          const j = n.jump, exist = j && window.PAGES_MINI[j.page] && ctx.scene !== 'jump-gone';
          return Mini.sheet({ title: n.kind + '通知', body: h('div.m3-ndetail', {}, h('h3', { text: n.title }), h('small', { text: n.at.slice(5, 16) }), h('p', { text: n.body })), actions: [{ label: '删除', kind: 'danger', value: 'del' }, j ? { label: JUMP[j.page] || '查看详情', kind: 'primary', value: 'go' } : { label: '我知道了', kind: 'primary', value: 'ok' }] }).then((v) => {
            if (v === 'del') { n.deleted = true; M3.touch(); drawAll(); Mini.toast('已删除', { action: { label: '撤销', on: () => { n.deleted = false; M3.touch(); drawAll(); } } }); }
            else if (v === 'go') { if (!exist) { Mini.toast('这条消息对应的页面已经不存在了', { kind: 'bad' }); return; } ctx.push(j.page, j.params); }
          });
        };
        /* 页签与列表 */
        const GS = [['all', '全部'], ['订单', '订单'], ['活动', '活动'], ['系统', '系统']];
        const tabs = M3.tabs(GS.map(([id, label]) => ({ id, label, n: unread(id) || null })), S.g, (id) => { S.g = id; S.shown = 10; drawList(); }, '消息分类');
        const summary = h('span.muted');
        function drawAll() { drawTop(); drawList(); }
        function drawTop() { const n = unread('all'); summary.textContent = n ? n + ' 条未读' : '全部已读'; GS.forEach(([id]) => { const b = tabs.querySelector('[data-id="' + id + '"]'), u = unread(id); let sp = b.querySelector('.m3-n'); if (u) { if (!sp) { sp = h('span.m3-n'); b.append(sp); } sp.textContent = String(u); } else if (sp) sp.remove(); }); }
        function drawList() {
          const rows = all().filter((n) => S.g === 'all' || groupOf(n) === S.g).sort(byAt); list.replaceChildren(); more.replaceChildren();
          if (!rows.length) { list.append(Mini.empty(S.g === 'all' ? '还没有消息' : '暂时没有' + S.g + '消息', S.g === 'all' ? { label: '去点单', kind: 'tint', on: () => ctx.switchTab('menu') } : { label: '看全部消息', kind: 'tint', on: () => { S.g = 'all'; tabs.set('all'); drawList(); } }, { sub: '订单进度、优惠和会员卡提醒会出现在这里' })); return; }
          let cur = '', box = null;
          rows.slice(0, S.shown).forEach((n) => {
            const d = dayLabel(n.at); if (d !== cur) { cur = d; list.append(h('h3.m3-dayh', { text: d }), box = h('div.mini-card.m3-nbox')); }
            box.append(h('button.m3-nrow' + (n.read ? '' : '.is-unread'), { type: 'button', 'aria-label': (n.read ? '' : '未读，') + n.title, on: { click: () => open(n) } }, h('span.m3-ic.k-' + ({ 订单: 'order', 活动: 'promo', 系统: 'sys' }[groupOf(n)] || 'sys'), {}, UI.icon(iconOf(n)), n.read ? null : h('i.m3-dot')), h('span.grow', {}, h('b', { text: n.title }), h('small', { text: n.body })), h('span.m3-ntime', { text: timeLabel(n.at) })));
          });
          if (rows.length > S.shown) more.append(h('button.m3-more', { type: 'button', text: '加载更多（还有 ' + (rows.length - S.shown) + ' 条）', on: { click: async (e) => { e.currentTarget.disabled = true; await UI.sleep(300); S.shown += 10; drawList(); } } }));
          else if (rows.length > 10) more.append(h('p.m3-end', { text: '没有更多了' }));
        }
        top.append(summary, h('button.m3-link', { type: 'button', on: { click: markAll } }, UI.icon('check', 'icon--sm'), '全部已读'));
        drawSubs(); drawTop(); drawList(); page.append(subs, top, tabs, list, more);
        return page;
      });
    },
  };

  /* =====================================================================================
     协议阅读（二级页；主次布局）：目录 → 正文 → 底部同意与留痕；顶部有滚动阅读进度
     ===================================================================================== */
  const LEGAL = {
    agreement: [
      ['总则', ['欢迎使用“示例门店”小程序（以下简称“本服务”）。你登录并使用本服务，即表示已阅读并同意本协议。', '涉及你权益的重要条款，我们会以加粗或单独弹窗的方式提示，请特别留意。']],
      ['账号与登录', ['你可以使用微信身份登录，首次登录会自动为你建立会员档案。你应妥善保管账号，不得出借、转让或出售。', '发现账号被他人使用时，请立即联系客服，我们会协助冻结账号。']],
      ['点单、支付与取餐', ['订单提交后按页面显示的价格结算。未在 30 分钟内支付的订单会自动关闭，优惠券和库存同步释放。', '到店取餐时请出示取餐号。门店暂停营业或休息期间，可以浏览菜单，但不能下单。']],
      ['会员卡与储值', ['会员卡和储值属于预付费服务，购买前需要你主动勾选《预付卡条款》。储值本金不过期；赠送金按活动规则使用，不能提现、转让或转赠。', '付款后 7 日内且未使用的，可以全额退还；其余按原价扣除已使用部分，并收取页面写明的手续费，赠送部分不折现。']],
      ['优惠券', ['优惠券按券面写明的门槛、适用范围和有效期使用，不兑现、不找零，一笔订单限用一张，不与其他优惠券叠加。', '订单整单全额退款时，未过期的券退回账户；部分退款或已过期的券不退回。']],
      ['退款与售后', ['订单取消或售后退款原路退回，到账时间以支付渠道为准。申请退款后可以在订单详情里查看进度。']],
      ['用户行为规范', ['请勿利用本服务刷单、套取优惠或从事其他违法违规行为。发现异常时，我们可以限制或终止相关服务，并保留追究责任的权利。']],
      ['协议变更与终止', ['协议发生实质变更时，我们会在你下次进入小程序时展示变更摘要并请你重新确认。你不同意的，只能浏览不需要个人信息的公开内容。', '你可以随时在“我的 > 设置 > 账号注销”申请终止本协议。']],
      ['联系我们', ['客服电话 ' + B.shop.phone + '，服务时间 ' + B.shop.hours + '。']],
    ],
    privacy: [
      ['我们收集哪些信息', ['为了让你完成点单和使用会员服务，我们会收集：微信昵称与头像、手机号、订单与支付记录、会员卡与储值记录。', '位置信息只用来显示你与门店的距离，你拒绝授权后其余功能照常可用。']],
      ['我们如何使用', ['这些信息用于处理订单、发放优惠与会员权益、发送你订阅的通知，以及保障账号和交易安全。', '经你同意，我们会根据你的点单偏好做个性化推荐，你可以随时在“设置 > 协议与隐私”里关闭。']],
      ['对外提供与委托处理', ['除支付机构、短信服务商等必须的合作方外，我们不会向第三方提供你的个人信息；向第三方提供前，会单独征得你的同意。']],
      ['保存期限与安全措施', ['我们按业务需要保存你的信息，账号注销后会删除或匿名化。依法需要保留的交易与财务记录，保存期限届满后同样删除。', '我们采用加密传输、访问控制等措施保护你的信息安全。']],
      ['你的权利', ['你可以在“我的 > 个人资料”查阅、更正信息，在“设置”里撤回专项授权，或申请注销账号。', '撤回授权后，我们会立即停止相应的处理，并删除相关数据（包括合作方处理的部分）。']],
      ['未成年人保护', ['我们不主动面向不满 14 周岁的未成年人收集信息；涉及敏感功能时，需要监护人同意。']],
      ['本政策的更新', ['政策发生实质变更时，我们会在你下次进入时展示变更摘要并请你重新确认。']],
      ['联系我们', ['个人信息相关的问题，请拨打 ' + B.shop.phone + ' 联系我们，我们会在 15 个工作日内答复。']],
    ],
  };

  window.PAGES_MINI.legal = {
    title: '协议与隐私', tab: null, from: 'me', bar: true, nav: { title: '协议与隐私' },
    layout: '主次布局', reason: '阅读页的主角是正文：顶部目录可跳转，滚动时有阅读进度；有新版本时先给变更摘要，同意固定在底部并留下同意时间，不同意也不阻断浏览',
    scenes: [{ id: 'version-moved', label: '同意失败：协议刚刚又更新了' }],
    skeleton: () => skel(6),
    render(ctx) {
      const key = ctx.params.doc === 'agreement' ? 'agreement' : 'privacy';
      return Mini.load(() => B.db.legal).then((lg) => {
        const doc = lg.docs[key], con = lg.consents[key], text = LEGAL[key], pending = !con || con.version !== doc.version;
        ctx.setTitle(doc.name);
        const wrap = h('div.m3-wrap'), page = h('section.mini-page.m3-legal'), bar = h('div.m3-bar.m3-legalbar'), tip = h('div');
        const pct = h('span.num', { text: '已读 0%' }), fill = h('i'), strip = h('div.m3-readstrip', { role: 'progressbar', 'aria-label': '阅读进度', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, h('span.m3-readbar', {}, fill), pct);
        const upd = () => { const sc = ctx.scroller, max = sc.scrollHeight - sc.clientHeight, p = max > 0 ? Math.min(100, Math.round((sc.scrollTop / max) * 100)) : 100; pct.textContent = '已读 ' + p + '%'; fill.style.setProperty('--v', p / 100); strip.setAttribute('aria-valuenow', p); };
        { const sc = ctx.scroller; sc.addEventListener('scroll', upd, { passive: true }); ctx.cleanup(() => sc.removeEventListener('scroll', upd)); setTimeout(upd, 120); if (window.ResizeObserver) { const ro = new ResizeObserver(upd); ro.observe(page); ctx.cleanup(() => ro.disconnect()); } }
        const toc = h('ol.m3-toc', {}, text.map(([t], i) => h('li', {}, h('button', { type: 'button', on: { click: () => { const el = page.querySelector('#m3-sec-' + i); el && el.scrollIntoView({ block: 'start', behavior: UI.rm ? 'auto' : 'smooth' }); } } }, h('span.num', { text: String(i + 1) }), t))));
        const tocFold = M3.fold('目录（共 ' + text.length + ' 节）', toc, true); tocFold.classList.add('mini-card');
        page.append(strip, h('div.m3-legalhead', {}, h('h2', { text: doc.name }), h('p.muted', { text: '版本 ' + doc.version + ' · 更新于 ' + doc.updated })),
          pending && doc.changes ? h('div.m3-changes', {}, h('b', { text: '协议已更新，请阅读并同意' }), h('ul', {}, doc.changes.map((c) => h('li', { text: c })))) : null,
          tocFold,
          h('article.m3-prose', {}, text.map(([t, ps], i) => h('section', { id: 'm3-sec-' + i }, h('h3', { text: (i + 1) + '. ' + t }), ps.map((p) => h('p', { text: p }))))));
        /* 底部：待同意 → 同意并继续；已同意 → 留痕 */
        const agreeBtn = h('button.btn.btn--primary', { type: 'button', text: '同意并继续', 'data-busy': '提交中', on: { click: async () => {
          tip.replaceChildren();
          await M3.busy(agreeBtn, async () => {
            const r = await M3.act(() => { if (ctx.scene === 'version-moved') { doc.version = String(Number(doc.version) + 0.1).slice(0, 3); throw new Error('协议刚刚又更新到 ' + doc.version + ' 版，已为你刷新，请阅读后再同意'); } lg.consents[key] = { version: doc.version, at: B.fmt(B.NOW()), channel: '微信小程序' }; }, 700);
            if (!r.ok) { tip.append(M3.alert(r.reason, { kind: 'bad' })); if (r.biz) ctx.refresh(); return; }
            M3.touch(); Mini.toast('已同意，已记录同意时间'); ctx.refresh();
          });
        } } });
        const refuse = h('button.btn', { type: 'button', text: '暂不同意', on: { click: async () => { if (await Mini.confirm('不同意时，只能浏览菜单和门店等不需要个人信息的内容，下单、会员卡、储值暂时不能使用。你随时可以回来同意。', { title: '暂不同意', ok: '暂不同意', cancel: '再看看' })) { Mini.toast('已记录，你可以继续浏览'); ctx.back(); } } } });
        if (pending) bar.append(refuse, agreeBtn);
        else bar.append(h('div.m3-trace', {}, UI.icon('check', 'icon--sm'), h('span', {}, '你已同意此版本', h('small', { text: con.at.slice(5, 16) + ' · ' + con.channel }))), h('button.btn', { type: 'button', text: '返回', on: { click: () => ctx.back() } }));
        wrap.append(page, h('div.m3-barwrap', {}, tip, bar)); return wrap;
      });
    },
  };
  M3.openLegal = (ctx, doc) => ctx.push('legal', { doc });

  /* =====================================================================================
     设置（二级页；横带分层）：通知开关 → 协议与隐私（版本、专项授权撤回）→ 通用（缓存、关于）→ 账号（注销、退出登录）
     ===================================================================================== */
  const cacheText = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB');
  window.PAGES_MINI.settings = {
    title: '设置', tab: null, from: 'me', nav: { title: '设置' },
    layout: '横带分层', reason: '设置按“影响谁”分四条带：通知（日常最常调）、协议与隐私（要留痕的）、通用（缓存与关于）、账号（注销与退出）；开关不做乐观更新，失败在原行写原因',
    scenes: [{ id: 'guest', label: '未登录：只显示协议与通用' }, { id: 'save-fail', label: '开关保存失败：网络异常' }, { id: 'pending-doc', label: '协议有新版本待同意' }],
    skeleton: () => skel(6),
    render(ctx) {
      const logged = Mini.auth.is() && ctx.scene !== 'guest', st = B.db.settings, lg = B.db.legal;
      const cons = Object.assign({}, lg.consents, ctx.scene === 'pending-doc' ? { agreement: { version: '2.2', at: '2026-05-10 09:00', channel: '微信小程序' } } : {});
      const pendingDocs = !logged ? [] : ['agreement', 'privacy'].filter((k) => !cons[k] || cons[k].version !== lg.docs[k].version);
      const page = h('section.mini-page.m3-settings');
      const row = (icon, title, sub, onClick, right) => h('button.m3-srow', { type: 'button', on: { click: onClick } }, h('span.m3-ic', {}, UI.icon(icon)), h('span.grow', {}, h('b', { text: title }), sub ? h('small', { text: sub }) : null), right || UI.icon('right', 'icon--sm'));
      /* 通知开关：不做乐观更新，成功后才切换；关闭要写清影响 */
      const sw = (key, icon, title, sub, offText) => {
        const err = h('small.err.m3-serr'), cb = h('input.switch', { type: 'checkbox', checked: st[key], 'aria-label': title }), spin = h('span.spin', { hidden: true });
        cb.addEventListener('change', async () => {
          const want = cb.checked; cb.checked = !want; err.textContent = '';
          if (!want && !(await Mini.confirm(offText, { title: '关闭' + title, ok: '关闭', cancel: '保持开启' }))) return;
          cb.disabled = true; spin.hidden = false;
          const r = await M3.act(() => { if (ctx.scene === 'save-fail') throw new Error('网络不太稳定，请稍后再试'); st[key] = want; }, 600);
          cb.disabled = false; spin.hidden = true;
          if (!r.ok) { err.textContent = '没有保存成功：' + r.reason; return; } cb.checked = want; Mini.toast(want ? '已开启' + title : '已关闭' + title);
        });
        return h('div.m3-srow.is-switch', {}, h('span.m3-ic', {}, UI.icon(icon)), h('span.grow', {}, h('b', { text: title }), h('small', { text: sub }), err), spin, h('label.m3-swwrap', {}, cb));
      };
      if (pendingDocs.length) page.append(h('div.m3-pend', { role: 'status' }, UI.icon('info', 'icon--sm'), h('span.grow', {}, h('b', { text: '协议已更新，请阅读并同意' }), h('small', { text: pendingDocs.map((k) => lg.docs[k].name).join('、') + '有新版本，请点下方标有“有更新”的条目阅读' }))));
      if (logged) page.append(h('section.m3-sgroup', {}, h('h2', { text: '通知' }), h('div.mini-card.m3-slist', {},
        sw('orderNotify', 'receipt', '订单通知', '支付成功、出餐取餐、退款到账', '关闭后收不到取餐和退款到账提醒，需要自己进订单页查看进度。'),
        sw('promoNotify', 'gift', '活动通知', '优惠券到账与临期、活动开始', '关闭后不再收到优惠券到账、临期和活动开始的提醒，可能错过优惠；已领取的券照常可用，订单与系统通知不受影响。'),
        sw('sysNotify', 'bell', '系统通知', '服务时间调整、账号安全提醒', '关闭后可能错过服务时间调整和账号安全提醒。站内信仍会保留在“消息”里。'))));
      /* 协议与隐私 */
      const spBox = h('div.mini-card.m3-slist'), drawSp = () => {
        spBox.replaceChildren(...lg.special.map((s) => {
          const err = h('small.m3-serr'), eff = s.showEffect ? h('small.m3-effect', { text: '已生效：' + s.effect }) : null;
          const b = h('button.btn.btn--sm' + (s.on ? '' : '.btn--tint'), { type: 'button', text: s.on ? '撤回' : '重新授权', 'data-busy': '处理中', on: { click: async () => {
            if (s.on && !(await Mini.confirm(s.effect, { title: '撤回“' + s.name + '”', ok: '确认撤回', danger: true, cancel: '保留授权' }))) return;
            await M3.busy(b, async () => { const r = await M3.act(() => { s.on = !s.on; s.at = B.fmt(B.NOW()); s.showEffect = !s.on; }, 600); if (!r.ok) { err.textContent = '没有成功：' + r.reason; return; } M3.touch(); Mini.toast(s.on ? '已重新授权' : '已撤回，' + s.effect.split('；')[0]); drawSp(); });
          } } });
          return h('div.m3-srow.is-top', {}, h('span.m3-ic', {}, UI.icon('shield')), h('span.grow', {}, h('b', { text: s.name }), h('small', { text: s.desc }), h('small.m3-sstate' + (s.on ? '' : '.is-off'), { text: (s.on ? '已授权' : '已撤回') + ' · ' + s.at.slice(5, 16) }), eff, err), b);
        }));
      };
      drawSp();
      const docRow = (k) => { const d = lg.docs[k], c = cons[k], pend = logged && (!c || c.version !== d.version); return row(k === 'agreement' ? 'file' : 'lock', d.name, '版本 ' + d.version + ' · 更新于 ' + d.updated.slice(5) + (logged && !pend ? ' · 已同意' : ''), () => M3.openLegal(ctx, k), pend ? h('span.mini-tag.mini-tag--warn', { text: '有更新' }) : UI.icon('right', 'icon--sm')); };
      page.append(h('section.m3-sgroup', {}, h('h2', { text: '协议与隐私' }),
        h('div.mini-card.m3-slist', {}, docRow('agreement'), docRow('privacy')),
        logged ? h('div.m3-sub2', {}, h('h3', { text: '专项授权' }), spBox, h('p.muted', { text: '用户协议和隐私政策不能单独撤回；如不再同意，可以申请注销账号。' })) : null));
      /* 通用 */
      const cacheVal = h('span.muted.num', { text: cacheText(st.cacheKB) });
      const clear = async () => {
        if (st.cacheKB < 200) return Mini.toast('缓存已经很干净了');
        if (!(await Mini.confirm('清除 ' + cacheText(st.cacheKB) + ' 缓存？图片和菜单会在下次打开时重新加载，不影响账号、订单、会员卡和余额。', { title: '清除缓存', ok: '清除' }))) return;
        cacheVal.replaceChildren(h('span.spin')); const old = st.cacheKB, r = await M3.act(() => { st.cacheKB = 120; }, 900);
        if (!r.ok) { cacheVal.textContent = cacheText(st.cacheKB); return Mini.toast('没有清除成功：' + r.reason, { kind: 'bad' }); } cacheVal.textContent = cacheText(st.cacheKB); Mini.toast('已清除 ' + cacheText(old - 120));
      };
      const about = () => Mini.sheet({ title: '关于', body: h('div.m3-about', {}, h('span.m3-aboutlogo', {}, UI.icon('shop')), h('b', { text: B.shop.name + '小程序' }), h('p.muted', { text: '版本 1.0.0（' + today() + '）' }), h('dl.m3-rules', {}, [['运营主体', B.shop.name], ['客服电话', B.shop.phone], ['服务时间', B.shop.hours], ['门店地址', B.shop.addr]].map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))))), actions: [{ label: '我知道了', kind: 'primary' }] });
      page.append(h('section.m3-sgroup', {}, h('h2', { text: '通用' }), h('div.mini-card.m3-slist', {}, row('trash', '清除缓存', '', clear, cacheVal), row('info', '关于', '版本 1.0.0', about))));
      /* 账号 */
      page.append(logged ? h('section.m3-sgroup', {}, h('h2', { text: '账号与安全' }), h('div.mini-card.m3-slist', {}, row('user', '账号注销', '注销前需要先处理订单、会员卡和余额', () => ctx.push('cancel-account'))), h('button.btn.btn--block.m3-logout', { type: 'button', text: '退出登录', on: { click: () => M3.logout() } }))
        : h('section.m3-sgroup', {}, h('button.btn.btn--primary.btn--block', { type: 'button', text: '登录', on: { click: () => ctx.push('login', { redirect: 'back', from: 'settings' }) } })));
      return page;
    },
  };

  /* =====================================================================================
     注销账号（二级页；横带分层）：阻断清单（每项带出路）→ 注销须知 → 勾选与提交 → 冷静期倒计时与撤回
     ===================================================================================== */
  const COOL_DAYS = 15;
  window.PAGES_MINI['cancel-account'] = {
    title: '注销账号', tab: null, from: 'me', auth: true, bar: true, nav: { title: '注销账号' },
    layout: '横带分层', reason: '注销是不可逆的重事，所以先挡后问：第一条带列出所有阻断项并给出路，清空后第二条带才展示须知、勾选与提交；提交后整页变成冷静期，倒计时与撤回按钮就是主角',
    scenes: [{ id: 'clean', label: '没有阻断项：直接看注销须知' }, { id: 'fresh', label: '登录超过 15 分钟：静默重新登录后重试' }, { id: 'relogin-fail', label: '静默重新登录失败' }, { id: 'new-block', label: '提交时发现新的阻断项' }, { id: 'dup', label: '重复提交：已有注销申请' }, { id: 'cooling', label: '冷静期中：倒计时与撤回' }, { id: 'withdraw-fail', label: '撤回失败：申请已被处理' }, { id: 'anonymized', label: '冷静期届满：已匿名化' }],
    skeleton: () => skel(5),
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { ack: false, extra: false }), me = B.db.me;
      return Mini.load(() => B.db.deletion).then(() => {
        const wrap = h('div.m3-wrap'), page = h('section.mini-page.m3-cancel'), bar = h('div.m3-bar'), tip = h('div');
        let dele = B.db.deletion; if ((ctx.scene === 'cooling' || ctx.scene === 'withdraw-fail') && !dele) dele = { at: Date.now() - 2 * 864e5 - 3 * 36e5, virtual: true }; if (ctx.scene === 'dup' && !dele) dele = { at: Date.now() - 36e5, virtual: true };
        /* 冷静期 */
        if (ctx.scene === 'anonymized') return h('section.mini-page', {}, Mini.empty('账号已完成注销', { label: '回到登录页', on: () => { Mini.auth.logout(); Mini.reset('login'); } }, { illus: 'done', sub: '个人信息已匿名化删除，交易记录按法律要求保留但不再关联到你本人。同一个微信再次登录，会是一个全新的会员。' }));
        if (dele) {
          const until = dele.at + COOL_DAYS * 864e5, cd = h('div.m3-cd', { role: 'timer', 'aria-label': '冷静期剩余时间' }), err = h('div');
          const tick = () => { let ms = Math.max(0, until - Date.now()); const d = Math.floor(ms / 864e5); ms -= d * 864e5; const hh = Math.floor(ms / 36e5); ms -= hh * 36e5; const mm = Math.floor(ms / 6e4), ss = Math.floor((ms - mm * 6e4) / 1e3); cd.replaceChildren(...[[d, '天'], [hh, '时'], [mm, '分'], [ss, '秒']].map(([n, u]) => h('span.m3-cdb', {}, h('b.num', { text: String(n).padStart(2, '0') }), h('small', { text: u })))); };
          tick(); const iv = setInterval(tick, 1000); ctx.cleanup(() => clearInterval(iv));
          page.append(h('section.m3-coolhero', {}, h('span.m3-lab', { text: '注销申请已提交' }), cd, h('p', { text: '冷静期截止 ' + B.fmt(new Date(until)).slice(0, 16) }), ctx.scene === 'dup' ? M3.alert('你已经提交过注销申请，无需重复提交', { kind: 'info' }) : null),
            h('div.mini-card.m3-cooltips', {}, h('h3', { text: '冷静期内会发生什么' }), h('ul.m3-bullets', {}, ['账号暂时保留，期间重新登录或点“撤回注销”，账号立即恢复正常', '期满且没有未处理事项时，个人信息会被匿名化删除，无法恢复', '匿名化后，同一个微信再次登录会是新会员，原来的卡、券、余额都不再可用', '交易与支付记录按法律要求保留，但不再关联到你本人'].map((t) => h('li', { text: t })))), err);
          const wd = h('button.btn.btn--block', { type: 'button', text: '撤回注销', 'data-busy': '撤回中', on: { click: async () => {
            err.replaceChildren();
            if (!(await Mini.confirm('撤回后账号立即恢复正常使用，卡、券、余额都会保留。', { title: '撤回注销', ok: '撤回注销', cancel: '继续注销' }))) return;
            await M3.busy(wd, async () => { const r = await M3.act(() => { if (ctx.scene === 'withdraw-fail' || !B.db.deletion && !dele.virtual) throw new Error('这个注销申请已经处理完成或不存在，无法撤回'); B.db.deletion = null; }, 700); if (!r.ok) { err.append(M3.alert('撤回没有成功：' + r.reason, { kind: 'bad' })); return; } if (ctx.scene === 'cooling' || ctx.scene === 'dup') UI.state.scene[ctx.id] = 'normal'; M3.touch(); Mini.toast('已撤回注销，账号恢复正常'); ctx.refresh(); });
          } } });
          bar.append(wd); wrap.append(page, bar); return wrap;
        }
        /* 阻断清单：读真实的订单、会员卡、储值、预约 */
        const clean = ['clean', 'fresh', 'relogin-fail', 'new-block'].includes(ctx.scene);   // 这几个场景演示提交过程，先当作没有阻断项
        const blocks = () => {
          if (clean) return S.extra ? [{ k: 'new', icon: 'warn', title: '刚刚产生了一笔新的订单退款', sub: '提交时才发现，处理完成后再来', act: '查看进度', on: () => ctx.push('orders', { seg: 'refund' }) }] : [];
          const os = B.db.orders.filter((o) => o.userId === me.id), cards = M3.myCards().filter((c) => ['ACTIVE', 'PENDING', 'FROZEN', 'LOST', 'REFUNDING'].includes(M3.cardState(c).key)), un = os.filter((o) => o.status === 'UNPAID'), rf = os.filter((o) => o.status === 'REFUNDING'), bk = (B.db.bookings || []).filter((b) => b.status === 'BOOKED');
          const out = [];
          if (un.length) out.push({ k: 'unpaid', icon: 'clock', title: '待支付订单 ' + un.length + ' 笔', sub: '取消或支付后才能注销', act: '取消订单', on: async () => { if (!(await Mini.confirm('取消 ' + un.length + ' 笔待支付订单？取消后订单关闭，不会产生扣款。', { title: '取消待支付订单', ok: '取消订单', cancel: '保留', danger: true }))) return; const r = await M3.act(() => un.forEach((o) => { o.status = 'CANCELLED'; }), 600); if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' }); M3.touch(); Mini.toast('已取消待支付订单'); ctx.refresh(); } });
          if (rf.length || me.frozen > 0) out.push({ k: 'refund', icon: 'undo', title: '退款处理中' + (rf.length ? ' ' + rf.length + ' 笔' : '') + (me.frozen > 0 ? '，储值退款冻结 ' + money(me.frozen) : ''), sub: '退款到账后才能注销，无法加快', act: '查看进度', on: () => (me.frozen > 0 && !rf.length ? ctx.push('wallet') : ctx.push('orders', { seg: 'refund' })) });
          if (cards.length) out.push({ k: 'cards', icon: 'card', title: '有效会员卡 ' + cards.length + ' 张', sub: '可以先退卡，或等卡到期、用完', act: '去处理', on: () => ctx.push('my-cards') });
          if (me.balance > 0) out.push({ k: 'balance', icon: 'wallet', title: '储值余额 ' + money(me.balance), sub: '先用完，或申请退还余额', act: '去处理', on: () => ctx.push('wallet') });
          if (bk.length) out.push({ k: 'booking', icon: 'calendar', title: '未结束的预约 ' + bk.length + ' 个', sub: bk.map((b) => b.name + ' ' + b.at.slice(5, 16)).join('、'), act: '取消预约', on: async () => { if (!(await Mini.confirm('取消预约：' + bk[0].name + '（' + bk[0].at.slice(5, 16) + '）？', { title: '取消预约', ok: '取消预约', cancel: '保留', danger: true }))) return; const r = await M3.act(() => bk.forEach((b) => { b.status = 'CANCELLED'; }), 500); if (!r.ok) return Mini.toast(r.reason, { kind: 'bad' }); M3.touch(); Mini.toast('预约已取消'); ctx.refresh(); } });
          return out;
        };
        const bs = blocks();
        page.append(h('section.m3-blockband', {}, h('div.mini-sec', {}, h('h2', { text: bs.length ? '先处理这 ' + bs.length + ' 件事' : '没有需要处理的事项' }), bs.length ? h('span.muted', { text: '全部清空后才能申请' }) : null),
          bs.length ? h('div.mini-card.m3-blocks', {}, bs.map((b) => h('div.m3-block', {}, h('span.m3-ic.is-warn', {}, UI.icon(b.icon)), h('span.grow', {}, h('b', { text: b.title }), h('small', { text: b.sub })), h('button.btn.btn--sm', { type: 'button', text: b.act, 'aria-label': b.act + '：' + b.title, on: { click: b.on } }))))
            : M3.alert('订单、会员卡、储值和预约都已处理完毕，可以申请注销。', { kind: 'ok' })));
        page.append(h('section.m3-noticeband', { 'aria-label': '注销须知' }, h('div.mini-sec', {}, h('h2', { text: '注销须知' }), h('span.muted', { text: '冷静期 ' + COOL_DAYS + ' 天' })),
          h('div.mini-card.m3-twocol-card', {}, h('div', {}, h('h3', { text: '将删除' }), h('ul', {}, ['昵称、头像、性别、生日', '手机号与会员号', '会员卡、优惠券和消息', '收藏、偏好与订阅授权'].map((t) => h('li', { text: t })))), h('div', {}, h('h3', { text: '会保留' }), h('ul', {}, ['交易与支付记录', '发票与财务凭证', '按法律要求保存，期限届满后删除；匿名化后不再关联到你'].map((t) => h('li', { text: t }))))),
          h('p.muted', { text: '提交后进入 ' + COOL_DAYS + ' 天冷静期，期间可以随时撤回；期满且没有未处理事项时才会匿名化。' })));
        const ack = h('input', { type: 'checkbox', id: 'm3-ack', checked: S.ack, on: { change: (e) => { S.ack = e.target.checked; paint(); } } }), why = h('p.m3-why');
        const go = h('button.btn.btn--danger.solid.btn--block', { type: 'button', text: '申请注销', 'data-busy': '提交中', on: { click: () => submit() } });
        const paint = () => { go.disabled = !!bs.length || !S.ack; why.textContent = bs.length ? '还有 ' + bs.length + ' 项需要先处理，处理完成后才能申请注销' : !S.ack ? '请先勾选“已阅读注销须知”' : ''; };
        async function submit() {
          tip.replaceChildren(); if (go.disabled) return;
          if (!(await Mini.confirm('确认申请注销账号？提交后进入 ' + COOL_DAYS + ' 天冷静期，期满后个人信息被匿名化删除，无法恢复。', { title: '申请注销', ok: '提交申请', danger: true, cancel: '再想想' }))) return;
          await M3.busy(go, async () => {
            let r = await M3.act(() => { if (ctx.scene === 'new-block' && !S.extra) { S.extra = true; throw new Error('block'); } if ((ctx.scene === 'fresh' || ctx.scene === 'relogin-fail') && !S.fresh) throw new Error('fresh'); if (B.db.deletion) throw new Error('dup'); }, 800);
            if (!r.ok && !r.biz) { tip.append(M3.alert('提交没有成功：' + r.reason, { kind: 'bad' })); return; }
            if (!r.ok && r.reason === 'fresh') {
              Mini.toast('正在验证身份…'); const rl = await M3.act(null, 900);
              if (!rl.ok || ctx.scene === 'relogin-fail') { tip.append(M3.alert('身份验证没有通过，请重新登录后再申请', { kind: 'bad', action: { label: '重新登录', on: () => ctx.push('login', { redirect: 'back', from: ctx.id }) } })); return; }
              S.fresh = true; r = await M3.act(() => {}, 500);
            }
            if (!r.ok && r.reason === 'block') { tip.append(M3.alert('提交时发现还有新的事项没有处理，请先处理后再申请', { kind: 'bad' })); ctx.refresh(); return; }
            if (!r.ok && r.reason === 'dup') { ctx.refresh(); return; }
            if (!r.ok) { tip.append(M3.alert(r.reason, { kind: 'bad' })); return; }
            B.db.deletion = { at: Date.now() }; if (ctx.scene === 'clean' || ctx.scene === 'fresh' || ctx.scene === 'new-block') UI.state.scene[ctx.id] = 'normal'; M3.touch(); Mini.toast('注销申请已提交，进入冷静期'); ctx.refresh();
          });
        }
        paint();
        page.append(tip);
        bar.append(h('div.m3-cancelbar', {}, h('div.m3-agree', {}, h('label.mini-check', {}, ack), h('label', { for: 'm3-ack', text: '我已阅读注销须知' })), why, go));
        wrap.append(page, bar); return wrap;
      });
    },
  };

  /* =====================================================================================
     意见反馈（二级页；主次布局）：提交表单是主角，“我的反馈”是配角页签；类型、描述（300 字）、图片（3 张）、联系方式；重复提交保护
     ===================================================================================== */
  const FB_STATUS = { PENDING: ['待处理', 'warn'], DOING: ['处理中', 'info'], REPLIED: ['已回复', 'ok'] };
  const SAMPLE_IMGS = () => B.db.products.filter((p) => p.img).map((p) => p.img);
  window.PAGES_MINI.feedback = {
    title: '意见反馈', tab: null, from: 'me', auth: true, bar: true, nav: { title: '意见反馈' },
    layout: '主次布局', reason: '反馈页只有一件主事：说清楚问题。类型、描述、图片、联系方式依次排开，提交固定在底部；已提交的反馈退到“我的反馈”页签，状态与回复一目了然',
    scenes: [{ id: 'dup', label: '重复提交：刚刚提交过相同内容' }, { id: 'upload-fail', label: '图片上传失败' }, { id: 'limit', label: '今天提交次数已达上限' }],
    skeleton: () => skel(4),
    render(ctx) {
      const S = (ctx.m3 = ctx.m3 || { tab: 'new', type: '问题', text: '', imgs: [], contact: '', last: null, flash: 0, open: {} });
      if (ctx.scene === 'dup' && !S.seeded) { S.seeded = true; S.last = { text: '外卖包装有点漏汤，希望改进一下打包方式', at: Date.now() - 20000 }; }
      return Mini.load(() => B.db.feedbacks).then(() => {
        const wrap = h('div.m3-wrap'), page = h('section.mini-page.m3-feedback'), body = h('div.m3-fbody'), bar = h('div.m3-bar'), tip = h('div');
        const mineList = () => B.db.feedbacks.slice().sort(byAt);
        const tabs = M3.tabs([{ id: 'new', label: '提交反馈' }, { id: 'mine', label: '我的反馈', n: mineList().length }], S.tab, (id) => { S.tab = id; draw(); }, '反馈');
        const drawNew = () => {
          const hint = { 问题: '请描述遇到的问题、发生的时间和所在页面', 建议: '说说你希望怎么改，越具体越好', 投诉: '请写明发生的门店、时间和经过，我们会尽快核实' }[S.type];
          const types = h('div.mini-chips', { role: 'radiogroup', 'aria-label': '反馈类型' }, ['问题', '建议', '投诉'].map((t) => h('button.mini-chip', { type: 'button', role: 'radio', 'aria-checked': String(S.type === t), on: { click: () => { S.type = t; drawNew(); } } }, h('span', { text: t }))));
          const ta = h('textarea.textarea', { maxlength: 300, rows: 5, placeholder: hint, 'aria-label': '问题描述', id: 'm3-fb-text' }); ta.value = S.text;
          const cnt = h('span.m3-cnt.num', { text: S.text.length + ' / 300' }), taF = M3.field('描述', ta); taF.querySelector('label').after(cnt);
          ta.addEventListener('input', () => { S.text = ta.value; cnt.textContent = ta.value.length + ' / 300'; taF.setErr(''); tip.replaceChildren(); });
          const imgs = h('div.m3-imgs', {}); const drawImgs = () => {
            imgs.replaceChildren(...S.imgs.map((src, i) => h('div.m3-img', {}, h('img', { src, alt: '已添加的图片 ' + (i + 1) }), h('button', { type: 'button', 'aria-label': '删除图片 ' + (i + 1), on: { click: () => { S.imgs.splice(i, 1); drawImgs(); } } }, UI.icon('x', 'icon--sm')))),
              S.imgs.length < 3 ? h('button.m3-imgadd', { type: 'button', 'aria-label': '添加图片', on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; const r = await M3.act(() => { if (ctx.scene === 'upload-fail') throw new Error('图片没有上传成功，请重新添加'); }, 600); b.disabled = false; if (!r.ok) { imgsErr.textContent = r.reason; return; } imgsErr.textContent = ''; const pool = SAMPLE_IMGS(); S.imgs.push(pool[(S.imgs.length * 3 + 1) % pool.length]); drawImgs(); } } }, UI.icon('plus'), h('span', { text: S.imgs.length + ' / 3' })) : null);
          };
          const imgsErr = h('p.err', { role: 'alert' });
          const contact = h('input.input', { type: 'text', inputmode: 'text', placeholder: '手机号或邮箱，选填', value: S.contact, id: 'm3-fb-contact', autocomplete: 'off' }), cF = M3.field('联系方式（选填）', contact, { hint: '仅用于回复你的反馈，不会用于营销' });
          contact.addEventListener('input', () => { S.contact = contact.value.trim(); cF.setErr(''); });
          drawImgs();
          body.replaceChildren(h('section.mini-card.m3-fbcard', {}, h('div.field', {}, h('label', { text: '反馈类型' }), types), taF, h('div.field', {}, h('label', { text: '图片（选填，最多 3 张）' }), imgs, imgsErr), cF));
          const btn = h('button.btn.btn--primary.btn--block', { type: 'button', text: '提交反馈', 'data-busy': '提交中', on: { click: () => submit(btn, { ta: taF, c: cF, contact, ta0: ta }) } });
          bar.replaceChildren(btn);
        };
        async function submit(btn, f) {
          tip.replaceChildren(); let bad = false; const text = S.text.trim();
          if (text.length < 10) { f.ta.setErr(text ? '再多写几个字（至少 10 个字），方便我们定位问题' : '请填写问题描述'); f.ta0.focus(); bad = true; }
          if (S.contact && !/^1[3-9]\d{9}$/.test(S.contact) && !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(S.contact)) { f.c.setErr('请输入正确的 11 位手机号或邮箱'); if (!bad) f.contact.focus(); bad = true; }
          if (bad) return;
          if (S.last && S.last.text === text && Date.now() - S.last.at < 60000) { tip.append(M3.alert('刚刚已经提交过相同的内容（' + Math.max(1, Math.round((Date.now() - S.last.at) / 1000)) + ' 秒前），请不要重复提交；如需补充，请修改内容后再提交', { kind: 'warn' })); return; }
          if (ctx.scene === 'limit') { tip.append(M3.alert('今天提交的反馈已达 5 条上限，请明天再试；紧急问题请拨打 ' + B.shop.phone, { kind: 'warn' })); return; }
          await M3.busy(btn, async () => {
            const r = await M3.act(() => { const id = B.db.feedbacks.reduce((m, x) => Math.max(m, x.id), 0) + 1; B.db.feedbacks.unshift({ id, type: S.type, text, imgs: S.imgs.length, contact: S.contact ? (/^1/.test(S.contact) ? B.maskPhone(S.contact) : S.contact) : '', at: B.fmt(B.NOW()), status: 'PENDING' }); return id; }, 900);
            if (!r.ok) { tip.append(M3.alert('提交没有成功：' + r.reason + '，你填写的内容还在，可以再试一次', { kind: 'bad' })); return; }
            S.last = { text, at: Date.now() }; S.flash = r.v; S.text = ''; S.imgs = []; S.contact = ''; S.tab = 'mine'; tabs.set('mine'); tabs.count('mine', mineList().length); Mini.toast('已提交，我们会尽快处理'); draw();
          });
        }
        const drawMine = () => {
          const rows = ctx.scene === 'empty' ? [] : mineList(); bar.replaceChildren();
          if (!rows.length) { body.replaceChildren(Mini.empty('还没有提交过反馈', { label: '去提交', on: () => { S.tab = 'new'; tabs.set('new'); draw(); } }, { sub: '遇到问题或有建议，都可以告诉我们' })); return; }
          body.replaceChildren(...rows.map((f) => {
            const [label, tone] = FB_STATUS[f.status] || FB_STATUS.PENDING, open = !!S.open[f.id];
            const rep = f.reply ? h('div.m3-reply', { hidden: !open }, h('b', { text: '官方回复' }), h('p', { text: f.reply }), h('small', { text: f.replyAt.slice(5, 16) })) : f.note ? h('p.m3-fbnote', { text: f.note }) : null;
            const tog = f.reply ? h('button.m3-tk-tog', { type: 'button', 'aria-expanded': String(open), text: open ? '收起回复' : '查看回复', on: { click: () => { S.open[f.id] = !S.open[f.id]; rep.hidden = !S.open[f.id]; tog.setAttribute('aria-expanded', String(S.open[f.id])); tog.firstChild.textContent = S.open[f.id] ? '收起回复' : '查看回复'; } } }, UI.icon('down', 'icon--sm')) : null;
            return h('article.mini-card.m3-fbitem' + (f.id === S.flash ? '.mini-flash' : ''), {}, h('div.m3-fbhead', {}, h('span.mini-tag', { text: f.type }), h('span.badge.badge--' + tone, { text: label }), h('span.grow'), h('small.muted', { text: f.at.slice(5, 16) })), h('p.m3-fbtext', { text: f.text }),
              h('p.muted.m3-fbmeta', { text: [f.imgs ? f.imgs + ' 张图片' : '', f.contact ? '联系方式 ' + f.contact : ''].filter(Boolean).join(' · ') }), rep, tog);
          })); S.flash = 0;
        };
        function draw() { tip.replaceChildren(); if (S.tab === 'new') drawNew(); else drawMine(); }
        page.append(tabs, body, tip); draw();
        wrap.append(page, bar); return wrap;
      });
    },
  };
})();
