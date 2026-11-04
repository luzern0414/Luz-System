<script>
// 通知：主区加右侧窄栏。主区是模板、发送记录、订阅额度三个工作区；今日失败率、待重试数、最近失败原因放在右边停着不动的窄栏里。
// 读写 state.db.templates，以及本页补充的发送记录 sendLogs 与订阅额度 subQuota；静默时段和系统配置里的“消息静默时段”是同一项。
export const meta = {
  id: 'notify', label: '通知', icon: 'bell', group: '系统', order: 1, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '运营在这里每天做的是维护模板和盯发送结果，所以主区放模板、发送记录、订阅额度三个工作区；今日失败率、待重试数、最近失败原因要随时瞄一眼，放进停留在右边的窄栏，滚动长列表时它不会跑掉',
  scenes: [
    { id: 'nodata', label: '还没有任何发送记录' },
    { id: 'channel-down', label: '短信通道异常：测试发送与重发失败' },
    { id: 'high-fail', label: '失败率偏高：今天微信没有响应的情况变多' },
    { id: 'no-quota', label: '订阅额度全部用完' },
  ],
}
</script>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { ArrowDown, Clock, Download, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const scene = useScene('notify')
const allowed = computed(() => state.role === 'A')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// ---- channels, variables, the content check
const CHANNELS = ['订阅消息', '短信', '站内信']
const CH = { 订阅消息: { limit: 60, kw: 20, tone: 'primary' }, 短信: { limit: 70, hard: 201, tone: 'warning' }, 站内信: { limit: 200, tone: 'success' } }
const VARS = [
  { k: '订单号', sample: 'A27-10086', max: 32, type: 'code' }, { k: '取餐号', sample: 'A27', max: 6, type: 'code' }, { k: '金额', sample: '¥18.00', max: 12, type: 'amount' }, { k: '余额', sample: '¥86.50', max: 12, type: 'amount' },
  { k: '卡名', sample: '月卡', max: 20, type: 'thing' }, { k: '日期', sample: '11-20', max: 10, type: 'date' }, { k: '验证码', sample: '482915', max: 6, type: 'code' }, { k: '活动名', sample: '周三会员日', max: 20, type: 'thing' },
  { k: '会员名', sample: '李哲', max: 10, type: 'thing' }, { k: '门店名', sample: '示例门店', max: 20, type: 'thing' }, { k: '商品名', sample: '招牌牛腩饭', max: 40, type: 'thing' },
]
const VRE = /\{\{([^{}]*)\}\}/g
const findVar = (k) => VARS.find((v) => v.k === k.trim())
const renderSample = (tpl, who) => tpl.replace(VRE, (m, k) => { const v = findVar(k); return v ? (v.k === '会员名' && who ? who : v.sample) : m })
function check(tpl, channel) {                                   // errors block saving; warns do not; est is the length with every variable at its longest
  const errors = [], warns = [], used = [], c = CH[channel]
  ;(tpl.match(VRE) || []).forEach((m) => { const v = findVar(m.slice(2, -2)); if (v && !used.includes(v)) used.push(v) })
  const est = [...tpl.replace(VRE, '')].length + (tpl.match(VRE) || []).reduce((n, m) => { const v = findVar(m.slice(2, -2)); return n + (v ? v.max : [...m].length) }, 0)
  if (!tpl.trim()) { errors.push('请填写内容'); return { errors, warns, est: 0 } }
  if (/[{}]/.test(tpl.replace(VRE, ''))) errors.push('大括号不成对，变量要写成 {{订单号}} 这样，可以直接点下面的按钮插入')
  ;(tpl.match(VRE) || []).forEach((m) => { if (!findVar(m.slice(2, -2))) errors.push(`变量「${m.slice(2, -2).trim()}」不存在，请从下面的按钮里选`) })
  if (channel === '订阅消息') {
    used.filter((v) => v.type === 'thing' && v.max > c.kw).forEach((v) => errors.push(`变量「${v.k}」最长 ${v.max} 字，超过订阅消息单个关键词 ${c.kw} 字的上限，请换变量或改用站内信、短信`))
    if (est > c.limit) errors.push(`按变量最长取值估算有 ${est} 字，超过订阅消息 ${c.limit} 字的上限`)
  } else if (channel === '短信') {
    if (est > c.hard) errors.push(`按变量最长取值估算有 ${est} 字，短信最多 ${c.hard} 字`)
    else if (est > c.limit) warns.push(`约 ${est} 字，超过 ${c.limit} 字会拆成 ${Math.ceil(est / 67)} 条短信计费`)
  } else if (est > c.limit) errors.push(`按变量最长取值估算有 ${est} 字，超过站内信 ${c.limit} 字的上限`)
  return { errors, warns, est }
}
const RS = {
  订阅消息: { temp: ['微信暂时没有响应，已超时', '微信服务繁忙，请稍后重试'], perm: ['订阅额度已用完', '用户拒收订阅消息', '关键词内容不合规'] },
  短信: { temp: ['短信通道繁忙', '运营商没有及时回应'], perm: ['手机号为空号或已停机', '用户已退订营销短信', '短信内容含屏蔽词'] },
  站内信: { temp: ['消息中心写入超时'], perm: ['会员已注销'] },
}
const REMEDY = {
  '订阅额度已用完': '等会员在小程序里再次订阅后，下次触发同类消息时会自动发出。',
  '用户拒收订阅消息': '会员已在微信里拒收这类消息，请改用站内信或短信通知。',
  '关键词内容不合规': '消息里有关键词的内容超出长度或格式，请检查模板，之后由新的业务事件触发。',
  '手机号为空号或已停机': '请会员在小程序里更新手机号。',
  '用户已退订营销短信': '按规定不能再给这位会员发营销短信。',
  '短信内容含屏蔽词': '请修改模板里的敏感词，保存后由新的业务事件触发。',
  '会员已注销': '这位会员已经注销，无需再发。',
}
const STATUS = { OK: ['success', '成功'], FAIL: ['danger', '失败'], RETRY: ['warning', '重试中'] }

// ---- demo data: 14 days of send logs and the members' subscription quota
const today = K.ymd(B.NOW())
const now = B.fmt(B.NOW())
const pad = K.pad
const dayKey = (n) => K.ymd(K.addDays(new Date(today + 'T00:00:00'), -n))
const md = (s) => s.slice(5)
const addMin = (s, m) => { const d = new Date(s.replace(' ', 'T') + ':00'); d.setMinutes(d.getMinutes() + m); return K.ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }
const audit = (code, action, target) => state.db.audit.unshift({ id: Math.max(0, ...state.db.audit.map((a) => a.id)) + 1, at: now, actor: '王海燕', code, action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
function quotaFor(t, users) { const rq = B.rng(900 + t.id), q = {}, zeroP = 0.1 + (t.id % 3) * 0.17; users.forEach((u) => { const x = rq(); q[u.id] = x < zeroP ? 0 : x < zeroP + 0.2 ? 1 + Math.floor(rq() * 2) : 3 + Math.floor(rq() * 5) }); return q }
function ensure() {
  const d = state.db
  d._luzSeed ||= {}
  if (toRaw(d._luzSeed.notify) === toRaw(d.users)) return
  const r = B.rng(77), onTpls = d.templates.filter((t) => t.status === 'ON'), logs = []
  const pick = (a) => a[Math.floor(r() * a.length)]
  for (let n = 13; n >= 0; n--) {
    const cnt = n === 0 ? 36 : 20 + Math.floor(r() * 14)
    for (let i = 0; i < cnt; i++) {
      const t = pick(onTpls), u = pick(d.users)
      let at = dayKey(n) + ' ' + pad(n === 0 ? 8 + Math.floor(r() * 2.5) : 8 + Math.floor(r() * 14)) + ':' + pad(Math.floor(r() * 60))
      if (at > now) at = now
      const roll = r(), forced = n === 0 ? { 5: 'T', 14: 'P', 27: 'T', 9: 'R', 21: 'R' }[i] : null
      let status = 'OK', permanent = false, reason = '', tries = 0
      if (forced === 'T' || forced === 'P' || (n > 0 && roll < 0.055)) { status = 'FAIL'; permanent = forced ? forced === 'P' : n > 3 ? r() < 0.75 : r() < 0.5; reason = pick(RS[t.channel][permanent ? 'perm' : 'temp']); tries = permanent ? 1 : 5 }
      else if (forced === 'R') { status = 'RETRY'; reason = pick(RS[t.channel].temp); tries = 1 + Math.floor(r() * 3) }
      const attempts = []
      if (status === 'OK') attempts.push({ at, result: '成功', note: '首次投递成功' })
      else if (permanent) attempts.push({ at, result: '失败', note: reason + '，属于永久失败，不再重试' })
      else {
        const back = [0, 1, 5, 30, 120]
        for (let k = 0; k < tries; k++) { const t2 = addMin(at, back[k]); if (t2 <= now) attempts.push({ at: t2, result: '失败', note: reason + (k ? `，第 ${k} 次自动重试` : '') }) }
        if (status === 'FAIL') attempts.push({ at: addMin(at, 150), result: '失败', note: '自动重试 5 次仍失败，等待人工重发' })
      }
      logs.push({ at, userId: u.id, userName: u.name, phone: maskPhone(u.phone), tplId: t.id, scene: t.scene, channel: t.channel, status, reason, permanent, tries, content: renderSample(t.content, u.name).replace('A27-10086', 'A' + (10 + Math.floor(r() * 80)) + '-' + (10000 + Math.floor(r() * 89999))), attempts })
    }
  }
  logs.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((l, i) => { l.id = i + 1; l.msgNo = 'M' + (20260000 + (i + 1) * 37) })
  d.sendLogs = logs.reverse()
  d.subQuota = Object.fromEntries(d.templates.filter((t) => t.channel === '订阅消息').map((t) => [t.id, quotaFor(t, d.users)]))
  d._luzSeed.notify = d.users; d._luzSeed.highFail = false
}
ensure()
watch(() => state.db.users, ensure)
// the high-failure scene turns eleven of today's delivered subscription messages into WeChat timeouts, once
watch(scene, (s) => {
  const d = state.db
  if (s !== 'high-fail' || d._luzSeed.highFail) return
  d._luzSeed.highFail = true
  d.sendLogs.filter((l) => l.at.startsWith(today) && l.status === 'OK' && l.channel === '订阅消息' && !l.test).slice(0, 11).forEach((l, i) => {
    l.status = i % 3 === 2 ? 'RETRY' : 'FAIL'; l.reason = '微信暂时没有响应，已超时'; l.permanent = false; l.tries = l.status === 'RETRY' ? 2 : 5
    l.attempts = [{ at: l.at, result: '失败', note: '微信暂时没有响应，已超时' }]
  })
}, { immediate: true })

const logsAll = computed(() => (scene.value === 'nodata' ? [] : state.db.sendLogs))
const quotaOf = (t) => state.db.subQuota[t.id] || quotaFor(t, state.db.users)
const qv = (t, u) => (scene.value === 'no-quota' ? 0 : quotaOf(t)[u.id] ?? 0)
const quietRow = computed(() => state.db.config.runtime.find((x) => x.key === 'notify.quiet_hours'))
const tab = ref('tpl')
const RAIL_BODY = { display: 'grid', gap: '10px' }

// ---- the narrow rail on the right
const real = computed(() => logsAll.value.filter((l) => !l.test))
const todayLogs = computed(() => real.value.filter((l) => l.at.startsWith(today)))
const failToday = computed(() => todayLogs.value.filter((l) => l.status === 'FAIL').length)
const retryToday = computed(() => todayLogs.value.filter((l) => l.status === 'RETRY').length)
const rate = computed(() => (todayLogs.value.length ? (failToday.value / todayLogs.value.length) * 100 : 0))
const high = computed(() => rate.value > 10)
const pendingManual = computed(() => real.value.filter((l) => l.status === 'FAIL' && !l.permanent).length)
const pendingAuto = computed(() => real.value.filter((l) => l.status === 'RETRY').length)
const days14 = Array.from({ length: 14 }, (_, i) => dayKey(13 - i))
const daily = computed(() => days14.map((k) => real.value.filter((l) => l.at.startsWith(k)).length))
const topReasons = computed(() => {
  const m = {}
  real.value.filter((l) => (l.status === 'FAIL' || l.status === 'RETRY') && l.at >= dayKey(2)).forEach((l) => { const x = (m[l.reason] ||= { n: 0, last: '', perm: l.permanent }); x.n++; if (l.at > x.last) x.last = l.at })
  return Object.entries(m).sort((a, b) => b[1].n - a[1].n).slice(0, 4)
})

// ---- templates
const tplFilter = reactive({ status: 'ON', channel: '', q: '' })
const tplBase = computed(() => state.db.templates.filter((t) => (!tplFilter.channel || t.channel === tplFilter.channel) && (!tplFilter.q.trim() || (t.scene + t.content).includes(tplFilter.q.trim()))))
const tplRows = computed(() => tplBase.value.filter((t) => tplFilter.status === 'ALL' || (tplFilter.status === 'ON') === (t.status === 'ON')))
const tplCount = (s) => tplBase.value.filter((t) => s === 'ALL' || (s === 'ON') === (t.status === 'ON')).length
const tplRef = ref(null)
async function beforeSwitch(t) {
  try {
    if (t.status === 'ON') await ElMessageBox.confirm(`停用后「${t.scene}」不再发送，已排队的消息会在发送前再检查一次，历史记录保留。`, '停用 ' + t.scene, { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' })
    await request(300)
    return true
  } catch (e) { if (e instanceof Error) ElMessage.error(e.message + '，状态没有改变'); return false }
}
function switched(t, on) {
  t.status = on ? 'ON' : 'OFF'
  audit('system:notify', on ? '启用通知场景' : '停用通知场景', '通知模板 ' + t.scene)
  ElMessage.success(t.scene + (on ? ' 已启用' : ' 已停用'))
}
async function deleteTpl(t) {
  try { await ElMessageBox.confirm(`删除场景「${t.scene}」后将不再发送该通知，已发出的历史记录保留。`, '删除场景', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }) } catch { return }
  try {
    await request(400)
    state.db.templates.splice(state.db.templates.indexOf(t), 1)
    audit('system:notify', '删除通知场景', '通知模板 ' + t.scene); ElMessage.success(`已删除场景「${t.scene}」`)
  } catch (e) { ElMessage.error(e.message + '，场景没有删除') }
}
const onMore = (cmd, t) => ({ copy: () => askTpl({ ...t, id: null, scene: t.scene + '（副本）', sent: 0, failed: 0, status: 'OFF' }, true), del: () => deleteTpl(t) })[cmd]()

// edit and create: variable buttons, length checks, a preview
const te = reactive({ open: false, t: null, asNew: false, scene: '', channel: '订阅消息', content: '', on: true })
const taRef = ref(null)
const tc = computed(() => check(te.content, te.channel))
const askTpl = (t, asNew = false) => Object.assign(te, { open: true, t: asNew ? null : t, asNew, scene: t ? t.scene : '', channel: t ? t.channel : '订阅消息', content: t ? t.content : '', on: t ? t.status === 'ON' : true })
const counter = computed(() => `模板 ${[...te.content].length} 字，按变量最长取值约 ${tc.value.est} 字（${te.channel}建议不超过 ${CH[te.channel].limit} 字）`)
const previewBody = computed(() => renderSample(te.content || '（内容还是空的）'))
const previewVars = computed(() => [...new Set(te.content.match(VRE) || [])].filter((m) => findVar(m.slice(2, -2))).map((m) => m.slice(2, -2) + '＝' + findVar(m.slice(2, -2)).sample).join('，'))
function insertVar(v) {
  const el = taRef.value?.textarea, s = el?.selectionStart ?? te.content.length, e = el?.selectionEnd ?? s, ins = `{{${v.k}}}`
  te.content = te.content.slice(0, s) + ins + te.content.slice(e)
  nextTick(() => { el?.focus(); el?.setSelectionRange(s + ins.length, s + ins.length) })
}
async function saveTpl() {
  const name = te.scene.trim()
  if (name.length < 2) throw new Error('场景名称至少 2 个字')
  if (state.db.templates.some((x) => x !== te.t && x.scene === name)) throw new Error(`已经有叫「${name}」的场景，换一个名字`)
  if (tc.value.errors.length) throw new Error(tc.value.errors[0])
  await request(450)
  const body = { scene: name, channel: te.channel, content: te.content.trim(), status: te.on ? 'ON' : 'OFF' }
  let saved = te.t
  if (saved) Object.assign(saved, body)
  else { saved = { id: Math.max(0, ...state.db.templates.map((x) => x.id)) + 1, sent: 0, failed: 0, ...body }; state.db.templates.push(saved) }
  if (saved.channel === '订阅消息' && !state.db.subQuota[saved.id]) state.db.subQuota[saved.id] = quotaFor(saved, state.db.users)
  audit('system:notify', te.t ? '修改通知模板' : '新建通知场景', '通知模板 ' + name)
  Object.assign(tplFilter, { status: 'ALL', channel: '', q: '' })
  ElMessage.success(te.t ? `已保存「${name}」` : `已新建场景「${name}」`)
}

// test send: a phone number or a member; the numbers ending 9999 and a closed channel simulate a failure
const ts = reactive({ open: false, t: null, mode: 'phone', phone: '', uid: null })
const testUsers = computed(() => state.db.users.filter((u) => u.status === 'ENABLED').slice(0, 20))
const askTest = (t) => Object.assign(ts, { open: true, t, mode: 'phone', phone: '', uid: testUsers.value[0].id })
async function doTest() {
  const t = ts.t
  let u = null, ph = ''
  if (ts.mode === 'phone') {
    ph = ts.phone.trim()
    if (!/^1[3-9]\d{9}$/.test(ph)) throw new Error('请填写 11 位手机号')
    u = state.db.users.find((x) => x.phone === ph) || null
  } else { u = state.db.users.find((x) => x.id === ts.uid); ph = u.phone }
  await request(700)
  let why = ''
  if (t.status !== 'ON') why = '这个场景已停用，请先启用再测试'
  else if (scene.value === 'channel-down' && t.channel === '短信') why = '短信通道暂不可用（服务商返回繁忙），请稍后再试'
  else if (ph.endsWith('9999')) why = '这个号码是空号或已停机'
  else if (t.channel !== '短信' && !u) why = `这个手机号不是会员，${t.channel}只能发给会员`
  else if (t.channel === '订阅消息' && qv(t, u) === 0) why = '这位会员对这类消息的订阅额度已用完，无法发送'
  state.db.sendLogs.unshift({ id: Math.max(0, ...state.db.sendLogs.map((l) => l.id)) + 1, at: now, userId: u ? u.id : 0, userName: (u ? u.name : '非会员') + '（测试）', phone: maskPhone(ph), tplId: t.id, scene: t.scene, channel: t.channel, status: why ? 'FAIL' : 'OK', reason: why ? '测试发送失败：' + why : '', permanent: !!why, tries: why ? 1 : 0, test: true, msgNo: 'T' + Date.now().toString().slice(-8), content: renderSample(t.content, u && u.name), attempts: [{ at: now, result: why ? '失败' : '成功', note: why || '测试发送成功' }] })
  audit('system:notify', '测试发送通知', `通知模板 ${t.scene} → ${maskPhone(ph)}`)
  if (why) throw new Error('发送失败：' + why + '。输入的内容都还在，改正后可以再发一次')
  ElMessage.success('测试消息已发给 ' + maskPhone(ph))
}

// quiet hours: the same item as 系统配置 › 消息静默时段
const qh = reactive({ open: false, on: true, from: '22:00', to: '08:00' })
const timeOpts = Array.from({ length: 48 }, (_, i) => pad(Math.floor(i / 2)) + ':' + (i % 2 ? '30' : '00'))
function askQuiet() {
  const cur = quietRow.value.value, on = cur !== '未启用', parts = on && cur.includes('–') ? cur.split('–') : ['22:00', '08:00']
  Object.assign(qh, { open: true, on, from: parts[0], to: parts[1] })
}
async function saveQuiet() {
  if (qh.on && qh.from === qh.to) throw new Error('开始和结束不能是同一时刻')
  await request(400)
  const next = qh.on ? qh.from + '–' + qh.to : '未启用', row = quietRow.value
  if (next !== row.value) { const old = row.value; row.value = next; audit('system:config', `修改静默时段：${old} → ${next}`, '系统配置 消息静默时段'); ElMessage.success('静默时段已改为 ' + next) }
}

// ---- send logs
const lf = reactive({ status: 'FAIL', scene: '', channel: '', range: 7, q: '' })
const inRange = (l) => l.at >= dayKey(lf.range - 1) + ' 00:00'
const logBase = computed(() => logsAll.value.filter((l) => inRange(l) && (!lf.scene || l.scene === lf.scene) && (!lf.channel || l.channel === lf.channel) && (!lf.q.trim() || (l.userName + l.phone + l.msgNo).includes(lf.q.trim()))))
const logRows = computed(() => logBase.value.filter((l) => lf.status === 'ALL' || l.status === lf.status))
const logCount = (s) => (s === 'ALL' ? logBase.value.length : logBase.value.filter((l) => l.status === s).length)
const LOG_TABS = [['FAIL', '失败'], ['RETRY', '重试中'], ['OK', '成功'], ['ALL', '全部']]
const logPager = usePager('notify-logs')
const logPage = logPager.slice(logRows)
watch(() => ({ ...lf }), () => logPager.reset())
const hasReason = computed(() => logPage.value.some((l) => l.status !== 'OK'))
const logDirty = computed(() => lf.status !== 'FAIL' || lf.scene || lf.channel || lf.range !== 7 || lf.q)
const resetLogFilter = () => Object.assign(lf, { status: 'FAIL', scene: '', channel: '', range: 7, q: '' })
const sceneNames = computed(() => [...new Set(state.db.templates.map((t) => t.scene))])
const logStatus = computed(() => (phase.value !== 'ok' ? phase.value : logRows.value.length ? 'ok' : 'empty'))
const logRef = ref(null)
const picked = ref([])
const canRetry = (l) => l.status === 'FAIL' && !l.permanent
const rangeLabel = computed(() => ({ 1: '今天', 3: '近 3 天', 7: '近 7 天', 14: '近 14 天' })[lf.range])
function gotoFailures() { tab.value = 'logs'; Object.assign(lf, { status: 'FAIL', scene: '', channel: '', q: '', range: 14 }) }

const retryResult = (l) => (l.id * 37) % 11 >= 3
function applyRetry(l) {
  const smsDown = scene.value === 'channel-down' && l.channel === '短信', ok = retryResult(l) && !smsDown
  if (ok) { l.status = 'OK'; l.reason = ''; l.tries = 0; l.attempts.push({ at: now, result: '成功', note: '人工重发，发送成功' }) }
  else { if (smsDown) l.reason = '短信通道暂不可用'; l.attempts.push({ at: now, result: '失败', note: '人工重发仍失败：' + l.reason }) }
  return ok
}
const explain = reactive({ open: false, l: null })
const busyLog = ref(null)
async function retryOne(l) {
  if (l.permanent) { Object.assign(explain, { open: true, l }); return }
  busyLog.value = l.id
  try {
    await request(600)
    const ok = applyRetry(l)
    audit('notify:retry', '重发通知', `${l.scene} ${l.msgNo}`)
    if (ok) ElMessage.success(`已重发，消息 ${l.msgNo} 发送成功`); else ElMessage.error('重发失败：' + l.reason + '，消息仍在失败列表里，可以稍后再试')
  } catch (e) { ElMessage.error(e.message + '，消息没有重发，请稍后再试') } finally { busyLog.value = null }
}
async function batchRetry() {
  const can = picked.value.filter(canRetry)
  if (!can.length) return
  try { await ElMessageBox.confirm(`将重发 ${can.length} 条失败的消息。永久失败的消息重发也不会成功，不在可选范围内。`, '批量重发', { confirmButtonText: '确认重发', cancelButtonText: '取消' }) } catch { return }
  try {
    await request(900)
    const good = can.filter((l) => applyRetry(l)).length
    audit('notify:retry', '批量重发通知', `共 ${can.length} 条，成功 ${good} 条`)
    logRef.value?.clearSelection()
    ElMessage[good === can.length ? 'success' : 'warning'](`已重发 ${can.length} 条：成功 ${good} 条，失败 ${can.length - good} 条`)
  } catch (e) { ElMessage.error(e.message + '，没有重发，选择的消息还在') }
}
const ld = reactive({ open: false, l: null, tab: 'info' })
const openLog = (l) => Object.assign(ld, { open: true, l, tab: 'info' })
const exp = reactive({ open: false })
const expName = computed(() => `通知发送记录_${rangeLabel.value}` + (lf.status === 'ALL' ? '' : '（' + LOG_TABS.find((x) => x[0] === lf.status)[1] + '）'))
async function doExport() {
  await request(700)
  ElMessage.success(`已生成「${expName.value}」，共 ${logRows.value.length} 条`)
}

// ---- subscription quota
const quotaStat = computed(() => {
  const tpls = state.db.templates.filter((t) => t.channel === '订阅消息'), users = state.db.users.filter((u) => u.status === 'ENABLED')
  return tpls.map((t) => { const vals = users.map((u) => qv(t, u)); return { t, total: users.length, sum: vals.reduce((a, b) => a + b, 0), ok: vals.filter((v) => v >= 3).length, low: vals.filter((v) => v >= 1 && v <= 2).length, zero: vals.filter((v) => v === 0).length } })
})
const allZero = computed(() => quotaStat.value.length > 0 && quotaStat.value.every((x) => x.zero === x.total))
const worst = computed(() => quotaStat.value.slice().sort((a, b) => b.zero / b.total - a.zero / a.total)[0])
const quotaTone = (x) => { const f = x.zero / x.total; return f >= 0.4 ? ['danger', '额度告急'] : f >= 0.2 ? ['warning', '建议引导订阅'] : ['success', '额度充足'] }
const lowDlg = reactive({ open: false, x: null })
const lowRows = computed(() => (lowDlg.x ? state.db.users.filter((u) => u.status === 'ENABLED' && qv(lowDlg.x.t, u) <= 2).sort((a, b) => qv(lowDlg.x.t, a) - qv(lowDlg.x.t, b)) : []))
</script>

<template>
  <div class="lz-page page">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="muted">维护模板，盯发送结果和订阅额度</span>
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="askTpl(null)">新建场景</el-button>
      </div>
      <el-alert v-if="scene === 'channel-down'" type="error" show-icon :closable="false" title="短信通道异常" description="短信类消息暂时发不出去，会先进入自动重试；紧急场景请改用订阅消息或站内信。测试发送与重发短信会失败，通道恢复后再试。" />
      <el-alert v-else-if="scene === 'high-fail'" type="warning" show-icon :closable="false" title="今天订阅消息的失败率偏高" description="今天微信暂时没有响应的情况明显增多，系统在自动重试，无需人工处理；仍失败的在“发送记录”里可以重发。" />

      <div class="lz-main-rail">
        <div class="main">
          <el-card shadow="never" class="lz-card" aria-label="通知工作区">
            <el-tabs v-model="tab">
              <el-tab-pane name="tpl">
                <template #label>模板<span class="tab-count num">{{ state.db.templates.length }}</span></template>
              </el-tab-pane>
              <el-tab-pane name="logs">
                <template #label>发送记录<span class="tab-count num">{{ logsAll.length }}</span></template>
              </el-tab-pane>
              <el-tab-pane name="quota" label="订阅额度" />
            </el-tabs>

            <LzState :status="phase" :rows="8" error-hint="通知数据没有加载出来，请检查网络后重试" @retry="load">
              <!-- 模板 -->
              <template v-if="tab === 'tpl'">
                <div class="quiet">
                  <el-alert type="info" show-icon :closable="false" :title="'静默时段 ' + quietRow.value + '：这段时间只发验证码、支付成功这类紧急消息，营销类延后到时段结束。'" />
                  <el-button :icon="Clock" @click="askQuiet">静默时段设置</el-button>
                </div>
                <div class="lz-toolbar filters">
                  <el-radio-group v-model="tplFilter.status" aria-label="状态">
                    <el-radio-button value="ON">启用 <span class="num">{{ tplCount('ON') }}</span></el-radio-button>
                    <el-radio-button value="OFF">停用 <span class="num">{{ tplCount('OFF') }}</span></el-radio-button>
                    <el-radio-button value="ALL">全部 <span class="num">{{ tplCount('ALL') }}</span></el-radio-button>
                  </el-radio-group>
                  <el-select v-model="tplFilter.channel" clearable placeholder="全部渠道" style="width: 140px" aria-label="渠道"><el-option v-for="c in CHANNELS" :key="c" :value="c" :label="c" /></el-select>
                  <el-input v-model="tplFilter.q" clearable placeholder="场景或内容" :prefix-icon="Search" style="width: 200px" />
                </div>
                <el-table ref="tplRef" :data="tplRows" size="large" row-key="id" empty-text="没有符合条件的模板">
                  <el-table-column label="场景" width="108" align="center"><template #default="{ row }"><span class="strong">{{ row.scene }}</span></template></el-table-column>
                  <el-table-column label="渠道" width="84" align="center"><template #default="{ row }"><LzStatusTag :type="CH[row.channel].tone" :text="row.channel" /></template></el-table-column>
                  <el-table-column label="内容" min-width="180"><template #default="{ row }"><span class="clamp-2">{{ row.content }}</span></template></el-table-column>
                  <el-table-column label="状态" width="84" align="center">
                    <template #default="{ row }"><el-switch :model-value="row.status === 'ON'" :before-change="() => beforeSwitch(row)" :aria-label="(row.status === 'ON' ? '停用 ' : '启用 ') + row.scene" @change="(on) => switched(row, on)" /><div class="muted">{{ row.status === 'ON' ? '启用' : '停用' }}</div></template>
                  </el-table-column>
                  <el-table-column label="发送情况" width="106" align="center">
                    <template #default="{ row }"><span class="num strong">{{ row.sent.toLocaleString() }}</span><div class="muted num">{{ row.sent ? '失败 ' + ((row.failed / row.sent) * 100).toFixed(1) + '%' : '还没有发送' }}</div></template>
                  </el-table-column>
                  <el-table-column label="操作" width="160" align="center" fixed="right">
                    <template #default="{ row }">
                      <el-button link type="primary" :aria-label="'编辑 ' + row.scene" @click="askTpl(row)">编辑</el-button>
                      <el-button link type="primary" :aria-label="'测试发送 ' + row.scene" @click="askTest(row)">测试发送</el-button>
                      <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
                        <el-button link :icon="ArrowDown" :aria-label="'更多操作：' + row.scene" />
                        <template #dropdown><el-dropdown-menu><el-dropdown-item command="copy">复制为新场景</el-dropdown-item><el-dropdown-item command="del" divided>删除场景</el-dropdown-item></el-dropdown-menu></template>
                      </el-dropdown>
                    </template>
                  </el-table-column>
                </el-table>
              </template>

              <!-- 发送记录 -->
              <template v-else-if="tab === 'logs'">
                <el-radio-group v-model="lf.status" class="status-tabs" aria-label="发送状态">
                  <el-radio-button v-for="[v, l] in LOG_TABS" :key="v" :value="v">{{ l }} <span class="num">{{ logCount(v) }}</span></el-radio-button>
                </el-radio-group>
                <div class="lz-toolbar filters">
                  <el-select v-model="lf.scene" clearable placeholder="全部场景" style="width: 140px" aria-label="场景"><el-option v-for="s in sceneNames" :key="s" :value="s" :label="s" /></el-select>
                  <el-select v-model="lf.channel" clearable placeholder="全部渠道" style="width: 132px" aria-label="渠道"><el-option v-for="c in CHANNELS" :key="c" :value="c" :label="c" /></el-select>
                  <el-select v-model="lf.range" style="width: 124px" aria-label="时间范围"><el-option :value="1" label="今天" /><el-option :value="3" label="近 3 天" /><el-option :value="7" label="近 7 天" /><el-option :value="14" label="近 14 天" /></el-select>
                  <el-input v-model="lf.q" clearable placeholder="会员或消息编号" :prefix-icon="Search" style="width: 190px" />
                  <el-button v-if="logDirty" text type="primary" @click="resetLogFilter">重置筛选</el-button>
                  <span class="grow" />
                  <span class="muted num">共 {{ logRows.length }} 条</span>
                  <el-button :icon="Download" @click="exp.open = true">导出</el-button>
                </div>
                <div v-if="picked.length" class="batch">
                  <el-alert type="info" show-icon :closable="false" :title="'已选 ' + picked.length + ' 条可以重发的失败消息'" />
                  <el-button type="primary" @click="batchRetry">批量重发</el-button>
                  <el-button text @click="logRef.clearSelection()">取消选择</el-button>
                </div>
                <LzState :status="logStatus" :empty-title="scene === 'nodata' ? '还没有发送记录，启用模板并有业务触发后会出现在这里' : '没有符合条件的发送记录'" @retry="load">
                  <template #empty-action><el-button v-if="logDirty && scene !== 'nodata'" @click="resetLogFilter">重置筛选</el-button></template>
                  <el-table ref="logRef" :data="logPage" size="large" row-key="id" @selection-change="(rows) => (picked = rows)">
                    <el-table-column type="selection" width="48" :selectable="canRetry" />
                    <el-table-column label="时间" width="128" align="center"><template #default="{ row }"><span class="num">{{ md(row.at) }}</span></template></el-table-column>
                    <el-table-column label="会员" width="130" align="center"><template #default="{ row }">{{ row.userName }}<div class="muted num">{{ row.phone }}</div></template></el-table-column>
                    <el-table-column label="场景" width="112" align="center" prop="scene" />
                    <el-table-column label="渠道" width="100" align="center"><template #default="{ row }"><LzStatusTag :type="CH[row.channel].tone" :text="row.channel" /></template></el-table-column>
                    <el-table-column label="状态" width="92" align="center"><template #default="{ row }"><LzStatusTag :type="STATUS[row.status][0]" :text="STATUS[row.status][1]" /></template></el-table-column>
                    <el-table-column v-if="hasReason" label="失败原因" min-width="200"><template #default="{ row }"><span class="clamp-2">{{ row.status === 'OK' ? '' : (row.permanent ? '永久失败：' : '') + row.reason }}</span></template></el-table-column>
                    <el-table-column label="操作" width="130" align="center" fixed="right">
                      <template #default="{ row }">
                        <el-button link type="primary" :aria-label="'查看详情 ' + row.msgNo" @click="openLog(row)">详情</el-button>
                        <el-button v-if="row.status === 'FAIL'" link type="primary" :loading="busyLog === row.id" :aria-label="'重发 ' + row.msgNo" @click="retryOne(row)">重发</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                  <LzPager v-model:page="logPager.page.value" v-model:size="logPager.size.value" :total="logRows.length" />
                </LzState>
              </template>

              <!-- 订阅额度 -->
              <template v-else>
                <LzState :status="quotaStat.length ? 'ok' : 'empty'" empty-title="还没有订阅消息类的场景">
                  <el-alert v-if="allZero" type="error" show-icon :closable="false" title="所有订阅消息场景的额度都已用完" description="会员收不到订阅消息；订单类提醒会改发站内信，重要场景可补发短信。需要会员在小程序里再次订阅。" class="gap-bottom" />
                  <el-table :data="quotaStat" size="large" row-key="t.id">
                    <el-table-column label="场景" width="100" align="center"><template #default="{ row }"><span class="strong">{{ row.t.scene }}</span></template></el-table-column>
                    <el-table-column label="会员数" width="80" align="right" prop="total" />
                    <el-table-column label="剩余合计（次）" width="116" align="right"><template #default="{ row }"><span class="num">{{ row.sum }}</span></template></el-table-column>
                    <el-table-column label="额度分布" min-width="200">
                      <template #default="{ row }">
                        <div class="dist" role="img" :aria-label="`充足 ${row.ok} 人，偏少 ${row.low} 人，已用完 ${row.zero} 人`">
                          <span class="seg ok" :style="{ width: (row.ok / row.total) * 100 + '%' }" />
                          <span class="seg low" :style="{ width: (row.low / row.total) * 100 + '%' }" />
                          <span class="seg zero" :style="{ width: (row.zero / row.total) * 100 + '%' }" />
                        </div>
                        <div class="muted num">充足 {{ row.ok }} · 偏少 {{ row.low }} · 用完 {{ row.zero }}</div>
                      </template>
                    </el-table-column>
                    <el-table-column label="提示" width="128" align="center"><template #default="{ row }"><LzStatusTag :type="quotaTone(row)[0]" :text="quotaTone(row)[1]" /></template></el-table-column>
                    <el-table-column label="操作" width="96" align="center" fixed="right"><template #default="{ row }"><el-button link type="primary" :aria-label="'查看额度不足的会员：' + row.t.scene" @click="Object.assign(lowDlg, { open: true, x: row })">查看会员</el-button></template></el-table-column>
                  </el-table>
                  <p class="muted note">订阅消息每发一条消耗会员 1 次额度，用完就发不出去，需要会员在小程序里再次订阅。充足指 3 次以上，偏少指 1 到 2 次。<template v-if="worst && !allZero">额度最紧张的是“{{ worst.t.scene }}”：{{ worst.total }} 位会员里 {{ worst.zero }} 位已用完，{{ worst.low }} 位偏少。</template></p>
                </LzState>
              </template>
            </LzState>
          </el-card>
        </div>

        <aside class="rail" aria-label="发送情况提醒">
          <el-card shadow="never" class="lz-card" :body-style="RAIL_BODY">
            <div class="rail-head"><span class="strong">今日发送</span><LzStatusTag :type="high ? 'danger' : 'success'" :text="high ? '失败率偏高' : '运行正常'" /></div>
            <div class="pair">
              <el-statistic title="发送量（条）" :value="todayLogs.length" />
              <el-statistic title="失败率" :value="rate.toFixed(1)"><template #suffix>%</template></el-statistic>
            </div>
            <div class="muted">{{ failToday }} 条失败 · {{ retryToday }} 条重试中，截至 {{ now.slice(11) }}</div>
            <LzChart v-if="daily.some((n) => n)" kind="line" :categories="days14.map((k) => k.slice(8))" :series="[{ name: '发送量', data: daily }]" :height="120" unit="" label="近 14 天每日发送量" />
            <div class="muted">近 14 天每日发送量{{ daily.some((n) => n) ? '，今天 ' + daily[13] + ' 条' : '：暂无记录' }}</div>
          </el-card>
          <el-card shadow="never" class="lz-card" :body-style="RAIL_BODY">
            <div class="rail-head"><span class="strong">待重试</span><LzStatusTag :type="pendingManual + pendingAuto ? 'warning' : 'success'" :text="pendingManual + pendingAuto ? '需要关注' : '没有积压'" /></div>
            <el-statistic title="待处理（条）" :value="pendingManual + pendingAuto" />
            <div class="muted">{{ pendingManual }} 条等人工重发 · {{ pendingAuto }} 条自动重试中</div>
            <el-button :disabled="!pendingManual" @click="gotoFailures">去处理</el-button>
          </el-card>
          <el-card shadow="never" class="lz-card" :body-style="RAIL_BODY">
            <div class="rail-head"><span class="strong">最近失败原因</span><span class="muted">近 3 天</span></div>
            <el-empty v-if="!topReasons.length" :image-size="48" description="近 3 天没有失败，状态很好" />
            <div v-for="[why, x] in topReasons" :key="why" class="reason">
              <div class="grow"><div>{{ why }}</div><div class="muted num">最近 {{ md(x.last) }}</div></div>
              <LzStatusTag :type="x.perm ? 'danger' : 'warning'" :text="x.n + ' 条'" />
            </div>
          </el-card>
        </aside>
      </div>

      <!-- dialogs: all centred -->
      <LzDialog v-model="te.open" :title="te.t ? '编辑 ' + te.t.scene : '新建通知场景'" width="880px" confirm-text="保存" :confirm-disabled="tc.errors.length > 0 || te.scene.trim().length < 2" :on-confirm="saveTpl">
        <div class="split">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="场景名称（2 到 10 个字，不能和已有场景重名）"><el-input v-model="te.scene" maxlength="10" show-word-limit placeholder="例如：预约成功提醒" /></el-form-item>
            <el-form-item label="渠道（订阅消息要会员有订阅额度；短信按条计费；站内信总是会发）"><el-select v-model="te.channel" style="width: 100%"><el-option v-for="c in CHANNELS" :key="c" :value="c" :label="c" /></el-select></el-form-item>
            <el-form-item label="内容">
              <el-input ref="taRef" v-model="te.content" type="textarea" :rows="4" placeholder="例如：您的订单{{订单号}}已支付，金额{{金额}}" aria-label="内容" />
            </el-form-item>
            <div class="counter num" :class="{ bad: tc.errors.length }" aria-live="polite">{{ counter }}</div>
            <el-alert v-for="m in tc.errors" :key="m" type="error" show-icon :closable="false" :title="m" class="gap-top" />
            <el-alert v-for="m in tc.warns" :key="m" type="warning" show-icon :closable="false" :title="m" class="gap-top" />
            <p class="muted">点按钮把变量插到光标处：</p>
            <div class="chips">
              <el-tooltip v-for="v in VARS" :key="v.k" :content="`示例：${v.sample}，最长 ${v.max} 字`" placement="top"><el-button size="small" @click="insertVar(v)">{{ v.k }}</el-button></el-tooltip>
            </div>
            <el-form-item label="保存后立即启用" class="gap-top"><el-switch v-model="te.on" /></el-form-item>
          </el-form>
          <div>
            <p class="section-title">预览</p>
            <el-card shadow="never" class="preview" :body-style="{ display: 'grid', gap: '8px', padding: '12px 14px' }">
              <template v-if="te.channel === '订阅消息'">
                <div class="muted">示例门店 · 订阅消息 · 刚刚</div><div class="strong">{{ te.scene.trim() || '场景名称' }}</div><div>{{ previewBody }}</div><div class="muted">点击进入小程序 ›</div>
              </template>
              <template v-else-if="te.channel === '短信'"><div class="muted">短信 · 刚刚</div><div>【示例门店】{{ previewBody }}</div></template>
              <template v-else><div class="strong">{{ te.scene.trim() || '场景名称' }}</div><div class="muted">站内信 · 刚刚</div><div>{{ previewBody }}</div></template>
            </el-card>
            <p class="muted">预览用示例数据{{ previewVars ? '：' + previewVars : '' }}</p>
          </div>
        </div>
      </LzDialog>

      <LzDialog v-model="ts.open" title="测试发送" width="480px" confirm-text="发送测试" :on-confirm="doTest">
        <p v-if="ts.t">用「<span class="strong">{{ ts.t.scene }}</span>」（{{ ts.t.channel }}）发一条测试消息，内容用示例数据，会带“测试”字样，不计入发送量。</p>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="发送对象"><el-radio-group v-model="ts.mode"><el-radio-button value="phone">输入手机号</el-radio-button><el-radio-button value="member">选择会员</el-radio-button></el-radio-group></el-form-item>
          <el-form-item v-if="ts.mode === 'phone'" label="手机号（演示：以 9999 结尾的号码会模拟发送失败）"><el-input v-model="ts.phone" maxlength="11" placeholder="11 位手机号" inputmode="numeric" /></el-form-item>
          <el-form-item v-else label="会员"><el-select v-model="ts.uid" style="width: 100%"><el-option v-for="u in testUsers" :key="u.id" :value="u.id" :label="u.name + '（' + maskPhone(u.phone) + '）'" /></el-select></el-form-item>
        </el-form>
      </LzDialog>

      <LzDialog v-model="qh.open" title="静默时段设置" width="440px" confirm-text="保存" :on-confirm="saveQuiet">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="启用静默时段"><el-switch v-model="qh.on" /></el-form-item>
          <div class="two">
            <el-form-item label="开始时间"><el-select v-model="qh.from" :disabled="!qh.on" style="width: 100%"><el-option v-for="t in timeOpts" :key="t" :value="t" :label="t" /></el-select></el-form-item>
            <el-form-item label="结束时间"><el-select v-model="qh.to" :disabled="!qh.on" style="width: 100%"><el-option v-for="t in timeOpts" :key="t" :value="t" :label="t" /></el-select></el-form-item>
          </div>
        </el-form>
        <p class="muted">静默时段里，营销类消息延后到结束时刻再发；验证码、支付成功、退款到账等紧急消息照常发送，站内信不受影响。改动同步到“系统配置”里的消息静默时段。</p>
      </LzDialog>

      <LzDialog v-model="ld.open" :title="'发送详情 · ' + (ld.l?.scene || '')" width="600px" no-footer>
        <el-tabs v-if="ld.l" v-model="ld.tab">
          <el-tab-pane label="概况" name="info">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="消息编号"><span class="num">{{ ld.l.msgNo }}</span></el-descriptions-item>
              <el-descriptions-item label="发送时间"><span class="num">{{ ld.l.at }}</span></el-descriptions-item>
              <el-descriptions-item label="会员">{{ ld.l.userName }} <span class="num">{{ ld.l.phone }}</span></el-descriptions-item>
              <el-descriptions-item label="场景">{{ ld.l.scene }}</el-descriptions-item>
              <el-descriptions-item label="渠道">{{ ld.l.channel }}</el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag :type="STATUS[ld.l.status][0]" :text="STATUS[ld.l.status][1]" /><LzStatusTag v-if="ld.l.permanent" type="danger" text="永久失败" /></el-descriptions-item>
              <el-descriptions-item label="失败原因">{{ ld.l.reason || '—' }}</el-descriptions-item>
              <el-descriptions-item label="重试次数">{{ ld.l.status === 'OK' ? '无需重试' : ld.l.tries + ' / 5' }}</el-descriptions-item>
            </el-descriptions>
            <el-alert v-if="ld.l.permanent" type="error" show-icon :closable="false" :title="'永久失败，不能重发。' + (REMEDY[ld.l.reason] || '')" class="gap-top" />
            <el-alert v-else-if="ld.l.status === 'FAIL'" type="warning" show-icon :closable="false" title="自动重试 5 次仍失败，可以点“重发”再试一次。" class="gap-top" />
            <el-alert v-else-if="ld.l.status === 'RETRY'" type="info" show-icon :closable="false" title="系统正在按 1 分钟、5 分钟、30 分钟、2 小时的间隔自动重试，无需人工处理。" class="gap-top" />
            <div v-if="canRetry(ld.l)" class="actions"><el-button type="primary" :loading="busyLog === ld.l.id" @click="retryOne(ld.l)">重发</el-button></div>
          </el-tab-pane>
          <el-tab-pane label="消息内容" name="content">
            <el-card shadow="never" class="preview" :body-style="{ display: 'grid', gap: '8px', padding: '12px 14px' }"><div class="muted">{{ ld.l.channel }} · {{ md(ld.l.at) }}</div><div>{{ ld.l.content }}</div></el-card>
            <p class="muted">为保护会员隐私，记录里只保留脱敏手机号。</p>
          </el-tab-pane>
          <el-tab-pane label="投递过程" name="trail">
            <el-timeline class="trail">
              <el-timeline-item v-for="(a, i) in ld.l.attempts" :key="i" :timestamp="a.at" :type="a.result === '成功' ? 'success' : 'danger'">第 {{ i + 1 }} 次：{{ a.note }}</el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <LzDialog v-model="explain.open" title="这条是永久失败，不能重发" width="440px" no-footer>
        <template v-if="explain.l">
          <p>原因：<span class="strong">{{ explain.l.reason }}</span></p>
          <p>{{ REMEDY[explain.l.reason] || '这类错误重发也不会成功，请先处理原因。' }}</p>
          <p class="muted">可重发的是“自动重试 5 次仍失败”的临时错误，比如微信没有响应、短信通道繁忙。</p>
          <div class="actions"><el-button type="primary" @click="explain.open = false">知道了</el-button></div>
        </template>
      </LzDialog>

      <LzDialog v-model="exp.open" title="导出发送记录" width="440px" confirm-text="开始导出" :on-confirm="doExport">
        <p>导出范围：当前筛选结果，共 <span class="strong num">{{ logRows.length }}</span> 条；表头是中文，状态与渠道已翻译，手机号保持脱敏，不含内部编号和空列。</p>
        <p class="muted">文件名：{{ expName }}</p>
      </LzDialog>

      <LzDialog v-model="lowDlg.open" :title="(lowDlg.x?.t.scene || '') + ' · 额度不足的会员'" width="560px" no-footer>
        <p class="muted">共 {{ lowRows.length }} 位会员的剩余次数在 2 次以内。可以在支付成功页、消息提醒设置页引导他们再次订阅。</p>
        <el-table :data="lowRows" size="small" max-height="360" empty-text="所有会员的额度都充足">
          <el-table-column label="会员" prop="name" width="110" align="center" />
          <el-table-column label="手机号" width="130" align="center"><template #default="{ row }"><span class="num">{{ maskPhone(row.phone) }}</span></template></el-table-column>
          <el-table-column label="剩余次数" width="100" align="right"><template #default="{ row }"><span class="num">{{ lowDlg.x ? qv(lowDlg.x.t, row) : 0 }}</span></template></el-table-column>
          <el-table-column label="状态" min-width="100" align="center"><template #default="{ row }"><LzStatusTag :type="lowDlg.x && qv(lowDlg.x.t, row) === 0 ? 'danger' : 'warning'" :text="lowDlg.x && qv(lowDlg.x.t, row) === 0 ? '已用完' : '偏少'" /></template></el-table-column>
        </el-table>
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.page { grid-template-columns: minmax(0, 1fr); }
.main { min-width: 0; }
.strong { font-weight: 600; }
.tab-count { margin-left: 6px; color: var(--luz-ink-2); }
.filters { margin: 12px 0; }
.status-tabs { margin-top: 4px; }
.quiet { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.quiet > :first-child { flex: 1 1 320px; }
.batch { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }
.batch > :first-child { flex: 1 1 240px; }
.rail { position: sticky; top: 0; display: grid; gap: 16px; }
.rail-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.reason { display: flex; align-items: center; gap: 8px; }
.dist { display: flex; height: 12px; overflow: hidden; border-radius: 6px; background: var(--el-fill-color); }
.seg.ok { background: var(--el-color-success-light-5); }
.seg.low { background: var(--el-color-warning-light-5); }
.seg.zero { background: var(--el-color-danger-light-5); }
.note { margin-top: 12px; }
.gap-bottom { margin-bottom: 12px; }
.gap-top { margin-top: 12px; }
.split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 20px; }
.counter { color: var(--luz-ink-2); }
.counter.bad { color: var(--luz-danger); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.section-title { margin: 0 0 8px; font-weight: 600; }
.preview { background: var(--luz-canvas); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.actions { display: flex; gap: 12px; margin-top: 16px; }
.trail { padding-left: 4px; }

@media (max-width: 1100px) { .rail { position: static; } }
@media (max-width: 760px) { .split { grid-template-columns: minmax(0, 1fr); } }
</style>
