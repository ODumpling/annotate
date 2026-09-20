import { ExportError } from './errors'

export const EXPORT_WARN_BYTES = 25 * 1048576
export const EXPORT_BLOCK_BYTES = 100 * 1048576

// A deliberately conservative lower bound for the fixed HTML, CSS, JS, and
// JSON framing. Near-limit exports still receive the exact post-build check.
export const EXPORT_PREFLIGHT_OVERHEAD_BYTES = 4 * 1024

export class ExportSizeError extends ExportError {
  readonly byteLength: number

  constructor(byteLength: number) {
    super(
      `projected export size of ${byteLength} bytes exceeds the ${EXPORT_BLOCK_BYTES}-byte limit`,
    )
    this.name = 'ExportSizeError'
    this.byteLength = byteLength
  }
}

export function evaluateExportSize(byteLength: number): {
  sizeWarning: boolean
} {
  if (byteLength > EXPORT_BLOCK_BYTES) {
    throw new ExportSizeError(byteLength)
  }
  return { sizeWarning: byteLength > EXPORT_WARN_BYTES }
}

export interface ExportAssetEstimate {
  blobBytes: number
  mimeType: string
}

function base64Length(byteLength: number): number {
  return 4 * Math.ceil(byteLength / 3)
}

export function estimateExportLowerBound(
  assets: readonly ExportAssetEstimate[],
): number {
  return assets.reduce(
    (total, asset) =>
      total +
      `data:${asset.mimeType};base64,`.length +
      base64Length(asset.blobBytes),
    EXPORT_PREFLIGHT_OVERHEAD_BYTES,
  )
}

export function evaluateExportPreflight(
  assets: readonly ExportAssetEstimate[],
): void {
  const estimatedByteLength = estimateExportLowerBound(assets)
  if (estimatedByteLength > EXPORT_BLOCK_BYTES) {
    throw new ExportSizeError(estimatedByteLength)
  }
}
