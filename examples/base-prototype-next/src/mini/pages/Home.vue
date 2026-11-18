<script>
// Sample page of the mini-program prototype: the pattern every page follows (see CONVENTIONS.md).
export const meta = {
  id: 'home', label: '首页', title: '示例门店', group: '入口', tab: true, order: 1,
  layout: '主次布局',
  reason: '先确认门店状态，再开始找商品或点单。个人权益由我的页面办理。',
  scenes: [{ id: 'rest', label: '营业状态：休息中' }, { id: 'closed', label: '营业状态：已打烊' }, { id: 'paused', label: '营业状态：暂停营业' }],
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'
import { addToCart } from '../cart.js'

const { go } = useNav()
const scene = useScene('home')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const STATUS = { open: ['success', '营业中'], rest: ['warning', '休息中'], closed: ['default', '已打烊'], paused: ['warning', '暂停营业'] }
const status = computed(() => (['rest', 'closed', 'paused'].includes(scene.value) ? scene.value : state.shopStatus))   // the page's own scene wins over the demo panel's global shop status
const open = computed(() => status.value === 'open')
const hot = computed(() => state.db.products.filter((p) => p.status === 'ON').slice(0, 4))
function add(p) {
  if (!open.value) return showToast({ message: '门店暂未营业，只能浏览', teleport: '#phone-overlay' })
  addToCart(p, { spec: '标准 / 原味' }); showToast({ message: '已加入购物车', duration: 1200, teleport: '#phone-overlay' })
}
</script>

<template>
  <div class="mp-page">
    <MiniState :status="phase" @retry="load">
      <van-cell-group inset>
        <van-cell :title="B.shop.name" :label="'营业时间 ' + B.shop.hours + ' · ' + B.shop.addr" center>
          <template #value><van-tag round :type="STATUS[status][0]">{{ STATUS[status][1] }}</van-tag></template>
        </van-cell>
      </van-cell-group>

      <van-cell-group inset>
        <van-cell title="搜索商品" icon="search" is-link @click="go('search')" />
      </van-cell-group>
      <van-notice-bar left-icon="volume-o" :text="B.shop.notice" :scrollable="false" wrapable class="notice" />

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
</style>
