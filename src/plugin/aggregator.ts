// Pure aggregation logic: OneComme comment / event payload -> PersistedState.
// No Node / Electron dependency, so it is easy to unit test.

import type {
  DonationEntry,
  GifterEntry,
  MemberEntry,
  PersistedState,
  Person,
  RaidEntry,
  Session,
} from '../shared/types'

const MAX_SEEN_IDS = 3000
/** Sessions not updated for this long are dropped when a new stream starts. */
export const STALE_SESSION_MS = 12 * 60 * 60 * 1000
/** Same raider name within this window = same raid (events + systemComment may both fire). */
const RAID_DEDUPE_MS = 2 * 60 * 1000

/** Minimal shape of the OneComme comment fields this plugin reads. */
export interface IncomingComment {
  /** Frame (service) id */
  id: string
  service: string
  /** Frame (service) name */
  name?: string
  meta?: { isUpdate?: boolean }
  data?: IncomingCommentData
}

export interface IncomingCommentData {
  id?: string
  userId?: string
  liveId?: string
  name?: string
  displayName?: string
  profileImage?: string
  originalProfileImage?: string
  comment?: string
  timestamp?: string | number
  hasGift?: boolean
  giftType?: string
  price?: number
  currency?: string
  unit?: string
  giftCount?: number
  membership?: { primary?: string; sub?: string }
  giftReceivers?: Array<{
    userId?: string
    name?: string
    displayName?: string
    profileImage?: string
    timestamp?: string
  }>
  event?: { kind?: string }
  fromService?: string
}

/** Shape of the `events` payload (EventPayload) */
export interface IncomingEvent {
  id?: string
  timestamp?: string
  service?: { id?: string; name?: string }
  serviceType?: string
  event?: { kind?: string }
  message?: string
  user?: { userId?: string; name?: string }
}

export function normalizeCommentsPayload(payload: unknown): IncomingComment[] {
  if (Array.isArray(payload)) return payload as IncomingComment[]
  const list = (payload as { comments?: unknown } | null)?.comments
  return Array.isArray(list) ? (list as IncomingComment[]) : []
}

function toTime(ts: unknown, fallback: number): number {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  if (typeof ts === 'string' && ts) {
    const n = Number(ts)
    if (Number.isFinite(n)) return n
    const d = Date.parse(ts)
    if (Number.isFinite(d)) return d
  }
  return fallback
}

function personOf(d: {
  userId?: string
  name?: string
  displayName?: string
  profileImage?: string
  originalProfileImage?: string
}): Person {
  const name = d.displayName || d.name || ''
  return {
    userId: d.userId || name,
    name,
    profileImage: d.originalProfileImage || d.profileImage || '',
  }
}

function newSession(serviceId: string, serviceName: string, liveId: string, now: number): Session {
  return {
    serviceId,
    serviceName,
    liveId,
    startedAt: now,
    updatedAt: now,
    members: [],
    gifters: [],
    donations: [],
    milestones: [],
    raids: [],
    seenIds: [],
  }
}

/**
 * Get the session of a frame for this liveId. A different non-empty liveId
 * means a new stream: the old session of that frame is replaced and stale
 * sessions of other frames are dropped.
 */
export function ensureSession(
  state: PersistedState,
  serviceId: string,
  serviceName: string,
  liveId: string,
  now: number,
): Session {
  const current = state.sessions[serviceId]
  if (current) {
    if (!liveId || !current.liveId || current.liveId === liveId) {
      if (!current.liveId && liveId) current.liveId = liveId
      if (serviceName) current.serviceName = serviceName
      return current
    }
  }
  // New stream on this frame: drop it and other stale frames.
  delete state.sessions[serviceId]
  for (const [id, s] of Object.entries(state.sessions)) {
    if (now - s.updatedAt > STALE_SESSION_MS) delete state.sessions[id]
  }
  // No other frame of the current stream remains: manual raids belong to the old stream.
  if (Object.keys(state.sessions).length === 0) state.manualRaids = []
  const s = newSession(serviceId, serviceName || current?.serviceName || '', liveId, now)
  state.sessions[serviceId] = s
  return s
}

function markSeen(session: Session, id: string | undefined): boolean {
  if (!id) return true
  if (session.seenIds.includes(id)) return false
  session.seenIds.push(id)
  if (session.seenIds.length > MAX_SEEN_IDS) session.seenIds.splice(0, session.seenIds.length - MAX_SEEN_IDS)
  return true
}

function addMember(session: Session, p: Person, at: number, kind: MemberEntry['kind']): void {
  if (!p.name) return
  if (session.members.some((m) => m.userId === p.userId)) return
  session.members.push({ ...p, at, kind })
}

