<script>
// 账号与角色（主区加右侧窄栏）：账号列表与角色列表两个工作区；右侧窄栏是风险提示、选中角色的权限摘要、角色人数分布。
// 口令只在创建与重置那一次显示；二次验证开启要输 6 位验证码（演示用 123456），关闭要再输当前账号口令（演示用 Admin@2026）。
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { K, maskPhone } from '../../shared/format.js'

export const meta = {
  id: 'accounts', label: '账号与角色', icon: 'shield', group: '系统', order: 3, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '管理员在这里反复做的是查账号、改角色、调权限，主区放账号与角色两张列表；而“哪个超级管理员没开二次验证、有几个账号被锁定、各角色多少人”是随时要瞄一眼的风险，放进停留在右侧的窄栏，不抢列表的位置',
  scenes: [
    { id: 'locked-account', label: '多个账号连续输错被锁定' },
    { id: 'no-mfa-super', label: '超级管理员没开二次验证（风险提示）' },
  ],
}

const SUPER = '超级管理员'
const DEMO_PASSWORD = 'Admin@2026'
const DEMO_CODE = '123456'
const MFA_SECRET = 'JBSW Y3DP EHPK 3PXP'
const HIGH_RISK = ['refund:approve', 'order:export', 'wallet:adjust', 'system:account']
const STALE_DAYS = 90
const dayKey = (back) => K.ymd(K.addDays(K.today(), -back))
const stamp = () => B.fmt(B.NOW())
const todayKey = () => stamp().slice(0, 10)
const allCodes = () => [].concat(...B.PERMS().map((g) => g.children.map((c) => c.code)))
const permNames = () => { const m = {}; B.PERMS().forEach((g) => g.children.forEach((c) => { m[c.code] = g.name + ' · ' + c.name })); return m }
const syncRoles = (db) => db.roles.forEach((r) => { r.users = db.accounts.filter((a) => a.role === r.name).length })

/** 演示数据：把账号补到 12 个（和各角色的账号数对得上），补上角色说明；已补过的不再动（重置演示数据后重新补） */
function seedAccounts(db) {
  if (db.accounts[0]?.locked !== undefined) return
  const day = (n, t) => dayKey(n) + ' ' + t
  const more = [
    ['manager2', '吴秀英', '13500001002', '店长', true, 1, '17:50'], ['manager3', '郑浩', '13500001003', '店长', false, 6, '10:05'], ['front3', '孙佳怡', '13500001012', '前台', false, 0, '09:15'],
    ['front4', '何磊', '13500001013', '前台', false, 2, '18:20'], ['front5', '罗静', '13500001014', '前台', false, 12, '12:40'], ['front6', '冯超', '13500001015', '前台', false, 95, '09:00'], ['finance2', '蒋文', '13800004005', '财务', true, 3, '15:30'],
  ]
  db.accounts.forEach((a) => { a.locked = false; a.mustChange = false })
  more.forEach(([user, name, phone, role, mfa, back, t], i) => db.accounts.push({ id: 6 + i, user, name, phone, role, mfa, status: 'ENABLED', lastLogin: day(back, t), locked: user === 'front4', mustChange: false }))
  db.accounts.find((a) => a.user === 'front4').lockedAt = todayKey() + ' 10:12'
  const desc = { 超级管理员: '拥有全部权限；内置角色，不能修改也不能删除', 店长: '管理门店日常运营，不含账号与系统配置', 前台: '接待顾客、履约、发卡和扣次', 财务: '对账、审批退款、导出报表' }
  db.roles.forEach((r) => { r.desc = desc[r.name] || ''; r.updated = r.builtin ? '内置' : dayKey(8 + r.id) + ' 10:00' })
  syncRoles(db)
}

function randomPassword(len = 20) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'], all = sets.join(''), buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  const out = Array.from(buf, (v) => all[v % all.length])
  sets.forEach((s, i) => { out[i] = s[buf[i] % s.length] })
  for (let i = out.length - 1; i > 0; i--) { const j = buf[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]] }
  return out.join('')
}
function recoveryCodes(seed) {
  return Array.from({ length: 10 }, (_, i) => { const r = B.rng(seed * 97 + i + 3), s = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(r() * 31)]).join(''); return s() + '-' + s() })
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ArrowDown, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { usePager } from '../use-pager.js'

const scene = useScene('accounts')
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
seedAccounts(state.db)

const meName = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const meUser = 'admin'
function audit(code, action, target, o = {}) {
  const db = state.db
  db.audit.unshift({ id: Math.max(0, ...db.audit.map((x) => x.id || 0)) + 1, at: stamp(), actor: meName.value, code, action, target, result: o.result || '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16), ...(o.diff ? { diff: o.diff } : {}), ...(o.reason ? { reason: o.reason } : {}) })
}
/** 要等服务器的一步：失败时写明原因与影响，对话框留着，已输入的内容保留 */
async function net(ms) {
  try { await request(ms) } catch (e) { throw new Error(e.message + '，操作没有完成，数据没有改动，请重试') }
}
const failMsg = (e) => e?.message || '操作失败，请重试'
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); ElMessage.success('已复制到剪贴板') } catch { ElMessage.error('复制没有成功，请手动选中复制') }
}

// ---- 数据与规则
const accounts = computed(() => state.db.accounts)
const roles = computed(() => state.db.roles)
const TOTAL_PERMS = allCodes().length
const roleOf = (name) => roles.value.find((r) => r.name === name)
const isSelf = (a) => a.user === meUser
const supers = computed(() => accounts.value.filter((a) => a.role === SUPER && a.status === 'ENABLED'))
const lastSuper = (a) => a.role === SUPER && a.status === 'ENABLED' && supers.value.length <= 1
const whyNoDisable = (a) => (isSelf(a) ? (lastSuper(a) ? '不能停用自己，也是最后一名在职的超级管理员' : '不能停用自己') : lastSuper(a) ? '至少保留一名在职的超级管理员' : '')
const staleOf = (a) => a.status === 'ENABLED' && a.lastLogin && a.lastLogin.slice(0, 10) < dayKey(STALE_DAYS)
const statusKey = (a) => (a.locked ? 'LOCKED' : a.status)
const STATUS = { ENABLED: ['success', '正常'], DISABLED: ['info', '已停用'], LOCKED: ['danger', '已锁定'] }

