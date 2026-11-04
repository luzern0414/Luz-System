<script>
// 协议与隐私（二级页，参数 doc=agreement|privacy）：目录 → 正文 → 底部同意与留痕；顶部有滚动阅读进度。同意写进 state.db.legal.consents（版本、同意时间、渠道）。
export const meta = {
  id: 'legal', label: '协议与隐私', title: '协议与隐私', group: '我的', order: 6,
  layout: '主次布局',
  reason: '阅读页的主角是正文：顶部目录可跳转，滚动时有阅读进度；有新版本时先给变更摘要，同意固定在底部并留下同意时间，不同意也不阻断浏览',
  scenes: [{ id: 'version-moved', label: '同意失败：协议刚刚又更新了' }],
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'

const { back } = useNav()
const route = useRoute()
const scene = useScene('legal')
const toast = (message, type) => showToast({ message, type, teleport: '#phone-overlay', duration: 1800 })
const key = route.query.doc === 'agreement' ? 'agreement' : 'privacy'

// ---------- 正文 ----------
const LEGAL = {
  agreement: [
    ['总则', ['欢迎使用“' + B.shop.name + '”小程序（以下简称“本服务”）。你登录并使用本服务，即表示已阅读并同意本协议。', '涉及你权益的重要条款，我们会以加粗或单独弹窗的方式提示，请特别留意。']],
    ['账号与登录', ['你可以使用微信身份登录，首次登录会自动为你建立会员档案。你应妥善保管账号，不得出借、转让或出售。', '发现账号被他人使用时，请立即联系客服，我们会协助冻结账号。']],
    ['点单、支付与取餐', ['订单提交后按页面显示的价格结算。未在 30 分钟内支付的订单会自动关闭，优惠券和库存同步释放。', '到店取餐时请出示取餐号。门店暂停营业或休息期间，可以浏览菜单，但不能下单。']],
    ['会员卡与储值', ['会员卡和储值属于预付费服务，购买前需要你主动勾选《预付卡条款》。储值本金不过期；赠送金按活动规则使用，不能提现、转让或转赠。', '付款后 7 日内且未使用的，可以全额退还；其余按原价扣除已使用部分，并收取页面写明的手续费，赠送部分不折现。']],
    ['优惠券', ['优惠券按券面写明的门槛、适用范围和有效期使用，不兑现、不找零，一笔订单限用一张，不与其他优惠券叠加。', '订单整单全额退款时，未过期的券退回账户；部分退款或已过期的券不退回。']],
    ['退款与售后', ['订单取消或售后退款原路退回，到账时间以支付渠道为准。申请退款后可以在订单详情里查看进度。']],
    ['用户行为规范', ['请勿利用本服务刷单、套取优惠或从事其他违法违规行为。发现异常时，我们可以限制或终止相关服务，并保留追究责任的权利。']],
    ['协议变更与终止', ['协议发生实质变更时，我们会在你下次进入小程序时展示变更摘要并请你重新确认。你不同意的，只能浏览不需要个人信息的公开内容。', '你可以随时在“我的 > 设置 > 账号注销”申请终止本协议。']],
    ['联系我们', ['客服电话 ' + B.shop.phone + '，服务时间 ' + B.shop.hours + '。']],
  ],
  privacy: [
    ['我们收集哪些信息', ['为了让你完成点单和使用会员服务，我们会收集：微信昵称与头像、手机号、订单与支付记录、会员卡与储值记录。', '位置信息只用来显示你与门店的距离，你拒绝授权后其余功能照常可用。']],
    ['我们如何使用', ['这些信息用于处理订单、发放优惠与会员权益、发送你订阅的通知，以及保障账号和交易安全。', '经你同意，我们会根据你的点单偏好做个性化推荐，你可以随时在“设置 > 协议与隐私”里关闭。']],
    ['对外提供与委托处理', ['除支付机构、短信服务商等必须的合作方外，我们不会向第三方提供你的个人信息；向第三方提供前，会单独征得你的同意。']],
    ['保存期限与安全措施', ['我们按业务需要保存你的信息，账号注销后会删除或匿名化。依法需要保留的交易与财务记录，保存期限届满后同样删除。', '我们采用加密传输、访问控制等措施保护你的信息安全。']],
    ['你的权利', ['你可以在“我的 > 个人资料”查阅、更正信息，在“设置”里撤回专项授权，或申请注销账号。', '撤回授权后，我们会立即停止相应的处理，并删除相关数据（包括合作方处理的部分）。']],
    ['未成年人保护', ['我们不主动面向不满 14 周岁的未成年人收集信息；涉及敏感功能时，需要监护人同意。']],
    ['本政策的更新', ['政策发生实质变更时，我们会在你下次进入时展示变更摘要并请你重新确认。']],
    ['联系我们', ['个人信息相关的问题，请拨打 ' + B.shop.phone + ' 联系我们，我们会在 15 个工作日内答复。']],
  ],
}
const sections = LEGAL[key]

// ---------- 演示数据：共用 data.js 里没有协议版本与同意记录，这里补上；重置演示数据后（db.users 换了新数组）再补一次 ----------
function seed() {
  const db = state.db
  const marks = (db.seedOf ??= {})
  if (marks.legal === db.users) return
  const adopt = marks.legal === undefined && db.legal
  marks.legal = db.users
  if (adopt) return
  const upd = (k, fallback) => db.config.pages.find((p) => p.key === k)?.updated || fallback
  db.legal = {
    docs: {
      agreement: { name: '用户协议', version: '2.3', updated: upd('agreement', '2026-08-01') },
      privacy: { name: '隐私政策', version: '3.1', updated: upd('privacy', '2026-08-01'), changes: ['新增“个性化推荐”开关，可随时关闭', '说明订阅消息的数据用途', '补充账号注销后交易记录的保留方式'] },
    },
    consents: { agreement: { version: '2.3', at: '2026-08-02 10:15', channel: '微信小程序' }, privacy: { version: '3.0', at: '2026-07-20 10:15', channel: '微信小程序' } },
    special: [
      { key: 'prepaid', name: '预付卡与储值条款', desc: '购买会员卡、储值充值时使用', on: true, at: '2026-09-12 12:20', effect: '撤回后不能再购买会员卡和储值充值；已有的卡和余额仍可使用，退款按条款办理。' },
      { key: 'personal', name: '个性化推荐', desc: '根据点单偏好推荐菜品和优惠', on: true, at: '2026-08-02 10:15', effect: '撤回后首页和菜单不再按你的偏好推荐，只展示通用内容。' },
      { key: 'location', name: '位置信息', desc: '计算你与门店的距离', on: true, at: '2026-08-02 10:16', effect: '撤回后不再显示距离，需要自己选择门店。' },
    ],
  }
}
seed()

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); seed(); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const lg = computed(() => state.db.legal)
const doc = computed(() => lg.value.docs[key])
const consent = computed(() => lg.value.consents[key])
const pending = computed(() => !consent.value || consent.value.version !== doc.value.version)
const updated = computed(() => state.db.config.pages.find((p) => p.key === key)?.updated || doc.value.updated)

