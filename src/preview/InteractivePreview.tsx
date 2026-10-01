import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Hotspot } from '../model'
import { renderDescriptionHtml, type SanitizedHtml } from '../export/markdown'
import {
  compactDescriptionFromHtml,
  TITLE_SUMMARY_GRAPHEMES,
  truncateGraphemes,
} from './summary'

const DEFAULT_MARKER_COLOR = '#2563eb'
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href]'

export interface InteractivePreviewProps {
  imageUrl: string
  imageAlt: string
  pageId: string
  pageWidth: number
  pageHeight: number
  hotspots: readonly Hotspot[]
  showBadgeNumbers?: boolean
}

interface PreparedHotspot {
  hotspot: Hotspot
  number: number
  label: string
  compactTitle: string
  compactDescription: string
  descriptionHtml: SanitizedHtml
}

function displayTitle(hotspot: Hotspot): string {
  return hotspot.title.trim() || `Hotspot ${hotspot.order + 1}`
}

function markerColor(color: string | undefined): string {
  return color && HEX_COLOR.test(color) ? color : DEFAULT_MARKER_COLOR
}

function supportsHoverPointer(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(HOVER_POINTER_QUERY).matches
  )
}

function markerPosition(hotspot: Hotspot): CSSProperties {
  const position: CSSProperties = {
    left: `${hotspot.x * 100}%`,
    top: `${hotspot.y * 100}%`,
  }
  if (hotspot.shape === 'rect') {
    position.width = `${hotspot.w * 100}%`
    position.height = `${hotspot.h * 100}%`
  }
  return position
}