const tab = ref('accounts')
const selRole = ref(state.db.roles[0].id)
const touch = ref(0)                                           // 数据被改动后让依赖 syncRoles 的计算重算

// ---- 账号列表：默认看正常的，要处理的（锁定、长期未登录）排在前面
const STATUS_TABS = [['LOCKED', '已锁定'], ['STALE', '长期未登录'], ['ENABLED', '正常'], ['DISABLED', '已停用'], ['ALL', '全部']]
const f = reactive({ status: 'ENABLED', role: '', mfa: '', q: '' })
const base = computed(() => accounts.value.filter((a) => (!f.role || a.role === f.role) && (!f.mfa || (f.mfa === 'on') === a.mfa) && (!f.q.trim() || (a.user + a.name).includes(f.q.trim()))))
const inStatus = (a, s) => (s === 'ALL' ? true : s === 'ENABLED' ? a.status === 'ENABLED' && !a.locked : s === 'DISABLED' ? a.status === 'DISABLED' : s === 'LOCKED' ? a.locked : !!staleOf(a))
const count = (s) => base.value.filter((a) => inStatus(a, s)).length
const filtered = computed(() => base.value.filter((a) => inStatus(a, f.status)))
const dirty = computed(() => f.status !== 'ENABLED' || f.role || f.mfa || f.q)
const resetFilter = () => Object.assign(f, { status: 'ENABLED', role: '', mfa: '', q: '' })
const pager = usePager('accounts')
const rows = pager.slice(filtered)
watch(() => ({ ...f }), () => pager.reset())
// ---- 场景
watch(scene, (s) => {
  const db = state.db
  if (s === 'locked-account') {
    ['front5', 'manager3'].forEach((u) => { const a = db.accounts.find((x) => x.user === u); if (a && !a.locked) { a.locked = true; a.lockedAt = todayKey() + ' 09:4' + u.length } })
    f.status = 'LOCKED'; tab.value = 'accounts'
  }
  if (s === 'no-mfa-super') { const a = db.accounts.find((x) => x.role === SUPER && x.status === 'ENABLED'); if (a) a.mfa = false }
}, { immediate: true })

const accStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const showStatus = (s) => { f.role = ''; f.mfa = ''; f.q = ''; f.status = s; tab.value = 'accounts' }

// ---- 角色列表
const roleQ = ref('')
const roleRows = computed(() => { touch.value; return roles.value.filter((r) => !roleQ.value.trim() || ((r.name || '') + (r.desc || '')).includes(roleQ.value.trim())) })
const roleStatus = computed(() => (phase.value !== 'ok' ? phase.value : roleRows.value.length ? 'ok' : 'empty'))

// ---- 右侧窄栏
const risks = computed(() => {
  touch.value
  const out = []
  accounts.value.filter((a) => a.role === SUPER && a.status === 'ENABLED' && !a.mfa).forEach((a) => out.push({ tone: 'error', text: `超级管理员「${a.name}」没有开启二次验证，口令一旦泄露就能改所有设置`, act: '去开启', run: () => openMfa(a, 'on') }))
  const lockedN = accounts.value.filter((a) => a.locked).length
  if (lockedN) out.push({ tone: 'warning', text: `${lockedN} 个账号因连续输错口令被锁定`, act: '去解锁', run: () => showStatus('LOCKED') })
  const noMfa = accounts.value.filter((a) => a.status === 'ENABLED' && !a.mfa && a.role !== SUPER && (roleOf(a.role)?.perms || []).some((c) => HIGH_RISK.includes(c)))
  if (noMfa.length) out.push({ tone: 'warning', text: `${noMfa.length} 个能审批退款或导出的账号没有开启二次验证（${noMfa.map((a) => a.name).join('、')}）`, act: '去查看', run: () => { showStatus('ALL'); f.mfa = 'off' } })
  const staleN = accounts.value.filter(staleOf).length
  if (staleN) out.push({ tone: 'warning', text: `${staleN} 个在职账号超过 ${STALE_DAYS} 天没登录，建议确认是否还需要`, act: '去查看', run: () => showStatus('STALE') })
  return out
})
const curRole = computed(() => roles.value.find((r) => r.id === selRole.value) || roles.value[0])
const permGroups = computed(() => B.PERMS().map((g) => ({ name: g.name, n: g.children.filter((c) => curRole.value.perms.includes(c.code)).length, total: g.children.length })))
const dist = computed(() => { touch.value; return roles.value.map((r) => ({ name: r.name, value: r.users })) })
const pickRole = (r) => { selRole.value = r.id }

const done = (msg) => { syncRoles(state.db); touch.value++; ElMessage.success(msg) }

// ---- 对话框：一个通用的确认框（原因必填或不必填），其余按用途各一个
const act = reactive({ open: false, title: '', lead: '', needReason: false, reason: '', danger: false, confirmText: '确定', run: null })
const askAct = (o) => Object.assign(act, { open: true, title: '', lead: '', needReason: false, reason: '', danger: false, confirmText: '确定', run: null, ...o })
const runAct = () => act.run(act.reason.trim())

// 口令、手机号明文、恢复码：只在这里显示，关闭后不再显示
const sec = reactive({ open: false, title: '', lead: '', items: [], warn: '' })
const showSecret = (o) => Object.assign(sec, { open: true, ...o })

