import { describe, expect, it } from 'vitest'
import {
  compactDescription,
  DESCRIPTION_SUMMARY_GRAPHEMES,
  TITLE_SUMMARY_GRAPHEMES,
  truncateGraphemes,
} from './summary'

function graphemeCount(value: string): number {
  return [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      value,
    ),
  ].length
}

describe('compact preview summaries', () => {
  it('strips Markdown through the sanitizer and collapses whitespace', () => {
    expect(
      compactDescription(
        'First **strong** line\n\n- second `coded` line\n- [third](https://example.com)',
      ),
    ).toBe('First strong line second coded line third')
  })

  it('keeps summaries within the documented grapheme caps', () => {
    const family = '👨‍👩‍👧‍👦'
    const title = truncateGraphemes(
      family.repeat(TITLE_SUMMARY_GRAPHEMES + 4),
      TITLE_SUMMARY_GRAPHEMES,
    )
    const description = compactDescription(
      family.repeat(DESCRIPTION_SUMMARY_GRAPHEMES + 4),
    )

    expect(graphemeCount(title)).toBe(TITLE_SUMMARY_GRAPHEMES)
    expect(graphemeCount(description)).toBe(DESCRIPTION_SUMMARY_GRAPHEMES)
    expect(title.endsWith('…')).toBe(true)
    expect(description.endsWith('…')).toBe(true)
  })

  it('does not add an ellipsis at or below the limit', () => {
    const exact = 'x'.repeat(TITLE_SUMMARY_GRAPHEMES)
    expect(truncateGraphemes(exact, TITLE_SUMMARY_GRAPHEMES)).toBe(exact)
  })
})
