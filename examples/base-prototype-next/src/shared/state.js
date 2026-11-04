// The one demo state of a prototype: who is signed in, the network condition, the scenes picked in the demo panel and the demo data.
import { reactive, computed } from 'vue'
import { B } from './data.js'

export const state = reactive({
  role: 'A',              // admin: 'A' 超级管理员, 'F' 前台; mini-program: 'member' or 'guest'
  signedIn: false,
  net: 'online',          // online | slow | offline | flaky (the demo panel's 全局 tab)
  shopStatus: 'open',     // open | rest (休息中) | closed (已打烊) | paused (暂停营业): the one shop state both prototypes read
  reducedMotion: false,
  scheme: 'system',       // light and dark: system (follow it), light or dark; state.dark is what is shown (shared/scheme.js)
  dark: false,
  fontLevel: 'std',       // mini-program: the user's WeChat font size (小 … 关怀模式), see mini/font-levels.js
  hidden: {},             // module id -> true: hidden from the demo panel's 模块显示
  scenes: {},             // page id -> scene id picked in the demo panel
  version: { front: '2.0.0', back: '2.0.0' },
  db: B.reset(),
})

/** Back to the demo data of a fresh start (the demo panel's 重置演示数据). */
export function resetDemo() {
  for (const k of Object.keys(state.db)) delete state.db[k]   // pages add their own extras to the data (seeds, flags): those go as well
  Object.assign(state.db, B.reset())
  state.scenes = {}
  state.hidden = {}
  state.net = 'online'
  state.shopStatus = 'open'
  state.fontLevel = 'std'
  state.scheme = 'system'
}

/** The scene picked for a page, or null: `const scene = useScene('orders')`, then `scene.value === 'empty'`. */
export const useScene = (pageId) => computed(() => state.scenes[pageId] || null)
export const setScene = (pageId, sceneId) => { if (sceneId) state.scenes[pageId] = sceneId; else delete state.scenes[pageId] }
export const clearScenes = () => { state.scenes = {} }
