<script>
// 我的会员卡（横带分层）：分段“使用中、未生效、已过期”，使用中的第一张放大，剩余次数或剩余天数是主角。
export const meta = {
  id: 'my-cards', label: '我的会员卡', title: '我的会员卡', group: '会员与资产', order: 2,
  layout: '横带分层',
  reason: '会员卡是资产，先看哪些现在能用：顶部分段把卡分成使用中、未生效、已过期三条带，使用中的第一张放大，其余收紧；点卡进详情做冻结、转让、退卡',
  scenes: [{ id: 'expiring', label: '一张卡 3 天后到期（即将到期标签）' }],
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'
import { today, addD, diff, cardState, faceOf, myCards, tagOf } from './CardDetail.vue'

const { go } = useNav()
const route = useRoute()
const scene = useScene('my-cards')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const guest = computed(() => state.role === 'guest')

const SEGS = [
  { id: 'active', label: '使用中', keys: ['ACTIVE', 'FROZEN', 'LOST', 'REFUNDING'], empty: ['现在没有可用的卡', '看看在售的卡种吧'] },
  { id: 'pending', label: '未生效', keys: ['PENDING'], empty: ['没有未生效的卡', '提前购买并指定生效日的卡会放在这里'] },
  { id: 'expired', label: '已过期', keys: ['EXPIRED', 'USEDUP', 'REFUNDED'], empty: ['没有已过期的卡', '过期或用完的卡会放在这里'] },
]
const seg = ref(SEGS.some((s) => s.id === route.query.seg) ? route.query.seg : 'active')
const flash = Number(route.query.flash) || 0

/** 我的卡；场景“即将到期”把第一张还有一阵子的期限卡演成 3 天后到期（只改显示） */
const all = computed(() => {
  const list = myCards().slice()
  if (scene.value === 'expiring') {
    const i = list.findIndex((x) => cardState(x).key === 'ACTIVE' && !x.total && diff(today(), x.expire) > 3)
    if (i >= 0) list[i] = { ...list[i], expire: addD(today(), 3) }
  }
  return list
})
const segs = computed(() => SEGS.map((s) => {
  const list = all.value.filter((c) => s.keys.includes(cardState(c).key)).sort((a, b) => (a.expire < b.expire ? -1 : 1)).map((c) => ({ c, st: cardState(c), f: faceOf(c) }))
  const msg = all.value.length ? s.empty : ['还没有会员卡', '办一张卡，到店用更划算']
  return { ...s, list, emptyText: msg[0] + '，' + msg[1], canBuy: s.id === 'active' || !all.value.length }
}))
const status = computed(() => phase.value)
const open = (c) => go('card-detail', { id: c.id })
</script>

<template>
  <div class="mp-page">
    <MiniState v-if="guest" status="forbidden">
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>
    </MiniState>
    <MiniState v-else :status="status" @retry="load">
      <van-tabs v-model:active="seg" shrink-less class="seg">
        <van-tab v-for="s in segs" :key="s.id" :name="s.id" :title="s.label + ' ' + s.list.length">
          <div class="pane">
            <MiniState v-if="!s.list.length" status="empty" :empty-text="s.emptyText">
              <template #empty-action><van-button v-if="s.canBuy" round type="primary" @click="go('cards')">去办卡</van-button></template>
            </MiniState>

            <template v-for="(x, i) in s.list" :key="x.c.id">
              <!-- 使用中的第一张放大，是这一屏唯一的品牌主卡 -->
              <van-cell-group v-if="s.id === 'active' && i === 0" inset class="hero-group">
                <van-cell is-link center class="hero" :class="x.f.live ? 'is-live' : 'is-warn'" :aria-label="x.c.typeName + '，' + x.f.chip.label + '，' + x.f.label + x.f.n + x.f.unit" @click="open(x.c)">
                  <template #title>
                    <div class="hero-top"><span class="hero-name">{{ x.c.typeName }}</span><van-tag round v-bind="tagOf(x.f.chip, x.f.live)">{{ x.f.chip.label }}</van-tag></div>
                    <div class="hero-num"><span>{{ x.f.label }}</span><b class="num hero-n">{{ x.f.n }}</b><span>{{ x.f.unit }}</span></div>
                    <div class="hero-sub small"><span>{{ x.f.exp }}</span><span>卡号尾号 {{ x.c.no.slice(-4) }}</span></div>
                  </template>
                </van-cell>
              </van-cell-group>
              <van-cell-group v-else inset>
                <van-cell is-link center :class="{ dead: x.f.dead }" :label="x.f.exp" :aria-label="x.c.typeName + '，' + x.f.chip.label + '，' + x.f.label + x.f.n + x.f.unit" @click="open(x.c)">
                  <template #title><span class="row-name">{{ x.c.typeName }}</span><van-tag v-bind="tagOf(x.f.chip)" round :plain="x.f.chip.type !== 'default'" class="row-tag">{{ x.f.chip.label }}</van-tag><van-tag v-if="x.c.id === flash" type="primary" round class="row-tag">刚办理</van-tag></template>
                  <template #value><span class="row-left">{{ x.f.label }} <b class="num">{{ x.f.n }}</b> {{ x.f.unit }}</span></template>
                </van-cell>
              </van-cell-group>
            </template>

            <van-cell-group v-if="s.list.length" inset><van-cell icon="plus" title="办理新卡" is-link @click="go('cards')" /></van-cell-group>
          </div>
        </van-tab>
      </van-tabs>
    </MiniState>
  </div>
</template>

<style scoped>
.mp-page { padding-top: 0; padding-left: 0; padding-right: 0; gap: 0; }
.seg { --van-tabs-line-height: 44px; border-bottom: 1px solid var(--luz-line); background: var(--van-background-2); }
.pane { display: grid; gap: 12px; padding: 12px 12px 8px; }
.hero { --van-cell-background: var(--luz-action); --van-cell-text-color: var(--luz-on-action); --van-cell-right-icon-color: #fff; --van-cell-active-color: var(--luz-action-press); padding: 16px; }
.hero.is-warn { --van-cell-background: var(--luz-warning-tint); --van-cell-text-color: var(--luz-ink); --van-cell-right-icon-color: var(--luz-ink-2); --van-cell-active-color: var(--luz-warning-tint); }
.hero-group { box-shadow: var(--luz-level-2); }
.hero-top, .hero-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hero-name { font-size: var(--t18); line-height: 26px; font-weight: 600; }
.hero-num { display: flex; align-items: baseline; gap: 6px; margin: 12px 0; }
.hero-n { font-size: var(--t40); line-height: 48px; font-weight: 700; }
.hero-sub { font-size: var(--t14); }
.row-name { font-size: var(--t16); font-weight: 600; }
.row-tag { margin-left: 8px; }
.row-left { color: var(--luz-ink); white-space: nowrap; }
.row-left b { font-size: var(--t16); font-weight: 600; }
.dead { --van-cell-text-color: var(--luz-ink-2); }
.dead .row-left { color: var(--luz-ink-2); }
</style>
