import { useCallback, useEffect, useState } from 'react'
import type { CustomAddition, Customizations } from './content/types'

export interface CustomizationsApi {
  customs: CustomAddition[]
  add: (a: Omit<CustomAddition, 'id'>) => void
  update: (id: string, patch: Partial<CustomAddition>) => void
  remove: (id: string) => void
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCustomizations(buildId: string | undefined): CustomizationsApi {
  const [customs, setCustoms] = useState<CustomAddition[]>([])

  useEffect(() => {
    if (!buildId) {
      setCustoms([])
      return
    }
    let cancelled = false
    window.overlay
      .loadCustom(buildId)
      .then((data) => {
        if (cancelled) return
        if (
          data &&
          typeof data === 'object' &&
          'additions' in (data as Record<string, unknown>)
        ) {
          const arr = (data as Customizations).additions ?? []
          setCustoms(Array.isArray(arr) ? arr : [])
        } else {
          setCustoms([])
        }
      })
      .catch((err) => {
        console.error('loadCustom failed', err)
        if (!cancelled) setCustoms([])
      })
    return () => {
      cancelled = true
    }
  }, [buildId])

  const persist = useCallback(
    (next: CustomAddition[]) => {
      if (!buildId) return
      const payload: Customizations = { buildId, version: 1, additions: next }
      window.overlay.saveCustom(buildId, payload).catch((err) => {
        console.error('saveCustom failed', err)
      })
    },
    [buildId]
  )

  const add = useCallback(
    (a: Omit<CustomAddition, 'id'>) => {
      setCustoms((prev) => {
        const next = [...prev, { ...a, id: newId() }]
        persist(next)
        return next
      })
    },
    [persist]
  )

  const update = useCallback(
    (id: string, patch: Partial<CustomAddition>) => {
      setCustoms((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
        persist(next)
        return next
      })
    },
    [persist]
  )

  const remove = useCallback(
    (id: string) => {
      setCustoms((prev) => {
        const next = prev.filter((c) => c.id !== id)
        persist(next)
        return next
      })
    },
    [persist]
  )

  return { customs, add, update, remove }
}
