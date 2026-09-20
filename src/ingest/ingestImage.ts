import { putBlob } from './blobStore'
import { browserImageDecoder, type ImageDecoder } from './decodeImage'
import { IngestError } from './errors'
import {
  checkByteSize,
  checkPixelDimensions,
  formatMiB,
  IMAGE_BYTE_LIMITS,
  IMAGE_PIXEL_LIMITS,
} from './limits'
import {
  validateImageSignature,
  type SupportedImageMimeType,
} from './signature'

export interface IngestedImage {
  mimeType: SupportedImageMimeType
  fileName: string
  blobKey: string
  width: number
  height: number
  warnings: string[]
}

export interface IngestImageOptions {
  decoder?: ImageDecoder
}

export async function ingestImage(
  file: File,
  options: IngestImageOptions = {},
): Promise<IngestedImage> {
  const decoder = options.decoder ?? browserImageDecoder
  const warnings: string[] = []

  const byteCheck = checkByteSize(file.size)
  if (byteCheck.reject) {
    throw new IngestError(
      'oversized-bytes',
      `Image is ${formatMiB(file.size)}; the maximum is ${formatMiB(IMAGE_BYTE_LIMITS.rejectBytes)}.`,
    )
  }
  if (byteCheck.warn) {
    warnings.push(
      `Image is ${formatMiB(file.size)}, larger than the recommended ${formatMiB(IMAGE_BYTE_LIMITS.warnBytes)}.`,
    )
  }

  // Read the whole file for signature/animation detection rather than a
  // fixed-size prefix: the byte-size check above already bounds this to at
  // most IMAGE_BYTE_LIMITS.rejectBytes, and a fixed prefix window could be
  // evaded by padding large ancillary chunks before the animation marker.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = validateImageSignature(bytes, file.type, file.name)

  let decoded
  try {
    decoded = await decoder.decode(file)
  } catch (cause) {
    throw new IngestError(
      'decode-failed',
      `Could not read image data: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    )
  }

  try {
    if (
      !Number.isFinite(decoded.width) ||
      !Number.isFinite(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      throw new IngestError(
        'corrupt-file',
        'Image has invalid dimensions and cannot be used.',
      )
    }

    const pixelCheck = checkPixelDimensions(decoded.width, decoded.height)
    if (pixelCheck.reject) {
      throw new IngestError(
        'oversized-pixels',
        `Image is ${decoded.width}×${decoded.height} (${pixelCheck.megapixels.toFixed(1)} MP); the maximum is ${IMAGE_PIXEL_LIMITS.rejectMegapixels} MP or ${IMAGE_PIXEL_LIMITS.rejectMaxDimension}px per side.`,
      )
    }
    if (pixelCheck.warn) {
      warnings.push(
        `Image is ${pixelCheck.megapixels.toFixed(1)} MP, larger than the recommended ${IMAGE_PIXEL_LIMITS.warnMegapixels} MP.`,
      )
    }

    const blobKey = putBlob(file)
    return {
      mimeType,
      fileName: file.name,
      blobKey,
      width: decoded.width,
      height: decoded.height,
      warnings,
    }
  } finally {
    decoded.close()
  }
}
