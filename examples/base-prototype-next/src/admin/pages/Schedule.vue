<script>
// 排班：时间轴泳道。泳道是员工，横条是班次与会议；红色冲突、橙色待确认、虚线空闲，“现在”竖线告诉店长此刻谁在岗。
// 读写 state.db.staff 与 state.db.shifts（按日期各一份，本页补充的演示数据）。
export const meta = {
  id: 'schedule', label: '排班', icon: 'lanes', group: '门店', order: 2, roles: ['A'],
  layout: '时间轴泳道',
  reason: '排班最怕的是同一个人被排到重叠的时间、该确认的事没人确认、某段时间没人：员工是泳道、班次与会议是横条，红色冲突、橙色待确认、虚线空闲一眼可见，那条“现在”竖线告诉店长此刻谁在岗',
  scenes: [
    { id: 'nodata', label: '这一天没有排班' },
    { id: 'copy-fail', label: '复制失败：明天的排班已被锁定' },
    { id: 'save-fail', label: '保存失败：班次已被别人改过' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { CopyDocument, Plus, Refresh } from '@element-plus/icons-vue'
import { avatar } from '../../shared/avatar.js'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K } from '../../shared/format.js'

const scene = useScene('schedule')
const allowed = computed(() => state.role === 'A')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const FROM = 7, TO = 22
const HOURS = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i)
const hh = (t) => String(t).padStart(2, '0')
const fmt = (t) => hh(t) + ':00'
const today = K.ymd(B.NOW())
const nowStr = B.fmt(B.NOW())
const nowHour = Number(nowStr.slice(11, 13)) + Number(nowStr.slice(14, 16)) / 60
const dAdd = (d, n) => K.ymd(K.addDays(new Date(d + 'T00:00:00'), n))
const md = (s) => s.slice(5)
const DAYNAME = { '-1': '昨天', 0: '今天', 1: '明天' }
const pct = (h) => ((h - FROM) / (TO - FROM)) * 100
const audit = (code, action, target) => state.db.audit.unshift({ id: Math.max(0, ...state.db.audit.map((a) => a.id)) + 1, at: nowStr, actor: '王海燕', code, action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })

// ---- demo data: seven staff, three days of shifts; today has a conflict, a meeting to confirm and idle time
function ensure() {
  const d = state.db
  d._luzSeed ||= {}
  if (toRaw(d._luzSeed.schedule) === toRaw(d.users)) return
  d.staff = [
    { id: 1, name: '陈晓燕', role: '前台' }, { id: 2, name: '何建平', role: '前台' }, { id: 3, name: '刘洋', role: '后厨' }, { id: 4, name: '马国强', role: '后厨' },
    { id: 5, name: '周敏', role: '店长' }, { id: 6, name: '赵建国', role: '配送' }, { id: 7, name: '孙磊', role: '配送' },
  ]
  let id = 0
  const S = (staffId, from, to, title, kind, needConfirm) => ({ id: ++id, staffId, from, to, title, kind: kind || '班次', needConfirm: !!needConfirm, note: '' })
  d.shifts = {
    [dAdd(today, -1)]: [S(1, 8, 16, '早班'), S(2, 12, 20, '晚班'), S(3, 7, 15, '早厨'), S(4, 11, 19, '午晚厨'), S(5, 9, 17, '店长班'), S(5, 15, 16, '周例会', '会议'), S(6, 10, 14, '配送高峰'), S(7, 17, 21, '配送晚高峰')],
    [today]: [S(1, 8, 12, '早班'), S(1, 14, 18, '午班'), S(2, 11, 15, '午高峰'), S(2, 14, 18, '代班'), S(3, 7, 11, '备料'), S(3, 10, 14, '出餐高峰'), S(3, 16, 20, '晚班'), S(4, 11, 20, '厨房长班'), S(5, 9, 12, '盘点'), S(5, 12, 13, '供应商会议', '会议', true), S(6, 10, 14, '配送高峰'), S(6, 17, 21, '配送晚高峰')],
    [dAdd(today, 1)]: [S(1, 8, 16, '早班'), S(5, 9, 17, '店长班'), S(5, 14, 15, '新品培训', '会议', true), S(7, 10, 14, '配送高峰'), S(7, 13, 17, '配送代班')],
  }
  d.shiftSeq = id
  d._luzSeed.schedule = d.users
}
ensure()
watch(() => state.db.users, ensure)

const overlap = (a, b) => a.from < b.to && a.to > b.from
const staffOf = (id) => state.db.staff.find((s) => s.id === id)
const timeText = (sh) => fmt(sh.from) + '–' + fmt(sh.to)
const off = ref(0)
const day = computed(() => dAdd(today, off.value))
const list = computed(() => (scene.value === 'nodata' ? [] : state.db.shifts[day.value] || []))
const shiftsOn = (d) => (state.db.shifts[d] ||= [])
const conflicts = computed(() => {
  const out = []
  list.value.forEach((a, i) => list.value.slice(i + 1).forEach((b) => { if (a.staffId === b.staffId && overlap(a, b)) out.push([a, b]) }))
  return out
})
const conflictIds = computed(() => new Set(conflicts.value.flat().map((s) => s.id)))
function freeGaps(evs) {                                         // a gap of two hours or more with nobody on it
  if (!evs.length) return [[FROM, TO]]
  const cov = evs.map((e) => [e.from, e.to]).sort((a, b) => a[0] - b[0]), gaps = []
  let t = FROM
  cov.forEach(([f, to]) => { if (f - t >= 2) gaps.push([t, f]); t = Math.max(t, to) })
  if (TO - t >= 2) gaps.push([t, TO])
  return gaps
}
const onlyBad = ref(false)
const laneStaff = computed(() => (onlyBad.value ? state.db.staff.filter((s) => list.value.some((x) => x.staffId === s.id && conflictIds.value.has(x.id))) : state.db.staff))
const lanes = computed(() => laneStaff.value.map((s) => {
  const evs = list.value.filter((x) => x.staffId === s.id).sort((a, b) => a.from - b.from || a.to - b.to), ends = []
  const placed = evs.map((e) => {
    let r = ends.findIndex((end) => end <= e.from)
    if (r < 0) r = ends.length
    ends[r] = e.to
    return { ...e, row: r, bad: conflictIds.value.has(e.id) }
  })
  return { s, evs: placed, rows: Math.max(1, ends.length), gaps: freeGaps(evs) }
}))
const gapCount = computed(() => state.db.staff.reduce((a, s) => a + freeGaps(list.value.filter((x) => x.staffId === s.id)).length, 0))
const duty = computed(() => new Set(list.value.filter((x) => x.kind === '班次').map((x) => x.staffId)).size)
const nowPct = computed(() => (off.value === 0 ? pct(nowHour) : null))
const barType = (e) => (e.bad ? 'danger' : e.needConfirm ? 'warning' : 'primary')
const barTip = (e) => `${staffOf(e.staffId).name}：${e.title} ${timeText(e)}` + (e.bad ? '，与别的班次时间冲突' : '') + (e.needConfirm ? '，还没有本人确认' : '')

// conflicts and to-dos, in the order they need handling
const todo = computed(() => {
  const rows = []
  conflicts.value.forEach(([a, b]) => rows.push({ k: 'bad', text: `${staffOf(a.staffId).name}：「${a.title}」${timeText(a)} 与「${b.title}」${timeText(b)} 重叠`, id: a.id }))
  if (!onlyBad.value) {
    list.value.filter((x) => x.needConfirm).forEach((x) => rows.push({ k: 'warn', text: `${staffOf(x.staffId).name}：「${x.title}」${timeText(x)} 还没有本人确认`, id: x.id }))
    state.db.staff.filter((s) => !list.value.some((x) => x.staffId === s.id)).forEach((s) => rows.push({ k: 'idle', text: `${s.name}（${s.role}）当天没有排班，全天空闲`, staffId: s.id }))
  }
  return rows
})
const TODO_TAG = { bad: ['danger', '冲突'], warn: ['warning', '待确认'], idle: ['info', '空闲'] }
const flash = ref(null)
const flashOn = (id) => { flash.value = id; setTimeout(() => { if (flash.value === id) flash.value = null }, 2200) }

// ---- shift form: add and adjust. A clash is shown live and does not block saving (it shows as a red conflict afterwards).
const sf = reactive({ open: false, sh: null, staffId: 1, kind: '班次', title: '', from: 9, to: 13, confirm: false })
const hourOpts = HOURS.map((h) => ({ value: h, label: fmt(h) }))
const sfClash = computed(() => (sf.open ? shiftsOn(day.value).filter((o) => o !== sf.sh && o.staffId === sf.staffId && overlap(o, { from: sf.from, to: sf.to })) : []))
watch(() => sf.kind, (k) => { if (sf.open && !sf.sh) sf.confirm = k === '会议' })
const askShift = (sh, staffId) => Object.assign(sf, { open: true, sh, staffId: sh ? sh.staffId : staffId || state.db.staff[0].id, kind: sh ? sh.kind : '班次', title: sh ? sh.title : '', from: sh ? sh.from : 9, to: sh ? sh.to : 13, confirm: sh ? sh.needConfirm : false })
async function doShift() {
  const title = sf.title.trim(), a = sf.from, b = sf.to
  if (title.length < 2) throw new Error('名称至少 2 个字')
  if (b <= a) throw new Error('结束时间要晚于开始时间')
  if (b - a > 12) throw new Error('单个班次最长 12 小时')
  if (sf.kind === '会议' && b - a > 4) throw new Error('会议最长 4 小时')
  await request(450, { fail: scene.value === 'save-fail' ? new Error('保存失败：这天的排班刚刚被另一位店长改过，本次没有保存，请关闭后重新打开再试') : null })
  const body = { staffId: sf.staffId, from: a, to: b, title, kind: sf.kind, needConfirm: sf.confirm }
  let sh = sf.sh
  if (sh) Object.assign(sh, body)
  else { sh = { id: ++state.db.shiftSeq, note: '', ...body }; shiftsOn(day.value).push(sh) }
  audit('schedule:edit', `${sf.sh ? '调整' : '新增'}班次「${title}」${timeText(sh)}${sfClash.value.length ? `（与 ${sfClash.value.length} 个班次冲突）` : ''}`, `排班 ${day.value} ${staffOf(sh.staffId).name}`)
  ElMessage.success(sf.sh ? '已保存' : '已新增班次'); flashOn(sh.id)
}

// ---- shift detail
const sd = reactive({ open: false, id: null, tab: 'info' })
const curShift = computed(() => (sd.open ? shiftsOn(day.value).find((x) => x.id === sd.id) : null))
const curClash = computed(() => (curShift.value ? shiftsOn(day.value).filter((o) => o !== curShift.value && o.staffId === curShift.value.staffId && overlap(o, curShift.value)) : []))
const curTrail = computed(() => (curShift.value ? state.db.audit.filter((a) => a.target.startsWith('排班 ') && a.action.includes('「' + curShift.value.title + '」')) : []))
const openShift = (id) => { sd.id = id; sd.tab = 'info'; sd.open = true }
const busy = ref('')
async function confirmShift(sh) {
  busy.value = 'confirm'
  try {
    await request(350)
    sh.needConfirm = false; audit('schedule:edit', `标记「${sh.title}」已确认`, `排班 ${day.value} ${staffOf(sh.staffId).name}`)
    ElMessage.success('已标记确认'); flashOn(sh.id)
  } catch (e) { ElMessage.error(e.message + '，确认状态没有改变') } finally { busy.value = '' }
}
async function removeShift(sh) {
  try { await ElMessageBox.confirm(`将删除 ${staffOf(sh.staffId).name} 的「${sh.title}」${timeText(sh)}，删除后这段时间变成空闲。`, '删除班次', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }) } catch { return }
  busy.value = 'remove'
  try {
    await request(400)
    const l = shiftsOn(day.value); l.splice(l.indexOf(sh), 1)
    audit('schedule:edit', `删除班次「${sh.title}」${timeText(sh)}`, `排班 ${day.value} ${staffOf(sh.staffId).name}`)
    sd.open = false; ElMessage.success('已删除班次')
  } catch (e) { ElMessage.error(e.message + '，班次没有删除') } finally { busy.value = '' }
}

