export class ExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportError'
  }
}

export class ExportMissingImageError extends ExportError {
  constructor(message: string) {
    super(message)
    this.name = 'ExportMissingImageError'
  }
}