async function revealPhone(a) {
  askAct({
    title: '查看完整手机号', needReason: true, confirmText: '查看', lead: `查看 ${a.name} 的完整手机号。本次查看会被记录，原因必填。`,
    run: async (why) => {
      await net(300)
      audit('sensitive:phone', '查看手机号明文', '账号 ' + a.user, { reason: why, diff: [['查看内容', '—', '手机号']] })
      showSecret({ title: a.name + ' 的手机号', lead: '', items: [a.phone], warn: `关闭后不再显示，本次查看已记录（原因：${why}）。` })
    },
  })
}
function resetPwd(a) {
  if (isSelf(a)) return ElMessage.warning('不能对自己操作')
  askAct({
    title: '重置密码', needReason: true, danger: true, confirmText: '确认重置', lead: `将重置「${a.name}」（${a.user}）的登录口令：旧口令立即失效，这个账号的所有登录会被强制下线，需要你把新口令告诉本人。`,
    run: async (why) => {
      await net(500)
      const pwd = randomPassword(20); a.mustChange = true; a.locked = false
      audit('system:account', '重置密码', '账号 ' + a.user, { reason: why, diff: [['口令', '已设置', '已重置（72 小时内必须改密）']] })
      done('已重置 ' + a.user + ' 的口令')
      showSecret({ title: '新口令', lead: `「${a.name}」（${a.user}）的新口令如下：`, items: [pwd], warn: '口令只显示这一次，关闭后无法再查看，请当面或用安全的方式告诉本人。72 小时内首次登录必须修改口令。' })
    },
  })
}
function forceOut(a) {
  if (isSelf(a)) return ElMessage.warning('不能对自己操作')
  askAct({
    title: '强制下线', needReason: true, confirmText: '确认下线', lead: `将让「${a.name}」（${a.user}）的所有登录立即失效，他正在做的操作会中断，需要重新登录。`,
    run: async (why) => { await net(400); audit('system:account', '强制下线', '账号 ' + a.user, { reason: why, diff: [['登录状态', '在线', '已下线']] }); done('已让 ' + a.user + ' 下线') },
  })
}
function disable(a) {
  const no = whyNoDisable(a)
  if (no) return ElMessage.warning(no)
  askAct({
    title: '停用账号', needReason: true, danger: true, confirmText: '确认停用', lead: `停用「${a.name}」（${a.user}）后，他将不能登录，已登录的会话立即失效，账号和操作记录保留，可以随时启用。`,
    run: async (why) => {
      await net(500)
      const no2 = whyNoDisable(a); if (no2) throw new Error(no2)
      a.status = 'DISABLED'; audit('system:account', '停用账号', '账号 ' + a.user, { reason: why, diff: [['状态', '正常', '已停用']] }); done('已停用 ' + a.user)
    },
  })
}
const enable = (a) => askAct({ title: '启用账号', confirmText: '确认启用', lead: `启用「${a.name}」（${a.user}）后，他可以重新登录。`, run: async () => { await net(400); a.status = 'ENABLED'; audit('system:account', '启用账号', '账号 ' + a.user, { diff: [['状态', '已停用', '正常']] }); done('已启用 ' + a.user) } })
const unlock = (a) => askAct({ title: '解锁账号', confirmText: '确认解锁', lead: `「${a.name}」（${a.user}）因连续输错口令被锁定。解锁后他可以立即重新登录，输错次数清零。`, run: async () => { await net(400); a.locked = false; audit('system:account', '解锁账号', '账号 ' + a.user, { diff: [['状态', '已锁定', '正常']] }); done('已解锁 ' + a.user) } })

// 新建与编辑账号
const acc = reactive({ open: false, a: null, user: '', name: '', phone: '', role: '前台' })
const accForm = ref(null)
const roleLocked = computed(() => !!acc.a && (isSelf(acc.a) || lastSuper(acc.a)))
const roleHint = computed(() => (!acc.a ? '决定这个账号能看到和操作哪些功能' : isSelf(acc.a) ? (lastSuper(acc.a) ? '不能修改自己的角色；这也是最后一名在职的超级管理员，不能降权' : '不能修改自己的角色') : lastSuper(acc.a) ? '这是最后一名在职的超级管理员，不能降权' : '决定这个账号能看到和操作哪些功能'))
const accRules = {
  user: [{ validator: (_r, v, cb) => { const u = (v || '').trim(); if (acc.a) return cb(); if (!/^[A-Za-z0-9_]{4,32}$/.test(u)) return cb(new Error('账号名要 4 到 32 位，只能用字母、数字或下划线')); if (accounts.value.some((x) => x.user.toLowerCase() === u.toLowerCase())) return cb(new Error(`账号名「${u}」已经被使用（停用的账号名也不会再用），请换一个`)); cb() }, trigger: 'blur' }],
  name: [{ validator: (_r, v, cb) => { const n = (v || '').trim(); if (!n) return cb(new Error('请填写姓名')); if ([...n].length > 10) return cb(new Error('姓名不超过 10 个字')); cb() }, trigger: 'blur' }],
  phone: [{ validator: (_r, v, cb) => (/^1[3-9]\d{9}$/.test((v || '').trim()) ? cb() : cb(new Error('请填写 11 位手机号'))), trigger: 'blur' }],
}
const openAccount = (a) => { Object.assign(acc, { open: true, a: a || null, user: a?.user || '', name: a?.name || '', phone: a?.phone || '', role: a?.role || '前台' }); accForm.value?.clearValidate?.() }
async function saveAccount() {
  try { await accForm.value.validate() } catch { throw new Error('请先改正表单里标红的项') }
  const a = acc.a, name = acc.name.trim(), phone = acc.phone.trim()
  if (a && acc.role !== a.role) {
    if (isSelf(a)) throw new Error('不能修改自己的角色')
    if (lastSuper(a)) throw new Error('这是最后一名在职的超级管理员，不能降权，请先让另一位账号成为超级管理员')
  }
  await net(500)
  if (!a) {
    const pwd = randomPassword(20)
    const made = { id: Math.max(0, ...accounts.value.map((x) => x.id)) + 1, user: acc.user.trim(), name, phone, role: acc.role, mfa: false, status: 'ENABLED', lastLogin: '', locked: false, mustChange: true }
    state.db.accounts.push(made)
    audit('system:account', '新建账号', '账号 ' + made.user, { diff: [['账号', '—', made.user], ['姓名', '—', made.name], ['角色', '—', made.role]] })
    resetFilter(); tab.value = 'accounts'
    done('已创建账号 ' + made.user)
    showSecret({ title: '账号已创建', lead: `「${made.name}」（${made.user}）的初始口令如下，请现在就记下来：`, items: [pwd], warn: '口令只显示这一次，关闭后无法再查看，请当面或用安全的方式告诉本人。72 小时内首次登录必须修改口令。' })
    return
  }
  const diff = []
  if (a.name !== name) diff.push(['姓名', a.name, name])
  if (a.phone !== phone) diff.push(['手机号', maskPhone(a.phone), maskPhone(phone)])
  if (a.role !== acc.role) diff.push(['角色', a.role, acc.role])
  Object.assign(a, { name, phone, role: acc.role })
  if (diff.length) audit('system:account', '修改账号', '账号 ' + a.user, { diff })
  done(diff.length ? '已保存 ' + a.user : '没有修改任何内容')
}

