<script>
// 门店：全幅画布加浮动面板。画布是示意地图（路网、河流、湖、绿地、街区，纯 SVG 加定位的图钉按钮），不引入地图库；
// 读写 state.db.stores（本页补充的门店数据），云帆店的暂停营业同步到 state.shopStatus（小程序读同一个值）。订单按门店分摊只在本页计算。
export const meta = {
  id: 'tenants', label: '门店', icon: 'shop', group: '门店', order: 1, roles: ['A'],
  layout: '全幅画布加浮动面板',
  reason: '门店管理的第一件事是看清每家店在哪、现在开不开：示意地图铺满主区当主角，搜索与筛选、今日汇总和门店卡片做成浮动面板压在画布四周，点图钉或卡片再进详情去停业、改时间、改公告',
  scenes: [
    { id: 'nodata', label: '还没有门店' },
    { id: 'map-fail', label: '地图加载失败（门店列表仍可用）' },
    { id: 'pause-fail', label: '停业失败：门店状态已被别人改过' },
    { id: 'save-fail', label: '保存失败：门店编码已被占用' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { Location, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene, setScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, yuan } from '../../shared/format.js'

const scene = useScene('tenants')
const allowed = computed(() => state.role === 'A')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const MODES = ['堂食', '自取', '外卖']
const MAIN = 1                                                  // 云帆店 is the shop whose state the mini-program reads (state.shopStatus)
const today = K.ymd(B.NOW())
const nowStr = B.fmt(B.NOW())
const dAdd = (d, n) => K.ymd(K.addDays(new Date(d + 'T00:00:00'), n))
const md = (s) => s.slice(5)
const hm = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const weekIdx = (d) => (new Date(d + 'T00:00:00').getDay() + 6) % 7
const money = (c) => '¥' + yuan(c)
const userOf = (id) => state.db.users.find((u) => u.id === id)
const audit = (code, action, target) => state.db.audit.unshift({ id: Math.max(0, ...state.db.audit.map((a) => a.id)) + 1, at: nowStr, actor: '王海燕', code, action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })

// ---- demo data: five shops
function ensure() {
  const d = state.db
  d._luzSeed ||= {}
  if (toRaw(d._luzSeed.stores) === toRaw(d.users)) return
  const mk = (id, code, name, addr, phone, open, close, x, y, extra) => ({ id, code, name, addr, phone, open, close, x, y, modes: ['堂食', '自取', '外卖'], notice: '本店支持线上点单、到店自取，会员卡与储值可抵扣。', manual: 'OPEN', resumeAt: '', pauseNote: '', specialDays: [], week: Array.from({ length: 7 }, () => ({ on: true, open, close })), version: 1, createdAt: dAdd(today, -200 + id * 17), ...extra })
  const s = [
    mk(1, 'YF001', '云帆店', '示例市示例区示例路 88 号', '0571-8800-0001', '09:00', '21:00', 250, 330, { notice: '本店支持线上点单、到店自取，会员卡与储值可抵扣。午市 11:30–13:00 高峰，建议提前下单。' }),
    mk(2, 'BJ002', '滨江店', '示例市滨江区江南大道 216 号', '0571-8800-0002', '09:30', '22:00', 520, 255, { modes: ['堂食', '自取'], notice: '滨江店晚市营业到 22:00，欢迎夜宵。' }),
    mk(3, 'XX003', '西溪店', '示例市西湖区文二西路 18 号', '0571-8800-0003', '07:30', '20:00', 790, 370, { manual: 'PAUSED', resumeAt: today + ' 14:00', pauseNote: '设备检修，今天 14:00 恢复营业，给您带来不便请谅解。', notice: '西溪店早餐 7:30 起供应。' }),
    mk(4, 'QJ004', '钱江店', '示例市上城区钱江路 66 号', '0571-8800-0004', '11:00', '21:30', 430, 470, { modes: ['堂食', '外卖'], notice: '钱江店 11:00 开门，主营午餐与晚餐。' }),
    mk(5, 'XS005', '萧山店', '示例市萧山区市心路 9 号', '0571-8800-0005', '09:00', '21:00', 985, 440, { notice: '萧山店新开业，会员卡全城通用。', specialDays: [{ id: 1, date: today, type: '休息', open: '', close: '', note: '员工团建，今天休息' }] }),
  ]
  s[1].specialDays.push({ id: 1, date: dAdd(today, 23), type: '调整营业时间', open: '10:00', close: '20:00', note: '圣诞周边活动，提前打烊' })
  s[0].specialDays.push({ id: 1, date: dAdd(today, 58), type: '休息', open: '', close: '', note: '元旦休息' })
  s[3].week[6] = { on: false, open: '11:00', close: '21:30' }
  d.stores = s
  d._luzSeed.stores = d.users
}
ensure()
watch(() => state.db.users, ensure)

const stores = computed(() => (scene.value === 'nodata' ? [] : state.db.stores))

// ---- business state: a manual pause first, then special days and the weekly plan, then the clock (the demo clock is 10:30)
function storeState(s) {
  const nowMin = hm(nowStr.slice(11)), main = s.id === MAIN
  const paused = main ? state.shopStatus === 'paused' : s.manual === 'PAUSED'
  if (paused) return { k: 'PAUSED', label: '暂停营业', type: 'warning', note: s.resumeAt ? '预计 ' + md(s.resumeAt) + ' 恢复' : '恢复时间待定' }
  if (main && state.shopStatus === 'rest') return { k: 'REST', label: '休息中', type: 'warning', note: '门店设为休息中' }
  if (main && state.shopStatus === 'closed') return { k: 'CLOSED', label: '已打烊', type: 'info', note: '门店设为已打烊' }
  const sp = s.specialDays.find((d) => d.date === today)
  if (sp && sp.type === '休息') return { k: 'REST', label: '今日休息', type: 'warning', note: sp.note || '特殊日期休息' }
  const wk = s.week[weekIdx(today)], hours = sp && sp.type === '调整营业时间' ? { open: sp.open, close: sp.close } : wk.on ? wk : null
  if (!hours) return { k: 'REST', label: '今日休息', type: 'warning', note: WEEK[weekIdx(today)] + '休息' }
  if (nowMin >= hm(hours.open) && nowMin < hm(hours.close)) return { k: 'OPEN', label: '营业中', type: 'success', note: '营业到 ' + hours.close }
  const before = nowMin < hm(hours.open)
  return { k: 'CLOSED', label: before ? '未开门' : '已打烊', type: 'info', note: before ? hours.open + ' 开门' : '明天 ' + s.open + ' 开门' }
}
function hoursToday(s) {
  const sp = s.specialDays.find((d) => d.date === today), wk = s.week[weekIdx(today)]
  return sp && sp.type === '休息' ? '今日休息' : sp && sp.type === '调整营业时间' ? sp.open + '–' + sp.close + '（特殊日期）' : wk.on ? wk.open + '–' + wk.close : '今日休息'
}
// orders are shared out over the shops by a hash of the order number (this page only)
const hash = (str) => { let a = 7; for (let i = 0; i < str.length; i++) a = (Math.imul(a, 31) + str.charCodeAt(i)) >>> 0; return a }
const CUM = [30, 54, 74, 90, 100]
const storeIdOf = (o) => CUM.findIndex((c) => hash(o.no) % 100 < c) + 1
function numbers(s) {
  const mine = state.db.orders.filter((o) => storeIdOf(o) === s.id)
  const paid = mine.filter((o) => ['PAID', 'FULFILLED', 'DONE'].includes(o.status) && o.createdAt.slice(0, 10) === today)
  return { orders: paid.length, rev: paid.reduce((a, o) => a + o.amount, 0), unpaid: mine.filter((o) => o.status === 'UNPAID').length, toFulfil: mine.filter((o) => o.status === 'PAID').length }
}

// ---- the schematic map: road net, river, lake, parks and blocks, drawn once as SVG shapes
const ROADS = {
  main: [[[0, 560], [260, 520], [560, 540], [880, 470], [1200, 430]], [[130, 0], [210, 250], [330, 480], [380, 720]], [[700, 0], [660, 200], [690, 420], [790, 720]], [[0, 160], [320, 190], [700, 200], [1200, 150]]],
  side: [[[0, 340], [400, 330], [900, 310], [1200, 340]], [[500, 0], [520, 360], [540, 720]], [[900, 0], [920, 300], [960, 720]], [[0, 700], [600, 640], [1200, 680]], [[250, 0], [300, 300], [260, 720]], [[1080, 0], [1100, 400], [1140, 720]]],
}
const RIVER = [[0, 440], [200, 400], [420, 410], [640, 360], [840, 380], [1040, 330], [1200, 300]]
const LAKE = { cx: 1010, cy: 90, rx: 150, ry: 54 }
const PARKS = [[40, 60, 190, 110], [740, 480, 170, 120], [380, 590, 130, 90], [1040, 560, 140, 100]]
const DISTRICTS = [['老城区', 150, 290], ['滨江新区', 560, 170], ['西溪湿地', 820, 590], ['萧山', 1080, 380], ['钱江新城', 440, 660], ['城北公园', 135, 90]]
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) }
const lineDist = (p, pts) => Math.min(...pts.slice(1).map((q, i) => segDist(p, pts[i], q)))
const smooth = (pts) => pts.reduce((d, p, i, a) => (i === 0 ? 'M' + p[0] + ' ' + p[1] : d + 'C' + [(a[i - 1][0] + p[0]) / 2, a[i - 1][1], (a[i - 1][0] + p[0]) / 2, p[1], p[0], p[1]].join(' ')), '')
const BLOCKS = (() => {
  const r = B.rng(5), out = []
  for (let gx = 20; gx < 1200; gx += 54) for (let gy = 14; gy < 720; gy += 46) {
    const p = [gx + 25, gy + 21]
    if (r() < 0.12 || lineDist(p, RIVER) < 54) continue
    if (PARKS.some(([x, y, w, h]) => p[0] > x - 14 && p[0] < x + w + 14 && p[1] > y - 14 && p[1] < y + h + 14)) continue
    if (((p[0] - LAKE.cx) / (LAKE.rx + 20)) ** 2 + ((p[1] - LAKE.cy) / (LAKE.ry + 20)) ** 2 < 1) continue
    if (ROADS.main.some((l) => lineDist(p, l) < 24) || ROADS.side.some((l) => lineDist(p, l) < 18)) continue
    out.push({ x: gx + Math.floor(r() * 6), y: gy + Math.floor(r() * 6), width: 30 + Math.floor(r() * 18), height: 26 + Math.floor(r() * 14) })
  }
  return out
})()
const riverD = smooth(RIVER)
const roadPaths = [...ROADS.side.map((l) => ({ d: smooth(l), cls: 'side' })), ...ROADS.main.map((l) => ({ d: smooth(l), cls: 'main' }))]
const pos = (x, y) => ({ left: (x / 12) + '%', top: (y / 7.2) + '%' })

// ---- the floating panels: search and status, today's summary, the shop cards
const q = ref(''), st = ref('ALL'), sel = ref(null)
const CHIPS = [['ALL', '全部'], ['OPEN', '营业中'], ['PAUSE', '暂停或休息'], ['CLOSED', '未营业']]
const matchQ = (s) => !q.value.trim() || s.name.includes(q.value.trim()) || s.addr.includes(q.value.trim())
const matchSt = (s, v) => { const k = storeState(s).k; return v === 'ALL' || (v === 'OPEN' && k === 'OPEN') || (v === 'PAUSE' && (k === 'PAUSED' || k === 'REST')) || (v === 'CLOSED' && k === 'CLOSED') }
const countOf = (v) => stores.value.filter((s) => matchQ(s) && matchSt(s, v)).length
const visible = computed(() => stores.value.filter((s) => matchQ(s) && matchSt(s, st.value)))
const visibleIds = computed(() => new Set(visible.value.map((s) => s.id)))
const sum = computed(() => {
  const list = stores.value, nums = list.map(numbers)
  return { rev: nums.reduce((a, n) => a + n.rev, 0), orders: nums.reduce((a, n) => a + n.orders, 0), open: list.filter((s) => storeState(s).k === 'OPEN').length, total: list.length }
})
const dirty = computed(() => q.value || st.value !== 'ALL')
const resetFilter = () => { q.value = ''; st.value = 'ALL' }
const mapFailed = computed(() => scene.value === 'map-fail')
const viewStatus = computed(() => phase.value)

// ---- pause and resume
const ps = reactive({ open: false, s: null, resume: '', note: '', touched: false })
const pauseOpts = computed(() => [[today + ' 11:30', '今天 11:30'], [today + ' 12:30', '今天 12:30'], [today + ' 14:00', '今天 14:00'], [today + ' 17:00', '今天 17:00'], [dAdd(today, 1) + ' 09:00', '明天 09:00'], ['none', '恢复时间待定']].filter(([v]) => v === 'none' || v > nowStr))
const pauseBase = () => { const l = (pauseOpts.value.find(([v]) => v === ps.resume) || [, ''])[1]; return ps.s.name + '暂时停业' + (ps.resume !== 'none' ? '，预计' + l + ' 恢复营业' : '，恢复时间另行通知') + '，给您带来不便请谅解。' }
const pauseNums = computed(() => (ps.s ? numbers(ps.s) : { unpaid: 0, toFulfil: 0 }))
function askPause(s) { Object.assign(ps, { open: true, s, resume: pauseOpts.value[0][0], touched: false }); ps.note = pauseBase() }
watch(() => ps.resume, () => { if (ps.open && !ps.touched) ps.note = pauseBase() })
async function doPause() {
  const s = ps.s, n = numbers(s)
  if (!ps.note.trim()) throw new Error('请填写小程序提示文案，顾客会在小程序里看到这句话')
  await request(500, { fail: scene.value === 'pause-fail' ? new Error(`停业失败：${s.name} 的状态刚刚被另一位管理员修改过，门店状态没有改变，请关闭后重新打开再试`) : null })
  s.manual = 'PAUSED'; s.resumeAt = ps.resume === 'none' ? '' : ps.resume; s.pauseNote = ps.note.trim(); s.version++
  if (s.id === MAIN) state.shopStatus = 'paused'
  audit('store:edit', `一键停业（待支付 ${n.unpaid} 笔、待履约 ${n.toFulfil} 笔），${s.resumeAt ? '预计 ' + md(s.resumeAt) + ' 恢复' : '恢复时间待定'}：${s.pauseNote}`, '门店 ' + s.name)
  ElMessage.success(`${s.name} 已停业，小程序已显示提示`)
}
async function resume(s) {
  try {
    await ElMessageBox.confirm(`恢复营业后，小程序马上可以下单。当前提示“${s.pauseNote || '暂停营业'}”将被撤下。`, '恢复营业：' + s.name, { confirmButtonText: '确认恢复', cancelButtonText: '取消' })
  } catch { return }
  try {
    await request(450, { fail: scene.value === 'pause-fail' ? new Error(`恢复失败：${s.name} 的状态刚刚被另一位管理员修改过，门店状态没有改变，请重新打开再试`) : null })
    s.manual = 'OPEN'; s.resumeAt = ''; s.pauseNote = ''; s.version++
    if (s.id === MAIN) state.shopStatus = 'open'
    audit('store:edit', '恢复营业', '门店 ' + s.name)
    ElMessage.success(`${s.name} 已恢复营业`)
  } catch (e) { ElMessage.error(e.message) }
}

// ---- create and edit
const ed = reactive({ open: false, s: null, name: '', code: '', addr: '', phone: '', from: '09:00', to: '21:00', modes: [] })
const askEdit = (s) => Object.assign(ed, { open: true, s, name: s?.name || '', code: s?.code || '', addr: s?.addr || '', phone: s?.phone || '', from: s?.open || '09:00', to: s?.close || '21:00', modes: s ? [...s.modes] : ['堂食', '自取'] })
async function doEdit() {
  const s0 = ed.s, list = state.db.stores, name = ed.name.trim(), code = ed.code.trim()
  if (name.length < 2) throw new Error('名称至少 2 个字')
  if (list.some((o) => o !== s0 && o.name === name)) throw new Error('已经有同名的门店')
  if (!/^[A-Za-z0-9]{3,10}$/.test(code)) throw new Error('编码只能是 3 到 10 位字母或数字')
  if (!s0 && list.some((o) => o.code.toLowerCase() === code.toLowerCase())) throw new Error(`这个编码已经被「${list.find((o) => o.code.toLowerCase() === code.toLowerCase()).name}」用了`)
  if (!ed.addr.trim()) throw new Error('请填写详细地址')
  if (!/^(\d{3,4}-)?\d{7,8}$|^1\d{10}$|^400-\d{3}-\d{4}$|^\d{3,4}-\d{4}-\d{4}$/.test(ed.phone.trim())) throw new Error('电话格式不对，例如 0571-8800-0001 或 11 位手机号')
  if (!ed.from || !ed.to || ed.to <= ed.from) throw new Error('关门时间要晚于开门时间')
  if (!ed.modes.length) throw new Error('至少支持一种取餐方式')
  await request(500, { fail: scene.value === 'save-fail' ? new Error(`保存失败：门店编码「${code}」已被另一家门店占用，请换一个编码，已填写的内容都还在`) : null })
  const body = { name, addr: ed.addr.trim(), phone: ed.phone.trim(), open: ed.from, close: ed.to, modes: MODES.filter((m) => ed.modes.includes(m)) }
  let s = s0
  if (s0) { s0.week.forEach((d) => { if (d.open === s0.open) d.open = ed.from; if (d.close === s0.close) d.close = ed.to }); Object.assign(s0, body); s0.version++ }
  else {
    const free = [[650, 470], [130, 450], [1090, 340], [700, 250], [880, 250], [600, 360]].find(([px, py]) => list.every((o) => Math.hypot(o.x - px, o.y - py) > 90)) || [200 + Math.floor(Math.random() * 800), 250 + Math.floor(Math.random() * 200)]
    s = { ...body, id: Math.max(0, ...list.map((o) => o.id)) + 1, code: code.toUpperCase(), x: free[0], y: free[1], manual: 'OPEN', resumeAt: '', pauseNote: '', specialDays: [], notice: '欢迎光临' + name + '。', week: Array.from({ length: 7 }, () => ({ on: true, open: ed.from, close: ed.to })), version: 1, createdAt: today }
    list.push(s)
  }
  audit('store:edit', s0 ? '修改门店信息' : '新增门店', '门店 ' + s.name)
  ElMessage.success(s0 ? `已保存「${s.name}」` : `已新增「${s.name}」`)
  sel.value = s.id; resetFilter(); syncDraft()
}

// ---- detail: overview, hours and special days, notice, trail
const det = reactive({ open: false, id: null, tab: 'info' })
const cur = computed(() => state.db.stores.find((s) => s.id === det.id))
const curState = computed(() => (cur.value ? storeState(cur.value) : null))
const curNums = computed(() => (cur.value ? numbers(cur.value) : null))
const week = ref([])
const hoursErr = ref(''), hoursBusy = ref(false)
const sp = reactive({ date: '', type: '休息', from: '09:00', to: '21:00', note: '', err: '', busy: false })
const notice = reactive({ text: '', err: '', busy: false })
function syncDraft() {
  if (!cur.value) return
  week.value = cur.value.week.map((d) => ({ ...d }))
  notice.text = cur.value.notice; notice.err = ''; hoursErr.value = ''
  Object.assign(sp, { date: '', type: '休息', from: cur.value.open, to: cur.value.close, note: '', err: '' })
}
function openDetail(id) { det.id = id; det.tab = 'info'; det.open = true; sel.value = id; syncDraft() }
const specials = computed(() => (cur.value ? cur.value.specialDays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)) : []))
const trail = computed(() => (cur.value ? state.db.audit.filter((a) => a.target === '门店 ' + cur.value.name) : []))
const timeOpts = Array.from({ length: 36 }, (_, i) => { const m = 6 * 60 + i * 30; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') })
const disabledPast = (d) => K.ymd(d) < today
async function saveHours() {
  hoursErr.value = ''
  const bad = week.value.findIndex((d) => d.on && (!d.open || !d.close || d.close <= d.open))
  if (bad >= 0) { hoursErr.value = WEEK[bad] + '的关门时间要晚于开门时间，请改好后再保存'; return }
  if (!week.value.some((d) => d.on)) { hoursErr.value = '一周至少要有一天营业'; return }
  hoursBusy.value = true
  try {
    await request(450)
    const s = cur.value; s.week = week.value.map((d) => ({ ...d })); const first = s.week.find((d) => d.on); s.open = first.open; s.close = first.close; s.version++
    audit('store:edit', '修改每周营业时间', '门店 ' + s.name)
    ElMessage.success('营业时间已保存')
  } catch (e) { hoursErr.value = e.message + '，已填写的时间都还在，请重试' } finally { hoursBusy.value = false }
}
async function addSpecial() {
  const s = cur.value; sp.err = ''
  if (!sp.date) { sp.err = '请选择日期'; return }
  if (sp.date < today) { sp.err = '日期不能早于今天'; return }
  if (s.specialDays.some((d) => d.date === sp.date)) { sp.err = '这一天已经设置过了，先删除再添加'; return }
  if (sp.type !== '休息' && (!sp.from || !sp.to || sp.to <= sp.from)) { sp.err = '关门时间要晚于开门时间'; return }
  sp.busy = true
  try {
    await request(400)
    s.specialDays.push({ id: Math.max(0, ...s.specialDays.map((d) => d.id)) + 1, date: sp.date, type: sp.type, open: sp.type === '休息' ? '' : sp.from, close: sp.type === '休息' ? '' : sp.to, note: sp.note.trim() }); s.version++
    audit('store:edit', `添加特殊日期 ${sp.date}（${sp.type}）`, '门店 ' + s.name)
    ElMessage.success('已添加特殊日期'); Object.assign(sp, { date: '', note: '' })
  } catch (e) { sp.err = e.message } finally { sp.busy = false }
}
async function removeSpecial(d) {
  try { await ElMessageBox.confirm(`删除 ${d.date} 的特殊日期后，这一天按每周安排营业。`, '删除特殊日期', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }) } catch { return }
  try {
    await request(400)
    const s = cur.value; s.specialDays.splice(s.specialDays.indexOf(d), 1); s.version++
    audit('store:edit', '删除特殊日期 ' + d.date, '门店 ' + s.name); ElMessage.success('已删除')
  } catch (e) { ElMessage.error(e.message) }
}
async function saveNotice() {
  const v = notice.text.trim(); notice.err = ''
  if (v.length < 4) { notice.err = '公告至少写 4 个字'; return }
  if (/(最好|第一|最低价)/.test(v)) { notice.err = '公告里不要出现“最好、第一、最低价”这类绝对化用语'; return }
  notice.busy = true
  try {
    await request(450)
    const s = cur.value; s.notice = v; s.version++
    audit('store:edit', '修改公告：' + v.slice(0, 30), '门店 ' + s.name); ElMessage.success('公告已更新，小程序马上显示')
  } catch (e) { notice.err = e.message + '，公告内容还在，请重试' } finally { notice.busy = false }
}
const CARD_BODY = { display: 'grid', gap: '6px', padding: '12px 14px' }
const PHONE_BODY = { ...CARD_BODY, justifyItems: 'start' }
const specialType = (t) => (t === '休息' ? 'warning' : 'primary')
</script>

<template>
  <div class="lz-page page">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="muted">点地图上的图钉或底部的门店卡，进详情去停业、改时间、改公告</span>
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="askEdit(null)">新增门店</el-button>
      </div>

      <LzState :status="viewStatus" :rows="8" error-hint="门店没有加载出来，请检查网络后重试" @retry="load">
        <section class="stage" aria-label="门店地图">
          <!-- the canvas -->
          <div class="map" @click="sel = null">
            <template v-if="!mapFailed">
              <svg class="map-svg" viewBox="0 0 1200 720" preserveAspectRatio="none" role="img" aria-label="示意地图：路网、河流、湖和绿地，上面标着门店位置">
                <rect class="land" width="1200" height="720" />
                <g class="blocks"><rect v-for="(b, i) in BLOCKS" :key="i" v-bind="b" rx="5" /></g>
                <rect v-for="(p, i) in PARKS" :key="'p' + i" class="park" :x="p[0]" :y="p[1]" :width="p[2]" :height="p[3]" rx="22" />
                <ellipse class="water" v-bind="LAKE" />
                <path class="water river" :d="riverD" />
                <path class="river-in" :d="riverD" />
                <g v-for="(r, i) in roadPaths" :key="'r' + i"><path class="casing" :class="r.cls" :d="r.d" /><path class="road" :class="r.cls" :d="r.d" /></g>
              </svg>
              <span v-for="[name, x, y] in DISTRICTS" :key="name" class="district" :style="pos(x, y)">{{ name }}</span>
              <div v-for="s in stores" :key="s.id" class="pin" :class="{ dim: !visibleIds.has(s.id) }" :style="pos(s.x, s.y)" @click.stop>
                <el-popover :visible="sel === s.id && !det.open" placement="top" :width="236" :show-arrow="true">
                  <template #reference>
                    <el-button :type="storeState(s).type === 'info' ? 'info' : storeState(s).type" circle size="large" :icon="Location" :aria-label="s.name + '，' + storeState(s).label + (sel === s.id ? '，已选中' : '，点击选中')" @click="sel = s.id" />
                  </template>
                  <div class="callout">
                    <div class="callout-head"><span class="strong">{{ s.name }}</span><LzStatusTag :type="storeState(s).type" :text="storeState(s).label" /></div>
                    <div class="muted">{{ storeState(s).note }}</div>
                    <div class="num">今日 {{ money(numbers(s).rev) }} · {{ numbers(s).orders }} 单</div>
                    <el-button type="primary" link @click="openDetail(s.id)">查看详情</el-button>
                  </div>
                </el-popover>
                <span class="pin-name">{{ s.name }}</span>
              </div>
            </template>
            <el-result v-else icon="warning" title="地图暂时加载不出来" sub-title="下面的门店列表仍然可以使用，门店的状态和数字不受影响。" class="map-error">
              <template #extra><el-button type="primary" @click="setScene('tenants', null)">重新加载地图</el-button></template>
            </el-result>
          </div>

          <!-- top left: search and status -->
          <el-card shadow="always" class="panel tl" aria-label="搜索与筛选">
            <el-input v-model="q" clearable :prefix-icon="Search" placeholder="搜索门店名称或地址" aria-label="搜索门店" />
            <el-radio-group v-model="st" class="chips" aria-label="营业状态">
              <el-radio-button v-for="[v, l] in CHIPS" :key="v" :value="v">{{ l }} <span class="num">{{ countOf(v) }}</span></el-radio-button>
            </el-radio-group>
          </el-card>

          <!-- top right: today -->
          <el-card shadow="always" class="panel tr" aria-label="今日汇总">
            <div class="sum">
              <el-statistic title="营业额（元）" :value="yuan(sum.rev)" />
              <el-statistic title="订单（单）" :value="sum.orders" />
              <el-statistic title="营业中（家）" :value="sum.open"><template #suffix><span class="muted"> / {{ sum.total }}</span></template></el-statistic>
            </div>
          </el-card>

          <!-- bottom: shop cards -->
          <div class="panel bottom" aria-label="门店列表">
            <el-scrollbar v-if="visible.length">
              <div class="strip">
                <el-card v-for="s in visible" :key="s.id" shadow="hover" class="scard" :class="{ on: sel === s.id }" :body-style="CARD_BODY" @click="sel = s.id">
                  <div class="scard-head"><span class="strong">{{ s.name }}</span><LzStatusTag :type="storeState(s).type" :text="storeState(s).label" /></div>
                  <div class="muted">{{ storeState(s).note }}</div>
                  <div class="num"><span class="strong">{{ money(numbers(s).rev) }}</span><span class="muted"> · {{ numbers(s).orders }} 单</span></div>
                  <div class="muted ell">{{ hoursToday(s) }} · {{ s.addr }}</div>
                  <el-button link type="primary" :aria-label="'查看 ' + s.name + ' 的详情'" @click.stop="openDetail(s.id)">查看详情</el-button>
                </el-card>
              </div>
            </el-scrollbar>
            <el-card v-else shadow="always" class="empty-card">
              <el-empty :image-size="64" :description="stores.length ? '没有符合条件的门店，换个关键词或状态试试' : '还没有门店，先新增第一家'">
                <el-button v-if="stores.length" @click="resetFilter">清除筛选</el-button>
                <el-button v-else type="primary" :icon="Plus" @click="askEdit(null)">新增门店</el-button>
              </el-empty>
            </el-card>
          </div>
        </section>
      </LzState>

      <!-- detail: a centred dialog -->
      <LzDialog v-model="det.open" :title="'门店详情：' + (cur?.name || '')" width="760px" no-footer>
        <el-tabs v-if="cur" v-model="det.tab">
          <el-tab-pane label="概况" name="info">
            <el-row :gutter="12" class="kpi-row">
              <el-col :xs="12" :sm="6"><el-statistic title="今日营业额（元）" :value="yuan(curNums.rev)" /></el-col>
              <el-col :xs="12" :sm="6"><el-statistic title="今日订单（单）" :value="curNums.orders" /></el-col>
              <el-col :xs="12" :sm="6"><el-statistic title="待支付订单（笔）" :value="curNums.unpaid" /></el-col>
              <el-col :xs="12" :sm="6"><el-statistic title="待履约订单（笔）" :value="curNums.toFulfil" /></el-col>
            </el-row>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="门店名称">{{ cur.name }}（{{ cur.code }}）</el-descriptions-item>
              <el-descriptions-item label="营业状态"><LzStatusTag :type="curState.type" :text="curState.label" /><span class="muted note">{{ curState.note }}</span></el-descriptions-item>
              <el-descriptions-item label="详细地址">{{ cur.addr }}</el-descriptions-item>
              <el-descriptions-item label="联系电话"><span class="num">{{ cur.phone }}</span></el-descriptions-item>
              <el-descriptions-item label="今日营业时间"><span class="num">{{ hoursToday(cur) }}</span></el-descriptions-item>
              <el-descriptions-item label="取餐方式">{{ cur.modes.join('、') }}</el-descriptions-item>
              <el-descriptions-item label="小程序公告">{{ cur.notice || '—' }}</el-descriptions-item>
              <el-descriptions-item v-if="curState.k === 'PAUSED'" label="停业提示">{{ cur.pauseNote || '暂停营业' }}</el-descriptions-item>
            </el-descriptions>
            <div class="actions">
              <el-button v-if="curState.k === 'PAUSED'" type="primary" @click="resume(cur)">恢复营业</el-button>
              <el-button v-else-if="curState.k === 'OPEN'" type="danger" @click="askPause(cur)">一键停业</el-button>
              <span v-else class="muted">{{ curState.k === 'REST' ? '今天休息，不需要停业' : '现在不在营业时间，不需要停业' }}</span>
              <el-button @click="askEdit(cur)">编辑门店</el-button>
              <span class="muted">门店不提供删除：停业后可随时恢复，历史订单按门店保留。</span>
            </div>
          </el-tab-pane>

          <el-tab-pane label="营业时间与特殊日期" name="hours">
            <p class="section-title">每周营业时间</p>
            <el-table :data="week" size="small">
              <el-table-column label="星期" width="80" align="center"><template #default="{ $index }">{{ WEEK[$index] }}</template></el-table-column>
              <el-table-column label="营业" width="90" align="center"><template #default="{ row, $index }"><el-switch v-model="row.on" :aria-label="WEEK[$index] + '营业'" /></template></el-table-column>
              <el-table-column label="开门" min-width="130" align="center"><template #default="{ row, $index }"><el-time-select v-model="row.open" :disabled="!row.on" start="06:00" step="00:30" end="23:30" :clearable="false" :aria-label="WEEK[$index] + '开门'" style="width: 116px" /></template></el-table-column>
              <el-table-column label="关门" min-width="130" align="center"><template #default="{ row, $index }"><el-time-select v-model="row.close" :disabled="!row.on" start="06:00" step="00:30" end="23:30" :clearable="false" :aria-label="WEEK[$index] + '关门'" style="width: 116px" /></template></el-table-column>
            </el-table>
            <el-alert v-if="hoursErr" type="error" show-icon :closable="false" :title="hoursErr" class="gap-top" />
            <div class="actions"><span class="grow" /><el-button type="primary" :loading="hoursBusy" @click="saveHours">保存时间</el-button></div>

            <p class="section-title">特殊日期</p>
            <p class="muted">节假日休息或临时调整营业时间，到日期自动生效。</p>
            <el-table :data="specials" size="small" row-key="id" empty-text="没有设置特殊日期">
              <el-table-column label="日期" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.date }}（{{ WEEK[weekIdx(row.date)] }}）</span></template></el-table-column>
              <el-table-column label="类型" width="130" align="center"><template #default="{ row }"><LzStatusTag :type="specialType(row.type)" :text="row.type" /></template></el-table-column>
              <el-table-column label="营业时间" width="120" align="center"><template #default="{ row }"><span class="num">{{ row.type === '休息' ? '休息' : row.open + '–' + row.close }}</span></template></el-table-column>
              <el-table-column label="备注" min-width="120" prop="note" />
              <el-table-column label="操作" width="80" align="center"><template #default="{ row }"><el-button link type="danger" @click="removeSpecial(row)">删除</el-button></template></el-table-column>
            </el-table>
            <div class="add-row">
              <el-date-picker v-model="sp.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" :disabled-date="disabledPast" style="width: 150px" aria-label="特殊日期" />
              <el-select v-model="sp.type" style="width: 140px" aria-label="类型"><el-option value="休息" label="休息" /><el-option value="调整营业时间" label="调整营业时间" /></el-select>
              <template v-if="sp.type !== '休息'">
                <el-time-select v-model="sp.from" start="06:00" step="00:30" end="23:30" :clearable="false" style="width: 112px" aria-label="开门" />
                <el-time-select v-model="sp.to" start="06:00" step="00:30" end="23:30" :clearable="false" style="width: 112px" aria-label="关门" />
              </template>
              <el-input v-model="sp.note" maxlength="20" placeholder="备注，例如 元旦休息" style="width: 190px" aria-label="备注" />
              <el-button :loading="sp.busy" @click="addSpecial">添加</el-button>
            </div>
            <el-alert v-if="sp.err" type="error" show-icon :closable="false" :title="sp.err" class="gap-top" />
          </el-tab-pane>

          <el-tab-pane label="公告" name="note">
            <el-form label-position="top" @submit.prevent>
              <el-form-item label="公告内容（显示在小程序门店页顶部，最多 100 字）"><el-input v-model="notice.text" type="textarea" :rows="3" maxlength="100" show-word-limit aria-label="小程序公告" /></el-form-item>
            </el-form>
            <el-alert v-if="notice.err" type="error" show-icon :closable="false" :title="notice.err" class="gap-top" />
            <p class="section-title">小程序里的显示</p>
            <el-card shadow="never" class="phone" :body-style="PHONE_BODY">
              <div class="callout-head"><span class="strong">{{ cur.name }}</span><LzStatusTag :type="curState.type" :text="curState.label" /></div>
              <div class="muted">今日 {{ hoursToday(cur) }} · {{ cur.modes.join(' / ') }}</div>
              <el-text class="phone-note">{{ notice.text.trim() || '（暂无公告）' }}</el-text>
              <el-button size="small" :type="curState.k === 'OPEN' ? 'primary' : 'default'" disabled>{{ curState.k === 'OPEN' ? '开始点餐' : '暂停营业' }}</el-button>
            </el-card>
            <div class="actions"><span class="grow" /><el-button type="primary" :loading="notice.busy" @click="saveNotice">保存公告</el-button></div>
          </el-tab-pane>

          <el-tab-pane label="操作记录" name="trail">
            <el-timeline v-if="trail.length" class="trail">
              <el-timeline-item v-for="a in trail" :key="a.id" :timestamp="a.at + ' · ' + a.actor + ' · ' + a.result">{{ a.action }}</el-timeline-item>
            </el-timeline>
            <el-empty v-else :image-size="64" description="还没有对这家门店的操作记录" />
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <LzDialog v-model="ps.open" :title="'停业：' + (ps.s?.name || '')" width="480px" danger confirm-text="确认停业" :confirm-disabled="!ps.note.trim()" :on-confirm="doPause">
        <el-alert type="warning" show-icon :closable="false" title="停业会影响" :description="`待支付订单 ${pauseNums.unpaid} 笔：顾客不能再支付，超时后自动关闭；待履约订单 ${pauseNums.toFulfil} 笔：需要继续出餐，或联系顾客退款。停业后小程序里商品和价格仍可浏览，下单按钮变成“暂停营业”。`" />
        <el-form label-position="top" class="gap-top" @submit.prevent>
          <el-form-item label="恢复时间"><el-select v-model="ps.resume" style="width: 100%"><el-option v-for="[v, l] in pauseOpts" :key="v" :value="v" :label="l" /></el-select></el-form-item>
          <el-form-item label="小程序提示文案（必填，顾客会看到这句话）"><el-input v-model="ps.note" type="textarea" :rows="2" maxlength="60" show-word-limit @input="ps.touched = true" /></el-form-item>
        </el-form>
        <p class="section-title">小程序里的显示</p>
        <el-card shadow="never" class="phone" :body-style="PHONE_BODY">
          <div class="callout-head"><span class="strong">{{ ps.s?.name }}</span><LzStatusTag type="warning" text="暂停营业" /></div>
          <el-text class="phone-note">{{ ps.note.trim() || '（请填写提示文案）' }}</el-text>
          <el-button size="small" disabled>暂停营业</el-button>
        </el-card>
      </LzDialog>

      <LzDialog v-model="ed.open" :title="ed.s ? '编辑门店：' + ed.s.name : '新增门店'" width="520px" :confirm-text="ed.s ? '保存' : '创建'" :on-confirm="doEdit">
        <p class="muted">{{ ed.s ? '门店编码创建后不能修改。' : '新门店创建后默认营业，可以在详情里设置每周时间和特殊日期。' }}</p>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="门店名称"><el-input v-model="ed.name" maxlength="30" /></el-form-item>
          <el-form-item label="门店编码（字母或数字 3 到 10 位）"><el-input v-model="ed.code" maxlength="10" :disabled="!!ed.s" /></el-form-item>
          <el-form-item label="详细地址"><el-input v-model="ed.addr" maxlength="60" /></el-form-item>
          <el-form-item label="联系电话（对会员公开）"><el-input v-model="ed.phone" maxlength="14" placeholder="例如 0571-8800-0001" /></el-form-item>
          <div class="two">
            <el-form-item label="开门时间"><el-time-select v-model="ed.from" start="06:00" step="00:30" end="23:30" :clearable="false" style="width: 100%" /></el-form-item>
            <el-form-item label="关门时间"><el-time-select v-model="ed.to" start="06:00" step="00:30" end="23:30" :clearable="false" style="width: 100%" /></el-form-item>
          </div>
          <el-form-item label="取餐方式"><el-checkbox-group v-model="ed.modes"><el-checkbox v-for="m in MODES" :key="m" :value="m" :label="m" /></el-checkbox-group></el-form-item>
        </el-form>
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.page { grid-template-columns: minmax(0, 1fr); }
.strong { font-weight: 600; }
.stage { position: relative; height: clamp(620px, calc(100dvh - 190px), 780px); overflow: hidden; border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); background: var(--luz-surface); }
.map { position: absolute; inset: 0; }
.map-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.land { fill: var(--el-fill-color-lighter); }
.blocks rect { fill: var(--el-fill-color); }
.park { fill: var(--luz-success-tint); }
.water { fill: var(--luz-info-tint); }
.river { fill: none; stroke: var(--luz-info-tint); stroke-width: 58px; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.river-in { fill: none; stroke: var(--el-color-primary-light-9); stroke-width: 40px; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.casing { fill: none; stroke: var(--luz-line); vector-effect: non-scaling-stroke; }
.road { fill: none; stroke: var(--luz-surface); vector-effect: non-scaling-stroke; }
.casing.main { stroke-width: 18px; } .road.main { stroke-width: 14px; }
.casing.side { stroke-width: 10px; } .road.side { stroke-width: 6px; }
.district { position: absolute; transform: translate(-50%, -50%); color: var(--luz-ink-2); letter-spacing: 2px; pointer-events: none; }
.pin { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; }
.pin.dim { opacity: 0.35; }
.pin-name { margin-top: 2px; padding: 0 6px; border-radius: 6px; background: var(--luz-surface); color: var(--luz-ink); white-space: nowrap; box-shadow: var(--luz-level-1); }
.callout { display: grid; gap: 6px; justify-items: start; }
.callout-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
.map-error { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--luz-surface); border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); padding: 16px 32px; }

