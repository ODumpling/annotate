import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Hotspot } from '../model'
import type { ProjectActions } from '../store'
import {
  clientPointToNormalized,
  isRectangleAtLeastRenderedSize,
  rectangleFromPoints,
  type NormalizedRectangle,
} from './hotspotMath'
import {
  computeFitToWidthScale,
  panBy,
  zoomAtPoint,
  type ViewportPoint,
  type ViewportTransform,
} from './viewportMath'

const WHEEL_ZOOM_SENSITIVITY = 0.0015
const MIN_WHEEL_FACTOR = 0.5
const MAX_WHEEL_FACTOR = 2
const BUTTON_ZOOM_FACTOR = 1.25
const POINT_GESTURE_MAX_PX = 4
// Touch taps drift farther than mouse clicks before lifting. Treat any
// touch gesture below the rectangle minimum as a tap so the 4-12px band
// between the mouse threshold and MIN_RECTANGLE_RENDERED_PX creates a
// point instead of silently creating nothing.
const TOUCH_POINT_GESTURE_MAX_PX = 12

/** Both rendered dimensions must reach this size for a drag to create a rect. */
export const MIN_RECTANGLE_RENDERED_PX = 12

/** WCAG 2.2 SC 2.5.8 (AA) minimum target size, in CSS px, at any zoom level. */
export const MIN_INTERACTIVE_PX = 24

const INITIAL_TRANSFORM: ViewportTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
}

const TOOLBAR_BUTTON_CLASS =
  'min-h-[2rem] rounded border border-slate-500 px-3 py-1.5 aria-pressed:bg-slate-800 disabled:opacity-50'

export type ViewerMode = 'pan' | 'draw'

type HotspotActions = Pick<
  ProjectActions,
  | 'createHotspot'
  | 'selectHotspot'
  | 'moveHotspot'
  | 'resizeHotspot'
  | 'deleteHotspot'
>

export interface ImageViewportEditing {
  pageId: string
  hotspots: readonly Hotspot[]
  selectedHotspotId: string | null
  actions: HotspotActions
}

export interface ImageViewportProps {
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
  editing?: ImageViewportEditing
}

interface DrawGesture {
  pointerId: number
  pointerType: string
  startClient: ViewportPoint
  start: ViewportPoint
}

interface MoveGesture {
  pointerId: number
  hotspotId: string
  startClient: ViewportPoint
  startX: number
  startY: number
}

interface ResizeGesture extends MoveGesture {
  startWidth: number
  startHeight: number
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function distance(a: ViewportPoint, b: ViewportPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: ViewportPoint, b: ViewportPoint): ViewportPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function hotspotLabel(hotspot: Hotspot) {
  return hotspot.title.trim() || `Hotspot ${hotspot.order + 1}`
}

export function ImageViewport({
  imageUrl,
  naturalWidth,
  naturalHeight,
  editing,
}: ImageViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const transformRef = useRef<ViewportTransform>(INITIAL_TRANSFORM)
  const [transform, setTransform] =
    useState<ViewportTransform>(INITIAL_TRANSFORM)
  const [mode, setMode] = useState<ViewerMode>('pan')
  const [imageStatus, setImageStatus] = useState<
    'loading' | 'loaded' | 'error'
  >('loading')
  const [draftRectangle, setDraftRectangle] =
    useState<NormalizedRectangle | null>(null)
  const manualInteractionRef = useRef(false)
  const pointersRef = useRef(new Map<number, ViewportPoint>())
  const pinchRef = useRef<{
    lastDistance: number
    lastAnchor: ViewportPoint
  } | null>(null)
  const panOriginRef = useRef<ViewportPoint | null>(null)
  const drawGestureRef = useRef<DrawGesture | null>(null)
  const moveGestureRef = useRef<MoveGesture | null>(null)
  const resizeGestureRef = useRef<ResizeGesture | null>(null)

  function containerRect() {
    return (
      containerRef.current?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      }
    )
  }

  function applyTransform(next: ViewportTransform) {
    transformRef.current = next
    setTransform(next)
  }

