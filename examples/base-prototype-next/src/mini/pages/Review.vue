<script>
export const meta = {
  id: 'review', label: '评价', title: '评价', group: '订单', order: 4,
  layout: '主次布局',
  reason: '评价的主角只有一个：整单打几颗星；每个商品的点赞点踩、标签、文字、图片都是依次往下的次要信息，越往下越可选；星数一选，标签和占位文案就跟着变，提交一步完成',
  scenes: [
    { id: 'reviewed', label: '已评价：只读展示' }, { id: 'not-done', label: '订单未完成：不能评价' },
    { id: 'expired', label: '超过 15 天：评价通道已关闭' }, { id: 'submit-fail', label: '提交被拒：内容未通过审核' },
  ],
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { kit } from './Orders.vue'

const { go, back } = useNav()
const route = useRoute()
const scene = useScene('review')
const guest = computed(() => state.role === 'guest')
const store = B.shop
const TAGS = [['口味', ['味道很好', '偏咸', '偏淡', '偏油']], ['分量', ['分量足', '分量偏少']], ['包装', ['包装严实', '有洒漏']], ['速度', ['出餐很快', '等了太久']]]
const RATE = ['', '很不满意', '不太满意', '一般', '满意', '非常满意']

// ---- which order: ?id=, else the one the scene is about
const o = ref(null)
const phase = ref('loading')                                            // loading | ok | error
async function load() {
  phase.value = 'loading'
  try {
    await request(450); kit.sweep()
    const sc = scene.value
    o.value = route.query.id ? kit.byNo(String(route.query.id)) : sc === 'reviewed' ? kit.find('done-reviewed') : sc === 'not-done' ? kit.mine().find((x) => ['unpaid', 'making', 'ready'].includes(kit.kind(x))) || kit.find('making') : sc === 'expired' ? kit.find('expired') : kit.find('done')
    phase.value = 'ok'
  } catch { phase.value = 'error' }
}
let timer = 0
onMounted(() => { load(); timer = setInterval(kit.sweep, 1000) })
onBeforeUnmount(() => clearInterval(timer))

const items = computed(() => { const first = {}; o.value.items.forEach((i) => { if (!first[i.pid]) first[i.pid] = i }); return Object.values(first) })
const doneAt = computed(() => kit.times(o.value).done || o.value.createdAt)
const k = computed(() => (o.value ? kit.kind(o.value) : ''))
// the cases that stop a review from being written
const gate = computed(() => {
  const x = o.value
  if (!x || x.reviewed) return null
  if (k.value !== 'done') return { title: '订单完成后才能评价', text: ['refunded', 'cancelled', 'closed'].includes(k.value) ? '这笔订单已关闭或已退款。' : '取餐后就可以来评价了。', image: 'search' }
  if (scene.value === 'expired' || kit.now() > kit.reviewDeadline(x)) return { title: '评价通道已关闭', text: '订单完成后 15 天内可以评价，这笔订单已超过期限。', image: 'network' }
  return null
})
const mode = computed(() => (o.value && o.value.reviewed && o.value.review ? 'read' : gate.value ? 'gate' : 'form'))
const status = computed(() => (guest.value ? 'forbidden' : phase.value !== 'ok' ? phase.value : !o.value || o.value.hidden ? 'empty' : 'ok'))

// ---- the form
const S = reactive({ rating: 0, likes: {}, tags: [], text: '', anon: false, imgs: [], busy: false, err: '', textErr: '', rateErr: '' })
const tagList = (list) => (S.rating && S.rating <= 3 ? list.slice().reverse() : list)
const like = (pid, val) => { if (S.likes[pid] === val) delete S.likes[pid]; else S.likes[pid] = val }
const placeholder = computed(() => (S.rating && S.rating <= 2 ? '哪里不满意？写下来，门店会认真看（至少说一句）' : '说说这顿饭的味道、分量、出餐速度（选填，最多 200 字）'))
const rateBox = ref(null), textBox = ref(null)
const scrollTo = (r) => nextTick(() => { const el = r.value && (r.value.$el || r.value); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: state.reducedMotion ? 'auto' : 'smooth' }) })
async function afterRead(file) {
  for (const f of Array.isArray(file) ? file : [file]) {
    f.status = 'uploading'; f.message = '上传中'
    try { await request(500); f.status = 'done'; f.message = '' } catch (e) { f.status = 'failed'; f.message = '上传失败，请删除后重选' }
  }
}
async function submit() {
  if (S.busy) return
  S.err = ''; S.textErr = ''; S.rateErr = ''
  if (!S.rating) { S.rateErr = '请先给整单打个分'; scrollTo(rateBox); return }
  if (S.rating <= 2 && !S.text.trim() && !S.tags.length) { S.textErr = '打了低分，请选一个标签或写一句原因，帮门店改进'; scrollTo(textBox); return }
  if (S.imgs.some((f) => f.status === 'uploading' || f.status === 'failed')) { S.err = '有图片还没上传好，请等一下或删除后重选'; return }
  S.busy = true
  try { await request(600) } catch (e) { S.busy = false; S.err = e.message + '，评价没有提交。你写的内容还在，检查网络后再点一次'; return }
  if (scene.value === 'submit-fail') { S.busy = false; S.textErr = '评价没有通过审核：内容包含不适宜的文字，请修改后再提交'; scrollTo(textBox); return }
  kit.addReview(o.value, { rating: S.rating, likes: { ...S.likes }, tags: S.tags.slice(), text: S.text.trim(), anon: S.anon, imgs: S.imgs.map((f) => f.content || f.url) })
  S.busy = false
  kit.toast('评价已提交，感谢你的反馈', 'success'); back()
}
</script>

