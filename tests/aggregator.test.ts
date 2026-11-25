import { describe, expect, it } from 'vitest'
import { applyComment, applyEvent, normalizeCommentsPayload, type IncomingComment } from '../src/plugin/aggregator'
import { buildCredits, formatAmounts, scrollTimeline } from '../src/shared/credits'
import { createDefaultState, normalizeSettings } from '../src/shared/defaults'

let seq = 0
function yt(data: IncomingComment['data'], extra: Partial<IncomingComment> = {}): IncomingComment {
  seq += 1
  return {
    id: 'frame1',
    service: 'youtube',
    name: 'My Channel',
    data: { id: `msg${seq}`, liveId: 'live1', userId: 'u1', name: 'Alice', profileImage: 'a.png', ...data },
    ...extra,
  }
}

describe('applyComment', () => {
  it('ignores normal chat and other platforms', () => {
    const s = createDefaultState()
    expect(applyComment(s, yt({ comment: 'hi' }))).toBe(false)
    expect(applyComment(s, { ...yt({ giftType: 'superchat', price: 100, currency: 'JPY' }), service: 'twitch' })).toBe(false)
    expect(Object.keys(s.sessions)).toHaveLength(0)
  })

  it('merges super chats per person and per currency', () => {
    const s = createDefaultState()
    applyComment(s, yt({ giftType: 'superchat', price: 1000, currency: 'JPY' }))
    applyComment(s, yt({ giftType: 'supersticker', price: 500, currency: 'JPY' }))
    applyComment(s, yt({ giftType: 'superchat', price: 5, currency: 'USD' }))
    const d = s.sessions.frame1!.donations
    expect(d).toHaveLength(1)
    expect(d[0]!.amounts).toEqual({ JPY: 1500, USD: 5 })
  })

  it('skips isUpdate and duplicated data.id', () => {
    const s = createDefaultState()
    const c = yt({ giftType: 'superchat', price: 100, currency: 'JPY' })
    applyComment(s, c)
    applyComment(s, c)
    applyComment(s, { ...yt({ giftType: 'superchat', price: 100, currency: 'JPY' }), meta: { isUpdate: true } })
    expect(s.sessions.frame1!.donations[0]!.amounts.JPY).toBe(100)
  })

  it('collects members, gift receivers, gifters and milestones', () => {
    const s = createDefaultState()
    applyComment(s, yt({ giftType: 'subscribe', userId: 'm1', name: 'M1' }))
    applyComment(s, yt({ giftType: 'giftreceived', userId: 'm2', name: 'M2' }))
    applyComment(s, yt({
      giftType: 'sponsorgift', userId: 'g1', name: 'G1', giftCount: 5,
      giftReceivers: [{ userId: 'm2', name: 'M2' }, { userId: 'm3', name: 'M3' }],
    }))
    applyComment(s, yt({ giftType: 'milestonechat', userId: 'x', name: 'X', membership: { primary: 'Member', sub: '12 months' } }))
    const ss = s.sessions.frame1!
    expect(ss.members.map((m) => m.userId)).toEqual(['m1', 'm2', 'm3'])
    expect(ss.gifters).toEqual([expect.objectContaining({ userId: 'g1', count: 5 })])
    expect(ss.milestones[0]!.detail).toBe('Member 12 months')
  })

  it('derives the gift count when giftCount is missing', () => {
    const s = createDefaultState()
    applyComment(s, yt({
      giftType: 'sponsorgift', userId: 'g1', name: 'G1',
      giftReceivers: [{ userId: 'm1' }, { userId: 'm2' }, { userId: 'm3' }],
    }))
    applyComment(s, yt({ giftType: 'sponsorgift', userId: 'g2', name: 'G2', comment: 'gifted 5 memberships' }))
    applyComment(s, yt({ giftType: 'sponsorgift', userId: 'g3', name: 'G3' }))
    applyComment(s, yt({ giftType: 'sponsorgift', userId: 'g4', name: 'G4', comment: '贈送了 5 個「✨【黛比】」會籍' }))
    // Real わんコメ payload: count is in `price` with empty unit, no giftCount/giftReceivers.
    applyComment(s, yt({ giftType: 'sponsorgift', userId: 'g5', name: 'G5', price: 10, unit: '', comment: '<div>會籍贈送</div>' }))
    const g = s.sessions.frame1!.gifters
    expect(g.map((x) => [x.userId, x.count])).toEqual([['g1', 3], ['g2', 5], ['g3', 1], ['g4', 5], ['g5', 10]])
  })

  it('resets the frame when a new liveId arrives', () => {
    const s = createDefaultState()
    s.manualRaids.push({ id: 'm', name: 'Old', at: 0, manual: true })
    applyComment(s, yt({ giftType: 'subscribe' }))
    applyComment(s, yt({ giftType: 'subscribe', liveId: 'live2', userId: 'u2', name: 'Bob' }))
    expect(s.sessions.frame1!.liveId).toBe('live2')
    expect(s.sessions.frame1!.members.map((m) => m.name)).toEqual(['Bob'])
    expect(s.manualRaids).toEqual([])
  })

  it('records redirect (raid) from comments and events, without duplicates', () => {
    const s = createDefaultState()
    applyComment(s, yt({ event: { kind: 'redirect' }, name: 'Raider', comment: 'Raider and 120 viewers' }))
    applyEvent(s, { serviceType: 'youtube', service: { id: 'frame1' }, event: { kind: 'redirect' }, user: { userId: 'r', name: 'Raider' }, message: '' })
    expect(s.sessions.frame1!.raids).toHaveLength(1)
    expect(buildCredits(s).find((c) => c.key === 'raids')).toBeUndefined() // disabled by default
    s.settings.sections.find((x) => x.key === 'raids')!.enabled = true
    const raids = buildCredits(s).find((c) => c.key === 'raids')!
    expect(raids.title).toBe('感謝降落')
    expect(raids.rows).toEqual([{ key: expect.any(String), name: 'Raider' }])
  })
})

