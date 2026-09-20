import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
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
const INITIAL_TRANSFORM: ViewportTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
}

export interface ImageViewportProps {
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
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

export function ImageViewport({
  imageUrl,
  naturalWidth,
  naturalHeight,
}: ImageViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const transformRef = useRef<ViewportTransform>(INITIAL_TRANSFORM)
  const [transform, setTransform] =
    useState<ViewportTransform>(INITIAL_TRANSFORM)
  const manualInteractionRef = useRef(false)
  const pointersRef = useRef(new Map<number, ViewportPoint>())
  const pinchRef = useRef<{
    lastDistance: number
    lastAnchor: ViewportPoint
  } | null>(null)
  const panOriginRef = useRef<ViewportPoint | null>(null)

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

  useLayoutEffect(() => {
    // The fit scale depends on a DOM measurement (container width) that
    // isn't available during render, so synchronizing it via setState in a
    // layout effect is the standard React pattern here, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fitToWidth()
    // Re-fit whenever the source image itself changes, including a
    // replacement image with identical dimensions (imageUrl still changes
    // per upload); the current transform is intentionally read via refs,
    // not as a dependency.
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

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const rect = containerRect()
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const factor = clampNumber(
      1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY,
      MIN_WHEEL_FACTOR,
      MAX_WHEEL_FACTOR,
    )
    manualInteractionRef.current = true
    applyTransform(
      zoomAtPoint(
        transformRef.current,
        transformRef.current.scale * factor,
        anchor,
      ),
    )
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    containerRef.current?.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    manualInteractionRef.current = true

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      const rect = containerRect()
      const mid = midpoint(a, b)
      pinchRef.current = {
        // Guard against two pointers starting at the exact same point, which
        // would otherwise make the first ratio a division by zero.
        lastDistance: distance(a, b) || 1,
        lastAnchor: { x: mid.x - rect.left, y: mid.y - rect.top },
      }
      panOriginRef.current = null
    } else if (pointersRef.current.size === 1) {
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
      // Compose the gesture frame-to-frame: first pan by however far the
      // midpoint itself drifted, then zoom around the new midpoint by the
      // incremental distance ratio. This keeps a constant-distance two-finger
      // drag panning correctly, not just a scale change anchored at a point.
      const currentDistance = distance(a, b)
      const panned = panBy(
        transformRef.current,
        anchor.x - pinch.lastAnchor.x,
        anchor.y - pinch.lastAnchor.y,
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

    if (pointersRef.current.size === 1 && panOriginRef.current) {
      const dx = event.clientX - panOriginRef.current.x
      const dy = event.clientY - panOriginRef.current.y
      panOriginRef.current = { x: event.clientX, y: event.clientY }
      applyTransform(panBy(transformRef.current, dx, dy))
    }
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()]
      panOriginRef.current = remaining
    } else {
      panOriginRef.current = null
    }
  }

  const zoomPercent = Math.round(transform.scale * 100)

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div
        role="toolbar"
        aria-label="Zoom controls"
        className="flex items-center gap-2 text-sm"
      >
        <button
          type="button"
          onClick={() => zoomFromCenter(1 / BUTTON_ZOOM_FACTOR)}
        >
          Zoom out
        </button>
        <span data-testid="zoom-level">{zoomPercent}%</span>
        <button
          type="button"
          onClick={() => zoomFromCenter(BUTTON_ZOOM_FACTOR)}
        >
          Zoom in
        </button>
        <button type="button" onClick={fitToWidth}>
          Fit to width
        </button>
      </div>
      <div
        ref={containerRef}
        data-testid="viewport-container"
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div
          data-testid="viewport-content"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
          }}
        >
          <img
            src={imageUrl}
            alt="Uploaded document page"
            width={naturalWidth}
            height={naturalHeight}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}
