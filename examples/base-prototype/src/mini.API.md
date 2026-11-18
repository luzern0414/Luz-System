# 小程序底座原型：外壳与页面注册接口

新增或改小程序页面只需要读这份说明和 `mini.p0.js`。外壳、手机框、页面栈、弹层、购物车、登录态都在 `p0` 里，页面只管自己的内容。
构建：在上一级目录运行 `py -X utf8 build.py mini`（输出 `mini.html`）。样式写在自己的 `mini.pN.css`，类名以 `mN-` 开头（m2-、m3-），只用 `ui.css` 与 `mini.css` 的令牌。

## 最小页面（可直接复制）

```js
(function () {
  'use strict';
  const { h } = UI;
  window.PAGES_MINI['my-cards'] = {
    title: '我的会员卡',                 // 导航栏标题
    tab: null,                           // 'home' | 'menu' | 'orders' | 'me'：一级标签页；二级页写 null
    from: 'me',                          // 二级页被“页面直达”打开时垫在下面的标签（可省，默认当前标签）
    auth: true,                          // 需要登录；未登录时外壳自动跳登录页，页面不用管
    nav: { bg: 'var(--surface)' },       // 见下“导航栏”，可省
    layout: '横带分层',                   // 六种布局之一（名字照规范）
    reason: '一句话：这页的主角是什么，为什么选这种布局',
    scenes: [{ id: 'expired', label: '卡已过期' }],   // 页面专属场景，逐一列出失败原因
    render(ctx) {                        // 返回节点或 Promise；外壳处理加载、失败、无权限、未登录
      if (ctx.scene === 'empty') return h('section.mini-page', {}, Mini.empty('还没有会员卡', { label: '去办卡', on: () => ctx.push('cards') }));
      return Mini.load(() => B.db.cards.filter((c) => c.userId === B.db.me.id)).then((cards) =>
        h('section.mini-page', {}, cards.map((c) => h('div.mini-card.tap', { on: { click: () => ctx.push('card-detail', { id: c.id }) } }, c.typeName))));
    },
  };
})();
```

## 注册字段 `window.PAGES_MINI[id]`

| 字段 | 说明 |
|---|---|
| `title` | 导航栏默认标题 |
| `tab` | 一级标签页 id（`home`、`menu`、`orders`、`me`）；二级页 `null`。一级页有标签栏、各自保留滚动位置和状态；二级页左上有返回、盖住标签栏 |
| `from` | 二级页直达时垫底的标签 id |
| `auth` | `true`：需要登录。未登录或场景选“未登录”时，外壳显示登录引导并推登录页，登录成功回来后自动重绘 |
| `fill` | `true`：页面区不滚动，内容铺满高度（`.mini-content` 高 100%），页面自己管内部滚动（点单页、门店页用） |
| `bar` | `true`：页面底部有吸底操作栏（商品详情、购物车、结算用）：滚动区底部不再留安全区空白，吸底栏自己用 `position: sticky; bottom: 0` 并加 `padding-bottom: calc(8px + var(--m-safe))` |
| `nav` | `{title, bg, color, tone, toneTop, transparent, hide, capsule, left(ctx), center(ctx)}`：`title` 文字或函数；`bg`、`color` 是导航栏背景与文字色（css 颜色）；`tone:'dark'\|'light'` 是状态栏文字色（深色底写 `light`）；`transparent:true` 导航透明叠在内容上（内容从屏幕最上沿开始，自己留出顶部空间），滚过约 24 像素后变白底并显示标题，`toneTop` 是透明时的状态栏色；`hide:true` 不要导航栏；`left`、`center` 返回节点，替换返回键或标题（二级页自定义 `left` 时要自己放返回） |
| `layout`、`reason` | 六种布局之一和一句话理由，演示控制里显示 |
| `scenes` | `[{id, label}]` 页面专属场景；通用场景（正常、加载中、空、加载失败、无权限）演示控制自动加上 |
| `skeleton(ctx)` | 可选：加载中显示的骨架（形状与真实内容一致）；不写用外壳的通用骨架 |
| `render(ctx)` | 返回节点或 Promise。**页面最外层放 `<section class="mini-page">`**（左右 16、上 12、下 24）。render 时节点还没挂到页面上，量尺寸用 `ResizeObserver` 或 `ctx.onShow` |

通用场景由外壳处理：`loading` 显示骨架，`error` 显示失败与重试，`forbidden` 显示“账号已停用”，`login`（只对 `auth` 页）按未登录处理。**`empty` 交给页面**：`ctx.scene === 'empty'` 时返回 `Mini.empty(...)`。Promise 里取数用 `Mini.load(fn)`（弱网多等、断网抛错），reject 时外壳自动显示“网络不太稳定，请稍后再试”和重试；300 毫秒内没回来才显示骨架。

