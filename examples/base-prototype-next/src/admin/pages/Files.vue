<script>
// 素材库：主区加右侧窄栏。主区是分组、搜索、网格或列表；右侧是选中素材的预览与引用，以及常驻的存储用量。
export const meta = {
  id: 'files', label: '素材库', icon: 'image', group: '商品与营销', order: 3, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '素材库的主工作是浏览、挑选和管理图片，所以左边三分之二放网格或列表；选中一张素材后的预览、引用情况和改名改分组放在右侧固定窄栏，存储用量也常驻在那里，不用翻页就能看到',
  scenes: [
    { id: 'nodata', label: '素材库里还没有素材' },
    { id: 'upload-net', label: '上传失败：网络中断（可重试）' },
    { id: 'upload-size', label: '上传失败：文件超过 10 MB' },
    { id: 'upload-type', label: '上传失败：格式不支持' },
    { id: 'delete-fail', label: '删除失败：网络异常' },
  ],
}
</script>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowDown, CopyDocument, Delete, Picture, Refresh, Search, Upload } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { usePager } from '../use-pager.js'

const scene = useScene('files')
const mq = window.matchMedia('(max-width: 700px)')          // on a phone the table's action column scrolls with the rest
const narrow = ref(mq.matches)
const onMq = (e) => { narrow.value = e.matches }
mq.addEventListener('change', onMq)
onUnmounted(() => mq.removeEventListener('change', onMq))
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const GROUPS = ['商品', '轮播', '活动', '其他']
const QUOTA = 100 * 1024                                        // KB
const MAXKB = 10 * 1024
const DIMS = { 商品: [800, 450], 轮播: [1500, 600], 活动: [1080, 1440], 其他: [1200, 800] }
const fmtSize = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB')
const ext = (n) => (n.match(/\.[A-Za-z0-9]+$/) || [''])[0]
const dimsOf = (f) => (f.w && f.h ? [f.w, f.h] : DIMS[f.group] || DIMS['其他'])
const refsOf = (f) => (f.img ? state.db.products.filter((p) => p.img === f.img) : [])
const linkOf = (f) => 'files.example.com/f/' + f.id + ext(f.name)
const actor = () => (state.role === 'F' ? '陈晓燕' : '王海燕')
const audit = (code, action, target, result = '成功') => {
  const db = state.db
  db.audit.unshift({ id: db.audit.length + 1, at: B.fmt(B.NOW()), actor: actor(), code, action, target, result, ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}

// ---- the list
const files = computed(() => (scene.value === 'nodata' ? [] : state.db.files))
const filter = reactive({ group: 'all', q: '' })
const view = ref('grid')
const VIEWS = [{ label: '网格', value: 'grid' }, { label: '列表', value: 'list' }]
const searched = computed(() => { const q = filter.q.trim().toLowerCase(); return files.value.filter((f) => !q || f.name.toLowerCase().includes(q)) })
const count = (g) => (g === 'all' ? searched.value.length : searched.value.filter((f) => f.group === g).length)
const filtered = computed(() => searched.value.filter((f) => filter.group === 'all' || f.group === filter.group))
const totalKb = computed(() => filtered.value.reduce((s, f) => s + f.size, 0))
const pager = usePager('files')
const rows = pager.slice(filtered)
const hasRefs = computed(() => rows.value.some((f) => refsOf(f).length))      // an empty column is left out
const dirty = computed(() => filter.group !== 'all' || filter.q)
const resetFilter = () => Object.assign(filter, { group: 'all', q: '' })
const listStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))

// ---- selection (grid: checkboxes, list: the table's own) and the one active asset shown in the rail
const picked = ref([])
const table = ref(null)
const pickedFiles = computed(() => picked.value.map((id) => state.db.files.find((f) => f.id === id)).filter(Boolean))
const toggle = (id, on) => { picked.value = on ? [...picked.value, id] : picked.value.filter((x) => x !== id) }
const clearPick = () => { picked.value = []; table.value?.clearSelection() }
watch(() => ({ ...filter }), () => { pager.reset(); clearPick() })
watch([view, pager.page, pager.size], clearPick)
const activeId = ref(null)
const active = computed(() => state.db.files.find((f) => f.id === activeId.value) || null)
const setActive = (f) => { activeId.value = f.id }

