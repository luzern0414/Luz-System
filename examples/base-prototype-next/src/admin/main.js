import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { state, setScene } from '../shared/state.js'
import { PAGES } from './registry.js'
import { initScheme } from '../shared/scheme.js'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '../shared/theme.generated.css'
import '../shared/base.css'
import './admin.css'

initScheme()
createApp(App).use(router).mount('#app')

// verification hook (scripts/verify.py): lists the pages and sets a scene without the demo panel
window.__LUZ__ = { state, setScene, pages: PAGES.map((p) => ({ id: p.id, label: p.label, scenes: p.scenes })) }