## `ctx`

`ctx.id`、`ctx.params`（地址参数都是字符串，数字自己转：`Number(ctx.params.id)`）、`ctx.scene`、`ctx.net`（`ok`/`weak`/`off`）
`ctx.push(id, params)` 打开二级页（最多 10 层，满了替换栈顶）· `ctx.back()` 返回上一页 · `ctx.replace(id, params)` 替换当前二级页（结果页用）· `ctx.switchTab(id)` 回到某标签并关掉所有二级页 · `ctx.reset(id)` 重置页面栈
`ctx.refresh()` 原位重绘（保留滚动）· `ctx.setTitle(text)` · `ctx.toast(text, {kind:'bad', action:{label, on}})` · `ctx.sheet(o)` · `ctx.dialog(o)` · `ctx.confirm(text, o)`
`ctx.onShow(fn)` 页面进入动画结束或从上层页返回时触发（页面已经显示时才注册会马上触发；此时 render 返回的节点可能还没挂上，要操作它请 `setTimeout` 一下）· `ctx.onHide(fn)` · `ctx.onRetap(fn)` 再次点同一标签（默认滚到顶）· `ctx.cleanup(fn)` 页面重绘或销毁时执行（取消订阅等）· `ctx.scroller` 滚动区 · `ctx.isRoot` 是否一级页 · `ctx.isTop()`。
返回回到打开它的页面并恢复滚动位置，不用自己记。`.mini-content` 是纵向 flex，页面根节点会撑满页面区高度（登录、结算这种要铺满的页面不用再写 `min-height`）。

**进入页面时取一次数据**：`render` 里 `return Mini.load(() => 节点)`（弱网多等 1.1 秒显示骨架，断网由外壳显示“网络不太稳定，请稍后再试”和重试）。首页、点单、搜索、详情、购物车、门店都这样写，演示控制里切到“断网”会重新进入页面走一遍错误路径。

## 全局 `Mini`（`p0` 里都有）

- 导航：`Mini.push/back/replace/switchTab/reset/go`，`Mini.refresh()`，`Mini.afterLogin(ctx)`（登录成功后调用：根页面登录进首页，二级页登录回到来源并刷新）。**页面按钮不要切换标签来冒充导航**，需要另一个标签的内容就 `ctx.push` 它的二级页；确需“去点单”这类才用 `ctx.switchTab`。
- 弹层（限定在手机框里）：
  - `Mini.sheet({title, body, actions, tall, dismiss})`：底部弹层，高不超过 80%，底部按钮固定；`body` 是文字、节点或 `(api)=>节点`（`api.close(value)` 关闭）；`actions:[{label, kind:'primary'|'danger.solid'|'tint', value, on(bodyEl, api)}]`，`on` 里返回 `false` 留在弹层，按钮自带转圈；返回 Promise（点按钮得 `value`，点遮罩、Esc、关闭得 `null`），Promise 上也有 `.close(value)`。
  - `Mini.dialog(同上)`：居中对话框，宽 80%。`Mini.confirm('正文', {title, ok, danger, cancel})` → `Promise<boolean>`，破坏性操作用 `danger:true`，正文写对象与后果。
  - `Mini.toast(text, {kind:'bad', action})`：成功 1.5 秒，错误 3 秒，带按钮 4 秒。成功才用轻提示，失败在原位写原因。
  - `Mini.fly(srcEl, dstEl, imgSrc)`：商品图飞入购物车图标；`Mini.bump(el)` 角标跳一次；`Mini.flash(el)` 新增或改动的行闪一次（背景主色浅底，减少动态效果时不闪）；`Mini.badge(n)` / `Mini.setBadge(el, n)`。
