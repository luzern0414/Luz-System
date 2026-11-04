<script>
// 意见反馈（二级页）：“提交反馈”是主角，“我的反馈”是配角页签；类型、描述（300 字）、图片（3 张）、联系方式；重复提交保护。写进 state.db.feedbacks。
export const meta = {
  id: 'feedback', label: '意见反馈', title: '意见反馈', group: '我的', order: 5,
  layout: '主次布局',
  reason: '反馈页只有一件主事：说清楚问题。类型、描述、图片、联系方式依次排开，提交固定在底部；已提交的反馈退到“我的反馈”页签，状态与回复一目了然',
  scenes: [
    { id: 'dup', label: '重复提交：刚刚提交过相同内容' },
    { id: 'upload-fail', label: '图片上传失败' },
    { id: 'limit', label: '今天提交次数已达上限' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K } from '../../shared/format.js'
import { useNav } from '../nav.js'

const { go } = useNav()
const scene = useScene('feedback')
const toast = (message, type) => showToast({ message, type, teleport: '#phone-overlay', duration: 1800 })

const todayStr = () => K.ymd(K.today())
const addD = (s, n) => K.ymd(K.addDays(new Date(s + 'T00:00:00'), n))
const DAILY_LIMIT = 5
const DUP_TEXT = '外卖包装有点漏汤，希望改进一下打包方式'

// ---------- 演示数据：共用 data.js 里没有反馈记录，这里补三条；重置演示数据后（db.users 换了新数组）再补一次 ----------
function seed() {
  const db = state.db
  const marks = (db.seedOf ??= {})
  if (marks.feedbacks === db.users) return
  const adopt = marks.feedbacks === undefined && db.feedbacks
  marks.feedbacks = db.users
  if (adopt) return
  const t = todayStr(), at = (n, hm) => addD(t, n) + ' ' + hm
  db.feedbacks = [
    { id: 3, type: '建议', text: '希望菜单里能按口味筛选，比如不吃辣的一眼就能看到。', imgs: 0, contact: '', at: at(-1, '20:12'), status: 'PENDING' },
    { id: 2, type: '问题', text: '昨天中午用月卡点单时提示“今天已使用”，但我当天只用了一次。', imgs: 2, contact: B.maskPhone(db.me.phone), at: at(-4, '12:40'), status: 'DOING', note: '客服已联系门店，正在核对当日核销记录。' },
    { id: 1, type: '投诉', text: '取餐时打包袋有破损，汤洒了一些。', imgs: 1, contact: '', at: at(-12, '13:05'), status: 'REPLIED', reply: '非常抱歉给你带来不好的体验。我们已向门店核实，并补发了一张满 30 减 3 的优惠券到你的账户；打包问题已同步给出餐团队改进。', replyAt: at(-11, '09:20') },
  ]
}
seed()

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); seed(); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const status = computed(() => (state.role === 'guest' ? 'forbidden' : phase.value))

// ---------- 表单 ----------
const tab = ref('new')
const TYPES = ['问题', '建议', '投诉']
const HINT = { 问题: '请描述遇到的问题、发生的时间和所在页面', 建议: '说说你希望怎么改，越具体越好', 投诉: '请写明发生的门店、时间和经过，我们会尽快核实' }
const form = reactive({ type: '问题', text: '', contact: '' })
const files = ref([])
const err = reactive({ text: '', contact: '', img: '' })
const bar = reactive({ text: '', tone: '' })           // 底部栏上方的提示：warn 或 bad
const submitting = ref(false)
const last = ref(null)                                  // 最近一次提交，用来拦重复
const flash = ref(0)
const mine = computed(() => state.db.feedbacks.slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)))
const todayCount = computed(() => state.db.feedbacks.filter((f) => f.at.slice(0, 10) === todayStr()).length)
const limited = computed(() => scene.value === 'limit' || todayCount.value >= DAILY_LIMIT)
const limitText = '今天提交的反馈已达 ' + DAILY_LIMIT + ' 条上限，请明天再试；紧急问题请拨打 ' + B.shop.phone
watch(() => form.text, () => { err.text = ''; bar.text = '' })
watch(() => form.contact, () => { err.contact = '' })