export function InteractivePreview({
  imageUrl,
  imageAlt,
  pageId,
  pageWidth,
  pageHeight,
  hotspots,
  showBadgeNumbers = true,
}: InteractivePreviewProps) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null)
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null)
  const [imageStatus, setImageStatus] = useState<
    'loading' | 'loaded' | 'error'
  >('loading')

  useEffect(() => {
    // A new image source needs to report its own load/error outcome even if
    // the previous one already finished loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageStatus('loading')
  }, [imageUrl])

  const preparedHotspots = useMemo<PreparedHotspot[]>(
    () =>
      hotspots
        .filter((hotspot) => hotspot.pageId === pageId)
        .toSorted((left, right) => left.order - right.order)
        .map((hotspot, index) => {
          const label = displayTitle(hotspot)
          const descriptionHtml = renderDescriptionHtml(hotspot.description)
          return {
            hotspot,
            number: index + 1,
            label,
            compactTitle: truncateGraphemes(label, TITLE_SUMMARY_GRAPHEMES),
            compactDescription: compactDescriptionFromHtml(descriptionHtml),
            descriptionHtml,
          }
        }),
    [hotspots, pageId],
  )

  const openHotspot = preparedHotspots.find(
    ({ hotspot }) => hotspot.id === openHotspotId,
  )

  const closeCard = useCallback(() => {
    setOpenHotspotId(null)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!openHotspot) {
      return
    }
    closeButtonRef.current?.focus()

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCard()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const dialog = closeButtonRef.current?.closest('[role="dialog"]')
      if (!(dialog instanceof HTMLElement)) {
        return
      }
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [closeCard, openHotspot])

  useEffect(() => {
    // Without this, touch scroll on the fixed backdrop chains through to the
    // page behind it (most noticeably on iOS Safari).
    if (!openHotspotId) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [openHotspotId])

  function openCard(prepared: PreparedHotspot, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setHoveredHotspotId(null)
    setOpenHotspotId(prepared.hotspot.id)
  }

  function activateWithKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    prepared: PreparedHotspot,
  ) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openCard(prepared, event.currentTarget)
  }

  return (
    <section aria-label="Interactive preview" className="w-full">
      <div
        className="relative mx-auto w-full overflow-visible"
        data-testid="preview-page"
        style={{ maxWidth: `${pageWidth}px` }}
      >
        <img
          alt={imageAlt}
          className={`block h-auto w-full rounded-lg ${
            imageStatus === 'loaded' ? '' : 'invisible'
          }`}
          height={pageHeight}
          onError={() => setImageStatus('error')}
          onLoad={() => setImageStatus('loaded')}
          src={imageUrl}
          width={pageWidth}
        />
        {imageStatus === 'loading' && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/60 text-sm text-muted-foreground"
            role="status"
          >
            Loading image…
          </div>
        )}
        {imageStatus === 'error' && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/60 text-sm text-destructive"
            role="alert"
          >
            Could not load the image.
          </div>
        )}
        <div className="absolute inset-0" data-testid="preview-overlay">
          {preparedHotspots.map((prepared) => {
            const { hotspot, number, label } = prepared
            const isRectangle = hotspot.shape === 'rect'
            const tooltipId = `preview-summary-${hotspot.id}`
            const summaryVisible = hoveredHotspotId === hotspot.id
            return (
              <div
                className={`group absolute ${
                  isRectangle ? '' : 'h-7 w-7 -translate-x-1/2 -translate-y-1/2'
                }`}
                data-hotspot-shape={hotspot.shape}
                key={hotspot.id}
                style={markerPosition(hotspot)}
              >
                <button
                  aria-describedby={summaryVisible ? tooltipId : undefined}
                  aria-expanded={openHotspotId === hotspot.id}
                  aria-haspopup="dialog"
                  aria-label={`${showBadgeNumbers ? `${number}. ` : ''}${label}`}
                  className={`h-full w-full cursor-pointer text-white shadow-[0_0_0_2px_rgba(2,6,23,0.55)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                    isRectangle
                      ? 'rounded border-2 bg-slate-950/10'
                      : 'flex items-center justify-center rounded-full border-2 border-white text-xs font-semibold'
                  }`}
                  onClick={(event) => openCard(prepared, event.currentTarget)}
                  onKeyDown={(event) => activateWithKeyboard(event, prepared)}
                  onPointerEnter={() => {
                    if (supportsHoverPointer()) {
                      setHoveredHotspotId(hotspot.id)
                    }
                  }}
                  onPointerLeave={() => setHoveredHotspotId(null)}
                  style={
                    isRectangle
                      ? { borderColor: markerColor(hotspot.color) }
                      : { backgroundColor: markerColor(hotspot.color) }
                  }
                  type="button"
                >
                  {showBadgeNumbers ? (
                    <span
                      className={
                        isRectangle
                          ? 'pointer-events-none absolute left-0 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold'
                          : 'pointer-events-none'
                      }
                      style={
                        isRectangle
                          ? { backgroundColor: markerColor(hotspot.color) }
                          : undefined
                      }
                    >
                      {number}
                    </span>
                  ) : null}
                </button>
                {summaryVisible ? (
                  <div
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-lg"
                    id={tooltipId}
                    role="tooltip"
                  >
                    <p className="truncate whitespace-nowrap font-semibold">
                      {prepared.compactTitle}
                    </p>
                    {prepared.compactDescription ? (
                      <p className="mt-1 line-clamp-3 text-muted-foreground">
                        {prepared.compactDescription}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {openHotspot
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-xs duration-150 fade-in-0"
              data-testid="preview-backdrop"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeCard()
                }
              }}
            >
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className="relative max-h-[80vh] w-full max-w-lg animate-in overflow-auto rounded-xl border bg-card p-6 text-card-foreground shadow-2xl duration-150 fade-in-0 zoom-in-95"
                role="dialog"
              >
                <h2
                  className="mb-3 pr-10 text-lg font-semibold tracking-tight"
                  id={titleId}
                >
                  {openHotspot.label}
                </h2>
                <div
                  className="preview-description"
                  dangerouslySetInnerHTML={{
                    __html: openHotspot.descriptionHtml,
                  }}
                />
                {openHotspot.hotspot.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {openHotspot.hotspot.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <Button
                  aria-label="Close"
                  className="absolute top-3 right-3"
                  onClick={closeCard}
                  ref={closeButtonRef}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}