- 状态块：`Mini.empty(text, {label, on, kind}|节点, {illus:'empty'|'error'|'lock'|'done'|'map', sub})` · `Mini.error(retry, text)` · `Mini.skeleton(n, 'cards'?)` · `Mini.illus(kind)`（插画 svg）。
- 数据展示：`Mini.money(分)` → `¥18.00`（账务页）· `Mini.price(分, {size:'sm'|'xl', trim:false, from:true})` 价格节点（符号与小数小一号，卡片与列表去末尾零，详情页价格用 `size:'xl'`）· `Mini.avatar(user, size)` 卡通动物头像，没登录传 `null` 得线性人像（不用首字母）。
- 登录态：`Mini.auth.is()`、`Mini.auth.user()`（即 `B.db.me`）、`Mini.auth.login()`、`Mini.auth.logout()`；事件 `Mini.on('auth', fn)`。退出登录后用 `Mini.reset('login')` 回到登录页。
- 营业状态：`Mini.shop.state(ctx.scene)` → `{key:'open'|'rest'|'closed'|'paused', label, tone, icon, hint, canOrder}`，`Mini.shop.badge(st)`；页面场景写 `rest`（休息中）、`closed`（已打烊）、`paused`（暂停营业）就能演示；`canOrder` 为假时“加购、结算”换成不可点的“暂停营业”（菜单可浏览，购物车保留）。
- 商品：`Mini.product(pid)`、`Mini.cat(catId)`、`Mini.specPrice(p, specs)`、`Mini.defaultSpecs(p)`、`Mini.specText(specs)`、`Mini.pstate(p, scene)`（`ok`/`soldout`/`off`）。
- 购买规则：`Mini.rules.texts(p)` 数量旁的规则文字；`Mini.rules.left(p)` 本人还能买几件；`Mini.rules.cap(p)` 一单最多几件；`Mini.rules.problems(lines)` 逐条找出不满足的行 `[{key, name, text, fix:{label, qty}}]`，结算页逐条列出并给“改为 N 件”“移除”这种一步出路。规则数据在 `B.db.buyRules[商品id] = {min, max, once, limit:{n, period:'day'|'all'}}`（起售、单笔上限、只能购买一次、周期限购）。
- 事件：`Mini.on('cart'|'auth', fn)` → 取消订阅函数；页面里订阅要放进 `ctx.cleanup`。
- 其它：`Mini.load(fn, ms)`、`Mini.TABS`、`Mini.dur('--dur-slow')`（取动效令牌的毫秒数，减少动态效果时为 1）、`Mini.fmtDist(米)`。

## 第一批页面（`p1*`）提供的可复用件

- `Mini.pick(ctx, product, {buy, specs, to, onPick})`：规格弹层（份量、口味、数量、规则文字，`buy:true` 多一个“立即购买”，成功后会先把这一件设为唯一勾选再 `ctx.push('checkout')`）；`to` 是返回购物车图标元素的函数，用于加购飞入。
- `Mini.p1.row(ctx, product, opts)`（商品行）、`Mini.p1.card(ctx, product)`（双列商品卡）、`Mini.p1.lineRow(ctx, line, {check, remove, compact, problem})`（购物车的一行）、`Mini.p1.control(ctx, product)`（加号、步进器或“选规格”胶囊）；返回的节点带 `.sync()`，购物车变化时调用即可刷新。
- `Mini.p1.navigate(ctx, store)`（导航弹层，模拟）、`Mini.p1.call(store)`（拨打电话确认，模拟）、`Mini.p1.agree('agreement'|'privacy')`（协议与隐私政策弹层）、`Mini.p1.star(n)`（星级）、`Mini.p1.cardOf()`（我当前有效的会员卡）、`Mini.p1.couponsOf()`（我可用的券）、`Mini.p1.daysTo('2026-11-05')`（距今天数）、`Mini.dock(入口数, 最长文案字数, 屏宽)`（宫格列数、行数、分页的推导）。
- 登录页接受 `{redirect:'back', from: 页面id}`：登录成功后调用 `Mini.afterLogin(ctx)`，回到来源页并重绘。需要登录才能做的动作（例如点“去结算”前没登录）直接 `ctx.push('login', {redirect:'back'})` 即可。

## 购物车：`B.db.cart` 与 `Mini.cart`

行结构：`{ key, pid, name, img, unit, orig, qty, specs:{份量:'标准', 口味:'原味'}, spec:'标准 / 原味', selected }`。`unit` 是含规格加价的单价（分），`orig` 是划线价（分）；同商品同规格合并成一行；`selected` 是购物车页的勾选（加购时置为 `true`）。一开始预置两行（牛腩饭、中式早餐），演示控制“重置演示数据”会恢复。

