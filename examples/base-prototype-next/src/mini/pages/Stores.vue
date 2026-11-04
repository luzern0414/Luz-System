<script>
// 门店（全幅画布加浮动面板）：地图铺满整页当画布，门店做成底部浮动面板，点图钉或点门店联动，上拉展开成完整列表。
// 地图是示意地图（街区、公园、湖用布局拼，图钉是按钮），不引入地图库。
export const meta = {
  id: 'stores', label: '门店', title: '门店', group: '门店与消息', order: 1,
  layout: '全幅画布加浮动面板',
  reason: '“哪家店在哪、离我多远”是空间问题，所以地图铺满整页当画布；门店卡做成底部浮动面板，横滑选店、地图图钉联动，上拉展开成完整列表，不遮住图钉',
  scenes: [
    { id: 'locdenied', label: '没有开启定位：距离不可用' },
    { id: 'rest', label: '营业状态：休息中（部分门店未开门）' },
    { id: 'closed', label: '营业状态：已打烊' },
  ],
}
</script>

<script setup>
import { computed, ref, watch } from 'vue'
import { state, useScene, setScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'
import { fmtDist, shopInfo, storeShopKey, tradeSeed } from './Cart.vue'

const { back } = useNav()
const scene = useScene('stores')
const toast = (message, o = {}) => showToast({ message, teleport: '#phone-overlay', ...o })
tradeSeed()
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
load()

const denied = computed(() => scene.value === 'locdenied')
// 场景“休息中”“已打烊”把演示时钟拨到 08:10 或 21:40，所以只有部分门店未开门
const atMin = computed(() => (scene.value === 'rest' ? 8 * 60 + 10 : scene.value === 'closed' ? 21 * 60 + 40 : null))
const stores = computed(() => state.db.stores.slice().sort((a, b) => (denied.value ? a.id - b.id : a.dist - b.dist)))
const infoOf = (s) => shopInfo(storeShopKey(s, { atMin: atMin.value }), s.hours)
const sel = ref(state.db.curStore)
watch(stores, (list) => { if (!list.some((s) => s.id === sel.value) && list.length) sel.value = list[0].id }, { immediate: true })
const current = computed(() => stores.value.find((s) => s.id === sel.value))
const others = computed(() => stores.value.filter((s) => s.id !== sel.value))
const metaText = (s) => { const i = infoOf(s); return (denied.value ? '距离未知' : fmtDist(s.dist)) + (i.canOrder ? (s.queue ? ' · 前方 ' + s.queue + ' 单制作中' : ' · 现在下单马上做') : ' · ' + i.hint) }

/* 浮动面板：收起时看得到选中的门店，上拉展开成完整列表 */
const screenH = (typeof document !== 'undefined' && document.getElementById('screen')?.clientHeight) || 640
const anchors = [Math.min(260, Math.round(screenH * 0.4)), Math.round(screenH * 0.55), Math.round(screenH * 0.86)]
const panelH = ref(anchors[0])

/* 动作：导航、电话、在此点单 */
const MAPS = [{ name: '腾讯地图' }, { name: '高德地图' }, { name: '苹果地图' }]
const navStore = ref(null)
const showNav = ref(false)
const openNav = (s) => { navStore.value = s; showNav.value = true }
const onMap = (a) => toast('已打开' + a.name + '（模拟）')
async function call(s) {
  try { await showConfirmDialog({ title: '拨打电话', message: s.name + '\n' + s.phone, confirmButtonText: '拨打', teleport: '#phone-overlay' }) } catch { return }
  toast('正在呼叫（模拟）')
}
function choose(s) { state.db.curStore = s.id; toast('已选择 ' + s.name); back() }
function enableLoc() { setScene('stores', null); toast('已开启定位（模拟）') }
</script>

<template>
  <div class="stores">
    <MiniState :status="phase === 'ok' && !stores.length ? 'empty' : phase" empty-text="附近暂时没有门店，换个位置再看看" @retry="load">
      <template #empty-action><van-button round type="primary" size="small" @click="back()">返回</van-button></template>

      <div class="map" role="group" aria-label="门店地图，图钉是门店位置">
        <span class="blk" aria-hidden="true" v-for="b in [[14, 128, 40, 112], [78, 128, 108, 112], [344, 128, 40, 112], [14, 412, 172, 90], [214, 412, 170, 90], [14, 270, 40, 120], [344, 270, 40, 120]]" :key="b.join()" :style="{ left: b[0] + 'px', top: b[1] + 'px', width: b[2] + 'px', height: b[3] + 'px' }" />
        <span class="blk park" aria-hidden="true" style="left: 214px; top: 128px; width: 102px; height: 112px">万象公园</span>
        <span class="blk lake" aria-hidden="true" style="left: 78px; top: 270px; width: 108px; height: 120px">东湖</span>
        <span class="blk" aria-hidden="true" style="left: 214px; top: 270px; width: 102px; height: 120px" />
        <span class="river" aria-hidden="true" />
        <span v-if="!denied" class="me" role="img" aria-label="我的位置" />
        <div v-for="s in stores" :key="s.id" class="pin" :class="{ on: s.id === sel }" :style="{ left: s.x + 'px', top: s.y + 'px' }">
          <van-tag v-if="s.id === sel" type="primary" size="large" class="pin-tag">{{ s.name }}</van-tag>
          <van-button round icon="shop-o" size="small" class="pin-btn" :type="s.id === sel ? 'primary' : 'default'" :aria-label="s.name + '，' + infoOf(s).label" @click="sel = s.id" />
        </div>
      </div>

      <van-floating-panel v-model:height="panelH" :anchors="anchors" :style="{ width: '100%' }">
        <div class="phead"><span class="ptitle">附近门店</span><span class="muted">共 {{ stores.length }} 家 · {{ denied ? '按默认顺序' : '按距离从近到远' }}</span></div>
        <van-notice-bar v-if="denied" left-icon="warning-o" text="没有开启定位，距离暂时不能显示" :scrollable="false" wrapable color="var(--luz-warning)" background="var(--luz-warning-tint)">
          <template #right-icon><van-button size="small" @click="enableLoc">去开启</van-button></template>
        </van-notice-bar>
        <van-cell-group v-if="current" inset class="group">
          <van-cell center>
            <template #title><span class="sname">{{ current.name }}</span><van-tag round :type="infoOf(current).tag">{{ infoOf(current).label }}</van-tag></template>
            <template #label>
              <div>{{ metaText(current) }}</div>
              <div><van-icon name="location-o" /> {{ current.addr }}</div>
              <div><van-icon name="clock-o" /> {{ current.hours }} · {{ current.tags.join('、') }}</div>
            </template>
          </van-cell>
          <div class="acts">
            <van-button size="small" icon="guide-o" class="act" @click="openNav(current)">导航</van-button>
            <van-button size="small" icon="phone-o" class="act" @click="call(current)">电话</van-button>
            <van-button size="small" class="act" :type="infoOf(current).canOrder ? 'primary' : 'default'" :disabled="!infoOf(current).canOrder" @click="choose(current)">{{ infoOf(current).canOrder ? '在此点单' : infoOf(current).label }}</van-button>
          </div>
        </van-cell-group>
        <van-cell-group v-if="others.length" inset title="其他门店" class="group">
          <van-cell v-for="s in others" :key="s.id" :title="s.name" :label="metaText(s)" is-link center clickable @click="sel = s.id">
            <template #value><van-tag round :type="infoOf(s).tag">{{ infoOf(s).label }}</van-tag></template>
          </van-cell>
        </van-cell-group>
      </van-floating-panel>

      <van-action-sheet v-model:show="showNav" :actions="MAPS" :title="'导航到 ' + (navStore ? navStore.name : '')" :description="navStore ? navStore.addr : ''" cancel-text="取消" close-on-click-action @select="onMap" />
    </MiniState>
  </div>
</template>

<style scoped>
.stores { position: absolute; inset: 0; overflow: hidden; }
.map { position: absolute; inset: 0; overflow: hidden; background: var(--luz-canvas); }
.blk { position: absolute; display: grid; place-items: center; border: 1px solid var(--luz-line); border-radius: 8px; background: var(--luz-surface); color: var(--luz-ink-2); }
.blk.park { background: var(--luz-success-tint); border-color: transparent; }
.blk.lake { background: var(--luz-info-tint); border-color: transparent; }
.river { position: absolute; left: -10px; right: -10px; top: 540px; height: 32px; border-radius: 16px; background: var(--luz-info-tint); transform: rotate(-3deg); }
.me { position: absolute; left: 200px; top: 252px; width: 16px; height: 16px; margin: -8px 0 0 -8px; border: 3px solid var(--luz-surface); border-radius: 50%; background: var(--luz-info); box-shadow: 0 0 0 10px var(--luz-info-tint); }
.pin { position: absolute; display: grid; justify-items: center; gap: 4px; transform: translate(-50%, -100%); }
.pin.on { z-index: 1; }
.pin-tag { white-space: nowrap; }
.pin-btn { width: 40px; padding: 0; }
.phead { display: flex; align-items: baseline; justify-content: space-between; padding: 4px 16px 8px; }
.ptitle { font-weight: 600; }
.group { margin-bottom: 12px; }
.sname { margin-right: 8px; font-size: var(--t16); font-weight: 600; }
.acts { display: flex; gap: 8px; padding: 0 16px 12px; background: var(--van-background-2); }
.act { flex: 1; }
</style>
