import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  computeFitToWidthScale,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  zoomAtPoint,
  zoomByFactor,
  type ViewportTransform,
} from './viewportMath'

function imagePointUnder(
  transform: ViewportTransform,
  screenPoint: { x: number; y: number },
) {
  return {
    x: (screenPoint.x - transform.translateX) / transform.scale,
    y: (screenPoint.y - transform.translateY) / transform.scale,
  }
}

describe('clampZoom', () => {
  it('passes values within range through unchanged', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM)
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM)
  })

  it('clamps below the minimum and above the maximum', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(-5)).toBe(MIN_ZOOM)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
  })
})

describe('computeFitToWidthScale', () => {
  it('scales the image to fill the container width', () => {
    expect(computeFitToWidthScale(800, 400)).toBe(2)
    expect(computeFitToWidthScale(400, 800)).toBe(0.5)
  })

  it('clamps the fit scale to the supported zoom range', () => {
    expect(computeFitToWidthScale(10, 10_000)).toBe(MIN_ZOOM)
    expect(computeFitToWidthScale(10_000, 10)).toBe(MAX_ZOOM)
  })

  it('defaults to 1 when container or image width is unknown', () => {
    expect(computeFitToWidthScale(0, 800)).toBe(1)
    expect(computeFitToWidthScale(800, 0)).toBe(1)
  })
})

describe('zoomAtPoint', () => {
  it('keeps the image point under the anchor fixed across zoom levels', () => {
    const transform: ViewportTransform = {
      scale: 1,
      translateX: -50,
      translateY: -20,
    }
    const anchor = { x: 120, y: 80 }
    const before = imagePointUnder(transform, anchor)

    const after = zoomAtPoint(transform, 2, anchor)

    expect(after.scale).toBe(2)
    const afterPoint = imagePointUnder(after, anchor)
    expect(afterPoint.x).toBeCloseTo(before.x)
    expect(afterPoint.y).toBeCloseTo(before.y)
  })

  it('clamps the resulting scale', () => {
    const transform: ViewportTransform = {
      scale: 1,
      translateX: 0,
      translateY: 0,
    }
    expect(zoomAtPoint(transform, 100, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM)
    expect(zoomAtPoint(transform, 0, { x: 0, y: 0 }).scale).toBe(MIN_ZOOM)
  })

  it('leaves translation unchanged when the anchor equals the origin and scale is unchanged', () => {
    const transform: ViewportTransform = {
      scale: 1.5,
      translateX: 10,
      translateY: 5,
    }
    const result = zoomAtPoint(transform, 1.5, { x: 0, y: 0 })
    expect(result).toEqual(transform)
  })
})

describe('zoomByFactor', () => {
  it('multiplies the current scale by the factor', () => {
    const transform: ViewportTransform = {
      scale: 2,
      translateX: 0,
      translateY: 0,
    }
    const result = zoomByFactor(transform, 1.5, { x: 0, y: 0 })
    expect(result.scale).toBeCloseTo(3)
  })
})

describe('panBy', () => {
  it('adds the delta to the current translation without changing scale', () => {
    const transform: ViewportTransform = {
      scale: 1.5,
      translateX: 10,
      translateY: -5,
    }
    const result = panBy(transform, 4, 6)
    expect(result).toEqual({ scale: 1.5, translateX: 14, translateY: 1 })
  })
})
