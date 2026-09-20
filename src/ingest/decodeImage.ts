export interface DecodedImage {
  width: number
  height: number
  close(): void
}

export interface ImageDecoder {
  decode(blob: Blob): Promise<DecodedImage>
}

/**
 * Prefers `createImageBitmap` with `imageOrientation: "from-image"`, which
 * applies EXIF orientation during decode so the reported dimensions and any
 * later canvas draw already reflect the upright image. Falls back to an
 * `HTMLImageElement`, which browsers also auto-orient, for environments
 * without `createImageBitmap`.
 */
export const browserImageDecoder: ImageDecoder = {
  async decode(blob) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      })
      return {
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('image failed to load'))
        image.src = objectUrl
      })
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {},
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  },
}
