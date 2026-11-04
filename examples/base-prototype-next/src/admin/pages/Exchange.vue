<script>
// 导入导出（横带分层）：任务概览、近 14 天任务量、任务明细（导出任务与导入任务）。
// 导出：预计不超过 5000 行直接下载，更多的转成后台任务并自动推进；导入：五步（下载模板、选择文件、校验预览、确认导入、结果），真的改 state.db 的商品或会员并写操作日志。
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { K, yuan, maskPhone } from '../../shared/format.js'

export const meta = {
  id: 'exchange', label: '导入导出', icon: 'download', group: '系统', order: 2, roles: ['A'],
  layout: '横带分层',
  reason: '运营先要知道“有没有任务卡住、失败了几个”，再看近 14 天的任务量有没有异常，最后才去任务明细里下载、重试或做一次导入；结论到细节自上而下，所以用三条横带，不用左右分栏',
  scenes: [
    { id: 'no-tasks', label: '还没有任何导入导出任务' },
    { id: 'export-timeout', label: '导出失败：数据太多，生成超时' },
    { id: 'import-bad-file', label: '导入失败：文件表头和模板对不上' },
  ],
}

const SYNC_LIMIT = 5000
const HARD_LIMIT = 50000
const RANGES = [['7', '近 7 天', 7], ['30', '近 30 天', 30], ['90', '近 90 天', 90], ['365', '近 1 年', 365], ['all', '全部时间', 1095]]
const KIND_NAME = { 储值: '储值流水' }
const kindOf = (t) => KIND_NAME[t.kind] || t.kind
const dayKey = (back) => K.ymd(K.addDays(K.today(), -back))
const stamp = () => B.fmt(B.NOW())
const todayKey = () => stamp().slice(0, 10)
const num = (v) => Number(v).toLocaleString('zh-CN')

// 导出类型：每天大约有多少行、可选的列（中文表头）、可加的筛选
const EXPORTS = {
  订单: {
    per: 110, mask: '手机号', rows: (db) => db.orders, date: 'createdAt', fkey: 'status',
    filter: { label: '订单状态', opts: [['all', '全部状态', 1], ['DONE', '已完成', 0.55], ['PAID', '待履约', 0.1], ['CANCELLED', '已取消', 0.08], ['REFUNDED', '已退款', 0.06]] },
    get: { 订单号: (o) => o.no, 下单时间: (o) => o.createdAt, 会员: (o) => o.userName, 手机号: (o, db) => maskPhone(db.users.find((u) => u.id === o.userId)?.phone), 商品: (o) => o.items.map((i) => i.name + '×' + i.qty).join('；'), '实付金额（元）': (o) => yuan(o.amount), '优惠金额（元）': (o) => yuan(o.discount), 支付方式: (o) => B.PAY[o.pay], 状态: (o) => B.ORDER_STATUS[o.status], 备注: (o) => o.remark },
  },
  会员: {
    per: 3.4, mask: '手机号', dateLabel: '加入时间', rows: (db) => db.users, date: 'joined', fkey: 'level',
    filter: { label: '会员等级', opts: [['all', '全部等级', 1], ['金卡', '金卡', 0.12], ['银卡', '银卡', 0.28], ['普通', '普通', 0.6]] },
    get: { 姓名: (u) => u.name, 手机号: (u) => maskPhone(u.phone), 会员等级: (u) => u.level, 积分: (u) => u.points, '储值余额（元）': (u) => yuan(u.balance), 加入日期: (u) => u.joined, 状态: (u) => (u.status === 'ENABLED' ? '正常' : '已禁用') },
  },
  储值流水: {
    per: 290, rows: (db) => db.walletLogs, date: 'at', fkey: 'kind',
    filter: { label: '流水类型', opts: [['all', '全部类型', 1], ['充值', '充值', 0.2], ['消费', '消费', 0.55], ['退款', '退款', 0.1], ['赠送', '赠送', 0.15]] },
    get: { 流水时间: (l) => l.at, 会员: (l) => l.userName, 类型: (l) => l.kind, '金额（元）': (l) => yuan(l.amount), 关联单号: (l) => l.ref },
  },
  审计: {
    per: 75, rows: (db) => db.audit, date: 'at', fkey: 'result',
    filter: { label: '结果', opts: [['all', '全部结果', 1], ['成功', '成功', 0.93], ['失败', '失败', 0.07]] },
    get: { 操作时间: (a) => a.at, 操作人: (a) => a.actor, 操作: (a) => a.action, 对象: (a) => a.target, 结果: (a) => a.result, '来源地址（脱敏）': (a) => String(a.ip || '').replace(/\.\d+$/, '.*'), 请求编号: (a) => a.trace },
  },
}
Object.values(EXPORTS).forEach((e) => { e.cols = Object.keys(e.get) })
const KIND_LIST = [...Object.keys(EXPORTS), '通知']

/** 按任务记下的条件，从演示数据里取出真正的行，生成文件内容（原型里的文件只含最多 500 行示例数据） */
function buildExport(t) {
  const db = state.db, kind = kindOf(t), T = EXPORTS[kind], spec = t.spec || {}
  if (!T) return { header: ['任务名', '类型', '行数', '导出时间', '导出人'], rows: [[t.name, kind, t.rows, t.at, t.by]] }
  const cols = spec.cols || T.cols, days = spec.days || 0, since = days && days < 1095 ? dayKey(days - 1) : '', fv = spec.filter && spec.filter !== 'all' ? spec.filter : ''
  const rows = T.rows(db).filter((r) => (!since || String(r[T.date]) >= since) && (!fv || r[T.fkey] === fv)).slice(0, 500).map((r) => cols.map((c) => T.get[c](r, db)))
  return { header: cols, rows }
}

// 文本开头是公式字符的加引号前缀，防止在表格软件里被当作公式执行
const cell = (v) => { if (v == null) return ''; let s = String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const toCsv = (header, rows) => '﻿' + [header].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n')
function saveFile(name, header, rows) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }))
  a.download = name; a.hidden = true
  document.body.append(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1500)
}

// 导入类型：模板说明与示例文件
const IMPORTS = {
  商品: { noun: '个商品', unit: '个', key: '商品名称', page: 'products', pageName: '商品', cols: [['商品名称', '必填', '最多 20 个字；名称相同的商品会被更新，不会重复新增'], ['分类', '必填', '热销、主食、轻食、早餐 四选一'], ['价格（元）', '必填', '0.01 到 999.99，最多两位小数'], ['库存', '选填', '0 到 9999 的整数，不填按 50'], ['状态', '选填', '上架或下架，不填按上架'], ['描述', '选填', '最多 40 个字']], sample: [['香煎三文鱼饭', '主食', '28.00', '40', '上架', '香煎三文鱼配时蔬'], ['红烧鸡腿饭', '主食', '19.00', '60', '上架', '']] },
  会员: { noun: '位会员', unit: '位', key: '手机号', page: 'members', pageName: '会员', cols: [['姓名', '必填', '最多 10 个字'], ['手机号', '必填', '11 位数字；手机号相同的会员会被更新，不会重复新增'], ['会员等级', '选填', '普通、银卡、金卡，不填按普通'], ['积分', '选填', '0 以上的整数'], ['储值余额（元）', '选填', '0 以上，最多两位小数']], sample: [['孙晓雨', '13900000101', '银卡', '300', '50.00'], ['郑思远', '13900000102', '普通', '0', '0']] },
}
const SAMPLES = [['mixed', '示例一：有几行填错了'], ['clean', '示例二：全部填对了'], ['header', '示例三：表头和模板对不上']]
const STEPS = ['下载模板', '选择文件', '校验预览', '确认导入', '导入结果']
const catId = (name) => B.CATS.find((c) => c.name === name)?.id
const catName = (id) => B.CATS.find((c) => c.id === id)?.name || id

