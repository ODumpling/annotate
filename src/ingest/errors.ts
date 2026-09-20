export type IngestErrorCode =
  | 'unsupported-format'
  | 'corrupt-file'
  | 'oversized-bytes'
  | 'oversized-pixels'
  | 'animated-unsupported'
  | 'decode-failed'

export class IngestError extends Error {
  readonly code: IngestErrorCode

  constructor(code: IngestErrorCode, message: string) {
    super(message)
    this.name = 'IngestError'
    this.code = code
  }
}
