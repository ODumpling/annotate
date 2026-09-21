import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsWcagAA } from '../a11y'
import { renderExportHtml, type ExportedViewerData } from './template'

function baseData(
  overrides: Partial<ExportedViewerData> = {},
): ExportedViewerData {
  return {
    schemaVersion: 1,
    name: 'Theme fixture',
    showBadgeNumbers: true,
    pages: [],
    hotspots: [],
    ...overrides,
  }
}

describe('export theme', () => {
  it('defaults to the dark theme when exportTheme is omitted', () => {
    const html = renderExportHtml(baseData())
    expect(html).toContain('background: #0f172a; color: #e2e8f0;')
  })

  it('renders the dark theme explicitly', () => {
    const html = renderExportHtml(baseData({ exportTheme: 'dark' }))
    expect(html).toContain('background: #0f172a; color: #e2e8f0;')
  })

  it('renders a light theme with swapped surface colors', () => {
    const html = renderExportHtml(baseData({ exportTheme: 'light' }))
    expect(html).toContain('background: #f8fafc; color: #0f172a;')
    expect(html).not.toContain('background: #0f172a; color: #e2e8f0;')
  })

  it('keeps the light theme body text and link colors at WCAG AA contrast', () => {
    const textRatio = contrastRatio('#0f172a', '#f8fafc')
    const linkOnCardRatio = contrastRatio('#1d4ed8', '#ffffff')
    const blockquoteOnCardRatio = contrastRatio('#475569', '#ffffff')
    expect(meetsWcagAA(textRatio, 'text')).toBe(true)
    expect(meetsWcagAA(linkOnCardRatio, 'text')).toBe(true)
    expect(meetsWcagAA(blockquoteOnCardRatio, 'text')).toBe(true)
  })

  it('keeps the light theme focus outline at WCAG AA UI-component contrast', () => {
    const focusOnBackground = contrastRatio('#b45309', '#f8fafc')
    const focusOnCard = contrastRatio('#b45309', '#ffffff')
    expect(meetsWcagAA(focusOnBackground, 'large-text-or-ui')).toBe(true)
    expect(meetsWcagAA(focusOnCard, 'large-text-or-ui')).toBe(true)
  })
})

describe('export template corrupted data', () => {
  function extractViewerScript(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return Array.from(doc.querySelectorAll('script'))
      .filter((script) => script.type !== 'application/json')
      .map((script) => script.textContent)
      .join('\n')
  }

  it('shows a fallback message instead of a blank page when the embedded data is invalid', () => {
    const viewerScript = extractViewerScript(renderExportHtml(baseData()))
    document.body.innerHTML =
      '<script type="application/json" id="annotate-data">not valid json</script>'

    new Function(viewerScript)()

    expect(document.body.textContent).toContain(
      'Annotation data is missing or corrupted.',
    )
  })

  it('shows the same fallback message when the data element is missing entirely', () => {
    const viewerScript = extractViewerScript(renderExportHtml(baseData()))
    document.body.innerHTML = ''

    new Function(viewerScript)()

    expect(document.body.textContent).toContain(
      'Annotation data is missing or corrupted.',
    )
  })
})

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