function sampleRows(kind, sample) {
  const P = state.db.products, U = state.db.users
  if (kind === '商品') {
    const up = (p, d, st) => [p.name, catName(p.cat), (p.price / 100 + d).toFixed(2), String(st), '上架', '']
    const all = [['香煎三文鱼饭', '主食', '28.00', '40', '上架', '香煎三文鱼配时蔬'], up(P[0], 1, 90), ['照烧鸡排饭', '主食', '19.50', '55', '上架', '照烧酱汁鸡排'], ['', '主食', '16.00', '30', '上架', ''], up(P[2], 0.5, 70), ['咖喱牛肉饭', '主食', 'abc', '35', '上架', ''], ['番茄鸡蛋面', '主食', '13.00', '45', '上架', ''], ['杨枝甘露', '甜品', '12.00', '30', '上架', ''], ['南瓜小米粥', '早餐', '9.00', '80', '上架', '暖胃小米粥'], ['香煎三文鱼饭', '主食', '28.00', '40', '上架', ''], [P[4].name, catName(P[4].cat), (P[4].price / 100).toFixed(2), '65', '下架', ''], ['蔬菜沙拉', '轻食', '15.00', '-5', '上架', '']]
    return sample === 'clean' ? [all[0], all[1], all[2], all[4], all[6], all[8], all[10], ['鲜虾云吞面', '主食', '21.00', '35', '上架', '']] : all
  }
  const all = [['孙晓雨', '13900000101', '银卡', '300', '50.00'], [U[1].name, U[1].phone, '金卡', '2200', (U[1].balance / 100).toFixed(2)], ['郑思远', '13900000102', '普通', '0', '0'], ['', '13900000103', '普通', '0', '0'], ['周婷', '1390000', '银卡', '120', '0'], [U[3].name, U[3].phone, '银卡', '860', (U[3].balance / 100).toFixed(2)], ['冯浩', '13900000106', '钻石卡', '0', '0'], ['蒋文静', '13900000104', '普通', '40', '20.00'], ['沈佳怡', '13900000102', '普通', '0', '0'], ['韩雪', '13900000105', '普通', '0', '0']]
  return sample === 'clean' ? [all[0], all[1], all[2], all[5], all[7], all[9]] : all
}

/** 逐行校验：每行给出 新增、更新或失败，失败写清行号对应的原因（业务语言）；同一文件里重复的唯一键，第二次出现的行判为失败 */
function validateRows(kind, rows) {
  const db = state.db, seen = {}, out = []
  rows.forEach((raw, i) => {
    const line = i + 2, cellOf = (k) => String(raw[k] == null ? '' : raw[k]).trim()
    const row = { line, raw, kind: 'new', reason: '', norm: null, note: '' }
    const fail = (why) => { row.kind = 'fail'; row.reason = why; return row }
    out.push(row)
    if (kind === '商品') {
      const name = cellOf(0), cat = cellOf(1), price = cellOf(2), stock = cellOf(3), st = cellOf(4), desc = cellOf(5)
      if (!name) return fail('商品名称为空')
      if ([...name].length > 20) return fail('商品名称不能超过 20 个字')
      if (!catId(cat)) return fail('分类「' + cat + '」不存在，可选：' + B.CATS.map((c) => c.name).join('、'))
      if (price === '' || isNaN(Number(price))) return fail('价格不是数字，请填写如 18.00')
      if (!/^\d+(\.\d{1,2})?$/.test(price) || +price < 0.01 || +price > 999.99) return fail('价格要在 0.01 到 999.99 之间，最多两位小数')
      if (stock !== '' && (!/^\d+$/.test(stock) || +stock > 9999)) return fail('库存必须是 0 到 9999 的整数')
      if (st && !['上架', '下架'].includes(st)) return fail('状态只能填上架或下架')
      if ([...desc].length > 40) return fail('描述不能超过 40 个字')
      if (seen[name]) return fail('商品名称与第 ' + seen[name] + ' 行重复')
      seen[name] = line
      row.norm = { name, cat: catId(cat), price: Math.round(price * 100), stock: stock === '' ? 50 : +stock, status: st === '下架' ? 'OFF' : 'ON', desc }
      const old = db.products.find((p) => p.name === name)
      if (old) {
        row.kind = 'update'; row.target = old
        const ch = []
        if (old.price !== row.norm.price) ch.push('价格 ¥' + yuan(old.price) + ' → ¥' + yuan(row.norm.price))
        if (old.stock !== row.norm.stock) ch.push('库存 ' + old.stock + ' → ' + row.norm.stock)
        if (old.status !== row.norm.status) ch.push('状态 ' + (old.status === 'ON' ? '上架' : '下架') + ' → ' + (row.norm.status === 'ON' ? '上架' : '下架'))
        if (old.cat !== row.norm.cat) ch.push('分类 ' + catName(old.cat) + ' → ' + catName(row.norm.cat))
        row.note = ch.join('；') || '没有变化'
      } else row.note = '新增：¥' + yuan(row.norm.price) + '，库存 ' + row.norm.stock
    } else {
      const name = cellOf(0), phone = cellOf(1), level = cellOf(2), pts = cellOf(3), bal = cellOf(4)
      if (!name) return fail('姓名为空')
      if ([...name].length > 10) return fail('姓名不能超过 10 个字')
      if (!/^1[3-9]\d{9}$/.test(phone)) return fail('手机号格式不对，应为 11 位数字')
      if (level && !['普通', '银卡', '金卡'].includes(level)) return fail('会员等级「' + level + '」不存在，可选：普通、银卡、金卡')
      if (pts !== '' && !/^\d+$/.test(pts)) return fail('积分必须是 0 以上的整数')
      if (bal !== '' && !/^\d+(\.\d{1,2})?$/.test(bal)) return fail('储值余额必须是 0 以上的金额，最多两位小数')
      if (seen[phone]) return fail('手机号与第 ' + seen[phone] + ' 行重复')
      seen[phone] = line
      row.norm = { name, phone, level: level || '普通', points: pts === '' ? 0 : +pts, balance: bal === '' ? 0 : Math.round(bal * 100) }
      const old = db.users.find((u) => u.phone === phone)
      if (old) {
        row.kind = 'update'; row.target = old
        const ch = []
        if (old.level !== row.norm.level) ch.push('等级 ' + old.level + ' → ' + row.norm.level)
        if (old.points !== row.norm.points) ch.push('积分 ' + old.points + ' → ' + row.norm.points)
        if (old.balance !== row.norm.balance) ch.push('储值 ¥' + yuan(old.balance) + ' → ¥' + yuan(row.norm.balance))
        row.note = ch.join('；') || '没有变化'
      } else row.note = '新增：' + row.norm.level + '，积分 ' + row.norm.points
    }
  })
  return out
}