// ---------- 目录与阅读进度（滚动区是外壳的 #screen） ----------
const root = ref(null)
const tocOpen = ref([])
const pct = ref(0)
let scroller = null
let ro = null
function measure() {
  if (!scroller) return
  const max = scroller.scrollHeight - scroller.clientHeight
  pct.value = max > 0 ? Math.min(100, Math.round((scroller.scrollTop / max) * 100)) : 100
}
onMounted(() => {
  scroller = document.getElementById('screen')
  scroller?.addEventListener('scroll', measure, { passive: true })
  if (window.ResizeObserver && root.value) { ro = new ResizeObserver(measure); ro.observe(root.value) }
  nextTick(measure)
})
onBeforeUnmount(() => { scroller?.removeEventListener('scroll', measure); ro?.disconnect() })
function jump(i) { document.getElementById('sec-' + i)?.scrollIntoView({ block: 'start', behavior: state.reducedMotion ? 'auto' : 'smooth' }) }

// ---------- 同意与暂不同意 ----------
const agreeing = ref(false)
const barErr = ref('')
const moved = ref(false)
const nextVersion = (v) => { const [a, b = '0'] = String(v).split('.'); return a + '.' + (Number(b) + 1) }
async function agree() {
  if (agreeing.value) return
  barErr.value = ''; agreeing.value = true
  const d = doc.value
  try {
    let fail
    if (scene.value === 'version-moved' && !moved.value) { moved.value = true; d.version = nextVersion(d.version); fail = new Error('协议刚刚又更新到 ' + d.version + ' 版，页面已为你刷新为新版本') }
    await request(700, { fail })
    lg.value.consents[key] = { version: d.version, at: B.fmt(B.NOW()), channel: '微信小程序' }
    toast('已同意，已记录同意时间', 'success')
  } catch (e) {
    barErr.value = e.message.startsWith('协议刚刚') ? '同意没有成功：' + e.message + '，这次没有记录同意。请阅读更新内容后再点“同意并继续”。' : '同意没有成功：' + e.message + '，这次没有记录同意，请检查网络后再点“同意并继续”。'
  } finally { agreeing.value = false }
}
async function refuse() {
  try {
    await showConfirmDialog({ title: '暂不同意', message: '不同意时，只能浏览菜单和门店等不需要个人信息的内容，下单、会员卡、储值暂时不能使用。你随时可以回来同意。', confirmButtonText: '暂不同意', cancelButtonText: '再看看', teleport: '#phone-overlay' })
  } catch { return }
  lg.value.declined = { ...(lg.value.declined || {}), [key]: { version: doc.value.version, at: B.fmt(B.NOW()) } }
  toast('已记录，你可以继续浏览')
  back()
}