- `Mini.cart.add(product, {specs, qty})` → `Promise<{ok, line, reason}>`（先本地改再走一次请求，断网回滚并提示；超过库存、单笔上限、本人剩余时 `ok:false` 带原因）。
- `Mini.cart.setQty(key, qty)`（0 即移除）、`remove(key)`、`select(key, on)`、`selectAll(on)`、`clear()`、`clearInvalid()`、`clearSelected()`（**下单成功后调用**，移除已选且有效的行）、`snapshot()` / `restore(快照)`（撤销用）。
- 查询：`lines()`、`find(key)`、`valid()`、`invalid()`（下架、售罄或库存不足的行）、`state(line)`（`{ok:true}` 或 `{ok:false, kind:'off'|'out'|'short', text, fix}`，`short` 是库存不足，`fix` 是还能买的件数）、`low(line)`（库存只剩 1 到 3 件时返回件数）、`count()`（有效件数，角标用）、`countOf(pid)`、`room(product)`（还能再加几件）。
- **`Mini.cart.quote()`**：已选且有效的行的汇总，菜单、购物车、结算、订单用同一套算法（金额按分）：`{lines, count, subtotal, orig, saved, coupon, discount, pay, next:{need, name, value}|null}`；`coupon` 是自动选出的最优可用优惠券（`B.db.myCoupons` 里 `UNUSED` 且没过期、满足门槛的里抵扣最多的一张），`pay = subtotal - discount`，`next` 是“再买 ¥N 可用某券”。结算页要用同一个 `quote()`，不要另写算法。
- 变化后会发 `cart` 事件。

## 演示数据（`B.db` 里小程序补的，`B.reset()` 之后自动重做）

`B.db.buyRules`（购买规则）、`B.db.stores`（门店 5 家：`{id, name, addr, phone, hours, status:'OPEN'|'PAUSED', dist, x, y, tags, queue}`）、`B.db.curStore`（当前自取门店）、`B.db.searchHistory`、`B.db.reviews`（`{pid, user, rating, text, at}`）、`B.db.cart`。商品 7 售罄、商品 5 只剩 3 件、商品 12 下架，演示失效与限量。`B.db.me` 是已登录会员，`B.db.myCoupons`、`B.db.cards`、`B.db.notices`、`B.db.walletLogs` 等直接读 `bdata.js` 的。

## 约定

- 字号不小于 14，字重只用 400、600、700（700 只给 22 以上的数字），不用斜体；触控目标高不小于 40（`.btn` 在手机里 44，`.btn--sm` 40）；动效只动 `transform`、`opacity`，时长用令牌，减少动态效果用 `UI.play` 或令牌。
- 页面里的 `<button>` 做操作、`<a href>` 做链接；底部弹层高度不超过 80%；一个页面同一目的地只放一个入口。
- 一级页底部要给标签栏留位（外壳已加 `padding-bottom`）。吸底操作栏：页面写 `bar:true`，把页面根和吸底栏一起放进纵向 flex 的外层（参照 `p1b` 里的 `.m1-pwrap` 与 `.m1-pbar`），栏用 `position: sticky; bottom: 0`；`fill` 页里可用绝对定位的 `.mini-bar`。底部固定栏避开安全区 `var(--m-safe)`。
- 图标一物一图：购物车 `cart`、会员卡 `card`、储值 `wallet`、优惠券 `tag`、消息 `bell`、门店 `shop`、位置 `pin`、订单 `list`、点单 `dish`、我的 `user`、电话 `handset`、导航 `navigate`、设置 `gear`、时间 `clock`、搜索 `search`；缺的图标往 `UI.icons` 里补。
- 金额：列表与卡片用 `Mini.price(分)`（去末尾零），结算、订单、退款、储值等账务页用 `Mini.money(分)`（两位小数）。

## 共用类名（`mini.css`）

`mini-page`（页面根）、`mini-card`（卡片，`.tap` 可点）、`mini-sec`（区块标题行）、`mini-link`、`mini-list`（列表行，行里 `.grow`、`.muted`）、`mini-tag`（`--price`、`--brand`、`--ok`、`--warn`、`--bad`）、`mini-price`、`mini-strike`（划线价）、`mini-steps`（步进器，按钮内 `<span>` 是 28 的圆）、`mini-chips` / `mini-chip`（`aria-pressed` 选中）、`mini-check`（勾选，外层 44）、`mini-scroller`（横滑，露出下一张）、`mini-empty`、`mini-bar`（吸底操作栏，绝对定位）、`mini-pressable`（按下缩放 0.98）。按钮用 `ui.css` 的 `.btn`，加 `.btn--primary`、`.btn--tint`（浅底）、`.btn--onbrand`（品牌色底上的白按钮）、`.btn--block`。

## 页面 id（直达项）

`login`、`home`、`menu`、`search`、`product`（`?pid=`）、`cart`、`checkout`、`pay-result`、`orders`、`order-detail`、`refund-apply`、`review`、`cards`、`my-cards`、`card-detail`、`wallet`、`coupons`、`stores`、`notices`、`me`、`profile`、`settings`、`cancel-account`、`feedback`。没注册的页面直达时外壳显示“这个页面还没有做”。其中 `login`、`home`、`menu`、`search`、`product`、`cart`、`stores` 由 `p1*` 提供。打开 `product` 要带 `{pid}`；打开别人的页面按他自己约定的参数，写在自己页面文件开头的注释里。
