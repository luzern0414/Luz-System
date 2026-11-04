// Date and money helpers shared by the demo data and both prototypes.
export const K = {
  pad: (n) => String(n).padStart(2, '0'),
  today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x },
  ymd(d) { return d.getFullYear() + '-' + K.pad(d.getMonth() + 1) + '-' + K.pad(d.getDate()) },
}

/** Cents to a display amount: 2250 -> "22.50" (the currency sign is drawn by the component so that it can be smaller). */
export const yuan = (cents) => (Math.round(cents) / 100).toFixed(2)
export const money = (cents) => '¥' + yuan(cents)
export const percent = (ratio) => (ratio * 100).toFixed(1) + '%'
export const signed = (ratio) => (ratio >= 0 ? '+' : '') + (ratio * 100).toFixed(1) + '%'
export const maskPhone = (p) => (p ? p.slice(0, 3) + '****' + p.slice(7) : '')
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
