<script setup>
// The pager under every list that may run past one page: below the table, right-aligned, 共 N 条 / 条每页 / pages (folded past seven).
import { PAGE_SIZES } from '../use-pager.js'
const page = defineModel('page', { type: Number, default: 1 })
const size = defineModel('size', { type: Number, default: 20 })
defineProps({ total: { type: Number, default: 0 } })
</script>

<template>
  <div class="lz-pager">
    <el-pagination v-model:current-page="page" v-model:page-size="size" :page-sizes="PAGE_SIZES" :total="total" :pager-count="7" layout="total, sizes, prev, pager, next, jumper" background />
  </div>
</template>