// ---- upload: a real upload control; the progress, review and failures are simulated, with the reasons written out
const tasks = ref([])
let tid = 0
const typeOk = (name) => /\.(jpe?g|png|webp)$/i.test(name)
function enqueue(file) {
  tid += 1
  const kb = scene.value === 'upload-size' ? 12800 + tid * 311 : Math.max(1, Math.round(file.size / 1024))
  const t = reactive({ id: tid, name: file.name, size: kb, group: GROUPS.includes(filter.group) ? filter.group : '其他', status: 'uploading', percent: 0, err: '', retry: true, tries: 0, cancelled: false })
  tasks.value.unshift(t)
  run(t)
}
async function run(t) {
  t.status = 'uploading'; t.percent = 0; t.err = ''; t.tries += 1
  const fail = (msg, retry) => { t.status = 'failed'; t.err = msg; t.retry = retry; ElMessage.error(t.name + '：' + msg) }
  if (scene.value === 'upload-type' || !typeOk(t.name)) { await request(300).catch(() => {}); return fail('格式不支持，只能上传 jpg、png、webp 图片，请换一张', false) }
  if (scene.value === 'upload-size' || t.size > MAXKB) { await request(300).catch(() => {}); return fail(`文件 ${fmtSize(t.size)}，超过 ${fmtSize(MAXKB)} 的上限，请压缩后再传`, false) }
  for (let p = 0; p <= 100; p += 10) {
    if (t.cancelled) return
    try { await request(p === 0 || p === 60 ? 100 : 150) } catch { return fail(`网络中断，已上传 ${t.percent}%，网络恢复后点“重试”`, true) }
    if (scene.value === 'upload-net' && t.tries === 1 && p === 60) return fail(`网络中断，已上传 ${t.percent}%，网络恢复后点“重试”`, true)
    t.percent = p
  }
  t.status = 'reviewing'
  await request(700).catch(() => {})
  if (t.cancelled) return
  const db = state.db.files
  let name = t.name
  for (let n = 2; db.some((f) => f.name === name); n++) name = t.name.replace(/(\.[A-Za-z0-9]+)?$/, `-${n}$1`)
  const [w, h] = DIMS[t.group]
  const f = { id: db.reduce((m, x) => Math.max(m, x.id), 0) + 1, name, kind: '图片', size: t.size, group: t.group, uploader: actor(), at: B.fmt(B.NOW()), img: '', w, h }
  db.unshift(f)
  t.status = 'done'
  audit('system:file', '上传素材', `素材 ${f.name}，${fmtSize(f.size)}`)
  ElMessage.success(`已上传「${f.name}」，审核通过`)
  activeId.value = f.id
}
const upload = ({ file }) => { enqueue(file); return Promise.resolve() }
const dropTask = (t) => { t.cancelled = true; tasks.value.splice(tasks.value.indexOf(t), 1) }
const clearDone = () => { tasks.value = tasks.value.filter((t) => ['uploading', 'reviewing'].includes(t.status)) }

