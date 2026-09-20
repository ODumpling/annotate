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

export function panBy(
  transform: ViewportTransform,
  dx: number,
  dy: number,
): ViewportTransform {
  return {
    ...transform,
    translateX: transform.translateX + dx,
    translateY: transform.translateY + dy,
  }
}