/** 把校验通过的行真的写进 state.db 的商品或会员 */
function applyRows(kind, res) {
  const db = state.db
  res.filter((r) => r.kind !== 'fail').forEach((r) => {
    if (kind === '商品') {
      if (r.kind === 'update') Object.assign(r.target, { price: r.norm.price, stock: r.norm.stock, status: r.norm.status, cat: r.norm.cat, desc: r.norm.desc || r.target.desc })
      else {
        const id = Math.max(0, ...db.products.map((p) => p.id)) + 1, tpl = db.products[id % 12] || db.products[0]
        db.products.push({ id, name: r.norm.name, price: r.norm.price, orig: Math.round((r.norm.price * 1.2) / 100) * 100, cat: r.norm.cat, desc: r.norm.desc, img: tpl.img, sales: 0, stock: r.norm.stock, status: r.norm.status, specs: tpl.specs, tags: ['新品'], sort: id })
      }
    } else if (r.kind === 'update') Object.assign(r.target, { name: r.norm.name, level: r.norm.level, points: r.norm.points, balance: r.norm.balance })
    else {
      const id = Math.max(0, ...db.users.map((u) => u.id)) + 1
      db.users.push({ id, name: r.norm.name, phone: r.norm.phone, level: r.norm.level, points: r.norm.points, balance: r.norm.balance, joined: todayKey(), status: 'ENABLED', orders: 0, spent: 0, openidHint: 'o' + (100000 + id) })
    }
  })
}

// 近 14 天里更早的任务量（任务明细只列最近的几条，更早的只留数量），固定随机种子，重置演示数据时不变
const HIST = (() => { const r = B.rng(131); return Array.from({ length: 14 }, (_, i) => ({ day: dayKey(13 - i), exp: i === 13 ? 0 : 2 + Math.floor(r() * 6), imp: r() < 0.3 ? 1 : 0, fail: r() < 0.25 ? 1 : 0 })) })()

/** 演示数据：给底座的任务补上进度、失败原因、条件与导入明细；已补过的不再动（重置演示数据后重新补） */
function seedExchange(db) {
  db.exportTasks.forEach((t) => {
    if (t._seed !== undefined) return
    t._seed = true
    if (t.status === 'RUNNING') t.progress = 38
    if (t.status === 'FAILED') t.fail = '导出过程中连接中断，文件没有生成'
    t.cond = { 1: '范围：近 30 天；订单状态：全部状态', 2: '范围：全部时间；会员等级：全部等级', 3: '范围：本月；流水类型：全部类型', 4: '范围：上周；结果：全部结果' }[t.id] || '范围：全部'
  })
  db.importTasks.forEach((t) => {
    if (t._seed !== undefined) return
    t._seed = true
    if (t.id === 1) { t.added = 30; t.updated = 15; t.failRows = [{ line: 7, reason: '价格不是数字，请填写如 18.00', raw: ['黑椒意面', '主食', '二十', '40', '上架', ''] }, { line: 19, reason: '分类「甜品」不存在，可选：热销、主食、轻食、早餐', raw: ['杨枝甘露', '甜品', '12.00', '30', '上架', ''] }, { line: 33, reason: '商品名称与第 12 行重复', raw: ['招牌牛腩饭', '主食', '22.00', '50', '上架', ''] }] }
    else { t.added = t.ok; t.updated = 0; t.failRows = [] }
  })
}

