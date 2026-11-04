// A random avatar that stays: the same seed (a member number, an account) always gives the same flat portrait, so a person keeps one face on every page.
// Drawn here as an SVG data URI (no network, no files): a soft pastel disc, shoulders, a head and one of six hair styles, in a few muted colours.
// It is an image, like a photo: the palette rule of the theme does not count its colours. Used where a person has no photo; a guest or a system user shows
// the line icon instead.
const BG = ['#E8EEF7', '#EAF3EC', '#F6EFE6', '#F3EAF2', '#E6F2F4', '#F4ECE8', '#EDEFF6', '#F1F3E6']
const SKIN = ['#F2D3B5', '#E8B992', '#D39A72', '#B27650', '#8C573A']
const HAIR = ['#2B2B33', '#4A3426', '#7A4B2A', '#C79A4E', '#8B8F99', '#A4443B']
const SHIRT = ['#5B7BA5', '#6E9B8A', '#B58A5C', '#8E7AA8', '#C27C7C', '#7A8A99', '#4F6D7A']

function hash(text) {
  let h = 2166136261
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function stream(seed) {
  let s = hash(seed) || 1
  return (n) => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) % n }   // xorshift: the same seed, the same numbers
}

const hairBack = (style, c) => (style === 1 ? `<path d="M19 30 C19 12 45 12 45 30 L46 46 L18 46 Z" fill="${c}"/>` : '')
const hairFront = (style, c) => [
  `<path d="M21 27 C21 17 27 15 32 15 C38 15 43 18 43 27 C40 22 36 21 32 21 C28 21 24 22 21 27 Z" fill="${c}"/>`,
  `<path d="M21 27 C21 17 27 15 32 15 C38 15 43 18 43 27 C40 22 36 21 32 21 C28 21 24 22 21 27 Z" fill="${c}"/>`,
  `<circle cx="32" cy="12" r="5" fill="${c}"/><path d="M21 27 C21 17 27 16 32 16 C38 16 43 18 43 27 C40 22 36 21 32 21 C28 21 24 22 21 27 Z" fill="${c}"/>`,
  '',
  `<path d="M21 26 C22 16 34 13 42 20 C43 23 43 25 43 27 C38 22 30 22 21 26 Z" fill="${c}"/>`,
  `<circle cx="24" cy="19" r="6" fill="${c}"/><circle cx="32" cy="16" r="6" fill="${c}"/><circle cx="40" cy="19" r="6" fill="${c}"/><circle cx="21" cy="26" r="5" fill="${c}"/><circle cx="43" cy="26" r="5" fill="${c}"/>`,
][style]

/** The avatar of a seed, as a value for an img src (or el-avatar's src). */
export function avatar(seed) {
  const pick = stream(seed)
  const bg = BG[pick(BG.length)], skin = SKIN[pick(SKIN.length)], hair = HAIR[pick(HAIR.length)], shirt = SHIRT[pick(SHIRT.length)], style = pick(6)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>`
    + hairBack(style, hair)
    + `<path d="M8 64 C8 49 20 43 32 43 C44 43 56 49 56 64 Z" fill="${shirt}"/>`
    + `<rect x="28" y="36" width="8" height="9" rx="3" fill="${skin}"/>`
    + `<ellipse cx="32" cy="28" rx="11" ry="12" fill="${skin}"/>`
    + hairFront(style, hair)
    + '<circle cx="28" cy="29" r="1.4" fill="#2B2B33"/><circle cx="36" cy="29" r="1.4" fill="#2B2B33"/>'
    + '<path d="M29 34 Q32 36.5 35 34" fill="none" stroke="#2B2B33" stroke-width="1.2" stroke-linecap="round"/></svg>'
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
