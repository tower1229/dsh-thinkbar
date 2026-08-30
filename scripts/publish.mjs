import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = join(root, 'package.json')
const releaseDirectory = join(root, '.smoke', 'release')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export function parseStableVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`release version must be stable semver, received ${version}`)
  return match.slice(1).map(Number)
}

function compareVersions(left, right) {
  const a = parseStableVersion(left)
  const b = parseStableVersion(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

export function chooseReleaseVersion(current, publishedVersions) {
  parseStableVersion(current)
  const stablePublished = publishedVersions.filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  const latest = stablePublished.toSorted(compareVersions).at(-1)

  if (latest && compareVersions(current, latest) < 0) {
    throw new Error(`package.json version ${current} is behind the latest published version ${latest}`)
  }
  if (!publishedVersions.includes(current)) return current

  const [major, minor, patch] = parseStableVersion(current)
  let candidatePatch = patch + 1
  while (publishedVersions.includes(`${major}.${minor}.${candidatePatch}`)) candidatePatch += 1
  return `${major}.${minor}.${candidatePatch}`
}

export function releaseFilename(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

function commandLine(command, args) {
  if (process.platform !== 'win32') return { command, args }
  const quote = (value) => /^[\w@./:=\\-]+$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].map(quote).join(' ')],
  }
}

function run(command, args, options = {}) {
  const invocation = commandLine(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result
}

function readPublishedVersions(packageName) {
  const result = run(npmCommand, ['view', packageName, 'versions', '--json'], {
    allowFailure: true,
    capture: true,
  })
  if (result.status !== 0) {
    if (result.stderr.includes('E404')) return []
    process.stderr.write(result.stderr)
    throw new Error(`could not read published versions for ${packageName}`)
  }
  const parsed = JSON.parse(result.stdout)
  return Array.isArray(parsed) ? parsed : [parsed]
}

async function updateManifestVersion(manifest, version) {
  if (manifest.version === version) return
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
}

async function digest(path, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(await readFile(path)).digest(encoding)
}

async function verifyPublishedMetadata(packageName, version, expectedIntegrity) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = run(npmCommand, ['view', `${packageName}@${version}`, 'version', 'dist.integrity', '--json'], {
      allowFailure: true,
      capture: true,
    })
    if (result.status === 0) {
      const metadata = JSON.parse(result.stdout)
      if (metadata.version === version && metadata['dist.integrity'] === expectedIntegrity) return
    }
    if (attempt < 6) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error(`npm registry did not return the expected metadata for ${packageName}@${version}`)
}

export async function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((argument) => argument !== '--dry-run')
  if (unknown.length > 0) throw new Error(`unknown argument: ${unknown.join(', ')}`)
  const dryRun = argv.includes('--dry-run')
  const originalManifestSource = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(originalManifestSource)
  if (manifest.name !== 'dsh-thinkbar') throw new Error(`unexpected package name: ${manifest.name}`)

  if (!dryRun) {
    const identity = run(npmCommand, ['whoami'], { capture: true })
    console.log(`npm account: ${identity.stdout.trim()}`)
  }

  const version = chooseReleaseVersion(manifest.version, readPublishedVersions(manifest.name))
  const versionChanged = version !== manifest.version
  console.log(versionChanged ? `release version: ${manifest.version} -> ${version}` : `release version: ${version}`)

  await updateManifestVersion(manifest, version)
  try {
    run(npmCommand, ['exec', '--yes', 'pnpm@11.7.0', '--', 'run', 'verify'])

    await mkdir(releaseDirectory, { recursive: true })
    const filename = releaseFilename(manifest.name, version)
    const tarballPath = join(releaseDirectory, filename)
    const checksumPath = `${tarballPath}.sha256`
    await rm(tarballPath, { force: true })
    await rm(checksumPath, { force: true })
    run(npmCommand, ['exec', '--yes', 'pnpm@11.7.0', '--', 'pack', '--pack-destination', releaseDirectory])

    const sha256 = await digest(tarballPath, 'sha256')
    const integrity = `sha512-${await digest(tarballPath, 'sha512', 'base64')}`
    await writeFile(checksumPath, `${sha256}  ${filename}\n`)
    console.log(`tarball: ${tarballPath}`)
    console.log(`sha256: ${sha256}`)

    const publishArgs = ['publish', tarballPath, '--access', 'public', '--ignore-scripts']
    if (dryRun) publishArgs.push('--dry-run')
    run(npmCommand, publishArgs)

    if (dryRun) {
      console.log('dry run complete; nothing was published')
      return
    }
    await verifyPublishedMetadata(manifest.name, version, integrity)
    console.log(`published and verified: ${manifest.name}@${version}`)
  } finally {
    if (dryRun && versionChanged) await writeFile(manifestPath, originalManifestSource)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`publish failed: ${error.message}`)
    process.exitCode = 1
  })
}
