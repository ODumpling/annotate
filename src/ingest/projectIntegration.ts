import type { ProjectActions } from '../store'
import type { IngestedImage } from './ingestImage'

export interface AttachedImagePage {
  id: string
  width: number
  height: number
}

/**
 * Attaches an ingested image as the project's source and creates its single
 * page. `hasExistingSource` selects attach vs. replace so callers don't need
 * to know the store's attach/replace split; replacing already clears prior
 * pages and hotspots, so exactly one page results either way.
 */
export function ingestImageIntoProject(
  actions: Pick<ProjectActions, 'attachSource' | 'replaceSource' | 'addPage'>,
  hasExistingSource: boolean,
  ingested: IngestedImage,
): AttachedImagePage {
  const source = {
    kind: 'image' as const,
    fileName: ingested.fileName,
    mimeType: ingested.mimeType,
    blobKey: ingested.blobKey,
  }

  if (hasExistingSource) {
    actions.replaceSource(source)
  } else {
    actions.attachSource(source)
  }

  const pageId = crypto.randomUUID()
  actions.addPage({
    id: pageId,
    width: ingested.width,
    height: ingested.height,
  })

  return { id: pageId, width: ingested.width, height: ingested.height }
}
