import { createRouter, createWebHashHistory } from 'vue-router'
import { PAGES } from './registry.js'
import { trackDirection } from './nav.js'

// Every page is a route; anything else goes to the home page (or the first page while the others are still being written).
const home = (PAGES.find((p) => p.id === 'home') || PAGES[0]).id
const routes = [
  ...PAGES.map((p) => ({ path: '/' + p.id, name: p.id, component: p.component, meta: { id: p.id } })),
  { path: '/:pathMatch(.*)*', redirect: '/' + home },
]

const router = createRouter({ history: createWebHashHistory(), routes })
trackDirection(router)
export default router
