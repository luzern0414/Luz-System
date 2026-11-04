<script>
// 操作日志（横带分层）：概览数字、近 14 天操作量、明细三条带。
// 日志只能查看，不能改、不能删；导出脱敏并生成导出任务；详情里的“修改前后”读记录里的变更，没有就按操作类型合成一份合理的对比。
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { K } from '../../shared/format.js'

export const meta = {
  id: 'audit', label: '操作日志', icon: 'file', group: '系统', order: 4, roles: ['A'],
  layout: '横带分层',
  reason: '查日志是从结论走向细节：先看今天有没有失败和敏感读取，再看近 14 天的操作量有没有异常，最后才翻明细、点详情看修改前后；自上而下三条横带正好对应这个视线，明细表要用满整行宽度',
  scenes: [
    { id: 'nodata', label: '所选时间范围内没有操作记录' },
    { id: 'export-limit', label: '导出失败：行数超过 5 万行的上限' },
  ],
}

const EXPORT_LIMIT = 50000
const dayKey = (back) => K.ymd(K.addDays(K.today(), -back))
const stamp = () => B.fmt(B.NOW())
const todayKey = () => stamp().slice(0, 10)
const pad = K.pad
const num = (v) => Number(v).toLocaleString('zh-CN')
const isSens = (r) => String(r.code).startsWith('sensitive:') || r.code === 'export'
const isFail = (r) => r.result === '失败'
const typeOf = (r) => String(r.target).split(' ')[0]
const FAIL_WHY = { 'order:cancel': '订单已出餐，不能取消', 'refund:approve': '退款金额超过实付金额', 'product:publish': '商品正在被活动使用，不能下架', 'card:issue': '会员卡库存不足', 'wallet:adjust': '调整后余额不能为负数', 'system:account': '账号名已存在', 'system:config': '取值超出允许范围', 'member:edit': '会员已注销', 'coupon:edit': '优惠券库存不足', 'auth:login': '口令错误', export: '导出行数超过上限' }
const RANGES = [['today', '今天', 0], ['7', '近 7 天', 6], ['14', '近 14 天', 13], ['30', '近 30 天', 29], ['custom', '自定义日期', 0]]

/** 演示数据：把近 20 天的日志补到每天十来条，加上敏感读取、导出、登录；已补过的不再动（重置演示数据后重新补） */
function seedAudit(db) {
  if (db.audit.some((x) => x._s)) return
  const r = B.rng(53), pick = (a) => a[Math.floor(r() * a.length)], actors = ['王海燕', '周敏', '陈晓燕', '赵建国', '吴秀英', '刘洋']
  const acts = [['order:cancel', '取消订单', '订单', 3], ['refund:approve', '审批退款', '售后', 3], ['product:publish', '商品下架', '商品', 2], ['product:edit', '修改商品价格', '商品', 3], ['card:issue', '人工发卡', '会员卡', 2], ['wallet:adjust', '储值调整', '储值', 2], ['system:account', '重置密码', '账号', 1], ['system:config', '修改配置', '系统配置', 1], ['member:edit', '禁用会员', '会员', 2], ['coupon:edit', '发放优惠券', '优惠券', 2], ['order:fulfil', '订单出餐', '订单', 4], ['sensitive:phone', '查看手机号明文', '会员', 2], ['export', '导出订单', '导出任务', 1], ['auth:login', '登录后台', '账号', 3]]
  const pool = acts.flatMap((a) => Array(a[3]).fill(a)), add = [], now = stamp()
  for (let d = 19; d >= 0; d--) {
    const n = d === 0 ? 7 : 7 + Math.floor(r() * 8)
    for (let i = 0; i < n; i++) {
      const a = pick(pool), hh = d === 0 ? 8 + Math.floor(r() * 2.5) : 8 + Math.floor(r() * 13), at = dayKey(d) + ' ' + pad(hh) + ':' + pad(Math.floor(r() * 60))
      const login = a[0] === 'auth:login', actor = pick(actors), fail = r() < (login ? 0.12 : 0.07)
      add.push({ at: at > now ? now : at, actor, code: a[0], action: a[1], target: login ? '账号 ' + pick(['admin', 'manager1', 'front1', 'finance1', 'front2']) : a[2] + ' ' + (1000 + Math.floor(r() * 9000)), result: fail ? '失败' : '成功', fail: fail ? FAIL_WHY[a[0]] : '', reason: a[0].startsWith('sensitive:') ? pick(['核对会员身份', '处理客诉回访', '补开发票核对']) : '', ip: '10.0.' + Math.floor(r() * 9) + '.' + (10 + Math.floor(r() * 190)), trace: 'tr' + Math.floor(r() * 1e8).toString(16) })
    }
  }
  db.audit.forEach((x) => { if (x.at > now) { const m = (x.id * 7) % 90; x.at = todayKey() + ' ' + pad(8 + Math.floor(m / 60)) + ':' + pad(m % 60) } })
  const all = db.audit.concat(add).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  all.forEach((x, i) => { x.id = all.length - i; x._s = 1; if (x.result === '失败' && !x.fail) x.fail = FAIL_WHY[x.code] || '操作没有完成' })
  db.audit = all
}

