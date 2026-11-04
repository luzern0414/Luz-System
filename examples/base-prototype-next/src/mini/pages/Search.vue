<script>
export const meta = {
  id: 'search', label: '搜索', title: '搜索', group: '点单', order: 3,
  layout: '横带分层',
  reason: '一条搜索框在最上，下面从历史、热门到结果一层一层往下读；有字时结果顶替历史和热门，没有结果给出路',
  scenes: [{ id: 'nohistory', label: '没有搜索历史' }, { id: 'noresult', label: '搜索没有结果' }],
}
</script>

<script setup>
// Search: the box on top, then history and hot words; typing replaces them with the matching products; no match gives a way out.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'

const { go } = useNav()
const scene = useScene('search')
const teleport = '#phone-overlay'

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// history lives in state.db (shared data may seed it); the sold-out demo stock is local until the shared data carries it
if (!state.db.searchHistory) state.db.searchHistory = ['牛腩饭', '早餐']
const STOCK = { 7: 0, 5: 3, 2: 6 }
const stockOf = (p) => (p.id in STOCK ? STOCK[p.id] : p.stock)
const history = computed(() => (scene.value === 'nohistory' ? [] : state.db.searchHistory))

const q = ref('')
const kw = ref('')                                      // the debounced keyword the results follow
watch(scene, (s) => { q.value = kw.value = s === 'noresult' ? '麻辣烫' : '' }, { immediate: true })
let timer = 0
watch(q, (v) => { clearTimeout(timer); timer = setTimeout(() => { kw.value = v.trim() }, 220) })
onBeforeUnmount(() => clearTimeout(timer))

const catName = (id) => B.CATS.find((c) => c.id === id)?.name || ''
const hot = computed(() => state.db.products.filter((p) => p.status === 'ON').slice().sort((a, b) => b.sales - a.sales).slice(0, 6))
const results = computed(() => (kw.value ? state.db.products.filter((p) => (p.name + p.desc + p.tags.join('') + catName(p.cat)).includes(kw.value)) : []))
const status = computed(() => (phase.value !== 'ok' ? phase.value : kw.value && !results.value.length ? 'empty' : 'ok'))
const emptyText = computed(() => '没有找到“' + kw.value + '”，换个词试试，比如“牛腩”“早餐”')

function commit(w) {
  w = (w || '').trim(); if (!w) return
  const list = state.db.searchHistory, i = list.indexOf(w)
  if (i >= 0) list.splice(i, 1)
  list.unshift(w); list.length = Math.min(list.length, 8)
}
function onSearch() { kw.value = q.value.trim(); commit(kw.value) }
function pickWord(w) { q.value = kw.value = w; commit(w) }
function clearQuery() { q.value = kw.value = '' }
function clearHistory() {
  showConfirmDialog({ title: '清空搜索历史', message: '清空全部 ' + history.value.length + ' 条搜索历史，清空后不能恢复', confirmButtonText: '清空', confirmButtonColor: 'var(--luz-danger)', teleport })
    .then(() => { state.db.searchHistory.length = 0; showToast({ message: '已清空搜索历史', teleport }) }, () => {})
}
function open(p) { commit(kw.value); go('product', { id: p.id }) }

const offText = (p) => (p.status !== 'ON' ? '已下架' : stockOf(p) <= 0 ? '已售罄' : '')
const tagsOf = (p) => [p.tags[0], stockOf(p) > 0 && stockOf(p) <= 5 ? '仅剩 ' + stockOf(p) + ' 件' : ''].filter(Boolean)
</script>

<template>
  <div class="pg search">
    <div class="sbar">
      <van-search v-model="q" shape="round" placeholder="搜索菜品，例如牛腩饭" :autofocus="!q" @search="onSearch" />
    </div>

    <MiniState :status="status" :empty-text="emptyText" @retry="load">
      <template #empty-action><van-button round type="primary" plain size="small" @click="clearQuery">看看热销</van-button></template>

      <div v-if="!kw" class="bands">
        <section v-if="history.length" class="mp-card">
          <div class="band-h"><h2 class="h">搜索历史</h2><van-button size="small" plain icon="delete-o" aria-label="清空搜索历史" @click="clearHistory">清空</van-button></div>
          <div class="chips"><van-button v-for="w in history" :key="w" size="small" round @click="pickWord(w)">{{ w }}</van-button></div>
        </section>
        <section class="mp-card">
          <div class="band-h"><h2 class="h">热门搜索</h2></div>
          <div class="chips"><van-button v-for="(p, i) in hot" :key="p.id" size="small" round @click="pickWord(p.name)"><b class="rk" :class="{ top: i < 3 }">{{ i + 1 }}</b>{{ p.name }}</van-button></div>
        </section>
      </div>

      <div v-else class="bands">
        <section class="mp-card list">
          <p class="muted count">找到 {{ results.length }} 件商品</p>
          <van-card v-for="p in results" :key="p.id" :desc="p.desc" :thumb="p.img" @click="open(p)">
            <template #title><van-highlight class="name" :keywords="kw" :source-string="p.name" /></template>
            <template v-if="offText(p)" #tag><van-tag type="default" mark>{{ offText(p) }}</van-tag></template>
            <template #tags><div v-if="tagsOf(p).length" class="tags"><van-tag v-for="t in tagsOf(p)" :key="t" plain type="danger">{{ t }}</van-tag></div></template>
            <template #price><MiniPrice :cents="p.price" :old="p.orig" /></template>
          </van-card>
        </section>
      </div>
    </MiniState>
  </div>
</template>

<style scoped>
.pg {
  --van-tag-font-size: var(--van-font-size-sm); --van-tag-line-height: 20px; --van-tag-default-color: var(--luz-ink-2);
  --van-button-small-height: 40px; --van-button-small-font-size: var(--van-font-size-sm);
  --van-card-font-size: var(--van-font-size-md); --van-card-padding: 8px 0; --van-card-background: var(--van-background-2); --van-card-price-font: var(--luz-font);
  --van-card-title-line-height: 20px; --van-card-origin-price-font-size: var(--van-font-size-sm);
}
.search { min-height: 100%; }
.sbar { position: sticky; top: 0; z-index: 2; background: var(--van-background-2); --van-cell-line-height: 40px; --van-search-input-height: 40px; }
.bands { display: grid; gap: 12px; padding: 12px; align-content: start; }
.band-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.h { margin: 0; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.rk { margin-right: 6px; color: var(--luz-ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.rk.top { color: var(--luz-price); }
.count { margin: 0 0 4px; }
.list :deep(.price small), .list :deep(.price-old) { font-size: var(--t14); }   /* MiniPrice's 12 px parts, kept at the 14 px floor of the audit */
.list .name { font-weight: 600; line-height: 20px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
</style>
