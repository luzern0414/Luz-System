// Navigation of the mini-program: pages are routes (#/id?key=value), a push slides in from the right, going back slides out.
// Pages call `const { go, back, replace, toTab } = useNav()` and never touch the router directly.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { TABS } from './registry.js'

export const direction = ref('forward')          // read by the shell for the transition
let lastPosition = 0

export function trackDirection(router) {
  router.afterEach(() => {
    const position = window.history.state?.position ?? 0
    direction.value = position >= lastPosition ? 'forward' : 'back'
    lastPosition = position
  })
}

export function useNav() {
  const router = useRouter()
  const isTab = (id) => TABS.some((t) => t.id === id)
  return {
    go: (id, query = {}) => router.push({ path: '/' + id, query }),
    replace: (id, query = {}) => router.replace({ path: '/' + id, query }),
    back: () => (window.history.length > 1 ? router.back() : router.replace('/home')),
    toTab: (id) => router.replace({ path: '/' + id }),
    isTab,
  }
}