// 后台任务自动推进：每 2 秒多一步，完成或失败时提示；离开页面也照常推进
let ticker = null
function tick() {
  state.db.exportTasks.filter((t) => t.status === 'RUNNING').forEach((t) => {
    t.progress = Math.min(100, (t.progress || 0) + 9 + ((t.id * 7) % 11))
    if (t.failAt && t.progress >= t.failAt) { t.status = 'FAILED'; t.fail = '生成超时，数据量较大，请缩小时间范围后重试'; ElMessage.error('导出失败：' + t.name) }
    else if (t.progress >= 100) { t.status = 'DONE'; t.progress = 100; ElMessage.success('导出完成：' + t.name) }
  })
}
</script>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Plus, Refresh, Search, Upload, UploadFilled } from '@element-plus/icons-vue'
import { useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { usePager } from '../use-pager.js'

const scene = useScene('exchange')
const router = useRouter()
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(() => { load(); if (!ticker) ticker = setInterval(tick, 2000) })
seedExchange(state.db)

const meName = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
/** 每个写操作留一条操作日志（含修改前后与原因） */
function audit(code, action, target, o = {}) {
  const db = state.db
  db.audit.unshift({ id: Math.max(0, ...db.audit.map((x) => x.id || 0)) + 1, at: stamp(), actor: meName.value, code, action, target, result: o.result || '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16), ...(o.diff ? { diff: o.diff } : {}), ...(o.reason ? { reason: o.reason } : {}) })
}
/** 要等服务器的一步：失败时写明原因与影响（场景给出的失败文案原样保留） */
async function net(ms, fail) {
  try { await request(ms, { fail }) } catch (e) { throw e.name === 'NetError' ? new Error(e.message + '，操作没有完成，数据没有改动，请重试') : e }
}
const failMsg = (e) => (e?.message || '操作失败，请重试')

// 两个确认框共用一个：对象、数量和后果写清楚，危险的用红按钮
const ask = reactive({ open: false, title: '', text: '', danger: false, confirmText: '确定', run: null })
const askOpen = (o) => Object.assign(ask, { open: true, danger: false, confirmText: '确定', run: null, ...o })

// ---- 数据：当前场景下可见的任务
const exps = computed(() => (scene.value === 'no-tasks' ? state.db.exportTasks.filter((t) => !t._seed) : state.db.exportTasks))
const imps = computed(() => (scene.value === 'no-tasks' ? state.db.importTasks.filter((t) => !t._seed) : state.db.importTasks))
watch(scene, (s) => { if (s === 'export-timeout') state.db.exportTasks.forEach((t) => { if (t.status === 'RUNNING') t.failAt = 60 }) }, { immediate: true })

// ---- 带一：概览数字
const stats = computed(() => {
  const ex = exps.value, im = imps.value, running = ex.filter((t) => t.status === 'RUNNING'), failed = ex.filter((t) => t.status === 'FAILED')
  const month = todayKey().slice(0, 7)
  const monthCnt = ex.filter((t) => t.at.startsWith(month) && t.status !== 'FAILED').length + (scene.value === 'no-tasks' ? 0 : HIST.filter((d) => d.day.startsWith(month)).reduce((s, d) => s + d.exp, 0))
  const okRows = im.reduce((s, t) => s + t.ok, 0), allRows = im.reduce((s, t) => s + t.total, 0)
  return { running: running.length, failed: failed.length, monthCnt, rate: allRows ? ((okRows / allRows) * 100).toFixed(1) : '—', hasRate: !!allRows }
})

// ---- 带二：近 14 天任务量
const days = HIST.map((d) => d.day)
const daily = computed(() => days.map((d) => {
  const base = scene.value === 'no-tasks' ? { exp: 0, imp: 0, fail: 0 } : HIST.find((x) => x.day === d)
  const e = exps.value.filter((t) => !t._seed && t.at.startsWith(d)), m = imps.value.filter((t) => !t._seed && t.at.startsWith(d))
  return { exp: base.exp + e.filter((t) => t.status !== 'FAILED').length, imp: base.imp + m.length, fail: base.fail + e.filter((t) => t.status === 'FAILED').length }
}))
const chartSeries = computed(() => [{ name: '导出', data: daily.value.map((d) => d.exp) }, { name: '导入', data: daily.value.map((d) => d.imp) }, { name: '失败', data: daily.value.map((d) => d.fail) }])
const chartSum = computed(() => daily.value.reduce((s, d) => s + d.exp + d.imp + d.fail, 0))
const chartNote = computed(() => {
  const tot = daily.value.map((d) => d.exp + d.imp + d.fail), peak = tot.indexOf(Math.max(...tot)), sum = (k) => daily.value.reduce((s, d) => s + d[k], 0)
  return `近 14 天共 ${chartSum.value} 个任务，导出 ${sum('exp')} 个、导入 ${sum('imp')} 个，其中 ${sum('fail')} 个失败；任务最多的一天是 ${days[peak].slice(5)}（${tot[peak]} 个）。`
})

// ---- 带三：任务明细。默认视图是需要关注的（失败和进行中），全部只是一个选项
const tab = ref('exports')
const TABS = [['ATTN', '需关注'], ['FAILED', '失败'], ['RUNNING', '进行中'], ['DONE', '已完成'], ['ALL', '全部']]
const f = reactive({ status: 'ATTN', kind: '', q: '' })
const base = computed(() => exps.value.filter((t) => (!f.kind || kindOf(t) === f.kind) && (!f.q.trim() || t.name.includes(f.q.trim()))))
const inStatus = (t, s) => (s === 'ALL' ? true : s === 'ATTN' ? t.status !== 'DONE' : t.status === s)
const count = (s) => base.value.filter((t) => inStatus(t, s)).length
const expRows = computed(() => base.value.filter((t) => inStatus(t, f.status)))
const dirty = computed(() => f.status !== 'ATTN' || f.kind || f.q)
const resetFilter = () => Object.assign(f, { status: 'ATTN', kind: '', q: '' })
const pager = usePager('exchange')
const list = computed(() => (tab.value === 'exports' ? expRows.value : imps.value))
const rows = pager.slice(list)
watch([() => ({ ...f }), tab], () => pager.reset())
const exportStatus = computed(() => (phase.value !== 'ok' ? phase.value : expRows.value.length ? 'ok' : 'empty'))
const importStatus = computed(() => (phase.value !== 'ok' ? phase.value : imps.value.length ? 'ok' : 'empty'))
const exportEmpty = computed(() => (!exps.value.length ? '还没有导出任务，点右上角“新建导出”试试' : f.status === 'ATTN' && !f.kind && !f.q ? '没有失败或进行中的任务，可以切到“全部”查看' : '没有符合条件的导出任务'))

// ---- 导出任务的操作
const busy = ref('')
const fileOf = (t) => t.name.replace(/\.xlsx$/, '') + '.csv'
async function download(t) {
  busy.value = 'dl' + t.id
  try {
    await net(400)
    const b = buildExport(t)
    saveFile(fileOf(t), b.header, b.rows)
    audit('export', '下载导出文件', t.name)
    ElMessage.success('已开始下载 ' + fileOf(t))
  } catch (e) { ElMessage.error(failMsg(e)) } finally { busy.value = '' }
}
const resubmit = (t) => Object.assign(t, { status: 'RUNNING', progress: 0, fail: '', at: stamp(), failAt: scene.value === 'export-timeout' ? 60 : 0 })
async function retry(t) {
  busy.value = 'rt' + t.id
  try { await net(500); resubmit(t); audit('export', '重新提交导出', t.name); ElMessage.success('已重新提交，生成完成后会提示你') } catch (e) { ElMessage.error(failMsg(e)) } finally { busy.value = '' }
}
const askDelete = (t) => askOpen({
  title: '删除导出任务', danger: true, confirmText: '确认删除', text: `删除任务「${t.name}」后无法再下载这份文件，导出记录只在操作日志里保留。`,
  run: async () => { await net(400); state.db.exportTasks.splice(state.db.exportTasks.indexOf(t), 1); audit('export', '删除导出任务', t.name); ElMessage.success('已删除任务') },
})

// 详情
const detail = reactive({ open: false, t: null, tab: 'info' })
const openTask = (t) => Object.assign(detail, { open: true, t, tab: 'info' })
const detailCols = computed(() => { const t = detail.t; if (!t) return []; return t.spec?.cols || EXPORTS[kindOf(t)]?.cols || [] })
const detailLogs = computed(() => (detail.t ? state.db.audit.filter((a) => a.target === detail.t.name).slice(0, 8) : []))
const detailAct = computed(() => (detail.t?.status === 'DONE' ? { text: '下载', run: () => download(detail.t) } : detail.t?.status === 'FAILED' ? { text: '重试', run: () => retry(detail.t) } : null))
const detailConfirm = async () => { await detailAct.value.run() }

// ---- 新建导出：类型、范围、筛选、列；预计行数决定直接下载、转后台任务还是不能导
const nx = reactive({ open: false, kind: '订单', range: '30', filter: 'all', cols: [] })
const T = computed(() => EXPORTS[nx.kind])
const rangeOf = computed(() => RANGES.find((r) => r[0] === nx.range))
const estimate = computed(() => Math.max(1, Math.round(T.value.per * rangeOf.value[2] * (T.value.filter.opts.find((o) => o[0] === nx.filter)?.[2] ?? 1))))
const nxName = computed(() => `${nx.kind}_${nx.filter !== 'all' ? T.value.filter.opts.find((o) => o[0] === nx.filter)[1] + '_' : ''}${rangeOf.value[1].replace(/ /g, '')}_${todayKey()}.xlsx`)
const nxTip = computed(() => {
  const n = estimate.value
  return n > HARD_LIMIT ? { type: 'error', text: `预计 ${num(n)} 行，超过单次上限 ${num(HARD_LIMIT)} 行，请缩短时间范围或加上筛选条件。` }
    : n > SYNC_LIMIT ? { type: 'warning', text: `预计 ${num(n)} 行，超过 ${num(SYNC_LIMIT)} 行，会转成后台任务，完成后在任务列表里下载，离开页面也会继续。` }
      : { type: 'success', text: `预计 ${num(n)} 行，不超过 ${num(SYNC_LIMIT)} 行，点“开始导出”后直接下载。` }
})
watch(() => nx.kind, () => { nx.filter = 'all'; nx.cols = [...EXPORTS[nx.kind].cols] })
const openExport = () => Object.assign(nx, { open: true, kind: '订单', range: '30', filter: 'all', cols: [...EXPORTS.订单.cols] })
async function doExport() {
  const n = estimate.value, asyncJob = n > SYNC_LIMIT
  if (!nx.cols.length) throw new Error('至少选 1 列再导出')
  if (n > HARD_LIMIT) throw new Error(`预计 ${num(n)} 行，超过单次上限 ${num(HARD_LIMIT)} 行，请缩短时间范围或加上筛选条件`)
  await net(600)
  const fl = T.value.filter.opts.find((o) => o[0] === nx.filter)[1], rg = rangeOf.value
  const t = { id: Math.max(0, ...state.db.exportTasks.map((x) => x.id)) + 1, name: nxName.value, kind: nx.kind, rows: n, status: asyncJob ? 'RUNNING' : 'DONE', at: stamp(), by: meName.value, cond: `范围：${rg[1]}；${T.value.filter.label}：${fl}；列：${nx.cols.length} 项`, spec: { cols: T.value.cols.filter((c) => nx.cols.includes(c)), days: rg[2], filter: nx.filter === 'all' ? '' : nx.filter }, progress: asyncJob ? 0 : 100, failAt: asyncJob && scene.value === 'export-timeout' ? 60 : 0 }
  state.db.exportTasks.unshift(t)
  audit('export', '导出' + nx.kind, t.name, { diff: [['导出类型', '—', nx.kind], ['范围', '—', rg[1]], [T.value.filter.label, '—', fl], ['行数', '—', num(n)]] })
  tab.value = 'exports'; Object.assign(f, { status: 'ALL', kind: '', q: '' })
  if (asyncJob) ElMessage.info(`导出的行数较多（${num(n)} 行），已转成后台任务，完成后会提示你`)
  else { const b = buildExport(t); saveFile(fileOf(t), b.header, b.rows); ElMessage.success(`已导出 ${t.name}（${num(n)} 行）`) }
}

// ---- 导入：五步
const wizEl = ref(null)
const W = reactive({ kind: '商品', step: 0, sample: 'mixed', file: null, fileErr: '', res: null, header: '', busy: false, view: 'fail', ack: false, out: null, progress: 0 })
const I = computed(() => IMPORTS[W.kind])
const wizReset = (kind) => Object.assign(W, { kind: kind || W.kind, step: 0, file: null, fileErr: '', res: null, header: '', busy: false, view: 'fail', ack: false, out: null, progress: 0 })
const counts = computed(() => { const r = W.res || []; return { n: r.filter((x) => x.kind === 'new').length, u: r.filter((x) => x.kind === 'update').length, f: r.filter((x) => x.kind === 'fail').length, t: r.length } })
const viewRows = computed(() => (W.res || []).filter((r) => r.kind === W.view))
const rawText = (r) => r.raw.map((x) => (x === '' ? '（空）' : x)).join(' | ')
const goImport = () => { tab.value = 'imports'; nextTick(() => wizEl.value?.$el?.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'start' })) }
const onKind = (v) => {
  if (v === W.kind) return
  if (W.step > 0 && W.step < 4) askOpen({ title: '换导入类型', confirmText: '确认更换', text: `换成导入${v}后，已选的文件和校验结果会清掉。`, run: () => wizReset(v) })
  else wizReset(v)
}
function downloadTemplate() { saveFile(I.value.pageName + '导入模板.csv', I.value.cols.map((x) => x[0]), I.value.sample); ElMessage.success('已开始下载' + I.value.pageName + '导入模板') }
function onPick(file) {
  const raw = file.raw
  W.fileErr = ''; W.file = null
  if (!raw) return
  if (!/\.xlsx$/i.test(raw.name)) W.fileErr = '请上传 Excel 文件（.xlsx），不支持 .xls、.csv 或改了扩展名的文件'
  else if (!raw.size) W.fileErr = '无法读取这个文件，请使用导入模板填写后再上传'
  else W.file = { name: raw.name, rows: sampleRows(W.kind, W.sample).length, size: raw.size, real: true }
}
function pickSample(v) {
  W.sample = v
  W.file = { name: (v === 'header' ? '示例_表头不对' : v === 'clean' ? '示例_全部填对' : '示例_有几行填错') + '_' + I.value.pageName + '导入.xlsx', rows: sampleRows(W.kind, v).length, size: 18 * 1024, real: false }
  W.fileErr = ''
}
async function validate() {
  W.step = 2; W.res = null; W.header = ''; W.busy = true
  try { await net(700) } catch (e) { W.busy = false; W.step = 1; return ElMessage.error(failMsg(e)) }
  if (W.file.name.startsWith('示例_表头') || scene.value === 'import-bad-file') W.header = W.kind === '商品' ? '缺少“价格（元）”列，多了“售价”列' : '缺少“手机号”列，多了“电话”列'
  else W.res = validateRows(W.kind, sampleRows(W.kind, W.file.real ? 'mixed' : W.sample))
  W.view = W.res && counts.value.f ? 'fail' : 'new'; W.busy = false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, state.reducedMotion ? 30 : ms))
