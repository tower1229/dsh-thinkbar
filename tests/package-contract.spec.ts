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

  it('pins the developer-preview DSH peer surface', () => {
    expect(manifest.peerDependencies).toEqual({
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-client-ui-conversation': '0.1.2-alpha.1',
      '@deepseek-ai/dsh-client-ui-model-selection': '0.1.2-alpha.1',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    })
    expect(manifest.peerDependenciesMeta).toEqual({
      '@deepseek-ai/dsh-client-ui-conversation': { optional: true },
      '@deepseek-ai/dsh-client-ui-model-selection': { optional: true },
    })
  })
})
