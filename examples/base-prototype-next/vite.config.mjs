// One config for both prototypes: LUZ_TARGET=admin|mini picks the entry and the component library.
// Element Plus (admin) and Vant (mini) are imported on demand, so a built file contains only the components the pages use.
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { VantResolver } from '@vant/auto-import-resolver'

const target = process.env.LUZ_TARGET || 'admin'
if (!['admin', 'mini'].includes(target)) throw new Error('LUZ_TARGET must be admin or mini')
const resolvers = target === 'admin' ? [ElementPlusResolver({ importStyle: 'css' })] : [VantResolver()]

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    vue(),
    AutoImport({ resolvers, dts: false }),
    Components({ resolvers, dts: false, dirs: [`src/${target}/components`, 'src/shared/components'] }),
    viteSingleFile(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __TARGET__: JSON.stringify(target), __VUE_OPTIONS_API__: 'false' },
  build: {
    outDir: process.env.LUZ_OUT || `dist/${target}`,
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    minify: process.env.LUZ_MINIFY === '0' ? false : 'oxc',
    rollupOptions: { input: fileURLToPath(new URL(`./index.${target}.html`, import.meta.url)) },
  },
})
