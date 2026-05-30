import poe2Campaign from './routes/poe2-campaign.json'
import mercGrenades from './builds/poe2-mercenary-grenades.json'
import type { Build, Game, Reminder, Route, ZoneStep } from './types'

const ROUTES: Record<string, Route> = {
  'poe2-campaign-v0.5': poe2Campaign as Route
}

// Builds compiled into the app. Disk-loaded builds are merged on top in App.
export const BUILTIN_BUILDS: Build[] = [mercGrenades as Build]

export function routeOf(build: Build): Route | null {
  return ROUTES[build.routeId] ?? null
}

export function defaultBuild(builds: Build[], game: Game): Build | null {
  return builds.find((b) => b.game === game) ?? null
}

export function findBuild(builds: Build[], buildId: string): Build | null {
  return builds.find((b) => b.buildId === buildId) ?? null
}

// Look up a zone step for the active build. Merges the build's per-zone
// reminders (prepended) with the route's generic reminders. Customizations
// are handled separately by the renderer so they can be edited in place.
export function findStep(
  build: Build | null,
  zone: string
): { build: Build; step: ZoneStep } | null {
  if (!build) return null
  const route = routeOf(build)
  if (!route) return null
  const target = zone.toLowerCase()
  const baseStep = route.steps.find((s) => s.zone.toLowerCase() === target)
  if (!baseStep) return null

  const buildZoneReminders = build.zoneReminders?.[baseStep.zone] ?? []
  const baseReminders = baseStep.reminders ?? []
  const merged: ZoneStep = {
    ...baseStep,
    reminders:
      buildZoneReminders.length > 0
        ? [...buildZoneReminders, ...baseReminders]
        : baseReminders
  }
  return { build, step: merged }
}

function passesLevel(r: Reminder, level: number | null): boolean {
  if (r.fromLevel != null && (level ?? 0) < r.fromLevel) return false
  if (r.toLevel != null && (level ?? Infinity) > r.toLevel) return false
  return true
}

export function visibleReminders(step: ZoneStep, level: number | null): Reminder[] {
  if (!step.reminders) return []
  return step.reminders.filter((r) => passesLevel(r, level))
}

export function visibleBuildReminders(
  build: Build | null,
  level: number | null
): Reminder[] {
  if (!build?.buildReminders) return []
  return build.buildReminders.filter((r) => passesLevel(r, level))
}

export function reminderPassesLevel(r: Reminder, level: number | null): boolean {
  return passesLevel(r, level)
}

// Sorted zone names from the route (useful for the editor's zone dropdown).
export function listZones(build: Build): { zone: string; act?: number }[] {
  const r = routeOf(build)
  if (!r) return []
  return r.steps.map((s) => ({ zone: s.zone, act: s.act }))
}

export type {
  Build,
  CustomAddition,
  Customizations,
  CustomScope,
  Game,
  Reminder,
  ReminderKind,
  Route,
  ZoneStep
} from './types'