// ---- swap
const sw = reactive({ open: false, sh: null, to: null, why: '' })
const swOthers = computed(() => (sw.sh ? state.db.staff.filter((s) => s.id !== sw.sh.staffId) : []))
const swTarget = computed(() => staffOf(sw.to))
const swClash = computed(() => (sw.open && sw.sh ? shiftsOn(day.value).filter((o) => o !== sw.sh && o.staffId === sw.to && overlap(o, sw.sh)) : []))
const askSwap = (sh) => Object.assign(sw, { open: true, sh, to: state.db.staff.find((s) => s.id !== sh.staffId).id, why: '' })
async function doSwap() {
  const sh = sw.sh, to = swTarget.value, from = staffOf(sh.staffId)
  if (swClash.value.length) throw new Error(`${to.name} 在 ${swClash.value.map((o) => `「${o.title}」${timeText(o)}`).join('、')} 已有安排，换过去会冲突，请选别人`)
  await request(450)
  sh.staffId = to.id
  audit('schedule:edit', `换班：「${sh.title}」${timeText(sh)}，${from.name} → ${to.name}${sw.why.trim() ? '：' + sw.why.trim() : ''}`, `排班 ${day.value} ${to.name}`)
  ElMessage.success('已换给 ' + to.name); flashOn(sh.id)
}

