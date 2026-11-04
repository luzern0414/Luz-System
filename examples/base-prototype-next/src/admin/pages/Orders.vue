<script>
// Sample page of the admin prototype: the pattern every list page follows (see CONVENTIONS.md).
export const meta = {
  id: 'orders', label: '订单', icon: 'list', group: '交易', order: 1, roles: ['A', 'F'],
  layout: '横带分层',
  reason: '订单中心的工作顺序是先看今天的结论、再看近两周的走势、最后处理具体订单，所以三条通栏横带自上而下排开；明细表格占最大的面积，是真正动手的地方',
  scenes: [
    { id: 'nodata', label: '所选范围没有订单' },
    { id: 'cancel-fail', label: '取消失败：网络异常' },
    { id: 'fulfil-conflict', label: '出餐失败：订单已被同事处理' },
    { id: 'refund-fail', label: '发起退款失败：支付渠道暂时不可用' },
    { id: 'print-fail', label: '打印失败：小票打印机没有连接' },
    { id: 'export-fail', label: '导出失败：结果超过 5000 条' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ArrowDown, Download, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, money } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const scene = useScene('orders')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const orders = computed(() => (scene.value === 'nodata' ? [] : state.db.orders))
const today = K.ymd(B.NOW())
const dayOf = (o) => o.createdAt.slice(0, 10)
const earned = (o) => ['PAID', 'FULFILLED', 'DONE'].includes(o.status)

// ---- band 1: the numbers of today against yesterday
const yesterday = K.ymd(K.addDays(B.NOW(), -1))
const stat = (day) => { const list = orders.value.filter((o) => dayOf(o) === day); const paid = list.filter(earned); const rev = paid.reduce((s, o) => s + o.amount, 0); return { n: list.length, rev, avg: paid.length ? rev / paid.length : 0 } }
const ratio = (a, b) => (b ? (a - b) / b : null)
const now = computed(() => stat(today)); const before = computed(() => stat(yesterday))
const waiting = computed(() => orders.value.filter((o) => o.status === 'PAID').length)
const refunding = computed(() => orders.value.filter((o) => o.status === 'REFUNDING').length)

// ---- band 2: the last 14 days
const days = Array.from({ length: 14 }, (_, i) => K.ymd(K.addDays(B.NOW(), i - 13)))
const trend = computed(() => [{ name: '订单数', data: days.map((d) => orders.value.filter((o) => dayOf(o) === d).length) }])

// ---- band 3: the list. The default view is what needs handling (待履约), 全部 is one of the tabs.
const TABS = [['PAID', '待履约'], ['FULFILLED', '已出餐'], ['UNPAID', '待支付'], ['REFUNDING', '退款中'], ['DONE', '已完成'], ['CANCELLED', '已取消'], ['ALL', '全部']]
const filter = reactive({ tab: 'PAID', range: 30, pay: '', q: '' })
const count = (code) => (code === 'ALL' ? orders.value.length : orders.value.filter((o) => o.status === code).length)
const filtered = computed(() => {
  const from = K.ymd(K.addDays(B.NOW(), -filter.range))
  const q = filter.q.trim()
  return orders.value.filter((o) => (filter.tab === 'ALL' || o.status === filter.tab) && (!filter.range || dayOf(o) >= from) && (!filter.pay || o.pay === filter.pay)
    && (!q || o.no.includes(q) || o.userName.includes(q) || o.pickup === q.toUpperCase()))
})
const pager = usePager('orders')
const rows = pager.slice(filtered)
watch(() => ({ ...filter }), () => pager.reset())
const hasRemark = computed(() => rows.value.some((o) => o.remark))     // a column that is empty in the current view is left out
const summary = (o) => o.items.map((i) => `${i.name}×${i.qty}`).join('、')
const dirty = computed(() => filter.tab !== 'PAID' || filter.range !== 30 || filter.pay || filter.q)
const resetFilter = () => Object.assign(filter, { tab: 'PAID', range: 30, pay: '', q: '' })
const tabStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))

