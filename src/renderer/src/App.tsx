import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUILTIN_BUILDS,
  defaultBuild,
  findStep,
  listZones,
  reminderPassesLevel,
  visibleBuildReminders,
  visibleReminders
} from './content'
import type {
  Build,
  CustomAddition,
  Game,
  Reminder,
  ReminderKind
} from './content/types'
import { useCustomizations } from './useCustomizations'
import Editor from './Editor'

interface DetectedClient {
  path: string
  game: Game
}

type ClientEvent =
  | { type: 'zone'; zone: string; raw: string }
  | { type: 'level'; character: string; charClass: string; level: number; raw: string }
  | { type: 'login'; raw: string }

declare global {
  interface Window {
    overlay: {
      onClientEvent: (cb: (e: ClientEvent) => void) => () => void
      quit: () => Promise<void>
      setClickThrough: (enabled: boolean) => Promise<void>
      getClickThrough: () => Promise<boolean>
      getClickThroughHotkey: () => Promise<string>
      onClickThroughChange: (cb: (enabled: boolean) => void) => () => void
      getActiveClient: () => Promise<DetectedClient | null>
      listClients: () => Promise<DetectedClient[]>
      listDiskBuilds: () => Promise<unknown[]>
      loadCustom: (buildId: string) => Promise<unknown | null>
      saveCustom: (buildId: string, data: unknown) => Promise<void>
      getContentDirs: () => Promise<{ builds: string; customizations: string }>
      openExternal: (url: string) => Promise<void>
    }
  }
}

const GAME_LABEL: Record<Game, string> = {
  poe1: 'PoE 1',
  poe2: 'PoE 2'
}

const KIND_ICON: Record<ReminderKind, string> = {
  gem: '◆',
  flask: '⚗',
  vendor: '$',
  item: '⛨',
  passive: '✦',
  boss: '☠',
  general: '!'
}

const KIND_COLOR: Record<ReminderKind, string> = {
  gem: 'text-emerald-300',
  flask: 'text-rose-300',
  vendor: 'text-yellow-300',
  item: 'text-blue-300',
  passive: 'text-purple-300',
  boss: 'text-red-300',
  general: 'text-amber-300'
}

const LAYOUT_IMG_PREFIX =
  'https://raw.githubusercontent.com/nicolasbagatello/poe2-helper/main/images/'

function reminderKey(scope: string, text: string): string {
  return `${scope}::${text}`
}

function loadDone(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>()
  } catch {
    return new Set<string>()
  }
}

function useCompleted(buildId: string | undefined): {
  isDone: (k: string) => boolean
  toggle: (k: string) => void
} {
  const storageKey = `poe-overlay:done:${buildId ?? '_'}`
  const [done, setDone] = useState<Set<string>>(() => loadDone(storageKey))

  useEffect(() => {
    setDone(loadDone(storageKey))
  }, [storageKey])

  const toggle = useCallback(
    (key: string) => {
      setDone((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
        } catch {
          // ignore quota errors
        }
        return next
      })
    },
    [storageKey]
  )

  return {
    isDone: useCallback((k: string) => done.has(k), [done]),
    toggle
  }
}

function isBuild(x: unknown): x is Build {
  if (!x || typeof x !== 'object') return false
  const obj = x as Record<string, unknown>
  return (
    typeof obj.buildId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.game === 'string' &&
    typeof obj.routeId === 'string'
  )
}

function useAllBuilds(): Build[] {
  const [diskBuilds, setDiskBuilds] = useState<Build[]>([])
  useEffect(() => {
    window.overlay
      .listDiskBuilds()
      .then((arr) => {
        const valid: Build[] = []
        for (const b of arr) {
          if (isBuild(b)) valid.push(b)
        }
        setDiskBuilds(valid)
      })
      .catch((err) => console.error('listDiskBuilds failed', err))
  }, [])
  return useMemo(() => [...BUILTIN_BUILDS, ...diskBuilds], [diskBuilds])
}

function customToReminder(c: CustomAddition): Reminder {
  return {
    text: c.text,
    fromLevel: c.fromLevel,
    toLevel: c.toLevel,
    kind: c.kind,
    url: c.url,
    highlight: c.highlight
  }
}

