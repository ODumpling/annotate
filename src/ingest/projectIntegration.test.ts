import { describe, expect, it } from 'vitest'
import { createProjectStore } from '../store'
import type { IngestedImage } from './ingestImage'
import { ingestImageIntoProject } from './projectIntegration'

function ingested(overrides: Partial<IngestedImage> = {}): IngestedImage {
  return {
    mimeType: 'image/png',
    fileName: 'photo.png',
    blobKey: 'blob-1',
    width: 800,
    height: 600,
    warnings: [],
    ...overrides,
  }
}

describe('ingestImageIntoProject', () => {
  it('attaches the first image and creates exactly one page with natural dimensions', () => {
    const store = createProjectStore()

    const page = ingestImageIntoProject(
      store.getState().actions,
      false,
      ingested(),
    )

    const { project } = store.getState()
    expect(project.source).toEqual({
      kind: 'image',
      fileName: 'photo.png',
      mimeType: 'image/png',
      blobKey: 'blob-1',
    })
    expect(project.pages).toEqual([
      { id: page.id, index: 0, width: 800, height: 600 },
    ])
  })

  it('replaces an existing source, clearing prior pages and hotspots', () => {
    const store = createProjectStore()
    ingestImageIntoProject(store.getState().actions, false, ingested())
    store.getState().actions.createHotspot({
      id: 'point-1',
      pageId: store.getState().project.pages[0].id,
      shape: 'point',
      x: 0.5,
      y: 0.5,
      title: '',
      description: '',
      tags: [],
    })

    const page = ingestImageIntoProject(
      store.getState().actions,
      true,
      ingested({ blobKey: 'blob-2', width: 1024, height: 768 }),
    )

    const { project } = store.getState()
    expect(project.source).toMatchObject({ blobKey: 'blob-2' })
    expect(project.pages).toEqual([
      { id: page.id, index: 0, width: 1024, height: 768 },
    ])
    expect(project.hotspots).toEqual([])
  })
})
