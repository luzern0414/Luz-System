<script>
// Sample page of the mini-program prototype: the pattern every page follows (see CONVENTIONS.md).
export const meta = {
  id: 'home', label: '首页', title: '示例门店', group: '入口', tab: true, order: 1,
  layout: '主次布局',
  reason: '首页的第一件事是会员的资产与点单入口，所以一张品牌主卡占最显眼的位置；金刚区与热销商品是次要的，放在它下面',
  scenes: [{ id: 'newuser', label: '没有会员卡和可用券（新用户）' }, { id: 'rest', label: '营业状态：休息中' }, { id: 'closed', label: '营业状态：已打烊' }, { id: 'paused', label: '营业状态：暂停营业' }],
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { addToCart } from '../cart.js'

const { go, toTab } = useNav()
const scene = useScene('home')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const STATUS = { open: ['success', '营业中'], rest: ['warning', '休息中'], closed: ['default', '已打烊'], paused: ['warning', '暂停营业'] }
const status = computed(() => (['rest', 'closed', 'paused'].includes(scene.value) ? scene.value : state.shopStatus))   // the page's own scene wins over the demo panel's global shop status
const open = computed(() => status.value === 'open')
const me = computed(() => state.db.users[0])
const assets = computed(() => (scene.value === 'newuser' || state.role === 'guest' ? null : { balance: me.value.balance, cards: state.db.cards.filter((c) => c.userId === me.value.id && c.status === 'ACTIVE').length, coupons: state.db.myCoupons.filter((c) => c.state === 'UNUSED').length }))
const ENTRIES = [['menu', '点单', 'shop-o'], ['my-cards', '会员卡', 'vip-card-o'], ['coupons', '优惠券', 'coupon-o'], ['wallet', '储值', 'balance-o'], ['stores', '门店', 'location-o'], ['notices', '消息', 'bell'], ['orders', '订单', 'orders-o'], ['cards', '购卡', 'gift-o']]
const unread = computed(() => state.db.notices.filter((n) => !n.read).length)
const hot = computed(() => state.db.products.filter((p) => p.status === 'ON').slice(0, 4))
const banners = computed(() => state.db.products.slice(0, 3))
const page = (id) => (['menu', 'orders'].includes(id) ? toTab(id) : go(id))
function add(p) {
  if (!open.value) return showToast({ message: '门店暂未营业，只能浏览', teleport: '#phone-overlay' })
  addToCart(p, { spec: '标准 / 原味' }); showToast({ message: '已加入购物车', duration: 1200, teleport: '#phone-overlay' })
}
</script>

<template>
  <div class="mp-page">
    <MiniState :status="phase" @retry="load">
      <van-notice-bar left-icon="volume-o" :text="B.shop.notice" :scrollable="false" wrapable class="notice" />

      <van-cell-group inset>
        <van-cell :title="B.shop.name" :label="'营业时间 ' + B.shop.hours + ' · ' + B.shop.addr" center>
          <template #value><van-tag round :type="STATUS[status][0]">{{ STATUS[status][1] }}</van-tag></template>
        </van-cell>
      </van-cell-group>

      <!-- the one brand card of the screen -->
      <section v-if="assets" class="brand-card" aria-label="我的资产">
        <div class="brand-top"><span>储值余额</span><van-button size="small" plain round class="brand-btn" @click="go('wallet')">去充值</van-button></div>
        <div class="brand-amount num">{{ money(assets.balance) }}</div>
        <div class="brand-sub"><span>会员卡 {{ assets.cards }} 张</span><span>可用券 {{ assets.coupons }} 张</span></div>
      </section>
      <van-cell-group v-else inset>
        <van-cell title="新朋友，领一张新人券吧" label="登录后可领取新人券，首单立减" is-link @click="go(state.role === 'guest' ? 'login' : 'coupons')" />
      </van-cell-group>

      <van-grid :column-num="4" :border="false" class="entries">
        <van-grid-item v-for="[id, label, icon] in ENTRIES.filter((e) => !state.hidden[e[0]])" :key="id" :icon="icon" :text="label" :badge="id === 'notices' && unread ? unread : ''" @click="page(id)" />
      </van-grid>

      <van-swipe :autoplay="state.reducedMotion ? 0 : 4000" indicator-color="white" class="banner" lazy-render>
        <van-swipe-item v-for="p in banners" :key="p.id"><van-image :src="p.img" fit="cover" width="100%" height="140" radius="12" :alt="p.name" /></van-swipe-item>
      </van-swipe>

      <van-cell-group inset title="热销">
        <van-card v-for="p in hot" :key="p.id" :price="(p.price / 100).toFixed(2)" :origin-price="(p.orig / 100).toFixed(2)" :title="p.name" :desc="p.desc" :thumb="p.img" @click="go('product', { id: p.id })">
          <template #footer><van-button size="mini" type="primary" round :disabled="!open" @click.stop="add(p)">{{ open ? '加入购物车' : '暂未营业' }}</van-button></template>
        </van-card>
      </van-cell-group>
    </MiniState>
  </div>
</template>

<style scoped>
.notice { border-radius: var(--luz-radius-card); }
.brand-card { padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.brand-top, .brand-sub { display: flex; align-items: center; justify-content: space-between; }
.brand-btn { color: #fff; border-color: rgba(255, 255, 255, .6); background: transparent; }
.brand-amount { margin: 8px 0; font-size: var(--t32); line-height: 40px; font-weight: 700; }
.brand-sub { font-size: var(--t12); }
.entries { background: var(--van-background-2); border-radius: var(--luz-radius-card); }
.banner { border-radius: var(--luz-radius-card); overflow: hidden; }
</style>
