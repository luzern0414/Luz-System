// Export Design's application palette to Element Plus, Vant and the charts.
// Usage: node theme/make-theme.mjs [theme-id]. LUZ_THEMES can select a reference palette input.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const design = resolve(root, '../../../Luz-Design/scripts/export_tokens.py')
const id = process.argv[2] || process.env.LUZ_THEME || 'enterprise-navy'
const options = ['-X', 'utf8', design, '--application-themes']
if (process.env.LUZ_THEMES) options.push('--themes', process.env.LUZ_THEMES)
const python = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3')
const data = JSON.parse(execFileSync(python, options, { encoding: 'utf8' }))
const theme = data.themes[id]
if (!theme) throw new Error(`unknown theme ${id}; choose one of ${Object.keys(data.themes).join(', ')}`)
const shared = data.shared

// ---- colour helpers
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const hex = (a) => '#' + a.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase()
const mix = (a, b, w) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * w)) }
const lum = (c) => { const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return Math.max(x, y) / Math.min(x, y) }
const light = { ...shared, ...theme, onAction: theme.onAction || '#FFFFFF', scrim: shared.elevation.scrim,
  levels: [shared.elevation.level1, shared.elevation.level2, shared.elevation.level3, shared.elevation.level4] }
const font = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif'

/** The variables of one scheme: the project's own tokens, Element Plus's, Vant's; and the rules that need a selector of their own. */
function build(p) {
  const lines = [], ep = [], vt = []
  const v = (k, val) => lines.push(`  ${k}: ${val};`)
  const epv = (k, val) => ep.push(`  ${k}: ${val};`)
  const vv = (k, val) => vt.push(`  ${k}: ${val};`)
  const lighter = (c, n) => mix(c, p.canvas, n / 10)        // the library's light-3 … light-9 steps: toward the page ground
  const stronger = (c, n) => mix(c, '#000000', n / 10)       // its dark-2 step: toward the foreground
  const border = mix(p.ink, p.canvas, 0.78)   // control borders keep 3:1 against the ground (WCAG 1.4.11)

  // tokens used by the project's own styles (never by hand-written controls)
  v('--luz-action', p.action); v('--luz-action-text', p.actionText || p.action); v('--luz-action-press', p.actionPress); v('--luz-action-tint', p.actionTint); v('--luz-on-action', p.onAction)
  v('--luz-canvas', p.canvas); v('--luz-nav-bg', p.navBg); v('--luz-accent', p.accent); v('--luz-accent-tint', p.accentTint)
  v('--luz-surface', p.surface); v('--luz-ink', p.ink); v('--luz-ink-2', p.ink2); v('--luz-ink-3', p.ink3); v('--luz-line', p.line)
  v('--luz-success-fill', p.successFill || p.success); v('--luz-warning-fill', p.warningFill || p.warning); v('--luz-danger-fill', p.dangerFill || p.danger)   // fills that carry white text
  v('--luz-success', p.success); v('--luz-success-tint', p.successTint); v('--luz-warning', p.warning); v('--luz-warning-tint', p.warningTint)
  v('--luz-danger', p.danger); v('--luz-danger-tint', p.dangerTint); v('--luz-info', p.info); v('--luz-info-tint', p.infoTint)
  v('--luz-price', p.price); v('--luz-price-tint', p.priceTint)
  v('--luz-radius-control', `${p.radiusButton || 8}px`); v('--luz-radius-card', `${p.radiusCard || 12}px`)
  p.levels.forEach((l, i) => v(`--luz-level-${i + 1}`, l)); v('--luz-scrim', p.scrim)
  v('--luz-border', border); v('--luz-font', font)

  // text on a tinted background must reach 4.5:1
  const readable = (c, bg, min = 4.6) => { let o = c; for (let i = 0; i < 14 && ratio(o, bg) < min; i++) o = mix(o, '#000000', 0.08); return o }

  // Element Plus (admin)
  const type = (name, c) => { epv(`--el-color-${name}`, c); for (const n of [3, 5, 7, 8, 9]) epv(`--el-color-${name}-light-${n}`, lighter(c, n)); epv(`--el-color-${name}-dark-2`, stronger(c, 2)) }
  type('primary', p.action); type('success', p.successFill || p.success); type('warning', p.warningFill || p.warning); type('danger', p.dangerFill || p.danger); type('error', p.dangerFill || p.danger); type('info', p.ink2)
  epv('--el-text-color-primary', p.ink); epv('--el-text-color-regular', p.ink); epv('--el-text-color-secondary', p.ink2)
  epv('--el-text-color-placeholder', p.ink3); epv('--el-text-color-disabled', mix(p.ink, p.canvas, 0.4))
  epv('--el-border-color', border); epv('--el-border-color-light', p.line); epv('--el-border-color-lighter', mix(p.line, p.canvas, 0.5))
  epv('--el-border-color-extra-light', mix(p.line, p.canvas, 0.7)); epv('--el-border-color-hover', mix(border, p.action, 0.5))
  epv('--el-fill-color', mix(p.line, p.canvas, 0.4)); epv('--el-fill-color-light', p.actionTint)
  epv('--el-fill-color-lighter', p.canvas); epv('--el-fill-color-blank', p.surface)
  epv('--el-bg-color', p.surface); epv('--el-bg-color-page', p.canvas); epv('--el-bg-color-overlay', p.surface)
  epv('--el-mask-color', p.scrim); epv('--el-mask-color-extra-light', 'rgba(255, 255, 255, .6)')
  epv('--el-border-radius-base', `${p.radiusButton || 8}px`); epv('--el-border-radius-small', '6px'); epv('--el-border-radius-round', '20px')
  // a text box shows focus by its 1 px border turning neutral dark: no blue frame, no glow (Luz-Design 视觉设计规范 聚焦框)
  epv('--el-input-focus-border-color', p.ink2); epv('--el-input-focus-border', p.ink2); epv('--el-select-input-focus-border-color', p.ink2)
  epv('--el-font-weight-primary', '600')   // the standard has 400 / 600 / 700 only; the library's 500 shows as regular in Microsoft YaHei
  epv('--el-font-family', font); epv('--el-font-size-base', '14px'); epv('--el-font-size-small', '14px'); epv('--el-font-size-extra-small', '12px')
  epv('--el-font-size-medium', '16px'); epv('--el-font-size-large', '18px')
  epv('--el-box-shadow', p.levels[2]); epv('--el-box-shadow-light', p.levels[1]); epv('--el-box-shadow-lighter', p.levels[0]); epv('--el-box-shadow-dark', p.levels[3])
  epv('--el-menu-active-color', p.action); epv('--el-menu-bg-color', p.navBg); epv('--el-menu-hover-bg-color', mix(p.navBg, p.action, 0.1)); epv('--el-menu-text-color', p.ink)
  epv('--el-table-header-bg-color', p.actionTint); epv('--el-table-header-text-color', p.ink)
  epv('--el-table-row-hover-bg-color', mix(p.canvas, p.action, 0.05))
  epv('--el-table-border-color', p.line); epv('--el-card-border-radius', `${p.radiusCard || 12}px`)

  // Vant (mini-program prototype; the same design as Vant Weapp)
  vv('--van-primary-color', p.action); vv('--van-success-color', p.successFill || p.success); vv('--van-warning-color', p.warningFill || p.warning); vv('--van-danger-color', p.dangerFill || p.danger)
  vv('--van-text-color', p.ink); vv('--van-text-color-2', p.ink2); vv('--van-text-color-3', p.ink3)
  vv('--van-background', p.canvas); vv('--van-background-2', p.surface); vv('--van-border-color', p.line)
  vv('--van-active-color', mix(p.surface, p.action, 0.08))
  const greys = [p.surface, p.canvas, p.line, mix(p.line, p.ink, 0.3), p.ink3, p.ink3, p.ink2, p.ink]
  greys.forEach((c, i) => vv(`--van-gray-${i + 1}`, c))
  vv('--van-radius-md', `${p.radiusButton || 8}px`); vv('--van-radius-lg', `${p.radiusCard || 12}px`); vv('--van-radius-max', '999px')
  vv('--van-font-bold', '600'); vv('--van-font-size-md', '14px'); vv('--van-font-size-sm', '12px'); vv('--van-font-size-lg', '16px')
  vv('--van-padding-md', '16px'); vv('--van-padding-sm', '12px')
  vv('--van-button-primary-background', p.action); vv('--van-button-primary-border-color', p.action); vv('--van-button-primary-color', p.onAction)
  vv('--van-tabbar-item-active-color', p.action); vv('--van-nav-bar-title-text-color', p.ink); vv('--van-cell-group-inset-radius', `${p.radiusCard || 12}px`)
  vv('--van-tag-primary-color', p.action); vv('--van-price-color', p.price); vv('--van-submit-bar-price-color', p.price)
  vv('--van-submit-bar-button-danger-background', p.dangerFill || p.danger)   // a flat fill, not Vant's red gradient
  vv('--van-tag-success-color', p.success); vv('--van-tag-warning-color', p.warning); vv('--van-tag-danger-color', p.danger); vv('--van-tag-default-color', p.ink3); vv('--van-tag-text-color', p.canvas)
  vv('--van-font-size-xs', '12px')
  vv('--van-step-active-color', p.action)
  // 12 px is for annotations (a cell's description, tags, prices' currency): buttons, grid labels and a card's title are text and stay at 14
  vv('--van-button-mini-font-size', '14px'); vv('--van-button-small-font-size', '14px'); vv('--van-grid-item-text-font-size', '14px')
  vv('--van-action-bar-icon-font-size', '14px'); vv('--van-action-bar-icon-width', '64px'); vv('--van-tabbar-item-font-size', '14px')
  vv('--van-card-font-size', '14px'); vv('--van-card-title-line-height', '20px')
  // one font family: Vant's price, badge and card fonts name their own stacks (avenir-heavy, -apple-system-font)
  for (const k of ['base-font', 'price-font', 'badge-font', 'card-price-font', 'submit-bar-price-font']) vv(`--van-${k}`, 'var(--luz-font)')

  // component-scoped variables (the library's documented way to customise one component): tag text readable on its own tint
  const sel = 'html '
  const tags = [['primary', p.action], ['success', p.success], ['warning', p.warning], ['danger', p.danger], ['info', p.ink2]]
    .map(([name, c]) => `${sel}.el-tag.el-tag--${name} { --el-tag-text-color: ${readable(c, lighter(c, 9))}; }`)
  const rules = [
    `${sel}.el-input, ${sel}.el-textarea, ${sel}.el-select, ${sel}.el-date-editor, ${sel}.el-range-editor { --el-input-focus-border-color: ${p.ink2}; --el-input-focus-border: ${p.ink2}; --el-select-input-focus-border-color: ${p.ink2}; }`,
    `${sel}.el-select__wrapper.is-focused, ${sel}.el-range-editor.is-active, ${sel}.el-range-editor.is-active:hover { box-shadow: 0 0 0 1px ${p.ink2} inset; }`,   // these draw their focus frame with the brand colour directly
    `${sel}.el-button { --el-button-outline-color: ${p.ink2}; }`,
  ]
  return { lines, ep, vt, tags, rules }
}

