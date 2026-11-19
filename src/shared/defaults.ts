import type { PersistedState, SectionKey, SectionSetting, Settings } from './types'

export const SECTION_DEFAULT_TITLES: Record<SectionKey, string> = {
  raids: '感謝降落',
  members: '歡迎新會員',
  gifts: '感謝贈送會員',
  donations: '感謝 Super Chat',
  milestones: '會員里程碑',
}

/** Default titles of older versions, replaced by the current default on load. */
const LEGACY_DEFAULT_TITLES: Partial<Record<SectionKey, string>> = {
  raids: '感謝 Raid',
}

export const DEFAULT_SECTIONS: SectionSetting[] = [
  { key: 'raids', enabled: false, title: SECTION_DEFAULT_TITLES.raids },
  { key: 'members', enabled: true, title: SECTION_DEFAULT_TITLES.members },
  { key: 'gifts', enabled: true, title: SECTION_DEFAULT_TITLES.gifts },
  { key: 'donations', enabled: true, title: SECTION_DEFAULT_TITLES.donations },
  { key: 'milestones', enabled: true, title: SECTION_DEFAULT_TITLES.milestones },
]

export const DEFAULT_SETTINGS: Settings = {
  sections: DEFAULT_SECTIONS,
  donationSort: 'time',
  showAvatars: true,
  speed: 150,
  maxDuration: 120,
  startDelay: 1,
  preDelay: 0,
  endHold: 5,
  fadeOut: 2,
  endTitle: '感謝收看',
  endSubtitle: 'See you next stream!',
  fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
  textColor: '#ffffff',
  accentColor: '#ffd36e',
  fontScale: 1,
  backgroundType: 'none',
  backgroundColor: '#000000',
  backgroundImage: '',
  backgroundOpacity: 0.6,
  backgroundBlur: 12,
  excludedServices: [],
  showCredit: true,
  debugLog: false,
}

export function createDefaultState(): PersistedState {
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    sessions: {},
    manualRaids: [],
    replayToken: 0,
  }
}

/**
 * Fill missing keys from defaults (older saved data / partial input) and keep
 * every section key exactly once.
 */
export function normalizeSettings(input: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...structuredClone(DEFAULT_SETTINGS), ...(input ?? {}) }
  const seen = new Set<SectionKey>()
  const sections: SectionSetting[] = []
  for (const s of Array.isArray(input?.sections) ? input.sections : []) {
    const def = DEFAULT_SECTIONS.find((d) => d.key === s?.key)
    if (!def || seen.has(def.key)) continue
    seen.add(def.key)
    let title = typeof s.title === 'string' ? s.title : def.title
    // Saved data from older versions still has the old default title.
    if (title === LEGACY_DEFAULT_TITLES[def.key]) title = def.title
    sections.push({
      key: def.key,
      enabled: typeof s.enabled === 'boolean' ? s.enabled : def.enabled,
      title,
    })
  }
  for (const def of DEFAULT_SECTIONS) {
    if (!seen.has(def.key)) sections.push({ ...def })
  }
  merged.sections = sections
  merged.excludedServices = Array.isArray(merged.excludedServices)
    ? merged.excludedServices.filter((x) => typeof x === 'string')
    : []
  merged.speed = clampNumber(merged.speed, 5, 2000, DEFAULT_SETTINGS.speed)
  merged.maxDuration = clampNumber(merged.maxDuration, 0, 3600, DEFAULT_SETTINGS.maxDuration)
  merged.startDelay = clampNumber(merged.startDelay, 0, 60, DEFAULT_SETTINGS.startDelay)
  merged.preDelay = clampNumber(merged.preDelay, 0, 60, DEFAULT_SETTINGS.preDelay)
  merged.endHold = clampNumber(merged.endHold, 0, 600, DEFAULT_SETTINGS.endHold)
  merged.fadeOut = clampNumber(merged.fadeOut, 0, 60, DEFAULT_SETTINGS.fadeOut)
  merged.fontScale = clampNumber(merged.fontScale, 0.3, 4, DEFAULT_SETTINGS.fontScale)
  if (merged.donationSort !== 'amount') merged.donationSort = 'time'
  if (!['none', 'color', 'image'].includes(merged.backgroundType)) merged.backgroundType = 'none'
  merged.backgroundColor = /^#[0-9a-f]{6}$/i.test(merged.backgroundColor)
    ? merged.backgroundColor
    : DEFAULT_SETTINGS.backgroundColor
  merged.backgroundImage =
    typeof merged.backgroundImage === 'string'
      ? merged.backgroundImage.replace(/[\u0000-\u001F]/g, '').trim().slice(0, 2000)
      : ''
  merged.backgroundOpacity = clampNumber(merged.backgroundOpacity, 0, 1, DEFAULT_SETTINGS.backgroundOpacity)
  merged.backgroundBlur = clampNumber(merged.backgroundBlur, 0, 40, DEFAULT_SETTINGS.backgroundBlur)
  return merged
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
