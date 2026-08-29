import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-thinkbar'
const CSS_PREFIX = '\0dsh-thinkbar-css:'
const CSS_SUFFIX = '.mjs'
const CLIENT_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
])

function styleModule(file: string, css: string, classMap: Readonly<Record<string, string>>): string {
  const tagId = `${PACKAGE_ID}/${basename(file)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {',
    '  const tag = document.createElement("style");',
    `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

const node: UserConfig = {
  name: PACKAGE_ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  dts: false,
  clean: false,
  fixedExtension: false,
}

const client: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  sourcemap: true,
  dts: false,
  clean: false,
  fixedExtension: false,
  deps: {
    neverBundle: specifier => CLIENT_EXTERNALS.has(specifier),
    alwaysBundle: specifier => !CLIENT_EXTERNALS.has(specifier),
  },
  plugins: [{
    name: 'dsh-thinkbar-css-modules',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      return CSS_PREFIX + resolve(dirname(importer), source) + CSS_SUFFIX
    },
    async load(id) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const file = decodeURIComponent(id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length))
      this.addWatchFile(file)
      const source = await readFile(file)
      const { code, exports } = transform({
        filename: file,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes: Record<string, string> = {}
      for (const [local, value] of Object.entries(exports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        classes[local] = value.name
      }
      return styleModule(file, code.toString(), classes)
    },
  }],
  outputOptions: {
    entryFileNames: 'client.cjs',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [node, client]