// 二次验证：开启要验证码，关闭要再输当前账号口令
const mfa = reactive({ open: false, mode: 'on', a: null, code: '', pwd: '' })
const openMfa = (a, mode) => Object.assign(mfa, { open: true, mode, a, code: '', pwd: '' })
async function saveMfa() {
  const a = mfa.a
  if (mfa.mode === 'on') {
    if (!/^\d{6}$/.test(mfa.code.trim())) throw new Error('请输入 6 位数字验证码')
    if (mfa.code.trim() !== DEMO_CODE) throw new Error(`验证码不对，请看一下验证器上的最新验证码再输入（演示：${DEMO_CODE}）`)
    await net(300)
    a.mfa = true; audit('system:account', '开启二次验证', '账号 ' + a.user, { diff: [['二次验证', '未开启', '已开启']] })
    done(a.user + ' 已开启二次验证')
    showSecret({ title: '请保存恢复码', lead: '手机丢失或验证器用不了时，可以用恢复码登录，每个只能用一次。', items: recoveryCodes(a.id), warn: '恢复码只显示这一次，请离线保存。' })
  } else {
    if (!mfa.pwd) throw new Error('请输入你当前登录账号的口令')
    if (mfa.pwd !== DEMO_PASSWORD) throw new Error('口令不对，请重新输入')
    await net(300)
    a.mfa = false; audit('system:account', '关闭二次验证', '账号 ' + a.user, { diff: [['二次验证', '已开启', '未开启']] })
    done(a.user + ' 已关闭二次验证')
  }
}

// 更多操作
function onMore(cmd, a) {
  ({ phone: revealPhone, reset: resetPwd, logout: forceOut, mfa: () => openMfa(a, a.mfa ? 'off' : 'on'), toggle: () => (a.status === 'ENABLED' ? disable(a) : enable(a)) })[cmd](a)
}

// 账号详情
const ad = reactive({ open: false, a: null, tab: 'info' })
const adRole = computed(() => (ad.a ? roleOf(ad.a.role) : null))
const adLogs = computed(() => (ad.a ? state.db.audit.filter((x) => String(x.target).includes(ad.a.user) || x.actor === ad.a.name).slice(0, 8) : []))
const openDetail = (a) => Object.assign(ad, { open: true, a, tab: 'info' })

