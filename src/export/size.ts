import { ExportError } from './errors'

export const EXPORT_WARN_BYTES = 25 * 1048576
export const EXPORT_BLOCK_BYTES = 100 * 1048576

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