// ---- rename, regroup, copy link, delete: each is a dialog with its result and its failure
const rn = reactive({ open: false, f: null, name: '' })
const rnError = computed(() => {
  const f = rn.f; const v = rn.name.trim()
  if (!f) return ''
  if (!v) return '请填写素材名称'
  if (/[\\/:*?"<>|]/.test(v)) return '名称里不能有 \\ / : * ? " < > |'
  if (ext(v) !== ext(f.name)) return '请保留文件后缀 ' + ext(f.name)
  if (state.db.files.some((y) => y !== f && y.name === v)) return '已经有同名素材'
  return ''
})
const askRename = (f) => Object.assign(rn, { open: true, f, name: f.name })
async function doRename() {
  await request(400)
  const f = rn.f; const v = rn.name.trim()
  audit('system:file', '重命名素材', `${f.name} → ${v}`)
  f.name = v
  ElMessage.success('已重命名')
}

const rg = reactive({ open: false, f: null, group: '商品' })
const askRegroup = (f) => Object.assign(rg, { open: true, f, group: f.group })
async function doRegroup() {
  await request(400)
  const f = rg.f
  if (rg.group !== f.group) { audit('system:file', '修改素材分组', `${f.name}：${f.group} → ${rg.group}`); f.group = rg.group }
  ElMessage.success(`已改到「${rg.group}」`)
}

async function copyLink(f) {
  try { await navigator.clipboard.writeText(linkOf(f)) } catch { /* no clipboard permission in the demo: the message is still shown */ }
  ElMessage.success('素材链接已复制')
}

const del = reactive({ open: false, list: [] })
const delUsed = computed(() => del.list.map((f) => ({ f, ps: refsOf(f) })).filter((x) => x.ps.length))
const delAffected = computed(() => [...new Set(delUsed.value.flatMap((x) => x.ps))])
const delText = computed(() => {
  const list = del.list; const used = delUsed.value; const aff = delAffected.value
  if (list.length === 1) return used.length ? `「${list[0].name}」已被 ${used[0].ps.length} 个商品使用（${used[0].ps.map((p) => p.name).join('、')}），删除后这些商品没有图片。仍要删除吗？` : `将删除「${list[0].name}」，删除后无法恢复。`
  return `将删除 ${list.length} 个素材。` + (used.length ? `其中 ${used.length} 个已被商品使用，涉及 ${aff.length} 个商品（${aff.slice(0, 4).map((p) => p.name).join('、')}${aff.length > 4 ? ' 等' : ''}），删除后这些商品没有图片。` : '没有商品在用这些素材。') + '删除后无法恢复，仍要删除吗？'
})
const askDelete = (list) => Object.assign(del, { open: true, list: list.slice() })
async function doDelete() {
  await request(500, { fail: scene.value === 'delete-fail' ? new Error('删除失败：网络异常，素材没有被删除，请稍后再试') : null })
  const list = del.list; const aff = delAffected.value; const ids = new Set(list.map((f) => f.id))
  for (let i = state.db.files.length - 1; i >= 0; i--) if (ids.has(state.db.files[i].id)) state.db.files.splice(i, 1)
  aff.forEach((p) => { p.img = ''; audit('product:edit', '商品图片被清空', `商品 ${p.name}（素材被删除）`) })
  audit('system:file', list.length > 1 ? '批量删除素材' : '删除素材', list.length > 1 ? `${list.length} 个素材${aff.length ? `，影响 ${aff.length} 个商品` : ''}` : `素材 ${list[0].name}${aff.length ? `，影响 ${aff.length} 个商品` : ''}`)
  if (ids.has(activeId.value)) activeId.value = null
  clearPick()
  ElMessage.success(`已删除 ${list.length} 个素材${aff.length ? `，${aff.length} 个商品现在没有图片` : ''}`)
}
const onMore = (cmd, f) => ({ rename: askRename, group: askRegroup, copy: copyLink, delete: (x) => askDelete([x]) })[cmd](f)

// ---- the rail: storage use is always shown
const usage = computed(() => {
  const all = files.value
  const by = GROUPS.map((g) => { const l = all.filter((x) => x.group === g); return { g, n: l.length, kb: l.reduce((s, x) => s + x.size, 0) } })
  const used = by.reduce((s, x) => s + x.kb, 0)
  return { by, used, pct: Math.min(100, (used / QUOTA) * 100) }
})
const activeRefs = computed(() => (active.value ? refsOf(active.value) : []))
</script>

<template>
  <div class="lz-page">
    <div class="lz-toolbar">
      <el-input v-model="filter.q" clearable placeholder="搜索素材名称" :prefix-icon="Search" style="width: 240px" aria-label="素材名称" />
      <el-radio-group v-model="view" aria-label="视图"><el-radio-button v-for="v in VIEWS" :key="v.value" :value="v.value">{{ v.label }}</el-radio-button></el-radio-group>
      <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
      <span class="grow" />
      <span class="muted num">共 {{ filtered.length }} 个素材，合计 {{ fmtSize(totalKb) }}</span>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-upload :http-request="upload" :show-file-list="false" accept=".jpg,.jpeg,.png,.webp" multiple>
        <el-button type="primary" :icon="Upload">上传素材</el-button>
      </el-upload>
    </div>

    <div class="lz-main-rail">
      <div class="lz-grid">
        <!-- the upload queue: progress, review, and each failure with its reason -->
        <el-card v-if="tasks.length" shadow="never" class="lz-card" aria-label="上传队列">
          <template #header>
            <div class="row"><strong>上传队列</strong><span class="grow" /><el-button text type="primary" @click="clearDone">清除已结束</el-button></div>
          </template>
          <div class="queue">
            <div v-for="t in tasks" :key="t.id" class="queue-row">
              <div class="row"><span class="grow clamp-2">{{ t.name }}</span><span class="muted num">{{ fmtSize(t.size) }}</span></div>
              <el-alert v-if="t.status === 'failed'" :title="t.err" type="error" show-icon :closable="false" />
              <div v-else-if="t.status === 'done'" class="muted">上传完成，审核通过</div>
              <div v-else class="row"><el-progress class="grow" :percentage="t.status === 'reviewing' ? 100 : t.percent" :show-text="false" :stroke-width="8" /><span class="muted num">{{ t.status === 'reviewing' ? '审核中' : t.percent + '%' }}</span></div>
              <div class="row">
                <el-button v-if="t.status === 'failed' && t.retry" @click="run(t)">重试</el-button>
                <el-button v-if="t.status === 'failed' || t.status === 'done'" text @click="dropTask(t)">移除</el-button>
                <el-button v-if="t.status === 'uploading'" text @click="dropTask(t)">取消</el-button>
              </div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="lz-card" aria-label="素材列表">
          <el-tabs v-model="filter.group">
            <el-tab-pane v-for="g in ['all', ...GROUPS]" :key="g" :name="g">
              <template #label>{{ g === 'all' ? '全部' : g }}<span class="tab-count num" :class="{ zero: !count(g) }">{{ count(g) }}</span></template>
            </el-tab-pane>
          </el-tabs>

          <div v-if="picked.length" class="lz-toolbar batch">
            <span class="num">已选 {{ picked.length }} 个素材，合计 {{ fmtSize(pickedFiles.reduce((s, f) => s + f.size, 0)) }}</span>
            <span class="grow" />
            <el-button type="danger" plain :icon="Delete" @click="askDelete(pickedFiles)">批量删除</el-button>
            <el-button text @click="clearPick">取消选择</el-button>
          </div>

          <LzState :status="listStatus" :empty-title="scene === 'nodata' ? '素材库里还没有素材，点右上角“上传素材”添加' : '没有符合条件的素材'" error-hint="素材列表没有加载出来，请检查网络后重试" @retry="load">
            <template #empty-action><el-button v-if="dirty" type="primary" @click="resetFilter">重置筛选</el-button></template>

            <div v-if="view === 'grid'" class="tiles">
              <el-card v-for="f in rows" :key="f.id" shadow="never" class="tile" :class="{ on: active?.id === f.id }" body-class="tile-body">
                <div class="tile-pic" @click="setActive(f)">
                  <el-image v-if="f.img" :src="f.img" fit="cover" class="tile-img" :alt="f.name" />
                  <div v-else class="tile-ph"><el-icon :size="28"><Picture /></el-icon></div>
                </div>
                <el-checkbox :model-value="picked.includes(f.id)" class="tile-check" :aria-label="'选择 ' + f.name" @change="(v) => toggle(f.id, v)" />
                <el-text truncated class="tile-name">{{ f.name }}</el-text>
                <div class="muted num">{{ fmtSize(f.size) }} · {{ f.group }}</div>
                <div class="row tile-foot">
                  <el-tag v-if="refsOf(f).length" type="primary" effect="light">{{ refsOf(f).length }} 个商品在用</el-tag>
                  <span class="grow" />
                  <el-button text type="primary" :aria-label="'查看素材 ' + f.name" @click="setActive(f)">查看</el-button>
                </div>
              </el-card>
            </div>

            <el-table v-else ref="table" :data="rows" size="large" row-key="id" @selection-change="(l) => (picked = l.map((f) => f.id))">
              <el-table-column type="selection" width="46" />
              <el-table-column label="素材" min-width="210">
                <template #default="{ row }">
                  <div class="cell-file">
                    <el-image v-if="row.img" :src="row.img" fit="cover" class="thumb" :alt="row.name" />
                    <div v-else class="thumb tile-ph"><el-icon><Picture /></el-icon></div>
                    <div class="grow">
                      <el-link type="primary" underline="never" :aria-label="'查看素材 ' + row.name" @click="setActive(row)">{{ row.name }}</el-link>
                      <div class="muted num">{{ dimsOf(row).join(' × ') }} · {{ row.group }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="体积" width="100" align="right"><template #default="{ row }"><span class="num">{{ fmtSize(row.size) }}</span></template></el-table-column>
              <el-table-column label="上传日期" width="112" align="center"><template #default="{ row }"><span class="num">{{ row.at.slice(0, 10) }}</span></template></el-table-column>
              <el-table-column v-if="hasRefs" label="引用" width="128" align="center">
                <template #default="{ row }"><el-tag v-if="refsOf(row).length" type="primary" effect="light">{{ refsOf(row).length }} 个商品在用</el-tag><span v-else class="muted">未使用</span></template>
              </el-table-column>
              <el-table-column label="操作" width="150" align="center" :fixed="narrow ? false : 'right'">
                <template #default="{ row }">
                  <el-button text type="primary" :aria-label="'查看素材 ' + row.name" @click="setActive(row)">查看</el-button>
                  <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
                    <el-button text :icon="ArrowDown" :aria-label="'更多操作：' + row.name" />
                    <template #dropdown><el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item command="group">改分组</el-dropdown-item>
                      <el-dropdown-item command="copy">复制链接</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                    </el-dropdown-menu></template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
            <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
          </LzState>
        </el-card>
      </div>

      <aside class="lz-grid" aria-label="素材详情与存储用量">
        <el-card shadow="never" class="lz-card" aria-label="素材预览">
          <template #header><div class="row"><strong>素材预览</strong><span class="grow" /><el-tag v-if="active" type="success" effect="light">已通过审核</el-tag></div></template>
          <el-empty v-if="!active" description="点一张素材，在这里看大图、尺寸和有哪些商品在用" :image-size="72" />
          <div v-else class="stack">
            <el-image v-if="active.img" :src="active.img" fit="contain" class="pv" :alt="active.name" :preview-src-list="[active.img]" preview-teleported />
            <div v-else class="pv tile-ph"><el-icon :size="36"><Picture /></el-icon></div>
            <strong class="pv-name">{{ active.name }}</strong>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="尺寸"><span class="num">{{ dimsOf(active).join(' × ') }}</span></el-descriptions-item>
              <el-descriptions-item label="体积"><span class="num">{{ fmtSize(active.size) }}</span></el-descriptions-item>
              <el-descriptions-item label="分组">{{ active.group }}</el-descriptions-item>
              <el-descriptions-item label="上传人">{{ active.uploader }}</el-descriptions-item>
              <el-descriptions-item label="上传时间"><span class="num">{{ active.at }}</span></el-descriptions-item>
              <el-descriptions-item label="引用情况">{{ activeRefs.length ? `已被 ${activeRefs.length} 个商品使用：${activeRefs.map((p) => p.name).join('、')}` : '没有商品在用' }}</el-descriptions-item>
            </el-descriptions>
            <el-input :model-value="linkOf(active)" readonly aria-label="素材链接">
              <template #append><el-button :icon="CopyDocument" @click="copyLink(active)">复制链接</el-button></template>
            </el-input>
            <div class="row">
              <el-button @click="askRename(active)">重命名</el-button>
              <el-button @click="askRegroup(active)">改分组</el-button>
              <el-button type="danger" plain :icon="Delete" @click="askDelete([active])">删除</el-button>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="lz-card" aria-label="存储用量">
          <template #header><div class="row"><strong>存储用量</strong><span class="grow" /><span class="muted num">{{ usage.pct.toFixed(1) }}%</span></div></template>
          <div class="stack">
            <div><strong class="num">{{ fmtSize(usage.used) }}</strong><span class="muted num"> / {{ fmtSize(QUOTA) }}</span></div>
            <div v-for="x in usage.by" :key="x.g" class="use-row">
              <div class="row"><span class="grow">{{ x.g }}（{{ x.n }} 个）</span><span class="num">{{ fmtSize(x.kb) }}</span></div>
              <el-progress :percentage="Math.min(100, (x.kb / QUOTA) * 100)" :show-text="false" :stroke-width="6" :aria-label="x.g + ' 占用 ' + fmtSize(x.kb)" />
            </div>
            <el-alert v-if="usage.pct > 80" title="用量已超过 80%，请清理没用的素材。" type="warning" show-icon :closable="false" />
            <span v-else class="muted">容量够用，单个文件不超过 {{ fmtSize(MAXKB) }}，支持 jpg、png、webp。</span>
          </div>
        </el-card>
      </aside>
    </div>

    <LzDialog v-model="rn.open" title="重命名素材" width="440px" confirm-text="保存" :confirm-disabled="!!rnError || rn.name.trim() === rn.f?.name" :on-confirm="doRename">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="素材名称" :error="rnError"><el-input v-model="rn.name" maxlength="40" show-word-limit /></el-form-item>
        <span class="muted">保留文件后缀 {{ rn.f ? ext(rn.f.name) : '' }}</span>
      </el-form>
    </LzDialog>

    <LzDialog v-model="rg.open" :title="'改分组：' + (rg.f?.name || '')" width="440px" confirm-text="确认修改" :on-confirm="doRegroup">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="分组"><el-radio-group v-model="rg.group"><el-radio v-for="g in GROUPS" :key="g" :value="g">{{ g }}</el-radio></el-radio-group></el-form-item>
      </el-form>
    </LzDialog>

    <LzDialog v-model="del.open" :title="delUsed.length ? '素材正在被使用' : '确认删除'" width="460px" danger :confirm-text="delUsed.length ? '仍要删除' : '确认删除'" :on-confirm="doDelete">
      <p>{{ delText }}</p>
    </LzDialog>
  </div>
</template>

<style scoped>
.tab-count { margin-left: 6px; color: var(--luz-ink-2); font-weight: 400; }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.batch { margin-bottom: 12px; padding: 8px 12px; background: var(--luz-action-tint); border-radius: var(--luz-radius-control); }
.queue { display: grid; gap: 12px; }
.queue-row { display: grid; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--luz-line); }
.queue-row:last-child { padding-bottom: 0; border-bottom: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.tile { position: relative; border-color: var(--luz-line); }
.tile.on { border-color: var(--luz-action); box-shadow: 0 0 0 1px var(--luz-action); }
.tile :deep(.tile-body) { display: grid; gap: 4px; padding: 10px; }
.tile-pic { cursor: pointer; }
.tile-img, .tile-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 104px; border-radius: var(--luz-radius-control); background: var(--luz-canvas); color: var(--luz-ink-3); }
.tile-check { position: absolute; top: 12px; left: 14px; height: auto; padding: 2px 4px; background: var(--luz-surface); border-radius: var(--luz-radius-control); }
.tile-name { font-weight: 600; max-width: 100%; }
.tile-foot { min-height: 40px; }
.cell-file { display: flex; align-items: center; gap: 12px; text-align: left; }
.thumb { flex: none; width: 56px; height: 40px; border-radius: var(--luz-radius-control); background: var(--luz-canvas); }
.pv { width: 100%; height: 190px; border-radius: var(--luz-radius-control); background: var(--luz-canvas); }
.pv-name { overflow-wrap: anywhere; }
.use-row { display: grid; gap: 4px; }
strong { font-weight: 600; }
</style>
