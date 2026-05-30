import { promises as fs } from 'fs'
import { app } from 'electron'
import { join } from 'path'

function userDataDir(): string {
  return app.getPath('userData')
}

function buildsDir(): string {
  return join(userDataDir(), 'builds')
}

function customDir(): string {
  return join(userDataDir(), 'customizations')
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(buildsDir(), { recursive: true })
  await fs.mkdir(customDir(), { recursive: true })
}

export async function listDiskBuilds(): Promise<unknown[]> {
  await ensureDirs()
  let files: string[]
  try {
    files = await fs.readdir(buildsDir())
  } catch {
    return []
  }
  const builds: unknown[] = []
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.json')) continue
    try {
      const raw = await fs.readFile(join(buildsDir(), f), 'utf-8')
      builds.push(JSON.parse(raw))
    } catch (err) {
      console.error(`[disk-content] failed to parse ${f}`, err)
    }
  }
  return builds
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

export async function loadCustom(buildId: string): Promise<unknown | null> {
  await ensureDirs()
  const path = join(customDir(), `${sanitize(buildId)}.json`)
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.error(`[disk-content] failed to load custom ${buildId}`, err)
    return null
  }
}

export async function saveCustom(buildId: string, data: unknown): Promise<void> {
  await ensureDirs()
  const path = join(customDir(), `${sanitize(buildId)}.json`)
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function getContentDirs(): { builds: string; customizations: string } {
  return { builds: buildsDir(), customizations: customDir() }
}
