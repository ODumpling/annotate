import { useState, type ChangeEvent, type FocusEvent } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MapPinIcon,
  Trash2Icon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Hotspot } from '../model'
import type { ProjectActions } from '../store'

export const TITLE_MAX_GRAPHEMES = 500
export const DESCRIPTION_MAX_GRAPHEMES = 10_000
export const HOTSPOT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

// Matches the default marker color used by the viewer and preview.
const DEFAULT_SWATCH = '#2563EB'

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

  const swatch = hotspot.color ?? DEFAULT_SWATCH

  return (
    <li
      className={cn(
        'cursor-pointer rounded-lg border bg-background p-3 transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'hover:border-foreground/20',
      )}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => {
        if (!selected) actions.selectHotspot(hotspot.id)
      }}
      onFocus={() => {
        if (!selected) actions.selectHotspot(hotspot.id)
      }}
    >
      <div className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-white text-[0.7rem] font-semibold text-white shadow-sm dark:border-white/80"
          style={{ backgroundColor: swatch }}
        >
          {position + 1}
        </span>
        <button
          aria-controls={selected ? `${fieldId}-fields` : undefined}
          aria-expanded={selected}
          className="min-h-7 min-w-0 flex-1 truncate rounded-md px-1.5 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => actions.selectHotspot(hotspot.id)}
          type="button"
        >
          {displayName(hotspot)}
        </button>
        <Button
          aria-label={`Move ${displayName(hotspot)} up`}
          disabled={position === 0}
          onClick={() => move(hotspot.id, -1)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronUpIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={`Move ${displayName(hotspot)} down`}
          disabled={position === count - 1}
          onClick={() => move(hotspot.id, 1)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={`Delete ${displayName(hotspot)}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation()
            actions.deleteHotspot(hotspot.id)
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>

      {selected ? (
        <div className="mt-3 grid gap-3 border-t pt-3" id={`${fieldId}-fields`}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-title`}>Title</Label>
            <Input
              aria-describedby={
                titleError ? `${fieldId}-title-error` : undefined
              }
              aria-invalid={titleError ? 'true' : undefined}
              id={`${fieldId}-title`}
              onChange={updateTitle}
              type="text"
              value={hotspot.title}
            />
            {titleError ? (
              <p
                className="text-xs text-destructive"
                id={`${fieldId}-title-error`}
                role="alert"
              >
                {titleError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-description`}>Description</Label>
            <Textarea
              aria-describedby={
                descriptionError ? `${fieldId}-description-error` : undefined
              }
              aria-invalid={descriptionError ? 'true' : undefined}
              className="min-h-24"
              id={`${fieldId}-description`}
              onChange={updateDescription}
              placeholder="Markdown supported"
              value={hotspot.description}
            />
            {descriptionError ? (
              <p
                className="text-xs text-destructive"
                id={`${fieldId}-description-error`}
                role="alert"
              >
                {descriptionError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-color`}>Color</Label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 rounded-sm ring-1 ring-foreground/15"
                style={{ backgroundColor: swatch }}
              />
              <Input
                aria-describedby={
                  colorError ? `${fieldId}-color-error` : undefined
                }
                aria-invalid={colorError ? 'true' : undefined}
                className="pl-8 font-mono uppercase placeholder:normal-case"
                defaultValue={hotspot.color ?? ''}
                id={`${fieldId}-color`}
                key={hotspot.color ?? 'empty'}
                onBlur={commitColor}
                placeholder="#2563EB"
                type="text"
              />
            </div>
            {colorError ? (
              <p
                className="text-xs text-destructive"
                id={`${fieldId}-color-error`}
                role="alert"
              >
                {colorError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-tags`}>Tags</Label>
            <Input
              defaultValue={hotspot.tags.join(', ')}
              id={`${fieldId}-tags`}
              key={hotspot.tags.join('\u0000')}
              onBlur={commitTags}
              placeholder="review, navigation"
              type="text"
            />
          </div>
        </div>
      ) : null}
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
    <aside
      aria-label="Hotspot inspector"
      className="w-full rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <MapPinIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        Hotspots
        <Badge className="ml-auto" variant="secondary">
          {orderedHotspots.length}
        </Badge>
      </h2>
      <div className="p-3">
        {orderedHotspots.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No hotspots on this page.</p>
            <p className="text-xs text-muted-foreground">
              Choose Draw hotspot, then click for a point or drag for a
              rectangle.
            </p>
          </div>
        ) : (
          <ol className="grid gap-2">
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
      </div>
    </aside>
  )
}
