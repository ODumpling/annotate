import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBlobs, getBlob } from './blobStore'
import type { DecodedImage, ImageDecoder } from './decodeImage'
import { IngestError } from './errors'
import { ingestImage } from './ingestImage'
import { IMAGE_BYTE_LIMITS, IMAGE_PIXEL_LIMITS } from './limits'

function u32be(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function asciiBytes(text: string): number[] {
  return Array.from(text).map((char) => char.charCodeAt(0))
}

function pngChunk(type: string, dataLength = 0): number[] {
  return [
    ...u32be(dataLength),
    ...asciiBytes(type),
    ...new Array<number>(dataLength).fill(0),
    ...u32be(0),
  ]
}

function validPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', 13),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
}

function pngFile(name: string, totalBytes = validPngBytes().length): File {
  const header = validPngBytes()
  const padding = new Uint8Array(Math.max(0, totalBytes - header.length))
  return new File([header, padding] as BlobPart[], name, {
    type: 'image/png',
  })
}

function animatedPngBytesWithLargePadding(): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', 13),
    ...pngChunk('tEXt', 300_000),
    ...pngChunk('acTL', 8),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
}

function fakeDecoder(
  result: Pick<DecodedImage, 'width' | 'height'>,
  closeSpy = vi.fn(),
): ImageDecoder {
  return {
    decode: async () => ({ ...result, close: closeSpy }),
  }
}

beforeEach(() => {
  clearBlobs()
})

describe('ingestImage', () => {
  it('ingests a valid image, stores its blob, and returns its dimensions', async () => {
    const file = pngFile('photo.png')
    const closeSpy = vi.fn()
    const decoder = fakeDecoder({ width: 800, height: 600 }, closeSpy)

    const result = await ingestImage(file, { decoder })

    expect(result).toMatchObject({
      mimeType: 'image/png',
      fileName: 'photo.png',
      width: 800,
      height: 600,
      warnings: [],
    })
    expect(getBlob(result.blobKey)).toBe(file)
    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it('rejects oversized files before reading their contents', async () => {
    const file = new File(
      [new Uint8Array(IMAGE_BYTE_LIMITS.rejectBytes + 1)],
      'huge.png',
      { type: 'image/png' },
    )
    const decode = vi.fn()

    await expect(
      ingestImage(file, { decoder: { decode } }),
    ).rejects.toMatchObject({ code: 'oversized-bytes' })
    expect(decode).not.toHaveBeenCalled()
  })

  it('warns but proceeds for files above the warn threshold', async () => {
    const file = pngFile('large.png', IMAGE_BYTE_LIMITS.warnBytes + 1)
    const decoder = fakeDecoder({ width: 800, height: 600 })

    const result = await ingestImage(file, { decoder })

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/larger than the recommended/)
  })

  it('propagates signature validation errors without decoding', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'fake.png', {
      type: 'image/png',
    })
    const decode = vi.fn()

    await expect(
      ingestImage(file, { decoder: { decode } }),
    ).rejects.toBeInstanceOf(IngestError)
    expect(decode).not.toHaveBeenCalled()
  })

  it('wraps decoder failures as decode-failed', async () => {
    const file = pngFile('broken.png')
    const decoder: ImageDecoder = {
      decode: async () => {
        throw new Error('boom')
      },
    }

    await expect(ingestImage(file, { decoder })).rejects.toMatchObject({
      code: 'decode-failed',
      message: expect.stringContaining('boom'),
    })
  })

  it('rejects non-finite or non-positive decoded dimensions as corrupt', async () => {
    const file = pngFile('zero.png')

    await expect(
      ingestImage(file, { decoder: fakeDecoder({ width: 0, height: 100 }) }),
    ).rejects.toMatchObject({ code: 'corrupt-file' })
    await expect(
      ingestImage(file, {
        decoder: fakeDecoder({ width: Number.NaN, height: 100 }),
      }),
    ).rejects.toMatchObject({ code: 'corrupt-file' })
  })

  it('rejects oversized pixel dimensions after decode', async () => {
    const file = pngFile('big.png')
    const side = Math.ceil(
      Math.sqrt(IMAGE_PIXEL_LIMITS.rejectMegapixels * 1_000_000),
    )

    await expect(
      ingestImage(file, {
        decoder: fakeDecoder({ width: side + 1, height: side + 1 }),
      }),
    ).rejects.toMatchObject({ code: 'oversized-pixels' })
  })

  it('warns for pixel dimensions above the warn threshold', async () => {
    const file = pngFile('warn.png')
    const side = Math.ceil(
      Math.sqrt(IMAGE_PIXEL_LIMITS.warnMegapixels * 1_000_000),
    )

    const result = await ingestImage(file, {
      decoder: fakeDecoder({ width: side + 1, height: side + 1 }),
    })

    expect(
      result.warnings.some((w) => /megapixels/i.test(w) || /MP/.test(w)),
    ).toBe(true)
  })

  it('detects animation even when a chunk larger than any fixed sniff window precedes the marker', async () => {
    const file = new File(
      [animatedPngBytesWithLargePadding()] as BlobPart[],
      'animated.png',
      { type: 'image/png' },
    )

    await expect(
      ingestImage(file, { decoder: fakeDecoder({ width: 800, height: 600 }) }),
    ).rejects.toMatchObject({ code: 'animated-unsupported' })
  })

  it('closes the decoded resource even when a later check throws', async () => {
    const file = pngFile('rejects-after-decode.png')
    const closeSpy = vi.fn()
    const side = Math.ceil(
      Math.sqrt(IMAGE_PIXEL_LIMITS.rejectMegapixels * 1_000_000),
    )

    await expect(
      ingestImage(file, {
        decoder: fakeDecoder({ width: side + 1, height: side + 1 }, closeSpy),
      }),
    ).rejects.toMatchObject({ code: 'oversized-pixels' })
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
