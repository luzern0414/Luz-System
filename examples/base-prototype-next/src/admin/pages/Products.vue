<script>
// 商品：主角是商品本身。左边是可切换卡片或列表的清单，筛选与批量上下架都在这里做；右边窄栏放库存预警、热销榜、最近上下架。
export const meta = {
  id: 'products', label: '商品', icon: 'bag', group: '商品与营销', order: 1, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '商品页的主角是商品本身：左边三分之二放可切换卡片或列表的商品清单，筛选、批量上下架都在这里做；右边窄栏固定不动，放库存预警、热销榜、最近上下架这些“该补货、卖得怎么样、谁动过”的辅助信息',
  scenes: [
    { id: 'nodata', label: '所选分类下没有商品' },
    { id: 'save-conflict', label: '保存失败：商品刚被同事修改过' },
    { id: 'publish-fail', label: '上下架失败：网络异常' },
  ],
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Delete, Download, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, yuan } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const scene = useScene('products')
const allowed = computed(() => meta.roles.includes(state.role))
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// 手机宽度：表格的操作列不再固定在右边（固定列会盖住大半个屏幕）
const narrow = ref(false)
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 700px)') : null
const syncNarrow = () => { narrow.value = !!mq?.matches }
onMounted(() => { syncNarrow(); mq?.addEventListener('change', syncNarrow) })
onBeforeUnmount(() => mq?.removeEventListener('change', syncNarrow))

const LOW = 10, WARN = 40
const me = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const nowStr = () => B.fmt(B.NOW())
const short = (s) => (s || '').slice(5)
const clone = (x) => JSON.parse(JSON.stringify(x))
const cats = ref(B.CATS.map((c) => ({ ...c })))
const catName = (id) => cats.value.find((c) => c.id === id)?.name || '未分类'
const PST = { ON: ['在售', 'success'], OFF: ['已下架', 'info'] }
const specText = (p) => (p.specs?.length ? p.specs.map((g) => g.name + '：' + g.opts.map((o) => o.n + (o.d ? `（+¥${yuan(o.d)}）` : '')).join('、')).join('；') : '没有规格')