/** 没有记录修改前后时，按操作类型合成“字段 修改前 → 修改后” */
function diffOf(rec) {
  if (rec.diff) return rec.diff
  if (isFail(rec)) return []
  const R = B.rng((rec.id || 1) * 13 + 5), pk = (a) => a[Math.floor(R() * a.length)], yuan = (c) => '¥' + (c / 100).toFixed(2), amount = 1500 + Math.floor(R() * 3000), who = rec.actor
  switch (rec.code) {
    case 'order:cancel': return [['订单状态', '待履约', '已取消'], ['取消原因', '—', pk(['顾客要求取消', '重复下单', '商品售罄'])], ['退款', '—', yuan(amount) + ' 原路退回']]
    case 'refund:approve': return [['售后状态', '待审批', '已退款'], ['退款金额', '—', yuan(amount)], ['处理人', '—', who]]
    case 'product:publish': return [['上架状态', '在售', '已下架']]
    case 'product:edit': return [['价格', yuan(amount), yuan(amount + 200)], ['库存', '56', '48']]
    case 'card:issue': return [['会员卡', '—', '月卡 C2026' + (1000 + Math.floor(R() * 8999))], ['剩余次数', '—', '30 次'], ['有效期', '—', '30 天']]
    case 'wallet:adjust': return [['储值余额', yuan(amount * 4), yuan(amount * 4 + 1000)], ['调整原因', '—', pk(['服务补偿', '充值未到账补录'])]]
    case 'system:account': return [['登录口令', '已设置', '已重置（72 小时内必须改密）'], ['登录状态', '在线', '已下线']]
    case 'system:config': return pk([[['未支付自动关闭（分钟）', '30', '45']], [['登录失败锁定次数', '5', '6']], [['免审核退款期限（天）', '7', '10']]])
    case 'member:edit': return [['会员状态', '正常', '已禁用']]
    case 'coupon:edit': return [['已发放', '412', '612'], ['可领取库存', '588', '388']]
    case 'order:fulfil': return [['订单状态', '待履约', '已出餐']]
    default: return []
  }
}
const noteFor = (rec) => (String(rec.code).startsWith('sensitive:') ? '这是一次读取，没有修改任何数据。看的是手机号，页面上只显示脱敏后的号码，原因已记录。' : rec.code === 'auth:login' ? '登录记录，没有修改数据。' : rec.code === 'export' ? '导出记录，文件里的手机号等个人信息已脱敏。' : isFail(rec) ? '这次操作没有成功，数据没有被修改。' : '这类操作没有记录逐项变更。')

