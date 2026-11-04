// The page registry of the mini-program prototype. A page is one file in ./pages/ that exports `meta` from a plain <script> block:
//
//   <script>
//   export const meta = { id: 'home', label: '首页', title: '示例门店', group: '入口', tab: true,
//     layout: '主次布局', reason: '为什么选这种布局', scenes: [{ id: 'closed', label: '营业状态：休息中' }, …] }
//   </script>
//
// `tab: true` puts the page on the tab bar (home, menu, orders, me). Nothing else has to be registered.
export const GROUPS = ['入口', '点单', '订单', '会员与资产', '门店与消息', '我的']
export const TABS = [
  { id: 'home', label: '首页', icon: 'wap-home-o' },
  { id: 'menu', label: '点单', icon: 'shop-o' },
  { id: 'orders', label: '订单', icon: 'orders-o' },
  { id: 'me', label: '我的', icon: 'user-o' },
]

const modules = import.meta.glob('./pages/*.vue', { eager: true })
export const PAGES = Object.values(modules)
  .filter((m) => m.meta)
  .map((m) => ({ scenes: [], title: '', tab: false, order: 99, ...m.meta, component: m.default }))
  .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order)

export const pageOf = (id) => PAGES.find((p) => p.id === id)
