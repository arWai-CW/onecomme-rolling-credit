// OneComme plugin entry. Bundled to dist/<name>/plugin.js (CommonJS) by esbuild.

import { dirname, join } from 'node:path'
import { createDefaultState, normalizeSettings } from '../shared/defaults'
import { PLUGIN_UID, type PersistedState, type PluginAction, type ServiceInfo, type StateResponse, type UpdateStatus } from '../shared/types'
import { applyComment, applyEvent, normalizeCommentsPayload, type IncomingComment, type IncomingEvent } from './aggregator'
import { checkForUpdate, installUpdate } from './update'

interface Store {
  get(key: string): unknown
  set(key: string, value: unknown): void
}
interface Logger {
  info(...a: unknown[]): void
  warn(...a: unknown[]): void
  error(...a: unknown[]): void
}
interface PluginRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params: Record<string, string>
  body?: unknown
}

const STATE_KEY = 'data'
const SAVE_DELAY_MS = 1000

let store: Store | undefined
let log: Logger = console
let state: PersistedState = createDefaultState()
let services: ServiceInfo[] = []
let pro = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
let pluginDir = ''
let updateStatus: UpdateStatus | undefined
let updateTimer: Promise<UpdateStatus> | undefined

// Release workflow rewrites this tag to the release version.
const VERSION = 'v0.1.0'

function loadState(): PersistedState {
  const raw = store?.get(STATE_KEY) as Partial<PersistedState> | undefined
  const base = createDefaultState()
  if (!raw || typeof raw !== 'object') return base
  return {
    settings: normalizeSettings(raw.settings),
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    manualRaids: Array.isArray(raw.manualRaids) ? raw.manualRaids : [],
    replayToken: typeof raw.replayToken === 'number' ? raw.replayToken : 0,
  }
}

function saveNow(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    store?.set(STATE_KEY, state)
  } catch (e) {
    log.error('[rolling-credit] save failed', e)
  }
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS)
}

function setServices(list: unknown): void {
  if (!Array.isArray(list)) return
  services = list
    .filter((s) => s && typeof s.id === 'string' && isYouTubeUrl(s.url))
    .map((s) => ({ id: s.id as string, name: String(s.name ?? s.id) }))
}

function isYouTubeUrl(url: unknown): boolean {
  return typeof url === 'string' && /youtube\.com|youtu\.be/i.test(url)
}

function handleComments(list: IncomingComment[]): void {
  let changed = false
  for (const c of list) {
    if (state.settings.debugLog && (c?.data?.giftType || c?.data?.event)) {
      log.info('[rolling-credit] raw', JSON.stringify(c))
    }
    try {
      if (applyComment(state, c)) changed = true
    } catch (e) {
      log.error('[rolling-credit] applyComment failed', e)
    }
  }
  if (changed) scheduleSave()
}

function parseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return undefined
    }
  }
  return body
}

function stateResponse(): StateResponse {
  return { ...state, pro, services, update: updateStatus ?? { currentVersion: VERSION, available: false } }
}

async function runUpdate(task: () => Promise<UpdateStatus>): Promise<UpdateStatus> {
  if (updateTimer) return updateTimer
  updateTimer = task().then((status) => {
    updateStatus = status
    return status
  }).finally(() => {
    updateTimer = undefined
  })
  return updateTimer
}

// The official sample returns plain objects; OneComme serializes them.
function ok(response: unknown) {
  return { code: 200, response }
}
function fail(code: number, message: string) {
  return { code, response: { error: message } }
}

async function handleAction(a: PluginAction) {
  switch (a.action) {
    case 'settings':
      state.settings = normalizeSettings(a.settings)
      break
    case 'reset':
      state.sessions = {}
      state.manualRaids = []
      break
    case 'replay':
      state.replayToken += 1
      break
    case 'addRaid': {
      const name = String(a.name ?? '').trim().slice(0, 100)
      if (!name) return fail(400, 'name is required')
      state.manualRaids.push({
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        at: Date.now(),
        manual: true,
      })
      break
    }
    case 'removeRaid':
      state.manualRaids = state.manualRaids.filter((r) => r.id !== a.id)
      for (const s of Object.values(state.sessions)) s.raids = s.raids.filter((r) => r.id !== a.id)
      break
    case 'checkUpdate':
      return ok(await runUpdate(() => checkForUpdate(VERSION, a.force)))
    case 'installUpdate':
      return ok(await runUpdate(() => installUpdate(VERSION, pluginDir)))
  }
  saveNow()
  return ok(stateResponse())
}

const plugin = {
  name: '片尾滾動名單 Rolling Credit',
  uid: PLUGIN_UID,
  version: VERSION,
  author: 'onecomme-rolling-credit',
  url: `http://localhost:11180/plugins/${PLUGIN_UID}/settings.html`,
  permissions: ['comments', 'systemComment', 'events', 'services'],
  defaultState: { [STATE_KEY]: createDefaultState() },

  init(api: { store: Store; log?: Logger; dir?: unknown; filepath?: unknown }, initialData: { comments?: unknown; services?: unknown; pro?: boolean }) {
    store = api.store
    const dir = typeof api.dir === 'string' ? api.dir : typeof api.filepath === 'string' ? dirname(api.filepath) : ''
    pluginDir = dir || join(__dirname, '..', '..')
    updateStatus = { currentVersion: VERSION, available: false }
    if (api.log) log = api.log
    state = loadState()
    pro = !!initialData?.pro
    setServices(initialData?.services)
    // Backlog that OneComme already holds (dedupe by data.id keeps this safe).
    handleComments(normalizeCommentsPayload(initialData?.comments))
  },

  subscribe(type: string, ...args: unknown[]) {
    switch (type) {
      case 'comments':
        handleComments(normalizeCommentsPayload(args[0]))
        break
      case 'systemComment': {
        const c = args[0] as IncomingComment | undefined
        if (c) handleComments([c])
        break
      }
      case 'events': {
        const e = args[0] as IncomingEvent | undefined
        if (state.settings.debugLog) log.info('[rolling-credit] event', JSON.stringify(e))
        if (e && applyEvent(state, e)) scheduleSave()
        break
      }
      case 'services':
        setServices(args[0])
        break
    }
  },

  async request(req: PluginRequest) {
    try {
      const params = new URLSearchParams(typeof req.url === 'string' ? req.url.split('?')[1] ?? '' : '')
      if (params.get('action') === 'checkUpdate') return ok(await runUpdate(() => checkForUpdate(VERSION, params.get('force') === '1')))
      if (params.get('action') === 'installUpdate') return ok(await runUpdate(() => installUpdate(VERSION, pluginDir)))
      if (req.method === 'GET') {
        return ok(stateResponse())
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = parseBody(req.body) as PluginAction | undefined
        if (!body || typeof body !== 'object' || typeof body.action !== 'string') return fail(400, 'invalid body')
        return await handleAction(body)
      }
      return fail(405, 'method not allowed')
    } catch (e) {
      log.error('[rolling-credit] request failed', e)
      return fail(500, 'internal error')
    }
  },

  destroy() {
    saveNow()
  },
}

module.exports = plugin