<template>
  <div class="mp-page">
    <MiniState :status="status" :rows="6" empty-text="没有可以评价的订单，已完成的订单才能评价" error-hint="页面没有加载出来，请检查网络后重试" @retry="load">
      <template #empty-action><van-button round @click="back()">回到订单</van-button></template>
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>

      <template v-if="o">
        <van-cell-group inset>
          <van-cell center :title="store.name" :label="kit.when(doneAt) + ' 取餐 · 共 ' + kit.count(o) + ' 件'">
            <template #value><div class="thumbs"><van-image v-for="(i, n) in o.items.slice(0, 3)" :key="n" :src="i.img" :alt="i.name" width="40" height="40" radius="6" fit="cover" /></div></template>
          </van-cell>
        </van-cell-group>

        <!-- already reviewed: read only -->
        <template v-if="mode === 'read'">
          <van-cell-group inset>
            <template #title>我的评价<van-tag type="success" plain class="gap">已评价</van-tag></template>
            <div class="rate"><van-rate :model-value="o.review.rating" readonly :size="32" :gutter="8" /><p class="rate-t">{{ RATE[o.review.rating] }}{{ o.review.anon ? ' · 匿名' : '' }}</p></div>
            <van-cell v-for="i in items" :key="i.pid" center :title="i.name">
              <template #icon><van-image :src="i.img" :alt="i.name" width="40" height="40" radius="6" fit="cover" class="lead" /></template>
              <template #value><van-tag v-if="(o.review.likes || {})[i.pid] === true" type="success" plain>好吃</van-tag><van-tag v-else-if="(o.review.likes || {})[i.pid] === false" plain color="var(--luz-ink-2)">一般</van-tag><span v-else class="muted">未评价</span></template>
            </van-cell>
            <van-cell v-if="o.review.tags && o.review.tags.length"><template #title><div class="tags"><van-tag v-for="t in o.review.tags" :key="t" type="primary" plain>{{ t }}</van-tag></div></template></van-cell>
            <van-cell :title="o.review.text || '（没有文字评价）'" :label="kit.when(o.review.at) + ' 提交，评价提交后不能修改'" />
            <van-cell v-if="o.review.imgs && o.review.imgs.length"><template #title><div class="tags"><van-image v-for="(p, n) in o.review.imgs" :key="n" :src="p" alt="评价图片" width="64" height="64" radius="8" fit="cover" /></div></template></van-cell>
          </van-cell-group>
          <van-action-bar placeholder><van-action-bar-button type="primary" text="返回订单" @click="back()" /></van-action-bar>
        </template>

        <!-- cannot be reviewed -->
        <van-empty v-else-if="mode === 'gate'" :image="gate.image" :description="gate.title">
          <p class="muted tip">{{ gate.text }}</p>
          <van-button round type="primary" @click="back()">返回订单</van-button>
        </van-empty>

        <!-- the form -->
        <template v-else>
          <van-cell-group ref="rateBox" inset title="整单评分">
            <div class="rate">
              <van-rate v-model="S.rating" :size="36" :gutter="8" @change="S.rateErr = ''; S.err = ''" />
              <p class="rate-t" :class="{ muted: !S.rating }">{{ S.rating ? RATE[S.rating] : '点星星打分' }}</p>
              <p v-if="S.rateErr" class="field-err">{{ S.rateErr }}</p>
            </div>
          </van-cell-group>

          <van-cell-group inset title="每个商品怎么样（选填）">
            <van-cell v-for="i in items" :key="i.pid">
              <template #title>
                <div class="pr"><van-image :src="i.img" :alt="i.name" width="48" height="48" radius="8" fit="cover" /><div><b class="nm">{{ i.name }}</b><p class="muted">{{ i.spec || '默认规格' }}</p></div></div>
                <div class="likes">
                  <van-button round icon="good-job-o" :type="S.likes[i.pid] === true ? 'primary' : 'default'" :plain="S.likes[i.pid] !== true" :aria-pressed="S.likes[i.pid] === true" @click="like(i.pid, true)">好吃</van-button>
                  <van-button round :type="S.likes[i.pid] === false ? 'primary' : 'default'" :plain="S.likes[i.pid] !== false" :aria-pressed="S.likes[i.pid] === false" @click="like(i.pid, false)">一般</van-button>
                </div>
              </template>
            </van-cell>
          </van-cell-group>

          <van-cell-group inset title="选几个标签（选填）">
            <van-checkbox-group v-model="S.tags" @change="S.err = ''">
              <van-cell v-for="[g, list] in TAGS" :key="g" :title="g" :border="false">
                <template #label><div class="tagrow"><van-checkbox v-for="t in tagList(list)" :key="t" :name="t" shape="square">{{ t }}</van-checkbox></div></template>
              </van-cell>
            </van-checkbox-group>
          </van-cell-group>

          <van-cell-group ref="textBox" inset title="文字评价">
            <van-field v-model="S.text" type="textarea" rows="4" maxlength="200" show-word-limit :placeholder="placeholder" aria-label="评价内容" :error-message="S.textErr" @input="S.textErr = ''" />
            <van-cell center title="匿名评价" :label="S.anon ? '将显示为“匿名用户”' : '将显示为 ' + state.db.me.name.slice(0, 1) + '**'"><template #right-icon><van-switch v-model="S.anon" size="24" aria-label="匿名评价" /></template></van-cell>
          </van-cell-group>

          <van-cell-group inset :title="'晒图（选填） ' + S.imgs.length + '/3'">
            <div class="up"><van-uploader v-model="S.imgs" :max-count="3" :max-size="5 * 1024 * 1024" accept="image/*" upload-text="添加图片" :after-read="afterRead" @oversize="kit.toast('图片不能超过 5 MB')" /></div>
          </van-cell-group>

          <van-submit-bar placeholder>
            <template #top><van-notice-bar v-if="S.err" class="err" left-icon="warning-o" wrapable :scrollable="false" :text="S.err" /></template>
            <template #button><van-button block round type="primary" :loading="S.busy" loading-text="提交中" @click="submit">提交评价</van-button></template>
          </van-submit-bar>
        </template>
      </template>
    </MiniState>
  </div>
</template>

<style scoped>
b { font-weight: 600; }
.mp-page { --van-rate-icon-full-color: var(--luz-warning); --van-submit-bar-button-width: 100%; }
.thumbs { display: flex; gap: 8px; justify-content: flex-end; }
.gap { margin-left: 8px; }
.rate { display: grid; justify-items: center; gap: 8px; padding: 16px; background: var(--van-background-2); }
.rate-t { margin: 0; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.tip { margin: 0 0 16px; text-align: center; }
.lead { margin-right: 12px; flex: none; }
.nm { font-weight: 600; }
.pr { display: flex; align-items: center; gap: 12px; }
.pr p { margin: 0; }
.likes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.tagrow { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; font-size: var(--t16); }   /* the cell's label slot is 12 px; the options are text to tap, not an annotation */
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.up { padding: 12px 16px; background: var(--van-background-2); }
.field-err { margin: 0; color: var(--luz-danger); }
.err { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-ink); }
</style>