async function doImport() {
  const c = { ...counts.value }, noun = I.value.unit
  W.busy = true
  try {
    await net(300)
    for (let i = 1; i <= 4; i++) { W.progress = i * 25; await sleep(260) }
  } catch (e) { W.busy = false; W.progress = 0; return ElMessage.error(failMsg(e).replace('操作没有完成', '导入没有完成')) }
  applyRows(W.kind, W.res)
  const name = W.file.name, db = state.db
  db.importTasks.unshift({ id: Math.max(0, ...db.importTasks.map((x) => x.id)) + 1, name, kind: W.kind, total: c.t, ok: c.n + c.u, fail: c.f, added: c.n, updated: c.u, at: stamp(), by: meName.value, failRows: W.res.filter((r) => r.kind === 'fail').map((r) => ({ line: r.line, reason: r.reason, raw: r.raw })) })
  audit('import', '导入' + W.kind, name, { diff: [['新增', '—', c.n + ' ' + noun], ['更新', '—', c.u + ' ' + noun], ['失败', '—', c.f + ' 行']] })
  W.out = { ...c, res: W.res, name, kind: W.kind }; W.busy = false; W.step = 4; W.progress = 0
  c.n + c.u ? ElMessage.success(`导入完成：新增 ${c.n}，更新 ${c.u}，失败 ${c.f}`) : ElMessage.warning('没有导入任何数据')
}
function failCsv(kind, failRows, name) {
  saveFile(name.replace(/\.xlsx$/, '') + '_失败行.csv', IMPORTS[kind].cols.map((c) => c[0]).concat('失败原因'), failRows.map((r) => r.raw.concat(r.reason)))
  ElMessage.success('已开始下载失败行')
}
const prev = () => { W.step -= 1; if (W.step < 2) W.res = null }
const toConfirm = () => { W.step = 3; W.ack = false }
const downloadFailNow = () => failCsv(W.kind, W.res.filter((r) => r.kind === 'fail'), W.file.name)

// 导入详情
const idetail = reactive({ open: false, t: null })
const openImport = (t) => Object.assign(idetail, { open: true, t })
</script>

