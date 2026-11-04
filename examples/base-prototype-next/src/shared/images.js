// Demo pictures (webp, resized): inlined into the single file. IMG['pkg-05'] is a data URI.
const files = import.meta.glob('./images/*.webp', { eager: true, import: 'default' })
export const IMG = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.replace('./images/', '').replace('.webp', ''), url]))
