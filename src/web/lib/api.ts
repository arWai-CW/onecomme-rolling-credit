import { PLUGIN_UID, type PluginAction, type StateResponse, type UpdateStatus } from '../../shared/types'

// Relative to the page (served from localhost:11180/plugins/<uid>/) when possible,
// absolute for the Vite dev server.
const ORIGIN = location.port === '11180' ? location.origin : 'http://localhost:11180'
const ENDPOINT = `${ORIGIN}/api/plugins/${PLUGIN_UID}`

/** OneComme wraps plugin responses as {code, response}; HTTP status may always be 200. */
async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { code?: number; response?: unknown }
  let payload = body?.response
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      // keep string
    }
  }
  const code = typeof body?.code === 'number' ? body.code : res.status
  if (!res.ok || code >= 400) {
    const msg = (payload as { error?: string } | undefined)?.error ?? `HTTP ${code}`
    throw new Error(msg)
  }
  return payload as T
}

export async function fetchState(): Promise<StateResponse> {
  return unwrap<StateResponse>(await fetch(ENDPOINT, { cache: 'no-store' }))
}

export async function fetchUpdate(params: { force?: boolean } = {}): Promise<UpdateStatus> {
  const query = new URLSearchParams({ action: 'checkUpdate' })
  if (params.force) query.set('force', '1')
  const res = await fetch(`${ENDPOINT}?${query}`, { cache: 'no-store' })
  const body = (await res.json()) as { code?: number; response?: unknown }
  return (body.response ?? {}) as UpdateStatus
}

export async function installUpdate(): Promise<UpdateStatus> {
  const res = await fetch(`${ENDPOINT}?action=installUpdate`, { method: 'POST' })
  const body = (await res.json()) as { code?: number; response?: unknown }
  return (body.response ?? {}) as UpdateStatus
}

export async function postAction(action: PluginAction): Promise<StateResponse> {
  return unwrap<StateResponse>(
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }),
  )
}
