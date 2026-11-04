<script setup>
// The demo panel of the mini-program prototype (场景配置面板): one tab per business group plus 全局. Per page: jump to it, show or hide
// its entry, pick a scene. 全局: identity, network, reduced motion, reset. Built from Vant components.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { state, resetDemo, setScene, clearScenes } from '../../shared/state.js'
import { GROUPS, PAGES } from '../registry.js'
import { clearCart } from '../cart.js'
import { FONT_LEVELS } from '../font-levels.js'
import { SCHEMES } from '../../shared/scheme.js'

const router = useRouter()
const tab = ref(GROUPS[0])
const rows = (g) => PAGES.filter((p) => p.group === g)
const jump = (p) => router.push('/' + p.id)
function pick(p, id) { setScene(p.id, id || null); if (id) jump(p) }
function setIdentity(role) { state.role = role; state.signedIn = role === 'member' }
async function reset() {
  try { await showConfirmDialog({ title: '重置演示数据', message: '订单、会员卡、购物车等回到初始状态，确定吗？', teleport: '#phone-overlay' }) } catch { return }
  resetDemo(); clearCart(); router.push('/home'); showToast('演示数据已重置')
}
</script>

<template>
  <div class="demo">
    <van-tabs v-model:active="tab" shrink sticky>
      <van-tab v-for="g in GROUPS" :key="g" :title="g" :name="g">
        <van-cell-group v-for="p in rows(g)" :key="p.id" inset :title="p.label" class="demo-group">
          <van-cell title="直达这一页" is-link @click="jump(p)" />
          <van-cell title="在底部标签与入口里显示"><template #right-icon><van-switch :model-value="!state.hidden[p.id]" size="20" aria-label="显示入口" @update:model-value="(v) => (state.hidden[p.id] = !v)" /></template></van-cell>
          <van-radio-group :model-value="state.scenes[p.id] || ''" @update:model-value="(v) => pick(p, v)">
            <van-cell title="默认（有数据）" clickable @click="pick(p, '')"><template #right-icon><van-radio name="" /></template></van-cell>
            <van-cell v-for="s in p.scenes" :key="s.id" :title="s.label" clickable @click="pick(p, s.id)"><template #right-icon><van-radio :name="s.id" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
      </van-tab>
      <van-tab title="全局" name="全局">
        <van-cell-group inset title="身份" class="demo-group">
          <van-radio-group :model-value="state.role" @update:model-value="setIdentity">
            <van-cell title="会员（已登录）" clickable @click="setIdentity('member')"><template #right-icon><van-radio name="member" /></template></van-cell>
            <van-cell title="游客（未登录）" clickable @click="setIdentity('guest')"><template #right-icon><van-radio name="guest" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
        <van-cell-group inset title="网络" class="demo-group">
          <van-radio-group v-model="state.net">
            <van-cell title="正常" clickable @click="state.net = 'online'"><template #right-icon><van-radio name="online" /></template></van-cell>
            <van-cell title="慢网" clickable @click="state.net = 'slow'"><template #right-icon><van-radio name="slow" /></template></van-cell>
            <van-cell title="不稳定" clickable @click="state.net = 'flaky'"><template #right-icon><van-radio name="flaky" /></template></van-cell>
            <van-cell title="断网" clickable @click="state.net = 'offline'"><template #right-icon><van-radio name="offline" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
        <van-cell-group inset title="门店营业状态" class="demo-group">
          <van-radio-group v-model="state.shopStatus">
            <van-cell v-for="[id, label] in [['open', '营业中'], ['rest', '休息中（只能浏览）'], ['closed', '已打烊（只能浏览）'], ['paused', '暂停营业（只能浏览）']]" :key="id" :title="label" clickable @click="state.shopStatus = id"><template #right-icon><van-radio :name="id" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
        <van-cell-group inset title="外观" class="demo-group">
          <van-radio-group v-model="state.scheme">
            <van-cell v-for="[k, label] in SCHEMES" :key="k" :title="label" clickable @click="state.scheme = k"><template #right-icon><van-radio :name="k" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
        <van-cell-group inset title="微信字体大小" class="demo-group">
          <van-radio-group v-model="state.fontLevel">
            <van-cell v-for="l in FONT_LEVELS" :key="l.id" :title="l.label" :label="l.factor + ' 倍'" clickable @click="state.fontLevel = l.id"><template #right-icon><van-radio :name="l.id" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>
        <van-cell-group inset title="其他" class="demo-group">
          <van-cell title="减少动态效果"><template #right-icon><van-switch v-model="state.reducedMotion" size="20" aria-label="减少动态效果" /></template></van-cell>
          <van-cell title="清除所有场景" is-link @click="clearScenes" />
          <van-cell title="重置演示数据" is-link @click="reset" />
        </van-cell-group>
      </van-tab>
    </van-tabs>
  </div>
</template>

<style scoped>
.demo { padding-bottom: 24px; }
.demo-group { margin-top: 12px; }
</style>
