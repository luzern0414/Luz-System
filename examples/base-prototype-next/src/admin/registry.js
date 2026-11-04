// The page registry of the admin prototype. A page is one file in ./pages/ that exports `meta` from a plain <script> block:
//
//   <script>
//   export const meta = { id: 'orders', label: '订单', icon: 'list', group: '交易', order: 1, roles: ['A', 'F'],
//     layout: '横带分层', reason: '为什么选这种布局', scenes: [{ id: 'empty', label: '所选范围没有订单' }, …] }
//   </script>
//
// Nothing else has to be registered: the menu, the routes and the demo panel are all built from these files.
import { Menu, DataLine, Document, Download, Goods, Grid, List, Lock, Picture, PriceTag, RefreshLeft, Setting, Shop, Tickets, User, Wallet, Bell, Calendar } from '@element-plus/icons-vue'

/** The icons a menu entry may name (one object, one icon). Add the icon here before a page uses it. */
export const ICONS = {
  chart: DataLine, list: List, kanban: Grid, undo: RefreshLeft, bag: Goods, tag: PriceTag, image: Picture, users: User, card: Tickets, wallet: Wallet,
  shop: Shop, lanes: Calendar, bell: Bell, download: Download, shield: Lock, file: Document, gear: Setting, app: Menu,
}

export const GROUPS = ['概览', '交易', '商品与营销', '会员', '门店', '系统']
export const ROLES = [{ id: 'A', label: '超级管理员' }, { id: 'F', label: '前台' }]

const modules = import.meta.glob('./pages/*.vue', { eager: true })
export const PAGES = Object.values(modules)
  .filter((m) => m.meta)
  .map((m) => ({ roles: ['A'], scenes: [], order: 99, ...m.meta, component: m.default }))
  .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order)

export const pageOf = (id) => PAGES.find((p) => p.id === id)
export const homeOf = (role) => (role === 'F' ? 'orders' : 'dashboard')
