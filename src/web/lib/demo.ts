// Fake data for preview (overlay ?demo=1 and settings preview).

import { createDefaultState } from '../../shared/defaults'
import type { PersistedState, Session, Settings } from '../../shared/types'

const NAMES = [
  '星野ミライ', 'Kuro Neko', '小熊軟糖', 'Taro Yamada', '夜空のしずく', 'PixelFox',
  '阿明', 'Luna Ch.', 'ぽてと', 'StreamLover42', '雪見大福', 'Mochi', '咖啡不加糖',
  'Ryu', 'さくらもち', 'Night Owl', '貓貓蟲', 'Aki',
]

function avatar(i: number): string {
  const hue = (i * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue},60%,55%)"/><circle cx="32" cy="26" r="12" fill="#fff" opacity=".85"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#fff" opacity=".85"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function demoState(settings?: Settings): PersistedState {
  const state = createDefaultState()
  if (settings) state.settings = settings
  const t0 = Date.now() - 3 * 60 * 60 * 1000
  const p = (i: number) => ({ userId: `u${i}`, name: NAMES[i % NAMES.length]!, profileImage: avatar(i) })
  const session: Session = {
    serviceId: 'demo',
    serviceName: 'Demo',
    liveId: 'demo',
    startedAt: t0,
    updatedAt: Date.now(),
    raids: [{ id: 'r1', name: 'Kuro Neko Ch.', at: t0 + 1000 }],
    members: [0, 1, 2, 3, 4, 5].map((i) => ({ ...p(i), at: t0 + i * 1000, kind: i > 3 ? 'gift' : 'join' })),
    gifters: [{ ...p(6), at: t0 + 5000, count: 5 }],
    donations: [
      { ...p(7), at: t0 + 100, amounts: { JPY: 10000 } },
      { ...p(8), at: t0 + 200, amounts: { TWD: 150, USD: 5 } },
      { ...p(9), at: t0 + 300, amounts: { USD: 19.99 } },
      { ...p(10), at: t0 + 400, amounts: { JPY: 500 } },
      { ...p(11), at: t0 + 500, amounts: { HKD: 78 } },
      { ...p(12), at: t0 + 600, amounts: { TWD: 1000 } },
    ],
    milestones: [
      { ...p(13), at: t0 + 700, detail: '12 個月' },
      { ...p(14), at: t0 + 800, detail: '3 個月' },
    ],
    seenIds: [],
  }
  state.sessions = { demo: session }
  state.manualRaids = [{ id: 'm1', name: 'さくらもち Ch.', at: t0 + 2000, manual: true }]
  return state
}
