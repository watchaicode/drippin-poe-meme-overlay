export type Game = 'poe1' | 'poe2'

export type ReminderKind =
  | 'gem'
  | 'flask'
  | 'vendor'
  | 'item'
  | 'passive'
  | 'boss'
  | 'general'

export interface Reminder {
  text: string
  fromLevel?: number
  toLevel?: number
  kind?: ReminderKind
  // Optional clickable link. Opened in the user's default browser via shell.openExternal.
  url?: string
  // When true, render with star prefix + amber accent (same as Permanent Buff).
  highlight?: boolean
}

export interface ZoneStep {
  zone: string
  act?: number
  notes?: string[]
  reminders?: Reminder[]
  // Image filenames (no path prefix). Resolved to URLs by the renderer.
  layoutImages?: string[]
}

// Generic, build-agnostic template — what's true for any character running
// this campaign. Owned by the route author / game data source.
export interface Route {
  game: Game
  routeId: string
  name: string
  steps: ZoneStep[]
}

// Build-specific overlay sitting on top of a Route. Friend-authorable.
// At lookup time, zoneReminders[zone] is prepended to the route's zone
// reminders so build advice appears first.
export interface Build {
  buildId: string
  name: string
  game: Game
  routeId: string
  vendorRegex?: string
  // Always-visible reminders (level-filtered) — gem progression, weapon
  // breakpoints, build-wide tips.
  buildReminders?: Reminder[]
  // Per-zone build advice keyed by zone name (must match Route's zone names).
  zoneReminders?: Record<string, Reminder[]>
}

// User-authored additions on top of a Build. Stored on disk per-build.

export type CustomScope =
  | { type: 'zone'; zone: string }
  | { type: 'build' }

export interface CustomAddition {
  id: string
  scope: CustomScope
  text: string
  kind?: ReminderKind
  fromLevel?: number
  toLevel?: number
  url?: string
  highlight?: boolean
}

export interface Customizations {
  buildId: string
  version: 1
  additions: CustomAddition[]
}
