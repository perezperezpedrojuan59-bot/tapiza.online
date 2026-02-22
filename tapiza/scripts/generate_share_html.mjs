import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '../dist')

const indexPath = path.join(distDir, 'index.html')
const indexHtml = await readFile(indexPath, 'utf8')

const cssMatch = indexHtml.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/)
const jsMatch = indexHtml.match(
  /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/,
)

if (!cssMatch || !jsMatch) {
  throw new Error('No se pudieron encontrar los bundles CSS/JS en dist/index.html')
}

const cssPath = path.join(distDir, cssMatch[1])
const jsPath = path.join(distDir, jsMatch[1])
const css = await readFile(cssPath, 'utf8')
const js = await readFile(jsPath, 'utf8')

const withInlineCss = indexHtml.replace(
  /<link rel="stylesheet" crossorigin href="\.\/assets\/[^"]+\.css">/,
  `<style>\n${css}\n</style>`,
)

const shareHtml = withInlineCss.replace(
  /<script type="module" crossorigin src="\.\/assets\/[^"]+\.js"><\/script>/,
  `<script type="module">\n${js}\n</script>`,
)

await writeFile(path.join(distDir, 'share.html'), shareHtml, 'utf8')
console.log('share.html generado en', path.join(distDir, 'share.html'))
