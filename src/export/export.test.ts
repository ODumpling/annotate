// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Project } from '../model'
import { ProjectValidationError } from '../model'
import {
  EXPORT_BLOCK_BYTES,
  EXPORT_WARN_BYTES,
  ExportError,
  ExportMissingImageError,
  ExportSizeError,
  evaluateExportSize,
  exportFileName,
  exportProject,
} from './index'

const TIMESTAMP = '2026-09-20T12:00:00.000Z'
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmKMAAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
)

function pngBlob(): Blob {
  return new Blob([PNG_BYTES], { type: 'image/png' })
}

function resolverFor(entries: Record<string, Blob | undefined>) {
  return (key: string) => entries[key]
}

function fixtureProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Hostile </name>\u2028 name',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    source: {
      kind: 'image',
      fileName: 'photo <weird>.png',
      mimeType: 'image/png',
      blobKey: 'blob-1',
    },
    pages: [{ id: 'page-1', index: 0, width: 1200, height: 800 }],
    hotspots: [
      {
        id: 'point-1',
        pageId: 'page-1',
        shape: 'point',
        x: 0.5,
        y: 0.5,
        title: 'First </script> hotspot',
        description:
          'Hello **world** [link](https://example.com) <script>alert(1)</script>',
        color: '#12abef',
        tags: ['safety', 'line\u2028sep'],
        order: 0,
      },
      {
        id: 'rect-1',
        pageId: 'page-1',
        shape: 'rect',
        x: 0.1,
        y: 0.1,
        w: 0.3,
        h: 0.2,
        title: 'Second',
        description: '<img src=x onerror=alert(2)> `code`',
        tags: [],
        order: 1,
      },
    ],
    settings: { showBadgeNumbers: true, exportedListView: false },
    ...overrides,
  }
}

function parseExport(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const island = doc.getElementById('annotate-data')
  return { doc, island }
}

