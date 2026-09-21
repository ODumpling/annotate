export interface ViewportTransform {
  scale: number
  translateX: number
  translateY: number
}

export interface ViewportPoint {
  x: number
  y: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export function computeFitToWidthScale(
  containerWidth: number,
  imageWidth: number,
): number {
  if (containerWidth <= 0 || imageWidth <= 0) return 1
  return clampZoom(containerWidth / imageWidth)
}

/**
 * Rescales around `anchor` (a point in the container's coordinate space) so
 * the image point currently under the anchor stays under it after the zoom.
 */
export function zoomAtPoint(
  transform: ViewportTransform,
  nextScale: number,
  anchor: ViewportPoint,
): ViewportTransform {
  const scale = clampZoom(nextScale)
  const scaleRatio = scale / transform.scale
  return {
    scale,
    translateX: anchor.x - (anchor.x - transform.translateX) * scaleRatio,
    translateY: anchor.y - (anchor.y - transform.translateY) * scaleRatio,
  }
}

export function zoomByFactor(
  transform: ViewportTransform,
  factor: number,
  anchor: ViewportPoint,
): ViewportTransform {
  return zoomAtPoint(transform, transform.scale * factor, anchor)
}

export interface PanBounds {
  containerWidth: number
  containerHeight: number
  imageWidth: number
  imageHeight: number
}

/** At least this many CSS px of the image stay visible on each axis. */
const MIN_VISIBLE_IMAGE_PX = 24

export function panBy(
  transform: ViewportTransform,
  dx: number,
  dy: number,
  bounds: PanBounds,
): ViewportTransform {
  const translated = {
    ...transform,
    translateX: transform.translateX + dx,
    translateY: transform.translateY + dy,
  }
  const renderedWidth = bounds.imageWidth * transform.scale
  const renderedHeight = bounds.imageHeight * transform.scale
  const minX = MIN_VISIBLE_IMAGE_PX - renderedWidth
  const maxX = bounds.containerWidth - MIN_VISIBLE_IMAGE_PX
  const minY = MIN_VISIBLE_IMAGE_PX - renderedHeight
  const maxY = bounds.containerHeight - MIN_VISIBLE_IMAGE_PX
  return {
    ...translated,
    // A container whose width plus the rendered image width never reaches
    // twice the visible margin yields an empty allowed range; leave that
    // axis unclamped rather than snapping the image.
    translateX:
      minX > maxX
        ? translated.translateX
        : Math.min(maxX, Math.max(minX, translated.translateX)),
    translateY:
      minY > maxY
        ? translated.translateY
        : Math.min(maxY, Math.max(minY, translated.translateY)),
  }
}
