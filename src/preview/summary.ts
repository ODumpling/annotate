import { renderDescriptionHtml, type SanitizedHtml } from '../export/markdown'

export const TITLE_SUMMARY_GRAPHEMES = 80
export const DESCRIPTION_SUMMARY_GRAPHEMES = 160

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function truncateGraphemes(value: string, maximum: number): string {
  const graphemes = [...segmenter.segment(value)].map(
    (segment) => segment.segment,
  )
  if (graphemes.length <= maximum) {
    return value
  }
  if (maximum <= 0) {
    return ''
  }
  return `${graphemes.slice(0, maximum - 1).join('')}…`
}

export function compactDescriptionFromHtml(
  sanitizedHtml: SanitizedHtml,
): string {
  const document = new DOMParser().parseFromString(sanitizedHtml, 'text/html')
  const plainText = (document.body.textContent ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
  return truncateGraphemes(plainText, DESCRIPTION_SUMMARY_GRAPHEMES)
}

export function compactDescription(markdown: string): string {
  return compactDescriptionFromHtml(renderDescriptionHtml(markdown))
}
