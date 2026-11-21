// node build.mjs [admin|mini|all] [--theme <id>] [--out <dir>]
//   builds the prototype(s) into single, self-contained HTML files: admin.html and mini.html next to this script
//   (or into --out). The product palette comes from Luz-Design's application token export (default enterprise-navy).
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const targets = (args[0] && !args[0].startsWith('--') ? args[0] : 'all') === 'all' ? ['admin', 'mini'] : [args[0]]
const theme = flag('--theme', process.env.LUZ_THEME || 'enterprise-navy')
const outDir = resolve(flag('--out', process.env.LUZ_OUT_DIR || here))
mkdirSync(outDir, { recursive: true })

const made = spawnSync(process.execPath, [resolve(here, 'theme/make-theme.mjs'), theme], { stdio: 'inherit' })
if (made.status !== 0) process.exit(made.status ?? 1)
const typed = spawnSync(process.execPath, [resolve(here, 'theme/make-mini-type.mjs')], { stdio: 'inherit' })
if (typed.status !== 0) process.exit(typed.status ?? 1)

for (const target of targets) {
  process.env.LUZ_TARGET = target
  const dist = resolve(here, 'dist', `${target}-${process.pid}`)
  process.env.LUZ_OUT = dist
  await build({ configFile: resolve(here, 'vite.config.mjs'), logLevel: 'warn' })
  const out = resolve(outDir, `${target}.html`)
  copyFileSync(resolve(dist, `index.${target}.html`), out)
  console.log(`${target}: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`)
  rmSync(dist, { recursive: true, force: true })
}
