import { describe, expect, it } from 'vitest'
import { IngestError } from './errors'
import {
  detectImageFormat,
  isAnimatedPng,
  isAnimatedWebp,
  validateImageSignature,
} from './signature'

function bytesFrom(values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function asciiBytes(text: string): number[] {
  return Array.from(text).map((char) => char.charCodeAt(0))
}

function u32be(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function u32le(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngChunk(type: string, dataLength = 0): number[] {
  return [
    ...u32be(dataLength),
    ...asciiBytes(type),
    ...new Array<number>(dataLength).fill(0),
    ...u32be(0), // crc placeholder, never inspected
  ]
}

function staticPng(): Uint8Array {
  return bytesFrom([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', 13),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
}

function animatedPng(): Uint8Array {
  return bytesFrom([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', 13),
    ...pngChunk('acTL', 8),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
}

function animatedPngWithLargePadding(): Uint8Array {
  return bytesFrom([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', 13),
    ...pngChunk('tEXt', 300_000), // pushes acTL well past any fixed sniff window
    ...pngChunk('acTL', 8),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
}

function jpegBytes(): Uint8Array {
  return bytesFrom([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}

function riffChunk(type: string, data: number[] = []): number[] {
  const padding = data.length % 2 === 0 ? 0 : 1
  return [
    ...asciiBytes(type),
    ...u32le(data.length),
    ...data,
    ...new Array<number>(padding).fill(0),
  ]
}

function vp8xChunk(flags: number): number[] {
  return riffChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}

function riff(chunks: number[][]): Uint8Array {
  const payload = chunks.flat()
  return bytesFrom([
    ...asciiBytes('RIFF'),
    ...u32le(4 + payload.length),
    ...asciiBytes('WEBP'),
    ...payload,
  ])
}

function staticWebp(): Uint8Array {
  return riff([vp8xChunk(0x00)])
}

function animatedWebpViaAnimChunk(): Uint8Array {
  return riff([vp8xChunk(0x00), riffChunk('ANIM', new Array(6).fill(0))])
}

function animatedWebpViaVp8xFlag(): Uint8Array {
  return riff([vp8xChunk(0x02)])
}

function animatedWebpWithLargePadding(): Uint8Array {
  return riff([
    riffChunk('EXIF', new Array(300_000).fill(0)), // pushes VP8X past any fixed sniff window
    vp8xChunk(0x02),
  ])
}

describe('detectImageFormat', () => {
  it('detects png, jpeg, and webp from magic bytes', () => {
    expect(detectImageFormat(staticPng())).toBe('png')
    expect(detectImageFormat(jpegBytes())).toBe('jpeg')
    expect(detectImageFormat(staticWebp())).toBe('webp')
  })

  it('returns null for unrecognized bytes', () => {
    expect(detectImageFormat(bytesFrom([0x00, 0x01, 0x02, 0x03]))).toBeNull()
    expect(detectImageFormat(bytesFrom([]))).toBeNull()
  })
})

describe('isAnimatedPng', () => {
  it('is false for a static png', () => {
    expect(isAnimatedPng(staticPng())).toBe(false)
  })

  it('is true when an acTL chunk precedes IDAT', () => {
    expect(isAnimatedPng(animatedPng())).toBe(true)
  })

  it('is true even when a large chunk precedes acTL', () => {
    expect(isAnimatedPng(animatedPngWithLargePadding())).toBe(true)
  })

  it('does not hang or throw on a truncated buffer', () => {
    expect(isAnimatedPng(bytesFrom(PNG_SIGNATURE))).toBe(false)
  })
})

describe('isAnimatedWebp', () => {
  it('is false for a static webp', () => {
    expect(isAnimatedWebp(staticWebp())).toBe(false)
  })

  it('is true when an ANIM chunk is present', () => {
    expect(isAnimatedWebp(animatedWebpViaAnimChunk())).toBe(true)
  })

  it('is true when the VP8X animation flag is set, even without a separate ANIM chunk', () => {
    expect(isAnimatedWebp(animatedWebpViaVp8xFlag())).toBe(true)
  })

  it('is true even when a large chunk precedes VP8X', () => {
    expect(isAnimatedWebp(animatedWebpWithLargePadding())).toBe(true)
  })

  it('does not hang or throw on a truncated buffer', () => {
    expect(isAnimatedWebp(bytesFrom(asciiBytes('RIFF')))).toBe(false)
  })
})

describe('validateImageSignature', () => {
  it('accepts matching signature, declared mime type, and extension', () => {
    expect(validateImageSignature(staticPng(), 'image/png', 'a.png')).toBe(
      'image/png',
    )
    expect(validateImageSignature(jpegBytes(), 'image/jpeg', 'a.jpg')).toBe(
      'image/jpeg',
    )
    expect(validateImageSignature(staticWebp(), 'image/webp', 'a.webp')).toBe(
      'image/webp',
    )
  })

  it('trusts the signature over an empty declared mime type and extension', () => {
    expect(validateImageSignature(staticPng(), '', 'upload')).toBe('image/png')
  })

  it('rejects unrecognized bytes as unsupported format', () => {
    try {
      validateImageSignature(bytesFrom([1, 2, 3]), 'text/plain', 'a.txt')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(IngestError)
      expect((error as IngestError).code).toBe('unsupported-format')
    }
  })

  it('rejects unrecognized bytes claiming a supported mime type as corrupt', () => {
    try {
      validateImageSignature(bytesFrom([1, 2, 3]), 'image/png', 'a.png')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('corrupt-file')
    }
  })

  it('rejects unrecognized bytes claiming a supported extension as corrupt', () => {
    try {
      validateImageSignature(bytesFrom([1, 2, 3]), '', 'a.png')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('corrupt-file')
    }
  })

  it('rejects a mismatch between declared mime type and detected contents', () => {
    try {
      validateImageSignature(staticPng(), 'image/jpeg', 'a.png')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('corrupt-file')
    }
  })

  it('rejects a mismatch between file extension and detected contents', () => {
    try {
      validateImageSignature(staticPng(), '', 'a.jpg')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('corrupt-file')
    }
  })

  it('rejects animated png and webp', () => {
    try {
      validateImageSignature(animatedPng(), 'image/png', 'a.png')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('animated-unsupported')
    }
    try {
      validateImageSignature(animatedWebpViaAnimChunk(), 'image/webp', 'a.webp')
      expect.unreachable()
    } catch (error) {
      expect((error as IngestError).code).toBe('animated-unsupported')
    }
  })
})