// ---- copy this day to the next
const cp = reactive({ open: false, ids: [] })
const canCopy = computed(() => off.value < 1)
const cpTo = computed(() => dAdd(day.value, 1))
const cpSrc = computed(() => shiftsOn(day.value))
const askCopy = () => {
  if (!cpSrc.value.length) { ElMessage.warning(DAYNAME[off.value] + '没有班次可以复制'); return }
  Object.assign(cp, { open: true, ids: cpSrc.value.filter((x) => !conflictIds.value.has(x.id)).map((x) => x.id) })
}
const rep = reactive({ open: false, ok: 0, fails: [] })
async function doCopy() {
  if (!cp.ids.length) throw new Error('请至少勾选一个班次')
  await request(500, { fail: scene.value === 'copy-fail' ? new Error(`复制失败：${md(cpTo.value)} 的排班已经被锁定，不能再修改，本次没有复制任何班次`) : null })
  let ok = 0
  const fails = [], target = shiftsOn(cpTo.value)
  cpSrc.value.filter((x) => cp.ids.includes(x.id)).forEach((x) => {
    const c = { staffId: x.staffId, from: x.from, to: x.to }, same = target.find((o) => o.staffId === c.staffId && o.from === c.from && o.to === c.to), clash = target.find((o) => o.staffId === c.staffId && overlap(o, c))
    if (same) return fails.push({ name: staffOf(x.staffId).name + ' ' + x.title, reason: md(cpTo.value) + ' 已有同样的班次' })
    if (clash) return fails.push({ name: staffOf(x.staffId).name + ' ' + x.title, reason: `${md(cpTo.value)} 已有「${clash.title}」${timeText(clash)}，时间重叠` })
    target.push({ id: ++state.db.shiftSeq, staffId: x.staffId, from: x.from, to: x.to, title: x.title, kind: x.kind, needConfirm: x.kind === '会议', note: '' }); ok++
  })
  audit('schedule:edit', `批量复制 ${md(day.value)} 的班次到 ${md(cpTo.value)}（成功 ${ok} 个，跳过 ${fails.length} 个）`, '排班 ' + cpTo.value)
  Object.assign(rep, { open: fails.length > 0, ok, fails })
  ElMessage[fails.length ? 'warning' : 'success'](`已复制 ${ok} 个班次到 ${md(cpTo.value)}` + (fails.length ? `，跳过 ${fails.length} 个` : ''))
  if (ok) off.value += 1
}
</script>

