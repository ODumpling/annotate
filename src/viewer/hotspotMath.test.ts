import { describe, expect, it } from 'vitest'
import {
  clientPointToNormalized,
  isRectangleAtLeastRenderedSize,
  rectangleFromPoints,
} from './hotspotMath'

describe('hotspot geometry', () => {
  it.each([
    [
      'down-right',
      { x: 0.2, y: 0.3 },
      { x: 0.7, y: 0.8 },
      { x: 0.2, y: 0.3, w: 0.5, h: 0.5 },
    ],
    [
      'up-left',
      { x: 0.7, y: 0.8 },
      { x: 0.2, y: 0.3 },
      { x: 0.2, y: 0.3, w: 0.5, h: 0.5 },
    ],
    [
      'up-right',
      { x: 0.2, y: 0.8 },
      { x: 0.7, y: 0.3 },
      { x: 0.2, y: 0.3, w: 0.5, h: 0.5 },
    ],
    [
      'down-left',
      { x: 0.7, y: 0.3 },
      { x: 0.2, y: 0.8 },
      { x: 0.2, y: 0.3, w: 0.5, h: 0.5 },
    ],
  ])('normalizes a %s rectangle draw', (_, start, end, expected) => {
    const rectangle = rectangleFromPoints(start, end)
    expect(rectangle.x).toBeCloseTo(expected.x)
    expect(rectangle.y).toBeCloseTo(expected.y)
    expect(rectangle.w).toBeCloseTo(expected.w)
    expect(rectangle.h).toBeCloseTo(expected.h)
  })

  it('maps client coordinates through pan and zoom and clamps to page bounds', () => {
    const transform = { scale: 2, translateX: -100, translateY: 50 }
    const origin = { x: 20, y: 30 }

    expect(
      clientPointToNormalized({ x: 320, y: 180 }, origin, transform, 400, 200),
    ).toEqual({ x: 0.5, y: 0.25 })
    expect(
      clientPointToNormalized(
        { x: -1000, y: 1000 },
        origin,
        transform,
        400,
        200,
      ),
    ).toEqual({ x: 0, y: 1 })
  })

  it('enforces the minimum size in rendered pixels at the active zoom', () => {
    const rectangle = { x: 0, y: 0, w: 0.02, h: 0.02 }

    expect(
      isRectangleAtLeastRenderedSize(rectangle, { scale: 0.5 }, 800, 600, 12),
    ).toBe(false)
    expect(
      isRectangleAtLeastRenderedSize(rectangle, { scale: 2 }, 800, 600, 12),
    ).toBe(true)
  })
})
