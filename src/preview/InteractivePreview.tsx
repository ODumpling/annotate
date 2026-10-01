import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
} from 'react'
import { Badge } from '@/components/ui/badge'
import type { Hotspot } from '../model'
import { renderDescriptionHtml, type SanitizedHtml } from '../export/markdown'

const DEFAULT_MARKER_COLOR = '#2563eb'
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const TOOLTIP_GAP = 8
const EDGE_MARGIN = 8
const HIDE_DELAY_MS = 150

export interface InteractivePreviewProps {
  imageUrl: string
  imageAlt: string
  pageId: string
  pageWidth: number
  pageHeight: number
  hotspots: readonly Hotspot[]
  showBadgeNumbers?: boolean
}

// Hover or focus shows an unpinned tooltip; a click pins it open until the
// marker is clicked again, Escape is pressed, or the user clicks elsewhere.
interface ActiveTooltip {
  hotspotId: string
  pinned: boolean
}

interface PreparedHotspot {
  hotspot: Hotspot
  number: number
  label: string
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
  const tooltipIdPrefix = useId()
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const markerRefs = useRef(new Map<string, HTMLButtonElement>())
  const hideTimerRef = useRef<number | null>(null)
  const [active, setActive] = useState<ActiveTooltip | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number
    top: number
  } | null>(null)
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
        .map((hotspot, index) => ({
          hotspot,
          number: index + 1,
          label: displayTitle(hotspot),
          descriptionHtml: renderDescriptionHtml(hotspot.description),
        })),
    [hotspots, pageId],
  )

  const activeHotspot = preparedHotspots.find(
    ({ hotspot }) => hotspot.id === active?.hotspotId,
  )

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    cancelHide()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setActive((current) => (current?.pinned ? current : null))
    }, HIDE_DELAY_MS)
  }, [cancelHide])

  useEffect(() => cancelHide, [cancelHide])

  function show(hotspotId: string, pinned: boolean) {
    cancelHide()
    setActive((current) => {
      if (current?.hotspotId === hotspotId) {
        return pinned && !current.pinned ? { hotspotId, pinned } : current
      }
      return { hotspotId, pinned }
    })
  }

  function showUnpinned(hotspotId: string) {
    if (active?.pinned) {
      return
    }
    show(hotspotId, false)
  }

  function hide(restoreFocus: boolean) {
    cancelHide()
    if (restoreFocus && active) {
      markerRefs.current.get(active.hotspotId)?.focus()
    }
    setActive(null)
  }

  function handleFocusOut(event: ReactFocusEvent, hotspotId: string) {
    if (!active || active.hotspotId !== hotspotId || active.pinned) {
      return
    }
    const next = event.relatedTarget
    if (
      next instanceof Node &&
      (markerRefs.current.get(hotspotId)?.contains(next) ||
        tooltipRef.current?.contains(next))
    ) {
      return
    }
    setActive(null)
  }

  const positionTooltip = useCallback(() => {
    const tooltip = tooltipRef.current
    const marker = active ? markerRefs.current.get(active.hotspotId) : null
    const origin = marker?.parentElement
    if (!tooltip || !marker || !origin) {
      setTooltipPosition(null)
      return
    }
    const anchor = marker.getBoundingClientRect()
    const originRect = origin.getBoundingClientRect()
    const width = tooltip.offsetWidth
    const height = tooltip.offsetHeight
    const viewWidth = document.documentElement.clientWidth || window.innerWidth
    const viewHeight =
      document.documentElement.clientHeight || window.innerHeight
    const left = Math.max(
      EDGE_MARGIN,
      Math.min(
        anchor.left + anchor.width / 2 - width / 2,
        viewWidth - width - EDGE_MARGIN,
      ),
    )
    let top = anchor.bottom + TOOLTIP_GAP
    if (top + height > viewHeight - EDGE_MARGIN) {
      const above = anchor.top - TOOLTIP_GAP - height
      top =
        above >= EDGE_MARGIN
          ? above
          : Math.max(EDGE_MARGIN, viewHeight - height - EDGE_MARGIN)
    }
    // Stored relative to the marker's wrapper so it scrolls with the image.
    setTooltipPosition({
      left: Math.round(left - originRect.left),
      top: Math.round(top - originRect.top),
    })
  }, [active])

  useLayoutEffect(() => {
    positionTooltip()
  }, [positionTooltip])

  useEffect(() => {
    if (!active) {
      return
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      const focusInside =
        document.activeElement instanceof Node &&
        (document.activeElement === markerRefs.current.get(active!.hotspotId) ||
          (tooltipRef.current?.contains(document.activeElement) ?? false))
      cancelHide()
      if (focusInside) {
        markerRefs.current.get(active!.hotspotId)?.focus()
      }
      setActive(null)
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        (markerRefs.current.get(active!.hotspotId)?.contains(target) ||
          tooltipRef.current?.contains(target))
      ) {
        return
      }
      cancelHide()
      setActive(null)
    }
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', positionTooltip)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', positionTooltip)
    }
  }, [active, cancelHide, positionTooltip])

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
          {preparedHotspots.map(({ hotspot, number, label }) => {
            const isRectangle = hotspot.shape === 'rect'
            const isActive = active?.hotspotId === hotspot.id
            return (
              <div
                className={`group absolute ${
                  isRectangle ? '' : 'h-7 w-7 -translate-x-1/2 -translate-y-1/2'
                } ${isActive ? 'z-20' : ''}`}
                data-hotspot-shape={hotspot.shape}
                key={hotspot.id}
                style={markerPosition(hotspot)}
              >
                <button
                  aria-controls={
                    isActive ? `${tooltipIdPrefix}-tooltip` : undefined
                  }
                  aria-expanded={isActive}
                  aria-haspopup="dialog"
                  aria-label={`${showBadgeNumbers ? `${number}. ` : ''}${label}`}
                  className={`h-full w-full cursor-pointer text-white shadow-[0_0_0_2px_rgba(2,6,23,0.55)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                    isRectangle
                      ? 'rounded border-2 bg-slate-950/10'
                      : 'flex items-center justify-center rounded-full border-2 border-white text-xs font-semibold'
                  }`}
                  onBlur={(event) => handleFocusOut(event, hotspot.id)}
                  onClick={() => {
                    if (isActive && active.pinned) {
                      hide(false)
                    } else {
                      show(hotspot.id, true)
                    }
                  }}
                  onFocus={() => showUnpinned(hotspot.id)}
                  onPointerEnter={() => {
                    if (supportsHoverPointer()) {
                      showUnpinned(hotspot.id)
                    }
                  }}
                  onPointerLeave={() => {
                    if (isActive && !active.pinned) {
                      scheduleHide()
                    }
                  }}
                  ref={(element) => {
                    if (element) {
                      markerRefs.current.set(hotspot.id, element)
                    } else {
                      markerRefs.current.delete(hotspot.id)
                    }
                  }}
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
                {isActive && activeHotspot ? (
                  // Rendered next to its marker so it scrolls with the image and Tab
                  // moves from the marker into any description links.
                  <div
                    aria-labelledby={`${tooltipIdPrefix}-title`}
                    className="absolute top-0 left-0 z-20 max-h-[min(60vh,420px)] w-max max-w-[min(22.5rem,calc(100vw-1rem))] overflow-auto rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-lg"
                    id={`${tooltipIdPrefix}-tooltip`}
                    onBlur={(event) =>
                      handleFocusOut(event, activeHotspot.hotspot.id)
                    }
                    onPointerEnter={cancelHide}
                    onPointerLeave={() => {
                      if (!active?.pinned) {
                        scheduleHide()
                      }
                    }}
                    ref={tooltipRef}
                    role="dialog"
                    style={
                      tooltipPosition
                        ? {
                            transform: `translate(${tooltipPosition.left}px, ${tooltipPosition.top}px)`,
                          }
                        : { visibility: 'hidden' }
                    }
                  >
                    <h2
                      className="mb-1.5 font-semibold"
                      id={`${tooltipIdPrefix}-title`}
                    >
                      {activeHotspot.label}
                    </h2>
                    <div
                      className="preview-description"
                      dangerouslySetInnerHTML={{
                        __html: activeHotspot.descriptionHtml,
                      }}
                    />
                    {activeHotspot.hotspot.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {activeHotspot.hotspot.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
