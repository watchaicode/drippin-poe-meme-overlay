import { useMemo, useState } from 'react'
import type { CustomAddition, ReminderKind } from './content/types'

const KIND_OPTIONS: ReminderKind[] = [
  'gem',
  'flask',
  'vendor',
  'item',
  'passive',
  'boss',
  'general'
]

const KIND_LABEL: Record<ReminderKind, string> = {
  gem: 'Gem',
  flask: 'Flask',
  vendor: 'Vendor',
  item: 'Item',
  passive: 'Passive',
  boss: 'Boss',
  general: 'General'
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

interface FormState {
  scope: 'zone' | 'build'
  zone: string
  text: string
  kind: ReminderKind
  fromLevel: string
  toLevel: string
  url: string
  highlight: boolean
}

function emptyForm(currentZone: string): FormState {
  return {
    scope: currentZone ? 'zone' : 'build',
    zone: currentZone,
    text: '',
    kind: 'general',
    fromLevel: '',
    toLevel: '',
    url: '',
    highlight: false
  }
}

function formFromCustom(c: CustomAddition): FormState {
  return {
    scope: c.scope.type,
    zone: c.scope.type === 'zone' ? c.scope.zone : '',
    text: c.text,
    kind: c.kind ?? 'general',
    fromLevel: c.fromLevel != null ? String(c.fromLevel) : '',
    toLevel: c.toLevel != null ? String(c.toLevel) : '',
    url: c.url ?? '',
    highlight: !!c.highlight
  }
}

function customFromForm(form: FormState): Omit<CustomAddition, 'id'> {
  const scope =
    form.scope === 'zone' && form.zone
      ? ({ type: 'zone', zone: form.zone } as const)
      : ({ type: 'build' } as const)
  const parseLvl = (s: string): number | undefined => {
    const n = parseInt(s, 10)
    return Number.isFinite(n) && n >= 1 ? n : undefined
  }
  const url = form.url.trim()
  return {
    scope,
    text: form.text.trim(),
    kind: form.kind,
    fromLevel: parseLvl(form.fromLevel),
    toLevel: parseLvl(form.toLevel),
    url: url || undefined,
    highlight: form.highlight || undefined
  }
}

type Mode = 'list' | { type: 'add' } | { type: 'edit'; id: string }

interface EditorProps {
  zones: { zone: string; act?: number }[]
  currentZone: string
  customs: CustomAddition[]
  onAdd: (a: Omit<CustomAddition, 'id'>) => void
  onUpdate: (id: string, patch: Partial<CustomAddition>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function Editor({
  zones,
  currentZone,
  customs,
  onAdd,
  onUpdate,
  onDelete,
  onClose
}: EditorProps) {
  const [mode, setMode] = useState<Mode>('list')
  const [form, setForm] = useState<FormState>(() => emptyForm(currentZone))

  const sortedZones = useMemo(
    () =>
      [...zones].sort((a, b) =>
        (a.act ?? 0) === (b.act ?? 0)
          ? a.zone.localeCompare(b.zone)
          : (a.act ?? 0) - (b.act ?? 0)
      ),
    [zones]
  )

  const zoneGroups = useMemo(() => {
    const groups: { act: number | undefined; zones: typeof sortedZones }[] = []
    for (const z of sortedZones) {
      const last = groups[groups.length - 1]
      if (last && last.act === z.act) last.zones.push(z)
      else groups.push({ act: z.act, zones: [z] })
    }
    return groups
  }, [sortedZones])

  const startAdd = (): void => {
    setForm(emptyForm(currentZone))
    setMode({ type: 'add' })
  }

  const startEdit = (c: CustomAddition): void => {
    setForm(formFromCustom(c))
    setMode({ type: 'edit', id: c.id })
  }

  const handleSave = (): void => {
    if (!form.text.trim()) return
    const data = customFromForm(form)
    if (typeof mode === 'object' && mode.type === 'add') {
      onAdd(data)
    } else if (typeof mode === 'object' && mode.type === 'edit') {
      onUpdate(mode.id, data)
    }
    setMode('list')
  }

  const handleCancel = (): void => setMode('list')

  if (mode === 'list') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Your Custom Notes ({customs.length})
          </div>
          <div className="flex gap-1">
            <button
              onClick={startAdd}
              className="no-drag text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/30"
            >
              + Add
            </button>
            <button
              onClick={onClose}
              className="no-drag text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/70 border border-white/15 hover:bg-white/15"
            >
              Done
            </button>
          </div>
        </div>

        {customs.length === 0 ? (
          <div className="text-[11px] text-white/40 italic">
            No custom notes yet. Click + Add to create one.
          </div>
        ) : (
          <div className="space-y-1">
            {customs.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2 text-[11px] leading-snug p-1.5 rounded border border-white/10 bg-white/5"
              >
                <span className="text-amber-300 flex-shrink-0">
                  {KIND_ICON[c.kind ?? 'general']}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white/90 break-words">
                    {c.highlight && <span className="text-yellow-300">★ </span>}
                    {c.text}
                  </div>
                  <div className="text-[9px] text-white/40 mt-0.5">
                    {c.scope.type === 'zone' ? (
                      <>zone: {c.scope.zone}</>
                    ) : (
                      <>build-wide</>
                    )}
                    {(c.fromLevel || c.toLevel) && (
                      <>
                        {' '}· lv {c.fromLevel ?? '–'}–{c.toLevel ?? '–'}
                      </>
                    )}
                    {c.url && <> · 🔗</>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(c)}
                    className="no-drag text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-200 border border-sky-500/30 hover:bg-sky-500/25"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="no-drag text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 border border-rose-500/30 hover:bg-rose-500/25"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Form view (add or edit)
  const isEdit = typeof mode === 'object' && mode.type === 'edit'
  return (
    <div className="space-y-2 text-[11px]">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {isEdit ? 'Edit Note' : 'New Note'}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-white/60 w-12">Scope</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={form.scope === 'zone'}
                onChange={() => setForm((f) => ({ ...f, scope: 'zone' }))}
                className="no-drag"
              />
              <span className="text-white/80">Zone</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={form.scope === 'build'}
                onChange={() => setForm((f) => ({ ...f, scope: 'build' }))}
                className="no-drag"
              />
              <span className="text-white/80">Build-wide</span>
            </label>
          </div>
        </div>

        {form.scope === 'zone' && (
          <div className="flex items-center gap-2">
            <label className="text-white/60 w-12">Zone</label>
            <select
              value={form.zone}
              onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
              className="no-drag flex-1 bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white"
            >
              <option value="">(pick a zone)</option>
              {zoneGroups.map((g) => (
                <optgroup
                  key={g.act ?? 'other'}
                  label={g.act != null ? `── Act ${g.act} ──` : '── Other ──'}
                >
                  {g.zones.map((z) => (
                    <option key={z.zone} value={z.zone}>
                      {z.zone}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-start gap-2">
          <label className="text-white/60 w-12 mt-0.5">Text</label>
          <textarea
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            rows={2}
            placeholder="What to remember…"
            className="no-drag flex-1 bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white resize-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-white/60 w-12">Icon</label>
          <select
            value={form.kind}
            onChange={(e) =>
              setForm((f) => ({ ...f, kind: e.target.value as ReminderKind }))
            }
            className="no-drag bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {KIND_ICON[k]} {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={form.highlight}
              onChange={(e) =>
                setForm((f) => ({ ...f, highlight: e.target.checked }))
              }
              className="no-drag"
            />
            <span className="text-white/80">★ Highlight</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-white/60 w-12">Level</label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.fromLevel}
            onChange={(e) =>
              setForm((f) => ({ ...f, fromLevel: e.target.value }))
            }
            placeholder="from"
            className="no-drag w-14 bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white"
          />
          <span className="text-white/40">–</span>
          <input
            type="number"
            min={1}
            max={100}
            value={form.toLevel}
            onChange={(e) =>
              setForm((f) => ({ ...f, toLevel: e.target.value }))
            }
            placeholder="to"
            className="no-drag w-14 bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white"
          />
          <span className="text-white/40 text-[10px]">(optional)</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-white/60 w-12">URL</label>
          <input
            type="url"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://… (optional)"
            className="no-drag flex-1 bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white"
          />
        </div>
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <button
          onClick={handleCancel}
          className="no-drag text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/70 border border-white/15 hover:bg-white/15"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!form.text.trim() || (form.scope === 'zone' && !form.zone)}
          className="no-drag text-[11px] px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-100 border border-emerald-500/50 hover:bg-emerald-500/40 disabled:opacity-40"
        >
          {isEdit ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  )
}
