<script>
// 系统配置（主区加右侧窄栏）：运行参数、文案、页面内容、版本信息四个标签页；右侧窄栏是待保存项、最近变更、配置健康检查。
// 运行参数读写 state.db.config.runtime（热生效，无需重启）；文案读写 state.db.config.copy；三份页面文本与版本记录在 state.db.pageText、pageVersions；变更历史在 state.db.configHistory。
import { toRaw } from 'vue'
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { K } from '../../shared/format.js'

export const meta = {
  id: 'settings', label: '系统配置', icon: 'gear', group: '系统', order: 5, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '改配置是“改一点、对比、确认、保存”的连续工作，主区放运行参数、文案、页面内容和版本四个工作区；刚改了什么、还有哪些没保存、配置是否健康是随时要瞄一眼的，放在停留在右侧的窄栏，不打断主区的编辑',
  scenes: [
    { id: 'conflict', label: '保存冲突：别人刚改过同一项' },
    { id: 'new-version', label: '服务端有新版本' },
  ],
}

const dayKey = (back) => K.ymd(K.addDays(K.today(), -back))
const stamp = () => B.fmt(B.NOW())
const todayKey = () => stamp().slice(0, 10)
const num = (v) => Number(v).toLocaleString('zh-CN')

// 每项参数的分组、单位、范围、默认值
const GROUPS = ['订单', '登录', '通知', '功能开关']
const META = {
  'order.unpaid_close_minutes': { group: '订单', unit: '分钟', min: 5, max: 120, def: 30 },
  'order.refund_free_days': { group: '订单', unit: '天', min: 0, max: 30, def: 7, high: true },
  'login.lock_attempts': { group: '登录', unit: '次', min: 3, max: 10, def: 5 },
  'notify.quiet_hours': { group: '通知', def: '22:00–08:00', pattern: /^(未启用|\d{2}:\d{2}–\d{2}:\d{2})$/, format: '写成 22:00–08:00 这样，或者写“未启用”' },
  'feature.coupon': { group: '功能开关', def: true, high: true },
  'feature.wallet': { group: '功能开关', def: true, high: true },
  'feature.card': { group: '功能开关', def: true, high: true },
}
const COPY_META = { 'home.slogan': { max: 20, where: '小程序首页顶部' }, 'order.empty': { max: 24, where: '订单列表为空时' }, 'pay.success': { max: 24, where: '支付成功页' }, 'refund.tip': { max: 40, where: '退款申请页' } }
const BAD_WORDS = ['最好', '第一', '最佳', '国家级', '绝对', '100%']
const DEFAULT_COPY = Object.fromEntries(B.config().copy.map((c) => [c.key, c.value]))
const DOCS = [['agreement', '用户协议'], ['privacy', '隐私政策'], ['card_rule', '会员卡规则']]
const DOC_LIMIT = 20000
const metaOf = (it) => META[it.key] || { group: '其他', def: it.value }
const fmtVal = (m, v) => (typeof v === 'boolean' ? (v ? '开启' : '关闭') : m && m.unit ? v + ' ' + m.unit : String(v))
const short = (t) => { const a = [...String(t)]; return a.length > 14 ? a.slice(0, 14).join('') + '…' : String(t) }
const len = (t) => [...String(t)].length
const docName = (k) => DOCS.find((d) => d[0] === k)[1]

const TEXT = {
  agreement: '一、总则\n欢迎使用示例门店小程序。你点击“同意”并使用本服务，即表示你已阅读并接受本协议。\n二、账号与会员\n你可以用手机号注册成为会员。请保管好账号，不要借给他人使用；因借用产生的损失由你自己承担。\n三、下单与支付\n下单后请在规定时间内完成支付，超时订单会自动关闭。商品以实际出餐为准，图片仅供参考。\n四、会员卡与储值\n会员卡和储值余额只能在本店使用，不能兑换现金。具体规则以“会员卡规则”为准。\n五、售后与退款\n商品有问题可以申请售后，审核通过后原路退回。储值充值在规定期限内可以申请退回。\n六、协议变更\n本协议变更后会在小程序里提示，你继续使用即表示接受变更后的内容。',
  privacy: '一、我们收集哪些信息\n注册和下单时，我们会收集你的手机号、昵称和订单信息，用来提供点餐、取餐和售后服务。\n二、信息怎么使用\n这些信息只用于完成订单、发送与订单有关的提醒、处理售后，不会出售给第三方。\n三、信息怎么保存\n手机号等个人信息加密保存，只有经过授权的工作人员才能查看，每次查看都会留下记录。\n四、你的权利\n你可以随时在“我的”里查看、修改个人信息，也可以申请注销账号，注销后我们会删除或匿名化你的个人信息。\n五、消息提醒\n订阅消息由你主动开启，你可以随时在“消息提醒设置”里关闭。\n六、联系我们\n对个人信息有疑问，可以拨打门店电话 400-000-0000 联系我们。',
  card_rule: '一、会员卡种类\n本店有月卡、十次卡、午餐时段卡三种，价格和有效期以购买页显示为准。\n二、使用方式\n月卡 30 天内每天可用 1 次，当天没用完不累计；十次卡 10 次加赠 1 次，90 天内有效；午餐时段卡只能在 11:00 到 13:30 使用。\n三、冻结与挂失\n月卡可以申请冻结，每张卡最多冻结 7 天；卡丢失请联系门店挂失，补办需要出示购买凭证。\n四、到期与退款\n到期未用完的次数作废；购买后 7 天内且未使用，可以申请全额退款。\n五、规则调整\n门店可以调整会员卡规则，调整只影响之后购买的卡，已购买的卡按购买当时的规则执行。',
}