  function fitToWidth() {
    const rect = containerRect()
    manualInteractionRef.current = false
    applyTransform({
      scale: computeFitToWidthScale(rect.width, naturalWidth),
      translateX: 0,
      translateY: 0,
    })
  }

  function normalizedPoint(clientX: number, clientY: number) {
    const rect = containerRect()
    return clientPointToNormalized(
      { x: clientX, y: clientY },
      { x: rect.left, y: rect.top },
      transformRef.current,
      naturalWidth,
      naturalHeight,
    )
  }

  function normalizedDelta(start: ViewportPoint, end: ViewportPoint) {
    return {
      x: (end.x - start.x) / (naturalWidth * transformRef.current.scale),
      y: (end.y - start.y) / (naturalHeight * transformRef.current.scale),
    }
  }

  function clearEditingGestures() {
    drawGestureRef.current = null
    moveGestureRef.current = null
    resizeGestureRef.current = null
    setDraftRectangle(null)
  }

  function startPinch() {
    const [a, b] = [...pointersRef.current.values()]
    const rect = containerRect()
    const mid = midpoint(a, b)
    pinchRef.current = {
      lastDistance: distance(a, b) || 1,
      lastAnchor: { x: mid.x - rect.left, y: mid.y - rect.top },
    }
    panOriginRef.current = null
    clearEditingGestures()
  }

  function panBounds() {
    const rect = containerRect()
    return {
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageWidth: naturalWidth,
      imageHeight: naturalHeight,
    }
  }

