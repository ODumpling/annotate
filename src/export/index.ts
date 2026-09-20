import { parseProject, type Project } from '../model'
import { normalizeMarkerColor } from './color'
import { blobToDataUrl } from './dataUrl'
import { ExportError, ExportMissingImageError } from './errors'
import { renderDescriptionHtml } from './markdown'
import { evaluateExportPreflight, evaluateExportSize } from './size'
import { utf8ByteLength } from './serialize'
import {
  renderExportHtml,
  type ExportedHotspotData,
  type ExportedPageData,
  type ExportedViewerData,
} from './template'

export { DEFAULT_MARKER_COLOR, normalizeMarkerColor } from './color'
export { blobToDataUrl } from './dataUrl'
export { ExportError, ExportMissingImageError } from './errors'
export { exportFileName } from './filename'
export { renderDescriptionHtml } from './markdown'
export {
  evaluateExportSize,
  ExportSizeError,
  EXPORT_BLOCK_BYTES,
  EXPORT_WARN_BYTES,
} from './size'
export { serializeScriptSafeJson, utf8ByteLength } from './serialize'

export type BlobResolver = (
  blobKey: string,
) => Blob | undefined | Promise<Blob | undefined>

export interface ExportResult {
  html: string
  byteLength: number
  sizeWarning: boolean
}

export async function exportProject(
  project: Project,
  resolveBlob: BlobResolver,
): Promise<ExportResult> {
  const validated = parseProject(project)
  const { source } = validated
  if (!source) {
    throw new ExportMissingImageError('project has no source to export yet')
  }
  if (source.kind !== 'image') {
    throw new ExportError(
      'only image sources can be exported in this milestone',
    )
  }
  const pages = [...validated.pages].sort(
    (left, right) => left.index - right.index,
  )
  if (pages.length === 0) {
    throw new ExportMissingImageError('project has no pages to export yet')
  }
  const pageIndexByPageId = new Map(pages.map((page) => [page.id, page.index]))
  const hotspots = [...validated.hotspots].sort((left, right) => {
    const pageDelta =
      (pageIndexByPageId.get(left.pageId) ?? -1) -
      (pageIndexByPageId.get(right.pageId) ?? -1)
    return pageDelta !== 0 ? pageDelta : left.order - right.order
  })

  const blobByKey = new Map<string, Blob>()
  for (const page of pages) {
    const blobKey = page.renderBlobKey ?? source.blobKey
    if (blobByKey.has(blobKey)) {
      continue
    }
    const blob = await resolveBlob(blobKey)
    if (!blob) {
      throw new ExportMissingImageError(`no stored blob for key ${blobKey}`)
    }
    blobByKey.set(blobKey, blob)
  }

  evaluateExportPreflight(
    pages.map((page) => ({
      blobBytes: blobByKey.get(page.renderBlobKey ?? source.blobKey)!.size,
      mimeType: source.mimeType,
    })),
  )

  const dataUrlByBlobKey = new Map<string, string>()
  const resolveImageDataUrl = async (blobKey: string) => {
    const cached = dataUrlByBlobKey.get(blobKey)
    if (cached !== undefined) {
      return cached
    }
    const blob = blobByKey.get(blobKey)!
    const dataUrl = await blobToDataUrl(blob, source.mimeType)
    dataUrlByBlobKey.set(blobKey, dataUrl)
    return dataUrl
  }

  const exportedPages: ExportedPageData[] = []
  for (const page of pages) {
    exportedPages.push({
      id: page.id,
      width: page.width,
      height: page.height,
      imageDataUrl: await resolveImageDataUrl(
        page.renderBlobKey ?? source.blobKey,
      ),
    })
  }

  const exportedHotspots: ExportedHotspotData[] = hotspots.map((hotspot) => ({
    id: hotspot.id,
    pageId: hotspot.pageId,
    shape: hotspot.shape,
    x: hotspot.x,
    y: hotspot.y,
    ...(hotspot.shape === 'rect' ? { w: hotspot.w, h: hotspot.h } : {}),
    title: hotspot.title,
    descriptionHtml: renderDescriptionHtml(hotspot.description),
    tags: hotspot.tags,
    color: normalizeMarkerColor(hotspot.color),
  }))

  const data: ExportedViewerData = {
    schemaVersion: 1,
    name: validated.name,
    showBadgeNumbers: validated.settings.showBadgeNumbers,
    pages: exportedPages,
    hotspots: exportedHotspots,
  }

  const html = renderExportHtml(data)
  const byteLength = utf8ByteLength(html)
  const { sizeWarning } = evaluateExportSize(byteLength)
  return { html, byteLength, sizeWarning }
}