function audit(code, action, target) {
  const a = state.db.audit
  a.unshift({ id: a.reduce((m, x) => Math.max(m, x.id), 0) + 1, at: nowStr(), actor: me.value, code, action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}
/** 演示数据里没有上下架记录：第一次进来补三条真实商品名的动态，写进审计，商品页和操作日志都看得到 */
function seedAudit() {
  const db = state.db
  if (db.audit.some((a) => a.code === 'product:publish' && a.target === '商品 梅菜扣肉饭' && a.action === '下架商品')) return
  const day = (n) => K.ymd(K.addDays(B.NOW(), -n))
  ;[[1, '周敏', 'product:publish', '下架商品', '梅菜扣肉饭', '18:20'], [3, '周敏', 'product:publish', '上架商品', '西式早餐', '09:05'], [5, '王海燕', 'product:edit', '调整价格', '招牌牛腩饭', '14:42']].forEach(([n, who, code, action, name, t], i) => {
    db.audit.push({ id: db.audit.length + 1 + i, at: day(n) + ' ' + t, actor: who, code, action, target: '商品 ' + name, result: '成功', ip: '10.0.0.8', trace: 'tr' + (7000000 + i).toString(16) })
  })
  db.audit.sort((a, b) => (a.at < b.at ? 1 : -1))
}
seedAudit()

// ---- 列表：默认看在售的商品，“全部状态”是其中一个选项
const src = computed(() => (scene.value === 'nodata' ? [] : state.db.products))
const S = reactive({ cat: 'all', status: 'ON', stock: '', q: '', sort: 'sort' })
const view = ref('list')
const base = computed(() => {
  const q = S.q.trim().toLowerCase()
  return src.value.filter((p) => (!S.status || p.status === S.status) && (!S.stock || (S.stock === 'low' ? p.stock < LOW : S.stock === 'warn' ? p.stock < WARN : p.stock <= 0))
    && (!q || p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q)))
})
const counts = computed(() => { const c = { all: base.value.length }; base.value.forEach((p) => { c[p.cat] = (c[p.cat] || 0) + 1 }); return c })
const CMP = { sort: (a, b) => a.sort - b.sort || b.id - a.id, sales: (a, b) => b.sales - a.sales, price: (a, b) => a.price - b.price, stock: (a, b) => a.stock - b.stock }
const filtered = computed(() => base.value.filter((p) => S.cat === 'all' || p.cat === S.cat).sort(CMP[S.sort]))
const pager = usePager('products')
const rows = pager.slice(filtered)
const dirty = computed(() => S.cat !== 'all' || S.status !== 'ON' || S.stock || S.q || S.sort !== 'sort')
const resetFilter = () => Object.assign(S, { cat: 'all', status: 'ON', stock: '', q: '', sort: 'sort' })
const status = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const lowCount = computed(() => filtered.value.filter((p) => p.stock < LOW).length)

const tableRef = ref(null)
const selectedIds = ref([])
const selected = computed(() => selectedIds.value.map((id) => state.db.products.find((p) => p.id === id)).filter(Boolean))
const clearSel = () => { selectedIds.value = []; nextTick(() => tableRef.value?.clearSelection()) }
watch(() => ({ ...S }), () => { pager.reset(); clearSel() })
watch([view, () => pager.page.value, () => pager.size.value], clearSel)
watch(() => S.cat, () => { if (S.cat !== 'all' && !cats.value.some((c) => c.id === S.cat)) S.cat = 'all' })

// ---- 一个“确认”对话框：下架、批量改分类等先说清影响；提交在对话框里做，失败写在对话框里
const ask = reactive({ open: false, title: '', text: '', danger: false, confirmText: '确认', submit: null })
const askOpen = (opts) => Object.assign(ask, { open: true, danger: false, confirmText: '确认', ...opts })

// ---- 上下架：下架先确认影响；批量逐条报告
async function doPublish(list, to) {
  const fit = list.filter((p) => p.status !== to), verb = to === 'ON' ? '上架' : '下架'
  await request(400, { fail: scene.value === 'publish-fail' ? new Error(`${verb}失败：网络异常，商品状态没有变化，请稍后再试`) : null })
  fit.forEach((p) => { p.status = to; audit('product:publish', verb + '商品', '商品 ' + p.name) })
  if (list.length === 1) ElMessage.success(`已${verb}「${list[0].name}」`)
  else ElMessage.success(`批量${verb}：成功 ${fit.length} 条${list.length - fit.length ? `，跳过 ${list.length - fit.length} 条（已经是${PST[to][0]}）` : ''}`)
}
async function publish(list, to) {
  const verb = to === 'ON' ? '上架' : '下架', fit = list.filter((p) => p.status !== to)
  if (!fit.length) { ElMessage.warning(list.length === 1 ? `${list[0].name} 已经是${PST[to][0]}` : `选中的商品都已经是${PST[to][0]}`); return }
  if (to === 'ON') { try { await doPublish(list, to) } catch (e) { ElMessage.error(e.message) } return }
  const names = fit.slice(0, 4).map((p) => '「' + p.name + '」').join('、') + (fit.length > 4 ? ` 等 ${fit.length} 个商品` : '')
  const inCart = (state.db.cart || []).filter((c) => fit.some((p) => p.id === c.pid)).length
  askOpen({
    title: `确认下架 ${fit.length} 个商品`, danger: true, confirmText: '确认下架',
    text: `将下架 ${names}。改前：在售；改后：已下架。顾客端不再显示，${inCart ? `购物车里的 ${inCart} 件会标记失效、不能结算` : '已在购物车里的会标记失效、不能结算'}；已经下的订单不受影响，随时可以重新上架。`,
    submit: () => doPublish(list, to).then(() => clearSel()),
  })
}
/** 行内开关：改动由 publish 完成（下架要先确认），开关自己不翻转，状态变了它自然跟着变 */
const onSwitch = async (p) => { await publish([p], p.status === 'ON' ? 'OFF' : 'ON'); return false }

// ---- 补货、改分类
const rs = reactive({ open: false, p: null, n: 20 })
const askRestock = (p) => Object.assign(rs, { open: true, p, n: 20 })
const doRestock = async () => {
  await request(400)
  rs.p.stock += rs.n; audit('product:edit', '商品补货', `商品 ${rs.p.name}，+${rs.n}`)
  ElMessage.success(`已补货 ${rs.n} 件，现有库存 ${rs.p.stock} 件`)
}
const mv = reactive({ open: false, list: [], cat: '' })
const askMove = (list) => Object.assign(mv, { open: true, list, cat: list[0].cat })
const doMove = async () => {
  await request(400)
  mv.list.forEach((p) => { p.cat = mv.cat })
  audit('product:edit', '批量改分类', `${mv.list.length} 个商品改到「${catName(mv.cat)}」`)
  ElMessage.success(`${mv.list.length} 个商品已改到「${catName(mv.cat)}」`); clearSel()
}

// ---- 新增与编辑：规格在编辑框里一起改
const TAG_PRESET = ['新品', '招牌', '热销', '限量', '微辣']
const ed = reactive({ open: false, p: null, isNew: false, f: {}, tags: [], specs: [], reason: '', tab: 'base' })
const files = computed(() => state.db.files.filter((x) => x.img))
function openEdit(p) {
  const cur = p || { name: '', cat: S.cat !== 'all' ? S.cat : (cats.value.find((c) => state.db.products.some((x) => x.cat === c.id)) || cats.value[0] || {}).id, price: 0, orig: 0, desc: '', img: '', stock: 20, status: 'ON', specs: [], tags: [], sort: state.db.products.reduce((m, x) => Math.max(m, x.sort), 0) + 1 }
  Object.assign(ed, {
    open: true, p, isNew: !p, reason: '', tab: 'base', tags: [...(cur.tags || [])],
    specs: clone(cur.specs || []).map((g) => ({ name: g.name, opts: g.opts.map((o) => ({ n: o.n, d: o.d / 100 })) })),
    f: { name: cur.name, cat: cur.cat, sort: cur.sort, price: cur.price ? cur.price / 100 : 0, orig: cur.orig && cur.orig > cur.price ? cur.orig / 100 : null, stock: cur.stock, on: cur.status === 'ON', desc: cur.desc || '', img: cur.img || '' },
  })
}
const priceChanged = computed(() => !ed.isNew && ed.p && Math.round((ed.f.price || 0) * 100) !== ed.p.price)
const imgUsedBy = computed(() => (ed.f.img ? state.db.products.find((x) => x !== ed.p && x.img === ed.f.img) : null))
const addGroup = () => ed.specs.push({ name: '', opts: [{ n: '', d: 0 }] })
const addOpt = (g) => g.opts.push({ n: '', d: 0 })
function validateEdit() {
  const f = ed.f, price = Math.round((f.price || 0) * 100), orig = f.orig ? Math.round(f.orig * 100) : 0
  if (!f.name || f.name.trim().length < 2) return '商品名称至少 2 个字'
  if (state.db.products.some((x) => x !== ed.p && x.name === f.name.trim())) return '已经有同名商品'
  if (!(price > 0)) return '售价要大于 0'
  if (price > 9999900) return '售价不能超过 99999 元'
  if (orig && orig < price) return '划线价要比售价高，不想显示划线就留空'
  if (!Number.isInteger(f.stock) || f.stock < 0) return '库存要填 0 或更大的整数'
  const names = new Set()
  for (const g of ed.specs) {
    if (!g.name.trim()) return '请填写规格组名称'
    if (names.has(g.name.trim())) return '规格组名称重复：' + g.name
    names.add(g.name.trim())
    if (!g.opts.length) return `规格组「${g.name}」至少要有一个选项`
    const on = new Set()
    for (const o of g.opts) {
      if (!o.n.trim()) return `规格组「${g.name}」里有选项没有名称`
      if (on.has(o.n.trim())) return `规格组「${g.name}」里选项名称重复：${o.n}`
      on.add(o.n.trim())
    }
  }
  if (priceChanged.value && !ed.reason.trim()) return '改价要写原因'
  return ''
}
const doSave = async () => {
  const msg = validateEdit(); if (msg) { ed.tab = /规格|选项/.test(msg) ? 'spec' : 'base'; throw new Error(msg) }
  await request(500, { fail: scene.value === 'save-conflict' ? new Error('保存失败：这个商品刚被其他同事修改过。请关闭后重新打开再改，你填的内容还在，可以先复制保存') : null })
  const f = ed.f, price = Math.round(f.price * 100), orig = f.orig ? Math.round(f.orig * 100) : 0
  const patch = { name: f.name.trim(), cat: f.cat, sort: f.sort, price, orig: orig || price, stock: f.stock, status: f.on ? 'ON' : 'OFF', desc: f.desc, img: f.img, tags: [...ed.tags], specs: ed.specs.map((g) => ({ name: g.name.trim(), opts: g.opts.map((o) => ({ n: o.n.trim(), d: Math.round((o.d || 0) * 100) })) })) }
  if (ed.isNew) {
    state.db.products.push({ id: state.db.products.reduce((m, x) => Math.max(m, x.id), 0) + 1, sales: 0, ...patch })
    audit('product:edit', '新增商品', `商品 ${patch.name}，售价 ¥${yuan(price)}`)
    resetFilter()
    ElMessage.success(`已创建「${patch.name}」`)
  } else {
    const cur = ed.p, changed = []
    if (price !== cur.price) changed.push(`价格 ¥${yuan(cur.price)} → ¥${yuan(price)}（${ed.reason.trim()}）`)
    if (f.stock !== cur.stock) changed.push(`库存 ${cur.stock} → ${f.stock}`)
    if (patch.status !== cur.status) changed.push(patch.status === 'ON' ? '上架' : '下架')
    Object.assign(cur, patch)
    audit('product:edit', '编辑商品', `商品 ${cur.name}${changed.length ? '：' + changed.join('，') : ''}`)
    ElMessage.success(`已保存「${cur.name}」`)
  }
}

// ---- 分类管理：增删改排序，点保存才生效
const cd = reactive({ open: false, list: [], err: '' })
const countIn = (id) => state.db.products.filter((p) => p.cat === id).length
let cid = 1
const openCats = () => Object.assign(cd, { open: true, list: cats.value.map((c) => ({ ...c })), err: '' })
const moveCat = (i, d) => { cd.list.splice(i + d, 0, cd.list.splice(i, 1)[0]); cd.err = '' }
function delCat(i) {
  const c = cd.list[i], n = countIn(c.id)
  if (n) { cd.err = `「${c.name}」下还有 ${n} 个商品，请先把它们改到别的分类，再删除`; return }
  cd.list.splice(i, 1); cd.err = ''
}
const addCat = () => { cd.list.push({ id: 'c' + Date.now().toString(36) + cid++, name: '' }); cd.err = '' }
const doCats = async () => {
  const names = cd.list.map((c) => c.name.trim())
  if (!cd.list.length) throw new Error('至少保留一个分类')
  if (names.some((n) => !n)) throw new Error('分类名称不能为空')
  if (new Set(names).size !== names.length) throw new Error('分类名称不能重复')
  await request(400)
  const next = cd.list.map((c, i) => ({ id: c.id, name: names[i] }))
  B.CATS.splice(0, B.CATS.length, ...next); cats.value = next.map((c) => ({ ...c }))
  audit('product:edit', '调整商品分类', `${next.length} 个分类：${names.join('、')}`)
  ElMessage.success('分类已保存')
}

// ---- 详情：概况、规格、销量与关联订单、操作记录
const det = reactive({ open: false, p: null, tab: 'ov' })
const openDetail = (p) => Object.assign(det, { open: true, p, tab: 'ov' })
const detOrders = computed(() => (det.p ? state.db.orders.filter((o) => o.items.some((i) => i.pid === det.p.id)) : []))
const qtyOf = (o) => o.items.filter((i) => i.pid === det.p.id).reduce((a, i) => a + i.qty, 0)
const detRecent = computed(() => detOrders.value.filter((o) => o.createdAt.slice(0, 10) >= K.ymd(K.addDays(B.NOW(), -29))))
const detQty = computed(() => detRecent.value.reduce((s, o) => s + qtyOf(o), 0))
const detLogs = computed(() => (det.p ? state.db.audit.filter((a) => a.target.includes(det.p.name)).slice(0, 12) : []))

// ---- 导出：中文表头、范围等于当前筛选
const exp = ref(false)
const expName = computed(() => `商品_${S.cat === 'all' ? '全部分类' : catName(S.cat)}`)
const doExport = async () => { await request(700); ElMessage.success(`已生成「${expName.value}」，共 ${filtered.value.length} 条`) }

// ---- 右侧窄栏
const warn = computed(() => src.value.filter((p) => p.stock < WARN).sort((a, b) => a.stock - b.stock))
const top = computed(() => {
  const l = src.value.slice().sort((a, b) => b.sales - a.sales).slice(0, 5), mx = Math.max(1, ...l.map((p) => p.sales))
  return l.map((p) => ({ ...p, pct: Math.round((p.sales / mx) * 100) }))
})
const feed = computed(() => state.db.audit.filter((a) => (a.code === 'product:publish' || a.code === 'product:edit') && state.db.products.some((p) => a.target.includes(p.name))).slice(0, 6))
</script>

<template>
  <div class="lz-page">
    <!-- 手机宽度：库的组件整体换成大尺寸，触摸目标不小于 40 像素 -->
    <el-config-provider :size="narrow ? 'large' : 'default'">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar end">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Download" :disabled="!filtered.length" @click="exp = true">导出商品</el-button>
        <el-button @click="openCats">分类管理</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit(null)">新增商品</el-button>
      </div>

      <div class="lz-main-rail products-grid">
        <!-- 主区：商品清单 -->
        <el-card shadow="never" class="lz-card main" aria-label="商品清单">
          <el-tabs v-model="S.cat">
            <el-tab-pane name="all"><template #label>全部<span class="tab-count num" :class="{ zero: !counts.all }">{{ counts.all }}</span></template></el-tab-pane>
            <el-tab-pane v-for="c in cats" :key="c.id" :name="c.id"><template #label>{{ c.name }}<span class="tab-count num" :class="{ zero: !counts[c.id] }">{{ counts[c.id] || 0 }}</span></template></el-tab-pane>
          </el-tabs>
          <div class="lz-toolbar filters">
            <el-select v-model="S.status" clearable placeholder="全部状态" style="width: 132px" aria-label="上架状态"><el-option value="ON" label="在售" /><el-option value="OFF" label="已下架" /></el-select>
            <el-select v-model="S.stock" clearable placeholder="全部库存" style="width: 148px" aria-label="库存"><el-option value="low" :label="'库存低于 ' + LOW" /><el-option value="warn" :label="'库存低于 ' + WARN" /><el-option value="zero" label="已售罄" /></el-select>
            <el-select v-model="S.sort" style="width: 148px" aria-label="排序"><el-option value="sort" label="按排序值" /><el-option value="sales" label="销量从高到低" /><el-option value="price" label="价格从低到高" /><el-option value="stock" label="库存从少到多" /></el-select>
            <el-input v-model="S.q" clearable placeholder="商品名称或简介" :prefix-icon="Search" style="width: 200px" aria-label="搜索商品" />
            <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
          </div>
          <div class="lz-toolbar summary-line">
            <p class="muted summary num grow">共 {{ filtered.length }} 个商品<template v-if="lowCount">，其中库存低于 {{ LOW }} 的 {{ lowCount }} 个</template><template v-if="S.status">；只看{{ PST[S.status][0] }}</template></p>
            <el-radio-group v-model="view" aria-label="视图"><el-radio-button value="list">列表</el-radio-button><el-radio-button value="card">卡片</el-radio-button></el-radio-group>
          </div>

          <div v-if="selected.length" class="batch" role="region" aria-label="批量操作">
            <span class="num">已选 {{ selected.length }} 个商品</span>
            <span class="grow" />
            <el-button @click="publish(selected, 'ON')">批量上架</el-button>
            <el-button type="danger" plain @click="publish(selected, 'OFF')">批量下架</el-button>
            <el-button @click="askMove(selected)">批量改分类</el-button>
            <el-button text @click="clearSel">取消选择</el-button>
          </div>

          <LzState :status="status" :empty-title="scene === 'nodata' ? '所选分类下没有商品' : '没有符合条件的商品'" error-hint="商品列表没有加载出来，请检查网络后重试" @retry="load">
            <template #empty-action><el-button v-if="dirty" @click="resetFilter">重置筛选</el-button><el-button type="primary" @click="openEdit(null)">新增商品</el-button></template>

            <el-table v-if="view === 'list'" ref="tableRef" :data="rows" size="large" row-key="id" @selection-change="(l) => (selectedIds = l.map((p) => p.id))">
              <el-table-column type="selection" width="48" />
              <el-table-column label="商品" min-width="210">
                <template #default="{ row }">
                  <div class="pname">
                    <el-image :src="row.img" fit="cover" class="thumb" :alt="row.name"><template #error><span class="thumb-empty muted">无图</span></template></el-image>
                    <div class="grow"><span class="name">{{ row.name }}</span><div class="muted">{{ [S.cat === 'all' ? catName(row.cat) : '', ...(row.tags || [])].filter(Boolean).join(' · ') }}</div></div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="售价（元）" width="112" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.price) }}</span><div v-if="row.orig > row.price" class="muted num"><s>{{ yuan(row.orig) }}</s></div></template></el-table-column>
              <el-table-column label="库存（件）" width="112" align="right">
                <template #default="{ row }">
                  <el-tag v-if="row.stock <= 0" type="danger" effect="light">已售罄</el-tag>
                  <el-tag v-else-if="row.stock < LOW" type="danger" effect="light" class="num">仅剩 {{ row.stock }}</el-tag>
                  <el-tag v-else-if="row.stock < WARN" type="warning" effect="light" class="num">{{ row.stock }}</el-tag>
                  <span v-else class="num">{{ row.stock }}</span>
                </template>
              </el-table-column>
              <el-table-column label="上架" width="136" align="center">
                <template #default="{ row }"><span class="sw"><el-switch :model-value="row.status === 'ON'" :before-change="() => onSwitch(row)" :aria-label="(row.status === 'ON' ? '下架 ' : '上架 ') + row.name" /><span>{{ PST[row.status][0] }}</span></span></template>
              </el-table-column>
              <el-table-column label="操作" width="176" align="center" :fixed="narrow ? false : 'right'">
                <template #default="{ row }">
                  <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
                  <el-button text type="primary" @click="openDetail(row)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-checkbox-group v-else v-model="selectedIds" class="pgrid">
              <el-card v-for="p in rows" :key="p.id" shadow="never" class="pcard" :class="{ off: p.status === 'OFF' }">
                <div class="pcard-img">
                  <el-image :src="p.img" fit="cover" class="pcard-pic" :alt="p.name"><template #error><span class="thumb-empty muted">无图</span></template></el-image>
                  <el-checkbox :value="p.id" class="pcard-cb" :aria-label="'选择 ' + p.name" />
                  <el-tag v-if="p.status === 'OFF'" type="info" effect="light" class="pcard-tag">已下架</el-tag>
                  <el-tag v-else-if="p.sales >= 300" type="primary" effect="light" class="pcard-tag">热销</el-tag>
                </div>
                <div class="pcard-b">
                  <span class="name">{{ p.name }}</span>
                  <p class="muted clamp-2 desc">{{ p.desc || '暂无简介' }}</p>
                  <div class="pcard-row"><span class="num"><span class="name">¥{{ yuan(p.price) }}</span><s v-if="p.orig > p.price" class="muted orig">¥{{ yuan(p.orig) }}</s></span><el-tag v-if="p.stock < LOW" type="danger" effect="light">{{ p.stock <= 0 ? '已售罄' : '仅剩 ' + p.stock }}</el-tag><span v-else class="muted num">库存 {{ p.stock }}</span></div>
                  <div class="muted">{{ catName(p.cat) }} · 销量 {{ p.sales }}</div>
                </div>
                <div class="pcard-f">
                  <el-button @click="openEdit(p)">编辑</el-button>
                  <el-button :type="p.status === 'ON' ? 'default' : 'primary'" :plain="p.status !== 'ON'" @click="publish([p], p.status === 'ON' ? 'OFF' : 'ON')">{{ p.status === 'ON' ? '下架' : '上架' }}</el-button>
                  <el-button @click="openDetail(p)">详情</el-button>
                </div>
              </el-card>
            </el-checkbox-group>
            <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
          </LzState>
        </el-card>

        <!-- 右侧窄栏：该补货、卖得怎么样、谁动过 -->
        <aside class="rail" aria-label="库存预警、热销榜和最近上下架">
          <el-card shadow="never" class="lz-card" aria-label="库存预警">
            <div class="card-head"><span class="card-title">库存预警</span><el-tag :type="warn.some((p) => p.stock < LOW) ? 'danger' : warn.length ? 'warning' : 'info'" effect="light">{{ warn.length }} 项</el-tag></div>
            <template v-if="warn.length">
              <p class="muted">低于 {{ LOW }} 件标红，低于 {{ WARN }} 件标橙。</p>
              <ul class="list">
                <li v-for="p in warn.slice(0, 6)" :key="p.id">
                  <span class="grow">{{ p.name }}<span v-if="p.status === 'OFF'" class="muted">（已下架）</span></span>
                  <el-tag :type="p.stock < LOW ? 'danger' : 'warning'" effect="light" class="num">{{ p.stock <= 0 ? '已售罄' : '剩 ' + p.stock }}</el-tag>
                  <el-button text type="primary" :aria-label="'补货：' + p.name" @click="askRestock(p)">补货</el-button>
                </li>
              </ul>
            </template>
            <p v-else class="muted">库存都够，没有需要补的商品。</p>
          </el-card>

          <el-card shadow="never" class="lz-card" aria-label="热销榜">
            <div class="card-head"><span class="card-title">热销榜前五</span><span class="muted">按累计销量</span></div>
            <ol v-if="top.length" class="rank">
              <li v-for="(p, i) in top" :key="p.id">
                <span class="rk num">{{ i + 1 }}</span>
                <div class="grow">
                  <div class="rank-line"><span>{{ p.name }}</span><span class="num">{{ p.sales }} 份</span></div>
                  <el-progress :percentage="p.pct" :show-text="false" :stroke-width="8" :aria-label="p.name + ' 销量 ' + p.sales + ' 份'" />
                </div>
              </li>
            </ol>
            <p v-else class="muted">还没有销量</p>
          </el-card>

          <el-card shadow="never" class="lz-card" aria-label="最近上下架动态">
            <div class="card-head"><span class="card-title">最近上下架动态</span></div>
            <el-timeline v-if="feed.length" class="feed">
              <el-timeline-item v-for="a in feed" :key="a.id" :timestamp="short(a.at)">{{ a.actor }} {{ a.action }}<div class="muted">{{ a.target }}</div></el-timeline-item>
            </el-timeline>
            <p v-else class="muted">还没有上下架记录</p>
          </el-card>
        </aside>
      </div>
    </template>

    <!-- 确认（下架） -->
    <LzDialog v-model="ask.open" :title="ask.title" :width="narrow ? '94%' : '460px'" :danger="ask.danger" :confirm-text="ask.confirmText" :on-confirm="() => ask.submit()">
      <p>{{ ask.text }}</p>
    </LzDialog>

    <!-- 补货 -->
    <LzDialog v-model="rs.open" :title="'补货：' + (rs.p?.name || '')" :width="narrow ? '94%' : '420px'" confirm-text="确认补货" :confirm-disabled="!(rs.n > 0)" :on-confirm="doRestock">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="补货数量（件）"><el-input-number v-model="rs.n" :min="1" :max="9999" :step="10" :precision="0" step-strictly /></el-form-item>
      </el-form>
      <el-alert type="info" show-icon :closable="false" :title="`改前库存 ${rs.p?.stock ?? 0} 件，改后 ${(rs.p?.stock ?? 0) + (rs.n || 0)} 件；补货加在现有库存上。`" />
    </LzDialog>

    <!-- 改分类 -->
    <LzDialog v-model="mv.open" :title="mv.list.length === 1 ? '改分类：' + mv.list[0].name : `批量改分类（${mv.list.length} 个商品）`" :width="narrow ? '94%' : '420px'" confirm-text="确认修改" :on-confirm="doMove">
      <el-form label-position="top" @submit.prevent><el-form-item label="新分类"><el-select v-model="mv.cat"><el-option v-for="c in cats" :key="c.id" :value="c.id" :label="c.name" /></el-select></el-form-item></el-form>
    </LzDialog>

    <!-- 新增与编辑 -->
    <LzDialog v-model="ed.open" :title="ed.isNew ? '新增商品' : '编辑商品：' + (ed.p?.name || '')" :width="narrow ? '94%' : '680px'" :confirm-text="ed.isNew ? '创建商品' : '保存修改'" :on-confirm="doSave">
      <el-tabs v-model="ed.tab">
        <el-tab-pane label="基本信息" name="base">
          <el-form label-position="top" class="form-grid" @submit.prevent>
            <el-form-item label="商品名称" class="wide"><el-input v-model="ed.f.name" maxlength="60" show-word-limit placeholder="2 到 60 个字" /></el-form-item>
            <el-form-item label="分类"><el-select v-model="ed.f.cat"><el-option v-for="c in cats" :key="c.id" :value="c.id" :label="c.name" /></el-select></el-form-item>
            <el-form-item label="排序（越小越靠前）"><el-input-number v-model="ed.f.sort" :min="0" :precision="0" step-strictly /></el-form-item>
            <el-form-item label="售价（元）"><el-input-number v-model="ed.f.price" :min="0" :max="99999" :precision="2" :step="1" /></el-form-item>
            <el-form-item label="划线价（元，选填）"><el-input-number v-model="ed.f.orig" :min="0" :max="99999" :precision="2" :step="1" placeholder="比售价高才显示划线" /></el-form-item>
            <el-form-item label="库存（件）"><el-input-number v-model="ed.f.stock" :min="0" :max="99999" :precision="0" step-strictly /></el-form-item>
            <el-form-item label="立即上架"><el-switch v-model="ed.f.on" /></el-form-item>
            <el-form-item label="商品简介" class="wide"><el-input v-model="ed.f.desc" type="textarea" :rows="2" maxlength="255" show-word-limit placeholder="一两句话写清口味、做法或适合谁" /></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="图片与标签" name="media">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="商品图片（来自素材库）">
              <el-select v-model="ed.f.img" clearable placeholder="没有图片时，顾客端显示默认占位图">
                <el-option v-for="x in files" :key="x.id" :value="x.img" :label="x.name"><span class="opt-img"><el-image :src="x.img" fit="cover" class="opt-pic" />{{ x.name }}</span></el-option>
              </el-select>
              <span v-if="imgUsedBy" class="muted hint">提示：这张图也被「{{ imgUsedBy.name }}」使用</span>
            </el-form-item>
            <el-image v-if="ed.f.img" :src="ed.f.img" fit="cover" class="pd-img preview" alt="已选图片" />
            <el-form-item label="标签（最多 5 个，可自己输入）">
              <el-select v-model="ed.tags" multiple filterable allow-create default-first-option :multiple-limit="5" placeholder="选择或输入标签"><el-option v-for="t in [...new Set([...TAG_PRESET, ...ed.tags])]" :key="t" :value="t" :label="t" /></el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="规格" name="spec">
          <p v-if="!ed.specs.length" class="muted">还没有规格。顾客下单时直接买这件商品；需要选份量、口味时再添加规格组。选项的加价只影响之后的订单。</p>
          <el-card v-for="(g, gi) in ed.specs" :key="gi" shadow="never" class="spec-group">
            <div class="spec-head"><el-input v-model="g.name" maxlength="8" placeholder="规格组名称，如：份量、口味" :aria-label="'规格组 ' + (gi + 1) + ' 名称'" /><el-button type="danger" plain @click="ed.specs.splice(gi, 1)">删除规格组</el-button></div>
            <div v-for="(o, oi) in g.opts" :key="oi" class="spec-opt">
              <el-input v-model="o.n" maxlength="8" placeholder="选项名称，如：加大" :aria-label="(g.name || '规格组 ' + (gi + 1)) + ' 选项 ' + (oi + 1) + ' 名称'" />
              <el-input-number v-model="o.d" :min="0" :precision="2" :step="1" :aria-label="(g.name || '规格组 ' + (gi + 1)) + ' 选项 ' + (oi + 1) + ' 加价（元）'" />
              <el-button :icon="Delete" :aria-label="'删除选项 ' + (o.n || oi + 1)" @click="g.opts.splice(oi, 1)" />
            </div>
            <div class="spec-foot"><el-button :disabled="g.opts.length >= 6" @click="addOpt(g)">添加选项</el-button><span class="muted">{{ g.opts.length >= 6 ? '每组最多 6 个选项；' : '' }}选项后面是加价（元）</span></div>
          </el-card>
          <el-button :disabled="ed.specs.length >= 3" @click="addGroup">添加规格组</el-button><span v-if="ed.specs.length >= 3" class="muted"> 最多 3 个规格组</span>
        </el-tab-pane>
      </el-tabs>

      <template v-if="priceChanged">
        <el-alert class="price-alert" type="warning" show-icon :closable="false" :title="`改前售价 ¥${yuan(ed.p.price)}，改后 ¥${(ed.f.price || 0).toFixed(2)}。只影响之后下的订单，已经下的订单价格不变。`" />
        <el-form label-position="top" @submit.prevent><el-form-item label="改价原因（必填）"><el-input v-model="ed.reason" maxlength="100" show-word-limit placeholder="如：原料涨价、活动结束" /></el-form-item></el-form>
      </template>
    </LzDialog>

    <!-- 分类管理 -->
    <LzDialog v-model="cd.open" title="分类管理" :width="narrow ? '94%' : '480px'" confirm-text="保存分类" :on-confirm="doCats">
      <p class="muted">分类决定顾客端的菜单顺序，靠上的先显示。有商品的分类不能删除。</p>
      <div v-for="(c, i) in cd.list" :key="c.id" class="cat-row">
        <el-button :icon="ArrowUp" :disabled="i === 0" :aria-label="'上移 ' + c.name" @click="moveCat(i, -1)" />
        <el-button :icon="ArrowDown" :disabled="i === cd.list.length - 1" :aria-label="'下移 ' + c.name" @click="moveCat(i, 1)" />
        <el-input v-model="c.name" maxlength="8" :aria-label="'分类名称 ' + (i + 1)" placeholder="分类名称" class="grow" />
        <el-tag type="info" effect="light">{{ countIn(c.id) }} 个商品</el-tag>
        <el-button :aria-label="'删除分类 ' + c.name" @click="delCat(i)">删除</el-button>
      </div>
      <el-button :disabled="cd.list.length >= 10" :icon="Plus" @click="addCat">添加分类</el-button>
      <el-alert v-if="cd.err" :title="cd.err" type="error" show-icon :closable="false" class="price-alert" />
    </LzDialog>

    <!-- 详情 -->
    <LzDialog v-model="det.open" :title="'商品：' + (det.p?.name || '')" :width="narrow ? '94%' : '680px'" no-footer>
      <template v-if="det.p">
        <el-tabs v-model="det.tab">
          <el-tab-pane label="概况" name="ov">
            <div class="pd">
              <el-image :src="det.p.img" fit="cover" class="pd-img" :alt="det.p.name"><template #error><span class="thumb-empty muted">无图</span></template></el-image>
              <div class="grow">
                <p class="name">{{ det.p.name }}</p>
                <p class="muted">{{ det.p.desc || '暂无简介' }}</p>
                <div class="row"><LzStatusTag :type="PST[det.p.status][1]" :text="PST[det.p.status][0]" /><el-tag v-for="t in det.p.tags || []" :key="t" type="primary" effect="light">{{ t }}</el-tag></div>
              </div>
            </div>
            <el-descriptions :column="narrow ? 1 : 2" border class="pd-meta">
              <el-descriptions-item label="分类">{{ catName(det.p.cat) }}</el-descriptions-item>
              <el-descriptions-item label="售价（元）"><span class="num">{{ yuan(det.p.price) }}</span><span v-if="det.p.orig > det.p.price" class="muted num"> 划线 <s>{{ yuan(det.p.orig) }}</s></span></el-descriptions-item>
              <el-descriptions-item label="库存（件）"><span class="num">{{ det.p.stock }}</span></el-descriptions-item>
              <el-descriptions-item label="累计销量（份）"><span class="num">{{ det.p.sales }}</span></el-descriptions-item>
              <el-descriptions-item label="排序值"><span class="num">{{ det.p.sort }}</span></el-descriptions-item>
              <el-descriptions-item label="近 30 天"><span class="num">{{ detRecent.length }} 单，售出 {{ detQty }} 份</span></el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane label="规格" name="spec">
            <template v-if="det.p.specs?.length">
              <el-card v-for="g in det.p.specs" :key="g.name" shadow="never" class="spec-group">
                <div class="card-title">{{ g.name }}</div>
                <ul class="list"><li v-for="o in g.opts" :key="o.n"><span class="grow">{{ o.n }}</span><span class="muted num">{{ o.d ? '加价 ¥' + yuan(o.d) : '不加价' }}</span></li></ul>
              </el-card>
            </template>
            <el-empty v-else description="这个商品没有规格" />
          </el-tab-pane>
          <el-tab-pane label="销量与关联订单" name="ord">
            <p class="muted">近 30 天共 {{ detRecent.length }} 单、售出 {{ detQty }} 份（全部时间 {{ detOrders.length }} 单）。订单的详情在订单页查看。</p>
            <el-table v-if="detOrders.length" :data="detOrders.slice(0, 8)" size="large">
              <el-table-column label="订单号" width="168" align="center"><template #default="{ row }"><span class="num">{{ row.no }}</span></template></el-table-column>
              <el-table-column label="会员" prop="userName" width="96" align="center" />
              <el-table-column label="下单时间" width="116" align="center"><template #default="{ row }"><span class="num">{{ short(row.createdAt) }}</span></template></el-table-column>
              <el-table-column label="数量" width="70" align="center"><template #default="{ row }"><span class="num">×{{ qtyOf(row) }}</span></template></el-table-column>
              <el-table-column label="状态" width="92" align="center"><template #default="{ row }"><LzStatusTag kind="order" :status="row.status" /></template></el-table-column>
            </el-table>
            <el-empty v-else description="还没有包含这个商品的订单" />
          </el-tab-pane>
          <el-tab-pane label="操作记录" name="rec">
            <el-timeline v-if="detLogs.length"><el-timeline-item v-for="a in detLogs" :key="a.id" :timestamp="short(a.at) + ' · ' + a.actor">{{ a.action }} · {{ a.target }}</el-timeline-item></el-timeline>
            <el-empty v-else description="还没有操作记录" />
          </el-tab-pane>
        </el-tabs>
        <div class="detail-actions">
          <span class="grow" />
          <el-button @click="askRestock(det.p)">补货</el-button>
          <el-button @click="openEdit(det.p)">编辑</el-button>
          <el-button v-if="det.p.status === 'ON'" type="danger" plain @click="publish([det.p], 'OFF')">下架</el-button>
          <el-button v-else type="primary" @click="publish([det.p], 'ON')">上架</el-button>
        </div>
      </template>
    </LzDialog>

    <LzDialog v-model="exp" title="导出商品" :width="narrow ? '94%' : '440px'" confirm-text="开始导出" :on-confirm="doExport">
      <p>导出范围：当前筛选结果，共 <span class="num em">{{ filtered.length }}</span> 个商品；表头是中文，状态已翻译，价格单位为元，不含内部编号和空列。</p>
      <p class="muted">文件名：{{ expName }}.xlsx</p>
    </LzDialog>
    </el-config-provider>
  </div>