// ---- 角色：新建、复制、编辑、查看、删除
const rd = reactive({ open: false, role: null, from: null, name: '', desc: '', keys: [], base: [], q: '', key: 0 })
const roleForm = ref(null)
const tree = ref(null)
const readOnly = computed(() => !!rd.role?.builtin)
const treeData = computed(() => B.PERMS().map((g) => ({ id: g.code, label: g.name, children: g.children.map((c) => ({ id: c.code, label: c.name, pname: g.name })) })))
const PN = permNames()
const codes = allCodes()
const added = computed(() => codes.filter((c) => rd.keys.includes(c) && !rd.base.includes(c)))
const removed = computed(() => codes.filter((c) => !rd.keys.includes(c) && rd.base.includes(c)))
const rdTitle = computed(() => (readOnly.value ? '查看角色 · ' + rd.role.name : rd.role ? '编辑角色 · ' + rd.role.name : rd.from ? '复制角色 · ' + rd.from.name : '新建角色'))
const roleRules = { name: [{ validator: (_r, v, cb) => { const n = (v || '').trim(); if ([...n].length < 2) return cb(new Error('角色名称至少 2 个字')); if (roles.value.some((r) => r !== rd.role && r.name === n)) return cb(new Error(`已经有叫「${n}」的角色，换一个名字`)); cb() }, trigger: 'blur' }] }
function openRole(role, from) {
  const keys = role ? (role.builtin ? [...codes] : [...role.perms]) : from ? [...from.perms] : []
  Object.assign(rd, { open: true, role: role || null, from: from || null, name: role ? role.name : from ? from.name + '（副本）' : '', desc: role ? role.desc : from ? from.desc : '', keys, base: role ? [...role.perms] : [], q: '', key: rd.key + 1 })
  roleForm.value?.clearValidate?.()
}
const syncKeys = () => { rd.keys = tree.value ? tree.value.getCheckedKeys(true) : rd.keys }
const pickAll = () => { tree.value.setCheckedKeys([...codes]); syncKeys() }
const pickNone = () => { tree.value.setCheckedKeys([]); syncKeys() }
watch(() => rd.q, (v) => tree.value?.filter(v.trim()))
const filterNode = (v, d) => !v || (d.pname ? (d.pname + d.label).includes(v) : d.label.includes(v))
async function saveRole() {
  try { await roleForm.value.validate() } catch { throw new Error('请先改正表单里标红的项') }
  const name = rd.name.trim(), role = rd.role, db = state.db
  if (role && !added.value.length && !removed.value.length && name === role.name && rd.desc.trim() === role.desc) throw new Error('没有修改任何内容')
  await net(500)
  const diff = []
  let saved
  if (!role) {
    saved = { id: Math.max(0, ...roles.value.map((r) => r.id)) + 1, name, builtin: false, perms: codes.filter((c) => rd.keys.includes(c)), users: 0, desc: rd.desc.trim(), updated: stamp().slice(0, 16) }
    db.roles.push(saved); diff.push(['角色', '—', name], ['权限', '—', rd.keys.length + ' 项'])
  } else {
    saved = role
    if (role.name !== name) { db.accounts.forEach((a) => { if (a.role === role.name) a.role = name }); diff.push(['名称', role.name, name]); role.name = name }
    if (added.value.length) diff.push(['新增权限', '—', added.value.map((c) => PN[c]).join('、')])
    if (removed.value.length) diff.push(['去掉权限', removed.value.map((c) => PN[c]).join('、'), '—'])
    role.perms = codes.filter((c) => rd.keys.includes(c)); role.desc = rd.desc.trim(); role.updated = stamp().slice(0, 16)
  }
  audit('system:account', !role ? (rd.from ? '复制角色' : '新建角色') : '修改角色权限', '角色 ' + name, { diff })
  selRole.value = saved.id; tab.value = 'roles'
  done(!role ? `已创建角色「${name}」` : `已保存角色「${name}」`)
}
function deleteRole(r) {
  syncRoles(state.db)
  if (r.users > 0) {
    return askAct({ title: '还有账号在用这个角色', confirmText: '去看这些账号', lead: `角色「${r.name}」下还有 ${r.users} 个账号：${accounts.value.filter((a) => a.role === r.name).map((a) => a.name).join('、')}。请先把他们调到其他角色，再来删除。`, run: () => { showStatus('ALL'); f.role = r.name } })
  }
  askAct({
    title: '删除角色', danger: true, confirmText: '确认删除', lead: `删除角色「${r.name}」（${r.perms.length} 项权限，没有账号在用），删除后无法恢复，只能重新创建。`,
    run: async () => {
      await net(400)
      state.db.roles.splice(state.db.roles.indexOf(r), 1); if (selRole.value === r.id) selRole.value = state.db.roles[0].id
      audit('system:account', '删除角色', '角色 ' + r.name, { diff: [['角色', r.name, '已删除']] }); done(`已删除角色「${r.name}」`)
    },
  })
}
</script>

