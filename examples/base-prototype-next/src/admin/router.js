import { createRouter, createWebHashHistory } from 'vue-router'
import { PAGES } from './registry.js'

// Every page is a route; anything else goes to the home page (the dashboard, or the first page while the others are still being written).
const home = (PAGES.find((p) => p.id === 'dashboard') || PAGES[0]).id
const routes = [
  ...PAGES.map((p) => ({ path: '/' + p.id, name: p.id, component: p.component, meta: { id: p.id } })),
  { path: '/:pathMatch(.*)*', redirect: '/' + home },
]

// A role without the page gets the page's own 403 state in the shell, not a redirect.
export default createRouter({ history: createWebHashHistory(), routes })