// 文本开头是公式字符的加引号前缀，防止在表格软件里被当作公式执行
const cell = (v) => { if (v == null) return ''; let s = String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
function saveFile(name, header, rows) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + [header].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  a.download = name; a.hidden = true
  document.body.append(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1500)
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Download, Refresh, Search } from '@element-plus/icons-vue'
import { useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { usePager } from '../use-pager.js'

const scene = useScene('audit')
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
seedAudit(state.db)

const meName = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
async function net(ms, fail) {
  try { await request(ms, { fail }) } catch (e) { throw e.name === 'NetError' ? new Error(e.message + '，导出没有完成，请重试') : e }
}
const failMsg = (e) => e?.message || '操作失败，请重试'

const src = computed(() => (scene.value === 'nodata' ? [] : state.db.audit))
const today = todayKey()

// ---- 带一：今日的数字，和近 14 天日均比
const stats = computed(() => {
  const all = src.value, td = all.filter((r) => r.at.startsWith(today)), last14 = all.filter((r) => r.at >= dayKey(13))
  const avg = (list) => list.length / 14
  return {
    n: td.length, avgN: avg(last14), avgFail: avg(last14.filter(isFail)), avgSens: avg(last14.filter(isSens)),
    fail: td.filter(isFail).length,
    sens: td.filter(isSens).length,
    people: new Set(td.map((r) => r.actor)).size, people14: new Set(last14.map((r) => r.actor)).size,
  }
})

// ---- 带二：近 14 天操作量
const days = Array.from({ length: 14 }, (_, i) => dayKey(13 - i))
const daily = computed(() => days.map((d) => { const day = src.value.filter((r) => r.at.startsWith(d)); return { ok: day.filter((r) => !isFail(r) && !isSens(r)).length, sens: day.filter((r) => !isFail(r) && isSens(r)).length, fail: day.filter(isFail).length } }))
const chartSeries = computed(() => [{ name: '成功', data: daily.value.map((d) => d.ok) }, { name: '敏感读取', data: daily.value.map((d) => d.sens) }, { name: '失败', data: daily.value.map((d) => d.fail) }])
const chartSum = computed(() => daily.value.reduce((s, d) => s + d.ok + d.sens + d.fail, 0))
const chartNote = computed(() => {
  const tot = daily.value.map((d) => d.ok + d.sens + d.fail), peak = tot.indexOf(Math.max(...tot))
  const st = stats.value
  return `近 14 天共 ${chartSum.value} 次操作，日均 ${st.avgN.toFixed(1)} 次，其中失败 ${daily.value.reduce((s, d) => s + d.fail, 0)} 次、敏感读取 ${daily.value.reduce((s, d) => s + d.sens, 0)} 次，涉及 ${st.people14} 人；操作最多的一天是 ${days[peak].slice(5)}（${tot[peak]} 次）。今天还没过完，数字只算到现在。`
})

// ---- 带三：明细。默认看需要关注的（失败和敏感读取），全部只是一个选项
const TABS = [['ATTN', '需关注'], ['FAIL', '失败操作'], ['SENS', '敏感读取'], ['ALL', '全部操作']]
const f = reactive({ tab: 'ATTN', range: '14', dates: null, actor: '', action: '', type: '', result: '', q: '' })
const span = computed(() => {
  if (f.range === 'custom') return [f.dates?.[0] || dayKey(365), f.dates?.[1] || today]
  return [dayKey(RANGES.find((x) => x[0] === f.range)[2]), today]
})
const base = computed(() => {
  const [from, to] = span.value, q = f.q.trim().toLowerCase()
  return src.value.filter((r) => r.at >= from + ' 00:00' && r.at <= to + ' 23:59' && (!f.actor || r.actor === f.actor) && (!f.action || r.action === f.action) && (!f.type || typeOf(r) === f.type) && (!f.result || r.result === f.result) && (!q || (r.target + ' ' + r.trace).toLowerCase().includes(q)))
})
const inTab = (r, t) => (t === 'ALL' ? true : t === 'ATTN' ? isFail(r) || isSens(r) : t === 'FAIL' ? isFail(r) : isSens(r))
const count = (t) => base.value.filter((r) => inTab(r, t)).length
const filtered = computed(() => base.value.filter((r) => inTab(r, f.tab)))
const uniq = (fn) => [...new Set(state.db.audit.map(fn))].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))
const actorOpts = computed(() => uniq((r) => r.actor))
const actionOpts = computed(() => uniq((r) => r.action))
const typeOpts = computed(() => uniq(typeOf))
const disabledDate = (d) => d.getTime() > Date.now() || d.getTime() < K.addDays(K.today(), -365).getTime()
const dirty = computed(() => f.tab !== 'ATTN' || f.range !== '14' || f.actor || f.action || f.type || f.result || f.q)
const resetFilter = () => Object.assign(f, { tab: 'ATTN', range: '14', dates: null, actor: '', action: '', type: '', result: '', q: '' })
const pager = usePager('audit')
const rows = pager.slice(filtered)
watch(() => ({ ...f }), () => pager.reset())
const status = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const emptyTitle = computed(() => (scene.value === 'nodata' ? '所选时间范围内没有操作记录' : f.tab === 'ATTN' && !base.value.length ? '所选时间范围内没有操作记录' : f.tab === 'ATTN' ? '所选范围内没有失败或敏感读取的操作' : '没有符合条件的操作记录，换个筛选条件试试'))

