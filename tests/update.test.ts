import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, compareVersions } from '../src/plugin/update'

afterEach(() => vi.unstubAllGlobals())

describe('compareVersions', () => {
  it('compares numeric release tags', () => {
    expect(compareVersions('v0.2.1', '0.1.0')).toBeGreaterThan(0)
    expect(compareVersions('v0.1.0', 'v0.1.0')).toBe(0)
    expect(compareVersions('0.1.0', 'v0.2.0')).toBeLessThan(0)
  })

  it('handles missing parts and pre-release suffixes', () => {
    expect(compareVersions('v1', 'v1.0.0')).toBe(0)
    expect(compareVersions('v1.0.1-beta.1', 'v1.0.0')).toBeGreaterThan(0)
  })
})

describe('checkForUpdate', () => {
  it('reports the latest public release', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v0.2.0',
      html_url: 'https://example.test/release',
      assets: [{ name: 'onecomme-rolling-credit-v0.2.0.zip', browser_download_url: 'https://example.test/a.zip' }],
    }), { status: 200 })))
    expect(await checkForUpdate('v0.1.0', true)).toMatchObject({ latestVersion: 'v0.2.0', available: true })
  })

  it('returns an error when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await checkForUpdate('v0.1.0', true)).toMatchObject({ available: false, error: 'GitHub API 回傳 404' })
  })
})