// 场景：重复提交先把上次的内容填好，提交就会被拦；图片上传失败先放一张失败的图
watch(scene, (s) => {
  if (s === 'dup') { if (!form.text) form.text = DUP_TEXT; last.value = { text: form.text.trim(), at: Date.now() - 20000 } }
  if (s === 'upload-fail' && !files.value.length) {
    files.value = [{ url: state.db.products[0]?.img, isImage: true, status: 'failed', message: '上传失败' }]
    err.img = '图片没有上传成功，没有保存。点缩略图右上角的叉删除后重新添加，也可以先不带图片提交。'
  }
}, { immediate: true })

async function afterRead(f) {
  const list = Array.isArray(f) ? f : [f]
  err.img = ''
  for (const it of list) { it.status = 'uploading'; it.message = '上传中' }
  try {
    await request(600, { fail: scene.value === 'upload-fail' ? new Error('图片没有上传成功') : undefined })
    list.forEach((it) => { it.status = 'done'; it.message = '' })
  } catch (e) {
    list.forEach((it) => { it.status = 'failed'; it.message = '上传失败' })
    err.img = e.message + '，没有保存。点缩略图右上角的叉删除后重新添加，也可以先不带图片提交。'
  }
}
const onOversize = () => { err.img = '图片太大了，请选择 5 MB 以内的图片' }
const onDelete = () => { err.img = files.value.some((x) => x.status === 'failed') ? err.img : '' }

async function submit() {
  if (submitting.value) return
  bar.text = ''; err.text = ''; err.contact = ''
  const text = form.text.trim(), contact = form.contact.trim()
  let bad = false
  if (text.length < 10) { err.text = text ? '再多写几个字（至少 10 个字），方便我们定位问题' : '请填写问题描述'; bad = true }
  if (contact && !/^1[3-9]\d{9}$/.test(contact) && !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(contact)) { err.contact = '请输入正确的 11 位手机号或邮箱'; bad = true }
  if (files.value.some((x) => x.status === 'uploading')) { err.img = '图片还在上传，请稍等一下再提交'; bad = true }
  else if (files.value.some((x) => x.status === 'failed')) { err.img = '有图片没有上传成功，请删除失败的图片，或重新添加后再提交'; bad = true }
  if (bad) return
  if (last.value && last.value.text === text && Date.now() - last.value.at < 60000) {
    bar.tone = 'warn'; bar.text = '刚刚已经提交过相同的内容（' + Math.max(1, Math.round((Date.now() - last.value.at) / 1000)) + ' 秒前），请不要重复提交；如需补充，请修改内容后再提交'
    return
  }
  submitting.value = true
  try {
    await request(900)
    const id = state.db.feedbacks.reduce((m, x) => Math.max(m, x.id), 0) + 1
    state.db.feedbacks.unshift({ id, type: form.type, text, imgs: files.value.length, contact: contact ? (/^1/.test(contact) ? B.maskPhone(contact) : contact) : '', at: B.fmt(B.NOW()), status: 'PENDING' })
    last.value = { text, at: Date.now() }; flash.value = id
    Object.assign(form, { text: '', contact: '' }); files.value = []; err.img = ''
    tab.value = 'mine'
    toast('已提交，我们会尽快处理', 'success')
  } catch (e) {
    bar.tone = 'bad'; bar.text = '提交没有成功：' + e.message + '，你填写的内容还在，可以再试一次'
  } finally { submitting.value = false }
}

// ---------- 我的反馈 ----------
const ST = { PENDING: ['待处理', 'warning'], DOING: ['处理中', 'primary'], REPLIED: ['已回复', 'success'] }
const openReply = ref([])
const setReply = (id, v) => { openReply.value = v.length ? [...openReply.value.filter((k) => k !== id), id] : openReply.value.filter((k) => k !== id) }
const metaOf = (f) => [f.imgs ? f.imgs + ' 张图片' : '', f.contact ? '联系方式 ' + f.contact : ''].filter(Boolean).join(' · ')
watch(tab, () => { bar.text = '' })

const tipText = computed(() => (limited.value ? limitText : bar.text))
const tipTone = computed(() => (limited.value ? 'warn' : bar.tone))
</script>