const barTip = computed(() => barErr.value || (pending.value ? '同意后会记录同意时间；不同意也可以继续浏览' : '你已同意 ' + consent.value.version + ' 版 · ' + consent.value.at + ' · ' + consent.value.channel))
const barTone = computed(() => (barErr.value ? 'bad' : pending.value ? 'info' : 'ok'))
const barIcon = computed(() => (barErr.value ? 'warning-o' : pending.value ? 'info-o' : 'passed'))
</script>

<template>
  <div ref="root" class="mp-page lg">
    <MiniState :status="phase" :rows="8" error-text="协议加载失败" @retry="load">
      <div class="strip">
        <van-progress :percentage="pct" :show-pivot="false" stroke-width="4" />
        <span class="muted num">已读 {{ pct }}%</span>
      </div>

      <div class="head">
        <h2>{{ doc.name }}</h2>
        <div class="muted num">版本 {{ doc.version }} · 更新于 {{ updated }}</div>
      </div>

      <van-cell-group v-if="pending && doc.changes" inset title="协议已更新，请阅读并同意">
        <van-cell v-for="c in doc.changes" :key="c" icon="info-o" :title="c" />
      </van-cell-group>

      <van-collapse v-model="tocOpen" :border="false" class="toc">
        <van-collapse-item :title="'目录（共 ' + sections.length + ' 节）'" name="toc">
          <van-cell v-for="(s, i) in sections" :key="i" is-link :title="(i + 1) + '. ' + s[0]" :border="false" @click="jump(i)" />
        </van-collapse-item>
      </van-collapse>

      <article class="mp-card prose">
        <section v-for="(s, i) in sections" :id="'sec-' + i" :key="i">
          <h3>{{ i + 1 }}. {{ s[0] }}</h3>
          <p v-for="(p, j) in s[1]" :key="j">{{ p }}</p>
        </section>
      </article>
    </MiniState>

    <van-submit-bar v-if="phase === 'ok'" class="bar" :class="'tone-' + barTone" :tip="barTip" :tip-icon="barIcon" :button-text="pending ? '同意并继续' : '返回'" button-type="primary" :loading="agreeing" @submit="pending ? agree() : back()">
      <template v-if="pending" #default><van-button plain round class="refuse" @click="refuse">暂不同意</van-button></template>
    </van-submit-bar>
  </div>
</template>

<style scoped>
.lg {
  padding-bottom: 150px;
}
.strip { position: sticky; top: 0; z-index: 2; margin: -12px -12px 0; padding: 8px 16px; display: grid; gap: 4px; background: var(--van-background-2); border-bottom: 1px solid var(--luz-line); }
.head h2 { margin: 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.toc { border-radius: var(--luz-radius-card); overflow: hidden; }
.prose { padding: 4px 16px 16px; }
.prose section { scroll-margin-top: 56px; }
.prose h3 { margin: 16px 0 6px; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.prose p { margin: 0 0 8px; }
.refuse { margin-right: 8px; }
.bar.tone-info { --van-submit-bar-tip-background: var(--luz-info-tint); --van-submit-bar-tip-color: var(--luz-info); }
.bar.tone-ok { --van-submit-bar-tip-background: var(--luz-success-tint); --van-submit-bar-tip-color: var(--luz-success); }
.bar.tone-bad { --van-submit-bar-tip-background: var(--van-background-2); --van-submit-bar-tip-color: var(--luz-danger); }
</style>