// ---- actions: every one has an entry, a result and a failure the person can read
const busy = ref('')
async function act(o, name, change) {
  busy.value = o.no + name
  try {
    await request(450, { fail: scene.value === 'fulfil-conflict' && name === '出餐' ? new Error('出餐失败：订单已被同事处理，请刷新后查看最新状态') : null })
    change(o); ElMessage.success(`订单 ${o.no} 已${name}`)
  } catch (e) { ElMessage.error(e.message) } finally { busy.value = '' }
}
const fulfil = (o) => act(o, '出餐', (x) => (x.status = 'FULFILLED'))
const finish = (o) => act(o, '完成', (x) => (x.status = 'DONE'))
async function print(o) { try { await request(300, { fail: scene.value === 'print-fail' ? new Error('打印失败：小票打印机没有连接，请检查打印机后重试') : null }); ElMessage.success('小票已发送到打印机') } catch (e) { ElMessage.error(e.message) } }

const detail = reactive({ open: false, o: null })
const open = (o) => { detail.o = o; detail.open = true }

// every refund, whichever page starts it, is one row of state.db.refunds (the 售后 page and the mini-program read the same list)
const stamp = () => { const d = B.NOW(); return K.ymd(d) + ' ' + K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()) }
const addRefund = (o, amount, reason, status, handler) => state.db.refunds.unshift({
  id: Math.max(0, ...state.db.refunds.map((r) => r.id)) + 1, orderNo: o.no, userName: o.userName, amount, reason, kind: '仅退款', status, appliedAt: stamp(), handler, note: '',
})
const cancel = reactive({ open: false, o: null, reason: '' })
const cancelReasons = ['会员要求取消', '商品售罄', '重复下单', '其他原因']
const askCancel = (o) => Object.assign(cancel, { open: true, o, reason: '' })
const doCancel = async () => {
  await request(450, { fail: scene.value === 'cancel-fail' ? new Error('取消失败：网络异常，订单状态没有改变，请重试') : null })
  if (cancel.o.status === 'PAID') addRefund(cancel.o, cancel.o.amount, cancel.reason, 'DONE', '系统')   // a paid order goes back the way it came: the refund shows on the 售后 page
  cancel.o.status = 'CANCELLED'; ElMessage.success(`订单 ${cancel.o.no} 已取消`)
}

const refund = reactive({ open: false, o: null, amount: 0, reason: '' })
const refundable = (o) => ['PAID', 'FULFILLED', 'DONE'].includes(o.status)
const askRefund = (o) => Object.assign(refund, { open: true, o, amount: o.amount / 100, reason: '' })
const doRefund = async () => {
  if (refund.amount <= 0 || refund.amount * 100 > refund.o.amount) throw new Error(`退款金额要在 0.01 到 ${(refund.o.amount / 100).toFixed(2)} 元之间`)
  await request(500, { fail: scene.value === 'refund-fail' ? new Error('发起退款失败：支付渠道暂时不可用，订单状态没有改变，请稍后重试') : null })
  addRefund(refund.o, Math.round(refund.amount * 100), refund.reason, 'PENDING', '')
  refund.o.status = 'REFUNDING'; ElMessage.success('退款申请已提交，等待审批')
}

const exp = reactive({ open: false })
const doExport = async () => {
  await request(700, { fail: scene.value === 'export-fail' ? new Error('导出失败：结果超过 5000 条，请缩小时间范围后再导出') : null })
  ElMessage.success(`已生成「订单_近 ${filter.range || '全部'} 天」，共 ${filtered.value.length} 条`)
}
const onMore = (cmd, o) => ({ cancel: askCancel, refund: askRefund, print })[cmd](o)
</script>