  useLayoutEffect(() => {
    // The fit scale depends on a DOM measurement unavailable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fitToWidth()
    clearEditingGestures()
    // A new image source needs to report its own load/error outcome even if
    // the previous one already finished loading.
    setImageStatus('loading')
    // Re-fit whenever the source image itself changes, including a replacement
    // with identical dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, naturalWidth, naturalHeight])

  useLayoutEffect(() => {
    function handleWindowResize() {
      if (!manualInteractionRef.current) fitToWidth()
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalWidth])

  function zoomFromCenter(factor: number) {
    const rect = containerRect()
    manualInteractionRef.current = true
    applyTransform(
      zoomAtPoint(transformRef.current, transformRef.current.scale * factor, {
        x: rect.width / 2,
        y: rect.height / 2,
      }),
    )
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // React registers its delegated wheel listener as passive, so
    // preventDefault from an onWheel prop is ignored in real browsers and
    // the page scrolls while zooming. A native non-passive listener is
    // required to actually cancel the default.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const factor = clampNumber(
        1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY,
        MIN_WHEEL_FACTOR,
        MAX_WHEEL_FACTOR,
      )
      manualInteractionRef.current = true
      const next = zoomAtPoint(
        transformRef.current,
        transformRef.current.scale * factor,
        anchor,
      )
      transformRef.current = next
      setTransform(next)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    containerRef.current?.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    manualInteractionRef.current = true

    if (pointersRef.current.size === 2) {
      startPinch()
    } else if (pointersRef.current.size === 1 && mode === 'draw' && editing) {
      editing.actions.selectHotspot(null)
      drawGestureRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClient: { x: event.clientX, y: event.clientY },
        start: normalizedPoint(event.clientX, event.clientY),
      }
      panOriginRef.current = null
    } else if (pointersRef.current.size === 1) {
      editing?.actions.selectHotspot(null)
      panOriginRef.current = { x: event.clientX, y: event.clientY }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      const rect = containerRect()
      const mid = midpoint(a, b)
      const anchor = { x: mid.x - rect.left, y: mid.y - rect.top }
      const pinch = pinchRef.current
      const currentDistance = distance(a, b)
      const panned = panBy(
        transformRef.current,
        anchor.x - pinch.lastAnchor.x,
        anchor.y - pinch.lastAnchor.y,
        panBounds(),
      )
      const zoomed = zoomAtPoint(
        panned,
        panned.scale * (currentDistance / pinch.lastDistance),
        anchor,
      )
      pinchRef.current = {
        lastDistance: currentDistance || 1,
        lastAnchor: anchor,
      }
      applyTransform(zoomed)
      return
    }

    const drawGesture = drawGestureRef.current
    if (
      mode === 'draw' &&
      drawGesture?.pointerId === event.pointerId &&
      pointersRef.current.size === 1
    ) {
      setDraftRectangle(
        rectangleFromPoints(
          drawGesture.start,
          normalizedPoint(event.clientX, event.clientY),
        ),
      )
      return
    }

    if (pointersRef.current.size === 1 && panOriginRef.current) {
      const dx = event.clientX - panOriginRef.current.x
      const dy = event.clientY - panOriginRef.current.y
      panOriginRef.current = { x: event.clientX, y: event.clientY }
      applyTransform(panBy(transformRef.current, dx, dy, panBounds()))
    }
  }

  function finishDraw(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = drawGestureRef.current
    if (!editing || gesture?.pointerId !== event.pointerId) return

    const end = normalizedPoint(event.clientX, event.clientY)
    const clientDistance = distance(gesture.startClient, {
      x: event.clientX,
      y: event.clientY,
    })
    const hotspotId = crypto.randomUUID()

    if (
      clientDistance <=
      (gesture.pointerType === 'touch'
        ? TOUCH_POINT_GESTURE_MAX_PX
        : POINT_GESTURE_MAX_PX)
    ) {
      editing.actions.createHotspot({
        id: hotspotId,
        pageId: editing.pageId,
        shape: 'point',
        x: end.x,
        y: end.y,
        title: '',
        description: '',
        tags: [],
      })
      editing.actions.selectHotspot(hotspotId)
      return
    }

    const rectangle = rectangleFromPoints(gesture.start, end)
    if (
      isRectangleAtLeastRenderedSize(
        rectangle,
        transformRef.current,
        naturalWidth,
        naturalHeight,
        MIN_RECTANGLE_RENDERED_PX,
      )
    ) {
      editing.actions.createHotspot({
        id: hotspotId,
        pageId: editing.pageId,
        shape: 'rect',
        ...rectangle,
        title: '',
        description: '',
        tags: [],
      })
      editing.actions.selectHotspot(hotspotId)
    }
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (drawGestureRef.current?.pointerId === event.pointerId) {
      finishDraw(event)
    }
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 1 && mode === 'pan') {
      const [remaining] = [...pointersRef.current.values()]
      panOriginRef.current = remaining
    } else {
      panOriginRef.current = null
    }
    drawGestureRef.current = null
    setDraftRectangle(null)
  }

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId)
    pinchRef.current = null
    panOriginRef.current = null
    clearEditingGestures()
  }

  function beginMove(event: ReactPointerEvent<HTMLElement>, hotspot: Hotspot) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    // Register with the container gesture layer so its endPointer and
    // cancelPointer cleanup track this pointer, and so a second finger
    // landing anywhere in the viewport can promote the drag to a pinch
    // (mirroring the draw-gesture cancellation in handlePointerDown).
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointersRef.current.size === 2) {
      startPinch()
      return
    }
    editing?.actions.selectHotspot(hotspot.id)
    moveGestureRef.current = {
      pointerId: event.pointerId,
      hotspotId: hotspot.id,
      startClient: { x: event.clientX, y: event.clientY },
      startX: hotspot.x,
      startY: hotspot.y,
    }
  }

  function moveSelected(event: ReactPointerEvent<HTMLElement>) {
    const gesture = moveGestureRef.current
    if (!editing || gesture?.pointerId !== event.pointerId) return
    event.stopPropagation()
    const delta = normalizedDelta(gesture.startClient, {
      x: event.clientX,
      y: event.clientY,
    })
    editing.actions.moveHotspot(
      gesture.hotspotId,
      gesture.startX + delta.x,
      gesture.startY + delta.y,
    )
  }

  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    hotspot: Extract<Hotspot, { shape: 'rect' }>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointersRef.current.size === 2) {
      startPinch()
      return
    }
    editing?.actions.selectHotspot(hotspot.id)
    resizeGestureRef.current = {
      pointerId: event.pointerId,
      hotspotId: hotspot.id,
      startClient: { x: event.clientX, y: event.clientY },
      startX: hotspot.x,
      startY: hotspot.y,
      startWidth: hotspot.w,
      startHeight: hotspot.h,
    }
  }

  function resizeSelected(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = resizeGestureRef.current
    if (!editing || gesture?.pointerId !== event.pointerId) return
    event.stopPropagation()
    const delta = normalizedDelta(gesture.startClient, {
      x: event.clientX,
      y: event.clientY,
    })
    editing.actions.resizeHotspot(gesture.hotspotId, {
      x: gesture.startX,
      y: gesture.startY,
      w: clampNumber(
        gesture.startWidth + delta.x,
        Number.EPSILON,
        1 - gesture.startX,
      ),
      h: clampNumber(
        gesture.startHeight + delta.y,
        Number.EPSILON,
        1 - gesture.startY,
      ),
    })
  }

  function handleHotspotKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    hotspot: Hotspot,
  ) {
    if (!editing) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      editing.actions.deleteHotspot(hotspot.id)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      editing.actions.selectHotspot(hotspot.id)
    }
  }

  const zoomPercent = Math.round(transform.scale * 100)
  const selectedHotspot = editing?.hotspots.find(
    (hotspot) => hotspot.id === editing.selectedHotspotId,
  )
  const orderedHotspots = editing
    ? [...editing.hotspots].sort((left, right) => left.order - right.order)
    : []

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div
        role="toolbar"
        aria-label="Viewport controls"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={() => zoomFromCenter(1 / BUTTON_ZOOM_FACTOR)}
        >
          Zoom out
        </button>
        <span data-testid="zoom-level">{zoomPercent}%</span>
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={() => zoomFromCenter(BUTTON_ZOOM_FACTOR)}
        >
          Zoom in
        </button>
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={fitToWidth}
        >
          Fit to width
        </button>
        {editing && (
          <>
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASS}
              aria-pressed={mode === 'pan'}
              onClick={() => setMode('pan')}
            >
              Pan
            </button>
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASS}
              aria-pressed={mode === 'draw'}
              onClick={() => setMode('draw')}
            >
              Draw hotspot
            </button>
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASS}
              disabled={!selectedHotspot}
              onClick={() => {
                if (selectedHotspot) {
                  editing.actions.deleteHotspot(selectedHotspot.id)
                }
              }}
            >
              Delete selected hotspot
            </button>
          </>
        )}
      </div>
      <div
        ref={containerRef}
        data-testid="viewport-container"
        data-mode={mode}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
          mode === 'draw' ? 'cursor-crosshair' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
      >
        <div
          data-testid="viewport-content"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: naturalWidth,
            height: naturalHeight,
            transformOrigin: '0 0',
            transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
          }}
        >
          {imageStatus === 'loading' && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-slate-800/40 text-sm text-slate-300"
            >
              Loading image…
            </div>
          )}
          {imageStatus === 'error' && (
            <div
              role="alert"
              className="absolute inset-0 flex items-center justify-center bg-slate-800/40 text-sm text-red-300"
            >
              Could not load the image.
            </div>
          )}
          <img
            src={imageUrl}
            alt="Uploaded document page"
            width={naturalWidth}
            height={naturalHeight}
            draggable={false}
            className={`block ${imageStatus === 'loaded' ? '' : 'invisible'}`}
            onLoad={() => setImageStatus('loaded')}
            onError={() => setImageStatus('error')}
          />
          {editing &&
            orderedHotspots.map((hotspot) => {
              const selected = hotspot.id === editing.selectedHotspotId
              const label = hotspotLabel(hotspot)
              const commonStyle = {
                position: 'absolute' as const,
                left: `${hotspot.x * 100}%`,
                top: `${hotspot.y * 100}%`,
              }

              if (hotspot.shape === 'point') {
                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    data-hotspot-id={hotspot.id}
                    className={`h-7 w-7 rounded-full border-2 bg-sky-500/70 ${
                      selected
                        ? 'border-yellow-300 ring-2 ring-yellow-300'
                        : 'border-white'
                    }`}
                    style={{
                      ...commonStyle,
                      // Points render at a fixed 28px regardless of zoom —
                      // without this, a 10-400% zoom range would shrink the
                      // marker below the WCAG 2.2 24px minimum target size
                      // (translate first, in the element's own pre-scale
                      // space, then scale around the now-centered origin so
                      // the anchor point doesn't drift).
                      transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
                    }}
                    onClick={() => editing.actions.selectHotspot(hotspot.id)}
                    onKeyDown={(event) => handleHotspotKeyDown(event, hotspot)}
                    onPointerDown={(event) => beginMove(event, hotspot)}
                    onPointerMove={moveSelected}
                    onPointerUp={() => {
                      // Bubbles to the container so endPointer retires this
                      // pointer from the shared gesture map.
                      moveGestureRef.current = null
                    }}
                    onPointerCancel={() => {
                      moveGestureRef.current = null
                    }}
                  />
                )
              }

              // A rectangle's visible bounds follow its actual normalized
              // geometry (never distorted), but a rectangle drawn small
              // and/or viewed at a low zoom can render well under the WCAG
              // 2.2 24px target-size minimum. Grow only the invisible hit
              // area (not the visible border) to compensate, so tiny or
              // zoomed-out rectangles stay tappable without visually
              // misrepresenting their size.
              const renderedWidth = hotspot.w * naturalWidth * transform.scale
              const renderedHeight = hotspot.h * naturalHeight * transform.scale
              // Independent per-axis growth: a uniform factor derived from
              // the smaller dimension would over-grow a thin, wide (or
              // tall, narrow) rectangle along its already-adequate axis.
              const hitAreaGrowthX = Math.max(
                1,
                MIN_INTERACTIVE_PX / renderedWidth,
              )
              const hitAreaGrowthY = Math.max(
                1,
                MIN_INTERACTIVE_PX / renderedHeight,
              )

              return (
                <div
                  key={hotspot.id}
                  data-hotspot-id={hotspot.id}
                  className={`absolute border-2 bg-sky-500/20 ${
                    selected
                      ? 'border-yellow-300 ring-2 ring-yellow-300'
                      : 'border-sky-300'
                  }`}
                  style={{
                    ...commonStyle,
                    width: `${hotspot.w * 100}%`,
                    height: `${hotspot.h * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    className="absolute inset-0 h-full w-full cursor-move bg-transparent"
                    style={{
                      transform: `scale(${hitAreaGrowthX}, ${hitAreaGrowthY})`,
                    }}
                    onClick={() => editing.actions.selectHotspot(hotspot.id)}
                    onKeyDown={(event) => handleHotspotKeyDown(event, hotspot)}
                    onPointerDown={(event) => beginMove(event, hotspot)}
                    onPointerMove={moveSelected}
                    onPointerUp={() => {
                      // Bubbles to the container so endPointer retires this
                      // pointer from the shared gesture map.
                      moveGestureRef.current = null
                    }}
                    onPointerCancel={() => {
                      moveGestureRef.current = null
                    }}
                  />
                  {selected && (
                    <button
                      type="button"
                      aria-label={`Resize ${label}`}
                      className="absolute -right-3 -bottom-3 h-6 w-6 cursor-se-resize rounded-sm border border-slate-950 bg-yellow-300"
                      style={{ transform: `scale(${1 / transform.scale})` }}
                      onPointerDown={(event) => beginResize(event, hotspot)}
                      onPointerMove={resizeSelected}
                      onPointerUp={() => {
                        resizeGestureRef.current = null
                      }}
                      onPointerCancel={() => {
                        resizeGestureRef.current = null
                      }}
                    />
                  )}
                </div>
              )
            })}
          {draftRectangle && (
            <div
              data-testid="draft-rectangle"
              className="pointer-events-none absolute border-2 border-dashed border-yellow-300 bg-yellow-300/10"
              style={{
                left: `${draftRectangle.x * 100}%`,
                top: `${draftRectangle.y * 100}%`,
                width: `${draftRectangle.w * 100}%`,
                height: `${draftRectangle.h * 100}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
