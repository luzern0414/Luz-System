// Turns one theme of Luz-Design's themes.json into the theme variables of the two component libraries (Element Plus, Vant)
// and a small palette for charts, in two schemes: light (html:root) and dark (html.dark:root). Re-theming a prototype = running the build with another
// theme id; no page changes.
//
//   node theme/make-theme.mjs [theme-id]          (default: enterprise-navy)
//
// Writes src/shared/theme.generated.css and src/shared/theme.generated.js.
// The dark scheme takes the theme's own `dark` mapping (themes.json: themes.<id>.dark and shared.dark) where it has one and derives the rest by the rule of
// Luz-Design 视觉设计规范: a darker ground and a lighter foreground, not an inversion; the brand step moves to a lighter step of the same hue.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const themesPath = process.env.LUZ_THEMES || resolve(root, '../../../Luz-Design/references/themes.json')
const id = process.argv[2] || process.env.LUZ_THEME || 'enterprise-navy'

const data = JSON.parse(readFileSync(themesPath, 'utf8'))
const theme = data.themes[id]
if (!theme) throw new Error(`unknown theme ${id}; choose one of ${Object.keys(data.themes).join(', ')}`)
const shared = data.shared

// ---- colour helpers
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const hex = (a) => '#' + a.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase()
const mix = (a, b, w) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * w)) }
const lum = (c) => { const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return Math.max(x, y) / Math.min(x, y) }
const toHsl = (c) => {
  const [r, g, b] = rgb(c).map((x) => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
const fromHsl = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return hex([r + m, g + m, b + m].map((v) => v * 255)) }
const DARK_INK = '#F5EFEA'

// ---- the two palettes
const light = { ...theme, ...shared, scheme: 'light', onAction: '#FFFFFF', scrim: shared.elevation.scrim, levels: [shared.elevation.level1, shared.elevation.level2, shared.elevation.level3, shared.elevation.level4] }

function deriveDark() {
  const td = theme.dark || {}, sd = shared.dark || {}
  const [h, s0] = toHsl(theme.action)
  const hue = s0 < 0.12 ? toHsl(theme.accent || theme.action)[0] : h
  const canvas = td.canvas || fromHsl(hue, 0.1, 0.09)
  const surface = td.surface || fromHsl(hue, 0.1, 0.135)
  const navBg = td.navBg || fromHsl(hue, 0.1, 0.115)
  const line = td.line || fromHsl(hue, 0.08, 0.22)
  const ink = sd.ink || DARK_INK
  const ink2 = sd.ink2 || mix(ink, canvas, 0.3)
  const ink3 = sd.ink3 || mix(ink, canvas, 0.52)
  // the brand step: the theme's mapping, or the same hue brightened until it reads on the ground (3:1) and still carries white text (4.5:1); a near-black brand turns near-white with dark text
  let action = td.action, onAction = td.onAction || '#FFFFFF'
  if (!action) {
    if (lum(theme.action) < 0.04 && s0 < 0.12) { action = '#E4E4E7'; onAction = '#18181B' }
    else {
      const [ah, as, al] = toHsl(theme.action); action = theme.action
      for (let l = al; l <= 0.7; l += 0.01) { const c = fromHsl(ah, Math.min(as, 0.85), l); action = c; if (ratio(c, canvas) >= 3 && ratio('#FFFFFF', c) >= 4.5) break }
      if (ratio('#FFFFFF', action) < 4.5) onAction = '#18181B'
    }
  } else if (!td.onAction && ratio('#FFFFFF', action) < 4.5) onAction = '#18181B'
  const actionPress = td.actionPress || mix(action, '#FFFFFF', 0.12)
  const tintOf = (c, l = 0.17, sat = 0.3) => fromHsl(toHsl(c)[0], sat, l)
  const text = (c) => { let o = c; const [oh, os] = toHsl(c); for (let l = toHsl(c)[2]; l < 0.9 && ratio(o, surface) < 4.6; l += 0.02) o = fromHsl(oh, os, l); return o }
  const status = (key) => sd[key] || text(shared[key])
  const tint = (key) => sd[key + 'Tint'] || tintOf(shared[key])
  return {
    scheme: 'dark', onAction, actionText: td.actionText || action, canvas, surface, navBg, line, ink, ink2, ink3, action, actionPress,
    actionTint: td.actionTint || tintOf(action, 0.18, 0.4), accent: td.accent || text(theme.accent), accentTint: td.accentTint || tintOf(theme.accent),
    success: status('success'), successTint: tint('success'), warning: status('warning'), warningTint: tint('warning'), danger: status('danger'), dangerTint: tint('danger'),
    successFill: sd.successFill || shared.success, warningFill: sd.warningFill || shared.warning, dangerFill: sd.dangerFill || shared.danger,   // fills that carry white text: the text colours above are too light for it
    info: status('info'), infoTint: tint('info'), price: status('price'), priceTint: tint('price'), sage: sd.sage || text(shared.sage),
    radiusButton: theme.radiusButton, radiusCard: theme.radiusCard, scrim: sd.elevation?.scrim || 'rgba(0, 0, 0, .6)',
    levels: sd.elevation?.level1 ? [sd.elevation.level1, sd.elevation.level2, sd.elevation.level3, sd.elevation.level4] : ['0 0 0 1px ' + line, '0 1px 3px rgba(0, 0, 0, .5)', '0 4px 12px rgba(0, 0, 0, .55)', '0 12px 28px rgba(0, 0, 0, .6)'],
  }
}
const dark = deriveDark()
const font = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif'

/** The variables of one scheme: the project's own tokens, Element Plus's, Vant's; and the rules that need a selector of their own. */
function build(p) {
  const isDark = p.scheme === 'dark'
  const lines = [], ep = [], vt = []
  const v = (k, val) => lines.push(`  ${k}: ${val};`)
  const epv = (k, val) => ep.push(`  ${k}: ${val};`)
  const vv = (k, val) => vt.push(`  ${k}: ${val};`)
  const lighter = (c, n) => mix(c, isDark ? p.canvas : '#FFFFFF', n / 10)        // the library's light-3 … light-9 steps: toward the page ground
  const stronger = (c, n) => mix(c, isDark ? '#FFFFFF' : '#000000', n / 10)       // its dark-2 step: toward the foreground
  const border = isDark ? mix(p.ink, p.canvas, 0.58) : mix(p.ink, '#FFFFFF', 0.78)   // control borders keep 3:1 against the ground (WCAG 1.4.11)

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
  const readable = (c, bg, min = 4.6) => { let o = c; for (let i = 0; i < 14 && ratio(o, bg) < min; i++) o = mix(o, isDark ? '#FFFFFF' : '#000000', 0.08); return o }

  // Element Plus (admin)
  const type = (name, c) => { epv(`--el-color-${name}`, c); for (const n of [3, 5, 7, 8, 9]) epv(`--el-color-${name}-light-${n}`, lighter(c, n)); epv(`--el-color-${name}-dark-2`, stronger(c, 2)) }
  type('primary', p.action); type('success', p.successFill || p.success); type('warning', p.warningFill || p.warning); type('danger', p.dangerFill || p.danger); type('error', p.dangerFill || p.danger); type('info', p.ink2)
  epv('--el-text-color-primary', p.ink); epv('--el-text-color-regular', p.ink); epv('--el-text-color-secondary', p.ink2)
  epv('--el-text-color-placeholder', p.ink3); epv('--el-text-color-disabled', mix(p.ink, p.canvas, isDark ? 0.62 : 0.4))
  epv('--el-border-color', border); epv('--el-border-color-light', p.line); epv('--el-border-color-lighter', mix(p.line, isDark ? p.canvas : '#FFFFFF', 0.5))
  epv('--el-border-color-extra-light', mix(p.line, isDark ? p.canvas : '#FFFFFF', 0.7)); epv('--el-border-color-hover', mix(border, p.action, 0.5))
  epv('--el-fill-color', isDark ? mix(p.surface, p.ink, 0.08) : mix(p.line, '#FFFFFF', 0.4)); epv('--el-fill-color-light', p.actionTint)
  epv('--el-fill-color-lighter', isDark ? mix(p.surface, p.ink, 0.04) : mix(p.canvas, '#FFFFFF', 0.5)); epv('--el-fill-color-blank', p.surface)
  epv('--el-bg-color', p.surface); epv('--el-bg-color-page', p.canvas); epv('--el-bg-color-overlay', isDark ? mix(p.surface, p.ink, 0.05) : p.surface)
  epv('--el-mask-color', p.scrim); epv('--el-mask-color-extra-light', isDark ? 'rgba(0, 0, 0, .35)' : 'rgba(255, 255, 255, .6)')
  epv('--el-border-radius-base', `${p.radiusButton || 8}px`); epv('--el-border-radius-small', '6px'); epv('--el-border-radius-round', '20px')
  // a text box shows focus by its 1 px border turning neutral dark: no blue frame, no glow (Luz-Design 视觉设计规范 聚焦框)
  epv('--el-input-focus-border-color', p.ink2); epv('--el-input-focus-border', p.ink2); epv('--el-select-input-focus-border-color', p.ink2)
  epv('--el-font-weight-primary', '600')   // the standard has 400 / 600 / 700 only; the library's 500 shows as regular in Microsoft YaHei
  epv('--el-font-family', font); epv('--el-font-size-base', '14px'); epv('--el-font-size-small', '14px'); epv('--el-font-size-extra-small', '12px')
  epv('--el-font-size-medium', '16px'); epv('--el-font-size-large', '18px')
  epv('--el-box-shadow', p.levels[2]); epv('--el-box-shadow-light', p.levels[1]); epv('--el-box-shadow-lighter', p.levels[0]); epv('--el-box-shadow-dark', p.levels[3])
  epv('--el-menu-active-color', isDark ? (p.actionText || p.accent) : p.action); epv('--el-menu-bg-color', p.navBg); epv('--el-menu-hover-bg-color', mix(p.navBg, p.action, isDark ? 0.2 : 0.1)); epv('--el-menu-text-color', p.ink)
  epv('--el-table-header-bg-color', p.actionTint); epv('--el-table-header-text-color', p.ink)
  epv('--el-table-row-hover-bg-color', isDark ? mix(p.surface, p.ink, 0.05) : mix(p.canvas, '#FFFFFF', 0.4))
  epv('--el-table-border-color', p.line); epv('--el-card-border-radius', `${p.radiusCard || 12}px`)

  // Vant (mini-program prototype; the same design as Vant Weapp)
  vv('--van-primary-color', p.action); vv('--van-success-color', p.successFill || p.success); vv('--van-warning-color', p.warningFill || p.warning); vv('--van-danger-color', p.dangerFill || p.danger)
  vv('--van-text-color', p.ink); vv('--van-text-color-2', p.ink2); vv('--van-text-color-3', p.ink3)
  vv('--van-background', p.canvas); vv('--van-background-2', p.surface); vv('--van-border-color', p.line)
  vv('--van-active-color', isDark ? mix(p.surface, p.ink, 0.08) : mix(p.canvas, '#FFFFFF', 0.4)); vv('--van-gray-1', isDark ? p.surface : mix(p.canvas, '#FFFFFF', 0.5)); vv('--van-gray-2', p.canvas)
  if (isDark) {   // Vant's grey scale is its light ground, border and text greys: in the dark scheme the same steps become the ground, the line and the three ink steps
    const greys = [p.surface, p.canvas, p.line, mix(p.line, p.ink, 0.3), p.ink3, p.ink3, p.ink2, p.ink]
    greys.forEach((c, i) => vv(`--van-gray-${i + 1}`, c))
  }
  vv('--van-radius-md', `${p.radiusButton || 8}px`); vv('--van-radius-lg', `${p.radiusCard || 12}px`); vv('--van-radius-max', '999px')
  vv('--van-font-bold', '600'); vv('--van-font-size-md', '14px'); vv('--van-font-size-sm', '12px'); vv('--van-font-size-lg', '16px')
  vv('--van-padding-md', '16px'); vv('--van-padding-sm', '12px')
  vv('--van-button-primary-background', p.action); vv('--van-button-primary-border-color', p.action); vv('--van-button-primary-color', p.onAction)
  vv('--van-tabbar-item-active-color', isDark ? (p.actionText || p.accent) : p.action); vv('--van-nav-bar-title-text-color', p.ink); vv('--van-cell-group-inset-radius', `${p.radiusCard || 12}px`)
  vv('--van-tag-primary-color', isDark ? (p.actionText || p.action) : p.action); vv('--van-price-color', p.price); vv('--van-submit-bar-price-color', p.price)
  vv('--van-submit-bar-button-danger-background', p.dangerFill || p.danger)   // a flat fill, not Vant's red gradient
  if (isDark) { vv('--van-tag-success-color', p.success); vv('--van-tag-warning-color', p.warning); vv('--van-tag-danger-color', p.danger); vv('--van-tag-default-color', p.ink3); vv('--van-tag-text-color', p.canvas) }
  vv('--van-font-size-xs', '12px')
  vv('--van-step-active-color', isDark ? (p.actionText || p.action) : p.action)
  // 12 px is for annotations (a cell's description, tags, prices' currency): buttons, grid labels and a card's title are text and stay at 14
  vv('--van-button-mini-font-size', '14px'); vv('--van-button-small-font-size', '14px'); vv('--van-grid-item-text-font-size', '14px')
  vv('--van-action-bar-icon-font-size', '14px'); vv('--van-action-bar-icon-width', '64px'); vv('--van-tabbar-item-font-size', '14px')
  vv('--van-card-font-size', '14px'); vv('--van-card-title-line-height', '20px')
  // one font family: Vant's price, badge and card fonts name their own stacks (avenir-heavy, -apple-system-font)
  for (const k of ['base-font', 'price-font', 'badge-font', 'card-price-font', 'submit-bar-price-font']) vv(`--van-${k}`, 'var(--luz-font)')

  // component-scoped variables (the library's documented way to customise one component): tag text readable on its own tint
  const sel = isDark ? 'html.dark ' : 'html '
  const tags = [['primary', p.action], ['success', p.success], ['warning', p.warning], ['danger', p.danger], ['info', p.ink2]]
    .map(([name, c]) => `${sel}.el-tag.el-tag--${name} { --el-tag-text-color: ${readable(c, lighter(c, 9))}; }`)
  const rules = [
    `${sel}.el-input, ${sel}.el-textarea, ${sel}.el-select, ${sel}.el-date-editor, ${sel}.el-range-editor { --el-input-focus-border-color: ${p.ink2}; --el-input-focus-border: ${p.ink2}; --el-select-input-focus-border-color: ${p.ink2}; }`,
    `${sel}.el-select__wrapper.is-focused, ${sel}.el-range-editor.is-active, ${sel}.el-range-editor.is-active:hover { box-shadow: 0 0 0 1px ${p.ink2} inset; }`,   // these draw their focus frame with the brand colour directly
    `${sel}.el-button { --el-button-outline-color: ${p.ink2}; }`,
  ]
  if (isDark) {
    // Element Plus and Vant colour links, active tabs, page numbers and checked labels with the brand fill; on a dark ground that fill is too dark for text, so these uses take the brand's text colour
    const text = 'var(--luz-action-text)'
    rules.push(`html.dark .el-tabs__item.is-active, html.dark .el-tabs__item:hover, html.dark .el-pager li.is-active, html.dark .el-pager li:hover, html.dark .el-link.el-link--primary, html.dark .el-checkbox__input.is-checked + .el-checkbox__label, html.dark .el-radio__input.is-checked + .el-radio__label, html.dark .el-select-dropdown__item.is-selected, html.dark .el-date-table td.today .el-date-table-cell__text, html.dark .el-button--primary.is-link, html.dark .el-button--primary.is-text, html.dark .el-button--primary.is-plain { color: ${text}; --el-button-text-color: ${text}; --el-button-hover-text-color: ${text}; --el-button-active-text-color: ${text}; }`)
    for (const k of ['success', 'warning', 'danger', 'info']) {
      rules.push(`html.dark .el-alert--${k}.is-light, html.dark .el-alert--${k}.is-light .el-alert__title, html.dark .el-alert--${k}.is-light .el-alert__description, html.dark .el-alert--${k}.is-light .el-alert__icon, html.dark .el-message--${k} .el-message__content { color: var(--luz-${k}); }`)
      if (k !== 'info') rules.push(`html.dark .el-button--${k}.is-link, html.dark .el-button--${k}.is-text, html.dark .el-button--${k}.is-plain { color: var(--luz-${k}); --el-button-text-color: var(--luz-${k}); --el-button-hover-text-color: var(--luz-${k}); --el-button-active-text-color: var(--luz-${k}); }`)
    }
    rules.push(`html.dark .van-button--primary.van-button--plain, html.dark .van-tabbar-item--active, html.dark .van-tab--active .van-tab__text { color: ${text}; }`)
    rules.push(`html.dark .van-tag--primary.van-tag--plain, html.dark .van-step--process, html.dark .van-step--process .van-step__circle { color: ${text}; }`)
    rules.push(`html.dark .van-submit-bar__button--danger, html.dark .van-button--danger { background: ${p.dangerFill || p.danger}; border-color: ${p.dangerFill || p.danger}; }`)
  }
  if (isDark) rules.push(`html.dark .el-button--primary { --el-button-text-color: ${p.onAction}; --el-button-hover-text-color: ${p.onAction}; --el-button-active-text-color: ${p.onAction}; }`)
  return { lines, ep, vt, tags, rules }
}

const L = build(light), D = build(dark)
const common = ['html .van-card__desc { font-size: var(--van-font-size-sm); }', 'html .el-statistic { --el-statistic-title-font-size: var(--el-font-size-base); }']

// chart palette: the brand step first, then the theme's accent and the shared hues; neutrals for "other"
const palette = (p) => [p.action, p.accent, p.info, p.sage || shared.sage, p.success, mix(p.ink3, p.scheme === 'dark' ? p.canvas : '#FFFFFF', 0.4)]
const tokens = (p) => ({ action: p.action, press: p.actionPress, tint: p.actionTint, canvas: p.canvas, accent: p.accent, ink: p.ink, ink2: p.ink2, line: p.line, price: p.price, surface: p.surface })

const css = `/* generated by theme/make-theme.mjs from themes.json (theme: ${id}); do not edit. html:root beats the libraries' own :root defaults wherever the style sheets sit; html.dark:root is the dark scheme (the scheme switch puts the class dark on <html>). */
html:root {
${L.lines.join('\n')}
${L.ep.join('\n')}
${L.vt.join('\n')}
  color-scheme: light;
}
html.dark:root, html.dark .van-theme-dark {
${D.lines.join('\n')}
${D.ep.join('\n')}
${D.vt.join('\n')}
  color-scheme: dark;
}
${L.tags.join('\n')}
${D.tags.join('\n')}
${common.join('\n')}
${L.rules.join('\n')}
${D.rules.join('\n')}
`
writeFileSync(resolve(root, 'src/shared/theme.generated.css'), css)
writeFileSync(resolve(root, 'src/shared/theme.generated.js'),
  `// generated by theme/make-theme.mjs (theme: ${id}); do not edit\nexport const THEME_ID = ${JSON.stringify(id)}\nexport const THEME_LABEL = ${JSON.stringify(theme.label)}\n` +
  `export const PALETTE = ${JSON.stringify(palette(light))}\nexport const TOKENS = ${JSON.stringify(tokens(light))}\n` +
  `export const PALETTE_DARK = ${JSON.stringify(palette(dark))}\nexport const TOKENS_DARK = ${JSON.stringify(tokens(dark))}\n`)
console.log(`theme ${id} (${theme.label}), light and dark -> src/shared/theme.generated.css`)
