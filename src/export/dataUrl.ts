const BASE64_CHUNK = 0x8000

export async function blobToDataUrl(
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${mimeType};base64,${base64Encode(bytes)}`
}

function base64Encode(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK),
    )
  }
  return btoa(binary)
}
