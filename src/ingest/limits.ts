export const BYTES_PER_MIB = 1_048_576

export const IMAGE_BYTE_LIMITS = {
  warnBytes: 20 * BYTES_PER_MIB,
  rejectBytes: 50 * BYTES_PER_MIB,
}

export const IMAGE_PIXEL_LIMITS = {
  warnMegapixels: 40,
  rejectMegapixels: 100,
  rejectMaxDimension: 16_384,
}

export interface ByteLimitCheck {
  bytes: number
  warn: boolean
  reject: boolean
}

export function checkByteSize(bytes: number): ByteLimitCheck {
  return {
    bytes,
    warn: bytes > IMAGE_BYTE_LIMITS.warnBytes,
    reject: bytes > IMAGE_BYTE_LIMITS.rejectBytes,
  }
}

export interface PixelLimitCheck {
  megapixels: number
  warn: boolean
  reject: boolean
}

export function checkPixelDimensions(
  width: number,
  height: number,
): PixelLimitCheck {
  const megapixels = (width * height) / 1_000_000
  const reject =
    megapixels > IMAGE_PIXEL_LIMITS.rejectMegapixels ||
    width > IMAGE_PIXEL_LIMITS.rejectMaxDimension ||
    height > IMAGE_PIXEL_LIMITS.rejectMaxDimension
  return {
    megapixels,
    warn: megapixels > IMAGE_PIXEL_LIMITS.warnMegapixels,
    reject,
  }
}

export function formatMiB(bytes: number): string {
  return `${(bytes / BYTES_PER_MIB).toFixed(1)} MiB`
}
