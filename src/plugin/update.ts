// GitHub Releases based updater. OneComme has no plugin-update API, so the
// plugin downloads the release zip itself. A reload of OneComme is still required.

import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { UpdateStatus } from '../shared/types'

const execFileAsync = promisify(execFile)
const REPO = 'arWai-CW/onecomme-rolling-credit'
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const CACHE_MS = 60 * 60 * 1000
const MAX_ZIP_BYTES = 20 * 1024 * 1024
const PLUGIN_FILES = ['plugin.js', 'index.html', 'settings.html', 'package.json']

interface ReleaseAsset {
  name: string
  browser_download_url: string
}
interface Release {
  tag_name: string
  html_url: string
  assets: ReleaseAsset[]
}

let cache: { status: UpdateStatus; at: number } | undefined

/** Compare the numeric parts of two versions; pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}

function pickAsset(release: Release): ReleaseAsset {
  const asset = release.assets.find(
    (a) => a.name.startsWith('onecomme-rolling-credit-') && a.name.endsWith('.zip') && a.browser_download_url.startsWith('https://'),
  )
  if (!asset) throw new Error('release 沒有可用的 zip 檔案')
  return asset
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onecomme-rolling-credit' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API 回傳 ${res.status}`)
  return res.json()
}

async function fetchRelease(): Promise<Release> {
  const data = (await fetchJson(LATEST_URL)) as Partial<Release>
  if (typeof data?.tag_name !== 'string' || !Array.isArray(data.assets)) throw new Error('release 資料格式不正確')
  return { tag_name: data.tag_name, html_url: String(data.html_url ?? ''), assets: data.assets }
}

export async function checkForUpdate(currentVersion: string, force = false): Promise<UpdateStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status
  try {
    const release = await fetchRelease()
    pickAsset(release)
    const status: UpdateStatus = {
      currentVersion,
      latestVersion: release.tag_name,
      releaseUrl: release.html_url || undefined,
      available: isNewer(release.tag_name, currentVersion),
      checkedAt: Date.now(),
    }
    cache = { status, at: Date.now() }
    return status
  } catch (e) {
    return { currentVersion, available: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function extractZip(zip: string, dest: string): Promise<void> {
  if (process.platform === 'win32') {
    // Windows has no unzip; PowerShell's built-in ZipFile handles it.
    const script = join(dest, 'extract.ps1')
    await writeFile(
      script,
      [
        'param($zip, $dest)',
        // Without Stop, a failed method call only prints an error and the script still exits 0.
        "$ErrorActionPreference = 'Stop'",
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        '$archive = [IO.Compression.ZipFile]::OpenRead($zip)',
        'try {',
        '  foreach ($entry in $archive.Entries) {',
        "    if ($entry.FullName -match '(^|[\\\\/])\\.\\.([\\\\/]|$)' -or $entry.FullName -match '^([A-Za-z]:|[\\\\/])') { throw 'unsafe zip entry' }",
        '  }',
        // ExtractToDirectory is an extension method; PowerShell cannot call it on the instance.
        '  [IO.Compression.ZipFileExtensions]::ExtractToDirectory($archive, $dest)',
        '} finally { $archive.Dispose() }',
        '',
      ].join('\n'),
    )
    await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, zip, dest])
    return
  }
  const { stdout } = await execFileAsync('unzip', ['-Z1', zip])
  const names = stdout.split(/\r?\n/).filter(Boolean)
  if (names.some((n) => n.startsWith('/') || n.split(/[\\/]/).includes('..'))) throw new Error('zip 內含不安全的路徑')
  await execFileAsync('unzip', ['-q', '-o', zip, '-d', dest])
}

export async function installUpdate(currentVersion: string, pluginDir: string): Promise<UpdateStatus> {
  try {
    const release = await fetchRelease()
    if (!isNewer(release.tag_name, currentVersion)) return { currentVersion, available: false, latestVersion: release.tag_name }
    const asset = pickAsset(release)
    const res = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error(`下載更新失敗（${res.status}）`)
    const size = Number(res.headers.get('content-length') ?? 0)
    if (size > MAX_ZIP_BYTES) throw new Error('更新檔過大')
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_ZIP_BYTES) throw new Error('更新檔過大')

    const tmp = await mkdtemp(join(tmpdir(), 'rolling-credit-'))
    try {
      const zip = join(tmp, 'update.zip')
      const out = join(tmp, 'out')
      await mkdir(out)
      await writeFile(zip, bytes)
      await extractZip(zip, out)
      const src = join(out, 'onecomme-rolling-credit')
      // Copy only known files; state.json and user-added background images stay untouched.
      for (const name of PLUGIN_FILES) await copyFile(join(src, name), join(pluginDir, name))
      const assetsDir = join(src, 'assets')
      for (const name of await readdir(assetsDir)) {
        if (!/^[\w.-]+$/.test(name)) continue
        await copyFile(join(assetsDir, name), join(pluginDir, 'assets', name))
      }
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
    cache = undefined
    return { currentVersion, latestVersion: release.tag_name, available: false, installed: true, checkedAt: Date.now() }
  } catch (e) {
    return { currentVersion, available: false, error: e instanceof Error ? e.message : String(e) }
  }
}
