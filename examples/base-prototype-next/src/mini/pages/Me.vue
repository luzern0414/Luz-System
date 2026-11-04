<script>
// 我的（底部标签页）：头部确认我是谁 → 资产（余额是主角） → 订单状态 → 常用功能。数字全部读 state.db，和后台、其他页同一份。
export const meta = {
  id: 'me', label: '我的', title: '我的', group: '我的', tab: true, order: 1,
  layout: '横带分层',
  reason: '“我的”是资产与入口的汇总：头部确认我是谁，往下按重要性分三条横带——资产（余额最大，是主角）、订单状态、常用功能，每条带只做一件事',
  scenes: [
    { id: 'guest', label: '未登录：登录引导' },
    { id: 'newbie', label: '新会员：资产为零、没有订单' },
    { id: 'busy', label: '角标很多：订单 120 笔待支付、未读消息很多' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { avatar } from '../../shared/avatar.js'
import { cardState, myCards } from './CardDetail.vue'

const { go, replace } = useNav()
const say = (message) => showToast({ message, teleport: '#phone-overlay', duration: 1500 })
const scene = useScene('me')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const guest = computed(() => scene.value === 'guest' || state.role === 'guest')
const newbie = computed(() => scene.value === 'newbie')
const busy = computed(() => scene.value === 'busy')
const me = computed(() => state.db.me)
const today = K.ymd(B.NOW())
const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - K.today()) / 864e5)
const shown = (id) => !state.hidden[id]

// 头像：六个线性图标头像，个人资料里选的那个（avatarIdx）优先于按会员号固定的那个
const avatarSrc = (u) => avatar('pick-' + (u.avatarIdx != null ? u.avatarIdx : u.id % 6))   // six faces to pick from; before a pick the member number gives one

// 头部：资料完整度（昵称、头像、性别、生日、手机号）
const profileItems = computed(() => [['昵称', !!me.value.name], ['头像', me.value.avatarIdx != null], ['性别', !!me.value.gender], ['生日', !!me.value.birthday], ['手机号', !!me.value.phone && me.value.phoneBound !== false]])
const pct = computed(() => Math.round((profileItems.value.filter((i) => i[1]).length / profileItems.value.length) * 100))
const todo = computed(() => profileItems.value.filter((i) => !i[1]).map((i) => i[0]))
const memberNo = computed(() => me.value.memberNo || String(80000000 + me.value.id * 137))

// 资产：余额、可用券、使用中的会员卡（口径和首页一致）
const balance = computed(() => (newbie.value ? 0 : me.value.balance))
const gift = computed(() => Math.min(me.value.giftBalance || 0, balance.value))
const coupons = computed(() => (newbie.value ? [] : state.db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today)))
const couponSoon = computed(() => coupons.value.filter((c) => daysTo(c.expire) <= 2).length)
const cards = computed(() => (newbie.value ? [] : myCards().filter((c) => ['ACTIVE', 'FROZEN', 'LOST', 'REFUNDING'].includes(cardState(c).key))))
const nextExpire = computed(() => cards.value.filter((c) => cardState(c).key === 'ACTIVE').map((c) => c.expire).sort()[0] || '')

// 订单状态角标：来自订单表（待支付 UNPAID；待取餐 PAID 与 FULFILLED；退款中 REFUNDING）
const counts = computed(() => {
  if (guest.value || newbie.value) return { unpaid: 0, pickup: 0, done: 0, after: 0 }
  if (busy.value) return { unpaid: 120, pickup: 6, done: 0, after: 3 }
  const mine = state.db.orders.filter((o) => o.userId === me.value.id && !o.hidden)
  const n = (f) => mine.filter(f).length
  return { unpaid: n((o) => o.status === 'UNPAID'), pickup: n((o) => o.status === 'PAID' || o.status === 'FULFILLED'), done: 0, after: n((o) => o.status === 'REFUNDING') }
})
const unread = computed(() => (guest.value || newbie.value ? 0 : busy.value ? 128 : state.db.notices.filter((n) => !n.read && !n.deleted).length))
const ORDERS = [['待支付', 'clock-o', 'unpaid'], ['待取餐', 'bag-o', 'pickup'], ['已完成', 'passed', 'done'], ['退款与售后', 'after-sale', 'after']]
const FNS = [['cards', '办会员卡', 'vip-card-o'], ['coupons', '领券中心', 'gift-o', { tab: 'center' }], ['notices', '消息', 'bell'], ['stores', '门店', 'location-o'], ['call', '联系客服', 'service-o'], ['feedback', '意见反馈', 'chat-o'], ['settings', '设置', 'setting-o']]
const fns = computed(() => FNS.filter((f) => shown(f[0])))

// 一个确认框：ask(...) 返回 Promise<boolean>
const dlg = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false })
let settle = null
function ask(o) { Object.assign(dlg, { ok: '确定', cancel: '取消', danger: false }, o, { show: true }); return new Promise((resolve) => { settle = resolve }) }
function answer(v) { if (settle) { settle(v); settle = null } }
watch(() => dlg.show, (v) => { if (!v) answer(false) })

