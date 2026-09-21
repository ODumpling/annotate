import { describe, expect, it } from 'vitest'
import {
  parseProject,
  parseProjectJson,
  ProjectValidationError,
  serializeProject,
} from './validation'
import type { Project } from './types'

const timestamp = '2026-09-20T12:00:00.000Z'

function validProject(): Project {
  return {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Example',
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      kind: 'image',
      fileName: 'example.png',
      mimeType: 'image/png',
      blobKey: 'blob-1',
    },
    pages: [
      { id: 'page-1', index: 0, width: 1200, height: 800 },
      { id: 'page-2', index: 1, width: 600, height: 400 },
    ],
    hotspots: [
      {
        id: 'point-1',
        pageId: 'page-1',
        shape: 'point',
        x: 0.5,
        y: 0.5,
        title: 'Point',
        description: 'Description',
        tags: ['example'],
        order: 0,
      },
      {
        id: 'rect-1',
        pageId: 'page-1',
        shape: 'rect',
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4,
        title: 'Rectangle',
        description: '',
        tags: [],
        order: 1,
      },
    ],
    settings: { showBadgeNumbers: true, exportedListView: false },
  }
}

function rectangle(project: Project) {
  const hotspot = project.hotspots[1]
  if (hotspot?.shape !== 'rect') {
    throw new Error('test fixture rectangle is missing')
  }
  return hotspot
}

describe('project runtime validation', () => {
  it('round-trips a schema version 1 project through JSON', () => {
    const project = validProject()
    const serialized = serializeProject(project)

    expect(parseProjectJson(serialized)).toEqual(project)
  })

  it('rejects malformed JSON with an actionable error', () => {
    expect(() => parseProjectJson('{')).toThrowError(ProjectValidationError)
    expect(() => parseProjectJson('{')).toThrow(/invalid JSON/)
  })

  it.each([
    ['not finite', Number.NaN],
    ['below zero', -0.01],
    ['above one', 1.01],
  ])('rejects point geometry that is %s', (_, x) => {
    const project = validProject()
    project.hotspots[0] = { ...project.hotspots[0], x }

    expect(() => parseProject(project)).toThrow(/hotspots\.0\.x/)
  })

  it('rejects point width and height fields', () => {
    const project = validProject()
    const input = {
      ...project,
      hotspots: [{ ...project.hotspots[0], w: 0.1, h: 0.1 }],
    }

    expect(() => parseProject(input)).toThrow(/Unrecognized keys/)
  })

  it('requires positive rectangle dimensions within page bounds', () => {
    const project = validProject()
    project.hotspots[1] = {
      ...rectangle(project),
      w: 0,
    }
    expect(() => parseProject(project)).toThrow(/greater than 0/)

    const overflowing = validProject()
    overflowing.hotspots[1] = {
      ...rectangle(overflowing),
      x: 0.8,
      w: 0.3,
    }
    expect(() => parseProject(overflowing)).toThrow(
      /remain within the page horizontally/,
    )

    const missingHeight = validProject()
    expect(() =>
      parseProject({
        ...missingHeight,
        hotspots: [
          missingHeight.hotspots[0],
          { ...rectangle(missingHeight), h: undefined },
        ],
      }),
    ).toThrow(/hotspots\.1\.h/)
  })

  it('rejects dangling page references', () => {
    const project = validProject()
    project.hotspots[0] = {
      ...project.hotspots[0],
      pageId: 'missing-page',
    }

    expect(() => parseProject(project)).toThrow(/references missing page/)
  })

  it('rejects duplicate or non-contiguous page indices', () => {
    const duplicate = validProject()
    duplicate.pages[1] = { ...duplicate.pages[1], index: 0 }
    expect(() => parseProject(duplicate)).toThrow(
      /page indices must be unique and contiguous/,
    )

    const gap = validProject()
    gap.pages[1] = { ...gap.pages[1], index: 2 }
    expect(() => parseProject(gap)).toThrow(
      /page indices must be unique and contiguous/,
    )
  })

  it('rejects duplicate or non-contiguous hotspot order per page', () => {
    const duplicate = validProject()
    duplicate.hotspots[1] = { ...duplicate.hotspots[1], order: 0 }
    expect(() => parseProject(duplicate)).toThrow(
      /hotspot order for page page-1 must be unique and contiguous/,
    )

    const gap = validProject()
    gap.hotspots[1] = { ...gap.hotspots[1], order: 2 }
    expect(() => parseProject(gap)).toThrow(
      /hotspot order for page page-1 must be unique and contiguous/,
    )

    const independentPages = validProject()
    independentPages.hotspots[1] = {
      ...rectangle(independentPages),
      pageId: 'page-2',
      order: 0,
    }
    expect(parseProject(independentPages)).toEqual(independentPages)
  })

  it('rejects duplicate page and hotspot ids', () => {
    const duplicatePage = validProject()
    duplicatePage.pages[1] = { ...duplicatePage.pages[1], id: 'page-1' }
    expect(() => parseProject(duplicatePage)).toThrow(/duplicate id: page-1/)

    const duplicateHotspot = validProject()
    duplicateHotspot.hotspots[1] = {
      ...duplicateHotspot.hotspots[1],
      id: 'point-1',
    }
    expect(() => parseProject(duplicateHotspot)).toThrow(
      /duplicate id: point-1/,
    )
  })

  it('rejects an unsupported schema and invalid source discriminant', () => {
    expect(() => parseProject({ ...validProject(), schemaVersion: 2 })).toThrow(
      /schemaVersion/,
    )
    expect(() =>
      parseProject({
        ...validProject(),
        source: {
          kind: 'image',
          fileName: 'wrong.pdf',
          mimeType: 'application/pdf',
          blobKey: 'blob',
        },
      }),
    ).toThrow(/mimeType/)
  })

  it('keeps exported list view disabled in v1.0', () => {
    expect(() =>
      parseProject({
        ...validProject(),
        settings: { showBadgeNumbers: true, exportedListView: true },
      }),
    ).toThrow(/exportedListView is reserved and must be false/)
  })

  it('accepts an omitted export theme, defaulting at the point of use', () => {
    const project = validProject()
    expect(project.settings.exportTheme).toBeUndefined()
    const parsed = parseProject(project)
    expect(parsed.settings.exportTheme).toBeUndefined()
  })

  it('accepts a valid export theme', () => {
    const parsed = parseProject({
      ...validProject(),
      settings: {
        showBadgeNumbers: true,
        exportTheme: 'light',
        exportedListView: false,
      },
    })
    expect(parsed.settings.exportTheme).toBe('light')
  })

  it('rejects an unrecognized export theme', () => {
    expect(() =>
      parseProject({
        ...validProject(),
        settings: {
          showBadgeNumbers: true,
          exportTheme: 'sepia',
          exportedListView: false,
        },
      }),
    ).toThrow(/exportTheme/)
  })
})