function ZoneLayout({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0)
  const [errored, setErrored] = useState(false)
  const cur = images[idx]
  const multi = images.length > 1

  if (errored) {
    return (
      <div className="text-[10px] text-white/40 italic">
        Layout image failed to load.
      </div>
    )
  }

  return (
    <div className="relative">
      <img
        src={LAYOUT_IMG_PREFIX + encodeURIComponent(cur)}
        alt={`Zone layout ${idx + 1}`}
        className="w-full max-h-[200px] object-contain rounded border border-white/10 bg-black/30"
        onClick={multi ? () => setIdx((i) => (i + 1) % images.length) : undefined}
        onError={() => setErrored(true)}
        style={{ cursor: multi ? 'pointer' : 'default' }}
        title={multi ? 'Click for next layout' : undefined}
      />
      {multi && (
        <div className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white/80 pointer-events-none">
          {idx + 1}/{images.length}
        </div>
      )}
    </div>
  )
}

function ReminderRow({
  reminder,
  done,
  onToggle
}: {
  reminder: Reminder
  done: boolean
  onToggle: () => void
}) {
  const kind = reminder.kind ?? 'general'
  const isOptional = reminder.text.startsWith('(opt) ')
  const text = isOptional ? reminder.text.slice(6) : reminder.text
  const hasPermBuff = /Permanent Buff/i.test(text)
  const highlighted = !!reminder.highlight || hasPermBuff

  const openUrl = (): void => {
    if (reminder.url) {
      window.overlay.openExternal(reminder.url).catch((err) =>
        console.error('openExternal failed', err)
      )
    }
  }

  return (
    <div
      className={`flex items-start gap-2 text-[12px] leading-snug ${
        isOptional ? 'opacity-60 italic' : ''
      } ${done ? 'opacity-50 line-through' : ''}`}
    >
      <button
        onClick={onToggle}
        className="no-drag mt-[3px] w-3 h-3 border border-white/30 rounded-sm flex-shrink-0 flex items-center justify-center hover:bg-white/10 hover:border-white/60"
        title={done ? 'Restore' : 'Mark done'}
      >
        {done && (
          <span className="text-amber-300 text-[9px] leading-none">✓</span>
        )}
      </button>
      <span className={`${KIND_COLOR[kind]} font-bold flex-shrink-0`}>
        {KIND_ICON[kind]}
      </span>
      <span
        className={
          highlighted ? 'text-amber-200 font-semibold' : 'text-white/90'
        }
      >
        {highlighted && <span className="text-yellow-300">★ </span>}
        {text}
        {reminder.url && (
          <button
            onClick={openUrl}
            className="no-drag ml-1 text-sky-300 hover:text-sky-100 underline-offset-2 hover:underline"
            title={reminder.url}
          >
            ↗
          </button>
        )}
      </span>
    </div>
  )
}

