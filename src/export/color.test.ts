import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKER_COLOR, normalizeMarkerColor } from './color'

describe('marker color validation', () => {
  it('accepts only six-digit hex colors', () => {
    expect(normalizeMarkerColor('#12abef')).toBe('#12abef')
    expect(normalizeMarkerColor('#12ABEF')).toBe('#12abef')
  })

  it.each([
    ['#fff'],
    ['red'],
    ['rgb(1, 2, 3)'],
    ['#1234567'],
    ['#12345g'],
    ['javascript:alert(1)'],
    [undefined],
    [''],
  ])('falls back to the default for %j', (color) => {
    expect(normalizeMarkerColor(color)).toBe(DEFAULT_MARKER_COLOR)
  })
})