<template>
  <div class="lz-page">
    <LzState v-if="state.role !== 'A'" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Upload" @click="goImport">导入数据</el-button>
        <el-button type="primary" :icon="Plus" @click="openExport">新建导出</el-button>
      </div>

      <!-- band 1 -->
      <section aria-label="任务概览" class="lz-kpis">
        <LzKpi label="进行中的导出" :value="stats.running" suffix="个" />
        <LzKpi label="失败待重试" :value="stats.failed" suffix="个" />
        <LzKpi label="本月导出（不含失败）" :value="stats.monthCnt" suffix="次" />
        <LzKpi label="导入成功率" :value="stats.hasRate ? stats.rate : '—'" :suffix="stats.hasRate ? '%' : ''" />
      </section>

      <!-- band 2 -->
      <el-card shadow="never" class="lz-card" aria-label="近 14 天任务量">
        <LzState :status="chartSum ? 'ok' : 'empty'" empty-title="近 14 天没有导入导出任务">
          <LzChart kind="bar" :categories="days.map((d) => d.slice(5))" :series="chartSeries" :height="220" unit="" label="近 14 天导入导出任务量" />
          <p class="muted chart-note">{{ chartNote }}</p>
        </LzState>
      </el-card>

      <!-- band 3 -->
      <el-card shadow="never" class="lz-card" aria-label="任务明细">
        <el-tabs v-model="tab">
          <el-tab-pane name="exports"><template #label>导出任务<span class="tab-count num">{{ exps.length }}</span></template></el-tab-pane>
          <el-tab-pane name="imports"><template #label>导入任务<span class="tab-count num">{{ imps.length }}</span></template></el-tab-pane>
        </el-tabs>

        <!-- 导出任务 -->
        <template v-if="tab === 'exports'">
          <div class="lz-toolbar filters">
            <el-radio-group v-model="f.status" aria-label="任务状态">
              <el-radio-button v-for="[code, label] in TABS" :key="code" :value="code">{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></el-radio-button>
            </el-radio-group>
            <el-select v-model="f.kind" clearable placeholder="全部类型" style="width: 140px" aria-label="任务类型"><el-option v-for="k in KIND_LIST" :key="k" :value="k" :label="k" /></el-select>
            <el-input v-model="f.q" clearable placeholder="任务名" :prefix-icon="Search" style="width: 200px" aria-label="任务名" />
            <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
            <span class="grow" /><span class="muted">共 {{ expRows.length }} 条</span>
          </div>
          <LzState :status="exportStatus" :empty-title="exportEmpty" error-hint="任务列表没有加载出来，请检查网络后重试" @retry="load">
            <template #empty-action><el-button v-if="exps.length && f.status !== 'ALL'" type="primary" @click="f.status = 'ALL'">查看全部任务</el-button></template>
            <el-table :data="rows" size="large" row-key="id" :empty-text="exportEmpty">
              <el-table-column label="任务名" min-width="230"><template #default="{ row }"><el-button link type="primary" class="task-name" @click="openTask(row)">{{ row.name }}</el-button></template></el-table-column>
              <el-table-column label="类型" width="100" align="center"><template #default="{ row }">{{ kindOf(row) }}</template></el-table-column>
              <el-table-column label="行数（行）" width="110" align="right"><template #default="{ row }"><span class="num">{{ num(row.rows) }}</span></template></el-table-column>
              <el-table-column label="状态" width="170" align="center">
                <template #default="{ row }">
                  <div class="status-cell">
                    <LzStatusTag kind="task" :status="row.status" />
                    <el-progress v-if="row.status === 'RUNNING'" :percentage="row.progress || 0" :stroke-width="6" style="width: 120px" aria-label="导出进度" />
                    <span v-if="row.status === 'FAILED'" class="muted clamp-2">{{ row.fail || '导出失败' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="170" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
              <el-table-column label="创建人" width="100" align="center" prop="by" />
              <el-table-column label="操作" width="190" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openTask(row)">详情</el-button>
                  <el-button v-if="row.status === 'DONE'" link type="primary" :loading="busy === 'dl' + row.id" @click="download(row)">下载</el-button>
                  <el-button v-if="row.status === 'FAILED'" link type="primary" :loading="busy === 'rt' + row.id" @click="retry(row)">重试</el-button>
                  <el-button v-if="row.status !== 'RUNNING'" link type="danger" @click="askDelete(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="expRows.length" />
          </LzState>
        </template>

        <!-- 导入任务：五步向导加历史 -->
        <template v-else>
          <el-card ref="wizEl" shadow="never" class="lz-card wizard" aria-label="导入数据">
            <div class="lz-toolbar wiz-head">
              <el-radio-group :model-value="W.kind" :disabled="W.busy" aria-label="导入类型" @change="onKind"><el-radio-button value="商品">导入商品</el-radio-button><el-radio-button value="会员">导入会员</el-radio-button></el-radio-group>
              <span class="grow muted">按模板填好文件，先校验再导入，失败的行会告诉你原因</span>
            </div>
            <el-steps :active="W.step === 4 ? 5 : W.step" finish-status="success" align-center class="wiz-steps">
              <el-step v-for="s in STEPS" :key="s" :title="s" />
            </el-steps>

            <!-- 1 下载模板 -->
            <div v-if="W.step === 0" class="stack">
              <p>先下载导入模板，按模板填写后再上传。已有的{{ I.pageName }}（按{{ I.key }}判断）会被更新，其余新增；一次最多导入 500 行，只接受 .xlsx 文件。</p>
              <div><el-button :icon="Download" @click="downloadTemplate">下载导入模板</el-button></div>
              <el-table :data="I.cols" size="large" aria-label="模板的列说明">
                <el-table-column label="列" width="170" align="center"><template #default="{ row }"><span class="b">{{ row[0] }}</span></template></el-table-column>
                <el-table-column label="是否必填" width="110" align="center"><template #default="{ row }"><el-tag :type="row[1] === '必填' ? 'primary' : 'info'" effect="light">{{ row[1] }}</el-tag></template></el-table-column>
                <el-table-column label="怎么填" prop="2" />
              </el-table>
            </div>

            <!-- 2 选择文件 -->
            <div v-else-if="W.step === 1" class="stack">
              <el-upload drag :auto-upload="false" :show-file-list="false" accept=".xlsx" :on-change="onPick">
                <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                <div>把填好的 Excel 文件拖到这里，或<em>点击选择文件</em></div>
                <template #tip><div class="muted">.xlsx，最多 500 行</div></template>
              </el-upload>
              <el-alert v-if="W.fileErr" :title="W.fileErr" type="error" show-icon :closable="false" />
              <div v-if="W.file"><el-tag closable size="large" effect="light" @close="W.file = null">{{ W.file.name }} · {{ W.file.rows }} 行 · {{ Math.max(1, Math.round(W.file.size / 1024)) }} KB</el-tag></div>
              <div class="stack tight">
                <span class="muted">没有文件？用示例文件体验</span>
                <div class="row">
                  <el-button v-for="[v, l] in SAMPLES" :key="v" :type="W.file && !W.file.real && W.sample === v ? 'primary' : 'default'" :plain="!!(W.file && !W.file.real && W.sample === v)" @click="pickSample(v)">{{ l }}</el-button>
                </div>
                <span class="muted">选择真实文件时，原型里按示例一的内容校验，不读取文件里的数据。</span>
              </div>
            </div>

            <!-- 3 校验预览 -->
            <div v-else-if="W.step === 2" class="stack">
              <template v-if="W.busy"><p>正在逐行校验“{{ W.file.name }}”…</p><el-skeleton :rows="5" animated /></template>
              <template v-else-if="W.header">
                <el-alert type="error" show-icon :closable="false" :title="'文件格式不正确：' + W.header" description="请重新下载导入模板，按模板填写后再上传。" />
                <div class="row"><el-button @click="W.step = 1">重新选择文件</el-button><el-button text type="primary" @click="W.step = 0">回到下载模板</el-button></div>
              </template>
              <template v-else-if="W.res">
                <el-tabs v-model="W.view">
                  <el-tab-pane name="new"><template #label>将新增<span class="tab-count num" :class="{ zero: !counts.n }">{{ counts.n }}</span></template></el-tab-pane>
                  <el-tab-pane name="update"><template #label>将更新<span class="tab-count num" :class="{ zero: !counts.u }">{{ counts.u }}</span></template></el-tab-pane>
                  <el-tab-pane name="fail"><template #label>失败<span class="tab-count num" :class="{ zero: !counts.f }">{{ counts.f }}</span></template></el-tab-pane>
                </el-tabs>
                <p class="muted">共 {{ counts.t }} 行 = 新增 {{ counts.n }} + 更新 {{ counts.u }} + 失败 {{ counts.f }}（跳过 0）。失败的行不会导入，改好后可以只重传失败的行。</p>
                <div v-if="counts.f"><el-button :icon="Download" @click="downloadFailNow">只下载失败行</el-button></div>
                <el-table :data="viewRows" size="large" max-height="340" :empty-text="W.view === 'fail' ? '没有失败的行，全部可以导入' : '没有这一类的行'">
                  <el-table-column label="行号" width="90" align="center"><template #default="{ row }"><span class="num">第 {{ row.line }} 行</span></template></el-table-column>
                  <template v-if="W.view === 'fail'">
                    <el-table-column label="失败原因" min-width="220" prop="reason" />
                    <el-table-column label="原始内容" min-width="220" show-overflow-tooltip><template #default="{ row }">{{ rawText(row) }}</template></el-table-column>
                  </template>
                  <template v-else>
                    <el-table-column :label="I.key" width="190" align="center"><template #default="{ row }">{{ row.norm.name }}<span v-if="W.kind === '会员'" class="muted num"> {{ maskPhone(row.norm.phone) }}</span></template></el-table-column>
                    <el-table-column :label="W.view === 'new' ? '新增内容' : '更新内容'" min-width="240" prop="note" />
                  </template>
                </el-table>
                <el-alert v-if="counts.n + counts.u === 0" type="error" show-icon :closable="false" title="所有行都没有通过校验，没有可以导入的数据，请先改好失败的行。" />
              </template>
            </div>

            <!-- 4 确认导入 -->
            <div v-else-if="W.step === 3" class="stack">
              <el-row :gutter="16">
                <el-col :xs="24" :sm="8"><el-statistic title="将新增" :value="counts.n"><template #suffix><span class="muted">{{ I.unit }}</span></template></el-statistic></el-col>
                <el-col :xs="24" :sm="8"><el-statistic title="将更新" :value="counts.u"><template #suffix><span class="muted">{{ I.unit }}</span></template></el-statistic></el-col>
                <el-col :xs="24" :sm="8"><el-statistic title="不导入（校验没通过）" :value="counts.f"><template #suffix><span class="muted">行</span></template></el-statistic></el-col>
              </el-row>
              <el-alert type="warning" show-icon :closable="false" :title="`将新增 ${counts.n} ${I.noun}、更新 ${counts.u} ${I.noun}，导入后立即生效。`" :description="`更新会覆盖原来的${W.kind === '商品' ? '价格、库存和状态' : '等级、积分和储值余额'}，导入前请确认。${counts.f ? '另有 ' + counts.f + ' 行没有通过校验，不会导入。' : ''}`" />
              <div v-if="W.busy" class="stack tight"><el-progress :percentage="W.progress" aria-label="导入进度" /><span class="muted">正在写入，请不要离开页面…</span></div>
              <el-checkbox v-model="W.ack" :disabled="W.busy">我已核对预览，确认按以上内容导入</el-checkbox>
            </div>

            <!-- 5 结果 -->
            <el-result v-else-if="W.out" :icon="W.out.n + W.out.u ? 'success' : 'warning'" :title="W.out.n + W.out.u ? '导入完成' : '没有导入任何数据'"
              :sub-title="`新增 ${W.out.n}、更新 ${W.out.u}、失败 ${W.out.f} 行；总数 ${W.out.t} = 成功 ${W.out.n + W.out.u} + 失败 ${W.out.f} + 跳过 0。${W.out.f ? '失败的行可以下载后改好，只重传这几行。' : ''}`">
              <template #extra>
                <el-button v-if="W.out.f" :icon="Download" @click="failCsv(W.out.kind, W.out.res.filter((r) => r.kind === 'fail'), W.out.name)">下载失败行</el-button>
                <el-button v-if="W.out.n + W.out.u && router.hasRoute(IMPORTS[W.out.kind].page)" @click="router.push('/' + IMPORTS[W.out.kind].page)">去看看{{ IMPORTS[W.out.kind].pageName }}</el-button>
                <el-button type="primary" @click="wizReset()">再导入一份</el-button>
              </template>
            </el-result>

            <div v-if="W.step < 4" class="wiz-foot">
              <el-button v-if="W.step > 0" :disabled="W.busy" @click="prev">上一步</el-button>
              <el-button v-if="W.step === 0" type="primary" @click="W.step = 1">下一步：选择文件</el-button>
              <el-button v-else-if="W.step === 1" type="primary" :disabled="!W.file" @click="validate">下一步：校验预览</el-button>
              <el-button v-else-if="W.step === 2" type="primary" :disabled="W.busy || !!W.header || !W.res || counts.n + counts.u === 0" @click="toConfirm">下一步：确认导入</el-button>
              <el-button v-else type="primary" :loading="W.busy" :disabled="!W.ack" @click="doImport">{{ W.busy ? '正在导入' : '确认导入' }}</el-button>
            </div>
          </el-card>

          <h3 class="band-title">导入历史<span class="muted">每次导入都会留下记录，并写入操作日志</span></h3>
          <LzState :status="importStatus" empty-title="还没有导入记录，按上面的步骤导入一份试试" error-hint="导入历史没有加载出来，请检查网络后重试" @retry="load">
            <el-table :data="rows" size="large" row-key="id">
              <el-table-column label="文件名" min-width="220" show-overflow-tooltip prop="name" />
              <el-table-column label="类型" width="90" align="center" prop="kind" />
              <el-table-column label="总行数（行）" width="120" align="right"><template #default="{ row }"><span class="num">{{ row.total }}</span></template></el-table-column>
              <el-table-column label="新增" width="80" align="right"><template #default="{ row }"><span class="num">{{ row.added ?? '—' }}</span></template></el-table-column>
              <el-table-column label="更新" width="80" align="right"><template #default="{ row }"><span class="num">{{ row.updated ?? '—' }}</span></template></el-table-column>
              <el-table-column label="失败" width="80" align="right"><template #default="{ row }"><span class="num" :class="{ bad: row.fail }">{{ row.fail }}</span></template></el-table-column>
              <el-table-column label="导入时间" width="170" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
              <el-table-column label="导入人" width="100" align="center" prop="by" />
              <el-table-column label="操作" width="130" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openImport(row)">详情</el-button>
                  <el-button v-if="row.failRows?.length" link type="primary" @click="failCsv(row.kind, row.failRows, row.name)">失败行</el-button>
                </template>
              </el-table-column>
            </el-table>
            <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="imps.length" />
          </LzState>
        </template>
      </el-card>

      <!-- 导出任务详情：居中对话框 -->
      <LzDialog v-model="detail.open" :title="'导出任务 · ' + (detail.t?.name || '')" width="640px" :no-footer="!detailAct" :confirm-text="detailAct?.text" :on-confirm="detailConfirm">
        <el-tabs v-if="detail.t" v-model="detail.tab">
          <el-tab-pane label="概况" name="info">
            <el-alert v-if="detail.t.status === 'FAILED'" type="error" show-icon :closable="false" :title="'失败原因：' + (detail.t.fail || '导出失败')" description="可以点“重试”重新提交，原来的导出条件不变。" class="mb" />
            <el-alert v-else-if="detail.t.status === 'RUNNING'" type="info" show-icon :closable="false" :title="'正在生成，已完成 ' + (detail.t.progress || 0) + '%'" description="离开页面也会继续，完成后会提示你。" class="mb" />
            <el-descriptions :column="2" border>
              <el-descriptions-item label="任务名" :span="2">{{ detail.t.name }}</el-descriptions-item>
              <el-descriptions-item label="类型">{{ kindOf(detail.t) }}</el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag kind="task" :status="detail.t.status" /></el-descriptions-item>
              <el-descriptions-item label="行数">{{ num(detail.t.rows) }} 行<span v-if="detail.t.rows > SYNC_LIMIT" class="muted">（超过 {{ num(SYNC_LIMIT) }} 行，走后台任务）</span></el-descriptions-item>
              <el-descriptions-item label="文件有效期">{{ detail.t.status === 'DONE' ? '生成后 24 小时内可下载' : '—' }}</el-descriptions-item>
              <el-descriptions-item label="创建人">{{ detail.t.by }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ detail.t.at }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane label="导出条件" name="cond">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="条件">{{ detail.t.cond || '全部数据' }}</el-descriptions-item>
              <el-descriptions-item label="导出的列">{{ detailCols.length ? detailCols.join('、') : '全部列' }}</el-descriptions-item>
            </el-descriptions>
            <p class="muted">文件里的手机号等个人信息默认脱敏，需要明文请另行申请。</p>
          </el-tab-pane>
          <el-tab-pane label="操作记录" name="log">
            <el-timeline v-if="detailLogs.length">
              <el-timeline-item v-for="a in detailLogs" :key="a.trace" :timestamp="a.at" placement="top">{{ a.actor }} {{ a.action }}<el-tag :type="a.result === '成功' ? 'success' : 'danger'" effect="light" class="log-tag">{{ a.result }}</el-tag></el-timeline-item>
            </el-timeline>
            <el-empty v-else description="还没有这个任务的操作记录" />
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <!-- 导入详情 -->
      <LzDialog v-model="idetail.open" :title="'导入详情 · ' + (idetail.t?.name || '')" width="680px" :no-footer="!idetail.t?.failRows?.length" confirm-text="下载失败行" :on-confirm="async () => failCsv(idetail.t.kind, idetail.t.failRows, idetail.t.name)">
        <template v-if="idetail.t">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="文件名" :span="2">{{ idetail.t.name }}</el-descriptions-item>
            <el-descriptions-item label="类型">{{ idetail.t.kind }}</el-descriptions-item>
            <el-descriptions-item label="总行数">{{ idetail.t.total }} 行</el-descriptions-item>
            <el-descriptions-item label="新增">{{ idetail.t.added ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="更新">{{ idetail.t.updated ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="失败">{{ idetail.t.fail }} 行</el-descriptions-item>
            <el-descriptions-item label="导入人">{{ idetail.t.by }}</el-descriptions-item>
            <el-descriptions-item label="导入时间" :span="2">{{ idetail.t.at }}</el-descriptions-item>
          </el-descriptions>
          <h4 class="sub-title">失败的行</h4>
          <el-table v-if="idetail.t.failRows?.length" :data="idetail.t.failRows" max-height="260">
            <el-table-column label="行号" width="80" align="center"><template #default="{ row }"><span class="num">第 {{ row.line }} 行</span></template></el-table-column>
            <el-table-column label="失败原因" min-width="200" prop="reason" />
            <el-table-column label="原始内容" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ rawText(row) }}</template></el-table-column>
          </el-table>
          <el-empty v-else description="这次导入没有失败的行" :image-size="64" />
        </template>
      </LzDialog>

      <!-- 新建导出 -->
      <LzDialog v-model="nx.open" title="新建导出" width="600px" confirm-text="开始导出" :confirm-disabled="!nx.cols.length || estimate > HARD_LIMIT" :on-confirm="doExport">
        <el-form label-position="top">
          <el-form-item label="导出什么">
            <el-radio-group v-model="nx.kind" aria-label="导出类型"><el-radio-button v-for="k in Object.keys(EXPORTS)" :key="k" :value="k">{{ k }}</el-radio-button></el-radio-group>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12"><el-form-item :label="T.dateLabel || '时间范围'"><el-select v-model="nx.range"><el-option v-for="r in RANGES" :key="r[0]" :value="r[0]" :label="r[1]" /></el-select></el-form-item></el-col>
            <el-col :xs="24" :sm="12"><el-form-item :label="T.filter.label"><el-select v-model="nx.filter"><el-option v-for="o in T.filter.opts" :key="o[0]" :value="o[0]" :label="o[1]" /></el-select></el-form-item></el-col>
          </el-row>
          <el-form-item>
            <template #label><span class="cols-label">导出的列<el-button link type="primary" @click="nx.cols = [...T.cols]">全选</el-button><el-button link type="primary" @click="nx.cols = []">清空</el-button></span></template>
            <el-checkbox-group v-model="nx.cols" aria-label="导出的列"><el-checkbox v-for="c in T.cols" :key="c" :value="c">{{ c }}</el-checkbox></el-checkbox-group>
          </el-form-item>
        </el-form>
        <el-alert :type="nxTip.type" :title="nxTip.text" show-icon :closable="false" />
        <p class="muted">文件名：{{ nxName }}<template v-if="T.mask">。“{{ T.mask }}”导出时会脱敏，例如 138****0000。</template></p>
      </LzDialog>

      <LzDialog v-model="ask.open" :title="ask.title" width="440px" :danger="ask.danger" :confirm-text="ask.confirmText" :on-confirm="ask.run"><p>{{ ask.text }}</p></LzDialog>
    </template>
  </div>
</template>

<style scoped>
.b { font-weight: 600; }
.tab-count { margin-left: 6px; color: inherit; font-weight: 400; }
.tab-count.zero { opacity: .7; }
.filters { margin-bottom: 12px; }
.chart-note { margin: 8px 0 0; }
.status-cell { display: grid; justify-items: center; gap: 4px; }
.task-name { max-width: 100%; }
.wizard { background: var(--luz-canvas); }
.wiz-head { margin-bottom: 16px; }
.wiz-steps { margin-bottom: 20px; }
.wiz-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.stack.tight { gap: 8px; }
.band-title { display: flex; align-items: baseline; gap: 12px; margin: 20px 0 12px; font-size: 16px; font-weight: 600; }
.bad { color: var(--luz-danger); font-weight: 600; }
.mb { margin-bottom: 12px; }
.sub-title { margin: 16px 0 8px; font-size: 14px; font-weight: 600; }
.log-tag { margin-left: 8px; }
.cols-label { display: inline-flex; align-items: center; gap: 4px; }
</style>
