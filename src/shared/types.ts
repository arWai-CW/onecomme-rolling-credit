// Shared data model for plugin.js (Node) and the web pages (overlay / settings).

export const PLUGIN_UID = 'com.onecomme.rolling-credit'

export type SectionKey = 'raids' | 'members' | 'gifts' | 'donations' | 'milestones'

export interface SectionSetting {
  key: SectionKey
  enabled: boolean
  title: string
}

export interface Settings {
  /** Display order + toggle + title of each section */
  sections: SectionSetting[]
  donationSort: 'time' | 'amount'
  showAvatars: boolean
  /** Scroll speed in px per second */
  speed: number
  /** Max total scroll duration in seconds (0 = no limit). Speed goes up when exceeded. */
  maxDuration: number
  /** Seconds to wait before scrolling starts */
  startDelay: number
  /** Seconds to wait after load before anything is shown (use it to match the OBS transition length) */
  preDelay: number
  /** Seconds the ending stays on screen before fading out */
  endHold: number
  /** Fade-out duration in seconds (0 = no fade-out, stays on screen) */
  fadeOut: number
  endTitle: string
  endSubtitle: string
  fontFamily: string
  textColor: string
  accentColor: string
  /** 1 = default size */
  fontScale: number
  /** Background shown behind the credits while playing */
  backgroundType: 'none' | 'color' | 'image'
  /** #rrggbb, used for color backgrounds and behind images */
  backgroundColor: string
  /** URL or path relative to the plugin folder */
  backgroundImage: string
  /** 0..1 opacity of the background layer */
  backgroundOpacity: number
  /** Blur radius in px applied to the background layer */
  backgroundBlur: number
  /** Service (frame) ids that are NOT counted */
  excludedServices: string[]
  /** Only used by PRO users; free users always see the credit line */
  showCredit: boolean
  /** Write raw gift / event payloads to plugin.log */
  debugLog: boolean
}

export interface Person {
  userId: string
  name: string
  profileImage: string
}

export interface MemberEntry extends Person {
  at: number
  kind: 'join' | 'gift'
}

export interface GifterEntry extends Person {
  at: number
  count: number
}

export interface DonationEntry extends Person {
  at: number
  /** currency code (or unit) -> summed amount */
  amounts: Record<string, number>
}

export interface MilestoneEntry extends Person {
  at: number
  detail: string
}

export interface RaidEntry {
  id: string
  name: string
  at: number
  manual?: boolean
}

/** Statistics of one live stream (= one liveId) on one OneComme frame (service). */
export interface Session {
  serviceId: string
  serviceName: string
  liveId: string
  startedAt: number
  updatedAt: number
  members: MemberEntry[]
  gifters: GifterEntry[]
  donations: DonationEntry[]
  milestones: MilestoneEntry[]
  raids: RaidEntry[]
  /** data.id of counted messages, for de-duplication */
  seenIds: string[]
}

export interface PersistedState {
  settings: Settings
  /** serviceId -> session */
  sessions: Record<string, Session>
  manualRaids: RaidEntry[]
  replayToken: number
}

export interface ServiceInfo {
  id: string
  name: string
}

/** Update check result, supplied by the plugin (not persisted) */
export interface UpdateStatus {
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  available: boolean
  checkedAt?: number
  error?: string
  installed?: boolean
}

/** Response of GET ?action=state */
export interface StateResponse extends PersistedState {
  pro: boolean
  services: ServiceInfo[]
  update: UpdateStatus
}

export type PluginAction =
  | { action: 'checkUpdate'; force?: boolean }
  | { action: 'installUpdate' }
  | { action: 'settings'; settings: Settings }
  | { action: 'reset' }
  | { action: 'replay' }
  | { action: 'addRaid'; name: string }
  | { action: 'removeRaid'; id: string }