function toLogin() { go('login') }
async function call() {
  if (!(await ask({ title: '联系客服', message: '拨打 ' + B.shop.phone + '\n服务时间 ' + B.shop.hours, ok: '拨打' }))) return
  say('正在呼叫（模拟）')
}
function open(f) { if (f[0] === 'call') call(); else go(f[0], f[3] || {}) }
async function logout() {
  if (!(await ask({ title: '退出登录', message: '退出后需要重新登录，才能查看订单、会员卡和优惠券。', ok: '退出', danger: true }))) return
  state.role = 'guest'; state.signedIn = false; replace('login')
}
</script>

<template>
  <div class="mp-page me">
    <MiniState :status="phase" :rows="8" @retry="load">
      <!-- 头部：我是谁；整块进个人资料 -->
      <van-cell-group v-if="guest" inset>
        <van-cell center :border="false">
          <template #icon><span class="avatar av-guest"><van-icon name="user-o" /></span></template>
          <template #title><span class="who-name">你好，欢迎光临</span></template>
          <template #label>登录后可查看订单、会员卡和优惠券</template>
        </van-cell>
        <div class="login-row"><van-button type="primary" round block @click="toLogin">登录 / 注册</van-button></div>
      </van-cell-group>
      <van-cell-group v-else inset>
        <van-cell center is-link :border="false" :aria-label="'个人资料：' + me.name + (pct < 100 ? '，资料完整度 ' + pct + '%' : '')" @click="go('profile')">
          <template #icon><img class="avatar" :src="avatarSrc(me)" alt="" /></template>
          <template #title>
            <span class="who-name">{{ newbie ? '新朋友' : me.name }}</span>
            <van-tag plain round type="primary" class="level">{{ newbie ? '普通会员' : me.level + '会员' }}</van-tag>
          </template>
          <template #label>
            <div class="num">会员号 {{ memberNo }}</div>
            <div v-if="pct < 100" class="complete">资料完整度 {{ pct }}%，补全{{ todo.slice(0, 2).join('、') }}</div>
            <div v-else>资料已完整</div>
          </template>
        </van-cell>
      </van-cell-group>

      <template v-if="!guest">
        <!-- 资产：余额是主角（本页唯一的品牌主卡），优惠券与会员卡是配角 -->
        <section class="brand-card" aria-label="我的资产">
          <div class="brand-top"><span>储值余额</span><van-button v-if="shown('wallet')" size="small" plain round class="brand-btn" @click="go('wallet')">去充值</van-button></div>
          <div class="brand-amount num">{{ money(balance) }}</div>
          <div class="brand-sub">
            <span v-if="!balance">还没有储值，去充值享赠送</span>
            <template v-else><span class="num">本金 {{ money(balance - gift) }}</span><span class="num">赠送 {{ money(gift) }}</span></template>
          </div>
        </section>
        <van-cell-group v-if="shown('coupons') || shown('my-cards')" inset>
          <van-cell v-if="shown('coupons')" title="优惠券" :value="coupons.length + ' 张可用'" :label="couponSoon ? couponSoon + ' 张 2 天内到期' : coupons.length ? '' : '暂无可用券'" is-link @click="go('coupons')" />
          <van-cell v-if="shown('my-cards')" title="会员卡" :value="cards.length + ' 张使用中'" :label="nextExpire ? '最近到期 ' + nextExpire : cards.length ? '当前没有可正常使用的卡' : '还没有会员卡，去办一张'" is-link @click="go('my-cards')" />
        </van-cell-group>

        <!-- 订单状态：角标来自订单表 -->
        <van-cell-group v-if="shown('orders')" inset>
          <van-cell title="我的订单" value="全部订单" is-link @click="go('orders', { seg: 'all' })" />
          <van-grid :column-num="4" :border="false">
            <van-grid-item v-for="[label, icon, seg] in ORDERS" :key="seg" :icon="icon" :text="label" :badge="counts[seg] || ''" :badge-props="{ max: 99 }" @click="go('orders', { seg })" />
          </van-grid>
        </van-cell-group>
      </template>

      <!-- 常用功能 -->
      <div>
        <van-cell-group inset title="常用功能">
          <van-grid :column-num="4" :border="false">
            <van-grid-item v-for="f in fns" :key="f[0]" :icon="f[2]" :text="f[1]" :badge="f[0] === 'notices' && unread ? unread : ''" :badge-props="{ max: 99 }" @click="open(f)" />
          </van-grid>
        </van-cell-group>
      </div>

      <van-button v-if="!guest" block round plain @click="logout">退出登录</van-button>
    </MiniState>

    <van-dialog v-model:show="dlg.show" :title="dlg.title" :message="dlg.message" show-cancel-button :confirm-button-text="dlg.ok" :cancel-button-text="dlg.cancel" :confirm-button-color="dlg.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" />
  </div>
</template>

<style scoped>
.avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; margin-right: 12px; border-radius: 50%; font-size: var(--t28); }
.av-guest { background: var(--luz-action-tint); color: var(--luz-action-text); }   /* a guest shows the line icon; a member has a face */
img.avatar { object-fit: cover; }
.who-name { font-size: var(--t18); line-height: 26px; font-weight: 600; color: var(--luz-ink); }
.level { margin-left: 8px; vertical-align: 2px; }
.complete { margin-top: 4px; color: var(--luz-action-text); }
.login-row { padding: 0 16px 16px; }
.brand-card { padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.brand-top, .brand-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand-btn { color: var(--luz-on-action); border-color: currentColor; background: transparent; }
.brand-amount { margin: 8px 0; font-size: var(--t32); line-height: 40px; font-weight: 700; }
.brand-sub { }
</style>
