import { describe, expect, it } from 'vitest'
import type { ExportedViewerData } from './template'

describe('export template content boundary', () => {
  it('does not type-check arbitrary strings as sanitized description HTML', () => {
    const unsafeData: ExportedViewerData = {
      schemaVersion: 1,
      name: 'Unsafe construction test',
      showBadgeNumbers: true,
      pages: [],
      hotspots: [
        {
          id: 'hotspot',
          pageId: 'page',
          shape: 'point',
          x: 0.5,
          y: 0.5,
          title: 'Title',
          // This expected compiler error is the regression assertion: only the
          // sanitizer can produce the opaque type accepted by the template.
          // @ts-expect-error raw strings are not SanitizedHtml
          descriptionHtml: '<img src=x onerror=alert(1)>',
          tags: [],
          color: '#2563eb',
        },
      ],
    }

    expect(unsafeData.hotspots[0].descriptionHtml).toContain('onerror')
  })
})