<template>
  <div class="lz-page">
    <LzState v-if="state.role !== 'A'" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Plus" @click="openRole(null)">新建角色</el-button>
        <el-button type="primary" :icon="Plus" @click="openAccount(null)">新建账号</el-button>
      </div>

      <el-alert v-if="scene === 'locked-account'" type="warning" show-icon :closable="false" :title="`${accounts.filter((a) => a.locked).length} 个账号因连续输错口令被锁定，可以在列表里点“解锁”。`" />

      <div class="lz-main-rail">
        <!-- 主区：账号与角色 -->
        <el-card shadow="never" class="lz-card" aria-label="账号与角色">
          <el-tabs v-model="tab">
            <el-tab-pane name="accounts"><template #label>账号<span class="tab-count num">{{ accounts.length }}</span></template></el-tab-pane>
            <el-tab-pane name="roles"><template #label>角色<span class="tab-count num">{{ roles.length }}</span></template></el-tab-pane>
          </el-tabs>

          <template v-if="tab === 'accounts'">
            <div class="lz-toolbar filters">
              <el-radio-group v-model="f.status" aria-label="账号状态">
                <el-radio-button v-for="[code, label] in STATUS_TABS" :key="code" :value="code">{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></el-radio-button>
              </el-radio-group>
            </div>
            <div class="lz-toolbar filters">
              <el-select v-model="f.role" clearable placeholder="全部角色" style="width: 136px" aria-label="角色"><el-option v-for="r in roles" :key="r.id" :value="r.name" :label="r.name" /></el-select>
              <el-select v-model="f.mfa" clearable placeholder="二次验证：全部" style="width: 156px" aria-label="二次验证"><el-option value="on" label="已开启" /><el-option value="off" label="未开启" /></el-select>
              <el-input v-model="f.q" clearable placeholder="账号或姓名" :prefix-icon="Search" style="width: 200px" aria-label="账号或姓名" />
              <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
              <span class="grow" /><span class="muted">共 {{ filtered.length }} 条</span>
            </div>
            <LzState :status="accStatus" empty-title="没有符合条件的账号" error-hint="账号列表没有加载出来，请检查网络后重试" @retry="load">
              <template #empty-action><el-button v-if="dirty" type="primary" @click="resetFilter">重置筛选</el-button></template>
              <el-table :data="rows" size="large" row-key="id" empty-text="没有符合条件的账号">
                <el-table-column label="账号" min-width="150">
                  <template #default="{ row }">
                    <div><el-button link type="primary" @click="openDetail(row)">{{ row.user }}</el-button><el-tag v-if="isSelf(row)" type="primary" effect="light" class="self-tag">本人</el-tag></div>
                    <div class="muted">{{ row.name }} · <span class="num">{{ maskPhone(row.phone) }}</span></div>
                  </template>
                </el-table-column>
                <el-table-column label="角色" width="112" align="center"><template #default="{ row }"><el-button link @click="pickRole(roleOf(row.role) || curRole)">{{ row.role }}</el-button></template></el-table-column>
                <el-table-column label="二次验证" width="100" align="center"><template #default="{ row }"><el-tag :type="row.mfa ? 'success' : 'warning'" effect="light">{{ row.mfa ? '已开启' : '未开启' }}</el-tag></template></el-table-column>
                <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag :type="STATUS[statusKey(row)][0]" :text="STATUS[statusKey(row)][1]" /></template></el-table-column>
                <el-table-column label="最近登录" width="112" align="center"><template #default="{ row }"><span class="num">{{ row.lastLogin || '从未登录' }}</span></template></el-table-column>
                <el-table-column label="操作" width="132" align="center" fixed="right">
                  <template #default="{ row }">
                    <el-button v-if="row.locked" link type="primary" @click="unlock(row)">解锁</el-button>
                    <el-button link type="primary" @click="openAccount(row)">编辑</el-button>
                    <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
                      <el-button link :icon="ArrowDown" :aria-label="'更多操作：' + row.user" />
                      <template #dropdown><el-dropdown-menu>
                        <el-dropdown-item command="phone">查看完整手机号</el-dropdown-item>
                        <el-dropdown-item command="reset">重置密码</el-dropdown-item>
                        <el-dropdown-item command="logout">强制下线</el-dropdown-item>
                        <el-dropdown-item command="mfa">{{ row.mfa ? '关闭二次验证' : '开启二次验证' }}</el-dropdown-item>
                        <el-dropdown-item command="toggle" divided>{{ row.status === 'ENABLED' ? '停用账号' : '启用账号' }}</el-dropdown-item>
                      </el-dropdown-menu></template>
                    </el-dropdown>
                  </template>
                </el-table-column>
              </el-table>
              <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
            </LzState>
          </template>

          <template v-else>
            <div class="lz-toolbar filters">
              <span class="muted grow">角色决定账号能看到和操作哪些功能；内置角色不能删除，超级管理员的权限不能改。</span>
              <el-input v-model="roleQ" clearable placeholder="角色名称或说明" :prefix-icon="Search" style="width: 220px" aria-label="角色名称或说明" />
            </div>
            <LzState :status="roleStatus" empty-title="没有符合条件的角色" error-hint="角色列表没有加载出来，请检查网络后重试" @retry="load">
              <el-table :data="roleRows" size="large" row-key="id" empty-text="没有符合条件的角色" highlight-current-row :current-row-key="selRole" @row-click="pickRole">
                <el-table-column label="名称" width="170"><template #default="{ row }">{{ row.name }}<el-tag v-if="row.builtin" type="primary" effect="light" class="self-tag">内置</el-tag></template></el-table-column>
                <el-table-column label="说明" min-width="220" show-overflow-tooltip prop="desc" />
                <el-table-column label="权限数（项）" width="120" align="right"><template #default="{ row }"><span class="num">{{ row.perms.length }} / {{ TOTAL_PERMS }}</span></template></el-table-column>
                <el-table-column label="账号数（个）" width="120" align="right"><template #default="{ row }"><span class="num">{{ row.users }}</span></template></el-table-column>
                <el-table-column label="最近修改" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.updated }}</span></template></el-table-column>
                <el-table-column label="操作" width="190" align="center" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" @click.stop="openRole(row)">{{ row.builtin ? '查看' : '编辑' }}</el-button>
                    <el-button link type="primary" @click.stop="openRole(null, row)">复制</el-button>
                    <el-button v-if="!row.builtin" link type="danger" @click.stop="deleteRole(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </LzState>
          </template>
        </el-card>

        <!-- 右侧窄栏：风险、权限摘要、人数分布 -->
        <aside class="rail" aria-label="角色与风险">
          <el-card shadow="never" class="lz-card">
            <template #header><div class="card-head"><span>风险提示</span><el-tag v-if="risks.length" :type="risks.some((r) => r.tone === 'error') ? 'danger' : 'warning'" effect="light">{{ risks.length }} 项</el-tag><el-tag v-else type="success" effect="light">没有风险</el-tag></div></template>
            <div v-if="risks.length" class="stack tight">
              <el-alert v-for="r in risks" :key="r.text" :type="r.tone" show-icon :closable="false" :title="r.text"><el-button @click="r.run">{{ r.act }}</el-button></el-alert>
            </div>
            <p v-else class="muted">超级管理员都开了二次验证，没有账号被锁定，也没有长期不用的账号。</p>
          </el-card>

          <el-card shadow="never" class="lz-card">
            <template #header><div class="card-head"><span>角色权限摘要</span><el-tag v-if="curRole.builtin" type="primary" effect="light">内置</el-tag></div></template>
            <el-select v-model="selRole" aria-label="查看哪个角色的权限"><el-option v-for="r in roles" :key="r.id" :value="r.id" :label="r.name" /></el-select>
            <p class="muted">{{ curRole.perms.length }} / {{ TOTAL_PERMS }} 项权限 · {{ curRole.users }} 个账号<template v-if="curRole.desc">。{{ curRole.desc }}</template></p>
            <div class="perm-list">
              <div v-for="g in permGroups" :key="g.name" class="perm-row">
                <span>{{ g.name }}</span>
                <el-progress :percentage="(g.n / g.total) * 100" :show-text="false" :stroke-width="8" :aria-label="`${g.name} ${g.n} 项，共 ${g.total} 项`" />
                <span class="num" :class="{ muted: !g.n }">{{ g.n }}/{{ g.total }}</span>
              </div>
            </div>
          </el-card>

          <el-card shadow="never" class="lz-card">
            <template #header><div class="card-head"><span>角色人数分布</span><span class="muted">共 {{ accounts.length }} 个账号</span></div></template>
            <LzChart kind="pie" :series="dist.filter((d) => d.value)" :height="220" label="各角色账号数" />
            <div class="dist-list"><div v-for="d in dist" :key="d.name" class="dist-row"><span>{{ d.name }}</span><span class="b num">{{ d.value }}</span></div></div>
          </el-card>
        </aside>
      </div>

      <!-- 账号详情 -->
      <LzDialog v-model="ad.open" :title="'账号详情 · ' + (ad.a?.user || '')" width="640px" no-footer>
        <el-tabs v-if="ad.a" v-model="ad.tab">
          <el-tab-pane label="概况" name="info">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="账号">{{ ad.a.user }}</el-descriptions-item>
              <el-descriptions-item label="姓名">{{ ad.a.name }}</el-descriptions-item>
              <el-descriptions-item label="手机号"><span class="num">{{ maskPhone(ad.a.phone) }}</span><el-button link type="primary" class="reveal" @click="revealPhone(ad.a)">查看完整号码</el-button></el-descriptions-item>
              <el-descriptions-item label="角色">{{ ad.a.role }}</el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag :type="STATUS[statusKey(ad.a)][0]" :text="STATUS[statusKey(ad.a)][1]" /></el-descriptions-item>
              <el-descriptions-item label="二次验证">{{ ad.a.mfa ? '已开启' : '未开启' }}</el-descriptions-item>
              <el-descriptions-item label="最近登录">{{ ad.a.lastLogin || '从未登录' }}</el-descriptions-item>
              <el-descriptions-item label="口令">{{ ad.a.mustChange ? '临时口令，首次登录必须修改' : '已由本人设置' }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane label="权限" name="perm">
            <template v-if="adRole">
              <p class="muted">来自角色「{{ adRole.name }}」，共 {{ adRole.perms.length }} 项。</p>
              <div class="chips"><el-tag v-for="c in adRole.perms" :key="c" effect="plain" type="info">{{ PN[c] }}</el-tag></div>
            </template>
            <el-empty v-else description="角色不存在" />
          </el-tab-pane>
          <el-tab-pane label="操作记录" name="log">
            <el-timeline v-if="adLogs.length">
              <el-timeline-item v-for="x in adLogs" :key="x.trace" :timestamp="x.at" placement="top">{{ x.actor }} {{ x.action }} · {{ x.target }}<el-tag :type="x.result === '成功' ? 'success' : 'danger'" effect="light" class="self-tag">{{ x.result }}</el-tag></el-timeline-item>
            </el-timeline>
            <el-empty v-else description="还没有相关的操作记录" />
          </el-tab-pane>
        </el-tabs>
      </LzDialog>

      <!-- 新建与编辑账号 -->
      <LzDialog v-model="acc.open" :title="acc.a ? '编辑 ' + acc.a.user : '新建账号'" width="460px" :confirm-text="acc.a ? '保存' : '创建账号'" :on-confirm="saveAccount">
        <el-form ref="accForm" :model="acc" :rules="accRules" label-position="top" @submit.prevent>
          <el-form-item label="账号名" prop="user"><el-input v-model="acc.user" maxlength="32" :disabled="!!acc.a" placeholder="4 到 32 位，字母、数字或下划线" autocomplete="off" /><div class="hint muted">{{ acc.a ? '账号名创建后不能修改' : '创建后不能修改，也不会再被别人使用' }}</div></el-form-item>
          <el-form-item label="姓名" prop="name"><el-input v-model="acc.name" maxlength="10" show-word-limit /></el-form-item>
          <el-form-item label="手机号" prop="phone"><el-input v-model="acc.phone" maxlength="11" placeholder="11 位手机号" inputmode="numeric" /></el-form-item>
          <el-form-item label="角色"><el-select v-model="acc.role" :disabled="roleLocked"><el-option v-for="r in roles" :key="r.id" :value="r.name" :label="r.name" /></el-select><div class="hint muted">{{ roleHint }}</div></el-form-item>
        </el-form>
        <p v-if="!acc.a" class="muted">创建后会生成一个随机初始口令，只显示一次。</p>
      </LzDialog>

      <!-- 二次验证 -->
      <LzDialog v-model="mfa.open" :title="(mfa.mode === 'on' ? '开启二次验证 · ' : '关闭二次验证 · ') + (mfa.a?.user || '')" width="440px" :danger="mfa.mode === 'off'" :confirm-text="mfa.mode === 'on' ? '验证并开启' : '确认关闭'" :on-confirm="saveMfa">
        <template v-if="mfa.mode === 'on'">
          <p>用手机上的验证器应用添加下面的密钥，再输入它显示的 6 位验证码。</p>
          <el-input :model-value="MFA_SECRET" readonly aria-label="验证器密钥"><template #append><el-button @click="copyText(MFA_SECRET)">复制</el-button></template></el-input>
          <el-form label-position="top" class="mt" @submit.prevent>
            <el-form-item label="验证器上的 6 位验证码"><el-input v-model="mfa.code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" /><div class="hint muted">演示：输入 {{ DEMO_CODE }} 即可</div></el-form-item>
          </el-form>
        </template>
        <template v-else>
          <el-alert v-if="mfa.a?.role === SUPER" type="error" show-icon :closable="false" :title="`「${mfa.a.name}」是超级管理员，关闭后口令一旦泄露就能改所有设置，不建议关闭。`" />
          <el-alert v-else type="warning" show-icon :closable="false" title="关闭后，登录只需要口令，安全性会降低。" />
          <el-form label-position="top" class="mt" @submit.prevent>
            <el-form-item label="请输入你当前登录账号的口令"><el-input v-model="mfa.pwd" type="password" show-password autocomplete="current-password" /><div class="hint muted">关闭前要再验证一次身份（演示口令：{{ DEMO_PASSWORD }}）</div></el-form-item>
          </el-form>
        </template>
      </LzDialog>

      <!-- 角色：新建、复制、编辑、查看 -->
      <LzDialog v-model="rd.open" :title="rdTitle" width="820px" :no-footer="readOnly" confirm-text="保存" :on-confirm="saveRole">
        <div class="split">
          <div class="stack tight">
            <el-alert v-if="readOnly" type="info" show-icon :closable="false" :title="`超级管理员是内置角色，拥有全部 ${TOTAL_PERMS} 项权限，不能修改也不能删除。`" />
            <el-form ref="roleForm" :model="rd" :rules="roleRules" label-position="top" @submit.prevent>
              <el-form-item label="角色名称" prop="name"><el-input v-model="rd.name" maxlength="12" show-word-limit :disabled="readOnly" placeholder="例如：仓库管理员" /></el-form-item>
              <el-form-item label="说明"><el-input v-model="rd.desc" maxlength="40" show-word-limit :disabled="readOnly" placeholder="一句话说明这个角色做什么" /></el-form-item>
            </el-form>
            <div class="row perm-head">
              <span class="b">权限</span><span class="muted num grow">已选 {{ rd.keys.length }} / {{ TOTAL_PERMS }} 项</span>
              <el-button :disabled="readOnly" @click="pickAll">全选</el-button><el-button :disabled="readOnly" @click="pickNone">清空</el-button>
            </div>
            <el-input v-model="rd.q" clearable placeholder="搜索权限，例如“退款”" :prefix-icon="Search" aria-label="搜索权限" />
            <el-tree :key="rd.key" ref="tree" :data="treeData" node-key="id" show-checkbox default-expand-all :default-checked-keys="rd.keys" :props="{ label: 'label', disabled: () => readOnly }" :filter-node-method="filterNode" empty-text="没有找到匹配的权限，换个词试试" class="perm-tree" @check="syncKeys" />
          </div>
          <div class="stack tight">
            <h4 class="sub-title">权限变更预览</h4>
            <p v-if="readOnly" class="muted">超级管理员拥有全部 {{ TOTAL_PERMS }} 项权限，不能修改。</p>
            <p v-else-if="!rd.role">{{ rd.keys.length ? `这个新角色将拥有 ${rd.keys.length} 项权限，保存后可以分配给账号。` : '还没有选任何权限，没有权限的角色保存后账号什么也看不到。' }}</p>
            <p v-else-if="!added.length && !removed.length" class="muted">权限还没有变化。</p>
            <p v-else>新增 {{ added.length }} 项，去掉 {{ removed.length }} 项<template v-if="rd.role.users">；会影响 {{ rd.role.users }} 个账号，他们下一次操作立即按新权限校验</template>。</p>
            <el-alert v-if="rd.role && removed.length && rd.role.users" type="warning" show-icon :closable="false" :title="`将去掉 ${removed.length} 项权限，影响 ${rd.role.users} 个账号`" description="点“保存”即确认收回，保存后立即生效。" />
            <div v-if="added.length" class="stack tight"><span class="b">新增 {{ added.length }} 项</span><div class="chips"><el-tag v-for="c in added" :key="c" type="success" effect="light">{{ PN[c] }}</el-tag></div></div>
            <div v-if="removed.length" class="stack tight"><span class="b">去掉 {{ removed.length }} 项</span><div class="chips"><el-tag v-for="c in removed" :key="c" type="danger" effect="light">{{ PN[c] }}</el-tag></div></div>
          </div>
        </div>
      </LzDialog>

      <!-- 口令、手机号明文、恢复码：只显示这一次 -->
      <LzDialog v-model="sec.open" :title="sec.title" width="460px" no-footer>
        <p v-if="sec.lead">{{ sec.lead }}</p>
        <div class="secret-list" :class="{ many: sec.items.length > 1 }"><el-input v-for="s in sec.items" :key="s" :model-value="s" readonly class="secret" :aria-label="sec.title" /></div>
        <el-alert v-if="sec.warn" type="warning" show-icon :closable="false" :title="sec.warn" class="mt" />
        <div class="dlg-foot"><el-button v-if="sec.items.length" @click="copyText(sec.items.join('\n'))">{{ sec.items.length > 1 ? '复制全部' : '复制' }}</el-button><el-button type="primary" @click="sec.open = false">我已保存，关闭</el-button></div>
      </LzDialog>

      <!-- 通用确认：对象、数量和后果写清楚，需要原因的必填 -->
      <LzDialog v-model="act.open" :title="act.title" width="460px" :danger="act.danger" :confirm-text="act.confirmText" :confirm-disabled="act.needReason && !act.reason.trim()" :on-confirm="runAct">
        <p>{{ act.lead }}</p>
        <el-form v-if="act.needReason" label-position="top" @submit.prevent><el-form-item label="原因（必填）"><el-input v-model="act.reason" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item></el-form>
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.b { font-weight: 600; }
.tab-count { margin-left: 6px; color: inherit; font-weight: 400; }
.tab-count.zero { opacity: .7; }
.filters { margin-bottom: 12px; }
.self-tag { margin-left: 8px; }
.rail { display: grid; gap: 16px; align-content: start; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; }
.stack.tight { gap: 8px; }
.perm-list { display: grid; gap: 8px; margin-top: 12px; }
.perm-row { display: grid; grid-template-columns: 72px minmax(0, 1fr) 40px; align-items: center; gap: 8px; }
.perm-row .num { text-align: right; }
.split { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 760px) { .split { grid-template-columns: minmax(0, 1fr); } }
.perm-head { margin-top: 4px; }
.perm-tree { max-height: 280px; overflow: auto; border: 1px solid var(--luz-line); border-radius: var(--luz-radius-control); padding: 4px; }
.dist-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 32px; margin-top: 8px; }
.dist-row { display: flex; justify-content: space-between; }
.sub-title { margin: 0; font-size: 14px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hint { margin-top: 4px; }
.mt { margin-top: 12px; }
.reveal { margin-left: 8px; }
.secret-list { display: grid; gap: 8px; margin: 12px 0; }
.secret-list.many { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dlg-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