<template>
  <div class="lz-page">
    <div class="lz-toolbar">
      <span class="grow" />
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-button v-if="state.role === 'A'" type="primary" :icon="Download" @click="exp.open = true">导出结果</el-button>
    </div>

    <!-- band 1 -->
    <section aria-label="今日概览" class="lz-kpis">
      <LzKpi label="今日订单" :value="now.n" suffix="单" :delta="ratio(now.n, before.n)" note="较昨日" />
      <LzKpi label="今日营业额" :value="(now.rev / 100).toFixed(2)" suffix="元" :delta="ratio(now.rev, before.rev)" note="较昨日" />
      <LzKpi label="待履约" :value="waiting" suffix="单" />
      <LzKpi label="退款中" :value="refunding" suffix="单" />
      <LzKpi label="客单价" :value="(now.avg / 100).toFixed(2)" suffix="元" :delta="ratio(now.avg, before.avg)" note="较昨日" />
    </section>

    <!-- band 2 -->
    <el-card shadow="never" class="lz-card" aria-label="近 14 天订单走势">
      <LzChart kind="line" :categories="days.map((d) => d.slice(5))" :series="trend" :height="200" unit="" label="近 14 天订单走势" />
    </el-card>

    <!-- band 3 -->
    <el-card shadow="never" class="lz-card" aria-label="订单明细">
      <el-tabs v-model="filter.tab">
        <el-tab-pane v-for="[code, label] in TABS" :key="code" :name="code">
          <template #label>{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></template>
        </el-tab-pane>
      </el-tabs>
      <div class="lz-toolbar filters">
        <el-select v-model="filter.range" style="width: 128px" aria-label="时间范围"><el-option :value="7" label="近 7 天" /><el-option :value="14" label="近 14 天" /><el-option :value="30" label="近 30 天" /><el-option :value="0" label="全部时间" /></el-select>
        <el-select v-model="filter.pay" clearable placeholder="全部支付方式" style="width: 156px" aria-label="支付方式"><el-option v-for="(label, code) in B.PAY" :key="code" :value="code" :label="label" /></el-select>
        <el-input v-model="filter.q" clearable placeholder="会员、订单号或取餐号" :prefix-icon="Search" style="width: 220px" />
        <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
        <span class="grow" /><span class="muted small">共 {{ filtered.length }} 条</span>
      </div>

      <LzState :status="tabStatus" empty-title="所选范围没有订单" error-hint="订单列表没有加载出来，请检查网络后重试" @retry="load">
        <el-table :data="rows" size="large" row-key="no" empty-text="所选范围没有订单">
          <el-table-column label="订单号" prop="no" width="168" align="center"><template #default="{ row }"><span class="num">{{ row.no }}</span></template></el-table-column>
          <el-table-column label="会员" width="118" align="center"><template #default="{ row }">{{ row.userName }}<div class="muted small num">{{ maskPhone(state.db.users.find((u) => u.id === row.userId)?.phone) }}</div></template></el-table-column>
          <el-table-column label="商品" min-width="190"><template #default="{ row }"><span class="clamp-2">{{ summary(row) }}</span></template></el-table-column>
          <el-table-column label="金额" width="96" align="right"><template #default="{ row }"><span class="num">{{ money(row.amount) }}</span></template></el-table-column>
          <el-table-column label="支付方式" width="100" align="center"><template #default="{ row }">{{ B.PAY[row.pay] }}</template></el-table-column>
          <el-table-column label="状态" width="92" align="center"><template #default="{ row }"><LzStatusTag kind="order" :status="row.status" /></template></el-table-column>
          <el-table-column label="下单时间" width="116" align="center"><template #default="{ row }"><span class="num">{{ row.createdAt.slice(5) }}</span></template></el-table-column>
          <el-table-column v-if="hasRemark" label="备注" width="110" align="center" prop="remark" />
          <el-table-column label="操作" width="176" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="open(row)">详情</el-button>
              <el-button v-if="row.status === 'PAID'" link type="primary" :loading="busy === row.no + '出餐'" @click="fulfil(row)">出餐</el-button>
              <el-button v-if="row.status === 'FULFILLED'" link type="primary" :loading="busy === row.no + '完成'" @click="finish(row)">完成</el-button>
              <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
                <el-button link :icon="ArrowDown" aria-label="更多操作" />
                <template #dropdown><el-dropdown-menu>
                  <el-dropdown-item command="print">打印小票</el-dropdown-item>
                  <el-dropdown-item v-if="['UNPAID', 'PAID'].includes(row.status)" command="cancel">取消订单</el-dropdown-item>
                  <el-dropdown-item v-if="refundable(row)" command="refund">发起退款</el-dropdown-item>
                </el-dropdown-menu></template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
      </LzState>
    </el-card>

    <!-- details: a centred dialog -->
    <LzDialog v-model="detail.open" :title="'订单 ' + (detail.o?.no || '')" width="640px" no-footer>
      <template v-if="detail.o">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="状态"><LzStatusTag kind="order" :status="detail.o.status" /></el-descriptions-item>
          <el-descriptions-item label="取餐号">{{ detail.o.pickup }}</el-descriptions-item>
          <el-descriptions-item label="会员">{{ detail.o.userName }}</el-descriptions-item>
          <el-descriptions-item label="支付方式">{{ B.PAY[detail.o.pay] }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ detail.o.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ detail.o.paidAt || '未支付' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.o.remark || '无' }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="detail.o.items" size="small" class="items">
          <el-table-column label="商品" prop="name" />
          <el-table-column label="规格" prop="spec" width="90" align="center" />
          <el-table-column label="数量" prop="qty" width="70" align="center" />
          <el-table-column label="小计" width="100" align="right"><template #default="{ row }"><span class="num">{{ money(row.price * row.qty) }}</span></template></el-table-column>
        </el-table>
        <p class="right num">商品 {{ money(detail.o.subtotal) }}，优惠 −{{ money(detail.o.discount) }}，实付 <strong>{{ money(detail.o.amount) }}</strong></p>
      </template>
    </LzDialog>

    <LzDialog v-model="cancel.open" title="取消订单" width="440px" danger confirm-text="确认取消" :confirm-disabled="!cancel.reason" :on-confirm="doCancel">
      <p>订单 <span class="num">{{ cancel.o?.no }}</span> 取消后不能恢复；已支付的订单会原路退款。</p>
      <el-form label-position="top"><el-form-item label="取消原因（必填）"><el-select v-model="cancel.reason" placeholder="请选择"><el-option v-for="r in cancelReasons" :key="r" :value="r" :label="r" /></el-select></el-form-item></el-form>
    </LzDialog>

    <LzDialog v-model="refund.open" title="发起退款" width="440px" confirm-text="提交退款" :confirm-disabled="!refund.reason" :on-confirm="doRefund">
      <el-form label-position="top">
        <el-form-item :label="'退款金额（元，最多 ' + ((refund.o?.amount || 0) / 100).toFixed(2) + '）'"><el-input-number v-model="refund.amount" :min="0.01" :max="(refund.o?.amount || 1) / 100" :precision="2" :step="1" /></el-form-item>
        <el-form-item label="退款原因（必填）"><el-input v-model="refund.reason" type="textarea" :rows="3" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
    </LzDialog>

    <LzDialog v-model="exp.open" title="导出订单" width="440px" confirm-text="开始导出" :on-confirm="doExport">
      <p>导出范围：当前筛选结果，共 <strong class="num">{{ filtered.length }}</strong> 条；表头是中文，状态与支付方式已翻译，不含内部编号和空列。</p>
    </LzDialog>
  </div>
</template>

<style scoped>
.tab-count { margin-left: 6px; font-size: 14px; font-weight: 400; color: var(--luz-ink-2); }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.filters { margin-bottom: 12px; }
.items { margin: 12px 0; }
</style>
