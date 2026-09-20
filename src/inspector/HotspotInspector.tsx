import { useState, type ChangeEvent, type FocusEvent } from 'react'
import type { Hotspot } from '../model'
import type { ProjectActions } from '../store'

export const TITLE_MAX_GRAPHEMES = 500
export const DESCRIPTION_MAX_GRAPHEMES = 10_000
export const HOTSPOT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

type InspectorActions = Pick<
  ProjectActions,
  | 'selectHotspot'
  | 'updateHotspotContent'
  | 'reorderWithinPage'
  | 'deleteHotspot'
>

export interface HotspotInspectorProps {
  pageId: string
  hotspots: readonly Hotspot[]
  selectedHotspotId: string | null
  actions: InspectorActions
}

function countGraphemes(value: string): number {
  return [...segmenter.segment(value)].length
}

function tagsFromInput(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ]
}

function displayName(hotspot: Hotspot): string {
  return hotspot.title.trim() || `Hotspot ${hotspot.order + 1}`
}

interface HotspotRowProps {
  hotspot: Hotspot
  selected: boolean
  position: number
  count: number
  actions: InspectorActions
  move: (hotspotId: string, offset: -1 | 1) => void
}

function HotspotRow({
  hotspot,
  selected,
  position,
  count,
  actions,
  move,
}: HotspotRowProps) {
  const [titleError, setTitleError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [colorError, setColorError] = useState<string | null>(null)
  const fieldId = `hotspot-${hotspot.id}`

  function updateTitle(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value
    if (countGraphemes(value) > TITLE_MAX_GRAPHEMES) {
      setTitleError(`Title must be ${TITLE_MAX_GRAPHEMES} characters or fewer.`)
      return
    }
    setTitleError(null)
    actions.updateHotspotContent(hotspot.id, { title: value })
  }

  function updateDescription(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value
    if (countGraphemes(value) > DESCRIPTION_MAX_GRAPHEMES) {
      setDescriptionError(
        `Description must be ${DESCRIPTION_MAX_GRAPHEMES.toLocaleString()} characters or fewer.`,
      )
      return
    }
    setDescriptionError(null)
    actions.updateHotspotContent(hotspot.id, {
      description: value.trim() === '' ? '' : value,
    })
  }

  function commitColor(event: FocusEvent<HTMLInputElement>) {
    const value = event.currentTarget.value.trim()
    if (value !== '' && !HOTSPOT_COLOR_PATTERN.test(value)) {
      setColorError('Use a six-digit hex color such as #2563EB.')
      return
    }
    setColorError(null)
    const color = value === '' ? undefined : value.toUpperCase()
    event.currentTarget.value = color ?? ''
    actions.updateHotspotContent(hotspot.id, { color })
  }

  function commitTags(event: FocusEvent<HTMLInputElement>) {
    actions.updateHotspotContent(hotspot.id, {
      tags: tagsFromInput(event.currentTarget.value),
    })
  }

  return (
    <li
      className={`rounded-lg border p-3 text-slate-900 ${
        selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
          : 'border-slate-300 bg-white'
      }`}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => actions.selectHotspot(hotspot.id)}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          aria-pressed={selected}
          className="min-w-0 flex-1 truncate text-left font-medium"
          onClick={() => actions.selectHotspot(hotspot.id)}
          type="button"
        >
          {displayName(hotspot)}
        </button>
        <button
          aria-label={`Move ${displayName(hotspot)} up`}
          disabled={position === 0}
          onClick={() => move(hotspot.id, -1)}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move ${displayName(hotspot)} down`}
          disabled={position === count - 1}
          onClick={() => move(hotspot.id, 1)}
          type="button"
        >
          ↓
        </button>
        <button
          aria-label={`Delete ${displayName(hotspot)}`}
          className="text-red-700"
          onClick={(event) => {
            event.stopPropagation()
            actions.deleteHotspot(hotspot.id)
          }}
          type="button"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3">
        <label htmlFor={`${fieldId}-title`}>
          <span className="block text-sm font-medium">Title</span>
          <input
            aria-describedby={titleError ? `${fieldId}-title-error` : undefined}
            aria-invalid={titleError ? 'true' : undefined}
            className="w-full rounded border border-slate-300 px-2 py-1"
            id={`${fieldId}-title`}
            onChange={updateTitle}
            type="text"
            value={hotspot.title}
          />
        </label>
        {titleError ? (
          <p
            className="text-sm text-red-700"
            id={`${fieldId}-title-error`}
            role="alert"
          >
            {titleError}
          </p>
        ) : null}

        <label htmlFor={`${fieldId}-description`}>
          <span className="block text-sm font-medium">Description</span>
          <textarea
            aria-describedby={
              descriptionError ? `${fieldId}-description-error` : undefined
            }
            aria-invalid={descriptionError ? 'true' : undefined}
            className="min-h-24 w-full rounded border border-slate-300 px-2 py-1"
            id={`${fieldId}-description`}
            onChange={updateDescription}
            value={hotspot.description}
          />
        </label>
        {descriptionError ? (
          <p
            className="text-sm text-red-700"
            id={`${fieldId}-description-error`}
            role="alert"
          >
            {descriptionError}
          </p>
        ) : null}

        <label htmlFor={`${fieldId}-color`}>
          <span className="block text-sm font-medium">Color</span>
          <input
            aria-describedby={colorError ? `${fieldId}-color-error` : undefined}
            aria-invalid={colorError ? 'true' : undefined}
            className="w-full rounded border border-slate-300 px-2 py-1 font-mono"
            defaultValue={hotspot.color ?? ''}
            id={`${fieldId}-color`}
            key={hotspot.color ?? 'empty'}
            onBlur={commitColor}
            placeholder="#2563EB"
            type="text"
          />
        </label>
        {colorError ? (
          <p
            className="text-sm text-red-700"
            id={`${fieldId}-color-error`}
            role="alert"
          >
            {colorError}
          </p>
        ) : null}

        <label htmlFor={`${fieldId}-tags`}>
          <span className="block text-sm font-medium">Tags</span>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1"
            defaultValue={hotspot.tags.join(', ')}
            id={`${fieldId}-tags`}
            key={hotspot.tags.join('\u0000')}
            onBlur={commitTags}
            placeholder="review, navigation"
            type="text"
          />
        </label>
      </div>
    </li>
  )
}

export function HotspotInspector({
  pageId,
  hotspots,
  selectedHotspotId,
  actions,
}: HotspotInspectorProps) {
  const orderedHotspots = hotspots
    .filter((hotspot) => hotspot.pageId === pageId)
    .toSorted((left, right) => left.order - right.order)

  function move(hotspotId: string, offset: -1 | 1) {
    const currentIndex = orderedHotspots.findIndex(
      (hotspot) => hotspot.id === hotspotId,
    )
    const targetIndex = currentIndex + offset
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= orderedHotspots.length
    ) {
      return
    }
    const orderedIds = orderedHotspots.map((hotspot) => hotspot.id)
    ;[orderedIds[currentIndex], orderedIds[targetIndex]] = [
      orderedIds[targetIndex],
      orderedIds[currentIndex],
    ]
    actions.reorderWithinPage(pageId, orderedIds)
  }

  return (
    <aside aria-label="Hotspot inspector" className="w-full max-w-md p-4">
      <h2 className="mb-3 text-lg font-semibold">Hotspots</h2>
      {orderedHotspots.length === 0 ? (
        <p className="text-sm text-slate-400">No hotspots on this page.</p>
      ) : (
        <ol className="grid gap-3">
          {orderedHotspots.map((hotspot, position) => (
            <HotspotRow
              actions={actions}
              count={orderedHotspots.length}
              hotspot={hotspot}
              key={hotspot.id}
              move={move}
              position={position}
              selected={hotspot.id === selectedHotspotId}
            />
          ))}
        </ol>
      )}
    </aside>
  )
}