// 版本说明：和侧栏底部“版本”里的更新记录是同一条线
const REL = [
  { v: '2.0.0', d: '2026-11-03', title: '管理后台改用组件库的真实组件', notes: ['全部页面改用组件库的组件，主题随主题库切换', '表格、分页、对话框的行为在各页保持一致'] },
  { v: '1.9.2', d: '2026-10-19', title: '订单列表与导出', notes: ['订单列表默认显示待处理的订单', '导出带当前筛选范围，文件名写中文标题与范围'] },
  { v: '1.9.0', d: '2026-09-28', title: '履约看板与会员卡扣次', notes: ['新增履约看板', '会员卡支持扣次，剩余次数与扣次记录对得上'] },
  { v: '1.8.0', d: '2026-08-30', title: '会员卡与储值', notes: ['新增月卡、次卡、时段卡', '新增储值充值与赠送规则'] },
]
const NEW_REL = { v: '2.1.0', d: dayKey(-4), title: '即将发布：通知与账号安全', notes: ['通知发送记录支持按场景统计', '账号长期未登录自动提醒', '修复若干界面问题'] }

/** 演示数据：变更历史、页面文本与版本记录；已补过的不再动（重置演示数据后重新补） */
function seedSettings(db) {
  if (toRaw(db._cfgFor) === toRaw(db.config)) return
  const rt = (k) => db.config.runtime.find((x) => x.key === k)
  const ev = (back, t, by, key, bv, av, reason) => { const m = META[key], it = rt(key); return { at: dayKey(back) + ' ' + t, by, kind: 'runtime', key, name: it.name, bv, av, before: fmtVal(m, bv), after: fmtVal(m, av), reason } }
  db.configHistory = [ev(1, '15:20', '周敏', 'feature.card', false, true, '会员卡功能恢复上线'), ev(4, '11:05', '王海燕', 'login.lock_attempts', 3, 5, '前台反映输错两次就锁定，影响交接班'), ev(9, '09:40', '周敏', 'order.unpaid_close_minutes', 20, 30, '支付高峰期订单被误关'), ev(16, '17:12', '王海燕', 'feature.coupon', false, true, '优惠券活动开始'), ev(23, '10:30', '王海燕', 'order.refund_free_days', 3, 7, '按新的退款规则调整')]
  db.configHistory.forEach((x, i) => { x.id = i + 1 })
  db.pageText = { ...TEXT }
  db.pageVersions = {}
  DOCS.forEach(([k], i) => {
    const t = TEXT[k], head = t.split('\n').slice(0, 6).join('\n')
    db.pageVersions[k] = [
      { v: 3, at: db.config.pages[i].updated + ' 10:00', by: i === 2 ? '周敏' : '王海燕', text: t, len: len(t), note: i === 2 ? '补充冻结与挂失的说明' : '调整措辞，没有实质变更' },
      { v: 2, at: dayKey(60 + i * 7) + ' 14:30', by: '王海燕', text: t.replace('不要借给他人使用', '不要借给他人'), len: len(t) - 3, note: '新增“协议变更”一条' },
      { v: 1, at: dayKey(150) + ' 09:00', by: '王海燕', text: head, len: len(head), note: '首次发布' },
    ]
  })
  db.copyHistory = { 'home.slogan': [{ at: dayKey(20) + ' 10:00', by: '周敏', value: '每一餐都认真' }] }
  db._cfgFor = toRaw(db.config)
}
const hashOf = (rt) => { let a = 0x811c9dc5; const s = JSON.stringify(rt.map((x) => [x.key, x.value])); for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619) >>> 0 } return (a.toString(16).padStart(8, '0') + (Math.imul(a, 2654435761) >>> 0).toString(16).padStart(8, '0')).slice(0, 12) }
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { InfoFilled, Refresh, Search } from '@element-plus/icons-vue'
import { setScene, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { usePager } from '../use-pager.js'

const scene = useScene('settings')
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
seedSettings(state.db)

const meName = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
function audit(code, action, target, o = {}) {
  const db = state.db
  db.audit.unshift({ id: Math.max(0, ...db.audit.map((x) => x.id || 0)) + 1, at: stamp(), actor: meName.value, code, action, target, result: o.result || '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16), ...(o.diff ? { diff: o.diff } : {}), ...(o.reason ? { reason: o.reason } : {}) })
}
/** 要等服务器的一步：失败时写明原因与影响，对话框留着，已改的内容保留 */
async function net(ms) {
  try { await request(ms) } catch (e) { throw new Error(e.message + '，操作没有完成，配置没有改动，你的修改还在页面上，请重试') }
}
const rt = computed(() => state.db.config.runtime)
const hist = computed(() => state.db.configHistory)
const addHist = (o) => state.db.configHistory.unshift({ id: Math.max(0, ...state.db.configHistory.map((x) => x.id)) + 1, at: stamp(), by: meName.value, ...o })
const tab = ref('runtime')

// 通用确认框：对象和后果写清楚
const ask = reactive({ open: false, title: '', text: '', danger: false, confirmText: '确定', run: null })
const askOpen = (o) => Object.assign(ask, { open: true, title: '', text: '', danger: false, confirmText: '确定', run: null, ...o })

// ================= 运行参数：先在页面上改，再统一保存
const draft = reactive(Object.fromEntries(rt.value.map((it) => [it.key, it.value])))
const items = (g) => rt.value.filter((it) => metaOf(it).group === g)
function errOf(it) {
  const v = draft[it.key], m = metaOf(it)
  if (it.type === 'number') return v === null || v === undefined || Number.isNaN(v) ? '请填写数字' : ''
  if (it.type === 'text') {
    const s = String(v ?? '').trim()
    if (!s) return '不能为空'
    if (m.pattern && !m.pattern.test(s)) return '格式不对，' + m.format
    if (it.key === 'notify.quiet_hours' && s !== '未启用' && s.split('–')[0] === s.split('–')[1]) return '开始和结束不能是同一时刻'
  }
  return ''
}
const valueOf = (it) => (it.type === 'text' ? String(draft[it.key] ?? '').trim() : draft[it.key])
const changed = (it) => valueOf(it) !== it.value
const changedItems = computed(() => rt.value.filter(changed))
const errItems = computed(() => changedItems.value.filter((it) => errOf(it)))
const noteOf = (it) => { const m = metaOf(it); return changed(it) && !errOf(it) ? '原值 ' + fmtVal(m, it.value) : '默认 ' + fmtVal(m, m.def) + (m.min != null ? ' · 范围 ' + m.min + '–' + m.max : '') }
const canReset = (it) => draft[it.key] !== metaOf(it).def
const resetOne = (it) => { draft[it.key] = metaOf(it).def }
const discard = () => { rt.value.forEach((it) => { draft[it.key] = it.value }) }

const sv = reactive({ open: false, reason: '' })
const high = computed(() => changedItems.value.some((it) => metaOf(it).high))
const openSave = () => Object.assign(sv, { open: true, reason: '' })
async function doSave() {
  const list = changedItems.value.filter((it) => !errOf(it))
  if (!list.length) throw new Error('没有可以保存的修改，请先改正填写有误的项')
  if (high.value && !sv.reason.trim()) throw new Error('请写明修改原因')
  await net(500)
  if (scene.value === 'conflict') {
    // 别人刚改过同一项：这次不保存，先把最新值带回页面，你的修改保留着，由你决定要不要覆盖
    const it = list[0], m = metaOf(it), mine = valueOf(it)
    const theirs = it.type === 'switch' ? mine : it.type === 'number' ? (it.value + 10 > m.max ? it.value - 5 : it.value + 10) : '23:00–07:00'
    addHist({ kind: 'runtime', key: it.key, name: it.name, by: '周敏', bv: it.value, av: theirs, before: fmtVal(m, it.value), after: fmtVal(m, theirs), reason: '同时修改' })
    const before = it.value; it.value = theirs; setScene('settings', null)
    throw new Error(theirs === mine
      ? `保存冲突：“${it.name}”刚刚被周敏也改成了 ${fmtVal(m, theirs)}，和你的修改一样，这一项不用再保存；其他修改还在页面上，请确认后重新保存。`
      : `保存冲突：“${it.name}”刚刚被周敏改成了 ${fmtVal(m, theirs)}，而你是在 ${fmtVal(m, before)} 的基础上改成 ${fmtVal(m, mine)}。为了不覆盖别人的修改，这次没有保存。最新值已经显示在页面上，你的修改还在，确认后可以重新保存。`)
  }
  const reason = sv.reason.trim()
  list.forEach((it) => { const m = metaOf(it), nv = valueOf(it); addHist({ kind: 'runtime', key: it.key, name: it.name, bv: it.value, av: nv, before: fmtVal(m, it.value), after: fmtVal(m, nv), reason }); it.value = nv; draft[it.key] = nv })
  audit('system:config', '修改配置', '系统配置 ' + list.map((x) => x.name.replace(/（.*）/, '')).join('、'), { reason, diff: list.map((it) => { const e = hist.value.find((x) => x.key === it.key); return [it.name, e.before, e.after] }) })
  ElMessage.success(`已保存 ${list.length} 项，已热生效，无需重启`)
}

// 变更历史与回滚
const runtimeHist = computed(() => hist.value.filter((x) => x.kind === 'runtime'))
const pager = usePager('settings')
const histRows = pager.slice(runtimeHist)
function askRollback(x) {
  const it = rt.value.find((k) => k.key === x.key), m = metaOf(it), now = it.value
  if (now === x.bv) return ElMessage.warning(`这一项现在已经是 ${fmtVal(m, now)}，不用回滚`)
  askOpen({
    title: '回滚配置', confirmText: '确认回滚',
    text: `将「${it.name}」从当前的 ${fmtVal(m, now)} 改回 ${x.before}（回到 ${x.at} 这次修改之前）。${now !== x.av ? '注意：这一项在那次修改之后又被改过。' : ''}保存后立即生效。`,
    run: async () => {
      await net(500)
      addHist({ kind: 'runtime', key: it.key, name: it.name, bv: now, av: x.bv, before: fmtVal(m, now), after: x.before, reason: '回滚到 ' + x.at + ' 的修改之前' })
      it.value = x.bv; draft[it.key] = x.bv
      audit('system:config', '回滚配置', '系统配置 ' + it.name, { reason: '回滚到 ' + x.at + ' 的修改之前', diff: [[it.name, fmtVal(m, now), x.before]] })
      ElMessage.success(`已回滚「${it.name}」为 ${x.before}`)
    },
  })
}

// ================= 文案
const copy = computed(() => state.db.config.copy)
const cs = reactive({ only: 'all', q: '' })
const copyMax = (c) => (COPY_META[c.key] || { max: 30 }).max
const modified = (c) => c.value !== DEFAULT_COPY[c.key]
const copyRows = computed(() => copy.value.filter((c) => (cs.only === 'all' || modified(c)) && (!cs.q.trim() || (c.key + c.name + c.value).includes(cs.q.trim()))))
const copyStatus = computed(() => (phase.value !== 'ok' ? phase.value : copyRows.value.length ? 'ok' : 'empty'))
const ed = reactive({ open: false, c: null, text: '' })
const edMax = computed(() => (ed.c ? copyMax(ed.c) : 30))
const edLen = computed(() => len(ed.text.trim()))
const edLast = computed(() => (ed.c ? (state.db.copyHistory[ed.c.key] || [])[0] : null))
const openCopy = (c) => Object.assign(ed, { open: true, c, text: c.value })
async function saveCopy() {
  const c = ed.c, v = ed.text.trim(), max = edMax.value
  if (!v) throw new Error('文案不能为空')
  if (len(v) > max) throw new Error(`超出 ${len(v) - max} 个字，最多 ${max} 个字`)
  const bad = BAD_WORDS.find((w) => v.includes(w)); if (bad) throw new Error(`含有不宜使用的词“${bad}”，请换一种说法`)
  if (v === c.value) throw new Error('文案没有变化')
  await net(400)
  const old = c.value
  const h = state.db.copyHistory; (h[c.key] = h[c.key] || []).unshift({ at: stamp(), by: meName.value, value: old })
  c.value = v; addHist({ kind: 'copy', key: c.key, name: c.name, before: old, after: v, reason: '' })
  audit('system:config', '修改文案', '文案 ' + c.name, { diff: [[c.name, old, v]] })
  ElMessage.success('文案已保存，小程序里立即生效')
}
const askCopyReset = (c) => askOpen({
  title: '恢复默认文案', confirmText: '确认恢复', text: `将「${c.name}」恢复为默认文案“${DEFAULT_COPY[c.key]}”，当前文案“${c.value}”会被替换。`,
  run: async () => {
    await net(400)
    const old = c.value, h = state.db.copyHistory; (h[c.key] = h[c.key] || []).unshift({ at: stamp(), by: meName.value, value: old })
    c.value = DEFAULT_COPY[c.key]; addHist({ kind: 'copy', key: c.key, name: c.name, before: old, after: c.value, reason: '恢复默认' })
    audit('system:config', '恢复默认文案', '文案 ' + c.name, { diff: [[c.name, old, c.value]] }); ElMessage.success('已恢复默认文案')
  },
})

// ================= 页面内容（协议与规则）：每次保存生成新版本，旧版本可回滚
const drafts = reactive({})
const pg = reactive({ key: 'agreement' })
const docDirty = (k) => drafts[k] != null && drafts[k] !== state.db.pageText[k]
const anyDocDirty = computed(() => DOCS.some(([k]) => docDirty(k)))
const docText = computed({ get: () => drafts[pg.key] ?? state.db.pageText[pg.key], set: (v) => { drafts[pg.key] = v } })
const docInfo = computed(() => { const p = state.db.config.pages.find((x) => x.key === pg.key); return `最近更新 ${p.updated} · 当前 v${state.db.pageVersions[pg.key][0].v}` })
const lines = (t) => String(t).split('\n').map((l) => ({ h: /^[一二三四五六七八九十]+、/.test(l), t: l }))
const prev = reactive({ open: false, title: '', text: '' })
const openPrev = (title, text) => Object.assign(prev, { open: true, title, text })
const abandon = () => { delete drafts[pg.key] }

const ps = reactive({ open: false, note: '' })
const psDelta = computed(() => { const d = len(docText.value) - len(state.db.pageText[pg.key]); return `字数 ${len(state.db.pageText[pg.key])} → ${len(docText.value)}（${d >= 0 ? '多 ' : '少 '}${Math.abs(d)} 字）` })
function openSavePage() {
  const text = docText.value
  if (!text.trim()) return ElMessage.warning('内容不能为空')
  if (len(text) > DOC_LIMIT) return ElMessage.warning(`超出 ${num(DOC_LIMIT)} 字的上限，请精简后再保存`)
  if (text === state.db.pageText[pg.key]) return ElMessage.info('没有修改任何内容')
  Object.assign(ps, { open: true, note: '' })
}
function commitDoc(k, text, note, action) {
  const db = state.db, vs = db.pageVersions[k], old = db.pageText[k], p = db.config.pages.find((x) => x.key === k)
  vs.unshift({ v: vs[0].v + 1, at: stamp(), by: meName.value, text, len: len(text), note })
  db.pageText[k] = text; p.updated = todayKey(); delete drafts[k]
  addHist({ kind: 'page', key: k, name: docName(k), before: '字数 ' + len(old), after: '字数 ' + len(text), reason: note })
  audit('system:config', action, '页面内容 ' + docName(k), { reason: note, diff: [['版本', 'v' + vs[1].v, 'v' + vs[0].v], ['字数', len(old), len(text)]] })
}
async function savePage() {
  if (!ps.note.trim()) throw new Error('请写一句变更摘要')
  await net(500)
  commitDoc(pg.key, docText.value, ps.note.trim(), '修改页面内容')
  ElMessage.success('已保存，当前为 v' + state.db.pageVersions[pg.key][0].v)
}
const vr = reactive({ open: false })
const versions = computed(() => state.db.pageVersions[pg.key])
const askDocRollback = (x) => askOpen({
  title: '回滚页面内容', confirmText: '确认回滚',
  text: `将「${docName(pg.key)}」回滚到 v${x.v}，会生成新版本 v${versions.value[0].v + 1}，立即生效，当前内容保留在版本记录里。${docDirty(pg.key) ? '注意：当前有未保存的修改，回滚会把它们覆盖掉。' : ''}`,
  run: async () => { await net(500); commitDoc(pg.key, x.text, '回滚到 v' + x.v, '回滚页面内容'); ElMessage.success('已回滚，当前为 v' + versions.value[0].v) },
})

// ================= 版本信息
const hasNew = ref(scene.value === 'new-version')
const showNew = ref(hasNew.value)
watch(scene, (s) => { if (s === 'new-version') { hasNew.value = true; showNew.value = true } })
const rels = computed(() => (showNew.value ? [{ ...NEW_REL, fresh: hasNew.value }, ...REL] : REL))
const lastCheck = ref('今天 ' + stamp().slice(11))
const checking = ref(false)
const configHash = computed(() => hashOf(rt.value))
const activeRel = ref([hasNew.value ? NEW_REL.v : REL[0].v])
async function checkVersion() {
  checking.value = true
  try { await request(900) } catch { checking.value = false; return ElMessage.error('网络不太稳定，没能检查成功，请稍后再试') }
  checking.value = false; lastCheck.value = '今天 ' + stamp().slice(11)
  hasNew.value ? ElMessage.info('发现新版本 v' + NEW_REL.v) : ElMessage.success('已经是最新版本 v' + state.version.front)
}
function useNew() {
  if (changedItems.value.length || anyDocDirty.value) return ElMessage.warning('还有未保存的修改，先保存再刷新')
  state.version.front = NEW_REL.v; hasNew.value = false; setScene('settings', null)
  ElMessage.success('已更新到 v' + NEW_REL.v + '（演示不会真的刷新页面）')
}

// ================= 右侧窄栏：待保存、最近变更、健康检查
const recent = computed(() => hist.value.slice(0, 5))
const pendingCount = computed(() => changedItems.value.length + DOCS.filter(([k]) => docDirty(k)).length)
const health = computed(() => {
  const v = (k) => rt.value.find((x) => x.key === k).value, out = []
  out.push(v('order.unpaid_close_minutes') < 15 ? ['warning', '未支付自动关闭只有 ' + v('order.unpaid_close_minutes') + ' 分钟，顾客支付慢一点就会被误关'] : ['success', '未支付自动关闭 ' + v('order.unpaid_close_minutes') + ' 分钟，在合理范围'])
  out.push(v('order.refund_free_days') > 15 ? ['warning', '免审核退款期限 ' + v('order.refund_free_days') + ' 天偏长，资金风险较高'] : ['success', '免审核退款期限 ' + v('order.refund_free_days') + ' 天，在建议范围'])
  out.push(v('login.lock_attempts') > 8 ? ['warning', '登录失败锁定次数 ' + v('login.lock_attempts') + ' 次偏多，口令容易被试出来'] : ['success', '登录失败 ' + v('login.lock_attempts') + ' 次锁定，在建议范围'])
  out.push(v('notify.quiet_hours') === '未启用' ? ['warning', '没有设置静默时段，营销消息夜间也会打扰会员'] : ['success', '静默时段 ' + v('notify.quiet_hours')])
  const off = ['feature.coupon', 'feature.wallet', 'feature.card'].filter((k) => !v(k)).map((k) => rt.value.find((x) => x.key === k).name.replace('功能', ''))
  out.push(off.length ? ['warning', off.join('、') + ' 已关闭，小程序里对应入口不显示'] : ['success', '优惠券、储值、会员卡功能都已开启'])
  out.push(['success', '支付结果回调正常（示意）'], ['warning', '短信余额约 1,240 条，按近期用量约够 6 天（示意）'])
  return out
})
const checkedAt = ref(stamp().slice(11))
const rechecking = ref(false)
async function recheck() {
  rechecking.value = true
  try { await request(700) } catch { rechecking.value = false; return ElMessage.error('网络不太稳定，没能检查成功，请稍后再试') }
  rechecking.value = false; checkedAt.value = stamp().slice(11)
  ElMessage.success(`检查完成，${health.value.filter((x) => x[0] === 'warning').length} 项需要留意`)
}
const gotoPending = () => { tab.value = changedItems.value.length ? 'runtime' : 'page'; if (!changedItems.value.length) { const k = DOCS.find(([d]) => docDirty(d)); if (k) pg.key = k[0] } }

// 有没保存的修改时离开页面，先问一声
onBeforeRouteLeave(() => {
  if (!changedItems.value.length && !anyDocDirty.value) return true
  return ElMessageBox.confirm('运行参数或页面文本还有修改没有保存，现在离开会丢掉它们。', '离开前确认', { confirmButtonText: '放弃修改并离开', cancelButtonText: '留在这里', type: 'warning' }).then(() => true).catch(() => false)
})
</script>

<template>
  <div class="lz-page">
    <LzState v-if="state.role !== 'A'" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="grow muted">改运行设置、文案和协议，保存后热生效，无需重启。</span>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <el-alert v-if="hasNew" type="info" show-icon :closable="false" :title="`有新版本 v${NEW_REL.v}，刷新后使用；不会丢掉你正在填写的内容。可以到“版本信息”里查看更新说明。`">
        <el-button @click="tab = 'version'">查看更新说明</el-button>
      </el-alert>

      <div class="lz-main-rail">
        <el-card shadow="never" class="lz-card" aria-label="系统配置分区">
          <el-tabs v-model="tab">
            <el-tab-pane label="运行参数" name="runtime" />
            <el-tab-pane name="copy"><template #label>文案<span class="tab-count num">{{ copy.length }}</span></template></el-tab-pane>
            <el-tab-pane label="页面内容" name="page" />
            <el-tab-pane label="版本信息" name="version" />
          </el-tabs>

          <LzState :status="phase" error-hint="配置没有加载出来，请检查网络后重试" :rows="8" @retry="load">
            <!-- 运行参数 -->
            <div v-if="tab === 'runtime'" class="stack">
              <el-card v-if="changedItems.length" shadow="never" class="lz-card pending" aria-label="待保存的修改">
                <div class="card-head">
                  <span class="row"><el-icon><InfoFilled /></el-icon><span class="b">待保存：改了 {{ changedItems.length }} 项<template v-if="errItems.length">，其中 {{ errItems.length }} 项填写有误</template></span></span>
                  <span class="row"><el-button text @click="discard">放弃修改</el-button><el-button type="primary" :disabled="!!errItems.length" @click="openSave">保存修改</el-button></span>
                </div>
                <div class="diff-list">
                  <div v-for="it in changedItems" :key="it.key" class="diff-row">
                    <span class="grow"><span class="b">{{ it.name }}</span><span v-if="errOf(it)" class="err"> · 填写有误：{{ errOf(it) }}</span></span>
                    <span class="muted num">{{ fmtVal(metaOf(it), it.value) }}</span><span>→</span>
                    <span class="b num">{{ errOf(it) ? String(draft[it.key]) + '（未生效）' : fmtVal(metaOf(it), valueOf(it)) }}</span>
                  </div>
                </div>
              </el-card>

              <el-card v-for="g in GROUPS" :key="g" shadow="never" class="lz-card" :aria-label="g">
                <template #header><span class="b">{{ g }}</span></template>
                <div v-for="it in items(g)" :key="it.key" class="set">
                  <div class="set-main">
                    <div class="row"><span class="b">{{ it.name }}</span><el-tag v-if="changed(it)" :type="errOf(it) ? 'danger' : 'warning'" effect="light">{{ errOf(it) ? '填写有误' : '已修改' }}</el-tag></div>
                    <div v-if="it.hint" class="muted">{{ it.hint }}</div>
                    <div class="muted">{{ noteOf(it) }}</div>
                    <div v-if="errOf(it)" class="err" role="alert">{{ errOf(it) }}</div>
                  </div>
                  <div class="set-ctl">
                    <template v-if="it.type === 'switch'"><el-switch v-model="draft[it.key]" :aria-label="it.name" /><span>{{ draft[it.key] ? '开启' : '关闭' }}</span></template>
                    <template v-else-if="it.type === 'number'"><el-input-number v-model="draft[it.key]" :controls="false" :min="metaOf(it).min" :max="metaOf(it).max" :step="1" step-strictly :aria-label="it.name" /><span class="muted">{{ metaOf(it).unit }}</span></template>
                    <el-input v-else v-model="draft[it.key]" style="width: 200px" :aria-label="it.name" />
                    <el-button v-if="canReset(it)" link type="primary" :aria-label="'恢复默认：' + it.name" @click="resetOne(it)">恢复默认</el-button>
                  </div>
                </div>
              </el-card>

              <section aria-label="变更历史">
                <h3 class="band-title">变更历史<span class="muted">“回滚”会把这一项改回这次修改之前的值</span></h3>
                <LzState :status="runtimeHist.length ? 'ok' : 'empty'" empty-title="还没有变更历史">
                  <el-table :data="histRows" size="large" row-key="id" empty-text="还没有变更历史">
                    <el-table-column label="时间" width="118" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
                    <el-table-column label="操作人" width="84" align="center" prop="by" />
                    <el-table-column label="配置项" min-width="130" prop="name" />
                    <el-table-column label="改前" width="90" align="center" prop="before" />
                    <el-table-column label="改后" width="90" align="center"><template #default="{ row }"><span class="b">{{ row.after }}</span></template></el-table-column>
                    <el-table-column label="原因" min-width="110" show-overflow-tooltip prop="reason" />
                    <el-table-column label="操作" width="80" align="center" fixed="right"><template #default="{ row }"><el-button link type="primary" :aria-label="'回滚到这次修改之前：' + row.name" @click="askRollback(row)">回滚</el-button></template></el-table-column>
                  </el-table>
                  <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="runtimeHist.length" />
                </LzState>
              </section>
            </div>

            <!-- 文案 -->
            <div v-else-if="tab === 'copy'">
              <div class="lz-toolbar filters">
                <el-radio-group v-model="cs.only" aria-label="筛选"><el-radio-button value="all">全部</el-radio-button><el-radio-button value="mod">已修改</el-radio-button></el-radio-group>
                <span class="grow muted">小程序里每处可见的文字都有一个文案键，改完保存即生效，不用发版。</span>
                <el-input v-model="cs.q" clearable placeholder="文案键、位置或内容" :prefix-icon="Search" style="width: 220px" aria-label="文案键、位置或内容" />
              </div>
              <LzState :status="copyStatus" empty-title="没有符合条件的文案">
                <el-table :data="copyRows" size="large" row-key="key" empty-text="没有符合条件的文案">
                  <el-table-column label="文案键" width="140" align="center" prop="key" />
                  <el-table-column label="位置" min-width="150"><template #default="{ row }"><span class="b">{{ row.name }}</span><div class="muted">{{ (COPY_META[row.key] || {}).where }}</div></template></el-table-column>
                  <el-table-column label="当前文案" min-width="220" show-overflow-tooltip prop="value" />
                  <el-table-column label="字数（字）" width="110" align="right"><template #default="{ row }"><span class="num">{{ len(row.value) }} / {{ copyMax(row) }}</span></template></el-table-column>
                  <el-table-column label="状态" width="90" align="center"><template #default="{ row }"><el-tag :type="modified(row) ? 'warning' : 'info'" effect="light">{{ modified(row) ? '已修改' : '默认' }}</el-tag></template></el-table-column>
                  <el-table-column label="操作" width="150" align="center" fixed="right">
                    <template #default="{ row }">
                      <el-button link type="primary" :aria-label="'编辑文案：' + row.name" @click="openCopy(row)">编辑</el-button>
                      <el-button v-if="modified(row)" link type="primary" :aria-label="'恢复默认文案：' + row.name" @click="askCopyReset(row)">恢复默认</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </LzState>
            </div>

            <!-- 页面内容 -->
            <div v-else-if="tab === 'page'" class="stack">
              <div class="lz-toolbar">
                <el-radio-group v-model="pg.key" aria-label="选择文本"><el-radio-button v-for="[k, n] in DOCS" :key="k" :value="k">{{ n }}<span v-if="docDirty(k)" class="dirty">（未保存）</span></el-radio-button></el-radio-group>
                <el-tag v-if="docDirty(pg.key)" type="warning" effect="light">有未保存的修改</el-tag>
                <span class="grow" /><span class="muted">{{ docInfo }}</span>
                <el-button @click="openPrev('预览 · ' + docName(pg.key), docText)">预览</el-button>
                <el-button @click="vr.open = true">版本记录</el-button>
              </div>
              <el-input v-model="docText" type="textarea" :rows="16" aria-label="页面文本" />
              <div class="lz-toolbar">
                <span class="muted num" :class="{ bad: len(docText) > DOC_LIMIT }">已写 {{ num(len(docText)) }} 字 / 上限 {{ num(DOC_LIMIT) }} 字</span>
                <span class="grow" />
                <el-button :disabled="!docDirty(pg.key)" @click="abandon">放弃修改</el-button>
                <el-button type="primary" :disabled="!docDirty(pg.key)" @click="openSavePage">保存</el-button>
              </div>
            </div>

            <!-- 版本信息 -->
            <div v-else class="stack">
              <el-card shadow="never" class="lz-card">
                <template #header><div class="card-head"><span class="b">当前版本</span><span class="row"><span class="muted">上次检查：{{ lastCheck }}</span><el-button :loading="checking" @click="checkVersion">{{ checking ? '检查中' : '检查新版本' }}</el-button></span></div></template>
                <el-descriptions :column="2" border>
                  <el-descriptions-item label="前端版本">v{{ state.version.front }}</el-descriptions-item>
                  <el-descriptions-item label="后端版本">v{{ state.version.back }}</el-descriptions-item>
                  <el-descriptions-item label="配置版本" :span="2"><span class="num">{{ configHash }}</span><span class="muted">（运行参数内容的摘要，改一项就会变）</span></el-descriptions-item>
                  <el-descriptions-item label="运行环境">测试环境</el-descriptions-item>
                  <el-descriptions-item label="时区">北京时间（UTC+8）</el-descriptions-item>
                </el-descriptions>
                <div v-if="hasNew" class="new-row"><el-tag type="primary" effect="light">新版本 v{{ NEW_REL.v }}</el-tag><span class="grow muted">{{ NEW_REL.title }}。刷新后使用，不会打断你正在填写的内容。</span><el-button type="primary" @click="useNew">刷新后使用</el-button></div>
              </el-card>
              <el-card shadow="never" class="lz-card">
                <template #header><div class="card-head"><span class="b">更新说明</span><span class="muted">点标题展开</span></div></template>
                <el-collapse v-model="activeRel">
                  <el-collapse-item v-for="r in rels" :key="r.v" :name="r.v">
                    <template #title><span class="b">v{{ r.v }}</span><span class="muted rel-date num">{{ r.d }}</span><span>{{ r.title }}</span><el-tag v-if="r.fresh" type="primary" effect="light" class="rel-tag">新版本</el-tag></template>
                    <ul class="plain"><li v-for="n in r.notes" :key="n">{{ n }}</li></ul>
                  </el-collapse-item>
                </el-collapse>
              </el-card>
            </div>
          </LzState>
        </el-card>

        <!-- 右侧窄栏 -->
        <aside class="rail" aria-label="配置提醒">
          <el-card shadow="never" class="lz-card">
            <template #header><div class="card-head"><span class="b">待保存</span><el-tag v-if="pendingCount" type="warning" effect="light">{{ pendingCount }} 处</el-tag><el-tag v-else type="success" effect="light">没有待保存</el-tag></div></template>
            <template v-if="pendingCount">
              <div class="stack tight">
                <div v-for="it in changedItems" :key="it.key" class="diff-row"><span class="grow">{{ it.name }}</span><span class="muted num">{{ errOf(it) ? '填写有误' : fmtVal(metaOf(it), it.value) + ' → ' + fmtVal(metaOf(it), valueOf(it)) }}</span></div>
                <div v-for="[k, n] in DOCS.filter(([d]) => docDirty(d))" :key="k" class="diff-row"><span class="grow">{{ n }}</span><span class="muted">文本已改</span></div>
                <div><el-button @click="gotoPending">去保存</el-button></div>
              </div>
            </template>
            <p v-else class="muted">运行参数和页面文本都已保存。</p>
          </el-card>

          <el-card shadow="never" class="lz-card">
            <template #header><span class="b">最近变更</span></template>
            <el-timeline v-if="recent.length" class="recent">
              <el-timeline-item v-for="x in recent" :key="x.id" :timestamp="x.at.slice(0, 10) + ' · ' + x.by" placement="top"><span class="b">{{ x.name }}</span><div class="muted">{{ short(x.before) }} → {{ short(x.after) }}</div></el-timeline-item>
            </el-timeline>
            <p v-else class="muted">还没有变更</p>
          </el-card>

          <el-card shadow="never" class="lz-card">
            <template #header><div class="card-head"><span class="b">配置健康检查</span><el-button :loading="rechecking" @click="recheck">{{ rechecking ? '检查中' : '重新检查' }}</el-button></div></template>
            <div class="stack tight">
              <div v-for="[k, t] in health" :key="t" class="diff-row"><el-tag :type="k" effect="light">{{ k === 'success' ? '正常' : '留意' }}</el-tag><span class="grow">{{ t }}</span></div>
            </div>
            <p class="muted">示意检查，{{ checkedAt }} 更新</p>
          </el-card>
        </aside>
      </div>

      <!-- 保存运行参数：改前改后与影响，影响资金与功能的必填原因 -->
      <LzDialog v-model="sv.open" :title="`确认保存 ${changedItems.filter((it) => !errOf(it)).length} 项修改`" width="520px" confirm-text="确认保存" :confirm-disabled="high && !sv.reason.trim()" :on-confirm="doSave">
        <div class="diff-list">
          <div v-for="it in changedItems.filter((x) => !errOf(x))" :key="it.key" class="diff-row"><span class="grow"><span class="b">{{ it.name }}</span></span><span class="muted num">{{ fmtVal(metaOf(it), it.value) }}</span><span>→</span><span class="b num">{{ fmtVal(metaOf(it), valueOf(it)) }}</span></div>
        </div>
        <el-alert type="info" show-icon :closable="false" title="保存后立即生效（热生效），无需重启，只影响之后发生的业务。" class="mt" />
        <el-form label-position="top" class="mt" @submit.prevent><el-form-item :label="'修改原因' + (high ? '（必填）' : '（选填）')"><el-input v-model="sv.reason" type="textarea" :rows="2" maxlength="200" show-word-limit :placeholder="high ? '涉及退款期限或功能开关，请写明原因' : '写明原因方便以后查'" /></el-form-item></el-form>
      </LzDialog>

      <!-- 编辑文案：左边改，右边看小程序里的样子 -->
      <LzDialog v-model="ed.open" :title="'编辑文案 · ' + (ed.c?.name || '')" width="760px" confirm-text="保存" :on-confirm="saveCopy">
        <div v-if="ed.c" class="split">
          <div class="stack tight">
            <div class="muted">文案键：{{ ed.c.key }}，默认文案：<span class="b">{{ DEFAULT_COPY[ed.c.key] }}</span></div>
            <el-input v-model="ed.text" type="textarea" :rows="3" aria-label="文案内容" />
            <div class="row"><span class="muted grow">“{{ ed.c.name }}”，最多 {{ edMax }} 个字，只能写业务文字，不要写夸大的词（最好、第一等）</span><span class="num" :class="{ bad: edLen > edMax }">{{ edLen }} / {{ edMax }}</span></div>
            <div class="row"><el-button @click="ed.text = DEFAULT_COPY[ed.c.key]">恢复默认文案</el-button><el-button v-if="edLast" :title="'上一版：' + edLast.value" @click="ed.text = edLast.value">恢复上一版</el-button></div>
          </div>
          <div class="stack tight">
            <span class="b">预览</span>
            <div class="phone" aria-label="小程序预览">
              <div class="phone-bar muted">{{ (COPY_META[ed.c.key] || {}).where || '小程序里' }}</div>
              <el-card v-if="ed.c.key === 'home.slogan'" shadow="never"><span class="b">示例门店</span><p class="big">{{ ed.text.trim() || '（还没有内容）' }}</p></el-card>
              <el-empty v-else-if="ed.c.key === 'order.empty'" :description="ed.text.trim() || '（还没有内容）'" :image-size="64"><el-button type="primary">去点餐</el-button></el-empty>
              <el-result v-else-if="ed.c.key === 'pay.success'" icon="success" title="支付成功" :sub-title="ed.text.trim() || '（还没有内容）'" />
              <el-alert v-else type="info" show-icon :closable="false" title="申请退款" :description="ed.text.trim() || '（还没有内容）'" />
            </div>
          </div>
        </div>
      </LzDialog>

      <!-- 保存页面内容：新版本加变更摘要 -->
      <LzDialog v-model="ps.open" :title="'保存「' + docName(pg.key) + '」'" width="460px" confirm-text="确认保存" :confirm-disabled="!ps.note.trim()" :on-confirm="savePage">
        <p>将生成新版本 v{{ state.db.pageVersions[pg.key][0].v + 1 }}，{{ psDelta }}。保存后小程序里立即显示新内容，旧版本留在版本记录里。</p>
        <el-form label-position="top" @submit.prevent><el-form-item label="变更摘要（必填）"><el-input v-model="ps.note" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="例如：补充退款期限的说明" /></el-form-item></el-form>
      </LzDialog>

      <!-- 版本记录 -->
      <LzDialog v-model="vr.open" :title="docName(pg.key) + ' · 版本记录'" width="760px" no-footer>
        <p class="muted">已发布的版本不能修改，只能回滚到某个旧版本（生成新版本）。</p>
        <el-table :data="versions" size="large" row-key="v">
          <el-table-column label="版本" width="110" align="center"><template #default="{ row }"><span class="b">v{{ row.v }}</span><el-tag v-if="row === versions[0]" type="success" effect="light" class="rel-tag">当前</el-tag></template></el-table-column>
          <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
          <el-table-column label="修改人" width="90" align="center" prop="by" />
          <el-table-column label="字数（字）" width="100" align="right"><template #default="{ row }"><span class="num">{{ row.len }}</span></template></el-table-column>
          <el-table-column label="变更摘要" min-width="160" show-overflow-tooltip prop="note" />
          <el-table-column label="操作" width="150" align="center">
            <template #default="{ row }"><el-button link type="primary" @click="openPrev(docName(pg.key) + ' · v' + row.v, row.text)">查看</el-button><el-button v-if="row !== versions[0]" link type="primary" @click="askDocRollback(row)">回滚到此版</el-button></template>
          </el-table-column>
        </el-table>
      </LzDialog>

      <!-- 预览页面文本 -->
      <LzDialog v-model="prev.open" :title="prev.title" width="720px" no-footer>
        <div class="doc"><template v-for="(l, i) in lines(prev.text)" :key="i"><h3 v-if="l.h">{{ l.t }}</h3><p v-else>{{ l.t }}</p></template></div>
      </LzDialog>

      <LzDialog v-model="ask.open" :title="ask.title" width="460px" :danger="ask.danger" :confirm-text="ask.confirmText" :on-confirm="ask.run"><p>{{ ask.text }}</p></LzDialog>
    </template>
  </div>
</template>

<style scoped>
.b { font-weight: 600; }
.tab-count { margin-left: 6px; color: inherit; font-weight: 400; }
.filters { margin-bottom: 12px; }
.rail { display: grid; gap: 16px; align-content: start; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.stack { grid-template-columns: minmax(0, 1fr); }
.stack.tight { gap: 8px; }
.pending { background: var(--luz-warning-tint); }
.diff-list { display: grid; gap: 8px; margin-top: 12px; }
.diff-row { display: flex; align-items: center; gap: 8px; }
.set { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--luz-line); }
.set:last-child { border-bottom: 0; }
.set-main { display: grid; gap: 2px; min-width: 0; }
.set-ctl { display: flex; align-items: center; gap: 8px; flex: none; }
@media (max-width: 700px) { .set { align-items: flex-start; flex-direction: column; } }
.err { color: var(--luz-danger); }
.bad { color: var(--luz-danger); }
.band-title { display: flex; align-items: baseline; gap: 12px; margin: 8px 0 12px; font-size: 16px; font-weight: 600; }
.new-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.rel-date { margin: 0 12px; }
.rel-tag { margin-left: 8px; }
.plain { margin: 0; padding-left: 20px; color: var(--luz-ink-2); }
.recent { padding-left: 4px; }
.mt { margin-top: 12px; }
.split { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 760px) { .split { grid-template-columns: minmax(0, 1fr); } }
.phone { border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); background: var(--luz-canvas); padding: 12px; display: grid; gap: 8px; }
.phone .big { margin: 8px 0 0; font-size: 18px; font-weight: 600; }
.doc h3 { margin: 16px 0 4px; font-size: 15px; font-weight: 600; }
.doc p { margin: 0 0 4px; }
</style>