.panel { position: absolute; z-index: 2; min-width: 0; }
.tl { left: 16px; top: 16px; width: 400px; max-width: calc(100% - 32px); }
.tl .chips { display: flex; margin-top: 12px; flex-wrap: wrap; }
.tr { right: 16px; top: 16px; width: 330px; max-width: calc(100% - 32px); }
.sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.bottom { left: 16px; right: 16px; bottom: 16px; }
.strip { display: flex; gap: 12px; padding-bottom: 6px; }
.scard { flex: none; width: 250px; cursor: pointer; }
.scard.on { border-color: var(--luz-action); }
.scard-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ell { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-card { max-width: 420px; margin: 0 auto; }

.kpi-row { margin-bottom: 12px; row-gap: 8px; }
.note { margin-left: 8px; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.section-title { margin: 16px 0 8px; font-weight: 600; }
.gap-top { margin-top: 12px; }
.add-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.phone { max-width: 340px; background: var(--luz-canvas); }
.phone-note { color: var(--luz-ink); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.trail { padding-left: 4px; }

@media (max-width: 900px) {
  .stage { height: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; overflow: visible; border: 0; background: transparent; }
  .map { position: relative; inset: auto; height: 340px; overflow: hidden; border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); background: var(--luz-surface); }
  .panel { position: static; width: auto; max-width: none; }
  .map-error { padding: 8px 16px; width: calc(100% - 32px); }
}
</style>