<template>
  <div class="lz-page page">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <el-radio-group v-model="off" aria-label="日期">
          <el-radio-button v-for="o in [-1, 0, 1]" :key="o" :value="o">{{ DAYNAME[o] }} <span class="num">{{ md(dAdd(today, o)) }}</span></el-radio-button>
        </el-radio-group>
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-tooltip :disabled="canCopy" content="明天是最后一天，没有可复制到的日期" placement="bottom">
          <span><el-button :icon="CopyDocument" :disabled="!canCopy" @click="askCopy">复制排班</el-button></span>
        </el-tooltip>
        <el-button type="primary" :icon="Plus" @click="askShift(null)">新增班次</el-button>
      </div>

      <LzState :status="phase" :rows="8" error-hint="排班没有加载出来，请检查网络后重试" @retry="load">
        <section class="lz-kpis kpis" aria-label="当天概览">
          <LzKpi :label="DAYNAME[off] + '在岗人数'" :value="duty + ' / ' + state.db.staff.length" suffix="人" />
          <LzKpi label="冲突" :value="conflicts.length" suffix="处" />
          <LzKpi label="空闲时段（连续 2 小时以上）" :value="gapCount" suffix="个" />
        </section>

        <el-card shadow="never" class="lz-card" aria-label="排班泳道">
          <div class="legend">
            <span class="legend-item"><span class="sw primary" />正常班次</span>
            <span class="legend-item"><span class="sw danger" />时间冲突</span>
            <span class="legend-item"><span class="sw warning" />待本人确认</span>
            <span class="legend-item"><span class="sw free" />空闲</span>
            <span class="muted">会议用空心条；点横条查看、调整、换班或删除。</span>
          </div>
          <LzState :status="list.length ? 'ok' : 'empty'" :empty-title="'这一天（' + md(day) + '）还没有排班'">
            <template #empty-action><el-button type="primary" :icon="Plus" @click="askShift(null)">新增班次</el-button></template>
            <el-scrollbar>
              <div class="lanes" role="group" aria-label="员工排班时间轴">
                <div class="axis">
                  <div class="lane-label axis-label">员工</div>
                  <div class="axis-track">
                    <span v-for="h in HOURS" :key="h" class="tick num" :style="{ left: pct(h) + '%' }">{{ fmt(h) }}</span>
                    <el-tag v-if="nowPct !== null" type="danger" effect="light" class="now-tag" :style="{ left: nowPct + '%' }">现在 {{ nowStr.slice(11) }}</el-tag>
                  </div>
                </div>
                <div v-for="L in lanes" :key="L.s.id" class="lane">
                  <div class="lane-label">
                    <el-avatar :size="32" :src="avatar('staff-' + L.s.id)" class="av" />
                    <div><div class="strong">{{ L.s.name }}</div><div class="muted">{{ L.s.role }}</div></div>
                  </div>
                  <div class="track" :style="{ '--rows': L.rows }">
                    <span v-for="h in HOURS" :key="h" class="hour" :style="{ left: pct(h) + '%' }" />
                    <div v-for="g in L.gaps" :key="g[0]" class="gap" :style="{ left: pct(g[0]) + '%', width: (pct(g[1]) - pct(g[0])) + '%' }"><span class="muted">空闲 {{ g[1] - g[0] }} 小时</span></div>
                    <el-tooltip v-for="e in L.evs" :key="e.id" :content="barTip(e)" placement="top">
                      <el-button :type="barType(e)" :plain="e.kind === '会议'" class="bar" :class="{ flash: flash === e.id }" :style="{ left: pct(e.from) + '%', width: (pct(e.to) - pct(e.from)) + '%', '--r': e.row }" :aria-label="barTip(e)" @click="openShift(e.id)">{{ e.title }} {{ hh(e.from) }}–{{ hh(e.to) }}</el-button>
                    </el-tooltip>
                    <span v-if="nowPct !== null" class="now-line" :style="{ left: nowPct + '%' }" />
                  </div>
                </div>
                <div v-if="!lanes.length" class="lane-empty"><el-empty :image-size="64" description="当天没有冲突" /></div>
              </div>
            </el-scrollbar>
          </LzState>
        </el-card>

        <el-card shadow="never" class="lz-card" aria-label="冲突与待办">
          <div class="lz-toolbar head">
            <span class="strong">冲突与待办</span>
            <span class="muted">{{ todo.length }} 项</span>
            <span class="grow" />
            <span>只看冲突</span>
            <el-switch v-model="onlyBad" aria-label="只看冲突" />
          </div>
          <el-table :data="todo" size="large" :empty-text="onlyBad ? '这一天没有冲突' : '这一天没有需要处理的事项'">
            <el-table-column label="类型" width="100" align="center"><template #default="{ row }"><LzStatusTag :type="TODO_TAG[row.k][0]" :text="TODO_TAG[row.k][1]" /></template></el-table-column>
            <el-table-column label="事项" min-width="260" prop="text" />
            <el-table-column label="操作" width="100" align="center" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.id" link type="primary" @click="openShift(row.id)">处理</el-button>
                <el-button v-else link type="primary" @click="askShift(null, row.staffId)">去排班</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </LzState>

      <!-- shift detail -->
      <LzDialog v-model="sd.open" :title="'班次详情：' + (curShift?.title || '')" width="520px" no-footer>
        <el-tabs v-if="curShift" v-model="sd.tab">
          <el-tab-pane label="概况" name="info">
            <el-alert v-if="curClash.length" type="error" show-icon :closable="false" title="时间冲突" :description="'与「' + curClash.map((o) => o.title + ' ' + timeText(o)).join('」「') + '」重叠，请调整或换班。'" class="gap-bottom" />
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="人员">{{ staffOf(curShift.staffId).name }}（{{ staffOf(curShift.staffId).role }}）</el-descriptions-item>
              <el-descriptions-item label="日期"><span class="num">{{ day }}（{{ DAYNAME[off] }}）</span></el-descriptions-item>
              <el-descriptions-item label="时间"><span class="num">{{ timeText(curShift) }}，共 {{ curShift.to - curShift.from }} 小时</span></el-descriptions-item>
              <el-descriptions-item label="类型">{{ curShift.kind }}</el-descriptions-item>
              <el-descriptions-item label="名称">{{ curShift.title }}</el-descriptions-item>
              <el-descriptions-item label="确认状态"><LzStatusTag :type="curShift.needConfirm ? 'warning' : 'success'" :text="curShift.needConfirm ? '待本人确认' : '已确认'" /></el-descriptions-item>
            </el-descriptions>
            <div class="actions">
              <el-button @click="askShift(curShift)">调整</el-button>
              <el-button @click="askSwap(curShift)">换班</el-button>
              <el-button v-if="curShift.needConfirm" type="primary" plain :loading="busy === 'confirm'" @click="confirmShift(curShift)">标记确认</el-button>
              <el-button type="danger" plain :loading="busy === 'remove'" @click="removeShift(curShift)">删除</el-button>
            </div>
          </el-tab-pane>
          <el-tab-pane label="操作记录" name="trail">
            <el-timeline v-if="curTrail.length" class="trail">
              <el-timeline-item v-for="a in curTrail" :key="a.id" :timestamp="a.at + ' · ' + a.actor">{{ a.action }}</el-timeline-item>
            </el-timeline>
            <el-empty v-else :image-size="64" description="还没有这个班次的操作记录" />
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <LzDialog v-model="sf.open" :title="sf.sh ? '调整班次：' + sf.sh.title : '新增班次（' + day + '）'" width="480px" :confirm-text="sfClash.length ? '仍然保存' : '保存'" :on-confirm="doShift">
        <p class="muted">保存前会检查同一个人当天有没有时间重叠的班次。</p>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="人员"><el-select v-model="sf.staffId" style="width: 100%"><el-option v-for="s in state.db.staff" :key="s.id" :value="s.id" :label="s.name + '（' + s.role + '）'" /></el-select></el-form-item>
          <el-form-item label="类型"><el-radio-group v-model="sf.kind"><el-radio-button value="班次">班次</el-radio-button><el-radio-button value="会议">会议</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="名称"><el-input v-model="sf.title" maxlength="12" show-word-limit placeholder="例如 早班、盘点、周例会" /></el-form-item>
          <div class="two">
            <el-form-item label="开始"><el-select v-model="sf.from" style="width: 100%"><el-option v-for="o in hourOpts.slice(0, -1)" :key="o.value" v-bind="o" /></el-select></el-form-item>
            <el-form-item label="结束"><el-select v-model="sf.to" style="width: 100%"><el-option v-for="o in hourOpts.slice(1)" :key="o.value" v-bind="o" /></el-select></el-form-item>
          </div>
          <el-form-item label="需要本人确认（会议默认需要，确认前显示为橙色）"><el-switch v-model="sf.confirm" /></el-form-item>
        </el-form>
        <el-alert v-if="sfClash.length" type="warning" show-icon :closable="false" title="时间有冲突" :description="staffOf(sf.staffId).name + ' 在 ' + sfClash.map((o) => '「' + o.title + '」' + timeText(o)).join('、') + ' 已有安排，和 ' + fmt(sf.from) + '–' + fmt(sf.to) + ' 重叠。仍然保存的话，排班表里会标成红色冲突。'" />
      </LzDialog>

      <LzDialog v-model="sw.open" :title="'换班：' + (sw.sh?.title || '') + ' ' + (sw.sh ? timeText(sw.sh) : '')" width="480px" confirm-text="确认换班" :confirm-disabled="swClash.length > 0" :on-confirm="doSwap">
        <p v-if="sw.sh">现在是 {{ staffOf(sw.sh.staffId).name }}（{{ staffOf(sw.sh.staffId).role }}），换给另一位同事后会检查对方当天的时间。</p>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="换给"><el-select v-model="sw.to" style="width: 100%"><el-option v-for="s in swOthers" :key="s.id" :value="s.id" :label="s.name + '（' + s.role + '）'" /></el-select></el-form-item>
          <el-form-item label="原因（选填）"><el-input v-model="sw.why" type="textarea" :rows="2" maxlength="60" show-word-limit /></el-form-item>
        </el-form>
        <el-alert v-if="swClash.length" type="error" show-icon :closable="false" :title="swTarget.name + ' 在 ' + swClash.map((o) => '「' + o.title + '」' + timeText(o)).join('、') + ' 已有安排，换过去会冲突，请选别人'" />
        <el-alert v-else-if="sw.sh && swTarget && swTarget.role !== staffOf(sw.sh.staffId).role" type="warning" show-icon :closable="false" :title="swTarget.name + ' 是' + swTarget.role + '，原来是' + staffOf(sw.sh.staffId).role + '岗位，岗位不同，请确认后再换'" />
      </LzDialog>

      <LzDialog v-model="cp.open" :title="'复制到' + DAYNAME[off + 1] + '（' + md(cpTo) + '）'" width="480px" confirm-text="开始复制" :on-confirm="doCopy">
        <p>勾选要复制的班次。有冲突的默认不勾；对方当天已有重叠安排的会被跳过并说明原因。</p>
        <el-checkbox-group v-model="cp.ids" class="picks">
          <el-checkbox v-for="x in cpSrc" :key="x.id" :value="x.id" border>
            {{ staffOf(x.staffId).name }} {{ x.title }} {{ timeText(x) }}
            <LzStatusTag v-if="conflictIds.has(x.id)" type="danger" text="有冲突" />
            <LzStatusTag v-else-if="x.needConfirm" type="warning" text="待确认" />
          </el-checkbox>
        </el-checkbox-group>
      </LzDialog>

      <LzDialog v-model="rep.open" title="复制排班结果" width="520px" no-footer>
        <el-alert type="warning" show-icon :closable="false" :title="'成功 ' + rep.ok + ' 个，跳过 ' + rep.fails.length + ' 个'" />
        <el-table :data="rep.fails" size="small" class="gap-top">
          <el-table-column label="班次" prop="name" width="150" />
          <el-table-column label="跳过的原因" prop="reason" min-width="200" />
        </el-table>
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.page { grid-template-columns: minmax(0, 1fr); }
.strong { font-weight: 600; }
.kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; margin-bottom: 12px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 24px; height: 12px; border-radius: 4px; }
.sw.primary { background: var(--el-color-primary); }
.sw.danger { background: var(--el-color-danger); }
.sw.warning { background: var(--el-color-warning); }
.sw.free { border: 1px dashed var(--luz-border); }

