const blobs = new Map<string, Blob>()

export function putBlob(blob: Blob): string {
  const blobKey = crypto.randomUUID()
  blobs.set(blobKey, blob)
  return blobKey
}

export function getBlob(blobKey: string): Blob | undefined {
  return blobs.get(blobKey)
}

export function deleteBlob(blobKey: string): void {
  blobs.delete(blobKey)
}

export function clearBlobs(): void {
  blobs.clear()
}
