// The cart of the demo member: lines of (product, spec, quantity). Prices are cents; the totals are computed, never stored.
import { computed, reactive } from 'vue'

export const cart = reactive({ lines: [] })
const keyOf = (pid, spec) => pid + '|' + (spec || '')

export function addToCart(product, { spec = '', specExtra = 0, qty = 1 } = {}) {
  const key = keyOf(product.id, spec)
  const line = cart.lines.find((l) => l.key === key)
  if (line) line.qty += qty
  else cart.lines.push({ key, pid: product.id, name: product.name, img: product.img, spec, price: product.price + specExtra, qty })
}
export const setQty = (key, qty) => { const line = cart.lines.find((l) => l.key === key); if (!line) return; if (qty <= 0) cart.lines = cart.lines.filter((l) => l.key !== key); else line.qty = qty }
export const clearCart = () => { cart.lines = [] }
export const cartCount = computed(() => cart.lines.reduce((n, l) => n + l.qty, 0))
export const cartTotal = computed(() => cart.lines.reduce((s, l) => s + l.price * l.qty, 0))
export const qtyOf = (pid) => cart.lines.filter((l) => l.pid === pid).reduce((n, l) => n + l.qty, 0)
