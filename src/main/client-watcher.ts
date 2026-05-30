import { createReadStream, existsSync, readdirSync, statSync, watch } from 'fs'
import { join } from 'path'

export type Game = 'poe1' | 'poe2'

export type ClientEvent =
  | { type: 'zone'; zone: string; raw: string }
  | { type: 'level'; character: string; charClass: string; level: number; raw: string }
  | { type: 'login'; raw: string }

export interface DetectedClient {
  path: string
  game: Game
}

const INSTALL_PARENTS = [
  'C:\\Program Files (x86)\\Grinding Gear Games',
  'C:\\Program Files\\Grinding Gear Games',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common',
  'C:\\Program Files\\Steam\\steamapps\\common'
]

// Matches "Path of Exile 2" or "Path of Exile 2 - poe2_production" etc.
const POE2_DIR_RE = /^Path of Exile 2(\b|$)/i
// Matches "Path of Exile" (any branch suffix) but excludes "Path of Exile 2..."
const POE1_DIR_RE = /^Path of Exile(?! 2)(\b|$)/i

function classifyFolder(name: string): Game | null {
  if (POE2_DIR_RE.test(name)) return 'poe2'
  if (POE1_DIR_RE.test(name)) return 'poe1'
  return null
}

export function detectClients(): DetectedClient[] {
  const found: DetectedClient[] = []
  const seen = new Set<string>()

  for (const parent of INSTALL_PARENTS) {
    if (!existsSync(parent)) continue
    let entries: string[]
    try {
      entries = readdirSync(parent)
    } catch {
      continue
    }
    for (const name of entries) {
      const game = classifyFolder(name)
      if (!game) continue
      const log = join(parent, name, 'logs', 'Client.txt')
      if (!existsSync(log) || seen.has(log)) continue
      seen.add(log)
      found.push({ path: log, game })
    }
  }

  return found
}

// Whichever Client.txt was modified most recently is presumed active.
export function pickActiveClient(clients: DetectedClient[]): DetectedClient | null {
  if (clients.length === 0) return null
  return clients
    .map((c) => ({ c, mtime: statSync(c.path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].c
}

// PoE 1: "... : You have entered Lioneye's Watch."
const POE1_ZONE_RE = /You have entered (.+?)\.\s*$/
// PoE 2: "... [SCENE] Set Source [Vastiri Racecourse Hideout]"
const POE2_ZONE_RE = /\[SCENE\] Set Source \[(.+?)\]\s*$/
const POE2_ZONE_IGNORE = new Set(['(null)', '(unknown)', ''])
// Both games (assumed): ": Char (Class) is now level N"
const LEVEL_RE = /: (\S+) \((.+?)\) is now level (\d+)/
const LOGIN_RE = /Connecting to instance server/

export function parseLine(line: string, game: Game): ClientEvent | null {
  if (game === 'poe1') {
    const m = POE1_ZONE_RE.exec(line)
    if (m) return { type: 'zone', zone: m[1], raw: line }
  } else {
    const m = POE2_ZONE_RE.exec(line)
    if (m && !POE2_ZONE_IGNORE.has(m[1])) {
      return { type: 'zone', zone: m[1], raw: line }
    }
  }

  const lvl = LEVEL_RE.exec(line)
  if (lvl) {
    return {
      type: 'level',
      character: lvl[1],
      charClass: lvl[2],
      level: Number(lvl[3]),
      raw: line
    }
  }

  if (LOGIN_RE.test(line)) return { type: 'login', raw: line }

  return null
}

export function startClientWatcher(
  detected: DetectedClient,
  onEvent: (e: ClientEvent) => void
): () => void {
  const { path, game } = detected
  if (!existsSync(path)) {
    console.warn(`[client-watcher] Client.txt not found at ${path}`)
    return () => {}
  }

  let offset = statSync(path).size
  let buffer = ''
  let reading = false
  let pendingRead = false

  const readNew = (): void => {
    if (reading) {
      pendingRead = true
      return
    }
    reading = true

    const current = statSync(path).size
    if (current < offset) {
      offset = 0
      buffer = ''
    }
    if (current === offset) {
      reading = false
      return
    }

    const stream = createReadStream(path, {
      start: offset,
      end: current - 1,
      encoding: 'utf8'
    })

    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseLine(line, game)
        if (event) onEvent(event)
      }
    })

    stream.on('end', () => {
      offset = current
      reading = false
      if (pendingRead) {
        pendingRead = false
        readNew()
      }
    })

    stream.on('error', (err) => {
      console.error('[client-watcher] read error', err)
      reading = false
    })
  }

  const watcher = watch(path, { persistent: true }, () => readNew())
  return () => watcher.close()
}
