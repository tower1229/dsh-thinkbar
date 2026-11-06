import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('published package contract', () => {
  it('declares the independent bundle and web client', () => {
    expect(manifest).toMatchObject({
      name: 'dsh-thinkbar',
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: {
          platform: 'web',
          inject: [
            '@deepseek-ai/dsh-client-ui-conversation',
            '@deepseek-ai/dsh-client-ui-model-selection',
          ],
        },
      },
    })
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest).not.toHaveProperty('private')
  })

  it('exposes only built public entrypoints', () => {
    expect(manifest.exports).toEqual({
      '.': {
        types: './lib/types/index.d.ts',
        default: './lib/index.js',
      },
      './client': {
        types: './lib/types/client/index.d.ts',
        default: './lib/client.cjs',
      },
      './package.json': './package.json',
    })
    expect(JSON.stringify(manifest)).not.toContain('workspace:')
    expect(JSON.stringify(manifest)).not.toContain('./invariant')
    expect(JSON.stringify(manifest)).not.toContain('./src/')
  })

  it('pins the DSH 0.2 peer surface', () => {
    expect(manifest.peerDependencies).toEqual({
      '@deepseek-ai/cordis': '~4.1.0',
      '@deepseek-ai/dsh-client-ui-conversation': '^0.2.2-rc.1',
      '@deepseek-ai/dsh-client-ui-model-selection': '^0.2.2-rc.1',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    })
    expect(manifest.peerDependenciesMeta).toEqual({
      '@deepseek-ai/dsh-client-ui-conversation': { optional: true },
      '@deepseek-ai/dsh-client-ui-model-selection': { optional: true },
    })
  })

  it('stays compatible with the runtime version the DSH compatibility gate evaluates', async () => {
    const { satisfies } = await import('semver') as unknown as {
      satisfies(version: string, range: string, options: { includePrerelease: boolean }): boolean
    }
    for (const range of [
      manifest.peerDependencies['@deepseek-ai/dsh-client-ui-conversation'],
      manifest.peerDependencies['@deepseek-ai/dsh-client-ui-model-selection'],
    ]) {
      expect(satisfies('0.2.2-rc.1', range, { includePrerelease: true })).toBe(true)
    }
    expect(satisfies('0.1.2-alpha.4', manifest.peerDependencies['@deepseek-ai/dsh-client-ui-conversation'], { includePrerelease: true })).toBe(false)
  })
})
