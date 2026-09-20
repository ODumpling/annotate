import { describe, expect, it } from 'vitest'
import {
  BYTES_PER_MIB,
  checkByteSize,
  checkPixelDimensions,
  formatMiB,
  IMAGE_BYTE_LIMITS,
  IMAGE_PIXEL_LIMITS,
} from './limits'

describe('checkByteSize', () => {
  it('passes for sizes at or below the warn threshold', () => {
    expect(checkByteSize(IMAGE_BYTE_LIMITS.warnBytes)).toEqual({
      bytes: IMAGE_BYTE_LIMITS.warnBytes,
      warn: false,
      reject: false,
    })
  })

  it('warns above the warn threshold but at or below the reject threshold', () => {
    const result = checkByteSize(IMAGE_BYTE_LIMITS.warnBytes + 1)
    expect(result.warn).toBe(true)
    expect(result.reject).toBe(false)
  })

  it('rejects above the reject threshold', () => {
    const result = checkByteSize(IMAGE_BYTE_LIMITS.rejectBytes + 1)
    expect(result.warn).toBe(true)
    expect(result.reject).toBe(true)
  })
})

describe('checkPixelDimensions', () => {
  it('passes for dimensions at or below the warn threshold', () => {
    const result = checkPixelDimensions(1000, 1000)
    expect(result.warn).toBe(false)
    expect(result.reject).toBe(false)
  })

  it('warns above the megapixel warn threshold', () => {
    const side =
      Math.ceil(Math.sqrt(IMAGE_PIXEL_LIMITS.warnMegapixels * 1_000_000)) + 1
    const result = checkPixelDimensions(side, side)
    expect(result.warn).toBe(true)
    expect(result.reject).toBe(false)
  })

  it('rejects above the megapixel reject threshold', () => {
    const side =
      Math.ceil(Math.sqrt(IMAGE_PIXEL_LIMITS.rejectMegapixels * 1_000_000)) + 1
    const result = checkPixelDimensions(side, side)
    expect(result.reject).toBe(true)
  })

  it('rejects when either dimension exceeds the max dimension even under the megapixel cap', () => {
    const result = checkPixelDimensions(
      IMAGE_PIXEL_LIMITS.rejectMaxDimension + 1,
      10,
    )
    expect(result.reject).toBe(true)
  })
})

describe('formatMiB', () => {
  it('formats bytes as MiB with one decimal', () => {
    expect(formatMiB(BYTES_PER_MIB * 2.5)).toBe('2.5 MiB')
  })
})
