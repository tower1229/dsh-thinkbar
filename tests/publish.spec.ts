import { describe, expect, it } from 'vitest'

import { chooseReleaseVersion, parseStableVersion, releaseFilename } from '../scripts/publish.mjs'

describe('npm release automation', () => {
  it('keeps an unpublished manifest version', () => {
    expect(chooseReleaseVersion('0.1.0', [])).toBe('0.1.0')
    expect(chooseReleaseVersion('0.1.1', ['0.1.0'])).toBe('0.1.1')
  })

  it('increments patch versions already present in the registry', () => {
    expect(chooseReleaseVersion('0.1.0', ['0.1.0'])).toBe('0.1.1')
    expect(chooseReleaseVersion('0.1.2', ['0.1.0', '0.1.1', '0.1.2'])).toBe('0.1.3')
  })

  it('rejects unstable or locally stale release versions', () => {
    expect(() => parseStableVersion('0.2.0-rc.1')).toThrow('stable semver')
    expect(() => chooseReleaseVersion('0.1.0', ['0.2.0'])).toThrow('behind')
  })

  it('uses npm tarball naming for scoped and unscoped packages', () => {
    expect(releaseFilename('dsh-thinkbar', '0.1.0')).toBe('dsh-thinkbar-0.1.0.tgz')
    expect(releaseFilename('@example/plugin', '1.2.3')).toBe('example-plugin-1.2.3.tgz')
  })
})