// ---- 详情：概况、修改前后、关联记录
const detail = reactive({ open: false, r: null, tab: 'info' })
const open = (r) => Object.assign(detail, { open: true, r, tab: 'info' })
const diff = computed(() => (detail.r ? diffOf(detail.r) : []))
const related = computed(() => (detail.r ? state.db.audit.filter((x) => x !== detail.r && x.target === detail.r.target).slice(0, 6) : []))

// ---- 导出：脱敏、生成导出任务，导出本身也会被记录
const exp = reactive({ open: false })
const openExport = () => { if (!filtered.value.length && !base.value.length) { ElMessage.warning('当前筛选下没有可导出的记录，请先换个时间范围'); return } exp.open = true }
const exportRows = computed(() => base.value.filter((r) => inTab(r, f.tab)))
const shown = computed(() => (scene.value === 'export-limit' ? 63200 : exportRows.value.length))
async function doExport() {
  const list = exportRows.value, n = list.length, [from, to] = span.value
  if (!n) throw new Error('当前筛选下没有可导出的记录，请换个筛选条件')
  await net(700, shown.value > EXPORT_LIMIT ? new Error(`导出失败：按当前筛选预计 ${num(shown.value)} 行，超过单次导出上限 ${num(EXPORT_LIMIT)} 行，请缩短时间范围，或加上操作人、操作类型再导出`) : null)
  const db = state.db, name = `操作日志_${from.slice(5)}至${to.slice(5)}_脱敏_${todayKey()}.xlsx`
  db.exportTasks.unshift({ id: Math.max(0, ...db.exportTasks.map((x) => x.id)) + 1, name, kind: '审计', rows: n, status: 'DONE', at: stamp(), by: meName.value, cond: `范围：${from.slice(5)} 至 ${to.slice(5)}；结果：${f.result || '全部结果'}`, spec: { days: 0, filter: '' }, progress: 100 })
  db.audit.unshift({ id: Math.max(0, ...db.audit.map((x) => x.id || 0)) + 1, at: stamp(), actor: meName.value, code: 'export', action: '导出审计', target: '导出任务 ' + name, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16), _s: 1, diff: [['导出范围', '—', `${from.slice(5)} 至 ${to.slice(5)}`], ['行数', '—', num(n)]] })
  saveFile(name.replace(/\.xlsx$/, '.csv'), ['操作时间', '操作人', '操作', '对象', '结果', '来源地址（脱敏）', '请求编号'], list.map((r) => [r.at, r.actor, r.action, r.target, r.result, String(r.ip || '').replace(/\.\d+$/, '.*'), r.trace]))
  resetFilter()
  ElMessage.success(`已导出「${name.replace(/\.xlsx$/, '')}」，共 ${num(n)} 条，也可以到“导入导出”里再次下载`)
}
</script>

