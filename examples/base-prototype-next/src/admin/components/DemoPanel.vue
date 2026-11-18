<script setup>
// The demo panel (场景配置面板): grouped by menu, plus 全局. Per page: jump to it, show or hide the module, pick a scene
// (empty, loading, every failure, no permission, disabled…). 全局: role, network, reduced motion, reset. Built from Element Plus components.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Operation } from '@element-plus/icons-vue'
import { state, resetDemo, setScene, clearScenes } from '../../shared/state.js'
import { GROUPS, PAGES, ROLES, homeOf } from '../registry.js'
import { SCHEMES } from '../../shared/scheme.js'

const router = useRouter()
const open = ref(false)
const tab = ref(GROUPS[0])
const tabs = computed(() => [...GROUPS, '全局'])
const rows = (group) => PAGES.filter((p) => p.group === group)

function jump(p) { open.value = false; router.push('/' + p.id) }
function pick(p, sceneId) { setScene(p.id, sceneId || null); if (sceneId) jump(p) }
function setRole(role) { state.role = role; router.push('/' + homeOf(role)) }
function reset() { resetDemo(); globalThis.LuzDemoAccount.reset(); ElMessage.success('演示数据已重置'); router.push('/' + homeOf(state.role)) }
</script>

<template>
  <el-button class="demo-fab" type="primary" circle size="large" :icon="Operation" aria-label="打开演示控制" @click="open = true" />
  <el-dialog v-model="open" title="演示控制" width="860px" align-center class="demo-dialog" data-luz-demo-panel>
    <el-tabs v-model="tab" tab-position="left" class="demo-tabs">
      <el-tab-pane v-for="g in tabs" :key="g" :label="g" :name="g">
        <template v-if="g !== '全局'">
          <el-table :data="rows(g)" size="small" :show-header="true" class="demo-table">
            <el-table-column prop="label" label="页面" width="110" align="center" />
            <el-table-column label="场景" min-width="260">
              <template #default="{ row }">
                <el-select :model-value="state.scenes[row.id] || ''" clearable placeholder="默认（有数据）" style="width: 100%" @update:model-value="(v) => pick(row, v)">
                  <el-option v-for="s in row.scenes" :key="s.id" :label="s.label" :value="s.id" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="显示" width="80" align="center"><template #default="{ row }"><el-switch :model-value="!state.hidden[row.id]" aria-label="在菜单里显示" @update:model-value="(v) => (state.hidden[row.id] = !v)" /></template></el-table-column>
            <el-table-column label="操作" width="90" align="center"><template #default="{ row }"><el-button link type="primary" @click="jump(row)">直达</el-button></template></el-table-column>
          </el-table>
        </template>
        <el-form v-else label-width="96px" class="demo-global">
          <el-form-item label="角色"><el-radio-group :model-value="state.role" @update:model-value="setRole"><el-radio-button v-for="r in ROLES" :key="r.id" :value="r.id">{{ r.label }}</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="网络"><el-radio-group v-model="state.net"><el-radio-button value="online">正常</el-radio-button><el-radio-button value="slow">慢网</el-radio-button><el-radio-button value="flaky">不稳定</el-radio-button><el-radio-button value="offline">断网</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="外观"><el-radio-group v-model="state.scheme"><el-radio-button v-for="[k, label] in SCHEMES" :key="k" :value="k">{{ label }}</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="减少动态效果"><el-switch v-model="state.reducedMotion" /></el-form-item>
          <el-form-item label="场景"><el-button @click="clearScenes">清除所有场景</el-button></el-form-item>
          <el-form-item label="演示数据"><el-popconfirm title="重置后订单、会员等演示数据回到初始状态，确定吗？" width="260" @confirm="reset"><template #reference><el-button type="danger" plain>重置演示数据</el-button></template></el-popconfirm></el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.demo-fab { position: fixed; right: 20px; bottom: 20px; z-index: 2000; box-shadow: var(--luz-level-3); }
.demo-tabs { min-height: 360px; }
.demo-global { max-width: 560px; }
</style>
