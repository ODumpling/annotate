import { describe, expect, it } from 'vitest'
import { blobToDataUrl } from './dataUrl'

describe('blob to data URL conversion', () => {
  it('encodes a small blob with the requested MIME type', async () => {
    const blob = new Blob([new Uint8Array([104, 105])])
    await expect(blobToDataUrl(blob, 'image/png')).resolves.toBe(
      'data:image/png;base64,aGk=',
    )
  })

  it('round-trips large binary payloads through the chunked encoder', async () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, index) =>
      Math.floor(Math.random() * 256) === 0 ? 1 : (index * 31 + 7) % 256,
    )
    const dataUrl = await blobToDataUrl(new Blob([bytes]), 'image/webp')
    expect(dataUrl.startsWith('data:image/webp;base64,')).toBe(true)
    const base64 = dataUrl.slice('data:image/webp;base64,'.length)
    const binary = atob(base64)
    expect(binary.length).toBe(bytes.length)
    expect(binary.charCodeAt(0)).toBe(bytes[0])
    expect(binary.charCodeAt(bytes.length - 1)).toBe(bytes[bytes.length - 1])
  })

  it('encodes an empty blob', async () => {
    await expect(blobToDataUrl(new Blob([]), 'image/jpeg')).resolves.toBe(
      'data:image/jpeg;base64,',
    )
  })
})
