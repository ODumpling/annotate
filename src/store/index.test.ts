import { describe, expect, it } from 'vitest'
import type { ProjectSource } from '../model'
import {
  createProjectStore,
  DomainInvariantError,
  type ProjectStore,
} from './index'

const imageSource: ProjectSource = {
  kind: 'image',
  fileName: 'image.png',
  mimeType: 'image/png',
  blobKey: 'blob-image',
}

const pdfSource: ProjectSource = {
  kind: 'pdf',
  fileName: 'document.pdf',
  mimeType: 'application/pdf',
  blobKey: 'blob-pdf',
}

function clock() {
  let second = 0
  return () => `2026-09-20T12:00:${String(second++).padStart(2, '0')}.000Z`
}

function storeWithPage() {
  const store = createProjectStore({ now: clock() })
  store.getState().actions.createProject({ id: 'project-1', name: 'Example' })
  store.getState().actions.addPage({ id: 'page-1', width: 1200, height: 800 })
  return store
}

function addPoint(store: ProjectStore, id: string) {
  store.getState().actions.createHotspot({
    id,
    pageId: 'page-1',
    shape: 'point',
    x: 0.5,
    y: 0.5,
    title: id,
    description: '',
    tags: [],
  })
}

describe('project store', () => {
  it('creates and resets a project through explicit actions', () => {
    const store = storeWithPage()
    store.getState().actions.attachSource(imageSource)
    addPoint(store, 'point-1')

    store.getState().actions.resetProject()

    expect(store.getState().project).toMatchObject({
      id: 'project-1',
      name: 'Example',
      source: null,
      pages: [],
      hotspots: [],
      settings: { showBadgeNumbers: true, exportedListView: false },
    })
  })

  it('does not expose Zustand raw state mutation', () => {
    const store = createProjectStore({ now: clock() })

    expect(store).not.toHaveProperty('setState')
    expect(store).not.toHaveProperty('destroy')
  })

  it('attaches once and replaces a source by clearing dependent state', () => {
    const store = storeWithPage()
    store.getState().actions.attachSource(imageSource)
    expect(() => store.getState().actions.attachSource(pdfSource)).toThrow(
      /use replaceSource/,
    )
    addPoint(store, 'point-1')
    store.getState().actions.selectHotspot('point-1')

    store.getState().actions.replaceSource(pdfSource)

    expect(store.getState()).toMatchObject({
      project: { source: pdfSource, pages: [], hotspots: [] },
      selectedHotspotId: null,
    })
  })

  it('adds pages contiguously and removes them with cascading cleanup', () => {
    const store = storeWithPage()
    store.getState().actions.addPage({ id: 'page-2', width: 600, height: 400 })
    addPoint(store, 'point-1')
    store.getState().actions.selectHotspot('point-1')

    store.getState().actions.removePage('page-1')

    expect(store.getState().project.pages).toEqual([
      { id: 'page-2', index: 0, width: 600, height: 400 },
    ])
    expect(store.getState().project.hotspots).toEqual([])
    expect(store.getState().selectedHotspotId).toBeNull()
  })

  it('creates ordered hotspots only for existing pages and rejects duplicates', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')
    addPoint(store, 'point-2')

    expect(store.getState().project.hotspots.map(({ order }) => order)).toEqual(
      [0, 1],
    )
    expect(() => addPoint(store, 'point-2')).toThrow(/duplicate id/)
    expect(() =>
      store.getState().actions.createHotspot({
        id: 'missing',
        pageId: 'missing-page',
        shape: 'point',
        x: 0,
        y: 0,
        title: '',
        description: '',
        tags: [],
      }),
    ).toThrow(/page does not exist/)
  })

  it('clamps point movement and rejects non-finite geometry', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')

    store.getState().actions.moveHotspot('point-1', -1, 2)
    expect(store.getState().project.hotspots[0]).toMatchObject({ x: 0, y: 1 })
    expect(() =>
      store.getState().actions.moveHotspot('point-1', Number.NaN, 0),
    ).toThrow(/x must be finite/)
  })

  it('clamps rectangles inside the page and enforces positive dimensions', () => {
    const store = storeWithPage()
    store.getState().actions.createHotspot({
      id: 'rect-1',
      pageId: 'page-1',
      shape: 'rect',
      x: 0.9,
      y: -1,
      w: 0.4,
      h: 2,
      title: 'Rectangle',
      description: '',
      tags: [],
    })

    expect(store.getState().project.hotspots[0]).toMatchObject({
      x: 0.6,
      y: 0,
      w: 0.4,
      h: 1,
    })
    store
      .getState()
      .actions.resizeHotspot('rect-1', { x: 0.9, y: 0.9, w: 0.2, h: 0.3 })
    expect(store.getState().project.hotspots[0]).toMatchObject({
      x: 0.8,
      y: 0.7,
      w: 0.2,
      h: 0.3,
    })
    expect(() =>
      store
        .getState()
        .actions.resizeHotspot('rect-1', { x: 0, y: 0, w: 0, h: 0.1 }),
    ).toThrow(/must be positive/)
  })

  it('does not resize points', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')

    expect(() =>
      store
        .getState()
        .actions.resizeHotspot('point-1', { x: 0, y: 0, w: 0.1, h: 0.1 }),
    ).toThrow(/only rectangles/)
  })

  it('updates content, selects, deletes, and closes order gaps', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')
    addPoint(store, 'point-2')
    store.getState().actions.updateHotspotContent('point-2', {
      title: 'Updated',
      description: 'Body',
      color: '#abcdef',
      tags: ['updated'],
    })
    store.getState().actions.selectHotspot('point-1')

    store.getState().actions.deleteHotspot('point-1')

    expect(store.getState().selectedHotspotId).toBeNull()
    expect(store.getState().project.hotspots).toEqual([
      expect.objectContaining({
        id: 'point-2',
        order: 0,
        title: 'Updated',
        description: 'Body',
        color: '#abcdef',
        tags: ['updated'],
      }),
    ])
  })

  it('reorders a complete page set and rejects incomplete permutations', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')
    addPoint(store, 'point-2')

    store.getState().actions.reorderWithinPage('page-1', ['point-2', 'point-1'])
    expect(
      store.getState().project.hotspots.map(({ id, order }) => ({ id, order })),
    ).toEqual([
      { id: 'point-1', order: 1 },
      { id: 'point-2', order: 0 },
    ])
    expect(() =>
      store.getState().actions.reorderWithinPage('page-1', ['point-1']),
    ).toThrow(/every hotspot/)
  })

  it('preserves explicit relative order when deletion closes a gap', () => {
    const store = storeWithPage()
    addPoint(store, 'point-1')
    addPoint(store, 'point-2')
    addPoint(store, 'point-3')
    store
      .getState()
      .actions.reorderWithinPage('page-1', ['point-2', 'point-3', 'point-1'])

    store.getState().actions.deleteHotspot('point-3')

    expect(
      store.getState().project.hotspots.map(({ id, order }) => ({ id, order })),
    ).toEqual([
      { id: 'point-1', order: 1 },
      { id: 'point-2', order: 0 },
    ])
  })

  it('updates supported settings and keeps list view reserved', () => {
    const store = storeWithPage()
    store.getState().actions.updateProjectSettings({ showBadgeNumbers: false })

    expect(store.getState().project.settings.showBadgeNumbers).toBe(false)
    expect(() =>
      store
        .getState()
        .actions.updateProjectSettings({ exportedListView: true }),
    ).toThrow(/must remain false/)
  })

  it('updates updatedAt for domain mutations but not selection', () => {
    const store = storeWithPage()
    const before = store.getState().project.updatedAt
    addPoint(store, 'point-1')
    const afterMutation = store.getState().project.updatedAt
    store.getState().actions.selectHotspot('point-1')

    expect(afterMutation).not.toBe(before)
    expect(store.getState().project.updatedAt).toBe(afterMutation)
  })

  it('reports missing pages and hotspots as domain errors', () => {
    const store = storeWithPage()

    expect(() => store.getState().actions.removePage('missing')).toThrowError(
      DomainInvariantError,
    )
    expect(() =>
      store.getState().actions.selectHotspot('missing'),
    ).toThrowError(DomainInvariantError)
  })
})