function addGifter(session: Session, p: Person, at: number, count: number): void {
  const existing = session.gifters.find((g) => g.userId === p.userId)
  if (existing) {
    existing.count += count
    existing.name = p.name || existing.name
    existing.profileImage = p.profileImage || existing.profileImage
    return
  }
  const entry: GifterEntry = { ...p, at, count }
  session.gifters.push(entry)
}

function addDonation(session: Session, p: Person, at: number, currency: string, amount: number): void {
  let entry = session.donations.find((d) => d.userId === p.userId)
  if (!entry) {
    entry = { ...p, at, amounts: {} } satisfies DonationEntry
    session.donations.push(entry)
  } else {
    entry.name = p.name || entry.name
    entry.profileImage = p.profileImage || entry.profileImage
  }
  const prev = entry.amounts[currency] ?? 0
  entry.amounts[currency] = Math.round((prev + amount) * 100) / 100
}

function addRaid(session: Session, raid: RaidEntry): boolean {
  if (session.raids.some((r) => r.id === raid.id)) return false
  if (session.raids.some((r) => r.name === raid.name && Math.abs(r.at - raid.at) < RAID_DEDUPE_MS)) return false
  session.raids.push(raid)
  return true
}

function isYouTubeComment(c: IncomingComment): boolean {
  return c.service === 'youtube' || c.data?.fromService === 'youtube'
}

/**
 * How many memberships one 'sponsorgift' message gave. `giftCount` is set by
 * recent わんコメ versions; older ones only list receivers or put "gifted N"
 * in the comment text.
 */
function sponsorgiftCount(d: IncomingCommentData): number {
  const n = Number(d.giftCount)
  if (Number.isFinite(n) && n > 0) return n
  const receivers = d.giftReceivers?.length ?? 0
  if (receivers > 0) return receivers
  // 実測ペイロード: わんコメは贈送数を price に入れ、unit/paidText は空のまま。
  // currency/unit が空のときだけ個数として使う（金額と誤用しないため）。
  const price = Number(d.price)
  if (!d.currency && !d.unit && Number.isInteger(price) && price > 0) return price
  // shortcut: locale-specific comment text is the last resort when none of the
  // structured fields carry the count; covers zh「N 個」/ ja「N件」/ en "gifted N".
  const m = /gifted\s+(\d+)/i.exec(d.comment ?? '') ?? /(\d+)\s*[個件份名]/.exec(d.comment ?? '')
  return m ? Number(m[1]) : 1
}

/**
 * Apply one comment. Returns true when the state changed.
 */
export function applyComment(state: PersistedState, c: IncomingComment, now = Date.now()): boolean {
  if (!c || !c.data || !isYouTubeComment(c)) return false
  if (c.meta?.isUpdate) return false
  const d = c.data
  const isRedirect = d.event?.kind === 'redirect'
  if (!isRedirect && !d.giftType) return false
  if (d.giftType === 'jewel') return false // jewels are not money; not part of the credits

  const serviceId = c.id || 'unknown'
  const session = ensureSession(state, serviceId, c.name ?? '', d.liveId ?? '', now)
  if (!markSeen(session, d.id)) return false

  const at = toTime(d.timestamp, now)
  const person = personOf(d)
  session.updatedAt = now

  if (isRedirect) {
    const name = person.name || d.comment || '?'
    return addRaid(session, { id: d.id || `raid-${at}-${name}`, name, at })
  }

  switch (d.giftType) {
    case 'superchat':
    case 'supersticker': {
      if (typeof d.price !== 'number' || !Number.isFinite(d.price)) return true
      addDonation(session, person, at, d.currency || d.unit || '', d.price)
      return true
    }
    case 'subscribe':
      addMember(session, person, at, 'join')
      return true
    case 'giftreceived':
      addMember(session, person, at, 'gift')
      return true
    case 'sponsorgift': {
      const count = sponsorgiftCount(d)
      addGifter(session, person, at, count)
      for (const r of d.giftReceivers ?? []) {
        addMember(session, personOf(r), toTime(r.timestamp, at), 'gift')
      }
      return true
    }
    case 'milestonechat': {
      const detail = [d.membership?.primary, d.membership?.sub].filter(Boolean).join(' ')
      if (!session.milestones.some((m) => m.userId === person.userId)) {
        session.milestones.push({ ...person, at, detail })
      }
      return true
    }
    default:
      return true
  }
}

/** Apply an `events` payload (YouTube redirect = raid). */
export function applyEvent(state: PersistedState, e: IncomingEvent, now = Date.now()): boolean {
  if (!e || e.serviceType !== 'youtube' || e.event?.kind !== 'redirect') return false
  const serviceId = e.service?.id || 'unknown'
  const session = ensureSession(state, serviceId, e.service?.name ?? '', '', now)
  const at = toTime(e.timestamp, now)
  const name = e.user?.name || e.message || '?'
  const changed = addRaid(session, { id: e.id || `raid-${at}-${name}`, name, at })
  if (changed) session.updatedAt = now
  return changed
}