describe('standalone HTML export', () => {
  it('produces a deterministic document with measured size', async () => {
    const resolver = resolverFor({ 'blob-1': pngBlob() })
    const first = await exportProject(fixtureProject(), resolver)
    const second = await exportProject(fixtureProject(), resolver)

    expect(first.html).toBe(second.html)
    expect(first.byteLength).toBe(new TextEncoder().encode(first.html).length)
    expect(first.sizeWarning).toBe(false)
    expect(first.html.startsWith('<!doctype html>')).toBe(true)
  })

  it('embeds a script-safe JSON island that round-trips hostile data', async () => {
    const { html } = await exportProject(
      fixtureProject(),
      resolverFor({ 'blob-1': pngBlob() }),
    )
    const { island } = parseExport(html)
    const islandText = island?.textContent ?? ''
    expect(islandText).not.toContain('<')
    expect(islandText).not.toContain('\u2028')
    expect(islandText).not.toContain('\u2029')

    const data = JSON.parse(islandText)
    expect(data.name).toBe('Hostile </name>\u2028 name')
    expect(data.hotspots[0].title).toBe('First </script> hotspot')
    expect(data.hotspots[0].tags).toEqual(['safety', 'line\u2028sep'])
    expect(
      data.pages[0].imageDataUrl.startsWith('data:image/png;base64,'),
    ).toBe(true)
  })

  it('escapes the document title and keeps markup inert', async () => {
    const { html } = await exportProject(
      fixtureProject(),
      resolverFor({ 'blob-1': pngBlob() }),
    )
    const { doc } = parseExport(html)
    expect(doc.title).toBe('Hostile </name>\u2028 name')
    expect(doc.querySelectorAll('script').length).toBe(2)
    expect(doc.querySelector('noscript')?.textContent).toContain('JavaScript')
    expect(doc.querySelector('script[type="application/json"]')).not.toBeNull()
  })

  it('performs no network fetches and enforces them with CSP', async () => {
    const { html } = await exportProject(
      fixtureProject(),
      resolverFor({ 'blob-1': pngBlob() }),
    )
    const { doc } = parseExport(html)
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
    expect(csp).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    )
    expect(
      doc.querySelectorAll('link, base, iframe, img, source'),
    ).toHaveLength(0)
    expect(doc.querySelectorAll('[src], [href]')).toHaveLength(0)
    expect(html).not.toMatch(/src="(?!data:)/)
    expect(html).not.toMatch(
      /fetch\(|XMLHttpRequest|WebSocket|EventSource|\bimport\(/,
    )
  })

  it('neutralizes hostile markdown, keeps sanitized subset output', async () => {
    const { html } = await exportProject(
      fixtureProject(),
      resolverFor({ 'blob-1': pngBlob() }),
    )
    const { island } = parseExport(html)
    const data = JSON.parse(island?.textContent ?? '')

    const pointHtml = data.hotspots[0].descriptionHtml
    expect(pointHtml).toContain('Hello <strong>world</strong>')
    expect(pointHtml).toContain('href="https://example.com"')
    expect(pointHtml).toContain('target="_blank"')
    expect(pointHtml).toContain('rel="noopener noreferrer"')
    expect(pointHtml).not.toContain('<script')
    expect(pointHtml).not.toContain('alert(1)')

    const rectHtml = data.hotspots[1].descriptionHtml
    expect(rectHtml).not.toContain('<img')
    expect(rectHtml).not.toContain('onerror')
    expect(rectHtml).toContain('<code>code</code>')
  })

  it('validates the project before exporting', async () => {
    const resolver = resolverFor({ 'blob-1': pngBlob() })
    const invalidOrder = fixtureProject()
    invalidOrder.hotspots[1] = { ...invalidOrder.hotspots[1], order: 2 }
    await expect(exportProject(invalidOrder, resolver)).rejects.toThrow(
      ProjectValidationError,
    )

    const listView = fixtureProject({
      settings: { showBadgeNumbers: true, exportedListView: true },
    })
    await expect(exportProject(listView, resolver)).rejects.toThrow(
      ProjectValidationError,
    )
  })

  it('requires a resolvable image source', async () => {
    await expect(
      exportProject(fixtureProject({ source: null }), resolverFor({})),
    ).rejects.toThrow(ExportMissingImageError)
    await expect(
      exportProject(
        fixtureProject({ pages: [], hotspots: [] }),
        resolverFor({ 'blob-1': pngBlob() }),
      ),
    ).rejects.toThrow(ExportMissingImageError)
    await expect(
      exportProject(fixtureProject(), resolverFor({})),
    ).rejects.toThrow(ExportMissingImageError)
    const pdfSource = fixtureProject({
      source: {
        kind: 'pdf',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        blobKey: 'blob-pdf',
      },
    })
    await expect(
      exportProject(pdfSource, resolverFor({ 'blob-pdf': pngBlob() })),
    ).rejects.toThrow(ExportError)
  })

  it('prefers a page render blob over the source blob', async () => {
    const project = fixtureProject({
      pages: [
        {
          id: 'page-1',
          index: 0,
          width: 1200,
          height: 800,
          renderBlobKey: 'blob-render',
        },
      ],
    })
    const otherBlob = new Blob([new Uint8Array([9, 9, 9])], {
      type: 'image/png',
    })
    const { html } = await exportProject(
      project,
      resolverFor({ 'blob-1': pngBlob(), 'blob-render': otherBlob }),
    )
    const { island } = parseExport(html)
    const data = JSON.parse(island?.textContent ?? '')
    expect(data.pages[0].imageDataUrl).toBe('data:image/png;base64,CQkJ')
  })

  it('derives a safe filename from the project name', () => {
    const fileName = exportFileName(fixtureProject())
    expect(fileName.endsWith('.html')).toBe(true)
    expect(fileName).toMatch(/^[^/\\:*?"<>|]+\.html$/)
  })
})

describe('export size thresholds', () => {
  it('warns strictly above 25 MiB and blocks strictly above 100 MiB', () => {
    expect(evaluateExportSize(EXPORT_WARN_BYTES).sizeWarning).toBe(false)
    expect(evaluateExportSize(EXPORT_WARN_BYTES + 1).sizeWarning).toBe(true)
    expect(evaluateExportSize(EXPORT_BLOCK_BYTES).sizeWarning).toBe(true)
    expect(() => evaluateExportSize(EXPORT_BLOCK_BYTES + 1)).toThrow(
      ExportSizeError,
    )
    try {
      evaluateExportSize(EXPORT_BLOCK_BYTES + 1)
    } catch (error) {
      expect((error as ExportSizeError).byteLength).toBe(EXPORT_BLOCK_BYTES + 1)
    }
  })

  it('flags a warning for a real oversized export', async () => {
    const bigBlob = new Blob([new Uint8Array(20 * 1048576)])
    const result = await exportProject(
      fixtureProject(),
      resolverFor({ 'blob-1': bigBlob }),
    )
    expect(result.byteLength).toBeGreaterThan(EXPORT_WARN_BYTES)
    expect(result.sizeWarning).toBe(true)
  })

  it('refuses to generate a real oversized export', async () => {
    const hugeBlob = new Blob([new Uint8Array(80 * 1048576)])
    await expect(
      exportProject(fixtureProject(), resolverFor({ 'blob-1': hugeBlob })),
    ).rejects.toThrow(ExportSizeError)
  })
})