.lanes { --bar-h: 32px; --label-w: 156px; min-width: 980px; }
.axis, .lane { display: grid; grid-template-columns: var(--label-w) minmax(0, 1fr); border-bottom: 1px solid var(--luz-line); }
.lane-label { position: sticky; left: 0; z-index: 3; display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 0; background: var(--luz-surface); }
.axis-label { color: var(--luz-ink-2); }
.axis-track { position: relative; height: 56px; margin: 0 24px; }
.tick { position: absolute; bottom: 4px; transform: translateX(-50%); color: var(--luz-ink-2); }
.now-tag { position: absolute; top: 2px; transform: translateX(-50%); z-index: 2; }
.track { position: relative; height: calc(var(--rows) * (var(--bar-h) + 8px) + 8px); margin: 0 24px; }
.hour { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--luz-line); }
.gap { position: absolute; top: 6px; bottom: 6px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--luz-border); border-radius: 8px; overflow: hidden; white-space: nowrap; }
.bar { position: absolute; top: calc(8px + var(--r) * (var(--bar-h) + 8px)); height: var(--bar-h); margin: 0; padding: 0 8px; display: flex; justify-content: flex-start; overflow: hidden; white-space: nowrap; z-index: 1; }
.bar.flash { box-shadow: 0 0 0 4px var(--luz-action-tint); }
.now-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--luz-danger); z-index: 2; pointer-events: none; }
.lane-empty { padding: 16px 0; }
.av { background: var(--luz-action-tint); color: var(--luz-action-text); flex: none; }

.head { margin-bottom: 12px; }
.gap-bottom { margin-bottom: 12px; }
.gap-top { margin-top: 12px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.picks { display: grid; gap: 8px; justify-items: stretch; }
.trail { padding-left: 4px; }

@media (max-width: 700px) {
  .lanes { --bar-h: 40px; --label-w: 120px; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
</style>