describe('helpers', () => {
  it('normalizes both comments payload shapes', () => {
    expect(normalizeCommentsPayload([1])).toEqual([1])
    expect(normalizeCommentsPayload({ comments: [2] })).toEqual([2])
    expect(normalizeCommentsPayload(null)).toEqual([])
  })

  it('scrollTimeline: same speed for list and ending, capped by maxDuration', () => {
    expect(scrollTimeline(3000, 3600, { speed: 150, maxDuration: 0 })).toEqual({ track: 20, ending: 24, total: 24 })
    const capped = scrollTimeline(3000, 6000, { speed: 150, maxDuration: 20 })
    expect(capped.total).toBe(20)
    expect(capped.track).toBe(10)
  })

  it('replaces the old default raid title, keeps custom titles', () => {
    const a = normalizeSettings({ sections: [{ key: 'raids', enabled: true, title: '感謝 Raid' }] as never })
    expect(a.sections.find((x) => x.key === 'raids')!.title).toBe('感謝降落')
    const b = normalizeSettings({ sections: [{ key: 'raids', enabled: true, title: '自訂' }] as never })
    expect(b.sections.find((x) => x.key === 'raids')!.title).toBe('自訂')
    expect(normalizeSettings(undefined).speed).toBe(150)
    expect(normalizeSettings(undefined).preDelay).toBe(0)
    expect(normalizeSettings({ preDelay: 99 } as never).preDelay).toBe(60)
  })

  it('formats amounts in their own currency', () => {
    const text = formatAmounts({ JPY: 1500, USD: 5.5, TWD: 150 })
    expect(text).toBe('¥1,500 + $5.50 + NT$150')
  })

  it('normalizeSettings keeps every section once', () => {
    const st = normalizeSettings({ sections: [{ key: 'donations', enabled: false, title: 'SC' }, { key: 'donations', enabled: true, title: 'dup' }] as never })
    expect(st.sections.map((x) => x.key)).toEqual(['donations', 'raids', 'members', 'gifts', 'milestones'])
    expect(st.sections[0]).toEqual({ key: 'donations', enabled: false, title: 'SC' })
  })
})

describe('buildCredits', () => {
  it('hides empty / disabled sections, excludes frames, sorts by amount', () => {
    const s = createDefaultState()
    applyComment(s, yt({ giftType: 'superchat', price: 100, currency: 'JPY', userId: 'a', name: 'A' }))
    applyComment(s, yt({ giftType: 'superchat', price: 10, currency: 'USD', userId: 'b', name: 'B' }))
    applyComment(s, { ...yt({ giftType: 'subscribe', userId: 'c', name: 'C', liveId: 'other' }), id: 'frame2' })

    let credits = buildCredits(s)
    expect(credits.map((c) => c.key)).toEqual(['members', 'donations'])
    expect(credits[1]!.rows.map((r) => r.name)).toEqual(['A', 'B'])

    s.settings.donationSort = 'amount'
    s.settings.excludedServices = ['frame2']
    credits = buildCredits(s)
    expect(credits.map((c) => c.key)).toEqual(['donations'])
    expect(credits[0]!.rows.map((r) => r.name)).toEqual(['B', 'A'])
  })

  it('merges the same person across frames without mutating state', () => {
    const s = createDefaultState()
    applyComment(s, yt({ giftType: 'superchat', price: 100, currency: 'JPY', userId: 'a', name: 'A' }))
    applyComment(s, { ...yt({ giftType: 'superchat', price: 50, currency: 'JPY', userId: 'a', name: 'A', liveId: 'x' }), id: 'frame2' })
    expect(buildCredits(s)[0]!.rows[0]!.detail).toContain('150')
    expect(s.sessions.frame1!.donations[0]!.amounts.JPY).toBe(100)
  })
})
