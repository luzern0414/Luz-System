// Paging for a list: 20 rows by default, 10/20/50/100 to pick, the page and the size live in the address (?page=2&size=50)
// and the chosen size is remembered. `slice(rows)` returns the rows of the current page.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export const PAGE_SIZES = [10, 20, 50, 100]

export function usePager(key = 'list', defaults = { size: 20 }) {
  const route = useRoute()
  const router = useRouter()
  const saved = Number((() => { try { return localStorage.getItem('luz-size-' + key) } catch { return null } })())
  const fromAddress = (name, fallback) => { const n = Number(route.query[name]); return Number.isFinite(n) && n > 0 ? n : fallback }
  const size = ref(PAGE_SIZES.includes(fromAddress('size', 0)) ? fromAddress('size', 0) : PAGE_SIZES.includes(saved) ? saved : defaults.size)
  const page = ref(fromAddress('page', 1))

  watch([page, size], () => {
    router.replace({ query: { ...route.query, page: page.value > 1 ? page.value : undefined, size: size.value !== defaults.size ? size.value : undefined } })
  })
  watch(size, (v) => { page.value = 1; try { localStorage.setItem('luz-size-' + key, String(v)) } catch { /* private mode */ } })

  const slice = (rows) => computed(() => rows.value.slice((page.value - 1) * size.value, page.value * size.value))
  const reset = () => { page.value = 1 }
  return { page, size, slice, reset }
}