</template>

<style scoped>
.main { min-width: 0; }
.end { justify-content: flex-end; }
.products-grid { grid-template-columns: minmax(0, 1fr) 300px; }
@media (max-width: 1100px) { .products-grid { grid-template-columns: minmax(0, 1fr); } }
.tab-count { margin-left: 6px; color: var(--luz-ink-2); font-weight: 400; }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.filters { margin-bottom: 8px; }
.summary { margin: 0; }
.summary-line { margin-bottom: 12px; }
.batch { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; margin-bottom: 12px; background: var(--luz-action-tint); border-radius: var(--luz-radius-control); }
.name { font-weight: 600; }
.em { font-weight: 600; }
.pname { display: flex; align-items: center; gap: 12px; text-align: left; }
.thumb { width: 44px; height: 44px; border-radius: var(--luz-radius-control); flex: none; background: var(--luz-canvas); }
.thumb-empty { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: var(--luz-canvas); }
.sw { display: inline-flex; align-items: center; gap: 8px; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; font-size: 14px; line-height: 22px; }
.pcard { border-radius: var(--luz-radius-card); min-width: 0; }
.pcard.off { opacity: .85; }
.pcard :deep(.el-card__body) { padding: 0; display: grid; }
.pcard-img { position: relative; height: 140px; background: var(--luz-canvas); border-radius: var(--luz-radius-card) var(--luz-radius-card) 0 0; overflow: hidden; }
.pcard-pic { width: 100%; height: 100%; }
.pcard-cb { position: absolute; top: 4px; left: 8px; }
.pcard-tag { position: absolute; top: 8px; right: 8px; }
.pcard-b { padding: 12px; display: grid; gap: 6px; }
.pcard-b p { margin: 0; }
.desc { min-height: 44px; }
.orig { margin-left: 8px; }
.pcard-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pcard-f { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
.rail { display: grid; gap: 16px; min-width: 0; align-content: start; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.card-title { font-weight: 600; }
.list, .rank { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.list li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.rank { gap: 12px; }
.rank li { display: flex; gap: 12px; align-items: center; }
.rk { width: 22px; height: 22px; border-radius: 50%; background: var(--luz-action-tint); color: var(--luz-action-text); display: inline-flex; align-items: center; justify-content: center; font-weight: 600; flex: none; }
.rank-line { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.feed { margin-top: 8px; padding-left: 4px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.form-grid .wide { grid-column: 1 / -1; }
@media (max-width: 700px) { .form-grid { grid-template-columns: minmax(0, 1fr); } }
.form-grid :deep(.el-input-number) { width: 100%; }
.hint { margin-left: 8px; }
.opt-img { display: inline-flex; align-items: center; gap: 8px; }
.opt-pic { width: 28px; height: 28px; border-radius: 4px; }
.spec-group { margin-bottom: 12px; border-radius: var(--luz-radius-control); }
.spec-group :deep(.el-card__body) { display: grid; gap: 8px; padding: 12px; }
.spec-head, .spec-opt { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.spec-head .el-input, .spec-opt .el-input { flex: 1 1 160px; width: auto; }
.spec-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.price-alert { margin-top: 12px; }
.cat-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.pd { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.preview { margin-bottom: 12px; }
.pd-img { width: 120px; height: 120px; border-radius: var(--luz-radius-control); flex: none; background: var(--luz-canvas); }
.pd p { margin: 0 0 8px; }
.pd-meta { margin-top: 16px; }
.detail-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>