<template>
  <div class="mp-page fb">
    <MiniState :status="status" :rows="5" error-text="意见反馈加载失败" @retry="load">
      <template #forbidden-action><van-button type="primary" round size="small" @click="go('login')">去登录</van-button></template>

      <van-tabs v-model:active="tab" :swipeable="false" class="top" aria-label="反馈">
        <van-tab name="new" title="提交反馈" />
        <van-tab name="mine" :title="'我的反馈 ' + mine.length" />
      </van-tabs>

      <template v-if="tab === 'new'">
        <van-cell-group inset>
          <van-field label="反馈类型" class="fld">
            <template #input>
              <van-radio-group v-model="form.type" direction="horizontal" aria-label="反馈类型">
                <van-radio v-for="t in TYPES" :key="t" :name="t">{{ t }}</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field v-model="form.text" type="textarea" rows="5" maxlength="300" show-word-limit label="描述" label-align="top" :placeholder="HINT[form.type]" :error-message="err.text" />
          <van-field label="图片（选填，最多 3 张）" label-align="top" :error-message="err.img">
            <template #input>
              <van-uploader v-model="files" :max-count="3" :max-size="5 * 1024 * 1024" accept="image/*" preview-size="88" :after-read="afterRead" @oversize="onOversize" @delete="onDelete" />
            </template>
          </van-field>
          <van-field v-model="form.contact" class="fld" label="联系方式" placeholder="手机号或邮箱，选填" clearable autocomplete="off" :error-message="err.contact" />
        </van-cell-group>
        <div class="muted hint">联系方式仅用于回复你的反馈，不会用于营销</div>
      </template>

      <template v-else>
        <MiniState v-if="!mine.length" status="empty" empty-text="还没有提交过反馈，遇到问题或有建议，都可以告诉我们">
          <template #empty-action><van-button round type="primary" size="small" @click="tab = 'new'">去提交</van-button></template>
        </MiniState>
        <article v-for="f in mine" :key="f.id" class="mp-card item" :class="{ fresh: f.id === flash }">
          <div class="item-head">
            <van-tag plain type="primary">{{ f.type }}</van-tag>
            <van-tag :type="(ST[f.status] || ST.PENDING)[1]">{{ (ST[f.status] || ST.PENDING)[0] }}</van-tag>
            <span class="grow" />
            <span class="muted num">{{ f.at }}</span>
          </div>
          <p class="item-text">{{ f.text }}</p>
          <div v-if="metaOf(f)" class="muted">{{ metaOf(f) }}</div>
          <div v-if="!f.reply && f.note" class="muted">{{ f.note }}</div>
          <van-collapse v-if="f.reply" :model-value="openReply.includes(f.id) ? [f.id] : []" :border="false" @update:model-value="(v) => setReply(f.id, v)">
            <van-collapse-item :title="openReply.includes(f.id) ? '收起回复' : '查看回复'" :name="f.id">
              <div class="reply"><div class="b">官方回复</div><p>{{ f.reply }}</p><div class="muted num">{{ f.replyAt }}</div></div>
            </van-collapse-item>
          </van-collapse>
        </article>
      </template>
    </MiniState>

    <van-submit-bar v-if="status === 'ok' && tab === 'new'" class="bar" :class="'tone-' + tipTone" :tip="tipText" tip-icon="warning-o">
      <template #button>
        <van-button block round type="primary" :loading="submitting" :disabled="limited" @click="submit">{{ limited ? '今日已达上限' : '提交反馈' }}</van-button>
      </template>
    </van-submit-bar>
  </div>
</template>

<style scoped>
.fb {
  padding-bottom: 130px;
}
.top { border-radius: var(--luz-radius-card); overflow: hidden; }
.fld { --van-cell-line-height: 40px; }
.hint { padding: 0 4px; }
.bar { --van-submit-bar-tip-background: var(--van-background-2); --van-submit-bar-tip-color: var(--luz-danger); }
.bar.tone-warn { --van-submit-bar-tip-color: var(--luz-warning); }
.item { display: grid; gap: 6px; }
.item.fresh { border: 1px solid var(--luz-action); }
.item-head { display: flex; align-items: center; gap: 6px; }
.item-text { margin: 0; font-weight: 600; }
.b { font-weight: 600; }
.reply p { margin: 4px 0; }
</style>
