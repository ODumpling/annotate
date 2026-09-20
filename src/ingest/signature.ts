import { IngestError } from './errors'

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]

export function isSupportedImageMimeType(
  value: string,
): value is SupportedImageMimeType {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

type ImageFormat = 'png' | 'jpeg' | 'webp'

const FORMAT_TO_MIME: Record<ImageFormat, SupportedImageMimeType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const EXTENSION_TO_FORMAT: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
}

function extensionOf(fileName: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  )
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (matchesSignature(bytes, PNG_SIGNATURE)) return 'png'
  if (matchesSignature(bytes, JPEG_SIGNATURE)) return 'jpeg'
  if (
    bytes.length >= 12 &&
    fourCC(bytes, 0) === 'RIFF' &&
    fourCC(bytes, 8) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

/**
 * Walks PNG chunks looking for `acTL`, which APNG requires before the first
 * `IDAT`. Chunk order is `length(4) + type(4) + data + crc(4)`, so each step
 * always advances past valid or unrecognized chunks alike.
 */
export function isAnimatedPng(bytes: Uint8Array): boolean {
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset)
    const type = fourCC(bytes, offset + 4)
    if (type === 'acTL') return true
    if (type === 'IDAT' || type === 'IEND') return false
    offset += 8 + length + 4
  }
  return false
}

/** Bit for the Animation flag within a VP8X chunk's flags byte (WebP container spec). */
const WEBP_ANIMATION_FLAG = 0x02

/**
 * Walks RIFF chunks looking for the VP8X animation flag or an `ANIM` chunk,
 * either of which a conformant animated WebP carries. Chunk data is padded
 * to an even byte count.
 */
export function isAnimatedWebp(bytes: Uint8Array): boolean {
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = fourCC(bytes, offset)
    const size = readUint32LE(bytes, offset + 4)
    if (type === 'VP8X' && size >= 1) {
      const flags = bytes[offset + 8]
      if ((flags & WEBP_ANIMATION_FLAG) !== 0) return true
    }
    if (type === 'ANIM') return true
    offset += 8 + size + (size % 2)
  }
  return false
}

export function validateImageSignature(
  header: Uint8Array,
  declaredMimeType: string,
  fileName: string,
): SupportedImageMimeType {
  const extension = extensionOf(fileName)
  const declaredExtensionFormat = extension
    ? EXTENSION_TO_FORMAT[extension]
    : undefined

  const detected = detectImageFormat(header)
  if (detected === null) {
    if (isSupportedImageMimeType(declaredMimeType) || declaredExtensionFormat) {
      throw new IngestError(
        'corrupt-file',
        `File claims to be ${declaredMimeType || `a .${extension} image`} but its contents are not a recognizable image.`,
      )
    }
    throw new IngestError(
      'unsupported-format',
      `Unsupported file type${declaredMimeType ? `: ${declaredMimeType}` : ''}. Supported formats: PNG, JPEG, WebP.`,
    )
  }

  const detectedMimeType = FORMAT_TO_MIME[detected]
  if (
    declaredMimeType &&
    isSupportedImageMimeType(declaredMimeType) &&
    declaredMimeType !== detectedMimeType
  ) {
    throw new IngestError(
      'corrupt-file',
      `File extension or type (${declaredMimeType}) does not match its actual contents (${detectedMimeType}).`,
    )
  }
  if (declaredExtensionFormat && declaredExtensionFormat !== detected) {
    throw new IngestError(
      'corrupt-file',
      `File name (.${extension}) does not match its actual contents (${detectedMimeType}).`,
    )
  }

  if (detected === 'png' && isAnimatedPng(header)) {
    throw new IngestError(
      'animated-unsupported',
      'Animated PNG (APNG) is not supported; use a static image.',
    )
  }
  if (detected === 'webp' && isAnimatedWebp(header)) {
    throw new IngestError(
      'animated-unsupported',
      'Animated WebP is not supported; use a static image.',
    )
  }

  return detectedMimeType
}