export default function App() {
  const [zone, setZone] = useState<string>('Waiting for zone…')
  const [character, setCharacter] = useState<string | null>(null)
  const [charClass, setCharClass] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [client, setClient] = useState<DetectedClient | null>(null)

  useEffect(() => {
    window.overlay.getActiveClient().then(setClient)
    return window.overlay.onClientEvent((e) => {
      if (e.type === 'zone') setZone(e.zone)
      else if (e.type === 'level') {
        setCharacter(e.character)
        setCharClass(e.charClass)
        setLevel(e.level)
      }
    })
  }, [])

  const [clickThrough, setClickThroughState] = useState(false)
  const [clickThroughHotkey, setClickThroughHotkey] = useState('Alt+Shift+O')
  useEffect(() => {
    window.overlay.getClickThrough().then(setClickThroughState)
    window.overlay.getClickThroughHotkey().then(setClickThroughHotkey)
    return window.overlay.onClickThroughChange(setClickThroughState)
  }, [])

  const allBuilds = useAllBuilds()

  const activeBuild = useMemo(() => {
    if (!client) return null
    return defaultBuild(allBuilds, client.game)
  }, [client, allBuilds])

  const stepInfo = useMemo(() => {
    if (!activeBuild) return null
    if (zone.startsWith('Waiting')) return null
    return findStep(activeBuild, zone)
  }, [activeBuild, zone])

  const baseZoneReminders = useMemo(() => {
    if (!stepInfo) return []
    return visibleReminders(stepInfo.step, level)
  }, [stepInfo, level])

  const baseBuildReminders = useMemo(
    () => visibleBuildReminders(activeBuild, level),
    [activeBuild, level]
  )

  const { customs, add, update, remove } = useCustomizations(activeBuild?.buildId)

  const zoneCustoms = useMemo(() => {
    if (!stepInfo) return [] as CustomAddition[]
    return customs.filter(
      (c) =>
        c.scope.type === 'zone' &&
        c.scope.zone === stepInfo.step.zone &&
        reminderPassesLevel(customToReminder(c), level)
    )
  }, [customs, stepInfo, level])

  const buildCustoms = useMemo(
    () =>
      customs.filter(
        (c) =>
          c.scope.type === 'build' &&
          reminderPassesLevel(customToReminder(c), level)
      ),
    [customs, level]
  )

  const reminders = useMemo(
    () => [...zoneCustoms.map(customToReminder), ...baseZoneReminders],
    [zoneCustoms, baseZoneReminders]
  )
  const buildReminders = useMemo(
    () => [...buildCustoms.map(customToReminder), ...baseBuildReminders],
    [buildCustoms, baseBuildReminders]
  )

  const [copied, setCopied] = useState(false)
  const copyRegex = async (): Promise<void> => {
    if (!activeBuild?.vendorRegex) return
    try {
      await navigator.clipboard.writeText(activeBuild.vendorRegex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('clipboard write failed', err)
    }
  }

  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = localStorage.getItem('poe-overlay:fontScale')
    const n = saved ? Number(saved) : 1
    return Number.isFinite(n) && n > 0 ? n : 1
  })

  useEffect(() => {
    localStorage.setItem('poe-overlay:fontScale', String(fontScale))
  }, [fontScale])

  const adjustFont = (delta: number): void => {
    setFontScale((prev) =>
      Math.min(1.8, Math.max(0.7, Math.round((prev + delta) * 10) / 10))
    )
  }

  const { isDone, toggle: toggleDone } = useCompleted(activeBuild?.buildId)
  const [showDone, setShowDone] = useState(false)

  const zoneScope = stepInfo?.step.zone ?? ''
  const shownZoneReminders = reminders.filter(
    (r) => showDone || !isDone(reminderKey(zoneScope, r.text))
  )
  const shownBuildReminders = buildReminders.filter(
    (r) => showDone || !isDone(reminderKey('build', r.text))
  )
  const hiddenCount =
    reminders.filter((r) => isDone(reminderKey(zoneScope, r.text))).length +
    buildReminders.filter((r) => isDone(reminderKey('build', r.text))).length

  const [editorOpen, setEditorOpen] = useState(false)
  const editorZones = useMemo(
    () => (activeBuild ? listZones(activeBuild) : []),
    [activeBuild]
  )
  const currentZoneForEditor = stepInfo?.step.zone ?? ''

  return (
    <div
      className="h-screen w-screen p-2 text-white"
      style={clickThrough ? { opacity: 0.7 } : undefined}
    >
      <div
        className={`h-full w-full rounded-lg border bg-black/75 backdrop-blur-sm shadow-xl flex flex-col ${
          clickThrough
            ? 'border-dashed border-sky-400/60'
            : 'border-solid border-amber-500/40'
        }`}
      >
        <div className="drag flex items-center justify-between px-3 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-[11px] font-semibold tracking-widest">
              PoE OVERLAY
            </span>
            {client && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                {GAME_LABEL[client.game]}
              </span>
            )}
            {clickThrough && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-400/50"
                title={`Press ${clickThroughHotkey} to disable`}
              >
                👻 click-through · {clickThroughHotkey}
              </span>
            )}
            {activeBuild?.vendorRegex && (
              <button
                onClick={copyRegex}
                title={activeBuild.vendorRegex}
                className={`no-drag text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  copied
                    ? 'bg-emerald-500/30 text-emerald-200 border-emerald-500/50'
                    : 'bg-sky-500/15 text-sky-200 border-sky-500/30 hover:bg-sky-500/25'
                }`}
              >
                {copied ? '✓ Copied' : '⧉ Regex'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.overlay.setClickThrough(true)}
              className="no-drag text-[10px] w-5 h-5 leading-none rounded border bg-white/5 text-white/70 hover:bg-white/15 hover:text-white border-white/15"
              title={`Enable click-through (${clickThroughHotkey} to toggle)`}
            >
              👻
            </button>
            <button
              onClick={() => setEditorOpen((o) => !o)}
              disabled={!activeBuild}
              className={`no-drag text-[10px] w-5 h-5 leading-none rounded border ${
                editorOpen
                  ? 'bg-amber-500/30 text-amber-100 border-amber-500/50'
                  : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white border-white/15'
              } disabled:opacity-30`}
              title={editorOpen ? 'Close editor' : 'Edit your notes'}
            >
              ✎
            </button>
            <button
              onClick={() => adjustFont(-0.1)}
              disabled={fontScale <= 0.7}
              className="no-drag text-[10px] w-5 h-5 leading-none rounded border bg-white/5 text-white/70 hover:bg-white/15 hover:text-white border-white/15 disabled:opacity-30"
              title={`Decrease text size (${Math.round(fontScale * 100)}%)`}
            >
              −
            </button>
            <button
              onClick={() => adjustFont(0.1)}
              disabled={fontScale >= 1.8}
              className="no-drag text-[10px] w-5 h-5 leading-none rounded border bg-white/5 text-white/70 hover:bg-white/15 hover:text-white border-white/15 disabled:opacity-30"
              title={`Increase text size (${Math.round(fontScale * 100)}%)`}
            >
              +
            </button>
            <button
              onClick={() => window.overlay.quit()}
              className="no-drag text-white/50 hover:text-white text-xs leading-none px-1 ml-1"
              title="Quit"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className="flex-1 px-3 py-2 overflow-y-auto space-y-2"
          style={{ zoom: fontScale }}
        >
          {editorOpen && activeBuild ? (
            <Editor
              zones={editorZones}
              currentZone={currentZoneForEditor}
              customs={customs}
              onAdd={add}
              onUpdate={update}
              onDelete={remove}
              onClose={() => setEditorOpen(false)}
            />
          ) : (
            <>
              <div>
                <div className="flex items-baseline gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    Zone
                  </div>
                  {stepInfo?.step.act != null && (
                    <div className="text-[10px] text-white/40">
                      Act {stepInfo.step.act}
                    </div>
                  )}
                </div>
                <div className="text-sm truncate">{zone}</div>
              </div>

              {stepInfo ? (
                <>
                  {stepInfo.step.notes && stepInfo.step.notes.length > 0 && (
                    <ul className="space-y-1">
                      {stepInfo.step.notes.map((note, i) => (
                        <li
                          key={i}
                          className="text-[12px] text-white/80 leading-snug pl-3 -indent-3"
                        >
                          • {note}
                        </li>
                      ))}
                    </ul>
                  )}

                  {shownZoneReminders.length > 0 && (
                    <div className="pt-1 space-y-1 border-t border-white/10">
                      {shownZoneReminders.map((r, i) => {
                        const k = reminderKey(zoneScope, r.text)
                        return (
                          <ReminderRow
                            key={i}
                            reminder={r}
                            done={isDone(k)}
                            onToggle={() => toggleDone(k)}
                          />
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                !zone.startsWith('Waiting') && (
                  <div className="text-[11px] text-white/40 italic">
                    No notes for this zone yet. Use ✎ to add a custom one.
                  </div>
                )
              )}

              {shownBuildReminders.length > 0 && (
                <div className="pt-2 space-y-1 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    Build
                  </div>
                  {shownBuildReminders.map((r, i) => {
                    const k = reminderKey('build', r.text)
                    return (
                      <ReminderRow
                        key={i}
                        reminder={r}
                        done={isDone(k)}
                        onToggle={() => toggleDone(k)}
                      />
                    )
                  })}
                </div>
              )}

              {stepInfo?.step.layoutImages &&
                stepInfo.step.layoutImages.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                      Layout
                    </div>
                    <ZoneLayout
                      key={zone}
                      images={stepInfo.step.layoutImages}
                    />
                  </div>
                )}
            </>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] flex items-center justify-between gap-2">
          {character ? (
            <span className="text-white/70 truncate">
              {character} <span className="text-white/40">({charClass})</span>{' '}
              <span className="text-amber-300">lvl {level}</span>
            </span>
          ) : (
            <span className="text-white/30 italic">no character yet</span>
          )}
          {!editorOpen && hiddenCount > 0 && (
            <button
              onClick={() => setShowDone((s) => !s)}
              className="no-drag text-white/40 hover:text-white/90 underline-offset-2 hover:underline whitespace-nowrap"
              title={showDone ? 'Hide done items' : 'Show done items'}
            >
              {showDone ? 'hide done' : `done (${hiddenCount})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
