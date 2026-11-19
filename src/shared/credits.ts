// Build the display model of the rolling credits from the persisted state.
// Used by the overlay and the settings preview.

import type { PersistedState, SectionKey, Session, Settings } from './types'

export interface CreditRow {
  key: string
  name: string
  profileImage?: string
  /** Right / secondary text, e.g. "¥1,500 + US$5.00" or "×5" */
  detail?: string
}

export interface CreditSection {
  key: SectionKey
  title: string
  rows: CreditRow[]
}

/**
 * Approximate JPY value of 1 unit of each currency. Only used to SORT
 * donations by amount; never displayed.
 */
export const JPY_RATES: Record<string, number> = {
  JPY: 1, USD: 150, TWD: 4.7, HKD: 19, CNY: 21, KRW: 0.11, EUR: 162, GBP: 190,
  AUD: 98, CAD: 110, NZD: 90, SGD: 112, MYR: 33, THB: 4.2, PHP: 2.6, IDR: 0.0095,
  VND: 0.006, INR: 1.8, CHF: 170, SEK: 14, NOK: 14, DKK: 22, PLN: 38, CZK: 6.5,
  HUF: 0.42, RUB: 1.6, BRL: 28, MXN: 8, ARS: 0.15, CLP: 0.16, COP: 0.037, PEN: 40,
  ZAR: 8.2, TRY: 4.5, ILS: 41, SAR: 40, AED: 41, QAR: 41, EGP: 3, NGN: 0.1,
}

const UNIT_ALIASES: Record<string, string> = {
  '¥': 'JPY', '￥': 'JPY', '円': 'JPY', '$': 'USD', 'US$': 'USD', 'NT$': 'TWD',
  'HK$': 'HKD', 'CA$': 'CAD', 'A$': 'AUD', 'NZ$': 'NZD', 'SGD': 'SGD', '₩': 'KRW',
  '€': 'EUR', '£': 'GBP', '₱': 'PHP', '₹': 'INR', 'R$': 'BRL', 'MX$': 'MXN',
}

export function currencyCode(raw: string): string {
  const t = raw.trim()
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase()
  return UNIT_ALIASES[t] ?? t
}

export function toJpy(amounts: Record<string, number>): number {
  let total = 0
  for (const [cur, v] of Object.entries(amounts)) total += v * (JPY_RATES[currencyCode(cur)] ?? 1)
  return total
}

// en-US gives unambiguous symbols: NT$ / HK$ / CA$ / ¥ / $ (USD).
export function formatAmount(currency: string, amount: number, locale = 'en-US'): string {
  const code = currencyCode(currency)
  const whole = Number.isInteger(amount)
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
      }).format(amount)
    } catch {
      // unknown ISO code -> fall through
    }
  }
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)
  return currency ? `${currency}${num}` : num
}

export function formatAmounts(amounts: Record<string, number>): string {
  return Object.entries(amounts)
    .map(([cur, v]) => formatAmount(cur, v))
    .join(' + ')
}

/** Sessions that count, i.e. frames not excluded in the settings. */
export function activeSessions(state: PersistedState): Session[] {
  const excluded = new Set(state.settings.excludedServices)
  return Object.values(state.sessions).filter((s) => !excluded.has(s.serviceId))
}

/** Merge the same person across several frames into one row. */
function mergeBy<T extends { userId: string; at: number }>(items: T[], merge: (a: T, b: T) => void): T[] {
  const map = new Map<string, T>()
  for (const it of [...items].sort((a, b) => a.at - b.at)) {
    const prev = map.get(it.userId)
    if (prev) merge(prev, it)
    else map.set(it.userId, { ...it })
  }
  return [...map.values()]
}

export function buildCredits(state: PersistedState): CreditSection[] {
  const settings: Settings = state.settings
  const sessions = activeSessions(state)
  const showAvatar = settings.showAvatars
  const img = (url?: string) => (showAvatar && url ? url : undefined)

  const rowsFor = (key: SectionKey): CreditRow[] => {
    switch (key) {
      case 'raids': {
        const raids = [...sessions.flatMap((s) => s.raids), ...state.manualRaids].sort((a, b) => a.at - b.at)
        return raids.map((r) => ({ key: r.id, name: r.name }))
      }
      case 'members': {
        const list = mergeBy(sessions.flatMap((s) => s.members), () => {})
        return list.map((m) => ({ key: m.userId, name: m.name, profileImage: img(m.profileImage) }))
      }
      case 'gifts': {
        const list = mergeBy(sessions.flatMap((s) => s.gifters), (a, b) => {
          a.count += b.count
        })
        return list.map((g) => ({
          key: g.userId,
          name: g.name,
          profileImage: img(g.profileImage),
          detail: `×${g.count}`,
        }))
      }
      case 'donations': {
        let list = mergeBy(
          sessions.flatMap((s) => s.donations).map((d) => ({ ...d, amounts: { ...d.amounts } })),
          (a, b) => {
            for (const [cur, v] of Object.entries(b.amounts)) {
              a.amounts[cur] = Math.round(((a.amounts[cur] ?? 0) + v) * 100) / 100
            }
          },
        )
        if (settings.donationSort === 'amount') {
          list = list.sort((a, b) => toJpy(b.amounts) - toJpy(a.amounts) || a.at - b.at)
        }
        return list.map((d) => ({
          key: d.userId,
          name: d.name,
          profileImage: img(d.profileImage),
          detail: formatAmounts(d.amounts),
        }))
      }
      case 'milestones': {
        const list = mergeBy(sessions.flatMap((s) => s.milestones), () => {})
        return list.map((m) => ({
          key: m.userId,
          name: m.name,
          profileImage: img(m.profileImage),
          detail: m.detail || undefined,
        }))
      }
    }
  }

  return settings.sections
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, title: s.title, rows: rowsFor(s.key) }))
    .filter((s) => s.rows.length > 0)
}

export interface ScrollTimeline {
  /** Seconds for the list to leave the screen */
  track: number
  /** Seconds for the ending to reach the center */
  ending: number
  /** Seconds until both are done (= the hold starts) */
  total: number
}

/**
 * Scroll times for the list and the ending at the same speed. When the total
 * would exceed `maxDuration`, the speed goes up so the total equals it.
 */
export function scrollTimeline(
  trackDistance: number,
  endingDistance: number,
  settings: Pick<Settings, 'speed' | 'maxDuration'>,
): ScrollTimeline {
  let speed = Math.max(1, settings.speed)
  const longest = Math.max(trackDistance, endingDistance, 0)
  if (settings.maxDuration > 0 && longest / speed > settings.maxDuration) {
    speed = longest / settings.maxDuration
  }
  const track = Math.max(0, trackDistance) / speed
  const ending = Math.max(0, endingDistance) / speed
  return { track, ending, total: Math.max(track, ending) }
}
