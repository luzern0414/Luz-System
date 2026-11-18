/* 小程序原型的启动：建手机框、进入首页（?skip-login 直接以会员身份进首页，?guest 以游客进首页，否则先到登录页）、演示控制。
   页面文件已把自己注册进 window.PAGES_MINI；没注册的页面直达时由外壳显示“这个页面还没有做”。 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  Mini.start({ root: document.getElementById('root'), loggedIn: q.get('skip-login') !== null || (window.self !== window.top && q.get('login') === null), guest: q.get('guest') !== null });

  /* 页面直达：全部页面 id，按业务分组 */
  const LIST = [
    ['入口', [['login', '登录'], ['home', '首页']]],
    ['点单', [['menu', '点单'], ['search', '搜索'], ['product', '商品详情'], ['cart', '购物车'], ['checkout', '结算'], ['pay-result', '支付结果']]],
    ['订单', [['orders', '订单'], ['order-detail', '订单详情'], ['refund-apply', '申请退款'], ['review', '评价']]],
    ['会员与资产', [['cards', '购卡'], ['my-cards', '我的会员卡'], ['card-detail', '会员卡详情'], ['wallet', '储值'], ['coupons', '优惠券']]],
    ['门店与消息', [['stores', '门店'], ['notices', '消息']]],
    ['我的', [['me', '我的'], ['profile', '个人资料'], ['settings', '设置'], ['cancel-account', '注销账号'], ['feedback', '意见反馈'], ['legal', '协议与隐私']]],
  ];
  const pages = LIST.flatMap(([group, items]) => items.map(([id, label]) => ({ id, label, group })));
  const layoutOf = (id) => { const p = window.PAGES_MINI[id]; return p && p.layout ? { layout: p.layout, reason: p.reason || '' } : null; };
  UI.demo({ app: Mini.app, home: 'home', pages, scenes: Mini.scenesOf, onReset: () => { B.reset(); Mini.emit('cart'); Mini.emit('auth'); }, layoutOf });
})();
