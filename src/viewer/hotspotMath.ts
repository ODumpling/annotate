import type { ViewportPoint, ViewportTransform } from './viewportMath'

export interface NormalizedRectangle {
  x: number
  y: number
  w: number
  h: number
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function clientPointToNormalized(
  clientPoint: ViewportPoint,
  containerOrigin: ViewportPoint,
  transform: ViewportTransform,
  naturalWidth: number,
  naturalHeight: number,
): ViewportPoint {
  const imageX =
    (clientPoint.x - containerOrigin.x - transform.translateX) / transform.scale
  const imageY =
    (clientPoint.y - containerOrigin.y - transform.translateY) / transform.scale

  return {
    x: clamp01(imageX / naturalWidth),
    y: clamp01(imageY / naturalHeight),
  }
}

export function rectangleFromPoints(
  start: ViewportPoint,
  end: ViewportPoint,
): NormalizedRectangle {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return {
    x,
    y,
    w: Math.max(start.x, end.x) - x,
    h: Math.max(start.y, end.y) - y,
  }
}

export function renderedRectangleSize(
  rectangle: NormalizedRectangle,
  transform: Pick<ViewportTransform, 'scale'>,
  naturalWidth: number,
  naturalHeight: number,
) {
  return {
    width: rectangle.w * naturalWidth * transform.scale,
    height: rectangle.h * naturalHeight * transform.scale,
  }
}

export function isRectangleAtLeastRenderedSize(
  rectangle: NormalizedRectangle,
  transform: Pick<ViewportTransform, 'scale'>,
  naturalWidth: number,
  naturalHeight: number,
  minimumPixels: number,
) {
  const size = renderedRectangleSize(
    rectangle,
    transform,
    naturalWidth,
    naturalHeight,
  )
  return size.width >= minimumPixels && size.height >= minimumPixels
}