const L = build(light)
const common = ['html .van-card__desc { font-size: var(--van-font-size-sm); }', 'html .el-statistic { --el-statistic-title-font-size: var(--el-font-size-base); }']

// chart palette: the brand step first, then the theme's accent and the shared hues; neutrals for "other"
const palette = (p) => [p.action, p.accent, p.info, p.sage || shared.sage, p.success, mix(p.ink3, p.canvas, 0.4)]
const tokens = (p) => ({ action: p.action, press: p.actionPress, tint: p.actionTint, canvas: p.canvas, accent: p.accent, ink: p.ink, ink2: p.ink2, line: p.line, price: p.price, surface: p.surface })

const css = `/* generated from Luz-Design application tokens: ${id} */
html:root, html.dark:root, html.dark .van-theme-dark {
${L.lines.join('\n')}
${L.ep.join('\n')}
${L.vt.join('\n')}
  color-scheme: light;
}
${L.tags.join('\n')}
${common.join('\n')}
${L.rules.join('\n')}
`
writeFileSync(resolve(root, 'src/shared/theme.generated.css'), css)
writeFileSync(resolve(root, 'src/shared/theme.generated.js'),
  `// generated by theme/make-theme.mjs (theme: ${id}); do not edit\nexport const THEME_ID = ${JSON.stringify(id)}\nexport const THEME_LABEL = ${JSON.stringify(theme.label)}\n` +
  `export const PALETTE = ${JSON.stringify(palette(light))}\nexport const TOKENS = ${JSON.stringify(tokens(light))}\n` +
  `export const PALETTE_DARK = PALETTE\nexport const TOKENS_DARK = TOKENS\n`)
console.log(`theme ${id} (${theme.label}), application tokens -> src/shared/theme.generated.css`)
