import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
const client = await readFile(new URL('lib/client.cjs', root), 'utf8')

const fail = (message) => {
  throw new Error(`package contract: ${message}`)
}

if (manifest.name !== 'dsh-thinkbar' || manifest.version !== '0.1.0') fail('unexpected package identity')
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') fail('missing bundle patch declaration')
if (manifest.dsh?.client?.platform !== 'web') fail('missing web client declaration')
if (manifest.exports?.['./client']?.default !== './lib/client.cjs') fail('unexpected client export')
if (JSON.stringify(manifest).includes('workspace:')) fail('workspace dependency leaked into manifest')
if (patch !== '- insert:\n    - id: dsh-thinkbar\n      name: dsh-thinkbar\n') fail('unexpected bundle patch')
if (!/window\.__ModuleLoader__\.load\(\{\s*id:\s*"dsh-thinkbar",\s*factory:\s*\(require\)/.test(client)) {
  fail('client bundle does not register the dsh-thinkbar factory')
}
if (!client.includes('data-plugin-css')) fail('client bundle does not own its injected stylesheet')
if (client.includes('@deepseek-ai/dsh-client-ui-reasoning-wait')) fail('upstream package id leaked into client bundle')

const cache = await mkdtemp(join(tmpdir(), 'dsh-thinkbar-npm-'))
let output
try {
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts']
  output = execFileSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: cache },
  })
} finally {
  await rm(cache, { recursive: true, force: true })
}
const packed = JSON.parse(output)[0]
const files = new Set(packed.files.map((file) => file.path))
for (const required of [
  'LICENSE',
  'README.md',
  'README.zh.md',
  'cordis.patch.yml',
  'lib/client.cjs',
  'lib/client.cjs.map',
  'lib/index.js',
  'lib/index.js.map',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
  'package.json',
]) {
  if (!files.has(required)) fail(`${required} is missing from the tarball`)
}
if ([...files].some((file) => file.startsWith('src/') || file.startsWith('tests/'))) {
  fail('source or tests leaked into the tarball')
}

console.log(`package contract: ${files.size} tarball files verified`)
