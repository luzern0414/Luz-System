// Light and dark scheme of the prototypes. state.scheme is the choice (system, light or dark); state.dark is what is shown now. The dark scheme is the class
// `dark` on <html>: Element Plus switches its own variables by it and the theme generator's html.dark:root block carries the project's tokens and Vant's.
// By default the scheme follows the system; ?scheme=dark or ?scheme=light fixes it for a page load (the verification scripts use it).
import { watch } from 'vue'
import { state } from './state.js'

const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function applyScheme() {
  const dark = state.scheme === 'dark' || (state.scheme === 'system' && !!query?.matches)
  state.dark = dark
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function initScheme() {
  const asked = new URLSearchParams(location.search).get('scheme')
  if (['system', 'light', 'dark'].includes(asked)) state.scheme = asked
  applyScheme()
  watch(() => state.scheme, applyScheme)
  query?.addEventListener('change', applyScheme)
}

export const SCHEMES = [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]
