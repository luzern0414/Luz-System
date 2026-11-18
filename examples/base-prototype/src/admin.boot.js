/* 后台原型的启动：登录（含验证码一步）、按角色的菜单、账号菜单、演示控制。页面文件已把自己注册进 window.PAGES2。 */
(function () {
  'use strict';
  const { h } = UI;
  const root = document.getElementById('root');
  const MENU = [
    { title: '概览', items: [['dashboard', '数据看板', 'chart']] },
    { title: '交易', items: [['orders', '订单', 'list'], ['fulfil', '履约看板', 'kanban'], ['refunds', '售后', 'undo']] },
    { title: '商品与营销', items: [['products', '商品', 'bag'], ['coupons', '优惠券', 'tag'], ['files', '素材库', 'image']] },
    { title: '会员', items: [['members', '会员', 'users'], ['cards', '会员卡', 'card'], ['wallet', '储值', 'wallet']] },
    { title: '门店', items: [['tenants', '门店', 'shop'], ['schedule', '排班', 'lanes']] },
    { title: '系统', items: [['notify', '通知', 'bell'], ['exchange', '导入导出', 'download'], ['accounts', '账号与角色', 'shield'], ['audit', '操作日志', 'file'], ['settings', '系统配置', 'gear']] },
  ];
  const FRONT = ['orders', 'fulfil', 'members', 'cards'];
  let accountSession;
  const placeholder = (id) => ({ title: (MENU.flatMap((g) => g.items).find((x) => x[0] === id) || [id, id])[1], group: '页面', layout: '', reason: '', render: () => h('div.page', {}, h('div.empty', {}, UI.icon('info', 'icon--lg'), h('p', { text: '这个页面还没有做' }))) });
  const pageOf = (id) => window.PAGES2[id] || placeholder(id);

  function enter() {
    accountSession = new AbortController();
    const signal = accountSession.signal;
    UI.state.role = UI.state.role || 'A';
    const me = () => A2.me();
    const userBtn = h('button.btn.btn--ghost', { type: 'button', 'aria-label': '账号菜单' }, h('img.avatar', { alt: '', src: avatar(me().name) }), h('span', { text: me().name }), UI.icon('down', 'icon--sm'));
    const nav = MENU.map((g) => ({ title: g.title, items: g.items.map(([id, label, icon]) => ({ id, label, icon, roles: FRONT.includes(id) ? ['A', 'F'] : ['A'] })) }));
    const pages = Object.fromEntries(MENU.flatMap((g) => g.items.map(([id]) => [id, pageOf(id)])));
    pages['personal-settings'] = {
      title: '设置', render: () => {
        const leaveAccount = async () => {
          if (!await UI.confirm('返回登录页后可使用其他账号登录。', { ok: '继续' })) return;
          UI.state.role = null;
          localStorage.removeItem('luz-demo-role');
          history.replaceState(null, '', location.pathname + location.search);
          start();
        };
        const edit = () => A2.edit({ title: '修改密码', size: 'sm', fields: [
          { name: 'old', label: '原密码', type: 'password', required: true },
          { name: 'next', label: '新密码', type: 'password', required: true },
        ], submit: (values) => {
          const problem = globalThis.LuzDemoAccount.change(UI.state.role, values.old, values.next);
          if (problem) { UI.toast(problem, { kind: 'bad' }); return false; }
          UI.toast('本次演示的密码已修改');
        } });
        return h('section.page', {}, h('h1', { text: '设置' }), h('div.card.stack', {}, h('h2', { text: '账号与安全' }),
          h('button.btn', { type: 'button', text: '修改密码', on: { click: edit } }),
          h('button.btn', { type: 'button', text: '切换账号', on: { click: leaveAccount } }),
          h('button.btn', { type: 'button', text: '退出登录', on: { click: leaveAccount } })));
      },
    };
    const app = UI.app({ accountPage: 'personal-settings', signal, root, brand: '示例门店管理后台', brandMark: UI.icon('shop'), home: 'dashboard', nav, pages, topRight: userBtn });
    userBtn.setAttribute('aria-label', '设置');
    userBtn.addEventListener('click', () => app.go('personal-settings'));
    const layoutOf = (id) => { const p = window.PAGES2[id]; return p && p.layout ? { layout: p.layout, reason: p.reason || '' } : null; };
    const pagesList = MENU.flatMap((g) => g.items.map(([id, label]) => ({ id, label, group: g.title })));
    UI.demo({ app, signal, home: 'dashboard', pages: pagesList, scenes: (id) => (window.PAGES2[id] && window.PAGES2[id].scenes) || [], roles: [{ id: 'A', label: '超级管理员' }, { id: 'F', label: '前台' }], onRole: () => { userBtn.querySelector('span').textContent = me().name; userBtn.querySelector('img').src = avatar(me().name); }, onReset: () => { B.reset(); globalThis.LuzDemoAccount.reset(); }, layoutOf });
    return app;
  }
  function avatar(name) { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#edf4f0"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="600" fill="#2f6b4f">${name[0]}</text></svg>`; return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

  /* 登录：账号与口令；超级管理员多一步 6 位验证码（演示用 123456）；连续输错 5 次锁定（演示用计数） */
  function start() {
    accountSession?.abort();
    document.querySelectorAll('.demo, .demo-fab').forEach((n) => n.remove());
    root.replaceChildren();
    const fails = { n: 0 };
    const user = h('input.input', { id: 'u', autocomplete: 'username', 'aria-label': '账号' }), pass = h('input.input', { id: 'p', type: 'password', autocomplete: 'current-password', 'aria-label': '密码' });
    const eu = h('div.err', { role: 'alert' }), ep = h('div.err', { role: 'alert' }), btn = h('button.btn.btn--primary', { type: 'submit', style: { width: '100%' }, text: '登录' });
    const card = h('form.card.stack', { novalidate: '', style: { width: 'min(400px, calc(100vw - 32px))', padding: 'var(--s-6)' }, on: { submit: async (e) => {
      e.preventDefault(); eu.textContent = ep.textContent = '';
      if (!user.value.trim()) return (eu.textContent = '请输入账号'), user.focus();
      if (!pass.value) return (ep.textContent = '请输入密码'), pass.focus();
      btn.disabled = true; btn.replaceChildren(h('span.spin'), ' 登录中');
      const reset = () => { btn.disabled = false; btn.textContent = '登录'; };
      try { await UI.request(null, 500); } catch (er) { reset(); return UI.toast('网络不太稳定，请稍后再试', { kind: 'bad' }); }
      if (fails.n >= 5) { reset(); return (ep.textContent = '连续输错 5 次，账号已锁定 10 分钟'); }
      const acc = globalThis.LuzDemoAccount.roleFor(user.value, pass.value);
      if (!acc) { fails.n++; reset(); return (ep.textContent = '账号或密码错误' + (fails.n >= 3 ? '，还可再试 ' + (5 - fails.n) + ' 次' : '')); }
      if (acc === 'A') { reset(); return mfa(acc); }
      done(acc);
    } } }, h('div.row', {}, UI.icon('shop', 'icon--lg'), h('strong', { text: '示例门店管理后台', style: { fontSize: '18px' } })), h('h2', { text: '登录' }),
      h('div.field', {}, h('label', { for: 'u', text: '账号' }), user, eu), h('div.field', {}, h('label', { for: 'p', text: '密码' }), pass, ep), btn,
      h('p.muted', { text: '演示账号：admin（超级管理员，需验证码 123456）、front1（前台），初始演示密码 Admin@2026' }));
    root.append(h('main', { style: { minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '16px' } }, card));
    UI.play(card, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0,0,0,1)' });
    user.focus();
  }
  function mfa(acc) {
    const code = h('input.input', { inputmode: 'numeric', maxlength: 6, 'aria-label': '验证码', autofocus: '', style: { letterSpacing: '0.4em', textAlign: 'center', fontSize: '20px' } }), err = h('div.err', { role: 'alert' });
    UI.dialog({ title: '输入验证码', size: 'sm', dismiss: false, body: h('div.stack', {}, h('p', { text: '请输入验证器应用里的 6 位验证码' }), code, err), actions: [{ label: '返回', value: null }, { label: '验证', kind: 'primary', value: 'ok', on: () => { if (code.value !== '123456') { err.textContent = '验证码不对，请重新输入'; return false; } } }] }).then((v) => v === 'ok' && done(acc));
  }
  function done(acc) { UI.state.role = acc; UI.toast('欢迎回来，' + A2.accounts[acc].name); location.hash = '#/' + (acc === 'F' ? 'orders' : 'dashboard'); enter(); }

  const q = new URLSearchParams(location.search);
  if (q.get('skip-login') !== null || window.self !== window.top && q.get('login') === null) { UI.state.role = (q.get('role') || 'A'); enter(); } else start();
})();