<template>
  <div class="lz-page">
    <LzState v-if="state.role !== 'A'" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Download" @click="openExport">导出</el-button>
      </div>

      <!-- band 1 -->
      <section aria-label="今日概览" class="lz-kpis">
        <LzKpi label="今日操作数" :value="stats.n" suffix="次" />
        <LzKpi label="今日失败操作" :value="stats.fail" suffix="次" />
        <LzKpi label="今日敏感读取" :value="stats.sens" suffix="次" />
        <LzKpi label="今日涉及操作人" :value="stats.people" suffix="人" />
      </section>

      <!-- band 2 -->
      <el-card shadow="never" class="lz-card" aria-label="近 14 天操作量">
        <LzState :status="chartSum ? 'ok' : 'empty'" empty-title="近 14 天没有操作记录">
          <LzChart kind="bar" :categories="days.map((d) => d.slice(5))" :series="chartSeries" :height="220" unit="" label="近 14 天操作量" />
          <p class="muted chart-note">{{ chartNote }}</p>
        </LzState>
      </el-card>

      <!-- band 3 -->
      <el-card shadow="never" class="lz-card" aria-label="操作明细">
        <el-alert type="info" show-icon :closable="false" class="retention" title="审计记录保留 1 年，涉及个人信息的导出和越权操作保留 3 年；记录只能追加，这里不提供修改和删除，日期最多往前选一年。" />
        <div class="lz-toolbar filters">
          <el-radio-group v-model="f.tab" aria-label="操作类别">
            <el-radio-button v-for="[code, label] in TABS" :key="code" :value="code">{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></el-radio-button>
          </el-radio-group>
          <span class="grow" />
          <el-input v-model="f.q" clearable placeholder="对象或请求编号" :prefix-icon="Search" style="width: 220px" aria-label="对象或请求编号" />
        </div>
        <div class="lz-toolbar filters">
          <el-select v-model="f.range" style="width: 132px" aria-label="时间范围"><el-option v-for="r in RANGES" :key="r[0]" :value="r[0]" :label="r[1]" /></el-select>
          <el-date-picker v-if="f.range === 'custom'" v-model="f.dates" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :disabled-date="disabledDate" unlink-panels style="width: 260px" aria-label="自定义日期" />
          <el-select v-model="f.actor" clearable placeholder="全部操作人" style="width: 140px" aria-label="操作人"><el-option v-for="o in actorOpts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="f.action" clearable placeholder="全部操作类型" style="width: 156px" aria-label="操作类型"><el-option v-for="o in actionOpts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="f.type" clearable placeholder="全部对象" style="width: 130px" aria-label="对象"><el-option v-for="o in typeOpts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="f.result" clearable placeholder="全部结果" style="width: 120px" aria-label="结果"><el-option value="成功" label="成功" /><el-option value="失败" label="失败" /></el-select>
          <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
          <span class="grow" /><span class="muted">共 {{ filtered.length }} 条</span>
        </div>
        <LzState :status="status" :empty-title="emptyTitle" error-hint="操作日志没有加载出来，请检查网络后重试" @retry="load">
          <template #empty-action><el-button v-if="scene !== 'nodata' && base.length && f.tab !== 'ALL'" type="primary" @click="f.tab = 'ALL'">查看全部操作</el-button></template>
          <el-table :data="rows" size="large" :empty-text="emptyTitle">
            <el-table-column label="时间" width="160" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="操作人" width="100" align="center" prop="actor" />
            <el-table-column label="操作" min-width="170" align="center"><template #default="{ row }">{{ row.action }}<el-tag v-if="isSens(row)" type="warning" effect="light" class="sens-tag">敏感</el-tag></template></el-table-column>
            <el-table-column label="对象" width="140" align="center" prop="target" />
            <el-table-column label="结果" width="84" align="center"><template #default="{ row }"><el-tag :type="isFail(row) ? 'danger' : 'success'" effect="light">{{ row.result }}</el-tag></template></el-table-column>
            <el-table-column label="来源地址" width="130" align="center"><template #default="{ row }"><span class="num">{{ row.ip }}</span></template></el-table-column>
            <el-table-column label="请求编号" width="130" align="center"><template #default="{ row }"><span class="num">{{ row.trace }}</span></template></el-table-column>
            <el-table-column label="操作" width="90" align="center" fixed="right"><template #default="{ row }"><el-button link type="primary" :aria-label="'查看详情 ' + row.trace" @click="open(row)">详情</el-button></template></el-table-column>
          </el-table>
          <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
        </LzState>
      </el-card>

      <!-- 详情：居中对话框，只读 -->
      <LzDialog v-model="detail.open" :title="'操作详情 · ' + (detail.r?.action || '')" width="680px" no-footer>
        <el-tabs v-if="detail.r" v-model="detail.tab">
          <el-tab-pane label="概况" name="info">
            <el-alert v-if="isFail(detail.r)" type="error" show-icon :closable="false" :title="'这次操作失败了：' + (detail.r.fail || '操作没有完成') + '。数据没有被修改。'" class="mb" />
            <el-alert v-else-if="isSens(detail.r)" type="warning" show-icon :closable="false" title="敏感读取：本次读取已留痕，只记录脱敏后的内容。" class="mb" />
            <el-descriptions :column="2" border>
              <el-descriptions-item label="时间">{{ detail.r.at }}</el-descriptions-item>
              <el-descriptions-item label="操作人">{{ detail.r.actor }}</el-descriptions-item>
              <el-descriptions-item label="操作">{{ detail.r.action }}</el-descriptions-item>
              <el-descriptions-item label="对象">{{ detail.r.target }}</el-descriptions-item>
              <el-descriptions-item label="结果"><el-tag :type="isFail(detail.r) ? 'danger' : 'success'" effect="light">{{ detail.r.result }}</el-tag></el-descriptions-item>
              <el-descriptions-item label="来源地址">{{ detail.r.ip }}</el-descriptions-item>
              <el-descriptions-item v-if="isFail(detail.r)" label="失败原因" :span="2">{{ detail.r.fail || '操作没有完成' }}</el-descriptions-item>
              <el-descriptions-item v-if="detail.r.reason" label="原因" :span="2">{{ detail.r.reason }}</el-descriptions-item>
              <el-descriptions-item label="请求编号" :span="2">{{ detail.r.trace }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane label="变更摘要" name="diff">
            <template v-if="diff.length">
              <el-table :data="diff" aria-label="修改前后对比">
                <el-table-column label="修改项" width="170"><template #default="{ row }"><span class="b">{{ row[0] }}</span></template></el-table-column>
                <el-table-column label="修改前" min-width="140"><template #default="{ row }">{{ row[1] }}</template></el-table-column>
                <el-table-column label="" width="40" align="center"><template #default>→</template></el-table-column>
                <el-table-column label="修改后" min-width="160"><template #default="{ row }"><span class="b">{{ row[2] }}</span></template></el-table-column>
              </el-table>
              <p class="muted">只列出有变化的项，手机号等敏感内容已脱敏。</p>
            </template>
            <el-empty v-else :description="noteFor(detail.r)" />
          </el-tab-pane>
          <el-tab-pane label="关联记录" name="related">
            <el-timeline v-if="related.length">
              <el-timeline-item v-for="x in related" :key="x.trace" :timestamp="x.at" placement="top">{{ x.actor }} {{ x.action }}<el-tag :type="isFail(x) ? 'danger' : 'success'" effect="light" class="sens-tag">{{ x.result }}</el-tag></el-timeline-item>
            </el-timeline>
            <el-empty v-else description="这个对象没有别的操作记录" />
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <!-- 导出 -->
      <LzDialog v-model="exp.open" title="导出操作日志" width="480px" confirm-text="确认导出" :on-confirm="doExport">
        <p>将按当前筛选导出 <span class="b num">{{ num(shown) }}</span> 条记录（{{ span[0].slice(5) }} 至 {{ span[1].slice(5) }}）。</p>
        <ul class="plain">
          <li>表头是中文，手机号、来源地址末段已脱敏，不含内部编号和空列。</li>
          <li>导出会生成一个导出任务，这次导出本身也会写进操作日志。</li>
          <li>单次最多导出 {{ num(EXPORT_LIMIT) }} 行，超过要缩短时间范围或加筛选。</li>
        </ul>
        <el-alert v-if="shown > EXPORT_LIMIT" type="error" show-icon :closable="false" :title="`按当前筛选预计 ${num(shown)} 行，超过单次导出上限 ${num(EXPORT_LIMIT)} 行`" description="点“确认导出”会失败，请先缩短时间范围，或加上操作人、操作类型。" />
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.b { font-weight: 600; }
.tab-count { margin-left: 6px; color: inherit; font-weight: 400; }
.tab-count.zero { opacity: .7; }
.filters { margin-bottom: 12px; }
.chart-note { margin: 8px 0 0; }
.sens-tag { margin-left: 8px; }
.mb { margin-bottom: 12px; }
.retention { margin-bottom: 12px; }
.plain { margin: 8px 0 12px; padding-left: 20px; color: var(--luz-ink-2); }
</style>
